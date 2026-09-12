// server.js — Express Backend API Server for Authentication & Multi-Device Central Sync
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import dotenv from 'dotenv';
import centralDb from './db/centralDb.js';
import { loginRateLimiter, otpVerifyRateLimiter, verifyAdminToken, verifySessionScope } from './middleware/authMiddleware.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'agy_multimodal_research_jwt_secret_token_key_2026_x89!';
const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || 'local_dev_otp_hash_secret_not_for_production';
const EMAIL_MODE = (process.env.VITE_EMAIL_MODE || process.env.EMAIL_MODE || 'live').toLowerCase();

app.use(cors());
app.use(express.json());

/** HMAC-SHA256 hash of OTP code — secret never leaves server */
function hashCode(code) {
  return createHmac('sha256', OTP_HASH_SECRET).update(String(code)).digest('hex');
}

/** Determine role from email against ADMIN_EMAIL_ALLOWLIST env var or default admin emails */
function resolveRole(email) {
  const defaultAdmins = ['chetan24162@iiitd.ac.in', 'admin@example.com', 'your-admin-email@example.com'];
  const list = (process.env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const allAdmins = [...defaultAdmins, ...list];
  return allAdmins.includes(email.toLowerCase()) ? 'admin' : 'participant';
}

// ─── Health Check ────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server_time: new Date().toISOString(), mode: EMAIL_MODE });
});

// ─── Admin Password Login ────
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { admin_id, password } = req.body;
  if (!admin_id || !password) {
    return res.status(401).json({ error: 'Invalid admin ID or password.' });
  }

  let allowlist = [];
  try {
    allowlist = JSON.parse(process.env.ADMIN_ALLOWLIST_JSON || '[]');
  } catch (e) {
    console.error('Failed to parse ADMIN_ALLOWLIST_JSON:', e);
  }

  const entry = allowlist.find(a => a.admin_id === admin_id);
  if (!entry || !entry.password_hash) {
    return res.status(401).json({ error: 'Invalid admin ID or password.' });
  }

  const isValid = await bcrypt.compare(password, entry.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid admin ID or password.' });
  }

  const token = jwt.sign({ admin_id, isAdmin: true, role: 'admin' }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, admin_id, expires_in: 7200 });
});

// ─── Participant OTP Send ────
app.post('/api/auth/send-otp', async (req, res) => {
  const { name, email, age_group, condition } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = hashCode(code);
  const identity = { name, email, age_group, condition };

  // JWT-signed OTP token — codeHash embedded, raw code NEVER in payload
  const otpToken = jwt.sign(
    { email: email.toLowerCase().trim(), codeHash, attempts: 0, identity },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  const resendApiKey = process.env.RESEND_API_KEY;

  if (EMAIL_MODE === 'live' && resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'MultiModality Research <onboarding@resend.dev>',
          to: [email],
          subject: `Your Study Verification Code: ${code}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #0d9488; margin-bottom: 12px;">Multi-Modality Learning Study</h2>
              <p style="font-size: 15px; color: #334155;">Hello <strong>${name || 'Participant'}</strong>,</p>
              <p style="font-size: 14px; color: #475569;">Your 6-digit verification code is:</p>
              <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0284c7; background: #f0f9ff; padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
                ${code}
              </div>
              <p style="font-size: 13px; color: #64748b;">This code expires in 10 minutes. If you did not request this, ignore this email.</p>
            </div>
          `
        })
      });
      const resendData = await response.json();
      if (!response.ok) {
        console.error('Resend API Error:', resendData);
        return res.status(400).json({ error: resendData.message || 'Failed to send verification email.' });
      }
      console.log(`✅ [RESEND] To: ${email} | ID: ${resendData.id}`);
      return res.json({ success: true, mode: 'live', otpToken, message: `Verification code sent to ${email}.` });
    } catch (err) {
      console.error('Resend exception:', err);
      return res.status(500).json({ error: 'Network error sending verification email.' });
    }
  } else {
    // Dev mode: expose code directly for evaluator testing
    console.log(`[DEV MODE] OTP for ${email}: ${code}`);
    return res.json({ success: true, mode: 'dev', otpToken, code, message: `OTP generated for ${email}` });
  }
});

