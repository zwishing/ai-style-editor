import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactModelHistory,
  summarizeCompactToolResult,
} from './chat-history.js';

describe('chat history compaction', () => {
  it('summarizes compact tool results without carrying full output JSON', () => {
    const summary = summarizeCompactToolResult({
      success: true,
      message: 'Applied 1 style operation.',
      data: {
        changedLayers: ['road-primary'],
        diffSummary: [
          {
            path: 'layers.road-primary.paint.line-color',
            before: '#64748b',
            after: '#38bdf8',
          },
        ],
      },
    });

    assert.equal(
      summary,
      'Tool result: Applied 1 style operation. Changed layers: road-primary. Diff: layers.road-primary.paint.line-color: "#64748b" -> "#38bdf8".'
    );
  });

  it('keeps only the latest compact conversation turns', () => {
    const history = compactModelHistory(
      [
        { role: 'user', content: 'old request' },
        { role: 'assistant', content: 'old answer' },
      ],
      [
        { role: 'user', content: 'new request' },
        { role: 'assistant', content: 'new answer' },
      ],
      2
    );

    assert.deepEqual(history, [
      { role: 'user', content: 'new request' },
      { role: 'assistant', content: 'new answer' },
    ]);
  });
});
