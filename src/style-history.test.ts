import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canRedoStyleHistory,
  canUndoStyleHistory,
  createStyleHistory,
  getExportStyleFilename,
  redoStyleHistory,
  recordStyleHistoryChange,
  serializeStyleForExport,
  undoStyleHistory,
} from './style-history.js';

describe('style history', () => {
  it('records a new style snapshot and allows undo', () => {
    const initialStyle = { version: 8, layers: [{ id: 'water' }] };
    const editedStyle = { version: 8, layers: [{ id: 'road' }] };

    const history = recordStyleHistoryChange(
      createStyleHistory(initialStyle),
      editedStyle,
    );

    assert.equal(canUndoStyleHistory(history), true);
    assert.equal(canRedoStyleHistory(history), false);
    assert.deepEqual(undoStyleHistory(history).history.present, initialStyle);
  });

  it('allows redo after undo', () => {
    const initialStyle = { version: 8, layers: [{ id: 'water' }] };
    const editedStyle = { version: 8, layers: [{ id: 'road' }] };
    const history = recordStyleHistoryChange(
      createStyleHistory(initialStyle),
      editedStyle,
    );

    const undone = undoStyleHistory(history).history;
    const redone = redoStyleHistory(undone).history;

    assert.deepEqual(redone.present, editedStyle);
    assert.equal(canRedoStyleHistory(redone), false);
  });

  it('clears redo snapshots when recording after undo', () => {
    const initialStyle = { version: 8, layers: [{ id: 'water' }] };
    const firstEdit = { version: 8, layers: [{ id: 'road' }] };
    const secondEdit = { version: 8, layers: [{ id: 'building' }] };

    const history = recordStyleHistoryChange(
      undoStyleHistory(
        recordStyleHistoryChange(createStyleHistory(initialStyle), firstEdit),
      ).history,
      secondEdit,
    );

    assert.equal(canRedoStyleHistory(history), false);
    assert.deepEqual(history.present, secondEdit);
  });

  it('does not record duplicate snapshots', () => {
    const initialStyle = { version: 8, layers: [{ id: 'water' }] };

    const history = recordStyleHistoryChange(
      createStyleHistory(initialStyle),
      { version: 8, layers: [{ id: 'water' }] },
    );

    assert.equal(canUndoStyleHistory(history), false);
  });

  it('serializes style json for export with a trailing newline', () => {
    assert.equal(
      serializeStyleForExport({ version: 8, layers: [] }),
      '{\n  "version": 8,\n  "layers": []\n}\n',
    );
  });

  it('builds a filesystem-safe export filename from the source name', () => {
    assert.equal(
      getExportStyleFilename('默认 / Road Source'),
      'road-source-style.json',
    );
  });
});
