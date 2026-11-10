import React, { useState, useEffect, useCallback, useRef } from 'react';
import { eventLogger, getEventCategory } from '../../services/EventLogger';
import { AVAILABLE_STORIES, CONDITIONS, loadStoryConfig, loadAvailableStories, validateStoryConfig, formatTime } from '../../services/StoryLoader';
import { computeSessionMeasures } from '../../services/SessionMeasures';
import authService from '../../services/AuthService';
import { scoreQuestionnaireSubmission, AYURVEDA_ANSWER_KEY, Q9_RUBRIC, extractOptionLetter } from '../../services/ResearcherScoringService';
import {
  escapeCsv,
  filterItems,
  exportParticipantMasterCSV,
  exportSessionSummaryCSV,
  exportRawEventsCSV,
  exportQuestionnaireResponsesCSV,
  exportKnowledgeScoresCSV,
  exportQ9OpenResponsesCSV,
  exportQ10Q13LikertCSV,
  exportC4DiscomfortCSV,
  exportC3InteractionTelemetryCSV,
  exportC4VRTelemetryCSV,
  exportTechnicalIssuesCSV,
  exportDataSyncStatusCSV,
  exportCombinedResearchDatasetCSV
} from '../../services/ResearchDataExporter';
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

  // Authoritative Database & Synchronization Status State
  const [dbHealth, setDbHealth] = useState({ connected: false, authoritative: false, mode: 'checking', database: null, latency_ms: null, error: null });
  const [totalDbEventsCount, setTotalDbEventsCount] = useState(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncInfo, setSyncInfo] = useState({ lastSuccessfulSync: null, lastSyncError: null, isSyncing: false });
  const [isManualSyncing, setIsManualSyncing] = useState(false);

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

  // Research Data Export Filtering & Notification State
  const [exportFilterCondition, setExportFilterCondition] = useState('all');
  const [exportFilterStory, setExportFilterStory] = useState('all');
  const [exportFilterSearch, setExportFilterSearch] = useState('');
  const [exportDateStart, setExportDateStart] = useState('');
  const [exportDateEnd, setExportDateEnd] = useState('');
  const [exportStatusMessage, setExportStatusMessage] = useState(null);
  const [participantsList, setParticipantsList] = useState([]);

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

  const isAyurvedaItem = (item) => {
    if (!item) return false;
    const sid = (item.story_id || '').toLowerCase();
    const sessId = (item.session_id || '').toLowerCase();
    if (sessId.includes('kite') || sessId.includes('lant') || sessId.includes('milo') ||
        sid.includes('kite') || sid.includes('lantern') || sid.includes('milo')) {
      return false;
    }
    return true;
  };

  const loadData = async () => {
    await eventLogger.init();
    const localS = await eventLogger.getAllSessions();
    const localE = await eventLogger.getAllEvents();
    const localA = await eventLogger.getAllAssessments();
    const localQ = await eventLogger.getAllQuestionnaireSubmissions();

    // Check pending event synchronization status
    try {
      const pCount = await eventLogger.getPendingSyncCount();
      setPendingSyncCount(pCount);
      setSyncInfo(eventLogger.getSyncHealth());
    } catch (e) {
      console.warn('Pending count check error:', e);
    }

    // 1. Fetch Central PostgreSQL Health Check
    try {
      const hRes = await fetch('/api/db/health');
      if (hRes.ok) {
        const hData = await hRes.json();
        setDbHealth(hData);
      } else {
        setDbHealth({ connected: false, authoritative: false, mode: 'error', error: `HTTP ${hRes.status}` });
      }
    } catch (hErr) {
      setDbHealth({ connected: false, authoritative: false, mode: 'offline', error: hErr.message });
    }

    // 2. Fetch Authoritative Central Multi-Device Database Data
    try {
      const token = authService.getToken() || sessionStorage.getItem('agy_session_token') || sessionStorage.getItem('agy_admin_session_token');
      if (token) {
        const res = await fetch('/api/db/dashboard-data', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const serverData = await res.json();

          // Authoritative Cloud Records
          const serverSessions = (serverData.sessions || []).filter(isAyurvedaItem);
          const serverEvents = (serverData.events || []).filter(isAyurvedaItem);
          const serverAssessments = (serverData.assessments || []).filter(isAyurvedaItem);
          const serverQ = (serverData.questionnaire_submissions || []).filter(isAyurvedaItem);

          setSessions(serverSessions);
          setEvents(serverEvents);
          setTotalDbEventsCount(serverData.total_events_count != null ? serverData.total_events_count : null);
          setAssessments(serverAssessments);
          setQuestionnaireSubmissions(serverQ);

          try {
            const pRes = await fetch('/api/db/participants', { headers: { 'Authorization': `Bearer ${token}` } });
            if (pRes.ok) {
              const pData = await pRes.json();
              if (Array.isArray(pData)) setParticipantsList(pData);
            }
          } catch (pErr) {
            console.warn('Participants fetch warning:', pErr);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('Central DB fetch fallback to local:', err);
    }

    // Local Storage Fallback if Server Unreachable
    setSessions(localS.filter(isAyurvedaItem));
    setEvents(localE.filter(isAyurvedaItem));
    setAssessments(localA.filter(isAyurvedaItem));
    setQuestionnaireSubmissions(localQ.filter(isAyurvedaItem));
  };

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      await eventLogger.syncPendingEvents();
      await loadData();
    } catch (err) {
      alert('Manual sync error: ' + err.message);
    } finally {
      setIsManualSyncing(false);
    }
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

  // Generate Demo Study Data for Ayurveda research study across C1-C4
  const handleGenerateSampleData = async () => {
    if (!window.confirm('Generate 4 representative sample Ayurveda research sessions across C1–C4 with realistic interaction telemetry, randomized questionnaire answers, and complete assessment data?')) return;

    const sampleSessions = [
      {
        session_id: 'SESS_AYUR_C1_' + Date.now().toString().slice(-4),
        participant_id: 'P_Aarav_C1',
        participant_name: 'Aarav Sharma',
        participant_email: 'aarav@example.edu',
        participant_age: '20-22',
        condition: 'C1',
        story_id: 'ayurveda_intro_v1',
        story_title: 'Introduction to Ayurveda',
        start_time: new Date(Date.now() - 3600000 * 3).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 3 + 195000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', story_version: '1.0' }
      },
      {
        session_id: 'SESS_AYUR_C2_' + Date.now().toString().slice(-4),
        participant_id: 'P_Priya_C2',
        participant_name: 'Priya Nair',
        participant_email: 'priya@example.edu',
        participant_age: '20-22',
        condition: 'C2',
        story_id: 'ayurveda_intro_v1',
        story_title: 'Introduction to Ayurveda',
        start_time: new Date(Date.now() - 3600000 * 2.5).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 2.5 + 210000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', story_version: '1.0' }
      },
      {
        session_id: 'SESS_AYUR_C3_' + Date.now().toString().slice(-4),
        participant_id: 'P_Rohan_C3',
        participant_name: 'Rohan Gupta',
        participant_email: 'rohan@example.edu',
        participant_age: '20-22',
        condition: 'C3',
        story_id: 'ayurveda_intro_v1',
        story_title: 'Introduction to Ayurveda',
        start_time: new Date(Date.now() - 3600000 * 2).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 2 + 235000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', story_version: '1.0' }
      },
      {
        session_id: 'SESS_AYUR_C4_' + Date.now().toString().slice(-4),
        participant_id: 'P_Ananya_C4',
        participant_name: 'Ananya Verma',
        participant_email: 'ananya@example.edu',
        participant_age: '20-22',
        condition: 'C4',
        story_id: 'ayurveda_intro_v1',
        story_title: 'Introduction to Ayurveda',
        start_time: new Date(Date.now() - 3600000 * 1.5).toISOString(),
        end_time: new Date(Date.now() - 3600000 * 1.5 + 260000).toISOString(),
        status: 'complete',
        version_snapshot: { story_id: 'ayurveda_intro_v1', story_title: 'Introduction to Ayurveda', story_version: '1.0' }
      }
    ];

    const sampleEvents = [];
    const sampleAssessments = [];
    const sampleQuestionnaires = [];

    sampleSessions.forEach(s => {
      const baseTime = new Date(s.start_time).getTime();

      // Standard Video Events
      sampleEvents.push(
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime, wall_clock: s.start_time, video_timestamp: 0, event: 'VIDEO_START', action: 'session_begin' },
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 25000, wall_clock: new Date(baseTime + 25000).toISOString(), video_timestamp: 25, event: 'SEGMENT_ENTER', action: 'scene_transition', object_id: 'origins' },
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 65000, wall_clock: new Date(baseTime + 65000).toISOString(), video_timestamp: 65, event: 'SEGMENT_ENTER', action: 'scene_transition', object_id: 'elements' }
      );

      // Condition-specific interaction telemetry
      if (s.condition === 'C2') {
        sampleEvents.push(
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 1000, wall_clock: new Date(baseTime + 1000).toISOString(), video_timestamp: 1, event: 'SPATIAL_AUDIO_INIT', action: 'spatial_panner_ready' },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 70000, wall_clock: new Date(baseTime + 70000).toISOString(), video_timestamp: 70, event: 'AUDIO_NODE_UPDATE', action: 'pan_elements', object_id: 'ether_wind' }
        );
      } else if (s.condition === 'C3') {
        sampleEvents.push(
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 30000, wall_clock: new Date(baseTime + 30000).toISOString(), video_timestamp: 30, event: 'C3_GATE_OPEN', object_id: 'banyan_tree_hold', action: 'gate_opened' },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 33500, wall_clock: new Date(baseTime + 33500).toISOString(), video_timestamp: 33, event: 'C3_COMPLETE', object_id: 'banyan_tree_hold', action: 'hold_success', duration_ms: 3500 },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 75000, wall_clock: new Date(baseTime + 75000).toISOString(), video_timestamp: 75, event: 'HOTSPOT_CLICK', object_id: 'five_elements_reveal', action: 'reveal_ether' },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 115000, wall_clock: new Date(baseTime + 115000).toISOString(), video_timestamp: 115, event: 'OBJECT_INTERACT', object_id: 'mortar_pestle_grind', action: 'grind_circle_complete', revolutions: 3 },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 140000, wall_clock: new Date(baseTime + 140000).toISOString(), video_timestamp: 140, event: 'CHECKPOINT_HIT', object_id: 'dosha_balance_interactive', action: 'balance_vata_pitta_kapha', durationMs: 4200, correct: true },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 165000, wall_clock: new Date(baseTime + 165000).toISOString(), video_timestamp: 165, event: 'OBJECT_PLACED', object_id: 'scroll_passing', action: 'teacher_to_student_drop', durationMs: 2800 }
        );
      } else if (s.condition === 'C4') {
        sampleEvents.push(
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 20000, wall_clock: new Date(baseTime + 20000).toISOString(), video_timestamp: 20, event: 'VR_ENTER', action: 'webxr_start' },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 80000, wall_clock: new Date(baseTime + 80000).toISOString(), video_timestamp: 80, event: 'GAZE_DWELL', object_id: 'diya_lamp_mandapa', duration: 2200 },
          { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 120000, wall_clock: new Date(baseTime + 120000).toISOString(), video_timestamp: 120, event: 'VR_INTERACTION', object_id: 'herb_garden_tulsi', action: 'touch_sphere' }
        );
      }

      sampleEvents.push(
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 180000, wall_clock: new Date(baseTime + 180000).toISOString(), video_timestamp: 180, event: 'VIDEO_COMPLETE', action: 'experience_end' },
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 185000, wall_clock: new Date(baseTime + 185000).toISOString(), video_timestamp: 185, event: 'QUESTIONNAIRE_OPEN', action: 'begin_assessment' },
        { participant_id: s.participant_id, session_id: s.session_id, condition: s.condition, story_id: s.story_id, timestamp: baseTime + 250000, wall_clock: new Date(baseTime + 250000).toISOString(), video_timestamp: 185, event: 'ASSESSMENT_SUBMIT', action: 'submit_questionnaire' }
      );

      // Randomized approved answer key: Q1:C, Q2:A, Q3:D, Q4:B, Q5:C, Q6:A, Q7:D, Q8:B
      const answersMap = {
        Q1: 'C',
        Q2: 'A',
        Q3: 'D',
        Q4: 'B',
        Q5: s.condition === 'C1' ? 'A' : 'C', // C1 gets 1 incorrect (A instead of C), others 8/8
        Q6: 'A',
        Q7: 'D',
        Q8: 'B',
        Q9: 'Ayurveda is a traditional system of health and nature that emphasizes daily routines, dosha balance, and mind-body harmony.',
        Q10: s.condition === 'C4' ? 5 : 4,
        Q11: s.condition === 'C3' || s.condition === 'C4' ? 5 : 4,
        Q12: 4,
        Q13: s.condition === 'C1' ? 4 : 5,
        C4_discomfort: s.condition === 'C4' ? 1 : null
      };

      for (let q = 1; q <= 8; q++) {
        const qId = `Q${q}`;
        const given = answersMap[qId];
        const correct = AYURVEDA_ANSWER_KEY[qId];
        const isAcc = given === correct ? 1 : 0;
        sampleAssessments.push({
          session_id: s.session_id,
          participant_id: s.participant_id,
          condition: s.condition,
          story_id: s.story_id,
          question_id: qId,
          level: 'recall_understand',
          question_type: 'multiple_choice',
          measure: 'conceptual',
          answer: given,
          final_answer: given,
          accuracy: isAcc,
          response_time_ms: Math.floor(2500 + Math.random() * 3000),
          answer_changes: 0
        });
      }

      // Q9 assessment
      sampleAssessments.push({
        session_id: s.session_id,
        participant_id: s.participant_id,
        condition: s.condition,
        story_id: s.story_id,
        question_id: 'Q9',
        level: 'main_message',
        question_type: 'open_response',
        measure: 'main_message',
        answer: answersMap.Q9,
        final_answer: answersMap.Q9
      });

      // Q10-Q13 assessments
      [10, 11, 12, 13].forEach(num => {
        const qId = `Q${num}`;
        sampleAssessments.push({
          session_id: s.session_id,
          participant_id: s.participant_id,
          condition: s.condition,
          story_id: s.story_id,
          question_id: qId,
          level: 'experience_survey',
          question_type: 'likert_1_5',
          measure: num === 10 ? 'perceived understanding' : num === 11 ? 'self-reported attention' : num === 12 ? 'perceived clarity/ease of following' : 'perceived recall',
          answer: answersMap[qId],
          final_answer: answersMap[qId]
        });
      });

      if (s.condition === 'C4') {
        sampleAssessments.push({
          session_id: s.session_id,
          participant_id: s.participant_id,
          condition: s.condition,
          story_id: s.story_id,
          question_id: 'C4_discomfort',
          level: 'safety_discomfort',
          question_type: 'likert_1_5',
          measure: 'cybersickness_discomfort',
          answer: answersMap.C4_discomfort,
          final_answer: answersMap.C4_discomfort
        });
      }

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

    // Also sync to central server if token present
    try {
      const token = authService.getToken() || sessionStorage.getItem('agy_session_token') || sessionStorage.getItem('agy_admin_session_token');
      if (token) {
        for (const s of sampleSessions) {
          await fetch('/api/db/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(s)
          });
        }
        for (const q of sampleQuestionnaires) {
          await fetch('/api/questionnaire/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(q)
          });
        }
      }
    } catch (e) {
      console.warn('Central DB sample sync warning:', e);
    }

    alert('Sample Ayurveda study dataset generated with 4 sessions (C1, C2, C3, C4)!');
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
            <div className="card-value">{totalDbEventsCount != null ? totalDbEventsCount : events.length}</div>
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
              <option value="all">🌿 Ayurveda Study ({sessions.length} sessions)</option>
              <option value="ayurveda_intro_v1">🌿 Ayurveda (ayurveda_intro_v1)</option>
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

  // ─── Export Tab (13 Standardized Research CSV Streams) ────
  const renderExport = () => {
    const ayurvedaEvents = events.filter(isAyurvedaItem);
    const ayurvedaAssessments = assessments.filter(isAyurvedaItem);
    const ayurvedaSessions = sessions.filter(isAyurvedaItem);
    const ayurvedaQuestionnaires = questionnaireSubmissions.filter(isAyurvedaItem);

    const exportFilters = {
      condition: exportFilterCondition,
      storyId: exportFilterStory,
      participantId: exportFilterSearch,
      startDate: exportDateStart,
      endDate: exportDateEnd
    };

    const triggerDownload = (result) => {
      downloadFile(result.name, result.csv, 'text/csv');
      setExportStatusMessage(`✓ Successfully exported ${result.count} records to ${result.name} (Excel-compatible UTF-8 format)`);
      setTimeout(() => setExportStatusMessage(null), 5000);
    };

    const triggerJsonDownload = (filename, data) => {
      downloadFile(filename, JSON.stringify(data, null, 2), 'application/json');
      setExportStatusMessage(`✓ Successfully exported ${data.length} records to ${filename}`);
      setTimeout(() => setExportStatusMessage(null), 5000);
    };

    const handleExportAll = () => {
      setExportStatusMessage('Generating and downloading all 13 research datasets...');
      const allResults = [
        exportParticipantMasterCSV(participantsList, exportFilters),
        exportSessionSummaryCSV(ayurvedaSessions, ayurvedaEvents, ayurvedaAssessments, exportFilters),
        exportRawEventsCSV(ayurvedaEvents, exportFilters),
        exportQuestionnaireResponsesCSV(ayurvedaQuestionnaires, exportFilters),
        exportKnowledgeScoresCSV(ayurvedaQuestionnaires, exportFilters),
        exportQ9OpenResponsesCSV(ayurvedaQuestionnaires, exportFilters),
        exportQ10Q13LikertCSV(ayurvedaQuestionnaires, exportFilters),
        exportC4DiscomfortCSV(ayurvedaQuestionnaires, exportFilters),
        exportC3InteractionTelemetryCSV(ayurvedaEvents, exportFilters),
        exportC4VRTelemetryCSV(ayurvedaEvents, exportFilters),
        exportTechnicalIssuesCSV(ayurvedaEvents, exportFilters),
        exportDataSyncStatusCSV(ayurvedaEvents, exportFilters),
        exportCombinedResearchDatasetCSV({
          participants: participantsList,
          sessions: ayurvedaSessions,
          events: ayurvedaEvents,
          questionnaires: ayurvedaQuestionnaires
        }, exportFilters)
      ];

      allResults.forEach((r, idx) => {
        setTimeout(() => {
          downloadFile(r.name, r.csv, 'text/csv');
        }, idx * 180);
      });

      setExportStatusMessage('✓ All 13 research datasets triggered for download!');
      setTimeout(() => setExportStatusMessage(null), 6000);
    };

    // Calculate dynamic counts based on active filters
    const countParticipants = filterItems(participantsList, exportFilters).length;
    const countSessions = filterItems(ayurvedaSessions, exportFilters).length;
    const countEvents = filterItems(ayurvedaEvents, exportFilters).length;
    const countQuestionnaires = filterItems(ayurvedaQuestionnaires, exportFilters).length;
    const countC4Discomfort = filterItems(ayurvedaQuestionnaires, exportFilters).filter(q => (q.condition || '').toUpperCase() === 'C4').length;
    const countC3Interactions = filterItems(ayurvedaEvents, exportFilters).filter(e => (e.condition || '').toUpperCase() === 'C3' || (e.event_type || e.event || '').startsWith('C3_') || ['HOTSPOT_CLICK', 'OBJECT_INTERACT', 'OBJECT_PLACED', 'CHECKPOINT_HIT'].includes(e.event_type || e.event)).length;
    const countC4VR = filterItems(ayurvedaEvents, exportFilters).filter(e => (e.condition || '').toUpperCase() === 'C4' || (e.event_type || e.event || '').startsWith('VR_') || e.event_type === 'GAZE_DWELL').length;
    const countTechnical = filterItems(ayurvedaEvents, exportFilters).filter(e => e.category === 'technical' || (e.event_type || e.event || '').includes('ERROR') || (e.event_type || e.event || '').includes('FAIL') || e.result === 'failed').length;

    return (
      <div className="dashboard-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2>Research Data Exports</h2>
            <p className="export-desc" style={{ margin: '4px 0 0 0' }}>
              Standardized CSV exports for all 13 research dimensions. Excel UTF-8 formatted with stable IDs, un-truncated event streams, and research condition separation.
            </p>
          </div>
          <button
            onClick={handleExportAll}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)'
            }}
          >
            📦 Export All 13 Research Datasets (CSV)
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{
          margin: '1.25rem 0',
          padding: '1rem',
          borderRadius: '10px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>CONDITION</label>
            <select
              value={exportFilterCondition}
              onChange={(e) => setExportFilterCondition(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
            >
              <option value="all">All Conditions (C1–C4)</option>
              <option value="C1">C1 — Video Only</option>
              <option value="C2">C2 — Spatial Audio</option>
              <option value="C3">C3 — Interactive Video</option>
              <option value="C4">C4 — Immersive VR</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>STORY</label>
            <select
              value={exportFilterStory}
              onChange={(e) => setExportFilterStory(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
            >
              <option value="all">All Stories</option>
              <option value="ayurveda_intro_v1">Ayurveda Intro v1</option>
              <option value="missing_kite_v1">Missing Kite v1</option>
              <option value="lantern_garden_v1">Lantern Garden v1</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>PARTICIPANT / SESSION ID</label>
            <input
              type="text"
              placeholder="Search by ID or name..."
              value={exportFilterSearch}
              onChange={(e) => setExportFilterSearch(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>DATE START</label>
            <input
              type="date"
              value={exportDateStart}
              onChange={(e) => setExportDateStart(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>DATE END</label>
            <input
              type="date"
              value={exportDateEnd}
              onChange={(e) => setExportDateEnd(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
            />
          </div>

          {(exportFilterCondition !== 'all' || exportFilterStory !== 'all' || exportFilterSearch || exportDateStart || exportDateEnd) && (
            <button
              onClick={() => {
                setExportFilterCondition('all');
                setExportFilterStory('all');
                setExportFilterSearch('');
                setExportDateStart('');
                setExportDateEnd('');
              }}
              style={{
                alignSelf: 'flex-end',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                padding: '7px 12px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Status Notification */}
        {exportStatusMessage && (
          <div style={{
            margin: '0 0 1.25rem 0',
            padding: '10px 16px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#34d399',
            fontSize: '0.9rem',
            fontWeight: 600
          }}>
            {exportStatusMessage}
          </div>
        )}

        {/* 13 Standardized Datasets Grid */}
        <div className="export-grid">
          {/* 1. Participant Master Data */}
          <div className="export-card">
            <h3>👤 1. Participant Master Data</h3>
            <p>Participant demographics, assigned condition, name, email, and registration timestamps.</p>
            <p className="export-count">{countParticipants} participant records</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportParticipantMasterCSV(participantsList, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('participant_master_data.json', filterItems(participantsList, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 2. Session Summary Data */}
          <div className="export-card">
            <h3>📋 2. Session Summary Data</h3>
            <p>Session-level metadata: start, end, duration, condition assignment, and total events logged.</p>
            <p className="export-count">{countSessions} sessions</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportSessionSummaryCSV(ayurvedaSessions, ayurvedaEvents, ayurvedaAssessments, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('session_summary_data.json', filterItems(ayurvedaSessions, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 3. Complete Raw Event Logs */}
          <div className="export-card">
            <h3>📊 3. Complete Raw Event Logs</h3>
            <p>Complete timestamped event sequence with structured JSON payloads, millisecond clocks, and modality metadata.</p>
            <p className="export-count">{countEvents} telemetry records</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportRawEventsCSV(ayurvedaEvents, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('raw_event_logs.json', filterItems(ayurvedaEvents, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 4. Questionnaire Responses (Q1–Q13) */}
          <div className="export-card">
            <h3>📑 4. Questionnaire Responses (Q1–Q13)</h3>
            <p>Raw response selections for Q1–Q8, verbatim Q9 text, Q10–Q13 Likert ratings, and C4 discomfort.</p>
            <p className="export-count">{countQuestionnaires} questionnaire records</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportQuestionnaireResponsesCSV(ayurvedaQuestionnaires, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('questionnaire_responses_q1_q13.json', filterItems(ayurvedaQuestionnaires, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 5. Knowledge Assessment Scores (0–8) */}
          <div className="export-card">
            <h3>🎯 5. Knowledge Scores (Q1–Q8 & Total)</h3>
            <p>Binary scored knowledge questions (0 or 1 for keyed answers) and overall knowledge score (0–8).</p>
            <p className="export-count">{countQuestionnaires} scored records</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportKnowledgeScoresCSV(ayurvedaQuestionnaires, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('knowledge_assessment_scores.json', filterItems(ayurvedaQuestionnaires, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 6. Q9 Open-Ended Responses */}
          <div className="export-card">
            <h3>✍️ 6. Q9 Open-Ended Responses</h3>
            <p>Verbatim participant synthesis text, Q9 rubric score (0–2), and completion times.</p>
            <p className="export-count">{countQuestionnaires} open responses</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportQ9OpenResponsesCSV(ayurvedaQuestionnaires, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('q9_open_ended_responses.json', filterItems(ayurvedaQuestionnaires, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 7. Individual Q10–Q13 Likert Ratings */}
          <div className="export-card">
            <h3>📈 7. Experience Ratings (Q10–Q13)</h3>
            <p>Discrete 1–5 ratings: Q10 (understanding), Q11 (attention), Q12 (clarity), Q13 (recall). Never summed.</p>
            <p className="export-count">{countQuestionnaires} rating sets</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportQ10Q13LikertCSV(ayurvedaQuestionnaires, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('q10_q13_experience_ratings.json', filterItems(ayurvedaQuestionnaires, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 8. C4 VR Discomfort Responses */}
          <div className="export-card">
            <h3>🥽 8. C4 VR Discomfort Responses</h3>
            <p>Condition C4 simulator sickness ratings (1=Not at all, 5=Very severe). Excluded from C1–C3.</p>
            <p className="export-count">{countC4Discomfort} C4 records</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportC4DiscomfortCSV(ayurvedaQuestionnaires, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('c4_vr_discomfort_responses.json', filterItems(ayurvedaQuestionnaires, exportFilters).filter(q => (q.condition || '').toUpperCase() === 'C4'))}>Export JSON</button>
            </div>
          </div>

          {/* 9. C3 Interaction Telemetry */}
          <div className="export-card">
            <h3>🖱️ 9. C3 Interaction Telemetry</h3>
            <p>Gate openings, hold completion durations, herb grinding rotations, and dosha balance checkpoints.</p>
            <p className="export-count">{countC3Interactions} C3 interaction events</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportC3InteractionTelemetryCSV(ayurvedaEvents, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('c3_interaction_telemetry.json', filterItems(ayurvedaEvents, exportFilters).filter(e => (e.condition || '').toUpperCase() === 'C3'))}>Export JSON</button>
            </div>
          </div>

          {/* 10. C4 VR Telemetry & Gaze */}
          <div className="export-card">
            <h3>🕶️ 10. C4 VR Telemetry & Gaze</h3>
            <p>WebXR session lifecycle, gaze dwell durations, and immersive VR controller/touch interaction events.</p>
            <p className="export-count">{countC4VR} C4 VR events</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportC4VRTelemetryCSV(ayurvedaEvents, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('c4_vr_telemetry.json', filterItems(ayurvedaEvents, exportFilters).filter(e => (e.condition || '').toUpperCase() === 'C4'))}>Export JSON</button>
            </div>
          </div>

          {/* 11. Technical Issues & Errors */}
          <div className="export-card">
            <h3>🛠 11. Technical Issues & Errors</h3>
            <p>Isolated log of media failures, connection timeouts, WebXR errors, and failed action results.</p>
            <p className="export-count" style={{ color: countTechnical > 0 ? '#ef4444' : undefined }}>{countTechnical} technical issues</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportTechnicalIssuesCSV(ayurvedaEvents, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('technical_issues_log.json', filterItems(ayurvedaEvents, exportFilters).filter(e => e.category === 'technical' || e.result === 'failed'))}>Export JSON</button>
            </div>
          </div>

          {/* 12. Data Sync Status & Queue */}
          <div className="export-card">
            <h3>🔄 12. Data Sync Status & Queue</h3>
            <p>Verification of local IndexedDB versus central PostgreSQL synchronization state and pending retry events.</p>
            <p className="export-count">{countEvents} sync status records</p>
            <div className="export-btns">
              <button className="export-btn" onClick={() => triggerDownload(exportDataSyncStatusCSV(ayurvedaEvents, exportFilters))}>Export CSV</button>
              <button className="export-btn" onClick={() => triggerJsonDownload('data_sync_status.json', filterItems(ayurvedaEvents, exportFilters))}>Export JSON</button>
            </div>
          </div>

          {/* 13. Combined Research Master Dataset */}
          <div className="export-card" style={{ gridColumn: '1 / -1', borderColor: 'rgba(56, 189, 248, 0.4)', background: 'rgba(56, 189, 248, 0.05)' }}>
            <h3>🌐 13. Combined Research Master Dataset (Joined Relational Table)</h3>
            <p>
              Complete integrated research table joining participants, sessions, conditions, telemetry event totals,
              and scored questionnaire submissions using stable identifiers (<code>participant_id</code> and <code>session_id</code>).
              Ready for SPSS, R, Python (Pandas), and direct Excel analysis.
            </p>
            <p className="export-count" style={{ color: '#38bdf8', fontWeight: 700 }}>
              {countSessions} integrated participant sessions
            </p>
            <div className="export-btns">
              <button className="export-btn" style={{ background: '#0284c7', color: '#fff', fontWeight: 700, padding: '8px 18px' }} onClick={() => triggerDownload(exportCombinedResearchDatasetCSV({ participants: participantsList, sessions: ayurvedaSessions, events: ayurvedaEvents, questionnaires: ayurvedaQuestionnaires }, exportFilters))}>
                Export Combined CSV
              </button>
              <button className="export-btn" onClick={() => triggerJsonDownload('combined_research_dataset.json', filterItems(ayurvedaSessions, exportFilters))}>
                Export Combined JSON
              </button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="danger-zone" style={{ marginTop: '2.5rem' }}>
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
            <strong>Protected Answer Key (Randomized Slots):</strong> <code style={{ color: '#38bdf8' }}>Q1=C, Q2=A, Q3=D, Q4=B, Q5=C, Q6=A, Q7=D, Q8=B</code> <span style={{ opacity: 0.7, marginLeft: '8px' }}>(E = Not sure for all)</span>
          </div>
        </div>

        {/* 1. Primary Objective Measure: Knowledge */}
        <div className="protocol-section-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#f8fafc', margin: '0 0 0.5rem' }}>1. Primary Objective Measure: Knowledge (Q1–Q8)</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
            Q1–Q8 each score 1 for the keyed correct answer (Q1=C, Q2=A, Q3=D, Q4=B, Q5=C, Q6=A, Q7=D, Q8=B) and 0 for incorrect, blank, or “Not sure” ('E'). Total knowledge score = sum of Q1–Q8 (range 0–8).
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

  const renderDatabaseStatusBar = () => {
    const isConnected = dbHealth && dbHealth.connected;
    const modeText = isConnected ? 'Central PostgreSQL Connected' : 'Central Database Offline / Local Fallback';
    const hasPending = pendingSyncCount > 0;

    return (
      <div style={{
        margin: '0 0 1.5rem 0',
        padding: '1rem 1.25rem',
        borderRadius: '10px',
        background: isConnected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${isConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        color: '#e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#10b981' : '#ef4444',
              boxShadow: isConnected ? '0 0 8px #10b981' : '0 0 8px #ef4444'
            }}></span>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: isConnected ? '#34d399' : '#f87171' }}>
              {modeText}
            </span>
            {isConnected && dbHealth.database && (
              <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)' }}>
                db: {dbHealth.database} {dbHealth.latency_ms != null ? `(${dbHealth.latency_ms}ms)` : ''}
              </span>
            )}
            {!isConnected && dbHealth.error && (
              <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
                Reason: {String(dbHealth.error)}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasPending ? (
              <span style={{
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600
              }}>
                ⚠️ {pendingSyncCount} unsynchronized event{pendingSyncCount > 1 ? 's' : ''} waiting
              </span>
            ) : (
              <span style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.82rem'
              }}>
                ✓ All local events synchronized
              </span>
            )}
            <button
              onClick={handleManualSync}
              disabled={isManualSyncing || !isConnected}
              style={{
                background: isConnected ? '#2563eb' : '#475569',
                color: '#ffffff',
                border: 'none',
                padding: '5px 12px',
                borderRadius: '6px',
                cursor: isConnected && !isManualSyncing ? 'pointer' : 'not-allowed',
                fontSize: '0.82rem',
                fontWeight: 600,
                transition: 'all 0.2s'
              }}
              title={isConnected ? 'Push pending local events to central database' : 'Central database must be reachable to sync'}
            >
              {isManualSyncing ? '🔄 Syncing...' : '⚡ Sync Now'}
            </button>
          </div>
        </div>

        {/* Cross-device explanation & Sync status details */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '0.8rem',
          color: 'rgba(255, 255, 255, 0.65)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '6px'
        }}>
          <div>
            {isConnected ? (
              <span>
                🌐 <strong>Authoritative Multi-Device Mode:</strong> Showing collective research data from all connected sessions and devices.
              </span>
            ) : (
              <span style={{ color: '#fca5a5' }}>
                ⚠️ <strong>Local Storage Mode:</strong> Showing data from this device only. Local records must be synchronized to appear on other researchers' laptops.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '14px' }}>
            <span>
              Last Synced: {syncInfo?.lastSuccessfulSync ? new Date(syncInfo.lastSuccessfulSync).toLocaleTimeString() : 'Not yet synced'}
            </span>
            {syncInfo?.lastSyncError && (
              <span style={{ color: '#f87171' }}>
                Sync Error: {syncInfo.lastSyncError}
              </span>
            )}
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
        {renderDatabaseStatusBar()}
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
