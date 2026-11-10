// server/db/centralDb.js — Central Authoritative PostgreSQL Research Database
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { runMigrations } from './migrations/migrate.js';
import { scoreQuestionnaireSubmission } from '../services/questionnaireScoring.js';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'central_store.json');

// Ensure local data directory exists for backup mirroring
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.warn('Could not create data directory:', e);
  }
}

// ─── Local Disk Backup Store (Secondary Disaster Recovery Only) ────
let memDb = {
  sessions: [],
  events: [],
  assessments: [],
  participants: [],
  questionnaire_submissions: []
};

function isAyurveda(item) {
  if (!item) return false;
  const sid = String(item.story_id || item.storyId || '').toLowerCase();
  const sessId = String(item.session_id || item.sessionId || '').toLowerCase();
  if (sessId.includes('kite') || sessId.includes('lant') || sessId.includes('milo') ||
      sid.includes('kite') || sid.includes('lantern') || sid.includes('milo')) {
    return false;
  }
  return true;
}

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
    }
  }
} catch (err) {
  console.warn('Could not read local central_store.json backup:', err.message);
}

function persistBackupToDisk() {
  // Never attempt synchronous disk writes in serverless environment or when PostgreSQL is active
  if (process.env.VERCEL || pool) {
    return;
  }
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memDb, null, 2), 'utf8');
  } catch (err) {
    console.warn('Backup disk write error:', err.message);
  }
}

// ─── Authoritative PostgreSQL Connection Pool (Cached for Serverless Re-use) ────
const DATABASE_URL = process.env.DATABASE_URL;
const hasDb = !!(DATABASE_URL && !DATABASE_URL.includes('placeholder'));

let pool = globalThis.__pgPool || null;
let lastDbError = null;

if (!pool && hasDb) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  globalThis.__pgPool = pool;

  pool.on('error', (err) => {
    lastDbError = err.message;
    console.warn('⚠️ Supabase pool idle client warning:', err.message);
  });
}

// ─── Automated Migration Bootstrap ────
async function ensureSchema() {
  if (globalThis.__schemaEnsured || !pool) return;
  try {
    await runMigrations(pool);
    globalThis.__schemaEnsured = true;
    lastDbError = null;
    console.log('✅ Authoritative PostgreSQL schema and migrations verified successfully.');
  } catch (err) {
    lastDbError = err.message;
    console.error('⚠️ PostgreSQL schema bootstrap warning:', err.message);
  }
}

// Automatically initiate schema validation on startup
if (hasDb && pool && !globalThis.__schemaEnsured) {
  ensureSchema().catch(e => console.warn('Async schema check warning:', e.message));
}

