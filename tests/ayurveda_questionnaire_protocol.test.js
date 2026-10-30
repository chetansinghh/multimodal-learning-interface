// tests/ayurveda_questionnaire_protocol.test.js
// Automated verification for Ayurveda Multimodal Study Questionnaire Protocol
// Source of truth: Ayurveda_Study_Questionnaire_Research_Aligned(2).pdf

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AYURVEDA_ANSWER_KEY,
  Q9_RUBRIC,
  extractOptionLetter,
  scoreKnowledgeQuestion,
  scoreQuestionnaireSubmission
} from '../server/services/questionnaireScoring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('\n================================================================');
console.log('--- RUNNING AYURVEDA QUESTIONNAIRE PROTOCOL ACCEPTANCE TESTS ---');
console.log('================================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(description, testFn) {
  try {
    testFn();
    console.log(`  ✓ PASS: ${description}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

// Read the story configuration
const storyPath = path.join(rootDir, 'public/stories/story_ayurveda_v1.json');
const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
const assessment = story.assessment;
const qItems = assessment.levels[0].items;

// Read AssessmentEngine.jsx source
const engineCode = fs.readFileSync(path.join(rootDir, 'src/components/assessment/AssessmentEngine.jsx'), 'utf8');

// 1. All Q1–Q8 questions render with exact wording and 5 options
runTest('Requirement 1: Q1 exact wording and 5 options', () => {
  const q1 = qItems.find(q => q.id === 'Q1');
  assert(q1, 'Q1 exists');
  assert(q1.question === 'According to the presentation, Ayurveda is a traditional way of understanding…', 'Q1 wording matches PDF');
  assert.strictEqual(q1.options.length, 5, '5 options');
  assert.strictEqual(q1.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q1.options].sort(), [
    'Computer science',
    'Life, health, and our relationship with nature',
    'Modern transport',
    'Not sure',
    'Space travel and astronomy'
  ].sort(), 'Q1 options match PDF');
});

runTest('Requirement 1: Q2 exact wording and 5 options', () => {
  const q2 = qItems.find(q => q.id === 'Q2');
  assert(q2, 'Q2 exists');
  assert(q2.question === 'What did the presentation say Ayurvedic traditions observe or reflect on?', 'Q2 wording matches PDF');
  assert.strictEqual(q2.options.length, 5, '5 options');
  assert.strictEqual(q2.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q2.options].sort(), [
    'Nature, everyday rhythms, and connections among body, mind, and environment',
    'Not sure',
    'Only city traffic',
    'Only sports performance',
    'Only weather forecasts'
  ].sort(), 'Q2 options match PDF');
});

runTest('Requirement 1: Q3 exact wording and 5 options', () => {
  const q3 = qItems.find(q => q.id === 'Q3');
  assert(q3, 'Q3 exists');
  assert(q3.question === 'Which five elements were named in the presentation?', 'Q3 wording matches PDF');
  assert.strictEqual(q3.options.length, 5, '5 options');
  assert.strictEqual(q3.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q3.options].sort(), [
    'Earth, metal, wood, ice, and smoke',
    'Earth, water, fire, air, and ether',
    'Fire, rain, cloud, snow, and wind',
    'Not sure',
    'Water, sand, light, sound, and stone'
  ].sort(), 'Q3 options match PDF');
});

runTest('Requirement 1: Q4 exact wording and 5 options', () => {
  const q4 = qItems.find(q => q.id === 'Q4');
  assert(q4, 'Q4 exists');
  assert(q4.question === 'What did traditional practitioners do with plants and other natural substances?', 'Q4 wording matches PDF');
  assert.strictEqual(q4.options.length, 5, '5 options');
  assert.strictEqual(q4.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q4.options].sort(), [
    'Avoided recording information',
    'Not sure',
    'Studied only their colours',
    'Studied them and recorded their uses',
    'Used them only as decoration'
  ].sort(), 'Q4 options match PDF');
});

runTest('Requirement 1: Q5 exact wording and 5 options', () => {
  const q5 = qItems.find(q => q.id === 'Q5');
  assert(q5, 'Q5 exists');
  assert(q5.question === 'Which three doshas were named?', 'Q5 wording matches PDF');
  assert.strictEqual(q5.options.length, 5, '5 options');
  assert.strictEqual(q5.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q5.options].sort(), [
    'Body, mind, and nature',
    'Earth, water, and fire',
    'Morning, afternoon, and evening',
    'Not sure',
    'Vata, Pitta, and Kapha'
  ].sort(), 'Q5 options match PDF');
});

runTest('Requirement 1: Q6 exact wording and 5 options', () => {
  const q6 = qItems.find(q => q.id === 'Q6');
  assert(q6, 'Q6 exists');
  assert(q6.question === 'Which practices did the presentation say are emphasized in many Ayurvedic traditions?', 'Q6 wording matches PDF');
  assert.strictEqual(q6.options.length, 5, '5 options');
  assert.strictEqual(q6.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q6.options].sort(), [
    'Daily routines, mindful eating, and seasonal practices',
    'Gaming and competitive sport',
    'Not sure',
    'Shopping and travel',
    'Skipping meals and night work'
  ].sort(), 'Q6 options match PDF');
});

runTest('Requirement 1: Q7 exact wording and 5 options', () => {
  const q7 = qItems.find(q => q.id === 'Q7');
  assert(q7, 'Q7 exists');
  assert(q7.question === 'How did the presentation describe therapies and preparations?', 'Q7 wording matches PDF');
  assert.strictEqual(q7.options.length, 5, '5 options');
  assert.strictEqual(q7.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q7.options].sort(), [
    'Guaranteed cures for every illness',
    'Identical in every context',
    'Intended to support well-being, with practices varying by context',
    'Not sure',
    'Unrelated to well-being'
  ].sort(), 'Q7 options match PDF');
});

runTest('Requirement 1: Q8 exact wording and 5 options', () => {
  const q8 = qItems.find(q => q.id === 'Q8');
  assert(q8, 'Q8 exists');
  assert(q8.question === 'How was traditional knowledge described as being preserved and passed on?', 'Q8 wording matches PDF');
  assert.strictEqual(q8.options.length, 5, '5 options');
  assert.strictEqual(q8.options[4], 'Not sure', 'Option E is Not sure');
  assert.deepStrictEqual([...q8.options].sort(), [
    'It was not preserved',
    'Not sure',
    'Only through advertisements',
    'Only through video games',
    'Through traditional texts and from teacher to student across generations'
  ].sort(), 'Q8 options match PDF');
});

// 2. Each knowledge question accepts one answer
runTest('Requirement 2: Single-choice selection per question', () => {
  assert(engineCode.includes('type="radio"'), 'Radio inputs are used for single-choice');
  assert(engineCode.includes('name={`question_${q.id}`}'), 'Radio buttons are scoped per question');
});

// 3. Not sure can be selected
runTest('Requirement 3: Option E is "Not sure" for all Q1–Q8', () => {
  for (let i = 1; i <= 8; i++) {
    const q = qItems[i - 1];
    assert(q.options[4] === 'Not sure', `Q${i} option E is "Not sure"`);
  }
});

// 4. Q9 accepts and saves free text
runTest('Requirement 4: Q9 open response accepts multiline free text', () => {
  assert(assessment.open_response.id === 'Q9', 'Q9 ID matches');
  assert(assessment.open_response.question === 'In one or two sentences, what was the main message of the presentation?', 'Q9 wording matches');
  assert(engineCode.includes('className="open-response-textarea"'), 'Multiline textarea provided for Q9');
});

// 5. Q10–Q13 save separate 1–5 values
runTest('Requirement 5: Q10–Q13 Likert scale items 1–5', () => {
  const expItems = assessment.experience_survey;
  assert(expItems.length === 4, 'Exactly 4 experience questions');
  assert(expItems[0].id === 'Q10' && expItems[0].prompt === 'I understood the main message of the presentation.', 'Q10 matches');
  assert(expItems[1].id === 'Q11' && expItems[1].prompt === 'I paid attention to the presentation for most of the session.', 'Q11 matches');
  assert(expItems[2].id === 'Q12' && expItems[2].prompt === 'The information was presented in a way that was easy for me to follow.', 'Q12 matches');
  assert(expItems[3].id === 'Q13' && expItems[3].prompt === 'I can remember at least two important ideas from the presentation.', 'Q13 matches');
});

// 6 & 7. C4 discomfort appears only for C4
runTest('Requirement 6 & 7: C4 discomfort only displayed for condition C4', () => {
  assert(assessment.c4_discomfort.id === 'C4_discomfort', 'C4 discomfort configured');
  assert(engineCode.includes("const isC4 = (condition || '').toUpperCase() === 'C4';"), 'isC4 condition check exists');
  assert(engineCode.includes('{isC4 && currentStep === 3 &&'), 'C4 discomfort step only rendered when isC4 is true');
  assert(engineCode.includes("If discomfort was present, please tell the researcher. Follow the study’s approved safety procedure."), 'Safety instruction included');
});

// 8, 9, 10. CRITICAL: Never reveal correct answers, score, or explanations
runTest('Requirement 8, 9, 10: Zero correctness indicators, badges, or explanations in participant component', () => {
  assert(!engineCode.includes('correct_answer'), 'No correct_answer in AssessmentEngine');
  assert(!engineCode.includes('correct_text'), 'No correct_text in AssessmentEngine');
  assert(!engineCode.includes('showExplanation'), 'No showExplanation in AssessmentEngine');
  assert(!engineCode.includes('explanation-card'), 'No explanation-card in AssessmentEngine');
  assert(!engineCode.includes('AssessmentResults'), 'No score summary or results percentage ring');
  assert(!engineCode.includes('overallPct'), 'No overallPct shown to participant');
  assert(!engineCode.includes('isCorrect'), 'No isCorrect calculated or shown in participant view');
  assert(engineCode.includes('Your response has been recorded. Thank you.'), 'Displays neutral confirmation after submission');
});

// 11. Answer key inaccessible from participant-facing API / JSON payload
runTest('Requirement 11: story_ayurveda_v1.json contains NO answers or correct keys', () => {
  const jsonStr = JSON.stringify(assessment);
  assert(!jsonStr.includes('"correct_answer"'), 'No correct_answer in story JSON');
  assert(!jsonStr.includes('"correct_text"'), 'No correct_text in story JSON');
  assert(!jsonStr.includes('"answer_key"'), 'No answer_key in story JSON');
});

// 12. Researcher scoring works correctly with randomized option slots
runTest('Requirement 12: Answer key Q1–Q8 randomized across slots, and scoring logic operates correctly', () => {
  const expectedKey = {
    Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'B',
    Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'B'
  };

  for (let i = 1; i <= 8; i++) {
    const qId = `Q${i}`;
    const correctLetter = expectedKey[qId];
    assert.strictEqual(AYURVEDA_ANSWER_KEY[qId], correctLetter, `${qId} key is ${correctLetter}`);
    // Correct answer scores 1
    assert.strictEqual(scoreKnowledgeQuestion(qId, correctLetter), 1, `${qId} ${correctLetter} scores 1`);
    // Not sure scores 0
    assert.strictEqual(scoreKnowledgeQuestion(qId, 'E'), 0, `${qId} E (Not sure) scores 0`);
    assert.strictEqual(scoreKnowledgeQuestion(qId, 'Not sure'), 0, `${qId} "Not sure" scores 0`);
    // Blank scores 0
    assert.strictEqual(scoreKnowledgeQuestion(qId, null), 0, `${qId} blank scores 0`);
  }
});

// 13. Knowledge total is calculated from Q1–Q8 only (range 0–8)
runTest('Requirement 13: Knowledge total is strictly sum of Q1–Q8 (0–8)', () => {
  const allCorrectSubmission = {
    participant_id: 'P_001',
    condition: 'C1',
    session_id: 'SESS_TEST_1',
    answers: {
      Q1: 'C', Q2: 'A', Q3: 'D', Q4: 'B',
      Q5: 'C', Q6: 'A', Q7: 'D', Q8: 'B',
      Q9: 'Ayurveda connects health and nature.',
      Q10: 5, Q11: 4, Q12: 5, Q13: 4
    }
  };
  const scored = scoreQuestionnaireSubmission(allCorrectSubmission);
  assert.strictEqual(scored.knowledge_total, 8, 'Full score is 8');
  assert.strictEqual(scored.Q1_score, 1);
  assert.strictEqual(scored.Q8_score, 1);

  const partialSubmission = {
    participant_id: 'P_002',
    condition: 'C2',
    session_id: 'SESS_TEST_2',
    answers: {
      Q1: 'C', // 1
      Q2: 'A', // 1
      Q3: 'A', // 0 (correct is D)
      Q4: 'B', // 1
      Q5: 'E', // 0 (Not sure)
      Q6: 'A', // 1
      Q7: 'A', // 0 (correct is D)
      Q8: 'E'  // 0 (Not sure)
    }
  };
  const scoredPartial = scoreQuestionnaireSubmission(partialSubmission);
  assert.strictEqual(scoredPartial.knowledge_total, 4, 'Partial score is 4 (Q1, Q2, Q4, Q6)');
  assert.strictEqual(scoredPartial.Q5_score, 0, 'Not sure scored 0');
  assert.strictEqual(scoredPartial.Q8_score, 0, 'Not sure scored 0');
});

// 14. Q9 scoring remains separate
runTest('Requirement 14: Q9 is stored verbatim and scored separately (0–2 rubric)', () => {
  const sub = {
    participant_id: 'P_003',
    condition: 'C3',
    session_id: 'SESS_TEST_3',
    answers: {
      Q1: 'C',
      Q9: 'Ayurveda is a traditional science about living in harmony with nature and mindful eating across seasons.'
    },
    Q9_score: 2
  };
  const scored = scoreQuestionnaireSubmission(sub);
  assert.strictEqual(scored.Q9_verbatim, sub.answers.Q9, 'Q9 preserved verbatim');
  assert.strictEqual(scored.Q9_score, 2, 'Q9 score is 2');
  assert.strictEqual(scored.knowledge_total, 1, 'Q9 does NOT affect Q1–Q8 knowledge total');
  assert(Q9_RUBRIC[0] && Q9_RUBRIC[1] && Q9_RUBRIC[2], 'Rubric definitions 0, 1, 2 exist');
});

// 15. Q10–Q13 are not combined into a total
runTest('Requirement 15: Q10–Q13 stored as separate integers 1–5, not summed', () => {
  const sub = {
    participant_id: 'P_004',
    condition: 'C1',
    session_id: 'SESS_TEST_4',
    answers: {
      Q10: 4, Q11: 5, Q12: 3, Q13: 4
    }
  };
  const scored = scoreQuestionnaireSubmission(sub);
  assert.strictEqual(scored.Q10, 4);
  assert.strictEqual(scored.Q11, 5);
  assert.strictEqual(scored.Q12, 3);
  assert.strictEqual(scored.Q13, 4);
  assert(scored.experience_total === undefined, 'No summed total for Q10–Q13');
});

// 16 & 17. Reconnect / refresh & duplicate submission prevention
runTest('Requirement 16 & 17: Local progress saving and submission persistence', () => {
  assert(engineCode.includes('sessionStorage.getItem(`ayurveda_completed_${sessionId}`)'), 'Checks completed state in storage');
  assert(engineCode.includes('sessionStorage.setItem(`ayurveda_completed_${sessionId}`, \'true\')'), 'Flags session as completed');
  assert(engineCode.includes('if (isSubmitted || isSubmitting) return;'), 'Guards against duplicate submit');
});

// 18. Researcher exports contain the correct fields
runTest('Requirement 18: Research export contains all recommended fields from Section 8', () => {
  const dashCode = fs.readFileSync(path.join(rootDir, 'src/components/researcher/ResearcherDashboard.jsx'), 'utf8');
  const requiredFields = [
    'participant_id', 'condition',
    'Q1_raw', 'Q2_raw', 'Q3_raw', 'Q4_raw', 'Q5_raw', 'Q6_raw', 'Q7_raw', 'Q8_raw',
    'Q1_score', 'Q2_score', 'Q3_score', 'Q4_score', 'Q5_score', 'Q6_score', 'Q7_score', 'Q8_score',
    'knowledge_total',
    'Q9_verbatim', 'Q9_score',
    'Q10', 'Q11', 'Q12', 'Q13',
    'C4_discomfort',
    'completion_time_seconds',
    'technical_issue',
    'missing_reason'
  ];

  requiredFields.forEach(field => {
    assert(dashCode.includes(`'${field}'`) || dashCode.includes(`"${field}"`), `Export headers include ${field}`);
  });
});

// 19. Existing historical records remain intact
runTest('Requirement 19: Server DB and EventLogger backward compatibility intact', () => {
  const serverCode = fs.readFileSync(path.join(rootDir, 'server/server.js'), 'utf8');
  assert(serverCode.includes("app.post('/api/db/assessments'"), 'Legacy assessments endpoint preserved');
  assert(serverCode.includes("app.get('/api/db/assessments'"), 'Legacy assessments getter preserved');
  assert(serverCode.includes("app.post('/api/questionnaire/submit'"), 'New questionnaire submission endpoint added');
});

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('All Ayurveda Questionnaire Protocol acceptance tests PASSED successfully!\n');
}

