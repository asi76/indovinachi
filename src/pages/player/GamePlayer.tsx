import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { clearPlayerToken, loadPlayerToken } from '../../lib/game';
import { fetchPlayer, fetchPublicSession, resolveQuestionText, submitPlayerGuess, submitPlayerResponses } from '../../lib/sessionApi';
import type { IcebreakerPlayerRecord, PublicSessionView, QuestionLanguage } from '../../types';

const languageOptions: Array<{ code: QuestionLanguage; flag: string; label: string }> = [
  { code: 'IT', flag: '🇮🇹', label: 'IT' },
  { code: 'SV', flag: '🇸🇪', label: 'SV' },
  { code: 'EN', flag: '🇬🇧', label: 'EN' },
];

function initialQuestionLanguage(): QuestionLanguage {
  const saved = window.localStorage.getItem('indovinachi-question-language');
  if (saved === 'IT' || saved === 'SV' || saved === 'EN') return saved;

  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith('sv')) return 'SV';
  if (browserLanguage.startsWith('en')) return 'EN';
  return 'IT';
}

function GuessResultsModal({ session }: { session: PublicSessionView }) {
  return (
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center p-5 z-40">
      <motion.div
        initial={{ y: 18, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl shadow-2xl p-5 w-full max-w-lg max-h-[84dvh] overflow-y-auto"
      >
        <h3 className="text-gray-900 font-black text-2xl text-center mb-4">Secondo il pubblico</h3>
        <div className="flex flex-col gap-3">
          {session.currentGuessSummary.length === 0 ? (
            <p className="text-gray-500 font-bold text-center py-4">Nessun voto ricevuto</p>
          ) : session.currentGuessSummary.map((entry) => (
            <div key={entry.playerId} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-gray-900 font-black text-base truncate">{entry.avatar} {entry.nickname}</span>
                  <span className="text-purple-700 font-black text-base">{entry.percentage}%</span>
                </div>
                <div className="h-3 bg-purple-100 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${Math.min(100, entry.percentage)}%` }} />
                </div>
              </div>
              <span className="bg-purple-50 text-purple-700 font-black rounded-xl px-3 py-2">{entry.voteCount}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function ConfirmedGuessModal({ player }: { player: IcebreakerPlayerRecord }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl p-7 w-full max-w-sm text-center shadow-2xl"
      >
        <div className="text-7xl mb-4">{player.avatar}</div>
        <h3 className="text-gray-900 font-black text-3xl">{player.nickname}</h3>
      </motion.div>
    </div>
  );
}

export default function GamePlayer() {
  const { code, playerId } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [player, setPlayer] = useState<IcebreakerPlayerRecord | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingGuess, setSubmittingGuess] = useState(false);
  const [error, setError] = useState('');
  const [questionLanguage, setQuestionLanguage] = useState<QuestionLanguage>(initialQuestionLanguage);
  const [selectedGuessId, setSelectedGuessId] = useState('');
  const [confirmedGuessId, setConfirmedGuessId] = useState('');

  function handleLanguageChange(nextLanguage: QuestionLanguage) {
    setQuestionLanguage(nextLanguage);
    window.localStorage.setItem('indovinachi-question-language', nextLanguage);
  }

  useEffect(() => {
    if (!code || !playerId) {
      nav('/play', { replace: true });
      return;
    }

    const currentCode = code.toUpperCase();
    const currentPlayerId = playerId;
    let active = true;

    async function load() {
      try {
        const [nextSession, nextPlayer] = await Promise.all([
          fetchPublicSession(currentCode),
          fetchPlayer(currentPlayerId),
        ]);
        if (!active) return;
        setSession(nextSession);
        setPlayer(nextPlayer);
      } catch (loadError: any) {
        if (active) {
          const isNotFound = loadError?.status === 404 || (loadError instanceof Error && loadError.message.includes("wasn't found"));
          const latestSession = await fetchPublicSession(currentCode).catch(() => null);
          if (isNotFound || (latestSession && ['finished', 'terminated'].includes(latestSession.status))) {
            clearPlayerToken();
            nav(`/play/${currentCode}`, { replace: true });
            return;
          }
          setError(loadError instanceof Error ? loadError.message : 'Giocatore non disponibile');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    const id = window.setInterval(() => { void load(); }, 2000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [code, playerId, nav]);

  useEffect(() => {
    setSelectedGuessId('');
    setConfirmedGuessId('');
  }, [session?.currentQuestionIndex, session?.currentAnswerIndex]);

  const normalizedAnswers = useMemo(() => {
    if (!session || !player) return [];
    const playerQuestions = Array.isArray(player.questions) && player.questions.length > 0
      ? player.questions
      : session.questions.map((question, index) => ({ id: `legacy-${index}`, IT: question, EN: question, SV: question }));
    return playerQuestions.map((_, index) => answers[index] || '');
  }, [answers, player, session]);

  const playerQuestions = useMemo(() => {
    if (!session || !player) return [];
    return Array.isArray(player.questions) && player.questions.length > 0
      ? player.questions
      : session.questions.map((question, index) => ({ id: `legacy-${index}`, IT: question, EN: question, SV: question }));
  }, [player, session]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !player) return;

    if (normalizedAnswers.some((answer) => !answer.trim())) {
      setError('Compila tutte le risposte');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const updatedPlayer = await submitPlayerResponses(session, player, normalizedAnswers, questionLanguage);
      setPlayer(updatedPlayer);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Invio fallito');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmGuess() {
    if (!session || !player || !selectedGuessId) return;
    setSubmittingGuess(true);
    setError('');
    try {
      const result = await submitPlayerGuess(session, player, selectedGuessId);
      setConfirmedGuessId(result.guess.guessedPlayerId);
      if (result.session) setSession(result.session);
      setSelectedGuessId('');
    } catch (guessError) {
      setError(guessError instanceof Error ? guessError.message : 'Voto non registrato');
    } finally {
      setSubmittingGuess(false);
    }
  }

  if (loading || !session || !player) {
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-[2.73rem] font-black text-white leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <p className="text-light text-base">{error || 'Connessione alla sessione...'}</p>
      </div>
    );
  }

  if (session.status === 'finished' || session.status === 'terminated') {
    clearPlayerToken();
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-[2.73rem] font-black text-white leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <p className="text-light text-base">La sessione e stata chiusa.</p>
        <button onClick={() => nav('/play')} className="btn-white">Torna alla home</button>
      </div>
    );
  }

  if (session.status === 'draft' || session.status === 'lobby' || session.status === 'ready') {
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-[2.73rem] font-black text-white leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} className="text-[144px]">
          {player.avatar}
        </motion.div>
        <div className="text-center">
          <h2 className="text-white font-black text-3xl">{player.nickname}</h2>
          <p className="text-light mt-1">{player.submitted ? 'Risposte gia inviate. Aspetta il reveal.' : 'Aspetta che l\'host apra la raccolta oppure avvii la sessione.'}</p>
        </div>
        <div className="bg-white/10 rounded-2xl px-8 py-3 text-center">
          <span className="text-purple-300 font-bold">Codice </span>
          <span className="text-white font-black tracking-widest text-xl">{session.code}</span>
        </div>
      </div>
    );
  }

  if (session.status === 'collecting' && !player.submitted) {
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col gap-4 p-4">
        <div className="text-center pt-2">
          <h1 className="text-[2.3rem] font-black text-white leading-none">
            Indovina<span className="text-yellow-400">Chi</span>
          </h1>
          <p className="text-purple-300 font-semibold mt-2">{player.avatar} {player.nickname}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col gap-3">
          <div className="bg-white rounded-3xl shadow-xl p-5 overflow-y-auto flex-1 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black tracking-widest text-purple-500">LINGUA</span>
              <div className="flex items-center gap-2 rounded-full bg-purple-50 p-1">
                {languageOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => handleLanguageChange(option.code)}
                    className={`h-10 min-w-[74px] rounded-full px-3 text-sm font-black transition-colors ${questionLanguage === option.code ? 'bg-purple-700 text-white shadow' : 'bg-white text-purple-700'}`}
                    aria-pressed={questionLanguage === option.code}
                  >
                    <span className="mr-1" aria-hidden="true">{option.flag}</span>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {playerQuestions.map((question, index) => (
              <label key={`${session.code}-${question.id}-${index}`} className="block">
                <span className="block text-xs font-black tracking-widest text-purple-500 mb-2">DOMANDA {index + 1}</span>
                <strong className="block text-gray-800 text-xl font-black mb-3">{resolveQuestionText(question, questionLanguage)}</strong>
                <textarea
                  value={answers[index] || ''}
                  onChange={(event) => setAnswers((current) => ({ ...current, [index]: event.target.value }))}
                  className="input-field min-h-[96px]"
                  placeholder="Scrivi la tua risposta"
                />
              </label>
            ))}
          </div>

          {error ? <div className="bg-red-500 text-white font-bold text-center py-3 rounded-xl text-sm">{error}</div> : null}

          <button type="submit" disabled={submitting} className="btn-white text-2xl py-4 disabled:opacity-40">
            {submitting ? 'Invio...' : 'Invia risposte'}
          </button>
        </form>
      </div>
    );
  }

  if (player.submitted && session.status === 'collecting') {
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-[2.73rem] font-black text-white leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.8 }} className="text-[144px]">
          {player.avatar}
        </motion.div>
        <div className="text-center">
          <h2 className="text-white font-black text-3xl">{player.nickname}</h2>
          <p className="text-light mt-1">Risposte inviate. Aspetta che dal telecomando parta la sessione.</p>
        </div>
      </div>
    );
  }

  if (session.status === 'revealing') {
    const votingOpen = session.revealPhase === 'answer' && !session.currentGuessSummaryVisible && !session.currentAnswerPlayerVisible;
    const showGuessResults = Boolean(session.currentGuessSummaryVisible);
    const selectedGuess = session.players.find((entry) => entry.id === selectedGuessId) || null;
    const confirmedGuess = session.players.find((entry) => entry.id === confirmedGuessId) || null;

    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-5 p-6">
        <h1 className="text-[2.73rem] font-black text-white leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        {session.currentQuestionText ? (
          <div className="card w-full max-w-lg text-center">
            <h2 className="text-2xl font-black text-gray-800">{session.currentQuestionText}</h2>
          </div>
        ) : null}
        {session.currentAnswerText ? (
          <div className="bg-yellow-400 text-gray-900 rounded-3xl shadow-xl w-full max-w-lg px-6 py-5 text-center">
            <p className="font-black text-2xl leading-tight">{session.currentAnswerText}</p>
          </div>
        ) : null}
        {votingOpen ? (
          <div className="w-full max-w-lg">
            {!confirmedGuess ? (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-white font-black text-2xl">Indovina Chi?</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {session.players.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedGuessId(entry.id)}
                      disabled={submittingGuess}
                      className="min-h-[102px] rounded-2xl px-3 py-3 text-center transition-colors bg-white/15 text-white active:bg-white/25"
                    >
                      <div className="text-3xl mb-1">{entry.avatar}</div>
                      <div className="font-black text-sm leading-tight">{entry.nickname}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : showGuessResults ? null : (
          <div className="w-full max-w-lg bg-white/10 rounded-2xl px-5 py-4 text-center">
            <p className="text-white font-black">{session.revealPhase === 'answer' ? 'Votazione chiusa' : 'Attendi'}</p>
          </div>
        )}

        {error ? <div className="bg-red-500 text-white font-bold text-center py-3 px-4 rounded-xl text-sm max-w-lg w-full">{error}</div> : null}

        {selectedGuess ? (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-5 z-50">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl">
              <div className="text-6xl mb-3">{selectedGuess.avatar}</div>
              <h3 className="text-gray-900 font-black text-2xl mb-2">{selectedGuess.nickname}</h3>
              <p className="text-gray-500 font-semibold mb-5">Confermi questa scelta?</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setSelectedGuessId('')} disabled={submittingGuess} className="rounded-2xl bg-gray-100 text-gray-700 font-black py-4">
                  Annulla
                </button>
                <button type="button" onClick={() => void handleConfirmGuess()} disabled={submittingGuess} className="btn-purple py-4">
                  {submittingGuess ? 'Invio...' : 'Conferma'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}

        {confirmedGuess && !showGuessResults ? <ConfirmedGuessModal player={confirmedGuess} /> : null}
        {showGuessResults ? <GuessResultsModal session={session} /> : null}
      </div>
    );
  }

  return null;
}
