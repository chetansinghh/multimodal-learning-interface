// verifyPipeline.js — Complete Automated Test Suite for Master Implementation Prompt
import { centralDb } from '../server/db/centralDb.js';
import { getStoryInfo } from '../src/services/StoryInfo.js';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('🧪 Starting Master Verification Test Suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ─── TEST 1: Central Database Event Persistence & Payload Preservation ────
  console.log('--- Test 1: Event Synchronization & Payload Preservation ---');
  const testEventId = 'ev_test_unit_' + Date.now();
  const testEvent = {
    event_id: testEventId,
    session_id: 'SESS_AYUR_TEST_01',
    participant_id: 'P_RESEARCH_01',
    condition: 'C4',
    story_id: 'ayurveda_intro_v1',
    event_type: 'OBJECT_PLACED',
    event: 'OBJECT_PLACED',
    timestamp: 42150,
    elapsed_ms: 42150,
    timestamp_utc: '2026-10-25T16:30:00.000Z',
    video_timestamp: 44.2,
    target_id: 'dhonga_mortar',
    object_id: 'herb_ashwagandha',
    action: 'place',
    result: 'completed',
    payload: {
      ingredientName: 'Ashwagandha Roots & Leaves',
      grindState: 'pre_grind',
      temperatureC: 24.5,
      nestedData: {
        plinthAligned: false,
        elementResonance: 528
      }
    }
  };

  const countSaved = await centralDb.saveEvents([testEvent]);
  assert(countSaved === 1, 'centralDb.saveEvents saved 1 event record');

  const allEvents = await centralDb.getEvents();
  const retrieved = allEvents.find(e => e.event_id === testEventId);

  assert(retrieved !== undefined, 'Saved event is retrievable by event_id');
  assert(retrieved.payload !== undefined, 'Payload exists on retrieved event');
  assert(retrieved.payload.ingredientName === 'Ashwagandha Roots & Leaves', 'Payload field ingredientName preserved');
  assert(retrieved.payload.nestedData?.elementResonance === 528, 'Nested payload preserved with 100% fidelity');
  assert(retrieved.elapsed_ms === 42150, 'Elapsed milliseconds preserved distinctly as integer');
  assert(retrieved.timestamp_utc === '2026-10-25T16:30:00.000Z', 'ISO UTC timestamp preserved');
  assert(retrieved.video_timestamp === 44.2, 'Video timestamp preserved');
  assert(retrieved.condition === 'C4', 'Condition preserved');
  assert(retrieved.story_id === 'ayurveda_intro_v1', 'Story ID preserved');

  // ─── TEST 2: Deduplication on Retry / Repeated Delivery ────
  console.log('\n--- Test 2: Event Deduplication on Retry ---');
  const duplicateEvent = {
    ...testEvent,
    payload: {
      ...testEvent.payload,
      retryCount: 1
    }
  };

  const retrySaved = await centralDb.saveEvents([duplicateEvent]);
  const eventsAfterRetry = await centralDb.getEvents();
  const duplicates = eventsAfterRetry.filter(e => e.event_id === testEventId);

  assert(duplicates.length === 1, 'Duplicate delivery with same event_id does NOT create duplicate records');
  assert(duplicates[0].payload.retryCount === 1, 'Retry successfully updated payload without duplication');

  // ─── TEST 3: Backward Compatibility with Legacy Schema (data instead of payload) ────
  console.log('\n--- Test 3: Backward Compatibility with Legacy Events ---');
  const legacyEventId = 'ev_legacy_' + Date.now();
  const legacyEvent = {
    event_id: legacyEventId,
    session_id: 'SESS_LEGACY_01',
    participant_id: 'P_LEGACY_01',
    event_type: 'LEGACY_CLICK',
    timestamp: 12000,
    data: {
      legacyButton: 'startButton',
      clickCount: 1
    }
  };

  await centralDb.saveEvents([legacyEvent]);
  const eventsWithLegacy = await centralDb.getEvents();
  const retrievedLegacy = eventsWithLegacy.find(e => e.event_id === legacyEventId);

  assert(retrievedLegacy !== undefined, 'Legacy event saved and retrieved');
  assert(retrievedLegacy.payload !== undefined, 'Legacy data normalized to canonical payload');
  assert(retrievedLegacy.payload.legacyButton === 'startButton', 'Legacy payload content preserved');

  // ─── TEST 4: Story Attribution in Researcher Dashboard ────
  console.log('\n--- Test 4: Story Attribution in Researcher Dashboard ---');
  const ayurInfo = getStoryInfo('ayurveda_intro_v1');
  assert(ayurInfo.id === 'ayurveda_intro_v1', 'Ayurveda story ID mapped correctly');
  assert(ayurInfo.title === 'Ayurveda', 'Ayurveda story title is Ayurveda');
  assert(ayurInfo.badgeClass === 'story-badge-ayurveda', 'Ayurveda uses story-badge-ayurveda badge class');

  const kiteInfo = getStoryInfo('story_missing_kite');
  assert(kiteInfo.id === 'story_missing_kite', 'Historical Kite story retains historical ID');
  assert(kiteInfo.badgeClass === 'story-badge-kite', 'Historical Kite uses story-badge-kite');

  const lanternInfo = getStoryInfo('story_lantern_garden');
  assert(lanternInfo.id === 'story_lantern_garden', 'Historical Lantern story retains historical ID');

  const unknownInfo = getStoryInfo('unrecognized_random_story_999');
  assert(unknownInfo.id === 'unrecognized_random_story_999', 'Unknown story does NOT default to Kite');
  assert(unknownInfo.badgeClass === 'story-badge-unknown', 'Unknown story uses story-badge-unknown');

  const nullInfo = getStoryInfo(null);
  assert(nullInfo.id === 'unknown', 'Null/empty story ID is unrecognized, not Kite');

  // ─── TEST 5: Active Stories Manifest (Ayurveda Only) ────
  console.log('\n--- Test 5: Stories Manifest Verification ---');
  const indexJsonRaw = fs.readFileSync(path.resolve('public/stories/index.json'), 'utf8');
  const indexData = JSON.parse(indexJsonRaw);
  assert(Array.isArray(indexData), 'public/stories/index.json is valid array');
  assert(indexData.length === 1, 'public/stories/index.json has exactly 1 active story');
  assert(indexData[0].id === 'ayurveda_intro_v1', 'Active story is ayurveda_intro_v1');
  assert(indexData[0].title === 'Ayurveda', 'Active story title is Ayurveda');

  // ─── TEST 6: Ava Narration Asset Presence & Integrity ────
  console.log('\n--- Test 6: C1 Narration Audio Asset Integrity ---');
  const narrationPath = path.resolve('public/videos/ayurveda_narration_only.mp3');
  assert(fs.existsSync(narrationPath), 'public/videos/ayurveda_narration_only.mp3 exists on disk');
  const stats = fs.statSync(narrationPath);
  assert(stats.size > 1000000, `Narration audio file size is healthy (${stats.size} bytes)`);

  console.log(`\n===========================================`);
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log(`===========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
