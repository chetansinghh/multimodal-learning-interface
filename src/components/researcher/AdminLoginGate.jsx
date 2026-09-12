// AdminLoginGate.jsx — Guards Researcher Console behind admin role check via AuthContext
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './AdminLoginGate.css';

export default function AdminLoginGate({ children }) {
  const { role, user, isLoggedIn } = useAuth();

  if (!isLoggedIn) {
    return (
      <div className="login-gate-overlay">
        <div className="login-card">
          <div className="login-icon">🔒</div>
          <h2>Authentication Required</h2>
          <p className="login-subtitle">
            Please log in from the home page to access the Researcher Console.
          </p>
          <a href="/" className="login-btn" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
            ← Go to Login
          </a>
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="login-gate-overlay">
        <div className="login-card">
          <div className="login-icon">⛔</div>
          <h2>Access Denied</h2>
          <p className="login-subtitle">
            Your account (<strong>{user?.email}</strong>) does not have researcher console access.
            Please contact your study administrator.
          </p>
          <a href="/" className="login-btn" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
            ← Return Home
          </a>
        </div>
      </div>
    );
  }

  return children;
}

