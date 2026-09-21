import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VISUAL_ANNOTATION_MODE,
  buildVisualAnnotationPrompt,
  buildVisualAnnotationReferences,
} from './imageAnnotationPrompt.js';

test('buildVisualAnnotationReferences separates source and annotated image references', () => {
  const refs = buildVisualAnnotationReferences('/uploads/source.png', 'data:image/png;base64,annotated');

  assert.deepEqual(refs.connectedImages, ['/uploads/source.png']);
  assert.deepEqual(refs.uploadedReferenceImages, ['data:image/png;base64,annotated']);
});

test('buildVisualAnnotationReferences removes empty values', () => {
  const refs = buildVisualAnnotationReferences('', null);

  assert.deepEqual(refs.connectedImages, []);
  assert.deepEqual(refs.uploadedReferenceImages, []);
});

test('buildVisualAnnotationPrompt includes visual annotation guidance and optional instruction', () => {
  const prompt = buildVisualAnnotationPrompt('把红圈里的包换成白色托特包');

  assert.equal(VISUAL_ANNOTATION_MODE, 'visual-markup');
  assert.match(prompt, /原图和批注图/);
  assert.match(prompt, /批注图中的标记/);
  assert.match(prompt, /把红圈里的包换成白色托特包/);
});
