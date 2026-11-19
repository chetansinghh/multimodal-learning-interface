import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

export async function importPreviewDataset() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const csvContent = fs.readFileSync('sample_final_dataset_preview.csv', 'utf8');
  const lines = csvContent.trim().split('\n');
  const header = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);

  console.log(`Processing ${rows.length} preview records (9 C3 and 9 C4)...`);

  const previewParticipantIds = rows.map(r => r[0]);

  // Clean up any existing instances of these preview participants first
  console.log('Cleaning existing preview records...');
  await pool.query('DELETE FROM events WHERE participant_id = ANY($1)', [previewParticipantIds]);
  await pool.query('DELETE FROM assessments WHERE participant_id = ANY($1)', [previewParticipantIds]);
  await pool.query('DELETE FROM questionnaire_submissions WHERE participant_id = ANY($1)', [previewParticipantIds]);
  await pool.query('DELETE FROM sessions WHERE participant_id = ANY($1)', [previewParticipantIds]);
  await pool.query('DELETE FROM participants WHERE participant_id = ANY($1)', [previewParticipantIds]);

  const allAssessments = [];
  const allEvents = [];

  for (const r of rows) {
    const pid = r[0]; // e.g. P_Rohan_1042
    const name = r[1]; // e.g. Rohan
    const ageRange = r[2]; // e.g. 14-15
    const sid = r[3]; // e.g. SESS_P_Rohan_1042_4819
    const cond = r[4]; // C3 or C4
    const storyId = r[5]; // ayurveda_intro_v1
    const storyTitle = r[6];
    const status = r[7] || 'complete';
    const startTime = new Date(r[8]);
    const endTime = new Date(r[9]);

    const q1 = r[10], q2 = r[11], q3 = r[12], q4 = r[13];
    const q5 = r[14], q6 = r[15], q7 = r[16], q8 = r[17];

    const sc1 = Number(r[18]), sc2 = Number(r[19]), sc3 = Number(r[20]), sc4 = Number(r[21]);
    const sc5 = Number(r[22]), sc6 = Number(r[23]), sc7 = Number(r[24]), sc8 = Number(r[25]);
    const totalScore = Number(r[26]);

    const q9Text = r[27];
    const q9Score = r[28] !== '' ? Number(r[28]) : 2;

    const q10 = Number(r[29]);
    const q11 = Number(r[30]);
    const q12 = Number(r[31]);
    const q13 = Number(r[32]);

    const c4Discomfort = (cond === 'C4' && r[33] && r[33] !== 'N/A') ? Number(r[33]) : null;
    const compSeconds = r[37] !== '' ? Number(r[37]) : 60;

    // 1. Insert Participant
    await pool.query(
      `INSERT INTO participants (participant_id, name, age_group, email, created_at)
       VALUES ($1, $2, $3, NULL, $4)
       ON CONFLICT (participant_id) DO UPDATE SET name = $2, age_group = $3, email = NULL`,
      [pid, name, ageRange, startTime]
    );

    // 2. Insert Session
    const versionSnapshot = {
      story_id: storyId,
      study_id: `${storyId}_study`,
      condition: cond,
      story_title: storyTitle,
      story_version: '0.2-timed-to-supplied-video',
      study_version: '0.2-timed-to-supplied-video',
      consent_timestamp: startTime.toISOString(),
      segment_layout_hash: 'caa49697',
      consent_acknowledged: true,
      condition_config_version: '1.0'
    };

    await pool.query(
      `INSERT INTO sessions (session_id, participant_id, participant_name, participant_email, participant_age, condition, story_id, start_time, end_time, status, version_snapshot, created_at)
       VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (session_id) DO UPDATE SET
         participant_name = $3, participant_email = NULL, participant_age = $4, condition = $5, start_time = $7, end_time = $8, status = $9`,
      [sid, pid, name, ageRange, cond, storyId, startTime, endTime, status, JSON.stringify(versionSnapshot), startTime]
    );

    // 3. Insert Questionnaire Submission
    await pool.query(
      `INSERT INTO questionnaire_submissions (
        session_id, participant_id, condition, story_id,
        q1_raw, q2_raw, q3_raw, q4_raw, q5_raw, q6_raw, q7_raw, q8_raw,
        q1_score, q2_score, q3_score, q4_score, q5_score, q6_score, q7_score, q8_score,
        knowledge_total, q9_verbatim, q9_score,
        q10, q11, q12, q13, c4_discomfort, completion_time_seconds, created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23,
        $24, $25, $26, $27, $28, $29, $30
      ) ON CONFLICT (session_id) DO UPDATE SET
        q1_raw = $5, q2_raw = $6, q3_raw = $7, q4_raw = $8,
        q5_raw = $9, q6_raw = $10, q7_raw = $11, q8_raw = $12,
        q1_score = $13, q2_score = $14, q3_score = $15, q4_score = $16,
        q5_score = $17, q6_score = $18, q7_score = $19, q8_score = $20,
        knowledge_total = $21, q9_verbatim = $22, q9_score = $23,
        q10 = $24, q11 = $25, q12 = $26, q13 = $27, c4_discomfort = $28, completion_time_seconds = $29`,
      [
        sid, pid, cond, storyId,
        q1, q2, q3, q4, q5, q6, q7, q8,
        sc1, sc2, sc3, sc4, sc5, sc6, sc7, sc8,
        totalScore, q9Text, q9Score,
        q10, q11, q12, q13, c4Discomfort, compSeconds, endTime
      ]
    );

    // Queue assessments
    const answers = [q1, q2, q3, q4, q5, q6, q7, q8];
    const scores = [sc1, sc2, sc3, sc4, sc5, sc6, sc7, sc8];
    for (let i = 0; i < 8; i++) {
      allAssessments.push([sid, pid, `Q${i + 1}`, answers[i], scores[i], scores[i], endTime]);
    }
    allAssessments.push([sid, pid, 'Q9', q9Text, q9Score, q9Score, endTime]);

    // Build realistic event stream
    let curElapsed = 0;
    const addEv = (type, action, target, payload, incMs = 0) => {
      curElapsed += incMs;
      const evTime = new Date(startTime.getTime() + curElapsed);
      allEvents.push([
        sid, pid, `ev_${sid}_${allEvents.length + 1}`, type, cond, storyId,
        curElapsed, target, action, 'completed', JSON.stringify(payload), evTime, evTime
      ]);
    };

    addEv('VIDEO_START', 'session_begin', null, { condition: cond, storyId });
    addEv('VIDEO_START', 'experience_begin', null, { condition: cond }, 10);

    if (cond === 'C3') {
      addEv('C3_HOLD_START', 'hold_target', 'banyan_tree', { duration_ms: 1500, object_id: 'banyan_tree' }, 15000);
      addEv('C3_COMPLETE', 'interaction_completed', 'int_01', { interaction_id: 'int_01', duration_ms: 1600 }, 1600);
      addEv('C3_HOTSPOT_TOUCH', 'touch_element', 'earth', { conceptId: 'earth' }, 14000);
      addEv('C3_COMPLETE', 'grind_complete', 'int_04', { required_circles: 3 }, 18000);
      addEv('C3_SCROLL_PASSED', 'pass_scroll', 'int_08', { target: 'student' }, 25000);
    } else {
      addEv('VR_ENTER', 'enter_vr', 'immersive_canvas', { sessionType: 'desktop-first-person' }, 50);
      const yawBase = Number(r[35]?.replace('°', '')) || 25.0;
      for (let h = 0; h < 6; h++) {
        const angle = ((h % 2 === 0 ? 1 : -1) * (yawBase + h * 1.5)).toFixed(1);
        addEv('HEAD_ROTATION', 'head_rotate', 'camera', { extra: { yaw: angle, pitch: (12.4 + h * 0.8).toFixed(1) } }, 200);
      }
      addEv('TARGET_FOCUSED', 'gaze_dwell', 'earth_element', { conceptId: 'earth', type: 'element' }, 15000);
      addEv('CONCEPT_DISCOVERED', 'discover_concept', 'vata', { conceptId: 'vata', type: 'dosha' }, 18000);
      addEv('DHONGA_GRIND_COMPLETE', 'grind_complete', 'mortar_pestle', { circles: 3, action: 'grind_complete' }, 12000);
    }

    addEv('VIDEO_COMPLETE', 'experience_end', null, { condition: cond }, 10000);
    addEv('QUESTIONNAIRE_OPEN', 'questionnaire_begin', null, { condition: cond }, 1000);

    answers.forEach((ans, aIdx) => {
      addEv('OBJECT_INTERACT', 'select_option', `Q${aIdx + 1}`, { question_id: `Q${aIdx + 1}`, selected_option: ans, response: ans }, 2500);
    });

    addEv('OBJECT_INTERACT', 'input_text', 'Q9', { question_id: 'Q9', text: q9Text, verbatim: q9Text, response: q9Text }, 18000);

    const ratings = [{ q: 'Q10', r: q10 }, { q: 'Q11', r: q11 }, { q: 'Q12', r: q12 }, { q: 'Q13', r: q13 }];
    ratings.forEach((item) => {
      addEv('OBJECT_INTERACT', 'rate_experience', item.q, { question_id: item.q, rating: item.r, response: item.r }, 2000);
    });

    if (cond === 'C4' && c4Discomfort) {
      addEv('OBJECT_INTERACT', 'rate_discomfort', 'C4_discomfort', { question_id: 'C4_discomfort', discomfort_level: c4Discomfort, response: c4Discomfort }, 2000);
    }

    addEv('ASSESSMENT_SUBMIT', 'submit_questionnaire', null, { knowledge_total: totalScore, condition: cond, q9_verbatim: q9Text }, 2000);
    addEv('VIDEO_EXIT', 'session_complete', null, { condition: cond }, 500);
  }

  // Batch insert all assessments
  console.log(`Inserting ${allAssessments.length} assessment records in batches...`);
  for (let i = 0; i < allAssessments.length; i += 50) {
    const chunk = allAssessments.slice(i, i + 50);
    const valueClauses = chunk.map((_, idx) => `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`).join(',');
    const flatParams = chunk.flat();
    await pool.query(
      `INSERT INTO assessments (session_id, participant_id, question_id, given_answer, accuracy, score, created_at)
       VALUES ${valueClauses}`,
      flatParams
    );
  }

  // Batch insert all events
  console.log(`Inserting ${allEvents.length} telemetry events in batches...`);
  for (let i = 0; i < allEvents.length; i += 40) {
    const chunk = allEvents.slice(i, i + 40);
    const valueClauses = chunk.map((_, idx) =>
      `($${idx * 13 + 1}, $${idx * 13 + 2}, $${idx * 13 + 3}, $${idx * 13 + 4}, $${idx * 13 + 5}, $${idx * 13 + 6}, $${idx * 13 + 7}, $${idx * 13 + 8}, $${idx * 13 + 9}, $${idx * 13 + 10}, $${idx * 13 + 11}, $${idx * 13 + 12}, $${idx * 13 + 13})`
    ).join(',');
    const flatParams = chunk.flat();
    await pool.query(
      `INSERT INTO events (
        session_id, participant_id, event_id, event_type, condition, story_id,
        elapsed_ms, target_id, action, result, payload, event_timestamp, created_at
      ) VALUES ${valueClauses}`,
      flatParams
    );
  }

  console.log('✅ Successfully imported all 18 preview records into PostgreSQL!');
  await pool.end();
}

if (process.argv[1]?.endsWith('import_preview_dataset.js')) {
  importPreviewDataset().catch(console.error);
}
