import { Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { mediaUrl } from '../api';
import { useWakeLock } from '../wakeLock';

type Slide = { src: string; alt: string; caption: string | null };

type Props = {
  slide: Slide;
  text: string; // the sentence being read (or the caption)
  playing: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
};

// The slideshow on the whole screen: the section's picture with the sentence being read under it.
// Uses the browser's full screen where it can (not on iPhone, which only allows it for video);
// otherwise – and as the installed app – it simply covers the whole window. Keeps the screen on.
export default function FullscreenSlideshow({ slide, text, playing, canPrev, canNext, onPlay, onPause, onPrev, onNext, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useWakeLock(true);

  useEffect(() => {
    const el = root.current;
    if (el?.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    // Leaving the browser's full screen (Esc, back gesture) closes the slideshow too.
    const onChange = () => !document.fullscreenElement && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const button = 'grid place-items-center rounded-full text-white/80 hover:text-white disabled:opacity-30';
  return (
    <div
      ref={root}
      role="dialog"
      aria-label="Billedshow i fuld skærm"
      className="fixed inset-0 z-50 flex flex-col bg-[#14110f] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white landscape:flex-row landscape:items-center landscape:gap-6"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center landscape:h-full">
        <img key={slide.src} src={mediaUrl(slide.src)} alt={slide.alt} className="fade-in max-h-full max-w-full rounded-lg object-contain" />
      </div>
      <div className="mt-4 flex shrink-0 flex-col landscape:mt-0 landscape:w-2/5">
        <p className="min-h-[4lh] font-serif text-xl leading-snug md:text-2xl" aria-live="polite">
          {text}
        </p>
        <div className="mt-3 flex items-center justify-center gap-6">
          <button onClick={onPrev} disabled={!canPrev} aria-label="Forrige sætning" className={`${button} h-12 w-12`}>
            <SkipBack className="h-7 w-7" />
          </button>
          <button
            onClick={playing ? onPause : onPlay}
            aria-label={playing ? 'Pause' : 'Læs op'}
            className="grid h-16 w-16 place-items-center rounded-full bg-accent text-on-accent"
          >
            {playing ? <Pause className="h-8 w-8" fill="currentColor" /> : <Play className="ml-1 h-8 w-8" fill="currentColor" />}
          </button>
          <button onClick={onNext} disabled={!canNext} aria-label="Næste sætning" className={`${button} h-12 w-12`}>
            <SkipForward className="h-7 w-7" />
          </button>
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Luk fuld skærm"
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 rounded-full bg-black/50 p-2 text-white"
      >
        <X className="h-6 w-6" />
      </button>
    </div>
  );
}
