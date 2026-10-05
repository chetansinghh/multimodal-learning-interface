// AdminAuthService.js — Client service for Admin Email/Password Login
export const adminAuthService = {
  /** Log in to the Researcher Console using email and password */
  async login({ email, password, sessionId }) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, sessionId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

export default adminAuthService;
