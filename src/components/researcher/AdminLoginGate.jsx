// AdminLoginGate.jsx — Locks the Researcher Console behind server-side authentication
import React, { useState } from 'react';
import authService from '../../services/AuthService';
import './AdminLoginGate.css';

export default function AdminLoginGate({ children, onLoginSuccess }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated());
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!adminId.trim() || !password.trim()) {
      setError('Please fill in both fields.');
      return;
    }

    setLoading(true);
    setError(null);

    const res = await authService.login(adminId, password);
    setLoading(false);

    if (res.success) {
      setIsAuthenticated(true);
      if (onLoginSuccess) onLoginSuccess();
    } else {
      setError(res.error);
    }
  };

  const handleLogout = () => {
    authService.logout();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="login-gate-overlay">
        <div className="login-card">
          <div className="login-icon">🔒</div>
          <h2>Researcher Console Access</h2>
          <p className="login-subtitle">Please sign in with administrator credentials to view study analytics and export data.</p>

          <form onSubmit={handleLogin} className="login-form">
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="adminId">Admin ID</label>
              <input
                id="adminId"
                type="text"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                placeholder="Enter Admin ID"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password"
              />
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Authenticating…' : '🔑 Sign In to Console'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="authenticated-wrapper">
      <div className="admin-status-bar">
        <span className="admin-user-tag">👤 Signed in as <strong>{authService.getAdminId()}</strong></span>
        <button className="logout-btn" onClick={handleLogout}>🚪 Logout</button>
      </div>
      {children}
    </div>
  );
}
