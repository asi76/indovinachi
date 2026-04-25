import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import PocketBase from 'pocketbase';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const PORT = Number(process.env.PORT || 3000);
const APP_URL = process.env.APP_URL || 'https://indovinachi.asigo.cc';
const PB_URL = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'https://pb.indovinachi.asigo.cc';
const PB_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || '';
const PB_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';
const CENTRAL_AUTH_PB_URL = process.env.CENTRAL_AUTH_PB_URL || 'https://pb.theparty.asigo.cc';
const CENTRAL_AUTH_PB_ADMIN_EMAIL = process.env.CENTRAL_AUTH_PB_ADMIN_EMAIL || PB_ADMIN_EMAIL;
const CENTRAL_AUTH_PB_ADMIN_PASSWORD = process.env.CENTRAL_AUTH_PB_ADMIN_PASSWORD || PB_ADMIN_PASSWORD;
const APP_ACCESS_SLUG = process.env.APP_ACCESS_SLUG || 'indovinachi';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'asi.vong@gmail.com').toLowerCase();

const SESSION_COLLECTION = 'icebreaker_sessions';
const PLAYER_COLLECTION = 'icebreaker_players';
const RESPONSE_COLLECTION = 'icebreaker_responses';

const app = express();
app.use(express.json());

function ensureFirebaseAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (serviceAccountBase64) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'))),
    });
    return;
  }

  if (serviceAccountJson) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
    return;
  }

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))),
    });
    return;
  }

  throw new Error('Missing Firebase Admin credentials');
}

ensureFirebaseAdmin();

const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
const centralAuthPb = new PocketBase(CENTRAL_AUTH_PB_URL);
centralAuthPb.autoCancellation(false);

function normalizeApps(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length > 0) : [];
}

function escapeFilter(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function generateCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function generateToken() {
  return crypto.randomBytes(18).toString('hex');
}

function shuffle(list) {
  const cloned = [...list];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function normalizeQuestions(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 24)
    : [];
}

async function authenticatePocketBase() {
  if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    throw new Error('Missing PocketBase admin credentials');
  }
  if (!pb.authStore.isValid) {
    await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  }
  return pb;
}

async function authenticateCentralAuthPocketBase() {
  if (!CENTRAL_AUTH_PB_ADMIN_EMAIL || !CENTRAL_AUTH_PB_ADMIN_PASSWORD) {
    throw new Error('Missing central auth PocketBase admin credentials');
  }
  if (!centralAuthPb.authStore.isValid) {
    await centralAuthPb.collection('_superusers').authWithPassword(CENTRAL_AUTH_PB_ADMIN_EMAIL, CENTRAL_AUTH_PB_ADMIN_PASSWORD);
  }
  return centralAuthPb;
}

async function getProfileRole(email) {
  if (email.toLowerCase() === ADMIN_EMAIL) {
    return 'admin';
  }

  const pocketBase = await authenticateCentralAuthPocketBase();
  const profiles = await pocketBase.collection('user_profiles').getFullList({
    filter: `email="${escapeFilter(email.toLowerCase())}"`,
  });

  const profile = profiles[0];
  if (!profile) return null;
  const apps = normalizeApps(profile.apps);
  if (!apps.includes(APP_ACCESS_SLUG)) return null;
  if (profile.role === 'admin') return 'admin';
  return profile.role === 'enabled' ? 'enabled' : null;
}

async function requireAuthorizedHost(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'Token Firebase mancante' });
    }

    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase();
    if (!email) {
      return res.status(401).json({ error: 'Email Google non disponibile' });
    }

    const role = await getProfileRole(email);
    if (!role) {
      return res.status(403).json({ error: 'Utente non autorizzato per Indovina Chi' });
    }

    req.user = {
      email,
      name: decoded.name || email.split('@')[0],
      picture: decoded.picture || null,
      role,
    };
    next();
  } catch (error) {
    console.error('[auth]', error);
    res.status(401).json({ error: 'Autenticazione Firebase non valida' });
  }
}

async function getSessionByCode(pocketBase, code) {
  const result = await pocketBase.collection(SESSION_COLLECTION).getList(1, 1, {
    filter: `code="${escapeFilter(code)}"`,
  });
  return result.items[0] || null;
}

