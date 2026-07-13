import React from 'react';
import ChatView from '../ChatView.jsx';
import { useEditorStore } from '../../store.js';
import { api } from '../../api.js';

const SUGGESTIONS = [
  'Add a finance approval before payment.',
  'Highlight bottlenecks.',
  'Optimise this process.',
  'Reduce unnecessary approvals.',
  'Create an executive summary.',
];

export default function AiPanel({ processId, projectId, onHighlight }) {
  const adoptServerMap = useEditorStore((s) => s.adoptServerMap);
  const toast = useEditorStore((s) => s.toast);

  return (
    <ChatView
      projectId={projectId}
      processId={processId}
      intro={
        'I can modify this process for you — just describe the change in plain language. ' +
        'For example: “Add a finance approval before payment”, “Split customer support into three teams”, ' +
        '“Move delivery before invoicing”, or ask me to optimise, analyse, or summarise the process.'
      }
      placeholder="Describe a change or ask a question about this process…"
      suggestions={SUGGESTIONS}
      onEvent={async (reply) => {
        if (reply.kind === 'edited') {
          try {
            const proc = await api.getProcess(processId);
            adoptServerMap(proc.map);
            toast(reply.summary || 'Process updated by AI.');
          } catch (e) {
            toast(e.message, 'error');
          }
        }
        if (reply.kind === 'highlight' && reply.nodeIds) {
          onHighlight?.(reply.nodeIds);
        }
      }}
    />
  );
}
