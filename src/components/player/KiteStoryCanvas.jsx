import React, { useRef, useEffect, useState, useCallback } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { parseTime } from '../../services/StoryLoader';
import { InteractionRenderer } from '../interactions/InteractionVerbs';

const SEC = [
  [0, 'Setting + characters', 'Perception of people/place'],
  [30, 'Initial situation', 'Understanding characters + purpose'],
  [70, 'Main action', 'Action/event remembrance'],
  [110, 'Problem/change', 'Cause-effect understanding'],
  [150, 'Search/interaction', 'Sequencing + detail retention'],
  [190, 'Resolution', 'Plot understanding'],
  [220, 'Ending', 'Overall meaning/experience']
];
const END = 240;

/* Exact Keyframe motion tracks from prototype */
const AX = [[0, -40], [3, -40], [14, 130], [38, 130], [44, 250], [150, 250], [185, 625], [220, 625], [229, 420], [240, 420]];
const MX = [[0, 70], [94, 70], [102, 170], [150, 170], [185, 560], [192, 560], [196, 600], [220, 600], [229, 360], [240, 360]];
const K1 = [
  [70, 270, 270, 15], [75, 305, 140, 0], [79, 325, 105, 0], [81.5, 262, 108, -28],
  [85, 300, 100, 0], [88, 395, 106, 28], [92, 340, 98, 0], [111, 325, 98, 3],
  [119, 700, 90, 70], [126, 775, 190, 120], [131, 730, 288, 170], [197, 730, 288, 170], [201, 647, 275, 0]
];
const K2 = [[229, 440, 270, 0], [234, 500, 105, 0], [240, 505, 100, 5]];

const cl01 = x => Math.max(0, Math.min(1, x));
const ss = x => { const c = cl01(x); return c * c * (3 - 2 * c); };
const pu = (t, c) => Math.exp(-(((t - c) / 0.35) ** 2));
const lin = (a, t) => {
  if (t <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i][0]) {
      const p = a[i - 1], q = a[i];
      return p[1] + (q[1] - p[1]) * (t - p[0]) / (q[0] - p[0]);
    }
  }
  return a[a.length - 1][1];
};
const kf = (a, t) => {
  if (t <= a[0][0]) return a[0].slice(1);
  for (let i = 1; i < a.length; i++) {
    if (t <= a[i][0]) {
      const p = a[i - 1], q = a[i], u = ss((t - p[0]) / (q[0] - p[0]));
      return [1, 2, 3].map(k => p[k] + (q[k] - p[k]) * u);
    }
  }
  return a[a.length - 1].slice(1);
};
const W = t => 0.08 + 0.92 * (ss((t - 108) / 6) - ss((t - 128) / 12));
const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/* The Complete Original 32-Line Narration Script */
const NARR = [
  [1, "It is a sunny afternoon in a neighborhood park."],
  [6, "A boy named Aarav arrives, carrying his red kite."],
  [13, "His friend Meera sits near a wooden bench, drawing in her notebook."],
  [21, "Three birds fly above the trees, and a small fountain runs beside the walking path."],
  [31, "Aarav came to the park for one reason: to fly his red kite."],
  [39, "He spots the wide, open field, and runs toward it, holding the kite high."],
  [52, "Meera stays on her bench, busy with her drawing."],
  [60, "Aarav takes a deep breath, and gets ready to release the kite."],
  [70, "He lets go, and the kite rises above the trees."],
  [78, "Aarav pulls the string once, and the kite turns left."],
  [85, "He pulls it a second time, and the kite turns right."],
  [93, "Meera stands up, and watches the kite dance in the sky."],
  [111, "Suddenly, a strong wind blows across the field."],
  [116, "It pulls the kite away, and the string slips from Aarav's hand."],
  [124, "The kite drifts far across the park, and lands behind a large bush."],
  [135, "Aarav gasps. His kite is lost."],
  [151, "Aarav and Meera walk toward the bush."],
  [159, "On the way, they pass the fountain,"],
  [166, "and look around carefully."],
  [174, "Then they pass a yellow bicycle."],
  [180, "Meera notices something red, behind the bush."],
  [185, "It is the corner of the kite!"],
  [191, "Aarav moves the branches aside,"],
  [196, "and picks up the kite."],
  [203, "One small leaf is stuck to it."],
  [209, "They gently remove the leaf,"],
  [214, "and check the kite for damage."],
  [218, "It is perfectly fine."],
  [221, "The friends return to the field."],
  [227, "This time, Aarav holds the string firmly."],
  [232, "The kite soars, three birds fly across the sky, and the fountain keeps running."],
  [237.5, "The two friends smile."]
];

