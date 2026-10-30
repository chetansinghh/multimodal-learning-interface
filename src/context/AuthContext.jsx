// AuthContext.jsx — Global authentication state for all roles (participant & admin)
import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'agy_session_token';
const USER_KEY  = 'agy_session_user';
const ADMIN_TOKEN_KEY = 'agy_admin_session_token';
const ADMIN_ID_KEY = 'agy_admin_id';
const PARTICIPANT_TOKEN_KEY = 'agy_participant_token';

function readSession() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || sessionStorage.getItem(PARTICIPANT_TOKEN_KEY);
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
    if (user?.role === 'admin') {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      sessionStorage.setItem(ADMIN_ID_KEY, user.email || 'admin');
    } else {
      sessionStorage.setItem(PARTICIPANT_TOKEN_KEY, token);
    }
    setSession({ token, user });
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_ID_KEY);
    sessionStorage.removeItem(PARTICIPANT_TOKEN_KEY);
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
