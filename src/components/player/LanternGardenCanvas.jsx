// LanternGardenCanvas.jsx — Unified 3D Story Engine for "The Lantern in Grandmother's Garden"
// Full feature parity across C1 (Simple Video), C2 (Spatial Audio), C3 (Interactive Checkpoints), and C4 (VR Immersive).
// Features: Three.js 3D Garden World, Sunset-to-Night Sky Shader, Procedural Characters (Aman & Tara),
// Detachable Battery Cover Physics, HRTF Spatial Audio, 360° Compass Radar, Gaze Dwell (1.2s / 8°),
// Projected C3 Checkpoints, WebXR 6-DOF Controller Lasers, Direct 3D Click Interactivity & Dialogues.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { eventLogger } from '../../services/EventLogger';
import { formatTime } from '../../services/StoryLoader';
import './PlayerCommon.css';

const D = 300; // Total duration: 300s (5:00)
const GAZE_DWELL_MS = 1200;
const GAZE_ANGLE_DEG = 8;
const HEAD_ROTATION_SAMPLE_MS = 200;

// Exact 11 Scenes from research specification
const SCENES = [
  { n: 1, t: [0, 25], title: 'Garden Establishing', visual: 'Wide shot of grandmother\'s garden at sunset: house, path, pond, flowers, stone, and wind chime.', audio: 'Evening ambience, insects, light wind, soft chime.', testable: ['garden', 'house', 'pond', 'flowers'] },
  { n: 2, t: [25, 50], title: 'Characters Enter', visual: 'Aman and Tara enter through the wooden gate. Aman carries a glowing lantern.', audio: 'Footsteps arrive from behind; narration.', testable: ['who', 'where', 'why lantern', 'who carries it'] },
  { n: 3, t: [50, 80], title: 'Two Butterflies', visual: 'They stop at a flower where exactly two butterflies are resting. Aman points; Tara watches.', audio: 'Soft insects.', testable: ['two butterflies'] },
  { n: 4, t: [80, 110], title: 'The Wind Chime', visual: 'TING, TING. Tara turns toward a wind chime on the right side of the garden. Aman looks too.', audio: 'Wind chime from right (spatial in C2/C4).', testable: ['sound source', 'right side'] },
  { n: 5, t: [110, 135], title: 'Exploring the Garden', visual: 'Tara goes to the vegetable patch, Aman to the pond. Then both turn back.', audio: 'Footsteps; pond ambience near pond.', testable: ['who went where'] },
  { n: 6, t: [135, 165], title: 'Lantern Goes Out', visual: 'Sky darkens into night. Aman walks back to Tara. CLICK. The lantern goes out.', audio: 'Lantern click near Aman.', testable: ['main problem'] },
  { n: 7, t: [165, 195], title: 'Investigating Problem', visual: 'Close-up: Aman turns the lantern and finds the battery cover loose. It slips off.', audio: 'Soft tink as it lands by the stone.', testable: ['cause of the problem'] },
  { n: 8, t: [195, 225], title: 'Searching with Flashlight', visual: 'Tara switches on her phone flashlight. They search flowers, then pond, then path.', audio: 'Flashlight click near Tara; footsteps; chime.', testable: ['joint action', 'search order'] },
  { n: 9, t: [225, 255], title: 'Finding the Cover', visual: 'Tara spots the cover beside the large stone. Aman picks it up.', audio: '"Here it is!"', testable: ['what was lost', 'who found it', 'where'] },
  { n: 10, t: [255, 280], title: 'Repairing the Lantern', visual: 'Aman refits the cover, switches the lantern on. Light returns; Tara smiles.', audio: 'Snap, then lantern click.', testable: ['sequence: find, attach, switch, light'] },
  { n: 11, t: [280, 300], title: 'Return Home', visual: 'They walk to the house with the glowing lantern. The chime sounds again. Fade out.', audio: 'Narration; wind chime.', testable: ['ending', 'order of events'] }
];

// Full Original Script Lines for Narration and Character Dialogues
const SCRIPT_LINES = [
  { t: 1.5, who: 'narrator', text: "It is a peaceful evening at Grandmother's garden as the sun begins to set." },
  { t: 26, who: 'narrator', text: "Aman and his sister Tara arrive at the garden gate. Since it is getting dark, Aman carries a small lantern." },
  { t: 52, who: 'narrator', text: "Near a flower, they stopped. Two butterflies were resting on it." },
  { t: 88, who: 'tara', text: "Did you hear that?" },
  { t: 112, who: 'narrator', text: "Tara walked toward the vegetable patch, and Aman walked toward the pond." },
  { t: 143, who: 'narrator', text: "Suddenly, the lantern went out." },
  { t: 167, who: 'aman', text: "The battery cover is loose." },
  { t: 199, who: 'narrator', text: "Tara switched on her phone flashlight, and they began to search." },
  { t: 232, who: 'tara', text: "Here it is!" },
  { t: 258, who: 'narrator', text: "Aman attaches the cover and clicks the switch. The warm lantern light returns." },
  { t: 283, who: 'narrator', text: "With the lantern working again, Aman and Tara returned home." }
];

// Exact Audio Cues
const AUDIO_CUES = [
  { t: 82, id: 'chime' },
  { t: 85, id: 'chime' },
  { t: 142, id: 'lanternClick', at: 'aman' },
  { t: 176, id: 'coverTink' },
  { t: 197, id: 'flashClick', at: 'tara' },
  { t: 258, id: 'coverSnap', at: 'lantern' },
  { t: 267.5, id: 'lanternClick', at: 'aman' },
  { t: 286, id: 'chime' },
  { t: 289, id: 'chime' }
];

// C3 Checkpoints — Rich Cognitive Interactions
const C3_CHECKPOINTS = [
  {
    at: 27, label: 'Enter the garden', targets: ['gate'],
    type: 'tap',
    prompt: 'Tap the glowing gate to enter the garden',
    hint: 'Look for the wooden gate at the garden entrance'
  },
  {
    at: 51, label: 'Count the butterflies', targets: ['butterflies'],
    type: 'choice',
    prompt: 'How many butterflies are resting on the sunflower?',
    question: 'How many butterflies do you see on the flower?',
    options: ['1', '2', '3', '4'],
    correct: 1, // index of correct answer → '2'
    hint: 'Look carefully at the sunflower'
  },
  {
    at: 83, label: 'Find the chime direction', targets: ['chime'],
    type: 'direction',
    prompt: 'TING! The wind chime rang — which side did the sound come from?',
    question: 'Which side of the garden did you hear the chime from?',
    options: ['Left side', 'Right side', 'Behind you', 'Above you'],
    correct: 1, // → 'Right side'
    hint: 'The chime is on the right side of the garden'
  },
  {
    at: 166, label: 'Diagnose the lantern', targets: ['L'],
    type: 'choice',
    prompt: 'The lantern went out! What is wrong with it?',
    question: 'Aman checks the lantern. What is the problem?',
    options: ['The bulb burned out', 'The battery cover is loose', 'The switch is broken', 'It ran out of oil'],
    correct: 1, // → 'The battery cover is loose'
    hint: 'Aman says something is loose at the bottom'
  },
  {
    at: 198, label: 'Plan the search', targets: ['flowers', 'pond', 'path'],
    type: 'sequence',
    prompt: 'Put the search order in the correct sequence',
    question: 'Tara and Aman searched the garden. What was the correct order?',
    options: ['Flowers → Pond → Path', 'Pond → Path → Flowers', 'Path → Flowers → Pond', 'Pond → Flowers → Path'],
    correct: 0, // → 'Flowers → Pond → Path'
    hint: 'They started near the flower bed'
  },
  {
    at: 257, label: 'Repair the lantern', targets: ['L'],
    type: 'sequence',
    prompt: 'Show the correct steps to fix the lantern',
    question: 'What is the correct order to repair the lantern?',
    options: ['Find cover → Attach → Switch on', 'Switch on → Find cover → Attach', 'Attach → Switch on → Find cover', 'Find cover → Switch on → Attach'],
    correct: 0, // → 'Find cover → Attach → Switch on'
    hint: 'You need the cover before you can switch it on'
  }
];

/** Fisher-Yates array shuffler */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRandomizedC3Checkpoints() {
  return C3_CHECKPOINTS.map(cp => {
    if (cp.options && cp.options.length > 1) {
      const correctText = cp.options[cp.correct];
      const shuffledOptions = shuffleArray(cp.options);
      const newCorrectIdx = shuffledOptions.indexOf(correctText);
      return {
        ...cp,
        options: shuffledOptions,
        correct: newCorrectIdx >= 0 ? newCorrectIdx : 0,
        correctText: correctText
      };
    }
    return { ...cp };
  });
}