/** Normalize database event rows into standard research event schema */
export function normalizeDbEvent(row) {
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
    story_id: row.story_id || rawData.story_id || 'ayurveda_intro_v1',
    event: evType,
    event_type: evType,
    category: row.category || rawData.category || 'general',
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

/** Normalize database questionnaire rows with numeric casting and case tolerance */
function normalizeDbQuestionnaire(row) {
  if (!row) return row;
  const num = (v) => (v !== null && v !== undefined && v !== '' ? Number(v) : null);
  return {
    ...row,
    Q1_raw: row.q1_raw || row.Q1_raw,
    Q2_raw: row.q2_raw || row.Q2_raw,
    Q3_raw: row.q3_raw || row.Q3_raw,
    Q4_raw: row.q4_raw || row.Q4_raw,
    Q5_raw: row.q5_raw || row.Q5_raw,
    Q6_raw: row.q6_raw || row.Q6_raw,
    Q7_raw: row.q7_raw || row.Q7_raw,
    Q8_raw: row.q8_raw || row.Q8_raw,
    q1_score: num(row.q1_score),
    q2_score: num(row.q2_score),
    q3_score: num(row.q3_score),
    q4_score: num(row.q4_score),
    q5_score: num(row.q5_score),
    q6_score: num(row.q6_score),
    q7_score: num(row.q7_score),
    q8_score: num(row.q8_score),
    Q1_score: num(row.q1_score),
    Q2_score: num(row.q2_score),
    Q3_score: num(row.q3_score),
    Q4_score: num(row.q4_score),
    Q5_score: num(row.q5_score),
    Q6_score: num(row.q6_score),
    Q7_score: num(row.q7_score),
    Q8_score: num(row.q8_score),
    knowledge_total: num(row.knowledge_total) ?? 0,
    Q9_verbatim: row.q9_verbatim || row.Q9_verbatim || '',
    q9_verbatim: row.q9_verbatim || row.Q9_verbatim || '',
    Q9_score: num(row.q9_score),
    q9_score: num(row.q9_score),
    Q10: num(row.q10),
    Q11: num(row.q11),
    Q12: num(row.q12),
    Q13: num(row.q13),
    q10: num(row.q10),
    q11: num(row.q11),
    q12: num(row.q12),
    q13: num(row.q13),
    C4_discomfort: num(row.c4_discomfort),
    c4_discomfort: num(row.c4_discomfort),
    completion_time_seconds: num(row.completion_time_seconds) ?? 0
  };
}

export const centralDb = {
  getPool() {
    return pool;
  },

  /** Authoritative Database Health Check */
  async healthCheck() {
    if (!hasDb || !pool) {
      return {
        connected: false,
        authoritative: false,
        mode: 'offline_local_disk',
        database: null,
        error: 'DATABASE_URL is not configured.'
      };
    }

    const start = Date.now();
    try {
      const res = await pool.query('SELECT NOW() as now, current_database() as db, version() as version');
      return {
        connected: true,
        authoritative: true,
        mode: 'postgresql',
        database: res.rows[0].db,
        server_time: res.rows[0].now,
        latency_ms: Date.now() - start,
        version: res.rows[0].version.split(' ')[0] + ' ' + res.rows[0].version.split(' ')[1]
      };
    } catch (err) {
      lastDbError = err.message;
      return {
        connected: false,
        authoritative: false,
        mode: 'offline_error',
        error: err.message,
        latency_ms: Date.now() - start
      };
    }
  },

  /** Retrieve full study dashboard data from PostgreSQL with fallback to backup */
  async getDashboardData() {
    if (pool) {
      try {
        await ensureSchema();

        const [sRes, aRes, qRes, eCountRes] = await Promise.all([
          pool.query('SELECT * FROM sessions ORDER BY created_at DESC'),
          pool.query('SELECT * FROM assessments ORDER BY created_at DESC'),
          pool.query('SELECT * FROM questionnaire_submissions ORDER BY created_at DESC').catch(() => ({ rows: [] })),
          pool.query('SELECT COUNT(*) as count FROM events')
        ]);

        const totalEventsCount = parseInt(eCountRes.rows[0]?.count || 0, 10);

        // Fetch up to 10,000 most recent events for live dashboard view
        const eRes = await pool.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 10000');
        const dbEvents = eRes.rows.map(normalizeDbEvent);

        return {
          connected: true,
          authoritative: true,
          mode: 'postgresql',
          sessions: sRes.rows,
          events: dbEvents,
          total_events_count: totalEventsCount,
          assessments: aRes.rows,
          questionnaire_submissions: qRes.rows.map(normalizeDbQuestionnaire)
        };
      } catch (err) {
        lastDbError = err.message;
        console.error('⚠️ PostgreSQL getDashboardData failed, reading local backup:', err.message);
      }
    }

    // Local disk backup fallback
    return {
      connected: false,
      authoritative: false,
      mode: 'local_disk_backup',
      error: lastDbError || 'Database connection unavailable',
      sessions: memDb.sessions,
      events: memDb.events.map(normalizeDbEvent),
      total_events_count: memDb.events.length,
      assessments: memDb.assessments,
      questionnaire_submissions: memDb.questionnaire_submissions
    };
  },

  /** Paginated event query supporting arbitrary dataset sizes */
  async getEventsPaginated({ limit = 1000, offset = 0, sessionId = null, condition = null, storyId = null } = {}) {
    if (!pool) {
      let filtered = [...memDb.events];
      if (sessionId) filtered = filtered.filter(e => e.session_id === sessionId);
      if (condition) filtered = filtered.filter(e => e.condition === condition);
      if (storyId) filtered = filtered.filter(e => e.story_id === storyId);
      const total = filtered.length;
      const rows = filtered.slice(offset, offset + limit).map(normalizeDbEvent);
      return { events: rows, total, limit, offset, has_more: offset + limit < total };
    }

    await ensureSchema();
    const whereClauses = [];
    const values = [];

    if (sessionId) {
      values.push(sessionId);
      whereClauses.push(`session_id = $${values.length}`);
    }
    if (condition) {
      values.push(condition);
      whereClauses.push(`condition = $${values.length}`);
    }
    if (storyId) {
      values.push(storyId);
      whereClauses.push(`story_id = $${values.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) as count FROM events ${whereSql}`, values);
    const total = parseInt(countRes.rows[0].count, 10);

    values.push(limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const dataRes = await pool.query(
      `SELECT * FROM events ${whereSql} ORDER BY id ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );

    const rows = dataRes.rows.map(normalizeDbEvent);
    return {
      events: rows,
      total,
      limit,
      offset,
      has_more: offset + limit < total
    };
  },

  /** Stream/batch all events to eliminate any hardcoded cap during exports */
  async getAllEvents({ sessionId = null, condition = null, storyId = null } = {}) {
    const all = [];
    const batchSize = 2500;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await this.getEventsPaginated({ limit: batchSize, offset, sessionId, condition, storyId });
      all.push(...page.events);
      offset += batchSize;
      hasMore = page.has_more;
    }

    return all;
  },

  /** Idempotent participant save */
  async saveParticipant(participantData) {
    if (!participantData || !participantData.participant_id) return participantData;

    // Backup to local disk
    const idx = memDb.participants.findIndex(p => p.participant_id === participantData.participant_id);
    if (idx < 0) memDb.participants.push(participantData);
    else memDb.participants[idx] = { ...memDb.participants[idx], ...participantData };
    persistBackupToDisk();

    if (pool) {
      await ensureSchema();
      const { participant_id, name, email, age_group } = participantData;
      await pool.query(
        `INSERT INTO participants (participant_id, name, email, age_group)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (participant_id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           age_group = EXCLUDED.age_group`,
        [participant_id, name || null, email || null, age_group || null]
      );
    }
    return participantData;
  },

  async getParticipants() {
    if (pool) {
      try {
        await ensureSchema();
        const r = await pool.query('SELECT * FROM participants ORDER BY created_at DESC');
        return r.rows;
      } catch (err) {
        console.error('getParticipants query error:', err.message);
      }
    }
    return memDb.participants;
  },

  /** Idempotent session save */
  async saveSession(sessionData) {
    if (!sessionData || !sessionData.session_id) return sessionData;

    // Backup to local memory & disk
    const idx = memDb.sessions.findIndex(s => s.session_id === sessionData.session_id);
    if (idx >= 0) memDb.sessions[idx] = { ...memDb.sessions[idx], ...sessionData };
    else memDb.sessions.unshift(sessionData);
    persistBackupToDisk();

    if (pool) {
      await ensureSchema();
      const {
        session_id, participant_id, participant_name, participant_email,
        participant_age, condition, story_id, start_time, end_time, status, version_snapshot
      } = sessionData;

      await pool.query(
        `INSERT INTO sessions
           (session_id, participant_id, participant_name, participant_email,
            participant_age, condition, story_id, start_time, end_time, status, version_snapshot)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (session_id) DO UPDATE SET
           participant_name = EXCLUDED.participant_name,
           participant_email = EXCLUDED.participant_email,
           participant_age = EXCLUDED.participant_age,
           condition = EXCLUDED.condition,
           story_id = EXCLUDED.story_id,
           start_time = COALESCE(sessions.start_time, EXCLUDED.start_time),
           end_time = EXCLUDED.end_time,
           status = EXCLUDED.status,
           version_snapshot = EXCLUDED.version_snapshot`,
        [
          session_id,
          participant_id || null,
          participant_name || null,
          participant_email || null,
          participant_age || null,
          condition || 'C1',
          story_id || 'ayurveda_intro_v1',
          start_time || new Date().toISOString(),
          end_time || null,
          status || 'active',
          version_snapshot ? JSON.stringify(version_snapshot) : null
        ]
      );
    }

    return sessionData;
  },

  async getSessions() {
    if (pool) {
      try {
        await ensureSchema();
        const r = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
        return r.rows;
      } catch (err) {
        console.error('getSessions error:', err.message);
      }
    }
    return memDb.sessions;
  },

  /** Idempotent event ingestion returning exact acknowledged event IDs */
  async saveEvents(newEvents) {
    const eventArray = Array.isArray(newEvents) ? newEvents : [newEvents];
    const savedIds = [];

    if (eventArray.length === 0) {
      return { count: 0, saved_event_ids: [] };
    }

    // Backup to local memory & disk
    for (const ev of eventArray) {
      if (!ev || (!ev.session_id && !ev.event_type && !ev.event)) continue;
      const eventId = ev.event_id || ('ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
      const existingIdx = memDb.events.findIndex(e => e.event_id === eventId);
      const record = { ...ev, event_id: eventId };
      if (existingIdx >= 0) memDb.events[existingIdx] = record;
      else memDb.events.push(record);
    }
    persistBackupToDisk();

    // Persist to Authoritative PostgreSQL
    if (pool) {
      await ensureSchema();
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Batch in groups of 100 rows per SQL statement for high throughput
        const validEvents = eventArray.filter(ev => ev && (ev.session_id || ev.event_type || ev.event));
        const BATCH_CHUNK = 100;

        for (let i = 0; i < validEvents.length; i += BATCH_CHUNK) {
          const slice = validEvents.slice(i, i + BATCH_CHUNK);
          const valueClauses = [];
          const params = [];
          let pIdx = 1;

          for (const ev of slice) {
            const eventType = ev.event_type || ev.event || 'UNKNOWN';
            const actualPayload = ev.payload !== undefined && ev.payload !== null
              ? ev.payload
              : (ev.data !== undefined && ev.data !== null ? ev.data : {});

            const timestampUtc = ev.timestamp_utc || (typeof ev.event_timestamp === 'string' && ev.event_timestamp.includes('T')
              ? ev.event_timestamp
              : (ev.wall_clock && typeof ev.wall_clock === 'string' && ev.wall_clock.includes('T') ? ev.wall_clock : new Date().toISOString()));

            const elapsedMs = typeof ev.elapsed_ms === 'number'
              ? Math.round(ev.elapsed_ms)
              : (typeof ev.timestamp === 'number' ? Math.round(ev.timestamp) : 0);

            const videoTimestamp = typeof ev.video_timestamp === 'number' ? ev.video_timestamp : 0;
            const eventId = ev.event_id || ('ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
            const targetId = ev.target_id || ev.object_id || null;
            const action = ev.action || null;
            const result = ev.result || 'completed';

            valueClauses.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},$${pIdx+11},$${pIdx+12},$${pIdx+13})`);
            params.push(
              eventId,
              ev.session_id,
              ev.participant_id || null,
              ev.condition || null,
              ev.story_id || 'ayurveda_intro_v1',
              eventType,
              timestampUtc,
              elapsedMs,
              videoTimestamp,
              targetId,
              action,
              result,
              JSON.stringify(actualPayload),
              JSON.stringify({ ...ev, payload: actualPayload })
            );
            pIdx += 14;
          }

          if (valueClauses.length > 0) {
            const sql = `
              INSERT INTO events (
                event_id, session_id, participant_id, condition, story_id,
                event_type, event_timestamp, elapsed_ms, video_timestamp,
                target_id, action, result, payload, data
              )
              VALUES ${valueClauses.join(',\n')}
              ON CONFLICT (event_id) DO UPDATE SET
                payload = EXCLUDED.payload,
                data = EXCLUDED.data,
                result = EXCLUDED.result,
                elapsed_ms = EXCLUDED.elapsed_ms,
                video_timestamp = EXCLUDED.video_timestamp
              RETURNING event_id
            `;
            const res = await client.query(sql, params);
            for (const r of res.rows) {
              if (r.event_id) savedIds.push(r.event_id);
            }
          }
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        lastDbError = err.message;
        console.error('PostgreSQL saveEvents transaction error:', err.message);
        throw err;
      } finally {
        client.release();
      }
    } else {
      // Offline mode: acknowledge local memory IDs
      eventArray.forEach(e => { if (e.event_id) savedIds.push(e.event_id); });
    }

    return {
      count: savedIds.length,
      saved_event_ids: savedIds
    };
  },

  async getEvents() {
    return this.getAllEvents();
  },

  /** Idempotent per-question assessment save */
  async saveAssessments(newAssessments) {
    const assessArray = Array.isArray(newAssessments) ? newAssessments : [newAssessments];
    if (assessArray.length === 0) return 0;

    // Backup to local memory & disk
    for (const a of assessArray) {
      if (!a) continue;
      const idx = memDb.assessments.findIndex(ma =>
        ma.session_id === a.session_id && (ma.question_id || ma.item_id) === (a.question_id || a.item_id)
      );
      if (idx >= 0) memDb.assessments[idx] = { ...memDb.assessments[idx], ...a };
      else memDb.assessments.push(a);
    }
    persistBackupToDisk();

    if (pool) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const a of assessArray) {
          await client.query(
            `INSERT INTO assessments (
               session_id, participant_id, condition, story_id, question_id,
               level, question_type, measure, given_answer, accuracy,
               response_time_ms, answer_changes, answers, score
             )
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              a.session_id,
              a.participant_id || null,
              a.condition || null,
              a.story_id || 'ayurveda_intro_v1',
              a.question_id || null,
              a.level || null,
              a.question_type || 'multiple_choice',
              a.measure || null,
              a.answer ?? a.given_answer ?? a.final_answer ?? null,
              a.accuracy ?? a.score ?? null,
              a.response_time_ms || 0,
              a.answer_changes || 0,
              a.answers ? JSON.stringify(a.answers) : null,
              a.score ?? a.accuracy ?? null
            ]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('saveAssessments error:', err.message);
        throw err;
      } finally {
        client.release();
      }
    }

    return assessArray.length;
  },

  async getAssessments() {
    if (pool) {
      try {
        await ensureSchema();
        const r = await pool.query('SELECT * FROM assessments ORDER BY id ASC');
        return r.rows;
      } catch (err) {
        console.error('getAssessments error:', err.message);
      }
    }
    return memDb.assessments;
  },

  /** Idempotent questionnaire submission save adhering to 29-column research protocol */
  async saveQuestionnaireSubmission(submission) {
    if (!submission || !submission.session_id) return submission;

    // Normalize and compute score if raw answers passed
    const item = (submission.knowledge_total === undefined && submission.answers)
      ? scoreQuestionnaireSubmission(submission)
      : { ...submission };

    item.q9_score = item.Q9_score ?? item.q9_score ?? null;
    item.Q9_score = item.q9_score;

    // Backup to local memory & disk
    const idx = memDb.questionnaire_submissions.findIndex(q => q.session_id === item.session_id);
    if (idx >= 0) memDb.questionnaire_submissions[idx] = { ...memDb.questionnaire_submissions[idx], ...item };
    else memDb.questionnaire_submissions.unshift(item);
    persistBackupToDisk();

    if (pool) {
      await ensureSchema();
      await pool.query(
        `INSERT INTO questionnaire_submissions (
           session_id, participant_id, condition, story_id,
           q1_raw, q2_raw, q3_raw, q4_raw, q5_raw, q6_raw, q7_raw, q8_raw,
           q1_score, q2_score, q3_score, q4_score, q5_score, q6_score, q7_score, q8_score,
           knowledge_total, q9_verbatim, q9_score, q10, q11, q12, q13,
           q10_understanding, q11_attention, q12_clarity, q13_recall, c4_discomfort,
           completion_time_seconds, technical_issue, missing_reason
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
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
           q9_score = COALESCE(questionnaire_submissions.q9_score, EXCLUDED.q9_score),
           q10 = EXCLUDED.q10,
           q11 = EXCLUDED.q11,
           q12 = EXCLUDED.q12,
           q13 = EXCLUDED.q13,
           q10_understanding = EXCLUDED.q10_understanding,
           q11_attention = EXCLUDED.q11_attention,
           q12_clarity = EXCLUDED.q12_clarity,
           q13_recall = EXCLUDED.q13_recall,
           c4_discomfort = EXCLUDED.c4_discomfort,
           completion_time_seconds = EXCLUDED.completion_time_seconds,
           technical_issue = EXCLUDED.technical_issue,
           missing_reason = EXCLUDED.missing_reason`,
        [
          item.session_id,
          item.participant_id || null,
          item.condition || null,
          item.story_id || 'ayurveda_intro_v1',
          item.Q1_raw || item.q1_raw || null,
          item.Q2_raw || item.q2_raw || null,
          item.Q3_raw || item.q3_raw || null,
          item.Q4_raw || item.q4_raw || null,
          item.Q5_raw || item.q5_raw || null,
          item.Q6_raw || item.q6_raw || null,
          item.Q7_raw || item.q7_raw || null,
          item.Q8_raw || item.q8_raw || null,
          item.Q1_score ?? item.q1_score ?? 0,
          item.Q2_score ?? item.q2_score ?? 0,
          item.Q3_score ?? item.q3_score ?? 0,
          item.Q4_score ?? item.q4_score ?? 0,
          item.Q5_score ?? item.q5_score ?? 0,
          item.Q6_score ?? item.q6_score ?? 0,
          item.Q7_score ?? item.q7_score ?? 0,
          item.Q8_score ?? item.q8_score ?? 0,
          item.knowledge_total ?? 0,
          item.Q9_verbatim || item.q9_verbatim || '',
          item.Q9_score ?? item.q9_score ?? null,
          item.Q10 ?? item.q10 ?? item.q10_understanding ?? null,
          item.Q11 ?? item.q11 ?? item.q11_attention ?? null,
          item.Q12 ?? item.q12 ?? item.q12_clarity ?? null,
          item.Q13 ?? item.q13 ?? item.q13_recall ?? null,
          item.Q10 ?? item.q10 ?? item.q10_understanding ?? null,
          item.Q11 ?? item.q11 ?? item.q11_attention ?? null,
          item.Q12 ?? item.q12 ?? item.q12_clarity ?? null,
          item.Q13 ?? item.q13 ?? item.q13_recall ?? null,
          item.C4_discomfort ?? item.c4_discomfort ?? null,
          item.completion_time_seconds ?? 0,
          item.technical_issue || null,
          item.missing_reason || null
        ]
      );
    }

    return item;
  },

  async getQuestionnaireSubmissions() {
    if (pool) {
      try {
        await ensureSchema();
        const r = await pool.query('SELECT * FROM questionnaire_submissions ORDER BY created_at DESC');
        return r.rows.map(normalizeDbQuestionnaire);
      } catch (err) {
        console.error('getQuestionnaireSubmissions error:', err.message);
      }
    }
    return memDb.questionnaire_submissions;
  },

  async updateQ9Score(sessionId, q9Score) {
    const scoreVal = parseInt(q9Score, 10);
    const entry = memDb.questionnaire_submissions.find(q => q.session_id === sessionId);
    if (entry) {
      entry.Q9_score = scoreVal;
      entry.q9_score = scoreVal;
      persistBackupToDisk();
    }

    if (pool) {
      await ensureSchema();
      const r = await pool.query(
        `UPDATE questionnaire_submissions SET q9_score = $1 WHERE session_id = $2 RETURNING *`,
        [scoreVal, sessionId]
      );
      return normalizeDbQuestionnaire(r.rows[0]) || entry;
    }
    return entry;
  },

  /** Combined research dataset joining participants, sessions, conditions, assessments, and questionnaire responses */
  async getCombinedResearchData({ condition = null, storyId = null, participantId = null } = {}) {
    if (pool) {
      try {
        await ensureSchema();
        const query = `
          SELECT 
            s.session_id,
            s.participant_id,
            p.name AS participant_name,
            p.age_range,
            p.email AS participant_email,
            s.condition,
            s.story_id,
            s.story_title,
            s.status AS session_status,
            s.start_time AS session_start,
            s.end_time AS session_end,
            q.q1_raw, q.q2_raw, q.q3_raw, q.q4_raw, q.q5_raw, q.q6_raw, q.q7_raw, q.q8_raw,
            q.q1_score, q.q2_score, q.q3_score, q.q4_score, q.q5_score, q.q6_score, q.q7_score, q.q8_score,
            q.knowledge_total,
            q.q9_verbatim,
            q.q9_score,
            q.q10, q.q11, q.q12, q.q13,
            q.c4_discomfort,
            q.completion_time_seconds,
            q.technical_issue,
            q.missing_reason,
            (SELECT COUNT(*) FROM events e WHERE e.session_id = s.session_id) AS total_events_count
          FROM sessions s
          LEFT JOIN participants p ON p.participant_id = s.participant_id
          LEFT JOIN questionnaire_submissions q ON q.session_id = s.session_id
          WHERE ($1::text IS NULL OR s.condition = $1)
            AND ($2::text IS NULL OR s.story_id = $2)
            AND ($3::text IS NULL OR s.participant_id = $3)
          ORDER BY s.created_at DESC
        `;
        const res = await pool.query(query, [condition, storyId, participantId]);
        return res.rows;
      } catch (err) {
        console.error('getCombinedResearchData error:', err.message);
      }
    }

    return memDb.sessions.map(s => {
      const p = memDb.participants.find(part => part.participant_id === s.participant_id) || {};
      const q = memDb.questionnaire_submissions.find(sub => sub.session_id === s.session_id) || {};
      const evCount = memDb.events.filter(e => e.session_id === s.session_id).length;
      return {
        session_id: s.session_id,
        participant_id: s.participant_id,
        participant_name: p.name || '',
        age_range: p.age_range || '',
        participant_email: p.email || '',
        condition: s.condition,
        story_id: s.story_id,
        story_title: s.story_title,
        session_status: s.status,
        session_start: s.start_time,
        session_end: s.end_time,
        ...q,
        total_events_count: evCount
      };
    });
  },

  async deleteSession(sessionId) {
    memDb.sessions = memDb.sessions.filter(s => s.session_id !== sessionId);
    memDb.events = memDb.events.filter(e => e.session_id !== sessionId);
    memDb.assessments = memDb.assessments.filter(a => a.session_id !== sessionId);
    memDb.questionnaire_submissions = memDb.questionnaire_submissions.filter(q => q.session_id !== sessionId);
    persistBackupToDisk();

    if (pool) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM events WHERE session_id = $1', [sessionId]);
        await client.query('DELETE FROM assessments WHERE session_id = $1', [sessionId]);
        await client.query('DELETE FROM questionnaire_submissions WHERE session_id = $1', [sessionId]);
        await client.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
    return { success: true };
  },

  async clearAll() {
    memDb = { sessions: [], events: [], assessments: [], participants: [], questionnaire_submissions: [] };
    persistBackupToDisk();

    if (pool) {
      await ensureSchema();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM events');
        await client.query('DELETE FROM assessments');
        await client.query('DELETE FROM questionnaire_submissions');
        await client.query('DELETE FROM sessions');
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    }
    return { success: true };
  },

  async countSessions() {
    if (pool) {
      try {
        await ensureSchema();
        const r = await pool.query('SELECT COUNT(*) as count FROM sessions');
        return parseInt(r.rows[0].count, 10);
      } catch (e) {
        console.error('countSessions error:', e.message);
      }
    }
    return memDb.sessions.length;
  }
};

export default centralDb;
