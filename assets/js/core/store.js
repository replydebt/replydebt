// Optional IndexedDB key-value store for opted-in action lists (never raw messages or emails).
import { DB_NAME } from '../config.js';

const LEGACY_DB_NAMES = ['reply-debt', 'network-xray'];
const STORE = 'kv';
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        dbPromise = null;
        reject(new Error('IndexedDB blocked'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const req = fn(s);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function deleteDb(name) {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    try {
      const q = indexedDB.deleteDatabase(name);
      q.onsuccess = q.onerror = q.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export const store = {
  async get(key) {
    try { return await tx('readonly', (s) => s.get(key)); } catch { return undefined; }
  },
  async set(key, value) {
    try { await tx('readwrite', (s) => s.put(value, key)); return true; } catch { return false; }
  },
  async del(key) {
    try { await tx('readwrite', (s) => s.delete(key)); } catch { /* ignore */ }
  },
  async clearAll() {
    try { await tx('readwrite', (s) => s.clear()); } catch { /* ignore */ }
    try {
      if (dbPromise) (await dbPromise).close();
    } catch { /* ignore */ }
    dbPromise = null;
    await Promise.all([deleteDb(DB_NAME), ...LEGACY_DB_NAMES.map(deleteDb)]);
  },
};
