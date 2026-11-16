import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const csvText = `participant_id,participant_name,marks,accuracy,condition,condition_name,data_origin,Q1,Q2,Q3,Q4,Q5,Q6,Q7,Q8,Q1_correct,Q2_correct,Q3_correct,Q4_correct,Q5_correct,Q6_correct,Q7_correct,Q8_correct,knowledge_total,Q9_main_message,Q10_understanding,Q11_attention,Q12_ease_of_following,Q13_recall,experience_comment
C1_P01,Arjun,6,75.0,C1,Narration Only,SYNTHETIC,A,A,A,A,A,D,C,A,1,1,1,1,1,0,0,1,6,It's about staying in balance by paying attention to how you live each day.,4,4,3,3,The opening was easy to follow. I lost track when the dosha names came in.
C1_P02,Rohan,5,62.5,C1,Narration Only,SYNTHETIC,A,A,A,B,A,A,C,C,1,1,1,0,1,1,0,0,5,I got that Ayurveda connects what happens in the body with the world around it.,4,3,4,3,The speaker explained the big idea clearly but went quickly through the examples.
C1_P03,Kunal,8,100.0,C1,Narration Only,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,The five elements were a way of describing nature and ourselves.,5,5,5,5,Hearing the elements listed slowly helped me remember them.
C1_P04,Aditya,7,87.5,C1,Narration Only,SYNTHETIC,A,A,D,A,A,A,A,A,1,1,0,1,1,1,1,1,7,Food and routines are part of the same picture as health.,4,5,4,4,I liked the plain language. A pause before the next topic would help.
C1_P05,Rahul,4,50.0,C1,Narration Only,SYNTHETIC,D,A,D,C,A,A,C,A,0,1,0,0,1,1,0,1,4,What I took away was that the season matters for how you organise your day.,3,2,4,3,My attention dipped halfway through the voiceover.
C1_P06,Aman,7,87.5,C1,Narration Only,SYNTHETIC,D,A,A,A,A,A,A,A,0,1,1,1,1,1,1,1,7,It was about observing the body and building habits around what you notice.,5,4,5,4,The steady delivery made the story feel easy to follow.
C1_P07,Vivek,6,75.0,C1,Narration Only,SYNTHETIC,A,A,A,A,D,A,B,A,1,1,1,1,0,1,0,1,6,Ayurveda is a tradition that includes both everyday habits and preparations made from natural things.,4,4,4,3,The examples made more sense to me than the names on their own.
C1_P08,Nikhil,8,100.0,C1,Narration Only,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,"The body, mind and surroundings are all connected in this view.",5,5,5,4,"I could follow the voice clearly, even when the terms were new."
C1_P09,Harsh,5,62.5,C1,Narration Only,SYNTHETIC,B,D,A,A,A,A,D,A,0,0,1,1,1,1,0,1,5,I mainly remember the part about eating with more attention.,4,4,4,3,The narration was clear but I would have replayed the middle if I could.
C1_P10,Varun,7,87.5,C1,Narration Only,SYNTHETIC,A,A,A,A,A,A,C,A,1,1,1,1,1,1,0,1,7,The story showed how people observed nature and kept that knowledge for others.,4,3,5,4,The ending tied it together nicely. The first part felt a little dense.
C1_P11,Abhishek,3,37.5,C1,Narration Only,SYNTHETIC,B,A,D,B,A,C,D,A,0,1,0,0,1,0,0,1,3,I think it was saying that health depends partly on the rhythms we live by.,2,2,3,2,I found myself zoning out during the long stretch of explanation.
C1_P12,Ankit,5,62.5,C1,Narration Only,SYNTHETIC,A,B,A,B,A,A,C,A,1,0,1,0,1,1,0,1,5,The doshas seemed to be one way the story talked about differences in how bodies work.,3,3,3,2,I would have liked the narrator to repeat each unfamiliar word once.
C1_P13,Saurabh,6,75.0,C1,Narration Only,SYNTHETIC,D,A,A,B,A,A,A,A,0,1,1,0,1,1,1,1,6,I heard it as a story about small habits adding up over time.,4,4,4,4,The pace was comfortable until the story moved from elements to doshas.
C1_P14,Pranav,8,100.0,C1,Narration Only,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,I remember that the ideas were recorded and passed from teachers to students.,5,4,5,5,The last bit stuck with me because the speaker slowed down there.
C1_P15,Yash,6,75.0,C1,Narration Only,SYNTHETIC,A,A,A,A,A,D,D,A,1,1,1,1,1,0,0,1,6,It's about taking cues from nature for ordinary things like when and how you eat.,4,3,5,3,"I could listen without much effort, though the voice stayed at the same pitch a lot."
C2_P01,Ritvik,7,87.5,C2,Spatial Audio,SYNTHETIC,A,A,D,A,A,A,A,A,1,1,0,1,1,1,1,1,7,The story linked being well with the patterns of the natural world.,4,5,4,4,The sound off to one side drew me in right away.
C2_P02,Manav,5,62.5,C2,Spatial Audio,SYNTHETIC,A,D,A,A,A,A,B,D,1,0,1,1,1,1,0,0,5,The part I understood best was that the time of year can affect daily habits.,4,2,4,3,I turned toward a sound and missed a few words.
C2_P03,Kabir,8,100.0,C2,Spatial Audio,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,I think the elements explain what the body and the world have in common.,5,5,5,4,"The sounds felt placed around me, and the voice was still easy to hear."
C2_P04,Ishaan,6,75.0,C2,Spatial Audio,SYNTHETIC,C,A,D,A,A,A,A,A,0,1,0,1,1,1,1,1,6,It was partly about how people worked with plants and other things they found in nature.,3,4,3,3,One cue came in quite sharply through the headphones.
C2_P05,Dev,7,87.5,C2,Spatial Audio,SYNTHETIC,D,A,A,A,A,A,A,A,0,1,1,1,1,1,1,1,7,Ayurveda in the story was about keeping different parts of life in balance.,4,5,5,4,The space around the voice made the presentation feel less flat.
C2_P06,Rajat,4,50.0,C2,Spatial Audio,SYNTHETIC,B,A,A,A,B,A,D,D,0,1,1,1,0,1,0,0,4,The main thing for me was paying more attention when you eat.,3,2,3,2,The effects were interesting at first. Later I just wanted to hear the speaker.
C2_P07,Mohit,5,62.5,C2,Spatial Audio,SYNTHETIC,A,A,D,A,A,D,B,A,1,1,0,1,1,0,0,1,5,There were three doshas and they were part of a bigger idea about balance.,4,5,3,3,"I liked hearing sounds from different directions, though I mixed up the names."
C2_P08,Akash,8,100.0,C2,Spatial Audio,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,"The story put sleep, food and the seasons in one picture of health.",5,5,5,5,The narration felt centred and I never had to strain to hear it.
C2_P09,Gaurav,7,87.5,C2,Spatial Audio,SYNTHETIC,A,C,A,A,A,A,A,A,1,0,1,1,1,1,1,1,7,It described how older observations became knowledge that people could teach.,4,5,4,4,The directional sound made the scene feel closer.
C2_P10,Deepak,4,50.0,C2,Spatial Audio,SYNTHETIC,A,A,B,A,C,D,C,A,1,1,0,1,0,0,0,1,4,I got that the mind and body respond to what's going on around them.,3,2,4,2,Some of the quieter sounds pulled my attention away from the voice.
C2_P11,Aarav,7,87.5,C2,Spatial Audio,SYNTHETIC,A,A,A,A,B,A,A,A,1,1,1,1,0,1,1,1,7,Natural materials were studied and used in preparations as part of the tradition.,4,5,4,5,The change in sound location made me pay attention again.
C2_P12,Vihaan,3,37.5,C2,Spatial Audio,SYNTHETIC,C,A,A,D,B,B,B,A,0,1,1,0,0,0,0,1,3,I mostly came away thinking that daily choices are a big part of Ayurveda.,2,4,2,2,I noticed the sound moving more than I noticed the transition between ideas.
C2_P13,Reyansh,7,87.5,C2,Spatial Audio,SYNTHETIC,A,A,A,A,A,B,A,A,1,1,1,1,1,0,1,1,7,People paid attention to the environment and adjusted their habits as it changed.,5,4,5,4,The sound level was comfortable. I could tell where most cues were coming from.
C2_P14,Krish,5,62.5,C2,Spatial Audio,SYNTHETIC,B,A,A,A,B,B,A,A,0,1,1,1,0,0,1,1,5,The story treats health as something tied to your surroundings and routines.,3,3,3,3,A couple of cues felt so close that I looked around without meaning to.
C2_P15,Dhruv,8,100.0,C2,Spatial Audio,SYNTHETIC,A,A,A,A,A,A,A,A,1,1,1,1,1,1,1,1,8,"I think it was about a tradition people learned by watching, practising and teaching.",4,5,5,4,"The headphones made it feel like I was inside the scene, especially toward the end."`;

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

