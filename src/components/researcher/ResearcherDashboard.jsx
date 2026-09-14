import React, { useState, useEffect, useCallback, useRef } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { AVAILABLE_STORIES, CONDITIONS, loadStoryConfig, loadAvailableStories, validateStoryConfig, formatTime } from '../../services/StoryLoader';
import { computeSessionMeasures } from '../../services/SessionMeasures';
import authService from '../../services/AuthService';
import AdminLoginGate from './AdminLoginGate';
import './ResearcherDashboard.css';

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
  const fileInputRef = useRef(null);

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
          setSessions(mergedSessions);
          setEvents(serverData.events?.length ? serverData.events : localE);
          setAssessments(serverData.assessments?.length ? serverData.assessments : localA);
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

  // ─── Dashboard Tab ────
  const renderDashboard = () => {
    const sessionsByCondition = {};
    CONDITIONS.forEach(c => { sessionsByCondition[c.id] = []; });
    sessions.forEach(s => {
      if (sessionsByCondition[s.condition]) sessionsByCondition[s.condition].push(s);
    });

    return (
      <div className="dashboard-content">
        <h2>Study Overview</h2>

        {/* Summary cards */}
        <div className="summary-cards">
          <div className="summary-card">
            <div className="card-value">{sessions.length}</div>
            <div className="card-label">Total Sessions</div>
          </div>
          <div className="summary-card">
            <div className="card-value">{new Set(sessions.map(s => s.participant_id)).size}</div>
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
              ? Math.round((condAssessments.reduce((s, a) => s + a.accuracy, 0) / condAssessments.length) * 100)
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

        {/* Participant table with administrative Identity */}
        <h3>All Sessions</h3>
        {sessions.length === 0 ? (
          <p className="empty-state">No sessions recorded yet. Run a participant session first.</p>
        ) : (
          <div className="sessions-table-wrapper">
            <table className="sessions-table">
              <thead>
                <tr>
                  <th>Participant ID</th>
                  <th>Name & Email</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>Assessment</th>
                  <th>Start</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const sessEvents = events.filter(e => e.session_id === s.session_id);
                  const sessAssess = assessments.filter(a => a.session_id === s.session_id);
                  const acc = sessAssess.length > 0
                    ? Math.round((sessAssess.reduce((sum, a) => sum + a.accuracy, 0) / sessAssess.length) * 100)
                    : '-';

                  return (
                    <tr key={s.session_id} className={selectedSession === s.session_id ? 'selected' : ''}>
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
                      <td>{acc}%</td>
                      <td>{s.start_time ? new Date(s.start_time).toLocaleString() : '-'}</td>
                      <td>
                        <button className="table-btn" onClick={() => setSelectedSession(s.session_id)}>
                          View
                        </button>
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

    // Compute derived measures from raw events (§A of addendum)
    const measures = computeSessionMeasures(sessEvents, sessAssess);

    const videoEvents = sessEvents.filter(e => e.event?.startsWith('VIDEO_'));
    const replays = sessEvents.filter(e => e.event === 'VIDEO_REPLAY').length;
    const pauses = sessEvents.filter(e => e.event === 'VIDEO_PAUSE').length;
    const interactions = sessEvents.filter(e => e.event === 'OBJECT_INTERACT').length;
    const gazeEvents = sessEvents.filter(e => e.event?.startsWith('GAZE_')).length;

    return (
      <div className="session-detail">
        <div className="detail-header">
          <h3>Session Detail — {session?.participant_id} ({session?.condition})</h3>
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
          <div className="mini-stat"><span>{gazeEvents}</span>Gaze Events</div>
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

        <h4>Event Log (latest 50)</h4>
        <div className="event-log-scroll">
          <table className="event-log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Object</th>
                <th>Action</th>
                <th>Response</th>
              </tr>
            </thead>
            <tbody>
              {sessEvents.slice(-50).map((e, i) => (
                <tr key={i}>
                  <td>{typeof e.timestamp === 'number' ? formatTime(e.timestamp / 1000) : '-'}</td>
                  <td><code className="event-type">{e.event}</code></td>
                  <td>{e.object_id || '-'}</td>
                  <td>{e.action || '-'}</td>
                  <td className="response-cell">{e.response ? String(e.response).slice(0, 60) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sessAssess.length > 0 && (
          <>
            <h4>Assessment Responses</h4>
            <table className="event-log-table">
              <thead>
                <tr>
                  <th>Q ID</th>
                  <th>Level</th>
                  <th>Correct</th>
                  <th>Time (ms)</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {sessAssess.map((a, i) => (
                  <tr key={i}>
                    <td>{a.question_id}</td>
                    <td>{a.level}</td>
                    <td className={a.accuracy === 1 ? 'correct-cell' : 'incorrect-cell'}>
                      {a.accuracy === 1 ? '✓' : '✗'}
                    </td>
                    <td>{Math.round(a.response_time_ms)}</td>
                    <td>{a.answer_changes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
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
        'participant_id',
        'session_id',
        'condition',
        'story_id',
        'timestamp_ms',
        'wall_clock_iso',
        'video_timestamp_sec',
        'event_type',
        'object_id',
        'action',
        'payload_json'
      ];
      const csv = [headers.join(',')];
      events.forEach(e => {
        const wallIso = e.wall_clock ? new Date(e.wall_clock).toISOString() : (e.timestamp ? new Date(e.timestamp).toISOString() : '');
        const payload = e.response != null ? JSON.stringify(e.response) : (e.payload != null ? JSON.stringify(e.payload) : '');
        const row = [
          e.participant_id || '',
          e.session_id || '',
          e.condition || '',
          e.story_id || '',
          e.timestamp || 0,
          wallIso,
          e.video_timestamp != null ? e.video_timestamp : '',
          e.event || '',
          e.object_id || '',
          e.action || '',
          payload ? `"${payload.replace(/"/g, '""')}"` : ''
        ];
        csv.push(row.join(','));
      });
      downloadFile('raw_event_log.csv', csv.join('\n'), 'text/csv');
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
        const correctAns = JSON.stringify(a.correct_answer ?? '');
        const row = [
          a.session_id || '',
          a.participant_id || '',
          a.condition || '',
          a.story_id || '',
          a.question_id || '',
          a.level || '',
          a.question_type || 'multiple_choice',
          a.start_time ? new Date(a.start_time).toISOString() : '',
          a.end_time ? new Date(a.end_time).toISOString() : '',
          givenAns ? `"${givenAns.replace(/"/g, '""')}"` : '',
          correctAns ? `"${correctAns.replace(/"/g, '""')}"` : '',
          a.accuracy === 1 ? 1 : 0,
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

        const calcAcc = (arr) => arr.length > 0 ? (arr.reduce((acc, a) => acc + (a.accuracy === 1 ? 1 : 0), 0) / arr.length).toFixed(2) : '';

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
          sessEvents.filter(e => e.event === 'VIDEO_REPLAY').length,
          sessEvents.filter(e => e.event === 'VIDEO_PAUSE').length,
          sessEvents.filter(e => e.event === 'OBJECT_INTERACT').length,
          sessEvents.filter(e => e.event?.startsWith('GAZE_')).length,
          calcAcc(recallAssess),
          calcAcc(applyAssess),
          calcAcc(implementAssess),
          calcAcc(sessAssess)
        ];
        csv.push(row.join(','));
      });

      downloadFile('session_summary.csv', csv.join('\n'), 'text/csv');
    };

    const exportJSON = (type) => {
      const data = type === 'events' ? events : type === 'assessments' ? assessments : sessions;
      downloadFile(`${type}.json`, JSON.stringify(data, null, 2), 'application/json');
    };

    return (
      <div className="dashboard-content">
        <h2>Data Export</h2>
        <p className="export-desc">Export study data in CSV or JSON format. All exports are derived from the raw event log.</p>

        <div className="export-grid">
          <div className="export-card">
            <h3>📊 Raw Event Log</h3>
            <p>Every timestamped event across all sessions — the source of truth.</p>
            <p className="export-count">{events.length} events</p>
            <div className="export-btns">
              <button className="export-btn" onClick={exportRawEvents}>CSV</button>
              <button className="export-btn" onClick={() => exportJSON('events')}>JSON</button>
            </div>
          </div>

          <div className="export-card">
            <h3>📝 Assessment Data</h3>
            <p>Per-question responses with accuracy, timing, and revision counts.</p>
            <p className="export-count">{assessments.length} responses</p>
            <div className="export-btns">
              <button className="export-btn" onClick={exportAssessments}>CSV</button>
              <button className="export-btn" onClick={() => exportJSON('assessments')}>JSON</button>
            </div>
          </div>

          <div className="export-card">
            <h3>📋 Session Summary</h3>
            <p>Per-participant aggregate: duration, replays, interactions, scores.</p>
            <p className="export-count">{sessions.length} sessions</p>
            <div className="export-btns">
              <button className="export-btn" onClick={exportSessionSummary}>CSV</button>
              <button className="export-btn" onClick={() => exportJSON('sessions')}>JSON</button>
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