export default function LanternGardenCanvas({
  condition = 'C1', // 'C1', 'C2', 'C3', 'C4'
  storyConfig,
  onComplete
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const camRef = useRef(null);
  const rigRef = useRef(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [currentHeading, setCurrentHeading] = useState(0);
  const [hoveredInteractive, setHoveredInteractive] = useState(null);

  // C3 Interactive State (with randomized options)
  const [c3CheckpointsList] = useState(() => getRandomizedC3Checkpoints());
  const c3CheckpointsRef = useRef(c3CheckpointsList);
  useEffect(() => {
    c3CheckpointsRef.current = c3CheckpointsList;
  }, [c3CheckpointsList]);

  const [c3Waiting, setC3Waiting] = useState(false);
  const [c3CheckpointIdx, setC3CheckpointIdx] = useState(0);
  const [c3TargetIdx, setC3TargetIdx] = useState(0);
  const [c3Prompt, setC3Prompt] = useState('');
  const [c3ButtonPos, setC3ButtonPos] = useState({ x: 0, y: 0, visible: false });
  const [c3SelectedOption, setC3SelectedOption] = useState(null);
  const [c3Feedback, setC3Feedback] = useState(null);
  const [c3ShowHint, setC3ShowHint] = useState(false);

  // C4 Gaze & Dialogue State
  const [gazeTarget, setGazeTarget] = useState(null);
  const [gazeProgress, setGazeProgress] = useState(0);
  const [infoPanel, setInfoPanel] = useState(null);
  const [characterDialog, setCharacterDialog] = useState(null);
  const [vrSupported, setVrSupported] = useState(false);
  const [inVR, setInVR] = useState(false);
  const [gyroActive, setGyroActive] = useState(false);
  const [firefliesActive, setFirefliesActive] = useState(true);

  // Internal refs
  const currentTimeRef = useRef(0);
  const playingRef = useRef(false);
  const waitingRef = useRef(false);
  const inVRRef = useRef(false);
  const conditionRef = useRef(condition);
  const isMutedRef = useRef(false);
  const dialogTimeout = useRef(null);
  const eventIdxRef = useRef(0);
  const cpIdxRef = useRef(0);
  const tgIdxRef = useRef(0);

  // C4 360 Look rotation state (Euler angles yaw & pitch)
  const isPointerDown = useRef(false);
  const prevPointer = useRef({ x: 0, y: 0 });
  const pointerStartPos = useRef({ x: 0, y: 0 });
  const targetYaw = useRef(0);
  const targetPitch = useRef(0);
  const currentYaw = useRef(0);
  const currentPitch = useRef(0);

  // Gaze tracking
  const gazeDwellTimes = useRef({});
  const gazeTriggerTimes = useRef({});
  const lastHeadSample = useRef(0);

  // C3 Checkpoint tracking
  const c3Attempts = useRef(0);
  const c3StartTime = useRef(0);

  // Audio nodes & references
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const noiseBufferRef = useRef(null);

  // World objects refs
  const worldRefs = useRef({});
  const pulses = useRef([]);

  useEffect(() => { conditionRef.current = condition; }, [condition]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { waitingRef.current = c3Waiting; }, [c3Waiting]);
  useEffect(() => { inVRRef.current = inVR; }, [inVR]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { cpIdxRef.current = c3CheckpointIdx; }, [c3CheckpointIdx]);
  useEffect(() => { tgIdxRef.current = c3TargetIdx; }, [c3TargetIdx]);

  // ─── Speech Voices Pre-loading & Chrome Keepalive ────
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };

      const keepAliveInterval = setInterval(() => {
        if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 5000);

      return () => {
        clearInterval(keepAliveInterval);
        if (window.speechSynthesis) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  // ─── Pre-unlock AudioContext on First Interaction ────
  useEffect(() => {
    const unlock = () => {
      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
        return;
      }
      initAudioEngine();
    };

    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);

  // ─── Web Audio Engine Initialization ────
  const initAudioEngine = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      return audioContextRef.current;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    const ac = new AudioCtx();
    ac.resume();
    audioContextRef.current = ac;

    const master = ac.createGain();
    master.gain.value = isMutedRef.current ? 0 : 0.95;
    master.connect(ac.destination);
    masterGainRef.current = master;

    const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBufferRef.current = noiseBuf;

    const isSpatial = conditionRef.current === 'C2' || conditionRef.current === 'C4';

    // Ambient Night Insects Loop
    const insectPositions = [[-14, 1, 10], [14, 1, 10], [-14, 1, -14], [14, 1, -14]];
    insectPositions.forEach((pos, k) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();

      osc.frequency.value = 4300 + k * 260;
      gain.gain.value = 0.008;
      lfo.type = 'square';
      lfo.frequency.value = 9 + k * 1.7;
      lfoGain.gain.value = 0.007;

      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc.connect(gain);

      if (isSpatial) {
        try {
          const panner = ac.createPanner();
          panner.setPosition(pos[0], pos[1], pos[2]);
          panner.connect(master);
          gain.connect(panner);
        } catch (_) { gain.connect(master); }
      } else {
        gain.connect(master);
      }
      osc.start();
      lfo.start();
    });

    return ac;
  }, []);

  // ─── Play SFX Function ────
  const playSFX = useCallback((id, pos = [0, 1, 0]) => {
    if (isMutedRef.current) return;
    const ac = audioContextRef.current || initAudioEngine();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();

    const isSpatial = conditionRef.current === 'C2' || conditionRef.current === 'C4';
    let destNode = masterGainRef.current || ac.destination;

    if (isSpatial && pos) {
      try {
        const panner = ac.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 5;
        panner.rolloffFactor = 1;
        panner.maxDistance = 150;
        panner.setPosition(pos[0], pos[1], pos[2]);
        panner.connect(masterGainRef.current || ac.destination);
        destNode = panner;
      } catch (_) {}
    }

    const now = ac.currentTime;

    if (id === 'chime') {
      const freqs = [1568, 1976, 2349, 2637, 3136];
      freqs.forEach((f, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * (1 + 0.003 * i), now + i * 0.035);
        gain.gain.setValueAtTime(0.0001, now + i * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.22 / (1 + i * 0.4), now + i * 0.035 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.035 + 2.5 - i * 0.25);
        osc.connect(gain);
        gain.connect(destNode);
        osc.start(now + i * 0.035);
        osc.stop(now + i * 0.035 + 2.6);
      });
    } else if (id === 'lanternClick') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1300, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.05);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(destNode);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (id === 'flashClick') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2300, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(destNode);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (id === 'coverTink') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(3400, now);
      osc.frequency.exponentialRampToValueAtTime(2900, now + 0.28);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(destNode);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (id === 'coverSnap') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900, now);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(destNode);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (id === 'step') {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180 + Math.random() * 80, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(destNode);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }, [initAudioEngine]);

  // ─── Chrome-Safe Speech Narration ────
  const speakNarration = useCallback((text, who = 'narrator') => {
    setCaptionText(text);
    if (!text || !('speechSynthesis' in window) || isMutedRef.current) return;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.94;
      utt.pitch = who === 'aman' ? 0.8 : who === 'tara' ? 1.3 : 1.0;
      utt.lang = 'en-US';
      utt.volume = isMutedRef.current ? 0 : 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const v = voices.find(x => /^en[-_]IN/i.test(x.lang)) ||
                  voices.find(x => /^en[-_]US/i.test(x.lang) && /Samantha|Google|Natural|Neural|Victoria|Alex/i.test(x.name)) ||
                  voices.find(x => /^en/i.test(x.lang) && !/compact/i.test(x.name)) ||
                  voices.find(x => /^en/i.test(x.lang)) ||
                  voices[0];
        if (v) {
          utt.voice = v;
          utt.lang = v.lang;
        }
      }

      // Store in window array to prevent Chrome GC bug
      if (!window.__lanternUtterances) window.__lanternUtterances = [];
      window.__lanternUtterances.push(utt);

      utt.onend = () => {
        if (window.__lanternUtterances) {
          window.__lanternUtterances = window.__lanternUtterances.filter(u => u !== utt);
        }
      };

      utt.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('[LanternNarration] Speech error:', e.error);
        }
        if (window.__lanternUtterances) {
          window.__lanternUtterances = window.__lanternUtterances.filter(u => u !== utt);
        }
      };

      window.speechSynthesis.speak(utt);
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }, []);

  // ─── Build Combined Event Queue ────
  const buildEventQueue = useCallback(() => {
    const queue = [];
    AUDIO_CUES.forEach(c => {
      queue.push([c.t, () => {
        let pos = [0, 1, 0];
        if (c.id === 'chime') pos = [14, 2.4, 0];
        else if (c.id === 'coverTink') pos = [4.4, 0.1, -3.9];
        else if (c.at === 'aman' && worldRefs.current.aman) {
          pos = [worldRefs.current.aman.position.x, 1, worldRefs.current.aman.position.z];
        } else if (c.at === 'tara' && worldRefs.current.tara) {
          pos = [worldRefs.current.tara.position.x, 1, worldRefs.current.tara.position.z];
        }
        playSFX(c.id, pos);
      }]);
    });
    SCRIPT_LINES.forEach(l => {
      queue.push([l.t, () => speakNarration(l.text, l.who)]);
    });
    queue.sort((a, b) => a[0] - b[0]);
    return queue;
  }, [playSFX, speakNarration]);

  const eventQueueRef = useRef([]);
  useEffect(() => {
    eventQueueRef.current = buildEventQueue();
  }, [buildEventQueue]);

  // ─── Three.js Scene Setup ────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 960;
    const h = mount.clientHeight || 540;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#ff9d5c', 25, 120);
    sceneRef.current = scene;

    // 2. Camera & Rig
    const fov = condition === 'C4' ? 76 : 58;
    const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 450);
    const rig = new THREE.Group();
    rig.add(camera);
    scene.add(rig);
    camRef.current = camera;
    rigRef.current = rig;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.xr.enabled = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Check WebXR
    if (navigator.xr) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        setVrSupported(supported);
      }).catch(() => {});
    }

    // 4. Build 3D Garden Environment
    buildGardenWorld(scene, worldRefs);

    // 5. Gaze Reticle on Camera for C4
    if (condition === 'C4') {
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

      // WebXR 6-DOF Controller Lasers
      setupXRControllers(renderer, scene, worldRefs, handleDirect3DClick);
    }

    // 6. Smooth Animation & Render Loop
    let lastTime = performance.now();
    const animate = () => {
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Advance story time smoothly if playing
      if (playingRef.current && !waitingRef.current) {
        let nextTime = currentTimeRef.current + delta;

        // C3 Checkpoint Pause Check
        if (conditionRef.current === 'C3') {
          const cp = c3CheckpointsRef.current[cpIdxRef.current];
          if (cp && currentTimeRef.current < cp.at && nextTime >= cp.at) {
            nextTime = cp.at;
            setC3Waiting(true);
            waitingRef.current = true;
            setC3Prompt(cp.prompt || cp.label);
            c3StartTime.current = performance.now();
            c3Attempts.current = 0;
            eventLogger.log('CHECKPOINT_OPEN', {
              videoTimestamp: cp.at,
              checkpointIndex: cpIdxRef.current,
              label: cp.label
            });
          }
        }

        // Fire audio and speech events in sequence
        const queue = eventQueueRef.current;
        while (eventIdxRef.current < queue.length && queue[eventIdxRef.current][0] <= nextTime) {
          queue[eventIdxRef.current][1]();
          eventIdxRef.current++;
        }

        if (nextTime >= D) {
          nextTime = D;
          setPlaying(false);
          playingRef.current = false;
          eventLogger.log('VIDEO_COMPLETE', { videoTimestamp: D });
          if (onComplete) onComplete();
        }

        currentTimeRef.current = nextTime;
        setCurrentTime(nextTime);
      }

      const t = currentTimeRef.current;

      // Update 3D world elements, characters, lighting & props
      updateGardenWorld(t, delta, scene, worldRefs, conditionRef.current, firefliesActive);

      // Camera motion & orientation
      updateCameraMotion(t, delta, conditionRef.current, camera, rig, worldRefs, targetYaw, targetPitch, currentYaw, currentPitch, setCurrentHeading);

      // Head rotation event sampling for C4
      if (conditionRef.current === 'C4' && playingRef.current && now - lastHeadSample.current > HEAD_ROTATION_SAMPLE_MS) {
        lastHeadSample.current = now;
        eventLogger.log('HEAD_ROTATION', {
          videoTimestamp: t,
          extra: {
            yaw: (currentYaw.current * (180 / Math.PI)).toFixed(1),
            pitch: (currentPitch.current * (180 / Math.PI)).toFixed(1)
          }
        });
      }

      // C3 Screen Projector for active Checkpoint
      if (conditionRef.current === 'C3' && waitingRef.current) {
        updateC3CheckpointProjection(camera, mount, worldRefs, c3CheckpointsRef.current, cpIdxRef.current, tgIdxRef.current, setC3ButtonPos);
      }

      // C4 Gaze tracking & 3D object hover detection
      if (conditionRef.current === 'C4') {
        updateC4GazeTracking(t, delta, camera, worldRefs, gazeDwellTimes, gazeTriggerTimes, setGazeTarget, setGazeProgress, setInfoPanel, pulses, scene, playSFX);
        checkHoverInteractive(camera, worldRefs, setHoveredInteractive);
      }

      // Update expanding gold pulse rings
      updatePulses(delta, pulses, scene, camera);

      // Update Spatial Audio Listener
      updateSpatialAudioListener(camera, conditionRef.current, audioContextRef.current);

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    // Resize Handler
    const handleResize = () => {
      if (!mount) return;
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    // Pointer Drag Controls for C4
    const onPointerDown = (e) => {
      if (conditionRef.current !== 'C4') return;
      isPointerDown.current = true;
      pointerStartPos.current = { x: e.clientX, y: e.clientY };
      prevPointer.current = { x: e.clientX, y: e.clientY };
      try { mount.setPointerCapture(e.pointerId); } catch (_) {}
      mount.style.cursor = 'grabbing';
    };

    const onPointerMove = (e) => {
      if (!isPointerDown.current || conditionRef.current !== 'C4') return;
      const deltaX = e.clientX - prevPointer.current.x;
      const deltaY = e.clientY - prevPointer.current.y;

      targetYaw.current += deltaX * 0.0055;
      targetPitch.current = Math.max(-1.3, Math.min(1.3, targetPitch.current + deltaY * 0.0055));

      prevPointer.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e) => {
      if (conditionRef.current !== 'C4') return;
      isPointerDown.current = false;
      try {
        if (mount.hasPointerCapture(e.pointerId)) {
          mount.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
      mount.style.cursor = 'grab';

      const dist = Math.hypot(e.clientX - pointerStartPos.current.x, e.clientY - pointerStartPos.current.y);
      if (dist < 6) {
        handlePointerRaycastClick(e, camera, mount, worldRefs);
      }
    };

    // Keyboard Arrow / WASD Controls for C4
    const onKeyDown = (e) => {
      if (conditionRef.current !== 'C4') return;
      const step = 0.08;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        targetYaw.current += step;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        targetYaw.current -= step;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        targetPitch.current = Math.min(1.3, targetPitch.current + step);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        targetPitch.current = Math.max(-1.3, targetPitch.current - step);
      }
    };

    mount.style.touchAction = 'none';
    if (condition === 'C4') mount.style.cursor = 'grab';

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
      stopAudio();
    };
  }, [condition, firefliesActive]);

  const stopAudio = () => {
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // ─── Playback Controls ────
  const play = useCallback(async () => {
    if (playing) return;
    setPlaying(true);
    playingRef.current = true;
    initAudioEngine();
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    eventLogger.log(currentTimeRef.current === 0 ? 'VIDEO_START' : 'VIDEO_RESUME', { videoTimestamp: currentTimeRef.current });
  }, [playing, initAudioEngine]);

  const pause = useCallback(() => {
    if (!playing) return;
    setPlaying(false);
    playingRef.current = false;
    if (audioContextRef.current?.state === 'running') {
      audioContextRef.current.suspend();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    eventLogger.log('VIDEO_PAUSE', { videoTimestamp: currentTimeRef.current });
  }, [playing]);

  const seek = useCallback((time) => {
    eventLogger.log('VIDEO_SEEK', { videoTimestamp: time, from: currentTimeRef.current });
    currentTimeRef.current = time;
    setCurrentTime(time);

    // Update event queue index
    const queue = eventQueueRef.current;
    let idx = queue.findIndex(e => e[0] > time);
    eventIdxRef.current = idx < 0 ? queue.length : idx;

    // Reset C3 checkpoint tracking if seeking
    if (conditionRef.current === 'C3') {
      let cpIdx = c3CheckpointsRef.current.findIndex(c => c.at >= time);
      setC3CheckpointIdx(cpIdx < 0 ? c3CheckpointsRef.current.length : cpIdx);
      setC3TargetIdx(0);
      setC3Waiting(false);
      waitingRef.current = false;
    }

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setCaptionText('');
  }, []);

  const restart = useCallback(() => {
    seek(0);
    play();
  }, [seek, play]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    isMutedRef.current = next;
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = next ? 0 : 0.95;
    }
    if (next && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  // ─── C3 Cognitive Option Selection Handler ────
  const handleC3OptionSelect = (optionIdx) => {
    if (!waitingRef.current) return;
    const cp = c3CheckpointsRef.current[cpIdxRef.current];
    if (!cp) return;

    c3Attempts.current += 1;
    setC3SelectedOption(optionIdx);

    const isCorrect = (optionIdx === cp.correct);
    const durationMs = performance.now() - c3StartTime.current;

    if (isCorrect) {
      playSFX('sparkle', [0, 1, 0]);
      if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
      setC3Feedback({ correct: true, text: '✨ Correct! Great observation.' });

      eventLogger.log('CHECKPOINT_HIT', {
        videoTimestamp: currentTimeRef.current,
        checkpointIndex: cpIdxRef.current,
        target: cp.label,
        type: cp.type,
        selectedOption: cp.options ? cp.options[optionIdx] : optionIdx,
        attempts: c3Attempts.current,
        durationMs: Math.round(durationMs),
        correct: true
      });

      setTimeout(() => {
        setC3Waiting(false);
        waitingRef.current = false;
        setC3SelectedOption(null);
        setC3Feedback(null);
        setC3ShowHint(false);
        setC3CheckpointIdx(prev => prev + 1);
        cpIdxRef.current += 1;
        play();
      }, 1100);
    } else {
      playSFX('coverTink');
      if (navigator.vibrate) navigator.vibrate([100]);
      setC3Feedback({ correct: false, text: '❌ Not quite right. Take a closer look!' });
      setC3ShowHint(true);

      eventLogger.log('CHECKPOINT_ATTEMPT_FAILED', {
        videoTimestamp: currentTimeRef.current,
        checkpointIndex: cpIdxRef.current,
        selectedOption: cp.options ? cp.options[optionIdx] : optionIdx,
        correctOption: cp.options ? cp.options[cp.correct] : cp.correct,
        attemptNumber: c3Attempts.current
      });

      setTimeout(() => {
        setC3SelectedOption(null);
        setC3Feedback(null);
      }, 1400);
    }
  };

  // ─── C3 Interactive Checkpoint Button Click (Tap type) ────
  const handleC3TargetClick = () => {
    if (!waitingRef.current) return;
    c3Attempts.current += 1;
    const cp = c3CheckpointsRef.current[cpIdxRef.current];
    if (!cp) return;
    const durationMs = performance.now() - c3StartTime.current;

    playSFX('flashClick');
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

    const targetPos = resolveTarget(cp.targets[tgIdxRef.current], worldRefs);
    createExpandingPulse(targetPos, pulses, sceneRef.current);

    const nextTargetIdx = tgIdxRef.current + 1;
    if (nextTargetIdx >= cp.targets.length) {
      eventLogger.log('CHECKPOINT_HIT', {
        videoTimestamp: currentTimeRef.current,
        checkpointIndex: cpIdxRef.current,
        target: cp.targets[tgIdxRef.current],
        type: cp.type || 'tap',
        attempts: c3Attempts.current,
        durationMs: Math.round(durationMs),
        correct: true
      });
      setC3Waiting(false);
      waitingRef.current = false;
      setC3TargetIdx(0);
      tgIdxRef.current = 0;
      setC3CheckpointIdx(prev => prev + 1);
      cpIdxRef.current += 1;
      play();
    } else {
      setC3TargetIdx(nextTargetIdx);
      tgIdxRef.current = nextTargetIdx;
      eventLogger.log('CHECKPOINT_SUBTARGET_HIT', {
        videoTimestamp: currentTimeRef.current,
        checkpointIndex: cpIdxRef.current,
        targetIndex: nextTargetIdx
      });
    }
  };

  // ─── C4 Direct 3D Raycasting Click ────
  const handlePointerRaycastClick = (e, camera, mount, refs) => {
    const rect = mount.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // If waiting for C3 checkpoint, allow clicking target directly in 3D
    if (conditionRef.current === 'C3' && waitingRef.current) {
      const cp = c3CheckpointsRef.current[cpIdxRef.current];
      if (cp && cp.targets) {
        const curTarget = cp.targets[tgIdxRef.current];
        const targetPos = resolveTarget(curTarget, refs);
        const distToRay = raycaster.ray.distanceToPoint(targetPos);
        if (distToRay < 2.5) {
          handleC3TargetClick();
          return;
        }
      }
    }

    const interactiveList = [
      refs.current?.chimeMesh,
      refs.current?.pondMesh,
      refs.current?.amanMesh,
      refs.current?.taraMesh,
      refs.current?.lanternMesh,
      refs.current?.stoneMesh
    ].filter(Boolean);

    const hits = raycaster.intersectObjects(interactiveList, true);
    if (hits.length > 0) {
      let target = hits[0].object;
      while (target && !target.userData?.interactiveId && target.parent) target = target.parent;
      if (target && target.userData?.interactiveId) {
        handleDirect3DClick(target.userData.interactiveId);
      }
    }
  };

  const handleDirect3DClick = (id) => {
    if (!worldRefs.current.physicsImpulse) {
      worldRefs.current.physicsImpulse = { chime: 0, pond: 0, aman: 0, tara: 0, lantern: 0, stone: 0 };
    }
    const imp = worldRefs.current.physicsImpulse;

    if (id === 'chime') {
      imp.chime = 1.0;
      playSFX('chime', [14, 2.4, 0]);
      showDialog('Wind Chime', '🎐', '“Ting! The 5-tube aluminum chime rings melodiously and sways in the breeze.”');
      eventLogger.log('OBJECT_INTERACT', { objectId: 'wind_chime', action: 'ring_chime' });
    } else if (id === 'pond') {
      imp.pond = 1.0;
      playSFX('coverTink', [-9, 0.2, -2]);
      showDialog('Stone Pond', '💧', '“You touched the tranquil pond. Gentle water ripples spread across the surface.”');
      eventLogger.log('OBJECT_INTERACT', { objectId: 'pond', action: 'touch_pond' });
    } else if (id === 'aman') {
      imp.aman = 1.0;
      playSFX('lanternClick');
      showDialog('Aman', '👦', '“Aman: Once we fix the battery cover, we will have bright light to guide us home!”');
      eventLogger.log('OBJECT_INTERACT', { objectId: 'aman', action: 'talk_aman' });
    } else if (id === 'tara') {
      imp.tara = 1.0;
      playSFX('flashClick');
      showDialog('Tara', '👧', '“Tara: I am scanning the flower beds and pond with my phone flashlight!”');
      eventLogger.log('OBJECT_INTERACT', { objectId: 'tara', action: 'talk_tara' });
    } else if (id === 'lantern') {
      imp.lantern = 1.0;
      playSFX('sparkle', [0, 1, 0]);
      showDialog('Lantern', '🏮', '“Grandmother\'s lantern pulses with warm golden light!”');
      eventLogger.log('OBJECT_INTERACT', { objectId: 'lantern', action: 'inspect_lantern' });
    } else if (id === 'stone') {
      imp.stone = 1.0;
      playSFX('coverTink', [4.4, 0.1, -3.9]);
      showDialog('Garden Stone', '🪨', '“A smooth mossy garden stone beside the gravel path where the cover landed.”');
      eventLogger.log('OBJECT_INTERACT', { objectId: 'stone', action: 'inspect_stone' });
    }
  };

  const showDialog = (name, avatar, text) => {
    setCharacterDialog({ name, avatar, text });
    if (dialogTimeout.current) clearTimeout(dialogTimeout.current);
    dialogTimeout.current = setTimeout(() => setCharacterDialog(null), 4000);
  };

  const enterVR = async () => {
    if (!rendererRef.current || !vrSupported) return;
    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
      });
      rendererRef.current.xr.setSession(session);
      setInVR(true);
      inVRRef.current = true;
      session.addEventListener('end', () => {
        setInVR(false);
        inVRRef.current = false;
      });
      initAudioEngine();
      play();
    } catch (e) {
      console.warn('VR session request failed:', e);
    }
  };

  const enableGyro = async () => {
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') return;
      }
      setGyroActive(true);
      window.addEventListener('deviceorientation', (e) => {
        if (e.alpha == null) return;
        targetYaw.current = THREE.MathUtils.degToRad(e.alpha);
        targetPitch.current = THREE.MathUtils.degToRad(e.beta - 90);
      });
    } catch (_) {}
  };

  const rotateTo = (degLon, degLat = 0) => {
    targetYaw.current = THREE.MathUtils.degToRad(degLon);
    targetPitch.current = THREE.MathUtils.degToRad(degLat);
  };

  // Find active scene
  const curSceneIdx = SCENES.findIndex(s => currentTime >= s.t[0] && currentTime < s.t[1]);
  const activeScene = SCENES[curSceneIdx < 0 ? SCENES.length - 1 : curSceneIdx];

  return (
    <div className="kite-story-container" style={{ position: 'relative', width: '100%', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: showScriptPanel ? 'minmax(0, 1.7fr) minmax(0, 1fr)' : '1fr', gap: '16px', alignItems: 'start' }}>
        <section>
          {/* 16:9 3D Visual Stage */}
          <div
            className="stage"
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.15)',
              background: '#0a0a1a'
            }}
          >
            {/* 3D WebGL Canvas Mount */}
            <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

            {/* C3 Interactive Checkpoint Overlay */}
            {condition === 'C3' && c3Waiting && (() => {
              const activeCp = c3CheckpointsList[c3CheckpointIdx];
              if (!activeCp) return null;

              if (activeCp.type === 'choice' || activeCp.type === 'direction' || activeCp.type === 'sequence') {
                return (
                  <div className="c3-checkpoint-overlay">
                    <div className="c3-cognitive-modal">
                      <div className="c3-modal-header">
                        <span className="c3-badge">
                          ✨ Checkpoint {c3CheckpointIdx + 1} of {c3CheckpointsList.length}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                          {activeCp.type}
                        </span>
                      </div>

                      <h3 className="c3-modal-title">{activeCp.label}</h3>
                      <p className="c3-modal-prompt">{activeCp.question || activeCp.prompt}</p>

                      <div className="c3-options-grid">
                        {activeCp.options && activeCp.options.map((opt, optIdx) => {
                          const isSelected = c3SelectedOption === optIdx;
                          const isCorrect = isSelected && c3Feedback?.correct;
                          const isIncorrect = isSelected && !c3Feedback?.correct;
                          return (
                            <button
                              key={optIdx}
                              className={`c3-option-btn ${isSelected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'incorrect' : ''}`}
                              onClick={() => handleC3OptionSelect(optIdx)}
                              disabled={c3Feedback?.correct}
                            >
                              <span className="c3-option-key">{String.fromCharCode(65 + optIdx)}</span>
                              <span style={{ flex: 1 }}>{opt}</span>
                              {isCorrect && <span style={{ fontSize: '1.1rem' }}>✅</span>}
                              {isIncorrect && <span style={{ fontSize: '1.1rem' }}>❌</span>}
                            </button>
                          );
                        })}
                      </div>

                      {c3Feedback && (
                        <div className={`c3-feedback-banner ${c3Feedback.correct ? 'correct' : 'incorrect'}`}>
                          {c3Feedback.text}
                        </div>
                      )}

                      {c3ShowHint && activeCp.hint && (
                        <div className="c3-hint-box">
                          💡 <strong>Hint:</strong> {activeCp.hint}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div className="c3-checkpoint-overlay">
                  <div className="c3-prompt-banner">
                    <span className="pulse-icon">✨</span>
                    <span className="prompt-text">{c3Prompt || activeCp.prompt}</span>
                  </div>

                  {c3ButtonPos.visible && (
                    <button
                      className="c3-glowing-ring-btn"
                      style={{ left: `${c3ButtonPos.x}px`, top: `${c3ButtonPos.y}px` }}
                      onClick={handleC3TargetClick}
                      title="Click to interact"
                    >
                      <div className="ring-inner" />
                    </button>
                  )}
                </div>
              );
            })()}

            {/* C4 Hover Interactive Tooltip */}
            {condition === 'C4' && hoveredInteractive && (
              <div className="vr-interactive-cue">
                <span>👆 Click / Tap to {hoveredInteractive}</span>
              </div>
            )}

            {/* C4 Character Dialogue Banner */}
            {condition === 'C4' && characterDialog && (
              <div className="vr-dialogue-banner">
                <div className="dialogue-avatar">{characterDialog.avatar}</div>
                <div className="dialogue-content">
                  <span className="dialogue-name">{characterDialog.name}</span>
                  <p className="dialogue-text">{characterDialog.text}</p>
                </div>
              </div>
            )}

            {/* C4 Gaze Reticle Radial HUD */}
            {condition === 'C4' && gazeTarget && (
              <div className="gaze-reticle-hud">
                <svg width="70" height="70" viewBox="0 0 70 70">
                  <circle cx="35" cy="35" r="28" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3.5" />
                  <circle cx="35" cy="35" r="28" fill="none" stroke="#f59e0b" strokeWidth="4.5"
                    strokeDasharray={`${(gazeProgress / 100) * 175.9} 175.9`}
                    strokeLinecap="round"
                    style={{ transformOrigin: 'center', transform: 'rotate(-90deg)', transition: 'stroke-dasharray 0.05s linear' }} />
                </svg>
                <div className="gaze-target-title">
                  ✨ {gazeTarget.label}
                </div>
              </div>
            )}

            {/* C4 3D Hotspot Inspection Modal */}
            {condition === 'C4' && infoPanel && (
              <div className="vr-hotspot-label" onClick={() => setInfoPanel(null)}>
                <div className="hotspot-header">
                  <strong style={{ fontSize: '1.05rem', color: '#f59e0b' }}>🔍 {infoPanel.label}</strong>
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

            {/* C4 Compass & Spatial Radar */}
            {condition === 'C4' && (
              <div className="vr-compass-hud">
                <div className="compass-dial">
                  <div className="compass-arrow" style={{ transform: `rotate(${-currentHeading}deg)` }}>
                    <span className="compass-n">N</span>
                  </div>
                </div>
                <div className="compass-labels">
                  <span className="heading-text">360° Garden: {currentHeading}°</span>
                  <div className="radar-quick-targets">
                    <button className="radar-pill" onClick={() => rotateTo(0, 0)} title="Look at Path & House">🏡 House</button>
                    <button className="radar-pill" onClick={() => rotateTo(60, 0)} title="Look at Stone Pond">💧 Pond</button>
                    <button className="radar-pill" onClick={() => rotateTo(-60, 10)} title="Look at Wind Chime">🎐 Chime</button>
                    <button className="radar-pill" onClick={() => rotateTo(180, 0)} title="Look at Entrance Gate">🚪 Gate</button>
                  </div>
                </div>
              </div>
            )}

            {/* Subtitles Overlay */}
            {showSubtitles && captionText && (
              <div style={{
                position: 'absolute',
                bottom: '14px',
                left: '0',
                right: '0',
                textAlign: 'center',
                padding: '0 16px',
                pointerEvents: 'none',
                zIndex: 15
              }}>
                <span style={{
                  background: 'rgba(15, 23, 42, 0.88)',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 500,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  backdropFilter: 'blur(4px)'
                }}>
                  {captionText}
                </span>
              </div>
            )}
          </div>

          {/* Segment Timeline Progress Bar */}
          <div style={{ display: 'flex', gap: '4px', margin: '12px 0 6px' }}>
            {SCENES.map((s, i) => {
              const segStart = s.t[0];
              const segEnd = s.t[1];
              const flexVal = segEnd - segStart;
              const fillPct = Math.max(0, Math.min(1, (currentTime - segStart) / (segEnd - segStart))) * 100;
              return (
                <div
                  key={i}
                  title={`${s.n}. ${s.title}`}
                  onClick={() => seek(segStart)}
                  style={{
                    flex: flexVal,
                    height: '8px',
                    background: 'rgba(255,255,255,0.18)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ height: '100%', width: `${fillPct}%`, background: '#f59e0b', transition: 'width 0.1s linear' }} />
                </div>
              );
            })}
          </div>

          {/* Current Segment Label */}
          <p style={{ color: 'var(--mut, #94a3b8)', minHeight: '22px', margin: '0 0 12px', fontSize: '0.9rem' }}>
            <strong>{formatTime(activeScene.t[0])}–{formatTime(activeScene.t[1])}</strong> &nbsp;{activeScene.n}. {activeScene.title}: {activeScene.visual}
          </p>

          {/* Unified Controls Toolbar */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="control-btn play-btn"
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background: playing ? '#f59e0b' : '#3b82f6',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
              onClick={playing ? pause : play}
            >
              {currentTime >= D ? '🔄 Replay' : playing ? '⏸ Pause' : '▶ Play'}
            </button>

            <button
              className="control-btn"
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.1)',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer'
              }}
              onClick={restart}
            >
              Restart
            </button>

            <button
              className="control-btn"
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)',
                color: 'inherit',
                border: '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer'
              }}
              onClick={toggleMute}
            >
              {isMuted ? '🔇 Unmute' : '🔊 Mute'}
            </button>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={showSubtitles}
                onChange={(e) => setShowSubtitles(e.target.checked)}
              />
              Show subtitles
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={showScriptPanel}
                onChange={(e) => setShowScriptPanel(e.target.checked)}
              />
              Script panel
            </label>

            {condition === 'C4' && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="checkbox"
                    checked={firefliesActive}
                    onChange={(e) => setFirefliesActive(e.target.checked)}
                  />
                  Fireflies
                </label>

                {vrSupported && !inVR && (
                  <button
                    className="control-btn"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.2)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                    onClick={enterVR}
                  >
                    🥽 Enter VR
                  </button>
                )}

                {!gyroActive && typeof window !== 'undefined' && 'ontouchstart' in window && (
                  <button
                    className="control-btn"
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'inherit',
                      border: '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer'
                    }}
                    onClick={enableGyro}
                  >
                    📱 Phone Motion
                  </button>
                )}
              </>
            )}

            <span style={{ marginLeft: 'auto', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.95rem' }}>
              {formatTime(currentTime)} / {formatTime(D)}
            </span>
          </div>

          <small style={{ color: 'var(--mut, #94a3b8)', display: 'block', marginTop: '10px' }}>
            {condition === 'C2'
              ? '🎧 Spatial Audio enabled: ambient garden sounds, wind chime, and footsteps pan dynamically in 3D.'
              : condition === 'C3'
              ? '✋ Interactive mode: story automatically pauses at key moments for your physical interaction.'
              : condition === 'C4'
              ? '🥽 VR Immersive: 360° user look (drag or headset), gaze dwell glints, and direct 3D object interactions.'
              : '🔊 Live synthesized acoustic soundscape and full story speech narration.'}
          </small>
        </section>

        {/* Optional Side Script Panel */}
        {showScriptPanel && (
          <aside style={{
            background: 'var(--panel, #171e2c)',
            border: '1px solid var(--line, #2b3548)',
            borderRadius: '8px',
            padding: '12px',
            maxHeight: '540px',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: 'var(--fg, #ece8dd)' }}>Story Scenes & Dialogue</h3>
            {SCENES.map((s, idx) => (
              <article
                key={s.n}
                onClick={() => seek(s.t[0])}
                style={{
                  borderLeft: `3px solid ${idx === curSceneIdx ? '#f59e0b' : 'var(--line, #2b3548)'}`,
                  background: idx === curSceneIdx ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                  padding: '8px 10px',
                  marginBottom: '8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong style={{ fontSize: '0.9rem', color: idx === curSceneIdx ? '#f59e0b' : 'inherit' }}>
                    {s.n}. {s.title}
                  </strong>
                  <small style={{ color: 'var(--mut, #94a3b8)', fontSize: '0.75rem' }}>
                    {formatTime(s.t[0])}–{formatTime(s.t[1])}
                  </small>
                </div>
                <p style={{ margin: '4px 0', fontSize: '0.8rem', color: 'var(--mut, #94a3b8)', lineHeight: 1.4 }}>
                  {s.visual}
                </p>
                <small style={{ color: '#38bdf8', display: 'block', fontSize: '0.72rem' }}>
                  Tests: {s.testable.join(', ')}
                </small>
              </article>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Math Helpers ─────────────────────────────────────────────────────
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ss = x => { const c = cl(x); return c * c * (3 - 2 * c); };
const lerp = (a, b, u) => a + (b - a) * u;
const V = a => new THREE.Vector3(a[0], a[1], a[2]);

function wp(a, t) {
  if (t <= a[0][0]) return [a[0][1], a[0][2]];
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i][0]) {
      const p = a[i - 1], q = a[i], u = (t - p[0]) / (q[0] - p[0]);
      return [lerp(p[1], q[1], u), lerp(p[2], q[2], u)];
    }
  }
  const e = a[a.length - 1];
  return [e[1], e[2]];
}

function kf(a, t) {
  let i = 0;
  while (i < a.length - 2 && a[i + 1][0] < t) i++;
  const p = a[i], q = a[i + 1];
  return [p, q, ss((t - p[0]) / (q[0] - p[0]))];
}

const lin1 = (a, t) => {
  if (t <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i][0]) {
      const p = a[i - 1], q = a[i];
      return lerp(p[1], q[1], (t - p[0]) / (q[0] - p[0]));
    }
  }
  return a[a.length - 1][1];
};

const inI = (a, t) => a.some(r => t >= r[0] && t < r[1]);

// ─── Keyframe Camera & Motion Paths ───────────────────────────────────
const CAMERA_KF = [
  [0, 8, 4, 24, [0, 2, -8]],
  [25, 4, 2.6, 16, [0, 2, -6]],
  [27, 6, 1.7, 12, [0, 1.2, 20]],
  [45, 3, 1.7, 10, [-1, 1.1, 10]],
  [50, 1.5, 1.5, 11.5, [-3, 0.9, 6.5]],
  [65, 0.2, 1.0, 9.5, [-4, 0.8, 6]],
  [78, -1, 1.7, 10, [-3, 1.2, 7]],
  [88, -6, 1.8, 9, [10, 1.6, 3]],
  [100, 4, 1.7, 6, [3, 1.2, 1]],
  [112, 2, 3.6, 6, [0, 1, -4]],
  [130, 2, 3.2, 5, [0, 1, -5]],
  [140, 3.5, 1.7, 3.5, 'A'],
  [150, 3, 2, 2, [1, 1.2, -4]],
  [162, 1.6, 1.6, -0.6, 'L'],
  [168, 0.9, 1.35, -1.1, 'L'],
  [190, 1.0, 1.4, -1.0, 'L'],
  [198, 4, 2.4, 3, [0, 0.5, -2]],
  [212, 3, 2.2, 3, [-4, 0.5, 3]],
  [224, 1, 1.8, 2, [4, 0.4, -3.5]],
  [236, 2.2, 1.0, -0.2, 'C'],
  [248, 3, 1.6, -0.5, [3, 1, -3]],
  [256, 2.0, 1.4, -0.8, 'L'],
  [270, 1.9, 1.5, -0.9, 'L'],
  [276, 0.5, 2.2, 2, 'A'],
  [281, 3.5, 1.8, 3.5, 'A'],
  [292, 1, 1.9, -8, [0, 1.2, -20]],
  [300, 0.5, 1.9, -12, [0, 1.2, -22]]
];

const RAIL_KF = [
  [0, 4, 1.6, 14],
  [25, 4, 1.6, 14],
  [50, 1, 1.6, 10],
  [80, 1, 1.6, 10],
  [105, 6, 1.6, 3],
  [135, 4, 1.6, 0.5],
  [165, 2.5, 1.6, -0.6],
  [195, 2.5, 1.6, -0.6],
  [225, 5, 1.6, 0],
  [255, 2.5, 1.6, -1],
  [280, 0, 1.6, -2],
  [300, 0, 1.6, -8]
];

const AMAN_WP = [
  [0, 0, 40], [25, 0, 23.2], [50, -2, 7.5], [80, -2, 7.5], [105, 0.5, 1],
  [110, 0.5, 1], [120, -5.5, -1.5], [130, -5.5, -1.5], [142, -3, -2.6],
  [150, -1, -3], [196, -1, -3], [208, -3.5, 5.5], [218, -5.3, -1],
  [225, -1, -1.8], [230, -1, -1.8], [238, 3.2, -2.8], [280, 3.2, -2.8],
  [285, 0.5, -6], [298, 0, -19], [300, 0, -20]
];

const TARA_WP = [
  [0, 1.2, 41], [25, 1.2, 23.8], [50, -0.8, 7.2], [80, -0.8, 7.2], [105, 2.2, 1.6],
  [110, 2.2, 1.6], [124, 8, -8.2], [132, 8, -8.2], [150, 1.4, -4.2],
  [196, 1.4, -4.2], [206, -2.4, 5], [216, -4, -0.5], [224, 2.5, -2.2],
  [280, 2.5, -2.2], [285, 1, -6], [298, 0.8, -19], [300, 0.8, -20.5]
];

const NIGHT_SCHEDULE = [
  [0, 0], [25, 0.25], [100, 0.5], [135, 0.6], [150, 0.85], [300, 0.95]
];

const LANTERN_ON_TIMES = [[25, 142], [268, 300]];
const FLASH_ON_TIMES = [[197, 270]];
const COVER_EVENTS = { loose: 165, falls: 173, landsByStone: 176, pickedUp: 235, refitted: 258 };

const TARGETS = {
  gate: [0, 1.2, 22],
  flowers: [-4, 0.7, 6],
  butterflies: [-4, 0.9, 6],
  pond: [-9, 0.2, -2],
  chime: [14, 2.4, 0],
  stone: [4.2, 0.5, -3.6],
  veg: [9, 0.5, -9],
  path: [0, 0.3, -1.5],
  house: [0, 3, -24]
};

// ─── 3D Garden World Builder ──────────────────────────────────────────
function buildGardenWorld(scene, refs) {
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (g, c, x, y, z, p = scene) => {
    const m = new THREE.Mesh(g, typeof c === 'string' ? mat(c) : c);
    m.position.set(x, y, z);
    p.add(m);
    return m;
  };

  let sd = 7;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;

  // Sky Dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, bot; varying vec3 p; void main(){ float h = clamp(normalize(p).y * 1.7 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bot, top, pow(h, 0.7)), 1.0); }'
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), skyMat));
  refs.current.skyMat = skyMat;

  const sunM = add(new THREE.SphereGeometry(11, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffd9a0', fog: false }), 0, 0, 0);
  const moonM = add(new THREE.SphereGeometry(7, 16, 12), new THREE.MeshBasicMaterial({ color: '#f3f6ff', fog: false, transparent: true, opacity: 0 }), 60, 90, -200);
  refs.current.sunM = sunM;
  refs.current.moonM = moonM;

  // Stars
  const sp = [];
  for (let i = 0; i < 500; i++) {
    const a = rnd() * 6.28, e = 0.08 + rnd() * 1.4;
    sp.push(Math.cos(a) * Math.cos(e) * 280, Math.sin(e) * 280, Math.sin(a) * Math.cos(e) * 280);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);
  refs.current.stars = stars;

  // Lights
  const hemi = new THREE.HemisphereLight('#cfe3ff', '#6b5a3a', 1);
  const dir = new THREE.DirectionalLight('#ffb070', 1.2);
  dir.castShadow = true;
  scene.add(hemi, dir);
  refs.current.hemi = hemi;
  refs.current.dir = dir;

  // Ground & Sand Walkway
  add(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), '#3e7a38', 0, 0, 0);
  add(new THREE.PlaneGeometry(3.2, 46).rotateX(-Math.PI / 2), '#cbb58a', 0, 0.02, -1);

  // Instanced Grass
  const gl = [];
  for (let i = 0; i < 800; i++) {
    const x = (rnd() - 0.5) * 90, z = (rnd() - 0.5) * 80 - 5;
    if (Math.abs(x) < 1.9 && z < 23 && z > -22) continue;
    if (Math.hypot(x + 9, z + 2) < 4.6) continue;
    gl.push([x, 0.2, z, 0.6 + rnd() * 0.8, ['#4c9a42', '#3f8a3a', '#5aa84a'][i % 3]]);
  }
  const grassMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.45, 4), new THREE.MeshLambertMaterial(), gl.length);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < gl.length; i++) {
    dummy.position.set(gl[i][0], gl[i][1], gl[i][2]);
    dummy.scale.setScalar(gl[i][3]);
    dummy.rotation.y = rnd() * 6;
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);
    grassMesh.setColorAt(i, col.set(gl[i][4]));
  }
  scene.add(grassMesh);

  // Flower Beds & Giant Sunflower
  add(new THREE.CylinderGeometry(0.03, 0.04, 0.7, 6), '#3c8a3a', -4, 0.35, 6);
  add(new THREE.SphereGeometry(0.22, 10, 8), '#ffd23f', -4, 0.72, 6);
  add(new THREE.SphereGeometry(0.1, 8, 6), '#a0522d', -4, 0.9, 6);

  // Trees
  [[-22, 10], [-24, -4], [-20, -16], [22, 12], [24, -2], [20, -18], [-12, -27], [14, -27], [-30, 22], [28, 22], [-9, 26], [12, 28]].forEach(([x, z], i) => {
    const s = 1 + 0.3 * Math.sin(i * 2);
    add(new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 4 * s, 8), '#6e4a2c', x, 2 * s, z);
    add(new THREE.IcosahedronGeometry(2.6 * s, 0), '#2f7d3a', x, 5.4 * s, z);
    add(new THREE.IcosahedronGeometry(1.9 * s, 0), '#3a8c44', x + 1.2 * s, 4.4 * s, z + 0.8 * s);
  });

  // Grandmother's House
  add(new THREE.BoxGeometry(14, 7, 8), '#e9d8b4', 0, 3.5, -24);
  const roof = add(new THREE.ConeGeometry(11, 4, 4).rotateY(Math.PI / 4), '#9c4a32', 0, 9, -24);
  roof.scale.z = 0.75;
  add(new THREE.BoxGeometry(1.6, 2.6, 0.12), '#5a3a22', 0, 1.3, -19.95);
  const winM = new THREE.MeshBasicMaterial({ color: '#3a3a3a' });
  [-4, 4].forEach(x => add(new THREE.BoxGeometry(1.8, 1.6, 0.12), winM, x, 3.6, -19.95));
  refs.current.winM = winM;

  // Gate, Pond, Vegetable Patch, Stone, Wind Chime
  [-1.6, 1.6].forEach(x => add(new THREE.BoxGeometry(0.3, 2.2, 0.3), '#7a5230', x, 1.1, 22));
  add(new THREE.BoxGeometry(3.5, 0.25, 0.3), '#7a5230', 0, 2.3, 22);

  const pondMesh = add(new THREE.CircleGeometry(4, 36).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#2e6f9e', transparent: true, opacity: 0.92 }), -9, 0.04, -2);
  pondMesh.userData = { interactiveId: 'pond', interactiveLabel: 'Touch Pond Water' };
  refs.current.pondMesh = pondMesh;

  const rip = [0, 1].map(() => add(new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#bfe3ff', transparent: true, opacity: 0 }), -8, 0.06, -1.5));
  refs.current.rip = rip;

  add(new THREE.PlaneGeometry(6, 5).rotateX(-Math.PI / 2), '#5a3b22', 9, 0.03, -9);

  const stone = add(new THREE.DodecahedronGeometry(0.8), '#8a8a8a', 4.2, 0.45, -3.6);
  stone.scale.set(1.3, 0.7, 1);
  stone.userData = { interactiveId: 'stone', interactiveLabel: 'Inspect Garden Stone' };
  refs.current.stoneMesh = stone;

  // Wind Chime
  add(new THREE.CylinderGeometry(0.07, 0.09, 3.1, 8), '#6b4a2b', 14, 1.55, 0);
  const chimeGroup = new THREE.Group();
  chimeGroup.position.set(14, 3, 0);
  scene.add(chimeGroup);
  add(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 16), '#b08d57', 0, 0, 0, chimeGroup);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28;
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.8 + 0.1 * (i % 3), 8), '#c9ced6', Math.cos(a) * 0.32, -0.55, Math.sin(a) * 0.32, chimeGroup);
  }
  chimeGroup.userData = { interactiveId: 'chime', interactiveLabel: 'Ring Wind Chime' };
  refs.current.chimeGroup = chimeGroup;
  refs.current.chimeMesh = chimeGroup;

  // Characters: Aman & Tara
  const aman = createPerson('#2f6fdd', '#2a1b12', 1.0, false, scene);
  const tara = createPerson('#e0568c', '#1a120d', 0.88, true, scene);
  aman.group.userData = { interactiveId: 'aman', interactiveLabel: 'Talk to Aman' };
  tara.group.userData = { interactiveId: 'tara', interactiveLabel: 'Talk to Tara' };
  refs.current.aman = aman.group;
  refs.current.tara = tara.group;
  refs.current.amanMesh = aman.group;
  refs.current.taraMesh = tara.group;
  refs.current.actors = {
    aman: { P: aman, wp: AMAN_WP, ns: 0, yaw: Math.PI },
    tara: { P: tara, wp: TARA_WP, ns: 0, yaw: Math.PI }
  };

  // Lantern
  const L = new THREE.Group();
  const glass = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 12), glass, 0, 0, 0, L);
  add(new THREE.CylinderGeometry(0.05, 0.13, 0.07, 12), '#2a2a2a', 0, 0.165, 0, L);
  add(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12), '#2a2a2a', 0, -0.155, 0, L);
  add(new THREE.TorusGeometry(0.07, 0.01, 6, 12, Math.PI), '#2a2a2a', 0, 0.2, 0, L);
  const lLight = new THREE.PointLight('#ffb866', 0, 22, 1.5);
  L.add(lLight);
  aman.hand.add(L);
  L.position.set(0, -0.16, 0.02);
  L.userData = { interactiveId: 'lantern', interactiveLabel: 'Inspect Lantern' };
  refs.current.L = L;
  refs.current.lanternMesh = L;
  refs.current.lLight = lLight;
  refs.current.glass = glass;

  // Tara's Phone & Flashlight Spot
  const phoneM = new THREE.MeshBasicMaterial({ color: '#222' });
  const phone = add(new THREE.BoxGeometry(0.07, 0.14, 0.012), phoneM, 0, -0.04, 0.05, tara.hand);
  const spot = new THREE.SpotLight('#fff3d6', 0, 20, 0.38, 0.5, 1.2);
  scene.add(spot, spot.target);
  refs.current.phone = phone;
  refs.current.phoneM = phoneM;
  refs.current.spot = spot;

  // Detachable Battery Cover
  const coverM = add(new THREE.BoxGeometry(0.15, 0.1, 0.02), '#9aa0aa', 0, -1, 0);
  refs.current.coverM = coverM;

  // Butterflies
  const bf1 = createButterfly('#ff9f1c', scene);
  const bf2 = createButterfly('#3aa0ff', scene);
  refs.current.butterflies = [bf1, bf2];

  // Fireflies for C4
  const FFn = 70;
  const ffp = new Float32Array(FFn * 3);
  const ffb = [];
  for (let i = 0; i < FFn; i++) {
    ffb.push([(rnd() - 0.5) * 40, 0.4 + rnd() * 2.4, (rnd() - 0.5) * 40 - 4, rnd() * 6]);
  }
  const ffg = new THREE.BufferGeometry();
  ffg.setAttribute('position', new THREE.BufferAttribute(ffp, 3));
  const firefliesMesh = new THREE.Points(ffg, new THREE.PointsMaterial({ color: '#e9ff8a', size: 0.16, transparent: true, opacity: 0, depthWrite: false }));
  firefliesMesh.frustumCulled = false;
  scene.add(firefliesMesh);
  refs.current.firefliesMesh = firefliesMesh;
  refs.current.ffb = ffb;
  refs.current.ffp = ffp;
  refs.current.ffg = ffg;
}

