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
const PB_URL = process.env.POCKETBASE_URL || process.env.PB_URL || process.env.VITE_POCKETBASE_URL || 'https://pb.indovinachi.asigo.cc';
const PB_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || process.env.PB_ADMIN_EMAIL || process.env.INDOVINACHI_PB_ADMIN_EMAIL || '';
const PB_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || process.env.PB_ADMIN_PASSWORD || process.env.INDOVINACHI_PB_ADMIN_PASSWORD || '';
const CENTRAL_AUTH_PB_URL = process.env.CENTRAL_AUTH_PB_URL || 'https://pb.theparty.asigo.cc';
const CENTRAL_AUTH_PB_ADMIN_EMAIL = process.env.CENTRAL_AUTH_PB_ADMIN_EMAIL || PB_ADMIN_EMAIL;
const CENTRAL_AUTH_PB_ADMIN_PASSWORD = process.env.CENTRAL_AUTH_PB_ADMIN_PASSWORD || PB_ADMIN_PASSWORD;
const APP_ACCESS_SLUG = process.env.APP_ACCESS_SLUG || 'indovinachi';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'asi.vong@gmail.com').toLowerCase();

const SESSION_COLLECTION = 'icebreaker_sessions';
const PLAYER_COLLECTION = 'icebreaker_players';
const RESPONSE_COLLECTION = 'icebreaker_responses';
const QUESTION_COLLECTION = 'icebreaker_questions';
const DEFAULT_QUESTIONS_JSON = process.env.DEFAULT_QUESTIONS_JSON || '/home/asi/Hämtningar/domande.json';
let defaultQuestionsSeeded = false;

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

function randomItem(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function nextDiscoSpin(current = 0) {
  const value = Number.isFinite(current) ? Number(current) : 0;
  return (value + 1) % 9999999;
}

function isMissingPbAdminCredentials(error) {
  return error instanceof Error && (
    error.message === 'Missing PocketBase admin credentials'
    || error.message === 'Missing central auth PocketBase admin credentials'
  );
}

function normalizeQuestions(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 24)
    : [];
}

function normalizeQuestionCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 3;
  return Math.max(1, Math.min(24, Math.trunc(count)));
}

function normalizeQuestionMode(value) {
  return value === 'random' ? 'random' : 'direct';
}

function assignmentState(sessionRecord) {
  const raw = sessionRecord?.assignedQuestionIds;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      mode: normalizeQuestionMode(raw.mode ?? sessionRecord.questionMode),
      used: Array.isArray(raw.used) ? raw.used.map((item) => String(item || '')).filter(Boolean) : [],
    };
  }

  return {
    mode: normalizeQuestionMode(sessionRecord?.questionMode),
    used: Array.isArray(raw) ? raw.map((item) => String(item || '')).filter(Boolean) : [],
  };
}

function serializeAssignmentState(mode, used = []) {
  return {
    mode: normalizeQuestionMode(mode),
    used: Array.isArray(used) ? used.map((item) => String(item || '')).filter(Boolean) : [],
  };
}

function directQuestionsForSession(sessionRecord) {
  return normalizeQuestions(sessionRecord.questions).map((text, index) => ({
    id: `direct-${index}`,
    IT: text,
    EN: text,
    SV: text,
  }));
}

function pickRandomQuestionsFromBank(bank, sessionRecord, usedQuestionIds = []) {
  const count = Math.min(normalizeQuestionCount(sessionRecord.questionCount), Math.max(bank.length, 1));
  const selected = [];
  let used = [...usedQuestionIds];
  let available = bank.filter((question) => !used.includes(question.id));

  while (selected.length < count) {
    if (available.length === 0) {
      used = [];
      available = bank.filter((question) => !selected.some((entry) => entry.id === question.id));
      if (available.length === 0) available = [...bank];
    }
    const [next] = shuffle(available).slice(0, 1);
    selected.push(next);
    used.push(next.id);
    available = available.filter((question) => question.id !== next.id);
  }

  return { questions: selected.map(questionView), used };
}

function normalizeMultilingualQuestion(entry) {
  const question = {
    externalId: entry?.externalId ?? entry?.id ?? '',
    IT: String(entry?.IT || entry?.it || '').trim(),
    EN: String(entry?.EN || entry?.en || '').trim(),
    SV: String(entry?.SV || entry?.sv || '').trim(),
    active: entry?.active === undefined ? true : Boolean(entry.active),
  };
  if (!question.IT || !question.EN || !question.SV) return null;
  return {
    ...question,
    externalId: String(question.externalId || '').slice(0, 64),
    IT: question.IT.slice(0, 500),
    EN: question.EN.slice(0, 500),
    SV: question.SV.slice(0, 500),
  };
}

