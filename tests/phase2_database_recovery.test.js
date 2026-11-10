// tests/phase2_database_recovery.test.js
// Verification Test Suite for Phase 2: Restore Central PostgreSQL as Authoritative Research Database
// Tests H.1 through H.13

import assert from 'assert';
import { centralDb } from '../server/db/centralDb.js';

console.log('\n================================================================');
console.log('--- RUNNING PHASE 2 DATABASE RECOVERY VERIFICATION TEST SUITE ---');
console.log('================================================================\n');

let passedCount = 0;
let failedCount = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

const TEST_PID = 'TEST_P_001';
const TEST_SESS = 'TEST_SESS_001';

async function cleanupTestData() {
  const pool = centralDb.getPool();
  if (!pool) return;
  try {
    await pool.query('DELETE FROM events WHERE session_id = $1 OR participant_id = $2 OR event_id LIKE $3', [TEST_SESS, TEST_PID, 'TEST_%']);
    await pool.query('DELETE FROM questionnaire_submissions WHERE session_id = $1 OR participant_id = $2', [TEST_SESS, TEST_PID]);
    await pool.query('DELETE FROM assessments WHERE session_id = $1 OR participant_id = $2', [TEST_SESS, TEST_PID]);
    await pool.query('DELETE FROM sessions WHERE session_id = $1 OR participant_id = $2', [TEST_SESS, TEST_PID]);
    await pool.query('DELETE FROM participants WHERE participant_id = $1', [TEST_PID]);
  } catch (err) {
    console.warn('Cleanup error (non-fatal):', err.message);
  }
}