// ─── Character Creation Helper ────────────────────────────────────────
function createPerson(shirtColor, hairColor, scale, isTara, scene) {
  const g = new THREE.Group();
  scene.add(g);
  g.scale.setScalar(scale);

  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, c, x, y, z, p = g) => {
    const m = new THREE.Mesh(geo, typeof c === 'string' ? mat(c) : c);
    m.position.set(x, y, z);
    p.add(m);
    return m;
  };

  const limb = (w, h, c, x, y) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    g.add(p);
    add(new THREE.BoxGeometry(w, h, w).translate(0, -h / 2, 0), c, 0, 0, 0, p);
    return p;
  };

  const lL = limb(0.14, 0.75, '#2b3042', -0.1, 0.75);
  const lR = limb(0.14, 0.75, '#2b3042', 0.1, 0.75);
  add(new THREE.BoxGeometry(0.4, 0.55, 0.22), shirtColor, 0, 1.02, 0);
  if (isTara) add(new THREE.CylinderGeometry(0.16, 0.32, 0.42, 10), shirtColor, 0, 0.78, 0);

  const aL = limb(0.1, 0.5, '#f0b98d', -0.27, 1.27);
  const aR = limb(0.1, 0.5, '#f0b98d', 0.27, 1.27);

  add(new THREE.SphereGeometry(0.15, 12, 10), '#f0b98d', 0, 1.5, 0);
  add(new THREE.SphereGeometry(0.16, 12, 8, 0, 6.29, 0, 1.7), hairColor, 0, 1.53, -0.01);

  const hand = new THREE.Group();
  hand.position.set(0, -0.5, 0.04);
  aR.add(hand);

  const hand2 = new THREE.Group();
  hand2.position.set(0, -0.5, 0.04);
  aL.add(hand2);

  return { group: g, lL, lR, aL, aR, hand, hand2 };
}

