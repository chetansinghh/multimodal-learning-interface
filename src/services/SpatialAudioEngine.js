// SpatialAudioEngine — Web Audio API with HRTF spatialization
// Provides PannerNode-based 3D audio positioning for C2 and C4 conditions.

class SpatialAudioEngine {
  constructor() {
    this.audioContext = null;
    this.listener = null;
    this.sources = new Map(); // id -> { source, panner, gainNode }
    this.masterGain = null;
    this.isInitialized = false;
  }

  /** Initialize the audio context (must be called from a user gesture) */
  async init() {
    if (this.isInitialized) return;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.listener = this.audioContext.listener;
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = 1.0;

    // Set listener defaults (forward-facing)
    if (this.listener.positionX) {
      this.listener.positionX.value = 0;
      this.listener.positionY.value = 0;
      this.listener.positionZ.value = 0;
      this.listener.forwardX.value = 0;
      this.listener.forwardY.value = 0;
      this.listener.forwardZ.value = -1;
      this.listener.upX.value = 0;
      this.listener.upY.value = 1;
      this.listener.upZ.value = 0;
    } else {
      this.listener.setPosition(0, 0, 0);
      this.listener.setOrientation(0, 0, -1, 0, 1, 0);
    }

    this.isInitialized = true;
  }

  /** Create a spatial audio source from a URL */
  async createSource(id, url, position = { x: 0, y: 0, z: -5 }) {
    if (!this.audioContext) await this.init();

    const panner = this.audioContext.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 100;
    panner.rolloffFactor = 1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0;

    this.setSourcePosition(panner, position);

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1.0;

    panner.connect(gainNode);
    gainNode.connect(this.masterGain);

    this.sources.set(id, { panner, gainNode, element: null, source: null });
    return id;
  }

  /** Attach an HTML audio/video element as the source */
  attachMediaElement(id, mediaElement) {
    const entry = this.sources.get(id);
    if (!entry) return;

    const source = this.audioContext.createMediaElementSource(mediaElement);
    source.connect(entry.panner);
    entry.source = source;
    entry.element = mediaElement;
  }

  /** Create a source directly from an audio element */
  async createSourceFromElement(id, mediaElement, position = { x: 0, y: 0, z: -5 }) {
    await this.createSource(id, null, position);
    this.attachMediaElement(id, mediaElement);
    return id;
  }

  /** Update a source's 3D position */
  setSourcePosition(pannerOrId, position) {
    let panner = pannerOrId;
    if (typeof pannerOrId === 'string') {
      const entry = this.sources.get(pannerOrId);
      if (!entry) return;
      panner = entry.panner;
    }

    if (panner.positionX) {
      panner.positionX.value = position.x || 0;
      panner.positionY.value = position.y || 0;
      panner.positionZ.value = position.z || -5;
    } else {
      panner.setPosition(position.x || 0, position.y || 0, position.z || -5);
    }
  }

  /** Update listener orientation (for VR head rotation) */
  updateListenerOrientation(forward, up) {
    if (!this.listener) return;
    if (this.listener.forwardX) {
      this.listener.forwardX.value = forward.x;
      this.listener.forwardY.value = forward.y;
      this.listener.forwardZ.value = forward.z;
      this.listener.upX.value = up.x;
      this.listener.upY.value = up.y;
      this.listener.upZ.value = up.z;
    } else {
      this.listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Update listener position */
  updateListenerPosition(position) {
    if (!this.listener) return;
    if (this.listener.positionX) {
      this.listener.positionX.value = position.x;
      this.listener.positionY.value = position.y;
      this.listener.positionZ.value = position.z;
    } else {
      this.listener.setPosition(position.x, position.y, position.z);
    }
  }

  /** Set master volume */
  setMasterVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Set individual source volume */
  setSourceVolume(id, value) {
    const entry = this.sources.get(id);
    if (entry) {
      entry.gainNode.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /** Resume audio context (needed after user gesture) */
  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /** Clean up a source */
  removeSource(id) {
    const entry = this.sources.get(id);
    if (entry) {
      if (entry.source) entry.source.disconnect();
      entry.panner.disconnect();
      entry.gainNode.disconnect();
      this.sources.delete(id);
    }
  }

  /** Clean up everything */
  destroy() {
    for (const [id] of this.sources) {
      this.removeSource(id);
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.isInitialized = false;
  }
}

export const spatialAudio = new SpatialAudioEngine();
export default SpatialAudioEngine;
