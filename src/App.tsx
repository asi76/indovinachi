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
    const timer = window.setTimeout(() => setShowSplash(false), 1500);
    return () => window.clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="splash-shell">
        <div className="splash-mark">
          <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎭</div>
          <span className="splash-mark__eyebrow">The Party Presenta</span>
          <h1>Indovina Chi</h1>
          <p>Icebreaker festoso per scoprire qualcosa di inaspettato</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '24px' }}>
            <div style={{ width: '8px', height: '8px', background: '#ff6b9d', borderRadius: '50%', animation: 'bounce 1.4s ease-in-out infinite both' }} />
            <div style={{ width: '8px', height: '8px', background: '#ff6b9d', borderRadius: '50%', animation: 'bounce 1.4s ease-in-out infinite both', animationDelay: '-0.16s' }} />
            <div style={{ width: '8px', height: '8px', background: '#ff6b9d', borderRadius: '50%', animation: 'bounce 1.4s ease-in-out infinite both', animationDelay: '-0.32s' }} />
          </div>
          <style>{`@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`}</style>
        </div>
      </div>
    );
  }

  if (joinCode) return <PlayerJoinScreen sessionCode={joinCode.toUpperCase()} />;
  if (presenterScreenCode) return <PresenterDisplay sessionCode={presenterScreenCode.toUpperCase()} />;
  if (presenterCode) return <RemoteController sessionCode={presenterCode.toUpperCase()} token={presenterToken || ''} />;
  if (!authSession) return <AuthGate onAuthorized={setAuthSession} />;
  return <HostDashboard authSession={authSession} />;
}
