// C1 – Simple Video Player
// Baseline condition: plain video + audio, no interaction.
// Full event logging for VIDEO_* events.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { getCurrentSegment, parseTime, formatTime } from '../../services/StoryLoader';
import { audioSynth } from '../../services/AudioSynthesizer';
import './PlayerCommon.css';

export default function SimpleVideoPlayer({ storyConfig, onComplete }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const controlsTimeout = useRef(null);

  const segments = storyConfig.segments || [];
  const totalDuration = storyConfig.duration_sec || 600;

  // ─── Procedural Video Generation ────
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
    let t = 0;

    const render = () => {
      t = currentTimeRef.current;
      const seg = getCurrentSegment(segments, t);
      drawScene(ctx, canvas.width, canvas.height, t, seg, totalDuration, storyConfig.title);
      animRef.current = requestAnimationFrame(render);
    };
    render();
  };

  const currentTimeRef = useRef(0);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // ─── Playback & Audio ────
  const playIntervalRef = useRef(null);

  const play = useCallback(async () => {
    if (playing) return;
    setPlaying(true);
    await audioSynth.start(false);
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
  }, [playing, currentTime]);

  const seek = useCallback((time) => {
    eventLogger.log('VIDEO_SEEK', { videoTimestamp: time, response: `from:${currentTime.toFixed(1)}` });
    setCurrentTime(time);
  }, [currentTime]);

  const replay = useCallback(() => {
    eventLogger.log('VIDEO_REPLAY', { videoTimestamp: 0 });
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

  // Auto-hide controls
  const showControlsBriefly = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="player-container" onMouseMove={showControlsBriefly} onClick={showControlsBriefly}>
      {/* Segment indicator */}
      <div className="segment-indicator">
        {currentSegment && (
          <>
            <div className="segment-dot" style={{ backgroundColor: currentSegment.color }} />
            <span className="segment-name">{currentSegment.label}</span>
          </>
        )}
      </div>

      {/* Canvas-based procedural animation */}
      <canvas ref={canvasRef} className="player-canvas" />

      {/* Timeline & Controls */}
      <div className={`player-controls ${showControls ? 'visible' : ''}`}>
        {/* Segment timeline */}
        <div className="segment-timeline">
          {segments.map(seg => {
            const startPct = (parseTime(seg.start) / totalDuration) * 100;
            const widthPct = ((parseTime(seg.end) - parseTime(seg.start)) / totalDuration) * 100;
            return (
              <div
                key={seg.id}
                className="segment-block"
                style={{
                  left: `${startPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: seg.color || '#666'
                }}
                onClick={() => seek(parseTime(seg.start))}
                title={seg.label}
              />
            );
          })}
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <input
            type="range"
            className="seek-slider"
            min="0"
            max={totalDuration}
            step="0.1"
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </div>

        <div className="controls-row">
          <button className="control-btn" onClick={() => seek(Math.max(0, currentTime - 10))}>
            ⏪ 10s
          </button>
          <button className="control-btn play-btn" onClick={playing ? pause : play}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="control-btn" onClick={() => seek(Math.min(totalDuration, currentTime + 10))}>
            10s ⏩
          </button>
          <button className="control-btn" onClick={replay}>🔄</button>
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Procedural Scene Drawing ────────────────────────────────────────
function drawScene(ctx, w, h, time, segment, totalDuration, title) {
  const segIndex = segment ? parseInt(segment.id.replace('seg', '')) - 1 : 0;

  // Background gradient based on segment
  const colors = [
    ['#FF6B35', '#FF8E53', '#1a1a2e'], // Evaporation — warm
    ['#4ECDC4', '#44A08D', '#0f1923'], // Condensation — cool
    ['#45B7D1', '#2C3E50', '#1a1a2e'], // Precipitation — stormy
    ['#96CEB4', '#48BB78', '#0f1923'], // Collection — nature
  ];
  const [c1, c2, c3] = colors[segIndex] || colors[0];

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, c1);
  grad.addColorStop(0.5, c2);
  grad.addColorStop(1, c3);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Animated elements based on segment
  const t = time * 2;

  if (segIndex === 0) {
    // Evaporation: sun + rising particles
    drawSun(ctx, w * 0.8, h * 0.15, 60 + Math.sin(t * 0.5) * 10);
    drawWater(ctx, w, h, t);
    for (let i = 0; i < 15; i++) {
      const x = w * (0.2 + (i * 0.04) + Math.sin(t * 0.3 + i) * 0.05);
      const y = h * (0.9 - ((t * 0.02 + i * 0.15) % 0.7));
      drawParticle(ctx, x, y, 3 + Math.sin(t + i) * 2, 'rgba(255,255,255,0.5)');
    }
  } else if (segIndex === 1) {
    // Condensation: clouds forming
    for (let i = 0; i < 5; i++) {
      const cx = w * (0.15 + i * 0.18 + Math.sin(t * 0.1 + i) * 0.03);
      const cy = h * (0.2 + Math.sin(t * 0.2 + i * 2) * 0.05);
      const r = 40 + Math.sin(t * 0.3 + i) * 15;
      drawCloud(ctx, cx, cy, r);
    }
    // Tiny droplets merging
    for (let i = 0; i < 20; i++) {
      const x = w * (0.1 + Math.random() * 0.8);
      const y = h * (0.15 + Math.random() * 0.3);
      drawParticle(ctx, x, y, 2, 'rgba(200,230,255,0.4)');
    }
  } else if (segIndex === 2) {
    // Precipitation: rain falling
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
    // Collection: river flowing
    ctx.strokeStyle = 'rgba(100,180,220,0.4)';
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.3);
    ctx.bezierCurveTo(
      w * 0.3, h * (0.4 + Math.sin(t * 0.2) * 0.05),
      w * 0.6, h * (0.5 + Math.cos(t * 0.15) * 0.05),
      w * 0.9, h * 0.7
    );
    ctx.stroke();
    // Trees
    for (let i = 0; i < 6; i++) {
      drawTree(ctx, w * (0.05 + i * 0.17), h * 0.55 + Math.sin(i) * 30);
    }
  }

  // Title overlay
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
    ctx.fillText(segment.label, w - 16, h - 20);
  }
}

function drawSun(ctx, x, y, r) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, 'rgba(255,220,50,0.9)');
  grad.addColorStop(0.5, 'rgba(255,180,50,0.5)');
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
  ctx.arc(x + r * 0.2, y + r * 0.1, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawTree(ctx, x, y) {
  ctx.fillStyle = 'rgba(50,100,50,0.7)';
  ctx.beginPath();
  ctx.moveTo(x, y - 40);
  ctx.lineTo(x + 20, y);
  ctx.lineTo(x - 20, y);
  ctx.fill();
  ctx.fillStyle = 'rgba(80,50,30,0.7)';
  ctx.fillRect(x - 4, y, 8, 15);
}
