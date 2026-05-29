import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { I18nProvider } from './contexts/I18nContext';
import Home from './pages/Home';
import HostAuth from './pages/host/Auth';
import HostDashboard from './pages/host/Dashboard';
import GameHost from './pages/host/GameHost';
import QuestionsAdmin from './pages/host/QuestionsAdmin';
import Join from './pages/player/Join';
import Nickname from './pages/player/Nickname';
import GamePlayer from './pages/player/GamePlayer';
import RemoteController from './pages/remote/Controller';

function HostGuard({ children }: { children: ReactNode }) {
  const { loading, data } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center text-white font-black text-xl">
        Controllo accesso host...
      </div>
    );
  }

  return data ? children : <Navigate to="/host/login" replace />;
}

function LegacyRootRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const join = params.get('join');
    const presenter = params.get('presenter');
    const token = params.get('token');

    if (join) {
      navigate(`/play/${join.toUpperCase()}`, { replace: true });
      return;
    }

    if (presenter) {
      const search = token ? `?token=${encodeURIComponent(token)}` : '';
      navigate(`/remote/${presenter.toUpperCase()}${search}`, { replace: true });
    }
  }, [location.search, navigate]);

  return <Home />;
}

function PresenterLegacyRoute() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || params.get('session') || params.get('s');

  if (!code) return <Navigate to="/" replace />;
  return <GameHost sessionCode={code.toUpperCase()} />;
}

function HostGameRoute() {
  const params = useParams();
  if (!params.code) return <Navigate to="/host" replace />;
  return <GameHost sessionCode={params.code.toUpperCase()} />;
}

function RemoteRoute() {
  const params = useParams();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('token') || '';

  if (!params.code) return <Navigate to="/" replace />;
  return <RemoteController sessionCode={params.code.toUpperCase()} token={token} />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LegacyRootRedirect />} />
        <Route path="/host/login" element={<HostAuth />} />
        <Route path="/host" element={<HostGuard><HostDashboard /></HostGuard>} />
        <Route path="/host/admin/questions" element={<HostGuard><QuestionsAdmin /></HostGuard>} />
        <Route path="/host/game/:code" element={<HostGuard><HostGameRoute /></HostGuard>} />
        <Route path="/presenter" element={<PresenterLegacyRoute />} />
        <Route path="/remote/:code" element={<RemoteRoute />} />
        <Route path="/play" element={<Join />} />
        <Route path="/play/:code" element={<Nickname />} />
        <Route path="/play/:code/game/:playerId" element={<GamePlayer />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </I18nProvider>
  );
}
