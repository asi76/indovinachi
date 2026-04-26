import { useEffect, useState } from 'react';
import { auth, onAuthStateChanged, signInWithGoogle, signOutFromGoogle } from '../lib/firebase';
import { playUiClick, resumeSoundboard } from '../lib/soundboard';
import type { AuthSession } from '../types';

interface AuthGateProps { onAuthorized: (session: AuthSession) => void; }

async function authorizeCurrentUser(): Promise<AuthSession> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sessione Google non disponibile');
  const token = await currentUser.getIdToken();
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Accesso non autorizzato');
  return payload as AuthSession;
}

export function AuthGate({ onAuthorized }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestSaving, setRequestSaving] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) { setLoading(false); return; }
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
    if (!currentUser) { setRequestMessage('Accedi con Google prima di inviare la richiesta'); return; }
    setRequestSaving(true);
    setRequestMessage(null);
    try {
      const token = await currentUser.getIdToken(true);
      const response = await fetch('https://theparty.asigo.cc/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ appSlug: 'indovinachi', requestedRole: 'enabled' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Richiesta non inviata');
      setRequestMessage(payload.message || 'Richiesta inviata');
    } catch (requestError) {
      setRequestMessage(requestError instanceof Error ? requestError.message : 'Richiesta non inviata');
    } finally { setRequestSaving(false); }
  }

  async function handleLogout() {
    await signOutFromGoogle().catch(() => undefined);
    window.location.reload();
  }

  return (
    <div className="auth-shell">
      <div className="party-panel centered-panel auth-panel">
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎭</div>
          <span className="eyebrow">Host Portal</span>
          <h1>Indovina Chi</h1>
          <p style={{ marginTop: '12px' }}>Gestisci sessioni, raccogli risposte e pilota il reveal party</p>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', margin: '24px 0', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '1.2rem' }}>📱</span>
            <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>Lobby QR</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '1.2rem' }}>📝</span>
            <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>Raccolta risposte</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: '1.2rem' }}>🎪</span>
            <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.7)' }}>Reveal party</span>
          </div>
        </div>

        <button className="party-button party-button--primary" onClick={handleLogin} disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Controllo accesso...' : (
            <>
              <svg viewBox="0 0 24 24" width="20" height="20" style={{ marginRight: '8px' }}>
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Accedi con Google
            </>
          )}
        </button>
        {error && <p style={{ color: '#ff6b6b', fontSize: '0.875rem', marginTop: '12px' }}>{error}</p>}
      </div>

      {requestOpen && (
        <div className="modal-backdrop" onClick={() => setRequestOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '1.5rem' }}>🔐</span>
              <h3>Accesso non ancora approvato</h3>
            </div>
            <p>Questo host usa l'autorizzazione centrale di The Party.</p>
            {requestMessage && <p style={{ color: '#00d4ff', fontSize: '0.875rem' }}>{requestMessage}</p>}
            <div className="modal-actions">
              <button className="party-button party-button--ghost" onClick={handleLogout}>Logout</button>
              <button className="party-button party-button--primary" onClick={() => void handleAccessRequest()} disabled={requestSaving}>
                {requestSaving ? 'Invio...' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
