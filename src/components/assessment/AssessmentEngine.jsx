// AssessmentEngine.jsx — 3-Level Evaluation Engine + Post-Assessment Experience Survey
// Supports Recall/Understand (with perception measures preserved), Apply, Implement (drag ordering),
// and Likert 1-5 Experience Survey.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { sessionClock } from '../../services/SessionClock';
import { normalizeAssessment } from '../../services/StoryLoader';
import './Assessment.css';

export default function AssessmentEngine({
  assessment,
  sessionId,
  participantId,
  condition,
  storyId,
  onComplete
}) {
  // Normalize assessment data
  const normalized = normalizeAssessment(assessment);
  const levels = normalized.levels || [];
  const experienceSurvey = normalized.experience_survey || [];

  const [currentLevel, setCurrentLevel] = useState(0);
  const [currentItem, setCurrentItem] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [dragOrder, setDragOrder] = useState([]);
  const [answerChanges, setAnswerChanges] = useState(0);
  const [results, setResults] = useState([]);

  // Survey state
  const [surveyMode, setSurveyMode] = useState(false);
  const [surveyIndex, setSurveyIndex] = useState(0);
  const [surveyRatings, setSurveyRatings] = useState({});
  const [surveyResults, setSurveyResults] = useState([]);

  const [assessmentComplete, setAssessmentComplete] = useState(false);
  const questionStartTime = useRef(null);

  const currentLevelData = levels[currentLevel];
  const items = currentLevelData?.items || [];
  const currentItemData = items[currentItem];

  // Start timer for each question
  useEffect(() => {
    questionStartTime.current = sessionClock.now();
    setAnswerChanges(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setSubmitted(false);

    if (currentItemData?.type === 'drag_order') {
      const initial = [...(currentItemData.items_to_order || [])];
      setDragOrder(initial);
    }
  }, [currentLevel, currentItem]);

  const handleSelectAnswer = (index) => {
    if (submitted) return;
    if (selectedAnswer !== null && selectedAnswer !== index) {
      setAnswerChanges(prev => prev + 1);
    }
    setSelectedAnswer(index);
  };

  const handleDragOrderChange = (fromIndex, toIndex) => {
    if (submitted) return;
    const newOrder = [...dragOrder];
    const [moved] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, moved);
    setDragOrder(newOrder);
    setAnswerChanges(prev => prev + 1);
  };

  const submitAnswer = useCallback(() => {
    if (submitted || !currentItemData) return;
    setSubmitted(true);

    const responseTime = sessionClock.now() - (questionStartTime.current || 0);
    let isCorrect = false;
    let answerValue = null;
    let correctValue = null;

    if (currentItemData.type === 'multiple_choice') {
      answerValue = selectedAnswer;
      correctValue = currentItemData.correct_answer;
      isCorrect = selectedAnswer === correctValue;
    } else if (currentItemData.type === 'drag_order') {
      answerValue = dragOrder.map(item => item.id);
      correctValue = currentItemData.correct_order;
      isCorrect = JSON.stringify(answerValue) === JSON.stringify(correctValue);
    }

    const result = {
      session_id: sessionId,
      participant_id: participantId,
      condition,
      story_id: storyId,
      question_id: currentItemData.id,
      level: currentLevelData.level,
      question_type: currentItemData.type,
      measure: currentItemData.measure || 'conceptual', // Preserves 'perception' tag!
      start_time: questionStartTime.current,
      end_time: sessionClock.now(),
      answer: answerValue,
      correct_answer: correctValue,
      accuracy: isCorrect ? 1 : 0,
      response_time_ms: responseTime,
      answer_changes: answerChanges,
      final_answer: answerValue,
    };

    setResults(prev => [...prev, result]);
    setShowExplanation(true);

    // Event Log
    eventLogger.log('OBJECT_INTERACT', {
      objectId: currentItemData.id,
      action: 'assessment_submit',
      response: JSON.stringify({
        answer: answerValue,
        correct: isCorrect,
        time_ms: responseTime,
        changes: answerChanges,
        measure: result.measure
      })
    });

    // Save to local IndexedDB & central backend
    eventLogger.saveAssessmentResponse(result);
  }, [submitted, selectedAnswer, dragOrder, currentItemData, currentLevelData, answerChanges, sessionId, participantId, condition, storyId]);

  const nextQuestion = useCallback(() => {
    if (currentItem < items.length - 1) {
      setCurrentItem(prev => prev + 1);
    } else if (currentLevel < levels.length - 1) {
      setCurrentLevel(prev => prev + 1);
      setCurrentItem(0);
    } else {
      // 3-Level Assessment Complete — transition to Experience Survey if available
      if (experienceSurvey.length > 0) {
        setSurveyMode(true);
        setSurveyIndex(0);
        questionStartTime.current = sessionClock.now();
      } else {
        setAssessmentComplete(true);
        if (onComplete) onComplete(results);
      }
    }
  }, [currentItem, currentLevel, items.length, levels.length, experienceSurvey.length, results, onComplete]);

  // ─── Experience Survey Handlers ────
  const handleSurveySelect = (qId, rating) => {
    setSurveyRatings(prev => ({ ...prev, [qId]: rating }));
  };

  const handleSurveySubmit = () => {
    const surveyItem = experienceSurvey[surveyIndex];
    if (!surveyItem) return;

    const rating = surveyRatings[surveyItem.id];
    if (!rating) return;

    const responseTime = sessionClock.now() - (questionStartTime.current || 0);

    const surveyEntry = {
      session_id: sessionId,
      participant_id: participantId,
      condition,
      story_id: storyId,
      question_id: surveyItem.id,
      level: 'experience_survey',
      question_type: 'likert_1_5',
      measure: 'experience',
      start_time: questionStartTime.current,
      end_time: sessionClock.now(),
      answer: rating,
      correct_answer: null,
      accuracy: null, // Self-reported experience, NOT factored into correctness score
      response_time_ms: responseTime,
      answer_changes: 0,
      final_answer: rating
    };

    const updatedSurveyResults = [...surveyResults, surveyEntry];
    setSurveyResults(updatedSurveyResults);
    eventLogger.saveAssessmentResponse(surveyEntry);

    if (surveyIndex < experienceSurvey.length - 1) {
      setSurveyIndex(prev => prev + 1);
      questionStartTime.current = sessionClock.now();
    } else {
      // All done!
      setSurveyMode(false);
      setAssessmentComplete(true);
      if (onComplete) onComplete([...results, ...updatedSurveyResults]);
    }
  };

  if (!assessment || levels.length === 0) {
    return <div className="assessment-container"><p>No assessment configured.</p></div>;
  }

  // ─── Results View ────
  if (assessmentComplete) {
    return <AssessmentResults results={results} levels={levels} surveyResults={surveyResults} />;
  }

  // ─── Experience Survey View ────
  if (surveyMode) {
    const surveyItem = experienceSurvey[surveyIndex];
    const currentRating = surveyRatings[surveyItem?.id];

    return (
      <div className="assessment-container">
        <div className="assessment-header">
          <div className="assessment-level-badge" style={{ backgroundColor: '#8b5cf6', color: '#fff' }}>
            🌟 Experience Survey
          </div>
          <div className="assessment-progress-text">
            Survey {surveyIndex + 1} of {experienceSurvey.length}
          </div>
        </div>

        <div className="assessment-progress-bar">
          <div className="level-progress-segment" style={{ width: '100%' }}>
            {experienceSurvey.map((_, idx) => (
              <div
                key={idx}
                className={`progress-dot ${idx < surveyIndex ? 'done' : idx === surveyIndex ? 'active' : ''}`}
                style={{ backgroundColor: idx < surveyIndex ? '#8b5cf6' : idx === surveyIndex ? '#a78bfa' : 'rgba(255,255,255,0.15)' }}
              />
            ))}
          </div>
        </div>

        <div className="assessment-question-card">
          <h3 className="question-text" style={{ fontSize: '1.25rem', marginBottom: '24px' }}>
            {surveyItem.prompt}
          </h3>

          <div className="likert-scale-container" style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', margin: '24px 0' }}>
            {[1, 2, 3, 4, 5].map((val) => (
              <button
                key={val}
                className={`likert-btn ${currentRating === val ? 'selected' : ''}`}
                onClick={() => handleSurveySelect(surveyItem.id, val)}
                style={{
                  flex: 1,
                  padding: '16px 8px',
                  borderRadius: '10px',
                  border: currentRating === val ? '2px solid #8b5cf6' : '1px solid rgba(255,255,255,0.15)',
                  background: currentRating === val ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{val}</span>
                <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>
                  {val === 1 ? 'Not at all' : val === 3 ? 'Moderately' : val === 5 ? 'Extremely' : ''}
                </span>
              </button>
            ))}
          </div>

          <div className="assessment-actions" style={{ marginTop: '28px' }}>
            <button
              className="submit-btn"
              onClick={handleSurveySubmit}
              disabled={!currentRating}
              style={{ background: currentRating ? '#8b5cf6' : 'rgba(255,255,255,0.2)' }}
            >
              {surveyIndex < experienceSurvey.length - 1 ? 'Next Question' : 'Complete Study'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── 3-Level Assessment View ────
  const totalQuestions = levels.reduce((sum, l) => sum + (l.items?.length || 0), 0);
  const answeredQuestions = results.length;

  return (
    <div className="assessment-container">
      {/* Header */}
      <div className="assessment-header">
        <div className="assessment-level-badge" data-level={currentLevelData.level}>
          {currentLevelData.label}
        </div>
        <div className="assessment-progress-text">
          Question {answeredQuestions + 1} of {totalQuestions}
        </div>
      </div>

      {/* Progress bar */}
      <div className="assessment-progress-bar">
        {levels.map((level, li) => (
          <div key={level.level} className="level-progress-segment"
            style={{ width: `${(level.items?.length / totalQuestions) * 100}%` }}>
            {level.items?.map((_, qi) => {
              const globalIdx = levels.slice(0, li).reduce((s, l) => s + (l.items?.length || 0), 0) + qi;
              return (
                <div key={qi} className={`progress-dot ${globalIdx < answeredQuestions ? 'done' : globalIdx === answeredQuestions ? 'active' : ''}`}
                  style={{ backgroundColor: globalIdx < answeredQuestions ? '#4CAF50' : globalIdx === answeredQuestions ? level.level === 'recall_understand' ? '#FFD93D' : level.level === 'apply' ? '#FF6B35' : '#4ECDC4' : 'rgba(255,255,255,0.15)' }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Question Card */}
      <div className="assessment-question-card">
        <h3 className="question-text">{currentItemData.question}</h3>

        {currentItemData.type === 'multiple_choice' && (
          <div className="options-list">
            {currentItemData.options.map((opt, i) => (
              <button
                key={i}
                className={`option-btn ${selectedAnswer === i ? 'selected' : ''} ${submitted ? (i === currentItemData.correct_answer ? 'correct' : selectedAnswer === i ? 'incorrect' : '') : ''}`}
                onClick={() => handleSelectAnswer(i)}
                disabled={submitted}
              >
                <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                <span className="option-text">{opt}</span>
                {submitted && i === currentItemData.correct_answer && <span className="option-icon">✓</span>}
                {submitted && selectedAnswer === i && i !== currentItemData.correct_answer && <span className="option-icon">✗</span>}
              </button>
            ))}
          </div>
        )}

        {currentItemData.type === 'drag_order' && (
          <div className="drag-order-list">
            {dragOrder.map((item, i) => (
              <div key={item.id} className={`drag-order-item ${submitted ? (item.id === currentItemData.correct_order[i] ? 'correct' : 'incorrect') : ''}`}>
                <span className="order-number">{i + 1}</span>
                <span className="order-label">{item.label}</span>
                {!submitted && (
                  <div className="order-arrows">
                    {i > 0 && <button className="arrow-btn" onClick={() => handleDragOrderChange(i, i - 1)}>↑</button>}
                    {i < dragOrder.length - 1 && <button className="arrow-btn" onClick={() => handleDragOrderChange(i, i + 1)}>↓</button>}
                  </div>
                )}
                {submitted && (
                  <span className="order-icon">
                    {item.id === currentItemData.correct_order[i] ? '✓' : '✗'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Explanation */}
        {showExplanation && currentItemData.explanation && (
          <div className="explanation-card">
            <strong>Explanation:</strong> {currentItemData.explanation}
          </div>
        )}

        {/* Action buttons */}
        <div className="assessment-actions">
          {!submitted ? (
            <button className="submit-btn" onClick={submitAnswer}
              disabled={currentItemData.type === 'multiple_choice' && selectedAnswer === null}>
              Submit Answer
            </button>
          ) : (
            <button className="next-btn" onClick={nextQuestion}>
              {currentItem < items.length - 1 ? 'Next Question' :
                currentLevel < levels.length - 1 ? `Next Level: ${levels[currentLevel + 1].label}` :
                  experienceSurvey.length > 0 ? 'Proceed to Experience Survey' : 'View Results'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Results Summary ────
function AssessmentResults({ results, levels, surveyResults = [] }) {
  const levelResults = {};
  for (const r of results) {
    if (!levelResults[r.level]) levelResults[r.level] = [];
    levelResults[r.level].push(r);
  }

  const totalCorrect = results.filter(r => r.accuracy === 1).length;
  const totalQuestions = results.length;
  const overallPct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  return (
    <div className="assessment-container">
      <div className="results-card">
        <h2 className="results-title">Assessment Complete</h2>

        <div className="results-score-ring">
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle cx="50" cy="50" r="42" fill="none" stroke={overallPct >= 70 ? '#4CAF50' : overallPct >= 40 ? '#FFD93D' : '#F44336'}
              strokeWidth="6" strokeDasharray={`${overallPct * 2.64} 264`}
              style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }} />
          </svg>
          <span className="score-text">{overallPct}%</span>
        </div>

        <p className="results-subtitle">{totalCorrect} of {totalQuestions} correct</p>

        <div className="results-by-level">
          {levels.map(level => {
            const lr = levelResults[level.level] || [];
            const correct = lr.filter(r => r.accuracy === 1).length;
            const total = lr.length;
            const avgTime = total > 0 ? Math.round(lr.reduce((s, r) => s + r.response_time_ms, 0) / total / 1000) : 0;

            return (
              <div key={level.level} className="level-result-row">
                <div className="level-result-label">{level.label}</div>
                <div className="level-result-score">{correct}/{total}</div>
                <div className="level-result-time">Avg: {avgTime}s</div>
                <div className="level-result-bar">
                  <div className="level-result-fill" style={{
                    width: `${total > 0 ? (correct / total) * 100 : 0}%`,
                    backgroundColor: correct === total ? '#4CAF50' : '#FFD93D'
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {surveyResults.length > 0 && (
          <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', textAlign: 'left' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: '#a78bfa' }}>Self-Reported Experience Ratings</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
              {surveyResults.map(s => (
                <div key={s.question_id} style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{s.question_id}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#38bdf8' }}>⭐ {s.answer}/5</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
