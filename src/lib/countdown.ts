import type { PublicSessionView } from '../types';

export const GUESS_COUNTDOWN_SECONDS = 10;

export function attachClientTiming(session: PublicSessionView): PublicSessionView {
  return { ...session, clientReceivedAt: Date.now() };
}

export function guessCountdownRemaining(session: PublicSessionView, localNow: number) {
  if (session.revealPhase !== 'answer') return 0;

  const startedAt = Date.parse(session.currentAnswerStartedAt || session.updated || '');
  const serverNowAtReceive = Date.parse(session.serverNow || '');
  if (!startedAt || !serverNowAtReceive) return 0;

  const receivedAt = session.clientReceivedAt || localNow;
  const estimatedServerNow = serverNowAtReceive + Math.max(0, localNow - receivedAt);
  const remainingMs = startedAt + GUESS_COUNTDOWN_SECONDS * 1000 - estimatedServerNow;

  return Math.max(0, Math.ceil(remainingMs / 1000));
}
