import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { signOutFromGoogle } from '../../lib/firebase';
import { addQuestion, deleteQuestion, fetchQuestionBank, importQuestions, updateQuestion } from '../../lib/sessionApi';
import type { MultilingualQuestion } from '../../types';

type QuestionDraft = Omit<MultilingualQuestion, 'id'>;

const emptyDraft: QuestionDraft = { IT: '', EN: '', SV: '' };

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

function toDraft(question: Partial<MultilingualQuestion>): QuestionDraft {
  return {
    IT: question.IT || '',
    EN: question.EN || '',
    SV: question.SV || '',
  };
}

export default function QuestionsAdmin() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [questions, setQuestions] = useState<MultilingualQuestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuestionDraft>(emptyDraft);
  const [jsonDraft, setJsonDraft] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedQuestion = useMemo(
    () => questions.find((question) => question.id === selectedId) || null,
    [questions, selectedId],
  );

  const filteredQuestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return questions;
    return questions.filter((question) => (
      question.IT.toLowerCase().includes(needle)
      || question.EN.toLowerCase().includes(needle)
      || question.SV.toLowerCase().includes(needle)
    ));
  }, [questions, query]);

  const canSave = Boolean(draft.IT.trim() && draft.EN.trim() && draft.SV.trim());

  async function loadQuestions() {
    const loaded = await fetchQuestionBank();
    setQuestions(loaded);
    setSelectedId((current) => {
      if (current && loaded.some((question) => question.id === current)) return current;
      return loaded[0]?.id || null;
    });
  }

  useEffect(() => {
    setBusy('load');
    loadQuestions()
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Errore caricamento domande'))
      .finally(() => setBusy(null));
  }, []);

  useEffect(() => {
    setDraft(selectedQuestion ? toDraft(selectedQuestion) : emptyDraft);
  }, [selectedQuestion?.id]);

  function handleNew() {
    setSelectedId(null);
    setDraft(emptyDraft);
    setNotice('');
    setError('');
  }

  async function handleSave() {
    if (!canSave) return;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      if (selectedId) {
        const updated = await updateQuestion(selectedId, draft);
        setQuestions((current) => current.map((question) => (question.id === selectedId ? updated : question)));
        setNotice('Domanda aggiornata');
      } else {
        const created = await addQuestion(draft);
        setQuestions((current) => [created, ...current]);
        setSelectedId(created.id);
        setNotice('Domanda aggiunta');
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Salvataggio fallito');
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!selectedId || !selectedQuestion) return;
    const confirmed = window.confirm('Eliminare questa domanda dal database attivo?');
    if (!confirmed) return;

    setBusy('delete');
    setError('');
    setNotice('');
    try {
      await deleteQuestion(selectedId);
      const remaining = questions.filter((question) => question.id !== selectedId);
      setQuestions(remaining);
      setSelectedId(remaining[0]?.id || null);
      setNotice('Domanda eliminata');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Eliminazione fallita');
    } finally {
      setBusy(null);
    }
  }

  async function handleImportQuestions() {
    setBusy('import');
    setError('');
    setNotice('');
    try {
      const parsedQuestions = parseJsonQuestions(jsonDraft);
      if (parsedQuestions.length === 0) throw new Error('Nessuna domanda valida trovata nel JSON');
      const result = await importQuestions(parsedQuestions);
      setJsonDraft('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadQuestions();
      setNotice(`Importate ${result.imported} domande su ${result.total}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import JSON fallito');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-purple-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center gap-4">
          <Link to="/host" className="text-[2.1rem] font-black text-white leading-none">
            Indovina<span className="text-yellow-400">Chi</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/host" className="btn-white py-2 px-4">Dashboard</Link>
            <button onClick={() => void signOutFromGoogle().then(() => window.location.reload())} className="text-purple-300 hover:text-white text-sm font-bold transition-colors">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black text-gray-800">Admin domande</h1>
            <p className="text-gray-500 font-semibold mt-1">Gestione del database multilingua usato per assegnare le domande ai giocatori.</p>
          </div>
          <button onClick={handleNew} className="btn-purple">Nuova domanda</button>
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {notice}
          </div>
        ) : null}

        <div className="grid xl:grid-cols-[0.95fr_1.05fr] gap-6">
          <section className="card">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-2xl font-black text-gray-800">Database</h2>
                <p className="text-sm font-black text-purple-700">{questions.length} domande attive</p>
              </div>
              <input
                className="input-field sm:max-w-[280px]"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca..."
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-100">
              <table className="w-full min-w-[760px] border-collapse bg-white">
                <thead className="bg-purple-50 text-left text-xs font-black tracking-widest text-purple-700">
                  <tr>
                    <th className="px-4 py-3 w-[33%]">IT</th>
                    <th className="px-4 py-3 w-[33%]">EN</th>
                    <th className="px-4 py-3 w-[33%]">SV</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {busy === 'load' ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 font-bold">Caricamento...</td></tr>
                  ) : null}
                  {busy !== 'load' && filteredQuestions.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 font-bold">Nessuna domanda trovata</td></tr>
                  ) : null}
                  {filteredQuestions.map((question) => (
                    <tr
                      key={question.id}
                      onClick={() => setSelectedId(question.id)}
                      className={`cursor-pointer align-top transition-colors ${selectedId === question.id ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-gray-800">{question.IT}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-600">{question.EN}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-600">{question.SV}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-col gap-6">
            <section className="card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-2xl font-black text-gray-800">{selectedId ? 'Modifica domanda' : 'Nuova domanda'}</h2>
                {selectedId ? (
                  <button onClick={() => void handleDelete()} className="btn-white text-red-700" disabled={busy === 'delete'}>
                    {busy === 'delete' ? 'Elimino...' : 'Elimina'}
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4">
                <label className="block">
                  <span className="block text-xs font-black tracking-widest text-gray-500 mb-2">Italiano</span>
                  <textarea className="input-field min-h-[100px]" value={draft.IT} onChange={(event) => setDraft((current) => ({ ...current, IT: event.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-xs font-black tracking-widest text-gray-500 mb-2">English</span>
                  <textarea className="input-field min-h-[100px]" value={draft.EN} onChange={(event) => setDraft((current) => ({ ...current, EN: event.target.value }))} />
                </label>
                <label className="block">
                  <span className="block text-xs font-black tracking-widest text-gray-500 mb-2">Svenska</span>
                  <textarea className="input-field min-h-[100px]" value={draft.SV} onChange={(event) => setDraft((current) => ({ ...current, SV: event.target.value }))} />
                </label>
              </div>

              <div className="flex flex-wrap gap-3 mt-5">
                <button onClick={() => void handleSave()} className="btn-purple" disabled={busy === 'save' || !canSave}>
                  {busy === 'save' ? 'Salvo...' : selectedId ? 'Salva modifiche' : 'Aggiungi domanda'}
                </button>
                <button onClick={handleNew} className="btn-white">Svuota editor</button>
              </div>
            </section>

            <section className="card">
              <h2 className="text-2xl font-black text-gray-800 mb-4">Import JSON</h2>
              <input
                ref={fileInputRef}
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
                className="input-field min-h-[180px] mb-3 font-mono text-sm"
                value={jsonDraft}
                onChange={(event) => setJsonDraft(event.target.value)}
                placeholder={'[{"IT":"Domanda...","EN":"Question...","SV":"Fraga..."}]'}
              />
              <button onClick={() => void handleImportQuestions()} className="btn-white" disabled={busy === 'import' || !jsonDraft.trim()}>
                {busy === 'import' ? 'Importo...' : 'Importa JSON'}
              </button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