function questionView(entry) {
  return {
    id: entry.id,
    IT: entry.IT || '',
    EN: entry.EN || '',
    SV: entry.SV || '',
  };
}

function resolveQuestionTextServer(question, preferredLanguage) {
  if (!question) return '';
  if (preferredLanguage === 'SV') return question.SV || question.EN || question.IT || '';
  if (preferredLanguage === 'EN') return question.EN || question.IT || question.SV || '';
  return question.IT || question.EN || question.SV || '';
}

function isSessionActive(status) {
  return !['finished', 'terminated'].includes(String(status || ''));
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

async function getActiveQuestions(pocketBase) {
  const questions = await pocketBase.collection(QUESTION_COLLECTION).getFullList({
    filter: 'active=true',
  });
  return [...questions].sort((left, right) => {
    const leftCreated = Date.parse(left.created || '') || 0;
    const rightCreated = Date.parse(right.created || '') || 0;
    return leftCreated - rightCreated;
  });
}

async function upsertQuestion(pocketBase, question) {
  const normalized = normalizeMultilingualQuestion(question);
  if (!normalized) return null;

  const existing = await pocketBase.collection(QUESTION_COLLECTION).getList(1, 1, {
    filter: `IT="${escapeFilter(normalized.IT)}" && EN="${escapeFilter(normalized.EN)}" && SV="${escapeFilter(normalized.SV)}"`,
  });
  const found = existing.items[0];
  if (found) {
    return pocketBase.collection(QUESTION_COLLECTION).update(found.id, normalized);
  }
  return pocketBase.collection(QUESTION_COLLECTION).create(normalized);
}

async function ensureDefaultQuestions(pocketBase) {
  if (defaultQuestionsSeeded) return;
  defaultQuestionsSeeded = true;

  const existing = await pocketBase.collection(QUESTION_COLLECTION).getList(1, 1, {
    filter: 'active=true',
  });
  if (existing.totalItems > 0 || !fs.existsSync(DEFAULT_QUESTIONS_JSON)) return;

  const parsed = JSON.parse(fs.readFileSync(DEFAULT_QUESTIONS_JSON, 'utf8'));
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions)) return;
  await Promise.all(questions.map((entry) => upsertQuestion(pocketBase, entry)));
}

async function pickQuestionsForPlayer(pocketBase, sessionRecord) {
  const state = assignmentState(sessionRecord);
  const fallback = directQuestionsForSession(sessionRecord);

  if (state.mode === 'direct') {
    return fallback;
  }

  await ensureDefaultQuestions(pocketBase);
  const bank = await getActiveQuestions(pocketBase);
  if (bank.length === 0) return fallback.slice(0, normalizeQuestionCount(sessionRecord.questionCount || fallback.length || 3));

  const picked = pickRandomQuestionsFromBank(bank, sessionRecord, state.used);

  await pocketBase.collection(SESSION_COLLECTION).update(sessionRecord.id, {
    assignedQuestionIds: serializeAssignmentState(state.mode, picked.used),
  });

  return picked.questions;
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
    ensureFirebaseAdmin();
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
    if (error instanceof Error && error.message === 'Missing Firebase Admin credentials') {
      return res.status(503).json({ error: 'Firebase Admin non configurato sul server' });
    }
    res.status(401).json({ error: 'Autenticazione Firebase non valida' });
  }
}

async function getSessionByCode(pocketBase, code) {
  const result = await pocketBase.collection(SESSION_COLLECTION).getList(1, 1, {
    filter: `code="${escapeFilter(code)}"`,
  });
  return result.items[0] || null;
}

async function getHostSessions(pocketBase, hostEmail) {
  const sessions = await pocketBase.collection(SESSION_COLLECTION).getFullList({
    filter: `hostEmail="${escapeFilter(hostEmail)}"`,
  });
  return [...sessions].sort((left, right) => {
    const leftUpdated = Date.parse(left.updated || left.created || '') || 0;
    const rightUpdated = Date.parse(right.updated || right.created || '') || 0;
    return rightUpdated - leftUpdated;
  });
}

async function getSingletonHostSession(pocketBase, hostEmail) {
  const sessions = await getHostSessions(pocketBase, hostEmail);
  return sessions.find((session) => isSessionActive(session.status)) || sessions[0] || null;
}

async function getPlayersByCode(pocketBase, code) {
  const players = await pocketBase.collection(PLAYER_COLLECTION).getFullList({
    filter: `sessionCode="${escapeFilter(code)}"`,
  });
  return [...players].sort((left, right) => {
    const leftJoined = Date.parse(left.joinedAt || left.created || '') || 0;
    const rightJoined = Date.parse(right.joinedAt || right.created || '') || 0;
    return leftJoined - rightJoined;
  });
}

