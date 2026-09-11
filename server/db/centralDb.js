// centralDb.js — Central multi-device persistent database store for study sessions
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'central_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB schema
const initialDb = {
  sessions: [],
  events: [],
  assessments: [],
  participants: []
};

// Load DB from disk
function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      saveDb(initialDb);
      return initialDb;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading central DB file:', err);
    return initialDb;
  }
}

// Save DB to disk
function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving central DB file:', err);
  }
}

export const centralDb = {
  getDashboardData() {
    const db = loadDb();
    return {
      sessions: db.sessions,
      events: db.events,
      assessments: db.assessments
    };
  },

  saveSession(sessionData) {
    const db = loadDb();
    const idx = db.sessions.findIndex(s => s.session_id === sessionData.session_id);
    if (idx >= 0) {
      db.sessions[idx] = { ...db.sessions[idx], ...sessionData };
    } else {
      db.sessions.push(sessionData);
    }
    saveDb(db);
    return sessionData;
  },

  saveEvents(newEvents) {
    const db = loadDb();
    const eventArray = Array.isArray(newEvents) ? newEvents : [newEvents];
    db.events.push(...eventArray);
    saveDb(db);
    return db.events.length;
  },

  saveAssessments(newAssessments) {
    const db = loadDb();
    const assessArray = Array.isArray(newAssessments) ? newAssessments : [newAssessments];
    db.assessments.push(...assessArray);
    saveDb(db);
    return db.assessments.length;
  },

  getSessions() {
    return loadDb().sessions;
  },

  getEvents() {
    return loadDb().events;
  },

  getAssessments() {
    return loadDb().assessments;
  }
};

export default centralDb;