function createButterfly(color, scene) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const pg = new THREE.PlaneGeometry(0.15, 0.11).rotateX(-Math.PI / 2).translate(0.075, 0, 0);

  g.w1 = new THREE.Group();
  g.w1.add(new THREE.Mesh(pg, m));
  g.w2 = new THREE.Group();
  g.w2.add(new THREE.Mesh(pg, m));
  g.w2.scale.x = -1;
  g.add(g.w1, g.w2);
  scene.add(g);
  return g;
}

// ─── World Physics & Animation Updates ────────────────────────────────
const cDT = new THREE.Color('#4a6fb0');
const cNT = new THREE.Color('#050a1e');
const cDB = new THREE.Color('#ff9d5c');
const cNB = new THREE.Color('#142044');
const wDay = new THREE.Color('#3a3a3a');
const wNight = new THREE.Color('#ffd890');
const tmpC = new THREE.Color();
const BR = [[-4.1, 0.98, 6.05], [-3.85, 0.92, 5.9]];
const STN = new THREE.Vector3(4.45, 0.06, -3.95);

function updateGardenWorld(t, dt, scene, refs, cond, firefliesActive) {
  const r = refs.current;
  if (!r.skyMat) return;

  // 1. Sky & Sun/Moon Transition
  const n = lin1(NIGHT_SCHEDULE, t);
  r.skyMat.uniforms.top.value.copy(cDT).lerp(cNT, n);
  r.skyMat.uniforms.bot.value.copy(cDB).lerp(cNB, n);
  scene.fog.color.copy(r.skyMat.uniforms.bot.value);
  scene.fog.far = lerp(130, 70, n);

  r.sunM.position.set(-60, lerp(40, -30, ss(t / 80)), -230);
  r.dir.position.copy(r.sunM.position);
  r.dir.intensity = 1.25 * cl(1 - n * 1.15, 0.04, 1);
  r.dir.color.set('#ffb070').lerp(tmpC.set('#6677aa'), n);
  r.hemi.intensity = lerp(1, 0.3, n);

  r.moonM.material.opacity = cl((n - 0.4) * 3);
  r.stars.material.opacity = cl((n - 0.5) * 2.5);
  r.winM.color.copy(wDay).lerp(wNight, n);

  // 2. Character Movement & Posing
  updateActor('aman', t, refs);
  updateActor('tara', t, refs);
  scene.updateMatrixWorld();

  // 3. Battery Cover Physics
  updateCoverPhysics(t, refs);

  // 4. Lantern Glow & Flicker
  const on = inI(LANTERN_ON_TIMES, t);
  const targetInt = on ? 2.2 * (1 + 0.06 * Math.sin(t * 23) + 0.04 * Math.sin(t * 37)) : 0;
  r.lLight.intensity += (targetInt - r.lLight.intensity) * 0.35;
  r.glass.color.set(on ? '#ffd27a' : '#2c2c2c');

  // 5. Flashlight Spot
  const fon = inI(FLASH_ON_TIMES, t);
  r.phoneM.color.set(fon ? '#dfefff' : '#222');
  r.spot.intensity += ((fon ? 2.4 : 0) - r.spot.intensity) * 0.4;
  r.actors.tara.P.hand.getWorldPosition(r.spot.position);
  const targetPos = (t >= 224 && t < 258) ? r.coverM.position : r.actors.tara.P.group.position.clone().add(new THREE.Vector3(Math.sin(r.actors.tara.yaw) * 3, 0, Math.cos(r.actors.tara.yaw) * 3));
  r.spot.target.position.copy(targetPos);

  // 6. Butterflies Flutter
  if (r.butterflies) {
    r.butterflies.forEach((b, i) => {
      b.visible = t >= 48 && t < 106;
      const origin = BR[i];
      const flap = t < 96 ? 0.9 + 0.5 * Math.sin(t * 3 + i * 2) : 1.0 * Math.sin(t * 26);
      const u = ss((t - 96) / 10);
      b.position.set(origin[0] + u * u * (i ? 5 : -4) + Math.sin(t * 2 + i) * 0.3 * u, origin[1] + u * 7, origin[2] + u * (i ? -6 : -4));
      b.rotation.y = t < 96 ? i * 1.5 : Math.atan2(i ? 5 : -4, i ? -6 : -4);
      b.w1.rotation.z = flap;
      b.w2.rotation.z = -flap;
    });
  }

  // 7. Wind Chime Sway
  if (r.chimeGroup) {
    const sway = 0.04 + 0.22 * Math.exp(-(((t - 84) / 4) ** 2)) + 0.22 * Math.exp(-(((t - 288) / 4) ** 2));
    r.chimeGroup.rotation.x = Math.sin(t * 2.1) * sway;
    r.chimeGroup.rotation.z = Math.sin(t * 1.7 + 1) * sway;
  }

  // 8. Pond Ripples
  if (r.rip) {
    r.rip.forEach((ring, i) => {
      const u = ((t * 0.35 + i * 0.5) % 1);
      ring.scale.setScalar(0.3 + u * 3.2);
      ring.material.opacity = (1 - u) * 0.35;
    });
  }

  // 9. Drifting Fireflies in C4
  if (r.firefliesMesh) {
    const ffOn = cond === 'C4' && firefliesActive;
    r.firefliesMesh.visible = ffOn;
    if (ffOn) {
      r.firefliesMesh.material.opacity = cl(n * 1.4 - 0.2);
      for (let i = 0; i < 70; i++) {
        const b = r.ffb[i];
        r.ffp[i * 3] = b[0] + Math.sin(t * 0.4 + b[3]) * 1.5;
        r.ffp[i * 3 + 1] = b[1] + Math.sin(t * 0.9 + b[3] * 2) * 0.4;
        r.ffp[i * 3 + 2] = b[2] + Math.cos(t * 0.35 + b[3]) * 1.5;
      }
      r.ffg.attributes.position.needsUpdate = true;
    }
  }

  // 10. Dynamic Physical Impulses for Interactive Objects (C4 & Click Interactions)
  if (r.physicsImpulse) {
    const imp = r.physicsImpulse;
    if (r.chimeGroup && imp.chime > 0.01) {
      r.chimeGroup.rotation.x += Math.sin(t * 16) * imp.chime * 0.45;
      r.chimeGroup.rotation.z += Math.cos(t * 14) * imp.chime * 0.35;
    }
    if (r.actors?.aman && imp.aman > 0.01) {
      r.actors.aman.P.group.position.y += Math.abs(Math.sin(t * 14)) * imp.aman * 0.35;
      r.actors.aman.P.aR.rotation.x -= imp.aman * 0.6;
    }
    if (r.actors?.tara && imp.tara > 0.01) {
      r.actors.tara.P.group.position.y += Math.abs(Math.sin(t * 14)) * imp.tara * 0.3;
      r.actors.tara.P.aR.rotation.x -= imp.tara * 0.5;
    }
    if (r.lLight && imp.lantern > 0.01) {
      r.lLight.intensity += imp.lantern * 6.0;
    }
    if (r.stoneMesh && imp.stone > 0.01) {
      r.stoneMesh.rotation.y += imp.stone * 0.08;
      r.stoneMesh.position.y = 0.45 + Math.abs(Math.sin(t * 12)) * imp.stone * 0.15;
    }

    // Smooth exponential decay of impulses
    imp.chime *= 0.94;
    imp.pond *= 0.94;
    imp.aman *= 0.94;
    imp.tara *= 0.94;
    imp.lantern *= 0.94;
    imp.stone *= 0.94;
  }
}

