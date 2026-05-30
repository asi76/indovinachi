import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { fetchPublicSession } from '../../lib/sessionApi';
import { loadPlayerToken } from '../../lib/game';
import IceBreakerLogo from '../../components/IceBreakerLogo';

export default function Join() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const token = loadPlayerToken();
    if (token?.playerId && token?.sessionCode) {
      nav(`/play/${token.sessionCode}/game/${token.playerId}`, { replace: true });
    }
  }, [nav]);

  async function join(event: FormEvent) {
    event.preventDefault();
    if (code.length !== 6) {
      setError('Inserisci un codice di 6 caratteri');
      return;
    }

    const saved = loadPlayerToken();
    if (saved?.playerId && saved.sessionCode === code.toUpperCase()) {
      nav(`/play/${code.toUpperCase()}/game/${saved.playerId}`, { replace: true });
      return;
    }

    setLoading(true);
    setError('');
    try {
      await fetchPublicSession(code.toUpperCase());
      nav(`/play/${code.toUpperCase()}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Sessione non trovata');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-screen app-bg flex flex-col items-center justify-center p-6 gap-6 overflow-hidden">
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220 }} className="text-center">
        <IceBreakerLogo className="text-[2.625rem]" />
        <p className="text-cyan-50 font-semibold mt-1 drop-shadow">Entra con il codice mostrato sul maxischermo</p>
      </motion.div>

      <motion.form initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} onSubmit={join} className="w-full max-w-xs flex flex-col gap-4">
        <input
          className="w-full text-center text-5xl font-black bg-white rounded-lg py-6 text-gray-800 tracking-[0.2em] shadow-xl focus:outline-none placeholder-light focus:ring-4 focus:ring-pink-400"
          placeholder="CODICE"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          maxLength={6}
          autoFocus
        />

        {error ? <div className="bg-red-500 text-white font-bold text-center py-3 rounded-xl text-sm">{error}</div> : null}

        <button type="submit" disabled={loading || code.length !== 6} className="btn-white text-2xl py-5 disabled:opacity-40">
          {loading ? '…' : 'Entra'}
        </button>

        <button type="button" onClick={() => nav('/')} className="text-cyan-50 hover:text-white font-black text-sm text-center transition-colors mt-2">
          ← Torna alla home
        </button>
      </motion.form>
    </div>
  );
}
