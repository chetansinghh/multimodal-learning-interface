// Interaction Verb Library — reusable, config-driven, story-agnostic interaction components
// Each verb is a physical, story-relevant gesture rendered as an interactive overlay.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { eventLogger } from '../../services/EventLogger';
import './InteractionVerbs.css';

// ─── TRACE PATH ─────────────────────────────────────────────────────
// Drag finger/cursor along a template path
export function TracePath({ config, interaction, onComplete, videoTimestamp }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [userPath, setUserPath] = useState([]);
  const [completed, setCompleted] = useState(false);
  const [accuracy, setAccuracy] = useState(0);

  const pathPoints = config.path_points || [];
  const tolerance = config.tolerance || 0.1;

  useEffect(() => {
    drawTemplate();
  }, []);

  const drawTemplate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw template path with glow
    ctx.strokeStyle = config.color || '#FFD93D';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.shadowColor = config.color || '#FFD93D';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    pathPoints.forEach((pt, i) => {
      const x = pt.x * w, y = pt.y * h;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Start/end markers
    if (pathPoints.length > 0) {
      const start = pathPoints[0];
      ctx.fillStyle = '#4CAF50';
      ctx.beginPath();
      ctx.arc(start.x * w, start.y * h, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START', start.x * w, start.y * h - 16);
    }

    // Draw user path
    if (userPath.length > 1) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      userPath.forEach((pt, i) => {
        i === 0 ? ctx.moveTo(pt.x * w, pt.y * h) : ctx.lineTo(pt.x * w, pt.y * h);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  };

  useEffect(() => { drawTemplate(); }, [userPath]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  };

  const handleStart = (e) => {
    e.preventDefault();
    setDrawing(true);
    setUserPath([getPos(e)]);
    eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'trace_start' });
  };

  const handleMove = (e) => {
    e.preventDefault();
    if (!drawing) return;
    setUserPath(prev => [...prev, getPos(e)]);
  };

  const handleEnd = (e) => {
    e.preventDefault();
    if (!drawing) return;
    setDrawing(false);

    // Calculate accuracy
    const acc = calculatePathAccuracy(userPath, pathPoints, tolerance);
    setAccuracy(acc);

    if (acc >= 0.7) {
      setCompleted(true);
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'trace_complete', response: `accuracy:${acc.toFixed(2)}` });
      setTimeout(() => onComplete && onComplete(acc), 800);
    } else {
      setUserPath([]);
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'trace_retry', response: `accuracy:${acc.toFixed(2)}` });
    }
  };

  return (
    <div className={`interaction-overlay trace-path ${completed ? 'completed' : ''}`}>
      <div className="interaction-prompt">{interaction.prompt}</div>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
      {completed && (
        <div className="interaction-success">
          <span className="success-icon">✓</span>
          <span>Path traced! Accuracy: {Math.round(accuracy * 100)}%</span>
        </div>
      )}
      {!completed && userPath.length === 0 && (
        <div className="interaction-hint">Draw along the dotted path</div>
      )}
    </div>
  );
}

function calculatePathAccuracy(userPath, templatePath, tolerance) {
  if (userPath.length < 2 || templatePath.length < 2) return 0;
  let matchedPoints = 0;
  for (const tpt of templatePath) {
    const minDist = Math.min(...userPath.map(upt =>
      Math.sqrt((upt.x - tpt.x) ** 2 + (upt.y - tpt.y) ** 2)
    ));
    if (minDist <= tolerance) matchedPoints++;
  }
  return matchedPoints / templatePath.length;
}

