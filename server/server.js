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

// ─── Admin Email & Password Login ────
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { email, password, sessionId } = req.body;
  
  if (!email || !password) {
    return res.status(401).json({ error: 'Email and password required.' });
  }

  const role = resolveRole(email);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: not an admin email.' });
  }

  // Simple demo check for ease of use (accepts common demo passwords)
  const isDemoPassword = ['admin', 'password', 'admin123'].includes(password);
  
  if (!isDemoPassword) {
    // Attempt to verify against ADMIN_ALLOWLIST_JSON if they provided a real password
    let allowlist = [];
    try {
      allowlist = JSON.parse(process.env.ADMIN_ALLOWLIST_JSON || '[]');
    } catch (e) {
      console.error('Failed to parse ADMIN_ALLOWLIST_JSON:', e);
    }

    const entry = allowlist.find(a => a.admin_id === 'admin_primary');
    if (entry && entry.password_hash) {
      const isValid = await bcrypt.compare(password, entry.password_hash);
      if (!isValid) return res.status(401).json({ error: 'Invalid password.' });
    } else {
       return res.status(401).json({ error: 'Invalid password.' });
    }
  }

  const tokenPayload = { 
    participantId: 'ADMIN', 
    sessionId: sessionId || 'admin_session', 
    isAdmin: true, 
    role: 'admin', 
    email 
  };
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '6h' });

  res.json({ success: true, token, role: 'admin', identity: { email } });
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

