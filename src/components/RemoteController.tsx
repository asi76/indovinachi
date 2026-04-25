import { useEffect, useState } from 'react';
import type { PublicSessionView } from '../types';

async function fetchRemoteSession(sessionCode: string, token: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${sessionCode}/remote?token=${encodeURIComponent(token)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Telecomando non autorizzato');
  return payload.session as PublicSessionView;
}

async function postRemoteAction(sessionCode: string, token: string, action: 'question' | 'answer' | 'finish') {
  const response = await fetch(`/api/sessions/${sessionCode}/reveal/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Azione non completata');
  return payload.session as PublicSessionView;
}

export function RemoteController({ sessionCode, token }: { sessionCode: string; token: string }) {
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) {
        setError('Token telecomando mancante');
        return;
      }
      try {
        const nextSession = await fetchRemoteSession(sessionCode, token);
        if (!active) return;
        setSession(nextSession);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Telecomando non disponibile');
      }
    }

    void load();
    const intervalId = window.setInterval(() => { void load(); }, 1800);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [sessionCode, token]);

  async function handleAction(action: 'question' | 'answer' | 'finish') {
    setBusy(action);
    setError(null);
    try {
      const nextSession = await postRemoteAction(sessionCode, token, action);
      setSession(nextSession);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Azione non riuscita');
    } finally {
      setBusy(null);
    }
  }

  if (!session) {
    return (
      <div className="app-shell remote-shell">
        <section className="party-panel centered-panel">
          <h1>Telecomando presenter</h1>
          <p>{error || 'Connessione alla sessione...'}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell remote-shell">
      <section className="party-panel remote-panel">
        <span className="eyebrow">TELECOMANDO</span>
        <h1>{session.code}</h1>
        <p>Guida l’estrazione della prossima domanda e fai apparire una risposta casuale alla volta.</p>

        <div className="metric-strip metric-strip--single">
          <div className="metric-tile">
            <strong>{session.playerCount}</strong>
            <span>giocatori</span>
          </div>
          <div className="metric-tile">
            <strong>{session.answeredCount}</strong>
            <span>hanno risposto</span>
          </div>
        </div>

        <button className="party-button party-button--primary remote-button" onClick={() => void handleAction('question')} disabled={busy !== null}>
          {busy === 'question' ? 'Estrazione...' : 'Prossima domanda'}
        </button>
        <button className="party-button party-button--ghost remote-button" onClick={() => void handleAction('answer')} disabled={busy !== null}>
          {busy === 'answer' ? 'Rivelo...' : 'Mostra risposta casuale'}
        </button>
        <button className="party-button party-button--ghost remote-button" onClick={() => void handleAction('finish')} disabled={busy !== null}>
          {busy === 'finish' ? 'Chiudo...' : 'Chiudi reveal'}
        </button>

        <div className="remote-preview">
          <strong>{session.currentQuestionText || 'In attesa della prossima domanda'}</strong>
          <p>{session.currentAnswerText || 'Nessuna risposta ancora mostrata'}</p>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </section>
    </div>
  );
}
