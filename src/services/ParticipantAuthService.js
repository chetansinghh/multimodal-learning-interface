// ParticipantAuthService.js — Client service for Participant Email OTP Signup
export const participantAuthService = {
  /** Send OTP code to participant email */
  async sendOTP({ name, email, ageGroup, condition }) {
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, age_group: ageGroup, condition })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP code.');
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /** Verify OTP code and receive participant session token + participant_id */
  async verifyOTP(email, code, sessionId) {
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, sessionId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed.');

      if (data.token) {
        sessionStorage.setItem('agy_participant_token', data.token);
        sessionStorage.setItem('agy_participant_id', data.participant_id);
      }

      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  getToken() {
    return sessionStorage.getItem('agy_participant_token');
  },

  getParticipantId() {
    return sessionStorage.getItem('agy_participant_id');
  }
};

export default participantAuthService;
