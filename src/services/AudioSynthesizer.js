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
      this.masterGain.gain.value = this.isMuted ? 0 : 0.8;

      this.musicGain = this.audioCtx.createGain();
      this.musicGain.gain.value = 0.35;

      this.sfxGain = this.audioCtx.createGain();
      this.sfxGain.gain.value = 0.6;

      this.narrationGain = this.audioCtx.createGain();
      this.narrationGain.gain.value = 0.9;

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
      await this.audioCtx.resume();
    }
  }

  /** Start playing procedural background score & narration */
  async start(spatial = false) {
    await this.init(spatial);
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.startAmbientScore();
  }

  /** Stop all audio */
  stop() {
    this.isPlaying = false;
    this.stopAmbientScore();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  /** Pause audio */
  pause() {
    this.isPlaying = false;
    this.stopAmbientScore();
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
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.8, this.audioCtx.currentTime);
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

  /** Update segment narration and ambient chord key */
  onSegmentChange(segment, index) {
    if (this.currentSegIndex === index) return;
    this.currentSegIndex = index;

    // Speak segment narrative description
    if (segment && 'speechSynthesis' in window && this.isPlaying) {
      window.speechSynthesis.cancel();
      const text = `${segment.label}. ${segment.description}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = this.isMuted ? 0 : 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }

  /** Generate procedural ambient soundtrack using Web Audio harmonic pads */
  startAmbientScore() {
    this.stopAmbientScore();
    if (!this.audioCtx) return;

    // Harmonic chord progressions (Pentatonic / Ambient ambient frequencies in Hz)
    const chordSets = [
      [261.63, 329.63, 392.00, 523.25], // C Major (Bright / Light)
      [220.00, 261.63, 329.63, 440.00], // A Minor (Water flow)
      [174.61, 220.00, 261.63, 349.23], // F Major (Growth / Fixation)
      [196.00, 246.94, 293.66, 392.00]  // G Major (Energy / Triumph)
    ];

    let chordIdx = 0;

    const playChord = () => {
      if (!this.isPlaying || !this.audioCtx) return;

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
        osc2.frequency.setValueAtTime(freq * 1.002, now); // Detuned chorus effect

        // Soft fade-in and fade-out envelope
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 1.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 5.8);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.musicGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 6.0);
        osc2.stop(now + 6.0);

        this.oscillators.push(osc1, osc2);
      });

      chordIdx++;
    };

    playChord();
    this.musicInterval = setInterval(playChord, 5500);
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
    if (this.isMuted || !this.audioCtx) return;
    const now = this.audioCtx.currentTime;

    switch (verbOrType) {
      case 'hold_charge': {
        // Charging frequency sweep
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.8);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.9);
        break;
      }

      case 'slice': {
        // Swish noise burst
        const bufferSize = this.audioCtx.sampleRate * 0.15;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(2400, now + 0.12);

        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);
        noise.start(now);
        break;
      }

      case 'drag_sort':
      case 'select': {
        // Pop click
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }

      case 'assemble':
      case 'success': {
        // Victory chime chord (C5 - E5 - G5 - C6)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          const start = now + idx * 0.08;

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.2, start + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);

          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(start);
          osc.stop(start + 0.65);
        });
        break;
      }

      default: {
        // Standard click tone
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.15, now);
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
