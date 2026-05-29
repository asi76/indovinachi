import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { fetchPublicSession } from '../../lib/sessionApi';
import { joinUrl } from '../../lib/game';
import { playCountdownTick, resumeSoundboard } from '../../lib/soundboard';
import { guessCountdownRemaining } from '../../lib/countdown';
import { resolveQuestionText } from '../../lib/sessionApi';
import type { PublicSessionView, QuestionLanguage } from '../../types';
import IceBreakerLogo from '../../components/IceBreakerLogo';

const languageOptions: Array<{ code: QuestionLanguage; flag: string; label: string }> = [
  { code: 'IT', flag: '🇮🇹', label: 'IT' },
  { code: 'SV', flag: '🇸🇪', label: 'SV' },
  { code: 'EN', flag: '🇬🇧', label: 'EN' },
];

function initialQuestionLanguage(): QuestionLanguage {
  const saved = window.localStorage.getItem('icebreaker-host-question-language');
  if (saved === 'IT' || saved === 'SV' || saved === 'EN') return saved;
  return 'IT';
}

function waitingMessage(session: PublicSessionView) {
  if (session.status === 'collecting' || session.status === 'ready') {
    const pendingPlayers = session.players.filter((player) => !player.submitted);
    if (pendingPlayers.length === 0) return 'In attesa inizio gioco';
    const pendingNames = pendingPlayers.map((player) => player.nickname).join(', ') || 'nessuno';
    const label = pendingPlayers.length === 1 ? 'giocatore deve' : 'giocatori devono';
    return `${pendingPlayers.length} ${label} ancora inviare le risposte (${pendingNames})`;
  }
  if (session.status === 'lobby' || session.status === 'draft') return 'Scansiona il QR, scegli il tuo avatar ed entra in sala.';
  return 'Preparazione sessione';
}

