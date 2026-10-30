// centralDb.js — Central persistent database with automatic Supabase Postgres & local disk fallback
// If Supabase is unavailable (e.g. project paused, invalid pooler URL, offline),
// automatically and seamlessly persists to server/data/central_store.json so NO DATA IS EVER LOST.
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'central_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create data directory:', e);
  }
}

// ─── Local Disk Store (Automatic persistent fallback) ────
let memDb = {
  sessions: [],
  events: [],
  assessments: [],
  participants: [],
  questionnaire_submissions: []
};

// Load existing disk data on startup
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      memDb = {
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        assessments: Array.isArray(parsed.assessments) ? parsed.assessments : [],
        participants: Array.isArray(parsed.participants) ? parsed.participants : [],
        questionnaire_submissions: Array.isArray(parsed.questionnaire_submissions) ? parsed.questionnaire_submissions : []
      };
      console.log(`📁 Loaded local persistent store from disk: ${memDb.sessions.length} sessions, ${memDb.events.length} events, ${memDb.questionnaire_submissions.length} questionnaires.`);
    }
  }
} catch (err) {
  console.warn('⚠️ Could not read central_store.json, initializing empty store:', err.message);
}

/** Safely persist in-memory database to disk */
function persistToDisk() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memDb, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write central_store.json to disk:', err);
  }
}

// ─── Postgres Connection Pool ────
const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = !!(DATABASE_URL && !DATABASE_URL.includes('placeholder'));

let pool = null;
let dbUnavailable = false;

if (hasDb) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.warn('⚠️ Supabase pool connection error, falling back to local disk store:', err.message);
      dbUnavailable = true;
    });
  } catch (e) {
    console.warn('⚠️ Failed to initialize Postgres pool, falling back to disk store:', e.message);
    dbUnavailable = true;
  }
}

// ─── Schema Bootstrap ────
let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured || !pool || dbUnavailable) return;
  try {
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
        event_id TEXT,
        session_id TEXT,
        participant_id TEXT,
        condition TEXT,
        story_id TEXT,
        event_type TEXT,
        event_timestamp TIMESTAMPTZ,
        elapsed_ms BIGINT,
        video_timestamp NUMERIC,
        target_id TEXT,
        action TEXT,
        result TEXT,
        payload JSONB,
        data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON events (event_id) WHERE event_id IS NOT NULL;

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

      CREATE TABLE IF NOT EXISTS questionnaire_submissions (
        session_id TEXT PRIMARY KEY,
        participant_id TEXT,
        condition TEXT,
        story_id TEXT,
        q1_raw TEXT,
        q2_raw TEXT,
        q3_raw TEXT,
        q4_raw TEXT,
        q5_raw TEXT,
        q6_raw TEXT,
        q7_raw TEXT,
        q8_raw TEXT,
        q1_score NUMERIC,
        q2_score NUMERIC,
        q3_score NUMERIC,
        q4_score NUMERIC,
        q5_score NUMERIC,
        q6_score NUMERIC,
        q7_score NUMERIC,
        q8_score NUMERIC,
        knowledge_total NUMERIC,
        q9_verbatim TEXT,
        q9_score NUMERIC,
        q10 NUMERIC,
        q11 NUMERIC,
        q12 NUMERIC,
        q13 NUMERIC,
        c4_discomfort NUMERIC,
        completion_time_seconds NUMERIC,
        technical_issue TEXT,
        missing_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    schemaEnsured = true;
    console.log('✅ Supabase schema ready with canonical event payload and timestamp support');
  } catch (err) {
    console.warn('⚠️ Supabase schema bootstrap failed, switching permanently to persistent disk store:', err.message);
    dbUnavailable = true;
  }
}

