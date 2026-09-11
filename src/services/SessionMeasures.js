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

  const totalSessionDurationMs = sessionStartEvent && sessionEndEvent
    ? sessionEndEvent.timestamp - sessionStartEvent.timestamp
    : 0;

  // ─── 2. Exposure Duration ────
  // VIDEO_START timestamp → VIDEO_COMPLETE timestamp
  const videoStart = sorted.find(e =>
    e.event === 'VIDEO_START' && e.action !== 'session_begin'
  );
  const videoComplete = sorted.find(e => e.event === 'VIDEO_COMPLETE');

  const exposureDurationMs = videoStart && videoComplete
    ? videoComplete.timestamp - videoStart.timestamp
    : 0;

  // ─── 3. Pause Duration ────
  // Sum of all (VIDEO_RESUME timestamp − matching VIDEO_PAUSE timestamp) pairs
  const pauseEvents = sorted.filter(e =>
    e.event === 'VIDEO_PAUSE' || e.event === 'VIDEO_RESUME'
  );

  let pauseDurationMs = 0;
  let lastPauseTimestamp = null;

  for (const evt of pauseEvents) {
    if (evt.event === 'VIDEO_PAUSE') {
      lastPauseTimestamp = evt.timestamp;
    } else if (evt.event === 'VIDEO_RESUME' && lastPauseTimestamp !== null) {
      pauseDurationMs += evt.timestamp - lastPauseTimestamp;
      lastPauseTimestamp = null;
    }
  }

  // If still paused at end (no matching RESUME), count up to VIDEO_COMPLETE or last event
  if (lastPauseTimestamp !== null) {
    const endRef = videoComplete || sorted[sorted.length - 1];
    if (endRef) {
      pauseDurationMs += endRef.timestamp - lastPauseTimestamp;
    }
  }

  // ─── 4. Interaction Duration ────
  // Sum of all (interaction-closed − interaction-opened) pairs
  const interactionTriggers = sorted.filter(e =>
    e.event === 'OBJECT_INTERACT' && e.action === 'interaction_triggered'
  );
  const interactionCompletes = sorted.filter(e =>
    e.event === 'OBJECT_INTERACT' && e.action === 'interaction_completed'
  );

  let interactionDurationMs = 0;

  for (const trigger of interactionTriggers) {
    // Find the matching completion (same object_id, timestamp after trigger)
    const completion = interactionCompletes.find(c =>
      c.timestamp > trigger.timestamp &&
      (c.object_id === trigger.object_id || true) // fallback: next completion after this trigger
    );
    if (completion) {
      interactionDurationMs += completion.timestamp - trigger.timestamp;
    }
  }

  // ─── 5. Active Viewing Duration ────
  // Exposure duration minus pause duration minus interaction overlay time
  const activeViewingDurationMs = Math.max(0,
    exposureDurationMs - pauseDurationMs - interactionDurationMs
  );

  // ─── 6. Assessment Response Times ────
  // Per question: answer-submitted timestamp − question-displayed timestamp
  // (These are already tracked per-response in the assessments store as response_time_ms)
  const assessmentResponseTimes = assessments.map(a => ({
    question_id: a.question_id,
    level: a.level,
    response_time_ms: a.response_time_ms || 0,
    response_time_sec: ((a.response_time_ms || 0) / 1000).toFixed(1),
  }));

  return {
    total_session_duration_ms: totalSessionDurationMs,
    total_session_duration: formatDuration(totalSessionDurationMs),

    exposure_duration_ms: exposureDurationMs,
    exposure_duration: formatDuration(exposureDurationMs),

    active_viewing_duration_ms: activeViewingDurationMs,
    active_viewing_duration: formatDuration(activeViewingDurationMs),

    pause_duration_ms: pauseDurationMs,
    pause_duration: formatDuration(pauseDurationMs),

    interaction_duration_ms: interactionDurationMs,
    interaction_duration: formatDuration(interactionDurationMs),

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