function GuessResultsModal({ session }: { session: PublicSessionView }) {
  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center p-6 z-40">
      <motion.div
        initial={{ y: 18, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl p-6 max-w-4xl w-full max-h-[86dvh] overflow-y-auto"
      >
        <h3 className="text-gray-900 font-black text-3xl text-center mb-5">Risultato votazione</h3>
        <div className="flex flex-col gap-3">
          {session.currentGuessSummary.length === 0 ? (
            <p className="text-gray-500 font-bold text-center py-4">Nessun voto ricevuto</p>
          ) : session.currentGuessSummary.map((entry) => (
            <div key={entry.playerId} className="grid grid-cols-[1fr_auto] items-center gap-4">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <span className="text-gray-900 font-black text-[1.625rem] leading-tight truncate">{entry.avatar} {entry.nickname}</span>
                  <span className="text-blue-700 font-black text-[1.625rem] leading-tight">{entry.percentage}%</span>
                </div>
                <div className="h-4 bg-blue-100 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${Math.min(100, entry.percentage)}%` }} />
                </div>
              </div>
              <span className="bg-blue-50 text-blue-700 font-black rounded-xl px-3 py-2">{entry.voteCount}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default function GameHost({ sessionCode }: { sessionCode?: string }) {
  const nav = useNavigate();
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [questionLanguage, setQuestionLanguage] = useState<QuestionLanguage>(initialQuestionLanguage);
  const lastTickKeyRef = useRef('');

  function enableHostAudio() {
    resumeSoundboard();
    setAudioEnabled(true);
  }

  function handleLanguageChange(nextLanguage: QuestionLanguage) {
    setQuestionLanguage(nextLanguage);
    window.localStorage.setItem('icebreaker-host-question-language', nextLanguage);
  }

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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const unlock = () => enableHostAudio();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!session || session.status !== 'revealing' || session.revealPhase !== 'answer') return;

    const countdownRemaining = guessCountdownRemaining(session, now);
    const tickKey = `${session.currentQuestionIndex}:${session.currentAnswerIndex}:${countdownRemaining}`;
    if (tickKey === lastTickKeyRef.current) return;

    lastTickKeyRef.current = tickKey;
    playCountdownTick(countdownRemaining === 0);
  }, [now, session]);

  if (!session) {
    return (
      <div className="min-h-screen app-bg flex flex-col items-center justify-center gap-6 p-6">
        <IceBreakerLogo className="text-[3.53rem]" />
        {!audioEnabled ? (
          <button type="button" onClick={enableHostAudio} className="fixed top-4 left-4 bg-yellow-400 text-gray-900 font-black px-4 py-2 rounded-xl shadow-lg z-50">
            Attiva audio
          </button>
        ) : null}
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
    const countdownRemaining = session.revealPhase === 'answer'
      ? guessCountdownRemaining(session, now)
      : 0;
    const showGuessCountdown = session.revealPhase === 'answer' && !showAnswerPlayer && !session.currentGuessSummaryVisible && countdownRemaining > 0;
    const showVotingOpen = session.revealPhase === 'answer' && !showAnswerPlayer && !session.currentGuessSummaryVisible && countdownRemaining <= 0;
    const showGuessResults = Boolean(session.currentGuessSummaryVisible);
    const answerKey = `${session.currentQuestionIndex}:${session.currentAnswerIndex}`;
    const currentRevealQuestion = session.revealQueue[session.currentQuestionIndex] || null;
    const currentQuestionText = resolveQuestionText(currentRevealQuestion || undefined, questionLanguage)
      || session.currentQuestionText
      || 'Pronti?';

    return (
      <div className="min-h-screen app-bg flex flex-col items-center justify-center gap-8 p-8 relative pt-16">
        {!audioEnabled ? (
          <button type="button" onClick={enableHostAudio} className="fixed top-4 left-4 bg-yellow-400 text-gray-900 font-black px-4 py-2 rounded-xl shadow-lg z-50">
            Attiva audio
          </button>
        ) : null}
        <IceBreakerLogo className="text-[3.53rem]" />
        <p className="text-blue-300 font-bold text-2xl">{session.title}</p>
        <div className="flex items-center gap-2 rounded-full bg-blue-50 p-1">
          {languageOptions.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => handleLanguageChange(option.code)}
              className={`h-10 min-w-[74px] rounded-full px-3 text-sm font-black transition-colors ${questionLanguage === option.code ? 'bg-blue-700 text-white shadow' : 'bg-white text-blue-700'}`}
              aria-pressed={questionLanguage === option.code}
            >
              <span className="mr-1" aria-hidden="true">{option.flag}</span>
              {option.label}
            </button>
          ))}
        </div>

        <motion.div
          key={`question-${session.currentQuestionIndex}-${currentQuestionText}`}
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="max-w-5xl w-full"
          style={{ perspective: 1400 }}
        >
          <motion.div
            animate={{ rotateY: showAnswerPlayer ? 180 : 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
            className="relative min-h-[12rem]"
            style={{ transformStyle: 'preserve-3d', transformOrigin: 'center center' }}
          >
            <div
              className="absolute inset-0 card text-center flex items-center justify-center"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <h2 className="text-5xl font-black text-gray-800 leading-tight">{currentQuestionText}</h2>
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

        {session.currentAnswerText ? (
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="max-w-4xl w-full bg-yellow-400 text-gray-900 rounded-3xl px-10 py-6 text-center shadow-2xl flex flex-col items-center justify-center min-h-[14rem]"
          >
            <p className="font-black text-[2.5rem] leading-tight">{session.currentAnswerText}</p>
          </motion.div>
        ) : null}

        {showGuessCountdown ? (
          <motion.div
            key={`countdown-${answerKey}`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white/10 border border-white/20 rounded-3xl px-12 py-8 text-center"
          >
            <p className="text-blue-200 font-black tracking-widest text-sm mb-2">TEMPO PER INDOVINARE</p>
            <motion.div
              key={countdownRemaining}
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              className="text-white font-black text-[7rem] leading-none"
            >
              {countdownRemaining}
            </motion.div>
          </motion.div>
        ) : null}

        {showVotingOpen ? (
          <div className="bg-white/10 border border-white/20 rounded-3xl px-10 py-6 text-center">
            <p className="text-blue-200 font-black tracking-widest text-sm">VOTAZIONE APERTA</p>
          </div>
        ) : null}

        {showGuessResults ? <GuessResultsModal session={session} /> : null}

        <div className="fixed bottom-4 right-4 bg-blue-800 text-white text-sm font-bold px-4 py-2 rounded-xl shadow-lg z-50">
          {session.title} - CODICE: {session.code}
        </div>
      </div>
    );
  }

  if (session.status === 'finished') {
    return (
      <div className="min-h-screen app-bg flex flex-col items-center justify-center gap-6 p-6 pt-16">
        {!audioEnabled ? (
          <button type="button" onClick={enableHostAudio} className="fixed top-4 left-4 bg-yellow-400 text-gray-900 font-black px-4 py-2 rounded-xl shadow-lg z-50">
            Attiva audio
          </button>
        ) : null}
        <div className="text-center">
          <div className="text-7xl mb-4">🎉</div>
          <h1 className="text-white font-black text-4xl">Sessione completata</h1>
          <p className="text-blue-300 mt-3 text-xl font-semibold">Grazie per aver giocato a IceBreaker.</p>
        </div>
        <button onClick={() => nav('/host')} className="btn-white text-xl px-10 py-4">Torna alla regia</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg flex flex-col items-center justify-center gap-6 p-6">
      {!audioEnabled ? (
        <button type="button" onClick={enableHostAudio} className="fixed top-4 left-4 bg-yellow-400 text-gray-900 font-black px-4 py-2 rounded-xl shadow-lg z-50">
          Attiva audio
        </button>
      ) : null}
      <IceBreakerLogo className="text-[3.53rem]" />

      <div className="text-center">
        <h2 className="text-white font-black text-[1.91rem]">{session.title}</h2>
      </div>

      <div className="text-center w-full max-w-lg">
        <div className="text-5xl font-black text-white">{session.playerCount}</div>
        <div className="text-blue-300 font-semibold mb-4">{session.playerCount === 1 ? 'giocatore in sala' : 'giocatori in sala'}</div>
      </div>

      <div className="flex gap-3 w-full max-w-2xl items-stretch flex-col md:flex-row">
        <div className="card text-center flex flex-col justify-center" style={{ minHeight: '22rem', aspectRatio: '1 / 1' }}>
          <p className="text-gray-400 font-bold text-sm tracking-widest mb-1">USA QUESTO LINK</p>
          <p className="text-blue-700 font-black text-[0.9625rem]">{window.location.origin}/play</p>
          <div className="font-black text-blue-900 tracking-[0.15em] mb-1 text-[2.4rem]">{session.code}</div>
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
