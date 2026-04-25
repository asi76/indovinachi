import { useEffect, useState } from 'react';
import { auth, onAuthStateChanged, signInWithGoogle, signOutFromGoogle } from '../lib/firebase';
import { playUiClick, resumeSoundboard } from '../lib/soundboard';
import type { AuthSession } from '../types';

interface AuthGateProps {
  onAuthorized: (session: AuthSession) => void;
}

async function authorizeCurrentUser(): Promise<AuthSession> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sessione Google non disponibile');

  const token = await currentUser.getIdToken();
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

export function AuthGate({ onAuthorized }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestSaving, setRequestSaving] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const session = await authorizeCurrentUser();
      onAuthorized(session);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Accesso non autorizzato');
      setRequestOpen(true);
      setLoading(false);
    }
  }), [onAuthorized]);

  async function handleLogin() {
    resumeSoundboard();
    playUiClick();
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      const session = await authorizeCurrentUser();
      onAuthorized(session);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Accesso non autorizzato');
      setRequestOpen(true);
      setLoading(false);
    }
  }

  async function handleAccessRequest() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setRequestMessage('Accedi con Google prima di inviare la richiesta');
      return;
    }

    setRequestSaving(true);
    setRequestMessage(null);
    try {
      const token = await currentUser.getIdToken(true);
      const response = await fetch('https://theparty.asigo.cc/api/access-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ appSlug: 'indovinachi', requestedRole: 'enabled' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Richiesta non inviata');
      }
      setRequestMessage(payload.message || 'Richiesta inviata');
    } catch (requestError) {
      setRequestMessage(requestError instanceof Error ? requestError.message : 'Richiesta non inviata');
    } finally {
      setRequestSaving(false);
    }
  }

  async function handleLogout() {
    await signOutFromGoogle().catch(() => undefined);
    window.location.reload();
  }

  return (
    <div className="app-shell auth-shell">
      <section className="party-panel auth-panel">
        <span className="eyebrow">HOST PORTAL</span>
        <h1>Indovina Chi</h1>
        <p>
          Il presenter gestisce le domande, apre la lobby QR, raccoglie tutte le risposte e poi
          pilota il reveal party dal telecomando.
        </p>

        <button className="party-button party-button--primary" onClick={handleLogin} disabled={loading}>
          {loading ? 'Controllo accesso...' : 'Accedi con Google'}
        </button>

        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {requestOpen ? (
        <div className="modal-backdrop" onClick={() => setRequestOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h3>Accesso non ancora approvato</h3>
            <p>
              Questo host usa l&apos;autorizzazione centrale di The Party. Se non sei abilitato puoi
              inviare subito una richiesta.
            </p>
            {requestMessage ? <p>{requestMessage}</p> : null}
            <div className="modal-actions">
              <button className="party-button party-button--ghost" onClick={handleLogout}>
                Logout
              </button>
              <button className="party-button party-button--primary" onClick={() => void handleAccessRequest()} disabled={requestSaving}>
                {requestSaving ? 'Invio...' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
