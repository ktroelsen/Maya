import type { VisionAnswer } from './api';

// The guide's answers, kept on this device (there is no login): the photo, the question and
// the answer, so they can be looked at again later – also offline. Stored in IndexedDB, which
// can hold the photos as blobs. Each entry carries its topic, so topics keep their own list.
export type GuideEntry = {
  id: string;
  topic: string;
  createdAt: number;
  mode: 'object' | 'sign';
  question: string;
  answer: VisionAnswer;
  photo: Blob;
};

const DbName = 'guide';
const Store = 'answers';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DbName, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(Store, { keyPath: 'id' });
      store.createIndex('topic', 'topic');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(Store, mode);
      const req = work(tx.objectStore(Store));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const guideHistorySupported = () => typeof indexedDB !== 'undefined';

/** This topic's saved answers, newest first. */
export async function listEntries(topic: string): Promise<GuideEntry[]> {
  const all = await run<GuideEntry[]>('readonly', (s) => s.index('topic').getAll(topic));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveEntry(entry: Omit<GuideEntry, 'id' | 'createdAt'>): Promise<GuideEntry> {
  const saved: GuideEntry = { ...entry, id: crypto.randomUUID?.() ?? String(Date.now()), createdAt: Date.now() };
  await run('readwrite', (s) => s.put(saved));
  // Ask the browser to keep our storage when space runs low (may be ignored).
  void navigator.storage?.persist?.().catch(() => false);
  return saved;
}

export const deleteEntry = (id: string) => run('readwrite', (s) => s.delete(id));