function updateActor(name, t, refs) {
  const a = refs.current.actors[name];
  const P = a.P;
  const [x, z] = wp(a.wp, t);
  const [x2, z2] = wp(a.wp, t + 0.25);
  const vx = (x2 - x) / 0.25;
  const vz = (z2 - z) / 0.25;
  const v = Math.hypot(vx, vz);

  P.group.position.set(x, 0, z);
  P.group.visible = z < 24.5;

  let desYaw;
  if (v > 0.08) {
    desYaw = Math.atan2(vx, vz);
  } else {
    let faceTarget = wp(refs.current.actors[name === 'aman' ? 'tara' : 'aman'].wp, t);
    desYaw = Math.atan2(faceTarget[0] - x, faceTarget[1] - z);
  }

  let deltaYaw = desYaw - a.yaw;
  deltaYaw = Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw));
  a.yaw += deltaYaw * 0.12;
  P.group.rotation.y = a.yaw;

  const swing = v > 0.08 ? Math.sin(t * 7) * 0.5 : 0;
  P.lL.rotation.x = swing;
  P.lR.rotation.x = -swing;
  P.aL.rotation.x = -swing * 0.8;
  P.aR.rotation.x = swing * 0.8;

  if (name === 'aman') {
    P.aR.rotation.x = (t >= 165 && t < 192) ? -1.1 + 0.12 * Math.sin(t * 2) : -0.6;
    refs.current.L.rotation.x = -P.aR.rotation.x;
    refs.current.L.rotation.y = (t >= 168 && t < 190) ? Math.sin((t - 168) * 1.2) * 1.3 : 0;
    if (t >= 52 && t < 58) P.aL.rotation.x = -1.5;
    else if (t >= 235 && t < 258) P.aL.rotation.x = -0.9;
  } else {
    refs.current.phone.visible = t >= 194 && t < 272;
    P.aR.rotation.x = (t >= 226 && t < 232) ? -1.5 : (t >= 197 && t < 270) ? -1.25 : swing * 0.8;
    refs.current.phone.rotation.x = -P.aR.rotation.x * 0.5;
  }
}