async function getResponsesByCode(pocketBase, code) {
  const responses = await pocketBase.collection(RESPONSE_COLLECTION).getFullList({
    filter: `sessionCode="${escapeFilter(code)}"`,
  });
  return responses.filter((entry) => !String(entry.questionId || '').startsWith('__guess__:')).sort((left, right) => {
    const leftQuestionIndex = Number.isFinite(left.questionIndex) ? Number(left.questionIndex) : 0;
    const rightQuestionIndex = Number.isFinite(right.questionIndex) ? Number(right.questionIndex) : 0;
    if (leftQuestionIndex !== rightQuestionIndex) return leftQuestionIndex - rightQuestionIndex;
    const leftSubmitted = Date.parse(left.submittedAt || left.created || '') || 0;
    const rightSubmitted = Date.parse(right.submittedAt || right.created || '') || 0;
    return leftSubmitted - rightSubmitted;
  });
}

function currentAnswerKey(sessionRecord) {
  const questionIndex = typeof sessionRecord.currentQuestionIndex === 'number' ? sessionRecord.currentQuestionIndex : -1;
  const answerIndex = typeof sessionRecord.currentAnswerIndex === 'number' ? sessionRecord.currentAnswerIndex : -1;
  if (questionIndex < 0 || answerIndex < 0) return '';
  return `${questionIndex}:${answerIndex}`;
}

function guessQuestionId(answerKey) {
  return `__guess__:${answerKey}`;
}

async function getGuessSummary(pocketBase, sessionRecord, players) {
  const answerKey = currentAnswerKey(sessionRecord);
  if (!answerKey || players.length === 0) return [];

  let guesses = [];
  try {
    guesses = await pocketBase.collection(RESPONSE_COLLECTION).getFullList({
      filter: `sessionCode="${escapeFilter(sessionRecord.code)}" && questionId="${escapeFilter(guessQuestionId(answerKey))}"`,
    });
  } catch (error) {
    console.error('[getGuessSummary]', error);
    return [];
  }

  const playersById = new Map(players.map((player) => [player.id, player]));
  const counts = new Map();
  for (const guess of guesses) {
    const guessedPlayerId = guess.answerText;
    if (!playersById.has(guessedPlayerId)) continue;
    counts.set(guessedPlayerId, (counts.get(guessedPlayerId) || 0) + 1);
  }
  const validVoteCount = Array.from(counts.values()).reduce((total, count) => total + count, 0);
  if (validVoteCount === 0) return [];

  return Array.from(counts.entries())
    .map(([playerId, voteCount]) => {
      const player = playersById.get(playerId);
      return {
        playerId,
        nickname: player.nickname,
        avatar: player.avatar,
        voteCount,
        percentage: Math.round((voteCount / validVoteCount) * 1000) / 10,
      };
    })
    .sort((left, right) => {
      if (right.voteCount !== left.voteCount) return right.voteCount - left.voteCount;
      return left.nickname.localeCompare(right.nickname, 'it');
    });
}

async function deleteRecordsBySessionCode(pocketBase, collectionName, code) {
  while (true) {
    const records = await pocketBase.collection(collectionName).getFullList({
      filter: `sessionCode="${escapeFilter(code)}"`,
    });
    if (records.length === 0) return;
    for (const record of records) {
      await pocketBase.collection(collectionName).delete(record.id);
    }
  }
}

async function clearSessionParticipants(pocketBase, code) {
  await deleteRecordsBySessionCode(pocketBase, RESPONSE_COLLECTION, code);
  await deleteRecordsBySessionCode(pocketBase, PLAYER_COLLECTION, code);
}

async function questionAssignmentsForPlayers(pocketBase, sessionRecord, players) {
  const state = assignmentState(sessionRecord);
  const fallback = directQuestionsForSession(sessionRecord);

  if (state.mode === 'direct') {
    return {
      assignmentState: serializeAssignmentState(state.mode, []),
      assignments: players.map((player) => ({ player, questions: fallback })),
    };
  }

  await ensureDefaultQuestions(pocketBase);
  const bank = await getActiveQuestions(pocketBase);
  if (bank.length === 0) {
    return {
      assignmentState: serializeAssignmentState(state.mode, []),
      assignments: players.map((player) => ({
        player,
        questions: fallback.slice(0, normalizeQuestionCount(sessionRecord.questionCount || fallback.length || 3)),
      })),
    };
  }

  let used = [];
  const assignments = players.map((player) => {
    const picked = pickRandomQuestionsFromBank(bank, sessionRecord, used);
    used = picked.used;
    return { player, questions: picked.questions };
  });

  return {
    assignmentState: serializeAssignmentState(state.mode, used),
    assignments,
  };
}

