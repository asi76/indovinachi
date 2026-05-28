import { auth } from './firebase';
import { pb } from './pocketbase';
import type { IcebreakerPlayerRecord, MultilingualQuestion, PublicSessionView, QuestionLanguage, QuestionMode } from '../types';

async function authorizedFetch(path: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sessione Google non disponibile');
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Operazione fallita');
  return payload;
}

export async function fetchHostSessions(): Promise<PublicSessionView[]> {
  const payload = await authorizedFetch('/api/host/sessions');
  return (payload.sessions || []) as PublicSessionView[];
}

export async function createHostSession(): Promise<PublicSessionView> {
  const payload = await authorizedFetch('/api/sessions', { method: 'POST', body: JSON.stringify({}) });
  return payload.session as PublicSessionView;
}

export async function saveHostSessionConfig(code: string, config: { title: string; theme: string; questions: string[]; questionCount: number; questionMode: QuestionMode }): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/config`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
  return payload.session as PublicSessionView;
}

export async function openCollecting(code: string, config?: { title: string; theme: string; questions: string[]; questionCount: number; questionMode: QuestionMode }): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/start-collecting`, {
    method: 'POST',
    body: JSON.stringify(config || {}),
  });
  return payload.session as PublicSessionView;
}

export async function startSession(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/start-reveal`, { method: 'POST' });
  return payload.session as PublicSessionView;
}

export async function closeHostSession(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/close`, { method: 'POST' });
  return payload.session as PublicSessionView;
}

export async function terminateHostSession(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/terminate`, { method: 'POST' });
  return payload.session as PublicSessionView;
}

export async function fetchPublicSession(code: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${code}/public`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Sessione non disponibile');
  return payload.session as PublicSessionView;
}

export async function fetchRemoteSession(code: string, token: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${code}/remote?token=${encodeURIComponent(token)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Telecomando non autorizzato');
  return payload.session as PublicSessionView;
}

export async function remoteAction(code: string, token: string, action: 'open-collect' | 'start-session' | 'question' | 'answer' | 'player' | 'finish') {
  const path = action === 'open-collect'
    ? `/api/sessions/${code}/collect/open`
    : action === 'start-session'
      ? `/api/sessions/${code}/collect/close`
      : `/api/sessions/${code}/reveal/${action}`;
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Azione non completata');
  return payload.session as PublicSessionView;
}

export async function fetchPlayer(playerId: string) {
  return pb.collection('icebreaker_players').getOne(playerId) as Promise<IcebreakerPlayerRecord>;
}

export async function joinPlayer(sessionCode: string, nickname: string, avatar: string) {
  const response = await fetch(`/api/sessions/${sessionCode}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, avatar }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Ingresso fallito');
  return payload.player as IcebreakerPlayerRecord;
}

export async function ensureNicknameAvailable(sessionCode: string, nickname: string) {
  const duplicates = await pb.collection('icebreaker_players').getList(1, 1, {
    filter: `sessionCode="${sessionCode}" && nickname="${nickname.replace(/"/g, '\\"')}"`,
  });
  return duplicates.totalItems === 0;
}

export async function submitPlayerResponses(session: PublicSessionView, player: IcebreakerPlayerRecord, answers: string[], language?: QuestionLanguage) {
  const existing = await pb.collection('icebreaker_responses').getFullList({
    filter: `sessionCode="${session.code}" && playerId="${player.id}"`,
  });
  for (const entry of existing) {
    await pb.collection('icebreaker_responses').delete(entry.id);
  }

  const questions = Array.isArray(player.questions) && player.questions.length > 0
    ? player.questions
    : session.questions.map((question, index) => ({ id: `legacy-${index}`, IT: question, EN: question, SV: question }));

  for (const [index, answer] of answers.entries()) {
    const question = questions[index];
    await pb.collection('icebreaker_responses').create({
      sessionCode: session.code,
      playerId: player.id,
      playerNickname: player.nickname,
      playerAvatar: player.avatar,
      questionId: question?.id || `legacy-${index}`,
      questionIndex: index + 1,
      questionText: resolveQuestionText(question, language),
      answerText: answer.trim(),
      submittedAt: new Date().toISOString(),
    });
  }

  return pb.collection('icebreaker_players').update(player.id, {
    submitted: true,
    submittedAt: new Date().toISOString(),
  }) as Promise<IcebreakerPlayerRecord>;
}

export async function fetchQuestionBank(): Promise<MultilingualQuestion[]> {
  const payload = await authorizedFetch('/api/questions');
  return (payload.questions || []) as MultilingualQuestion[];
}

export async function addQuestion(question: Omit<MultilingualQuestion, 'id'>): Promise<MultilingualQuestion> {
  const payload = await authorizedFetch('/api/questions', {
    method: 'POST',
    body: JSON.stringify(question),
  });
  return payload.question as MultilingualQuestion;
}

export async function updateQuestion(id: string, question: Omit<MultilingualQuestion, 'id'>): Promise<MultilingualQuestion> {
  const payload = await authorizedFetch(`/api/questions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(question),
  });
  return payload.question as MultilingualQuestion;
}

export async function deleteQuestion(id: string): Promise<void> {
  await authorizedFetch(`/api/questions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function importQuestions(questions: Array<Partial<MultilingualQuestion>>): Promise<{ imported: number; total: number }> {
  const payload = await authorizedFetch('/api/questions/import', {
    method: 'POST',
    body: JSON.stringify({ questions }),
  });
  return { imported: Number(payload.imported || 0), total: Number(payload.total || 0) };
}

export function resolveQuestionText(question?: Partial<MultilingualQuestion>, preferredLanguage?: QuestionLanguage) {
  if (!question) return '';
  if (preferredLanguage === 'SV') return question.SV || question.EN || question.IT || '';
  if (preferredLanguage === 'EN') return question.EN || question.IT || question.SV || '';
  if (preferredLanguage === 'IT') return question.IT || question.EN || question.SV || '';

  const language = navigator.language.toLowerCase();
  if (language.startsWith('sv')) return question.SV || question.EN || question.IT || '';
  if (language.startsWith('en')) return question.EN || question.IT || question.SV || '';
  return question.IT || question.EN || question.SV || '';
}
