// src/services/ResearchDataExporter.js
// Standardized CSV Research Data Exporter for Ayurveda Multimodal Study (C1–C4)
// Compliant with Section 8 & Critical Addition requirements

export function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function filterItems(items = [], { condition = 'all', storyId = 'all', participantId = '', startDate = '', endDate = '' } = {}) {
  const normCond = condition ? condition.toUpperCase() : 'all';
  const pQuery = (participantId || '').trim().toLowerCase();
  const startTs = startDate ? new Date(startDate).getTime() : null;
  const endTs = endDate ? new Date(endDate + 'T23:59:59.999Z').getTime() : null;

  return items.filter(item => {
    if (!item) return false;

    // 1. Condition filter
    if (normCond !== 'ALL') {
      const itemCond = (item.condition || '').toUpperCase();
      if (itemCond && itemCond !== normCond) return false;
    }

    // 2. Story ID filter
    if (storyId && storyId !== 'all') {
      const itemStory = item.story_id || item.storyId || 'ayurveda_intro_v1';
      if (itemStory !== storyId) return false;
    }

    // 3. Participant ID filter / Search
    if (pQuery) {
      const pId = String(item.participant_id || item.participantId || '').toLowerCase();
      const pName = String(item.participant_name || item.name || '').toLowerCase();
      const sId = String(item.session_id || item.sessionId || '').toLowerCase();
      if (!pId.includes(pQuery) && !pName.includes(pQuery) && !sId.includes(pQuery)) {
        return false;
      }
    }

    // 4. Date Range filter
    if (startTs || endTs) {
      const rawDate = item.created_at || item.start_time || item.timestamp_utc || item.wall_clock;
      if (rawDate) {
        const itemTs = new Date(rawDate).getTime();
        if (!isNaN(itemTs)) {
          if (startTs && itemTs < startTs) return false;
          if (endTs && itemTs > endTs) return false;
        }
      }
    }

    return true;
  });
}

