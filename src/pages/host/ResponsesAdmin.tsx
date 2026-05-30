import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchHostSessions, fetchSessionResponses, updateSessionResponse } from '../../lib/sessionApi';
import type { IcebreakerResponseRecord, PublicSessionView } from '../../types';
import IceBreakerLogo from '../../components/IceBreakerLogo';

export default function ResponsesAdmin() {
  const [sessions, setSessions] = useState<PublicSessionView[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [responses, setResponses] = useState<IcebreakerResponseRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedSession = useMemo(
    () => sessions.find((session) => session.code === selectedCode) || sessions[0] || null,
    [selectedCode, sessions],
  );

  useEffect(() => {
    let active = true;

    async function loadSessions() {
      try {
        const loaded = await fetchHostSessions();
        if (!active) return;
        setSessions(loaded);
        setSelectedCode((current) => current || loaded[0]?.code || '');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Errore caricamento sessioni');
      }
    }

    void loadSessions();
    const id = window.setInterval(() => { void loadSessions(); }, 5000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!selectedSession) {
      setResponses([]);
      setDrafts({});
      return;
    }

    let active = true;

    async function loadResponses() {
      try {
        const loaded = await fetchSessionResponses(selectedSession.code);
        if (!active) return;
        setResponses(loaded);
        setDrafts((current) => {
          const next: Record<string, string> = {};
          for (const response of loaded) next[response.id] = current[response.id] ?? response.answerText;
          return next;
        });
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Errore caricamento risposte');
      }
    }

    void loadResponses();
    const id = window.setInterval(() => { void loadResponses(); }, 5000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [selectedSession?.code]);

  async function handleUpdateResponse(responseId: string) {
    if (!selectedSession) return;
    const answerText = (drafts[responseId] || '').trim();
    if (!answerText) {
      setError('La risposta non puo essere vuota');
      return;
    }

    setBusy(responseId);
    setError('');
    setNotice('');
    try {
      const updated = await updateSessionResponse(selectedSession.code, responseId, answerText);
      setResponses((current) => current.map((response) => (response.id === responseId ? updated : response)));
      setDrafts((current) => ({ ...current, [responseId]: updated.answerText }));
      setNotice('Risposta salvata');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Risposta non aggiornata');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen app-bg">
      <header className="app-bg shadow-lg">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center gap-4">
          <IceBreakerLogo className="text-[2.1rem]" />
          <div className="flex items-center gap-3">
            <Link to="/host/admin/questions" className="btn-white py-2 px-4">Admin domande</Link>
            <Link to="/host" className="btn-white py-2 px-4">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-cyan-100 font-black tracking-widest text-xs">ADMIN</p>
            <h1 className="text-3xl font-black text-white drop-shadow">Risposte giocatori</h1>
            <p className="text-cyan-50/85 font-semibold mt-1">Modifica le risposte che verranno mostrate durante il reveal.</p>
          </div>
          <div className="md:w-[260px]">
            <label className="block text-xs font-black tracking-widest text-cyan-50 mb-2">Sessione</label>
            <select
              className="input-field"
              value={selectedSession?.code || ''}
              onChange={(event) => setSelectedCode(event.target.value)}
              disabled={sessions.length === 0}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.code}>
                  {session.code} - {session.title}
                </option>
              ))}
            </select>
          </div>
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

        <section className="card">
          {!selectedSession ? (
            <p className="text-gray-400 font-bold text-center py-10">Nessuna sessione disponibile</p>
          ) : responses.length === 0 ? (
            <p className="text-gray-400 font-bold text-center py-10">Nessuna risposta inviata</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              {responses.map((response) => {
                const draft = drafts[response.id] ?? response.answerText;
                return (
                  <article key={response.id} className="rounded-lg border border-cyan-100 bg-white/85 p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black tracking-widest text-sky-800">DOMANDA {response.questionIndex}</p>
                        <p className="text-sm font-bold text-gray-500">{response.questionText}</p>
                      </div>
                      <span className="shrink-0 text-sm font-black text-gray-800">{response.playerAvatar} {response.playerNickname}</span>
                    </div>
                    <textarea
                      className="input-field min-h-[120px] text-sm"
                      value={draft}
                      onChange={(event) => setDrafts((current) => ({ ...current, [response.id]: event.target.value }))}
                    />
                    <div className="flex justify-end mt-3">
                      <button
                        type="button"
                        onClick={() => void handleUpdateResponse(response.id)}
                        disabled={busy === response.id || draft.trim() === response.answerText}
                        className="btn-purple py-2 px-4 text-sm disabled:opacity-40"
                      >
                        {busy === response.id ? 'Salvo...' : 'Salva risposta'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
