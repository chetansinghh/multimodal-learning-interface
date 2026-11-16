import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function removeTestData() {
  const targetPids = [
    'P_Sukhmani_4109',
    'P_Somya_3735',
    'P_Harshit_3273',
    'P_Arjun_1365',
    'P002',
    'P_test_probe'
  ];

  const targetSessIds = [
    'SESS_P_Sukhmani_4109_4109',
    'SESS_P_Somya_3735_3735',
    'SESS_P_Harshit_3273_3273',
    'SESS_P_Arjun_1365_1365',
    'test_verify_123',
    'test_probe_submit_1794858553501'
  ];

  console.log('Removing test records for:', targetPids);

  // 1. Delete events
  const evRes = await pool.query(
    'DELETE FROM events WHERE participant_id = ANY($1::text[]) OR session_id = ANY($2::text[])',
    [targetPids, targetSessIds]
  );
  console.log('Deleted events:', evRes.rowCount);

  // 2. Delete questionnaire submissions
  const qRes = await pool.query(
    'DELETE FROM questionnaire_submissions WHERE participant_id = ANY($1::text[]) OR session_id = ANY($2::text[])',
    [targetPids, targetSessIds]
  );
  console.log('Deleted questionnaire submissions:', qRes.rowCount);

  // 3. Delete assessments
  const aRes = await pool.query(
    'DELETE FROM assessments WHERE participant_id = ANY($1::text[]) OR session_id = ANY($2::text[])',
    [targetPids, targetSessIds]
  );
  console.log('Deleted assessments:', aRes.rowCount);

  // 4. Delete sessions
  const sRes = await pool.query(
    'DELETE FROM sessions WHERE participant_id = ANY($1::text[]) OR session_id = ANY($2::text[])',
    [targetPids, targetSessIds]
  );
  console.log('Deleted sessions:', sRes.rowCount);

  // 5. Delete participants
  const pRes = await pool.query(
    'DELETE FROM participants WHERE participant_id = ANY($1::text[])',
    [targetPids]
  );
  console.log('Deleted participants:', pRes.rowCount);

  // Verify remaining sessions
  const rem = await pool.query('SELECT session_id, participant_id, status FROM sessions');
  console.log('Remaining sessions in DB:', rem.rows);

  await pool.end();
}

removeTestData().catch(console.error);