// 1. Participant Master Data CSV
export function exportParticipantMasterCSV(participants = [], filters = {}) {
  const filtered = filterItems(participants, filters);
  const headers = ['participant_id', 'name', 'email', 'age_range', 'created_at'];
  const rows = [headers.join(',')];
  filtered.forEach(p => {
    rows.push([
      escapeCsv(p.participant_id),
      escapeCsv(p.name || ''),
      escapeCsv(p.email || ''),
      escapeCsv(p.age_range || p.age_group || ''),
      escapeCsv(p.created_at || '')
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'participant_master_data.csv' };
}

// 2. Session Summary Data CSV
export function exportSessionSummaryCSV(sessions = [], events = [], assessments = [], filters = {}) {
  const filtered = filterItems(sessions, filters);
  const headers = [
    'session_id', 'participant_id', 'condition', 'story_id', 'story_title',
    'status', 'start_time', 'end_time', 'duration_seconds', 'total_events', 'total_assessments'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(s => {
    const sEvents = events.filter(e => e.session_id === s.session_id);
    const sAssess = assessments.filter(a => a.session_id === s.session_id);
    let durSec = 0;
    if (s.start_time && s.end_time) {
      durSec = Math.round((new Date(s.end_time) - new Date(s.start_time)) / 1000);
    }
    rows.push([
      escapeCsv(s.session_id),
      escapeCsv(s.participant_id),
      escapeCsv(s.condition),
      escapeCsv(s.story_id || 'ayurveda_intro_v1'),
      escapeCsv(s.story_title || 'Introduction to Ayurveda'),
      escapeCsv(s.status || 'complete'),
      escapeCsv(s.start_time || ''),
      escapeCsv(s.end_time || ''),
      durSec > 0 ? durSec : '',
      sEvents.length,
      sAssess.length
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'session_summary_data.csv' };
}

// 3. Complete Raw Event Logs CSV
export function exportRawEventsCSV(events = [], filters = {}) {
  const filtered = filterItems(events, filters);
  const headers = [
    'event_id', 'session_id', 'participant_id', 'condition', 'story_id',
    'story_segment_id', 'event_type', 'category', 'timestamp_utc', 'elapsed_ms',
    'wall_clock', 'video_timestamp_sec', 'modality', 'source', 'target_id',
    'object_id', 'action', 'result', 'error_code', 'error_details', 'payload_json'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(e => {
    const payloadStr = JSON.stringify(e.payload || e.data || {});
    rows.push([
      escapeCsv(e.event_id || ''),
      escapeCsv(e.session_id || ''),
      escapeCsv(e.participant_id || ''),
      escapeCsv(e.condition || ''),
      escapeCsv(e.story_id || 'ayurveda_intro_v1'),
      escapeCsv(e.story_segment_id || ''),
      escapeCsv(e.event_type || e.event || ''),
      escapeCsv(e.category || ''),
      escapeCsv(e.timestamp_utc || (typeof e.event_timestamp === 'string' ? e.event_timestamp : '')),
      e.elapsed_ms ?? e.timestamp ?? 0,
      escapeCsv(e.wall_clock || ''),
      e.video_timestamp ?? '',
      escapeCsv(e.modality || ''),
      escapeCsv(e.source || ''),
      escapeCsv(e.target_id || ''),
      escapeCsv(e.object_id || ''),
      escapeCsv(e.action || ''),
      escapeCsv(e.result || 'completed'),
      escapeCsv(e.error_code || ''),
      escapeCsv(e.error_details || ''),
      escapeCsv(payloadStr)
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'raw_event_logs.csv' };
}

// 4. Questionnaire Responses (Q1–Q13) CSV
export function exportQuestionnaireResponsesCSV(questionnaires = [], filters = {}) {
  const filtered = filterItems(questionnaires, filters);
  const headers = [
    'participant_id', 'session_id', 'condition', 'story_id',
    'Q1_raw', 'Q2_raw', 'Q3_raw', 'Q4_raw', 'Q5_raw', 'Q6_raw', 'Q7_raw', 'Q8_raw',
    'Q9_verbatim', 'Q10', 'Q11', 'Q12', 'Q13', 'C4_discomfort', 'completion_time_seconds', 'created_at'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(q => {
    const isC4 = (q.condition || '').toUpperCase() === 'C4';
    const disc = isC4 ? (q.C4_discomfort ?? q.c4_discomfort ?? '') : 'N/A';
    rows.push([
      escapeCsv(q.participant_id),
      escapeCsv(q.session_id),
      escapeCsv(q.condition),
      escapeCsv(q.story_id || 'ayurveda_intro_v1'),
      escapeCsv(q.Q1_raw || q.q1_raw || ''),
      escapeCsv(q.Q2_raw || q.q2_raw || ''),
      escapeCsv(q.Q3_raw || q.q3_raw || ''),
      escapeCsv(q.Q4_raw || q.q4_raw || ''),
      escapeCsv(q.Q5_raw || q.q5_raw || ''),
      escapeCsv(q.Q6_raw || q.q6_raw || ''),
      escapeCsv(q.Q7_raw || q.q7_raw || ''),
      escapeCsv(q.Q8_raw || q.q8_raw || ''),
      escapeCsv(q.Q9_verbatim || q.q9_verbatim || ''),
      q.Q10 ?? q.q10 ?? '',
      q.Q11 ?? q.q11 ?? '',
      q.Q12 ?? q.q12 ?? '',
      q.Q13 ?? q.q13 ?? '',
      escapeCsv(disc),
      q.completion_time_seconds ?? '',
      escapeCsv(q.created_at || '')
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'questionnaire_responses_q1_q13.csv' };
}

// 5. Knowledge Assessment Scores (Q1–Q8 and total 0–8) CSV
export function exportKnowledgeScoresCSV(questionnaires = [], filters = {}) {
  const filtered = filterItems(questionnaires, filters);
  const headers = [
    'participant_id', 'session_id', 'condition',
    'Q1_score', 'Q2_score', 'Q3_score', 'Q4_score', 'Q5_score', 'Q6_score', 'Q7_score', 'Q8_score',
    'knowledge_total'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(q => {
    rows.push([
      escapeCsv(q.participant_id),
      escapeCsv(q.session_id),
      escapeCsv(q.condition),
      q.Q1_score ?? q.q1_score ?? 0,
      q.Q2_score ?? q.q2_score ?? 0,
      q.Q3_score ?? q.q3_score ?? 0,
      q.Q4_score ?? q.q4_score ?? 0,
      q.Q5_score ?? q.q5_score ?? 0,
      q.Q6_score ?? q.q6_score ?? 0,
      q.Q7_score ?? q.q7_score ?? 0,
      q.Q8_score ?? q.q8_score ?? 0,
      q.knowledge_total ?? 0
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'knowledge_assessment_scores.csv' };
}

// 6. Q9 Open-Ended Responses CSV
export function exportQ9OpenResponsesCSV(questionnaires = [], filters = {}) {
  const filtered = filterItems(questionnaires, filters);
  const headers = [
    'participant_id', 'session_id', 'condition', 'story_id',
    'Q9_verbatim', 'Q9_score', 'completion_time_seconds', 'created_at'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(q => {
    rows.push([
      escapeCsv(q.participant_id),
      escapeCsv(q.session_id),
      escapeCsv(q.condition),
      escapeCsv(q.story_id || 'ayurveda_intro_v1'),
      escapeCsv(q.Q9_verbatim || q.q9_verbatim || ''),
      q.Q9_score ?? q.q9_score ?? '',
      q.completion_time_seconds ?? '',
      escapeCsv(q.created_at || '')
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'q9_open_ended_responses.csv' };
}

// 7. Individual Q10–Q13 Likert Responses CSV
export function exportQ10Q13LikertCSV(questionnaires = [], filters = {}) {
  const filtered = filterItems(questionnaires, filters);
  const headers = [
    'participant_id', 'session_id', 'condition',
    'Q10_understanding', 'Q11_attention', 'Q12_clarity', 'Q13_recall'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(q => {
    rows.push([
      escapeCsv(q.participant_id),
      escapeCsv(q.session_id),
      escapeCsv(q.condition),
      q.Q10 ?? q.q10 ?? q.q10_understanding ?? '',
      q.Q11 ?? q.q11 ?? q.q11_attention ?? '',
      q.Q12 ?? q.q12 ?? q.q12_clarity ?? '',
      q.Q13 ?? q.q13 ?? q.q13_recall ?? ''
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'q10_q13_experience_likert.csv' };
}

// 8. C4 VR Discomfort Responses CSV
export function exportC4DiscomfortCSV(questionnaires = [], filters = {}) {
  const filtered = filterItems(questionnaires, filters).filter(q => (q.condition || '').toUpperCase() === 'C4');
  const headers = ['participant_id', 'session_id', 'condition', 'c4_discomfort', 'discomfort_label', 'created_at'];
  const labels = { 1: 'Not at all', 2: 'Mild', 3: 'Moderate', 4: 'Severe', 5: 'Very severe' };
  const rows = [headers.join(',')];
  filtered.forEach(q => {
    const val = q.C4_discomfort ?? q.c4_discomfort ?? '';
    rows.push([
      escapeCsv(q.participant_id),
      escapeCsv(q.session_id),
      'C4',
      val,
      escapeCsv(labels[val] || ''),
      escapeCsv(q.created_at || '')
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'c4_vr_discomfort_responses.csv' };
}

// 9. C3 Interaction Telemetry CSV
export function exportC3InteractionTelemetryCSV(events = [], filters = {}) {
  const filtered = filterItems(events, filters).filter(e => {
    const cond = (e.condition || '').toUpperCase();
    const ev = (e.event_type || e.event || '');
    return cond === 'C3' || ev.startsWith('C3_') || ['HOTSPOT_CLICK', 'OBJECT_INTERACT', 'OBJECT_PLACED', 'CHECKPOINT_HIT'].includes(ev);
  });

  const headers = [
    'event_id', 'session_id', 'participant_id', 'condition', 'story_id',
    'event_type', 'elapsed_ms', 'video_timestamp_sec', 'target_id', 'action', 'result', 'payload_json'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(e => {
    rows.push([
      escapeCsv(e.event_id || ''),
      escapeCsv(e.session_id || ''),
      escapeCsv(e.participant_id || ''),
      'C3',
      escapeCsv(e.story_id || 'ayurveda_intro_v1'),
      escapeCsv(e.event_type || e.event || ''),
      e.elapsed_ms ?? e.timestamp ?? 0,
      e.video_timestamp ?? '',
      escapeCsv(e.target_id || e.object_id || ''),
      escapeCsv(e.action || ''),
      escapeCsv(e.result || 'completed'),
      escapeCsv(JSON.stringify(e.payload || e.data || {}))
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'c3_interaction_telemetry.csv' };
}

// 10. C4 VR Interaction and Experience Telemetry CSV
export function exportC4VRTelemetryCSV(events = [], filters = {}) {
  const filtered = filterItems(events, filters).filter(e => {
    const cond = (e.condition || '').toUpperCase();
    const ev = (e.event_type || e.event || '');
    return cond === 'C4' || ev.startsWith('VR_') || ev === 'GAZE_DWELL';
  });

  const headers = [
    'event_id', 'session_id', 'participant_id', 'condition', 'story_id',
    'event_type', 'elapsed_ms', 'video_timestamp_sec', 'target_id', 'action', 'result', 'payload_json'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(e => {
    rows.push([
      escapeCsv(e.event_id || ''),
      escapeCsv(e.session_id || ''),
      escapeCsv(e.participant_id || ''),
      'C4',
      escapeCsv(e.story_id || 'ayurveda_intro_v1'),
      escapeCsv(e.event_type || e.event || ''),
      e.elapsed_ms ?? e.timestamp ?? 0,
      e.video_timestamp ?? '',
      escapeCsv(e.target_id || e.object_id || ''),
      escapeCsv(e.action || ''),
      escapeCsv(e.result || 'completed'),
      escapeCsv(JSON.stringify(e.payload || e.data || {}))
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'c4_vr_telemetry.csv' };
}

// 11. Technical Issues and Error Logs CSV
export function exportTechnicalIssuesCSV(events = [], filters = {}) {
  const filtered = filterItems(events, filters).filter(e => {
    const ev = (e.event_type || e.event || '');
    return (e.category === 'technical') ||
      ev.includes('ERROR') || ev.includes('FAIL') ||
      e.result === 'failed' || e.error_code != null;
  });

  const headers = [
    'event_id', 'session_id', 'participant_id', 'condition', 'story_id',
    'timestamp_utc', 'elapsed_ms', 'modality', 'source', 'event_type',
    'error_code', 'error_details', 'payload_json'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(e => {
    rows.push([
      escapeCsv(e.event_id || ''),
      escapeCsv(e.session_id || ''),
      escapeCsv(e.participant_id || ''),
      escapeCsv(e.condition || ''),
      escapeCsv(e.story_id || 'ayurveda_intro_v1'),
      escapeCsv(e.timestamp_utc || ''),
      e.elapsed_ms ?? e.timestamp ?? 0,
      escapeCsv(e.modality || ''),
      escapeCsv(e.source || ''),
      escapeCsv(e.event_type || e.event || ''),
      escapeCsv(e.error_code || ''),
      escapeCsv(e.error_details || ''),
      escapeCsv(JSON.stringify(e.payload || e.data || {}))
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'technical_issues_and_errors.csv' };
}

// 12. Data Synchronization Status CSV
export function exportDataSyncStatusCSV(events = [], filters = {}) {
  const filtered = filterItems(events, filters);
  const headers = [
    'event_id', 'session_id', 'participant_id', 'condition',
    'sync_status', 'timestamp_utc', 'elapsed_ms', 'event_type'
  ];
  const rows = [headers.join(',')];
  filtered.forEach(e => {
    rows.push([
      escapeCsv(e.event_id || ''),
      escapeCsv(e.session_id || ''),
      escapeCsv(e.participant_id || ''),
      escapeCsv(e.condition || ''),
      escapeCsv(e.sync_status || 'synced'),
      escapeCsv(e.timestamp_utc || ''),
      e.elapsed_ms ?? e.timestamp ?? 0,
      escapeCsv(e.event_type || e.event || '')
    ].join(','));
  });
  return { csv: rows.join('\n'), count: filtered.length, name: 'data_sync_status.csv' };
}

// 13. Combined Research Dataset CSV (Joining participants, sessions, conditions, assessments, and questionnaires)
export function exportCombinedResearchDatasetCSV({ participants = [], sessions = [], events = [], questionnaires = [] } = {}, filters = {}) {
  const filteredSessions = filterItems(sessions, filters);
  const headers = [
    'participant_id', 'participant_name', 'age_range', 'session_id', 'condition', 'story_id',
    'story_title', 'session_status', 'session_start', 'session_end',
    'Q1_raw', 'Q2_raw', 'Q3_raw', 'Q4_raw', 'Q5_raw', 'Q6_raw', 'Q7_raw', 'Q8_raw',
    'Q1_score', 'Q2_score', 'Q3_score', 'Q4_score', 'Q5_score', 'Q6_score', 'Q7_score', 'Q8_score',
    'knowledge_total', 'Q9_verbatim', 'Q9_score', 'Q10', 'Q11', 'Q12', 'Q13', 'C4_discomfort',
    'completion_time_seconds', 'technical_issue', 'missing_reason', 'total_events_count'
  ];
  const rows = [headers.join(',')];

  filteredSessions.forEach(s => {
    const p = participants.find(part => part.participant_id === s.participant_id) || {};
    const q = questionnaires.find(sub => sub.session_id === s.session_id) || {};
    const sEvents = events.filter(e => e.session_id === s.session_id);
    const isC4 = (s.condition || '').toUpperCase() === 'C4';
    const disc = isC4 ? (q.C4_discomfort ?? q.c4_discomfort ?? '') : 'N/A';

    rows.push([
      escapeCsv(s.participant_id),
      escapeCsv(p.name || s.participant_name || ''),
      escapeCsv(p.age_range || s.participant_age || ''),
      escapeCsv(s.session_id),
      escapeCsv(s.condition),
      escapeCsv(s.story_id || 'ayurveda_intro_v1'),
      escapeCsv(s.story_title || 'Introduction to Ayurveda'),
      escapeCsv(s.status || 'complete'),
      escapeCsv(s.start_time || ''),
      escapeCsv(s.end_time || ''),
      escapeCsv(q.Q1_raw || q.q1_raw || ''),
      escapeCsv(q.Q2_raw || q.q2_raw || ''),
      escapeCsv(q.Q3_raw || q.q3_raw || ''),
      escapeCsv(q.Q4_raw || q.q4_raw || ''),
      escapeCsv(q.Q5_raw || q.q5_raw || ''),
      escapeCsv(q.Q6_raw || q.q6_raw || ''),
      escapeCsv(q.Q7_raw || q.q7_raw || ''),
      escapeCsv(q.Q8_raw || q.q8_raw || ''),
      q.Q1_score ?? q.q1_score ?? '',
      q.Q2_score ?? q.q2_score ?? '',
      q.Q3_score ?? q.q3_score ?? '',
      q.Q4_score ?? q.q4_score ?? '',
      q.Q5_score ?? q.q5_score ?? '',
      q.Q6_score ?? q.q6_score ?? '',
      q.Q7_score ?? q.q7_score ?? '',
      q.Q8_score ?? q.q8_score ?? '',
      q.knowledge_total ?? '',
      escapeCsv(q.Q9_verbatim || q.q9_verbatim || ''),
      q.Q9_score ?? q.q9_score ?? '',
      q.Q10 ?? q.q10 ?? '',
      q.Q11 ?? q.q11 ?? '',
      q.Q12 ?? q.q12 ?? '',
      q.Q13 ?? q.q13 ?? '',
      escapeCsv(disc),
      q.completion_time_seconds ?? '',
      escapeCsv(q.technical_issue || ''),
      escapeCsv(q.missing_reason || ''),
      sEvents.length
    ].join(','));
  });

  return { csv: rows.join('\n'), count: filteredSessions.length, name: 'combined_research_dataset.csv' };
}

