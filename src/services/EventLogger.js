// EventLogger — raw timestamped event stream, persisted to IndexedDB with autosave.
// Never stores summary stats — only raw events. Summaries are derived at query time.

import { sessionClock } from './SessionClock';

const DB_NAME = 'multimodal_study_db';
const DB_VERSION = 2;
const EVENTS_STORE = 'events';
const SESSIONS_STORE = 'sessions';
const ASSESSMENTS_STORE = 'assessments';
const QUESTIONNAIRE_STORE = 'questionnaire_submissions';

/** Open (or create) the IndexedDB database */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE)) {
        const evStore = db.createObjectStore(EVENTS_STORE, { keyPath: 'id', autoIncrement: true });
        evStore.createIndex('session_id', 'session_id', { unique: false });
        evStore.createIndex('participant_id', 'participant_id', { unique: false });
        evStore.createIndex('event', 'event', { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const sesStore = db.createObjectStore(SESSIONS_STORE, { keyPath: 'session_id' });
        sesStore.createIndex('participant_id', 'participant_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(ASSESSMENTS_STORE)) {
        const assStore = db.createObjectStore(ASSESSMENTS_STORE, { keyPath: 'id', autoIncrement: true });
        assStore.createIndex('session_id', 'session_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(QUESTIONNAIRE_STORE)) {
        const qStore = db.createObjectStore(QUESTIONNAIRE_STORE, { keyPath: 'session_id' });
        qStore.createIndex('participant_id', 'participant_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

// Map events to research categories
export function getEventCategory(eventType = '') {
  const ev = String(eventType).toUpperCase();
  if (ev.includes('ERROR') || ev.includes('FAIL') || ev.includes('WARN')) return 'technical';
  if (ev.startsWith('ASSESSMENT_')) return 'assessment';
  if (ev.startsWith('VR_') || ev.startsWith('XR_') || ev.startsWith('GAZE_') || ev.startsWith('HEAD_')) return 'vr';
  if (ev.startsWith('AUDIO_') || ev.includes('CHIME') || ev.includes('CUE') || ev.includes('SOUND')) return 'audio';
  if (ev.startsWith('VIDEO_') || ev.startsWith('MEDIA_') || ev.startsWith('SEGMENT_')) return 'media';
  if (ev.startsWith('SESSION_') || ev.includes('START') || ev.includes('EXIT') || ev.includes('RESTART')) return 'lifecycle';
  if (ev.startsWith('OBJECT_') || ev.startsWith('TARGET_') || ev.startsWith('DHONGA_') || ev.includes('INTERACT') || ev.includes('PANEL')) return 'interaction';
  return 'general';
}

class EventLogger {
  constructor() {
    this.db = null;
    this.sessionId = null;
    this.participantId = null;
    this.condition = null;
    this.storyId = null;
    this.storyTitle = null;
    this.eventBuffer = [];
    this.flushInterval = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;
    this.db = await openDB();
    this.isInitialized = true;
  }

  /** Start a new logging session */
  startSession(participantId, sessionId, condition, storyId = null, storyTitle = null) {
    this.participantId = participantId;
    this.sessionId = sessionId;
    this.condition = condition;
    this.storyId = storyId;
    this.storyTitle = storyTitle;
    // Autosave flush every 2 seconds
    this.flushInterval = setInterval(() => this.flush(), 2000);
  }

  /** Log a single raw event — compliant with Research Event Schema v2.0 */
  log(event, params = {}) {
    const now = sessionClock.now();
    const utcIso = new Date().toISOString();
    const eventType = params.event_type || params.event || event;

    // Determine modality automatically if not explicitly provided
    let modality = params.modality;
    if (!modality) {
      if (this.condition === 'C4') modality = 'vr';
      else if (this.condition === 'C3') modality = 'interactive';
      else if (this.condition === 'C2') modality = 'spatial_audio';
      else modality = 'video';
    }

    // Determine event source
    let source = params.source || 'user';
    if (eventType.startsWith('VIDEO_') || eventType.startsWith('MEDIA_')) source = 'player';
    else if (eventType.startsWith('AUDIO_')) source = 'audio_system';
    else if (eventType.startsWith('VR_') || eventType.startsWith('XR_')) source = 'vr_system';
    else if (eventType.startsWith('ASSESSMENT_')) source = 'assessment_engine';
    else if (eventType.includes('ERROR') || eventType.includes('FAIL')) source = 'system';

    const objectId = params.objectId || params.object_id || null;
    const targetId = params.target_id || params.targetId || params.target || objectId || null;
    const action = params.action || (
      eventType.includes('GRAB') ? 'grab' :
      eventType.includes('RELEASE') ? 'release' :
      eventType.includes('PLACE') ? 'place' :
      eventType.includes('GRIND') ? 'grind' :
      eventType.includes('SELECT') ? 'select' :
      eventType.includes('FOCUSED') ? 'focus' :
      eventType.includes('BLURRED') ? 'blur' : null
    );

    const result = params.result || (
      eventType.includes('COMPLETE') ? 'completed' :
      eventType.includes('FAIL') || eventType.includes('ERROR') ? 'failed' :
      eventType.includes('START') ? 'started' :
      eventType.includes('CANCEL') ? 'cancelled' : 'completed'
    );

    const payload = params.payload || {
      ...(params.extra || {}),
      response: params.response ?? null,
      holder: params.holder ?? null,
      progress: params.progress ?? null,
      conceptId: params.conceptId ?? null
    };

    const entry = {
      event_id: params.event_id || generateEventId(),
      session_id: params.session_id || this.sessionId,
      participant_id: params.participant_id || this.participantId,
      condition: params.condition || this.condition,
      story_id: params.storyId || params.story_id || this.storyId || null,
      story_segment_id: params.story_segment_id || params.storySegment || null,
      event: eventType,
      event_type: eventType,
      category: getEventCategory(eventType),
      timestamp: now,
      elapsed_ms: now,
      wall_clock: sessionClock.wallClock(),
      timestamp_utc: utcIso,
      video_timestamp: params.videoTimestamp ?? params.video_timestamp ?? 0,
      modality,
      source,
      target_id: targetId,
      object_id: objectId,
      action,
      result,
      duration: params.duration || null,
      error_code: params.error_code || params.errorCode || null,
      error_details: params.error_details || params.errorDetails || null,
      payload,
      response: params.response || null,
      schema_version: '2.0',
      ...(params.extra || {})
    };

    this.eventBuffer.push(entry);

    // Immediate flush for critical research milestones and errors
    const critical = ['VIDEO_START', 'VIDEO_COMPLETE', 'VIDEO_EXIT', 'VR_ENTER', 'VR_EXIT', 'DHONGA_GRIND_COMPLETE', 'ERROR'];
    if (critical.some(k => eventType.includes(k))) {
      this.flush();
    }

    return entry;
  }

  /** Specific helper for logging technical or system failures */
  logError(errorCode, errorDetails, context = {}) {
    return this.log('SYSTEM_ERROR', {
      error_code: errorCode,
      error_details: typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails),
      result: 'failed',
      source: 'system',
      payload: context,
      extra: context
    });
  }

  /** Flush buffered events to IndexedDB & sync to central backend server */
  async flush() {
    if (!this.db || this.eventBuffer.length === 0) return;
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    try {
      const tx = this.db.transaction(EVENTS_STORE, 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      for (const ev of events) {
        store.add(ev);
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      // Sync to central backend API
      const token = sessionStorage.getItem('agy_participant_token') || sessionStorage.getItem('agy_admin_session_token');
      if (token) {
        fetch('/api/db/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(events)
        }).catch(err => console.warn('Central DB event sync warning:', err));
      }
    } catch (err) {
      this.eventBuffer.unshift(...events);
      console.error('EventLogger flush failed:', err);
    }
  }

  /** Save/update session metadata locally & sync centrally */
  async saveSession(sessionData) {
    if (!this.db) return;
    const tx = this.db.transaction(SESSIONS_STORE, 'readwrite');
    tx.objectStore(SESSIONS_STORE).put(sessionData);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    const token = sessionStorage.getItem('agy_participant_token') || sessionStorage.getItem('agy_admin_session_token');
    if (token) {
      fetch('/api/db/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(sessionData)
      }).catch(err => console.warn('Central DB session sync warning:', err));
    }
  }

  /** Save an assessment response locally & sync centrally */
  async saveAssessmentResponse(response) {
    if (!this.db) return;
    const tx = this.db.transaction(ASSESSMENTS_STORE, 'readwrite');
    tx.objectStore(ASSESSMENTS_STORE).add(response);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    const token = sessionStorage.getItem('agy_participant_token') || sessionStorage.getItem('agy_admin_session_token');
    if (token) {
      fetch('/api/db/assessments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(response)
      }).catch(err => console.warn('Central DB assessment sync warning:', err));
    }
  }

  /** Save full Ayurveda research questionnaire submission */
  async saveQuestionnaireSubmission(submission) {
    if (this.db) {
      try {
        const tx = this.db.transaction(QUESTIONNAIRE_STORE, 'readwrite');
        tx.objectStore(QUESTIONNAIRE_STORE).put(submission);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch (err) {
        console.warn('IndexedDB questionnaire store write warning:', err);
      }
    }

    // Central server sync
    try {
      const res = await fetch('/api/questionnaire/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission)
      });
      return await res.json();
    } catch (err) {
      console.warn('Central DB questionnaire submit warning:', err);
      return { success: true, message: 'Your response has been recorded locally. Thank you.' };
    }
  }

  /** Get all questionnaire submissions from IndexedDB */
  async getAllQuestionnaireSubmissions() {
    if (!this.db) return [];
    try {
      const tx = this.db.transaction(QUESTIONNAIRE_STORE, 'readonly');
      const request = tx.objectStore(QUESTIONNAIRE_STORE).getAll();
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return [];
    }
  }

  /** Get all events for a session */
  async getSessionEvents(sessionId) {
    if (!this.db) return [];
    const tx = this.db.transaction(EVENTS_STORE, 'readonly');
    const index = tx.objectStore(EVENTS_STORE).index('session_id');
    const request = index.getAll(sessionId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Get all sessions */
  async getAllSessions() {
    if (!this.db) return [];
    const tx = this.db.transaction(SESSIONS_STORE, 'readonly');
    const request = tx.objectStore(SESSIONS_STORE).getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Get all events */
  async getAllEvents() {
    if (!this.db) return [];
    const tx = this.db.transaction(EVENTS_STORE, 'readonly');
    const request = tx.objectStore(EVENTS_STORE).getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Get all assessment responses */
  async getAllAssessments() {
    if (!this.db) return [];
    const tx = this.db.transaction(ASSESSMENTS_STORE, 'readonly');
    const request = tx.objectStore(ASSESSMENTS_STORE).getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Get assessment responses for a session */
  async getSessionAssessments(sessionId) {
    if (!this.db) return [];
    const tx = this.db.transaction(ASSESSMENTS_STORE, 'readonly');
    const index = tx.objectStore(ASSESSMENTS_STORE).index('session_id');
    const request = index.getAll(sessionId);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** End the current session — flush remaining events */
  async endSession() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
  }

  /** Delete a specific session and its associated events and assessments */
  async deleteSession(sessionId) {
    if (!this.db) return;
    const tx = this.db.transaction([EVENTS_STORE, SESSIONS_STORE, ASSESSMENTS_STORE], 'readwrite');
    const sesStore = tx.objectStore(SESSIONS_STORE);
    sesStore.delete(sessionId);

    // Delete events matching session_id
    const evStore = tx.objectStore(EVENTS_STORE);
    const evIndex = evStore.index('session_id');
    const evReq = evIndex.openCursor(sessionId);
    evReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    // Delete assessments matching session_id
    const assStore = tx.objectStore(ASSESSMENTS_STORE);
    const assIndex = assStore.index('session_id');
    const assReq = assIndex.openCursor(sessionId);
    assReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Import a batch of sessions, events, assessments, and questionnaire submissions */
  async importData({ sessions = [], events = [], assessments = [], questionnaire_submissions = [] }) {
    if (!this.db) await this.init();
    const stores = [EVENTS_STORE, SESSIONS_STORE, ASSESSMENTS_STORE];
    if (this.db.objectStoreNames.contains(QUESTIONNAIRE_STORE)) {
      stores.push(QUESTIONNAIRE_STORE);
    }
    const tx = this.db.transaction(stores, 'readwrite');
    const sesStore = tx.objectStore(SESSIONS_STORE);
    const evStore = tx.objectStore(EVENTS_STORE);
    const assStore = tx.objectStore(ASSESSMENTS_STORE);
    const qStore = this.db.objectStoreNames.contains(QUESTIONNAIRE_STORE) ? tx.objectStore(QUESTIONNAIRE_STORE) : null;

    for (const s of sessions) {
      sesStore.put(s);
    }
    for (const e of events) {
      evStore.add(e);
    }
    for (const a of assessments) {
      assStore.add(a);
    }
    if (qStore) {
      for (const q of questionnaire_submissions) {
        qStore.put(q);
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Export all local database content as a structured JSON object */
  async exportAllData() {
    const sessions = await this.getAllSessions();
    const events = await this.getAllEvents();
    const assessments = await this.getAllAssessments();
    const questionnaire_submissions = await this.getAllQuestionnaireSubmissions();
    return {
      exported_at: new Date().toISOString(),
      version: '2.0',
      sessions,
      events,
      assessments,
      questionnaire_submissions
    };
  }

  /** Clear all data (for dev/testing) */
  async clearAll() {
    if (!this.db) return;
    const tx = this.db.transaction([EVENTS_STORE, SESSIONS_STORE, ASSESSMENTS_STORE], 'readwrite');
    tx.objectStore(EVENTS_STORE).clear();
    tx.objectStore(SESSIONS_STORE).clear();
    tx.objectStore(ASSESSMENTS_STORE).clear();
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
}

// Singleton
export const eventLogger = new EventLogger();
export default EventLogger;
