// SessionMeasures — derives all 6 time/duration measures from the raw event log.
// NEVER stores these as separate fields — always computed on demand from raw events.

import { parseTime } from './StoryLoader';

/**
 * Compute all 6 session measures from raw event data.
 * Every value is fully reconstructable from the raw event log.
 *
 * @param {Array} events — raw events for a single session (already filtered by session_id)
 * @param {Array} assessments — assessment responses for a single session
 * @returns {Object} — the 6 measures
 */
export function computeSessionMeasures(events, assessments = []) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // ─── 1. Total Session Duration ────
  // timestamp of session start → timestamp of assessment completion (last event overall)
  const sessionStartEvent = sorted.find(e =>
    e.event === 'VIDEO_START' && e.action === 'session_begin'
  ) || sorted[0];
  const sessionEndEvent = sorted.find(e =>
    e.event === 'VIDEO_EXIT' && e.action === 'session_complete'
  ) || sorted[sorted.length - 1];

  const startTs = Number(sessionStartEvent?.timestamp ?? sessionStartEvent?.elapsed_ms ?? 0);
  const endTs = Number(sessionEndEvent?.timestamp ?? sessionEndEvent?.elapsed_ms ?? 0);
  const totalSessionDurationMs = (sessionStartEvent && sessionEndEvent && endTs >= startTs)
    ? endTs - startTs
    : 0;

  // ─── 2. Exposure Duration ────
  // VIDEO_START timestamp → VIDEO_COMPLETE timestamp
  const videoStart = sorted.find(e =>
    (e.event === 'VIDEO_START' || e.event_type === 'VIDEO_START') && e.action !== 'session_begin'
  );
  const videoComplete = sorted.find(e => e.event === 'VIDEO_COMPLETE' || e.event_type === 'VIDEO_COMPLETE');

  const vStartTs = Number(videoStart?.timestamp ?? videoStart?.elapsed_ms ?? 0);
  const vCompTs = Number(videoComplete?.timestamp ?? videoComplete?.elapsed_ms ?? 0);
  const exposureDurationMs = (videoStart && videoComplete && vCompTs >= vStartTs)
    ? vCompTs - vStartTs
    : 0;

  // ─── 3. Pause Duration ────
  // Sum of all (VIDEO_RESUME timestamp − matching VIDEO_PAUSE timestamp) pairs
  const pauseEvents = sorted.filter(e =>
    ['VIDEO_PAUSE', 'VIDEO_RESUME'].includes(e.event || e.event_type)
  );

  let pauseDurationMs = 0;
  let lastPauseTimestamp = null;

  for (const evt of pauseEvents) {
    const evType = evt.event || evt.event_type;
    const ts = Number(evt.timestamp ?? evt.elapsed_ms ?? 0);
    if (evType === 'VIDEO_PAUSE') {
      lastPauseTimestamp = ts;
    } else if (evType === 'VIDEO_RESUME' && lastPauseTimestamp !== null) {
      if (ts >= lastPauseTimestamp) {
        pauseDurationMs += ts - lastPauseTimestamp;
      }
      lastPauseTimestamp = null;
    }
  }

  // If still paused at end (no matching RESUME), count up to VIDEO_COMPLETE or last event
  if (lastPauseTimestamp !== null) {
    const endRef = videoComplete || sorted[sorted.length - 1];
    if (endRef) {
      const endTsRef = Number(endRef.timestamp ?? endRef.elapsed_ms ?? 0);
      if (endTsRef >= lastPauseTimestamp) {
        pauseDurationMs += endTsRef - lastPauseTimestamp;
      }
    }
  }

  // ─── 4. Interaction Duration ────
  // Sum of all (interaction-closed − interaction-opened) pairs
  const interactionTriggers = sorted.filter(e =>
    (e.event === 'OBJECT_INTERACT' || e.event_type === 'OBJECT_INTERACT') && e.action === 'interaction_triggered'
  );
  const interactionCompletes = sorted.filter(e =>
    (e.event === 'OBJECT_INTERACT' || e.event_type === 'OBJECT_INTERACT') && e.action === 'interaction_completed'
  );

  let interactionDurationMs = 0;

  for (const trigger of interactionTriggers) {
    const trigTs = Number(trigger.timestamp ?? trigger.elapsed_ms ?? 0);
    const completion = interactionCompletes.find(c => {
      const compTs = Number(c.timestamp ?? c.elapsed_ms ?? 0);
      return compTs > trigTs && (c.object_id === trigger.object_id || true);
    });
    if (completion) {
      const compTs = Number(completion.timestamp ?? completion.elapsed_ms ?? 0);
      interactionDurationMs += compTs - trigTs;
    }
  }

  // ─── 5. Active Viewing Duration ────
  const activeViewingDurationMs = Math.max(0,
    exposureDurationMs - pauseDurationMs - interactionDurationMs
  );

  // ─── 6. Assessment Response Times ────
  const assessmentResponseTimes = (assessments || []).map(a => ({
    question_id: a.question_id,
    level: a.level,
    response_time_ms: Number(a.response_time_ms) || 0,
    response_time_sec: ((Number(a.response_time_ms) || 0) / 1000).toFixed(1),
  }));

  return {
    total_session_duration_ms: totalSessionDurationMs || 0,
    total_session_duration: formatDuration(totalSessionDurationMs || 0),

    exposure_duration_ms: exposureDurationMs || 0,
    exposure_duration: formatDuration(exposureDurationMs || 0),

    active_viewing_duration_ms: activeViewingDurationMs || 0,
    active_viewing_duration: formatDuration(activeViewingDurationMs || 0),
    active_viewing_duration_sec: (activeViewingDurationMs || 0) / 1000,

    pause_duration_ms: pauseDurationMs || 0,
    pause_duration: formatDuration(pauseDurationMs || 0),

    interaction_duration_ms: interactionDurationMs || 0,
    interaction_duration: formatDuration(interactionDurationMs || 0),

    assessment_response_times: assessmentResponseTimes,
  };
}

