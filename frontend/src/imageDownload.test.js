import assert from 'node:assert/strict';
import test from 'node:test';
import { createZipBlob, crc32, guessMediaExtension } from './imageDownload.js';

const readZipCentralDirectory = async (blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let endOffset = -1;

  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }

  assert.notEqual(endOffset, -1);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries = [];
  let offset = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const filename = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    entries.push({ filename, method, compressedSize, uncompressedSize });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  assert.equal(offset, centralOffset + centralSize);
  return entries;
};

test('crc32 matches the standard check value', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes).toString(16), 'cbf43926');
});

test('createZipBlob writes a valid zip central directory and unique names', async () => {
  const zip = await createZipBlob([
    { filename: 'same.png', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) },
    { filename: 'same.png', blob: new Blob([new Uint8Array([4, 5])], { type: 'image/png' }) },
  ]);

  assert.equal(zip.type, 'application/zip');
  const entries = await readZipCentralDirectory(zip);

  assert.deepEqual(entries.map(entry => entry.filename), ['same.png', 'same-02.png']);
  assert.deepEqual(entries.map(entry => entry.method), [0, 0]);
  assert.deepEqual(entries.map(entry => entry.uncompressedSize), [3, 2]);
  assert.deepEqual(entries.map(entry => entry.compressedSize), [3, 2]);
});

test('guessMediaExtension supports video mime types and URLs', () => {
  assert.equal(guessMediaExtension('/uploads/demo.mp4', ''), 'mp4');
  assert.equal(guessMediaExtension('/uploads/demo.mov?x=1', ''), 'mov');
  assert.equal(guessMediaExtension('/uploads/demo', 'video/quicktime'), 'mov');
  assert.equal(guessMediaExtension('/uploads/demo', 'video/webm'), 'webm');
});
