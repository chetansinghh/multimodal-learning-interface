// C2 – Spatial Audio Player
// Extends C1 with Web Audio API spatial/3D audio — sound panning matches on-screen events.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { spatialAudio } from '../../services/SpatialAudioEngine';
import { getCurrentSegment, parseTime, formatTime } from '../../services/StoryLoader';
import { audioSynth } from '../../services/AudioSynthesizer';
import './PlayerCommon.css';

export default function SpatialAudioPlayer({ storyConfig, onComplete }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [audioInitialized, setAudioInitialized] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const [isMuted, setIsMuted] = useState(false);
  const controlsTimeout = useRef(null);
  const currentTimeRef = useRef(0);
  const playIntervalRef = useRef(null);

  const segments = storyConfig.segments || [];
  const totalDuration = storyConfig.duration_sec || 600;

  // Initialize spatial audio on first interaction
  const initAudio = async () => {
    if (audioInitialized) return;
    try {
      await spatialAudio.init();
      await spatialAudio.resume();
      await audioSynth.start(true);
      setAudioInitialized(true);
      eventLogger.log('AUDIO_START', { videoTimestamp: currentTime });
    } catch (err) {
      console.warn('Spatial audio init failed:', err);
    }
  };

  // Update spatial audio position based on segment/time
  useEffect(() => {
    const seg = getCurrentSegment(segments, currentTime);
    if (!seg) return;

    const segIndex = Math.max(0, segments.findIndex(s => s.id === seg.id));
    const positions = [
      { x: 0, y: -2, z: -5 },
      { x: -3, y: 3, z: -4 },
      { x: 0, y: 5, z: -3 },
      { x: 3, y: -1, z: -5 },
    ];

    const basePos = positions[segIndex % positions.length] || positions[0];
    const dynamicPos = {
      x: basePos.x + Math.sin(currentTime * 0.3) * 2,
      y: basePos.y + Math.cos(currentTime * 0.2) * 1,
      z: basePos.z
    };

    const forward = {
      x: (mousePos.x - 0.5) * 2,
      y: -(mousePos.y - 0.5) * 2,
      z: -1
    };
    const len = Math.sqrt(forward.x ** 2 + forward.y ** 2 + forward.z ** 2);
    forward.x /= len; forward.y /= len; forward.z /= len;

    spatialAudio.updateListenerOrientation(forward, { x: 0, y: 1, z: 0 });
    audioSynth.setSpatialPosition(dynamicPos.x, dynamicPos.y, dynamicPos.z);

  }, [currentTime, mousePos, segments]);

  // ─── Playback (canvas + spatial audio) ────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 960;
    canvas.height = 540;
    startAnimation();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      audioSynth.stop();
    };
  }, []);

  const startAnimation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const render = () => {
      const t = currentTimeRef.current;
      const seg = getCurrentSegment(segments, t);
      drawSpatialScene(ctx, canvas.width, canvas.height, t, seg, totalDuration, storyConfig.title, mousePos);
      animRef.current = requestAnimationFrame(render);
    };
    render();
  };

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const play = useCallback(async () => {
    if (playing) return;
    await initAudio();
    setPlaying(true);
    await audioSynth.start(true);
    eventLogger.log(currentTime === 0 ? 'VIDEO_START' : 'VIDEO_RESUME', { videoTimestamp: currentTime });

    playIntervalRef.current = setInterval(() => {
      setCurrentTime(prev => {
        const next = prev + 0.1;
        if (next >= totalDuration) {
          clearInterval(playIntervalRef.current);
          setPlaying(false);
          audioSynth.stop();
          eventLogger.log('VIDEO_COMPLETE', { videoTimestamp: totalDuration });
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
    audioSynth.pause();
    eventLogger.log('VIDEO_PAUSE', { videoTimestamp: currentTime });
    eventLogger.log('AUDIO_PAUSE', { videoTimestamp: currentTime });
  }, [playing, currentTime]);

  const seek = useCallback((time) => {
    eventLogger.log('VIDEO_SEEK', { videoTimestamp: time });
    eventLogger.log('AUDIO_CHANGE', { videoTimestamp: time, action: 'seek' });
    setCurrentTime(time);
  }, []);

  const replay = useCallback(() => {
    eventLogger.log('VIDEO_REPLAY', { videoTimestamp: 0 });
    eventLogger.log('AUDIO_REPLAY', { videoTimestamp: 0 });
    setCurrentTime(0);
    play();
  }, [play]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioSynth.setMuted(nextMuted);
  };

  useEffect(() => {
    const seg = getCurrentSegment(segments, currentTime);
    if (seg && seg.id !== currentSegment?.id) {
      setCurrentSegment(seg);
      const segIdx = segments.findIndex(s => s.id === seg.id);
      audioSynth.onSegmentChange(seg, segIdx);
    }
  }, [currentTime, segments, currentSegment]);

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
      audioSynth.stop();
    };
  }, []);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    });
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="player-container" onMouseMove={handleMouseMove}>
      <div className="segment-indicator">
        {currentSegment && (
          <>
            <div className="segment-dot" style={{ backgroundColor: currentSegment.color }} />
            <span className="segment-name">{currentSegment.label}</span>
          </>
        )}
      </div>

      <div className="spatial-audio-indicator">
        <span className="audio-wave">🔊</span>
        <span>Spatial Audio — Move mouse to adjust listening direction</span>
      </div>

      {/* Spatial direction indicator */}
      <div className="spatial-direction" style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) rotate(${(mousePos.x - 0.5) * 60}deg)`,
        width: 40,
        height: 40,
        border: '2px solid rgba(78,205,196,0.3)',
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: 5,
        opacity: audioInitialized ? 0.5 : 0
      }}>
        <div style={{
          position: 'absolute',
          top: -4,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 6,
          height: 6,
          background: '#4ECDC4',
          borderRadius: '50%'
        }} />
      </div>

      <canvas ref={canvasRef} className="player-canvas" />

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
          <button className="control-btn" onClick={replay}>🔄</button>
          <span className="time-display">{formatTime(currentTime)} / {formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Spatial Scene Drawing (same base as C1, but with spatial audio visualization) ────
function drawSpatialScene(ctx, w, h, time, segment, totalDuration, title, mousePos) {
  const segIndex = segment ? parseInt(segment.id.replace('seg', '')) - 1 : 0;
  const colors = [
    ['#FF6B35', '#FF8E53', '#1a1a2e'],
    ['#4ECDC4', '#44A08D', '#0f1923'],
    ['#45B7D1', '#2C3E50', '#1a1a2e'],
    ['#96CEB4', '#48BB78', '#0f1923'],
  ];
  const [c1, c2, c3] = colors[segIndex] || colors[0];

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, c1);
  grad.addColorStop(0.5, c2);
  grad.addColorStop(1, c3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const t = time * 2;

  // Draw the same scene elements as C1
  if (segIndex === 0) {
    drawSun(ctx, w * 0.8, h * 0.15, 60 + Math.sin(t * 0.5) * 10);
    drawWater(ctx, w, h, t);
    for (let i = 0; i < 15; i++) {
      const x = w * (0.2 + (i * 0.04) + Math.sin(t * 0.3 + i) * 0.05);
      const y = h * (0.9 - ((t * 0.02 + i * 0.15) % 0.7));
      drawParticle(ctx, x, y, 3 + Math.sin(t + i) * 2, 'rgba(255,255,255,0.5)');
    }
  } else if (segIndex === 1) {
    for (let i = 0; i < 5; i++) {
      const cx = w * (0.15 + i * 0.18 + Math.sin(t * 0.1 + i) * 0.03);
      const cy = h * (0.2 + Math.sin(t * 0.2 + i * 2) * 0.05);
      drawCloud(ctx, cx, cy, 40 + Math.sin(t * 0.3 + i) * 15);
    }
  } else if (segIndex === 2) {
    drawCloud(ctx, w * 0.3, h * 0.12, 70);
    drawCloud(ctx, w * 0.6, h * 0.1, 80);
    for (let i = 0; i < 40; i++) {
      const x = w * (0.05 + (i * 0.025));
      const y = h * ((t * 0.05 + i * 0.1) % 1.0);
      ctx.strokeStyle = 'rgba(150,200,255,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 12);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = 'rgba(100,180,220,0.4)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.3);
    ctx.bezierCurveTo(w * 0.3, h * 0.45, w * 0.6, h * 0.5, w * 0.9, h * 0.7);
    ctx.stroke();
  }

  // Spatial audio visualization — concentric rings from sound source
  if (mousePos) {
    const srcX = w * (0.3 + segIndex * 0.15);
    const srcY = h * (0.3 + Math.sin(t * 0.1) * 0.1);
    for (let ring = 0; ring < 4; ring++) {
      const radius = 30 + ring * 25 + (t * 3) % 25;
      ctx.strokeStyle = `rgba(78,205,196,${0.3 - ring * 0.07})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(srcX, srcY, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(78,205,196,0.6)';
    ctx.beginPath();
    ctx.arc(srcX, srcY, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Title
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, h - 50, w, 50);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title || 'Story', 16, h - 20);
  if (segment) {
    ctx.textAlign = 'right';
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.fillStyle = segment.color || '#fff';
    ctx.fillText(segment.label + ' — Spatial Audio', w - 16, h - 20);
  }
}

function drawSun(ctx, x, y, r) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, 'rgba(255,220,50,0.9)');
  grad.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawWater(ctx, w, h, t) {
  ctx.fillStyle = 'rgba(30,80,140,0.5)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.75);
  for (let x = 0; x <= w; x += 10) {
    ctx.lineTo(x, h * 0.75 + Math.sin(x * 0.02 + t * 0.3) * 8);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
}

function drawCloud(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(220,230,240,0.7)';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.arc(x + r * 0.4, y - r * 0.2, r * 0.5, 0, Math.PI * 2);
  ctx.arc(x - r * 0.4, y - r * 0.1, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
