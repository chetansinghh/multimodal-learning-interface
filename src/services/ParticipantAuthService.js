// ParticipantAuthService.js — Client service for Participant Email OTP Signup
export const participantAuthService = {
  /** Send OTP code to participant email — returns otpToken to pass into verifyOTP */
  async sendOTP({ name, email, ageGroup, condition }) {
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, age_group: ageGroup, condition })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP code.');
      // Returns { success, otpToken, code? (dev only), mode, message }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  /**
   * Verify OTP code using the otpToken returned by sendOTP.
   * On success returns { success, token, role, participant_id, identity }.
   * On failure returns { success: false, error, newOtpToken?, attemptsRemaining? }.
   */
  async verifyOTP(otpToken, code, sessionId) {
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpToken, code, sessionId })
      });
      const data = await res.json();
      if (!res.ok) {
        // Surface newOtpToken so UI can track remaining attempts
        return {
          success: false,
          error: data.error,
          newOtpToken: data.newOtpToken,
          attemptsRemaining: data.attemptsRemaining
        };
      }
      return data; // { success, token, role, participant_id, identity }
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
};

export default participantAuthService;
