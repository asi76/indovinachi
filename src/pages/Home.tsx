import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, signInWithGoogle, signOutFromGoogle } from '../lib/firebase';
import { authorizeIndovinachiHost, requestIndovinachiAccess } from '../lib/auth';

export default function Home() {
  const nav = useNavigate();
  const location = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [requestMessage, setRequestMessage] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const join = params.get('join');
    const presenter = params.get('presenter');
    const token = params.get('token');
    if (join) nav(`/play/${join.toUpperCase()}`, { replace: true });
    if (presenter) nav(`/remote/${presenter.toUpperCase()}${token ? `?token=${encodeURIComponent(token)}` : ''}`, { replace: true });
  }, [location.search, nav]);

  async function loginHost() {
    setLoginLoading(true);
    setLoginError('');
    setRequestMessage('');
    try {
      const user = auth.currentUser || await signInWithGoogle();
      await authorizeIndovinachiHost(user);
      nav('/host');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Accesso non autorizzato');
    } finally {
      setLoginLoading(false);
    }
  }

  async function requestAccess() {
    setRequesting(true);
    setRequestMessage('');
    try {
      const payload = await requestIndovinachiAccess(auth.currentUser);
      setRequestMessage(payload.message || 'Richiesta inviata');
    } catch (error) {
      setRequestMessage(error instanceof Error ? error.message : 'Richiesta non inviata');
    } finally {
      setRequesting(false);
    }
  }

  async function logout() {
    await signOutFromGoogle().catch(() => undefined);
    setLoginError('');
    setRequestMessage('');
  }

  return (
    <div className="min-h-screen bg-purple-900 flex flex-col items-center justify-center gap-10 p-6">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="text-center"
      >
        <h1 className="text-7xl font-black text-white tracking-tight leading-none">
          Indovina<span className="text-yellow-400">Chi</span>
        </h1>
        <p className="text-purple-300 text-xl font-semibold mt-2">Party game per scoprire chi ha scritto cosa</p>
      </motion.div>

      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex flex-col gap-4 w-full max-w-xs"
      >
        <button
          onClick={() => nav('/play')}
          className="w-full py-6 bg-white text-purple-900 font-black text-2xl rounded-2xl shadow-xl hover:bg-purple-50 active:scale-95 transition-all"
        >
          Entra nel gioco
        </button>
        <button
          onClick={() => {
            setLoginOpen(true);
            setLoginError('');
            setRequestMessage('');
          }}
          className="w-full py-4 border-2 border-white text-white font-bold text-lg rounded-2xl hover:bg-white/10 active:scale-95 transition-all"
        >
          Accesso host
        </button>
      </motion.div>

      <p className="text-purple-300 text-sm font-semibold absolute bottom-6">The Party game room</p>

      {loginOpen ? (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLoginOpen(false)}>
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="card w-full max-w-md"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-2xl font-black text-gray-800 mb-3">Portale host</h2>
            <p className="text-gray-500 text-sm font-semibold mb-6">Accedi con Google per creare la sessione e aprire il maxischermo.</p>

            {loginError ? (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 mb-4 text-sm font-semibold">
                {loginError}
              </div>
            ) : null}

            {requestMessage ? (
              <div className="bg-purple-50 border border-purple-200 text-purple-700 rounded-xl p-3 mb-4 text-sm font-semibold">
                {requestMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <button type="button" disabled={loginLoading} onClick={loginHost} className="btn-purple py-4 text-lg disabled:opacity-50">
                {loginLoading ? 'Controllo accesso...' : 'Accedi con Google'}
              </button>
              {auth.currentUser && loginError ? (
                <button type="button" disabled={requesting} onClick={() => void requestAccess()} className="py-3 bg-gray-100 text-purple-700 font-black rounded-xl hover:bg-purple-100 active:scale-95 transition-all disabled:opacity-50">
                  {requesting ? 'Invio...' : 'Richiedi accesso'}
                </button>
              ) : null}
              {auth.currentUser ? (
                <button type="button" onClick={() => void logout()} className="py-3 border-2 border-gray-200 text-gray-600 font-black rounded-xl hover:bg-gray-50 active:scale-95 transition-all">
                  Logout
                </button>
              ) : null}
              <button type="button" onClick={() => setLoginOpen(false)} className="py-3 text-gray-500 font-bold hover:text-gray-800 transition-colors">
                Chiudi
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </div>
  );
}