async function resetSessionForCollecting(pocketBase, sessionRecord, questions) {
  const state = assignmentState(sessionRecord);
  const players = await getPlayersByCode(pocketBase, sessionRecord.code);
  const responses = await getResponsesByCode(pocketBase, sessionRecord.code);
  const playerAssignments = await questionAssignmentsForPlayers(pocketBase, sessionRecord, players);

  await Promise.all(responses.map((entry) => pocketBase.collection(RESPONSE_COLLECTION).delete(entry.id)));
  await Promise.all(playerAssignments.assignments.map(({ player, questions: playerQuestions }) => (
    pocketBase.collection(PLAYER_COLLECTION).update(player.id, {
      questions: playerQuestions,
      submitted: false,
      submittedAt: '',
    })
  )));

  return pocketBase.collection(SESSION_COLLECTION).update(sessionRecord.id, {
    status: 'collecting',
    questions,
    revealQueue: [],
    currentQuestionIndex: -1,
    currentAnswerIndex: -1,
    currentQuestionText: '',
    currentAnswerText: '',
    revealPhase: 'idle',
    assignedQuestionIds: playerAssignments.assignmentState || serializeAssignmentState(state.mode, []),
    discoSpin: nextDiscoSpin(sessionRecord.discoSpin),
  });
}

async function buildSessionView(pocketBase, record) {
  if (record.status === 'ready') {
    record = await pocketBase.collection(SESSION_COLLECTION).update(record.id, { status: 'collecting' });
  }

  const state = assignmentState(record);
  const sessionClosed = ['finished', 'terminated'].includes(record.status);
  const players = sessionClosed ? [] : await getPlayersByCode(pocketBase, record.code);
  const answeredCount = players.filter((entry) => Boolean(entry.submitted)).length;
  const allAnswered = players.length > 0 && answeredCount === players.length;
  const currentAnswerPlayer = currentAnswerEntry(record);
  const currentGuessSummary = await getGuessSummary(pocketBase, record, players);

  return {
    id: record.id,
    code: record.code,
    hostEmail: record.hostEmail || '',
    hostName: record.hostName || '',
    title: record.title || 'Indovina Chi',
    theme: record.theme || '',
    status: record.status || 'draft',
    questions: Array.isArray(record.questions) ? record.questions : [],
    questionCount: normalizeQuestionCount(record.questionCount),
    questionMode: state.mode,
    assignedQuestionIds: state.used,
    presenterToken: record.presenterToken || '',
    remoteToken: record.remoteToken || '',
    revealQueue: Array.isArray(record.revealQueue) ? record.revealQueue : [],
    currentQuestionIndex: typeof record.currentQuestionIndex === 'number' ? record.currentQuestionIndex : -1,
    currentAnswerIndex: typeof record.currentAnswerIndex === 'number' ? record.currentAnswerIndex : -1,
    currentQuestionText: record.currentQuestionText || '',
    currentAnswerText: record.currentAnswerText || '',
    currentAnswerStartedAt: record.currentAnswerStartedAt || (record.status === 'revealing' && record.currentAnswerText ? record.updated || '' : ''),
    revealPhase: record.revealPhase || 'idle',
    discoSpin: typeof record.discoSpin === 'number' ? record.discoSpin : 0,
    created: record.created || '',
    updated: record.updated || '',
    playerCount: players.length,
    answeredCount,
    allAnswered,
    currentAnswerPlayer,
    currentAnswerPlayerVisible: record.status === 'revealing' && record.revealPhase === 'complete' && Boolean(currentAnswerPlayer),
    currentGuessSummary,
    players: players.map((entry) => ({
      id: entry.id,
      sessionCode: entry.sessionCode,
      nickname: entry.nickname,
      avatar: entry.avatar,
      questions: Array.isArray(entry.questions) ? entry.questions : [],
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
  if (!['collecting', 'ready'].includes(sessionRecord.status)) {
    throw new Error('Apri la raccolta prima di iniziare la sessione');
  }

  const players = await getPlayersByCode(pocketBase, sessionRecord.code);
  if (players.length === 0) {
    throw new Error('Nessun partecipante presente');
  }

  const responses = await getResponsesByCode(pocketBase, sessionRecord.code);
  if (responses.length === 0) {
    throw new Error('Nessuna risposta disponibile per il reveal');
  }
  const grouped = new Map();
  for (const response of responses) {
    const key = response.questionId || response.questionText || (Number.isFinite(response.questionIndex) ? response.questionIndex : 0);
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
    currentQuestionIndex: -1,
    currentAnswerIndex: -1,
    currentQuestionText: '',
    currentAnswerText: '',
    revealPhase: 'idle',
    discoSpin: nextDiscoSpin(sessionRecord.discoSpin),
  });
}

function currentRevealItem(sessionRecord) {
  const queue = Array.isArray(sessionRecord.revealQueue) ? sessionRecord.revealQueue : [];
  const questionIndex = typeof sessionRecord.currentQuestionIndex === 'number' ? sessionRecord.currentQuestionIndex : -1;
  return queue[questionIndex] || null;
}

function currentAnswerEntry(sessionRecord) {
  const revealItem = currentRevealItem(sessionRecord);
  const answerIndex = typeof sessionRecord.currentAnswerIndex === 'number' ? sessionRecord.currentAnswerIndex : -1;
  return revealItem?.answers?.[answerIndex] || null;
}

app.post('/api/auth/session', requireAuthorizedHost, async (req, res) => {
  res.json({
    user: req.user,
    role: req.user.role,
  });
});

app.get('/api/questions', requireAuthorizedHost, async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    await ensureDefaultQuestions(pocketBase);
    const questions = await getActiveQuestions(pocketBase);
    res.json({ questions: questions.map(questionView) });
  } catch (error) {
    console.error('[questions]', error);
    res.status(500).json({ error: 'Impossibile caricare il database domande' });
  }
});

app.post('/api/questions', requireAuthorizedHost, async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const created = await upsertQuestion(pocketBase, req.body);
    if (!created) {
      return res.status(400).json({ error: 'La domanda deve avere traduzione IT, EN e SV' });
    }
    res.status(201).json({ question: questionView(created) });
  } catch (error) {
    console.error('[createQuestion]', error);
    res.status(500).json({ error: 'Impossibile salvare la domanda' });
  }
});

