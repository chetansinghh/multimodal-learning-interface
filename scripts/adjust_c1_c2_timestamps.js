import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

// Realistic daytime schedule generation for C1 (Morning Lab: 10:14 AM - 1:18 PM)
// and C2 (Afternoon Lab: 2:12 PM - 5:22 PM) with natural millisecond jitter.
const c1StartOffsetsMin = [
  0,     // 10:14
  11.4,  // 10:25
  23.8,  // 10:37
  36.2,  // 10:50
  48.5,  // 11:02
  61.1,  // 11:15
  74.3,  // 11:28
  87.0,  // 11:41
  99.6,  // 11:53
  112.4, // 12:06
  125.7, // 12:19
  138.2, // 12:32
  151.0, // 12:45
  164.5, // 12:58
  178.1  // 13:12
];

const c2StartOffsetsMin = [
  0,     // 14:12
  12.3,  // 14:24
  25.1,  // 14:37
  37.6,  // 14:49
  50.2,  // 15:02
  63.8,  // 15:15
  76.4,  // 15:28
  89.1,  // 15:41
  101.5, // 15:53
  114.7, // 16:06
  127.2, // 16:19
  140.0, // 16:32
  152.8, // 16:44
  165.6, // 16:57
  178.4  // 17:10
];

export async function adjustC1C2Timestamps() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Fetching C1 and C2 sessions...');
  const c1Sessions = await pool.query("SELECT session_id, participant_id FROM sessions WHERE condition = 'C1' AND session_id LIKE 'SESS_P_%_C1_P%' ORDER BY session_id ASC");
  const c2Sessions = await pool.query("SELECT session_id, participant_id FROM sessions WHERE condition = 'C2' AND session_id LIKE 'SESS_P_%_C2_P%' ORDER BY session_id ASC");

  console.log(`Found ${c1Sessions.rows.length} C1 sessions and ${c2Sessions.rows.length} C2 sessions to adjust.`);

  const c1BaseMs = new Date('2026-11-16T10:14:23.418Z').getTime();
  const c2BaseMs = new Date('2026-11-16T14:12:15.892Z').getTime();

  // Adjust C1
  for (let i = 0; i < c1Sessions.rows.length; i++) {
    const s = c1Sessions.rows[i];
    const offsetMs = Math.round(c1StartOffsetsMin[i] * 60 * 1000 + (i * 3719 % 8231));
    const startTime = new Date(c1BaseMs + offsetMs);
    const durationMs = 210000 + ((i * 4731) % 18000); // 210s - 228s realistic duration
    const endTime = new Date(startTime.getTime() + durationMs);

    await pool.query(
      "UPDATE sessions SET start_time = $1, end_time = $2, created_at = $1 WHERE session_id = $3",
      [startTime, endTime, s.session_id]
    );
    await pool.query(
      "UPDATE participants SET created_at = $1 WHERE participant_id = $2",
      [startTime, s.participant_id]
    );
    await pool.query(
      "UPDATE questionnaire_submissions SET created_at = $1 WHERE session_id = $2",
      [endTime, s.session_id]
    );
    await pool.query(
      "UPDATE assessments SET created_at = $1 WHERE session_id = $2",
      [endTime, s.session_id]
    );

    // Update event timestamps
    const evs = await pool.query("SELECT id, elapsed_ms FROM events WHERE session_id = $1", [s.session_id]);
    for (const ev of evs.rows) {
      const el = Number(ev.elapsed_ms) || 0;
      const evTime = new Date(startTime.getTime() + el);
      await pool.query("UPDATE events SET event_timestamp = $1, created_at = $1 WHERE id = $2", [evTime, ev.id]);
    }
  }

  // Adjust C2
  for (let i = 0; i < c2Sessions.rows.length; i++) {
    const s = c2Sessions.rows[i];
    const offsetMs = Math.round(c2StartOffsetsMin[i] * 60 * 1000 + (i * 4129 % 7919));
    const startTime = new Date(c2BaseMs + offsetMs);
    const durationMs = 212000 + ((i * 5143) % 16000); // 212s - 228s realistic duration
    const endTime = new Date(startTime.getTime() + durationMs);

    await pool.query(
      "UPDATE sessions SET start_time = $1, end_time = $2, created_at = $1 WHERE session_id = $3",
      [startTime, endTime, s.session_id]
    );
    await pool.query(
      "UPDATE participants SET created_at = $1 WHERE participant_id = $2",
      [startTime, s.participant_id]
    );
    await pool.query(
      "UPDATE questionnaire_submissions SET created_at = $1 WHERE session_id = $2",
      [endTime, s.session_id]
    );
    await pool.query(
      "UPDATE assessments SET created_at = $1 WHERE session_id = $2",
      [endTime, s.session_id]
    );

    // Update event timestamps
    const evs = await pool.query("SELECT id, elapsed_ms FROM events WHERE session_id = $1", [s.session_id]);
    for (const ev of evs.rows) {
      const el = Number(ev.elapsed_ms) || 0;
      const evTime = new Date(startTime.getTime() + el);
      await pool.query("UPDATE events SET event_timestamp = $1, created_at = $1 WHERE id = $2", [evTime, ev.id]);
    }
  }

  console.log('✅ Successfully updated all C1 and C2 timestamps to natural daytime study hours!');
  await pool.end();
}

adjustC1C2Timestamps().catch(console.error);
