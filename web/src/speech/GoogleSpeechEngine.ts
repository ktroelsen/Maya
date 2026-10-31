import { api, ApiError, problemDetail } from '../api';
import type { SpeakOptions, SpeakResult, SpeechEngine, Track, TrackResult, Voice } from './SpeechEngine';

// Google Cloud's Danish Chirp 3 HD voices (the key stays on the server), on one shared
// <audio> element. Short texts (chat answers, previews) are fetched sentence by sentence from
// POST /api/tts, the next ones ahead, so there are no gaps. The reader plays a whole text as
// one track from /api/tts/stream: a single long recording is what a phone keeps playing with
// the screen off, while starting a new clip after every sentence is often not allowed then.
// Speed is the element's playbackRate, so one (server-cached) recording serves every speed.
export class GoogleSpeechEngine implements SpeechEngine {
  readonly supported = typeof Audio !== 'undefined';
  lastError: string | null = null;

  private audio: HTMLAudioElement | null = this.supported ? new Audio() : null;
  private clips = new Map<string, Promise<string>>(); // voice|text → object URL, oldest first
  private run = 0;
  private settle: ((r: TrackResult) => void) | null = null;
  private streaming = false;
  private unlocked = false;
  private voiceList: Voice[] = [];
  private voicesLoading: Promise<void> | null = null;
  private listeners = new Set<() => void>();

  voices(): Voice[] {
    void this.loadVoices();
    return this.voiceList;
  }

