/** 基于 IndexedDB 的本地存储，容量远大于 localStorage（通常几百 MB） */

const DB_NAME = 'ai-canvas';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** 读取一个 key，返回解析后的 JSON，失败返回 fallback */
export async function getItem(key, fallback = null) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const raw = req.result;
        if (raw == null) return resolve(fallback);
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      };
      req.onerror = () => resolve(fallback);
    });
  } catch {
    // IndexedDB 不可用时回退到 localStorage
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
}

/** 写入一个 key（value 会被 JSON.stringify） */
export async function setItem(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(JSON.stringify(value), key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 回退到 localStorage
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch { /* 忽略 */ }
  }
}
