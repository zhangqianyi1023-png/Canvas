import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendSmartSplitterBatch,
  getNextSmartSplitterBatchIndex,
  snapshotSmartSplitterCandidates,
} from './smartSplitterState.js';
import {
  buildSplitPrompt,
  enforceImageRatioInPrompt,
} from './smartSplitter.js';

test('smart splitter candidate updates use immutable image and task snapshots', () => {
  const imageUrls = ['/uploads/first.png'];
  const taskIds = ['task_1'];
  const firstUpdate = snapshotSmartSplitterCandidates(imageUrls, taskIds);

  imageUrls.push('/uploads/second.png');
  taskIds.push('task_2');
  const secondUpdate = snapshotSmartSplitterCandidates(imageUrls, taskIds);

  assert.deepEqual(firstUpdate, {
    imageUrls: ['/uploads/first.png'],
    taskIds: ['task_1'],
  });
  assert.deepEqual(secondUpdate, {
    imageUrls: ['/uploads/first.png', '/uploads/second.png'],
    taskIds: ['task_1', 'task_2'],
  });
  assert.notStrictEqual(firstUpdate.imageUrls, imageUrls);
  assert.notStrictEqual(secondUpdate.imageUrls, imageUrls);
});

test('smart splitter repeat runs always append a new batch', () => {
  const batches = [
    { batch_id: 'batch_1', batch_index: 1 },
    { batch_id: 'batch_2', batch_index: 2 },
  ];
  const nextBatch = {
    batch_id: 'batch_3',
    batch_index: getNextSmartSplitterBatchIndex(batches),
  };

  assert.equal(nextBatch.batch_index, 3);
  assert.deepEqual(appendSmartSplitterBatch(batches, nextBatch), [
    ...batches,
    nextBatch,
  ]);
  assert.deepEqual(batches, [
    { batch_id: 'batch_1', batch_index: 1 },
    { batch_id: 'batch_2', batch_index: 2 },
  ]);
});

test('smart splitter split prompt carries the selected image ratio as a hard rule', () => {
  const prompt = buildSplitPrompt({
    request: '拆成三套广告视觉',
    context: '商品是儿童水杯',
    directionCount: 3,
    referenceImageCount: 1,
    imageSize: '3:4',
  });

  assert.match(prompt, /硬性画幅比例：所有方向和最终生图都必须是 3:4/);
  assert.match(prompt, /不要输出或暗示任何与 3:4 冲突的比例/);
});

test('smart splitter generation prompt replaces conflicting ratios with the selected ratio', () => {
  const prompt = enforceImageRatioInPrompt(
    '16:9 横屏，极简白底商品广告图，主体居中，aspect_ratio: 1:1，高清质感',
    '3:4',
  );

  assert.match(prompt, /^画幅比例必须为 3:4，不得使用其他比例。/);
  assert.doesNotMatch(prompt, /16:9/);
  assert.doesNotMatch(prompt, /1:1/);
  assert.doesNotMatch(prompt, /横屏/);
  assert.match(prompt, /极简白底商品广告图/);
});
