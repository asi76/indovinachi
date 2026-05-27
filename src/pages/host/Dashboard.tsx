import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import { signOutFromGoogle } from '../../lib/firebase';
import { addQuestion, createHostSession, fetchHostSessions, fetchQuestionBank, importQuestions, openCollecting, saveHostSessionConfig, startSession } from '../../lib/sessionApi';
import { joinUrl, presenterUrl, remoteUrl, sessionStatusLabel } from '../../lib/game';
import type { MultilingualQuestion, PublicSessionView } from '../../types';

function parseLines(value: string) {
  return value.split('\n').map((entry) => entry.trim()).filter(Boolean);
}

function parseJsonQuestions(value: string) {
  const parsed = JSON.parse(value);
  const list = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(list)) throw new Error('Il JSON deve contenere un array di domande');
  return list.map((entry) => ({
    IT: String(entry.IT || entry.it || '').trim(),
    EN: String(entry.EN || entry.en || '').trim(),
    SV: String(entry.SV || entry.sv || '').trim(),
  })).filter((entry) => entry.IT && entry.EN && entry.SV);
}

export default function HostDashboard() {
  const nav = useNavigate();
  const [sessions, setSessions] = useState<PublicSessionView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [titleDraft, setTitleDraft] = useState('Indovina Chi');
  const [themeDraft, setThemeDraft] = useState('Party room viola, luci da quiz show, reveal teatrale');
  const [questionDraft, setQuestionDraft] = useState('');
  const [questionCountDraft, setQuestionCountDraft] = useState(3);
  const [questionBank, setQuestionBank] = useState<MultilingualQuestion[]>([]);
  const [manualQuestion, setManualQuestion] = useState({ IT: '', EN: '', SV: '' });
  const [jsonDraft, setJsonDraft] = useState('');

  const session = useMemo(() => sessions[0] || null, [sessions]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const next = await fetchHostSessions();
        if (!active) return;
        setSessions(next);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Errore caricamento sessioni');
      }
    }

    void load();
    const id = window.setInterval(() => { void load(); }, 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchQuestionBank()
      .then((questions) => {
        if (active) setQuestionBank(questions);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Errore caricamento domande');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    setTitleDraft(session.title);
    setThemeDraft(session.theme);
    setQuestionDraft(session.questions.join('\n'));
    setQuestionCountDraft(session.questionCount || 3);
  }, [session?.id]);

  async function handleCreate() {
    setBusy('create');
    setError('');
    try {
      const created = await createHostSession();
      setSessions([created]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Creazione fallita');
    } finally {
      setBusy(null);
    }
  }

  async function handleSave() {
    if (!session) return;
    setBusy('save');
    setError('');
    try {
      const updated = await saveHostSessionConfig(session.code, {
        title: titleDraft.trim() || 'Indovina Chi',
        theme: themeDraft.trim(),
        questions: parseLines(questionDraft),
        questionCount: questionCountDraft,
      });
      setSessions([updated]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Salvataggio fallito');
    } finally {
      setBusy(null);
    }
  }

  async function handleAddManualQuestion() {
    setBusy('question');
    setError('');
    try {
      const created = await addQuestion(manualQuestion);
      setQuestionBank((current) => [created, ...current]);
      setManualQuestion({ IT: '', EN: '', SV: '' });
    } catch (questionError) {
      setError(questionError instanceof Error ? questionError.message : 'Domanda non salvata');
    } finally {
      setBusy(null);
    }
  }

  async function handleImportQuestions() {
    setBusy('import');
    setError('');
    try {
      const questions = parseJsonQuestions(jsonDraft);
      if (questions.length === 0) throw new Error('Nessuna domanda valida trovata nel JSON');
      await importQuestions(questions);
      setJsonDraft('');
      setQuestionBank(await fetchQuestionBank());
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import JSON fallito');
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenCollecting() {
    if (!session) return;
    setBusy('collect');
    setError('');
    try {
      const updated = await openCollecting(session.code);
      setSessions([updated]);
    } catch (collectError) {
      setError(collectError instanceof Error ? collectError.message : 'Apertura raccolta fallita');
    } finally {
      setBusy(null);
    }
  }

  async function handleStartSession() {
    if (!session) return;
    setBusy('start');
    setError('');
    try {
      const updated = await startSession(session.code);
      setSessions([updated]);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Avvio sessione fallito');
    } finally {
      setBusy(null);
    }
  }

  const canCollect = Boolean(session && (questionBank.length > 0 || parseLines(questionDraft).length > 0));
  const canStart = Boolean(session && session.answeredCount > 0);
  const canAddManual = Boolean(manualQuestion.IT.trim() && manualQuestion.EN.trim() && manualQuestion.SV.trim());

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-purple-700 shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-[2.1rem] font-black text-white leading-none">
            Indovina<span className="text-yellow-400">Chi</span>
          </h1>
          <button onClick={() => void signOutFromGoogle().then(() => window.location.reload())} className="text-purple-300 hover:text-white text-sm font-bold transition-colors">
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-black text-gray-800">Sessione attiva</h2>
            <p className="text-gray-500 font-semibold mt-1">Stessa impostazione grafica di Quizzone, ma dedicata al reveal di Indovina Chi.</p>
          </div>
          {!session ? (
            <button onClick={() => void handleCreate()} className="btn-purple" disabled={busy === 'create'}>
              {busy === 'create' ? 'Creo...' : 'Crea sessione'}
            </button>
          ) : (
            <button onClick={() => nav(`/host/game/${session.code}`)} className="btn-purple">
              Apri maxischermo
            </button>
          )}
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        {!session ? (
          <div className="card text-center py-16">
            <h3 className="text-2xl font-black text-gray-800 mb-3">Nessuna sessione pronta</h3>
            <p className="text-gray-500 font-semibold">Crea una nuova sessione per generare QR, telecomando e schermo grande.</p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-purple-400 font-black tracking-widest text-xs">SESSIONE {session.code}</p>
                  <h3 className="text-3xl font-black text-gray-800 mt-1">{session.title}</h3>
                </div>
                <span className="bg-purple-100 text-purple-700 text-sm font-black px-4 py-2 rounded-full">{sessionStatusLabel(session.status)}</span>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-black tracking-widest text-gray-500 mb-2">Titolo</label>
                  <input className="input-field" value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-black tracking-widest text-gray-500 mb-2">Tema</label>
                  <input className="input-field" value={themeDraft} onChange={(e) => setThemeDraft(e.target.value)} />
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-xs font-black tracking-widest text-gray-500 mb-2">Domande per giocatore al check-in</label>
                <input
                  className="input-field max-w-[180px]"
                  type="number"
                  min={1}
                  max={24}
                  value={questionCountDraft}
                  onChange={(e) => setQuestionCountDraft(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
                />
              </div>

              <div className="mb-5">
                <label className="block text-xs font-black tracking-widest text-gray-500 mb-2">Domande legacy sessione</label>
                <textarea
                  className="input-field min-h-[180px]"
                  value={questionDraft}
                  onChange={(e) => setQuestionDraft(e.target.value)}
                  placeholder={"Qual e una tua abitudine segreta?\nChe talento nessuno si aspetta da te?\nQual e il tuo guilty pleasure?"}
                />
              </div>

              <div className="border-t border-gray-100 pt-5 mt-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h4 className="text-xl font-black text-gray-800">Amministrazione domande</h4>
                  <span className="text-sm font-black text-purple-700 bg-purple-50 px-3 py-1 rounded-full">{questionBank.length} nel database</span>
                </div>
                <div className="grid md:grid-cols-3 gap-3 mb-3">
                  <textarea className="input-field min-h-[92px]" placeholder="IT" value={manualQuestion.IT} onChange={(e) => setManualQuestion((current) => ({ ...current, IT: e.target.value }))} />
                  <textarea className="input-field min-h-[92px]" placeholder="EN" value={manualQuestion.EN} onChange={(e) => setManualQuestion((current) => ({ ...current, EN: e.target.value }))} />
                  <textarea className="input-field min-h-[92px]" placeholder="SV" value={manualQuestion.SV} onChange={(e) => setManualQuestion((current) => ({ ...current, SV: e.target.value }))} />
                </div>
                <button onClick={() => void handleAddManualQuestion()} className="btn-white mb-5" disabled={busy === 'question' || !canAddManual}>
                  {busy === 'question' ? 'Aggiungo...' : 'Aggiungi domanda'}
                </button>

                <label className="block text-xs font-black tracking-widest text-gray-500 mb-2">Import JSON multilingua</label>
                <input
                  className="block w-full text-sm font-semibold text-gray-600 mb-3"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void file.text().then(setJsonDraft);
                  }}
                />
                <textarea
                  className="input-field min-h-[130px] mb-3"
                  value={jsonDraft}
                  onChange={(e) => setJsonDraft(e.target.value)}
                  placeholder={'[{"IT":"Domanda...","EN":"Question...","SV":"Fraga..."}]'}
                />
                <button onClick={() => void handleImportQuestions()} className="btn-white" disabled={busy === 'import' || !jsonDraft.trim()}>
                  {busy === 'import' ? 'Importo...' : 'Importa JSON'}
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={() => void handleSave()} className="btn-purple" disabled={busy === 'save'}>
                  {busy === 'save' ? 'Salvo...' : 'Salva setup'}
                </button>
                <button onClick={() => void handleOpenCollecting()} className="btn-white" disabled={busy === 'collect' || !canCollect}>
                  {busy === 'collect' ? 'Apro...' : 'Apri raccolta'}
                </button>
                <button onClick={() => void handleStartSession()} className="btn-white" disabled={busy === 'start' || !canStart}>
                  {busy === 'start' ? 'Avvio...' : 'Inizia sessione'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card">
                <h3 className="text-2xl font-black text-gray-800 mb-4">Accessi rapidi</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <a href={joinUrl(session)} target="_blank" rel="noreferrer" className="bg-purple-50 rounded-2xl p-3 hover:bg-purple-100 transition-colors">
                    <QRCodeSVG value={joinUrl(session)} size={92} includeMargin className="mx-auto mb-2" />
                    <span className="text-xs font-black text-purple-700">Giocatori</span>
                  </a>
                  <a href={presenterUrl(session)} target="_blank" rel="noreferrer" className="bg-purple-50 rounded-2xl p-3 hover:bg-purple-100 transition-colors">
                    <QRCodeSVG value={presenterUrl(session)} size={92} includeMargin className="mx-auto mb-2" />
                    <span className="text-xs font-black text-purple-700">Schermo</span>
                  </a>
                  <a href={remoteUrl(session)} target="_blank" rel="noreferrer" className="bg-purple-50 rounded-2xl p-3 hover:bg-purple-100 transition-colors">
                    <QRCodeSVG value={remoteUrl(session)} size={92} includeMargin className="mx-auto mb-2" />
                    <span className="text-xs font-black text-purple-700">Telecomando</span>
                  </a>
                </div>
              </motion.div>

              <div className="card">
                <h3 className="text-2xl font-black text-gray-800 mb-4">Sala</h3>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-2xl p-4 text-center">
                    <div className="text-3xl font-black text-gray-900">{session.playerCount}</div>
                    <div className="text-xs font-black text-gray-500 tracking-widest">GIOCATORI</div>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 text-center">
                    <div className="text-3xl font-black text-gray-900">{session.answeredCount}</div>
                    <div className="text-xs font-black text-gray-500 tracking-widest">RISPOSTE</div>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 text-center">
                    <div className="text-3xl font-black text-gray-900">{session.questionCount}</div>
                    <div className="text-xs font-black text-gray-500 tracking-widest">DOMANDE</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {session.players.length === 0 ? <span className="text-gray-400 italic">in attesa di giocatori...</span> : null}
                  {session.players.map((player) => (
                    <span key={player.id} className="bg-white/80 border border-gray-200 text-gray-800 text-sm px-3 py-1 rounded-full font-semibold shrink-0">
                      {player.avatar} {player.nickname}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
