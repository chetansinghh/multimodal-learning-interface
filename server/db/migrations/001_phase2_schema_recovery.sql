-- 001_phase2_schema_recovery.sql
-- Non-destructive additive migration aligning PostgreSQL with multimodality research application

-- 1. Events Table Additive Columns
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS condition TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS story_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS elapsed_ms BIGINT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_timestamp NUMERIC;
ALTER TABLE events ADD COLUMN IF NOT EXISTS target_id TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS result TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS payload JSONB;

-- 2. Idempotent Index on event_id (allows nulls for historical legacy events without event_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_event_id ON events (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events (session_id);

-- 3. Assessments Table Additive Columns
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS story_id TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS question_id TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS question_type TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS measure TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS given_answer TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS accuracy NUMERIC;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS response_time_ms BIGINT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS answer_changes INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_assessments_session_id ON assessments (session_id);

-- 4. Questionnaire Submissions Table (Approved 29-Column PDF Research Protocol)
CREATE TABLE IF NOT EXISTS questionnaire_submissions (
  session_id TEXT PRIMARY KEY,
  participant_id TEXT,
  condition TEXT,
  story_id TEXT,
  q1_raw TEXT,
  q2_raw TEXT,
  q3_raw TEXT,
  q4_raw TEXT,
  q5_raw TEXT,
  q6_raw TEXT,
  q7_raw TEXT,
  q8_raw TEXT,
  q1_score NUMERIC,
  q2_score NUMERIC,
  q3_score NUMERIC,
  q4_score NUMERIC,
  q5_score NUMERIC,
  q6_score NUMERIC,
  q7_score NUMERIC,
  q8_score NUMERIC,
  knowledge_total NUMERIC,
  q9_verbatim TEXT,
  q9_score NUMERIC,
  q10 NUMERIC,
  q11 NUMERIC,
  q12 NUMERIC,
  q13 NUMERIC,
  q10_understanding NUMERIC,
  q11_attention NUMERIC,
  q12_clarity NUMERIC,
  q13_recall NUMERIC,
  c4_discomfort NUMERIC,
  completion_time_seconds NUMERIC,
  technical_issue TEXT,
  missing_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE questionnaire_submissions ADD COLUMN IF NOT EXISTS q10_understanding NUMERIC;
ALTER TABLE questionnaire_submissions ADD COLUMN IF NOT EXISTS q11_attention NUMERIC;
ALTER TABLE questionnaire_submissions ADD COLUMN IF NOT EXISTS q12_clarity NUMERIC;
ALTER TABLE questionnaire_submissions ADD COLUMN IF NOT EXISTS q13_recall NUMERIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_events_event_id') THEN
    ALTER TABLE events ADD CONSTRAINT uq_events_event_id UNIQUE (event_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qsub_participant_id ON questionnaire_submissions (participant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_participant_id ON sessions (participant_id);
