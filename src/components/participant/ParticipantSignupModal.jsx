// ParticipantSignupModal.jsx — Unified email OTP signup for both participants and admins
import React, { useState } from 'react';
import participantAuthService from '../../services/ParticipantAuthService';
import { useAuth } from '../../context/AuthContext';
import './ParticipantSignupModal.css';

export default function ParticipantSignupModal({ onComplete, initialCondition = 'C1', sessionId }) {
  const { login } = useAuth();
  const [step, setStep] = useState('register'); // 'register' | 'otp'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ageGroup, setAgeGroup] = useState('18-24');
  const [condition, setCondition] = useState(initialCondition);
  const [otpCode, setOtpCode] = useState('');
  const [otpToken, setOtpToken] = useState(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [devOtpCode, setDevOtpCode] = useState(null);

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Please provide your name and email address.');
      return;
    }
    setLoading(true);
    setError(null);

    const res = await participantAuthService.sendOTP({ name, email, ageGroup, condition });
    setLoading(false);

    if (res.success) {
      setOtpToken(res.otpToken);
      if (res.code) setDevOtpCode(res.code); // dev mode only
      setStep('otp');
    } else {
      setError(res.error);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    setError(null);

    const res = await participantAuthService.verifyOTP(otpToken, otpCode, sessionId);
    setLoading(false);

    if (res.success) {
      // Persist auth in global context
      login({
        token: res.token,
        user: {
          name: res.identity?.name || name,
          email: res.identity?.email || email,
          participant_id: res.participant_id,
          role: res.role,
          age_group: res.identity?.age_group || ageGroup,
          condition: res.identity?.condition || condition,
        }
      });
      onComplete({
        participant_id: res.participant_id,
        identity: res.identity,
        condition: res.identity?.condition || condition,
        token: res.token,
        role: res.role,
      });
    } else {
      setError(res.error);
      // Update otpToken with new attempt count from server
      if (res.newOtpToken) setOtpToken(res.newOtpToken);
      if (typeof res.attemptsRemaining === 'number') setAttemptsRemaining(res.attemptsRemaining);
    }
  };

  return (
    <div className="signup-modal-overlay">
      <div className="signup-modal-card">
        <div className="signup-modal-header">
          <div className="modal-icon">🎓</div>
          <h2>Study Participant Signup</h2>
          <p>Please enter your information to receive your email verification code.</p>
        </div>

        {error && <div className="modal-error-box">{error}</div>}

        {step === 'register' ? (
          <form onSubmit={handleRegisterSubmit} className="signup-form">
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Taylor"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.taylor@example.com"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group half">
                <label>Age Bracket</label>
                <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                  <option value="18-24">18 – 24</option>
                  <option value="25-34">25 – 34</option>
                  <option value="35-44">35 – 44</option>
                  <option value="45+">45+</option>
                </select>
              </div>

              <div className="form-group half">
                <label>Assigned Condition</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="C1">C1 – Simple Video</option>
                  <option value="C2">C2 – Spatial Audio</option>
                  <option value="C3">C3 – Interactive</option>
                  <option value="C4">C4 – VR Immersive</option>
                </select>
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Sending Code…' : '📩 Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="signup-form">
            {devOtpCode && (
              <div className="dev-otp-banner">
                <div className="banner-icon">📧</div>
                <div className="banner-text">
                  <span>Demo Mode — Verification Code:</span>
                  <div className="otp-highlight">{devOtpCode}</div>
                  <span className="banner-sub">Auto-generated for evaluator testing</span>
                </div>
                <button
                  type="button"
                  className="autofill-btn"
                  onClick={() => setOtpCode(devOtpCode)}
                >
                  Autofill
                </button>
              </div>
            )}

            <div className="otp-prompt">
              📩 Verification code sent to <strong>{email}</strong>.<br />
              <small style={{ color: 'var(--text-muted)' }}>
                {devOtpCode
                  ? 'Click "Autofill" or enter the 6-digit code above to proceed.'
                  : 'Please check your email inbox and enter the 6-digit code below.'}
              </small>
            </div>

            <div className="form-group">
              <label>Enter 6-Digit OTP Code</label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 849201"
                className="otp-input"
                autoFocus
              />
              {attemptsRemaining < 5 && attemptsRemaining > 0 && (
                <p className="attempts-hint">⚠️ {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining before you need to request a new code.</p>
              )}
            </div>

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Verifying…' : '✅ Verify & Begin Study'}
            </button>

            <button type="button" className="back-link" onClick={() => { setStep('register'); setError(null); setOtpToken(null); setAttemptsRemaining(5); }}>
              ← Change Email or Details
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
