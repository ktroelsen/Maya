import { Pause, Play, SkipBack, SkipForward, SlidersHorizontal } from 'lucide-react';
import type { PlayerState } from '../speech/usePlayer';

type Props = {
  index: number;
  count: number;
  state: PlayerState;
  error: string | null;
  rate: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (index: number) => void;
  onSettings: () => void;
};

// The bar at the bottom of the reader: progress, back/play/forward, and voice settings.
export default function Player({ index, count, state, error, rate, onPlay, onPause, onSeek, onSettings }: Props) {
  const playing = state === 'playing';
  return (
    <div className="border-t border-line bg-surface px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl">
        <input
          type="range"
          min={0}
          max={Math.max(0, count - 1)}
          value={index}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Position i teksten"
          className="h-2 w-full cursor-pointer accent-[var(--color-accent)]"
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="w-20 text-xs tabular-nums text-muted">
            {count ? `${index + 1} / ${count}` : '–'}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSeek(index - 1)}
              disabled={index === 0}
              aria-label="Forrige sætning"
              className="rounded-full p-3 text-muted hover:text-fg disabled:opacity-40"
            >
              <SkipBack className="h-6 w-6" />
            </button>
            <button
              onClick={playing ? onPause : onPlay}
              disabled={count === 0}
              aria-label={playing ? 'Pause' : 'Læs op'}
              className="grid h-14 w-14 place-items-center rounded-full bg-accent text-on-accent shadow-lg transition hover:bg-accent-strong disabled:opacity-50"
            >
              {playing ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="ml-1 h-7 w-7" fill="currentColor" />}
            </button>
            <button
              onClick={() => onSeek(index + 1)}
              disabled={index >= count - 1}
              aria-label="Næste sætning"
              className="rounded-full p-3 text-muted hover:text-fg disabled:opacity-40"
            >
              <SkipForward className="h-6 w-6" />
            </button>
          </div>
          <button
            onClick={onSettings}
            aria-label="Stemme og hastighed"
            className="flex w-20 items-center justify-end gap-1.5 text-sm tabular-nums text-muted hover:text-fg"
          >
            {rate.toLocaleString('da-DK')}×
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>
        {state === 'error' && (
          <p className="mt-1 text-center text-sm text-danger">{error ?? 'Stemmen kunne ikke læse op. Prøv en anden stemme.'}</p>
        )}
      </div>
    </div>
  );
}