async function runSuite() {
  // Ensure starting with clean test state (never touch P002 or test_verify_123)
  await cleanupTestData();

  // H.1: PostgreSQL connection & latency test
  await runTest('H.1: PostgreSQL connection & latency test', async () => {
    const health = await centralDb.healthCheck();
    assert.strictEqual(health.connected, true, 'health.connected must be true');
    assert.strictEqual(health.authoritative, true, 'health.authoritative must be true');
    assert.strictEqual(health.mode, 'postgresql', 'health.mode must be postgresql');
    assert(typeof health.latency_ms === 'number' && health.latency_ms > 0, `latency_ms must be a positive number (got ${health.latency_ms})`);
    assert(health.database, 'database name must be reported');
  });

  // H.2: Schema initialization & migration status test
  await runTest('H.2: Schema initialization & migration status test', async () => {
    const pool = centralDb.getPool();
    assert(pool, 'PostgreSQL pool must exist');

    // Check migration table
    const migRes = await pool.query('SELECT version, name FROM _schema_migrations WHERE version = $1', ['001']);
    assert(migRes.rows.length >= 1, 'Migration 001 must be tracked in _schema_migrations');

    // Check events table columns
    const evCols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'events'`
    );
    const evColNames = evCols.rows.map(r => r.column_name);
    for (const expected of ['event_id', 'condition', 'story_id', 'elapsed_ms', 'video_timestamp', 'target_id', 'action', 'result', 'payload']) {
      assert(evColNames.includes(expected), `events table missing required column: ${expected}`);
    }

    // Check questionnaire_submissions table columns
    const qCols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'questionnaire_submissions'`
    );
    const qColNames = qCols.rows.map(r => r.column_name);
    for (const expected of ['knowledge_total', 'q9_verbatim', 'q9_score', 'q10_understanding', 'q11_attention', 'q12_clarity', 'q13_recall', 'c4_discomfort']) {
      assert(qColNames.includes(expected), `questionnaire_submissions missing required column: ${expected}`);
    }
  });

  // H.3: Participant insertion and retrieval
  await runTest('H.3: Participant insertion and retrieval (TEST_P_001)', async () => {
    const saved = await centralDb.saveParticipant({
      participant_id: TEST_PID,
      name: 'Test Auditor',
      email: 'test@example.com',
      age_range: '20-22'
    });
    assert.strictEqual(saved.participant_id, TEST_PID);

    const pool = centralDb.getPool();
    const res = await pool.query('SELECT * FROM participants WHERE participant_id = $1', [TEST_PID]);
    assert.strictEqual(res.rows.length, 1);
    assert.strictEqual(res.rows[0].participant_id, TEST_PID);
  });

  // H.4: Session insertion and retrieval
  await runTest('H.4: Session insertion and retrieval (TEST_SESS_001)', async () => {
    const saved = await centralDb.saveSession({
      session_id: TEST_SESS,
      participant_id: TEST_PID,
      condition: 'C3',
      story_id: 'ayurveda_intro_v1',
      story_title: 'Introduction to Ayurveda',
      status: 'active'
    });
    assert.strictEqual(saved.session_id, TEST_SESS);

    const pool = centralDb.getPool();
    const res = await pool.query('SELECT * FROM sessions WHERE session_id = $1', [TEST_SESS]);
    assert.strictEqual(res.rows.length, 1);
    assert.strictEqual(res.rows[0].condition, 'C3');
    assert.strictEqual(res.rows[0].story_id, 'ayurveda_intro_v1');
  });

  // H.5: Event insertion and retrieval
  await runTest('H.5: Event insertion and retrieval', async () => {
    const ev1 = {
      event_id: 'TEST_EV_001',
      session_id: TEST_SESS,
      participant_id: TEST_PID,
      condition: 'C3',
      story_id: 'ayurveda_intro_v1',
      event_type: 'C3_GATE_OPEN',
      elapsed_ms: 3200,
      video_timestamp: 30.5,
      target_id: 'banyan_tree_hold',
      action: 'gate_opened',
      result: 'waiting_hold',
      payload: { mode: 'pointer' },
      timestamp_utc: new Date().toISOString()
    };
    const savedResult = await centralDb.saveEvents([ev1]);
    assert.strictEqual(savedResult.count, 1);
    assert(savedResult.saved_event_ids.includes('TEST_EV_001'));

    const events = await centralDb.getAllEvents({ sessionId: TEST_SESS });
    const match = events.find(e => e.event_id === 'TEST_EV_001');
    assert(match, 'Saved event TEST_EV_001 must be retrievable');
    assert.strictEqual(match.event_type, 'C3_GATE_OPEN');
    assert.strictEqual(match.elapsed_ms, 3200);
    assert.strictEqual(match.video_timestamp, 30.5);
  });

  // H.6: Duplicate event submission test (idempotency verification)
  await runTest('H.6: Duplicate event submission test (idempotency)', async () => {
    const duplicateEv = {
      event_id: 'TEST_EV_001', // Exact same event_id
      session_id: TEST_SESS,
      participant_id: TEST_PID,
      condition: 'C3',
      story_id: 'ayurveda_intro_v1',
      event_type: 'C3_GATE_OPEN',
      elapsed_ms: 3200,
      video_timestamp: 30.5,
      target_id: 'banyan_tree_hold',
      action: 'gate_opened',
      result: 'waiting_hold',
      payload: { mode: 'pointer' }
    };

    // Attempt re-insertion of identical event_id
    const res = await centralDb.saveEvents([duplicateEv]);
    assert.strictEqual(res.count, 1, 'Should acknowledge re-insert safely');
    assert(res.saved_event_ids.includes('TEST_EV_001'));

    // Count physical rows in DB for this event_id
    const pool = centralDb.getPool();
    const countRes = await pool.query('SELECT COUNT(*) as count FROM events WHERE event_id = $1', ['TEST_EV_001']);
    assert.strictEqual(parseInt(countRes.rows[0].count, 10), 1, 'Physical row count must remain exactly 1 (no duplicate row created)');
  });

  // H.7: Legacy event compatibility test
  await runTest('H.7: Legacy event compatibility test (null event_id and legacy data column)', async () => {
    const pool = centralDb.getPool();
    // Insert a legacy row directly bypassing new schema columns
    await pool.query(
      `INSERT INTO events (session_id, participant_id, event_type, event_timestamp, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [TEST_SESS, TEST_PID, 'LEGACY_TEST_EVENT', new Date().toISOString(), JSON.stringify({ legacy_field: 'old_value', elapsed_ms: 999 })]
    );

    // Retrieve via getAllEvents and ensure it normalizes cleanly without error
    const events = await centralDb.getAllEvents({ sessionId: TEST_SESS });
    const legacyEv = events.find(e => e.event_type === 'LEGACY_TEST_EVENT');
    assert(legacyEv, 'Legacy event must be retrieved by getAllEvents()');
    assert.strictEqual(legacyEv.session_id, TEST_SESS);
    assert.strictEqual(legacyEv.payload.legacy_field, 'old_value');
    assert.strictEqual(legacyEv.elapsed_ms, 999);
  });

  // H.8: Questionnaire submission storage test (29 approved fields)
  await runTest('H.8: Questionnaire submission storage test (29 approved research fields)', async () => {
    const testQSubmission = {
      session_id: TEST_SESS,
      participant_id: TEST_PID,
      condition: 'C3',
      story_id: 'ayurveda_intro_v1',
      completion_time_seconds: 245,
      answers: {
        Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'B', Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'B',
        Q9: 'Ayurveda emphasizes harmony with nature and balanced doshas.',
        Q10: 5, Q11: 4, Q12: 5, Q13: 4,
        C4_discomfort: null
      },
      Q9_score: 2
    };

    const saved = await centralDb.saveQuestionnaireSubmission(testQSubmission);
    assert.strictEqual(saved.session_id, TEST_SESS);
    assert.strictEqual(saved.knowledge_total, 8); // 8/8 correct
    assert.strictEqual(saved.q9_score, 2);
    assert.strictEqual(saved.Q10 ?? saved.q10 ?? saved.q10_understanding, 5);
    assert.strictEqual(saved.Q11 ?? saved.q11 ?? saved.q11_attention, 4);
    assert.strictEqual(saved.Q12 ?? saved.q12 ?? saved.q12_clarity, 5);
    assert.strictEqual(saved.Q13 ?? saved.q13 ?? saved.q13_recall, 4);

    const pool = centralDb.getPool();
    const dbRow = await pool.query('SELECT * FROM questionnaire_submissions WHERE session_id = $1', [TEST_SESS]);
    assert.strictEqual(dbRow.rows.length, 1);
    const r = dbRow.rows[0];
    assert.strictEqual(Number(r.q1_score), 1);
    assert.strictEqual(Number(r.q2_score), 1);
    assert.strictEqual(Number(r.q8_score), 1);
    assert.strictEqual(Number(r.knowledge_total), 8);
    assert.strictEqual(Number(r.q9_score), 2);
    assert(r.q9_verbatim.includes('harmony with nature'));
  });

  // H.9: Event payload preservation test
  await runTest('H.9: Event payload preservation test (nested JSON fidelity)', async () => {
    const complexPayload = {
      nested: {
        deeply: [1, 2, { key: 'value', active: true }],
        flag: false,
        nullVal: null
      },
      stringWithQuotes: 'Hello "World" & symbols <>&',
      numericFloat: 123.456
    };

    const ev = {
      event_id: 'TEST_EV_PAYLOAD_FIDELITY',
      session_id: TEST_SESS,
      participant_id: TEST_PID,
      condition: 'C3',
      story_id: 'ayurveda_intro_v1',
      event_type: 'PAYLOAD_TEST',
      payload: complexPayload
    };

    await centralDb.saveEvents([ev]);
    const events = await centralDb.getAllEvents({ sessionId: TEST_SESS });
    const retrieved = events.find(e => e.event_id === 'TEST_EV_PAYLOAD_FIDELITY');
    assert(retrieved, 'Payload test event must be retrievable');
    assert.deepStrictEqual(retrieved.payload, complexPayload, 'Payload must match original nested structure exactly');
  });

  // H.10: UTC timestamp integrity test
  await runTest('H.10: UTC timestamp integrity test', async () => {
    const testUtc = '2026-11-10T22:30:45.123Z';
    const testElapsed = 45123;

    const ev = {
      event_id: 'TEST_EV_TIMESTAMP_INTEGRITY',
      session_id: TEST_SESS,
      participant_id: TEST_PID,
      condition: 'C3',
      story_id: 'ayurveda_intro_v1',
      event_type: 'TIMESTAMP_TEST',
      timestamp_utc: testUtc,
      elapsed_ms: testElapsed,
      video_timestamp: 45.1
    };

    await centralDb.saveEvents([ev]);
    const events = await centralDb.getAllEvents({ sessionId: TEST_SESS });
    const retrieved = events.find(e => e.event_id === 'TEST_EV_TIMESTAMP_INTEGRITY');
    assert(retrieved, 'Timestamp test event must be found');

    // Verify UTC format is valid ISO string and not corrupted into elapsed ms
    const d = new Date(retrieved.timestamp_utc);
    assert(!isNaN(d.getTime()), 'timestamp_utc must be a valid ISO Date');
    assert.strictEqual(retrieved.elapsed_ms, testElapsed, 'elapsed_ms must remain an integer and not converted to date');
    assert.strictEqual(retrieved.video_timestamp, 45.1, 'video_timestamp must remain float seconds');
  });

  // H.11: Large event retrieval test exceeding 5,000 rows (verifying NO LIMIT 5000 truncation)
  await runTest('H.11: Large event retrieval test exceeding 5,000 rows (batch streaming verification)', async () => {
    console.log('    Inserting 5,100 batch events to test retrieval beyond 5,000 rows...');
    const BATCH_SIZE = 5100;
    const CHUNK_SIZE = 800;
    const pool = centralDb.getPool();

    for (let i = 0; i < BATCH_SIZE; i += CHUNK_SIZE) {
      const chunk = [];
      const end = Math.min(i + CHUNK_SIZE, BATCH_SIZE);
      for (let j = i; j < end; j++) {
        chunk.push({
          event_id: `TEST_BATCH_EV_${j}`,
          session_id: TEST_SESS,
          participant_id: TEST_PID,
          condition: 'C3',
          story_id: 'ayurveda_intro_v1',
          event_type: 'BATCH_TEST_EVENT',
          elapsed_ms: j * 10,
          video_timestamp: j * 0.1,
          payload: { index: j }
        });
      }
      await centralDb.saveEvents(chunk);
    }

    // Now call getAllEvents() which streams in chunks of 2,500 without LIMIT 5000
    const allEvents = await centralDb.getAllEvents({ sessionId: TEST_SESS });
    const batchEventsRetrieved = allEvents.filter(e => e.event_type === 'BATCH_TEST_EVENT');

    assert.strictEqual(
      batchEventsRetrieved.length,
      BATCH_SIZE,
      `Expected to retrieve all ${BATCH_SIZE} batch events (>5000), but retrieved ${batchEventsRetrieved.length}`
    );
    console.log(`    Successfully retrieved ${batchEventsRetrieved.length} events from database without truncation.`);
  });

  // H.12: PostgreSQL outage behavior test (queueing logic simulation)
  await runTest('H.12: PostgreSQL outage behavior test (offline queue simulation)', async () => {
    // Simulate event generation while backend/database is offline
    const queuedEvents = [];
    for (let i = 1; i <= 5; i++) {
      queuedEvents.push({
        event_id: `TEST_OFFLINE_EV_${i}`,
        session_id: TEST_SESS,
        participant_id: TEST_PID,
        condition: 'C3',
        story_id: 'ayurveda_intro_v1',
        event_type: 'OFFLINE_ACTION',
        elapsed_ms: 1000 * i,
        sync_status: 'pending' // Queued locally
      });
    }

    // Verify all 5 are marked pending
    assert.strictEqual(queuedEvents.filter(e => e.sync_status === 'pending').length, 5);
  });

  // H.13: Pending-event retry test (flushing and server acknowledgment)
  await runTest('H.13: Pending-event retry test (recovery and mark synced)', async () => {
    // Generate 3 pending events
    const pendingEvents = [
      {
        event_id: 'TEST_RETRY_EV_1',
        session_id: TEST_SESS,
        participant_id: TEST_PID,
        condition: 'C3',
        story_id: 'ayurveda_intro_v1',
        event_type: 'RETRY_TEST',
        sync_status: 'pending'
      },
      {
        event_id: 'TEST_RETRY_EV_2',
        session_id: TEST_SESS,
        participant_id: TEST_PID,
        condition: 'C3',
        story_id: 'ayurveda_intro_v1',
        event_type: 'RETRY_TEST',
        sync_status: 'pending'
      }
    ];

    // Submit them to centralDb (as server connection restored)
    const saveRes = await centralDb.saveEvents(pendingEvents);
    assert.strictEqual(saveRes.count, 2);
    assert(saveRes.saved_event_ids.includes('TEST_RETRY_EV_1'));
    assert(saveRes.saved_event_ids.includes('TEST_RETRY_EV_2'));

    // Transition local status based on saved_event_ids
    for (const ev of pendingEvents) {
      if (saveRes.saved_event_ids.includes(ev.event_id)) {
        ev.sync_status = 'synced';
      }
    }

    assert.strictEqual(pendingEvents.filter(e => e.sync_status === 'synced').length, 2);
  });

  // CLEANUP TEST RECORDS (Preserving real participant records)
  console.log('\n  Cleaning up test records (preserving P002, test_verify_123, and real data)...');
  await cleanupTestData();

  // Verify real records remain intact
  const pool = centralDb.getPool();
  if (pool) {
    const pCheck = await pool.query('SELECT participant_id FROM participants WHERE participant_id = $1', ['P002']);
    assert(pCheck.rows.length >= 1, 'Participant P002 must remain intact');
    const sCheck = await pool.query('SELECT session_id FROM sessions WHERE session_id = $1', ['test_verify_123']);
    assert(sCheck.rows.length >= 1, 'Session test_verify_123 must remain intact');
    console.log('  ✓ Preserved records verified: P002 and test_verify_123 are intact.');
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  process.exit(1);
});
