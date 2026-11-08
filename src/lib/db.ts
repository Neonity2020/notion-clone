import type { Page } from '../types';

/** Minimal promise wrapper around IndexedDB. One object store: pages (keyPath id). */
const DB_NAME = 'notion-clone';
const DB_VERSION = 1;
const STORE = 'pages';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function loadAllPages(): Promise<Page[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as Page[]);
    req.onerror = () => reject(req.error);
  });
}

export async function loadPages(ids: string[]): Promise<(Page | undefined)[]> {
  const db = await openDB();
  const store = db.transaction(STORE, 'readonly').objectStore(STORE);
  return Promise.all(
    ids.map(
      (id) =>
        new Promise<Page | undefined>((resolve, reject) => {
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result as Page | undefined);
          req.onerror = () => reject(req.error);
        }),
    ),
  );
}

export async function writePages(put: Page[], del: string[]): Promise<void> {
  if (!put.length && !del.length) return;
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const p of put) store.put(p);
  for (const id of del) store.delete(id);
  await done(tx);
}

export async function clearAll(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await done(tx);
}