app.patch('/api/questions/:id', requireAuthorizedHost, async (req, res) => {
  try {
    const normalized = normalizeMultilingualQuestion(req.body);
    if (!normalized) {
      return res.status(400).json({ error: 'La domanda deve avere traduzione IT, EN e SV' });
    }
    const pocketBase = await authenticatePocketBase();
    const updated = await pocketBase.collection(QUESTION_COLLECTION).update(req.params.id, normalized);
    res.json({ question: questionView(updated) });
  } catch (error) {
    console.error('[updateQuestion]', error);
    res.status(500).json({ error: 'Impossibile aggiornare la domanda' });
  }
});

app.delete('/api/questions/:id', requireAuthorizedHost, async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    await pocketBase.collection(QUESTION_COLLECTION).update(req.params.id, { active: false });
    res.json({ deleted: true });
  } catch (error) {
    console.error('[deleteQuestion]', error);
    res.status(500).json({ error: 'Impossibile eliminare la domanda' });
  }
});

app.post('/api/questions/import', requireAuthorizedHost, async (req, res) => {
  try {
    const list = Array.isArray(req.body?.questions) ? req.body.questions : [];
    if (list.length === 0) {
      return res.status(400).json({ error: 'JSON senza domande valide' });
    }
    const pocketBase = await authenticatePocketBase();
    const results = await Promise.all(list.map((entry) => upsertQuestion(pocketBase, entry)));
    const imported = results.filter(Boolean).length;
    res.json({ imported, total: list.length });
  } catch (error) {
    console.error('[importQuestions]', error);
    res.status(500).json({ error: 'Import domande fallito' });
  }
});

app.get('/api/host/sessions', requireAuthorizedHost, async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const singleton = await getSingletonHostSession(pocketBase, req.user.email);
    const sessions = singleton ? [singleton] : [];
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
    if (isMissingPbAdminCredentials(error)) {
      return res.status(503).json({ error: 'PocketBase admin non configurato sul server' });
    }
    res.status(500).json({ error: 'Impossibile caricare le sessioni' });
  }
});

app.post('/api/sessions', requireAuthorizedHost, async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const existing = await getSingletonHostSession(pocketBase, req.user.email);
    if (existing) {
      const session = await buildSessionView(pocketBase, existing);
      return res.json({ session });
    }
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
      questionCount: 3,
      assignedQuestionIds: serializeAssignmentState('direct', []),
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
    if (isMissingPbAdminCredentials(error)) {
      return res.status(503).json({ error: 'PocketBase admin non configurato sul server' });
    }
    res.status(500).json({ error: 'Impossibile creare la sessione' });
  }
});

