import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createInitialStyleWorkbenchContext,
  nextStyleRevision,
  updateStyleWorkbenchContext,
} from './style-workbench-state.js';

describe('style workbench state', () => {
  it('keeps active source and selected layer as compact AI context', () => {
    const context = updateStyleWorkbenchContext(
      createInitialStyleWorkbenchContext(),
      {
        activeSourceId: 'default-style-source',
        selectedLayerId: 'road-primary',
      }
    );

    assert.equal(context.activeSourceId, 'default-style-source');
    assert.equal(context.selectedLayerId, 'road-primary');
    assert.equal(context.revisionId, 'rev-0');
  });

  it('increments revisions with stable ids for map style changes', () => {
    const rev1 = nextStyleRevision(createInitialStyleWorkbenchContext());
    const rev2 = nextStyleRevision(rev1);

    assert.equal(rev1.revision, 1);
    assert.equal(rev1.revisionId, 'rev-1');
    assert.equal(rev2.revision, 2);
    assert.equal(rev2.revisionId, 'rev-2');
  });
});
