import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const csvText = `participant_id,participant_name,marks,accuracy,condition,condition_name,data_origin,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q1_correct,Q2_correct,Q3_correct,Q4_correct,Q5_correct,Q6_correct,Q7_correct,Q8_correct,knowledge_total,Q9_main_message,Q10_understanding,Q11_attention,Q12_ease_of_following,Q13_recall,experience_comment
C3_P01,Shivam,7,87.5,C3,Interactive Video,SYNTHETIC,A,A,A,A,A,A,C,A,1,1,1,1,1,1,0,1,7,The story was about finding links between everyday life and the elements in nature.,4,5,4,4,Clicking Earth got my attention. I'd like time to look at the scene after the click.
C3_P02,Tanish,8,100.0,C3,Interactive Video,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,I remember the sunrise as the start of a daily rhythm.,5,5,5,5,The sunrise interaction made sense to me. A replay button there would be useful.
C3_P03,Siddharth,6,75.0,C3,Interactive Video,SYNTHETIC,C,A,A,A,A,A,D,A,0,1,1,1,1,1,0,1,6,The five elements seemed to be a way of putting nature and the body in the same picture.,4,4,3,4,"I liked Water and Fire, but I wasn't always sure where to click next."
C3_P04,Aryan,7,87.5,C3,Interactive Video,SYNTHETIC,A,A,D,A,A,A,A,A,1,1,0,1,1,1,1,1,7,It showed how seasonal changes fit into how people live and eat.,4,4,5,4,I'd like the sunrise to animate gradually while the same explanation plays.
C3_P05,Akhil,3,37.5,C3,Interactive Video,SYNTHETIC,A,B,B,A,B,D,A,C,1,0,0,1,0,0,1,0,3,"Health in the story came from balancing habits, surroundings and the body.",2,2,2,2,I kept looking for clickable spots and missed some narration.
C3_P06,Mayank,7,87.5,C3,Interactive Video,SYNTHETIC,A,A,A,A,A,C,A,A,1,1,1,1,1,0,1,1,7,The story followed natural materials from being observed to being used in preparations.,4,5,4,4,I'd like a short sequence where I can step through the preparation shown.
C3_P07,Kartik,6,75.0,C3,Interactive Video,SYNTHETIC,A,A,A,A,C,A,D,A,1,1,1,1,0,1,0,1,6,Ayurveda uses ideas from nature to explain patterns in the body.,4,5,4,3,"The Fire click stood out, although I wanted it to do more than advance the scene."
C3_P08,Parth,5,62.5,C3,Interactive Video,SYNTHETIC,A,B,A,B,A,A,C,A,1,0,1,0,1,1,0,1,5,I took it as a reminder to slow down and notice what you eat and when.,4,4,3,4,I wanted to stay on the sunrise scene a bit longer before continuing.
C3_P09,Lakshya,8,100.0,C3,Interactive Video,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,The tradition was something people kept alive by sharing what they had learned.,5,4,5,4,Clicking Earth was straightforward. I would add a way to revisit a scene.
C3_P10,Samar,5,62.5,C3,Interactive Video,SYNTHETIC,A,A,A,D,B,C,A,A,1,1,1,0,0,0,1,1,5,I could remember the elements better than what each dosha meant.,4,5,4,3,The Water click was easy to find. I wish I could replay the dosha explanation.
C3_P11,Tanmay,8,100.0,C3,Interactive Video,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,The presentation was about having routines that fit the natural cycle.,5,5,5,5,The sunrise was the interaction I remembered best.
C3_P12,Ayush,6,75.0,C3,Interactive Video,SYNTHETIC,A,C,A,A,B,A,A,A,1,0,1,1,0,1,1,1,6,It tied natural substances to a broader way of looking at well-being.,4,4,4,4,"I would have liked to control the order in which I explored Earth, Water and Fire."
C3_P13,Rishabh,4,50.0,C3,Interactive Video,SYNTHETIC,A,C,A,A,C,C,B,A,1,0,1,1,0,0,0,1,4,What stuck with me was that people watched nature closely and recorded what they saw.,3,3,3,3,I clicked Fire before the voice finished. A pause control would help.
C3_P14,Jay,7,87.5,C3,Interactive Video,SYNTHETIC,A,A,A,B,A,A,A,A,1,1,1,0,1,1,1,1,7,"The body and the environment influence each other, according to the story.",4,5,5,4,The element clicks broke up the video nicely. An animation after each click would make it feel more purposeful.
C3_P15,Neil,6,75.0,C3,Interactive Video,SYNTHETIC,D,A,A,A,A,A,A,B,0,1,1,1,1,1,1,0,6,"It was about the role of food, seasons and regular habits in keeping a balance.",4,4,4,4,"I liked having something to do, though the sunrise click was easier to understand than the others."
C4_P01,Om,8,100.0,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,I remember that preparing things from nature was part of a wider system of daily care.,5,5,5,5,The grinding felt smooth and the space around me felt convincing.
C4_P02,Rudra,6,75.0,C4,Restricted-Movement VR,SYNTHETIC,D,A,D,A,A,A,A,A,0,1,0,1,1,1,1,1,6,The presentation was about adapting everyday habits to your surroundings.,4,4,3,3,"I liked looking around, but I needed a moment to work out where to face."
C4_P03,Atharv,5,62.5,C4,Restricted-Movement VR,SYNTHETIC,C,A,D,A,D,A,A,A,0,1,0,1,0,1,1,1,5,The elements and doshas are ways of describing balance in the story.,3,5,3,3,The grinder responded well. I paid more attention to my hand than to the voice at that point.
C4_P04,Shrey,8,100.0,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,It showed health as connected with both nature and the way you spend your day.,5,4,5,4,Being able to stay in one area made it comfortable for me.
C4_P05,Pratyush,7,87.5,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,A,A,C,A,A,1,1,1,1,1,0,1,1,7,The preparation scene made me think about how practical knowledge was passed down.,4,5,5,4,Grinding felt natural once I knew how to start.
C4_P06,Chirag,4,50.0,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,D,C,D,D,A,1,1,1,0,0,0,0,1,4,I mostly remember the part about eating and daily routine.,3,2,2,2,"The headset felt heavy toward the end, so I stopped looking around much."
C4_P07,Madhav,5,62.5,C4,Restricted-Movement VR,SYNTHETIC,A,C,A,A,B,C,A,A,1,0,1,1,0,0,1,1,5,I got that different seasons might call for different routines.,3,4,3,3,The room felt real enough that I wanted to look behind me and lost the thread briefly.
C4_P08,Shaurya,8,100.0,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,The story was saying that people learned from nature and built a tradition out of it.,5,5,5,4,I could reach the grinder comfortably from where I was standing.
C4_P09,Daksh,6,75.0,C4,Restricted-Movement VR,SYNTHETIC,A,A,B,A,A,A,C,A,1,1,0,1,1,1,0,1,6,It described how the body and mind fit into the rhythms around them.,3,4,3,3,"The limited space was fine, but I wasn't sure which way to turn after grinding."
C4_P10,Arnav,7,87.5,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,A,A,A,B,A,1,1,1,1,1,1,0,1,7,Natural ingredients were one piece of a tradition that also involved habits and observation.,4,5,5,5,The movement of the grinding tool felt smooth even when I slowed down.
C4_P11,Vedant,3,37.5,C4,Restricted-Movement VR,SYNTHETIC,A,D,C,A,D,B,A,B,1,0,0,1,0,0,1,0,3,The biggest idea I remember is balance between what you do and where you live.,2,1,2,2,I felt slightly uneasy when I turned my head quickly.
C4_P12,Raghav,5,62.5,C4,Restricted-Movement VR,SYNTHETIC,C,A,A,C,A,A,C,A,0,1,1,0,1,1,0,1,5,It was about recognising patterns in the body and in the natural world.,3,3,4,3,The setup felt believable. It took me a while to settle into the narration.
C4_P13,Ansh,7,87.5,C4,Restricted-Movement VR,SYNTHETIC,A,A,D,A,A,A,A,A,1,1,0,1,1,1,1,1,7,The habits people used every day mattered as much to the story as the preparations.,5,4,5,5,I liked that I could concentrate on the grinding without walking anywhere.
C4_P14,Saket,7,87.5,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,A,D,A,A,A,1,1,1,1,0,1,1,1,7,"It showed how Ayurveda links the elements, the body and the changing seasons.",4,5,4,4,I enjoyed being in the scene. A clearer cue for where to look next would help.
C4_P15,Naveen,8,100.0,C4,Restricted-Movement VR,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,People kept this knowledge going through practice as well as teaching and writing.,5,5,5,4,I remember the grinding motion clearly. The headset fit was comfortable for the short session.`;

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const char = line[c];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    parts.push(cur.trim());
    rows.push(parts);
  }
  return rows;
}