app.post('/api/sessions/:code/join', async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const session = await getSessionByCode(pocketBase, req.params.code?.toUpperCase());
    if (!session) {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }
    if (!['draft', 'lobby', 'collecting', 'ready'].includes(session.status)) {
      return res.status(400).json({ error: 'Sessione chiusa' });
    }

    const nickname = String(req.body?.nickname || '').trim().slice(0, 28);
    const avatar = String(req.body?.avatar || '').trim().slice(0, 8);
    if (!nickname || !avatar) {
      return res.status(400).json({ error: 'Nickname e avatar sono obbligatori' });
    }

    const duplicates = await pocketBase.collection(PLAYER_COLLECTION).getList(1, 1, {
      filter: `sessionCode="${escapeFilter(session.code)}" && nickname="${escapeFilter(nickname)}"`,
    });
    if (duplicates.totalItems > 0) {
      return res.status(409).json({ error: 'Nickname gia usato' });
    }

    const questions = await pickQuestionsForPlayer(pocketBase, session);
    if (questions.length === 0) {
      return res.status(400).json({ error: 'Nessuna domanda disponibile' });
    }

    const player = await pocketBase.collection(PLAYER_COLLECTION).create({
      sessionCode: session.code,
      nickname,
      avatar,
      questions,
      submitted: false,
      joinedAt: new Date().toISOString(),
    });

    if (session.status === 'draft') {
      await pocketBase.collection(SESSION_COLLECTION).update(session.id, { status: 'lobby' });
    }

    res.status(201).json({
      player: {
        id: player.id,
        sessionCode: player.sessionCode,
        nickname: player.nickname,
        avatar: player.avatar,
        questions: Array.isArray(player.questions) ? player.questions : [],
        submitted: Boolean(player.submitted),
        joinedAt: player.joinedAt,
        submittedAt: player.submittedAt || null,
        created: player.created,
        updated: player.updated,
      },
    });
  } catch (error) {
    console.error('[joinSession]', error);
    res.status(500).json({ error: 'Ingresso in sessione fallito' });
  }
});

app.post('/api/sessions/:code/players/:playerId/responses', async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const session = await getSessionByCode(pocketBase, req.params.code?.toUpperCase());
    if (!session) {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }
    if (session.status !== 'collecting') {
      return res.status(400).json({ error: 'La raccolta risposte e chiusa' });
    }

    const player = await pocketBase.collection(PLAYER_COLLECTION).getOne(req.params.playerId);
    if (!player || player.sessionCode !== session.code) {
      return res.status(404).json({ error: 'Giocatore non trovato per questa sessione' });
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers.map((entry) => String(entry || '').trim()) : [];
    const language = String(req.body?.language || '');
    const questions = Array.isArray(player.questions) && player.questions.length > 0
      ? player.questions
      : normalizeQuestions(session.questions).map((question, index) => ({ id: `legacy-${index}`, IT: question, EN: question, SV: question }));

    if (questions.length === 0 || answers.length !== questions.length || answers.some((answer) => !answer)) {
      return res.status(400).json({ error: 'Compila tutte le risposte' });
    }

    const existing = await pocketBase.collection(RESPONSE_COLLECTION).getFullList({
      filter: `sessionCode="${escapeFilter(session.code)}" && playerId="${escapeFilter(player.id)}"`,
    });
    await Promise.all(existing.map((entry) => pocketBase.collection(RESPONSE_COLLECTION).delete(entry.id)));

    const submittedAt = new Date().toISOString();
    await Promise.all(answers.map((answer, index) => {
      const question = questions[index];
      return pocketBase.collection(RESPONSE_COLLECTION).create({
        sessionCode: session.code,
        playerId: player.id,
        playerNickname: player.nickname,
        playerAvatar: player.avatar,
        questionId: question?.id || `legacy-${index}`,
        questionIndex: index + 1,
        questionText: resolveQuestionTextServer(question, language),
        answerText: answer,
        submittedAt,
      });
    }));

    const updatedPlayer = await pocketBase.collection(PLAYER_COLLECTION).update(player.id, {
      submitted: true,
      submittedAt,
    });

    res.json({
      player: {
        id: updatedPlayer.id,
        sessionCode: updatedPlayer.sessionCode,
        nickname: updatedPlayer.nickname,
        avatar: updatedPlayer.avatar,
        questions: Array.isArray(updatedPlayer.questions) ? updatedPlayer.questions : [],
        submitted: Boolean(updatedPlayer.submitted),
        joinedAt: updatedPlayer.joinedAt,
        submittedAt: updatedPlayer.submittedAt || null,
        created: updatedPlayer.created,
        updated: updatedPlayer.updated,
      },
    });
  } catch (error) {
    console.error('[submitPlayerResponses]', error);
    res.status(500).json({ error: 'Invio risposte fallito' });
  }
});

