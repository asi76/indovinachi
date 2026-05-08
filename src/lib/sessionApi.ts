import { auth } from './firebase';
import { pb } from './pocketbase';
import type { IcebreakerPlayerRecord, PublicSessionView } from '../types';

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

export async function saveHostSessionConfig(code: string, config: { title: string; theme: string; questions: string[] }): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/config`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
  return payload.session as PublicSessionView;
}

export async function openCollecting(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/start-collecting`, { method: 'POST' });
  return payload.session as PublicSessionView;
}

export async function startSession(code: string): Promise<PublicSessionView> {
  const payload = await authorizedFetch(`/api/sessions/${code}/start-reveal`, { method: 'POST' });
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

export async function remoteAction(code: string, token: string, action: 'open-collect' | 'start-session' | 'question' | 'answer' | 'finish') {
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
  return pb.collection('icebreaker_players').create({
    sessionCode,
    nickname,
    avatar,
    submitted: false,
    joinedAt: new Date().toISOString(),
  }) as Promise<IcebreakerPlayerRecord>;
}

export async function ensureNicknameAvailable(sessionCode: string, nickname: string) {
  const duplicates = await pb.collection('icebreaker_players').getList(1, 1, {
    filter: `sessionCode="${sessionCode}" && nickname="${nickname.replace(/"/g, '\\"')}"`,
  });
  return duplicates.totalItems === 0;
}

export async function submitPlayerResponses(session: PublicSessionView, player: IcebreakerPlayerRecord, answers: string[]) {
  const existing = await pb.collection('icebreaker_responses').getFullList({
    filter: `sessionCode="${session.code}" && playerId="${player.id}"`,
  });
  for (const entry of existing) {
    await pb.collection('icebreaker_responses').delete(entry.id);
  }

  for (const [index, answer] of answers.entries()) {
    await pb.collection('icebreaker_responses').create({
      sessionCode: session.code,
      playerId: player.id,
      playerNickname: player.nickname,
      playerAvatar: player.avatar,
      questionIndex: index + 1,
      questionText: session.questions[index],
      answerText: answer.trim(),
      submittedAt: new Date().toISOString(),
    });
  }

  return pb.collection('icebreaker_players').update(player.id, {
    submitted: true,
    submittedAt: new Date().toISOString(),
  }) as Promise<IcebreakerPlayerRecord>;
}
