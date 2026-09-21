import { API_BASE } from './apiBase.js';

const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_VERSION = 20;
const ZIP_UINT32_MAX = 0xffffffff;

export const guessMediaExtension = (url, mime) => {
  if (mime) {
    const sub = mime.split('/')[1];
    if (sub) return sub.replace('jpeg', 'jpg').replace('quicktime', 'mov');
  }
  try {
    const baseUrl = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
    const pathname = new URL(url, baseUrl).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {
    /* ignore */
  }
  return 'png';
};

export const guessImageExtension = guessMediaExtension;

export const fetchMediaAsBlob = async (url) => {
  if (!url) throw new Error('媒体地址为空');

  // 同源 /uploads 直接用 fetch
  if (url.startsWith('/')) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`);
    return await resp.blob();
  }

  // 跨域图片通过后端代理下载
  const resp = await fetch(`${API_BASE}/api/proxy/download?url=${encodeURIComponent(url)}`);
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(msg || `下载失败: HTTP ${resp.status}`);
  }
  return await resp.blob();
};

export const fetchImageAsBlob = fetchMediaAsBlob;

export const downloadBlob = (blob, filename) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }, 100);
};

const imageBlobToPng = async (blob) => {
  if (typeof document === 'undefined') throw new Error('当前环境无法处理图片');
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片解码失败'));
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    if (!canvas.width || !canvas.height) throw new Error('图片尺寸无效');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前环境不支持图片转换');
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片转换失败')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const copyImageToClipboard = async (url) => {
  if (!url) throw new Error('图片地址为空');
  if (
    typeof navigator === 'undefined'
    || !navigator.clipboard?.write
    || typeof ClipboardItem !== 'function'
  ) {
    throw new Error('当前浏览器不支持复制图片');
  }

  const blob = await fetchImageAsBlob(url);
  const clipboardBlob = String(blob.type || '').toLowerCase() === 'image/png'
    ? blob
    : await imageBlobToPng(blob);
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': clipboardBlob }),
  ]);
};

const sanitizeFilenamePart = (value, fallback = 'image') => (
  String(value || fallback)
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
  || fallback
);

const ensureExtension = (filename, ext) => {
  const safeExt = sanitizeFilenamePart(ext || 'png', 'png').toLowerCase();
  const safeName = sanitizeFilenamePart(filename, 'media');
  return safeName.toLowerCase().endsWith(`.${safeExt}`)
    ? safeName
    : `${safeName}.${safeExt}`;
};

const getMediaFilename = (item, defaultNamePrefix, index, ext) => {
  const baseFilename = item?.filename
    ? sanitizeFilenamePart(item.filename, 'image')
    : `${sanitizeFilenamePart(defaultNamePrefix, 'media')}-${String(index + 1).padStart(2, '0')}`;
  return ensureExtension(baseFilename, ext);
};

const getImageFilename = getMediaFilename;

const ensureZipFilename = (filename, defaultNamePrefix) => {
  const base = sanitizeFilenamePart(
    filename || `${defaultNamePrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    'selected-images',
  );
  return base.toLowerCase().endsWith('.zip') ? base : `${base}.zip`;
};

const makeUniqueFilenames = (entries) => {
  const seen = new Map();
  return entries.map(entry => {
    const filename = entry.filename || 'image.png';
    const dotIndex = filename.lastIndexOf('.');
    const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
    const ext = dotIndex > 0 ? filename.slice(dotIndex) : '';
    const count = seen.get(filename) || 0;
    seen.set(filename, count + 1);
    if (count === 0) return entry;
    return {
      ...entry,
      filename: `${stem}-${String(count + 1).padStart(2, '0')}${ext}`,
    };
  });
};

let crcTable = null;

const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
};

export const crc32 = (bytes) => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = (date = new Date()) => {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11)
    | (date.getMinutes() << 5)
    | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9)
    | ((date.getMonth() + 1) << 5)
    | date.getDate();
  return { dosTime, dosDate };
};

const writeUint16 = (view, offset, value) => {
  view.setUint16(offset, value, true);
};

const writeUint32 = (view, offset, value) => {
  view.setUint32(offset, value >>> 0, true);
};

const assertZipSize = (size, label) => {
  if (size > ZIP_UINT32_MAX) {
    throw new Error(`${label} 超过 ZIP32 支持的大小`);
  }
};

const createLocalHeader = ({ nameBytes, crc, size, dosTime, dosDate }) => {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, ZIP_VERSION);
  writeUint16(view, 6, ZIP_UTF8_FLAG);
  writeUint16(view, 8, ZIP_STORE_METHOD);
  writeUint16(view, 10, dosTime);
  writeUint16(view, 12, dosDate);
  writeUint32(view, 14, crc);
  writeUint32(view, 18, size);
  writeUint32(view, 22, size);
  writeUint16(view, 26, nameBytes.length);
  writeUint16(view, 28, 0);
  header.set(nameBytes, 30);
  return header;
};

