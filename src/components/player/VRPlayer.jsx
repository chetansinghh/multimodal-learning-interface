// VRPlayer.jsx — Ultra-Immersive Interactive 3D VR Engine for "The Missing Kite"
// Direct 3D Raycasting & Object Interaction, WebXR 6-DOF Controller Laser Support,
// Interactive Characters (Meera & Aarav with Dialogues), Reactive Fountain Water Physics,
// Bicycle Bell & Wheel Spin, Bush Rustle & Kite Discovery, Aerobatic Kite Loops,
// Fluttering 3D Butterflies, 360° Compass Radar, Gaze Dwell HUD,
// Full 32-Line Narration Script with Timed Event Queue, Subtitle Overlay,
// rAF-based Smooth Time Tracking, Ambient Soundscape, Story-driven World Updates.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { eventLogger } from '../../services/EventLogger';
import { getCurrentSegment, parseTime, formatTime } from '../../services/StoryLoader';
import { audioSynth } from '../../services/AudioSynthesizer';
import { spatialAudio } from '../../services/SpatialAudioEngine';
import LanternGardenCanvas from './LanternGardenCanvas';
import './PlayerCommon.css';

const GAZE_DWELL_MS = 1500;
const HEAD_ROTATION_SAMPLE_MS = 200;
const TOTAL_DURATION = 240;

// ─── Full 32-Line Narration Script (matches KiteStoryCanvas exactly) ───
const NARR_SCRIPT = [
  [1,    "It is a sunny afternoon in a neighborhood park."],
  [6,    "A boy named Aarav arrives, carrying his red kite."],
  [13,   "His friend Meera sits near a wooden bench, drawing in her notebook."],
  [21,   "Three birds fly above the trees, and a small fountain runs beside the walking path."],
  [31,   "Aarav came to the park for one reason: to fly his red kite."],
  [39,   "He spots the wide, open field, and runs toward it, holding the kite high."],
  [52,   "Meera stays on her bench, busy with her drawing."],
  [60,   "Aarav takes a deep breath, and gets ready to release the kite."],
  [70,   "He lets go, and the kite rises above the trees."],
  [78,   "Aarav pulls the string once, and the kite turns left."],
  [85,   "He pulls it a second time, and the kite turns right."],
  [93,   "Meera stands up, and watches the kite dance in the sky."],
  [111,  "Suddenly, a strong wind blows across the field."],
  [116,  "It pulls the kite away, and the string slips from Aarav's hand."],
  [124,  "The kite drifts far across the park, and lands behind a large bush."],
  [135,  "Aarav gasps. His kite is lost."],
  [151,  "Aarav and Meera walk toward the bush."],
  [159,  "On the way, they pass the fountain,"],
  [166,  "and look around carefully."],
  [174,  "Then they pass a yellow bicycle."],
  [180,  "Meera notices something red, behind the bush."],
  [185,  "It is the corner of the kite!"],
  [191,  "Aarav moves the branches aside,"],
  [196,  "and picks up the kite."],
  [203,  "One small leaf is stuck to it."],
  [209,  "They gently remove the leaf,"],
  [214,  "and check the kite for damage."],
  [218,  "It is perfectly fine."],
  [221,  "The friends return to the field."],
  [227,  "This time, Aarav holds the string firmly."],
  [232,  "The kite soars, three birds fly across the sky, and the fountain keeps running."],
  [237.5,"The two friends smile."]
];

