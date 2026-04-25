import { useEffect, useMemo, useRef, useState } from 'react';
import { auth, signOutFromGoogle } from '../lib/firebase';
import { playUiClick, resumeSoundboard } from '../lib/soundboard';
import type { AuthSession, PublicSessionView } from '../types';

interface HostDashboardProps {
  authSession: AuthSession;
}

function parseLines(value: string) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function joinUrl(session: PublicSessionView) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/?join=${session.code}`;
}

function remoteUrl(session: PublicSessionView) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/?presenter=${session.code}&token=${session.remoteToken}`;
}

function presenterDisplayUrl(session: PublicSessionView) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin;
  return `${base}/presenter?code=${session.code}`;
}

async function authorizedFetch(path: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sessione Google non disponibile');

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Operazione fallita');
  return payload;
}

function QrCanvas({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    setError(false);
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(canvasRef.current!, url, {
        width: 220,
        margin: 1,
        color: { dark: '#0f1a37', light: '#ffffff' },
      }).catch(() => setError(true));
    }).catch(() => setError(true));
  }, [url]);

  if (error) return <span className="error-text">QR non disponibile</span>;
  return <canvas ref={canvasRef} className="qr-canvas" />;
}

export function HostDashboard({ authSession }: HostDashboardProps) {
  const [sessions, setSessions] = useState<PublicSessionView[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('Indovina Chi');
  const [themeDraft, setThemeDraft] = useState('Studio party 70s, dinamico, luminoso, pieno di ritmo');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.code === selectedCode) || sessions[0] || null,
    [selectedCode, sessions],
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const payload = await authorizedFetch('/api/host/sessions');
        if (!active) return;
        const nextSessions = payload.sessions as PublicSessionView[];
        setSessions(nextSessions);
        setSelectedCode((current) => current || nextSessions[0]?.code || null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Impossibile caricare le sessioni');
      }
    }

    void load();
    const intervalId = window.setInterval(() => { void load(); }, 3500);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!selectedSession) return;
    setQuestionDraft(selectedSession.questions.join('\n'));
    setTitleDraft(selectedSession.title);
    setThemeDraft(selectedSession.theme);
  }, [selectedSession?.code]);

  async function createSession() {
    setBusy('create');
    setError(null);
    try {
      resumeSoundboard();
      playUiClick();
      const payload = await authorizedFetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const created = payload.session as PublicSessionView;
      setSessions((current) => [created, ...current]);
      setSelectedCode(created.code);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Creazione sessione fallita');
    } finally {
      setBusy(null);
    }
  }

  async function saveConfig() {
    if (!selectedSession) return;
    setBusy('save');
    setError(null);
    try {
      const payload = await authorizedFetch(`/api/sessions/${selectedSession.code}/config`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: titleDraft.trim(),
          theme: themeDraft.trim(),
          questions: parseLines(questionDraft),
        }),
      });
      const nextSession = payload.session as PublicSessionView;
      setSessions((current) => current.map((entry) => entry.code === nextSession.code ? nextSession : entry));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Salvataggio fallito');
    } finally {
      setBusy(null);
    }
  }

  async function startCollecting() {
    if (!selectedSession) return;
    setBusy('collect');
    setError(null);
    try {
      const payload = await authorizedFetch(`/api/sessions/${selectedSession.code}/start-collecting`, {
        method: 'POST',
      });
      const nextSession = payload.session as PublicSessionView;
      setSessions((current) => current.map((entry) => entry.code === nextSession.code ? nextSession : entry));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Impossibile avviare la raccolta');
    } finally {
      setBusy(null);
    }
  }

  async function startReveal() {
    if (!selectedSession) return;
    setBusy('reveal');
    setError(null);
    try {
      const payload = await authorizedFetch(`/api/sessions/${selectedSession.code}/start-reveal`, {
        method: 'POST',
      });
      const nextSession = payload.session as PublicSessionView;
      setSessions((current) => current.map((entry) => entry.code === nextSession.code ? nextSession : entry));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Impossibile avviare il reveal');
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    await signOutFromGoogle().catch(() => undefined);
    window.location.reload();
  }

  return (
    <div className="app-shell host-shell">
      <div className="host-header">
        <div>
          <span className="eyebrow">HOST DASHBOARD</span>
          <h1>Indovina Chi</h1>
          <p>Lobby QR, domande condivise, salvataggio risposte su PocketBase e reveal guidato dal telecomando.</p>
        </div>
        <div className="host-header__actions">
          <span className="status-pill">{authSession.user.name}</span>
          <button className="party-button party-button--ghost" onClick={() => void handleLogout()}>
            Logout
          </button>
        </div>
      </div>

      <div className="host-grid">
        <section className="party-panel">
          <div className="panel-row">
            <h2>Sessioni</h2>
            <button className="party-button party-button--primary" onClick={() => void createSession()} disabled={busy === 'create'}>
              {busy === 'create' ? 'Creo...' : 'Nuova sessione'}
            </button>
          </div>

          <div className="session-list">
            {sessions.map((session) => (
              <button
                key={session.code}
                type="button"
                className={`session-card${selectedSession?.code === session.code ? ' is-selected' : ''}`}
                onClick={() => setSelectedCode(session.code)}
              >
                <div>
                  <strong>{session.code}</strong>
                  <span>{session.status}</span>
                </div>
                <small>{session.answeredCount}/{session.playerCount} risposte</small>
              </button>
            ))}
            {sessions.length === 0 ? <p className="muted-text">Nessuna sessione attiva.</p> : null}
          </div>
        </section>

        <section className="party-panel party-panel--wide">
          {selectedSession ? (
            <>
              <div className="panel-row">
                <div>
                  <span className="eyebrow">SESSIONE {selectedSession.code}</span>
                  <h2>{selectedSession.title}</h2>
                </div>
                <div className="metric-strip">
                  <div className="metric-tile">
                    <strong>{selectedSession.playerCount}</strong>
                    <span>giocatori</span>
                  </div>
                  <div className="metric-tile">
                    <strong>{selectedSession.answeredCount}</strong>
                    <span>risposte inviate</span>
                  </div>
                  <div className="metric-tile">
                    <strong>{selectedSession.questions.length}</strong>
                    <span>domande</span>
                  </div>
                </div>
              </div>

              <div className="editor-grid">
                <label className="field-group">
                  <span>Titolo evento</span>
                  <input className="party-input" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
                </label>
                <label className="field-group">
                  <span>Direzione estetica</span>
                  <input className="party-input" value={themeDraft} onChange={(event) => setThemeDraft(event.target.value)} />
                </label>
                <label className="field-group field-group--full">
                  <span>Domande del presenter, una per riga</span>
                  <textarea
                    className="party-textarea"
                    rows={8}
                    value={questionDraft}
                    onChange={(event) => setQuestionDraft(event.target.value)}
                    placeholder={'Qual e una tua abitudine segreta?\nQual e il talento piu inatteso che hai?'}
                  />
                </label>
              </div>

              <div className="panel-actions">
                <button className="party-button party-button--primary" onClick={() => void saveConfig()} disabled={busy === 'save'}>
                  {busy === 'save' ? 'Salvo...' : 'Salva configurazione'}
                </button>
                <button className="party-button party-button--ghost" onClick={() => void startCollecting()} disabled={busy === 'collect' || selectedSession.questions.length === 0}>
                  {busy === 'collect' ? 'Aggiorno...' : 'Apri raccolta risposte'}
                </button>
                <button className="party-button party-button--ghost" onClick={() => void startReveal()} disabled={busy === 'reveal' || !selectedSession.allAnswered}>
                  {busy === 'reveal' ? 'Avvio...' : 'Avvia reveal'}
                </button>
              </div>

              <div className="qr-grid">
                <article className="qr-card">
                  <h3>QR partecipanti</h3>
                  <QrCanvas url={joinUrl(selectedSession)} />
                  <a href={joinUrl(selectedSession)} target="_blank" rel="noreferrer">{joinUrl(selectedSession)}</a>
                </article>
                <article className="qr-card">
                  <h3>Display presenter</h3>
                  <QrCanvas url={presenterDisplayUrl(selectedSession)} />
                  <a href={presenterDisplayUrl(selectedSession)} target="_blank" rel="noreferrer">{presenterDisplayUrl(selectedSession)}</a>
                </article>
                <article className="qr-card">
                  <h3>Telecomando presenter</h3>
                  <QrCanvas url={remoteUrl(selectedSession)} />
                  <a href={remoteUrl(selectedSession)} target="_blank" rel="noreferrer">{remoteUrl(selectedSession)}</a>
                </article>
              </div>

              <div className="player-list">
                {selectedSession.players.map((player) => (
                  <div key={player.id} className="player-pill">
                    <span>{player.avatar}</span>
                    <strong>{player.nickname}</strong>
                    <small>{player.submitted ? 'ha inviato' : 'sta scrivendo'}</small>
                  </div>
                ))}
                {selectedSession.players.length === 0 ? <p className="muted-text">In attesa dei primi invitati.</p> : null}
              </div>
            </>
          ) : (
            <div className="centered-panel">
              <h2>Crea la prima sessione</h2>
              <p>Appena crei una lobby compaiono QR, domande, telecomando e presenter.</p>
            </div>
          )}
        </section>
      </div>

      {error ? <p className="error-text error-text--floating">{error}</p> : null}
    </div>
  );
}
