// questionnaireScoring.js — Server-side Researcher Scoring Protocol
// Source of truth: Ayurveda_Study_Questionnaire_Research_Aligned(2).pdf
// CRITICAL: NEVER expose answer keys or correctness feedback to participants.

export const AYURVEDA_ANSWER_KEY = {
  Q1: 'C',
  Q2: 'A',
  Q3: 'D',
  Q4: 'B',
  Q5: 'C',
  Q6: 'A',
  Q7: 'D',
  Q8: 'B'
};

export const AYURVEDA_CORRECT_TEXTS = {
  Q1: 'Life, health, and our relationship with nature',
  Q2: 'Nature, everyday rhythms, and connections among body, mind, and environment',
  Q3: 'Earth, water, fire, air, and ether',
  Q4: 'Studied them and recorded their uses',
  Q5: 'Vata, Pitta, and Kapha',
  Q6: 'Daily routines, mindful eating, and seasonal practices',
  Q7: 'Intended to support well-being, with practices varying by context',
  Q8: 'Through traditional texts and from teacher to student across generations'
};

export const Q9_RUBRIC = {
  0: 'Blank, irrelevant, or no clearly correct main idea.',
  1: 'Partly captures the main idea but is vague or omits the key connection.',
  2: 'Clearly describes Ayurveda as a traditional knowledge system connected with nature/everyday life and includes at least one related theme, such as well-being, mindful routines, or knowledge passed across generations.'
};

/**
 * Extract clean option letter (A, B, C, D, E) from raw answer
 */
export function extractOptionLetter(rawAnswer) {
  if (rawAnswer === null || rawAnswer === undefined || rawAnswer === '') {
    return null;
  }
  if (typeof rawAnswer === 'number') {
    return String.fromCharCode(65 + rawAnswer); // 0 -> A, 1 -> B, etc.
  }
  const str = String(rawAnswer).trim().toUpperCase();
  if (/^[A-E]$/.test(str)) {
    return str;
  }
  if (/^[A-E]\./.test(str) || /^[A-E]\s/.test(str)) {
    return str[0];
  }
  return str;
}

/**
 * Score Q1–Q8 knowledge question
 * - Keyed answer = 1
 * - Incorrect, blank, or "Not sure" ('E') = 0
 */
export function scoreKnowledgeQuestion(questionId, rawAnswer) {
  const correctLetter = AYURVEDA_ANSWER_KEY[questionId];
  const correctText = AYURVEDA_CORRECT_TEXTS[questionId];
  if (!correctLetter) return 0;

  if (rawAnswer === null || rawAnswer === undefined || rawAnswer === '') {
    return 0;
  }

  const str = String(rawAnswer).trim();
  if (str.toUpperCase() === 'E' || str.toLowerCase().includes('not sure')) {
    return 0;
  }

  // 1. Match letter or numeric index (e.g. index 2 for Q1 -> 'C')
  if (typeof rawAnswer === 'number') {
    const letter = String.fromCharCode(65 + rawAnswer);
    if (letter === correctLetter) return 1;
  } else {
    const letter = extractOptionLetter(rawAnswer);
    if (letter === correctLetter) return 1;
  }

  // 2. Match text directly
  if (correctText && str.toLowerCase() === correctText.toLowerCase()) {
    return 1;
  }

  return 0;
}

/**
 * Score entire Ayurveda questionnaire submission according to the approved PDF protocol
 */
