import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import ParticipantFlow from './components/participant/ParticipantFlow';
import ResearcherDashboard from './components/researcher/ResearcherDashboard';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

// ─── Header Avatar Dropdown ────────────────────────────────────────────
function UserAvatar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  const initials = (user.name || user.email || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const roleLabel = user.role === 'admin' ? '🔬 Researcher' : '🎓 Participant';

  return (
    <div className="user-avatar-wrap" ref={ref}>
      <button className="user-avatar-btn" onClick={() => setOpen(o => !o)} title={user.name || user.email}>
        <span className="avatar-initials">{initials}</span>
      </button>
      {open && (
        <div className="avatar-dropdown">
          <div className="dropdown-name">{user.name || user.email}</div>
          <div className="dropdown-role">{roleLabel}</div>
          <div className="dropdown-divider" />
          <button className="dropdown-logout" onClick={() => { logout(); navigate('/'); setOpen(false); }}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Global Header ────────────────────────────────────────────
function GlobalHeader() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <header className="global-header">
      <Link to="/" className="header-logo">
        <span className="logo-sparkle">✨</span>
        <span className="logo-text">MultiModality<span className="logo-accent">Lab</span></span>
      </Link>

      <div className="header-actions">
        <nav className="header-nav-links">
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Home</Link>
          <Link to="/participant" className={`nav-link ${location.pathname === '/participant' ? 'active' : ''}`}>Participant</Link>
          <Link to="/researcher" className={`nav-link ${location.pathname === '/researcher' ? 'active' : ''}`}>Researcher Console</Link>
        </nav>
        <button className="theme-toggle-btn" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}>
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
        <UserAvatar />
      </div>
    </header>
  );
}

// ─── Landing Page ────────────────────────────────────────────
function LandingPage() {
  return (
    <div className="landing-page">
      <div className="landing-bg" />
      <div className="landing-content">
        <div className="landing-hero">
          <div className="hero-badge">Stage 1 Research Prototype</div>
          <h1 className="hero-title">
            Multi-Modality<br />
            <span className="hero-accent shimmering">Learning Interface</span>
          </h1>
          <p className="hero-subtitle">
            A story-agnostic research platform supporting 4 experience conditions — Simple Video, Spatial Audio, Interactive, and VR Immersive — with integrated assessment, email OTP login, and server-side data sync.
          </p>

          <div className="landing-cards">
            <Link to="/participant" className="landing-card participant-card">
              <div className="card-icon">🎓</div>
              <h3>Participant Entry</h3>
              <p>Start a study session — register with email OTP, complete the guided demo, and view the story experience.</p>
              <div className="card-conditions">
                <span className="cond-chip">C1 Video</span>
                <span className="cond-chip">C2 Audio</span>
                <span className="cond-chip">C3 Interactive</span>
                <span className="cond-chip">C4 VR</span>
              </div>
              <span className="card-arrow">→</span>
            </Link>

            <Link to="/researcher" className="landing-card researcher-card">
              <div className="card-icon">🔬</div>
              <h3>Researcher Console</h3>
              <p>Study dashboard, server auth, multi-device analytics, story config management, and CSV exports.</p>
              <div className="card-features">
                <span className="feat-chip">🔒 Admin Auth</span>
                <span className="feat-chip">📊 Analytics</span>
                <span className="feat-chip">💾 Anonymized CSV</span>
              </div>
              <span className="card-arrow">→</span>
            </Link>
          </div>
        </div>

        <div className="landing-stories">
          <h2>Available Stories</h2>
          <div className="story-preview-grid">
            <div className="story-preview-card">
              <div className="story-card-banner water-banner">
                <span className="story-emoji">🌊</span>
              </div>
              <div className="story-card-body">
                <h4>The Journey of a Water Droplet</h4>
                <p>Water Cycle — 4 segments, 10 interactions, 8 assessment questions</p>
                <div className="story-segments">
                  <span style={{ background: '#FF6B35' }}>Evaporation</span>
                  <span style={{ background: '#4ECDC4' }}>Condensation</span>
                  <span style={{ background: '#45B7D1' }}>Precipitation</span>
                  <span style={{ background: '#96CEB4' }}>Collection</span>
                </div>
              </div>
            </div>

            <div className="story-preview-card">
              <div className="story-card-banner leaf-banner">
                <span className="story-emoji">🌿</span>
              </div>
              <div className="story-card-body">
                <h4>The Leaf Factory</h4>
                <p>Photosynthesis — 4 segments, 4 interactions, 4 assessment questions</p>
                <div className="story-segments">
                  <span style={{ background: '#FFD700' }}>Light</span>
                  <span style={{ background: '#00CED1' }}>Water</span>
                  <span style={{ background: '#32CD32' }}>Carbon</span>
                  <span style={{ background: '#FF6347' }}>Sugar</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="landing-footer">
          <p>Story-Agnostic Multi-Modality Learning Interface • Stage 1 Research Prototype</p>
        </footer>
      </div>
    </div>
  );
}

function AppContent() {
  return (
    <BrowserRouter>
      <GlobalHeader />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/participant" element={<ParticipantFlow />} />
        <Route path="/researcher" element={<ResearcherDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
