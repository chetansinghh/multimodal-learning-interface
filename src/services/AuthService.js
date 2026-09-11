// AuthService.js — Client authentication service talking to server-side API endpoints
// Zero plaintext passwords, secret keys, or hash lists are stored in client JS bundles.

const TOKEN_KEY = 'agy_admin_session_token';
const ADMIN_ID_KEY = 'agy_admin_id';

export const authService = {
  /** Login against server endpoint /api/auth/login */
  async login(admin_id, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid admin ID or password.');
      }

      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(ADMIN_ID_KEY, data.admin_id);
      return { success: true, admin_id: data.admin_id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /** Logout admin session */
  logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_ID_KEY);
  },

  /** Get Bearer Token for Authorization header */
  getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  },

  /** Get current Admin ID */
  getAdminId() {
    return sessionStorage.getItem(ADMIN_ID_KEY);
  },

  /** Check if admin session token exists */
  isAuthenticated() {
    return !!sessionStorage.getItem(TOKEN_KEY);
  }
};

export default authService;