  onVoicesChanged(cb: () => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  loadVoices() {
    this.voicesLoading ??= api<{ id: string; name: string; gender: string }[]>('/api/tts/voices')
      .then((list) => {
        // `lang` carries the gender here; the sheet groups by it.
        this.voiceList = list.map((v) => ({ id: v.id, name: v.name, lang: v.gender, local: false }));
        this.listeners.forEach((cb) => cb());
      })
      .catch(() => {
        this.voicesLoading = null; // try again next time
      });
    return this.voicesLoading;
  }

  speak(text: string, { voiceId, rate }: SpeakOptions): Promise<SpeakResult> {
    if (!this.audio) return Promise.resolve('error');
    this.finish('cancel');
    this.audio.pause();
    if (!this.unlocked) this.prime(); // still inside the tap on the first call
    if (!voiceId) {
      this.lastError = 'Vælg en Google-stemme under stemme og hastighed.';
      return Promise.resolve('error');
    }

    const token = ++this.run;
    const audio = this.audio;
    return new Promise((resolve) => {
      this.settle = resolve as (r: TrackResult) => void; // a sentence never ends in 'fallback'
      this.clip(text, voiceId).then(
        (url) => {
          if (token !== this.run) return;
          this.streaming = false;
          audio.src = url;
          audio.playbackRate = rate;
          audio.preservesPitch = true;
          audio.onended = () => token === this.run && this.finish('end');
          audio.onerror = () => token === this.run && this.fail('Lyden kunne ikke afspilles.');
          audio.play().catch((err: DOMException) => {
            if (token !== this.run) return;
            this.fail(err.name === 'NotAllowedError' ? 'Browseren blokerede lyden. Tryk afspil igen.' : 'Lyden kunne ikke afspilles.');
          });
        },
        (err: Error) => token === this.run && this.fail(err.message),
      );
    });
  }

  prefetch(texts: string[], { voiceId }: SpeakOptions) {
    if (!voiceId) return;
    for (const t of texts) void this.clip(t, voiceId).catch(() => {});
  }

  stream(texts: string[], options: SpeakOptions, onIndex: (index: number) => void): Track {
    const audio = this.audio;
    this.finish('cancel');
    audio?.pause();
    if (audio && !this.unlocked) this.prime(); // inside the tap; the track only starts later
    const token = ++this.run;
    const live = () => token === this.run;
    const done = new Promise<TrackResult>((resolve) => (this.settle = resolve));
    const voice = options.voiceId;
    let rate = options.rate;
    const noTrack: Track = { done, pause() {}, resume() {}, setRate() {} };
    if (!audio) {
      this.finish('fallback');
      return noTrack;
    }
    if (!voice) {
      this.fail('Vælg en Google-stemme under stemme og hastighed.');
      return noTrack;
    }

    // The track playing now: the text it starts at, and where each sentence starts in it
    // (the server learns that while writing the track).
    let base = 0;
    let id = '';
    let starts: number[] = [];
    let complete = false;
    let failure: string | null = null;
    let lastStatus = 0;
    let current = -1;
    let played = false;
    let retryAt = -1;
    let retries = 0;
    let dropTimer = 0;

    const report = (i: number) => {
      if (i !== current) onIndex((current = i));
    };
    const sentenceAt = (time: number) => {
      let k = 0;
      while (k + 1 < starts.length && starts[k + 1] <= time) k++;
      return base + k;
    };
    const refresh = async () => {
      const of = id;
      lastStatus = Date.now();
      const status = await api<{ starts: number[]; done: boolean; error: string | null }>(`/api/tts/stream/${of}/status`);
      if (!live() || of !== id) return;
      ({ starts, done: complete, error: failure } = status);
    };

    const connect = async (from: number) => {
      base = from;
      id = '';
      starts = [];
      complete = false;
      failure = null;
      report(from);
      try {
        const created = await api<{ id: string }>('/api/tts/stream', { method: 'POST', json: { voice, texts: texts.slice(from) } });
        if (!live()) return;
        id = created.id;
        this.streaming = true;
        audio.src = `/api/tts/stream/${id}`;
        audio.playbackRate = rate;
        audio.preservesPitch = true;
        await audio.play();
      } catch (err) {
        if (!live()) return;
        if (err instanceof DOMException) {
          // A track that won't load rejects play() too; the error event deals with that.
          if (err.name === 'NotAllowedError') this.fail('Browseren blokerede lyden. Tryk afspil igen.');
          return;
        }
        if (!played) return this.finish('fallback');
        this.fail((err instanceof ApiError && err.detail) || 'Google-stemmen svarede ikke.');
      }
    };

    // The track ended or broke off. Its status tells which: all of it was played, the server
    // stopped it (daily limit, Google failing), or the connection dropped.
    const stopped = async (ended: boolean) => {
      if (!live() || !id) return;
      await refresh().catch(() => {});
      if (!live()) return;
      if (failure) return this.fail(failure);
      if (complete && ended) return this.finish('end');
      if (!played) return this.finish('fallback');
      const at = sentenceAt(audio.currentTime);
      if (at > retryAt) [retryAt, retries] = [at, 0];
      if (++retries > 2) return this.fail('Forbindelsen til Google-stemmen blev afbrudt. Tryk afspil for at fortsætte.');
      void connect(at);
    };

    audio.onplaying = () => {
      if (live() && this.streaming) played = true; // not the silent clip that primed the element
    };
    audio.onended = () => void stopped(true);
    audio.onerror = () => void stopped(false);
    // Follow along only while someone can see it, asking for newer starts once playback has
    // passed the last one we know of.
    audio.ontimeupdate = () => {
      if (!live() || !id || document.hidden) return;
      report(sentenceAt(audio.currentTime));
      const behind = starts.length === 0 || audio.currentTime >= starts[starts.length - 1];
      if (!complete && behind && Date.now() - lastStatus > 2000) void refresh().catch(() => {});
    };

    void connect(0);
    return {
      done,
      pause: () => {
        if (!live()) return;
        audio.pause();
        clearTimeout(dropTimer);
        // A long pause lets go of the track, so the server stops preparing more of it;
        // resuming starts a new one from the same sentence (cached, so free).
        dropTimer = window.setTimeout(() => {
          if (live() && this.dropTrack()) id = '';
        }, 30_000);
      },
      resume: () => {
        if (!live()) return;
        clearTimeout(dropTimer);
        if (!id) return void connect(current);
        audio.play().catch((err: DOMException) => {
          if (live() && err.name === 'NotAllowedError') this.fail('Browseren blokerede lyden. Tryk afspil igen.');
        });
      },
      setRate: (r: number) => {
        rate = r;
        if (live()) audio.playbackRate = r;
      },
    };
  }

  cancel() {
    this.run++;
    this.audio?.pause();
    this.dropTrack();
    this.finish('cancel');
  }

  // Playing a silent clip inside a tap unlocks the element, so later sentences — which only
  // start once their audio has been fetched — are allowed to play (iOS in particular).
  prime() {
    if (!this.audio || !this.audio.paused) return;
    // Something else is about to speak: a paused track gives up the element for good.
    if (this.streaming) this.cancel();
    this.audio.src = Silence;
    this.audio
      .play()
      .then(() => (this.unlocked = true))
      .catch(() => {});
  }

  // Closes a track's connection, which a merely paused element would keep open.
  private dropTrack() {
    if (!this.audio || !this.streaming) return false;
    this.streaming = false;
    this.audio.removeAttribute('src');
    this.audio.load();
    return true;
  }

  private clip(text: string, voiceId: string): Promise<string> {
    const key = `${voiceId}|${text}`;
    const hit = this.clips.get(key);
    if (hit) {
      // Move to the end: recently used clips are kept longest.
      this.clips.delete(key);
      this.clips.set(key, hit);
      return hit;
    }
    const pending = fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voiceId }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(problemDetail(await res.text()) ?? 'Google-stemmen svarede ikke.');
      return URL.createObjectURL(await res.blob());
    });
    pending.catch(() => this.clips.delete(key)); // a failure isn't cached
    this.clips.set(key, pending);
    while (this.clips.size > MaxClips) {
      const [oldest, url] = this.clips.entries().next().value!;
      this.clips.delete(oldest);
      void url.then(URL.revokeObjectURL, () => {});
    }
    return pending;
  }

  private fail(message: string) {
    this.lastError = message;
    this.finish('error');
  }

  private finish(result: TrackResult) {
    const settle = this.settle;
    this.settle = null;
    if (result !== 'error') this.lastError = null;
    settle?.(result);
  }
}

const MaxClips = 40;

// 44-byte WAV with no samples.
const Silence = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
