// The one thing the player needs from a text-to-speech backend: speak one short piece of
// text and say how it ended. Two implementations: the browser's built-in voices
// (WebSpeechEngine) and Google Cloud's Chirp 3 HD voices via our server (GoogleSpeechEngine),
// which plays real audio and so keeps going on a locked phone screen.
export type SpeakResult = 'end' | 'cancel' | 'error';

export type Voice = { id: string; name: string; lang: string; local: boolean };

export type SpeakOptions = { voiceId: string | null; rate: number };

/**
 * How a track ended: like SpeakResult, or 'fallback' when streaming doesn't work here at all
 * (nothing was played), so the player should read sentence by sentence instead.
 */
export type TrackResult = SpeakResult | 'fallback';

/** A whole text playing as one continuous recording. */
export interface Track {
  readonly done: Promise<TrackResult>;
  pause(): void;
  resume(): void;
  setRate(rate: number): void;
}

export interface SpeechEngine {
  readonly supported: boolean;
  /** Available voices, Danish first. May be empty until the browser has loaded them. */
  voices(): Voice[];
  /** Calls back when the voice list changes (browsers load voices asynchronously). */
  onVoicesChanged(cb: () => void): () => void;
  /** Speaks one piece of text. Must be called from a user gesture the first time (iOS). */
  speak(text: string, options: SpeakOptions): Promise<SpeakResult>;
  /** Stops speaking at once; a pending speak() resolves with 'cancel'. */
  cancel(): void;
  /**
   * Call from a tap when speech will start later without one (e.g. when a chat answer
   * arrives): iOS only lets a page speak after it has spoken inside a user gesture.
   */
  prime(): void;
  /** Hint: these texts come next, start preparing them (cloud voices fetch audio ahead). */
  prefetch?(texts: string[], options: SpeakOptions): void;
  /**
   * Plays the texts as one continuous track (a cloud voice), so a phone keeps reading with the
   * screen off. onIndex reports the text being read, while the page is visible. Call from a tap.
   */
  stream?(texts: string[], options: SpeakOptions, onIndex: (index: number) => void): Track;
  /** Why the last speak() or track ended in 'error', for the user. */
  readonly lastError?: string | null;
}