/**
 * Compute derived summary stats from raw events for a session.
 * Used by the Session Summary export — every field is reconstructable.
 */
export function computeSessionSummary(events, assessments = []) {
  const measures = computeSessionMeasures(events, assessments);

  // Replay count — count of VIDEO_REPLAY events
  const replayCount = events.filter(e => e.event === 'VIDEO_REPLAY').length;

  // Interaction count — count of OBJECT_INTERACT events
  const interactionCount = events.filter(e => e.event === 'OBJECT_INTERACT').length;

  // Per-level assessment scores
  const recallAssess = assessments.filter(a => a.level === 'recall_understand');
  const applyAssess = assessments.filter(a => a.level === 'apply');
  const implementAssess = assessments.filter(a => a.level === 'implement');

  const recallCorrect = recallAssess.filter(a => a.accuracy === 1).length;
  const applyCorrect = applyAssess.filter(a => a.accuracy === 1).length;
  const implementCorrect = implementAssess.filter(a => a.accuracy === 1).length;
  const totalCorrect = recallCorrect + applyCorrect + implementCorrect;
  const totalQuestions = assessments.length;

  return {
    ...measures,
    replay_count: replayCount,
    interaction_count: interactionCount,
    recall_score: `${recallCorrect}/${recallAssess.length}`,
    apply_score: `${applyCorrect}/${applyAssess.length}`,
    implement_score: `${implementCorrect}/${implementAssess.length}`,
    overall_score: `${totalCorrect}/${totalQuestions}`,
  };
}

/**
 * Format a duration in ms to "MM:SS" or "MM:SS.mmm" string.
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || ms < 0) return '00:00';
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const millis = Math.floor(ms % 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Format timestamp ms to "HH:MM:SS.mmm" for export.
 */
export function formatTimestamp(ms) {
  if (typeof ms !== 'number' || ms < 0) return '00:00:00.000';
  const totalSec = ms / 1000;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const millis = Math.floor(ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