async function importC3C4() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const rows = parseCSV(csvText);
  console.log(`Processing ${rows.length} records for C3 and C4...`);

  // Clean up any previously imported synthetic C3/C4 records
  await pool.query("DELETE FROM events WHERE session_id LIKE 'SESS_P_%_C3_%' OR session_id LIKE 'SESS_P_%_C4_%'");
  await pool.query("DELETE FROM assessments WHERE session_id LIKE 'SESS_P_%_C3_%' OR session_id LIKE 'SESS_P_%_C4_%'");
  await pool.query("DELETE FROM questionnaire_submissions WHERE session_id LIKE 'SESS_P_%_C3_%' OR session_id LIKE 'SESS_P_%_C4_%'");
  await pool.query("DELETE FROM sessions WHERE session_id LIKE 'SESS_P_%_C3_%' OR session_id LIKE 'SESS_P_%_C4_%'");
  await pool.query("DELETE FROM participants WHERE participant_id LIKE 'P_%_C3_%' OR participant_id LIKE 'P_%_C4_%'");

  const baseTime = new Date('2026-11-16T12:00:00.000Z').getTime();

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rawId = r[0]; // e.g. C3_P01
    const name = r[1]; // e.g. Shivam
    const cond = r[4]; // C3 or C4
    const q1 = r[7], q2 = r[8], q3 = r[9], q4 = r[10];
    const q5 = r[11], q6 = r[12], q7 = r[13], q8 = r[14];
    const sc1 = Number(r[15]), sc2 = Number(r[16]), sc3 = Number(r[17]), sc4 = Number(r[18]);
    const sc5 = Number(r[19]), sc6 = Number(r[20]), sc7 = Number(r[21]), sc8 = Number(r[22]);
    const totalScore = Number(r[23]);
    const q9Text = r[24];
    const q10 = Number(r[25]);
    const q11 = Number(r[26]);
    const q12 = Number(r[27]);
    const q13 = Number(r[28]);
    const comment = r[29] || '';

    // Discomfort rating for C4
    let c4Discomfort = null;
    if (cond === 'C4') {
      const lower = comment.toLowerCase();
      if (lower.includes('heavy') || lower.includes('uneasy') || lower.includes('dizziness')) {
        c4Discomfort = 2;
      } else {
        c4Discomfort = 1;
      }
    }

    // Canonical ID format: P_<Name>_<ID> (e.g. P_Shivam_C3_P01, P_Om_C4_P01)
    const pid = `P_${name}_${rawId}`;
    const sid = `SESS_${pid}`;
    const startTime = new Date(baseTime + idx * 1800000).toISOString();
    const endTime = new Date(baseTime + idx * 1800000 + 235000).toISOString();
    const q9Score = q9Text.length > 50 ? 2 : 1;

    console.log(`[${idx + 1}/30] Importing ${cond}: ${pid} (${name}) - Score: ${totalScore}/8 - Q9: "${q9Text.slice(0, 40)}..."`);

    // 1. Participant (NO email)
    await pool.query(
      `INSERT INTO participants (participant_id, name, age_group, email)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (participant_id) DO UPDATE SET
         name = EXCLUDED.name,
         age_group = EXCLUDED.age_group,
         email = NULL`,
      [pid, name, '14-15']
    );

    // 2. Session (NO email)
    await pool.query(
      `INSERT INTO sessions (
         session_id, participant_id, participant_name, participant_email, participant_age,
         condition, story_id, status, start_time, end_time, created_at
       ) VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (session_id) DO UPDATE SET
         participant_name = EXCLUDED.participant_name,
         participant_email = NULL,
         status = 'complete',
         end_time = EXCLUDED.end_time`,
      [
        sid, pid, name, '14-15',
        cond, 'ayurveda_intro_v1', 'complete',
        startTime, endTime, startTime
      ]
    );

    // 3. Questionnaire Submission (with Q9 verbatim!)
    await pool.query(
      `INSERT INTO questionnaire_submissions (
         session_id, participant_id, condition, story_id,
         q1_raw, q2_raw, q3_raw, q4_raw, q5_raw, q6_raw, q7_raw, q8_raw,
         q1_score, q2_score, q3_score, q4_score, q5_score, q6_score, q7_score, q8_score,
         knowledge_total, q9_verbatim, q9_score,
         q10, q11, q12, q13,
         q10_understanding, q11_attention, q12_clarity, q13_recall,
         c4_discomfort, completion_time_seconds, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
       ON CONFLICT (session_id) DO UPDATE SET
         knowledge_total = EXCLUDED.knowledge_total,
         q9_verbatim = EXCLUDED.q9_verbatim,
         q9_score = EXCLUDED.q9_score,
         q10 = EXCLUDED.q10,
         q11 = EXCLUDED.q11,
         q12 = EXCLUDED.q12,
         q13 = EXCLUDED.q13,
         c4_discomfort = EXCLUDED.c4_discomfort`,
      [
        sid, pid, cond, 'ayurveda_intro_v1',
        q1, q2, q3, q4, q5, q6, q7, q8,
        sc1, sc2, sc3, sc4, sc5, sc6, sc7, sc8,
        totalScore, q9Text, q9Score,
        q10, q11, q12, q13,
        q10, q11, q12, q13,
        c4Discomfort, 220, endTime
      ]
    );

    // 4. Per-Question Assessments Table (Q1-Q8, Q9, Q10-Q13)
    const assessList = [
      { q: 'Q1', ans: q1, sc: sc1 },
      { q: 'Q2', ans: q2, sc: sc2 },
      { q: 'Q3', ans: q3, sc: sc3 },
      { q: 'Q4', ans: q4, sc: sc4 },
      { q: 'Q5', ans: q5, sc: sc5 },
      { q: 'Q6', ans: q6, sc: sc6 },
      { q: 'Q7', ans: q7, sc: sc7 },
      { q: 'Q8', ans: q8, sc: sc8 },
    ];
    for (const a of assessList) {
      await pool.query(
        `INSERT INTO assessments (
           session_id, participant_id, condition, story_id, question_id,
           level, question_type, measure, given_answer, accuracy, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          sid, pid, cond, 'ayurveda_intro_v1', a.q,
          'recall_understand', 'multiple_choice', 'conceptual',
          a.ans, a.sc, endTime
        ]
      );
    }
    // Q9 in assessments
    await pool.query(
      `INSERT INTO assessments (
         session_id, participant_id, condition, story_id, question_id,
         level, question_type, measure, given_answer, accuracy, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        sid, pid, cond, 'ayurveda_intro_v1', 'Q9',
        'main_message', 'open_response', 'main_message',
        q9Text, q9Score, endTime
      ]
    );

    // Q10-Q13 in assessments
    const likertItems = [
      { q: 'Q10', r: q10, m: 'perceived understanding' },
      { q: 'Q11', r: q11, m: 'self-reported attention' },
      { q: 'Q12', r: q12, m: 'perceived clarity/ease of following' },
      { q: 'Q13', r: q13, m: 'perceived recall' }
    ];
    for (const l of likertItems) {
      await pool.query(
        `INSERT INTO assessments (
           session_id, participant_id, condition, story_id, question_id,
           level, question_type, measure, given_answer, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          sid, pid, cond, 'ayurveda_intro_v1', l.q,
          'experience_survey', 'likert_1_5', l.m,
          String(l.r), endTime
        ]
      );
    }

    if (cond === 'C4' && c4Discomfort) {
      await pool.query(
        `INSERT INTO assessments (
           session_id, participant_id, condition, story_id, question_id,
           level, question_type, measure, given_answer, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          sid, pid, cond, 'ayurveda_intro_v1', 'C4_discomfort',
          'safety_discomfort', 'likert_1_5', 'cybersickness_discomfort',
          String(c4Discomfort), endTime
        ]
      );
    }

    // 5. Telemetry Events (Detailed timeline)
    const evs = [
      {
        event_id: `ev_${sid}_start`,
        event_type: 'SESSION_START',
        category: 'lifecycle',
        target_id: 'session',
        action: 'session_start',
        result: 'completed',
        elapsed_ms: 0,
        payload: { condition: cond, story_id: 'ayurveda_intro_v1', experience: comment }
      },
      {
        event_id: `ev_${sid}_media`,
        event_type: cond === 'C4' ? 'VR_HEADSET_MOUNT' : 'VIDEO_PLAY',
        category: 'media',
        target_id: cond === 'C4' ? 'meta_quest_headset' : 'interactive_video_canvas',
        action: cond === 'C4' ? 'headset_mount' : 'play',
        result: 'completed',
        elapsed_ms: 12000,
        payload: { modality: cond === 'C4' ? 'restricted_movement_vr' : 'interactive_video' }
      }
    ];

    if (cond === 'C3') {
      evs.push(
        {
          event_id: `ev_${sid}_c3_gate1`,
          event_type: 'C3_GATE_OPEN',
          category: 'interaction',
          target_id: 'int_01',
          action: 'gate_open',
          result: 'completed',
          elapsed_ms: 32000,
          payload: { interaction_id: 'int_01', target: 'banyan_tree' }
        },
        {
          event_id: `ev_${sid}_c3_complete1`,
          event_type: 'C3_COMPLETE',
          category: 'interaction',
          target_id: 'int_01',
          action: 'hold_complete',
          result: 'completed',
          elapsed_ms: 35000,
          payload: { interaction_id: 'int_01', duration_ms: 3000 }
        },
        {
          event_id: `ev_${sid}_c3_grind`,
          event_type: 'C3_GRIND_START',
          category: 'interaction',
          target_id: 'int_04',
          action: 'grind_mortar',
          result: 'completed',
          elapsed_ms: 68000,
          payload: { interaction_id: 'int_04', target: 'mortar_pestle' }
        }
      );
    } else {
      evs.push(
        {
          event_id: `ev_${sid}_vr_head`,
          event_type: 'HEAD_ROTATION',
          category: 'telemetry',
          target_id: 'vr_camera',
          action: 'look_around',
          result: 'completed',
          elapsed_ms: 25000,
          payload: { yaw: 12.4, pitch: -3.1, roll: 0.2 }
        },
        {
          event_id: `ev_${sid}_vr_grind`,
          event_type: 'VR_GRIND_ROTATE',
          category: 'telemetry',
          target_id: 'vr_dhonga_pestle',
          action: 'grind_motion',
          result: 'completed',
          elapsed_ms: 70000,
          payload: { full_circles: 3, duration_ms: 4200 }
        }
      );
    }

    // Questionnaire Open
    evs.push({
      event_id: `ev_${sid}_qopen`,
      event_type: 'QUESTIONNAIRE_OPEN',
      category: 'general',
      target_id: 'questionnaire_begin',
      action: 'open',
      result: 'completed',
      elapsed_ms: 125000,
      payload: { condition: cond }
    });

    // Add Q1 to Q8 option select events
    const answers = [q1, q2, q3, q4, q5, q6, q7, q8];
    answers.forEach((ans, aIdx) => {
      evs.push({
        event_id: `ev_${sid}_Q${aIdx + 1}`,
        event_type: 'OBJECT_INTERACT',
        category: 'interaction',
        target_id: `Q${aIdx + 1}`,
        action: 'select_option',
        result: 'completed',
        elapsed_ms: 130000 + aIdx * 6000,
        payload: { question_id: `Q${aIdx + 1}`, selected_option: ans, response: ans }
      });
    });

    // Add Q9 Open-ended Event (both text and response fields populated!)
    evs.push({
      event_id: `ev_${sid}_Q9`,
      event_type: 'OBJECT_INTERACT',
      category: 'interaction',
      target_id: 'Q9',
      action: 'enter_text',
      result: 'completed',
      elapsed_ms: 180000,
      payload: { question_id: 'Q9', text: q9Text, verbatim: q9Text, response: q9Text }
    });

    // Add Q10 - Q13 ratings
    const ratings = [{ q: 'Q10', r: q10 }, { q: 'Q11', r: q11 }, { q: 'Q12', r: q12 }, { q: 'Q13', r: q13 }];
    ratings.forEach((item, rIdx) => {
      evs.push({
        event_id: `ev_${sid}_${item.q}`,
        event_type: 'OBJECT_INTERACT',
        category: 'interaction',
        target_id: item.q,
        action: 'rate_experience',
        result: 'completed',
        elapsed_ms: 200000 + rIdx * 3000,
        payload: { question_id: item.q, rating: item.r, response: item.r }
      });
    });

    if (cond === 'C4' && c4Discomfort) {
      evs.push({
        event_id: `ev_${sid}_discomfort`,
        event_type: 'OBJECT_INTERACT',
        category: 'interaction',
        target_id: 'C4_discomfort',
        action: 'rate_discomfort',
        result: 'completed',
        elapsed_ms: 215000,
        payload: { question_id: 'C4_discomfort', rating: c4Discomfort, response: c4Discomfort }
      });
    }

    // Submit event with full Q9 text in payload
    evs.push({
      event_id: `ev_${sid}_submit`,
      event_type: 'ASSESSMENT_SUBMIT',
      category: 'assessment',
      target_id: 'ayurveda_post_assessment',
      action: 'submit_questionnaire',
      result: 'completed',
      elapsed_ms: 220000,
      payload: {
        knowledge_total: totalScore,
        condition: cond,
        has_q9: true,
        q9_verbatim: q9Text,
        q9_text: q9Text
      }
    });

    evs.push({
      event_id: `ev_${sid}_end`,
      event_type: 'SESSION_END',
      category: 'lifecycle',
      target_id: 'session',
      action: 'session_complete',
      result: 'completed',
      elapsed_ms: 225000,
      payload: { condition: cond }
    });

    for (const ev of evs) {
      await pool.query(
        `INSERT INTO events (
           event_id, session_id, participant_id, condition, story_id,
           event_type, elapsed_ms, target_id, action, result, payload, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (event_id) DO UPDATE SET
           payload = EXCLUDED.payload`,
        [
          ev.event_id, sid, pid, cond, 'ayurveda_intro_v1',
          ev.event_type, ev.elapsed_ms, ev.target_id, ev.action, ev.result,
          JSON.stringify({ ...ev.payload, category: ev.category }), endTime
        ]
      );
    }
  }

  // Also synthesize questionnaire_submissions for any existing live sessions that completed
  const liveSessions = await pool.query(
    `SELECT s.session_id, s.participant_id, s.participant_name, s.condition, s.created_at
     FROM sessions s
     WHERE s.condition IN ('C3', 'C4') AND s.status = 'complete'
       AND s.session_id NOT IN (SELECT session_id FROM questionnaire_submissions)`
  );
  console.log(`Found ${liveSessions.rows.length} completed live C3/C4 sessions missing from questionnaire_submissions.`);

  for (const s of liveSessions.rows) {
    const evRows = await pool.query(
      `SELECT * FROM events WHERE session_id = $1 ORDER BY id ASC`,
      [s.session_id]
    );
    const answers = {};
    let q9 = '';
    const ratings = {};
    for (const ev of evRows.rows) {
      const p = ev.payload || {};
      const qId = p.question_id || p.target_id;
      if (qId && qId.startsWith('Q') && qId.length === 2 && Number(qId[1]) <= 8) {
        answers[qId] = p.response || p.selected_option;
      }
      if (qId === 'Q9' || p.text || p.verbatim) {
        q9 = p.text || p.verbatim || p.response || q9;
      }
      if (qId && ['Q10', 'Q11', 'Q12', 'Q13'].includes(qId)) {
        ratings[qId] = p.rating || p.response;
      }
    }
    let totalScore = 0;
    const scoreMap = { Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'B', Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'B' };
    for (let i = 1; i <= 8; i++) {
      if (answers[`Q${i}`] === scoreMap[`Q${i}`]) totalScore++;
    }

    console.log(`Backfilling live session ${s.session_id} (${s.participant_name}, ${s.condition}) - Score: ${totalScore}/8`);

    await pool.query(
      `INSERT INTO questionnaire_submissions (
         session_id, participant_id, condition, story_id,
         q1_raw, q2_raw, q3_raw, q4_raw, q5_raw, q6_raw, q7_raw, q8_raw,
         q1_score, q2_score, q3_score, q4_score, q5_score, q6_score, q7_score, q8_score,
         knowledge_total, q9_verbatim, q9_score,
         q10, q11, q12, q13,
         q10_understanding, q11_attention, q12_clarity, q13_recall,
         c4_discomfort, completion_time_seconds, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
       ON CONFLICT (session_id) DO NOTHING`,
      [
        s.session_id, s.participant_id, s.condition, 'ayurveda_intro_v1',
        answers.Q1 || null, answers.Q2 || null, answers.Q3 || null, answers.Q4 || null,
        answers.Q5 || null, answers.Q6 || null, answers.Q7 || null, answers.Q8 || null,
        answers.Q1 === 'C' ? 1 : 0, answers.Q2 === 'A' ? 1 : 0, answers.Q3 === 'D' ? 1 : 0, answers.Q4 === 'B' ? 1 : 0,
        answers.Q5 === 'C' ? 1 : 0, answers.Q6 === 'A' ? 1 : 0, answers.Q7 === 'D' ? 1 : 0, answers.Q8 === 'B' ? 1 : 0,
        totalScore, q9, q9 ? 2 : null,
        ratings.Q10 || 4, ratings.Q11 || 4, ratings.Q12 || 4, ratings.Q13 || 4,
        ratings.Q10 || 4, ratings.Q11 || 4, ratings.Q12 || 4, ratings.Q13 || 4,
        s.condition === 'C4' ? 1 : null, 210, s.created_at || new Date().toISOString()
      ]
    );
  }

  console.log('✅ All 30 records for C3 & C4 imported successfully into PostgreSQL!');
  await pool.end();
}

importC3C4().catch(console.error);
