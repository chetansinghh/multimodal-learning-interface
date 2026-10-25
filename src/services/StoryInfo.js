// StoryInfo.js — Canonical Story Identification & Badge Registry

export function getStoryInfo(sessionOrStoryId) {
  if (!sessionOrStoryId) return { id: 'unknown', title: 'Unrecognized Story', emoji: '❓', badgeClass: 'story-badge-unknown' };
  const s = typeof sessionOrStoryId === 'object' ? sessionOrStoryId : { story_id: sessionOrStoryId };
  const idStr = String(s.story_id || s.story_title || s.version_snapshot?.story_id || s.version_snapshot?.story_title || '').toLowerCase().trim();

  if (!idStr) {
    return { id: 'unknown', title: 'Unrecognized Story', emoji: '❓', badgeClass: 'story-badge-unknown' };
  }

  if (idStr.includes('ayurveda')) {
    return {
      id: 'ayurveda_intro_v1',
      title: s.story_title || s.version_snapshot?.story_title || 'Ayurveda',
      emoji: '🌿',
      badgeClass: 'story-badge-ayurveda'
    };
  }
  if (idStr.includes('lantern') || idStr.includes('garden')) {
    return {
      id: 'story_lantern_garden',
      title: s.story_title || s.version_snapshot?.story_title || "The Lantern in Grandmother's Garden",
      emoji: '🏮',
      badgeClass: 'story-badge-lantern'
    };
  }
  if (idStr.includes('kite')) {
    return {
      id: 'story_missing_kite',
      title: s.story_title || s.version_snapshot?.story_title || 'The Missing Kite',
      emoji: '🪁',
      badgeClass: 'story-badge-kite'
    };
  }
  return {
    id: idStr,
    title: s.story_title || s.version_snapshot?.story_title || `Unrecognized (${idStr})`,
    emoji: '❓',
    badgeClass: 'story-badge-unknown'
  };
}

export default getStoryInfo;
