import type { SpeakOptions, SpeakResult, SpeechEngine, Voice } from './SpeechEngine';

// The browser's own voices (Web Speech API). Free and offline, but the quality and the set
// of Danish voices depend on the device. Known quirks handled here and in the player:
//  - long utterances get cut off after ~15 s in Chrome → the player speaks one sentence at a time
//  - pause()/resume() is unreliable on Android → the player cancels and restarts the sentence
//  - an utterance object can be garbage-collected mid-speech, so its onend never fires →
//    keep a reference to the current one
export class WebSpeechEngine implements SpeechEngine {
  readonly supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private current: SpeechSynthesisUtterance | null = null;
  private settle: ((r: SpeakResult) => void) | null = null;

  voices(): Voice[] {
    if (!this.supported) return [];
    return speechSynthesis
      .getVoices()
      .map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }))
      .sort((a, b) => rank(a) - rank(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  }

  onVoicesChanged(cb: () => void) {
    if (!this.supported) return () => {};
    speechSynthesis.addEventListener('voiceschanged', cb);
    return () => speechSynthesis.removeEventListener('voiceschanged', cb);
  }

  speak(text: string, { voiceId, rate }: SpeakOptions): Promise<SpeakResult> {
    if (!this.supported) return Promise.resolve('error');
    this.finish('cancel');
    speechSynthesis.cancel();

    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === voiceId) ?? defaultVoice();
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'da-DK';
      u.rate = rate;
      u.onend = () => this.finish('end', u);
      u.onerror = (e) => this.finish(e.error === 'interrupted' || e.error === 'canceled' ? 'cancel' : 'error', u);
      this.current = u;
      this.settle = resolve;
      speechSynthesis.speak(u);
      // Chrome sometimes starts out paused after a cancel(); nudging it is harmless elsewhere.
      if (speechSynthesis.paused) speechSynthesis.resume();
    });
  }

  cancel() {
    this.finish('cancel');
    if (this.supported) speechSynthesis.cancel();
  }

  // A silent, empty utterance is enough to unlock speech on iOS. Skipped while something is
  // speaking (then it is unlocked already, and we mustn't interrupt it).
  prime() {
    if (!this.supported || speechSynthesis.speaking) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    speechSynthesis.speak(u);
  }

  // Resolve the pending speak() once; events from an older utterance are ignored.
  private finish(result: SpeakResult, from?: SpeechSynthesisUtterance) {
    if (from && from !== this.current) return;
    const settle = this.settle;
    this.settle = null;
    this.current = null;
    settle?.(result);
  }
}

const rank = (v: Voice) => (v.lang.toLowerCase().startsWith('da') ? 0 : v.lang.toLowerCase().startsWith('en') ? 1 : 2);

function defaultVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().startsWith('da') && v.default)
    ?? voices.find((v) => v.lang.toLowerCase().startsWith('da'));
}
