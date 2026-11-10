// tests/research_csv_exports.test.js
// Verification Test Suite for Critical Addition: Complete Research Data Export & CSV System
// And Vercel Serverless Entry Point Integration

import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import {
  escapeCsv,
  filterItems,
  exportParticipantMasterCSV,
  exportSessionSummaryCSV,
  exportRawEventsCSV,
  exportQuestionnaireResponsesCSV,
  exportKnowledgeScoresCSV,
  exportQ9OpenResponsesCSV,
  exportQ10Q13LikertCSV,
  exportC4DiscomfortCSV,
  exportC3InteractionTelemetryCSV,
  exportC4VRTelemetryCSV,
  exportTechnicalIssuesCSV,
  exportDataSyncStatusCSV,
  exportCombinedResearchDatasetCSV
} from '../src/services/ResearchDataExporter.js';
import serverlessHandler from '../api/index.js';

console.log('\n================================================================');
console.log('--- RUNNING RESEARCH DATA EXPORT & CSV VERIFICATION TESTS ---');
console.log('================================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(description, testFn) {
  try {
    testFn();
    console.log(`  ✓ PASS: ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

async function runAsyncTest(description, testFn) {
  try {
    await testFn();
    console.log(`  ✓ PASS: ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

// ─── Test Fixtures ────
const mockParticipants = [
  { participant_id: 'P001', name: 'Arjun Sharma', email: 'arjun@example.com', age_range: '20-22', created_at: '2026-11-01T10:00:00Z' },
  { participant_id: 'P002', name: 'Harshit Patel', email: 'harshit@example.com', age_range: '23-25', created_at: '2026-11-02T11:00:00Z' },
  { participant_id: 'P003', name: 'Somya Verma', email: 'somya@example.com', age_range: '20-22', created_at: '2026-11-03T12:00:00Z' },
  { participant_id: 'P004', name: 'Sukhmani Kaur', email: 'sukhmani@example.com', age_range: '20-22', created_at: '2026-11-04T13:00:00Z' }
];

const mockSessions = [
  { session_id: 'SESS_001', participant_id: 'P001', condition: 'C1', story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', status: 'complete', start_time: '2026-11-01T10:05:00Z', end_time: '2026-11-01T10:25:00Z' },
  { session_id: 'SESS_002', participant_id: 'P002', condition: 'C2', story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', status: 'complete', start_time: '2026-11-02T11:05:00Z', end_time: '2026-11-02T11:28:00Z' },
  { session_id: 'SESS_003', participant_id: 'P003', condition: 'C3', story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', status: 'complete', start_time: '2026-11-03T12:05:00Z', end_time: '2026-11-03T12:30:00Z' },
  { session_id: 'SESS_004', participant_id: 'P004', condition: 'C4', story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', status: 'complete', start_time: '2026-11-04T13:05:00Z', end_time: '2026-11-04T13:35:00Z' }
];

const mockEvents = [
  { event_id: 'EV_001', session_id: 'SESS_001', participant_id: 'P001', condition: 'C1', story_id: 'ayurveda_intro_v1', event_type: 'VIDEO_START', category: 'navigation', elapsed_ms: 0, timestamp_utc: '2026-11-01T10:05:00Z', sync_status: 'synced' },
  { event_id: 'EV_002', session_id: 'SESS_002', participant_id: 'P002', condition: 'C2', story_id: 'ayurveda_intro_v1', event_type: 'SPATIAL_AUDIO_INIT', category: 'audio', elapsed_ms: 1200, timestamp_utc: '2026-11-02T11:05:01Z', sync_status: 'synced' },
  { event_id: 'EV_003', session_id: 'SESS_003', participant_id: 'P003', condition: 'C3', story_id: 'ayurveda_intro_v1', event_type: 'C3_GATE_OPEN', category: 'interaction', target_id: 'banyan_tree_hold', elapsed_ms: 30000, timestamp_utc: '2026-11-03T12:10:00Z', sync_status: 'synced' },
  { event_id: 'EV_004', session_id: 'SESS_003', participant_id: 'P003', condition: 'C3', story_id: 'ayurveda_intro_v1', event_type: 'C3_COMPLETE', category: 'interaction', target_id: 'banyan_tree_hold', elapsed_ms: 33500, timestamp_utc: '2026-11-03T12:10:03Z', sync_status: 'synced' },
  { event_id: 'EV_005', session_id: 'SESS_004', participant_id: 'P004', condition: 'C4', story_id: 'ayurveda_intro_v1', event_type: 'VR_ENTER', category: 'vr', elapsed_ms: 20000, timestamp_utc: '2026-11-04T13:10:00Z', sync_status: 'synced' },
  { event_id: 'EV_006', session_id: 'SESS_004', participant_id: 'P004', condition: 'C4', story_id: 'ayurveda_intro_v1', event_type: 'GAZE_DWELL', category: 'vr', elapsed_ms: 80000, timestamp_utc: '2026-11-04T13:15:00Z', sync_status: 'synced' },
  { event_id: 'EV_007', session_id: 'SESS_001', participant_id: 'P001', condition: 'C1', story_id: 'ayurveda_intro_v1', event_type: 'MEDIA_ERROR', category: 'technical', elapsed_ms: 50000, timestamp_utc: '2026-11-01T10:15:00Z', error_code: 'ERR_BUFFER', error_details: 'Stall buffer underrun', result: 'failed', sync_status: 'synced' },
  { event_id: 'EV_008', session_id: 'SESS_003', participant_id: 'P003', condition: 'C3', story_id: 'ayurveda_intro_v1', event_type: 'OFFLINE_QUEUE_EV', category: 'interaction', elapsed_ms: 90000, timestamp_utc: '2026-11-03T12:20:00Z', sync_status: 'pending' }
];

const mockQuestionnaires = [
  {
    participant_id: 'P001', session_id: 'SESS_001', condition: 'C1', story_id: 'ayurveda_intro_v1',
    Q1_raw: 'C', Q2_raw: 'A', Q3_raw: 'D', Q4_raw: 'B', Q5_raw: 'A', Q6_raw: 'A', Q7_raw: 'D', Q8_raw: 'B',
    Q1_score: 1, Q2_score: 1, Q3_score: 1, Q4_score: 1, Q5_score: 0, Q6_score: 1, Q7_score: 1, Q8_score: 1,
    knowledge_total: 7,
    Q9_verbatim: 'Ayurveda is about living in harmony with natural cycles, doshas, and daily mindful routines.',
    Q9_score: 2,
    Q10: 4, Q11: 4, Q12: 5, Q13: 4,
    C4_discomfort: null, completion_time_seconds: 195, created_at: '2026-11-01T10:24:00Z'
  },
  {
    participant_id: 'P002', session_id: 'SESS_002', condition: 'C2', story_id: 'ayurveda_intro_v1',
    Q1_raw: 'C', Q2_raw: 'A', Q3_raw: 'D', Q4_raw: 'B', Q5_raw: 'C', Q6_raw: 'A', Q7_raw: 'D', Q8_raw: 'B',
    Q1_score: 1, Q2_score: 1, Q3_score: 1, Q4_score: 1, Q5_score: 1, Q6_score: 1, Q7_score: 1, Q8_score: 1,
    knowledge_total: 8,
    Q9_verbatim: 'Ayurveda connects mind, body, and environment through balanced nutrition and herbal wisdom.',
    Q9_score: 2,
    Q10: 5, Q11: 4, Q12: 4, Q13: 5,
    C4_discomfort: null, completion_time_seconds: 210, created_at: '2026-11-02T11:27:00Z'
  },
  {
    participant_id: 'P003', session_id: 'SESS_003', condition: 'C3', story_id: 'ayurveda_intro_v1',
    Q1_raw: 'C', Q2_raw: 'A', Q3_raw: 'D', Q4_raw: 'B', Q5_raw: 'C', Q6_raw: 'A', Q7_raw: 'D', Q8_raw: 'B',
    Q1_score: 1, Q2_score: 1, Q3_score: 1, Q4_score: 1, Q5_score: 1, Q6_score: 1, Q7_score: 1, Q8_score: 1,
    knowledge_total: 8,
    Q9_verbatim: 'A holistic health tradition focusing on balance of doshas and seasonal rhythms.',
    Q9_score: 2,
    Q10: 5, Q11: 5, Q12: 5, Q13: 5,
    C4_discomfort: null, completion_time_seconds: 180, created_at: '2026-11-03T12:29:00Z'
  },
  {
    participant_id: 'P004', session_id: 'SESS_004', condition: 'C4', story_id: 'ayurveda_intro_v1',
    Q1_raw: 'C', Q2_raw: 'A', Q3_raw: 'D', Q4_raw: 'B', Q5_raw: 'C', Q6_raw: 'A', Q7_raw: 'D', Q8_raw: 'B',
    Q1_score: 1, Q2_score: 1, Q3_score: 1, Q4_score: 1, Q5_score: 1, Q6_score: 1, Q7_score: 1, Q8_score: 1,
    knowledge_total: 8,
    Q9_verbatim: 'Traditional Indian science of life emphasizing balance, herb preparation, and daily well-being.',
    Q9_score: 2,
    Q10: 5, Q11: 5, Q12: 4, Q13: 5,
    C4_discomfort: 1, completion_time_seconds: 220, created_at: '2026-11-04T13:34:00Z'
  }
];

// ─── 1. CSV Escaping & Special Characters ────
runTest('1. CSV Escaping correctly wraps commas, quotes, and newlines', () => {
  assert.strictEqual(escapeCsv('Simple Text'), 'Simple Text');
  assert.strictEqual(escapeCsv('Text, with comma'), '"Text, with comma"');
  assert.strictEqual(escapeCsv('Text "with quotes"'), '"Text ""with quotes"""');
  assert.strictEqual(escapeCsv('Line 1\nLine 2'), '"Line 1\nLine 2"');
  assert.strictEqual(escapeCsv(null), '');
  assert.strictEqual(escapeCsv(undefined), '');
  assert.strictEqual(escapeCsv(123), '123');
});

// ─── 2. Participant Master Data CSV ────
runTest('2. Export 1: Participant Master Data CSV', () => {
  const result = exportParticipantMasterCSV(mockParticipants);
  assert.strictEqual(result.count, 4);
  assert.strictEqual(result.name, 'participant_master_data.csv');
  const lines = result.csv.split('\n');
  assert.strictEqual(lines[0], 'participant_id,name,email,age_range,created_at');
  assert(lines[1].includes('P001,Arjun Sharma,arjun@example.com'));
});

// ─── 3. Session Summary Data CSV ────
runTest('3. Export 2: Session Summary Data CSV', () => {
  const result = exportSessionSummaryCSV(mockSessions, mockEvents, []);
  assert.strictEqual(result.count, 4);
  const lines = result.csv.split('\n');
  assert.strictEqual(lines[0], 'session_id,participant_id,condition,story_id,story_title,status,start_time,end_time,duration_seconds,total_events,total_assessments');
  assert(lines[1].includes('SESS_001,P001,C1'));
});

// ─── 4. Complete Raw Event Logs CSV ────
runTest('4. Export 3: Complete Raw Event Logs CSV', () => {
  const result = exportRawEventsCSV(mockEvents);
  assert.strictEqual(result.count, 8);
  const lines = result.csv.split('\n');
  assert(lines[0].startsWith('event_id,session_id,participant_id,condition'));
  assert(lines.some(l => l.includes('EV_003,SESS_003,P003,C3')));
});

// ─── 5. Questionnaire Responses (Q1–Q13) CSV ────
runTest('5. Export 4: Questionnaire Responses (Q1–Q13) CSV with C4 Discomfort Isolation', () => {
  const result = exportQuestionnaireResponsesCSV(mockQuestionnaires);
  assert.strictEqual(result.count, 4);
  const lines = result.csv.split('\n');
  assert(lines[0].startsWith('participant_id,session_id,condition,story_id,Q1_raw'));
  
  // Verify C1 participant has 'N/A' for C4_discomfort
  const c1Line = lines.find(l => l.startsWith('P001'));
  assert(c1Line.includes('N/A'), 'C1 participant discomfort must be N/A');

  // Verify C4 participant has reported numeric rating 1
  const c4Line = lines.find(l => l.startsWith('P004'));
  assert(c4Line.includes(',1,'), 'C4 participant discomfort must be numeric');
});

// ─── 6. Knowledge Assessment Scores (0–8) CSV ────
runTest('6. Export 5: Knowledge Assessment Scores (0–8) CSV', () => {
  const result = exportKnowledgeScoresCSV(mockQuestionnaires);
  assert.strictEqual(result.count, 4);
  const lines = result.csv.split('\n');
  assert.strictEqual(lines[0], 'participant_id,session_id,condition,Q1_score,Q2_score,Q3_score,Q4_score,Q5_score,Q6_score,Q7_score,Q8_score,knowledge_total');
  const p1 = lines.find(l => l.startsWith('P001'));
  assert(p1.endsWith(',7'), 'P001 total knowledge score must be 7');
  const p2 = lines.find(l => l.startsWith('P002'));
  assert(p2.endsWith(',8'), 'P002 total knowledge score must be 8');
});

// ─── 7. Q9 Open-Ended Responses CSV ────
runTest('7. Export 6: Q9 Open-Ended Responses CSV', () => {
  const result = exportQ9OpenResponsesCSV(mockQuestionnaires);
  assert.strictEqual(result.count, 4);
  const lines = result.csv.split('\n');
  assert.strictEqual(lines[0], 'participant_id,session_id,condition,story_id,Q9_verbatim,Q9_score,completion_time_seconds,created_at');
  assert(result.csv.includes('Ayurveda is about living in harmony'));
});

// ─── 8. Individual Q10–Q13 Likert Responses CSV ────
runTest('8. Export 7: Individual Q10–Q13 Likert Responses CSV (Independent, Not Summed)', () => {
  const result = exportQ10Q13LikertCSV(mockQuestionnaires);
  assert.strictEqual(result.count, 4);
  const lines = result.csv.split('\n');
  assert.strictEqual(lines[0], 'participant_id,session_id,condition,Q10_understanding,Q11_attention,Q12_clarity,Q13_recall');
  assert(!lines[0].includes('total'), 'Experience Likert items must never be summed');
});

// ─── 9. C4 VR Discomfort Responses CSV ────
runTest('9. Export 8: C4 VR Discomfort Responses CSV (Filtered Strictly for C4)', () => {
  const result = exportC4DiscomfortCSV(mockQuestionnaires);
  assert.strictEqual(result.count, 1, 'Only C4 participant should be in discomfort export');
  const lines = result.csv.split('\n');
  assert.strictEqual(lines[0], 'participant_id,session_id,condition,c4_discomfort,discomfort_label,created_at');
  assert(lines[1].startsWith('P004,SESS_004,C4,1,Not at all'));
});

// ─── 10. C3 Interaction Telemetry CSV ────
runTest('10. Export 9: C3 Interaction Telemetry CSV (Filtered for C3)', () => {
  const result = exportC3InteractionTelemetryCSV(mockEvents);
  assert.strictEqual(result.count, 3, 'Must filter C3 interactions (EV_003, EV_004, EV_008)');
  assert(result.csv.includes('C3_GATE_OPEN'));
  assert(result.csv.includes('C3_COMPLETE'));
});

// ─── 11. C4 VR Telemetry & Gaze CSV ────
runTest('11. Export 10: C4 VR Telemetry CSV (Filtered for C4)', () => {
  const result = exportC4VRTelemetryCSV(mockEvents);
  assert.strictEqual(result.count, 2, 'Must filter C4 events (EV_005, EV_006)');
  assert(result.csv.includes('VR_ENTER'));
  assert(result.csv.includes('GAZE_DWELL'));
});

// ─── 12. Technical Issues & Errors CSV ────
runTest('12. Export 11: Technical Issues & Errors CSV', () => {
  const result = exportTechnicalIssuesCSV(mockEvents);
  assert.strictEqual(result.count, 1, 'Must isolate technical errors (EV_007)');
  assert(result.csv.includes('MEDIA_ERROR'));
  assert(result.csv.includes('Stall buffer underrun'));
});

// ─── 13. Data Sync Status CSV ────
runTest('13. Export 12: Data Sync Status CSV (Pending vs Synced)', () => {
  const result = exportDataSyncStatusCSV(mockEvents);
  assert.strictEqual(result.count, 8);
  assert(result.csv.includes('pending'));
  assert(result.csv.includes('synced'));
});

// ─── 14. Combined Research Master Dataset CSV ────
runTest('14. Export 13: Combined Research Master Dataset CSV (Relational Join)', () => {
  const result = exportCombinedResearchDatasetCSV({
    participants: mockParticipants,
    sessions: mockSessions,
    events: mockEvents,
    questionnaires: mockQuestionnaires
  });
  assert.strictEqual(result.count, 4);
  const lines = result.csv.split('\n');
  assert(lines[0].startsWith('participant_id,participant_name,age_range,session_id,condition,story_id'));
  assert(lines[1].includes('P001,Arjun Sharma,20-22,SESS_001,C1'));
});

// ─── 15. Dynamic Filter Controls Verification ────
runTest('15. Dynamic Filter Controls (Condition, Story, Search, Date Range)', () => {
  // Filter by condition C3
  const c3Only = filterItems(mockSessions, { condition: 'C3' });
  assert.strictEqual(c3Only.length, 1);
  assert.strictEqual(c3Only[0].condition, 'C3');

  // Filter by participant name search
  const arjunSearch = filterItems(mockParticipants, { participantId: 'arjun' });
  assert.strictEqual(arjunSearch.length, 1);
  assert.strictEqual(arjunSearch[0].participant_id, 'P001');

  // Filter by date range
  const dateFiltered = filterItems(mockSessions, { startDate: '2026-11-03', endDate: '2026-11-04' });
  assert.strictEqual(dateFiltered.length, 2);
});

// ─── 16. Vercel Serverless Function Handler Test ────
await runAsyncTest('16. Vercel Serverless Function Handler (/api/health & /api/db/health)', async () => {
  const server = http.createServer((req, res) => {
    serverlessHandler(req, res);
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  try {
    // Test /api/health
    const healthRes = await fetch(`http://localhost:${port}/api/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');

    // Test /api/db/health
    const dbHealthRes = await fetch(`http://localhost:${port}/api/db/health`);
    assert.strictEqual(dbHealthRes.status, 200);
    const dbHealthData = await dbHealthRes.json();
    assert.strictEqual(dbHealthData.connected, true);
    assert.strictEqual(dbHealthData.mode, 'postgresql');

    // Test unauthorized admin route rejection
    const unauthRes = await fetch(`http://localhost:${port}/api/db/dashboard-data`);
    assert.strictEqual(unauthRes.status, 401, 'Protected route without token must return 401 Unauthorized');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

console.log('\n================================================================');
console.log(`TOTAL CSV & VERCEL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}

