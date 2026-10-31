import { useCallback, useState } from 'react';
import { GoogleSpeechEngine } from './GoogleSpeechEngine';
import type { SpeakResult, SpeechEngine, Track } from './SpeechEngine';
import { WebSpeechEngine } from './WebSpeechEngine';

export type Provider = 'browser' | 'google';

// Who reads aloud, and how. Per device (the browser's voices differ per device anyway).
export type VoiceSettings = {
  provider: Provider;
  voiceId: string | null; // browser voice (voiceURI); null = the device's Danish default
  googleVoice: string | null; // e.g. "da-DK-Chirp3-HD-Kore"
  rate: number;
};

export const browserEngine = new WebSpeechEngine();
export const googleEngine = new GoogleSpeechEngine();

const engineFor = (s: VoiceSettings): SpeechEngine => (s.provider === 'google' ? googleEngine : browserEngine);
const optionsFor = (s: VoiceSettings) => ({ voiceId: s.provider === 'google' ? s.googleVoice : s.voiceId, rate: s.rate });

// One entry point for the whole app (chapter reader, voice previews), so whatever is
// speaking is stopped before something else starts — across both providers.
export const engine = {
  supported: (s: VoiceSettings) => engineFor(s).supported,
  speak(text: string, s: VoiceSettings): Promise<SpeakResult> {
    (s.provider === 'google' ? browserEngine : googleEngine).cancel();
    return engineFor(s).speak(text, optionsFor(s));
  },
  prefetch: (texts: string[], s: VoiceSettings) => engineFor(s).prefetch?.(texts, optionsFor(s)),
  /** Whether this reader can play a whole text as one track (keeps going with the screen off). */
  canStream: (s: VoiceSettings) => engineFor(s).stream !== undefined,
  stream(texts: string[], s: VoiceSettings, onIndex: (index: number) => void): Track {
    (s.provider === 'google' ? browserEngine : googleEngine).cancel();
    return engineFor(s).stream!(texts, optionsFor(s), onIndex);
  },
  lastError: (s: VoiceSettings) => engineFor(s).lastError ?? null,
  cancel() {
    browserEngine.cancel();
    googleEngine.cancel();
  },
  // Inside a tap, before speech that starts later (e.g. a chat answer): unlock both.
  prime() {
    browserEngine.prime();
    googleEngine.prime();
  },
};

const Key = 'maya.voice';
export const Rates = [0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
const Defaults: VoiceSettings = { provider: 'browser', voiceId: null, googleVoice: null, rate: 1 };

function load(): VoiceSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(Key) ?? 'null');
    if (saved && typeof saved.rate === 'number') return { ...Defaults, ...saved };
  } catch {
    /* private mode or corrupt value: use defaults */
  }
  return Defaults;
}

export function useVoiceSettings() {
  const [settings, setSettings] = useState(load);
  const update = useCallback((change: Partial<VoiceSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...change };
      try {
        localStorage.setItem(Key, JSON.stringify(next));
      } catch {
        /* not persisted; still applies for this session */
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}
