import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { pb } from '../lib/pocketbase';
import { AVATARS, randomAvatar } from '../lib/avatars';
import type { IcebreakerPlayerRecord, PublicSessionView } from '../types';

const TOKEN_KEY = 'indovinachi_player_token';

function loadToken() {
  try {
    const raw = window.localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToken(value: { sessionCode: string; playerId: string }) {
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
}

function parseError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

async function fetchPublicSession(sessionCode: string): Promise<PublicSessionView> {
  const response = await fetch(`/api/sessions/${sessionCode}/public`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Sessione non disponibile');
  return payload.session as PublicSessionView;
}

export function PlayerJoinScreen({ sessionCode }: { sessionCode: string }) {
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [player, setPlayer] = useState<IcebreakerPlayerRecord | null>(null);
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(randomAvatar());
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);
  
  const pageSize = 30;
  const totalPages = Math.ceil(AVATARS.length / pageSize);
  const pageAvatars = useMemo(() => AVATARS.slice(page * pageSize, (page + 1) * pageSize), [page]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const sessionView = await fetchPublicSession(sessionCode);
        if (!active) return;
        setSession(sessionView);
        const token = loadToken();
        if (token?.playerId && token?.sessionCode === sessionCode) {
          const existingPlayer = await pb.collection('icebreaker_players').getOne(token.playerId);
          if (active) setPlayer(existingPlayer as unknown as IcebreakerPlayerRecord);
        }
      } catch (e) {
        if (active) setError(parseError(e, 'Sessione non trovata'));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const intervalId = window.setInterval(() => { void load(); }, 4000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [sessionCode]);

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - (e.changedTouches[0]?.clientX ?? 0);
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    setPage((c) => delta > 0 ? Math.min(totalPages - 1, c + 1) : Math.max(0, c - 1));
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) { setError('Inserisci un nickname'); return; }
    setJoining(true);
    setError(null);
    try {
      const duplicates = await pb.collection('icebreaker_players').getList(1, 1, {
        filter: `sessionCode="${sessionCode}" && nickname="${trimmedNickname.replace(/"/g, '\\"')}"`,
      });
      if (duplicates.totalItems > 0) throw new Error('Nickname gi?? usato');
      const created = await pb.collection('icebreaker_players').create({
        sessionCode, nickname: trimmedNickname, avatar, submitted: false,
        joinedAt: new Date().toISOString(),
      });
      const normalized = created as unknown as IcebreakerPlayerRecord;
      setPlayer(normalized);
      saveToken({ sessionCode, playerId: normalized.id });
    } catch (e) {
      setError(parseError(e, 'Ingresso fallito'));
    } finally {
      setJoining(false);
    }
  }

  async function handleSubmitAnswers(e: FormEvent) {
    e.preventDefault();
    if (!session || !player) return;
    const normalizedAnswers = session.questions.map((q, index) => ({
      questionIndex: index, questionText: q, answerText: (answers[index] || '').trim(),
    }));
    if (normalizedAnswers.some((entry) => entry.answerText.length === 0)) {
      setError('Compila tutte le risposte'); return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const existing = await pb.collection('icebreaker_responses').getFullList({
        filter: `sessionCode="${sessionCode}" && playerId="${player.id}"`,
      });
      for (const entry of existing) await pb.collection('icebreaker_responses').delete(entry.id);
      for (const entry of normalizedAnswers) {
        await pb.collection('icebreaker_responses').create({
          sessionCode, playerId: player.id, playerNickname: player.nickname, playerAvatar: player.avatar,
          questionIndex: entry.questionIndex, questionText: entry.questionText, answerText: entry.answerText,
          submittedAt: new Date().toISOString(),
        });
      }
      const updated = await pb.collection('icebreaker_players').update(player.id, { submitted: true, submittedAt: new Date().toISOString() });
      setPlayer(updated as unknown as IcebreakerPlayerRecord);
    } catch (e) {
      setError(parseError(e, 'Invio risposte fallito'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="app-shell player-shell">
      <section className="party-panel centered-panel">
        <h1>Indovina Chi</h1>
        <p>Sto cercando la tua sessione...</p>
      </section>
    </div>
  );

  if (!session) return (
    <div className="app-shell player-shell">
      <section className="party-panel centered-panel">
        <h1>Sessione non disponibile</h1>
        <p>{error || 'Il codice non esiste o la sessione ?? terminata'}</p>
      </section>
    </div>
  );

  if (!player) return (
    <div className="app-shell player-shell">
      <section className="party-panel party-panel--wide" style={{ maxWidth: '600px' }}>
        <div className="quizzone-topbar">
          <span className="eyebrow">Sessione {session.code}</span>
          <h1>Entra nella festa</h1>
        </div>
        
        <div className="avatar-picker-wrap">
          <button type="button" className="avatar-nav" onClick={() => setPage((c) => Math.max(0, c - 1))} disabled={page === 0}>???</button>
          <div className="avatar-grid" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {pageAvatars.map((item) => (
              <button key={item} type="button" className={`avatar-tile${item === avatar ? ' is-selected' : ''}`} onClick={() => setAvatar(item)}>{item}</button>
            ))}
          </div>
          <button type="button" className="avatar-nav" onClick={() => setPage((c) => Math.min(totalPages - 1, c + 1))} disabled={page === totalPages - 1}>???</button>
        </div>
        
        <div className="avatar-pagination">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button key={i} type="button" className={`avatar-dot${i === page ? ' is-active' : ''}`} onClick={() => setPage(i)} />
          ))}
        </div>
        
        <form className="join-form" onSubmit={handleJoin}>
          <div className="selected-avatar">{avatar}</div>
          <input className="party-input" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={28} placeholder="Il tuo nickname" />
          <button className="party-button party-button--primary" type="submit" disabled={joining}>{joining ? 'Entro...' : 'Entra'}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </section>
    </div>
  );

  if (player.submitted) return (
    <div className="app-shell player-shell">
      <section className="party-panel centered-panel">
        <div className="selected-avatar selected-avatar--large">{player.avatar}</div>
        <h1>{player.nickname}</h1>
        <p>Risposte inviate. Rimani connesso per il reveal!</p>
        <span className="status-pill status-pill--success">Sessione {session.code}</span>
      </section>
    </div>
  );

  return (
    <div className="app-shell player-shell">
      <section className="party-panel party-panel--wide" style={{ maxWidth: '700px' }}>
        <div className="player-identity">
          <div className="selected-avatar">{player.avatar}</div>
          <div>
            <span className="eyebrow">Ciao {player.nickname.toUpperCase()}</span>
            <h1>Racconta qualcosa di inaspettato</h1>
          </div>
        </div>
        
        <form className="answers-form" onSubmit={handleSubmitAnswers}>
          {session.questions.map((q, index) => (
            <label key={`${session.code}-${index}`} className="answer-card">
              <span className="answer-card__index">Domanda {index + 1}</span>
              <strong style={{ display: 'block', marginBottom: '8px', fontSize: '1rem' }}>{q}</strong>
              <textarea value={answers[index] || ''} onChange={(e) => setAnswers((c) => ({ ...c, [index]: e.target.value }))} rows={3} placeholder="Scrivi una risposta sincera o sorprendente" />
            </label>
          ))}
          {error && <p className="error-text">{error}</p>}
          <button className="party-button party-button--primary" type="submit" disabled={submitting}>{submitting ? 'Invio...' : 'Invia risposte'}</button>
        </form>
      </section>
    </div>
  );
}
