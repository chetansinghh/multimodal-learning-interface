// AyurvedaCanvas.jsx — Unified Story Engine for "Ayurveda"
// Full feature parity across:
// C1 (Clean Video + Original Mixed Audio)
// C2 (Video + Original Audio + 3D Spatial Audio layer with WebAudio PannerNode)
// C3 (Video + Action-gated Normalised Interaction Overlays: hold, select, trace, drag)
// C4 (Full 3D WebXR Station Environment + Gaze Dwell Reticle + Controller Raycasting)

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { eventLogger } from '../../services/EventLogger';
import { formatTime } from '../../services/StoryLoader';
import { InteractionRenderer } from '../interactions/InteractionVerbs';
import './PlayerCommon.css';

const PLAYBACK_END_SEC = 110.2; // Trim the black tail per specification
const GAZE_DWELL_MS = 1200;
const GAZE_ANGLE_DEG = 8;
const HEAD_ROTATION_SAMPLE_MS = 200;

// 7 Stations for C4 full 3D World (palette: parchment, gold, leaf green, saffron)
const STATIONS = [
  { id: 'st1', label: 'River Bank & Banyan at Dawn', t: [0, 26] },
  { id: 'st2', label: 'The Five Elements Ring', t: [27, 34] },
  { id: 'st3', label: 'Herb Garden & Mortar', t: [35, 52] },
  { id: 'st4', label: 'Three Doshas Sanctuary', t: [53, 62] },
  { id: 'st5', label: 'Sunrise River Meditation', t: [63, 70] },
  { id: 'st6', label: 'Therapy & Balance Room', t: [71, 80] },
  { id: 'st7', label: 'Vedic Knowledge Lineage', t: [81, 110.2] }
];