/** Helper to normalize database rows into canonical research event schema */
function normalizeDbEvent(row) {
  if (!row) return row;
  const rawData = row.data && typeof row.data === 'object' ? row.data : {};
  const payload = row.payload !== undefined && row.payload !== null
    ? row.payload
    : (rawData.payload !== undefined && rawData.payload !== null ? rawData.payload : (row.data || {}));

  const evType = row.event_type || row.event || rawData.event_type || rawData.event || 'UNKNOWN';
  const timestampUtc = row.event_timestamp
    ? new Date(row.event_timestamp).toISOString()
    : (rawData.timestamp_utc || rawData.wall_clock || new Date().toISOString());

  const elapsedMs = row.elapsed_ms != null
    ? Number(row.elapsed_ms)
    : (rawData.elapsed_ms != null ? Number(rawData.elapsed_ms) : (typeof rawData.timestamp === 'number' ? rawData.timestamp : 0));

  const videoTimestamp = row.video_timestamp != null
    ? Number(row.video_timestamp)
    : (rawData.video_timestamp != null ? Number(rawData.video_timestamp) : 0);

  return {
    ...rawData,
    ...row,
    id: row.id,
    event_id: row.event_id || rawData.event_id || ('ev_' + row.id),
    session_id: row.session_id || rawData.session_id,
    participant_id: row.participant_id || rawData.participant_id,
    condition: row.condition || rawData.condition,
    story_id: row.story_id || rawData.story_id,
    event: evType,
    event_type: evType,
    category: row.category || rawData.category,
    event_timestamp: timestampUtc,
    timestamp_utc: timestampUtc,
    elapsed_ms: elapsedMs,
    timestamp: elapsedMs,
    video_timestamp: videoTimestamp,
    target_id: row.target_id || rawData.target_id || rawData.object_id || null,
    object_id: rawData.object_id || row.target_id || null,
    action: row.action || rawData.action || null,
    result: row.result || rawData.result || 'completed',
    payload,
    data: rawData
  };
}

