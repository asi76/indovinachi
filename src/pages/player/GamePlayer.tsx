import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { clearPlayerToken, loadPlayerToken } from '../../lib/game';
import { fetchPlayer, fetchPublicSession, resolveQuestionText, submitPlayerResponses } from '../../lib/sessionApi';
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

export default function GamePlayer() {
  const { code, playerId } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState<PublicSessionView | null>(null);
  const [player, setPlayer] = useState<IcebreakerPlayerRecord | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [questionLanguage, setQuestionLanguage] = useState<QuestionLanguage>(initialQuestionLanguage);

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
      } catch (loadError) {
        if (active) {
          const latestSession = await fetchPublicSession(currentCode).catch(() => null);
          if (latestSession && ['finished', 'terminated'].includes(latestSession.status)) {
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

  if (session.status === 'terminated') {
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
    return (
      <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-[2.73rem] font-black text-white leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <div className="card w-full max-w-lg text-center">
          <p className="text-purple-500 font-black tracking-widest mb-2">REVEAL LIVE</p>
          <h2 className="text-2xl font-black text-gray-800 mb-4">{session.currentQuestionText || 'Guarda il maxischermo'}</h2>
          <p className="text-gray-500 font-semibold">{session.currentAnswerText || 'Il telecomando sta per mostrare una risposta casuale.'}</p>
        </div>
      </div>
    );
  }

  clearPlayerToken();
  return (
    <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-[2.73rem] font-black text-white leading-none">
        Indovina<span className="text-yellow-400">Chi</span>
      </h1>
      <div className="text-center">
        <div className="text-7xl mb-4">🎉</div>
        <h2 className="text-white font-black text-3xl">Gioco concluso</h2>
        <p className="text-light mt-2">Grazie per aver partecipato.</p>
      </div>
      <button onClick={() => nav('/')} className="btn-white">Torna alla home</button>
    </div>
  );
}
