// questionnaireScoring.js — Server-side Researcher Scoring Protocol
// Source of truth: Ayurveda_Study_Questionnaire_Research_Aligned(2).pdf
// CRITICAL: NEVER expose answer keys or correctness feedback to participants.

export const AYURVEDA_ANSWER_KEY = {
  Q1: 'A',
  Q2: 'A',
  Q3: 'A',
  Q4: 'A',
  Q5: 'A',
  Q6: 'A',
  Q7: 'A',
  Q8: 'A'
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
 * - Keyed answer ('A') = 1
 * - Incorrect, blank, or "Not sure" ('E') = 0
 */
export function scoreKnowledgeQuestion(questionId, rawAnswer) {
  const correctLetter = AYURVEDA_ANSWER_KEY[questionId];
  if (!correctLetter) return 0;
  const letter = extractOptionLetter(rawAnswer);
  if (!letter || letter === 'E' || letter.toLowerCase().includes('not sure')) {
    return 0;
  }
  return letter === correctLetter ? 1 : 0;
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
    const score = scoreKnowledgeQuestion(qId, letter);

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
    if (!q9Verbatim?.trim()) missingItems.push('Q9');
    if (!q10) missingItems.push('Q10');
    if (!q11) missingItems.push('Q11');
    if (!q12) missingItems.push('Q12');
    if (!q13) missingItems.push('Q13');
    if (isC4 && !c4Discomfort) missingItems.push('C4_discomfort');

    if (missingItems.length > 0) {
      missingReason = `Incomplete fields: ${missingItems.join(', ')}`;
    }
  }

  return {
    participant_id: data.participant_id || '',
    condition: data.condition || '',
    session_id: data.session_id || '',
    story_id: data.story_id || 'ayurveda_intro_v1',
    // Raw responses
    Q1_raw: qRaw.Q1,
    Q2_raw: qRaw.Q2,
    Q3_raw: qRaw.Q3,
    Q4_raw: qRaw.Q4,
    Q5_raw: qRaw.Q5,
    Q6_raw: qRaw.Q6,
    Q7_raw: qRaw.Q7,
    Q8_raw: qRaw.Q8,
    // Binary scores (0 or 1)
    Q1_score: qScores.Q1_score,
    Q2_score: qScores.Q2_score,
    Q3_score: qScores.Q3_score,
    Q4_score: qScores.Q4_score,
    Q5_score: qScores.Q5_score,
    Q6_score: qScores.Q6_score,
    Q7_score: qScores.Q7_score,
    Q8_score: qScores.Q8_score,
    // Total knowledge score (0–8)
    knowledge_total: knowledgeTotal,
    // Q9 verbatim text & researcher score
    Q9_verbatim: q9Verbatim,
    Q9_score: q9Score !== null ? parseInt(q9Score, 10) : null,
    // Q10–Q13 independent experience ratings (1–5)
    Q10: q10,
    Q11: q11,
    Q12: q12,
    Q13: q13,
    // C4 Discomfort
    C4_discomfort: isC4 ? c4Discomfort : null,
    completion_time_seconds: Math.round(Number(data.completion_time_seconds || 0)),
    technical_issue: data.technical_issue || null,
    missing_reason: missingReason,
    created_at: data.created_at || new Date().toISOString()
  };
}

