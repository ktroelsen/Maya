import { useSyncExternalStore } from 'react';

// How far the reader got, per chapter, on this device (no login, so no server-side progress).
export type ChapterProgress = { index: number; count: number; done: boolean; updated: number };
type Progress = Record<string, ChapterProgress>;

const Key = 'maya.progress';
const listeners = new Set<() => void>();
let current: Progress = load();

function load(): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(Key) ?? '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

function save(next: Progress) {
  current = next;
  try {
    localStorage.setItem(Key, JSON.stringify(next));
  } catch {
    /* private mode: kept for this session only */
  }
  listeners.forEach((l) => l());
}

/** Remember the sentence reached; reaching the last sentence marks the chapter as read. */
export function saveProgress(chapterId: string, index: number, count: number) {
  const before = current[chapterId];
  const done = (before?.done ?? false) || (count > 0 && index >= count - 1);
  if (before && before.index === index && before.done === done) return;
  save({ ...current, [chapterId]: { index, count, done, updated: Date.now() } });
}

export function getProgress(chapterId: string): ChapterProgress | undefined {
  return current[chapterId];
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** The chapter last read and not finished, if any. */
export function lastUnfinished(progress: Progress): string | undefined {
  return Object.entries(progress)
    .filter(([, p]) => !p.done && p.index > 0)
    .sort(([, a], [, b]) => b.updated - a.updated)[0]?.[0];
}
