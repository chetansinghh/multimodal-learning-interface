// C3 – Interactive Player
// Video/audio + story-relevant interactions triggered at defined moments.
// Uses the InteractionVerbs library — config-driven per story.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { getCurrentSegment, getActiveInteraction, parseTime, formatTime } from '../../services/StoryLoader';
import { InteractionRenderer } from '../interactions/InteractionVerbs';
import { audioSynth } from '../../services/AudioSynthesizer';
import './PlayerCommon.css';

export default function InteractivePlayer({ storyConfig, onComplete }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentSegment, setCurrentSegment] = useState(null);
  const [activeInteraction, setActiveInteraction] = useState(null);
  const [completedInteractions, setCompletedInteractions] = useState(new Set());
  const [showControls, setShowControls] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const controlsTimeout = useRef(null);
  const currentTimeRef = useRef(0);
  const playIntervalRef = useRef(null);

  const segments = storyConfig.segments || [];
  const interactions = storyConfig.interactions || [];
  const totalDuration = storyConfig.duration_sec || 600;

  // ─── Animation ────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    const render = () => {
      const t = currentTimeRef.current;
      const seg = getCurrentSegment(segments, t);
      drawInteractiveScene(ctx, canvas.width, canvas.height, t, seg, totalDuration, storyConfig.title, interactions, completedInteractions);
      animRef.current = requestAnimationFrame(render);
    };
    render();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      audioSynth.stop();
    };
  }, [completedInteractions]);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // ─── Check for interaction triggers ────
  useEffect(() => {
    if (!playing) return;
    const interaction = getActiveInteraction(interactions, currentTime);
    if (interaction && !completedInteractions.has(interaction.id) && activeInteraction?.id !== interaction.id) {
      // Pause video and show interaction with verb sound cue
      setPlaying(false);
      clearInterval(playIntervalRef.current);
      setActiveInteraction(interaction);
      audioSynth.playSFX(interaction.verb);
      eventLogger.log('OBJECT_INTERACT', {
        videoTimestamp: currentTime,
        objectId: interaction.object_id,
        action: 'interaction_triggered',
        response: interaction.verb
      });
    }
  }, [currentTime, playing, interactions, completedInteractions, activeInteraction]);

  // ─── Playback ────
  const play = useCallback(async () => {
    if (playing || activeInteraction) return;
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
  }, [playing, currentTime, totalDuration, onComplete, activeInteraction]);

  const pause = useCallback(() => {
    if (!playing) return;
    setPlaying(false);
    clearInterval(playIntervalRef.current);
    audioSynth.pause();
    eventLogger.log('VIDEO_PAUSE', { videoTimestamp: currentTime });
  }, [playing, currentTime]);

  const seek = useCallback((time) => {
    eventLogger.log('VIDEO_SEEK', { videoTimestamp: time });
    setCurrentTime(time);
  }, []);

  const replay = useCallback(() => {
    eventLogger.log('VIDEO_REPLAY', { videoTimestamp: 0 });
    setCurrentTime(0);
    setCompletedInteractions(new Set());
    play();
  }, [play]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioSynth.setMuted(nextMuted);
  };

  const handleInteractionComplete = useCallback((result) => {
    if (!activeInteraction) return;
    audioSynth.playSFX('success');
    const newCompleted = new Set(completedInteractions);
    newCompleted.add(activeInteraction.id);
    setCompletedInteractions(newCompleted);
    setActiveInteraction(null);

    eventLogger.log('OBJECT_INTERACT', {
      videoTimestamp: currentTime,
      objectId: activeInteraction.object_id,
      action: 'interaction_completed',
      response: JSON.stringify(result)
    });

    // Auto-resume video after interaction completes
    play();
  }, [activeInteraction, completedInteractions, currentTime, play]);

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

  const showControlsBriefly = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  };

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
  const totalInteractions = interactions.length;
  const completedCount = completedInteractions.size;

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

      {/* Interaction counter */}
      <div className="condition-badge" style={{
        background: 'rgba(78,205,196,0.2)',
        borderColor: 'rgba(78,205,196,0.3)',
        color: '#4ECDC4'
      }}>
        🎮 Interactive — {completedCount}/{totalInteractions} activities
      </div>

      <canvas ref={canvasRef} className="player-canvas" />

      {/* Interaction overlay */}
      {activeInteraction && (
        <div className="interaction-layer">
          <InteractionRenderer
            interaction={activeInteraction}
            onComplete={handleInteractionComplete}
            videoTimestamp={currentTime}
          />
        </div>
      )}

      <div className={`player-controls ${showControls && !activeInteraction ? 'visible' : ''}`}>
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
          {/* Interaction markers */}
          {interactions.map(inter => {
            const pct = (parseTime(inter.trigger_time) / totalDuration) * 100;
            return (
              <div key={inter.id} className="interaction-marker" style={{
                position: 'absolute',
                left: `${pct}%`,
                top: 0,
                width: 4,
                height: '100%',
                background: completedInteractions.has(inter.id) ? 'rgba(76,175,80,0.8)' : 'rgba(255,215,0,0.8)',
                zIndex: 3,
                borderRadius: 2,
              }} title={`${inter.verb}: ${inter.prompt}`} />
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

// ─── Interactive Scene Drawing ────
function drawInteractiveScene(ctx, w, h, time, segment, totalDuration, title, interactions, completedInteractions) {
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

  // Basic scene elements
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
      drawCloud(ctx, w * (0.15 + i * 0.18), h * (0.2 + Math.sin(t * 0.2 + i * 2) * 0.05), 50);
    }
  } else if (segIndex === 2) {
    drawCloud(ctx, w * 0.3, h * 0.12, 70);
    drawCloud(ctx, w * 0.6, h * 0.1, 80);
    for (let i = 0; i < 40; i++) {
      const x = w * (0.05 + i * 0.025);
      const y = h * ((t * 0.05 + i * 0.1) % 1);
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

  // Draw upcoming interaction indicator
  const segInteractions = interactions.filter(i => i.segment_id === segment?.id && !completedInteractions.has(i.id));
  if (segInteractions.length > 0) {
    const nextInt = segInteractions[0];
    const triggerTime = parseTime(nextInt.trigger_time);
    const timeTill = triggerTime - time;
    if (timeTill > 0 && timeTill < 10) {
      ctx.fillStyle = `rgba(255,215,0,${0.3 + Math.sin(t * 2) * 0.2})`;
      ctx.font = 'bold 14px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`⚡ Activity in ${Math.ceil(timeTill)}s`, w / 2, 50);
    }
  }

  // Title
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, h - 50, w, 50);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(title || 'Story', 16, h - 20);
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
  for (let x = 0; x <= w; x += 10) ctx.lineTo(x, h * 0.75 + Math.sin(x * 0.02 + t * 0.3) * 8);
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
