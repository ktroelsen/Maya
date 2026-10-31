import { useCallback, useEffect, useRef, useState } from 'react';
import type { Segment } from './segments';
import { engine, type VoiceSettings } from './settings';
import type { SpeakResult, Track } from './SpeechEngine';

export type PlayerState = 'idle' | 'playing' | 'error';

// Plays the text from a sentence on. A reader that can stream (the Google voice) plays it as
// one continuous track, which goes on with the screen off; otherwise sentence by sentence,
// where pausing cancels the current sentence and resuming starts it again (the only behaviour
// that works the same in every browser). Each run gets a token, so a run that was superseded
// (pause, seek, new settings) quietly stops.
export function usePlayer(segments: Segment[], settings: VoiceSettings, initialIndex = 0, title = '') {
  const [index, setIndex] = useState(() => clamp(initialIndex, segments.length));
  const [state, setState] = useState<PlayerState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const run = useRef(0);
  const track = useRef<Track | null>(null); // also kept while the track is paused
  const noStream = useRef(false); // streaming failed here once: read sentence by sentence
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // The browser voice dies with the screen, and so may the Google voice sentence by sentence
  // (a hidden page often may not start the next clip), so keep the screen on. A track is one
  // long recording that the phone plays on with the screen off.
  const wakeLock = useWakeLock(state === 'playing' && !streaming);

  const playFrom = useCallback(
    async (start: number) => {
      const token = ++run.current;
      track.current = null;
      setStreaming(false);
      setState('playing');
      setError(null);
      const from = clamp(start, segments.length);
      setIndex(from);
      const s = settingsRef.current;
      const stop = (result: SpeakResult) => {
        if (result === 'error') {
          setError(engine.lastError(s) ?? 'Stemmen kunne ikke læse op. Prøv en anden stemme.');
          return setState('error');
        }
        setState('idle');
        if (result === 'end') setIndex(0);
      };

      if (engine.canStream(s) && !noStream.current) {
        // Started synchronously inside the click handler, as iOS requires.
        const t = engine.stream(segments.slice(from).map((x) => x.text), s, (i) => token === run.current && setIndex(from + i));
        track.current = t;
        setStreaming(true);
        const result = await t.done;
        if (token !== run.current) return;
        track.current = null;
        setStreaming(false);
        if (result !== 'fallback') return stop(result);
        noStream.current = true; // nothing was played: read it sentence by sentence instead
      }

      for (let i = from; i < segments.length; i++) {
        setIndex(i);
        // The first speak() runs synchronously inside the click handler, as iOS requires.
        const speaking = engine.speak(segments[i].text, s);
        engine.prefetch(segments.slice(i + 1, i + 3).map((x) => x.text), s);
        const result = await speaking;
        if (token !== run.current) return;
        if (result !== 'end') return stop(result);
      }
      stop('end');
    },
    [segments],
  );

  // Lets go of a paused track, so the next play starts afresh.
  const dropTrack = useCallback(() => {
    if (!track.current) return;
    run.current++;
    track.current = null;
    setStreaming(false);
    engine.cancel();
  }, []);

  // A track pauses where it is and resumes from there; sentence by sentence, pausing stops.
  const pause = useCallback(() => {
    if (track.current) track.current.pause();
    else {
      run.current++;
      engine.cancel();
    }
    setState('idle');
  }, []);

  const play = useCallback(() => {
    if (!track.current) return void playFrom(index);
    track.current.resume();
    setState('playing');
  }, [playFrom, index]);

  const seek = useCallback(
    (i: number) => {
      const target = clamp(i, segments.length);
      if (state === 'playing') return void playFrom(target);
      dropTrack();
      setIndex(target);
    },
    [playFrom, dropTrack, segments.length, state],
  );

  // New reader or voice: restart the current sentence with it. A new speed applies to a
  // track as it plays; sentence by sentence it restarts the sentence too.
  const { provider, voiceId, googleVoice, rate } = settings;
  const playing = state === 'playing';
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (playing) void playFrom(indexRef.current);
    else dropTrack();
  }, [provider, voiceId, googleVoice]); // only on a settings change, not on every sentence
  useEffect(() => {
    if (track.current) track.current.setRate(rate);
    else if (playing) void playFrom(indexRef.current);
  }, [rate]);

  // Lock-screen / headset controls. They only show while real audio plays (the Google voice).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title, artist: 'Mayaerne' });
    session.playbackState = playing ? 'playing' : 'paused';
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', play],
      ['pause', pause],
      ['previoustrack', () => seek(indexRef.current - 1)],
      ['nexttrack', () => seek(indexRef.current + 1)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* action not supported by this browser */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* see above */
        }
      }
    };
  }, [title, playing, play, pause, seek]);

  // Leaving the page stops the voice.
  useEffect(
    () => () => {
      run.current++;
      engine.cancel();
    },
    [],
  );

  return { index, state, error, play, pause, seek, wakeLock, supported: engine.supported(settings) };
}

const clamp = (i: number, length: number) => (length === 0 ? 0 : Math.min(Math.max(0, i), length - 1));

// Keeps the screen on while reading: on phones the browser stops speaking when the screen
// locks. Returns whether the lock is held (not supported everywhere, e.g. older iOS).
function useWakeLock(active: boolean) {
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
