import { useEffect, useState } from 'react';
import type { PublicSessionView } from '../types';

async function fetchPublicSession(sessionCode: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${sessionCode}/public`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Sessione non disponibile');
  return payload.session as PublicSessionView;
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

  return (
    <div className="app-shell presenter-shell">
      <div className="presenter-stage">
        <div className="ambient-orb ambient-orb--left" />
        <div className="ambient-orb ambient-orb--right" />

        <section className="presenter-hero">
          <span className="eyebrow">SESSIONE {session.code}</span>
          <h1>{session.title}</h1>
          <p>{session.theme}</p>
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

        <section className="party-panel presenter-panel">
          <div className={`disco-ball${readyForReveal || revealRunning ? ' is-fast' : ''}${revealRunning ? ' is-revealing' : ''}`}>
            <div className="disco-ball__core" />
          </div>

          {waitingForEveryone ? (
            <div className="presenter-callout">
              <h2>Lobby aperta, risposte in arrivo</h2>
              <p>Tutti stanno rispondendo alle stesse domande dal proprio telefono.</p>
            </div>
          ) : null}

          {readyForReveal ? (
            <div className="presenter-callout presenter-callout--ready">
              <h2>Tutti hanno risposto</h2>
              <p>Il telecomando del presenter puo far partire la prossima domanda casuale.</p>
            </div>
          ) : null}

          {revealRunning || session.status === 'finished' ? (
            <div className="reveal-stack">
              <article className="reveal-card reveal-card--question">
                <span className="eyebrow">DOMANDA ESTRATTA</span>
                <h2>{session.currentQuestionText || 'Pronta per la prossima estrazione'}</h2>
              </article>
              <article className={`reveal-card reveal-card--answer${session.currentAnswerText ? ' is-visible' : ''}`}>
                <span className="eyebrow">RISPOSTA CASUALE</span>
                <p>{session.currentAnswerText || 'Il presenter puo ora far apparire una risposta.'}</p>
              </article>
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