// ─── Participant OTP Verify ────
app.post('/api/auth/verify-otp', otpVerifyRateLimiter, async (req, res) => {
  const { otpToken, code, sessionId } = req.body;

  if (!otpToken || !code) {
    return res.status(400).json({ error: 'Missing OTP token or code.' });
  }

  // Verify JWT signature & expiry
  let payload;
  try {
    payload = jwt.verify(otpToken, JWT_SECRET);
  } catch (err) {
    return res.status(400).json({ error: 'Verification code expired or invalid. Please request a new code.' });
  }

  const { email, codeHash, attempts, identity } = payload;

  // Dev mode bypass — accept any 6-digit code
  const isDev = EMAIL_MODE === 'dev';

  // Check per-token attempt cap (UX feedback — IP rate limiter is the real security boundary)
  if (!isDev && attempts >= 5) {
    return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
  }

  // HMAC compare — prevents offline precompute attacks
  const submittedHash = hashCode(code.trim());
  const codeMatches = isDev ? (code.trim().length === 6) : (submittedHash === codeHash);

  if (!codeMatches) {
    const newAttempts = attempts + 1;
    const attemptsRemaining = Math.max(0, 5 - newAttempts);
    // Re-sign token with incremented attempt count so UI can show remaining attempts
    const newOtpToken = jwt.sign(
      { email, codeHash, attempts: newAttempts, identity },
      JWT_SECRET,
      { expiresIn: Math.max(0, (payload.exp - Math.floor(Date.now() / 1000))) + 's' }
    );
    return res.status(400).json({
      error: attemptsRemaining > 0
        ? `Incorrect code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`
        : 'Too many incorrect attempts. Please request a new code.',
      newOtpToken,
      attemptsRemaining
    });
  }

  // ─── Code verified — determine role & issue session token ────
  const role = resolveRole(email);
  const sessionCount = await centralDb.countSessions();
  const participantId = `P${String(sessionCount + 1).padStart(3, '0')}`;

  const tokenPayload = role === 'admin'
    ? { participantId, sessionId, isAdmin: true, role: 'admin', email }
    : { participantId, sessionId, isAdmin: false, role: 'participant', email };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '6h' });

  // Save participant directory entry (name/email → participantId mapping)
  await centralDb.saveParticipant({
    participant_id: participantId,
    name: identity?.name || '',
    email: email,
    age_group: identity?.age_group || ''
  });

  res.json({
    success: true,
    token,
    role,
    participant_id: participantId,
    identity: { ...identity, email }
  });
});

// ─── Participant Directory (Admin Only) ────
app.get('/api/db/participants', verifyAdminToken, async (req, res) => {
  const participants = await centralDb.getParticipants();
  res.json(participants);
});

// ─── Dashboard Data (Admin Only) ────
app.get('/api/db/dashboard-data', verifyAdminToken, async (req, res) => {
  const data = await centralDb.getDashboardData();
  res.json(data);
});

// ─── Sessions Sync ────
app.post('/api/db/sessions', verifySessionScope, async (req, res) => {
  const session = await centralDb.saveSession(req.body);
  res.json({ success: true, session });
});

// ─── Events Sync ────
app.post('/api/db/events', verifySessionScope, async (req, res) => {
  const count = await centralDb.saveEvents(req.body);
  res.json({ success: true, count });
});

// ─── Assessments Sync ────
app.post('/api/db/assessments', verifySessionScope, async (req, res) => {
  const count = await centralDb.saveAssessments(req.body);
  res.json({ success: true, count });
});

app.get('/api/db/assessments', verifyAdminToken, async (req, res) => {
  const assessments = await centralDb.getAssessments();
  res.json(assessments);
});

// Global JSON error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`⚡ Central Study Backend running on http://localhost:${PORT}`);
  });
}

export default app;