function updateCoverPhysics(t, refs) {
  const r = refs.current;
  const E = COVER_EVENTS;
  const p = r.coverM.position;
  const lq = new THREE.Quaternion();
  r.L.getWorldQuaternion(lq);

  const getLanternAttachPos = () => r.L.localToWorld(new THREE.Vector3(0, -0.17, -0.12));
  const hp = new THREE.Vector3();
  r.actors.aman.P.hand2.getWorldPosition(hp);

  if (t < E.loose) {
    p.copy(getLanternAttachPos());
    r.coverM.quaternion.copy(lq);
  } else if (t < E.falls) {
    p.copy(getLanternAttachPos());
    p.x += 0.03 * Math.sin(t * 9);
    r.coverM.quaternion.copy(lq);
    r.coverM.rotateZ(0.5 + 0.2 * Math.sin(t * 9));
  } else if (t < E.landsByStone) {
    const u = (t - E.falls) / (E.landsByStone - E.falls);
    p.copy(getLanternAttachPos()).lerp(STN, u);
    p.y += 1.1 * 4 * u * (1 - u);
    r.coverM.rotation.set(u * 9, u * 6, 0);
  } else if (t < E.pickedUp) {
    p.copy(STN);
    r.coverM.rotation.set(-Math.PI / 2, 0, 0.5);
  } else if (t < E.pickedUp + 4) {
    p.copy(STN).lerp(hp, ss((t - E.pickedUp) / 4));
  } else if (t < E.refitted) {
    p.copy(hp);
  } else {
    p.copy(hp).lerp(getLanternAttachPos(), ss((t - E.refitted) / 2));
    if (t >= E.refitted + 2) r.coverM.quaternion.copy(lq);
  }
}

