import { useSyncExternalStore } from 'react';
import { mediaUrl, type Chapter, type Topic } from './api';

// "Hent til offline": saves the whole topic (texts, timeline, map data, glossary, images,
// podcasts) and the app itself in the service worker's content cache, so it works at the
// exhibition without a network. The service worker serves them from there when offline.
const Cache = 'maya-content';
const ShellCache = 'maya-shell-v2';
const Key = 'maya.offline';

export type OfflineInfo = { savedAt: number; bytes: number; files: number };

export const offlineSupported = () => typeof window !== 'undefined' && 'caches' in window && 'serviceWorker' in navigator;

export function loadOfflineInfo(): OfflineInfo | null {
  try {
    return JSON.parse(localStorage.getItem(Key) ?? 'null');
  } catch {
    return null;
  }
}

/** Downloads everything; reports progress as (done, total). */
export async function downloadForOffline(onProgress: (done: number, total: number) => void): Promise<OfflineInfo> {
  // Ask the browser not to clear our storage when space runs low (iOS/Chrome may ignore it).
  await navigator.storage?.persist?.().catch(() => false);

  const getJson = async <T,>(url: string) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return (await res.json()) as T;
  };
  const topic = await getJson<Topic>('/api/topic');
  const chapterUrls = topic.chapters.map((c) => `/api/topic/chapters/${encodeURIComponent(c.id)}`);
  const chapters = await Promise.all(chapterUrls.map((u) => getJson<Chapter>(u)));

  const media = new Set<string>();
  if (topic.cover) media.add(mediaUrl(topic.cover));
  for (const c of chapters) for (const img of c.images) media.add(mediaUrl(img.src));
  for (const p of topic.podcasts) media.add(mediaUrl(p.src));

  const content = ['/api/health', '/api/topic', '/api/topic/timeline', '/api/topic/places', '/api/topic/glossary', ...chapterUrls, ...media];
  // The app itself: the page and the scripts/styles it is running on right now.
  const shell = [
    '/',
    '/manifest.webmanifest',
    ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (s) => s.src),
    ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet], link[rel=icon], link[rel=apple-touch-icon]'), (l) => l.href),
  ];

  const total = content.length + shell.length;
  let done = 0;
  let bytes = 0;
  const [contentCache, shellCache] = await Promise.all([caches.open(Cache), caches.open(ShellCache)]);
  const save = async (cache: globalThis.Cache, url: string, optional: boolean) => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      bytes += (await res.clone().blob()).size;
      await cache.put(url, res);
    } catch (err) {
      if (!optional) throw err; // e.g. a timeline file the topic doesn't have
    } finally {
      onProgress(++done, total);
    }
  };
  // A few at a time: fast, without flooding a phone's connection.
  const queue: [globalThis.Cache, string, boolean][] = [
    ...content.map((u): [globalThis.Cache, string, boolean] => [contentCache, u, u.startsWith('/api/topic/') && !u.includes('/chapters/')]),
    ...shell.map((u): [globalThis.Cache, string, boolean] => [shellCache, u, u !== '/']),
  ];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) await save(...item);
    }),
  );

  const info = { savedAt: Date.now(), bytes, files: total };
  try {
    localStorage.setItem(Key, JSON.stringify(info));
  } catch {
    /* the files are saved anyway */
  }
  return info;
}

// Online/offline, for the banner.
export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}