app.post('/api/sessions/:code/players/:playerId/guess', async (req, res) => {
  try {
    const pocketBase = await authenticatePocketBase();
    const session = await getSessionByCode(pocketBase, req.params.code?.toUpperCase());
    if (!session) {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }
    if (session.status !== 'revealing' || session.revealPhase !== 'answer') {
      return res.status(400).json({ error: 'Il voto e aperto solo durante il countdown' });
    }

    const answerKey = currentAnswerKey(session);
    if (!answerKey || !currentAnswerEntry(session)) {
      return res.status(400).json({ error: 'Nessuna risposta attiva' });
    }

    const elapsedMs = Date.now() - (Date.parse(session.currentAnswerStartedAt || session.updated || '') || 0);
    if (elapsedMs > 10000) {
      return res.status(400).json({ error: 'Countdown terminato' });
    }

    const players = await getPlayersByCode(pocketBase, session.code);
    const voter = players.find((entry) => entry.id === req.params.playerId);
    const guessedPlayerId = String(req.body?.guessedPlayerId || '').trim();
    const guessed = players.find((entry) => entry.id === guessedPlayerId);
    if (!voter) {
      return res.status(404).json({ error: 'Giocatore non trovato per questa sessione' });
    }
    if (!guessed) {
      return res.status(400).json({ error: 'Nome scelto non valido' });
    }

    const existing = await pocketBase.collection(RESPONSE_COLLECTION).getFullList({
      filter: `sessionCode="${escapeFilter(session.code)}" && questionId="${escapeFilter(guessQuestionId(answerKey))}" && playerId="${escapeFilter(voter.id)}"`,
    });
    await Promise.all(existing.map((entry) => pocketBase.collection(RESPONSE_COLLECTION).delete(entry.id)));

    const guess = await pocketBase.collection(RESPONSE_COLLECTION).create({
      sessionCode: session.code,
      playerId: voter.id,
      playerNickname: voter.nickname,
      playerAvatar: voter.avatar,
      questionId: guessQuestionId(answerKey),
      questionIndex: 0,
      questionText: 'guess',
      answerText: guessed.id,
      submittedAt: new Date().toISOString(),
    });

    res.json({ guess: { guessedPlayerId: guess.answerText } });
  } catch (error) {
    console.error('[submitPlayerGuess]', error);
    res.status(500).json({ error: 'Voto non registrato' });
  }
});

app.patch('/api/sessions/:code/config', requireAuthorizedHost, requireOwnedSession, async (req, res) => {
  try {
    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      title: String(req.body?.title || 'Indovina Chi').trim().slice(0, 120),
      theme: String(req.body?.theme || '').trim().slice(0, 280),
      questions: normalizeQuestions(req.body?.questions),
      questionCount: normalizeQuestionCount(req.body?.questionCount),
      assignedQuestionIds: serializeAssignmentState(req.body?.questionMode, []),
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
    if (req.body && Object.keys(req.body).length > 0) {
      req.sessionRecord = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
        title: String(req.body?.title || req.sessionRecord.title || 'Indovina Chi').trim().slice(0, 120),
        theme: String(req.body?.theme ?? req.sessionRecord.theme ?? '').trim().slice(0, 280),
        questions: normalizeQuestions(req.body?.questions),
        questionCount: normalizeQuestionCount(req.body?.questionCount),
        assignedQuestionIds: serializeAssignmentState(req.body?.questionMode, []),
        status: 'lobby',
      });
    }

    await ensureDefaultQuestions(req.pocketBase);
    const bank = await getActiveQuestions(req.pocketBase);
    const questions = normalizeQuestions(req.sessionRecord.questions);
    const questionMode = assignmentState(req.sessionRecord).mode;
    if (questionMode === 'direct' && questions.length === 0) {
      return res.status(400).json({ error: 'Inserisci almeno una domanda diretta prima di aprire la raccolta' });
    }
    if (questionMode === 'random' && bank.length === 0) {
      return res.status(400).json({ error: 'Inserisci almeno una domanda nel database prima di aprire la raccolta' });
    }
    const updated = await resetSessionForCollecting(req.pocketBase, req.sessionRecord, questions);
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[startCollecting]', error);
    res.status(500).json({ error: 'Impossibile aprire la raccolta risposte' });
  }
});