// ─── Camera Motion Controller ─────────────────────────────────────────
function updateCameraMotion(t, dt, cond, camera, rig, refs, targetYaw, targetPitch, currentYaw, currentPitch, setHeading) {
  if (cond === 'C4') {
    // VR Dolly on Story Rail
    const [p, q, u] = kf(RAIL_KF, t);
    rig.position.set(lerp(p[1], q[1], u), lerp(p[2], q[2], u), lerp(p[3], q[3], u));
    camera.position.set(0, 0, 0);

    // Smooth inertia & damping
    currentYaw.current += (targetYaw.current - currentYaw.current) * 0.18;
    currentPitch.current += (targetPitch.current - currentPitch.current) * 0.18;

    camera.rotation.order = 'YXZ';
    camera.rotation.set(currentPitch.current, currentYaw.current, 0);

    const headingDeg = THREE.MathUtils.radToDeg(-currentYaw.current);
    const normalizedHeading = Math.round(((headingDeg % 360) + 360) % 360);
    setHeading(normalizedHeading);
    return;
  }

  // C1, C2, C3 Cinematic Keyframed Camera
  rig.position.set(0, 0, 0);
  const [p, q, u] = kf(CAMERA_KF, t);
  const camPos = V([p[1], p[2], p[3]]).lerp(V([q[1], q[2], q[3]]), u);
  const lookPos = resolveTarget(p[4], refs).lerp(resolveTarget(q[4], refs), u);

  camera.position.set(camPos.x + 0.03 * Math.sin(t * 0.7), camPos.y + 0.02 * Math.sin(t * 1.1), camPos.z);
  camera.lookAt(lookPos);
}

