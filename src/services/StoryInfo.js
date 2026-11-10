// StoryInfo.js — Canonical Story Identification & Historical Badge Registry

export function getStoryInfo(sessionOrStoryId) {
  const sid = (typeof sessionOrStoryId === 'string'
    ? sessionOrStoryId
    : (sessionOrStoryId?.story_id || sessionOrStoryId?.storyId || '')).toLowerCase();

  if (sid.includes('kite')) {
    return {
      id: 'story_missing_kite',
      title: 'The Missing Kite',
      emoji: '🪁',
      badgeClass: 'story-badge-kite'
    };
  }
  if (sid.includes('lantern')) {
    return {
      id: 'story_lantern_garden',
      title: "The Lantern in Grandmother's Garden",
      emoji: '🏮',
      badgeClass: 'story-badge-lantern'
    };
  }
  return {
    id: 'ayurveda_intro_v1',
    title: 'Ayurveda',
    emoji: '🌿',
    badgeClass: 'story-badge-ayurveda'
  };
}

export default getStoryInfo;
