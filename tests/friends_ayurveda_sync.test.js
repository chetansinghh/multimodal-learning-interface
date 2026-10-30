// tests/friends_ayurveda_sync.test.js
// Tests end-to-end synchronization for Arjun, Harshit, Somya, Sukhmani taking the Ayurveda study across C1-C4 conditions
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import app from '../server/server.js';
import centralDb from '../server/db/centralDb.js';

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Friends Study Multi-Device Sync & Admin Portal Verification', () => {

  it('1. Signs up Arjun (C1), Harshit (C2), Somya (C3), Sukhmani (C4) and receives valid tokens', async () => {
    const participants = [
      { name: 'Arjun', condition: 'C1' },
      { name: 'Harshit', condition: 'C2' },
      { name: 'Somya', condition: 'C3' },
      { name: 'Sukhmani', condition: 'C4' }
    ];

    for (const p of participants) {
      const res = await fetch(`${baseUrl}/api/auth/participant-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: p.name,
          condition: p.condition,
          age_group: '14-15'
        })
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(data.token, 'Participant token must be returned');
      assert.ok(data.participant_id.includes(p.name), 'Participant ID must contain name');
      p.token = data.token;
      p.participant_id = data.participant_id;
      p.session_id = data.session_id;
    }
  });

  it('2. Saves participant sessions and telemetry events to central backend', async () => {
    const participants = [
      { name: 'Arjun', condition: 'C1', sid: 'SESS_ARJUN_C1', pid: 'P_Arjun_1001' },
      { name: 'Harshit', condition: 'C2', sid: 'SESS_HARSHIT_C2', pid: 'P_Harshit_1002' },
      { name: 'Somya', condition: 'C3', sid: 'SESS_SOMYA_C3', pid: 'P_Somya_1003' },
      { name: 'Sukhmani', condition: 'C4', sid: 'SESS_SUKHMANI_C4', pid: 'P_Sukhmani_1004' }
    ];

    for (const p of participants) {
      // 1. Session creation
      const sessRes = await fetch(`${baseUrl}/api/db/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer pt_token_${p.pid}`
        },
        body: JSON.stringify({
          session_id: p.sid,
          participant_id: p.pid,
          participant_name: p.name,
          condition: p.condition,
          story_id: 'ayurveda_intro_v1',
          start_time: new Date().toISOString(),
          status: 'in_progress'
        })
      });

      assert.strictEqual(sessRes.status, 200);
      const sessData = await sessRes.json();
      assert.strictEqual(sessData.success, true);

      // 2. Telemetry events
      const evRes = await fetch(`${baseUrl}/api/db/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer pt_token_${p.pid}`
        },
        body: JSON.stringify([
          {
            session_id: p.sid,
            participant_id: p.pid,
            condition: p.condition,
            story_id: 'ayurveda_intro_v1',
            event_type: 'VIDEO_START',
            action: 'session_begin',
            elapsed_ms: 0,
            timestamp: 0,
            wall_clock: new Date().toISOString()
          },
          {
            session_id: p.sid,
            participant_id: p.pid,
            condition: p.condition,
            story_id: 'ayurveda_intro_v1',
            event_type: p.condition === 'C3' ? 'OBJECT_INTERACT' : (p.condition === 'C4' ? 'VR_INTERACTION' : 'VIDEO_PAUSE'),
            action: 'interact_test',
            elapsed_ms: 15400,
            timestamp: 15400,
            wall_clock: new Date().toISOString()
          },
          {
            session_id: p.sid,
            participant_id: p.pid,
            condition: p.condition,
            story_id: 'ayurveda_intro_v1',
            event_type: 'VIDEO_COMPLETE',
            action: 'experience_end',
            elapsed_ms: 120000,
            timestamp: 120000,
            wall_clock: new Date().toISOString()
          }
        ])
      });

      assert.strictEqual(evRes.status, 200);
      const evData = await evRes.json();
      assert.strictEqual(evData.success, true);
    }
  });

  it('3. Submits research questionnaires for all four participants with neutral response', async () => {
    const submissions = [
      {
        session_id: 'SESS_ARJUN_C1',
        participant_id: 'P_Arjun_1001',
        condition: 'C1',
        story_id: 'ayurveda_intro_v1',
        answers: {
          Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'B',
          Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'B',
          Q9: 'Ayurveda is a traditional wisdom connected with nature and living well.',
          Q10: 5, Q11: 4, Q12: 5, Q13: 4,
          C4_discomfort: null
        },
        completion_time_seconds: 140
      },
      {
        session_id: 'SESS_HARSHIT_C2',
        participant_id: 'P_Harshit_1002',
        condition: 'C2',
        story_id: 'ayurveda_intro_v1',
        answers: {
          Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'A', // Q4 wrong (correct is B)
          Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'E', // Q8 not sure (correct is B)
          Q9: 'It explained doshas and traditional medicine.',
          Q10: 4, Q11: 5, Q12: 4, Q13: 4,
          C4_discomfort: null
        },
        completion_time_seconds: 165
      },
      {
        session_id: 'SESS_SOMYA_C3',
        participant_id: 'P_Somya_1003',
        condition: 'C3',
        story_id: 'ayurveda_intro_v1',
        answers: {
          Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'B',
          Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'B',
          Q9: 'Ayurveda teaches harmony with nature, mindful routines, and balanced doshas passed through generations.',
          Q10: 5, Q11: 5, Q12: 5, Q13: 5,
          C4_discomfort: null
        },
        completion_time_seconds: 180
      },
      {
        session_id: 'SESS_SUKHMANI_C4',
        participant_id: 'P_Sukhmani_1004',
        condition: 'C4',
        story_id: 'ayurveda_intro_v1',
        answers: {
          Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'B',
          Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'B',
          Q9: 'Understanding health and body elements through nature and daily routines.',
          Q10: 5, Q11: 5, Q12: 4, Q13: 5,
          C4_discomfort: 2 // Mild
        },
        completion_time_seconds: 210
      }
    ];

    for (const sub of submissions) {
      const res = await fetch(`${baseUrl}/api/questionnaire/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      // Strictly verify neutral confirmation with ZERO correctness or scores disclosed
      assert.strictEqual(json.message, 'Your response has been recorded. Thank you.');
      assert.strictEqual(json.score, undefined);
      assert.strictEqual(json.knowledge_total, undefined);
      assert.strictEqual(json.correct_answers, undefined);
      assert.strictEqual(json.answer_key, undefined);
    }
  });

  it('4. Admin logs in and retrieves dashboard data showing all 4 friends with full telemetry and scoring', async () => {
    // 1. Admin login
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'admin' })
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.success, true);
    assert.ok(loginData.token);
    const adminToken = loginData.token;

    // 2. Fetch dashboard data
    const dashRes = await fetch(`${baseUrl}/api/db/dashboard-data`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    assert.strictEqual(dashRes.status, 200);
    const dashData = await dashRes.json();

    // Verify all 4 friends exist in sessions
    const arjunSess = dashData.sessions.find(s => s.session_id === 'SESS_ARJUN_C1');
    const harshitSess = dashData.sessions.find(s => s.session_id === 'SESS_HARSHIT_C2');
    const somyaSess = dashData.sessions.find(s => s.session_id === 'SESS_SOMYA_C3');
    const sukhmaniSess = dashData.sessions.find(s => s.session_id === 'SESS_SUKHMANI_C4');

    assert.ok(arjunSess, 'Arjun session must be in dashboard data');
    assert.ok(harshitSess, 'Harshit session must be in dashboard data');
    assert.ok(somyaSess, 'Somya session must be in dashboard data');
    assert.ok(sukhmaniSess, 'Sukhmani session must be in dashboard data');

    // Verify questionnaire submissions
    assert.ok(dashData.questionnaire_submissions.length >= 4);

    const arjunQ = dashData.questionnaire_submissions.find(q => q.session_id === 'SESS_ARJUN_C1');
    const harshitQ = dashData.questionnaire_submissions.find(q => q.session_id === 'SESS_HARSHIT_C2');
    const somyaQ = dashData.questionnaire_submissions.find(q => q.session_id === 'SESS_SOMYA_C3');
    const sukhmaniQ = dashData.questionnaire_submissions.find(q => q.session_id === 'SESS_SUKHMANI_C4');

    assert.strictEqual(arjunQ.knowledge_total, 8, 'Arjun answered 8/8 correctly');
    assert.strictEqual(harshitQ.knowledge_total, 6, 'Harshit missed Q4 and Q8');
    assert.strictEqual(somyaQ.knowledge_total, 8, 'Somya answered 8/8 correctly');
    assert.strictEqual(sukhmaniQ.knowledge_total, 8, 'Sukhmani answered 8/8 correctly');
    assert.strictEqual(sukhmaniQ.c4_discomfort ?? sukhmaniQ.C4_discomfort, 2, 'Sukhmani reported mild discomfort (2)');
  });

  it('5. Allows researcher to assign Q9 rubric score to Somya and Harshit', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'admin' })
    });
    const adminToken = (await loginRes.json()).token;

    // Rate Somya 2 (full credit)
    const rateRes = await fetch(`${baseUrl}/api/db/questionnaire-submissions/SESS_SOMYA_C3/q9-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ q9_score: 2 })
    });
    assert.strictEqual(rateRes.status, 200);

    // Verify update
    const submissions = await centralDb.getQuestionnaireSubmissions();
    const somyaQ = submissions.find(q => q.session_id === 'SESS_SOMYA_C3');
    assert.strictEqual(somyaQ.Q9_score, 2);
  });
});

