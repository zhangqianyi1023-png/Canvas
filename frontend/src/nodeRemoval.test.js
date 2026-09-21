import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNodeRemovalIds } from './nodeRemoval.js';

test('removing a group also removes descendants, paired generators, and source-linked nodes', () => {
  const nodes = [
    { id: 'group-1', type: 'group' },
    { id: 'result-1', type: 'result', parentNode: 'group-1' },
    { id: 'nested-group', type: 'group', parentNode: 'group-1' },
    { id: 'nested-result', type: 'result', parentNode: 'nested-group' },
    { id: 'generator-1', type: 'generator' },
    { id: 'nested-generator', type: 'generator' },
    { id: 'derived-generator', type: 'generator', data: { sourceResultId: 'result-1' } },
    { id: 'derived-result', type: 'result' },
    { id: 'unrelated', type: 'result' },
  ];
  const pairMap = {
    'result-1': 'generator-1',
    'nested-result': 'nested-generator',
    'derived-result': 'derived-generator',
  };

  const result = collectNodeRemovalIds(nodes, pairMap, ['group-1']);

  assert.deepEqual(
    [...result].sort(),
    [
      'derived-generator',
      'derived-result',
      'generator-1',
      'group-1',
      'nested-generator',
      'nested-group',
      'nested-result',
      'result-1',
    ].sort()
  );
  assert.equal(result.has('unrelated'), false);
});
