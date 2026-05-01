import { useEffect, useMemo, useRef, useState } from 'react';
import { auth, signOutFromGoogle } from '../lib/firebase';
import { playUiClick, resumeSoundboard } from '../lib/soundboard';
import type { AuthSession, PublicSessionView } from '../types';

interface HostDashboardProps { authSession: AuthSession; }

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
        width: 180, margin: 1, color: { dark: '#0f1a37', light: '#ffffff' },
      }).catch(() => setError(true));
    }).catch(() => setError(true));
  }, [url]);
  if (error) return <span className="error-text">QR non disponibile</span>;
  return <canvas ref={canvasRef} className="qr-canvas" />;
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; variant: string }> = {
    drafting: { label: 'Bozza', variant: 'default' },
    collecting: { label: 'Raccolta', variant: 'active' },
    ready: { label: 'Pronto', variant: 'success' },
    revealing: { label: 'Reveal', variant: 'active' },
    finished: { label: 'Completato', variant: 'default' },
  };
  const cfg = configs[status] || { label: status, variant: 'default' };
  const className = cfg.variant === 'active' ? 'status-pill status-pill--active' : cfg.variant === 'success' ? 'status-pill status-pill--success' : 'status-pill';
  return <span className={className}>{cfg.label}</span>;
}

export function HostDashboard({ authSession }: HostDashboardProps) {
  const [sessions, setSessions] = useState<PublicSessionView[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('Indovina Chi');
  const [themeDraft, setThemeDraft] = useState('Studio party 70s');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.code === selectedCode) || sessions[0] || null,
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
        setSelectedCode((c) => c || nextSessions[0]?.code || null);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Errore caricamento');
      }
    }
    void load();
    const intervalId = window.setInterval(() => { void load(); }, 3500);
    return () => { active = false; window.clearInterval(intervalId); };
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
      const payload = await authorizedFetch('/api/sessions', { method: 'POST', body: JSON.stringify({}) });
      const created = payload.session as PublicSessionView;
      setSessions((current) => [created, ...current]);
      setSelectedCode(created.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Creazione fallita');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Salvataggio fallito');
    } finally {
      setBusy(null);
    }
  }

  async function startCollecting() {
    if (!selectedSession) return;
    setBusy('collect');
    setError(null);
    try {
      const payload = await authorizedFetch(`/api/sessions/${selectedSession.code}/start-collecting`, { method: 'POST' });
      const nextSession = payload.session as PublicSessionView;
      setSessions((current) => current.map((entry) => entry.code === nextSession.code ? nextSession : entry));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore avvio raccolta');
    } finally {
      setBusy(null);
    }
  }

  async function startReveal() {
    if (!selectedSession) return;
    setBusy('reveal');
    setError(null);
    try {
      const payload = await authorizedFetch(`/api/sessions/${selectedSession.code}/start-reveal`, { method: 'POST' });
      const nextSession = payload.session as PublicSessionView;
      setSessions((current) => current.map((entry) => entry.code === nextSession.code ? nextSession : entry));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore avvio reveal');
    } finally {
      setBusy(null);
    }
  }

  async function handleLogout() {
    await signOutFromGoogle().catch(() => undefined);
    window.location.reload();
  }

  const canStartCollect = selectedSession && selectedSession.questions.length > 0;
  const canStartReveal = selectedSession && selectedSession.allAnswered;

  return (
    <div className="app-shell host-shell">
      <div className="host-header">
        <div>
          <span className="eyebrow">Host Dashboard</span>
          <h1>Indovina Chi</h1>
        </div>
        <div className="host-header__actions">
          <span className="status-pill">{authSession.user.name}</span>
          <button className="party-button party-button--ghost" onClick={() => void handleLogout()}>Logout</button>
        </div>
      </div>

      <div className="host-grid">
        <section className="party-panel">
          <div className="panel-row" style={{ marginBottom: '12px' }}>
            <h3>Sessioni</h3>
            <button className="party-button party-button--primary" onClick={() => void createSession()} disabled={busy === 'create'}>
              {busy === 'create' ? '...' : '+ Nuova'}
            </button>
          </div>
          <div className="session-list">
            {sessions.map((session) => (
              <button key={session.code} type="button" className={`session-card${selectedSession?.code === session.code ? ' is-selected' : ''}`} onClick={() => setSelectedCode(session.code)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="session-card__code">{session.code}</span>
                  <StatusBadge status={session.status} />
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  {session.answeredCount}/{session.playerCount} risposte
                </small>
              </button>
            ))}
            {sessions.length === 0 && <p className="muted-text" style={{ textAlign: 'center', padding: '24px' }}>Nessuna sessione attiva</p>}
          </div>
        </section>

        <section className="party-panel party-panel--wide">
          {selectedSession ? (
            <>
              <div className="panel-row">
                <div>
                  <span className="eyebrow">Sessione {selectedSession.code}</span>
                  <h2>{selectedSession.title}</h2>
                </div>
                <div className="metric-strip">
                  <div className="metric-tile">
                    <span className="metric-tile__value">{selectedSession.playerCount}</span>
                    <span className="metric-tile__label">Giocatori</span>
                  </div>
                  <div className="metric-tile">
                    <span className="metric-tile__value">{selectedSession.answeredCount}</span>
                    <span className="metric-tile__label">Risposte</span>
                  </div>
                  <div className="metric-tile">
                    <span className="metric-tile__value">{selectedSession.questions.length}</span>
                    <span className="metric-tile__label">Domande</span>
                  </div>
                </div>
              </div>

              <div className="editor-grid">
                <div className="field-group">
                  <label>Titolo Evento</label>
                  <input className="party-input" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
                </div>
                <div className="field-group">
                  <label>Tema Visuale</label>
                  <input className="party-input" value={themeDraft} onChange={(e) => setThemeDraft(e.target.value)} />
                </div>
                <div className="field-group field-group--full">
                  <label>Domande (una per riga)</label>
                  <textarea className="party-textarea" rows={6} value={questionDraft} onChange={(e) => setQuestionDraft(e.target.value)} placeholder="Qual ?? una tua abitudine segreta?\nQual ?? il talento pi?? inatteso che hai?" />
                </div>
              </div>

              <div className="panel-actions">
                <button className="party-button party-button--primary" onClick={() => void saveConfig()} disabled={busy === 'save'}>
                  {busy === 'save' ? 'Salvo...' : 'Salva'}
                </button>
                <button className="party-button party-button--secondary" onClick={() => void startCollecting()} disabled={busy === 'collect' || !canStartCollect}>
                  {busy === 'collect' ? '...' : 'Apri Raccolta'}
                </button>
                <button className="party-button party-button--secondary" onClick={() => void startReveal()} disabled={busy === 'reveal' || !canStartReveal}>
                  {busy === 'reveal' ? '...' : 'Avvia Reveal'}
                </button>
              </div>

              {selectedSession.status === 'revealing' || selectedSession.status === 'finished' ? (
                <div className="presenter-callout presenter-callout--ready">
                  <h2>Reveal in corso</h2>
                  <p>Il QR partecipanti e nascosto: sul display presenter gira la disco ball con domanda e risposta estratte.</p>
                </div>
              ) : (
                <div className="qr-grid">
                  <article className="qr-card">
                    <h3>Partecipanti</h3>
                    <QrCanvas url={joinUrl(selectedSession)} />
                    <a href={joinUrl(selectedSession)} target="_blank" rel="noreferrer">{joinUrl(selectedSession).replace(/^https?:\/\//, '')}</a>
                  </article>
                  <article className="qr-card">
                    <h3>Display</h3>
                    <QrCanvas url={presenterDisplayUrl(selectedSession)} />
                    <a href={presenterDisplayUrl(selectedSession)} target="_blank" rel="noreferrer">{presenterDisplayUrl(selectedSession).replace(/^https?:\/\//, '')}</a>
                  </article>
                  <article className="qr-card">
                    <h3>Telecomando</h3>
                    <QrCanvas url={remoteUrl(selectedSession)} />
                    <a href={remoteUrl(selectedSession)} target="_blank" rel="noreferrer">{remoteUrl(selectedSession).replace(/^https?:\/\//, '')}</a>
                  </article>
                </div>
              )}

              <div className="player-list">
                {selectedSession.players.map((player) => (
                  <div key={player.id} className="player-pill">
                    <span className="player-pill__avatar">{player.avatar}</span>
                    <span className="player-pill__name">{player.nickname}</span>
                    <span className="player-pill__status">{player.submitted ? '???' : '...'}</span>
                  </div>
                ))}
                {selectedSession.players.length === 0 && <p className="muted-text">In attesa dei primi invitati</p>}
              </div>
            </>
          ) : (
            <div className="centered-panel">
              <h2>Crea la prima sessione</h2>
              <p>Appena crei una lobby compaiono QR, domande e telecomando</p>
            </div>
          )}
        </section>
      </div>
      {error && <p className="error-text error-text--floating">{error}</p>}
    </div>
  );
}
