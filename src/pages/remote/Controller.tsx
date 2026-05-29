import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchRemoteSession, remoteAction } from '../../lib/sessionApi';
import { guessCountdownRemaining } from '../../lib/countdown';
import type { PublicSessionView } from '../../types';

type RemoteAction = 'open-collect' | 'start-session' | 'question' | 'answer' | 'player' | 'finish';

export default function RemoteController({ sessionCode, token }: { sessionCode: string; token: string }) {
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) {
        setError('Token telecomando mancante');
        return;
      }

      try {
        const next = await fetchRemoteSession(sessionCode, token);
        if (!active) return;
        setSession(next);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Telecomando non disponibile');
      }
    }

    void load();
    const id = window.setInterval(() => { void load(); }, 1500);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [sessionCode, token]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  async function handleAction(action: RemoteAction) {
    setBusy(action);
    setError('');
    try {
      const updated = await remoteAction(sessionCode, token, action);
      setSession(updated);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Azione fallita');
    } finally {
      setBusy(null);
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-purple-900 flex items-center justify-center p-6">
        <div className="card text-center max-w-md w-full">
          <h1 className="text-3xl font-black text-gray-800 mb-3">Telecomando</h1>
          <p className="text-gray-500 font-semibold">{error || 'Connessione in corso...'}</p>
        </div>
      </div>
    );
  }

  const canOpenCollect = ['draft', 'lobby', 'finished'].includes(session.status);
  const canStartSession = ['collecting', 'ready'].includes(session.status) && session.answeredCount > 0;
  const canQuestion = session.status === 'revealing' && ['idle', 'complete'].includes(session.revealPhase);
  const canAnswer = session.status === 'revealing' && session.revealPhase === 'question' && Boolean(session.currentQuestionText);
  const countdownRemaining = guessCountdownRemaining(session, now);
  const canPlayer = session.status === 'revealing' && session.revealPhase === 'answer' && countdownRemaining <= 0 && Boolean(session.currentAnswerText);
  const canFinish = session.status === 'revealing' || session.status === 'finished';

  return (
    <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black text-gray-800">Indovina Chi</h1>
          <p className="text-purple-500 font-black tracking-[0.3em] mt-2">{session.code}</p>
          <p className="text-gray-500 font-semibold mt-3">Inizia sessione prepara il reveal. Poi usa Prossima domanda, Mostra risposta e Mostra giocatore.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-purple-50 rounded-2xl p-4 text-center">
            <div className="text-3xl font-black text-gray-900">{session.playerCount}</div>
            <div className="text-xs font-black text-purple-500 tracking-widest">GIOCATORI</div>
          </div>
          <div className="bg-purple-50 rounded-2xl p-4 text-center">
            <div className="text-3xl font-black text-gray-900">{session.answeredCount}</div>
            <div className="text-xs font-black text-purple-500 tracking-widest">RISPOSTE</div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button onClick={() => void handleAction('open-collect')} disabled={!canOpenCollect || busy !== null} className="btn-white text-lg disabled:opacity-40">
            {busy === 'open-collect' ? 'Apro...' : 'Apri raccolta'}
          </button>
          <button onClick={() => void handleAction('start-session')} disabled={!canStartSession || busy !== null} className="btn-purple text-lg disabled:opacity-40">
            {busy === 'start-session' ? 'Parto...' : 'Inizia sessione'}
          </button>
          <button onClick={() => void handleAction('question')} disabled={!canQuestion || busy !== null} className="btn-white text-lg disabled:opacity-40">
            {busy === 'question' ? 'Estraggo...' : 'Prossima domanda'}
          </button>
          <button onClick={() => void handleAction('answer')} disabled={!canAnswer || busy !== null} className="btn-white text-lg disabled:opacity-40">
            {busy === 'answer' ? 'Mostro...' : 'Mostra risposta'}
          </button>
          <button onClick={() => void handleAction('player')} disabled={!canPlayer || busy !== null} className="btn-white text-lg disabled:opacity-40">
            {busy === 'player' ? 'Rivelo...' : countdownRemaining > 0 ? `Mostra giocatore tra ${countdownRemaining}s` : 'Mostra giocatore'}
          </button>
          <button onClick={() => void handleAction('finish')} disabled={!canFinish || busy !== null} className="py-4 border-2 border-gray-200 text-gray-600 font-black rounded-2xl hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-40">
            {busy === 'finish' ? 'Chiudo...' : 'Chiudi gioco'}
          </button>
        </div>

        <div className="mt-5 bg-gray-50 rounded-2xl p-4">
          <p className="text-xs font-black tracking-widest text-gray-500 mb-2">ANTEPRIMA LIVE</p>
          <strong className="block text-gray-900 text-lg">{session.currentQuestionText || 'Nessuna domanda attiva'}</strong>
          <p className="text-gray-500 font-semibold mt-2">{session.currentAnswerText || 'Nessuna risposta ancora mostrata'}</p>
          {session.currentAnswerPlayerVisible && session.currentAnswerPlayer ? (
            <p className="text-purple-700 font-black mt-2">{session.currentAnswerPlayer.avatar} {session.currentAnswerPlayer.nickname}</p>
          ) : null}
        </div>

        {error ? <div className="mt-4 bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm font-semibold">{error}</div> : null}
      </motion.div>
    </div>
  );
}
