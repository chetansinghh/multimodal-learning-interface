// StoryLoader — fetches, validates, and provides story configs.
// Proves story-agnosticism: any valid JSON matching the schema works.

/** Parse time string "MM:SS" to seconds */
export function parseTime(timeStr) {
  if (typeof timeStr === 'number') return timeStr;
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
  if (!config.assessment) errors.push('Missing assessment object');
  if (config.assessment && (!config.assessment.levels || config.assessment.levels.length === 0)) {
    errors.push('Assessment must have at least one level');
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
  if (!segments) return null;
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
    const endSec = triggerSec + (inter.duration || 10);
    if (currentTime >= triggerSec && currentTime < endSec) return inter;
  }
  return null;
}

/** Get VR hotspots for a given segment */
export function getSegmentHotspots(vrScene, segmentId) {
  if (!vrScene || !vrScene.hotspots) return [];
  return vrScene.hotspots.filter(h => h.segment_id === segmentId);
}

/** Get the VR segment config for a given segment */
export function getVRSegmentConfig(vrScene, segmentId) {
  if (!vrScene || !vrScene.segments) return null;
  return vrScene.segments.find(s => s.segment_id === segmentId);
}

/** Fallback list of available stories */
export const AVAILABLE_STORIES = [
  { id: 'water_cycle_v1', path: '/stories/water_cycle_v1.json', title: 'The Journey of a Water Droplet' },
  { id: 'photosynthesis_v1', path: '/stories/photosynthesis_v1.json', title: 'The Leaf Factory' },
  { id: 'milo_garden_rescue_v1', path: '/stories/story_milo_garden_rescue_v1.json', title: 'Milo and the Little Garden Rescue' },
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
