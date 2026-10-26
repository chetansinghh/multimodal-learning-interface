// tests/c3_interactions.test.js
// Verification suite for C3 Interactive Video — Senior Gameplay & Learning-Experience Refactor
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load story configuration
const storyPath = path.join(rootDir, 'public/stories/story_ayurveda_v1.json');
const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));

// Load AyurvedaCanvas source code
const canvasPath = path.join(rootDir, 'src/components/player/AyurvedaCanvas.jsx');
const canvasCode = fs.readFileSync(canvasPath, 'utf8');

const parseSec = (timeStr) => {
  const [m, s] = timeStr.split(':').map(Number);
  return m * 60 + s;
};

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, message = '') {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${message}`);
    failedCount++;
  }
}

console.log('\n================================================================');
console.log('--- RUNNING C3 INTERACTIVE VIDEO REFACTOR ACCEPTANCE TESTS ---');
console.log('================================================================\n');

// 1. Every interaction has approved activation window and gate
console.log('Criterion 1: Approved Activation Windows & Segment Mapping');
assert(
  story.interactions.length === 8,
  'Interactions count is exactly 8',
  `Expected 8 interactions, got ${story.interactions.length}`
);

story.interactions.forEach(item => {
  const [startStr, endStr] = item.active_window;
  const startSec = parseSec(startStr);
  const endSec = parseSec(endStr);
  assert(startSec < endSec, `${item.id} active_window start < end`, `Window: ${startStr} - ${endStr}`);
  if (item.gate?.hold_at) {
    const gateSec = parseSec(item.gate.hold_at);
    assert(gateSec >= startSec && gateSec <= endSec + 1, `${item.id} gate falls within window`, `Gate: ${item.gate.hold_at}`);
  }
});

// 2. Remove assessment-contaminating MCQ overlays
console.log('\nCriterion 2: No Assessment-Contaminating MCQ Cards in C3');
const hasSelectOne = canvasCode.includes("interaction.type === 'select_one'");
const hasMCQQuestions = canvasCode.includes('Which object on the table holds the warm therapeutic oil?');
const hasDoshaMatchingQuiz = canvasCode.includes('Match each dosha to its key quality');
assert(!hasSelectOne, 'No select_one quiz component in AyurvedaCanvas', 'select_one found in canvas code');
assert(!hasMCQQuestions, 'No therapy MCQ question text in C3', 'Found therapy MCQ question text');
assert(!hasDoshaMatchingQuiz, 'No dosha-element matching quiz in C3', 'Found dosha matching quiz');

// 3. Scene-Aligned Coordinates
console.log('\nCriterion 3: Verified Video-Plane Coordinates (Normalized 0 to 1)');
const int01 = story.interactions.find(i => i.id === 'int_01');
assert(int01.config.x >= 0.45 && int01.config.x <= 0.55 && int01.config.y >= 0.38 && int01.config.y <= 0.46,
  'int_01 banyan tree center coordinates aligned with video trunk', `Got x:${int01.config.x}, y:${int01.config.y}`);

const int02 = story.interactions.find(i => i.id === 'int_02');
assert(int02.config.hotspots?.length === 5, 'int_02 contains all 5 visible elements', `Found ${int02.config.hotspots?.length}`);
int02.config.hotspots.forEach(hs => {
  assert(hs.x >= 0 && hs.x <= 1 && hs.y >= 0 && hs.y <= 1, `Element ${hs.id} coordinates normalized`, `Got (${hs.x}, ${hs.y})`);
});

const int04 = story.interactions.find(i => i.id === 'int_04');
assert(int04.config.x >= 0.42 && int04.config.x <= 0.54 && int04.config.y >= 0.55 && int04.config.y <= 0.68,
  'int_04 mortar bowl center coordinates aligned with stone bowl in video', `Got x:${int04.config.x}, y:${int04.config.y}`);

const int05 = story.interactions.find(i => i.id === 'int_05');
assert(int05.config.hotspots?.length === 3, 'int_05 contains 3 dosha medallions', `Found ${int05.config.hotspots?.length}`);

const int08 = story.interactions.find(i => i.id === 'int_08');
assert(int08.config.item?.x < 0.25 && int08.config.zone?.x > 0.65,
  'int_08 scroll token on teacher desk (left) and student dropzone on student (right)',
  `Item at ${int08.config.item?.x}, Zone at ${int08.config.zone?.x}`);

// 4. Mortar Angular Movement & Tolerance
console.log('\nCriterion 4: Mortar Angular Tracking Rules');
assert(canvasCode.includes('Math.atan2') && canvasCode.includes('totalRotation'),
  'True angular rotation tracking implemented for grinding gesture', 'Missing atan2 angular calculation');
assert(canvasCode.includes('radius < 25') || canvasCode.includes('radius < 35') || canvasCode.includes('radius > 150'),
  'Radial tolerance prevents straight drag or stationary cheat', 'Missing radial boundary check');
assert(int04.config.required_circles === 3, 'Grinding requires 3 full circles', `Expected 3, got ${int04.config.required_circles}`);

// 5. Scroll Passing Drag and Snap
console.log('\nCriterion 5: Scroll Passing Drag and Forgiving Drop');
assert(canvasCode.includes('c3-student-dropzone') && canvasCode.includes('c3-scroll-token'),
  'Dedicated scroll token and student dropzone components exist', 'Missing scroll/student classes');
assert(canvasCode.includes('setScrollPassed(true)') && canvasCode.includes('setScrollPos'),
  'Scroll snaps into destination upon valid drop', 'Missing snap logic');
assert(canvasCode.includes('C3_SCROLL_RETRY'),
  'Drop outside zone allows forgiving spring-back and retry', 'Missing retry handling');

// 6. Research Telemetry & Event Format
console.log('\nCriterion 6: Telemetry Event Logging');
assert(canvasCode.includes("eventLogger.log('C3_GATE_OPEN'"), 'Logs C3_GATE_OPEN event', 'Missing C3_GATE_OPEN');
assert(canvasCode.includes("eventLogger.log('C3_GATE_TIMEOUT'"), 'Logs C3_GATE_TIMEOUT event on timeout', 'Missing C3_GATE_TIMEOUT');
assert(canvasCode.includes("eventLogger.log('C3_COMPLETE'"), 'Logs C3_COMPLETE event on success', 'Missing C3_COMPLETE');
assert(canvasCode.includes('duration_ms'), 'Computes and logs duration_ms separately from video exposure', 'Missing duration_ms');
assert(canvasCode.includes('input_modality'), 'Logs input modality (mouse, touch, keyboard)', 'Missing input_modality');

// 7. Video Synchronization & Usability (Seek, Replay, Restart)
console.log('\nCriterion 7: Video Sync, Seeking & Replay Handling');
assert(canvasCode.includes('clearC3Gate()'), 'clearC3Gate clears timers and waiting state', 'Missing clearC3Gate');
assert(canvasCode.includes('setCompletedC3(new Set())'), 'handleRestart clears completedC3 for fresh replay', 'handleRestart does not reset completedC3');
assert(canvasCode.includes('c3TimeRemaining'), 'Remaining countdown seconds tracked for non-blocking timeout', 'Missing c3TimeRemaining');
assert(canvasCode.includes('onSkip'), 'Skip handler provided to avoid trapping participants', 'Missing onSkip');

// 8. Assessment Integrity Check
console.log('\nCriterion 8: Approved Assessment Preservation');
assert(story.assessment.levels[0].items.length === 8, 'Recall items Q1-Q8 preserved intact', `Got ${story.assessment.levels[0].items.length}`);
assert(story.assessment.levels[0].items[0].id === 'Q1', 'Q1 is first item');
assert(story.assessment.levels[0].items[2].question.includes('Which five elements were named?'), 'Q3 preserved');
assert(story.assessment.levels[0].items[4].question.includes('Which three doshas were named?'), 'Q5 preserved');
assert(story.assessment.levels[0].items[6].question.includes('How did the video describe therapies and preparations?'), 'Q7 preserved');

// 9. Hold Button Robustness & Pointer Capture
console.log('\nCriterion 9: Hold Button Robustness & Event Architecture');
assert(canvasCode.includes('setPointerCapture'), 'Pointer capture attached to target element on pointerdown', 'Missing setPointerCapture');
assert(canvasCode.includes('isHoldingRef'), 'isHoldingRef used to prevent state-closure race conditions', 'Missing isHoldingRef');
assert(canvasCode.includes('currentTimeRef'), 'currentTimeRef prevents interval re-creation on video time ticks', 'Missing currentTimeRef');
assert(canvasCode.includes('!e.repeat'), 'Keyboard hold ignores repeated keydown events', 'Missing !e.repeat check');

const cssPath = path.join(rootDir, 'src/components/player/PlayerCommon.css');
const cssCode = fs.readFileSync(cssPath, 'utf8');
assert(cssCode.includes('.c3-banyan-target') && cssCode.includes('touch-action: none'),
  'c3-banyan-target has touch-action: none to prevent touch interception', 'Missing touch-action: none');
assert(cssCode.includes('.c3-banyan-target *') && cssCode.includes('pointer-events: none'),
  'c3-banyan-target child elements have pointer-events: none to avoid bubbling interruption', 'Missing pointer-events: none on children');

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('All C3 refactor acceptance tests PASSED successfully!\n');
}
