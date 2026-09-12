import React, { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { eventLogger } from '../../services/EventLogger';
import { sessionClock } from '../../services/SessionClock';
import { loadStoryConfig, CONDITIONS } from '../../services/StoryLoader';
import { useAuth } from '../../context/AuthContext';
import SimpleVideoPlayer from '../player/SimpleVideoPlayer';
import SpatialAudioPlayer from '../player/SpatialAudioPlayer';
import InteractivePlayer from '../player/InteractivePlayer';
import VRPlayer from '../player/VRPlayer';
import AssessmentEngine from '../assessment/AssessmentEngine';
import ParticipantSignupModal from './ParticipantSignupModal';
import OnboardingDemo from './OnboardingDemo';
import './ParticipantFlow.css';


const PHASES = ['setup', 'instructions', 'experience', 'assessment', 'complete'];

export default function ParticipantFlow() {
  const { user, isLoggedIn, role } = useAuth();
  const [phase, setPhase] = useState('setup');
  const [participantId, setParticipantId] = useState('');
  const [participantIdentity, setParticipantIdentity] = useState(null);
  const [sessionId] = useState(() => uuidv4());
  const [condition, setCondition] = useState('C1');
  const [storyUrl, setStoryUrl] = useState('/stories/water_cycle_v1.json');
  const [storyConfig, setStoryConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initializedFromAuth, setInitializedFromAuth] = useState(false);

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

  /** Triggered when Participant completes OTP Signup */
  const handleSignupComplete = useCallback(async (signupData) => {
    const pid = signupData.participant_id;
    const cond = signupData.condition || condition;
    setParticipantId(pid);
    setParticipantIdentity(signupData.identity);
    setCondition(cond);

    await eventLogger.init();
    await loadStory();
    eventLogger.startSession(pid, sessionId, cond);
    sessionClock.start();
    eventLogger.log('VIDEO_START', { action: 'session_begin' });

    const loadedConfig = await loadStoryConfig(storyUrl);
    const versionSnapshot = {
      study_id: loadedConfig.story_id + '_study',
      study_version: loadedConfig.version || '1.0',
      story_id: loadedConfig.story_id,
      story_version: loadedConfig.version || '1.0',
      condition: cond,
      condition_config_version: '1.0',
      segment_layout_hash: computeSegmentLayoutHash(loadedConfig.segments),
    };

    const sessionPayload = {
      session_id: sessionId,
      participant_id: pid,
      participant_name: signupData.identity?.name || '',
      participant_email: signupData.identity?.email || '',
      participant_age: signupData.identity?.age_group || '',
      condition: cond,
      story_id: storyUrl,
      start_time: new Date().toISOString(),
      status: 'in_progress',
      version_snapshot: versionSnapshot,
    };

    // Save locally to IndexedDB & sync to central backend DB
    await eventLogger.saveSession(sessionPayload);

    setPhase('instructions');
  }, [sessionId, condition, storyUrl, loadStory]);

  // Auto-skip signup modal if already logged in via AuthContext
  useEffect(() => {
    if (isLoggedIn && user && role === 'participant' && !initializedFromAuth) {
      setInitializedFromAuth(true);
      const pid = user.participant_id || `P_${user.name || 'user'}`;
      const cond = user.condition || condition;
      handleSignupComplete({
        participant_id: pid,
        condition: cond,
        identity: {
          name: user.name,
          email: user.email,
          age_group: user.age_group,
          condition: cond,
        }
      });
    }
  }, [isLoggedIn, user, role, initializedFromAuth, condition, handleSignupComplete]);

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
    eventLogger.log('VIDEO_START', { action: 'experience_begin' });
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
      {phase === 'setup' && (
        <ParticipantSignupModal
          sessionId={sessionId}
          initialCondition={condition}
          onComplete={handleSignupComplete}
        />
      )}

      {phase === 'instructions' && (
        <OnboardingDemo
          condition={condition}
          storyConfig={storyConfig}
          onComplete={beginExperience}
        />
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
