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

  const waitingForEveryone = session.status === 'collecting' && !session.allAnswered;
  const readyForReveal = (session.status === 'collecting' || session.status === 'ready') && session.allAnswered;
  const revealRunning = session.status === 'revealing';
  const showJoinQr = !revealRunning && session.status !== 'finished';
  const showReveal = revealRunning || session.status === 'finished';

  return (
    <div className="app-shell presenter-shell">
      <div className="presenter-stage">
        <div className="ambient-orb ambient-orb--left" />
        <div className="ambient-orb ambient-orb--right" />

        <section className={`presenter-hero${showReveal ? ' presenter-hero--compact' : ''}`}>
          <span className="eyebrow">SESSIONE {session.code}</span>
          <h1>{showReveal ? 'Indovina chi?' : session.title}</h1>
          {!showReveal ? <p>{session.theme}</p> : null}
          <div className="metric-strip">
            <div className="metric-tile">
              <strong>{session.playerCount}</strong>
              <span>presenti</span>
            </div>
            <div className="metric-tile">
              <strong>{session.answeredCount}</strong>
              <span>hanno risposto</span>
            </div>
            <div className="metric-tile">
              <strong>{session.questions.length}</strong>
              <span>domande in coda</span>
            </div>
          </div>
        </section>

        <section className={`party-panel presenter-panel${showReveal ? ' presenter-panel--reveal' : ''}`}>
          {showJoinQr ? (
            <div className="presenter-join-screen">
              <div className="presenter-qr-frame">
                <PresenterQr url={joinUrl(session)} />
              </div>
              <div className="presenter-join-copy">
                <span className="eyebrow">PARTECIPA ORA</span>
                <h2>Scansiona il QR</h2>
                <p>{joinUrl(session).replace(/^https?:\/\//, '')}</p>
                {waitingForEveryone ? <strong>{session.answeredCount}/{session.playerCount} hanno inviato le risposte</strong> : null}
                {readyForReveal ? <strong>Tutti hanno risposto: puoi avviare il reveal.</strong> : null}
                {!waitingForEveryone && !readyForReveal ? <strong>In attesa che l'host apra la raccolta.</strong> : null}
              </div>
            </div>
          ) : null}

          {showReveal ? (
            <div className="reveal-stack">
              <div className="disco-ball disco-ball--giant is-fast is-revealing">
                <div className="disco-ball__core" />
              </div>
              <article className="reveal-card reveal-card--question">
                <span className="eyebrow">DOMANDA ESTRATTA</span>
                <h2>{session.currentQuestionText || 'Pronta per la prossima estrazione'}</h2>
              </article>
              <article className={`reveal-card reveal-card--answer${session.currentAnswerText ? ' is-visible' : ''}`}>
                <span className="eyebrow">RISPOSTA CASUALE</span>
                <p>{session.currentAnswerText || 'Il presenter puo ora far apparire una risposta.'}</p>
              </article>
              <h2 className="reveal-title">Indovina chi?</h2>
            </div>
          ) : null}

          {session.status === 'finished' ? (
            <div className="presenter-callout presenter-callout--finish">
              <h2>Reveal completato</h2>
              <p>Tutte le domande e tutte le risposte sono state attraversate.</p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
