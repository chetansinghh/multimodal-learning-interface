import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { eventLogger } from '../../services/EventLogger';
import { sessionClock } from '../../services/SessionClock';
import { loadStoryConfig, loadAvailableStories, CONDITIONS } from '../../services/StoryLoader';
import { useAuth } from '../../context/AuthContext';
import SimpleVideoPlayer from '../player/SimpleVideoPlayer';
import SpatialAudioPlayer from '../player/SpatialAudioPlayer';
import InteractivePlayer from '../player/InteractivePlayer';
import VRPlayer from '../player/VRPlayer';
import AssessmentEngine from '../assessment/AssessmentEngine';
import OnboardingDemo from './OnboardingDemo';
import './ParticipantFlow.css';


const PHASES = ['setup', 'instructions', 'experience', 'assessment', 'complete'];

export default function ParticipantFlow() {
  const { user, isLoggedIn, role } = useAuth();
  const [phase, setPhase] = useState('instructions');
  const [participantId, setParticipantId] = useState(user?.participant_id || '');
  const [participantIdentity, setParticipantIdentity] = useState(user || null);
  const [sessionId] = useState(() => user?.sessionId || uuidv4());
  const [condition, setCondition] = useState(user?.condition || 'C1');
  const [storyUrl, setStoryUrl] = useState(user?.storyUrl || '/stories/story_missing_kite_v1.json');
  const [availableStories, setAvailableStories] = useState([]);
  const [storyConfig, setStoryConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAvailableStories().then(stories => {
      setAvailableStories(stories);
    });
  }, []);

  // Load story config
  const loadStory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await loadStoryConfig(storyUrl);
      setStoryConfig(config);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [storyUrl]);

  // Ensure storyConfig is loaded when component mounts and storyUrl is available
  useEffect(() => {
    if (storyUrl) {
      loadStory();
    }
  }, [storyUrl, loadStory]);

  /** Generate a deterministic hash from segment start/end times */
  const computeSegmentLayoutHash = (segments) => {
    if (!segments || segments.length === 0) return 'empty';
    const layoutStr = segments.map(s => `${s.id}:${s.start}-${s.end}`).join('|');
    let hash = 5381;
    for (let i = 0; i < layoutStr.length; i++) {
      hash = ((hash << 5) + hash) + layoutStr.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  };

  /** Triggered when Participant completes Setup (Modality & Story selection) */
  const handleStartSession = useCallback(async (e) => {
    if (e) e.preventDefault();
    const pid = user?.participant_id || `P_${user?.name?.replace(/\s+/g, '') || 'user'}_${Date.now().toString().slice(-4)}`;
    const identity = {
      name: user?.name || 'Participant',
      email: user?.email || '',
      age_group: user?.age_group || '12-13',
      condition,
    };
    
    setParticipantId(pid);
    setParticipantIdentity(identity);

    await eventLogger.init();
    await loadStory();
    eventLogger.startSession(pid, sessionId, condition);
    sessionClock.start();
    eventLogger.log('VIDEO_START', { action: 'session_begin' });

    const loadedConfig = await loadStoryConfig(storyUrl);
    const versionSnapshot = {
      study_id: loadedConfig.story_id + '_study',
      study_version: loadedConfig.version || '1.0',
      story_id: loadedConfig.story_id,
      story_version: loadedConfig.version || '1.0',
      condition,
      condition_config_version: '1.0',
      segment_layout_hash: computeSegmentLayoutHash(loadedConfig.segments),
      consent_acknowledged: user?.consent_acknowledged,
      consent_timestamp: user?.consent_timestamp
    };

    const sessionPayload = {
      session_id: sessionId,
      participant_id: pid,
      participant_name: identity.name,
      participant_email: '',
      participant_age: identity.age_group,
      condition,
      story_id: storyUrl,
      start_time: new Date().toISOString(),
      status: 'in_progress',
      version_snapshot: versionSnapshot
    };

    // Save locally to IndexedDB & sync to central backend DB
    await eventLogger.saveSession(sessionPayload);

    setPhase('experience');
    eventLogger.log('VIDEO_START', { action: 'experience_begin' });
  }, [user, condition, sessionId, storyUrl, loadStory]);

  if (!isLoggedIn) {
    // In normal flow, they log in on LandingPage. If they get here unauthenticated, redirect home.
    window.location.href = '/';
    return null;
  }

  if (isLoggedIn && role === 'admin') {
    return (
      <div className="login-gate-overlay">
        <div className="login-card">
          <div className="login-icon">🔬</div>
          <h2>Researcher Account Active</h2>
          <p className="login-subtitle">
            You are logged in as a researcher (<strong>{user?.email}</strong>). Please access the Researcher Console.
          </p>
          <a href="/researcher" className="login-btn" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
            Go to Researcher Console →
          </a>
        </div>
      </div>
    );
  }

  const beginExperience = () => {
    setPhase('experience');
    // Logging moved to handleStartSession
  };

  const onExperienceComplete = useCallback(() => {
    eventLogger.log('VIDEO_COMPLETE', { action: 'experience_end' });
    setPhase('assessment');
  }, []);

  const onAssessmentComplete = useCallback(async (results) => {
    eventLogger.log('VIDEO_EXIT', { action: 'session_complete' });
    const existingSessions = await eventLogger.getAllSessions();
    const existingSession = existingSessions.find(s => s.session_id === sessionId);
    await eventLogger.saveSession({
      ...existingSession,
      session_id: sessionId,
      participant_id: participantId,
      condition,
      story_id: storyUrl,
      status: 'complete',
      end_time: new Date().toISOString()
    });
    await eventLogger.endSession();
    setPhase('complete');
  }, [sessionId, participantId, condition, storyUrl]);

  // Render the correct player for the condition
  const renderPlayer = () => {
    if (!storyConfig) return <div className="loading-state">Loading story…</div>;

    switch (condition) {
      case 'C1': return <SimpleVideoPlayer storyConfig={storyConfig} onComplete={onExperienceComplete} />;
      case 'C2': return <SpatialAudioPlayer storyConfig={storyConfig} onComplete={onExperienceComplete} />;
      case 'C3': return <InteractivePlayer storyConfig={storyConfig} onComplete={onExperienceComplete} />;
      case 'C4': return <VRPlayer storyConfig={storyConfig} onComplete={onExperienceComplete} />;
      default: return <SimpleVideoPlayer storyConfig={storyConfig} onComplete={onExperienceComplete} />;
    }
  };

  return (
    <div className="participant-flow">
      {phase === 'instructions' && (
        <OnboardingDemo
          onComplete={() => setPhase('setup')}
        />
      )}

      {phase === 'setup' && (
        <div className="signup-modal-overlay">
          <div className="signup-modal-card">
            <div className="signup-modal-header">
              <div className="modal-icon">⚙️</div>
              <h2>Select Modality & Story</h2>
              <p>Configure the experience parameters below to begin.</p>
            </div>

            <form onSubmit={handleStartSession} className="signup-form">
              <div className="form-group">
                <label>Select Study Story</label>
                <select value={storyUrl} onChange={(e) => setStoryUrl(e.target.value)}>
                  {availableStories.map(s => (
                    <option key={s.id} value={s.path}>{s.title}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Assigned Condition</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)}>
                  <option value="C1">C1 – Simple Video</option>
                  <option value="C2">C2 – Spatial Audio</option>
                  <option value="C3">C3 – Interactive</option>
                  <option value="C4">C4 – VR Immersive</option>
                </select>
              </div>

              <button type="submit" className="submit-btn">
                🚀 Launch Study Session
              </button>
            </form>
          </div>
        </div>
      )}

      {phase === 'experience' && (
        <div className="experience-screen">
          {renderPlayer()}
          <button className="skip-btn" onClick={onExperienceComplete}>
            Skip to Assessment ⏭
          </button>
        </div>
      )}

      {phase === 'assessment' && storyConfig && (
        <div className="assessment-screen">
          <AssessmentEngine
            assessment={storyConfig.assessment}
            sessionId={sessionId}
            participantId={participantId}
            condition={condition}
            storyId={storyConfig.story_id}
            onComplete={onAssessmentComplete}
          />
        </div>
      )}

      {phase === 'complete' && (
        <div className="complete-screen">
          <div className="complete-card">
            <div className="complete-icon">✅</div>
            <h2>Session Complete</h2>
            <p>Thank you for participating in this study!</p>
            <p className="session-info">
              Participant ID: <code>{participantId}</code> • Condition: {condition}
            </p>
            <p className="complete-note">Your responses have been saved to the research database. You may now close this window.</p>
          </div>
        </div>
      )}
    </div>
  );
}
