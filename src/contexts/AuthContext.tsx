import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import type { AuthSession } from '../types';
import { auth, onAuthStateChanged } from '../lib/firebase';
import { authorizeIndovinachiHost } from '../lib/auth';

interface AuthContextValue {
  loading: boolean;
  data: AuthSession | null;
}

const AuthContext = createContext<AuthContextValue>({ loading: true, data: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authData, setAuthData] = useState<AuthContextValue>({ loading: true, data: null });

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) {
      setAuthData({ loading: false, data: null });
      return;
    }

    try {
      const data = await authorizeIndovinachiHost(user);
      setAuthData({ loading: false, data });
    } catch {
      setAuthData({ loading: false, data: null });
    }
  }), []);

  return <AuthContext.Provider value={authData}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
