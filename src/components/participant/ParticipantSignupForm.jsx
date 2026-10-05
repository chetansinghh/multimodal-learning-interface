import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function ParticipantSignupForm() {
  const { login } = useAuth();
  const navigate = useNavigate();
  
  const [name, setName] = useState('');
  const [ageGroup, setAgeGroup] = useState('12-13');
  const [consent, setConsent] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!name.trim() || !consent) return;

    const pid = `P_${name.replace(/\s+/g, '')}_${Date.now().toString().slice(-4)}`;
    
    // Create the user object for AuthContext
    const user = {
      name: name,
      participant_id: pid,
      role: 'participant',
      age_group: ageGroup,
      consent_acknowledged: true,
      consent_timestamp: new Date().toISOString()
    };

    // Log in locally (issues sessionStorage token)
    login({
      token: `pt_token_${pid}`,
      user: user
    });

    navigate('/participant');
  };

  return (
    <div className="signup-modal-card">
      <div className="signup-modal-header">
        <div className="modal-icon">🎓</div>
        <h2>Participant Study Setup</h2>
        <p>Please enter your details to begin the session.</p>
      </div>

      <form onSubmit={handleLogin} className="signup-form">
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
          <label>Age Bracket</label>
          <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            <option value="10-11">10 – 11</option>
            <option value="12-13">12 – 13</option>
            <option value="14-15">14 – 15</option>
          </select>
        </div>

        <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
          <input 
            type="checkbox" 
            id="consent" 
            checked={consent} 
            onChange={(e) => setConsent(e.target.checked)} 
            style={{ width: '20px', height: '20px' }}
          />
          <label htmlFor="consent" style={{ margin: 0, fontSize: '0.9rem', lineHeight: '1.4' }}>
            A parent/guardian has given permission for me to take part in this study
          </label>
        </div>

        <button type="submit" className="submit-btn" disabled={!consent || !name.trim()} style={{ marginTop: '20px' }}>
          Proceed to Portal
        </button>
      </form>
    </div>
  );
}
