// server.js — Express Backend API Server for Authentication & Multi-Device Central Sync
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import dotenv from 'dotenv';
import centralDb from './db/centralDb.js';
import { scoreQuestionnaireSubmission } from './services/questionnaireScoring.js';
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

// ─── Research Questionnaire Submission (Server-side Protected Scoring) ────
// NEVER reveals correct answers or scores to participant in response
app.post('/api/questionnaire/submit', async (req, res) => {
  try {
    const rawData = req.body || {};
    if (!rawData.session_id) {
      return res.status(400).json({ error: 'Missing session_id in submission payload.' });
    }

    // 1. Score submission on server using protected researcher rubric
    const scoredRecord = scoreQuestionnaireSubmission(rawData);

    // 2. Persist consolidated research questionnaire submission
    await centralDb.saveQuestionnaireSubmission(scoredRecord);

    // 3. For backward compatibility with existing reporting, also store per-question assessments
    const perQuestionEntries = [];
    for (let i = 1; i <= 8; i++) {
      const qId = `Q${i}`;
      perQuestionEntries.push({
        session_id: scoredRecord.session_id,
        participant_id: scoredRecord.participant_id,
        condition: scoredRecord.condition,
        story_id: scoredRecord.story_id,
        question_id: qId,
        level: 'recall_understand',
        question_type: 'multiple_choice',
        measure: 'conceptual',
        answer: scoredRecord[`${qId}_raw`],
        selected_position: scoredRecord[`${qId}_raw`],
        accuracy: scoredRecord[`${qId}_score`],
        final_answer: scoredRecord[`${qId}_raw`]
      });
    }

    // Q9 Open Response
    perQuestionEntries.push({
      session_id: scoredRecord.session_id,
      participant_id: scoredRecord.participant_id,
      condition: scoredRecord.condition,
      story_id: scoredRecord.story_id,
      question_id: 'Q9',
      level: 'main_message',
      question_type: 'open_response',
      measure: 'main_message',
      answer: scoredRecord.Q9_verbatim,
      final_answer: scoredRecord.Q9_verbatim
    });

    // Q10–Q13 Experience Items
    [10, 11, 12, 13].forEach(num => {
      const qId = `Q${num}`;
      if (scoredRecord[qId] !== null && scoredRecord[qId] !== undefined) {
        perQuestionEntries.push({
          session_id: scoredRecord.session_id,
          participant_id: scoredRecord.participant_id,
          condition: scoredRecord.condition,
          story_id: scoredRecord.story_id,
          question_id: qId,
          level: 'experience_survey',
          question_type: 'likert_1_5',
          measure: num === 10 ? 'perceived understanding' : num === 11 ? 'self-reported attention' : num === 12 ? 'perceived clarity/ease of following' : 'perceived recall',
          answer: scoredRecord[qId],
          final_answer: scoredRecord[qId]
        });
      }
    });

    // C4 Discomfort
    if (scoredRecord.condition === 'C4' && scoredRecord.C4_discomfort !== null) {
      perQuestionEntries.push({
        session_id: scoredRecord.session_id,
        participant_id: scoredRecord.participant_id,
        condition: scoredRecord.condition,
        story_id: scoredRecord.story_id,
        question_id: 'C4_discomfort',
        level: 'c4_discomfort',
        question_type: 'likert_1_5',
        measure: 'vr_discomfort',
        answer: scoredRecord.C4_discomfort,
        final_answer: scoredRecord.C4_discomfort
      });
    }

    await centralDb.saveAssessments(perQuestionEntries);

    // CRITICAL: Respond with ONLY neutral confirmation. Never reveal answers or score.
    return res.json({
      success: true,
      message: 'Your response has been recorded. Thank you.'
    });
  } catch (err) {
    console.error('Questionnaire submission failed:', err);
    return res.status(500).json({ error: 'Failed to record questionnaire response.' });
  }
});

// Researcher-only questionnaire dataset endpoint
app.get('/api/db/questionnaire-submissions', verifyAdminToken, async (req, res) => {
  const submissions = await centralDb.getQuestionnaireSubmissions();
  res.json(submissions);
});

// Researcher-only Q9 scoring endpoint
app.post('/api/db/questionnaire-submissions/:sessionId/q9-score', verifyAdminToken, async (req, res) => {
  const { sessionId } = req.params;
  const { q9_score } = req.body;
  const updated = await centralDb.updateQ9Score(sessionId, q9_score);
  res.json({ success: true, updated });
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

