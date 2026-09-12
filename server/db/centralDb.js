// centralDb.js — Central persistent database via Supabase Postgres
// Uses node-postgres (pg) Pool — every serverless container connects to the same external DB.
// Falls back to in-memory store when DATABASE_URL is not configured (local dev without Supabase).
import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = DATABASE_URL && !DATABASE_URL.includes('placeholder');

// Postgres connection pool (serverless-safe: transaction pooler URL from Supabase)
const pool = hasDb ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase pooler
  max: 5,                             // keep pool small for serverless
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
}) : null;

// ─── In-Memory Fallback (local dev only) ────
let memDb = { sessions: [], events: [], assessments: [], participants: [] };

// ─── Schema Bootstrap ────
let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured || !pool) return;
  schemaEnsured = true;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      participant_id TEXT,
      participant_name TEXT,
      participant_email TEXT,
      participant_age TEXT,
      condition TEXT,
      story_id TEXT,
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      status TEXT,
      version_snapshot JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      session_id TEXT,
      participant_id TEXT,
      event_type TEXT,
      event_timestamp TIMESTAMPTZ,
      data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS assessments (
      id SERIAL PRIMARY KEY,
      session_id TEXT,
      participant_id TEXT,
      condition TEXT,
      answers JSONB,
      score NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS participants (
      participant_id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      age_group TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Supabase schema ready');
}

export const centralDb = {

  async getDashboardData() {
    if (!pool) {
      return { sessions: memDb.sessions, events: memDb.events, assessments: memDb.assessments };
    }
    await ensureSchema();
    const [s, e, a] = await Promise.all([
      pool.query('SELECT * FROM sessions ORDER BY created_at DESC'),
      pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 5000'),
      pool.query('SELECT * FROM assessments ORDER BY created_at DESC'),
    ]);
    return { sessions: s.rows, events: e.rows, assessments: a.rows };
  },

  async saveSession(sessionData) {
    if (!pool) {
      const idx = memDb.sessions.findIndex(s => s.session_id === sessionData.session_id);
      if (idx >= 0) memDb.sessions[idx] = { ...memDb.sessions[idx], ...sessionData };
      else memDb.sessions.push(sessionData);
      return sessionData;
    }
    await ensureSchema();
    const {
      session_id, participant_id, participant_name, participant_email,
      participant_age, condition, story_id, start_time, end_time, status, version_snapshot
    } = sessionData;
    await pool.query(`
      INSERT INTO sessions
        (session_id, participant_id, participant_name, participant_email,
         participant_age, condition, story_id, start_time, end_time, status, version_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (session_id) DO UPDATE SET
        participant_name = EXCLUDED.participant_name,
        participant_email = EXCLUDED.participant_email,
        participant_age = EXCLUDED.participant_age,
        condition = EXCLUDED.condition,
        story_id = EXCLUDED.story_id,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        status = EXCLUDED.status,
        version_snapshot = EXCLUDED.version_snapshot
    `, [session_id, participant_id, participant_name, participant_email,
        participant_age, condition, story_id, start_time, end_time, status,
        version_snapshot ? JSON.stringify(version_snapshot) : null]);
    return sessionData;
  },

  async saveEvents(newEvents) {
    const eventArray = Array.isArray(newEvents) ? newEvents : [newEvents];
    if (!pool) {
      memDb.events.push(...eventArray);
      return eventArray.length;
    }
    await ensureSchema();
    for (const ev of eventArray) {
      await pool.query(
        `INSERT INTO events (session_id, participant_id, event_type, event_timestamp, data)
         VALUES ($1,$2,$3,$4,$5)`,
        [ev.session_id, ev.participant_id, ev.event_type,
         ev.timestamp || new Date().toISOString(),
         ev.data ? JSON.stringify(ev.data) : null]
      );
    }
    return eventArray.length;
  },

  async saveAssessments(newAssessments) {
    const assessArray = Array.isArray(newAssessments) ? newAssessments : [newAssessments];
    if (!pool) {
      memDb.assessments.push(...assessArray);
      return assessArray.length;
    }
    await ensureSchema();
    for (const a of assessArray) {
      await pool.query(
        `INSERT INTO assessments (session_id, participant_id, condition, answers, score)
         VALUES ($1,$2,$3,$4,$5)`,
        [a.session_id, a.participant_id, a.condition,
         a.answers ? JSON.stringify(a.answers) : null, a.score ?? null]
      );
    }
    return assessArray.length;
  },

  async getSessions() {
    if (!pool) return memDb.sessions;
    await ensureSchema();
    const r = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
    return r.rows;
  },

  async getEvents() {
    if (!pool) return memDb.events;
    await ensureSchema();
    const r = await pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 5000');
    return r.rows;
  },

  async getAssessments() {
    if (!pool) return memDb.assessments;
    await ensureSchema();
    const r = await pool.query('SELECT * FROM assessments ORDER BY created_at DESC');
    return r.rows;
  },

  async saveParticipant(participantData) {
    if (!pool) {
      const idx = memDb.participants.findIndex(p => p.participant_id === participantData.participant_id);
      if (idx < 0) memDb.participants.push(participantData);
      return participantData;
    }
    await ensureSchema();
    const { participant_id, name, email, age_group } = participantData;
    await pool.query(
      `INSERT INTO participants (participant_id, name, email, age_group)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (participant_id) DO NOTHING`,
      [participant_id, name, email, age_group]
    );
    return participantData;
  },

  async getParticipants() {
    if (!pool) return memDb.participants;
    await ensureSchema();
    const r = await pool.query('SELECT * FROM participants ORDER BY created_at DESC');
    return r.rows;
  },

  /** Count sessions to generate next participant ID */
  async countSessions() {
    if (!pool) return memDb.sessions.length;
    await ensureSchema();
    const r = await pool.query('SELECT COUNT(*) as count FROM sessions');
    return parseInt(r.rows[0].count, 10);
  }
};

export default centralDb;

