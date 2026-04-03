import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api';

interface AuthState {
  token: string | null;
  username: string | null;
}

interface AuthContextValue {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'snn_token';
const USERNAME_KEY = 'snn_username';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: localStorage.getItem(TOKEN_KEY),
    username: localStorage.getItem(USERNAME_KEY),
  }));

  // Verify stored token on mount
  useEffect(() => {
    if (!auth.token) return;
    api.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${auth.token}` },
    }).catch(() => {
      // Token invalid or expired — clear it
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USERNAME_KEY);
      setAuth({ token: null, username: null });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(username: string, password: string) {
    const res = await api.post<{ token: string; username: string }>('/api/auth/login', {
      username,
      password,
    });
    const { token, username: returnedUsername } = res.data;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, returnedUsername);
    setAuth({ token, username: returnedUsername });
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setAuth({ token: null, username: null });
  }

  return (
    <AuthContext.Provider
      value={{
        token: auth.token,
        username: auth.username,
        isAuthenticated: !!auth.token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
