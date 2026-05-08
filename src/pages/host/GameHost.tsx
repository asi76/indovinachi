import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { fetchPublicSession } from '../../lib/sessionApi';
import { joinUrl } from '../../lib/game';
import type { PublicSessionView } from '../../types';

function waitingMessage(session: PublicSessionView) {
  if (session.status === 'collecting') return `${session.answeredCount}/${session.playerCount} hanno gia inviato le risposte`;
  if (session.status === 'ready') return 'Tutti hanno risposto. Premi Inizia sessione dal telecomando.';
  if (session.status === 'lobby' || session.status === 'draft') return 'Scansiona il QR, scegli il tuo avatar ed entra in sala.';
  return 'Preparazione sessione';
}

export default function GameHost({ sessionCode }: { sessionCode?: string }) {
  const nav = useNavigate();
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionCode) return;
    let active = true;

    async function load() {
      try {
        const next = await fetchPublicSession(sessionCode);
        if (!active) return;
        setSession(next);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Sessione non disponibile');
      }
    }

    void load();
    const id = window.setInterval(() => { void load(); }, 1500);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [sessionCode]);

  if (!session) {
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-[3.53rem] font-black text-white leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <div className="card text-center">
          <h2 className="text-2xl font-black text-gray-800 mb-3">Schermo grande</h2>
          <p className="text-gray-500 font-semibold">{error || 'Caricamento sessione...'}</p>
        </div>
      </div>
    );
  }

  if (session.status === 'revealing') {
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-8 p-8 relative pt-16">
        <h1 className="text-[3.53rem] font-black text-white leading-none flex items-center gap-0.5">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <p className="text-purple-300 font-bold text-2xl">{session.title}</p>

        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card text-center max-w-5xl w-full"
        >
          <p className="text-purple-500 font-black tracking-widest mb-3">DOMANDA</p>
          <h2 className="text-5xl font-black text-gray-800 leading-tight">{session.currentQuestionText || 'Pronta per il reveal'}</h2>
        </motion.div>

        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-yellow-400 text-gray-900 rounded-3xl px-10 py-6 text-center max-w-4xl w-full shadow-2xl"
        >
          <p className="text-[1.2rem] font-black tracking-widest mb-2">RISPOSTA ESTRATTA</p>
          <p className="font-black text-[2.5rem] leading-tight">{session.currentAnswerText || 'Il telecomando puo mostrare la prima risposta casuale'}</p>
        </motion.div>

        <div className="fixed bottom-4 right-4 bg-purple-800 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg z-50">
          {session.title} — CODICE: {session.code}
        </div>
      </div>
    );
  }

  if (session.status === 'finished') {
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6 pt-16">
        <div className="text-center">
          <div className="text-7xl mb-4">🎉</div>
          <h1 className="text-white font-black text-4xl">Sessione completata</h1>
          <p className="text-purple-300 mt-3 text-xl font-semibold">Grazie per aver giocato a Indovina Chi.</p>
        </div>
        <button onClick={() => nav('/host')} className="btn-white text-xl px-10 py-4">Torna alla regia</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-[3.53rem] font-black text-white leading-none flex items-center gap-0.5">
        Indovina<span className="text-yellow-400">Chi</span>
      </h1>

      <div className="text-center">
        <h2 className="text-white font-black text-[1.91rem]">{session.title}</h2>
        <p className="text-purple-300 mt-1">{session.questions.length} domande pronte</p>
      </div>

      <div className="text-center w-full max-w-lg">
        <div className="text-5xl font-black text-white">{session.playerCount}</div>
        <div className="text-purple-300 font-semibold mb-4">{session.playerCount === 1 ? 'giocatore in sala' : 'giocatori in sala'}</div>
      </div>

      <div className="flex gap-3 w-full max-w-2xl items-stretch flex-col md:flex-row">
        <div className="card text-center flex flex-col justify-center" style={{ minHeight: '22rem', aspectRatio: '1 / 1' }}>
          <p className="text-gray-400 font-bold text-sm tracking-widest mb-1">USA QUESTO LINK</p>
          <p className="text-purple-700 font-black text-[0.9625rem]">{window.location.origin}/play</p>
          <div className="font-black text-purple-900 tracking-[0.15em] mb-1 text-[2.4rem]">{session.code}</div>
          <QRCodeSVG value={joinUrl(session)} size={210} className="mx-auto" includeMargin />
          <p className="text-gray-400 text-xs font-semibold mt-2">scansiona per entrare</p>
        </div>

        <div className="bg-white/10 rounded-2xl p-5 inline-flex flex-wrap content-start gap-2" style={{ minHeight: '22rem', aspectRatio: '1 / 1', alignSelf: 'stretch' }}>
          {session.players.slice(-30).map((player) => (
            <span key={player.id} className="bg-white/20 text-white text-sm px-3 py-1 rounded-full font-semibold shrink-0">
              {player.avatar} {player.nickname}
            </span>
          ))}
          {session.players.length === 0 ? <span className="text-white/40 text-sm italic">in attesa di giocatori...</span> : null}
        </div>
      </div>

      <div className="bg-white/10 rounded-2xl px-8 py-4 text-center">
        <p className="text-white font-black text-xl">{waitingMessage(session)}</p>
      </div>
    </div>
  );
}