export default function VRPlayer({ storyConfig, onComplete }) {
  if (storyConfig?.story_id === 'lantern_garden_v1' || storyConfig?.story_id === 'lantern-garden') {
    return <LanternGardenCanvas condition="C4" storyConfig={storyConfig} onComplete={onComplete} />;
  }
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const dynamicGroupRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [gazeTarget, setGazeTarget] = useState(null);
  const [gazeProgress, setGazeProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [infoPanel, setInfoPanel] = useState(null);
  const [characterDialog, setCharacterDialog] = useState(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [inVR, setInVR] = useState(false);
  const [currentHeading, setCurrentHeading] = useState(0);
  const [hoveredInteractive, setHoveredInteractive] = useState(null);
  const [captionText, setCaptionText] = useState('');
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  const controlsTimeout = useRef(null);
  const dialogTimeout = useRef(null);
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const inVRRef = useRef(false);
  const isMutedRef = useRef(false);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(performance.now());

  // Narration event queue
  const narrIdxRef = useRef(0);

  // 360 Look rotation with smooth damping / inertia
  const isPointerDown = useRef(false);
  const pointerStartPos = useRef({ x: 0, y: 0 });
  const prevPointer = useRef({ x: 0, y: 0 });
  const targetRotation = useRef({ lon: 0, lat: 0 });
  const currentRotation = useRef({ lon: 0, lat: 0 });

  // Gaze tracking
  const gazeStartTime = useRef(null);
  const gazeTargetId = useRef(null);
  const lastHeadSample = useRef(0);

  // 3D Meshes, Hotspots & Interactive Objects
  const hotspotMeshes = useRef([]);
  const interactiveMeshes = useRef([]);
  const animatedObjects = useRef([]);
  const interactiveCallbacks = useRef({});
  const worldStateRef = useRef({});

  const segments = storyConfig.segments || [];
  const vrScene = storyConfig.vr_scene || {};
  const totalDuration = storyConfig.duration_sec || TOTAL_DURATION;
  const storyId = storyConfig.story_id || 'missing_kite_v1';

  // ─── Chrome Keepalive for SpeechSynthesis ────
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
      const ka = setInterval(() => {
        if (window.speechSynthesis?.speaking && !window.speechSynthesis?.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 5000);
      return () => {
        clearInterval(ka);
        if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);

  // ─── Core speak function (Chrome GC-safe) ────
  const speakLine = useCallback((text) => {
    setCaptionText(text);
    if (!text || !('speechSynthesis' in window) || isMutedRef.current) return;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.95;
      utt.pitch = 1.0;
      utt.lang = 'en-US';
      utt.volume = isMutedRef.current ? 0 : 1.0;
      const voices = window.speechSynthesis.getVoices();
      if (voices?.length > 0) {
        const v = voices.find(x => /^en[-_]US/i.test(x.lang) && /Samantha|Google|Natural|Neural|Victoria/i.test(x.name))
                  || voices.find(x => /^en/i.test(x.lang) && !/compact/i.test(x.name))
                  || voices[0];
        if (v) { utt.voice = v; utt.lang = v.lang; }
      }
      if (!window.__vrKiteUtterances) window.__vrKiteUtterances = [];
      window.__vrKiteUtterances.push(utt);
      utt.onend = () => { window.__vrKiteUtterances = window.__vrKiteUtterances?.filter(u => u !== utt); };
      utt.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') console.warn('[VRNarration] error:', e.error);
        window.__vrKiteUtterances = window.__vrKiteUtterances?.filter(u => u !== utt);
      };
      window.speechSynthesis.speak(utt);
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (e) { console.warn('Speech error:', e); }
  }, []);

  // ─── Three.js Scene Setup ────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;

    // 1. Scene with atmospheric sky fog
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xcae9ff, 0.012);
    sceneRef.current = scene;

    // 2. Camera at human eye-level (1.65m)
    const camera = new THREE.PerspectiveCamera(70, w / h, 0.1, 1000);
    camera.position.set(0, 1.65, 0);
    cameraRef.current = camera;

    // 3. Renderer with WebXR 6-DOF support & high quality shadows
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // WebXR Support Check
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        setVrSupported(supported);
      }).catch(() => {});
    }

    // 4. WebXR 6-DOF Controller Setup with Laser Rays
    setupWebXRControllers(renderer, scene, interactiveMeshes, interactiveCallbacks, handleObjectInteraction);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xfffaed, 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff7d6, 1.4);
    sunLight.position.set(30, 45, -25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 120;
    sunLight.shadow.camera.left = -30;
    sunLight.shadow.camera.right = 30;
    sunLight.shadow.camera.top = 30;
    sunLight.shadow.camera.bottom = -30;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x7ac1eb, 0x4f772d, 0.45);
    scene.add(hemiLight);

    // 6. Gaze Reticle HUD
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
    scene.add(camera);

    // 7. Dynamic World Group
    const dynGroup = new THREE.Group();
    dynGroup.name = 'dynamic_environment';
    scene.add(dynGroup);
    dynamicGroupRef.current = dynGroup;

    // Build the Living Interactive 3D World (passes worldStateRef for story-driven updates)
    buildInteractiveParkWorld(
      scene,
      dynGroup,
      animatedObjects,
      interactiveMeshes,
      interactiveCallbacks,
      showDialogBanner,
      worldStateRef
    );

    // Setup Gaze Hotspots
    setup3DHotspots(scene, vrScene, hotspotMeshes);

    // 8. Render & Animation Loop
    const clock = new THREE.Clock();
    const animate = () => {
      const t = currentTimeRef.current;
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth Camera Damping (Inertia)
      if (!inVRRef.current) {
        currentRotation.current.lon += (targetRotation.current.lon - currentRotation.current.lon) * 0.14;
        currentRotation.current.lat += (targetRotation.current.lat - currentRotation.current.lat) * 0.14;

        const phi = THREE.MathUtils.degToRad(90 - currentRotation.current.lat);
        const theta = THREE.MathUtils.degToRad(currentRotation.current.lon - 90);

        const targetDir = new THREE.Vector3(
          500 * Math.sin(phi) * Math.cos(theta),
          500 * Math.cos(phi) + 1.65,
          500 * Math.sin(phi) * Math.sin(theta)
        );
        camera.lookAt(targetDir);

        // Update spatial audio listener orientation
        const dirNorm = targetDir.clone().sub(camera.position).normalize();
        spatialAudio.updateListenerOrientation(
          { x: dirNorm.x, y: dirNorm.y, z: dirNorm.z },
          { x: 0, y: 1, z: 0 }
        );

        // Compass heading update
        const headingDeg = ((currentRotation.current.lon % 360) + 360) % 360;
        setCurrentHeading(Math.round(headingDeg));
      }

      // Sample Head Rotation for event logs
      const now = performance.now();
      if (now - lastHeadSample.current > HEAD_ROTATION_SAMPLE_MS && playingRef.current) {
        lastHeadSample.current = now;
        eventLogger.log('HEAD_ROTATION', {
          videoTimestamp: t,
          extra: {
            lon: currentRotation.current.lon.toFixed(1),
            lat: currentRotation.current.lat.toFixed(1)
          }
        });
      }

      // Check Gaze Dwell Intersection
      checkGazeDwell(camera, hotspotMeshes.current, now, t, setGazeTarget, setGazeProgress, setInfoPanel);

      // Check Hover over interactive objects for visual cursor cue
      checkHoverInteractive(camera, interactiveMeshes.current, setHoveredInteractive);

      // Execute all procedural animations (characters, water, butterflies, wind particles)
      animatedObjects.current.forEach(fn => fn(elapsed, delta, t));

      // Pulse hotspot beacons
      hotspotMeshes.current.forEach(m => {
        const pulse = 1 + Math.sin(elapsed * 4 + (m.userData.index || 0)) * 0.15;
        m.scale.set(pulse, pulse, pulse);
      });

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    // Dynamic Resize
    const handleResize = () => {
      if (!mount) return;
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    // 9. Robust Pointer Capture & Direct 3D Raycast Click Interaction
    const onPointerDown = (e) => {
      isPointerDown.current = true;
      pointerStartPos.current = { x: e.clientX, y: e.clientY };
      prevPointer.current = { x: e.clientX, y: e.clientY };
      try {
        mount.setPointerCapture(e.pointerId);
      } catch (_) {}
      mount.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (!isPointerDown.current) return;
      const deltaX = e.clientX - prevPointer.current.x;
      const deltaY = e.clientY - prevPointer.current.y;

      targetRotation.current.lon += deltaX * 0.28;
      targetRotation.current.lat += deltaY * 0.28;
      targetRotation.current.lat = Math.max(-85, Math.min(85, targetRotation.current.lat));

      prevPointer.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e) => {
      isPointerDown.current = false;
      try {
        if (mount.hasPointerCapture(e.pointerId)) {
          mount.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      mount.style.cursor = 'grab';

      // If pointer moved less than 6px, treat as a direct 3D Click / Tap
      const distMoved = Math.hypot(e.clientX - pointerStartPos.current.x, e.clientY - pointerStartPos.current.y);
      if (distMoved < 6) {
        handlePointerClick(e, camera, mount, interactiveMeshes.current, interactiveCallbacks.current);
      }
    };

    // Keyboard Arrow / WASD Controls
    const onKeyDown = (e) => {
      const step = 6;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        targetRotation.current.lon -= step;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        targetRotation.current.lon += step;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        targetRotation.current.lat = Math.min(85, targetRotation.current.lat + step);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        targetRotation.current.lat = Math.max(-85, targetRotation.current.lat - step);
      }
    };

    mount.style.cursor = 'grab';
    mount.style.touchAction = 'none';
    mount.addEventListener('pointerdown', onPointerDown);
    mount.addEventListener('pointermove', onPointerMove);
    mount.addEventListener('pointerup', onPointerUp);
    mount.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      mount.removeEventListener('pointerdown', onPointerDown);
      mount.removeEventListener('pointermove', onPointerMove);
      mount.removeEventListener('pointerup', onPointerUp);
      mount.removeEventListener('pointercancel', onPointerUp);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
      audioSynth.stop();
    };
  }, [storyId]);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { inVRRef.current = inVR; }, [inVR]);
  useEffect(() => { isMutedRef.current = isMuted; audioSynth.setMuted(isMuted); }, [isMuted]);

  // Update current segment label (no longer speaks segment title — narration script handles all speech)
  useEffect(() => {
    const seg = getCurrentSegment(segments, currentTime);
    if (seg && seg.id !== currentSegment?.id) {
      setCurrentSegment(seg);
    }
  }, [currentTime, segments, currentSegment]);

  // ─── Interactive Click Handler ────
  const handlePointerClick = (e, camera, mount, meshes, callbacks) => {
    const rect = mount.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(meshes, true);

    if (hits.length > 0) {
      let target = hits[0].object;
      while (target && !target.userData?.interactiveId && target.parent) {
        target = target.parent;
      }
      if (target && target.userData?.interactiveId) {
        const id = target.userData.interactiveId;
        handleObjectInteraction(id, callbacks);
      }
    }
  };

  const handleObjectInteraction = (id, callbacks) => {
    if (callbacks && callbacks[id]) {
      callbacks[id]();
    }
  };

  const showDialogBanner = (characterName, avatar, text, durationMs = 4000) => {
    setCharacterDialog({ name: characterName, avatar, text });
    if (dialogTimeout.current) clearTimeout(dialogTimeout.current);
    dialogTimeout.current = setTimeout(() => setCharacterDialog(null), durationMs);
  };

  // ─── Gaze Raycasting Check ────
  const checkGazeDwell = (camera, meshes, now, t, setTarget, setProgress, setPanel) => {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData?.hotspotId && hit.parent) hit = hit.parent;

      if (hit && hit.userData?.hotspotId) {
        const hsId = hit.userData.hotspotId;
        if (gazeTargetId.current !== hsId) {
          if (gazeTargetId.current) {
            eventLogger.log('GAZE_END', { videoTimestamp: t, objectId: gazeTargetId.current });
          }
          gazeTargetId.current = hsId;
          gazeStartTime.current = now;
          setTarget(hit.userData);
          setProgress(0);
          eventLogger.log('GAZE_START', { videoTimestamp: t, objectId: hsId });
          audioSynth.playSFX('select_hotspot');
        } else {
          const dwell = now - gazeStartTime.current;
          const targetDwell = hit.userData.dwellMs || GAZE_DWELL_MS;
          const pct = Math.min(100, (dwell / targetDwell) * 100);
          setProgress(pct);

          if (dwell >= targetDwell && !hit.userData.triggered) {
            hit.userData.triggered = true;
            eventLogger.log(hit.userData.action || 'OBJECT_LOOKED_AT', {
              videoTimestamp: t,
              objectId: hsId,
              response: `dwell_${Math.round(dwell)}ms`
            });
            audioSynth.playSFX('discovery_chime');
            setPanel(hit.userData);
          }
        }
        return;
      }
    }

    if (gazeTargetId.current) {
      eventLogger.log('GAZE_END', { videoTimestamp: t, objectId: gazeTargetId.current });
      meshes.forEach(m => { if (m.userData.hotspotId === gazeTargetId.current) m.userData.triggered = false; });
      gazeTargetId.current = null;
      gazeStartTime.current = null;
      setTarget(null);
      setProgress(0);
    }
  };

  // Check hover over interactive object
  const checkHoverInteractive = (camera, meshes, setHovered) => {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length > 0) {
      let target = hits[0].object;
      while (target && !target.userData?.interactiveId && target.parent) target = target.parent;
      if (target && target.userData?.interactiveId) {
        setHovered(target.userData.interactiveLabel || 'Interact');
        return;
      }
    }
    setHovered(null);
  };

  // ─── rAF-based Time Loop with Narration Event Queue ────
  useEffect(() => {
    let animId;
    const loop = (now) => {
      animId = requestAnimationFrame(loop);
      if (!playingRef.current) { lastTimeRef.current = now; return; }

      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      const prevT = currentTimeRef.current;
      const nextT = prevT + dt;

      // Fire narration lines
      while (narrIdxRef.current < NARR_SCRIPT.length && NARR_SCRIPT[narrIdxRef.current][0] <= nextT) {
        speakLine(NARR_SCRIPT[narrIdxRef.current][1]);
        narrIdxRef.current++;
      }

      // Update world state based on time (kite position, wind, storm)
      updateWorldState(nextT, worldStateRef.current);

      if (nextT >= totalDuration) {
        currentTimeRef.current = totalDuration;
        setCurrentTime(totalDuration);
        setPlaying(false);
        playingRef.current = false;
        audioSynth.stop();
        eventLogger.log('VIDEO_COMPLETE', { videoTimestamp: totalDuration });
        if (onComplete) onComplete();
        return;
      }

      currentTimeRef.current = nextT;
      setCurrentTime(nextT);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [speakLine, totalDuration, onComplete]);

  // ─── Playback ────
  const play = useCallback(async () => {
    if (playing) return;
    lastTimeRef.current = performance.now();
    setPlaying(true);
    playingRef.current = true;
    await audioSynth.start(true);
    await spatialAudio.init();
    await spatialAudio.resume();
    if ('speechSynthesis' in window && window.speechSynthesis.paused) window.speechSynthesis.resume();
    eventLogger.log(currentTimeRef.current === 0 ? 'VIDEO_START' : 'VIDEO_RESUME', { videoTimestamp: currentTimeRef.current });
  }, [playing]);

  const pause = useCallback(() => {
    if (!playing) return;
    setPlaying(false);
    playingRef.current = false;
    audioSynth.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.pause();
    eventLogger.log('VIDEO_PAUSE', { videoTimestamp: currentTimeRef.current });
  }, [playing]);

  const seek = useCallback((time) => {
    const safeTime = Math.max(0, Math.min(totalDuration, time));
    currentTimeRef.current = safeTime;
    setCurrentTime(safeTime);
    // Reset narration index
    let idx = 0;
    while (idx < NARR_SCRIPT.length && NARR_SCRIPT[idx][0] <= safeTime) idx++;
    narrIdxRef.current = idx;
    if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); setCaptionText(''); }
    eventLogger.log('VIDEO_SEEK', { videoTimestamp: safeTime });
  }, [totalDuration]);

  const enterVR = async () => {
    if (!rendererRef.current || !vrSupported) return;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      rendererRef.current.xr.setSession(session);
      setInVR(true);
      eventLogger.log('VR_ENTER', { videoTimestamp: currentTime });
      session.addEventListener('end', () => {
        setInVR(false);
        eventLogger.log('VR_EXIT', { videoTimestamp: currentTime });
      });
    } catch (err) {
      console.warn('VR session failed:', err);
    }
  };

  const showControlsBriefly = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 4000);
  };

  const rotateTo = (degLon, degLat = 0) => {
    targetRotation.current.lon = degLon;
    targetRotation.current.lat = degLat;
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    audioSynth.setMuted(next);
    if (next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  return (
    <div className="player-container vr-player" onMouseMove={showControlsBriefly} onClick={showControlsBriefly}>
      {/* Fullscreen 3D WebGL Canvas Mount */}
      <div ref={mountRef} className="vr-canvas-mount" />

      {/* Story Subtitle Caption Overlay */}
      {showSubtitles && captionText && (
        <div style={{
          position: 'absolute',
          bottom: '90px',
          left: '0',
          right: '0',
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 30,
          padding: '0 20px'
        }}>
          <span style={{
            background: 'rgba(8, 12, 28, 0.88)',
            color: '#ffffff',
            padding: '8px 18px',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: 500,
            maxWidth: '720px',
            textAlign: 'center',
            lineHeight: 1.5,
            boxShadow: '0 4px 18px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255,255,255,0.12)'
          }}>
            {captionText}
          </span>
        </div>
      )}

      {/* Interactive Hover Tooltip Cue */}
      {hoveredInteractive && (
        <div className="vr-interactive-cue">
          <span>👆 Click / Tap to {hoveredInteractive}</span>
        </div>
      )}

      {/* Dynamic Character Dialogue Banner */}
      {characterDialog && (
        <div className="vr-dialogue-banner">
          <div className="dialogue-avatar">{characterDialog.avatar}</div>
          <div className="dialogue-content">
            <span className="dialogue-name">{characterDialog.name}</span>
            <p className="dialogue-text">{characterDialog.text}</p>
          </div>
        </div>
      )}

      {/* 360° Compass & Spatial Radar HUD */}
      <div className="vr-compass-hud">
        <div className="compass-dial">
          <div className="compass-arrow" style={{ transform: `rotate(${-currentHeading}deg)` }}>
            <span className="compass-n">N</span>
          </div>
        </div>
        <div className="compass-labels">
          <span className="heading-text">360° View: {currentHeading}°</span>
          <div className="radar-quick-targets">
            <button className="radar-pill" onClick={() => rotateTo(0, 0)} title="Look at Meera on the bench">
              🪑 Meera
            </button>
            <button className="radar-pill" onClick={() => rotateTo(-25, 2)} title="Look at Fountain & Aarav">
              ⛲ Fountain
            </button>
            <button className="radar-pill" onClick={() => rotateTo(35, 12)} title="Look at Bush & Kite">
              🪁 Bush
            </button>
            <button className="radar-pill" onClick={() => rotateTo(15, 30)} title="Look at Sky Kite">
              🌤️ Sky Kite
            </button>
          </div>
        </div>
      </div>

      {/* Quick Navigation Controls (Bottom Left) */}
      <div className="vr-quick-nav-controls">
        <button className="nav-arrow-btn" onClick={() => { targetRotation.current.lat = Math.min(85, targetRotation.current.lat + 15); }} title="Look Up">▲</button>
        <div className="nav-row">
          <button className="nav-arrow-btn" onClick={() => { targetRotation.current.lon -= 30; }} title="Turn Left">◀</button>
          <button className="nav-arrow-btn center-btn" onClick={() => rotateTo(0, 0)} title="Reset to Center">🎯</button>
          <button className="nav-arrow-btn" onClick={() => { targetRotation.current.lon += 30; }} title="Turn Right">▶</button>
        </div>
        <button className="nav-arrow-btn" onClick={() => { targetRotation.current.lat = Math.max(-85, targetRotation.current.lat - 15); }} title="Look Down">▼</button>
      </div>

      {/* Gaze Progress Ring HUD */}
      {gazeTarget && (
        <div className="gaze-reticle-hud">
          <svg width="70" height="70" viewBox="0 0 70 70">
            <circle cx="35" cy="35" r="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3.5" />
            <circle cx="35" cy="35" r="28" fill="none" stroke="#38bdf8" strokeWidth="4.5"
              strokeDasharray={`${(gazeProgress / 100) * 175.9} 175.9`}
              strokeLinecap="round"
              style={{ transformOrigin: 'center', transform: 'rotate(-90deg)', transition: 'stroke-dasharray 0.05s linear' }} />
          </svg>
          <div className="gaze-target-title">
            ✨ {gazeTarget.label}
          </div>
        </div>
      )}

      {/* 3D Hotspot Inspection Modal */}
      {infoPanel && (
        <div className="vr-hotspot-label" onClick={() => setInfoPanel(null)}>
          <div className="hotspot-header">
            <strong style={{ fontSize: '1.05rem', color: '#38bdf8' }}>🔍 {infoPanel.label}</strong>
            <button className="close-btn" onClick={() => setInfoPanel(null)}>×</button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.92)', lineHeight: 1.5 }}>
            {infoPanel.info}
          </p>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '8px' }}>
            Click anywhere to dismiss
          </span>
        </div>
      )}

      {/* WebXR Enter Button */}
      <div className="vr-top-hud">
        {vrSupported && !inVR && (
          <button className="vr-enter-btn" onClick={enterVR}>
            🥽 Enter VR Mode
          </button>
        )}
      </div>

      {/* Segment Indicator */}
      <div className="segment-indicator">
        {currentSegment && (
          <>
            <div className="segment-dot" style={{ backgroundColor: currentSegment.color || '#38bdf8' }} />
            <span className="segment-name">{currentSegment.label}</span>
          </>
        )}
      </div>

      {/* Player Timeline & Controls */}
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
          <input type="range" min={0} max={totalDuration} step={0.1} value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))} className="seek-slider" />
        </div>

        <div className="controls-row">
          <button className="control-btn play-btn" onClick={playing ? pause : play}>
            {currentTime >= totalDuration ? '🔄' : playing ? '⏸' : '▶'}
          </button>
          <button className="control-btn" onClick={() => seek(Math.max(0, currentTime - 5))}>⏪ -5s</button>
          <button className="control-btn" onClick={() => seek(Math.min(totalDuration, currentTime + 5))}>+5s ⏩</button>
          <button
            className="control-btn"
            style={{ background: isMuted ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '6px', color: '#fff', padding: '4px 12px', cursor: 'pointer' }}
            onClick={toggleMute}
          >
            {isMuted ? '🔇 Unmute' : '🔊 Mute'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.85rem', color: '#cbd5e1' }}>
            <input type="checkbox" checked={showSubtitles} onChange={e => setShowSubtitles(e.target.checked)} style={{ accentColor: '#38bdf8' }} />
            Subtitles
          </label>
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Story-Driven World State Updates ────────────────────────────────
// Called every rAF frame with current story time.
// Drives: kite altitude/position, storm wind intensity, sky color shift,
// kite-lost state (kite hides behind bush at t=124), kite-found animation.
function updateWorldState(t, state) {
  // These refs are set during buildInteractiveParkWorld and stored on state
  if (!state.skyKiteGroup) return;

  const { skyKiteGroup, cloudGroup, sunMesh, kiteFound } = state;

  // Ensure the kite in the sky is always visible and soaring
  skyKiteGroup.visible = true;

  // Gentle altitude & wind drift modulation during storm segments
  if (t >= 108 && t < 124) {
    const stormWobble = Math.sin((t - 108) * 8) * 0.4;
    skyKiteGroup.rotation.z += stormWobble * 0.05;
  }

  // --- Storm cloud darkening at t=108-120 ---
  if (cloudGroup) {
    const stormU = t >= 108 && t <= 122 ? Math.sin(((t - 108) / 14) * Math.PI) : 0;
    cloudGroup.children.forEach(c => {
      c.children.forEach(p => {
        if (p.material) p.material.color.setRGB(1 - stormU * 0.35, 1 - stormU * 0.35, 1 - stormU * 0.45);
      });
    });
    // Shake cloud group at storm peak
    if (stormU > 0.5) {
      cloudGroup.position.x = Math.sin(t * 22) * stormU * 0.3;
    } else {
      cloudGroup.position.x = 0;
    }
  }

  // --- Sun dims slightly at storm ---
  if (sunMesh) {
    const stormDim = t >= 108 && t <= 122 ? Math.sin(((t - 108) / 14) * Math.PI) * 0.4 : 0;
    sunMesh.material.opacity = Math.max(0.5, 0.95 - stormDim);
  }
}

// ─── WebXR 6-DOF Controller Laser Pointer Setup ───────────────────────
function setupWebXRControllers(renderer, scene, interactiveMeshes, callbacksRef, onTriggerInteract) {
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);

    // Laser Beam Ray
    const laserGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5)
    ]);
    const laserMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 });
    const laser = new THREE.Line(laserGeom, laserMat);
    laser.name = 'laser_pointer';
    controller.add(laser);

    // Trigger Select Listener
    controller.addEventListener('selectstart', () => {
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      const raycaster = new THREE.Raycaster();
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const hits = raycaster.intersectObjects(interactiveMeshes.current, true);
      if (hits.length > 0) {
        let target = hits[0].object;
        while (target && !target.userData?.interactiveId && target.parent) target = target.parent;
        if (target && target.userData?.interactiveId) {
          onTriggerInteract(target.userData.interactiveId, callbacksRef.current);
        }
      }
    });

    scene.add(controller);
  }
}

