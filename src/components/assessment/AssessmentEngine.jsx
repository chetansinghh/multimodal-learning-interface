// Assessment Engine — 3-level config-driven evaluation
// Recall/Understand → Apply → Implement
// Logs per response: question ID, level, start time, answer, accuracy, response time, revisions.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { eventLogger } from '../../services/EventLogger';
import { sessionClock } from '../../services/SessionClock';
import './Assessment.css';

export default function AssessmentEngine({ assessment, sessionId, participantId, condition, onComplete }) {
  const [currentLevel, setCurrentLevel] = useState(0);
  const [currentItem, setCurrentItem] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [dragOrder, setDragOrder] = useState([]);
  const [answerChanges, setAnswerChanges] = useState(0);
  const [results, setResults] = useState([]);
  const [assessmentComplete, setAssessmentComplete] = useState(false);
  const questionStartTime = useRef(null);

  const levels = assessment?.levels || [];
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
      // Shuffle items
      const shuffled = [...(currentItemData.items_to_order || [])].sort(() => Math.random() - 0.5);
      setDragOrder(shuffled);
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
    if (submitted) return;
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
      question_id: currentItemData.id,
      level: currentLevelData.level,
      start_time: questionStartTime.current,
      answer: answerValue,
      correct_answer: correctValue,
      accuracy: isCorrect ? 1 : 0,
      response_time_ms: responseTime,
      answer_changes: answerChanges,
      final_answer: answerValue,
    };

    setResults(prev => [...prev, result]);
    setShowExplanation(true);

    // Log to event logger
    eventLogger.log('OBJECT_INTERACT', {
      objectId: currentItemData.id,
      action: 'assessment_submit',
      response: JSON.stringify({
        answer: answerValue,
        correct: isCorrect,
        time_ms: responseTime,
        changes: answerChanges
      })
    });

    // Also save to assessments store
    eventLogger.saveAssessmentResponse(result);
  }, [submitted, selectedAnswer, dragOrder, currentItemData, currentLevelData, answerChanges, sessionId, participantId, condition]);

  const nextQuestion = useCallback(() => {
    if (currentItem < items.length - 1) {
      setCurrentItem(prev => prev + 1);
    } else if (currentLevel < levels.length - 1) {
      setCurrentLevel(prev => prev + 1);
      setCurrentItem(0);
    } else {
      // Assessment complete
      setAssessmentComplete(true);
      if (onComplete) onComplete(results);
    }
  }, [currentItem, currentLevel, items.length, levels.length, results, onComplete]);

  if (!assessment || levels.length === 0) {
    return <div className="assessment-container"><p>No assessment configured.</p></div>;
  }

  if (assessmentComplete) {
    return <AssessmentResults results={results} levels={levels} />;
  }

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

      {/* Question */}
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
                  'View Results'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Results Summary ────
function AssessmentResults({ results, levels }) {
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
      </div>
    </div>
  );
}
