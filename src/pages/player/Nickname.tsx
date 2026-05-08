import type { FormEvent, TouchEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { AVATARS } from '../../lib/avatars';
import { loadPlayerToken, randomAvatar, savePlayerToken } from '../../lib/game';
import { ensureNicknameAvailable, fetchPublicSession, joinPlayer } from '../../lib/sessionApi';

export default function Nickname() {
  const { code } = useParams();
  const nav = useNavigate();
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(randomAvatar());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const touchStartX = useRef<number | null>(null);

  const pageSize = 25;
  const totalPages = Math.ceil(AVATARS.length / pageSize);
  const pageAvatars = useMemo(() => AVATARS.slice(page * pageSize, (page + 1) * pageSize), [page]);

  useEffect(() => {
    if (!code) {
      nav('/play', { replace: true });
      return;
    }

    const token = loadPlayerToken();
    if (token?.playerId && token?.sessionCode === code.toUpperCase()) {
      nav(`/play/${code.toUpperCase()}/game/${token.playerId}`, { replace: true });
      return;
    }

    fetchPublicSession(code.toUpperCase()).catch(() => nav('/play', { replace: true }));
  }, [code, nav]);

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - (event.changedTouches[0]?.clientX ?? 0);
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta > 0) setPage((current) => Math.min(totalPages - 1, current + 1));
    else setPage((current) => Math.max(0, current - 1));
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    if (!code) return;
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('Inserisci un nickname');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const available = await ensureNicknameAvailable(code.toUpperCase(), trimmed);
      if (!available) {
        setError('Nickname gia usato');
        setLoading(false);
        return;
      }
      const player = await joinPlayer(code.toUpperCase(), trimmed, avatar);
      savePlayerToken({ playerId: player.id, sessionCode: code.toUpperCase(), nickname: trimmed, avatar });
      nav(`/play/${code.toUpperCase()}/game/${player.id}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Ingresso fallito');
      setLoading(false);
    }
  }

  return (
    <div className="h-screen bg-purple-900 flex flex-col overflow-hidden">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="shrink-0 text-center pt-4 pb-1 px-4 relative">
        <h1 className="text-[2.52rem] font-black text-white leading-none mb-2">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <div className="text-purple-300 font-bold tracking-widest mb-1" style={{ fontSize: '1.04rem' }}>CODICE: {code}</div>
        <h2 className="text-white font-black" style={{ fontSize: '1.78rem' }}>Scegli avatar e nickname</h2>
      </motion.div>

      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="flex-1 min-h-0 flex flex-col justify-center px-2 gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/20 text-white text-2xl font-black disabled:opacity-20 active:scale-95 transition-all">‹</button>
          <div className="flex-1 grid grid-cols-5 gap-2" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {pageAvatars.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPreview(item)}
                className={`text-3xl aspect-square flex items-center justify-center rounded-xl transition-all ${item === avatar ? 'bg-white scale-105 shadow-lg' : 'bg-white/20 active:bg-white/40'}`}
              >
                {item}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} disabled={page === totalPages - 1} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-white/20 text-white text-2xl font-black disabled:opacity-20 active:scale-95 transition-all">›</button>
        </div>

        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button key={index} type="button" onClick={() => setPage(index)} className={`rounded-full transition-all ${page === index ? 'bg-white w-4 h-2' : 'bg-white/30 w-2 h-2'}`} />
          ))}
        </div>
      </motion.div>

      {preview ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPreview(null)}>
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} className="relative bg-purple-800 rounded-3xl p-10 flex flex-col items-center gap-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setPreview(null)} className="absolute top-3 right-3 text-white/70 hover:text-white text-2xl font-black leading-none w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/20 transition-all">✕</button>
            <div className="text-9xl leading-none select-none">{preview}</div>
            <button type="button" onClick={() => { setAvatar(preview); setPreview(null); }} className="btn-white text-lg px-8 py-3">Usa questo avatar</button>
          </motion.div>
        </motion.div>
      ) : null}

      <motion.form initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} onSubmit={join} className="shrink-0 w-full px-6 pb-6 pt-2 flex flex-col gap-3">
        <input
          className="w-full text-center font-black bg-white rounded-xl py-3 text-gray-800 shadow-xl outline-none ring-4 ring-yellow-400 placeholder-light"
          style={{ fontSize: '1.5rem' }}
          placeholder="Il tuo nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value.slice(0, 20))}
          maxLength={20}
          autoFocus
        />
        {error ? <div className="bg-red-500 text-white font-bold text-center py-2 rounded-xl text-sm">{error}</div> : null}
        <button type="submit" disabled={loading || !nickname.trim()} className="btn-white py-3 disabled:opacity-40" style={{ fontSize: '1.5rem' }}>
          {loading ? 'Entro...' : 'Gioca 🚀'}
        </button>
      </motion.form>
    </div>
  );
}