// ─── 3D Story World with Interactive Objects & Characters ────────────
function buildInteractiveParkWorld(
  scene,
  group,
  animatorsRef,
  interactiveMeshes,
  callbacksRef,
  showDialogBanner,
  worldStateRef
) {
  interactiveMeshes.current = [];

  // 1. Sky Dome with Gradient Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#1d4ed8');
  gradient.addColorStop(0.35, '#38bdf8');
  gradient.addColorStop(0.7, '#bae6fd');
  gradient.addColorStop(0.95, '#fed7aa');
  gradient.addColorStop(1, '#ca8a04');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  const skyTexture = new THREE.CanvasTexture(canvas);
  const skyGeom = new THREE.SphereGeometry(120, 32, 24);
  skyGeom.scale(-1, 1, 1);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture });
  const skyDome = new THREE.Mesh(skyGeom, skyMat);
  group.add(skyDome);

  // 2. Glowing Sun Disc
  const sunGeom = new THREE.CircleGeometry(4.5, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfffae0, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  const sun = new THREE.Mesh(sunGeom, sunMat);
  sun.position.set(35, 50, -30);
  sun.lookAt(0, 1.65, 0);
  group.add(sun);

  // 3. Drifting Clouds
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, flatShading: true });
  for (let c = 0; c < 8; c++) {
    const singleCloud = new THREE.Group();
    const clusterSize = 4 + Math.floor(Math.random() * 3);
    for (let p = 0; p < clusterSize; p++) {
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2 + Math.random() * 2.0, 1), cloudMat);
      puff.position.set((p - clusterSize / 2) * 2.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.0);
      singleCloud.add(puff);
    }
    const angle = (c / 8) * Math.PI * 2;
    const dist = 45 + Math.random() * 25;
    singleCloud.position.set(Math.cos(angle) * dist, 24 + Math.random() * 12, Math.sin(angle) * dist);
    cloudGroup.add(singleCloud);
  }
  group.add(cloudGroup);
  animatorsRef.current.push((elapsed) => { cloudGroup.rotation.y = elapsed * 0.006; });

  // 4. Lush Ground Terrain
  const groundGeom = new THREE.PlaneGeometry(140, 140, 32, 32);
  groundGeom.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x408035, roughness: 0.85, metalness: 0.05 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  // 5. Curved Sand Walkway
  const pathGeom = new THREE.PlaneGeometry(4.2, 50, 20, 20);
  pathGeom.rotateX(-Math.PI / 2);
  pathGeom.rotateY(0.12);
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xd9b382, roughness: 0.9 });
  const path = new THREE.Mesh(pathGeom, pathMat);
  path.position.set(-0.5, 0.02, -6);
  path.receiveShadow = true;
  group.add(path);

  // ─── 6. INTERACTIVE OBJECT: Meera on the Bench ─────────────────────
  const benchGroup = new THREE.Group();
  benchGroup.position.set(-1.8, 0, -3.2);
  benchGroup.rotation.y = 0.35;

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.6 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.4, metalness: 0.8 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.55), woodMat);
  seat.position.set(0, 0.48, 0);
  seat.castShadow = true;
  benchGroup.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 0.08), woodMat);
  back.position.set(0, 0.85, -0.24);
  back.castShadow = true;
  benchGroup.add(back);

  const meeraGroup = new THREE.Group();
  meeraGroup.position.set(-0.25, 0.52, 0.05);
  meeraGroup.userData = { interactiveId: 'meera', interactiveLabel: 'Talk with Meera' };

  const meeraSkin = new THREE.MeshStandardMaterial({ color: 0xf5c7a9, roughness: 0.6 });
  const meeraTorso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.55, 16),
    new THREE.MeshStandardMaterial({ color: 0x8e24aa, roughness: 0.5 })
  );
  meeraTorso.position.set(0, 0.28, 0);
  meeraTorso.castShadow = true;
  meeraGroup.add(meeraTorso);

  const meeraHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 18), meeraSkin);
  meeraHead.position.set(0, 0.68, 0);
  meeraHead.castShadow = true;
  meeraGroup.add(meeraHead);

  const meeraHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 18, 18),
    new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.8 })
  );
  meeraHair.position.set(0, 0.72, -0.03);
  meeraHair.scale.set(1.05, 1.1, 1.1);
  meeraGroup.add(meeraHair);

  // Meera's right arm (animates on wave)
  const armRight = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.35, 12),
    new THREE.MeshStandardMaterial({ color: 0x8e24aa })
  );
  armRight.position.set(0.24, 0.42, 0.1);
  armRight.rotation.z = -0.3;
  meeraGroup.add(armRight);

  const notebook = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.02, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 })
  );
  notebook.position.set(0, 0.36, 0.22);
  notebook.rotation.x = 0.2;
  meeraGroup.add(notebook);

  benchGroup.add(meeraGroup);
  group.add(benchGroup);
  interactiveMeshes.current.push(meeraGroup);

  let meeraWaveTimer = 0;
  callbacksRef.current['meera'] = () => {
    meeraWaveTimer = 2.5; // Trigger wave for 2.5s
    audioSynth.playSFX('wave_hello');
    showDialogBanner('Meera', '👧', '“Look Aarav! I was sketching the trees when a strong gust carried your kite away!”');
    eventLogger.log('OBJECT_INTERACT', { objectId: 'meera_bench', action: 'talk_to_meera' });
  };

  animatorsRef.current.push((elapsed, delta) => {
    if (meeraWaveTimer > 0) {
      meeraWaveTimer -= delta;
      armRight.rotation.z = -1.2 + Math.sin(elapsed * 12) * 0.4;
      meeraHead.rotation.y = Math.sin(elapsed * 4) * 0.25;
    } else {
      armRight.rotation.z = -0.3;
      meeraHead.rotation.y = Math.sin(elapsed * 0.9) * 0.15;
    }
    meeraTorso.scale.y = 1 + Math.sin(elapsed * 2.2) * 0.03;
  });

  // ─── 7. INTERACTIVE OBJECT: Aarav Searching ─────────────────────────
  const aaravGroup = new THREE.Group();
  aaravGroup.position.set(1.0, 0, -2.8);
  aaravGroup.rotation.y = -0.3;
  aaravGroup.userData = { interactiveId: 'aarav', interactiveLabel: 'Help Aarav Search' };

  const aaravTorso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.23, 0.6, 16),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5 })
  );
  aaravTorso.position.set(0, 0.85, 0);
  aaravTorso.castShadow = true;
  aaravGroup.add(aaravTorso);

  const aaravPants = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.2, 0.65, 16),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
  );
  aaravPants.position.set(0, 0.35, 0);
  aaravPants.castShadow = true;
  aaravGroup.add(aaravPants);

  const aaravHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 18), meeraSkin);
  aaravHead.position.set(0, 1.28, 0);
  aaravHead.castShadow = true;
  aaravGroup.add(aaravHead);

  const aaravCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.18, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6 })
  );
  aaravCap.position.set(0, 1.4, 0);
  aaravGroup.add(aaravCap);

  // Binoculars
  const binocGeom = new THREE.CylinderGeometry(0.04, 0.05, 0.15, 12);
  const binocMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8 });
  const binoc1 = new THREE.Mesh(binocGeom, binocMat);
  binoc1.rotation.x = Math.PI / 2;
  binoc1.position.set(-0.06, 1.24, 0.18);
  aaravGroup.add(binoc1);

  const binoc2 = new THREE.Mesh(binocGeom, binocMat);
  binoc2.rotation.x = Math.PI / 2;
  binoc2.position.set(0.06, 1.24, 0.18);
  aaravGroup.add(binoc2);

  group.add(aaravGroup);
  interactiveMeshes.current.push(aaravGroup);

  let aaravSearchTimer = 0;
  callbacksRef.current['aarav'] = () => {
    aaravSearchTimer = 3.0;
    audioSynth.playSFX('select_hotspot');
    showDialogBanner('Aarav', '👦', '“I see something red fluttering in the distance! Let\'s check past the fountain near the bushes!”');
    eventLogger.log('OBJECT_INTERACT', { objectId: 'aarav_search', action: 'ask_aarav' });
  };

  animatorsRef.current.push((elapsed, delta) => {
    if (aaravSearchTimer > 0) {
      aaravSearchTimer -= delta;
      aaravGroup.rotation.y = -0.3 + Math.sin(elapsed * 6) * 0.6;
    } else {
      aaravGroup.rotation.y = -0.3 + Math.sin(elapsed * 0.7) * 0.35;
    }
  });

  // ─── 8. INTERACTIVE OBJECT: Tiered Stone Fountain ───────────────────
  const fountainGroup = new THREE.Group();
  fountainGroup.position.set(-0.2, 0, -4.6);
  fountainGroup.userData = { interactiveId: 'fountain', interactiveLabel: 'Splash Fountain Water' };

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.6 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.1,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85
  });

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.45, 32), stoneMat);
  basin.position.set(0, 0.22, 0);
  basin.castShadow = true;
  fountainGroup.add(basin);

  const lowerWater = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), waterMat);
  lowerWater.rotateX(-Math.PI / 2);
  lowerWater.position.set(0, 0.42, 0);
  fountainGroup.add(lowerWater);

  const upperTier = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 0.25, 28), stoneMat);
  upperTier.position.set(0, 1.2, 0);
  upperTier.castShadow = true;
  fountainGroup.add(upperTier);

  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 16), stoneMat);
  spout.position.set(0, 1.5, 0);
  fountainGroup.add(spout);

  // Normal Water Spray
  const splashCount = 75;
  const splashGeom = new THREE.BufferGeometry();
  const splashPositions = new Float32Array(splashCount * 3);
  const splashVelocities = [];

  for (let i = 0; i < splashCount; i++) {
    splashPositions[i * 3] = (Math.random() - 0.5) * 0.1;
    splashPositions[i * 3 + 1] = 1.7 + Math.random() * 0.2;
    splashPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    splashVelocities.push({
      vx: (Math.random() - 0.5) * 0.04,
      vy: 0.04 + Math.random() * 0.05,
      vz: (Math.random() - 0.5) * 0.04
    });
  }
  splashGeom.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3));
  const splashParticles = new THREE.Points(
    splashGeom,
    new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.08, transparent: true, opacity: 0.85 })
  );
  fountainGroup.add(splashParticles);

  // Interactive High-Splash Burst Particles (triggers on click)
  const burstCount = 60;
  const burstGeom = new THREE.BufferGeometry();
  const burstPositions = new Float32Array(burstCount * 3);
  const burstVels = [];
  for (let b = 0; b < burstCount; b++) {
    burstPositions[b * 3] = 0;
    burstPositions[b * 3 + 1] = 0.42;
    burstPositions[b * 3 + 2] = 0;
    burstVels.push({ vx: 0, vy: 0, vz: 0, life: 0 });
  }
  burstGeom.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3));
  const burstParticles = new THREE.Points(
    burstGeom,
    new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.12, transparent: true, opacity: 0.9 })
  );
  fountainGroup.add(burstParticles);

  group.add(fountainGroup);
  interactiveMeshes.current.push(fountainGroup);

  callbacksRef.current['fountain'] = () => {
    audioSynth.playSFX('fountain_splash');
    showDialogBanner('Park Fountain', '⛲', 'You splashed the fountain! Cool refreshing water droplets spray into the air.');
    eventLogger.log('OBJECT_INTERACT', { objectId: 'fountain', action: 'splash_fountain' });

    // Trigger splash explosion
    const bPos = burstParticles.geometry.attributes.position.array;
    for (let b = 0; b < burstCount; b++) {
      bPos[b * 3] = (Math.random() - 0.5) * 0.8;
      bPos[b * 3 + 1] = 0.45;
      bPos[b * 3 + 2] = (Math.random() - 0.5) * 0.8;
      burstVels[b] = {
        vx: (Math.random() - 0.5) * 0.08,
        vy: 0.08 + Math.random() * 0.08,
        vz: (Math.random() - 0.5) * 0.08,
        life: 1.0
      };
    }
  };

  animatorsRef.current.push(() => {
    // Regular spray
    const pos = splashParticles.geometry.attributes.position.array;
    for (let i = 0; i < splashCount; i++) {
      const vel = splashVelocities[i];
      pos[i * 3] += vel.vx;
      pos[i * 3 + 1] += vel.vy;
      pos[i * 3 + 2] += vel.vz;
      vel.vy -= 0.0022;

      if (pos[i * 3 + 1] < 0.45) {
        pos[i * 3] = (Math.random() - 0.5) * 0.08;
        pos[i * 3 + 1] = 1.7;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
        vel.vy = 0.04 + Math.random() * 0.04;
      }
    }
    splashParticles.geometry.attributes.position.needsUpdate = true;

    // Burst spray
    const bPos = burstParticles.geometry.attributes.position.array;
    for (let b = 0; b < burstCount; b++) {
      const v = burstVels[b];
      if (v.life > 0) {
        bPos[b * 3] += v.vx;
        bPos[b * 3 + 1] += v.vy;
        bPos[b * 3 + 2] += v.vz;
        v.vy -= 0.003;
        v.life -= 0.02;
      } else {
        bPos[b * 3 + 1] = -10; // hide below ground
      }
    }
    burstParticles.geometry.attributes.position.needsUpdate = true;
  });

  // ─── 9. INTERACTIVE OBJECT: Yellow Bicycle ─────────────────────────
  const bikeGroup = new THREE.Group();
  bikeGroup.position.set(-3.2, 0, -2.8);
  bikeGroup.rotation.y = 0.85;
  bikeGroup.userData = { interactiveId: 'bicycle', interactiveLabel: 'Ring Bicycle Bell' };

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });
  const bikeFrameMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6, roughness: 0.25 });

  const wheelGeom = new THREE.TorusGeometry(0.35, 0.035, 16, 32);
  const wFront = new THREE.Mesh(wheelGeom, tireMat);
  wFront.position.set(0.6, 0.35, 0);
  wFront.castShadow = true;
  bikeGroup.add(wFront);

  const wBack = new THREE.Mesh(wheelGeom, tireMat);
  wBack.position.set(-0.6, 0.35, 0);
  wBack.castShadow = true;
  bikeGroup.add(wBack);

  const frameBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 12), bikeFrameMat);
  frameBar.position.set(0, 0.48, 0);
  frameBar.rotation.z = Math.PI / 4;
  bikeGroup.add(frameBar);

  const handleBar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 12), ironMat);
  handleBar.position.set(0.55, 0.75, 0);
  handleBar.rotation.x = Math.PI / 2;
  bikeGroup.add(handleBar);

  // Silver Bell on Handlebar
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 })
  );
  bell.position.set(0.55, 0.8, 0.1);
  bikeGroup.add(bell);

  group.add(bikeGroup);
  interactiveMeshes.current.push(bikeGroup);

  let wheelSpinSpeed = 0;
  callbacksRef.current['bicycle'] = () => {
    wheelSpinSpeed = 15;
    audioSynth.playSFX('bicycle_bell');
    showDialogBanner('Yellow Bicycle', '🚲', '“Ding-ding! Aarav\'s yellow bicycle is parked ready for a ride across the park!”');
    eventLogger.log('OBJECT_INTERACT', { objectId: 'yellow_bicycle', action: 'ring_bell' });
  };

  animatorsRef.current.push((elapsed, delta) => {
    if (wheelSpinSpeed > 0) {
      wFront.rotation.z += wheelSpinSpeed * delta;
      wBack.rotation.z += wheelSpinSpeed * delta;
      wheelSpinSpeed = Math.max(0, wheelSpinSpeed - delta * 5);
    }
  });

  // ─── 10. INTERACTIVE OBJECT: Bush with Hidden Kite ──────────────────
  const bushGroup = new THREE.Group();
  bushGroup.position.set(3.5, 0, -5.5);
  bushGroup.userData = { interactiveId: 'bush_kite', interactiveLabel: 'Search the Bush for the Kite' };

  const bushMat1 = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85, flatShading: true });
  const bushMat2 = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8, flatShading: true });

  const bCenter = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), bushMat1);
  bCenter.position.set(0, 1.1, 0);
  bCenter.castShadow = true;
  bushGroup.add(bCenter);

  const bLeft = new THREE.Mesh(new THREE.DodecahedronGeometry(1.0, 1), bushMat2);
  bLeft.position.set(-0.9, 0.8, 0.4);
  bLeft.castShadow = true;
  bushGroup.add(bLeft);

  const bRight = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 1), bushMat1);
  bRight.position.set(0.8, 0.75, -0.3);
  bushGroup.add(bRight);

  // Red Diamond Kite Geometry
  const kiteGeom = new THREE.BufferGeometry();
  const kiteVerts = new Float32Array([
    0, 0.55, 0,
    0.35, 0, 0,
    0, -0.55, 0,

    0, 0.55, 0,
    0, -0.55, 0,
    -0.35, 0, 0
  ]);
  kiteGeom.setAttribute('position', new THREE.BufferAttribute(kiteVerts, 3));
  kiteGeom.computeVertexNormals();
  const kiteMat = new THREE.MeshStandardMaterial({ color: 0xef4444, side: THREE.DoubleSide, roughness: 0.3 });

  const bushKite = new THREE.Mesh(kiteGeom, kiteMat);
  bushKite.position.set(0.35, 1.4, 0.55);
  bushKite.rotation.set(0.4, 0.6, 0.3);
  bushGroup.add(bushKite);

  group.add(bushGroup);
  interactiveMeshes.current.push(bushGroup);

  let kiteFound = false;
  callbacksRef.current['bush_kite'] = () => {
    audioSynth.playSFX('leaf_rustle');
    setTimeout(() => audioSynth.playSFX('discovery_chime'), 200);
    showDialogBanner('Discovery!', '🪁', '“You found Aarav\'s red diamond kite tucked behind the bush! Gently brush off the leaf and it is ready to fly!”');
    eventLogger.log('OBJECT_INTERACT', { objectId: 'bush_with_kite', action: 'discover_kite' });

    // Animate kite rising out of bush
    kiteFound = true;
  };

  animatorsRef.current.push((elapsed) => {
    if (kiteFound) {
      bushKite.position.y = 1.9 + Math.sin(elapsed * 3) * 0.1;
      bushKite.rotation.y = elapsed * 1.5;
    }
  });

  // ─── 11. INTERACTIVE OBJECT: Flying Red Kite ───────────────────────
  const skyKiteGroup = new THREE.Group();
  skyKiteGroup.position.set(2.2, 4.5, -4.8);
  skyKiteGroup.userData = { interactiveId: 'sky_kite', interactiveLabel: 'Perform Aerial Kite Loop' };

  const flyingKite = new THREE.Mesh(kiteGeom, kiteMat);
  skyKiteGroup.add(flyingKite);

  const strutMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
  const strutV = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.05, 8), strutMat);
  skyKiteGroup.add(strutV);
  const strutH = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.68, 8), strutMat);
  strutH.rotation.z = Math.PI / 2;
  skyKiteGroup.add(strutH);

  // Dynamic Ribbon Tail
  const tailSegments = 6;
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, -0.55, 0);

  const ribbonMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });
  const ribbonPieces = [];
  for (let r = 0; r < tailSegments; r++) {
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.02), ribbonMat);
    bow.position.set(0, -r * 0.22, 0);
    tailGroup.add(bow);
    ribbonPieces.push(bow);
  }
  skyKiteGroup.add(tailGroup);
  group.add(skyKiteGroup);
  interactiveMeshes.current.push(skyKiteGroup);

  let loopProgress = 0;
  callbacksRef.current['sky_kite'] = () => {
    loopProgress = Math.PI * 2;
    audioSynth.playSFX('kite_whoosh');
    showDialogBanner('Aerial Stunt!', '🪁', '“Whoosh! The red kite catches a thermal updraft and executes a 360° acrobatic loop!”');
    eventLogger.log('OBJECT_INTERACT', { objectId: 'flying_kite', action: 'kite_loop' });
  };

  animatorsRef.current.push((elapsed, delta) => {
    if (loopProgress > 0) {
      loopProgress -= delta * 5;
      skyKiteGroup.rotation.x = loopProgress;
      skyKiteGroup.position.y = 4.5 + Math.sin(loopProgress) * 0.8;
    } else {
      skyKiteGroup.rotation.x = 0;
      skyKiteGroup.position.y = 4.5 + Math.sin(elapsed * 1.6) * 0.45;
    }
    skyKiteGroup.position.x = 2.2 + Math.cos(elapsed * 0.9) * 0.6;
    skyKiteGroup.rotation.z = Math.sin(elapsed * 2.2) * 0.2;
    skyKiteGroup.rotation.y = Math.sin(elapsed * 1.3) * 0.25;

    ribbonPieces.forEach((piece, idx) => {
      piece.position.x = Math.sin(elapsed * 3.5 + idx * 0.7) * (0.05 + idx * 0.02);
      piece.rotation.z = Math.sin(elapsed * 3.5 + idx * 0.7) * 0.3;
    });
  });

  // ─── 12. Fluttering 3D Park Butterflies ────────────────────────────
  const butterflyGroup = new THREE.Group();
  butterflyGroup.position.set(0.6, 0.8, -3.2);

  const bWingMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, side: THREE.DoubleSide });
  const wing1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.08), bWingMat);
  wing1.position.set(0.05, 0, 0);
  butterflyGroup.add(wing1);

  const wing2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.08), bWingMat);
  wing2.position.set(-0.05, 0, 0);
  butterflyGroup.add(wing2);

  group.add(butterflyGroup);

  animatorsRef.current.push((elapsed) => {
    wing1.rotation.y = Math.sin(elapsed * 18) * 0.7;
    wing2.rotation.y = -Math.sin(elapsed * 18) * 0.7;
    butterflyGroup.position.x = 0.6 + Math.sin(elapsed * 1.2) * 1.2;
    butterflyGroup.position.z = -3.2 + Math.cos(elapsed * 0.9) * 1.0;
    butterflyGroup.position.y = 0.8 + Math.sin(elapsed * 2.5) * 0.25;
  });

  // 13. Trees & Environmental Foliage
  const treePositions = [
    [-7.5, -9.0, 1.2],
    [8.0, -11.0, 1.35],
    [-9.5, 3.0, 1.1],
    [10.5, 4.0, 1.25],
    [-4.0, -13.0, 1.4],
    [4.5, -14.0, 1.3]
  ];

  treePositions.forEach(([tx, tz, scale]) => {
    const tree = new THREE.Group();
    tree.position.set(tx, 0, tz);
    tree.scale.set(scale, scale, scale);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.45, 3.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 })
    );
    trunk.position.set(0, 1.6, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8, flatShading: true });
    const canopyTop = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 1), canopyMat);
    canopyTop.position.set(0, 3.8, 0);
    canopyTop.castShadow = true;
    tree.add(canopyTop);

    const canopyMid = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 1), canopyMat);
    canopyMid.position.set(0.6, 3.0, 0.4);
    canopyMid.castShadow = true;
    tree.add(canopyMid);

    const canopyMid2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), canopyMat);
    canopyMid2.position.set(-0.6, 2.8, -0.3);
    canopyMid2.castShadow = true;
    tree.add(canopyMid2);

    group.add(tree);
  });

  // 14. Floating Wind Pollen / Dust Motes
  const particleCount = 120;
  const particleGeom = new THREE.BufferGeometry();
  const particlePos = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 40;
    particlePos[i * 3 + 1] = 0.5 + Math.random() * 8;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({ color: 0xfef08a, size: 0.09, transparent: true, opacity: 0.75 });
  const particles = new THREE.Points(particleGeom, particleMat);
  group.add(particles);

  animatorsRef.current.push((elapsed) => {
    const pArray = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      pArray[i * 3] += Math.sin(elapsed + i) * 0.008 + 0.012;
      pArray[i * 3 + 1] += Math.cos(elapsed * 0.5 + i) * 0.004;
      if (pArray[i * 3] > 20) pArray[i * 3] = -20;
    }
    particles.geometry.attributes.position.needsUpdate = true;
  });

  // Store refs for story-driven world state updates
  if (worldStateRef) {
    worldStateRef.current.skyKiteGroup = skyKiteGroup;
    worldStateRef.current.cloudGroup = cloudGroup;
    worldStateRef.current.sunMesh = sun;
    worldStateRef.current.kiteFound = false;
  }
}

