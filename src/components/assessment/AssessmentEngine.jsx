// AssessmentEngine.jsx — Approved Research Questionnaire Component
// Source of truth: Ayurveda_Study_Questionnaire_Research_Aligned(2).pdf
// CRITICAL: NEVER reveal correct answers, answer key, knowledge scores,
// green/red correctness indicators, or post-submission review with correctness.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { sessionClock } from '../../services/SessionClock';
import { normalizeAssessment } from '../../services/StoryLoader';
import './Assessment.css';

const LIKERT_ANCHORS = [
  { val: 1, label: 'Strongly disagree' },
  { val: 2, label: 'Disagree' },
  { val: 3, label: 'Neither agree nor disagree' },
  { val: 4, label: 'Agree' },
  { val: 5, label: 'Strongly agree' }
];

const DISCOMFORT_ANCHORS = [
  { val: 1, label: 'Not at all' },
  { val: 2, label: 'Mild' },
  { val: 3, label: 'Moderate' },
  { val: 4, label: 'Severe' },
  { val: 5, label: 'Very severe' }
];

export default function AssessmentEngine({
  assessment,
  sessionId,
  participantId,
  condition,
  storyId,
  onComplete
}) {
  const normalized = useMemo(() => normalizeAssessment(assessment), [assessment]);

  // Extract Part A questions (Q1–Q8) exactly in locked order, without shuffling!
  const partAQuestions = useMemo(() => {
    const level0 = normalized.levels?.[0];
    return level0?.items || [];
  }, [normalized]);

  const openResponseConfig = normalized.open_response || {
    id: 'Q9',
    question: 'In one or two sentences, what was the main message of the presentation?'
  };

  const experienceQuestions = useMemo(() => {
    return normalized.experience_survey || [
      { id: 'Q10', prompt: 'I understood the main message of the presentation.' },
      { id: 'Q11', prompt: 'I paid attention to the presentation for most of the session.' },
      { id: 'Q12', prompt: 'The information was presented in a way that was easy for me to follow.' },
      { id: 'Q13', prompt: 'I can remember at least two important ideas from the presentation.' }
    ];
  }, [normalized]);

  const isC4 = (condition || '').toUpperCase() === 'C4';

  // Section Steps:
  // 0: Part A (Q1–Q8)
  // 1: Part B (Q9)
  // 2: Part C (Q10–Q13)
  // 3: C4 Discomfort (if C4)
  // 4: Review before submission
  // 5: Neutral Confirmation (Submitted)
  const [currentStep, setCurrentStep] = useState(0);

  // Response state
  const [partAAnswers, setPartAAnswers] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`ayurveda_part_a_${sessionId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [q9Text, setQ9Text] = useState(() => {
    return sessionStorage.getItem(`ayurveda_q9_${sessionId}`) || '';
  });

  const [experienceRatings, setExperienceRatings] = useState(() => {
    try {
      const saved = sessionStorage.getItem(`ayurveda_exp_${sessionId}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [c4Discomfort, setC4Discomfort] = useState(() => {
    const saved = sessionStorage.getItem(`ayurveda_c4_disc_${sessionId}`);
    return saved ? parseInt(saved, 10) : null;
  });

  const [isSubmitted, setIsSubmitted] = useState(() => {
    return sessionStorage.getItem(`ayurveda_completed_${sessionId}`) === 'true';
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTimeRef = useRef(Date.now());

  // Save progress locally to prevent data loss on refresh
  useEffect(() => {
    try {
      sessionStorage.setItem(`ayurveda_part_a_${sessionId}`, JSON.stringify(partAAnswers));
    } catch {}
  }, [partAAnswers, sessionId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`ayurveda_q9_${sessionId}`, q9Text);
    } catch {}
  }, [q9Text, sessionId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`ayurveda_exp_${sessionId}`, JSON.stringify(experienceRatings));
    } catch {}
  }, [experienceRatings, sessionId]);

  useEffect(() => {
    if (c4Discomfort !== null) {
      try {
        sessionStorage.setItem(`ayurveda_c4_disc_${sessionId}`, String(c4Discomfort));
      } catch {}
    }
  }, [c4Discomfort, sessionId]);

  // Formatted study date for participant copy
  const studyDate = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, []);

  // Handlers for Part A
  const handleSelectPartA = (qId, optionIndex) => {
    if (isSubmitted) return;
    const letter = String.fromCharCode(65 + optionIndex);
    setPartAAnswers(prev => ({
      ...prev,
      [qId]: letter
    }));

    eventLogger.log('OBJECT_INTERACT', {
      objectId: qId,
      action: 'select_option',
      response: letter
    });
  };

  // Handler for Part C
  const handleSelectExperience = (qId, val) => {
    if (isSubmitted) return;
    setExperienceRatings(prev => ({
      ...prev,
      [qId]: val
    }));
  };

  // Final submission handler
  const handleSubmit = async () => {
    if (isSubmitted || isSubmitting) return;
    setIsSubmitting(true);

    const completionTimeSeconds = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));

    // Construct participant responses payload
    const submissionPayload = {
      session_id: sessionId,
      participant_id: participantId,
      condition: condition,
      story_id: storyId || 'ayurveda_intro_v1',
      answers: {
        Q1: partAAnswers.Q1 || null,
        Q2: partAAnswers.Q2 || null,
        Q3: partAAnswers.Q3 || null,
        Q4: partAAnswers.Q4 || null,
        Q5: partAAnswers.Q5 || null,
        Q6: partAAnswers.Q6 || null,
        Q7: partAAnswers.Q7 || null,
        Q8: partAAnswers.Q8 || null,
        Q9: q9Text.trim() || '',
        Q10: experienceRatings.Q10 || null,
        Q11: experienceRatings.Q11 || null,
        Q12: experienceRatings.Q12 || null,
        Q13: experienceRatings.Q13 || null,
        C4_discomfort: isC4 ? c4Discomfort : null
      },
      completion_time_seconds: completionTimeSeconds,
      created_at: new Date().toISOString()
    };

    // Save to IndexedDB and sync to central server
    try {
      await eventLogger.saveQuestionnaireSubmission(submissionPayload);
      sessionStorage.setItem(`ayurveda_completed_${sessionId}`, 'true');
      setIsSubmitted(true);
      setCurrentStep(5); // Show neutral confirmation

      if (onComplete) {
        onComplete(submissionPayload);
      }
    } catch (err) {
      console.error('Submission recording error:', err);
      // Fallback: mark submitted locally
      sessionStorage.setItem(`ayurveda_completed_${sessionId}`, 'true');
      setIsSubmitted(true);
      setCurrentStep(5);
      if (onComplete) onComplete(submissionPayload);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If already submitted (e.g., page refresh or reconnect), render neutral confirmation
  if (isSubmitted) {
    return (
      <div className="research-questionnaire-root">
        <div className="research-card neutral-confirmation-card">
          <div className="confirmation-header-icon">📋</div>
          <h2 className="confirmation-title">Ayurveda Study — Post-Experience Questionnaire</h2>
          <div className="confirmation-meta-box">
            <span><strong>Participant ID:</strong> <code>{participantId || 'N/A'}</code></span>
            <span><strong>Condition code:</strong> {condition || 'C1'}</span>
            <span><strong>Date:</strong> {studyDate}</span>
          </div>

          <div className="neutral-confirmation-message">
            <p className="primary-msg">Your response has been recorded. Thank you.</p>
            <p className="secondary-msg">
              Your questionnaire responses have been securely logged to the research study records.
              You may now close this browser window or notify the researcher that you have finished.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate answered count for Part A
  const partAAnsweredCount = Object.keys(partAAnswers).filter(k => partAAnswers[k]).length;
  const expAnsweredCount = Object.keys(experienceRatings).filter(k => experienceRatings[k]).length;

  return (
    <div className="research-questionnaire-root">
      {/* Formal Research Instrument Header */}
      <header className="research-instrument-header">
        <h1 className="instrument-title">Ayurveda Study — Post-Experience Questionnaire</h1>
        <p className="instrument-subtitle">Participant copy • Same questionnaire for C1, C2, C3 and C4</p>

        <div className="instrument-purpose-callout">
          <strong>Purpose:</strong> This questionnaire measures what you remember from the Ayurveda presentation and how clear and engaging you found the experience. There are no questions about whether you personally agree with Ayurveda. Please answer based on the content you experienced.
        </div>

        <div className="participant-identification-bar">
          <div className="id-field">
            <span className="field-label">Participant ID:</span>
            <span className="field-value"><code>{participantId || 'Anonymous'}</code></span>
          </div>
          <div className="id-field">
            <span className="field-label">Condition code:</span>
            <span className="field-value condition-badge">{condition || 'C1'}</span>
          </div>
          <div className="id-field">
            <span className="field-label">Date:</span>
            <span className="field-value">{studyDate}</span>
          </div>
        </div>

        <div className="instrument-general-instructions">
          <strong>Instructions:</strong> For Q1–Q8, select one answer. Choose “Not sure” if you do not know. For Q9, answer in one or two sentences. For Q10–Q13, circle one number for each statement. Please do not discuss answers with other participants.
        </div>
      </header>

      {/* Progress navigation indicator */}
      <nav className="questionnaire-stepper" aria-label="Questionnaire Sections">
        <button
          type="button"
          className={`step-pill ${currentStep === 0 ? 'active' : currentStep > 0 ? 'completed' : ''}`}
          onClick={() => setCurrentStep(0)}
        >
          1. Part A (Q1–Q8) {partAAnsweredCount === 8 && '✓'}
        </button>
        <button
          type="button"
          className={`step-pill ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}
          onClick={() => setCurrentStep(1)}
        >
          2. Part B (Q9) {q9Text.trim().length > 0 && '✓'}
        </button>
        <button
          type="button"
          className={`step-pill ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}
          onClick={() => setCurrentStep(2)}
        >
          3. Part C (Q10–Q13) {expAnsweredCount === 4 && '✓'}
        </button>
        {isC4 && (
          <button
            type="button"
            className={`step-pill ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`}
            onClick={() => setCurrentStep(3)}
          >
            4. Discomfort Check {c4Discomfort !== null && '✓'}
          </button>
        )}
        <button
          type="button"
          className={`step-pill ${currentStep === 4 ? 'active' : ''}`}
          onClick={() => setCurrentStep(4)}
        >
          {isC4 ? '5. Review & Submit' : '4. Review & Submit'}
        </button>
      </nav>

      {/* ─── SECTION 0: PART A — WHAT YOU REMEMBER (Q1–Q8) ──── */}
      {currentStep === 0 && (
        <section className="research-section-card" aria-labelledby="section-a-heading">
          <div className="section-header-banner">
            <h2 id="section-a-heading" className="section-title">Part A — What you remember (Q1–Q8)</h2>
            <span className="section-progress-counter">{partAAnsweredCount} of 8 answered</span>
          </div>
          <p className="section-hint">Select one answer for each question. Choose “Not sure” if you do not know.</p>

          <div className="questions-container">
            {partAQuestions.map((q) => {
              const selectedLetter = partAAnswers[q.id] || null;
              return (
                <article key={q.id} className="question-block" id={`question-block-${q.id}`}>
                  <div className="question-number-badge">{q.id}</div>
                  <div className="question-content">
                    <h3 className="question-title-text">{q.question}</h3>
                    <div className="options-radio-group" role="radiogroup" aria-label={q.question}>
                      {q.options.map((optText, optIndex) => {
                        const letter = String.fromCharCode(65 + optIndex);
                        const isSelected = selectedLetter === letter;
                        const isNotSure = letter === 'E' || optText.toLowerCase() === 'not sure';

                        return (
                          <label
                            key={letter}
                            className={`radio-option-card ${isSelected ? 'selected' : ''} ${isNotSure ? 'not-sure-option' : ''}`}
                          >
                            <input
                              type="radio"
                              name={`question_${q.id}`}
                              value={letter}
                              checked={isSelected}
                              onChange={() => handleSelectPartA(q.id, optIndex)}
                              className="native-radio-input"
                            />
                            <span className="option-letter-box">{letter}</span>
                            <span className="option-label-text">{optText}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="section-action-bar">
            <div className="action-hint">
              {partAAnsweredCount < 8 ? 'Please answer all questions before proceeding.' : 'All 8 questions answered.'}
            </div>
            <button
              type="button"
              className="nav-action-btn primary-btn"
              onClick={() => {
                setCurrentStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Continue to Part B (Q9) →
            </button>
          </div>
        </section>
      )}

      {/* ─── SECTION 1: PART B — MAIN MESSAGE (Q9) ──── */}
      {currentStep === 1 && (
        <section className="research-section-card" aria-labelledby="section-b-heading">
          <div className="section-header-banner">
            <h2 id="section-b-heading" className="section-title">Part B — Main message (Q9)</h2>
          </div>

          <div className="open-response-container">
            <h3 className="question-title-text">{openResponseConfig.question}</h3>
            <p className="open-response-guidance">Please write your answer in one or two clear sentences based on what you experienced.</p>

            <textarea
              className="open-response-textarea"
              rows={5}
              placeholder="Type your response here..."
              value={q9Text}
              onChange={(e) => setQ9Text(e.target.value)}
              aria-label="Main message response"
            />
          </div>

          <div className="section-action-bar">
            <button
              type="button"
              className="nav-action-btn secondary-btn"
              onClick={() => {
                setCurrentStep(0);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              ← Back to Part A
            </button>
            <button
              type="button"
              className="nav-action-btn primary-btn"
              onClick={() => {
                setCurrentStep(2);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Continue to Part C (Q10–Q13) →
            </button>
          </div>
        </section>
      )}

      {/* ─── SECTION 2: PART C — YOUR EXPERIENCE (Q10–Q13) ──── */}
      {currentStep === 2 && (
        <section className="research-section-card" aria-labelledby="section-c-heading">
          <div className="section-header-banner">
            <h2 id="section-c-heading" className="section-title">Part C — Your experience (Q10–Q13)</h2>
            <span className="section-progress-counter">{expAnsweredCount} of 4 answered</span>
          </div>

          <p className="section-hint">
            For each statement, select one number. These items measure your own experience; they are not right-or-wrong knowledge questions.
          </p>

          <div className="likert-anchor-legend">
            {LIKERT_ANCHORS.map(anchor => (
              <div key={anchor.val} className="legend-item">
                <span className="legend-num">{anchor.val}</span>
                <span className="legend-label">{anchor.label}</span>
              </div>
            ))}
          </div>

          <div className="likert-items-container">
            {experienceQuestions.map((item) => {
              const currentRating = experienceRatings[item.id] || null;
              return (
                <div key={item.id} className="likert-item-row">
                  <div className="likert-item-header">
                    <span className="likert-item-id">{item.id}.</span>
                    <span className="likert-item-prompt">{item.prompt}</span>
                  </div>

                  <div className="likert-btn-group" role="radiogroup" aria-label={item.prompt}>
                    {LIKERT_ANCHORS.map((anchor) => (
                      <button
                        key={anchor.val}
                        type="button"
                        role="radio"
                        aria-checked={currentRating === anchor.val}
                        className={`likert-scale-btn ${currentRating === anchor.val ? 'selected' : ''}`}
                        onClick={() => handleSelectExperience(item.id, anchor.val)}
                      >
                        <span className="scale-val">{anchor.val}</span>
                        <span className="scale-label">{anchor.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="section-action-bar">
            <button
              type="button"
              className="nav-action-btn secondary-btn"
              onClick={() => {
                setCurrentStep(1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              ← Back to Part B
            </button>
            <button
              type="button"
              className="nav-action-btn primary-btn"
              onClick={() => {
                if (isC4) {
                  setCurrentStep(3);
                } else {
                  setCurrentStep(4);
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              {isC4 ? 'Continue to Discomfort Check →' : 'Review Your Responses →'}
            </button>
          </div>
        </section>
      )}

      {/* ─── SECTION 3: C4 ONLY — OPTIONAL DISCOMFORT CHECK ──── */}
      {isC4 && currentStep === 3 && (
        <section className="research-section-card" aria-labelledby="section-c4-heading">
          <div className="section-header-banner">
            <h2 id="section-c4-heading" className="section-title">C4 only — optional discomfort check</h2>
          </div>

          <div className="c4-discomfort-container">
            <h3 className="question-title-text">
              During the VR experience, how severe was any dizziness, nausea, eye strain, or other discomfort you experienced?
            </h3>

            <div className="likert-anchor-legend">
              {DISCOMFORT_ANCHORS.map(anchor => (
                <div key={anchor.val} className="legend-item">
                  <span className="legend-num">{anchor.val}</span>
                  <span className="legend-label">{anchor.label}</span>
                </div>
              ))}
            </div>

            <div className="likert-btn-group" role="radiogroup" aria-label="VR discomfort rating">
              {DISCOMFORT_ANCHORS.map((anchor) => (
                <button
                  key={anchor.val}
                  type="button"
                  role="radio"
                  aria-checked={c4Discomfort === anchor.val}
                  className={`likert-scale-btn ${c4Discomfort === anchor.val ? 'selected' : ''}`}
                  onClick={() => setC4Discomfort(anchor.val)}
                >
                  <span className="scale-val">{anchor.val}</span>
                  <span className="scale-label">{anchor.label}</span>
                </button>
              ))}
            </div>

            <div className="safety-instruction-alert">
              <span className="alert-icon">⚠️</span>
              <span className="alert-text">
                If discomfort was present, please tell the researcher. Follow the study’s approved safety procedure.
              </span>
            </div>
          </div>

          <div className="section-action-bar">
            <button
              type="button"
              className="nav-action-btn secondary-btn"
              onClick={() => {
                setCurrentStep(2);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              ← Back to Part C
            </button>
            <button
              type="button"
              className="nav-action-btn primary-btn"
              onClick={() => {
                setCurrentStep(4);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              Review Your Responses →
            </button>
          </div>
        </section>
      )}

      {/* ─── SECTION 4: REVIEW BEFORE SUBMIT ──── */}
      {currentStep === 4 && (
        <section className="research-section-card review-section-card" aria-labelledby="section-review-heading">
          <div className="section-header-banner">
            <h2 id="section-review-heading" className="section-title">Review Your Responses</h2>
          </div>

          <p className="review-intro-notice">
            Please review your recorded answers below before submitting. Once submitted, your questionnaire cannot be modified.
            No correctness or score feedback will be displayed.
          </p>

          {/* Part A Review Summary */}
          <div className="review-block">
            <div className="review-block-header">
              <h4>Part A — What you remember (Q1–Q8)</h4>
              <button type="button" className="edit-link-btn" onClick={() => setCurrentStep(0)}>Edit Part A</button>
            </div>
            <div className="review-answers-grid">
              {partAQuestions.map(q => {
                const ans = partAAnswers[q.id];
                const optIndex = ans ? ans.charCodeAt(0) - 65 : -1;
                const optText = optIndex >= 0 && q.options[optIndex] ? q.options[optIndex] : 'Unanswered';
                return (
                  <div key={q.id} className="review-answer-row">
                    <span className="review-qid">{q.id}:</span>
                    <span className="review-qans">
                      <strong>{ans ? `${ans}.` : '—'}</strong> {optText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Part B Review Summary */}
          <div className="review-block">
            <div className="review-block-header">
              <h4>Part B — Main message (Q9)</h4>
              <button type="button" className="edit-link-btn" onClick={() => setCurrentStep(1)}>Edit Part B</button>
            </div>
            <blockquote className="review-q9-quote">
              {q9Text.trim() ? `"${q9Text.trim()}"` : <em>(No response entered)</em>}
            </blockquote>
          </div>

          {/* Part C Review Summary */}
          <div className="review-block">
            <div className="review-block-header">
              <h4>Part C — Your experience (Q10–Q13)</h4>
              <button type="button" className="edit-link-btn" onClick={() => setCurrentStep(2)}>Edit Part C</button>
            </div>
            <div className="review-answers-grid">
              {experienceQuestions.map(item => {
                const rating = experienceRatings[item.id];
                const label = rating ? LIKERT_ANCHORS.find(a => a.val === rating)?.label : 'Unanswered';
                return (
                  <div key={item.id} className="review-answer-row">
                    <span className="review-qid">{item.id}:</span>
                    <span className="review-qans"><strong>{rating ? `${rating}/5` : '—'}</strong> ({label})</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* C4 Discomfort Review Summary (if C4) */}
          {isC4 && (
            <div className="review-block">
              <div className="review-block-header">
                <h4>C4 Discomfort Check</h4>
                <button type="button" className="edit-link-btn" onClick={() => setCurrentStep(3)}>Edit</button>
              </div>
              <div className="review-answer-row">
                <span className="review-qid">Rating:</span>
                <span className="review-qans">
                  <strong>{c4Discomfort ? `${c4Discomfort}/5` : 'Not answered'}</strong>
                  {c4Discomfort && ` (${DISCOMFORT_ANCHORS.find(a => a.val === c4Discomfort)?.label})`}
                </span>
              </div>
            </div>
          )}

          <div className="section-action-bar submit-action-bar">
            <button
              type="button"
              className="nav-action-btn secondary-btn"
              onClick={() => {
                if (isC4) setCurrentStep(3);
                else setCurrentStep(2);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              ← Back
            </button>
            <button
              type="button"
              className="nav-action-btn submit-final-btn"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Recording Response…' : 'Submit Questionnaire'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