export const centralDb = {

  async getDashboardData() {
    if (!pool || dbUnavailable) {
      return {
        sessions: memDb.sessions,
        events: memDb.events.map(normalizeDbEvent),
        assessments: memDb.assessments,
        questionnaire_submissions: memDb.questionnaire_submissions
      };
    }

    try {
      await ensureSchema();
      const [s, e, a, q] = await Promise.all([
        pool.query('SELECT * FROM sessions ORDER BY created_at DESC'),
        pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 5000'),
        pool.query('SELECT * FROM assessments ORDER BY created_at DESC'),
        pool.query('SELECT * FROM questionnaire_submissions ORDER BY created_at DESC').catch(() => ({ rows: [] }))
      ]);

      // Merge server rows with local memDb to ensure no local writes were dropped
      const serverSessions = s.rows;
      const serverEvents = e.rows.map(normalizeDbEvent);
      const serverAssessments = a.rows;
      const serverQ = q.rows;

      memDb.sessions.forEach(ls => {
        if (!serverSessions.some(ss => ss.session_id === ls.session_id)) {
          serverSessions.push(ls);
        }
      });
      memDb.events.forEach(le => {
        if (!serverEvents.some(se => se.event_id === le.event_id || (se.session_id === le.session_id && se.elapsed_ms === le.elapsed_ms))) {
          serverEvents.push(le);
        }
      });
      memDb.assessments.forEach(la => {
        if (!serverAssessments.some(sa => sa.session_id === la.session_id && sa.question_id === la.question_id)) {
          serverAssessments.push(la);
        }
      });
      memDb.questionnaire_submissions.forEach(lq => {
        if (!serverQ.some(sq => sq.session_id === lq.session_id)) {
          serverQ.push(lq);
        }
      });

      return {
        sessions: serverSessions,
        events: serverEvents,
        assessments: serverAssessments,
        questionnaire_submissions: serverQ
      };
    } catch (err) {
      console.warn('⚠️ Supabase getDashboardData failed, falling back to disk store:', err.message);
      dbUnavailable = true;
      return {
        sessions: memDb.sessions,
        events: memDb.events.map(normalizeDbEvent),
        assessments: memDb.assessments,
        questionnaire_submissions: memDb.questionnaire_submissions
      };
    }
  },

  async saveSession(sessionData) {
    if (!sessionData || !sessionData.session_id) return sessionData;

    // Always update local persistent memory & disk
    const idx = memDb.sessions.findIndex(s => s.session_id === sessionData.session_id);
    if (idx >= 0) memDb.sessions[idx] = { ...memDb.sessions[idx], ...sessionData };
    else memDb.sessions.unshift(sessionData);
    persistToDisk();

    // Mirror to Postgres if reachable
    if (pool && !dbUnavailable) {
      try {
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
      } catch (err) {
        console.warn('⚠️ Postgres saveSession failed (stored safely on disk):', err.message);
        dbUnavailable = true;
      }
    }
    return sessionData;
  },

  async saveEvents(newEvents) {
    const eventArray = Array.isArray(newEvents) ? newEvents : [newEvents];
    let savedCount = 0;

    for (const ev of eventArray) {
      if (!ev || (!ev.session_id && !ev.event_type && !ev.event)) {
        continue;
      }

      const eventType = ev.event_type || ev.event || 'UNKNOWN';
      const actualPayload = ev.payload !== undefined && ev.payload !== null
        ? ev.payload
        : (ev.data !== undefined && ev.data !== null ? ev.data : {});

      const timestampUtc = ev.timestamp_utc || (typeof ev.timestamp === 'string' && ev.timestamp.includes('T')
        ? ev.timestamp
        : (ev.wall_clock && typeof ev.wall_clock === 'string' && ev.wall_clock.includes('T') ? ev.wall_clock : new Date().toISOString()));

      const elapsedMs = typeof ev.elapsed_ms === 'number'
        ? Math.round(ev.elapsed_ms)
        : (typeof ev.timestamp === 'number' ? Math.round(ev.timestamp) : 0);

      const videoTimestamp = typeof ev.video_timestamp === 'number' ? ev.video_timestamp : 0;
      const eventId = ev.event_id || ('ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
      const targetId = ev.target_id || ev.object_id || null;
      const action = ev.action || null;
      const result = ev.result || 'completed';

      // Always save to in-memory / disk store
      const existingIdx = memDb.events.findIndex(e =>
        (e.event_id && e.event_id === eventId) ||
        (e.session_id === ev.session_id && (e.event_type === eventType || e.event === eventType) && e.elapsed_ms === elapsedMs)
      );

      const record = {
        ...ev,
        event_id: eventId,
        event_type: eventType,
        event: eventType,
        event_timestamp: timestampUtc,
        timestamp_utc: timestampUtc,
        elapsed_ms: elapsedMs,
        timestamp: elapsedMs,
        video_timestamp: videoTimestamp,
        target_id: targetId,
        action,
        result,
        payload: actualPayload,
        data: { ...ev, payload: actualPayload }
      };

      if (existingIdx >= 0) {
        memDb.events[existingIdx] = record;
      } else {
        memDb.events.push(record);
      }
      savedCount++;

      // Mirror to Postgres if reachable
      if (pool && !dbUnavailable) {
        try {
          await ensureSchema();
          await pool.query(
            `INSERT INTO events (
               session_id, participant_id, event_type, event_timestamp, data,
               event_id, condition, story_id, elapsed_ms, video_timestamp, target_id, action, result, payload
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT (event_id) DO UPDATE SET
               payload = EXCLUDED.payload,
               data = EXCLUDED.data,
               result = EXCLUDED.result`,
            [
              ev.session_id,
              ev.participant_id,
              eventType,
              timestampUtc,
              JSON.stringify({ ...ev, payload: actualPayload }),
              eventId,
              ev.condition || null,
              ev.story_id || null,
              elapsedMs,
              videoTimestamp,
              targetId,
              action,
              result,
              JSON.stringify(actualPayload)
            ]
          );
        } catch (err) {
          console.warn('⚠️ Postgres saveEvents row failed (stored safely on disk):', err.message);
          dbUnavailable = true;
        }
      }
    }

    persistToDisk();
    return savedCount;
  },

  async saveAssessments(newAssessments) {
    const assessArray = Array.isArray(newAssessments) ? newAssessments : [newAssessments];
    
    // Save to disk store (deduplicate by session_id + question_id)
    for (const a of assessArray) {
      if (!a) continue;
      const idx = memDb.assessments.findIndex(ma =>
        ma.session_id === a.session_id && (ma.question_id || ma.item_id) === (a.question_id || a.item_id)
      );
      if (idx >= 0) {
        memDb.assessments[idx] = { ...memDb.assessments[idx], ...a };
      } else {
        memDb.assessments.push(a);
      }
    }
    persistToDisk();

    // Mirror to Postgres if reachable
    if (pool && !dbUnavailable) {
      try {
        await ensureSchema();
        for (const a of assessArray) {
          await pool.query(
            `INSERT INTO assessments (session_id, participant_id, condition, answers, score)
             VALUES ($1,$2,$3,$4,$5)`,
            [a.session_id, a.participant_id, a.condition,
             a.answers ? JSON.stringify(a.answers) : null, a.score ?? a.accuracy ?? null]
          );
        }
      } catch (err) {
        console.warn('⚠️ Postgres saveAssessments failed (stored safely on disk):', err.message);
        dbUnavailable = true;
      }
    }
    return assessArray.length;
  },

  async getSessions() {
    if (!pool || dbUnavailable) return memDb.sessions;
    try {
      await ensureSchema();
      const r = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
      return r.rows;
    } catch {
      return memDb.sessions;
    }
  },

  async getEvents() {
    if (!pool || dbUnavailable) return memDb.events.map(normalizeDbEvent);
    try {
      await ensureSchema();
      const r = await pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 5000');
      return r.rows.map(normalizeDbEvent);
    } catch {
      return memDb.events.map(normalizeDbEvent);
    }
  },

  async getAssessments() {
    if (!pool || dbUnavailable) return memDb.assessments;
    try {
      await ensureSchema();
      const r = await pool.query('SELECT * FROM assessments ORDER BY created_at DESC');
      return r.rows;
    } catch {
      return memDb.assessments;
    }
  },

  async saveParticipant(participantData) {
    const idx = memDb.participants.findIndex(p => p.participant_id === participantData.participant_id);
    if (idx < 0) memDb.participants.push(participantData);
    else memDb.participants[idx] = { ...memDb.participants[idx], ...participantData };
    persistToDisk();

    if (pool && !dbUnavailable) {
      try {
        await ensureSchema();
        const { participant_id, name, email, age_group } = participantData;
        await pool.query(
          `INSERT INTO participants (participant_id, name, email, age_group)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (participant_id) DO NOTHING`,
          [participant_id, name, email, age_group]
        );
      } catch (err) {
        dbUnavailable = true;
      }
    }
    return participantData;
  },

  async getParticipants() {
    if (!pool || dbUnavailable) return memDb.participants;
    try {
      await ensureSchema();
      const r = await pool.query('SELECT * FROM participants ORDER BY created_at DESC');
      return r.rows;
    } catch {
      return memDb.participants;
    }
  },

  async saveQuestionnaireSubmission(submission) {
    if (!submission || !submission.session_id) return submission;

    // Always update memDb & disk store
    const idx = memDb.questionnaire_submissions.findIndex(q => q.session_id === submission.session_id);
    if (idx >= 0) {
      memDb.questionnaire_submissions[idx] = { ...memDb.questionnaire_submissions[idx], ...submission };
    } else {
      memDb.questionnaire_submissions.unshift(submission);
    }
    persistToDisk();

    // Mirror to Postgres if reachable
    if (pool && !dbUnavailable) {
      try {
        await ensureSchema();
        await pool.query(
          `INSERT INTO questionnaire_submissions (
             session_id, participant_id, condition, story_id,
             q1_raw, q2_raw, q3_raw, q4_raw, q5_raw, q6_raw, q7_raw, q8_raw,
             q1_score, q2_score, q3_score, q4_score, q5_score, q6_score, q7_score, q8_score,
             knowledge_total, q9_verbatim, q9_score, q10, q11, q12, q13, c4_discomfort,
             completion_time_seconds, technical_issue, missing_reason
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
           ON CONFLICT (session_id) DO UPDATE SET
             participant_id = EXCLUDED.participant_id,
             condition = EXCLUDED.condition,
             story_id = EXCLUDED.story_id,
             q1_raw = EXCLUDED.q1_raw,
             q2_raw = EXCLUDED.q2_raw,
             q3_raw = EXCLUDED.q3_raw,
             q4_raw = EXCLUDED.q4_raw,
             q5_raw = EXCLUDED.q5_raw,
             q6_raw = EXCLUDED.q6_raw,
             q7_raw = EXCLUDED.q7_raw,
             q8_raw = EXCLUDED.q8_raw,
             q1_score = EXCLUDED.q1_score,
             q2_score = EXCLUDED.q2_score,
             q3_score = EXCLUDED.q3_score,
             q4_score = EXCLUDED.q4_score,
             q5_score = EXCLUDED.q5_score,
             q6_score = EXCLUDED.q6_score,
             q7_score = EXCLUDED.q7_score,
             q8_score = EXCLUDED.q8_score,
             knowledge_total = EXCLUDED.knowledge_total,
             q9_verbatim = EXCLUDED.q9_verbatim,
             q9_score = EXCLUDED.q9_score,
             q10 = EXCLUDED.q10,
             q11 = EXCLUDED.q11,
             q12 = EXCLUDED.q12,
             q13 = EXCLUDED.q13,
             c4_discomfort = EXCLUDED.c4_discomfort,
             completion_time_seconds = EXCLUDED.completion_time_seconds,
             technical_issue = EXCLUDED.technical_issue,
             missing_reason = EXCLUDED.missing_reason`,
          [
            submission.session_id, submission.participant_id, submission.condition, submission.story_id || 'ayurveda_intro_v1',
            submission.Q1_raw || submission.q1_raw, submission.Q2_raw || submission.q2_raw,
            submission.Q3_raw || submission.q3_raw, submission.Q4_raw || submission.q4_raw,
            submission.Q5_raw || submission.q5_raw, submission.Q6_raw || submission.q6_raw,
            submission.Q7_raw || submission.q7_raw, submission.Q8_raw || submission.q8_raw,
            submission.Q1_score ?? submission.q1_score ?? 0, submission.Q2_score ?? submission.q2_score ?? 0,
            submission.Q3_score ?? submission.q3_score ?? 0, submission.Q4_score ?? submission.q4_score ?? 0,
            submission.Q5_score ?? submission.q5_score ?? 0, submission.Q6_score ?? submission.q6_score ?? 0,
            submission.Q7_score ?? submission.q7_score ?? 0, submission.Q8_score ?? submission.q8_score ?? 0,
            submission.knowledge_total ?? 0, submission.Q9_verbatim || submission.q9_verbatim || '',
            submission.Q9_score ?? submission.q9_score ?? null,
            submission.Q10 ?? submission.q10 ?? null, submission.Q11 ?? submission.q11 ?? null,
            submission.Q12 ?? submission.q12 ?? null, submission.Q13 ?? submission.q13 ?? null,
            submission.C4_discomfort ?? submission.c4_discomfort ?? null,
            submission.completion_time_seconds ?? 0,
            submission.technical_issue || null,
            submission.missing_reason || null
          ]
        );
      } catch (err) {
        console.warn('⚠️ Postgres saveQuestionnaireSubmission failed (stored safely on disk):', err.message);
        dbUnavailable = true;
      }
    }
    return submission;
  },

  async getQuestionnaireSubmissions() {
    if (!pool || dbUnavailable) return memDb.questionnaire_submissions;
    try {
      await ensureSchema();
      const r = await pool.query('SELECT * FROM questionnaire_submissions ORDER BY created_at DESC');
      return r.rows;
    } catch {
      return memDb.questionnaire_submissions;
    }
  },

  async updateQ9Score(sessionId, q9Score) {
    const scoreVal = parseInt(q9Score, 10);
    const entry = memDb.questionnaire_submissions.find(q => q.session_id === sessionId);
    if (entry) {
      entry.Q9_score = scoreVal;
      entry.q9_score = scoreVal;
      persistToDisk();
    }

    if (pool && !dbUnavailable) {
      try {
        await ensureSchema();
        const r = await pool.query(
          `UPDATE questionnaire_submissions SET q9_score = $1 WHERE session_id = $2 RETURNING *`,
          [scoreVal, sessionId]
        );
        return r.rows[0] || entry;
      } catch (err) {
        dbUnavailable = true;
      }
    }
    return entry;
  },

  async deleteSession(sessionId) {
    memDb.sessions = memDb.sessions.filter(s => s.session_id !== sessionId);
    memDb.events = memDb.events.filter(e => e.session_id !== sessionId);
    memDb.assessments = memDb.assessments.filter(a => a.session_id !== sessionId);
    memDb.questionnaire_submissions = memDb.questionnaire_submissions.filter(q => q.session_id !== sessionId);
    persistToDisk();

    if (pool && !dbUnavailable) {
      try {
        await ensureSchema();
        await pool.query('DELETE FROM events WHERE session_id = $1', [sessionId]);
        await pool.query('DELETE FROM assessments WHERE session_id = $1', [sessionId]);
        await pool.query('DELETE FROM questionnaire_submissions WHERE session_id = $1', [sessionId]);
        await pool.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
      } catch (err) {
        dbUnavailable = true;
      }
    }
    return { success: true };
  },

  async clearAll() {
    memDb = { sessions: [], events: [], assessments: [], participants: [], questionnaire_submissions: [] };
    persistToDisk();
    if (pool && !dbUnavailable) {
      try {
        await ensureSchema();
        await pool.query('DELETE FROM events');
        await pool.query('DELETE FROM assessments');
        await pool.query('DELETE FROM questionnaire_submissions');
        await pool.query('DELETE FROM sessions');
      } catch (err) {
        dbUnavailable = true;
      }
    }
    return { success: true };
  },

  /** Count sessions to generate next participant ID */
  async countSessions() {
    if (!pool || dbUnavailable) return memDb.sessions.length;
    try {
      await ensureSchema();
      const r = await pool.query('SELECT COUNT(*) as count FROM sessions');
      return parseInt(r.rows[0].count, 10);
    } catch {
      return memDb.sessions.length;
    }
  }
};

export default centralDb;
