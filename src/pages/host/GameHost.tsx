import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { fetchPublicSession } from '../../lib/sessionApi';
import { joinUrl } from '../../lib/game';
import type { PublicSessionView } from '../../types';

function waitingMessage(session: PublicSessionView) {
  if (session.status === 'collecting' || session.status === 'ready') {
    const pendingPlayers = session.players.filter((player) => !player.submitted);
    if (pendingPlayers.length === 0) return 'Tutti pronti per iniziare il gioco!';
    const pendingNames = pendingPlayers.map((player) => player.nickname).join(', ') || 'nessuno';
    const label = pendingPlayers.length === 1 ? 'giocatore deve' : 'giocatori devono';
    return `${pendingPlayers.length} ${label} ancora inviare le risposte (${pendingNames})`;
  }
  if (session.status === 'lobby' || session.status === 'draft') return 'Scansiona il QR, scegli il tuo avatar ed entra in sala.';
  return 'Preparazione sessione';
}

export default function GameHost({ sessionCode }: { sessionCode?: string }) {
  const nav = useNavigate();
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionCode) return;
    const currentCode = sessionCode;
    let active = true;

    async function load() {
      try {
        const next = await fetchPublicSession(currentCode);
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
    const answerPlayer = session.currentAnswerPlayer;
    const showAnswerPlayer = session.currentAnswerPlayerVisible && Boolean(answerPlayer);

    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-8 p-8 relative pt-16">
        <h1 className="text-[3.53rem] font-black text-white leading-none flex items-center gap-0.5">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <p className="text-purple-300 font-bold text-2xl">{session.title}</p>

        <motion.div
          key={`question-${session.currentQuestionIndex}-${session.currentQuestionText}`}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, rotateY: [90, 0] }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="card text-center max-w-5xl w-full"
          style={{ transformStyle: 'preserve-3d' }}
        >
          <h2 className="text-5xl font-black text-gray-800 leading-tight">{session.currentQuestionText || 'Pronta per il reveal'}</h2>
        </motion.div>

        {session.currentAnswerText ? (
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="max-w-4xl w-full"
            style={{ perspective: 1400 }}
          >
            <motion.div
              animate={{ rotateY: showAnswerPlayer ? 180 : 0 }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
              className="relative min-h-[14rem]"
              style={{ transformStyle: 'preserve-3d', transformOrigin: 'center center' }}
            >
              <div
                className="absolute inset-0 bg-yellow-400 text-gray-900 rounded-3xl px-10 py-6 text-center shadow-2xl flex flex-col items-center justify-center"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <p className="font-black text-[2.5rem] leading-tight">{session.currentAnswerText}</p>
              </div>
              <div
                className="absolute inset-0 bg-white text-gray-900 rounded-3xl px-10 py-6 text-center shadow-2xl flex flex-col items-center justify-center"
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                <p className="text-6xl mb-3">{answerPlayer?.avatar}</p>
                <p className="font-black text-[3rem] leading-tight">{answerPlayer?.nickname || ''}</p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}

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