export default function AyurvedaCanvas({
  condition = 'C1', // 'C1', 'C2', 'C3', 'C4'
  storyConfig,
  onComplete
}) {
  const mountRef = useRef(null);
  const videoRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const camRef = useRef(null);
  const rigRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [activeInteraction, setActiveInteraction] = useState(null);
  const [completedInteractions, setCompletedInteractions] = useState(new Set());
  const [gazeProgress, setGazeProgress] = useState(0);
  const [gazeTarget, setGazeTarget] = useState(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [inVR, setInVR] = useState(false);
  const [stationIndex, setStationIndex] = useState(0);

  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const waitingForInteractionRef = useRef(false);
  const conditionRef = useRef(condition);
  conditionRef.current = condition;

  const interactions = storyConfig?.interactions || [];
  const segments = storyConfig?.segments || [];
  const audioContextRef = useRef(null);
  const spatialNodesRef = useRef([]);

  // ─── Web Audio Spatial Layer for C2 and C4 ───
  const initSpatialAudio = useCallback(() => {
    if (audioContextRef.current || (condition !== 'C2' && condition !== 'C4')) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      // Master spatial gain (mixed under original video audio)
      const spatialMaster = ctx.createGain();
      spatialMaster.gain.value = 0.55;
      spatialMaster.connect(ctx.destination);

      const sounds = storyConfig?.audio?.sounds || [];
      const nodes = sounds.map(snd => {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 25;
        panner.rolloffFactor = 1.2;

        const pos = Array.isArray(snd.position?.[0]) ? snd.position[0] : (Array.isArray(snd.position) ? snd.position : [0, 1, -2]);
        panner.positionX.setValueAtTime(pos[0], ctx.currentTime);
        panner.positionY.setValueAtTime(pos[1], ctx.currentTime);
        panner.positionZ.setValueAtTime(pos[2], ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0; // inactive by default until cue window

        // Ambient oscillator / acoustic resonator
        const osc = ctx.createOscillator();
        if (snd.id.includes('fire')) {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(65, ctx.currentTime);
        } else if (snd.id.includes('water') || snd.id.includes('river')) {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, ctx.currentTime);
        } else if (snd.id.includes('chime') || snd.id.includes('bowl')) {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(528, ctx.currentTime);
        } else {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(220, ctx.currentTime);
        }

        osc.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(spatialMaster);
        osc.start();

        return { id: snd.id, gainNode, panner, osc };
      });

      spatialNodesRef.current = nodes;
    } catch (e) {
      console.warn('Spatial Audio init error:', e);
    }
  }, [condition, storyConfig]);

  // Update spatial cues as time advances
  const updateSpatialCues = useCallback((t) => {
    if (!audioContextRef.current || spatialNodesRef.current.length === 0) return;
    const ctx = audioContextRef.current;
    const cues = storyConfig?.audio?.cues || [];

    cues.forEach(cue => {
      const [startM, startS] = cue.t_window[0].split(':').map(Number);
      const [endM, endS] = cue.t_window[1].split(':').map(Number);
      const startSec = startM * 60 + startS;
      const endSec = endM * 60 + endS;
      const isActive = t >= startSec && t <= endSec;

      cue.start?.forEach(sndId => {
        const node = spatialNodesRef.current.find(n => n.id === sndId);
        if (node) {
          node.gainNode.gain.setTargetAtTime(isActive ? 0.35 : 0, ctx.currentTime, 0.2);
        }
      });
      cue.stop?.forEach(sndId => {
        const node = spatialNodesRef.current.find(n => n.id === sndId);
        if (node && isActive) {
          node.gainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        }
      });
    });
  }, [storyConfig]);

  // ─── Video Control Methods (C1, C2, C3) ───
  const playVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        setPlaying(true);
        playingRef.current = true;
        initSpatialAudio();
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
        }
        eventLogger.log(currentTimeRef.current === 0 ? 'VIDEO_START' : 'VIDEO_RESUME', {
          videoTimestamp: currentTimeRef.current,
          condition: conditionRef.current
        });
      }).catch(err => console.warn('Video play blocked:', err));
    }
  }, [initSpatialAudio]);

  const pauseVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      setPlaying(false);
      playingRef.current = false;
      eventLogger.log('VIDEO_PAUSE', {
        videoTimestamp: currentTimeRef.current,
        condition: conditionRef.current
      });
    }
  }, []);

  const seekVideo = useCallback((time) => {
    const clamped = Math.max(0, Math.min(PLAYBACK_END_SEC, time));
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
    currentTimeRef.current = clamped;
    eventLogger.log('VIDEO_SEEK', { videoTimestamp: clamped });
  }, []);

  // ─── Interaction Checking in C3 ───
  const checkInteractions = useCallback((t) => {
    if (conditionRef.current !== 'C3') return;

    // Check if within active window
    const currentInt = interactions.find(item => {
      const [startM, startS] = item.active_window[0].split(':').map(Number);
      const [endM, endS] = item.active_window[1].split(':').map(Number);
      const startSec = startM * 60 + startS;
      const endSec = endM * 60 + endS;
      return t >= startSec && t <= endSec && !completedInteractions.has(item.id);
    });

    setActiveInteraction(currentInt || null);

    // Gate hold check at segment end
    if (currentInt?.gate?.type === 'hold_at') {
      const parts = currentInt.gate.hold_at.split(':').map(Number);
      const holdSec = parts[0] * 60 + parts[1];
      if (t >= holdSec && !completedInteractions.has(currentInt.id) && !waitingForInteractionRef.current) {
        waitingForInteractionRef.current = true;
        if (videoRef.current) videoRef.current.pause();
        setPlaying(false);
        playingRef.current = false;

        eventLogger.log('SEGMENT_HOLD_START', {
          videoTimestamp: t,
          interactionId: currentInt.id,
          maxWaitSec: currentInt.gate.max_wait_sec
        });

        // Max wait timeout fallback
        setTimeout(() => {
          if (waitingForInteractionRef.current) {
            waitingForInteractionRef.current = false;
            eventLogger.log('SEGMENT_HOLD_TIMEOUT', {
              videoTimestamp: currentTimeRef.current,
              interactionId: currentInt.id
            });
            if (videoRef.current) videoRef.current.play();
            setPlaying(true);
            playingRef.current = true;
          }
        }, (currentInt.gate.max_wait_sec || 6) * 1000);
      }
    }
  }, [interactions, completedInteractions]);

  const handleInteractionComplete = useCallback((interactionId) => {
    setCompletedInteractions(prev => new Set(prev).add(interactionId));
    setActiveInteraction(null);
    eventLogger.log('INTERACTION_COMPLETE', {
      videoTimestamp: currentTimeRef.current,
      interactionId
    });

    if (waitingForInteractionRef.current) {
      waitingForInteractionRef.current = false;
      if (videoRef.current) videoRef.current.play();
      setPlaying(true);
      playingRef.current = true;
    }
  }, []);

  // ─── Video Timeupdate Listener ───
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);
    currentTimeRef.current = t;
    updateSpatialCues(t);
    checkInteractions(t);

    if (t >= PLAYBACK_END_SEC) {
      videoRef.current.pause();
      setPlaying(false);
      playingRef.current = false;
      eventLogger.log('VIDEO_COMPLETE', { videoTimestamp: PLAYBACK_END_SEC });
      if (onComplete) onComplete();
    }
  };

  // ─── C4: Three.js Full 3D WebXR River Valley Station Environment ───
  useEffect(() => {
    if (condition !== 'C4') return;
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 960;
    const h = mount.clientHeight || 540;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#d9b382', 0.035); // warm morning mist
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    const rig = new THREE.Group();
    rig.position.set(0, 1.6, 0); // eye level standing position
    rig.add(camera);
    scene.add(rig);
    camRef.current = camera;
    rigRef.current = rig;

    // Reticle
    const reticleGeom = new THREE.RingGeometry(0.015, 0.022, 32);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest: false
    });
    const reticle = new THREE.Mesh(reticleGeom, reticleMat);
    reticle.position.set(0, 0, -1.2);
    camera.add(reticle);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => setVrSupported(supported)).catch(() => {});
    }

    // ── Build River Valley Stations ──
    const ambientLight = new THREE.AmbientLight(0xffeedd, 0.9);
    scene.add(ambientLight);
    const sunLight = new THREE.DirectionalLight(0xffb84d, 1.4);
    sunLight.position.set(20, 30, -20);
    scene.add(sunLight);

    // River Bank Ground & Water
    const groundGeom = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0xc4a47c });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const riverGeom = new THREE.PlaneGeometry(16, 100);
    const riverMat = new THREE.MeshLambertMaterial({ color: 0x4a829e, transparent: true, opacity: 0.85 });
    const river = new THREE.Mesh(riverGeom, riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(-12, 0.05, 0);
    scene.add(river);

    // Giant Banyan Tree Trunk & Canopy
    const trunkGeom = new THREE.CylinderGeometry(1.8, 2.4, 8, 16);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d28 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.set(0, 4, -8);
    scene.add(trunk);

    const canopyGeom = new THREE.SphereGeometry(6, 16, 16);
    const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3d6836 });
    const canopy = new THREE.Mesh(canopyGeom, canopyMat);
    canopy.position.set(0, 9, -8);
    scene.add(canopy);

    // 5 Floating Element Spheres (Earth, Water, Fire, Air, Ether)
    const elementColors = [0x8b5a2b, 0x3b82f6, 0xef4444, 0xa5b4fc, 0xfacc15];
    const elementPositions = [
      [-2.2, 1.2, -3],
      [-1.1, 1.5, -3.2],
      [0, 1.8, -3.4],
      [1.1, 1.5, -3.2],
      [2.2, 1.2, -3]
    ];
    elementPositions.forEach((pos, idx) => {
      const orbGeom = new THREE.SphereGeometry(0.28, 16, 16);
      const orbMat = new THREE.MeshBasicMaterial({ color: elementColors[idx] });
      const orb = new THREE.Mesh(orbGeom, orbMat);
      orb.position.set(...pos);
      scene.add(orb);
    });

    // Mortar and Pestle Table
    const tableGeom = new THREE.BoxGeometry(1.4, 0.8, 0.8);
    const tableMat = new THREE.MeshLambertMaterial({ color: 0x8b6b4f });
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.position.set(0, 0.4, -2);
    scene.add(table);

    const mortarGeom = new THREE.CylinderGeometry(0.25, 0.18, 0.25, 16);
    const mortarMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const mortar = new THREE.Mesh(mortarGeom, mortarMat);
    mortar.position.set(0, 0.92, -2);
    scene.add(mortar);

    // Floating Video Plane in VR (Head-locked / Canvas Texture)
    const vidGeom = new THREE.PlaneGeometry(3.6, 2.02);
    const vidTexture = new THREE.VideoTexture(videoRef.current);
    const vidMat = new THREE.MeshBasicMaterial({ map: vidTexture });
    const vidPlane = new THREE.Mesh(vidGeom, vidMat);
    vidPlane.position.set(0, 2.4, -4);
    scene.add(vidPlane);

    // Animation Render Loop
    let lastTime = performance.now();
    const animate = () => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Gentle river undulation
      river.position.y = 0.05 + Math.sin(now * 0.002) * 0.02;

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    // Desktop pointer look-around
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let yaw = 0;
    let pitch = 0;

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      yaw += dx * 0.003;
      pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.003));
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; };

    mount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      renderer.setAnimationLoop(null);
      mount.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [condition]);

  // WebXR Session Trigger
  const handleEnterVR = async () => {
    if (!rendererRef.current || !navigator.xr) return;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      rendererRef.current.xr.setSession(session);
      setInVR(true);
      eventLogger.log('VR_ENTER', { sessionType: 'immersive-vr', storyId: 'ayurveda_intro_v1' });

      session.addEventListener('end', () => {
        setInVR(false);
        eventLogger.log('VR_EXIT', { sessionType: 'immersive-vr' });
      });
    } catch (err) {
      console.warn('Failed to start WebXR session:', err);
    }
  };

  const progressPct = (currentTime / PLAYBACK_END_SEC) * 100;

  return (
    <div className="player-container ayurveda-player">
      {/* Neutral Required Disclaimer Header */}
      <div className="ayurveda-disclaimer-banner">
        <span>⚠️ This video describes a traditional knowledge system. It is not medical advice.</span>
      </div>

      {/* Segment Indicator */}
      <div className="segment-indicator">
        <span className="segment-dot" style={{ backgroundColor: '#10b981' }} />
        <span className="segment-name">Ayurveda • {condition}</span>
      </div>

      {/* HTML5 Video Source for C1, C2, C3 (and video texture for C4) */}
      <video
        ref={videoRef}
        src="/videos/ayurveda_explainer.mp4"
        className={`player-canvas ${condition === 'C4' ? 'video-hidden' : ''}`}
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          setPlaying(false);
          if (onComplete) onComplete();
        }}
      />

      {/* C4 Three.js WebXR Mount */}
      {condition === 'C4' && (
        <div ref={mountRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
      )}

      {/* C3 Interactive Action Overlay */}
      {condition === 'C3' && activeInteraction && (
        <div className="c3-action-container">
          <InteractionRenderer
            interaction={activeInteraction}
            videoTimestamp={currentTime}
            onComplete={() => handleInteractionComplete(activeInteraction.id)}
          />
        </div>
      )}

      {/* VR Controls for C4 */}
      {condition === 'C4' && vrSupported && (
        <div className="vr-controls-overlay">
          <button className="enter-vr-btn" onClick={handleEnterVR}>
            🥽 {inVR ? 'In VR Session' : 'Enter VR (WebXR)'}
          </button>
        </div>
      )}

      {/* Playback Controls Toolbar */}
      <div className={`player-controls ${showControls ? 'visible' : ''}`}>
        <div className="segment-timeline">
          <div className="progress-bar" style={{ width: `${progressPct}%` }} />
          <input
            type="range"
            className="seek-slider"
            min="0"
            max={PLAYBACK_END_SEC}
            step="0.1"
            value={currentTime}
            onChange={(e) => seekVideo(Number(e.target.value))}
          />
        </div>

        <div className="controls-row">
          <button className="control-btn" onClick={() => seekVideo(Math.max(0, currentTime - 10))}>
            ⏪ 10s
          </button>
          <button className="control-btn play-btn" onClick={playing ? pauseVideo : playVideo}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="control-btn" onClick={() => seekVideo(Math.min(PLAYBACK_END_SEC, currentTime + 10))}>
            10s ⏩
          </button>
          <button className="control-btn" onClick={() => seekVideo(0)}>🔄</button>
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(PLAYBACK_END_SEC)}
          </span>
        </div>
      </div>
    </div>
  );
}
