import { useEffect, useState, useSyncExternalStore } from 'react';

// Keeps the screen on while active (reading aloud, the user's "keep the screen on", full screen):
// on phones the browser stops speaking when the screen locks. Returns whether the lock is held
// (not supported everywhere, e.g. older iOS).
export function useWakeLock(active: boolean) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (cancelled) return void l.release();
          lock = l;
          setHeld(true);
          l.addEventListener('release', () => {
            lock = null;
            setHeld(false);
          });
        })
        .catch(() => setHeld(false));
    void acquire();
    // The lock is dropped whenever the tab is hidden; take it again on return.
    const onVisible = () => document.visibilityState === 'visible' && !lock && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
      lock = null;
    };
  }, [active]);
  return held;
}

/** Whether the screen lock (Wake Lock API) exists in this browser at all. */
export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

// The user's "keep the screen on" choice: on for the whole app while it is open. Per device.
const Key = 'app.keepAwake';
const listeners = new Set<() => void>();
let keepAwake = (() => {
  try {
    return localStorage.getItem(Key) === '1';
  } catch {
    return false;
  }
})();

export function setKeepAwake(on: boolean) {
  keepAwake = on;
  try {
    localStorage.setItem(Key, on ? '1' : '0');
  } catch {
    /* this session only */
  }
  listeners.forEach((l) => l());
}

export function useKeepAwake() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => keepAwake,
  );
}
