import React, { useState, useEffect, useCallback, useRef } from 'react';
import { eventLogger, getEventCategory } from '../../services/EventLogger';
import { AVAILABLE_STORIES, CONDITIONS, loadStoryConfig, loadAvailableStories, validateStoryConfig, formatTime } from '../../services/StoryLoader';
import { computeSessionMeasures } from '../../services/SessionMeasures';
import authService from '../../services/AuthService';
import { scoreQuestionnaireSubmission, AYURVEDA_ANSWER_KEY, Q9_RUBRIC, extractOptionLetter } from '../../services/ResearcherScoringService';
import AdminLoginGate from './AdminLoginGate';
import './ResearcherDashboard.css';

import { getStoryInfo } from '../../services/StoryInfo';
export { getStoryInfo };

export default function ResearcherDashboard() {
  return (
    <AdminLoginGate>
      <ResearcherDashboardContent />
    </AdminLoginGate>
  );
}

function ResearcherDashboardContent() {
  const [tab, setTab] = useState('dashboard');
  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [questionnaireSubmissions, setQuestionnaireSubmissions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [storyConfigs, setStoryConfigs] = useState({});
  const [availableStories, setAvailableStories] = useState(AVAILABLE_STORIES);
  const [uploadResult, setUploadResult] = useState(null);

  // Filters
  const [storyFilter, setStoryFilter] = useState('all');
  const [conditionFilter, setConditionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Event Timeline Inspection & Filtering State
  const [timelineCategory, setTimelineCategory] = useState('all');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelineResult, setTimelineResult] = useState('all');
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelinePerPage, setTimelinePerPage] = useState(50);
  const [inspectEvent, setInspectEvent] = useState(null);

  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  // Load data on mount
  useEffect(() => {
    loadData();
    loadAvailableStories().then(setAvailableStories);
  }, []);

  const formatTimeSlice = (val) => {
    if (!val) return '-';
    if (typeof val === 'string' && val.length >= 19 && val.includes('T')) return val.slice(11, 19);
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toTimeString().slice(0, 8);
    } catch {}
    return String(val);
  };

  const loadData = async () => {
    await eventLogger.init();
    let localS = await eventLogger.getAllSessions();
    let localE = await eventLogger.getAllEvents();
    let localA = await eventLogger.getAllAssessments();
    let localQ = await eventLogger.getAllQuestionnaireSubmissions();

    // Fetch central multi-device database
    try {
      const token = authService.getToken() || sessionStorage.getItem('agy_session_token') || sessionStorage.getItem('agy_admin_session_token');
      if (token) {
        const res = await fetch('/api/db/dashboard-data', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const serverData = await res.json();
          // Merge central & local data
          const mergedSessions = [...(serverData.sessions || [])];
          localS.forEach(ls => {
            if (!mergedSessions.some(ms => ms.session_id === ls.session_id)) {
              mergedSessions.push(ls);
            }
          });

          const mergedEvents = [...(serverData.events || [])];
          localE.forEach(le => {
            if (!mergedEvents.some(me => me.event_id === le.event_id || (me.session_id === le.session_id && me.elapsed_ms === le.elapsed_ms))) {
              mergedEvents.push(le);
            }
          });

          const mergedAssessments = [...(serverData.assessments || [])];
          localA.forEach(la => {
            if (!mergedAssessments.some(ma => ma.session_id === la.session_id && (ma.question_id || ma.item_id) === (la.question_id || la.item_id))) {
              mergedAssessments.push(la);
            }
          });

          const mergedQ = [...(serverData.questionnaire_submissions || [])];
          localQ.forEach(lq => {
            if (!mergedQ.some(mq => mq.session_id === lq.session_id)) {
              mergedQ.push(lq);
            }
          });

          // Ensure any historical session with assessments has a reconstructed questionnaire record
          mergedSessions.forEach(s => {
            if (!mergedQ.some(mq => mq.session_id === s.session_id)) {
              const sAssess = mergedAssessments.filter(a => a.session_id === s.session_id);
              if (sAssess.length > 0) {
                const ansMap = {};
                sAssess.forEach(a => {
                  ansMap[a.question_id] = a.answer ?? a.final_answer ?? a.selected_position;
                });
                const rec = scoreQuestionnaireSubmission({
                  session_id: s.session_id,
                  participant_id: s.participant_id,
                  condition: s.condition,
                  story_id: s.story_id,
                  answers: ansMap,
                  created_at: s.created_at || s.start_time
                });
                mergedQ.push(rec);
              }
            }
          });

          setSessions(mergedSessions);
          setEvents(mergedEvents);
          setAssessments(mergedAssessments);
          setQuestionnaireSubmissions(mergedQ);
          return;
        }
      }
    } catch (err) {
      console.warn('Central DB fetch fallback to local:', err);
    }

    // Local fallback
    const mergedQ = [...localQ];
    localS.forEach(s => {
      if (!mergedQ.some(mq => mq.session_id === s.session_id)) {
        const sAssess = localA.filter(a => a.session_id === s.session_id);
        if (sAssess.length > 0) {
          const ansMap = {};
          sAssess.forEach(a => {
            ansMap[a.question_id] = a.answer ?? a.final_answer ?? a.selected_position;
          });
          const rec = scoreQuestionnaireSubmission({
            session_id: s.session_id,
            participant_id: s.participant_id,
            condition: s.condition,
            story_id: s.story_id,
            answers: ansMap,
            created_at: s.created_at || s.start_time
          });
          mergedQ.push(rec);
        }
      }
    });

    setSessions(localS);
    setEvents(localE);
    setAssessments(localA);
    setQuestionnaireSubmissions(mergedQ);
  };

  // Delete a session
  const handleDeleteSession = async (sessionId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this session and all its logged events & assessments?')) return;
    await eventLogger.deleteSession(sessionId);
    try {
      const token = authService.getToken() || sessionStorage.getItem('agy_session_token') || sessionStorage.getItem('agy_admin_session_token');
      if (token) {
        await fetch(`/api/db/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (err) {
      console.warn('Central DB session deletion warning:', err);
    }
    if (selectedSession === sessionId) setSelectedSession(null);
    await loadData();
  };

  // Import JSON backup
  const handleImportJSON = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.sessions || data.events || data.assessments) {
        await eventLogger.importData(data);
        alert(`Successfully imported ${data.sessions?.length || 0} sessions, ${data.events?.length || 0} events, ${data.assessments?.length || 0} assessments!`);
        await loadData();
      } else if (Array.isArray(data)) {
        await eventLogger.importData({ sessions: data });
        alert(`Successfully imported ${data.length} sessions!`);
        await loadData();
      } else {
        alert('Unrecognized backup format. Please provide a JSON exported from the research portal.');
      }
    } catch (err) {
      alert(`Import error: ${err.message}`);
    }
  };

  // Export full JSON backup
  const handleExportBackup = async () => {
    const backup = await eventLogger.exportAllData();
    downloadFile(`research_study_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
  };

  // Generate Demo Study Data for both stories
  const handleGenerateSampleData = async () => {
    if (!window.confirm('Generate 8 representative sample research sessions (4 Kite, 4 Lantern across C1-C4) with realistic events, gaze data, and assessment results?')) return;

    const sampleSessions = [
      // 🪁 The Missing Kite Sessions
      {
        session_id: 'SESS_KITE_C1_' + Date.now().toString().slice(-4),
        participant_id: 'P_Aarav_01',
        participant_name: 'Aarav Sharma',
        participant_email: 'aarav@example.edu',
        participant_age: '12-13',
        condition: 'C1',
        story_id: 'story_missing_kite',
        story_title: 'The Missing Kite',
        start_time: new Date(Date.now() - 3600000 * 3).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 3 + 195000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_missing_kite', story_title: 'The Missing Kite', story_version: '1.0' }
      },
      {
        session_id: 'SESS_KITE_C2_' + Date.now().toString().slice(-4),
        participant_id: 'P_Priya_02',
        participant_name: 'Priya Nair',
        participant_email: 'priya@example.edu',
        participant_age: '12-13',
        condition: 'C2',
        story_id: 'story_missing_kite',
        story_title: 'The Missing Kite',
        start_time: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 2.5 + 210000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_missing_kite', story_title: 'The Missing Kite', story_version: '1.0' }
      },
      {
        session_id: 'SESS_KITE_C3_' + Date.now().toString().slice(-4),
        participant_id: 'P_Rohan_03',
        participant_name: 'Rohan Gupta',
        participant_email: 'rohan@example.edu',
        participant_age: '12-13',
        condition: 'C3',
        story_id: 'story_missing_kite',
        story_title: 'The Missing Kite',
        start_time: new Date(Date.now() - 3600000 * 2).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 2 + 235000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_missing_kite', story_title: 'The Missing Kite', story_version: '1.0' }
      },
      {
        session_id: 'SESS_KITE_C4_' + Date.now().toString().slice(-4),
        participant_id: 'P_Ananya_04',
        participant_name: 'Ananya Verma',
        participant_email: 'ananya@example.edu',
        participant_age: '12-13',
        condition: 'C4',
        story_id: 'story_missing_kite',
        story_title: 'The Missing Kite',
        start_time: new Date(Date.now() - 3600000 * 1.5).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 1.5 + 260000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_missing_kite', story_title: 'The Missing Kite', story_version: '1.0' }
      },

      // 🏮 The Lantern in Grandmother's Garden Sessions
      {
        session_id: 'SESS_LANT_C1_' + Date.now().toString().slice(-4),
        participant_id: 'P_Tara_05',
        participant_name: 'Tara Patel',
        participant_email: 'tara@example.edu',
        participant_age: '12-13',
        condition: 'C1',
        story_id: 'story_lantern_garden',
        story_title: "The Lantern in Grandmother's Garden",
        start_time: new Date(Date.now() - 3600000 * 1.2).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 1.2 + 310000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_lantern_garden', story_title: "The Lantern in Grandmother's Garden", story_version: '1.0' }
      },
      {
        session_id: 'SESS_LANT_C2_' + Date.now().toString().slice(-4),
        participant_id: 'P_Kabir_06',
        participant_name: 'Kabir Mehta',
        participant_email: 'kabir@example.edu',
        participant_age: '12-13',
        condition: 'C2',
        story_id: 'story_lantern_garden',
        story_title: "The Lantern in Grandmother's Garden",
        start_time: new Date(Date.now() - 3600000 * 0.9).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 0.9 + 325000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_lantern_garden', story_title: "The Lantern in Grandmother's Garden", story_version: '1.0' }
      },
      {
        session_id: 'SESS_LANT_C3_' + Date.now().toString().slice(-4),
        participant_id: 'P_Diya_07',
        participant_name: 'Diya Sen',
        participant_email: 'diya@example.edu',
        participant_age: '12-13',
        condition: 'C3',
        story_id: 'story_lantern_garden',
        story_title: "The Lantern in Grandmother's Garden",
        start_time: new Date(Date.now() - 3600000 * 0.5).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 0.5 + 350000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_lantern_garden', story_title: "The Lantern in Grandmother's Garden", story_version: '1.0' }
      },
      {
        session_id: 'SESS_LANT_C4_' + Date.now().toString().slice(-4),
        participant_id: 'P_Zaid_08',
        participant_name: 'Zaid Khan',
        participant_email: 'zaid@example.edu',
        participant_age: '12-13',
        condition: 'C4',
        story_id: 'story_lantern_garden',
        story_title: "The Lantern in Grandmother's Garden",
        start_time: new Date(Date.now() - 3600000 * 0.2).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 0.2 + 375000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'story_lantern_garden', story_title: "The Lantern in Grandmother's Garden", story_version: '1.0' }
      }
    ];

    const sampleEvents = [];
    const sampleAssessments = [];
    const sampleQuestionnaires = [];

    sampleSessions.forEach(s => {
      const isLantern = s.story_id.includes('lantern');
      const baseTime = new Date(s.start_time).getTime();

      // Standard Video Events
      sampleEvents.push(
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime, wall_clock: s.start_time, video_timestamp: 0, event: 'VIDEO_START', action: 'session_begin' },
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 45000, wall_clock: new Date(baseTime + 45000).toISOString(), video_timestamp: 45, event: 'SEGMENT_ENTER', action: 'scene_transition' }
      );

      // Condition-specific events
      if (s.condition === 'C3') {
        sampleEvents.push(
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 75000, wall_clock: new Date(baseTime + 75000).toISOString(), video_timestamp: 75, event: 'CHECKPOINT_HIT', object_id: isLantern ? 'butterflies' : 'tree_branch', action: 'solve_checkpoint', durationMs: 3200, correct: true },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 135000, wall_clock: new Date(baseTime + 135000).toISOString(), video_timestamp: 135, event: 'CHECKPOINT_HIT', object_id: isLantern ? 'repair_lantern' : 'kite_recover', action: 'solve_checkpoint', durationMs: 4100, correct: true }
        );
      } else if (s.condition === 'C4') {
        sampleEvents.push(
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 30000, wall_clock: new Date(baseTime + 30000).toISOString(), video_timestamp: 30, event: 'VR_ENTER', action: 'webxr_start' },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 85000, wall_clock: new Date(baseTime + 85000).toISOString(), video_timestamp: 85, event: 'OBJECT_INTERACT', object_id: isLantern ? 'wind_chime' : 'flying_kite', action: isLantern ? 'ring_chime' : 'kite_loop' },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 110000, wall_clock: new Date(baseTime + 110000).toISOString(), video_timestamp: 110, event: 'GAZE_DWELL', object_id: isLantern ? 'pond' : 'park_fountain', duration: 1800 }
        );
      }

      sampleEvents.push(
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 190000, wall_clock: new Date(baseTime + 190000).toISOString(), video_timestamp: 190, event: 'VIDEO_COMPLETE', action: 'experience_end' }
      );

      // Assessment Responses (8 questions)
      for (let q = 1; q <= 8; q++) {
        sampleAssessments.push({
          session_id: s.session_id,
          participant_id: s.participant_id,
          condition: s.condition,
          story_id: s.story_id,
          question_id: `Q${q}`,
          level: 'recall_understand',
          accuracy: q === 5 && s.condition === 'C1' ? 0 : 1,
          response_time_ms: Math.floor(2500 + Math.random() * 4000),
          answer_changes: Math.random() > 0.7 ? 1 : 0
        });
      }

      // Sample standardized questionnaire record according to approved PDF protocol
      const answersMap = {
        Q1: 'A', Q2: 'A', Q3: 'A', Q4: 'A',
        Q5: s.condition === 'C1' ? 'B' : 'A',
        Q6: 'A', Q7: 'A', Q8: 'A',
        Q9: 'Ayurveda is a traditional system of health and nature that emphasizes daily routines and mind-body balance.',
        Q10: s.condition === 'C4' ? 5 : 4,
        Q11: s.condition === 'C3' || s.condition === 'C4' ? 5 : 4,
        Q12: 4,
        Q13: s.condition === 'C1' ? 3 : 5,
        C4_discomfort: s.condition === 'C4' ? 1 : null
      };
      sampleQuestionnaires.push(scoreQuestionnaireSubmission({
        session_id: s.session_id,
        participant_id: s.participant_id,
        condition: s.condition,
        story_id: s.story_id,
        answers: answersMap,
        Q9_score: 2,
        completion_time_seconds: Math.floor(180 + Math.random() * 60),
        created_at: s.end_time || s.start_time
      }));
    });

    await eventLogger.importData({
      sessions: sampleSessions,
      events: sampleEvents,
      assessments: sampleAssessments,
      questionnaire_submissions: sampleQuestionnaires
    });
    alert('Sample research dataset generated with 8 sessions!');
    await loadData();
  };

  // ─── Filtered Sessions ────
  const filteredSessions = sessions.filter(s => {
    const info = getStoryInfo(s);
    if (storyFilter !== 'all' && info.id !== storyFilter) return false;
    if (conditionFilter !== 'all' && s.condition !== conditionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchPid = (s.participant_id || '').toLowerCase().includes(q);
      const matchName = (s.participant_name || '').toLowerCase().includes(q);
      const matchEmail = (s.participant_email || '').toLowerCase().includes(q);
      if (!matchPid && !matchName && !matchEmail) return false;
    }
    return true;
  });

  // ─── Dashboard Tab ────
  const renderDashboard = () => {
    const sessionsByCondition = {};
    CONDITIONS.forEach(c => { sessionsByCondition[c.id] = []; });
    filteredSessions.forEach(s => {
      if (sessionsByCondition[s.condition]) sessionsByCondition[s.condition].push(s);
    });

    return (
      <div className="dashboard-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <h2>Study Overview</h2>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="file"
              ref={importInputRef}
              accept=".json"
              onChange={handleImportJSON}
              style={{ display: 'none' }}
            />
            <button className="action-btn-sm" onClick={() => importInputRef.current?.click()} title="Import JSON backup from localhost or another device">
              📥 Import JSON
            </button>
            <button className="action-btn-sm" onClick={handleExportBackup} title="Export full study JSON backup">
              📤 Backup All JSON
            </button>
            <button className="action-btn-sm action-btn-demo" onClick={handleGenerateSampleData} title="Populate demo data for testing">
              🧪 Generate Sample Data
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-value">{filteredSessions.length}</div>
            <div className="card-label">Total Sessions</div>
          </div>
          <div className="summary-card">
            <div className="card-value">{new Set(filteredSessions.map(s => s.participant_id)).size}</div>
            <div className="card-label">Unique Participants</div>
          </div>
          <div className="summary-card">
            <div className="card-value">{events.length}</div>
            <div className="card-label">Total Events Logged</div>
          </div>
          <div className="summary-card">
            <div className="card-value">{assessments.length}</div>
            <div className="card-label">Assessment Responses</div>
          </div>
        </div>

        {/* Per-condition breakdown */}
        <h3>Sessions by Condition</h3>
        <div className="condition-grid">
          {CONDITIONS.map(c => {
            const condSessions = sessionsByCondition[c.id] || [];
            const condEvents = events.filter(e => e.condition === c.id);
            const condAssessments = assessments.filter(a => a.condition === c.id);
            const avgAccuracy = condAssessments.length > 0
              ? Math.round((condAssessments.reduce((s, a) => s + (a.accuracy === 1 ? 1 : 0), 0) / condAssessments.length) * 100)
              : 0;

            return (
              <div key={c.id} className="condition-card">
                <div className="condition-card-header">
                  <span className="condition-id">{c.id}</span>
                  <span className="condition-count">{condSessions.length} sessions</span>
                </div>
                <div className="condition-card-label">{c.label}</div>
                <div className="condition-stats">
                  <div className="stat"><span className="stat-val">{condEvents.length}</span> events</div>
                  <div className="stat"><span className="stat-val">{condAssessments.length}</span> responses</div>
                  <div className="stat"><span className="stat-val">{avgAccuracy}%</span> avg accuracy</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div className="dashboard-filter-bar">
          <div className="filter-group-left">
            <input
              type="text"
              className="dashboard-search-input"
              placeholder="🔍 Search participant, ID, email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="dashboard-select"
              value={storyFilter}
              onChange={(e) => setStoryFilter(e.target.value)}
            >
              <option value="all">📖 All Stories ({sessions.length})</option>
              <option value="ayurveda_intro_v1">🌿 Ayurveda</option>
              <option value="story_missing_kite">🪁 The Missing Kite (Historical)</option>
              <option value="story_lantern_garden">🏮 Grandmother's Garden (Historical)</option>
              <option value="unknown">❓ Unrecognized Stories</option>
            </select>

            <select
              className="dashboard-select"
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value)}
            >
              <option value="all">🎛️ All Modalities (C1–C4)</option>
              <option value="C1">C1 – Simple Video</option>
              <option value="C2">C2 – Spatial Audio</option>
              <option value="C3">C3 – Interactive</option>
              <option value="C4">C4 – VR Immersive</option>
            </select>
          </div>

          <div className="filter-group-right">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing {filteredSessions.length} of {sessions.length} sessions
            </span>
          </div>
        </div>

        {/* Participant table with Story Badges */}
        <h3>All Sessions</h3>
        {filteredSessions.length === 0 ? (
          <p className="empty-state">No matching sessions found. Try changing filters or click &quot;🧪 Generate Sample Data&quot;.</p>
        ) : (
          <div className="sessions-table-wrapper">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Story</th>
                  <th>Participant ID</th>
                  <th>Name & Email</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Assessment</th>
                  <th>Start Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map(s => {
                  const sessEvents = events.filter(e => e.session_id === s.session_id);
                  const sessAssess = assessments.filter(a => a.session_id === s.session_id);
                  const gradedAssess = sessAssess.filter(a => a.accuracy !== null && a.accuracy !== undefined);
                  const acc = gradedAssess.length > 0
                    ? Math.round((gradedAssess.reduce((sum, a) => sum + (a.accuracy === 1 ? 1 : 0), 0) / gradedAssess.length) * 100)
                    : '-';
                  const storyInfo = getStoryInfo(s);

                  return (
                    <tr key={s.session_id} className={selectedSession === s.session_id ? 'selected' : ''}>
                      <td>
                        <span className={`story-badge ${storyInfo.badgeClass}`}>
                          {storyInfo.emoji} {storyInfo.title.length > 20 ? storyInfo.title.slice(0, 18) + '…' : storyInfo.title}
                        </span>
                      </td>
                      <td><code>{s.participant_id}</code></td>
                      <td>
                        <div className="participant-identity-cell">
                          <strong>{s.participant_name || 'Anonymous'}</strong>
                          <small>{s.participant_email || 'No email registered'}</small>
                        </div>
                      </td>
                      <td><span className="condition-tag">{s.condition}</span></td>
                      <td>
                        <span className={`status-badge ${s.status}`}>
                          {s.status || 'unknown'}
                        </span>
                      </td>
                      <td>{sessEvents.length}</td>
                      <td>{acc !== '-' ? `${acc}%` : '-'}</td>
                      <td>{s.start_time ? new Date(s.start_time).toLocaleString() : '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="table-btn" onClick={() => setSelectedSession(s.session_id)}>
                            View
                          </button>
                          <button className="delete-btn-sm" onClick={(e) => handleDeleteSession(s.session_id, e)} title="Delete session">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Session detail */}
        {selectedSession && renderSessionDetail(selectedSession)}
      </div>
    );
  };

  const renderSessionDetail = (sessionId) => {
    const sessEvents = events.filter(e => e.session_id === sessionId);
    const sessAssess = assessments.filter(a => a.session_id === sessionId);
    const session = sessions.find(s => s.session_id === sessionId);
    const storyInfo = getStoryInfo(session);

    // Compute derived measures from raw events (§A of addendum)
    const measures = computeSessionMeasures(sessEvents, sessAssess);

    const videoEvents = sessEvents.filter(e => (e.event_type || e.event)?.startsWith('VIDEO_'));
    const replays = sessEvents.filter(e => (e.event_type || e.event) === 'VIDEO_REPLAY').length;
    const pauses = sessEvents.filter(e => (e.event_type || e.event) === 'VIDEO_PAUSE').length;
    const interactions = sessEvents.filter(e => ['OBJECT_INTERACT', 'OBJECT_GRABBED', 'OBJECT_PLACED', 'DHONGA_GRIND_COMPLETE', 'CHECKPOINT_HIT'].includes(e.event_type || e.event)).length;
    const technicalErrors = sessEvents.filter(e => (e.event_type || e.event)?.includes('ERROR') || e.category === 'technical' || e.result === 'failed').length;
    const vrEvents = sessEvents.filter(e => (e.event_type || e.event)?.startsWith('VR_') || (e.event_type || e.event)?.startsWith('XR_') || (e.event_type || e.event)?.startsWith('GAZE_')).length;

    // Filter timeline events
    let filteredEvents = [...sessEvents];
    if (timelineCategory !== 'all') {
      filteredEvents = filteredEvents.filter(e => {
        const cat = e.category || getEventCategory(e.event_type || e.event);
        return cat === timelineCategory;
      });
    }
    if (timelineResult !== 'all') {
      filteredEvents = filteredEvents.filter(e => (e.result || 'completed').toLowerCase() === timelineResult.toLowerCase());
    }
    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase();
      filteredEvents = filteredEvents.filter(e => {
        const ev = String(e.event_type || e.event || '').toLowerCase();
        const obj = String(e.object_id || e.target_id || '').toLowerCase();
        const act = String(e.action || '').toLowerCase();
        const res = String(e.result || '').toLowerCase();
        const pay = JSON.stringify(e.payload || e.response || '').toLowerCase();
        return ev.includes(q) || obj.includes(q) || act.includes(q) || res.includes(q) || pay.includes(q);
      });
    }

    // Pagination
    const totalEvents = filteredEvents.length;
    const perPage = timelinePerPage === 'all' ? totalEvents : Number(timelinePerPage);
    const totalPages = Math.max(1, Math.ceil(totalEvents / (perPage || 50)));
    const currentPage = Math.min(timelinePage, totalPages);
    const startIndex = (currentPage - 1) * perPage;
    const paginatedEvents = timelinePerPage === 'all' ? filteredEvents : filteredEvents.slice(startIndex, startIndex + perPage);

    // Session Reconstruction Milestones
    const hasStarted = sessEvents.some(e => ['VIDEO_START', 'SESSION_START', 'EXPERIENCE_START'].includes(e.event_type || e.event));
    const hasHerbs = sessEvents.some(e => (e.event_type || e.event) === 'OBJECT_PLACED' && (e.target_id === 'dhonga_mortar' || e.object_id?.includes('herb')));
    const hasGrindCompleted = sessEvents.some(e => (e.event_type || e.event) === 'DHONGA_GRIND_COMPLETE');
    const hasDoshas = sessEvents.some(e => ['vata', 'pitta', 'kapha'].includes(e.object_id || e.target_id) || (e.event_type || e.event) === 'CONCEPT_DISCOVERED');
    const hasAssessments = sessAssess.length > 0;

    return (
      <div className="session-detail">
        <div className="detail-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`story-badge ${storyInfo.badgeClass}`} style={{ fontSize: '0.9rem', padding: '4px 12px' }}>
              {storyInfo.emoji} {storyInfo.title}
            </span>
            <h3 style={{ margin: 0 }}>Session Detail — {session?.participant_id} ({session?.condition})</h3>
          </div>
          <button className="close-btn" onClick={() => setSelectedSession(null)}>✕</button>
        </div>

        {/* Derived Time & Duration Measures (§A) */}
        <h4>Derived Time & Duration Measures</h4>
        <div className="detail-stats duration-measures">
          <div className="mini-stat"><span>{measures.total_session_duration}</span>Total Duration</div>
          <div className="mini-stat"><span>{measures.exposure_duration}</span>Exposure Duration</div>
          <div className="mini-stat"><span>{measures.active_viewing_duration}</span>Active Viewing</div>
          <div className="mini-stat"><span>{measures.pause_duration}</span>Pause Duration</div>
          <div className="mini-stat"><span>{measures.interaction_duration}</span>Interaction Duration</div>
        </div>

        <div className="detail-stats">
          <div className="mini-stat"><span>{replays}</span>Replays</div>
          <div className="mini-stat"><span>{pauses}</span>Pauses</div>
          <div className="mini-stat"><span>{interactions}</span>Interactions</div>
          <div className="mini-stat"><span>{vrEvents}</span>VR Telemetry</div>
          <div className="mini-stat" style={{ color: technicalErrors > 0 ? '#ef4444' : undefined }}>
            <span style={{ color: technicalErrors > 0 ? '#ef4444' : undefined }}>{technicalErrors}</span>Technical Issues
          </div>
        </div>

        {/* Chronological Session Reconstruction Journey */}
        <div className="reconstruction-box">
          <h4>🗺 Session Chronological Reconstruction</h4>
          <div className="reconstruction-flow">
            <span className={`flow-step ${hasStarted ? 'passed' : ''}`}>
              {hasStarted ? '✓' : '○'} 1. Session Start
            </span>
            <span className="flow-arrow">→</span>
            <span className={`flow-step ${hasHerbs ? 'passed' : ''}`}>
              {hasHerbs ? '✓' : '○'} 2. Raw Botanical Prep
            </span>
            <span className="flow-arrow">→</span>
            <span className={`flow-step ${hasGrindCompleted ? 'passed' : ''}`}>
              {hasGrindCompleted ? '✓' : '○'} 3. Dhonga Grinding Completed
            </span>
            <span className="flow-arrow">→</span>
            <span className={`flow-step ${hasDoshas ? 'passed' : ''}`}>
              {hasDoshas ? '✓' : '○'} 4. Sacred Doshas Revealed
            </span>
            <span className="flow-arrow">→</span>
            <span className={`flow-step ${hasAssessments ? 'passed' : ''}`}>
              {hasAssessments ? '✓' : '○'} 5. Assessment Completed
            </span>
          </div>
        </div>

        {session?.version_snapshot && (
          <div className="version-info-box">
            <h4>Frozen Version Snapshot (§B)</h4>
            <p><strong>Story ID:</strong> {session.version_snapshot.story_id}</p>
            <p><strong>Story Title:</strong> {session.version_snapshot.story_title}</p>
            <p><strong>Layout Hash:</strong> <code>{session.version_snapshot.layout_hash}</code></p>
            <p><strong>Full Version Hash:</strong> <code>{session.version_snapshot.version_hash}</code></p>
          </div>
        )}

        {/* Full Chronological Event Timeline Controls */}
        <div className="timeline-controls-bar">
          <div className="timeline-filters">
            <input
              type="text"
              placeholder="Search event history..."
              className="timeline-search-input"
              value={timelineSearch}
              onChange={e => { setTimelineSearch(e.target.value); setTimelinePage(1); }}
            />
            <select
              className="timeline-select"
              value={timelineCategory}
              onChange={e => { setTimelineCategory(e.target.value); setTimelinePage(1); }}
            >
              <option value="all">All Categories ({sessEvents.length})</option>
              <option value="lifecycle">Lifecycle</option>
              <option value="media">Video & Media</option>
              <option value="audio">Audio Cues</option>
              <option value="interaction">Interaction & Tools</option>
              <option value="vr">VR & Spatial</option>
              <option value="assessment">Assessment</option>
              <option value="technical">Technical Errors</option>
            </select>
            <select
              className="timeline-select"
              value={timelineResult}
              onChange={e => { setTimelineResult(e.target.value); setTimelinePage(1); }}
            >
              <option value="all">All Results</option>
              <option value="completed">Completed</option>
              <option value="started">Started</option>
              <option value="failed">Failed / Error</option>
            </select>
          </div>

          <div className="timeline-pagination">
            <span>Showing {startIndex + 1}–{Math.min(startIndex + perPage, totalEvents)} of {totalEvents}</span>
            <select
              className="timeline-select"
              value={timelinePerPage}
              onChange={e => { setTimelinePerPage(e.target.value); setTimelinePage(1); }}
            >
              <option value="25">25 / page</option>
              <option value="50">50 / page</option>
              <option value="100">100 / page</option>
              <option value="all">All</option>
            </select>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className="table-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setTimelinePage(p => Math.max(1, p - 1))}
                >‹</button>
                <span style={{ padding: '4px 6px' }}>{currentPage}/{totalPages}</span>
                <button
                  className="table-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setTimelinePage(p => Math.min(totalPages, p + 1))}
                >›</button>
              </div>
            )}
          </div>
        </div>

        {/* Complete Event Timeline Table */}
        <div className="event-log-scroll" style={{ maxHeight: '420px' }}>
          <table className="event-log-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>#</th>
                <th style={{ width: '130px' }}>Elapsed / UTC</th>
                <th style={{ width: '100px' }}>Category</th>
                <th>Event Type</th>
                <th>Target / Object</th>
                <th style={{ width: '90px' }}>Result</th>
                <th style={{ width: '100px' }}>Inspection</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEvents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">No events match the current timeline filters.</td>
                </tr>
              ) : (
                paginatedEvents.map((e, i) => {
                  const evType = e.event_type || e.event || 'UNKNOWN';
                  const cat = e.category || getEventCategory(evType);
                  const res = (e.result || (evType.includes('FAIL') || evType.includes('ERROR') ? 'failed' : 'completed')).toLowerCase();
                  const globalIdx = startIndex + i + 1;
                  const elapsedSec = (e.elapsed_ms || e.timestamp || 0) / 1000;

                  return (
                    <tr key={e.event_id || i}>
                      <td>{globalIdx}</td>
                      <td>
                        <strong>{formatTime(elapsedSec)}</strong>
                        <div style={{ fontSize: '0.62rem', opacity: 0.6 }}>
                          {formatTimeSlice(e.timestamp_utc || e.wall_clock)}
                        </div>
                      </td>
                      <td>
                        <span className={`category-badge cat-${cat}`}>{cat}</span>
                      </td>
                      <td>
                        <code className="event-type">{evType}</code>
                      </td>
                      <td>
                        {e.target_id || e.object_id || '-'}
                        {e.action && <span style={{ opacity: 0.6, fontSize: '0.65rem', marginLeft: '6px' }}>({e.action})</span>}
                      </td>
                      <td>
                        <span className={`result-badge res-${res}`}>{res}</span>
                      </td>
                      <td>
                        <button
                          className="timeline-inspect-btn"
                          onClick={() => setInspectEvent(e)}
                          title="Inspect raw JSON payload"
                        >
                          🔍 Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Assessment Responses Table */}
        {sessAssess.length > 0 && (
          <>
            <h4 style={{ marginTop: '1.5rem' }}>Assessment Responses & Metrics</h4>
            <table className="event-log-table">
              <thead>
                <tr>
                  <th>Q ID</th>
                  <th>Level</th>
                  <th>Correct</th>
                  <th>Response Time</th>
                  <th>Answer Changes</th>
                </tr>
              </thead>
              <tbody>
                {sessAssess.map((a, i) => (
                  <tr key={i}>
                    <td>{a.question_id}</td>
                    <td>{a.level}</td>
                    <td className={a.accuracy === 1 ? 'correct-cell' : 'incorrect-cell'}>
                      {a.accuracy === 1 ? '✓ Correct' : '✗ Incorrect'}
                    </td>
                    <td>{a.response_time_ms != null ? `${Math.round(Number(a.response_time_ms) || 0)} ms` : '-'}</td>
                    <td>{a.answer_changes || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* JSON Payload Inspector Modal */}
        {inspectEvent && (
          <div className="json-inspect-modal-overlay" onClick={() => setInspectEvent(null)}>
            <div className="json-inspect-modal" onClick={e => e.stopPropagation()}>
              <div className="json-modal-header">
                <h4>🔬 Event Payload Inspector — <code>{inspectEvent.event_type || inspectEvent.event}</code></h4>
                <button className="close-btn" onClick={() => setInspectEvent(null)}>✕</button>
              </div>
              <div className="json-modal-meta">
                <div><strong>Event ID:</strong> <code>{inspectEvent.event_id || '-'}</code></div>
                <div><strong>UTC Timestamp:</strong> {inspectEvent.timestamp_utc || inspectEvent.wall_clock}</div>
                <div><strong>Elapsed Time:</strong> {inspectEvent.elapsed_ms || inspectEvent.timestamp} ms ({formatTime((inspectEvent.elapsed_ms || inspectEvent.timestamp) / 1000)})</div>
                <div><strong>Modality / Source:</strong> {inspectEvent.modality || '-'} / {inspectEvent.source || '-'}</div>
              </div>
              <pre className="json-modal-code">
                {JSON.stringify(inspectEvent, null, 2)}
              </pre>
              <div className="json-modal-footer">
                <button className="table-btn" onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(inspectEvent, null, 2));
                  alert('Event JSON copied to clipboard!');
                }}>📋 Copy Full JSON</button>
                <button className="table-btn" onClick={() => setInspectEvent(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Story Config Tab ────
  const renderStoryConfig = () => {
    const handleFileUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text);
        const validation = validateStoryConfig(config);
        if (validation.valid) {
          setUploadResult({ type: 'success', message: `Valid config: "${config.title}" (${config.segments?.length} segments, ${config.interactions?.length || 0} interactions)` });
        } else {
          setUploadResult({ type: 'error', message: `Invalid: ${validation.errors.join(', ')}` });
        }
      } catch (err) {
        setUploadResult({ type: 'error', message: `Parse error: ${err.message}` });
      }
    };

    return (
      <div className="dashboard-content">
        <h2>Story Configurations</h2>

        <div className="stories-grid">
          {availableStories.map(story => (
            <div key={story.id} className="story-card">
              <h3>{story.title}</h3>
              <p className="story-id">ID: {story.id}</p>
              <p className="story-path">Path: {story.path}</p>
              <button className="table-btn" onClick={async () => {
                try {
                  const config = await loadStoryConfig(story.path);
                  setStoryConfigs(prev => ({ ...prev, [story.id]: config }));
                } catch (err) {
                  alert(`Error: ${err.message}`);
                }
              }}>Load & Inspect</button>

              {storyConfigs[story.id] && (
                <div className="config-preview">
                  <p><strong>Duration:</strong> {storyConfigs[story.id].duration_sec}s</p>
                  <p><strong>Segments:</strong> {storyConfigs[story.id].segments?.length}</p>
                  <p><strong>Interactions:</strong> {storyConfigs[story.id].interactions?.length}</p>
                  <p><strong>Assessment Qs:</strong> {storyConfigs[story.id].assessment?.levels?.reduce((s, l) => s + (l.items?.length || 0), 0)}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <h3>Upload Custom Story Config</h3>
        <div className="upload-area">
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
            📁 Choose JSON File
          </button>
          <p className="upload-hint">Upload a story config JSON file to validate its schema</p>
          {uploadResult && (
            <div className={`upload-result ${uploadResult.type}`}>
              {uploadResult.message}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Export Tab ────
  // Exact schemas matching §C of Addendum
  const renderExport = () => {
    const exportRawEvents = () => {
      const headers = [
        'event_id',
        'session_id',
        'participant_id',
        'condition',
        'story_id',
        'story_segment_id',
        'event_type',
        'category',
        'timestamp_utc',
        'elapsed_ms',
        'wall_clock',
        'video_timestamp_sec',
        'modality',
        'source',
        'target_id',
        'object_id',
        'action',
        'result',
        'error_code',
        'error_details',
        'payload_json'
      ];
      const csv = [headers.join(',')];
      events.forEach(e => {
        const evType = e.event_type || e.event || '';
        const cat = e.category || getEventCategory(evType);
        const safeIsoDate = (val) => {
          if (!val) return '';
          try {
            const d = new Date(val);
            return isNaN(d.getTime()) ? String(val) : d.toISOString();
          } catch {
            return String(val);
          }
        };
        const wallIso = e.timestamp_utc || safeIsoDate(e.wall_clock || e.timestamp);
        const payloadStr = JSON.stringify(e.payload || e.response || {});
        const row = [
          e.event_id || '',
          e.session_id || '',
          e.participant_id || '',
          e.condition || '',
          e.story_id || '',
          e.story_segment_id || '',
          evType,
          cat,
          wallIso,
          e.elapsed_ms ?? e.timestamp ?? 0,
          e.wall_clock ? `"${String(e.wall_clock).replace(/"/g, '""')}"` : '',
          e.video_timestamp != null ? e.video_timestamp : '',
          e.modality || '',
          e.source || '',
          e.target_id || '',
          e.object_id || '',
          e.action || '',
          e.result || 'completed',
          e.error_code || '',
          e.error_details ? `"${String(e.error_details).replace(/"/g, '""')}"` : '',
          payloadStr ? `"${payloadStr.replace(/"/g, '""')}"` : ''
        ];
        csv.push(row.join(','));
      });
      downloadFile('raw_event_log.csv', csv.join('\n'), 'text/csv');
    };

    const exportTechnicalIssues = () => {
      const techEvents = events.filter(e =>
        (e.category === 'technical') ||
        (e.event_type || e.event || '').includes('ERROR') ||
        (e.event_type || e.event || '').includes('FAIL') ||
        e.result === 'failed' ||
        e.error_code != null
      );
      const headers = [
        'event_id',
        'session_id',
        'participant_id',
        'condition',
        'story_id',
        'timestamp_utc',
        'elapsed_ms',
        'modality',
        'source',
        'event_type',
        'error_code',
        'error_details',
        'target_id',
        'payload_json'
      ];
      const csv = [headers.join(',')];
      techEvents.forEach(e => {
        const payloadStr = JSON.stringify(e.payload || e.response || {});
        const row = [
          e.event_id || '',
          e.session_id || '',
          e.participant_id || '',
          e.condition || '',
          e.story_id || '',
          e.timestamp_utc || '',
          e.elapsed_ms ?? e.timestamp ?? '',
          e.modality || '',
          e.source || '',
          e.event_type || e.event || '',
          e.error_code || '',
          e.error_details ? `"${String(e.error_details).replace(/"/g, '""')}"` : '',
          e.target_id || e.object_id || '',
          payloadStr ? `"${payloadStr.replace(/"/g, '""')}"` : ''
        ];
        csv.push(row.join(','));
      });
      downloadFile('technical_issues_log.csv', csv.join('\n'), 'text/csv');
    };

    const exportAssessments = () => {
      const headers = [
        'session_id',
        'participant_id',
        'condition',
        'story_id',
        'question_id',
        'level',
        'question_type',
        'measure',
        'start_time_iso',
        'end_time_iso',
        'given_answer_json',
        'correct_answer_json',
        'is_correct',
        'response_time_ms',
        'answer_change_count',
        'confidence_rating'
      ];
      const csv = [headers.join(',')];
      assessments.forEach(a => {
        const givenAns = JSON.stringify(a.answer ?? a.final_answer ?? '');
        const correctAns = a.correct_answer != null ? JSON.stringify(a.correct_answer) : '';
        const row = [
          a.session_id || '',
          a.participant_id || '',
          a.condition || '',
          a.story_id || '',
          a.question_id || '',
          a.level || '',
          a.question_type || 'multiple_choice',
          a.measure || (a.level === 'experience_survey' ? 'experience' : 'conceptual'),
          a.start_time ? new Date(a.start_time).toISOString() : '',
          a.end_time ? new Date(a.end_time).toISOString() : '',
          givenAns ? `"${givenAns.replace(/"/g, '""')}"` : '',
          correctAns ? `"${correctAns.replace(/"/g, '""')}"` : '',
          a.accuracy === 1 ? 1 : (a.accuracy === 0 ? 0 : ''),
          Math.round(a.response_time_ms || 0),
          a.answer_changes || 0,
          a.confidence_rating != null ? a.confidence_rating : ''
        ];
        csv.push(row.join(','));
      });
      downloadFile('assessment_data.csv', csv.join('\n'), 'text/csv');
    };

    const exportSessionSummary = () => {
      const headers = [
        'session_id',
        'participant_id',
        'condition',
        'story_id',
        'story_version_hash',
        'session_start_iso',
        'session_end_iso',
        'total_session_duration_sec',
        'exposure_duration_sec',
        'active_viewing_duration_sec',
        'pause_duration_sec',
        'interaction_duration_sec',
        'replay_count',
        'pause_count',
        'interaction_count',
        'action_count',
        'action_errors',
        'gaze_event_count',
        'l1_accuracy',
        'l2_accuracy',
        'l3_accuracy',
        'overall_accuracy'
      ];

      const csv = [headers.join(',')];

      sessions.forEach(s => {
        const sessEvents = events.filter(e => e.session_id === s.session_id);
        const sessAssess = assessments.filter(a => a.session_id === s.session_id);
        const measures = computeSessionMeasures(sessEvents, sessAssess);

        const recallAssess = sessAssess.filter(a => a.level === 'recall_understand');
        const applyAssess = sessAssess.filter(a => a.level === 'apply');
        const implementAssess = sessAssess.filter(a => a.level === 'implement');
        const gradedAssess = sessAssess.filter(a => a.accuracy !== null && a.accuracy !== undefined);

        const calcAcc = (arr) => arr.length > 0 ? (arr.reduce((acc, a) => acc + (a.accuracy === 1 ? 1 : 0), 0) / arr.length).toFixed(2) : '';

        const actionCount = sessEvents.filter(e => ['OBJECT_INTERACT', 'OBJECT_GRABBED', 'OBJECT_PLACED', 'SELECT', 'DESELECT', 'HOTSPOT_OPEN', 'VR_INTERACTION'].includes(e.event_type || e.event)).length;
        const actionErrors = sessEvents.filter(e => (e.event_type || e.event)?.includes('ERROR') || e.action === 'action_error' || String(e.response).includes('error') || (e.action === 'assessment_submit' && sessAssess.some(a => a.question_id === e.object_id && a.accuracy === 0))).length;

        const row = [
          s.session_id || '',
          s.participant_id || '',
          s.condition || '',
          s.story_id || '',
          s.version_snapshot?.version_hash || s.version_snapshot?.layout_hash || '',
          s.start_time ? new Date(s.start_time).toISOString() : '',
          s.end_time ? new Date(s.end_time).toISOString() : '',
          (Number(measures.total_session_duration_ms || 0) / 1000).toFixed(2),
          (Number(measures.exposure_duration_ms || 0) / 1000).toFixed(2),
          (Number(measures.active_viewing_duration_sec ?? ((measures.active_viewing_duration_ms || 0) / 1000))).toFixed(2),
          (Number(measures.pause_duration_ms || 0) / 1000).toFixed(2),
          (Number(measures.interaction_duration_ms || 0) / 1000).toFixed(2),
          sessEvents.filter(e => (e.event_type || e.event) === 'VIDEO_REPLAY').length,
          sessEvents.filter(e => (e.event_type || e.event) === 'VIDEO_PAUSE').length,
          sessEvents.filter(e => (e.event_type || e.event) === 'OBJECT_INTERACT' || (e.event_type || e.event) === 'OBJECT_PLACED').length,
          actionCount,
          actionErrors,
          sessEvents.filter(e => (e.event_type || e.event)?.startsWith('GAZE_')).length,
          calcAcc(recallAssess),
          calcAcc(applyAssess),
          calcAcc(implementAssess),
          calcAcc(gradedAssess)
        ];
        csv.push(row.join(','));
      });

      downloadFile('session_summary.csv', csv.join('\n'), 'text/csv');
    };

    const exportJSON = (type) => {
      let data = sessions;
      if (type === 'sessions') {
        data = sessions.map(s => {
          const { participant_name, participant_email, ...safeSession } = s;
          return safeSession;
        });
      } else if (type === 'events') {
        data = events;
      } else if (type === 'assessments') {
        data = assessments;
      } else if (type === 'questionnaires') {
        data = questionnaireSubmissions;
      } else if (type === 'technical') {
        data = events.filter(e => (e.category === 'technical') || (e.event_type || e.event || '').includes('ERROR') || e.result === 'failed');
      }
      downloadFile(`${type}.json`, JSON.stringify(data, null, 2), 'application/json');
    };

    const exportAyurvedaQuestionnaireCSV = () => {
      const headers = [
        'participant_id',
        'condition',
        'Q1_raw',
        'Q2_raw',
        'Q3_raw',
        'Q4_raw',
        'Q5_raw',
        'Q6_raw',
        'Q7_raw',
        'Q8_raw',
        'Q1_score',
        'Q2_score',
        'Q3_score',
        'Q4_score',
        'Q5_score',
        'Q6_score',
        'Q7_score',
        'Q8_score',
        'knowledge_total',
        'Q9_verbatim',
        'Q9_score',
        'Q10',
        'Q11',
        'Q12',
        'Q13',
        'C4_discomfort',
        'completion_time_seconds',
        'technical_issue',
        'missing_reason'
      ];

      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = [headers.join(',')];

      questionnaireSubmissions.forEach(q => {
        const isC4 = q.condition === 'C4';
        const discVal = isC4 ? (q.C4_discomfort ?? q.c4_discomfort ?? '') : 'N/A';
        const row = [
          escapeCsv(q.participant_id),
          escapeCsv(q.condition),
          escapeCsv(q.Q1_raw || q.q1_raw || ''),
          escapeCsv(q.Q2_raw || q.q2_raw || ''),
          escapeCsv(q.Q3_raw || q.q3_raw || ''),
          escapeCsv(q.Q4_raw || q.q4_raw || ''),
          escapeCsv(q.Q5_raw || q.q5_raw || ''),
          escapeCsv(q.Q6_raw || q.q6_raw || ''),
          escapeCsv(q.Q7_raw || q.q7_raw || ''),
          escapeCsv(q.Q8_raw || q.q8_raw || ''),
          q.Q1_score ?? q.q1_score ?? 0,
          q.Q2_score ?? q.q2_score ?? 0,
          q.Q3_score ?? q.q3_score ?? 0,
          q.Q4_score ?? q.q4_score ?? 0,
          q.Q5_score ?? q.q5_score ?? 0,
          q.Q6_score ?? q.q6_score ?? 0,
          q.Q7_score ?? q.q7_score ?? 0,
          q.Q8_score ?? q.q8_score ?? 0,
          q.knowledge_total ?? 0,
          escapeCsv(q.Q9_verbatim || q.q9_verbatim || ''),
          q.Q9_score !== null && q.Q9_score !== undefined ? q.Q9_score : (q.q9_score !== null && q.q9_score !== undefined ? q.q9_score : ''),
          q.Q10 ?? q.q10 ?? '',
          q.Q11 ?? q.q11 ?? '',
          q.Q12 ?? q.q12 ?? '',
          q.Q13 ?? q.q13 ?? '',
          escapeCsv(discVal),
          q.completion_time_seconds ?? 0,
          escapeCsv(q.technical_issue || ''),
          escapeCsv(q.missing_reason || '')
        ];
        rows.push(row.join(','));
      });

      downloadFile('ayurveda_study_questionnaire_dataset.csv', rows.join('\n'), 'text/csv');
    };

    const technicalCount = events.filter(e => (e.category === 'technical') || (e.event_type || e.event || '').includes('ERROR') || e.result === 'failed').length;

    return (
      <div className="dashboard-content">
        <h2>Research Telemetry Exports</h2>
        <p className="export-desc">
          Four standardized research data streams derived directly from the immutable raw telemetry log. Compliant with Research Protocol v2.0.
        </p>

        <div className="export-grid">
          <div className="export-card">
            <h3>📊 1. Raw Event Log</h3>
            <p>Complete timestamped event sequence with structured JSON payloads, millisecond clocks, and modality metadata.</p>
            <p className="export-count">{events.length} telemetry records</p>
            <div className="export-btns">
              <button className="export-btn" onClick={exportRawEvents}>Export CSV</button>
              <button className="export-btn" onClick={() => exportJSON('events')}>Export JSON</button>
            </div>
          </div>

          <div className="export-card">
            <h3>📝 2. Assessment Data</h3>
            <p>Per-question responses across cognitive levels with response times, correctness, and revision counts.</p>
            <p className="export-count">{assessments.length} responses</p>
            <div className="export-btns">
              <button className="export-btn" onClick={exportAssessments}>Export CSV</button>
              <button className="export-btn" onClick={() => exportJSON('assessments')}>Export JSON</button>
            </div>
          </div>

          <div className="export-card">
            <h3>📋 3. Session Summary</h3>
            <p>Derived participant metrics: total duration, active viewing, pauses, replays, interactions, and cognitive accuracy.</p>
            <p className="export-count">{sessions.length} sessions</p>
            <div className="export-btns">
              <button className="export-btn" onClick={exportSessionSummary}>Export CSV</button>
              <button className="export-btn" onClick={() => exportJSON('sessions')}>Export JSON</button>
            </div>
          </div>

          <div className="export-card">
            <h3>🛠 4. Technical Issues & Errors</h3>
            <p>Isolated log of all WebXR connection drops, media failures, tracking interruptions, and application errors.</p>
            <p className="export-count" style={{ color: technicalCount > 0 ? '#ef4444' : undefined }}>{technicalCount} technical issues</p>
            <div className="export-btns">
              <button className="export-btn" onClick={exportTechnicalIssues}>Export CSV</button>
              <button className="export-btn" onClick={() => exportJSON('technical')}>Export JSON</button>
            </div>
          </div>

          <div className="export-card" style={{ gridColumn: '1 / -1', borderColor: 'rgba(56, 189, 248, 0.4)', background: 'rgba(56, 189, 248, 0.04)' }}>
            <h3>📑 5. Ayurveda Research Questionnaire Dataset (Approved PDF Protocol CSV)</h3>
            <p>
              Consolidated research questionnaire dataset adhering strictly to <code>Ayurveda_Study_Questionnaire_Research_Aligned(2).pdf</code>:
              participant_id, condition (C1–C4), Q1–Q8 raw responses, Q1–Q8 binary scores, knowledge_total (0–8),
              Q9 verbatim text, Q9_score (0–2), Q10–Q13 (each 1–5), C4_discomfort (1–5 or N/A),
              completion_time_seconds, technical_issue, and missing_reason.
            </p>
            <p className="export-count">{questionnaireSubmissions.length} participant questionnaire records</p>
            <div className="export-btns">
              <button className="export-btn" style={{ background: '#0284c7', color: '#fff' }} onClick={exportAyurvedaQuestionnaireCSV}>
                Export Protocol CSV
              </button>
              <button className="export-btn" onClick={() => exportJSON('questionnaires')}>
                Export Protocol JSON
              </button>
            </div>
          </div>
        </div>

        <div className="danger-zone">
          <h3>⚠️ Danger Zone</h3>
          <button className="danger-btn" onClick={async () => {
            if (window.confirm('This will permanently delete ALL study data across local storage and the central server. Are you sure?')) {
              await eventLogger.clearAll();
              try {
                const token = authService.getToken() || sessionStorage.getItem('agy_session_token') || sessionStorage.getItem('agy_admin_session_token');
                if (token) {
                  await fetch('/api/db/clear-all', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                }
              } catch (err) {
                console.warn('Central DB clear warning:', err);
              }
              await loadData();
            }
          }}>
            Clear All Data
          </button>
        </div>
      </div>
    );
  };

  const handleRateQ9 = async (sessionId, score) => {
    try {
      const token = authService.getToken() || sessionStorage.getItem('agy_session_token') || sessionStorage.getItem('agy_admin_session_token');
      if (token) {
        await fetch(`/api/db/questionnaire-submissions/${sessionId}/q9-score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ q9_score: score })
        });
      }
    } catch (e) {
      console.warn('Server Q9 score update warning:', e);
    }
    setQuestionnaireSubmissions(prev => prev.map(q => q.session_id === sessionId ? { ...q, Q9_score: score, q9_score: score } : q));
  };

  const renderQuestionnaireProtocol = () => {
    const conditions = ['C1', 'C2', 'C3', 'C4'];
    const byCond = {};
    conditions.forEach(c => { byCond[c] = []; });
    questionnaireSubmissions.forEach(q => {
      const c = (q.condition || '').toUpperCase();
      if (byCond[c]) byCond[c].push(q);
    });

    const c4List = byCond['C4'] || [];
    const discCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    c4List.forEach(q => {
      const disc = q.C4_discomfort ?? q.c4_discomfort;
      if (disc && discCounts[disc] !== undefined) discCounts[disc]++;
    });

    return (
      <div className="dashboard-content questionnaire-protocol-content">
        <div className="protocol-header-card" style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', background: '#0284c7', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                RESEARCHER-ONLY PROTOCOL
              </span>
              <h2 style={{ margin: '0.5rem 0 0.25rem', color: '#38bdf8' }}>Ayurveda Study — Scoring & Measurement Protocol</h2>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '0.92rem' }}>
                Strict implementation of <code>Ayurveda_Study_Questionnaire_Research_Aligned(2).pdf</code>. Answer key and rubrics are exclusively accessible in this protected researcher console.
              </p>
            </div>
            <button className="action-btn-sm" style={{ background: '#10b981', color: '#fff', fontWeight: 600, padding: '8px 16px' }} onClick={exportAyurvedaQuestionnaireCSV}>
              📥 Export Protocol CSV ({questionnaireSubmissions.length})
            </button>
          </div>

          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', fontSize: '0.88rem' }}>
            <strong>Protected Answer Key:</strong> <code style={{ color: '#38bdf8' }}>Q1=A, Q2=A, Q3=A, Q4=A, Q5=A, Q6=A, Q7=A, Q8=A</code>
          </div>
        </div>

        {/* 1. Primary Objective Measure: Knowledge */}
        <div className="protocol-section-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#f8fafc', margin: '0 0 0.5rem' }}>1. Primary Objective Measure: Knowledge (Q1–Q8)</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
            Q1–Q8 each score 1 for the keyed correct answer ('A') and 0 for incorrect, blank, or “Not sure” ('E'). Total knowledge score = sum of Q1–Q8 (range 0–8).
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="protocol-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
                  <th style={{ padding: '8px' }}>Condition</th>
                  <th style={{ padding: '8px' }}>N</th>
                  <th style={{ padding: '8px' }}>Mean Knowledge Total (0–8)</th>
                  <th style={{ padding: '8px' }}>Q1 %</th>
                  <th style={{ padding: '8px' }}>Q2 %</th>
                  <th style={{ padding: '8px' }}>Q3 %</th>
                  <th style={{ padding: '8px' }}>Q4 %</th>
                  <th style={{ padding: '8px' }}>Q5 %</th>
                  <th style={{ padding: '8px' }}>Q6 %</th>
                  <th style={{ padding: '8px' }}>Q7 %</th>
                  <th style={{ padding: '8px' }}>Q8 %</th>
                </tr>
              </thead>
              <tbody>
                {conditions.map(cId => {
                  const list = byCond[cId] || [];
                  const n = list.length;
                  const meanScore = n > 0 ? (list.reduce((sum, q) => sum + Number(q.knowledge_total ?? 0), 0) / n).toFixed(2) : '—';
                  const pcts = [];
                  for (let i = 1; i <= 8; i++) {
                    const corr = list.filter(q => (q[`Q${i}_score`] === 1 || q[`q${i}_score`] === 1)).length;
                    pcts.push(n > 0 ? `${Math.round((corr / n) * 100)}%` : '—');
                  }
                  return (
                    <tr key={cId} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: '#38bdf8' }}>{cId}</td>
                      <td style={{ padding: '10px 8px' }}>{n}</td>
                      <td style={{ padding: '10px 8px', fontWeight: 600 }}>{meanScore} / 8</td>
                      {pcts.map((pct, idx) => (
                        <td key={idx} style={{ padding: '10px 8px' }}>{pct}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Q9 Open-Response Rubric & Rating */}
        <div className="protocol-section-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#f8fafc', margin: '0 0 0.5rem' }}>2. Q9 Open-Response Scoring (Rubric 0–2)</h3>
          <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem' }}>
            <div style={{ marginBottom: '4px' }}><strong>0:</strong> {Q9_RUBRIC[0]}</div>
            <div style={{ marginBottom: '4px' }}><strong>1:</strong> {Q9_RUBRIC[1]}</div>
            <div><strong>2:</strong> {Q9_RUBRIC[2]}</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="protocol-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
                  <th style={{ padding: '8px' }}>Participant ID</th>
                  <th style={{ padding: '8px' }}>Cond</th>
                  <th style={{ padding: '8px' }}>Q9 Verbatim Text</th>
                  <th style={{ padding: '8px' }}>Score</th>
                  <th style={{ padding: '8px' }}>Assign Score</th>
                </tr>
              </thead>
              <tbody>
                {questionnaireSubmissions.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>No questionnaire responses yet.</td></tr>
                ) : (
                  questionnaireSubmissions.map(q => {
                    const score = q.Q9_score ?? q.q9_score;
                    return (
                      <tr key={q.session_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <td style={{ padding: '10px 8px', fontWeight: 600 }}><code>{q.participant_id}</code></td>
                        <td style={{ padding: '10px 8px' }}>{q.condition}</td>
                        <td style={{ padding: '10px 8px', fontStyle: 'italic', maxWidth: '380px' }}>
                          "{q.Q9_verbatim || q.q9_verbatim || <em>Blank</em>}"
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            background: score === 2 ? '#059669' : score === 1 ? '#d97706' : score === 0 ? '#dc2626' : 'rgba(255,255,255,0.1)',
                            color: '#fff'
                          }}>
                            {score !== null && score !== undefined ? `${score}/2` : 'Unrated'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[0, 1, 2].map(val => (
                              <button
                                key={val}
                                onClick={() => handleRateQ9(q.session_id, val)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  border: score === val ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.2)',
                                  background: score === val ? '#0284c7' : 'rgba(255,255,255,0.06)',
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: score === val ? 700 : 400
                                }}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 3. Part C: Experience Ratings */}
        <div className="protocol-section-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#f8fafc', margin: '0 0 0.5rem' }}>3. Experience Ratings: Do Not Treat as a Validated Scale</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
            Record Q10, Q11, Q12 and Q13 separately as integers from 1 to 5. Higher values indicate stronger agreement.
            <strong> Do not sum these four items into a total score</strong>: they represent distinct constructs (understanding, attention, clarity, and perceived recall).
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="protocol-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)' }}>
                  <th style={{ padding: '8px' }}>Condition</th>
                  <th style={{ padding: '8px' }}>Q10 (Understanding) Mean</th>
                  <th style={{ padding: '8px' }}>Q11 (Attention) Mean</th>
                  <th style={{ padding: '8px' }}>Q12 (Clarity/Ease) Mean</th>
                  <th style={{ padding: '8px' }}>Q13 (Perceived Recall) Mean</th>
                </tr>
              </thead>
              <tbody>
                {conditions.map(cId => {
                  const list = byCond[cId] || [];
                  const n = list.length;
                  const calcMean = (key) => {
                    const valid = list.map(q => q[key] ?? q[key.toLowerCase()]).filter(v => v != null && v !== '');
                    return valid.length > 0 ? (valid.reduce((a, b) => a + Number(b), 0) / valid.length).toFixed(2) : '—';
                  };
                  return (
                    <tr key={cId} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 700, color: '#38bdf8' }}>{cId} (N={n})</td>
                      <td style={{ padding: '10px 8px' }}>⭐ {calcMean('Q10')} / 5</td>
                      <td style={{ padding: '10px 8px' }}>⭐ {calcMean('Q11')} / 5</td>
                      <td style={{ padding: '10px 8px' }}>⭐ {calcMean('Q12')} / 5</td>
                      <td style={{ padding: '10px 8px' }}>⭐ {calcMean('Q13')} / 5</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. C4 Discomfort Check */}
        <div className="protocol-section-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#f8fafc', margin: '0 0 0.5rem' }}>4. C4 Discomfort Check (VR Safety Protocol)</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
            Reported exclusively by participants in condition C4. Scale: 1=Not at all, 2=Mild, 3=Moderate, 4=Severe, 5=Very severe.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '1rem' }}>
            {[
              { val: 1, label: 'Not at all' },
              { val: 2, label: 'Mild' },
              { val: 3, label: 'Moderate' },
              { val: 4, label: 'Severe' },
              { val: 5, label: 'Very severe' }
            ].map(lvl => {
              const count = discCounts[lvl.val];
              const pct = c4List.length > 0 ? Math.round((count / c4List.length) * 100) : 0;
              return (
                <div key={lvl.val} style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Level {lvl.val} ({lvl.label})</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: lvl.val >= 4 ? '#ef4444' : '#38bdf8', margin: '4px 0' }}>{count}</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{pct}% of C4</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="researcher-dashboard">
      <nav className="researcher-nav">
        <div className="nav-brand">
          <span className="brand-icon">🔬</span>
          <span className="brand-text">Researcher Console</span>
        </div>
        <div className="nav-tabs">
          <button className={`nav-tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
            📊 Dashboard
          </button>
          <button className={`nav-tab ${tab === 'questionnaire' ? 'active' : ''}`} onClick={() => setTab('questionnaire')}>
            📋 Questionnaire Protocol
          </button>
          <button className={`nav-tab ${tab === 'stories' ? 'active' : ''}`} onClick={() => setTab('stories')}>
            📖 Stories
          </button>
          <button className={`nav-tab ${tab === 'export' ? 'active' : ''}`} onClick={() => setTab('export')}>
            💾 Export
          </button>
        </div>
        <button className="refresh-btn" onClick={loadData}>🔄 Refresh</button>
      </nav>

      <main className="researcher-main">
        {tab === 'dashboard' && renderDashboard()}
        {tab === 'questionnaire' && renderQuestionnaireProtocol()}
        {tab === 'stories' && renderStoryConfig()}
        {tab === 'export' && renderExport()}
      </main>
    </div>
  );
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