function resolveTarget(v, refs) {
  if (typeof v === 'string') {
    if (v === 'A') {
      const aPos = refs.current?.actors?.aman?.P?.group?.position;
      return aPos ? V([aPos.x, 1.3, aPos.z]) : V([0, 1.3, 0]);
    }
    if (v === 'L') {
      if (refs.current?.L) {
        const wp = new THREE.Vector3();
        refs.current.L.getWorldPosition(wp);
        return wp;
      }
      return V([0, 1, 0]);
    }
    if (v === 'C' && refs.current?.coverM) return refs.current.coverM.position.clone();
    if (TARGETS[v]) return V(TARGETS[v]);
  }
  return V(v);
}

// ─── C3 Checkpoint Projection ─────────────────────────────────────────
function updateC3CheckpointProjection(camera, mount, refs, checkpoints, cpIdx, targetIdx, setButtonPos) {
  if (!mount) return;
  const cp = checkpoints[cpIdx];
  if (!cp || !cp.targets) {
    setButtonPos({ x: 0, y: 0, visible: false });
    return;
  }

  const targetName = cp.targets[targetIdx] || cp.targets[0];
  const targetWorldPos = resolveTarget(targetName, refs);
  const projected = targetWorldPos.clone().project(camera);

  // If target is in front of camera
  if (projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05) {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const sx = (projected.x * 0.5 + 0.5) * w;
    const sy = (-projected.y * 0.5 + 0.5) * h;
    setButtonPos({ x: sx, y: sy, visible: true });
  } else {
    setButtonPos({ x: 0, y: 0, visible: false });
  }
}

// ─── C4 Gaze Tracking & Reticle Feedback ──────────────────────────────
const GAZE_TARGET_INFO = {
  butterflies: { label: 'Two Resting Butterflies', info: 'Two colorful butterflies resting calmly on the garden sunflower.' },
  chime: { label: 'Aluminum Wind Chime', info: 'Five tuned aluminum tubes that chime softly when the evening wind blows.' },
  pond: { label: 'Stone Garden Pond', info: 'A clear water pond surrounded by smooth river stones.' },
  flowers: { label: 'Lush Flower Bed', info: 'Colorful blooming flowers lining the stone garden walkway.' },
  L: { label: 'Aman\'s Lantern', info: 'The small battery-powered lantern that illuminates the garden path.' },
  stone: { label: 'Large Garden Stone', info: 'A large mossy stone where the battery cover slipped off.' },
  C: { label: 'Battery Cover', info: 'The detached battery cover discovered safely beside the large stone.' }
};

const GAZE_OBJECTS = [
  { id: 'butterflies' },
  { id: 'chime' },
  { id: 'pond' },
  { id: 'flowers' },
  { id: 'L' },
  { id: 'stone' },
  { id: 'C', from: 176 }
];

function updateC4GazeTracking(t, dt, camera, refs, dwellTimes, triggerTimes, setGazeTarget, setGazeProgress, setInfoPanel, pulses, scene, playSFX) {
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  camera.getWorldDirection(camDir);

  let activeHit = null;

  for (const g of GAZE_OBJECTS) {
    if (g.from && t < g.from) continue;
    const targetPos = resolveTarget(g.id, refs);
    const toTarget = targetPos.clone().sub(camPos).normalize();
    const dot = cl(camDir.dot(toTarget), -1, 1);
    const angleDeg = Math.acos(dot) * (180 / Math.PI);

    if (angleDeg < GAZE_ANGLE_DEG) {
      dwellTimes.current[g.id] = (dwellTimes.current[g.id] || 0) + dt;
      const dwellSec = dwellTimes.current[g.id];
      const targetDwell = GAZE_DWELL_MS / 1000;
      const pct = Math.min(100, (dwellSec / targetDwell) * 100);

      activeHit = { id: g.id, label: GAZE_TARGET_INFO[g.id]?.label || g.id, info: GAZE_TARGET_INFO[g.id]?.info || '' };
      setGazeTarget(activeHit);
      setGazeProgress(pct);

      if (dwellSec >= targetDwell && t >= (triggerTimes.current[g.id] || 0)) {
        triggerTimes.current[g.id] = t + 15; // 15s debounce
        createExpandingPulse(targetPos, pulses, scene);
        playSFX('flashClick', [targetPos.x, targetPos.y, targetPos.z]);
        setInfoPanel(activeHit);
        eventLogger.log('GAZE_DWELL', {
          videoTimestamp: t,
          objectId: g.id,
          dwellSec: +dwellSec.toFixed(2)
        });
      }
      break;
    } else {
      dwellTimes.current[g.id] = 0;
    }
  }

  if (!activeHit) {
    setGazeTarget(null);
    setGazeProgress(0);
  }
}

function checkHoverInteractive(camera, refs, setHovered) {
  const interactiveList = [
    refs.current?.chimeMesh,
    refs.current?.pondMesh,
    refs.current?.amanMesh,
    refs.current?.taraMesh,
    refs.current?.lanternMesh,
    refs.current?.stoneMesh
  ].filter(Boolean);

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(interactiveList, true);

  if (hits.length > 0) {
    let target = hits[0].object;
    while (target && !target.userData?.interactiveId && target.parent) target = target.parent;
    if (target && target.userData?.interactiveId) {
      setHovered(target.userData.interactiveLabel || 'Interact');
      return;
    }
  }
  setHovered(null);
}

function createExpandingPulse(pos, pulses, scene) {
  if (!scene) return;
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 32),
    new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false })
  );
  m.position.copy(pos);
  m.age = 0;
  m.renderOrder = 9;
  scene.add(m);
  pulses.current.push(m);
}

function updatePulses(dt, pulses, scene, camera) {
  const cp = new THREE.Vector3();
  camera.getWorldPosition(cp);
  for (let i = pulses.current.length - 1; i >= 0; i--) {
    const m = pulses.current[i];
    m.age += dt;
    m.scale.setScalar(0.25 + m.age * 0.9);
    m.material.opacity = 0.9 * (1 - m.age / 1.2);
    m.lookAt(cp);
    if (m.age > 1.2) {
      scene.remove(m);
      pulses.current.splice(i, 1);
    }
  }
}

function updateSpatialAudioListener(camera, cond, audioCtx) {
  if (!audioCtx || (cond !== 'C2' && cond !== 'C4')) return;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3();

  camera.getWorldPosition(pos);
  camera.getWorldQuaternion(quat);
  fwd.set(0, 0, -1).applyQuaternion(quat);
  up.set(0, 1, 0).applyQuaternion(quat);

  const listener = audioCtx.listener;
  if (listener.positionX) {
    listener.positionX.value = pos.x;
    listener.positionY.value = pos.y;
    listener.positionZ.value = pos.z;
    listener.forwardX.value = fwd.x;
    listener.forwardY.value = fwd.y;
    listener.forwardZ.value = fwd.z;
    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
  } else {
    listener.setPosition(pos.x, pos.y, pos.z);
    listener.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
}

function setupXRControllers(renderer, scene, refs, onClick) {
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    const laserGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)]);
    const laserMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.7 });
    const laser = new THREE.Line(laserGeom, laserMat);
    controller.add(laser);

    controller.addEventListener('selectstart', () => {
      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      const raycaster = new THREE.Raycaster();
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const interactiveList = [
        refs.current?.chimeMesh,
        refs.current?.pondMesh,
        refs.current?.amanMesh,
        refs.current?.taraMesh,
        refs.current?.lanternMesh,
        refs.current?.stoneMesh
      ].filter(Boolean);

      const hits = raycaster.intersectObjects(interactiveList, true);
      if (hits.length > 0) {
        let target = hits[0].object;
        while (target && !target.userData?.interactiveId && target.parent) target = target.parent;
        if (target && target.userData?.interactiveId) {
          onClick(target.userData.interactiveId);
        }
      }
    });

    scene.add(controller);
  }
}
