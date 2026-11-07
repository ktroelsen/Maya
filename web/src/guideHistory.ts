import type { VisionAnswer } from './api';

// Answers the guide gave before they were shared on the server: they were kept on the phone in
// IndexedDB. The guide page hands them over to the server once (POST /api/guide) and then
// deletes them here.
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

export const deleteEntry = (id: string) => run('readwrite', (s) => s.delete(id));