export default function KiteStoryCanvas({
  condition = 'C1', // 'C1', 'C2', 'C3'
  storyConfig,
  onComplete,
  interactions = []
}) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [caption, setCaption] = useState('');
  const [activeInteraction, setActiveInteraction] = useState(null);
  const [completedInteractions, setCompletedInteractions] = useState(new Set());
  const [isMuted, setIsMuted] = useState(false);

  const svgRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastTimeRef = useRef(performance.now());
  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const eventIndexRef = useRef(0);
  const nextBirdTimeRef = useRef(1);
  const nextFootstepTimeRef = useRef(0);
  const nextFlutterTimeRef = useRef(0);

  // Exact Web Audio synthesizer refs
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const noiseBufferRef = useRef(null);
  const windGainRef = useRef(null);
  const windFilterRef = useRef(null);
  const windPannerRef = useRef(null);
  const fountainGainRef = useRef(null);
  const fountainFilterRef = useRef(null);
  const fountainPannerRef = useRef(null);
  const activeUtteranceRef = useRef(null);

  const isSpatial = condition === 'C2' || condition === 'C4';
  const isInteractive = condition === 'C3';

  // ─── Diagnostic Logging & Voices Pre-loading + Chrome Keepalive ────
  useEffect(() => {
    console.log('[DIAGNOSTIC 1] KiteStoryCanvas mounted.');
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        const updatedVoices = window.speechSynthesis.getVoices();
        console.log('[DIAGNOSTIC 5 - VOICES CHANGED] speechSynthesis voices loaded:', updatedVoices.length);
      };

      // Chrome long-narration keepalive interval
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
    } else {
      console.warn('[DIAGNOSTIC 5] speechSynthesis is NOT supported in this browser window.');
    }
  }, []);

  // ─── Pre-Unlock AudioContext on FIRST pointer interaction ────────────
  useEffect(() => {
    const unlock = () => {
      console.log('[DIAGNOSTIC 2 - POINTERDOWN] pointerdown detected. audioCtxRef exists:', !!audioCtxRef.current);
      if (audioCtxRef.current) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.error('[DIAGNOSTIC 1] AudioContext API not found in window.');
        return;
      }

      const ac = new AudioCtx();
      console.log('[DIAGNOSTIC 1 & 2] AudioContext created. Initial state:', ac.state);
      ac.resume().then(() => {
        console.log('[DIAGNOSTIC 2] ac.resume() promise resolved. New state:', ac.state);
      }).catch(err => {
        console.error('[DIAGNOSTIC 2] ac.resume() rejected with error:', err);
      });
      audioCtxRef.current = ac;

      const master = ac.createGain();
      master.gain.value = 0.95;
      master.connect(ac.destination);
      masterGainRef.current = master;
      console.log('[DIAGNOSTIC 3] masterGain node created. Connected -> ac.destination. masterGain.gain.value =', master.gain.value);

      const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const data = nb.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noiseBufferRef.current = nb;
      console.log('[DIAGNOSTIC 3] noiseBuffer generated (2s buffer at sampleRate', ac.sampleRate, ')');

      const createLoopNode = (name, type, freq, q, initialPan = 0) => {
        const src = ac.createBufferSource();
        src.buffer = nb;
        src.loop = true;
        const filter = ac.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        filter.Q.value = q;
        const gain = ac.createGain();
        gain.gain.value = 0; // silent until soundTick ramps it
        let panner = null;
        if (isSpatial && ac.createStereoPanner) {
          panner = ac.createStereoPanner();
          panner.pan.value = initialPan;
          src.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(master);
          console.log(`[DIAGNOSTIC 3] LoopNode '${name}' connected: BufferSource -> BiquadFilter(${type}, ${freq}Hz) -> Gain(0) -> StereoPanner(${initialPan}) -> masterGain -> destination`);
        } else {
          src.connect(filter); filter.connect(gain); gain.connect(master);
          console.log(`[DIAGNOSTIC 3] LoopNode '${name}' connected: BufferSource -> BiquadFilter(${type}, ${freq}Hz) -> Gain(0) -> masterGain -> destination`);
        }
        src.start();
        return { gain, filter, panner };
      };

      const windNode = createLoopNode('wind', 'bandpass', 400, 0.7, 0);
      windGainRef.current = windNode.gain;
      windFilterRef.current = windNode.filter;
      windPannerRef.current = windNode.panner;

      const fountainNode = createLoopNode('fountain', 'bandpass', 3000, 0.4, (370 - 400) / 400);
      fountainGainRef.current = fountainNode.gain;
      fountainFilterRef.current = fountainNode.filter;
      fountainPannerRef.current = fountainNode.panner;
    };

    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kept for restart() — creates fresh context synchronously
  const initAudio = () => {
    console.log('[DIAGNOSTIC 1 - initAudio] Calling initAudio(). Current ac:', audioCtxRef.current ? audioCtxRef.current.state : 'null');
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      if (audioCtxRef.current.state === 'suspended') {
        console.log('[DIAGNOSTIC 2 - initAudio] Resuming suspended ac...');
        audioCtxRef.current.resume().then(() => {
          console.log('[DIAGNOSTIC 2 - initAudio] Resume resolved. State:', audioCtxRef.current?.state);
        });
      }
      return audioCtxRef.current;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      console.error('[DIAGNOSTIC 1] AudioContext API not found.');
      return null;
    }
    const ac = new AudioCtx();
    console.log('[DIAGNOSTIC 1 - initAudio] New AudioContext created. State:', ac.state);
    ac.resume().then(() => {
      console.log('[DIAGNOSTIC 2 - initAudio] ac.resume() resolved. State:', ac.state);
    });
    audioCtxRef.current = ac;

    const master = ac.createGain();
    master.gain.value = isMuted ? 0 : 0.95;
    master.connect(ac.destination);
    masterGainRef.current = master;
    console.log('[DIAGNOSTIC 3 - initAudio] masterGain connected -> destination. gain.value =', master.gain.value);

    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const data = nb.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBufferRef.current = nb;

    const createLoopNode = (name, type, freq, q, initialPan = 0) => {
      const src = ac.createBufferSource();
      src.buffer = nb; src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
      const gain = ac.createGain(); gain.gain.value = 0;
      let panner = null;
      if (isSpatial && ac.createStereoPanner) {
        panner = ac.createStereoPanner(); panner.pan.value = initialPan;
        src.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(master);
        console.log(`[DIAGNOSTIC 3 - initAudio] LoopNode '${name}' connected -> panner -> master -> destination`);
      } else {
        src.connect(filter); filter.connect(gain); gain.connect(master);
        console.log(`[DIAGNOSTIC 3 - initAudio] LoopNode '${name}' connected -> master -> destination`);
      }
      src.start();
      return { gain, filter, panner };
    };

    const windNode = createLoopNode('wind', 'bandpass', 400, 0.7, 0);
    windGainRef.current = windNode.gain;
    windFilterRef.current = windNode.filter;
    windPannerRef.current = windNode.panner;

    const fountainNode = createLoopNode('fountain', 'bandpass', 3000, 0.4, (370 - 400) / 400);
    fountainGainRef.current = fountainNode.gain;
    fountainFilterRef.current = fountainNode.filter;
    fountainPannerRef.current = fountainNode.panner;

    return ac;
  };

  const burst = (dur, f, q, gainVal, type = 'bandpass', sweep, panX = 0) => {
    const ac = audioCtxRef.current;
    if (!ac || !noiseBufferRef.current) return;
    const now = ac.currentTime;

    const src = ac.createBufferSource();
    src.buffer = noiseBufferRef.current;

    const fl = ac.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, now);
    if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(10, sweep), now + dur);
    fl.Q.value = q;

    const g = ac.createGain();
    g.gain.setValueAtTime(gainVal, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(fl);
    fl.connect(g);

    if (isSpatial && ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, panX));
      g.connect(panner);
      panner.connect(masterGainRef.current || ac.destination);
    } else {
      g.connect(masterGainRef.current || ac.destination);
    }

    src.start(now, Math.random() * 0.2, dur);
  };

  const tone = (f, dur, gainVal, sweep, type = 'sine', delay = 0, panX = 0) => {
    const ac = audioCtxRef.current;
    if (!ac) return;
    const t0 = Math.max(ac.currentTime, ac.currentTime + delay);

    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(10, sweep), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainVal, t0 + dur * 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);

    if (isSpatial && ac.createStereoPanner) {
      const panner = ac.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, panX));
      g.connect(panner);
      panner.connect(masterGainRef.current || ac.destination);
    } else {
      g.connect(masterGainRef.current || ac.destination);
    }

    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };

  const pull = (panX = 0) => {
    burst(0.2, 1400, 2, 0.2, 'bandpass', 350, panX);
    tone(200, 0.12, 0.12, 110, 'triangle', 0, panX);
  };

  const rustle = (panX = 0.7) => {
    burst(0.5, 3200, 0.8, 0.18, 'highpass', null, panX);
  };

  // ─── Full Original Script Speech Narration ──────────────────────────
  const speak = (text) => {
    setCaption(text);
    if (!('speechSynthesis' in window)) return;

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.95;
      utt.pitch = 1.0;
      utt.lang = 'en-US';
      utt.volume = isMuted ? 0 : 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const v = voices.find(x => /^en[-_]US/i.test(x.lang) && /Samantha|Google|Natural|Neural|Victoria/i.test(x.name)) ||
                  voices.find(x => /^en/i.test(x.lang) && !/compact/i.test(x.name)) ||
                  voices.find(x => /^en/i.test(x.lang)) ||
                  voices[0];
        if (v) {
          utt.voice = v;
          utt.lang = v.lang;
        }
      }

      // Preserve utterance in window to prevent Chrome garbage-collection cancellation
      if (!window.__kiteUtterances) window.__kiteUtterances = [];
      window.__kiteUtterances.push(utt);

      utt.onstart = () => {
        console.log('[KiteNarration] Speaking:', text.substring(0, 35));
      };

      utt.onend = () => {
        if (window.__kiteUtterances) {
          window.__kiteUtterances = window.__kiteUtterances.filter(u => u !== utt);
        }
      };

      utt.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('[KiteNarration] Speech error:', e.error);
        }
        if (window.__kiteUtterances) {
          window.__kiteUtterances = window.__kiteUtterances.filter(u => u !== utt);
        }
      };

      window.speechSynthesis.speak(utt);
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  // Scheduled discrete audio events matching prototype
  const getAudioEvents = () => {
    const ev = [
      [70, () => burst(0.25, 900, 1, 0.1, 'bandpass', 300, isSpatial ? -0.3 : 0)],
      [79, () => pull(isSpatial ? -0.2 : 0)],
      [86, () => pull(isSpatial ? 0.2 : 0)],
      [110, () => burst(1.8, 400, 0.6, 0.35, 'bandpass', 1200, 0)],
      [116, () => burst(0.2, 1500, 2, 0.12, 'bandpass', null, isSpatial ? 0.3 : 0)],
      [131, () => {
        burst(0.25, 160, 1, 0.4, 'lowpass', null, isSpatial ? 0.75 : 0);
        tone(90, 0.2, 0.25, 50, 'sine', 0, isSpatial ? 0.75 : 0);
      }],
      [192, () => rustle(isSpatial ? 0.75 : 0)],
      [194.5, () => rustle(isSpatial ? 0.75 : 0)],
      [197, () => rustle(isSpatial ? 0.75 : 0)],
      [201, () => rustle(isSpatial ? 0.75 : 0)],
      [210, () => burst(0.25, 4000, 1.5, 0.1, 'highpass', null, isSpatial ? 0.7 : 0)],
      [219, () => [523, 659, 784].forEach((f, i) => tone(f, 0.7, 0.07, 0, 'sine', i * 0.14, isSpatial ? 0.6 : 0))],
      [229, () => [523, 587, 659, 784, 659, 587, 523, 392].forEach((f, i) => tone(f, 1.4, 0.04, 0, 'triangle', i * 1.4, 0))]
    ];

    NARR.forEach(([t, s]) => {
      ev.push([t, () => speak(s)]);
    });

    return ev.sort((a, b) => a[0] - b[0]);
  };

  const audioEventsRef = useRef(getAudioEvents());

  // ─── Continuous Sound Synthesis Loop (Exact Prototype Formulation) ──
  const soundTick = (t) => {
    // 1. Process scheduled discrete narration & SFX triggers
    const evs = audioEventsRef.current;
    while (eventIndexRef.current < evs.length && evs[eventIndexRef.current][0] <= t) {
      try {
        evs[eventIndexRef.current][1]();
      } catch (err) {
        console.warn('Audio event error:', err);
      }
      eventIndexRef.current++;
    }

    const ac = audioCtxRef.current;
    if (!ac) return;

    const w = W(t);
    const now = ac.currentTime;

    // Wind modulation
    if (windGainRef.current && windFilterRef.current) {
      const targetGain = (0.035 + 0.3 * w) * (0.85 + 0.15 * Math.sin(t * 0.9));
      windGainRef.current.gain.setTargetAtTime(targetGain, now, 0.2);
      windFilterRef.current.frequency.setTargetAtTime(350 + 700 * w, now, 0.2);
      if (isSpatial && windPannerRef.current) {
        windPannerRef.current.pan.setTargetAtTime(Math.sin(t * 0.4) * 0.4, now, 0.3);
      }
      if (Math.floor(t) !== Math.floor(t - 0.05) && Math.floor(t) % 2 === 0) {
        console.log(`[DIAGNOSTIC 4 - GAIN] t=${t.toFixed(1)}s | windGain=${targetGain.toFixed(4)} | masterGain=${masterGainRef.current?.gain.value} | ac.state=${ac.state}`);
      }
    }

    // Fountain proximity & spatial panning
    const ax = lin(AX, t);
    const distToFountain = Math.abs(ax - 370);
    if (fountainGainRef.current) {
      const fountainVol = 0.05 + 0.12 * Math.exp(-((distToFountain / 130) ** 2)) + (t < 12 ? 0.04 : 0);
      fountainGainRef.current.gain.setTargetAtTime(fountainVol, now, 0.3);
      if (isSpatial && fountainPannerRef.current) {
        const panVal = Math.max(-0.9, Math.min(0.9, (370 - ax) / 400));
        fountainPannerRef.current.pan.setTargetAtTime(panVal, now, 0.2);
      }
    }

    // Ambient birds in sky
    if (t >= nextBirdTimeRef.current) {
      const f = 2400 + Math.random() * 1400;
      const birdPan = isSpatial ? (Math.random() * 1.6 - 0.8) : 0;
      tone(f, 0.1, 0.025 * (1 - 0.6 * w), f * 1.3, 'sine', 0, birdPan);
      tone(f * 1.1, 0.08, 0.02, f * 1.4, 'sine', 0.13, birdPan);
      nextBirdTimeRef.current = t + 0.6 + Math.random() * 1.6;
    }

    // Footsteps when walking
    const mA = Math.abs(lin(AX, t + 0.1) - ax) > 0.001;
    const isRunning = t >= 38 && t < 44;
    if (mA && t >= nextFootstepTimeRef.current) {
      const stepPan = isSpatial ? (ax - 400) / 400 : 0;
      burst(0.07, 220, 1, 0.1, 'lowpass', null, stepPan);
      nextFootstepTimeRef.current = t + (isRunning ? 0.26 : 0.42);
    }

    // Kite flutter
    if (((t >= 75 && t < 116) || t >= 234) && t >= nextFlutterTimeRef.current) {
      const k = kpos(t, ax);
      const kitePan = isSpatial ? (k[0] - 400) / 400 : 0;
      burst(0.06, 800, 1.2, 0.035, 'bandpass', null, kitePan);
      nextFlutterTimeRef.current = t + 0.25 + Math.random() * 0.2;
    }
  };

  // ─── Playback Controls ──────────────────────────────────────────────
  const play = () => {
    console.log('[DIAGNOSTIC 2 - PLAY CLICK] Play button clicked.');
    // AudioContext was pre-unlocked on first pointerdown — just resume if suspended
    let ac = audioCtxRef.current;
    if (ac) {
      console.log('[DIAGNOSTIC 2 - PLAY CLICK] Existing ac.state BEFORE resume:', ac.state);
      if (ac.state === 'suspended') {
        ac.resume().then(() => {
          console.log('[DIAGNOSTIC 2 - PLAY CLICK] ac.resume() finished. State AFTER:', ac.state);
        }).catch(err => {
          console.error('[DIAGNOSTIC 2 - PLAY CLICK] ac.resume() failed:', err);
        });
      }
    } else {
      console.log('[DIAGNOSTIC 2 - PLAY CLICK] No audioCtxRef found. Initializing now via initAudio()...');
      ac = initAudio();
      console.log('[DIAGNOSTIC 2 - PLAY CLICK] After initAudio(), ac.state:', ac?.state);
    }

    if (window.speechSynthesis && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    isPlayingRef.current = true;
    setPlaying(true);
    lastTimeRef.current = performance.now();
    eventLogger.log(currentTimeRef.current === 0 ? 'VIDEO_START' : 'VIDEO_RESUME', { videoTimestamp: currentTimeRef.current });
  };

  const pause = () => {
    isPlayingRef.current = false;
    setPlaying(false);
    if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
      try { audioCtxRef.current.suspend(); } catch (e) {}
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
    eventLogger.log('VIDEO_PAUSE', { videoTimestamp: currentTimeRef.current });
  };

  const restart = () => {
    if (window.speechSynthesis) window.speechSynthesis.pause();
    if (window.__kiteUtterances) window.__kiteUtterances = [];
    // Close and null existing context so initAudio() creates fresh nodes
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
      masterGainRef.current = null;
      noiseBufferRef.current = null;
      windGainRef.current = null;
      windFilterRef.current = null;
      windPannerRef.current = null;
      fountainGainRef.current = null;
      fountainFilterRef.current = null;
      fountainPannerRef.current = null;
    }
    // initAudio() called synchronously from user gesture (Restart click)
    initAudio();
    currentTimeRef.current = 0;
    setCurrentTime(0);
    eventIndexRef.current = 0;
    nextBirdTimeRef.current = 1;
    nextFootstepTimeRef.current = 0;
    nextFlutterTimeRef.current = 0;
    setCaption('');
    setActiveInteraction(null);
    setCompletedInteractions(new Set());
    audioEventsRef.current = getAudioEvents();
    play();
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (masterGainRef.current && audioCtxRef.current) {
      masterGainRef.current.gain.setValueAtTime(nextMuted ? 0 : 0.95, audioCtxRef.current.currentTime);
    }
  };

  const seek = (targetTime) => {
    const safeTime = Math.max(0, Math.min(END, targetTime));
    currentTimeRef.current = safeTime;
    setCurrentTime(safeTime);

    // Sync audio event pointer
    const evs = audioEventsRef.current;
    let idx = 0;
    while (idx < evs.length && evs[idx][0] <= safeTime) idx++;
    eventIndexRef.current = idx;

    eventLogger.log('VIDEO_SEEK', { videoTimestamp: safeTime });
    render(safeTime);
  };

  const handleInteractionComplete = (score = 1) => {
    if (!activeInteraction) return;
    const completedSet = new Set(completedInteractions);
    completedSet.add(activeInteraction.id);
    setCompletedInteractions(completedSet);
    setActiveInteraction(null);

    eventLogger.log('OBJECT_INTERACT', {
      videoTimestamp: currentTimeRef.current,
      objectId: activeInteraction.object_id,
      action: 'interaction_completed',
      response: `score:${score}`
    });

    // Resume story playback
    setTimeout(() => {
      play();
    }, 400);
  };

  // ─── Animation Frame Loop ───────────────────────────────────────────
  const frameRef = useRef();

  const frame = (now) => {
    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
    lastTimeRef.current = now;

    if (isPlayingRef.current) {
      const nextT = currentTimeRef.current + dt;

      // Check C3 interactive triggers
      if (isInteractive && interactions.length > 0) {
        const nextInt = interactions.find(inter => {
          const triggerSec = parseTime(inter.trigger_time);
          return Math.abs(nextT - triggerSec) < 0.25 && !completedInteractions.has(inter.id);
        });

        if (nextInt && activeInteraction?.id !== nextInt.id) {
          pause();
          setActiveInteraction(nextInt);
          eventLogger.log('OBJECT_INTERACT', {
            videoTimestamp: nextT,
            objectId: nextInt.object_id,
            action: 'interaction_triggered',
            response: nextInt.verb
          });
          render(nextT);
          return;
        }
      }

      if (nextT >= END) {
        currentTimeRef.current = END;
        setCurrentTime(END);
        pause();
        eventLogger.log('VIDEO_COMPLETE', { videoTimestamp: END });
        if (onComplete) onComplete();
      } else {
        currentTimeRef.current = nextT;
        setCurrentTime(nextT);
        soundTick(nextT);
      }
    }

    render(currentTimeRef.current);
  };

  frameRef.current = frame;

  useEffect(() => {
    let animId;
    const loop = (time) => {
      if (frameRef.current) frameRef.current(time);
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (e) {}
        audioCtxRef.current = null;
      }
    };
  }, []);

  // ─── Procedural Visual Render Engine (Upgraded) ────────────────────
  const aHand = (t, ax, mv) => {
    const y = 350;
    const sw = mv ? 7 * Math.sin(t * 8 + 3) : 0;
    let H, H2 = [ax - 10 + sw, y - 28];
    if (t < 70) H = [ax + 18, y - 62];
    else if (t < 79) H = [ax + 22, y - 78];
    else if (t < 116) {
      H = [ax + 16, y - 58 + 12 * (pu(t, 79) + pu(t, 86))];
      H2 = [ax + 4, y - 50];
    } else if (t < 122) H = [ax + 34, y - 70];
    else if (t < 135) H = [ax + 8, y - 30];
    else if (t < 150) {
      H = [ax + 8, y - 72];
      H2 = [ax - 8, y - 72];
    } else if (t < 192) H = [ax + 10 - sw, y - 28];
    else if (t < 197) H = [ax + 40 + 7 * Math.sin((t - 192) * 6), y - 48];
    else if (t < 201) H = [ax + 45, y - 28];
    else if (t < 229) H = [ax + 18, y - 52];
    else H = [ax + 16, y - 58];
    return [H, H2];
  };

  const kpos = (t, ax) => {
    let k;
    if (t < 70) k = [ax + 20, 270, 15];
    else if (t < 201) k = kf(K1, t);
    else if (t < 229) k = [ax + 22, 275, (t > 214 && t < 220) ? 25 * Math.sin((t - 214) * 2.1) : 0];
    else k = kf(K2, t);

    if ((t >= 75 && t < 119) || t >= 234) {
      k = [k[0] + 4 * Math.sin(t * 1.7), k[1] + 3 * Math.sin(t * 2.3), k[2] + 3 * Math.sin(t * 2)];
    }
    return k;
  };

  const render = (t) => {
    const svg = svgRef.current;
    if (!svg) return;

    const w = W(t);
    const ax = lin(AX, t);
    const mx = lin(MX, t);
    const mA = Math.abs(lin(AX, t + 0.1) - ax) > 0.001;
    const mM = Math.abs(lin(MX, t + 0.1) - mx) > 0.001;
    const isRunning = t >= 38 && t < 44;

    // Parallax Clouds
    const gC = svg.querySelector('#gC');
    if (gC) {
      const clouds = gC.querySelectorAll('.cloud-group');
      clouds.forEach((g, i) => {
        const cx = ((i ? 450 : 100) + t * (4 + i * 3) + w * 35) % 1000 - 100;
        g.setAttribute('transform', `translate(${cx} ${i ? 45 : 70})`);
      });
    }

    // Parallax Distant Hills & Trees
    const gT = svg.querySelector('#gT');
    if (gT) {
      const TX = [190, 470, 610];
      const treeGroups = gT.querySelectorAll('.tree-group');
      treeGroups.forEach((g, i) => {
        const sway = Math.sin(t * 1.3 + i * 2) * (1.2 + 7 * w);
        g.setAttribute('transform', `rotate(${sway} ${TX[i]} 300)`);
      });
    }

    // Birds in sky
    const gBd = svg.querySelector('#gBd');
    if (gBd) {
      const birds = gBd.querySelectorAll('path');
      birds.forEach((p, i) => {
        const x = 150 + i * 170 + 70 * Math.sin(t * 0.25 + i * 2);
        const y = 55 + i * 24 + 8 * Math.sin(t * 1.3 + i);
        const f = Math.sin(t * 9 + i * 2);
        p.setAttribute('d', `M${x - 9} ${y}Q${x - 4.5} ${y - 7 * f} ${x} ${y}Q${x + 4.5} ${y - 7 * f} ${x + 9} ${y}`);
      });
    }

    // Wind gust lines
    const gW = svg.querySelector('#gW');
    if (gW) {
      const windLines = gW.querySelectorAll('line');
      windLines.forEach((l, i) => {
        const x = ((t * (300 + w * 500) + i * 190) % 900) - 60;
        const y = 110 + i * 32;
        l.setAttribute('x1', x);
        l.setAttribute('y1', y);
        l.setAttribute('x2', x + 30 + 60 * w);
        l.setAttribute('y2', y);
        l.setAttribute('opacity', Math.max(0, w - 0.1) * 0.85);
      });
    }

    // Aarav character model
    const pA = svg.querySelector('#charAarav');
    const [H, H2] = aHand(t, ax, mA);
    if (pA) {
      drawUpgradedCharacter(pA, ax, 350, H, H2, 0, (t >= 112 && t < 198) ? -1 : 1, mA, t, isRunning, '#2e8b57', '#2b1d12', false);
    }

    // Meera character model
    const pM = svg.querySelector('#charMeera');
    const sit = t < 94;
    let mH = sit ? [mx + 12 + 3 * Math.sin(t * 12), 326] : [mx + 10, 322];
    let mH2 = sit ? [mx + 6, 326] : [mx - 8 + (mM ? 6 * Math.sin(t * 8) : 0), 324];
    if (t >= 184 && t < 192) mH2 = [mx + 44, 288];

    if (pM) {
      drawUpgradedCharacter(pM, mx, 350, mH, mH2, sit ? 1 : 0, (t < 112 || t >= 184) ? 1 : -1, mM, t, false, '#8e5bd0', '#1c1410', true);
    }

    // Notebook for Meera
    const nb = svg.querySelector('#meeraNotebook');
    if (nb) {
      nb.setAttribute('x', mH[0] - 7);
      nb.setAttribute('y', mH[1] - 9);
      nb.setAttribute('display', sit ? '' : 'none');
    }

    // Kite Position, Rotation, Physics
    const kite = svg.querySelector('#kiteModel');
    const k = kpos(t, ax);
    if (kite) {
      kite.setAttribute('transform', `translate(${k[0]} ${k[1]}) rotate(${k[2]})`);
      const tg = (t >= 128 && t < 199) ? svg.querySelector('#gB') : svg.querySelector('#gF');
      if (tg && kite.parentNode !== tg) tg.appendChild(kite);
    }

    // Kite String Curve
    const str = svg.querySelector('#kiteString');
    if (str) {
      let sd = '';
      if ((t >= 70 && t < 116) || t >= 229) {
        sd = `M${H[0]} ${H[1]}Q${(H[0] + k[0]) / 2} ${(H[1] + k[1]) / 2 + 25} ${k[0]} ${k[1] + 14}`;
      } else if (t >= 116 && t < 131) {
        sd = `M${k[0]} ${k[1] + 14}q-18 12 -40 ${6 + 6 * Math.sin(t * 4)}`;
      }
      str.setAttribute('d', sd);
    }

    // Stuck / falling leaf
    const leaf = svg.querySelector('#kiteLeaf');
    if (leaf) {
      if (t < 201) {
        leaf.setAttribute('display', 'none');
      } else {
        let lx, ly;
        if (t < 210) {
          lx = k[0] + 4;
          ly = k[1] + 2;
        } else {
          const u = cl01((t - 210) / 5);
          lx = 651 - 61 * u + 8 * Math.sin(u * 9);
          ly = 277 + 71 * Math.pow(u, 1.3);
        }
        leaf.setAttribute('display', '');
        leaf.setAttribute('cx', lx);
        leaf.setAttribute('cy', ly);
        leaf.setAttribute('transform', `rotate(${(t - 210) * 40} ${lx} ${ly})`);
      }
    }

    // Bush parting animation
    const bl = svg.querySelector('#bushLeft');
    if (bl) {
      const bs = ss((t - 192) / 3) * (1 - ss((t - 203) / 3));
      bl.setAttribute('transform', `translate(${-16 * bs} ${-6 * bs})`);
    }
  };

  // ─── Upgraded Character Drawing Helper ──────────────────────────────
  const drawUpgradedCharacter = (container, x, y, H, H2, sit, mood, mv, t, run, shirtColor, hairColor, isFemale) => {
    const s = sit ? 10 : 0;
    const sp = run ? 12 : 8;
    const b = mv ? Math.abs(Math.sin(t * sp)) * (run ? 4 : 2.5) : 0;
    const sw = mv ? (run ? 9 : 6) * Math.sin(t * sp) : 0;
    const curY = y - b;

    // Legs
    const lg = container.querySelector('.char-legs');
    if (lg) {
      lg.setAttribute('d', sit
        ? `M${x - 4} ${curY - 16}L${x + 16} ${curY - 16}L${x + 16} ${curY + b}`
        : `M${x - 6} ${curY - 22}L${x - 6 + sw} ${curY + b}M${x + 6} ${curY - 22}L${x + 6 - sw} ${curY + b}`);
    }

    // Torso / Dress
    const bd = container.querySelector('.char-body');
    if (bd) {
      bd.setAttribute('x', x - 11);
      bd.setAttribute('y', curY - 52 + s);
    }

    // Long Hair back layer for Meera
    const hl = container.querySelector('.char-hair-long');
    if (hl) {
      hl.setAttribute('x', x - 14);
      hl.setAttribute('y', curY - 72 + s);
    }

    // Head
    const hd = container.querySelector('.char-head');
    if (hd) {
      hd.setAttribute('cx', x);
      hd.setAttribute('cy', curY - 64 + s);
    }

    // Hair
    const hr = container.querySelector('.char-hair');
    if (hr) {
      hr.setAttribute('d', isFemale
        ? `M${x - 14} ${curY - 64 + s}A14 14 0 0 1 ${x + 14} ${curY - 64 + s}Q${x + 16} ${curY - 54 + s} ${x + 10} ${curY - 50 + s}Q${x} ${curY - 58 + s} ${x - 10} ${curY - 50 + s}Z`
        : `M${x - 13.5} ${curY - 64 + s}A13.5 13.5 0 0 1 ${x + 13.5} ${curY - 64 + s}Z`);
    }

    // Eyes
    const e1 = container.querySelector('.char-eye-1');
    const e2 = container.querySelector('.char-eye-2');
    if (e1 && e2) {
      e1.setAttribute('cx', x - 4.5);
      e1.setAttribute('cy', curY - 66 + s);
      e2.setAttribute('cx', x + 4.5);
      e2.setAttribute('cy', curY - 66 + s);
    }

    // Mouth with emotion curve
    const mo = container.querySelector('.char-mouth');
    if (mo) {
      mo.setAttribute('d', `M${x - 4} ${curY - 60 + s}Q${x} ${curY - 60 + s + mood * 4.5} ${x + 4} ${curY - 60 + s}`);
    }

    // Arms with natural shading
    const a1 = container.querySelector('.char-arm-1');
    const a2 = container.querySelector('.char-arm-2');
    if (a1 && a2) {
      a1.setAttribute('x1', x);
      a1.setAttribute('y1', curY - 46 + s);
      a1.setAttribute('x2', H[0]);
      a1.setAttribute('y2', H[1]);

      a2.setAttribute('x1', x);
      a2.setAttribute('y1', curY - 46 + s);
      a2.setAttribute('x2', H2[0]);
      a2.setAttribute('y2', H2[1]);
    }
  };

  // Current segment calculation
  const curSegIdx = SEC.map(s => s[0]).filter(s => s <= currentTime).length - 1;
  const currentSeg = SEC[Math.max(0, curSegIdx)];
  const nextSegTime = SEC[curSegIdx + 1] ? SEC[curSegIdx + 1][0] : END;

  return (
    <div className="kite-story-container" style={{ position: 'relative', width: '100%', maxWidth: '960px', margin: '0 auto' }}>
      {/* SVG Animation Stage with Enhanced Visual Shading */}
      <div
        className="stage"
        style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 800 450"
          role="img"
          aria-label="The Missing Kite - Animated story of Aarav and Meera"
          style={{ display: 'block', width: '100%', height: 'auto', background: '#dff3fb' }}
        >
          <defs>
            {/* Soft Warm Sky Gradient */}
            <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60aff0" />
              <stop offset="60%" stopColor="#aae1fa" />
              <stop offset="100%" stopColor="#fdf7e7" />
            </linearGradient>

            {/* Sun Glow Gradient */}
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff3a8" />
              <stop offset="50%" stopColor="#ffd747" />
              <stop offset="100%" stopColor="#ffb300" stopOpacity="0" />
            </radialGradient>

            {/* Rolling Hills Gradients */}
            <linearGradient id="hillBack" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a3d98b" />
              <stop offset="100%" stopColor="#82be68" />
            </linearGradient>
            <linearGradient id="grassFore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7ac256" />
              <stop offset="40%" stopColor="#62ad3e" />
              <stop offset="100%" stopColor="#4a8f2a" />
            </linearGradient>

            {/* Walking Path Gradient */}
            <linearGradient id="pathGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f2e2be" />
              <stop offset="50%" stopColor="#e5d0a0" />
              <stop offset="100%" stopColor="#cfb67e" />
            </linearGradient>

            {/* Kite Gradient */}
            <linearGradient id="kiteGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff4d4d" />
              <stop offset="50%" stopColor="#e02020" />
              <stop offset="100%" stopColor="#aa0e0e" />
            </linearGradient>

            {/* Fountain Water Gradient */}
            <linearGradient id="fountainWater" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b3e5fc" />
              <stop offset="100%" stopColor="#4fc3f7" />
            </linearGradient>

            {/* Bush Gradient */}
            <linearGradient id="bushGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#43a047" />
              <stop offset="100%" stopColor="#1b5e20" />
            </linearGradient>
          </defs>

          {/* Sky & Radiant Sun */}
          <rect width="800" height="450" fill="url(#sk)" />
          <circle cx="725" cy="58" r="42" fill="url(#sunGlow)" />
          <circle cx="725" cy="58" r="24" fill="#fff8b8" />

          {/* Background Clouds */}
          <g id="gC">
            <g className="cloud-group" fill="#ffffff" opacity="0.9">
              <ellipse rx="52" ry="15" />
              <ellipse cx="24" cy="-10" rx="30" ry="14" />
              <ellipse cx="-20" cy="-6" rx="26" ry="12" />
            </g>
            <g className="cloud-group" fill="#ffffff" opacity="0.85">
              <ellipse rx="44" ry="13" />
              <ellipse cx="20" cy="-8" rx="26" ry="11" />
            </g>
          </g>

          {/* Birds in flight */}
          <g id="gBd">
            <path fill="none" stroke="#2c3e50" strokeWidth="2.2" strokeLinecap="round" />
            <path fill="none" stroke="#2c3e50" strokeWidth="2.2" strokeLinecap="round" />
            <path fill="none" stroke="#2c3e50" strokeWidth="2.2" strokeLinecap="round" />
          </g>

          {/* Distant Rolling Hills */}
          <path d="M0 290Q160 245 320 285T620 280T800 275V320H0Z" fill="url(#hillBack)" />

          {/* Park Trees with Volumetric Foliage */}
          <g id="gT">
            {[190, 470, 610].map((x, i) => (
              <g key={i} className="tree-group">
                <rect x={x - 7} y="235" width="14" height="66" rx="3" fill="#6d4c41" />
                <circle cx={x} cy="220" r="42" fill="#43a047" />
                <circle cx={x - 28} cy="244" r="30" fill="#388e3c" />
                <circle cx={x + 28} cy="244" r="30" fill="#2e7d32" />
                <circle cx={x} cy="205" r="28" fill="#4caf50" opacity="0.7" />
              </g>
            ))}
          </g>

          {/* Foreground Meadow & Sandy Path */}
          <rect y="296" width="800" height="154" fill="url(#grassFore)" />
          <rect y="336" width="800" height="36" fill="url(#pathGrad)" opacity="0.95" />

          {/* Park Bench with Shaded Wood Planks */}
          <rect x="36" y="328" width="88" height="8" rx="2" fill="#8d6e63" stroke="#5d4037" strokeWidth="1" />
          <rect x="36" y="302" width="88" height="7" rx="2" fill="#8d6e63" stroke="#5d4037" strokeWidth="1" />
          <path d="M42 302V354M118 302V354" stroke="#4e342e" strokeWidth="5.5" strokeLinecap="round" />

          {/* Tiered Fountain with Sparkling Spray */}
          <ellipse cx="370" cy="327" rx="48" ry="11" fill="#90a4ae" />
          <ellipse cx="370" cy="326" rx="40" ry="8" fill="url(#fountainWater)" />
          <rect x="363" y="284" width="14" height="42" rx="2" fill="#b0bec5" />
          <ellipse cx="370" cy="284" rx="26" ry="7" fill="#cfd8dc" />
          <ellipse cx="370" cy="283" rx="20" ry="5" fill="url(#fountainWater)" />
          <g fill="none" stroke="#29b6f6" strokeWidth="2.5" strokeLinecap="round">
            <path className="w" d="M370 280Q346 244 332 318" />
            <path className="w" d="M370 280Q394 244 408 318" />
            <path className="w" d="M370 280V248" />
          </g>

          {/* Yellow Bicycle with Realistic Frame Geometry */}
          <g fill="none" strokeLinecap="round">
            <circle cx="500" cy="336" r="14" stroke="#37474f" strokeWidth="2.8" />
            <circle cx="540" cy="336" r="14" stroke="#37474f" strokeWidth="2.8" />
            <path d="M500 336L516 316H536L540 336M516 316L523 336H500M523 336L536 316M536 316L534 308L542 306M512 310H521" stroke="#fbc02d" strokeWidth="3.2" />
            <circle cx="500" cy="336" r="2" fill="#37474f" />
            <circle cx="540" cy="336" r="2" fill="#37474f" />
          </g>

          {/* Character Models Layer */}
          <g id="gP">
            {/* Aarav Model */}
            <g id="charAarav">
              <path className="char-legs" stroke="#263238" strokeWidth="5.5" fill="none" strokeLinecap="round" />
              <rect className="char-body" width="22" height="32" rx="6" fill="#2e7d32" stroke="#1b5e20" strokeWidth="1" />
              <circle className="char-head" r="13" fill="#f5c7a9" />
              <path className="char-hair" fill="#3e2723" />
              <circle className="char-eye-1" r="1.6" fill="#212121" />
              <circle className="char-eye-2" r="1.6" fill="#212121" />
              <path className="char-mouth" fill="none" stroke="#b71c1c" strokeWidth="1.8" strokeLinecap="round" />
              <line className="char-arm-1" stroke="#f5c7a9" strokeWidth="5" strokeLinecap="round" />
              <line className="char-arm-2" stroke="#f5c7a9" strokeWidth="5" strokeLinecap="round" />
            </g>

            {/* Meera Model */}
            <g id="charMeera">
              <path className="char-legs" stroke="#263238" strokeWidth="5.5" fill="none" strokeLinecap="round" />
              <rect className="char-hair-long" width="28" height="28" rx="9" fill="#211510" />
              <rect className="char-body" width="22" height="32" rx="6" fill="#7b1fa2" stroke="#4a148c" strokeWidth="1" />
              <circle className="char-head" r="13" fill="#f5c7a9" />
              <path className="char-hair" fill="#211510" />
              <circle className="char-eye-1" r="1.6" fill="#212121" />
              <circle className="char-eye-2" r="1.6" fill="#212121" />
              <path className="char-mouth" fill="none" stroke="#b71c1c" strokeWidth="1.8" strokeLinecap="round" />
              <line className="char-arm-1" stroke="#f5c7a9" strokeWidth="5" strokeLinecap="round" />
              <line className="char-arm-2" stroke="#f5c7a9" strokeWidth="5" strokeLinecap="round" />
            </g>

            {/* Meera's Sketchbook */}
            <rect id="meeraNotebook" width="16" height="12" rx="2" fill="#fff9c4" stroke="#8d6e63" strokeWidth="1.2" />
          </g>

          {/* Behind Bush Kite Slot */}
          <g id="gB" />

          {/* Shaded Bush Layer */}
          <g id="bush" fill="url(#bushGrad)">
            <g id="bushLeft">
              <circle cx="680" cy="325" r="32" />
            </g>
            <circle cx="714" cy="310" r="38" fill="#388e3c" />
            <circle cx="744" cy="326" r="30" fill="#2e7d32" />
            <circle cx="705" cy="338" r="28" fill="#1b5e20" />
          </g>

          {/* Foreground Kite & String Layer */}
          <g id="gF">
            {/* Kite Model with Gradient & Ribbon Wave */}
            <g id="kiteModel">
              <path d="M0 -22L14 0L0 22L-14 0Z" fill="url(#kiteGrad)" stroke="#b71c1c" strokeWidth="1.8" />
              <path d="M0 -22V22M-14 0H14" stroke="#ffd54f" strokeWidth="1.2" />
              {/* Dynamic Tail Ribbons */}
              <path d="M0 22q-8 10 0 18t0 18t0 18" fill="none" stroke="#e53935" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="-4" cy="32" r="2" fill="#ffd54f" />
              <circle cx="4" cy="50" r="2" fill="#ffd54f" />
              <circle cx="-4" cy="68" r="2" fill="#ffd54f" />
            </g>

            {/* Kite String */}
            <path id="kiteString" fill="none" stroke="#37474f" strokeWidth="1.4" strokeDasharray="none" />

            {/* Stuck Green Leaf */}
            <ellipse id="kiteLeaf" rx="6" ry="3.5" fill="#66bb6a" stroke="#2e7d32" strokeWidth="1.2" display="none" />
          </g>

          {/* Wind Lines Layer */}
          <g id="gW" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round">
            {[0, 1, 2, 3, 4, 5].map(i => <line key={i} opacity="0" />)}
          </g>
        </svg>

        {/* Subtitles Overlay */}
        {showSubtitles && caption && (
          <div style={{
            position: 'absolute',
            bottom: '14px',
            left: '0',
            right: '0',
            textAlign: 'center',
            padding: '0 16px',
            pointerEvents: 'none'
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
              {caption}
            </span>
          </div>
        )}

        {/* C3 Interactive Modal Overlay */}
        {activeInteraction && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 20
          }}>
            <InteractionRenderer
              interaction={activeInteraction}
              videoTimestamp={currentTime}
              onComplete={handleInteractionComplete}
            />
          </div>
        )}
      </div>

      {/* Segment Timeline Progress Bar */}
      <div style={{ display: 'flex', gap: '4px', margin: '12px 0 6px' }}>
        {SEC.map((s, i) => {
          const segStart = s[0];
          const segEnd = SEC[i + 1] ? SEC[i + 1][0] : END;
          const flexVal = segEnd - segStart;
          const fillPct = cl01((currentTime - segStart) / (segEnd - segStart)) * 100;
          return (
            <div
              key={i}
              title={s[1]}
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
              <div style={{ height: '100%', width: `${fillPct}%`, background: '#e0443a', transition: 'width 0.1s linear' }} />
            </div>
          );
        })}
      </div>

      {/* Current Segment Label */}
      <p style={{ color: 'var(--mut, #94a3b8)', minHeight: '22px', margin: '0 0 12px', fontSize: '0.9rem' }}>
        <strong>{fmt(currentSeg[0])}–{fmt(nextSegTime)}</strong> &nbsp;{currentSeg[1]}: {currentSeg[2]}
      </p>

      {/* Playback Controls & Settings — Single Unified Gesture Toolbar */}
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
          {currentTime >= END ? '🔄 Replay' : playing ? '⏸ Pause' : '▶ Play'}
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

        <span style={{ marginLeft: 'auto', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.95rem' }}>
          {fmt(currentTime)} / 4:00
        </span>
      </div>

      <small style={{ color: 'var(--mut, #94a3b8)', display: 'block', marginTop: '10px' }}>
        {condition === 'C2'
          ? '🎧 Spatial Audio enabled: ambient park sounds, wind, fountain, and birds pan across the stereo field.'
          : condition === 'C3'
          ? '✋ Interactive mode: story automatically pauses at key moments for your physical interaction.'
          : '🔊 Live synthesized acoustic soundscape and full story speech narration.'}
      </small>
    </div>
  );
}
