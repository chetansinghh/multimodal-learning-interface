// AudioSynthesizer — Procedural Web Audio & Speech Synthesis Engine
// Delivers rich stereo music, spatialized 3D audio, story narration, and interactive sound effects.

import { spatialAudio } from './SpatialAudioEngine';

class AudioSynthesizer {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.narrationGain = null;
    this.pannerNode = null;
    this.isPlaying = false;
    this.isMuted = false;
    this.currentSegIndex = -1;
    this.oscillators = [];
    this.musicInterval = null;
    this.speechUtterance = null;
    this.useSpatial = false;
  }

  /** Initialize or resume Web Audio Context */
  async init(spatial = false) {
    this.useSpatial = spatial;
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();

      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.9;

      this.musicGain = this.audioCtx.createGain();
      this.musicGain.gain.value = 0.45;

      this.sfxGain = this.audioCtx.createGain();
      this.sfxGain.gain.value = 0.75;

      this.narrationGain = this.audioCtx.createGain();
      this.narrationGain.gain.value = 0.95;

      if (spatial) {
        await spatialAudio.init();
        await spatialAudio.resume();
        this.pannerNode = spatialAudio.audioContext.createPanner();
        this.pannerNode.panningModel = 'HRTF';
        this.pannerNode.distanceModel = 'inverse';
        this.pannerNode.refDistance = 1;
        this.pannerNode.maxDistance = 100;
        this.pannerNode.rolloffFactor = 1;

        this.musicGain.connect(this.pannerNode);
        this.pannerNode.connect(this.masterGain);
      } else {
        this.musicGain.connect(this.masterGain);
      }

      this.sfxGain.connect(this.masterGain);
      this.narrationGain.connect(this.masterGain);
      this.masterGain.connect(this.audioCtx.destination);
    }

    if (this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch (e) {
        console.warn('AudioContext resume failed:', e);
      }
    }
  }

  /** Start playing procedural background score & narration */
  async start(spatial = false) {
    await this.init(spatial);
    this.isPlaying = true;
    this.startAmbientScore();
  }

  /** Stop all audio */
  stop() {
    this.isPlaying = false;
    this.stopAmbientScore();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
  }

  /** Pause audio */
  pause() {
    this.isPlaying = false;
    this.stopAmbientScore();
    if (this.audioCtx && this.audioCtx.state === 'running') {
      try { this.audioCtx.suspend(); } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
  }

  /** Resume audio */
  async resume() {
    await this.init(this.useSpatial);
    this.isPlaying = true;
    this.startAmbientScore();
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }

  /** Mute / Unmute toggle */
  setMuted(muted) {
    this.isMuted = muted;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.9, this.audioCtx.currentTime);
    }
  }

  /** Set Spatial 3D Position for C2 and C4 */
  setSpatialPosition(x, y, z) {
    if (this.pannerNode && this.audioCtx) {
      if (this.pannerNode.positionX) {
        this.pannerNode.positionX.setValueAtTime(x, this.audioCtx.currentTime);
        this.pannerNode.positionY.setValueAtTime(y, this.audioCtx.currentTime);
        this.pannerNode.positionZ.setValueAtTime(z, this.audioCtx.currentTime);
      } else {
        this.pannerNode.setPosition(x, y, z);
      }
    }
  }

  /** Speak narration with audible chime fallback */
  speakText(text) {
    if (!text) return;

    // Play narrative chime through Web Audio
    if (this.audioCtx && !this.isMuted) {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.narrationGain);
      osc.start(now);
      osc.stop(now + 0.4);
    }

    if ('speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = this.isMuted ? 0 : 1.0;

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const preferredVoice = voices.find(v => /^en/i.test(v.lang) && /Google|Natural|Neural|Samantha|Victoria|Daniel|Karen/i.test(v.name)) ||
                                 voices.find(v => /^en/i.test(v.lang)) || voices[0];
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }
        }

        utterance.onstart = () => {
          console.log('[AudioSynthesizer] Narration started:', text.substring(0, 35));
        };

        utterance.onerror = (e) => {
          console.warn('[AudioSynthesizer] Speech error:', e.error, e);
        };

        // Retain utterance in global array to prevent Chrome GC bug
        if (!window.__synthUtterances) window.__synthUtterances = [];
        window.__synthUtterances.push(utterance);

        utterance.onend = () => {
          console.log('[AudioSynthesizer] Narration ended:', text.substring(0, 35));
          if (window.__synthUtterances) {
            window.__synthUtterances = window.__synthUtterances.filter(u => u !== utterance);
          }
        };

        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('Speech synthesis error:', e);
      }
    }
  }

  /** Update segment narration and ambient chord key */
  onSegmentChange(segment, index) {
    if (this.currentSegIndex === index) return;
    this.currentSegIndex = index;

    if (segment && this.isPlaying) {
      const desc = segment.description ? `. ${segment.description}` : '';
      const text = `${segment.label}${desc}`;
      this.speakText(text);
    }
  }

  /** Generate procedural ambient soundtrack using Web Audio harmonic pads */
  startAmbientScore() {
    this.stopAmbientScore();
    if (!this.audioCtx) return;

    // Rich harmonic chord progressions
    const chordSets = [
      [261.63, 329.63, 392.00, 523.25], // C Major (Bright / Light)
      [220.00, 261.63, 329.63, 440.00], // A Minor (Water flow / Sky)
      [174.61, 220.00, 261.63, 349.23], // F Major (Growth / Exploration)
      [196.00, 246.94, 293.66, 392.00], // G Major (Energy / Triumph)
      [261.63, 392.00, 523.25, 659.25]  // High C (Soaring finale)
    ];

    let chordIdx = 0;

    const playChord = () => {
      if (!this.isPlaying || !this.audioCtx || this.audioCtx.state !== 'running') return;

      const segIdx = Math.max(0, this.currentSegIndex);
      const chords = chordSets[segIdx % chordSets.length];
      const now = this.audioCtx.currentTime;

      // Clean up previous oscillators
      this.oscillators.forEach(osc => {
        try { osc.stop(now); osc.disconnect(); } catch (e) {}
      });
      this.oscillators = [];

      // Create rich dual-oscillator warm pad per note
      chords.forEach((freq, i) => {
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc2.type = 'sine';

        osc1.frequency.setValueAtTime(freq, now);
        osc2.frequency.setValueAtTime(freq * 1.003, now); // Detuned chorus effect

        // Soft fade-in and fade-out envelope
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 5.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.musicGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 5.2);
        osc2.stop(now + 5.2);

        this.oscillators.push(osc1, osc2);
      });

      chordIdx++;
    };

    playChord();
    this.musicInterval = setInterval(playChord, 4800);
  }

  stopAmbientScore() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.oscillators.forEach(osc => {
        try { osc.stop(now); osc.disconnect(); } catch (e) {}
      });
    }
    this.oscillators = [];
  }

  /** Trigger procedural sound effect for interactive verbs (C3 & C4) */
  playSFX(verbOrType) {
    if (this.isMuted || !this.audioCtx || this.audioCtx.state !== 'running') return;
    const now = this.audioCtx.currentTime;

    switch (verbOrType) {
      case 'hold_charge': {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.8);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.9);
        break;
      }

      case 'slice': {
        const bufferSize = this.audioCtx.sampleRate * 0.15;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.12);

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        break;
      }

      case 'drag_sort':
      case 'select':
      case 'select_hotspot': {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.11);
        break;
      }

      case 'bicycle_bell': {
        const bellTones = [1760, 2093]; // High dual chime
        [0, 0.12].forEach((offset, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          const t = now + offset;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(bellTones[idx], t);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.5);
        });
        break;
      }

      case 'fountain_splash': {
        const bufferSize = this.audioCtx.sampleRate * 0.35;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(600, now);
        filter.frequency.exponentialRampToValueAtTime(1400, now + 0.3);

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        break;
      }

      case 'leaf_rustle': {
        const bufferSize = this.audioCtx.sampleRate * 0.25;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1200, now);

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        break;
      }

      case 'kite_whoosh': {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(650, now + 0.25);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.6);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.7);
        break;
      }

      case 'discovery_chime': {
        const notes = [659.25, 830.61, 987.77, 1318.51, 1661.22];
        notes.forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          const start = now + idx * 0.06;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.28, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(start);
          osc.stop(start + 0.75);
        });
        break;
      }

      case 'wave_hello': {
        const notes = [440, 554.37, 659.25];
        notes.forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          const start = now + idx * 0.07;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(start);
          osc.stop(start + 0.45);
        });
        break;
      }

      case 'assemble':
      case 'success': {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          const start = now + idx * 0.08;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.25, start + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);

          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(start);
          osc.stop(start + 0.65);
        });
        break;
      }

      default: {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.09);
        break;
      }
    }
  }
}

export const audioSynth = new AudioSynthesizer();
export default AudioSynthesizer;
