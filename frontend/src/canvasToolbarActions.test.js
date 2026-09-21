import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCanvasToolbarAction,
  isCanvasToolbarActionImplemented,
  listCanvasToolbarActions,
} from './canvasToolbarActions.js';

test('lists only implemented image actions for the current toolbar', () => {
  const actions = listCanvasToolbarActions({ nodeType: 'image', implementedOnly: true });
  assert.deepEqual(actions.map(action => action.id), [
    'annotate',
    'inpaint',
    'perspective',
    'crop',
    'rotate',
    'download',
    'save-to-library',
  ]);
});

test('keeps TapNow target actions registered but not falsely enabled', () => {
  assert.equal(getCanvasToolbarAction('outpaint').operation, 'outpaint');
  assert.equal(isCanvasToolbarActionImplemented('outpaint'), false);
  assert.equal(isCanvasToolbarActionImplemented('inpaint'), true);
});

test('filters toolbar actions by supported operation set', () => {
  const actions = listCanvasToolbarActions({
    nodeType: 'video',
    availableOperations: ['trim'],
  });
  assert.deepEqual(actions.map(action => action.id), ['trim']);
});