// ─── DRAG SORT ──────────────────────────────────────────────────────
// Drag objects into categorization zones
export function DragSort({ config, interaction, onComplete, videoTimestamp }) {
  const [items, setItems] = useState(
    () => [...(config.items || [])].sort(() => Math.random() - 0.5)
  );
  const [zoneAssignments, setZoneAssignments] = useState({});
  const [completed, setCompleted] = useState(false);
  const [dragItem, setDragItem] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const zones = config.zones || [];

  const handleDragStart = (item) => {
    setDragItem(item);
    eventLogger.log('SELECT', { videoTimestamp, objectId: item.id, action: 'drag_start' });
  };

  const handleDrop = (zoneId) => {
    if (!dragItem) return;
    const newAssignments = { ...zoneAssignments, [dragItem.id]: zoneId };
    setZoneAssignments(newAssignments);
    setDragItem(null);

    eventLogger.log('OBJECT_INTERACT', {
      videoTimestamp,
      objectId: dragItem.id,
      action: 'drop_to_zone',
      response: zoneId
    });

    // Check if all items are placed
    if (Object.keys(newAssignments).length === items.length) {
      checkAnswer(newAssignments);
    }
  };

  const checkAnswer = (assignments) => {
    let allCorrect = true;
    for (const [itemId, zoneId] of Object.entries(assignments)) {
      const zone = zones.find(z => z.id === zoneId);
      if (!zone || !zone.correct_items.includes(itemId)) {
        allCorrect = false;
        break;
      }
    }

    if (allCorrect) {
      setCompleted(true);
      setFeedback({ type: 'success', message: 'All sorted correctly!' });
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'sort_complete', response: 'correct' });
      setTimeout(() => onComplete && onComplete(1), 1000);
    } else {
      setFeedback({ type: 'error', message: 'Not quite right — try again!' });
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'sort_incorrect' });
      setTimeout(() => {
        setZoneAssignments({});
        setFeedback(null);
      }, 1200);
    }
  };

  const getZoneItems = (zoneId) =>
    items.filter(item => zoneAssignments[item.id] === zoneId);

  const unplacedItems = items.filter(item => !zoneAssignments[item.id]);

  return (
    <div className={`interaction-overlay drag-sort ${completed ? 'completed' : ''}`}>
      <div className="interaction-prompt">{interaction.prompt}</div>

      <div className="sort-items-tray">
        {unplacedItems.map(item => (
          <div
            key={item.id}
            className={`sort-item ${dragItem?.id === item.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => handleDragStart(item)}
            onTouchStart={() => handleDragStart(item)}
          >
            <span className="sort-item-icon">{item.icon}</span>
            <span className="sort-item-label">{item.label}</span>
            <span className="sort-item-desc">{item.description}</span>
          </div>
        ))}
      </div>

      <div className="sort-zones">
        {zones.map(zone => (
          <div
            key={zone.id}
            className={`sort-zone ${dragItem ? 'accepting' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(zone.id)}
            onClick={() => dragItem && handleDrop(zone.id)}
          >
            <div className="zone-label">{zone.label}</div>
            <div className="zone-items">
              {getZoneItems(zone.id).map(item => (
                <div key={item.id} className="zone-placed-item">
                  {item.icon} {item.label}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {feedback && (
        <div className={`interaction-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}
    </div>
  );
}

// ─── SLICE ───────────────────────────────────────────────────────────
// Swipe across an object to slice/split it
export function Slice({ config, interaction, onComplete, videoTimestamp }) {
  const canvasRef = useRef(null);
  const [sliced, setSliced] = useState(false);
  const [swipePath, setSwipePath] = useState([]);
  const [swiping, setSwiping] = useState(false);
  const animFrame = useRef(null);

  const objPos = config.object_position || { x: 0.5, y: 0.5 };
  const objRadius = config.object_radius || 0.12;

  useEffect(() => {
    drawScene();
    return () => { if (animFrame.current) cancelAnimationFrame(animFrame.current); };
  }, [sliced, swipePath]);

  const drawScene = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!sliced) {
      // Draw the object (raindrop shape)
      const cx = objPos.x * w, cy = objPos.y * h, r = objRadius * Math.min(w, h);
      const gradient = ctx.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy, r);
      gradient.addColorStop(0, config.color || '#45B7D1');
      gradient.addColorStop(1, 'rgba(69,183,209,0.3)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 1.3);
      ctx.bezierCurveTo(cx + r, cy - r * 0.3, cx + r, cy + r * 0.5, cx, cy + r);
      ctx.bezierCurveTo(cx - r, cy + r * 0.5, cx - r, cy - r * 0.3, cx, cy - r * 1.3);
      ctx.fill();

      // Glow
      ctx.shadowColor = config.color || '#45B7D1';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Swipe trail
      if (swipePath.length > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        swipePath.forEach((pt, i) => {
          i === 0 ? ctx.moveTo(pt.x * w, pt.y * h) : ctx.lineTo(pt.x * w, pt.y * h);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else {
      // Slice animation — two halves separating
      drawSliceAnimation(ctx, w, h, objPos, objRadius, config.color);
    }
  };

  const drawSliceAnimation = (ctx, w, h, pos, radius, color) => {
    const cx = pos.x * w, cy = pos.y * h, r = radius * Math.min(w, h);
    // Left half
    ctx.save();
    ctx.translate(-15, 5);
    ctx.fillStyle = color || '#45B7D1';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.3);
    ctx.bezierCurveTo(cx - r, cy - r * 0.3, cx - r, cy + r * 0.5, cx, cy + r);
    ctx.lineTo(cx, cy - r * 1.3);
    ctx.fill();
    ctx.restore();
    // Right half
    ctx.save();
    ctx.translate(15, -5);
    ctx.fillStyle = color || '#45B7D1';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.3);
    ctx.bezierCurveTo(cx + r, cy - r * 0.3, cx + r, cy + r * 0.5, cx, cy + r);
    ctx.lineTo(cx, cy - r * 1.3);
    ctx.fill();
    ctx.restore();
    // Particles
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(
        cx + (Math.random() - 0.5) * r * 3,
        cy + (Math.random() - 0.5) * r * 3,
        2 + Math.random() * 4, 0, Math.PI * 2
      );
      ctx.fill();
    }
  };

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
  };

  const handleStart = (e) => {
    e.preventDefault();
    setSwiping(true);
    setSwipePath([getPos(e)]);
  };

  const handleMove = (e) => {
    e.preventDefault();
    if (!swiping) return;
    setSwipePath(prev => [...prev, getPos(e)]);
  };

  const handleEnd = (e) => {
    e.preventDefault();
    if (!swiping) return;
    setSwiping(false);

    // Check if swipe crossed the object
    const crossed = swipePath.some(pt => {
      const dist = Math.sqrt((pt.x - objPos.x) ** 2 + (pt.y - objPos.y) ** 2);
      return dist < objRadius * 1.5;
    });

    if (crossed && swipePath.length > 3) {
      setSliced(true);
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'slice_success' });
      setTimeout(() => onComplete && onComplete(1), 1000);
    } else {
      setSwipePath([]);
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'slice_miss' });
    }
  };

  return (
    <div className={`interaction-overlay slice ${sliced ? 'completed' : ''}`}>
      <div className="interaction-prompt">{interaction.prompt}</div>
      <canvas
        ref={canvasRef}
        width={600}
        height={400}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      />
      {sliced && (
        <div className="interaction-success">
          <span className="success-icon">⚡</span>
          <span>Sliced!</span>
        </div>
      )}
      {!sliced && <div className="interaction-hint">Swipe through the droplet!</div>}
    </div>
  );
}

// ─── ASSEMBLE ────────────────────────────────────────────────────────
// Drag pieces into slots in the correct sequence
export function Assemble({ config, interaction, onComplete, videoTimestamp }) {
  const [pieces] = useState(() => [...(config.pieces || [])].sort(() => Math.random() - 0.5));
  const [slotFills, setSlotFills] = useState({});
  const [dragPiece, setDragPiece] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const slots = config.slots || [];

  const handleDragStart = (piece) => {
    setDragPiece(piece);
    eventLogger.log('SELECT', { videoTimestamp, objectId: piece.id, action: 'pick_piece' });
  };

  const handleDrop = (slotIndex) => {
    if (!dragPiece) return;
    const newFills = { ...slotFills, [slotIndex]: dragPiece };
    setSlotFills(newFills);
    setDragPiece(null);

    eventLogger.log('OBJECT_INTERACT', {
      videoTimestamp,
      objectId: dragPiece.id,
      action: 'place_piece',
      response: `slot_${slotIndex}`
    });

    // Check if all slots filled
    if (Object.keys(newFills).length === pieces.length) {
      checkAssembly(newFills);
    }
  };

  const checkAssembly = (fills) => {
    let allCorrect = true;
    for (const piece of pieces) {
      const placedSlot = Object.entries(fills).find(([, p]) => p.id === piece.id);
      if (!placedSlot || Number(placedSlot[0]) !== piece.correct_slot) {
        allCorrect = false;
        break;
      }
    }

    if (allCorrect) {
      setCompleted(true);
      setFeedback({ type: 'success', message: 'Perfectly assembled!' });
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'assemble_complete', response: 'correct' });
      setTimeout(() => onComplete && onComplete(1), 1000);
    } else {
      setFeedback({ type: 'error', message: 'Not in the right order — try again!' });
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'assemble_incorrect' });
      setTimeout(() => {
        setSlotFills({});
        setFeedback(null);
      }, 1200);
    }
  };

  const placedIds = Object.values(slotFills).map(p => p.id);
  const availablePieces = pieces.filter(p => !placedIds.includes(p.id));

  return (
    <div className={`interaction-overlay assemble ${completed ? 'completed' : ''}`}>
      <div className="interaction-prompt">{interaction.prompt}</div>

      <div className="assemble-pieces">
        {availablePieces.map(piece => (
          <div
            key={piece.id}
            className={`assemble-piece ${dragPiece?.id === piece.id ? 'dragging' : ''}`}
            draggable
            onDragStart={() => handleDragStart(piece)}
            onClick={() => !dragPiece ? handleDragStart(piece) : null}
          >
            <span className="piece-icon">{piece.icon}</span>
            <span className="piece-label">{piece.label}</span>
          </div>
        ))}
      </div>

      <div className="assemble-slots">
        {slots.map((slot, index) => (
          <div
            key={slot.id}
            className={`assemble-slot ${slotFills[index] ? 'filled' : ''} ${dragPiece ? 'accepting' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            onClick={() => dragPiece && handleDrop(index)}
          >
            {slotFills[index] ? (
              <span>{slotFills[index].icon} {slotFills[index].label}</span>
            ) : (
              <span className="slot-placeholder">{slot.label}</span>
            )}
          </div>
        ))}
      </div>

      {feedback && (
        <div className={`interaction-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}
    </div>
  );
}

// ─── HOLD CHARGE ─────────────────────────────────────────────────────
// Press and hold to fill a meter (gradual process)
export function HoldCharge({ config, interaction, onComplete, videoTimestamp }) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef(null);

  const fillDuration = config.fill_duration_ms || 3000;

  const startHold = () => {
    if (completed) return;
    setHolding(true);
    eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'hold_start' });
    const stepMs = 30;
    const increment = (stepMs / fillDuration) * 100;
    intervalRef.current = setInterval(() => {
      setProgress(prev => {
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(intervalRef.current);
          setHolding(false);
          setCompleted(true);
          eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'hold_complete' });
          setTimeout(() => onComplete && onComplete(1), 600);
          return 100;
        }
        return next;
      });
    }, stepMs);
  };

  const stopHold = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setHolding(false);
    if (!completed) {
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'hold_release', response: `${Math.round(progress)}%` });
    }
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <div className={`interaction-overlay hold-charge ${completed ? 'completed' : ''}`}>
      <div className="interaction-prompt">{interaction.prompt}</div>

      <div
        className={`charge-button ${holding ? 'holding' : ''} ${completed ? 'charged' : ''}`}
        onMouseDown={startHold}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={startHold}
        onTouchEnd={stopHold}
      >
        <div className="charge-fill" style={{ height: `${progress}%`, backgroundColor: config.color || '#FF6B35' }} />
        <div className="charge-label">{config.meter_label || 'Energy'}</div>
        <div className="charge-percent">{Math.round(progress)}%</div>
      </div>

      {!completed && <div className="interaction-hint">Press and hold!</div>}
      {completed && (
        <div className="interaction-success">
          <span className="success-icon">⚡</span>
          <span>Fully charged!</span>
        </div>
      )}
    </div>
  );
}

// ─── SELECT HOTSPOT ──────────────────────────────────────────────────
// Tap/click highlighted regions to reveal info
export function SelectHotspot({ config, interaction, onComplete, videoTimestamp }) {
  const [revealed, setRevealed] = useState(new Set());
  const [activeInfo, setActiveInfo] = useState(null);
  const [completed, setCompleted] = useState(false);

  const hotspots = config.hotspots || [];

  const handleSelect = (hs) => {
    if (completed) return;

    eventLogger.log('HOTSPOT_OPEN', { videoTimestamp, objectId: hs.id, action: 'select_hotspot' });

    const newRevealed = new Set(revealed);
    newRevealed.add(hs.id);
    setRevealed(newRevealed);
    setActiveInfo(hs);

    if (newRevealed.size === hotspots.length) {
      setCompleted(true);
      eventLogger.log('OBJECT_INTERACT', { videoTimestamp, objectId: interaction.object_id, action: 'all_hotspots_selected' });
      setTimeout(() => onComplete && onComplete(1), 1500);
    }
  };

  const dismissInfo = () => {
    if (activeInfo) {
      eventLogger.log('HOTSPOT_CLOSE', { videoTimestamp, objectId: activeInfo.id, action: 'dismiss_info' });
    }
    setActiveInfo(null);
  };

  return (
    <div className={`interaction-overlay select-hotspot ${completed ? 'completed' : ''}`}>
      <div className="interaction-prompt">{interaction.prompt}</div>

      <div className="hotspot-container">
        {hotspots.map(hs => (
          <button
            key={hs.id}
            className={`hotspot-marker ${revealed.has(hs.id) ? 'revealed' : 'pulse'}`}
            style={{ left: `${hs.x * 100}%`, top: `${hs.y * 100}%` }}
            onClick={() => handleSelect(hs)}
          >
            <span className="hotspot-dot" />
            {revealed.has(hs.id) && <span className="hotspot-label">{hs.label}</span>}
          </button>
        ))}

        {activeInfo && (
          <div className="hotspot-info-card" onClick={dismissInfo}>
            <h4>{activeInfo.label}</h4>
            <p>{activeInfo.info}</p>
            <span className="dismiss-hint">Tap to dismiss</span>
          </div>
        )}
      </div>

      <div className="hotspot-progress">
        {revealed.size} / {hotspots.length} discovered
      </div>
    </div>
  );
}

// ─── VERB RENDERER ───────────────────────────────────────────────────
// Maps a verb string to the correct component
export function InteractionRenderer({ interaction, onComplete, videoTimestamp }) {
  if (!interaction) return null;

  const props = {
    config: interaction.config || {},
    interaction,
    onComplete,
    videoTimestamp
  };

  switch (interaction.verb) {
    case 'trace_path': return <TracePath {...props} />;
    case 'drag_sort': return <DragSort {...props} />;
    case 'slice': return <Slice {...props} />;
    case 'assemble': return <Assemble {...props} />;
    case 'hold_charge': return <HoldCharge {...props} />;
    case 'select_hotspot': return <SelectHotspot {...props} />;
    default:
      console.warn(`Unknown interaction verb: ${interaction.verb}`);
      return <div className="interaction-overlay">Unknown interaction: {interaction.verb}</div>;
  }
}