async function getPlayersByCode(pocketBase, code) {
  return pocketBase.collection(PLAYER_COLLECTION).getFullList({
    filter: `sessionCode="${escapeFilter(code)}"`,
    sort: 'joinedAt',
  });
}

async function getResponsesByCode(pocketBase, code) {
  return pocketBase.collection(RESPONSE_COLLECTION).getFullList({
    filter: `sessionCode="${escapeFilter(code)}"`,
    sort: 'questionIndex',
  });
}

async function buildSessionView(pocketBase, record) {
  const players = await getPlayersByCode(pocketBase, record.code);
  const answeredCount = players.filter((entry) => Boolean(entry.submitted)).length;
  const allAnswered = players.length > 0 && answeredCount === players.length;
  const nextStatus = record.status === 'collecting' && allAnswered ? 'ready' : record.status;

  if (nextStatus !== record.status) {
    const updated = await pocketBase.collection(SESSION_COLLECTION).update(record.id, { status: nextStatus });
    record = updated;
  }

  return {
    id: record.id,
    code: record.code,
    hostEmail: record.hostEmail || '',
    hostName: record.hostName || '',
    title: record.title || 'Indovina Chi',
    theme: record.theme || '',
    status: record.status || 'draft',
    questions: Array.isArray(record.questions) ? record.questions : [],
    presenterToken: record.presenterToken || '',
    remoteToken: record.remoteToken || '',
    revealQueue: Array.isArray(record.revealQueue) ? record.revealQueue : [],
    currentQuestionIndex: typeof record.currentQuestionIndex === 'number' ? record.currentQuestionIndex : -1,
    currentAnswerIndex: typeof record.currentAnswerIndex === 'number' ? record.currentAnswerIndex : -1,
    currentQuestionText: record.currentQuestionText || '',
    currentAnswerText: record.currentAnswerText || '',
    revealPhase: record.revealPhase || 'idle',
    discoSpin: typeof record.discoSpin === 'number' ? record.discoSpin : 0,
    created: record.created || '',
    updated: record.updated || '',
    playerCount: players.length,
    answeredCount,
    allAnswered,
    players: players.map((entry) => ({
      id: entry.id,
      sessionCode: entry.sessionCode,
      nickname: entry.nickname,
      avatar: entry.avatar,
      submitted: Boolean(entry.submitted),
      joinedAt: entry.joinedAt,
      submittedAt: entry.submittedAt || null,
      created: entry.created,
      updated: entry.updated,
    })),
  };
}

async function requireOwnedSession(req, res, next) {
  try {
    const pocketBase = await authenticatePocketBase();
    const session = await getSessionByCode(pocketBase, req.params.code?.toUpperCase());
    if (!session) {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }
    if (session.hostEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Sessione non gestibile da questo host' });
    }
    req.pocketBase = pocketBase;
    req.sessionRecord = session;
    next();
  } catch (error) {
    console.error('[requireOwnedSession]', error);
    res.status(500).json({ error: 'Impossibile verificare la sessione' });
  }
}

async function requireRemoteSession(req, res, next) {
  try {
    const pocketBase = await authenticatePocketBase();
    const session = await getSessionByCode(pocketBase, req.params.code?.toUpperCase());
    if (!session) {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }
    const token = String(req.query.token || req.body?.token || '');
    if (!token || token !== session.remoteToken) {
      return res.status(403).json({ error: 'Token telecomando non valido' });
    }
    req.pocketBase = pocketBase;
    req.sessionRecord = session;
    next();
  } catch (error) {
    console.error('[requireRemoteSession]', error);
    res.status(500).json({ error: 'Impossibile verificare il telecomando' });
  }
}

