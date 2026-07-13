import React from 'react';
import ChatView from './ChatView.jsx';

const SUGGESTIONS = [
  'We are an online clothing company trying to reduce delivery delays.',
  'We are a healthcare organisation improving patient onboarding.',
  'We are a manufacturing company trying to reduce production waste.',
];

export default function AiIntake({ projectId, onProcessCreated }) {
  return (
    <ChatView
      projectId={projectId}
      intro={
        'Hello — I am your AI business analyst. Tell me about your organisation: what you do, ' +
        'your objective, the main challenge, and who is involved. If I need more detail I will ' +
        'ask a few short questions before building your process map.'
      }
      placeholder="Describe your business, its goals and challenges…"
      suggestions={SUGGESTIONS}
      onEvent={(reply) => {
        if (reply.kind === 'generated' && reply.processId) {
          onProcessCreated?.(reply.processId);
        }
      }}
    />
  );
}
