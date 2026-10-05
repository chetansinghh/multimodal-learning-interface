import React, { useState } from 'react';
import adminAuthService from '../../services/AdminAuthService';
import { useAuth } from '../../context/AuthContext';
import './AdminLoginModal.css';

export default function AdminLoginModal({ onComplete, sessionId }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setError(null);

    const res = await adminAuthService.login({ email, password, sessionId });
    setLoading(false);

    if (res.success) {
      login({
        token: res.token,
        user: { role: res.role, email: res.identity?.email, name: 'Admin' }
      });
      if (onComplete) onComplete({ role: res.role });
    } else {
      setError(res.error || 'Login failed.');
    }
  };

  return (
    <div className="signup-modal-card admin-login">
      <div className="signup-modal-header">
        <div className="modal-icon">🔐</div>
        <h2>Admin Portal Sign In</h2>
        <p>Enter your researcher email and password to access the console.</p>
      </div>

      <form onSubmit={handleLogin} className="signup-form">
        {error && <div className="error-msg">{error}</div>}
        
        <div className="form-group">
          <label>Admin Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        <button type="submit" className="submit-btn" disabled={!email || !password || loading} style={{ marginTop: '20px' }}>
          {loading ? 'Authenticating...' : 'Login to Console'}
        </button>
      </form>
    </div>
  );
}
