// AuthService.js — Client authentication service talking to server-side API endpoints
// Zero plaintext passwords, secret keys, or hash lists are stored in client JS bundles.

const TOKEN_KEY = 'agy_admin_session_token';
const ADMIN_ID_KEY = 'agy_admin_id';

export const authService = {
  /** Login against server endpoint /api/auth/login */
  async login(email, password, sessionId) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, sessionId })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid admin email or password.');
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem('agy_session_token', data.token);
      sessionStorage.setItem(ADMIN_ID_KEY, data.identity?.email || email);
      return { success: true, admin_id: data.identity?.email || email, token: data.token, role: 'admin' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /** Logout admin session */
  logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('agy_session_token');
    sessionStorage.removeItem(ADMIN_ID_KEY);
  },

  /** Get Bearer Token for Authorization header */
  getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem('agy_session_token') || sessionStorage.getItem('agy_participant_token');
  },

  /** Get current Admin ID */
  getAdminId() {
    return sessionStorage.getItem(ADMIN_ID_KEY);
  },

  /** Check if admin session token exists */
  isAuthenticated() {
    return !!(sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem('agy_session_token'));
  }
};

export default authService;
