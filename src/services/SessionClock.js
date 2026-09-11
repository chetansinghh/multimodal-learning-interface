// Unified Session Clock — monotonic high-resolution clock for the entire session
// All events across video/audio/interaction/VR/assessment share this one clock.

class SessionClock {
  constructor() {
    this.startTime = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.startTime = performance.now();
    this.totalPausedMs = 0;
    this.pausedAt = null;
    this.running = true;
  }

  pause() {
    if (!this.running || this.pausedAt !== null) return;
    this.pausedAt = performance.now();
  }

  resume() {
    if (this.pausedAt === null) return;
    this.totalPausedMs += performance.now() - this.pausedAt;
    this.pausedAt = null;
  }

  /** Returns elapsed ms since start (excluding paused time) */
  now() {
    if (!this.startTime) return 0;
    const current = this.pausedAt !== null ? this.pausedAt : performance.now();
    return current - this.startTime - this.totalPausedMs;
  }

  /** ISO 8601 wall-clock timestamp */
  wallClock() {
    return new Date().toISOString();
  }

  reset() {
    this.startTime = null;
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.running = false;
  }
}

// Singleton
export const sessionClock = new SessionClock();
export default SessionClock;
