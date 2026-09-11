// C4 – VR Immersive Player
// 360° equirectangular sphere + gaze-dwell hotspot interaction + spatial audio.
// Uses Three.js directly (not R3F) for WebXR compatibility.
// Falls back to mouse/touch 360° look on desktop/mobile.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { eventLogger } from '../../services/EventLogger';
import { getCurrentSegment, getSegmentHotspots, getVRSegmentConfig, parseTime, formatTime } from '../../services/StoryLoader';
import { audioSynth } from '../../services/AudioSynthesizer';
import { spatialAudio } from '../../services/SpatialAudioEngine';
import './PlayerCommon.css';

const GAZE_DWELL_MS = 1500;
const HEAD_ROTATION_SAMPLE_MS = 200;

export default function VRPlayer({ storyConfig, onComplete }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [gazeTarget, setGazeTarget] = useState(null);
  const [gazeProgress, setGazeProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [infoPanel, setInfoPanel] = useState(null);
  const [hoveredHotspot, setHoveredHotspot] = useState(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [inVR, setInVR] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const controlsTimeout = useRef(null);
  const currentTimeRef = useRef(0);
  const playIntervalRef = useRef(null);

  // Mouse look state
  const isDown = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const rotation = useRef({ lon: 0, lat: 0 });

  // Gaze tracking
  const gazeStartTime = useRef(null);
  const gazeTargetId = useRef(null);
  const lastHeadSample = useRef(0);

  // Hotspot meshes
  const hotspotMeshes = useRef([]);

  const segments = storyConfig.segments || [];
  const vrScene = storyConfig.vr_scene || {};
  const totalDuration = storyConfig.duration_sec || 600;

  // ─── Three.js Setup ────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Check WebXR support
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        setVrSupported(supported);
      }).catch(() => {});
    }

    // 360 sphere (procedural gradient for now — would be equirectangular texture from config)
    createEnvironmentSphere(scene, 0);

    // Gaze reticle (center of view)
    const reticleGeom = new THREE.RingGeometry(0.015, 0.02, 32);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    const reticle = new THREE.Mesh(reticleGeom, reticleMat);
    reticle.position.set(0, 0, -1);
    camera.add(reticle);
    scene.add(camera);

    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Animation loop
    const clock = new THREE.Clock();
    const animate = () => {
      const t = currentTimeRef.current;
      const seg = getCurrentSegment(segments, t);

      // Update camera from mouse rotation & update 3D spatial audio orientation
      if (!inVR) {
        const phi = THREE.MathUtils.degToRad(90 - rotation.current.lat);
        const theta = THREE.MathUtils.degToRad(rotation.current.lon);
        const targetDir = new THREE.Vector3(
          500 * Math.sin(phi) * Math.cos(theta),
          500 * Math.cos(phi),
          500 * Math.sin(phi) * Math.sin(theta)
        );
        camera.lookAt(targetDir);

        const dirNorm = targetDir.clone().normalize();
        spatialAudio.updateListenerOrientation(
          { x: dirNorm.x, y: dirNorm.y, z: dirNorm.z },
          { x: 0, y: 1, z: 0 }
        );
      }

      // Log HEAD_ROTATION at sample rate
      const now = performance.now();
      if (now - lastHeadSample.current > HEAD_ROTATION_SAMPLE_MS && playing) {
        lastHeadSample.current = now;
        eventLogger.log('HEAD_ROTATION', {
          videoTimestamp: t,
          extra: {
            lon: rotation.current.lon.toFixed(1),
            lat: rotation.current.lat.toFixed(1)
          }
        });
      }

      // Gaze raycasting
      checkGazeIntersection(camera, scene);

      // Update environment colors per segment
      updateEnvironment(scene, seg, t);

      // Animate hotspots
      hotspotMeshes.current.forEach(m => {
        if (m.userData.pulse) {
          const scale = 1 + Math.sin(clock.getElapsedTime() * 3 + m.userData.index) * 0.15;
          m.scale.setScalar(scale);
        }
      });

      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);

    // Handle resize
    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Mouse/touch controls for 360 look
    const onPointerDown = (e) => {
      isDown.current = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      prevMouse.current = { x: clientX, y: clientY };
    };
    const onPointerMove = (e) => {
      if (!isDown.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      rotation.current.lon -= (clientX - prevMouse.current.x) * 0.2;
      rotation.current.lat += (clientY - prevMouse.current.y) * 0.2;
      rotation.current.lat = Math.max(-85, Math.min(85, rotation.current.lat));
      prevMouse.current = { x: clientX, y: clientY };
    };
    const onPointerUp = () => { isDown.current = false; };

    mount.addEventListener('mousedown', onPointerDown);
    mount.addEventListener('mousemove', onPointerMove);
    mount.addEventListener('mouseup', onPointerUp);
    mount.addEventListener('touchstart', onPointerDown);
    mount.addEventListener('touchmove', onPointerMove);
    mount.addEventListener('touchend', onPointerUp);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', handleResize);
      mount.removeEventListener('mousedown', onPointerDown);
      mount.removeEventListener('mousemove', onPointerMove);
      mount.removeEventListener('mouseup', onPointerUp);
      mount.removeEventListener('touchstart', onPointerDown);
      mount.removeEventListener('touchmove', onPointerMove);
      mount.removeEventListener('touchend', onPointerUp);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      audioSynth.stop();
    };
  }, []);

  // ─── Create/update hotspots when segment changes ────
  useEffect(() => {
    if (!sceneRef.current || !currentSegment) return;
    const scene = sceneRef.current;

    // Remove old hotspots
    hotspotMeshes.current.forEach(m => scene.remove(m));
    hotspotMeshes.current = [];

    // Add hotspots for current segment
    const hotspots = getSegmentHotspots(vrScene, currentSegment.id);
    hotspots.forEach((hs, i) => {
      const geom = new THREE.SphereGeometry(0.3, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: hs.action === 'VR_INTERACTION' ? 0x4ECDC4 : 0xFFD93D,
        transparent: true,
        opacity: 0.6,
        wireframe: true,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(...(hs.position || [0, 0, -5]));
      mesh.userData = { hotspotId: hs.id, label: hs.label, info: hs.info, action: hs.action, pulse: true, index: i };
      scene.add(mesh);
      hotspotMeshes.current.push(mesh);
    });
  }, [currentSegment, vrScene]);

  // ─── Gaze intersection check ────
  const checkGazeIntersection = (camera, scene) => {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(hotspotMeshes.current);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const hsId = hit.userData.hotspotId;

      if (gazeTargetId.current !== hsId) {
        // New gaze target
        if (gazeTargetId.current) {
          eventLogger.log('GAZE_END', { videoTimestamp: currentTimeRef.current, objectId: gazeTargetId.current });
        }
        gazeTargetId.current = hsId;
        gazeStartTime.current = performance.now();
        setGazeTarget(hit.userData);
        setGazeProgress(0);
        eventLogger.log('GAZE_START', { videoTimestamp: currentTimeRef.current, objectId: hsId });
      }

      // Update gaze progress
      const elapsed = performance.now() - gazeStartTime.current;
      const prog = Math.min(1, elapsed / GAZE_DWELL_MS);
      setGazeProgress(prog);

      // Trigger on dwell
      if (prog >= 1 && gazeStartTime.current !== null) {
        gazeStartTime.current = null;
        setInfoPanel(hit.userData);
        audioSynth.playSFX('select');
        eventLogger.log(hit.userData.action || 'OBJECT_LOOKED_AT', {
          videoTimestamp: currentTimeRef.current,
          objectId: hsId,
          action: 'gaze_dwell_complete'
        });
        setHoveredHotspot(hit.userData);
      }
    } else {
      if (gazeTargetId.current) {
        eventLogger.log('GAZE_END', { videoTimestamp: currentTimeRef.current, objectId: gazeTargetId.current });
        gazeTargetId.current = null;
        gazeStartTime.current = null;
        setGazeTarget(null);
        setGazeProgress(0);
      }
    }
  };

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // ─── Playback ────
  const play = useCallback(() => {
    if (playing) return;
    setPlaying(true);
    eventLogger.log('VR_ENTER', { videoTimestamp: currentTime });
    eventLogger.log(currentTime === 0 ? 'VIDEO_START' : 'VIDEO_RESUME', { videoTimestamp: currentTime });

    playIntervalRef.current = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 0.1;
        if (next >= totalDuration) {
          clearInterval(playIntervalRef.current);
          setPlaying(false);
          eventLogger.log('VIDEO_COMPLETE', { videoTimestamp: totalDuration });
          eventLogger.log('VR_EXIT', { videoTimestamp: totalDuration });
          if (onComplete) onComplete();
          return totalDuration;
        }
        return next;
      });
    }, 100);
  }, [playing, currentTime, totalDuration, onComplete]);

  const pause = useCallback(() => {
    if (!playing) return;
    setPlaying(false);
    clearInterval(playIntervalRef.current);
    eventLogger.log('VIDEO_PAUSE', { videoTimestamp: currentTime });
  }, [playing, currentTime]);

  const seek = useCallback((time) => {
    eventLogger.log('VIDEO_SEEK', { videoTimestamp: time });
    setCurrentTime(time);
  }, []);

  useEffect(() => {
    const seg = getCurrentSegment(segments, currentTime);
    if (seg && seg.id !== currentSegment?.id) setCurrentSegment(seg);
  }, [currentTime, segments, currentSegment]);

  useEffect(() => {
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, []);

  const enterVR = async () => {
    if (!rendererRef.current || !navigator.xr) return;
    try {
      const session = await navigator.xr.requestSession('immersive-vr');
      rendererRef.current.xr.setSession(session);
      setInVR(true);
      eventLogger.log('VR_ENTER', { videoTimestamp: currentTime, action: 'headset_enter' });
    } catch (err) {
      console.warn('VR session failed:', err);
    }
  };

  const showControlsBriefly = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const vrSegConfig = currentSegment ? getVRSegmentConfig(vrScene, currentSegment.id) : null;

  return (
    <div className="player-container" onMouseMove={showControlsBriefly}>
      <div className="segment-indicator">
        {currentSegment && (
          <>
            <div className="segment-dot" style={{ backgroundColor: currentSegment.color }} />
            <span className="segment-name">{currentSegment.label}</span>
          </>
        )}
      </div>

      <div className="condition-badge" style={{
        background: 'rgba(156,39,176,0.2)',
        borderColor: 'rgba(156,39,176,0.3)',
        color: '#CE93D8'
      }}>
        🥽 VR Immersive — {vrSegConfig?.environment || 'Exploring'}
      </div>

      {/* Three.js mount */}
      <div ref={mountRef} className="vr-canvas-container" />

      {/* Gaze reticle overlay */}
      <div className={`gaze-reticle ${gazeTarget ? 'locked' : ''}`}>
        {gazeTarget && (
          <svg className="gaze-progress" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(78,205,196,0.3)" strokeWidth="2" />
            <circle cx="18" cy="18" r="16" fill="none" stroke="#4ECDC4" strokeWidth="2"
              strokeDasharray={`${gazeProgress * 100} 100`}
              style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }} />
          </svg>
        )}
      </div>

      {/* Info panel from gaze dwell */}
      {infoPanel && (
        <div className="vr-hotspot-label" style={{ top: '30%', left: '50%', transform: 'translateX(-50%)' }}
          onClick={() => setInfoPanel(null)}>
          <strong>{infoPanel.label}</strong>
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>{infoPanel.info}</p>
          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>Click to dismiss</span>
        </div>
      )}

      {/* VR controls */}
      <div className="vr-hud">
        {vrSupported && !inVR && (
          <button className="vr-enter-btn" onClick={enterVR}>
            🥽 Enter VR
          </button>
        )}
      </div>

      <div className={`player-controls ${showControls ? 'visible' : ''}`}>
        <div className="segment-timeline">
          {segments.map(seg => {
            const startPct = (parseTime(seg.start) / totalDuration) * 100;
            const widthPct = ((parseTime(seg.end) - parseTime(seg.start)) / totalDuration) * 100;
            return (
              <div key={seg.id} className="segment-block" style={{
                left: `${startPct}%`, width: `${widthPct}%`, backgroundColor: seg.color || '#666'
              }} onClick={() => seek(parseTime(seg.start))} title={seg.label} />
            );
          })}
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <input type="range" className="seek-slider" min="0" max={totalDuration} step="0.1"
            value={currentTime} onChange={(e) => seek(Number(e.target.value))} />
        </div>
        <div className="controls-row">
          <button className="control-btn" onClick={() => seek(Math.max(0, currentTime - 10))}>⏪ 10s</button>
          <button className="control-btn play-btn" onClick={playing ? pause : play}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="control-btn" onClick={() => seek(Math.min(totalDuration, currentTime + 10))}>10s ⏩</button>
          <span className="time-display">{formatTime(currentTime)} / {formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Procedural 360° environment sphere ────
function createEnvironmentSphere(scene, segIndex) {
  // Remove old sky sphere
  const old = scene.getObjectByName('sky_sphere');
  if (old) scene.remove(old);

  const geometry = new THREE.SphereGeometry(100, 64, 32);
  geometry.scale(-1, 1, 1); // Invert for inside view

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Draw gradient based on environment
  const envColors = [
    { top: '#FF8E53', mid: '#FF6B35', bot: '#1a4a7a' }, // Ocean surface
    { top: '#B8D4E3', mid: '#8EAFC6', bot: '#D4E4F0' }, // Inside cloud
    { top: '#2C3E50', mid: '#4A5568', bot: '#718096' }, // Storm sky
    { top: '#48BB78', mid: '#38A169', bot: '#276749' }, // River valley
  ];
  const colors = envColors[segIndex] || envColors[0];
  const grad = ctx.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, colors.top);
  grad.addColorStop(0.5, colors.mid);
  grad.addColorStop(1, colors.bot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2048, 1024);

  // Add some detail
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 2048, Math.random() * 512, 5 + Math.random() * 20, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.name = 'sky_sphere';
  scene.add(sphere);
}

function updateEnvironment(scene, segment, time) {
  if (!segment) return;
  const segIndex = parseInt(segment.id.replace('seg', '')) - 1;

  // Update sky sphere periodically
  const sphere = scene.getObjectByName('sky_sphere');
  if (sphere && sphere.userData.segIndex !== segIndex) {
    sphere.userData.segIndex = segIndex;
    createEnvironmentSphere(scene, segIndex);
  }

  // Rotate sky slightly for immersion
  const sky = scene.getObjectByName('sky_sphere');
  if (sky) sky.rotation.y = time * 0.005;
}
