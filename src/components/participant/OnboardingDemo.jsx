// OnboardingDemo.jsx — Config-driven guided onboarding walkthrough & modality-specific mini demo
import React, { useState, useRef, useEffect } from 'react';
import { spatialAudio } from '../../services/SpatialAudioEngine';
import { audioSynth } from '../../services/AudioSynthesizer';
import './OnboardingDemo.css';

export default function OnboardingDemo({ condition = 'C1', storyConfig, onComplete }) {
  const [step, setStep] = useState('general'); // 'general' | 'demo'
  const [demoCompleted, setDemoCompleted] = useState(false);
  const [practiceProgress, setPracticeProgress] = useState(0);
  const [practiceSuccess, setPracticeSuccess] = useState(false);

  // Audio test state for C2
  const [panningActive, setPanningActive] = useState(false);
  const panningTimer = useRef(null);

  // VR gaze state for C4
  const [gazeProgress, setGazeProgress] = useState(0);
  const gazeTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (panningTimer.current) clearInterval(panningTimer.current);
      if (gazeTimer.current) clearInterval(gazeTimer.current);
      audioSynth.stop();
    };
  }, []);

  const handleStartDemo = async () => {
    setStep('demo');
    if (condition === 'C2') {
      // Start spatial audio panning test
      await spatialAudio.init();
      await spatialAudio.resume();
      await audioSynth.start(true);
      startSpatialAudioDemo();
    } else if (condition === 'C1') {
      await audioSynth.start(false);
    }
  };

  /** C2 Spatial Audio Panning Practice Demo */
  const startSpatialAudioDemo = () => {
    setPanningActive(true);
    let angle = 0;
    panningTimer.current = setInterval(() => {
      angle += 0.08;
      const x = Math.sin(angle) * 5;
      const z = -3 + Math.cos(angle) * 2;
      audioSynth.setSpatialPosition(x, 0, z);
    }, 50);
  };

  /** C3 Practice Verb Interaction */
  const handlePracticeInteraction = () => {
    setPracticeProgress(prev => {
      const next = prev + 35;
      audioSynth.playSFX('slice');
      if (next >= 100) {
        setPracticeSuccess(true);
        setDemoCompleted(true);
        audioSynth.playSFX('success');
        return 100;
      }
      return next;
    });
  };

  /** C4 Practice VR Gaze Dwell */
  const handleGazeStart = () => {
    let p = 0;
    gazeTimer.current = setInterval(() => {
      p += 10;
      setGazeProgress(p);
      if (p >= 100) {
        clearInterval(gazeTimer.current);
        setPracticeSuccess(true);
        setDemoCompleted(true);
        audioSynth.playSFX('select');
      }
    }, 150);
  };

  const handleGazeEnd = () => {
    if (gazeTimer.current) clearInterval(gazeTimer.current);
    if (!practiceSuccess) setGazeProgress(0);
  };

  // Video canvas animation for C1
  const videoCanvasRef = useRef(null);
  const videoAnimRef = useRef(null);

  useEffect(() => {
    if (step === 'demo' && condition === 'C1') {
      const canvas = videoCanvasRef.current;
      if (!canvas) return;
      canvas.width = 480;
      canvas.height = 270;
      const ctx = canvas.getContext('2d');
      let t = 0;

      const render = () => {
        t += 0.03;
        // Background gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, '#0a192f');
        bgGrad.addColorStop(1, '#1e3a8a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Animated Sun
        const sx = canvas.width * 0.8;
        const sy = canvas.height * 0.25;
        const sGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 45);
        sGrad.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
        sGrad.addColorStop(0.6, 'rgba(255, 140, 0, 0.5)');
        sGrad.addColorStop(1, 'rgba(255, 140, 0, 0)');
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, 45, 0, Math.PI * 2);
        ctx.fill();

        // Water Waves
        ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.7);
        for (let x = 0; x <= canvas.width; x += 10) {
          ctx.lineTo(x, canvas.height * 0.7 + Math.sin(x * 0.03 + t * 2) * 6);
        }
        ctx.lineTo(canvas.width, canvas.height);
        ctx.lineTo(0, canvas.height);
        ctx.fill();

        // Floating Water Droplet (Sample Video Object)
        const dx = canvas.width * 0.4 + Math.sin(t) * 40;
        const dy = canvas.height * 0.5 + Math.cos(t * 1.5) * 15;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(dx, dy, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(dx - 4, dy - 4, 4, 0, Math.PI * 2);
        ctx.fill();

        // Overlay Badge
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(10, 10, 210, 26);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.fillText('🎥 Sample Video Preview Active', 18, 27);

        videoAnimRef.current = requestAnimationFrame(render);
      };

      render();

      return () => {
        if (videoAnimRef.current) cancelAnimationFrame(videoAnimRef.current);
      };
    }
  }, [step, condition]);

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <span className="condition-chip-large">{condition} Condition</span>
          <h2>Study Onboarding & Practice Demo</h2>
        </div>

        {step === 'general' ? (
          <div className="onboarding-body">
            <p className="intro-lead">
              Welcome to the study! You will experience an educational story, followed by a 3-level learning assessment.
            </p>

            <div className="instruction-box">
              <h3>📋 What to Expect:</h3>
              <ul>
                <li><strong>Watch & Listen:</strong> Pay close attention to the story events and key concepts.</li>
                <li><strong>Interactive Moments:</strong> At specific moments during the story, you may be asked to interact with on-screen objects.</li>
                <li><strong>Assessment:</strong> After the story finishes, you will answer questions evaluating Recall, Application, and Implementation.</li>
              </ul>
            </div>

            <button className="primary-demo-btn" onClick={handleStartDemo}>
              ▶ Proceed to Modality Practice Demo
            </button>
          </div>
        ) : (
          <div className="onboarding-body">
            <h3>Practice Demo — {condition === 'C1' ? 'Simple Video' : condition === 'C2' ? '3D Spatial Audio' : condition === 'C3' ? 'Interactive Actions' : 'VR 360° Immersion'}</h3>
            <p className="demo-desc">
              {condition === 'C1' && 'Watch the sample video preview canvas and listen to the audio stream below to confirm your display and sound are clear.'}
              {condition === 'C2' && 'Listen as the sound source moves in 3D space around your ears. Notice how the sound direction changes.'}
              {condition === 'C3' && 'Practice performing an interactive action on the dummy object below before starting the real story.'}
              {condition === 'C4' && 'Practice gazing at the dummy 3D hotspot target below to activate it.'}
            </p>

            {/* C1 Simple Video Practice */}
            {condition === 'C1' && (
              <div className="demo-stage">
                <div className="demo-video-box">
                  <canvas ref={videoCanvasRef} className="demo-video-canvas" />
                </div>
                <div className="demo-audio-visualizer compact">
                  <span className="demo-icon">🎧</span>
                  <p>Audio Stream Active</p>
                </div>
                <button
                  className="demo-action-btn"
                  onClick={() => {
                    setDemoCompleted(true);
                    setPracticeSuccess(true);
                    audioSynth.playSFX('success');
                  }}
                >
                  ✓ Confirm Audio & Video are Clear
                </button>
              </div>
            )}

            {/* C2 3D Spatial Audio Practice */}
            {condition === 'C2' && (
              <div className="demo-stage">
                <div className="demo-audio-visualizer">
                  <div className="sound-pulse" style={{ opacity: panningActive ? 0.9 : 0.4 }} />
                  <span className="demo-icon">🎧</span>
                  <p>3D Spatial Audio Stream Active</p>
                </div>
                <button
                  className="demo-action-btn"
                  onClick={() => {
                    setDemoCompleted(true);
                    setPracticeSuccess(true);
                    audioSynth.playSFX('success');
                  }}
                >
                  ✓ Confirm Spatial Audio is Clear
                </button>
              </div>
            )}

            {/* C3 Interactive Practice */}
            {condition === 'C3' && (
              <div className="demo-stage">
                <div className="practice-target-box">
                  <div
                    className="practice-target"
                    onClick={handlePracticeInteraction}
                    style={{ transform: `scale(${1 + practiceProgress * 0.003})` }}
                  >
                    ⚡ Click / Swipe to Charge Energy!
                  </div>
                  <div className="practice-progress-bar">
                    <div className="fill" style={{ width: `${practiceProgress}%` }} />
                  </div>
                </div>
                {practiceSuccess && (
                  <div className="practice-success-msg">
                    🎉 Excellent! That's how interactions will work during the story.
                  </div>
                )}
              </div>
            )}

            {/* C4 VR Practice */}
            {condition === 'C4' && (
              <div className="demo-stage">
                <div
                  className="vr-practice-hotspot"
                  onMouseEnter={handleGazeStart}
                  onMouseLeave={handleGazeEnd}
                >
                  <div className="reticle-ring">
                    <div className="reticle-fill" style={{ height: `${gazeProgress}%` }} />
                  </div>
                  <span>Gaze Dwell Here (1.5s)</span>
                </div>
                {practiceSuccess && (
                  <div className="practice-success-msg">
                    👁️ Target Activated! You are ready for VR immersion.
                  </div>
                )}
              </div>
            )}

            <button
              className="begin-experience-btn"
              disabled={!demoCompleted}
              onClick={() => {
                audioSynth.stop();
                onComplete();
              }}
            >
              {demoCompleted ? '🚀 Begin Full Story Experience' : 'Complete Practice Above to Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