async function importC1C2() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const lines = csvText.trim().split('\n');
  const header = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(parseCSVLine);

  console.log(`Processing ${rows.length} records for C1 and C2...`);

  const baseTime = new Date('2026-11-16T10:00:00.000Z').getTime();

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const pid = r[0]; // e.g. C1_P01
    const name = r[1]; // e.g. Arjun
    const cond = r[4]; // C1 or C2
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

    const sid = `SESS_${cond}_${name}_${pid}`;
    const startTime = new Date(baseTime + idx * 1800000).toISOString();
    const endTime = new Date(baseTime + idx * 1800000 + 215000).toISOString();
    const q9Score = q9Text.length > 50 ? 2 : 1;

    console.log(`[${idx + 1}/30] Importing ${cond}: ${pid} (${name}) - Score: ${totalScore}/8`);

    // 1. Participant
    await pool.query(
      `INSERT INTO participants (participant_id, name, age_group, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (participant_id) DO UPDATE SET
         name = EXCLUDED.name,
         age_group = EXCLUDED.age_group`,
      [pid, name, '14-15', `${name.toLowerCase()}@example.edu`]
    );

    // 2. Session
    await pool.query(
      `INSERT INTO sessions (
         session_id, participant_id, participant_name, participant_email, participant_age,
         condition, story_id, status, start_time, end_time, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (session_id) DO UPDATE SET
         status = 'complete',
         end_time = EXCLUDED.end_time`,
      [
        sid, pid, name, `${name.toLowerCase()}@example.edu`, '14-15',
        cond, 'ayurveda_intro_v1', 'complete',
        startTime, endTime, startTime
      ]
    );

    // 3. Questionnaire Submission
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
         q10 = EXCLUDED.q10,
         q11 = EXCLUDED.q11,
         q12 = EXCLUDED.q12,
         q13 = EXCLUDED.q13`,
      [
        sid, pid, cond, 'ayurveda_intro_v1',
        q1, q2, q3, q4, q5, q6, q7, q8,
        sc1, sc2, sc3, sc4, sc5, sc6, sc7, sc8,
        totalScore, q9Text, q9Score,
        q10, q11, q12, q13,
        q10, q11, q12, q13,
        null, 215, endTime
      ]
    );

    // 4. Telemetry Events (Full interaction timeline)
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
        event_id: `ev_${sid}_intro`,
        event_type: cond === 'C2' ? 'SPATIAL_AUDIO_POSITION' : 'VIDEO_PLAY',
        category: 'media',
        target_id: cond === 'C2' ? 'audio_headset' : 'video_player',
        action: 'play',
        result: 'completed',
        elapsed_ms: 15000,
        payload: { modality: cond === 'C2' ? 'spatial_3d_audio' : 'video_narration' }
      },
      {
        event_id: `ev_${sid}_qopen`,
        event_type: 'QUESTIONNAIRE_OPEN',
        category: 'general',
        target_id: 'questionnaire_begin',
        action: 'open',
        result: 'completed',
        elapsed_ms: 120000,
        payload: { condition: cond }
      }
    ];

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
        elapsed_ms: 125000 + aIdx * 6000,
        payload: { question_id: `Q${aIdx + 1}`, selected_option: ans, response: ans }
      });
    });

    // Add Q9
    evs.push({
      event_id: `ev_${sid}_Q9`,
      event_type: 'OBJECT_INTERACT',
      category: 'interaction',
      target_id: 'Q9',
      action: 'enter_text',
      result: 'completed',
      elapsed_ms: 175000,
      payload: { question_id: 'Q9', text: q9Text, response: q9Text }
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
        elapsed_ms: 195000 + rIdx * 3000,
        payload: { question_id: item.q, rating: item.r, response: item.r }
      });
    });

    // Add submit & end
    evs.push({
      event_id: `ev_${sid}_submit`,
      event_type: 'ASSESSMENT_SUBMIT',
      category: 'assessment',
      target_id: 'ayurveda_post_assessment',
      action: 'submit_questionnaire',
      result: 'completed',
      elapsed_ms: 210000,
      payload: { knowledge_total: totalScore, condition: cond }
    });
    evs.push({
      event_id: `ev_${sid}_end`,
      event_type: 'SESSION_END',
      category: 'lifecycle',
      target_id: 'session',
      action: 'session_complete',
      result: 'completed',
      elapsed_ms: 215000,
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

  console.log('✅ All 30 records for C1 & C2 imported successfully into PostgreSQL!');
  await pool.end();
}

importC1C2().catch(console.error);
