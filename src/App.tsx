import { useEffect, useMemo, useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { HostDashboard } from './components/HostDashboard';
import { PlayerJoinScreen } from './components/PlayerJoinScreen';
import { PresenterDisplay } from './components/PresenterDisplay';
import { RemoteController } from './components/RemoteController';
import type { AuthSession } from './types';

export default function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [showSplash, setShowSplash] = useState(true);

  const joinCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join');
  }, []);

  const presenterCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('presenter');
  }, []);

  const presenterScreenCode = useMemo(() => {
    if (window.location.pathname !== '/presenter') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('code') || params.get('s') || params.get('session');
  }, []);

  const presenterToken = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="app-shell splash-shell">
        <div className="splash-mark">
          <span className="splash-mark__eyebrow">THE PARTY PRESENTA</span>
          <h1>Indovina Chi</h1>
          <p>Icebreaker festoso per scoprire qualcosa di inaspettato.</p>
        </div>
      </div>
    );
  }

  if (joinCode) {
    return <PlayerJoinScreen sessionCode={joinCode.toUpperCase()} />;
  }

  if (presenterScreenCode) {
    return <PresenterDisplay sessionCode={presenterScreenCode.toUpperCase()} />;
  }

  if (presenterCode) {
    return <RemoteController sessionCode={presenterCode.toUpperCase()} token={presenterToken || ''} />;
  }

  if (!authSession) {
    return <AuthGate onAuthorized={setAuthSession} />;
  }

  return <HostDashboard authSession={authSession} />;
}
