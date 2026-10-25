import React, { useState, useEffect, useCallback, useRef } from 'react';
import { eventLogger, getEventCategory } from '../../services/EventLogger';
import { AVAILABLE_STORIES, CONDITIONS, loadStoryConfig, loadAvailableStories, validateStoryConfig, formatTime } from '../../services/StoryLoader';
import { computeSessionMeasures } from '../../services/SessionMeasures';
import authService from '../../services/AuthService';
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

  const loadData = async () => {
    await eventLogger.init();
    let localS = await eventLogger.getAllSessions();
    let localE = await eventLogger.getAllEvents();
    let localA = await eventLogger.getAllAssessments();

    // Fetch central multi-device database
    try {
      const token = authService.getToken();
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
            if (!mergedEvents.some(me => me.session_id === le.session_id && me.timestamp === le.timestamp && me.event === le.event)) {
              mergedEvents.push(le);
            }
          });

          const mergedAssessments = [...(serverData.assessments || [])];
          localA.forEach(la => {
            if (!mergedAssessments.some(ma => ma.session_id === la.session_id && ma.question_id === la.question_id)) {
              mergedAssessments.push(la);
            }
          });

          setSessions(mergedSessions);
          setEvents(mergedEvents);
          setAssessments(mergedAssessments);
          return;
        }
      }
    } catch (err) {
      console.warn('Central DB fetch fallback to local:', err);
    }

    setSessions(localS);
    setEvents(localE);
    setAssessments(localA);
  };

  // Delete a session
  const handleDeleteSession = async (sessionId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this session and all its logged events & assessments?')) return;
    await eventLogger.deleteSession(sessionId);
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
          level: q <= 4 ? 'recall_understand' : q <= 6 ? 'apply' : 'implement',
          accuracy: q === 5 && s.condition === 'C1' ? 0 : 1,
          response_time_ms: Math.floor(2500 + Math.random() * 4000),
          answer_changes: Math.random() > 0.7 ? 1 : 0
        });
      }
    });

    await eventLogger.importData({ sessions: sampleSessions, events: sampleEvents, assessments: sampleAssessments });
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
                          {e.timestamp_utc ? e.timestamp_utc.slice(11, 19) : (e.wall_clock ? e.wall_clock.slice(11, 19) : '-')}
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
                    <td>{Math.round(a.response_time_ms)} ms</td>
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
        const wallIso = e.timestamp_utc || (e.wall_clock ? new Date(e.wall_clock).toISOString() : (e.timestamp ? new Date(e.timestamp).toISOString() : ''));
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
          (measures.total_session_duration_ms / 1000).toFixed(2),
          (measures.exposure_duration_ms / 1000).toFixed(2),
          (measures.active_viewing_duration_sec || (measures.active_viewing_duration_ms / 1000)).toFixed(2),
          (measures.pause_duration_ms / 1000).toFixed(2),
          (measures.interaction_duration_ms / 1000).toFixed(2),
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
      } else if (type === 'technical') {
        data = events.filter(e => (e.category === 'technical') || (e.event_type || e.event || '').includes('ERROR') || e.result === 'failed');
      }
      downloadFile(`${type}.json`, JSON.stringify(data, null, 2), 'application/json');
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
        </div>

        <div className="danger-zone">
          <h3>⚠️ Danger Zone</h3>
          <button className="danger-btn" onClick={async () => {
            if (window.confirm('This will permanently delete ALL study data. Are you sure?')) {
              await eventLogger.clearAll();
              loadData();
            }
          }}>
            Clear All Data
          </button>
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
