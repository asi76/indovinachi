import { auth } from './firebase';
import { pb } from './pocketbase';
import type { IcebreakerPlayerRecord, MultilingualQuestion, PublicSessionView, QuestionLanguage, QuestionMode } from '../types';
import { attachClientTiming } from './countdown';

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
  return ((payload.sessions || []) as PublicSessionView[]).map(attachClientTiming);
}

export async function createHostSession(): Promise<PublicSessionView> {
  const payload = await authorizedFetch('/api/sessions', { method: 'POST', body: JSON.stringify({}) });
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function saveHostSessionConfig(code: string, config: { title: string; theme: string; questions: string[]; questionCount: number; questionMode: QuestionMode }): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/config`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function openCollecting(code: string, config?: { title: string; theme: string; questions: string[]; questionCount: number; questionMode: QuestionMode }): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/start-collecting`, {
    method: 'POST',
    body: JSON.stringify(config || {}),
  });
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function startSession(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/start-reveal`, { method: 'POST' });
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function closeHostSession(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/close`, { method: 'POST' });
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function terminateHostSession(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/terminate`, { method: 'POST' });
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function fetchPublicSession(code: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${code}/public`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Sessione non disponibile');
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function fetchRemoteSession(code: string, token: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${code}/remote?token=${encodeURIComponent(token)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Telecomando non autorizzato');
  return attachClientTiming(payload.session as PublicSessionView);
}

export async function remoteAction(code: string, token: string, action: 'open-collect' | 'start-session' | 'question' | 'answer' | 'votes' | 'player' | 'finish') {
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
  return attachClientTiming(payload.session as PublicSessionView);
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
  const response = await fetch(`/api/sessions/${session.code}/players/${player.id}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, language }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Invio fallito');
  return payload.player as IcebreakerPlayerRecord;
}

export async function submitPlayerGuess(session: PublicSessionView, player: IcebreakerPlayerRecord, guessedPlayerId: string) {
  const response = await fetch(`/api/sessions/${session.code}/players/${player.id}/guess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guessedPlayerId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Voto non registrato');
  return {
    guess: payload.guess as { guessedPlayerId: string },
    session: payload.session ? attachClientTiming(payload.session as PublicSessionView) : null,
  };
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