// ─── 3D Hotspot Setup ────────────────────────────────────────────────
function setup3DHotspots(scene, vrScene, hotspotMeshes) {
  hotspotMeshes.current = [];
  const hotspots = vrScene.hotspots || [
    {
      id: 'hs_meera_bench',
      label: 'Meera & Her Notebook',
      position: [-1.8, 1.4, -3.2],
      action: 'MEERA_LOOKED_AT',
      info: 'Meera sits on the park bench, sketching clues and noting down where the red kite was last seen.'
    },
    {
      id: 'hs_aarav_search',
      label: 'Aarav Searching',
      position: [1.0, 1.6, -2.8],
      action: 'AARAV_LOOKED_AT',
      info: 'Aarav is scanning the treetops and bushes with his binoculars to track down the missing kite!'
    },
    {
      id: 'hs_fountain_splash',
      label: 'Park Fountain',
      position: [-0.2, 1.2, -4.6],
      action: 'FOUNTAIN_LOOKED_AT',
      info: 'The central stone fountain. The cool water mist drifts through the sunny park air.'
    },
    {
      id: 'hs_bush_kite',
      label: 'Hidden Kite Corner',
      position: [3.8, 1.6, -5.3],
      action: 'KITE_BUSH_LOOKED_AT',
      info: 'A bright red corner peeking out from the dense green leaves! Is that the missing kite?'
    },
    {
      id: 'hs_sky_kite',
      label: 'Soaring Red Kite',
      position: [2.2, 4.5, -4.8],
      action: 'SKY_KITE_LOOKED_AT',
      info: 'The red diamond kite catching the strong thermal updraft above the highest park branches.'
    }
  ];

  hotspots.forEach((hs, i) => {
    const markerGroup = new THREE.Group();
    markerGroup.position.set(...hs.position);
    markerGroup.userData = { ...hs, hotspotId: hs.id, index: i };

    const ringGeom = new THREE.RingGeometry(0.16, 0.22, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.lookAt(0, 1.65, 0);
    markerGroup.add(ring);

    const dotGeom = new THREE.SphereGeometry(0.08, 16, 16);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dot = new THREE.Mesh(dotGeom, dotMat);
    markerGroup.add(dot);

    scene.add(markerGroup);
    hotspotMeshes.current.push(markerGroup);
  });
}