const createCentralHeader = ({ nameBytes, crc, size, offset, dosTime, dosDate }) => {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, ZIP_VERSION);
  writeUint16(view, 6, ZIP_VERSION);
  writeUint16(view, 8, ZIP_UTF8_FLAG);
  writeUint16(view, 10, ZIP_STORE_METHOD);
  writeUint16(view, 12, dosTime);
  writeUint16(view, 14, dosDate);
  writeUint32(view, 16, crc);
  writeUint32(view, 20, size);
  writeUint32(view, 24, size);
  writeUint16(view, 28, nameBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, offset);
  header.set(nameBytes, 46);
  return header;
};

const createEndRecord = ({ entryCount, centralSize, centralOffset }) => {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralSize);
  writeUint32(view, 16, centralOffset);
  writeUint16(view, 20, 0);
  return record;
};

export const createZipBlob = async (entries) => {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const { dosTime, dosDate } = getDosDateTime(now);
  const uniqueEntries = makeUniqueFilenames(entries || []);

  for (const entry of uniqueEntries) {
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const nameBytes = encoder.encode(sanitizeFilenamePart(entry.filename, 'image'));
    assertZipSize(bytes.length, entry.filename);
    assertZipSize(offset, 'ZIP 偏移');

    const crc = crc32(bytes);
    const localHeader = createLocalHeader({
      nameBytes,
      crc,
      size: bytes.length,
      dosTime,
      dosDate,
    });
    const centralHeader = createCentralHeader({
      nameBytes,
      crc,
      size: bytes.length,
      offset,
      dosTime,
      dosDate,
    });

    localParts.push(localHeader, bytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + bytes.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  assertZipSize(centralOffset, 'ZIP central directory 偏移');
  assertZipSize(centralSize, 'ZIP central directory 大小');

  const endRecord = createEndRecord({
    entryCount: uniqueEntries.length,
    centralSize,
    centralOffset,
  });
  return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
};

const downloadMediaAsZip = async (items, defaultNamePrefix, options = {}) => {
  const entries = [];
  let skipped = 0;

  for (const [index, item] of items.entries()) {
    const { url } = item;
    try {
      const blob = await fetchMediaAsBlob(url);
      const ext = guessMediaExtension(url, blob.type);
      entries.push({
        filename: getMediaFilename(item, defaultNamePrefix, index, ext),
        blob,
      });
    } catch (error) {
      skipped += 1;
      console.warn(`[downloadMedia] 跳过 ${url?.slice(0, 60)}...: ${error?.message || error}`);
    }
  }

  if (entries.length === 0) {
    return { mode: 'zip', downloaded: 0, skipped };
  }

  const zipBlob = await createZipBlob(entries);
  downloadBlob(zipBlob, ensureZipFilename(options.zipFilename, defaultNamePrefix));
  return { mode: 'zip', downloaded: entries.length, skipped };
};

const downloadImagesAsZip = downloadMediaAsZip;

/**
 * 批量下载图片。
 * 默认逐个下载；传入 { zip: true } 时打包成一个 ZIP 文件下载。
 */
export const downloadImages = async (items, defaultNamePrefix = 'image', options = {}) => {
  const validItems = (items || []).filter(item => item?.url);
  if (validItems.length === 0) {
    return { mode: 'none', downloaded: 0, skipped: 0 };
  }

  if (options.zip) {
    return downloadImagesAsZip(validItems, defaultNamePrefix, options);
  }

  let index = 0;
  let skipped = 0;
  for (const item of validItems) {
    const { url, filename: baseFilename } = item;
    try {
      const blob = await fetchImageAsBlob(url);
      const ext = guessImageExtension(url, blob.type);
      const filename = getImageFilename({ filename: baseFilename }, defaultNamePrefix, index, ext);
      downloadBlob(blob, filename);
      index += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`[downloadImages] 跳过 ${url?.slice(0, 60)}...: ${error?.message || error}`);
    }
  }
  return { mode: 'multiple', downloaded: index, skipped };
};

export const downloadMedia = async (items, defaultNamePrefix = 'media', options = {}) => {
  const validItems = (items || []).filter(item => item?.url);
  if (validItems.length === 0) {
    return { mode: 'none', downloaded: 0, skipped: 0 };
  }

  if (options.zip) {
    return downloadMediaAsZip(validItems, defaultNamePrefix, options);
  }

  let index = 0;
  let skipped = 0;
  for (const item of validItems) {
    const { url, filename: baseFilename } = item;
    try {
      const blob = await fetchMediaAsBlob(url);
      const ext = guessMediaExtension(url, blob.type);
      const filename = getMediaFilename({ filename: baseFilename }, defaultNamePrefix, index, ext);
      downloadBlob(blob, filename);
      index += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`[downloadMedia] 跳过 ${url?.slice(0, 60)}...: ${error?.message || error}`);
    }
  }
  return { mode: 'multiple', downloaded: index, skipped };
};
