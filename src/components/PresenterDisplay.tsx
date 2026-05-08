import { useEffect, useRef, useState } from 'react';
import type { PublicSessionView } from '../types';

async function fetchPublicSession(sessionCode: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${sessionCode}/public`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Sessione non disponibile');
  return payload.session as PublicSessionView;
}

function joinUrl(session: PublicSessionView) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/?join=${session.code}`;
}

function PresenterQr({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    setError(false);
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, url, {
        width: 340,
        margin: 1,
        color: { dark: '#1f1147', light: '#ffffff' },
      }).catch(() => setError(true));
    }).catch(() => setError(true));
  }, [url]);

  if (error) return <p className="error-text">QR non disponibile</p>;
  return <canvas ref={canvasRef} className="presenter-qr-canvas" />;
}

export function PresenterDisplay({ sessionCode }: { sessionCode: string }) {
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const nextSession = await fetchPublicSession(sessionCode);
        if (!active) return;
        setSession(nextSession);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Sessione non disponibile');
      }
    }

    void load();
    const intervalId = window.setInterval(() => { void load(); }, 2000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [sessionCode]);

  if (!session) {
    return (
      <div className="app-shell presenter-shell">
        <section className="party-panel centered-panel">
          <h1>Indovina Chi</h1>
          <p>{error || 'Caricamento presenter...'}</p>
        </section>
      </div>
    );
  }

  const waitingForLobby = session.status === 'draft' || session.status === 'lobby';
  const collectingAnswers = session.status === 'collecting';
  const readyForReveal = (session.status === 'collecting' || session.status === 'ready') && session.answeredCount > 0;
  const revealRunning = session.status === 'revealing';
  const showJoinQr = !revealRunning && session.status !== 'finished';
  const showReveal = revealRunning || session.status === 'finished';

  return (
    <div className="app-shell presenter-shell presenter-shell--quizzone">
      <div className="presenter-stage presenter-stage--quizzone">
        <header className={`presenter-hero presenter-hero--quiz${showReveal ? ' presenter-hero--compact' : ''}`}>
          <div className="presenter-hero__brand">
            <span className="eyebrow">Sessione {session.code}</span>
            <h1>{showReveal ? 'Indovina Chi' : session.title}</h1>
            {!showReveal ? <p>{session.theme}</p> : null}
          </div>
          <div className="presenter-scoreboard">
            <div className="presenter-scoreboard__tile">
              <strong>{session.playerCount}</strong>
              <span>Presenti</span>
            </div>
            <div className="presenter-scoreboard__tile">
              <strong>{session.answeredCount}</strong>
              <span>Risposte</span>
            </div>
            <div className="presenter-scoreboard__tile">
              <strong>{session.questions.length}</strong>
              <span>Domande</span>
            </div>
          </div>
        </header>

        <section className={`party-panel presenter-panel presenter-panel--quizzone${showReveal ? ' presenter-panel--reveal' : ''}`}>
          {showJoinQr ? (
            <div className="presenter-waiting-board">
              <div className="presenter-waiting-board__qr">
                <div className="presenter-qr-frame presenter-qr-frame--quizzone">
                  <PresenterQr url={joinUrl(session)} />
                </div>
                <div className="presenter-join-url">{joinUrl(session).replace(/^https?:\/\//, '')}</div>
              </div>

              <div className="presenter-waiting-board__copy">
                <span className="eyebrow">Partecipa ora</span>
                <h2>Scansiona il QR e rispondi dal telefono</h2>
                {waitingForLobby ? <strong>La lobby e aperta. I giocatori possono entrare e aspettare l'apertura della raccolta.</strong> : null}
                {collectingAnswers ? <strong>La raccolta e aperta: ogni giocatore compila le sue risposte dal proprio device.</strong> : null}
                {readyForReveal ? <strong>{session.answeredCount}/{session.playerCount} hanno risposto. Il telecomando puo premere Inizia sessione.</strong> : null}

                <div className="presenter-waiting-cards">
                  <article className="presenter-info-card">
                    <span>Stato</span>
                    <strong>{session.status === 'ready' ? 'Pronto al via' : session.status === 'collecting' ? 'Raccolta attiva' : 'Lobby'}</strong>
                  </article>
                  <article className="presenter-info-card">
                    <span>Obiettivo</span>
                    <strong>Scoprire chi ha scritto cosa</strong>
                  </article>
                </div>
              </div>
            </div>
          ) : null}

          {showReveal ? (
            <div className="reveal-stack reveal-stack--quizzone">
              <div className="reveal-stage-badge">ROUND LIVE</div>
              <article className="reveal-card reveal-card--question reveal-card--quizzone">
                <span className="eyebrow">Prima domanda</span>
                <h2>{session.currentQuestionText || 'Pronta per la prossima estrazione'}</h2>
              </article>
              <article className={`reveal-card reveal-card--answer reveal-card--quizzone${session.currentAnswerText ? ' is-visible' : ''}`}>
                <span className="eyebrow">Risposta casuale</span>
                <p>{session.currentAnswerText || 'Il telecomando puo mostrare la prima risposta.'}</p>
              </article>
              <div className="reveal-title">Chi l'ha scritto?</div>
            </div>
          ) : null}

          {session.status === 'finished' ? (
            <div className="presenter-callout presenter-callout--finish">
              <h2>Reveal completato</h2>
              <p>Tutte le domande e le risposte della manche sono state mostrate.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