app.post('/api/sessions/:code/collect/open', requireRemoteSession, async (req, res) => {
  try {
    await ensureDefaultQuestions(req.pocketBase);
    const bank = await getActiveQuestions(req.pocketBase);
    const questions = normalizeQuestions(req.sessionRecord.questions);
    const questionMode = assignmentState(req.sessionRecord).mode;
    if (questionMode === 'direct' && questions.length === 0) {
      return res.status(400).json({ error: 'Inserisci almeno una domanda diretta prima di aprire la raccolta' });
    }
    if (questionMode === 'random' && bank.length === 0) {
      return res.status(400).json({ error: 'Inserisci almeno una domanda nel database prima di aprire la raccolta' });
    }
    const updated = await resetSessionForCollecting(req.pocketBase, req.sessionRecord, questions);
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[remoteOpenCollect]', error);
    res.status(500).json({ error: 'Impossibile aprire la raccolta risposte' });
  }
});

app.post('/api/sessions/:code/collect/close', requireRemoteSession, async (req, res) => {
  try {
    const updated = await startRevealForSession(req.pocketBase, req.sessionRecord);
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[remoteCloseCollect]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Impossibile chiudere la raccolta e avviare il reveal' });
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

app.post('/api/sessions/:code/terminate', requireAuthorizedHost, requireOwnedSession, async (req, res) => {
  try {
    const players = await getPlayersByCode(req.pocketBase, req.sessionRecord.code);
    const responses = await getResponsesByCode(req.pocketBase, req.sessionRecord.code);

    for (const player of players) {
      await req.pocketBase.collection(PLAYER_COLLECTION).delete(player.id).catch(() => {});
    }
    for (const response of responses) {
      await req.pocketBase.collection(RESPONSE_COLLECTION).delete(response.id).catch(() => {});
    }

    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      title: 'Indovina Chi',
      theme: 'Studio party 70s, dinamico, luminoso, pieno di ritmo',
      status: 'draft',
      questions: [],
      revealQueue: [],
      currentQuestionIndex: -1,
      currentAnswerIndex: -1,
      currentQuestionText: '',
      currentAnswerText: '',
      revealPhase: 'idle',
      discoSpin: 0,
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[terminateSession]', error);
    res.status(500).json({ error: 'Impossibile terminare la sessione' });
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

app.post('/api/sessions/:code/close', requireAuthorizedHost, requireOwnedSession, async (req, res) => {
  try {
    await clearSessionParticipants(req.pocketBase, req.sessionRecord.code);

    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      status: 'finished',
      revealQueue: [],
      currentQuestionIndex: -1,
      currentAnswerIndex: -1,
      currentQuestionText: '',
      currentAnswerText: '',
      revealPhase: 'complete',
      assignedQuestionIds: serializeAssignmentState(assignmentState(req.sessionRecord).mode, []),
      discoSpin: nextDiscoSpin(req.sessionRecord.discoSpin),
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[closeHostSession]', error);
    res.status(500).json({ error: 'Impossibile chiudere la sessione' });
  }
});

app.post('/api/sessions/:code/reveal/question', requireRemoteSession, async (req, res) => {
  try {
    let record = req.sessionRecord;
    if (record.status !== 'revealing') {
      record = await startRevealForSession(req.pocketBase, record);
    }

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
      discoSpin: nextDiscoSpin(record.discoSpin),
    });
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
      discoSpin: nextDiscoSpin(req.sessionRecord.discoSpin),
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[revealAnswer]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Impossibile mostrare la risposta' });
  }
});

app.post('/api/sessions/:code/reveal/player', requireRemoteSession, async (req, res) => {
  try {
    const answer = currentAnswerEntry(req.sessionRecord);
    if (!answer) {
      return res.status(400).json({ error: 'Nessuna risposta attiva' });
    }
    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      revealPhase: 'complete',
      discoSpin: nextDiscoSpin(req.sessionRecord.discoSpin),
    });
    const session = await buildSessionView(req.pocketBase, updated);
    res.json({ session });
  } catch (error) {
    console.error('[revealPlayer]', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Impossibile mostrare il giocatore' });
  }
});

app.post('/api/sessions/:code/reveal/finish', requireRemoteSession, async (req, res) => {
  try {
    await clearSessionParticipants(req.pocketBase, req.sessionRecord.code);

    const updated = await req.pocketBase.collection(SESSION_COLLECTION).update(req.sessionRecord.id, {
      status: 'finished',
      revealQueue: [],
      currentQuestionIndex: -1,
      currentAnswerIndex: -1,
      currentQuestionText: '',
      revealPhase: 'complete',
      currentAnswerText: '',
      assignedQuestionIds: serializeAssignmentState(assignmentState(req.sessionRecord).mode, []),
      discoSpin: nextDiscoSpin(req.sessionRecord.discoSpin),
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
