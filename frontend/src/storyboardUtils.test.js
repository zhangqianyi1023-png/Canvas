import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatStoryboardCardForPrompt,
  normalizeStoryboardCard,
  parseStoryboardPayload,
} from './storyboardUtils.js';

test('normalizeStoryboardCard preserves segment shots and global style fields', () => {
  const card = normalizeStoryboardCard({
    segmentId: 'S01',
    segmentTitle: '厨房开场',
    durationSeconds: 8,
    resourceRefs: [{ type: 'scene', id: 'scene_1', label: '主场景' }],
    globalStylePrompt: '9:16 竖屏，暖色自然光',
    resourceReferencePrompt: '引用主场景和商品图',
    videoNegativePrompt: '中文乱码, logo 错乱',
    shots: [
      {
        shotId: 'S01-01',
        durationSeconds: 2,
        cameraMovement: '缓慢推近',
        visualContent: '主角走进厨房',
        resourceRefs: ['talent_1', 'scene_1'],
        dialogue: '调味不能随便选。',
        subtitle: '调味不能随便选。',
      },
    ],
  }, 0);

  assert.equal(card.segmentId, 'S01');
  assert.equal(card.segmentTitle, '厨房开场');
  assert.equal(card.globalStylePrompt, '9:16 竖屏，暖色自然光');
  assert.equal(card.resourceReferencePrompt, '引用主场景和商品图');
  assert.equal(card.videoNegativePrompt, '中文乱码, logo 错乱');
  assert.equal(card.resourceRefs[0].id, 'scene_1');
  assert.equal(card.shots.length, 1);
  assert.equal(card.shots[0].durationSeconds, 2);
  assert.equal(card.shots[0].resourceRefs[0].id, 'talent_1');
});

test('parseStoryboardPayload and formatter include workbench fields', () => {
  const payload = JSON.stringify({
    cards: [
      {
        segmentId: 'S02',
        segmentTitle: '商品身份锁定',
        durationSeconds: 10,
        globalStylePrompt: '真实家庭厨房，高质感商品特写',
        shots: [
          {
            durationSeconds: 4,
            visualContent: '商品正面朝向镜头',
            resourceRefs: [{ type: 'product', id: 'product_1', label: '商品图' }],
          },
        ],
      },
    ],
  });

  const parsed = parseStoryboardPayload(payload);
  assert.equal(parsed.cards[0].segmentId, 'S02');
  assert.equal(parsed.cards[0].shots[0].resourceRefs[0].label, '商品图');

  const formatted = formatStoryboardCardForPrompt(parsed.cards[0]);
  assert.match(formatted, /S02/);
  assert.match(formatted, /全局风格：真实家庭厨房/);
  assert.match(formatted, /分镜头/);
  assert.match(formatted, /资料引用：商品图\(product\)/);
});
