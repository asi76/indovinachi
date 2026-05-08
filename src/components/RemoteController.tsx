import { useEffect, useState } from 'react';
import type { PublicSessionView } from '../types';

async function fetchRemoteSession(sessionCode: string, token: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${sessionCode}/remote?token=${encodeURIComponent(token)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Telecomando non autorizzato');
  return payload.session as PublicSessionView;
}

type RemoteAction = 'open-collect' | 'start-session' | 'question' | 'answer' | 'finish';

function remoteActionPath(sessionCode: string, action: RemoteAction) {
  if (action === 'open-collect') return `/api/sessions/${sessionCode}/collect/open`;
  if (action === 'start-session') return `/api/sessions/${sessionCode}/collect/close`;
  return `/api/sessions/${sessionCode}/reveal/${action}`;
}

async function postRemoteAction(sessionCode: string, token: string, action: RemoteAction) {
  const response = await fetch(remoteActionPath(sessionCode, action), {
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

  async function handleAction(action: RemoteAction) {
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

  const canOpenCollect = ['draft', 'lobby', 'ready', 'finished'].includes(session.status);
  const canStartSession = (session.status === 'collecting' || session.status === 'ready') && session.answeredCount > 0;
  const canRevealQuestion = session.status === 'revealing' || session.answeredCount > 0;
  const canRevealAnswer = session.status === 'revealing' && Boolean(session.currentQuestionText);
  const canFinishReveal = session.status === 'revealing' || session.status === 'finished';

  return (
    <div className="app-shell remote-shell remote-shell--quizzone">
      <section className="party-panel remote-panel remote-panel--quizzone">
        <span className="eyebrow">Telecomando</span>
        <h1>{session.code}</h1>
        <p>Prima apri la raccolta. Quando vuoi partire davvero, premi Inizia sessione e il presenter mostra subito la prima domanda con una risposta casuale.</p>

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

        <button className="party-button party-button--secondary remote-button" onClick={() => void handleAction('open-collect')} disabled={busy !== null || !canOpenCollect}>
          {busy === 'open-collect' ? 'Apro...' : 'Apri raccolta'}
        </button>
        <button className="party-button party-button--primary remote-button" onClick={() => void handleAction('start-session')} disabled={busy !== null || !canStartSession}>
          {busy === 'start-session' ? 'Parto...' : 'Inizia sessione'}
        </button>
        <button className="party-button party-button--primary remote-button" onClick={() => void handleAction('question')} disabled={busy !== null || !canRevealQuestion}>
          {busy === 'question' ? 'Estrazione...' : 'Prossima domanda'}
        </button>
        <button className="party-button party-button--ghost remote-button" onClick={() => void handleAction('answer')} disabled={busy !== null || !canRevealAnswer}>
          {busy === 'answer' ? 'Rivelo...' : 'Mostra risposta casuale'}
        </button>
        <button className="party-button party-button--ghost remote-button" onClick={() => void handleAction('finish')} disabled={busy !== null || !canFinishReveal}>
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
