// OnboardingDemo.jsx — Combined Overview Page for all modalities
import React from 'react';
import './OnboardingDemo.css';

export const MODALITY_EXPLANATIONS = [
  {
    id: 'C1',
    title: 'Simple Video',
    icon: '▶️',
    description: "You'll watch a short video with audio. Just sit back, watch, and listen to the story."
  },
  {
    id: 'C2',
    title: 'Spatial Audio',
    icon: '🎧',
    description: "Sound will move and change direction depending on what's happening on screen. Listen closely for where sounds come from."
  },
  {
    id: 'C3',
    title: 'Interactive',
    icon: '👆',
    description: "At certain moments you'll be asked to interact with the screen (tap, drag, trace, etc.) as part of the story."
  },
  {
    id: 'C4',
    title: 'VR Immersive',
    icon: '🥽',
    description: "You'll be inside a 360° view of the story and can look around. Gazing at certain things will trigger a reaction."
  }
];

export default function OnboardingDemo({ condition, storyConfig, onComplete }) {
  return (
    <div className="onboarding-overlay scrollable-overlay">
      <div className="onboarding-card combined-demo-card">
        <div className="onboarding-header">
          <span className="condition-chip-large">Study Overview</span>
          <h2>Welcome to the Study</h2>
          <p className="intro-lead">
            Before we begin, here is a quick overview of the different types of experiences you might encounter in this study.
            Read through them to understand how the story can be experienced!
          </p>
        </div>

        <div className="modalities-list">
          {MODALITY_EXPLANATIONS.map((modality) => (
            <div key={modality.id} className="modality-row">
              <div className="modality-icon">{modality.icon}</div>
              <div className="modality-text">
                <h3>{modality.title}</h3>
                <p>{modality.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="onboarding-footer">
          <button className="begin-experience-btn" onClick={onComplete}>
            I understand, continue to my story 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
