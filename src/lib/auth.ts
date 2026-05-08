import type { User } from 'firebase/auth';
import type { AuthSession } from '../types';
import { auth } from './firebase';

const PARTY_API_URL = import.meta.env.VITE_PARTY_API_URL || 'https://theparty.asigo.cc';
const APP_SLUG = 'indovinachi';

export async function authorizeIndovinachiHost(user: User | null = auth.currentUser): Promise<AuthSession> {
  if (!user) {
    throw new Error('Sessione Google non disponibile');
  }

  const token = await user.getIdToken();
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Accesso non autorizzato');
  }
  return payload as AuthSession;
}

export async function requestIndovinachiAccess(user: User | null = auth.currentUser, requestedRole = 'enabled') {
  if (!user) {
    throw new Error('Accedi con Google prima di inviare la richiesta');
  }

  const token = await user.getIdToken(true);
  const response = await fetch(`${PARTY_API_URL}/api/access-request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ appSlug: APP_SLUG, requestedRole }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Impossibile inviare la richiesta');
  }
  return payload;
}
