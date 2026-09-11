// EventLogger — raw timestamped event stream, persisted to IndexedDB with autosave.
// Never stores summary stats — only raw events. Summaries are derived at query time.

import { sessionClock } from './SessionClock';

const DB_NAME = 'multimodal_study_db';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';
const SESSIONS_STORE = 'sessions';
const ASSESSMENTS_STORE = 'assessments';

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class EventLogger {
  constructor() {
    this.db = null;
    this.sessionId = null;
    this.participantId = null;
    this.condition = null;
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
  startSession(participantId, sessionId, condition) {
    this.participantId = participantId;
    this.sessionId = sessionId;
    this.condition = condition;
    // Autosave flush every 2 seconds
    this.flushInterval = setInterval(() => this.flush(), 2000);
  }

  /** Log a single raw event — minimum fields per the spec */
  log(event, {
    videoTimestamp = 0,
    objectId = null,
    action = null,
    response = null,
    duration = null,
    extra = {}
  } = {}) {
    const entry = {
      participant_id: this.participantId,
      session_id: this.sessionId,
      condition: this.condition,
      timestamp: sessionClock.now(),
      wall_clock: sessionClock.wallClock(),
      video_timestamp: videoTimestamp,
      event,
      object_id: objectId,
      action,
      response,
      duration,
      ...extra
    };
    this.eventBuffer.push(entry);

    // Immediate flush for critical events
    const critical = ['VIDEO_START', 'VIDEO_COMPLETE', 'VIDEO_EXIT', 'VR_ENTER', 'VR_EXIT'];
    if (critical.includes(event)) {
      this.flush();
    }
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
