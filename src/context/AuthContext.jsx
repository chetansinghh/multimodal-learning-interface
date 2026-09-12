// AuthContext.jsx — Global authentication state for all roles (participant & admin)
import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'agy_session_token';
const USER_KEY  = 'agy_session_user';

function readSession() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const user  = JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
    if (token && user) return { token, user };
  } catch {}
  return null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readSession());

  const login = useCallback(({ token, user }) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    setSession({ token, user });
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      token: session?.token ?? null,
      user:  session?.user  ?? null,
      role:  session?.user?.role ?? null,
      isLoggedIn: !!session,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
