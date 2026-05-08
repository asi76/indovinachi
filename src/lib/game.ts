import type { PublicSessionView } from '../types';
import { AVATARS } from './avatars';

const PLAYER_TOKEN_KEY = 'indovinachi_player_token';

export function generatePinLikeCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function randomAvatar() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

export function savePlayerToken(token: { playerId: string; sessionCode: string; nickname: string; avatar: string }) {
  try {
    localStorage.setItem(PLAYER_TOKEN_KEY, JSON.stringify(token));
  } catch {
    // ignore
  }
}

export function loadPlayerToken() {
  try {
    const raw = localStorage.getItem(PLAYER_TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPlayerToken() {
  try {
    localStorage.removeItem(PLAYER_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function joinUrl(session: PublicSessionView) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/play/${session.code}`;
}

export function presenterUrl(session: PublicSessionView) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/host/game/${session.code}`;
}

export function remoteUrl(session: PublicSessionView) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/remote/${session.code}?token=${encodeURIComponent(session.remoteToken)}`;
}

export function sessionStatusLabel(status: string) {
  if (status === 'draft') return 'Bozza';
  if (status === 'lobby') return 'Lobby';
  if (status === 'collecting') return 'Raccolta';
  if (status === 'ready') return 'Pronto';
  if (status === 'revealing') return 'Gioco live';
  if (status === 'finished') return 'Terminato';
  return status;
}
