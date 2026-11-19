import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
const { Pool } = pg;

export async function removePreviewDataset() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const previewParticipantIds = [
    'P_Rohan_1042', 'P_Ananya_2831', 'P_Dev_4910', 'P_Kavya_6284',
    'P_Tanvi_3195', 'P_Aditya_7512', 'P_Meera_8420', 'P_Varun_9163',
    'P_Isha_5082', 'P_Kabir_1947', 'P_Diya_3859', 'P_Neil_7421',
    'P_Riya_8264', 'P_Siddharth_6035', 'P_Tara_4591', 'P_Manav_9318',
    'P_Zoya_2174', 'P_Aarush_6843'
  ];

  console.log(`Removing ${previewParticipantIds.length} preview records from PostgreSQL...`);

  for (const pid of previewParticipantIds) {
    await pool.query('DELETE FROM events WHERE participant_id = $1', [pid]);
    await pool.query('DELETE FROM assessments WHERE participant_id = $1', [pid]);
    await pool.query('DELETE FROM questionnaire_submissions WHERE participant_id = $1', [pid]);
    await pool.query('DELETE FROM sessions WHERE participant_id = $1', [pid]);
    await pool.query('DELETE FROM participants WHERE participant_id = $1', [pid]);
  }

  console.log('✅ Successfully removed all 18 preview records. Real participant sessions preserved intact.');
  await pool.end();
}

if (process.argv[1]?.endsWith('remove_preview_dataset.js')) {
  removePreviewDataset().catch(console.error);
}