async function startRevealForSession(pocketBase, sessionRecord) {
  const players = await getPlayersByCode(pocketBase, sessionRecord.code);
  if (players.length === 0) {
    throw new Error('Nessun partecipante presente');
  }
  if (players.some((entry) => !entry.submitted)) {
    throw new Error('Non tutti hanno ancora inviato le risposte');
  }

  const responses = await getResponsesByCode(pocketBase, sessionRecord.code);
  const grouped = new Map();
  for (const response of responses) {
    const key = Number.isFinite(response.questionIndex) ? response.questionIndex : 0;
    if (!grouped.has(key)) {
      grouped.set(key, {
        prompt: response.questionText,
        answers: [],
      });
    }
    grouped.get(key).answers.push({
      playerId: response.playerId,
      nickname: response.playerNickname,
      avatar: response.playerAvatar,
      text: response.answerText,
    });
  }

  const queue = shuffle(Array.from(grouped.values()))
    .map((entry) => ({
      prompt: entry.prompt,
      answers: shuffle(entry.answers),
    }))
    .filter((entry) => entry.prompt && entry.answers.length > 0);

  if (queue.length === 0) {
    throw new Error('Nessuna risposta disponibile per il reveal');
  }

  return pocketBase.collection(SESSION_COLLECTION).update(sessionRecord.id, {
    status: 'revealing',
    revealQueue: queue,
    currentQuestionIndex: 0,
    currentAnswerIndex: -1,
    currentQuestionText: queue[0].prompt,
    currentAnswerText: '',
    revealPhase: 'question',
    discoSpin: Date.now(),
  });
}

function currentRevealItem(sessionRecord) {
  const queue = Array.isArray(sessionRecord.revealQueue) ? sessionRecord.revealQueue : [];
  const questionIndex = typeof sessionRecord.currentQuestionIndex === 'number' ? sessionRecord.currentQuestionIndex : -1;
  return queue[questionIndex] || null;
}

app.post('/api/auth/session', requireAuthorizedHost, async (req, res) => {
  res.json({
    user: req.user,
    role: req.user.role,
  });
});

app.get('/api/host/sessions', requireAuthorizedHost, async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const sessions = await pocketBase.collection(SESSION_COLLECTION).getFullList({
      filter: `hostEmail="${escapeFilter(req.user.email)}"`,
    });
    const hydratedResults = await Promise.allSettled(
      sessions.map(async (session) => buildSessionView(pocketBase, session)),
    );
    const hydrated = hydratedResults
      .flatMap((result, index) => {
        if (result.status === 'fulfilled') return [result.value];
        console.error('[hostSessions] failed to hydrate session', sessions[index]?.id, result.reason);
        return [];
      })
      .sort((left, right) => {
        const leftUpdated = Date.parse(left.updated || left.created || '') || 0;
        const rightUpdated = Date.parse(right.updated || right.created || '') || 0;
        return rightUpdated - leftUpdated;
      });
    res.json({ sessions: hydrated });
  } catch (error) {
    console.error('[hostSessions]', error);
    res.status(500).json({ error: 'Impossibile caricare le sessioni' });
  }
});

app.post('/api/sessions', requireAuthorizedHost, async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    let code = generateCode();
    while (await getSessionByCode(pocketBase, code)) {
      code = generateCode();
    }
    const created = await pocketBase.collection(SESSION_COLLECTION).create({
      code,
      hostEmail: req.user.email,
      hostName: req.user.name,
      title: 'Indovina Chi',
      theme: 'Studio party 70s, dinamico, luminoso, pieno di ritmo',
      status: 'draft',
      questions: [],
      presenterToken: generateToken(),
      remoteToken: generateToken(),
      revealQueue: [],
      currentQuestionIndex: -1,
      currentAnswerIndex: -1,
      currentQuestionText: '',
      currentAnswerText: '',
      revealPhase: 'idle',
      discoSpin: 0,
    });
    const session = await buildSessionView(pocketBase, created);
    res.status(201).json({ session });
  } catch (error) {
    console.error('[createSession]', error);
    res.status(500).json({ error: 'Impossibile creare la sessione' });
  }
});

app.patch('/api/sessions/:code/config', requireAuthorizedHost, requireOwnedSession, async (req, res) => {
  try {
    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      title: String(req.body?.title || 'Indovina Chi').trim().slice(0, 120),
      theme: String(req.body?.theme || '').trim().slice(0, 280),
      questions: normalizeQuestions(req.body?.questions),
      status: 'lobby',
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[saveConfig]', error);
    res.status(500).json({ error: 'Impossibile salvare la configurazione' });
  }
});

