// server.js — Express Backend API Server for Authentication & Multi-Device Central Sync
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import centralDb from './db/centralDb.js';
import { loginRateLimiter, verifyAdminToken, verifySessionScope } from './middleware/authMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'agy_multimodal_research_jwt_secret_token_key_2026_x89!';
const EMAIL_MODE = process.env.VITE_EMAIL_MODE || 'dev';

app.use(cors());
app.use(express.json());

// In-memory active OTP store: email -> { code, expires, identity }
const activeOTPs = new Map();

// ─── Health Check Endpoint ────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server_time: new Date().toISOString(), mode: EMAIL_MODE });
});

// ─── Admin Login Endpoint (Server-Side Bcrypt Check) ────
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { admin_id, password } = req.body;
  if (!admin_id || !password) {
    return res.status(401).json({ error: 'Invalid admin ID or password.' });
  }

  let allowlist = [];
  try {
    allowlist = JSON.parse(process.env.ADMIN_ALLOWLIST_JSON || '[]');
  } catch (e) {
    console.error('Failed to parse ADMIN_ALLOWLIST_JSON from env:', e);
  }

  const entry = allowlist.find(a => a.admin_id === admin_id);
  if (!entry || !entry.password_hash) {
    // Single generic error message — no field leaking
    return res.status(401).json({ error: 'Invalid admin ID or password.' });
  }

  const isValid = await bcrypt.compare(password, entry.password_hash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid admin ID or password.' });
  }

  // Issue 2-hour Admin JWT Token
  const token = jwt.sign({ admin_id, isAdmin: true }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, admin_id, expires_in: 7200 });
});

// ─── Participant OTP Dispatch Endpoint (Resend Live Email Delivery) ────
app.post('/api/auth/send-otp', async (req, res) => {
  const { name, email, age_group, condition } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 10 * 60 * 1000; // 10 min

  activeOTPs.set(email.toLowerCase(), { code, expires, identity: { name, email, age_group, condition } });

  const emailMode = (process.env.VITE_EMAIL_MODE || process.env.EMAIL_MODE || 'live').toLowerCase();
  const resendApiKey = process.env.RESEND_API_KEY;

  if (emailMode === 'live' && resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'MultiModality Research <onboarding@resend.dev>',
          to: [email],
          subject: `Your Study Verification Code: ${code}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h2 style="color: #0d9488; margin-bottom: 12px;">Multi-Modality Learning Study</h2>
              <p style="font-size: 15px; color: #334155;">Hello <strong>${name || 'Participant'}</strong>,</p>
              <p style="font-size: 14px; color: #475569;">Your 6-digit verification code to join the study session is:</p>
              <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0284c7; background: #f0f9ff; padding: 16px; text-align: center; border-radius: 8px; margin: 20px 0;">
                ${code}
              </div>
              <p style="font-size: 13px; color: #64748b;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
            </div>
          `
        })
      });

      const resendData = await response.json();
      if (!response.ok) {
        console.error('Resend API Error:', resendData);
        return res.status(400).json({ error: resendData.message || 'Failed to send verification email via Resend.' });
      }

      console.log(`✅ [RESEND EMAIL DELIVERED] To: ${email} | Resend ID: ${resendData.id}`);
      return res.json({ success: true, mode: 'live', message: `Verification code sent to ${email}. Please check your inbox.` });
    } catch (err) {
      console.error('Resend API exception:', err);
      return res.status(500).json({ error: 'Network error sending verification email.' });
    }
  } else {
    console.log(`[DEV MODE] OTP for ${email}: ${code}`);
    return res.json({ success: true, mode: 'dev', code, message: `OTP generated for ${email}` });
  }
});

// ─── Participant OTP Verify Endpoint ────
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, code, sessionId } = req.body;
  const stored = activeOTPs.get(email?.toLowerCase());

  if (!stored) {
    return res.status(400).json({ error: 'No active OTP request found for this email. Please request a new code.' });
  }
  if (Date.now() > stored.expires) {
    activeOTPs.delete(email.toLowerCase());
    return res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
  }
  if (stored.code !== code.trim()) {
    return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
  }

  // Generate deterministic internal participant_id (e.g., P001, P002...)
  const allSessions = centralDb.getSessions();
  const nextNum = allSessions.length + 1;
  const participantId = `P${String(nextNum).padStart(3, '0')}`;

  // Issue Participant Session Token scoped strictly to their sessionId & participantId
  const token = jwt.sign({ participantId, sessionId, isAdmin: false }, JWT_SECRET, { expiresIn: '6h' });

  activeOTPs.delete(email.toLowerCase());

  res.json({
    success: true,
    token,
    participant_id: participantId,
    identity: stored.identity
  });
});

// ─── Protected Researcher Dashboard Data Endpoint (Requires Admin Token) ────
app.get('/api/db/dashboard-data', verifyAdminToken, (req, res) => {
  const data = centralDb.getDashboardData();
  res.json(data);
});

// ─── Protected Sessions Sync Endpoint ────
app.post('/api/db/sessions', verifySessionScope, (req, res) => {
  const session = centralDb.saveSession(req.body);
  res.json({ success: true, session });
});

// ─── Protected Events Sync Endpoint ────
app.post('/api/db/events', verifySessionScope, (req, res) => {
  const count = centralDb.saveEvents(req.body);
  res.json({ success: true, count });
});

// ─── Protected Assessments Endpoints ────
app.post('/api/db/assessments', verifySessionScope, (req, res) => {
  const count = centralDb.saveAssessments(req.body);
  res.json({ success: true, count });
});

app.get('/api/db/assessments', verifyAdminToken, (req, res) => {
  const assessments = centralDb.getAssessments();
  res.json(assessments);
});

app.listen(PORT, () => {
  console.log(`⚡ Central Study Backend Server running on http://localhost:${PORT}`);
});
