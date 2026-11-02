import { useEffect, useSyncExternalStore } from 'react';
import { fetchTopic } from './api';

// The topic's name, for the top bar, the browser tab and the lock screen. Nothing about a
// particular topic is written in the code; until the topic has loaded, the page's own title
// (index.html) is used.
let name = typeof document !== 'undefined' ? document.title : '';
const listeners = new Set<() => void>();
void fetchTopic()
  .then((t) => {
    name = t.title;
    listeners.forEach((l) => l());
  })
  .catch(() => {});

export const topicName = () => name;

export function useTopicName() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => name,
  );
}

/** Sets the browser tab title: "<page> – <topic>" (or just the topic). */
export function usePageTitle(page?: string | null) {
  const topic = useTopicName();
  useEffect(() => {
    document.title = page ? `${page} – ${topic}` : topic;
  }, [page, topic]);
}