app.post('/api/sessions/:code/start-collecting', requireAuthorizedHost, requireOwnedSession, async (req, res) => {
  try {
    const questions = normalizeQuestions(req.sessionRecord.questions);
    if (questions.length === 0) {
      return res.status(400).json({ error: 'Inserisci almeno una domanda prima di aprire la raccolta' });
    }
    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      status: 'collecting',
      questions,
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[startCollecting]', error);
    res.status(500).json({ error: 'Impossibile aprire la raccolta risposte' });
  }
});

app.post('/api/sessions/:code/start-reveal', requireAuthorizedHost, requireOwnedSession, async (req, res) => {
  try {
    const updated = await startRevealForSession(req.pocketBase, req.sessionRecord);
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[startReveal]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Impossibile avviare il reveal' });
  }
});

app.get('/api/sessions/:code/public', async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const sessionRecord = await getSessionByCode(pocketBase, req.params.code?.toUpperCase());
    if (!sessionRecord) {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }
    const session = await buildSessionView(pocketBase, sessionRecord);
    res.json({ session });
  } catch (error) {
    console.error('[publicSession]', error);
    res.status(500).json({ error: 'Impossibile caricare la sessione' });
  }
});

app.get('/api/sessions/:code/remote', requireRemoteSession, async (req, res) => {
  try {
    const session = await buildSessionView(req.pocketBase, req.sessionRecord);
    res.json({ session });
  } catch (error) {
    console.error('[remoteSession]', error);
    res.status(500).json({ error: 'Impossibile caricare la sessione telecomando' });
  }
});

app.post('/api/sessions/:code/reveal/question', requireRemoteSession, async (req, res) => {
  try {
    let record = req.sessionRecord;
    if (record.status !== 'revealing') {
      record = await startRevealForSession(req.pocketBase, record);
    } else {
      const queue = Array.isArray(record.revealQueue) ? record.revealQueue : [];
      const nextIndex = (typeof record.currentQuestionIndex === 'number' ? record.currentQuestionIndex : -1) + 1;
      if (nextIndex >= queue.length) {
        const finished = await req.pocketBase.collection(SESSION_COLLECTION).update(record.id, {
          status: 'finished',
          revealPhase: 'complete',
          currentAnswerText: '',
        });
        const session = await buildSessionView(req.pocketBase, finished);
        return res.json({ session });
      }
      record = await req.pocketBase.collection(SESSION_COLLECTION).update(record.id, {
        currentQuestionIndex: nextIndex,
        currentAnswerIndex: -1,
        currentQuestionText: queue[nextIndex].prompt,
        currentAnswerText: '',
        revealPhase: 'question',
        discoSpin: Date.now(),
      });
    }
    const session = await buildSessionView(req.pocketBase, record);
    res.json({ session });
  } catch (error) {
    console.error('[revealQuestion]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Impossibile estrarre la domanda' });
  }
});

app.post('/api/sessions/:code/reveal/answer', requireRemoteSession, async (req, res) => {
  try {
    const revealItem = currentRevealItem(req.sessionRecord);
    if (!revealItem) {
      return res.status(400).json({ error: 'Nessuna domanda attiva' });
    }
    const nextIndex = (typeof req.sessionRecord.currentAnswerIndex === 'number' ? req.sessionRecord.currentAnswerIndex : -1) + 1;
    if (nextIndex >= revealItem.answers.length) {
      return res.status(400).json({ error: 'Tutte le risposte per questa domanda sono gia state mostrate' });
    }
    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      currentAnswerIndex: nextIndex,
      currentAnswerText: revealItem.answers[nextIndex].text,
      revealPhase: 'answer',
      discoSpin: Date.now(),
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[revealAnswer]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Impossibile mostrare la risposta' });
  }
});

app.post('/api/sessions/:code/reveal/finish', requireRemoteSession, async (req, res) => {
  try {
    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      status: 'finished',
      revealPhase: 'complete',
      currentAnswerText: '',
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[finishReveal]', error);
    res.status(500).json({ error: 'Impossibile chiudere il reveal' });
  }
});

app.use(express.static(distDir));

app.use((req, res) => {
  const target = req.path || '/';
  if (target.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[indovinachi] listening on ${APP_URL} via port ${PORT}`);
});
