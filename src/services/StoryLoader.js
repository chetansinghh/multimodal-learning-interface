// StoryLoader — fetches, validates, and provides story configs.
// Proves story-agnosticism: any valid JSON matching the schema works.

/** Parse time string "MM:SS" to seconds */
export function parseTime(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** Format seconds to "MM:SS" */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Normalize story assessment into standard levels (Recall, Perception, Apply, Implement) + experience survey */
export function normalizeAssessment(assessment) {
  if (!assessment) return { levels: [], experience_survey: [] };

  // If already in levels array format
  if (Array.isArray(assessment.levels) && assessment.levels.length > 0) {
    return {
      levels: assessment.levels,
      experience_survey: assessment.experience_survey || assessment.experience?.questions || []
    };
  }

  const levels = [];

  // 1. Recall & Understand (4 items)
  const recallItems = assessment.recallUnderstand || assessment.recall_understand;
  if (Array.isArray(recallItems) && recallItems.length > 0) {
    levels.push({
      level: 'recall_understand',
      label: 'Recall & Understand',
      description: 'Understanding characters, purpose, and key story details.',
      items: recallItems.map(it => ({
        id: it.id,
        type: it.type === 'multipleChoice' || it.type === 'multiple_choice' ? 'multiple_choice' : it.type,
        question: it.prompt || it.question,
        options: it.options || [],
        correct_answer: typeof it.correctOption === 'number'
          ? it.correctOption
          : typeof it.correct === 'number'
            ? it.correct
            : it.options
              ? it.options.indexOf(it.correct) >= 0 ? it.options.indexOf(it.correct) : 0
              : it.correct_answer,
        correct_text: it.correct || it.options?.[it.correctOption] || '',
        measure: it.measurement || it.measure || 'conceptual',
        explanation: it.explanation || `The correct answer is "${it.correct || it.options?.[it.correctOption] || it.options?.[it.correct_answer] || ''}".`
      }))
    });
  }

  // 2. Perception (2 items)
  const perceptionItems = assessment.perception;
  if (Array.isArray(perceptionItems) && perceptionItems.length > 0) {
    levels.push({
      level: 'perception',
      label: 'Detail Perception',
      description: 'Perception of visual, auditory, and spatial details.',
      items: perceptionItems.map(it => ({
        id: it.id,
        type: it.type === 'multipleChoice' || it.type === 'multiple_choice' ? 'multiple_choice' : it.type,
        question: it.prompt || it.question,
        options: it.options || [],
        correct_answer: typeof it.correctOption === 'number'
          ? it.correctOption
          : typeof it.correct === 'number'
            ? it.correct
            : it.options
              ? it.options.indexOf(it.correct) >= 0 ? it.options.indexOf(it.correct) : 0
              : it.correct_answer,
        correct_text: it.correct || it.options?.[it.correctOption] || '',
        measure: it.measurement || it.measure || 'perception',
        explanation: it.explanation || `The correct answer is "${it.correct || it.options?.[it.correctOption] || it.options?.[it.correct_answer] || ''}".`
      }))
    });
  }

  // 3. Apply (1 item)
  const applyItems = assessment.apply;
  if (Array.isArray(applyItems) && applyItems.length > 0) {
    levels.push({
      level: 'apply',
      label: 'Apply',
      description: 'Apply story principles and lessons to new situations.',
      items: applyItems.map(it => ({
        id: it.id,
        type: it.type === 'multipleChoice' || it.type === 'multiple_choice' || it.type === 'scenarioMultipleChoice' ? 'multiple_choice' : it.type,
        question: it.prompt || it.question,
        options: it.options || [],
        correct_answer: typeof it.correctOption === 'number'
          ? it.correctOption
          : typeof it.correct === 'number'
            ? it.correct
            : it.options
              ? it.options.indexOf(it.correct) >= 0 ? it.options.indexOf(it.correct) : 0
              : it.correct_answer,
        correct_text: it.correct || it.options?.[it.correctOption] || '',
        measure: it.measurement || it.measure || 'apply',
        explanation: it.explanation || `The best course of action is "${it.correct || it.options?.[it.correctOption] || it.options?.[it.correct_answer] || ''}".`
      }))
    });
  }

  // 4. Implement & Sequence (1 item)
  const implementItems = assessment.implement;
  if (Array.isArray(implementItems) && implementItems.length > 0) {
    levels.push({
      level: 'implement',
      label: 'Implement & Order',
      description: 'Sequence story events or assemble principles in proper order.',
      items: implementItems.map(it => {
        const rawItems = it.items || (it.items_to_order ? it.items_to_order.map(x => x.label || x.text || x.id || x) : []);
        const formattedItems = rawItems.map((lbl, idx) => ({
          id: typeof lbl === 'string' ? lbl : lbl.id || `item_${idx}`,
          label: typeof lbl === 'string' ? lbl : lbl.text || lbl.label || lbl.id || `Item ${idx + 1}`
        }));
        const correctOrder = it.correctOrder || it.correct_order || formattedItems.map(x => x.id);
        return {
          id: it.id,
          type: 'drag_order',
          question: it.prompt || it.question,
          items_to_order: formattedItems,
          correct_order: correctOrder,
          explanation: it.explanation || `Correct sequence: ${correctOrder.map(id => {
            const match = formattedItems.find(f => f.id === id);
            return match ? match.label : id;
          }).join(' → ')}`
        };
      })
    });
  }

  let experienceSurvey = [];
  if (Array.isArray(assessment.experience_survey)) {
    experienceSurvey = assessment.experience_survey;
  } else if (assessment.experience && Array.isArray(assessment.experience.questions)) {
    experienceSurvey = assessment.experience.questions.map(q => ({
      id: q.id,
      prompt: q.text || q.prompt
    }));
  }

  return { levels, experience_survey: experienceSurvey };
}

/** Validate a story config object against the required schema */
export function validateStoryConfig(config) {
  const errors = [];

  if (!config.story_id) errors.push('Missing story_id');
  if (!config.title) errors.push('Missing title');
  if (!config.duration_sec || config.duration_sec <= 0) errors.push('Invalid duration_sec');
  if (!config.media) errors.push('Missing media object');
  if (!config.segments || !Array.isArray(config.segments) || config.segments.length === 0) {
    errors.push('Missing or empty segments array');
  } else {
    config.segments.forEach((seg, i) => {
      if (!seg.id) errors.push(`Segment ${i}: missing id`);
      if (!seg.label) errors.push(`Segment ${i}: missing label`);
      if (seg.start === undefined) errors.push(`Segment ${i}: missing start`);
      if (seg.end === undefined) errors.push(`Segment ${i}: missing end`);
    });
  }
  if (!config.assessment) {
    errors.push('Missing assessment object');
  } else {
    const hasLevels = Array.isArray(config.assessment.levels) && config.assessment.levels.length > 0;
    const hasCategoryArrays = Array.isArray(config.assessment.recall_understand) ||
                              Array.isArray(config.assessment.apply) ||
                              Array.isArray(config.assessment.implement);
    if (!hasLevels && !hasCategoryArrays) {
      errors.push('Assessment must have at least one question level');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Fetch a story config from a URL or path */
export async function loadStoryConfig(urlOrPath) {
  const response = await fetch(urlOrPath);
  if (!response.ok) throw new Error(`Failed to load story: ${response.statusText}`);
  const config = await response.json();
  const validation = validateStoryConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid story config: ${validation.errors.join(', ')}`);
  }
  return config;
}

/** Get the current segment for a given time (seconds) */
export function getCurrentSegment(segments, currentTime) {
  if (!segments || segments.length === 0) return null;
  for (const seg of segments) {
    const start = parseTime(seg.start);
    const end = parseTime(seg.end);
    if (currentTime >= start && currentTime < end) return seg;
  }
  return segments[segments.length - 1]; // fallback to last
}

/** Get interactions for a given segment */
export function getSegmentInteractions(interactions, segmentId) {
  if (!interactions) return [];
  return interactions.filter(i => i.segment_id === segmentId);
}

/** Get the interaction that should trigger at a given time */
export function getActiveInteraction(interactions, currentTime) {
  if (!interactions) return null;
  for (const inter of interactions) {
    const triggerSec = parseTime(inter.trigger_time);
    const endSec = triggerSec + (inter.duration || 8);
    if (currentTime >= triggerSec && currentTime < endSec) return inter;
  }
  return null;
}

/** Get VR hotspots for a given segment */
export function getSegmentHotspots(vrScene, segmentId) {
  if (!vrScene || !vrScene.hotspots) return [];
  // If hotspots have segment_id, filter; otherwise return all hotspots
  const hasSegmentTags = vrScene.hotspots.some(h => h.segment_id);
  if (hasSegmentTags && segmentId) {
    const matched = vrScene.hotspots.filter(h => h.segment_id === segmentId);
    return matched.length > 0 ? matched : vrScene.hotspots;
  }
  return vrScene.hotspots;
}

/** Get the VR segment config for a given segment */
export function getVRSegmentConfig(vrScene, segmentId) {
  if (!vrScene || !vrScene.segments) return null;
  return vrScene.segments.find(s => s.segment_id === segmentId);
}

/** Fallback list of available stories */
export const AVAILABLE_STORIES = [
  { id: 'missing_kite_v1', path: '/stories/story_missing_kite_v1.json', title: 'The Missing Kite' },
  { id: 'lantern_garden_v1', path: '/stories/story_lantern_garden_v1.json', title: "The Lantern in Grandmother's Garden" }
];

/** Dynamically fetch auto-discovered available stories from manifest */
export async function loadAvailableStories() {
  try {
    const res = await fetch('/stories/index.json');
    if (!res.ok) throw new Error(`Failed to load index: ${res.statusText}`);
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return data;
  } catch (err) {
    console.warn('Could not fetch /stories/index.json, using fallback:', err);
  }
  return AVAILABLE_STORIES;
}

export const CONDITIONS = [
  { id: 'C1', label: 'C1 – Simple Video', description: 'Story as plain video + audio. No interaction.' },
  { id: 'C2', label: 'C2 – Spatial Audio', description: 'Same video with spatial/3D audio.' },
  { id: 'C3', label: 'C3 – Interactive', description: 'Video/audio + physical story-relevant interactions.' },
  { id: 'C4', label: 'C4 – VR Immersive', description: '360°/VR with spatial audio + VR-native interaction.' },
];
