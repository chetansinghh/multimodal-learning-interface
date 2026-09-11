// centralDb.js — Central multi-device persistent database store for study sessions
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Determine writable directory (/tmp on Vercel/Serverless, or ../data locally)
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isVercel ? '/tmp' : path.join(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'central_store.json');

let memoryStore = {
  sessions: [],
  events: [],
  assessments: [],
  participants: []
};

// Safely attempt directory creation without crashing on read-only environments
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('FileSystem directory creation skipped (read-only environment):', e.message);
}

// Initial DB schema
const initialDb = {
  sessions: [],
  events: [],
  assessments: [],
  participants: []
};

// Load DB from disk or memory fallback
function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return memoryStore;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.warn('Error reading central DB file, falling back to memory:', err.message);
    return memoryStore;
  }
}

// Save DB to disk or memory fallback
function saveDb(data) {
  memoryStore = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.warn('FileSystem write skipped (read-only environment):', err.message);
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
  },

  saveOTP(email, otpData) {
    const db = loadDb();
    if (!db.otps) db.otps = {};
    db.otps[email.toLowerCase()] = otpData;
    saveDb(db);
    return otpData;
  },

  getOTP(email) {
    const db = loadDb();
    if (!db.otps) return null;
    return db.otps[email.toLowerCase()] || null;
  },

  deleteOTP(email) {
    const db = loadDb();
    if (db.otps && db.otps[email.toLowerCase()]) {
      delete db.otps[email.toLowerCase()];
      saveDb(db);
    }
  }
};

export default centralDb;
