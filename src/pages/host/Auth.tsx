import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { authorizeIndovinachiHost, requestIndovinachiAccess } from '../../lib/auth';
import { auth, onAuthStateChanged, signInWithGoogle, signOutFromGoogle } from '../../lib/firebase';

export default function HostAuth() {
  const nav = useNavigate();
  const [error, setError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      await authorizeIndovinachiHost(user);
      nav('/host');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Accesso non autorizzato');
    } finally {
      setLoading(false);
    }
  }), [nav]);

  async function login() {
    setLoading(true);
    setError('');
    setRequestMessage('');
    try {
      const user = await signInWithGoogle();
      await authorizeIndovinachiHost(user);
      nav('/host');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Accesso non autorizzato');
    } finally {
      setLoading(false);
    }
  }

  async function requestAccess() {
    setRequesting(true);
    setRequestMessage('');
    try {
      const payload = await requestIndovinachiAccess(auth.currentUser);
      setRequestMessage(payload.message || 'Richiesta inviata');
    } catch (requestError) {
      setRequestMessage(requestError instanceof Error ? requestError.message : 'Richiesta non inviata');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center p-4 gap-6">
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center">
        <h1 className="text-4xl font-black text-white">Indovina<span className="text-yellow-400">Chi</span></h1>
        <p className="text-purple-300 mt-1">Portale host</p>
      </motion.div>

      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="card w-full max-w-md">
        <h2 className="text-2xl font-black text-gray-800 mb-3">Accesso host</h2>
        <p className="text-gray-500 text-sm font-semibold mb-6">Gestisci sessione, QR, telecomando e schermo grande.</p>

        {error ? <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-sm font-semibold">{error}</div> : null}
        {requestMessage ? <div className="bg-purple-50 border border-purple-200 text-purple-700 rounded-xl p-3 mb-4 text-sm font-semibold">{requestMessage}</div> : null}

        <div className="flex flex-col gap-3">
          <button type="button" disabled={loading} onClick={() => void login()} className="btn-purple py-4 text-lg disabled:opacity-50">
            {loading ? 'Controllo accesso...' : 'Accedi con Google'}
          </button>
          {auth.currentUser && error ? (
            <button type="button" disabled={requesting} onClick={() => void requestAccess()} className="py-3 bg-gray-100 text-purple-700 font-black rounded-xl hover:bg-purple-100 active:scale-95 transition-all disabled:opacity-50">
              {requesting ? 'Invio...' : 'Richiedi accesso'}
            </button>
          ) : null}
          {auth.currentUser ? (
            <button type="button" onClick={() => void signOutFromGoogle()} className="py-3 border-2 border-gray-200 text-gray-600 font-black rounded-xl hover:bg-gray-50 active:scale-95 transition-all">
              Logout
            </button>
          ) : null}
        </div>
      </motion.div>

      <button onClick={() => nav('/')} className="text-purple-400 hover:text-white font-semibold text-sm transition-colors">← Torna alla home</button>
    </div>
  );
}
