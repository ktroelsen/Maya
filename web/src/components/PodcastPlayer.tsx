import { Headphones } from 'lucide-react';
import { mediaUrl, type Podcast } from '../api';
import { engine } from '../speech/settings';

// A podcast episode: the browser's own audio player (lock-screen controls, seeking and
// background play come for free). Starting it stops any read-aloud.
export default function PodcastPlayer({ podcast }: { podcast: Podcast }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-start gap-3">
        <Headphones className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h3 className="font-semibold">{podcast.title}</h3>
          {podcast.description && <p className="mt-0.5 text-sm text-muted">{podcast.description}</p>}
        </div>
      </div>
      <audio controls preload="metadata" src={mediaUrl(podcast.src)} onPlay={() => engine.cancel()} className="w-full">
        Din browser kan ikke afspille lyd.
      </audio>
    </div>
  );
}