export function scoreQuestionnaireSubmission(data = {}) {
  const answers = data.answers || {};

  // 1. Q1–Q8 Raw and Binary Scoring
  const qScores = {};
  const qRaw = {};
  let knowledgeTotal = 0;

  for (let i = 1; i <= 8; i++) {
    const qId = `Q${i}`;
    const raw = answers[qId] !== undefined ? answers[qId] : (data[qId] || null);
    const letter = extractOptionLetter(raw);
    const score = scoreKnowledgeQuestion(qId, raw);

    qRaw[qId] = letter;
    qScores[`${qId}_score`] = score;
    knowledgeTotal += score;
  }

  // 2. Q9 Open Response
  const q9Verbatim = answers.Q9 !== undefined ? answers.Q9 : (data.Q9 || '');
  const q9Score = data.Q9_score !== undefined ? data.Q9_score : (data.q9_score !== undefined ? data.q9_score : null);

  // 3. Q10–Q13 Experience (1–5 Likert, independent, NOT summed)
  const q10 = parseInt(answers.Q10 ?? data.Q10, 10) || null;
  const q11 = parseInt(answers.Q11 ?? data.Q11, 10) || null;
  const q12 = parseInt(answers.Q12 ?? data.Q12, 10) || null;
  const q13 = parseInt(answers.Q13 ?? data.Q13, 10) || null;

  // 4. C4 Discomfort (1–5 for C4 only, null / N/A for others)
  const isC4 = (data.condition || '').toUpperCase() === 'C4';
  let c4Discomfort = null;
  if (isC4) {
    const rawDisc = answers.C4_discomfort ?? answers.c4_discomfort ?? data.C4_discomfort ?? data.c4_discomfort;
    if (rawDisc !== undefined && rawDisc !== null && rawDisc !== '') {
      c4Discomfort = parseInt(rawDisc, 10) || null;
    }
  }

  // Missing reason check
  let missingReason = data.missing_reason || null;
  if (!missingReason) {
    const missingItems = [];
    for (let i = 1; i <= 8; i++) {
      if (!qRaw[`Q${i}`]) missingItems.push(`Q${i}`);
    }
    if (!q9Verbatim || !q9Verbatim.trim()) missingItems.push('Q9');
    if (!q10) missingItems.push('Q10');
    if (!q11) missingItems.push('Q11');
    if (!q12) missingItems.push('Q12');
    if (!q13) missingItems.push('Q13');
    if (isC4 && !c4Discomfort) missingItems.push('C4_discomfort');

    if (missingItems.length > 0) {
      missingReason = `Missing responses on items: ${missingItems.join(', ')}`;
    }
  }

  const completionTimeSeconds = typeof data.completion_time_seconds === 'number'
    ? data.completion_time_seconds
    : (data.completion_time || 0);

  return {
    session_id: data.session_id,
    participant_id: data.participant_id,
    condition: data.condition,
    story_id: data.story_id || 'ayurveda_intro_v1',
    Q1_raw: qRaw.Q1,
    Q2_raw: qRaw.Q2,
    Q3_raw: qRaw.Q3,
    Q4_raw: qRaw.Q4,
    Q5_raw: qRaw.Q5,
    Q6_raw: qRaw.Q6,
    Q7_raw: qRaw.Q7,
    Q8_raw: qRaw.Q8,
    Q1_score: qScores.Q1_score,
    Q2_score: qScores.Q2_score,
    Q3_score: qScores.Q3_score,
    Q4_score: qScores.Q4_score,
    Q5_score: qScores.Q5_score,
    Q6_score: qScores.Q6_score,
    Q7_score: qScores.Q7_score,
    Q8_score: qScores.Q8_score,
    knowledge_total: knowledgeTotal,
    Q9_verbatim: q9Verbatim,
    Q9_score: q9Score,
    Q10: q10,
    Q11: q11,
    Q12: q12,
    Q13: q13,
    C4_discomfort: c4Discomfort,
    completion_time_seconds: completionTimeSeconds,
    technical_issue: data.technical_issue || null,
    missing_reason: missingReason,
    created_at: data.created_at || new Date().toISOString()
  };
}

export default {
  AYURVEDA_ANSWER_KEY,
  AYURVEDA_CORRECT_TEXTS,
  Q9_RUBRIC,
  extractOptionLetter,
  scoreKnowledgeQuestion,
  scoreQuestionnaireSubmission
};
