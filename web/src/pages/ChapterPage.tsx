import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { cached, formatPeriod, type Chapter } from '../api';
import ChapterText from '../components/ChapterText';
import Figure from '../components/Figure';
import Player from '../components/Player';
import Quiz from '../components/Quiz';
import Status from '../components/Status';
import VoiceSheet from '../components/VoiceSheet';
import { chapterSegments } from '../speech/chapterText';
import { useVoiceSettings } from '../speech/settings';
import { usePlayer } from '../speech/usePlayer';
import { useLoad } from '../useLoad';

export default function ChapterPage() {
  const { id = '' } = useParams();
  const [chapter, error] = useLoad(() => cached<Chapter>(`/api/topic/chapters/${encodeURIComponent(id)}`), id);
  if (!chapter)
    return (
      <div className="h-full">
        <TopBar title="" />
        <Status error={error} />
      </div>
    );
  return <ChapterView key={chapter.id} chapter={chapter} />;
}

function TopBar({ title, number }: { title: string; number?: number }) {
  const navigate = useNavigate();
  return (
    <header className="border-b-2 border-accent/60 bg-surface pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2">
        <button onClick={() => navigate('/')} aria-label="Til kapitlerne" className="rounded-lg p-2 text-muted hover:text-fg">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          {number && <p className="text-xs text-muted">Kapitel {number}</p>}
          <h1 className="truncate font-semibold">{title}</h1>
        </div>
      </div>
    </header>
  );
}

function ChapterView({ chapter }: { chapter: Chapter }) {
  // The title is read aloud too: it is the first heading of the text.
  const segments = useMemo(() => chapterSegments(`# ${chapter.title}\n\n${chapter.markdown}`), [chapter]);
  const [voice, setVoice] = useVoiceSettings();
  const player = usePlayer(segments, voice, 0, chapter.title);
  const [showVoices, setShowVoices] = useState(false);
  const [hero, ...moreImages] = chapter.images;
  const reading = player.state === 'playing' || player.index > 0;

  return (
    <div className="flex h-full flex-col">
      <TopBar title={chapter.title} number={chapter.number} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <article className="mx-auto max-w-3xl px-5 py-6">
          {hero && <Figure image={hero} className="mb-6" />}
          {chapter.period && <p className="mb-1 text-sm font-medium text-blue">{formatPeriod(chapter.period)}</p>}
          {!player.supported && (
            <p className="mb-4 rounded-xl bg-surface p-3 text-sm text-danger">Denne browser kan ikke læse op.</p>
          )}
          <ChapterText segments={segments} current={player.index} active={reading} onSelect={player.seek} />

          {moreImages.map((img) => (
            <Figure key={img.src} image={img} className="my-6" />
          ))}

          {chapter.quiz.length > 0 && <Quiz questions={chapter.quiz} />}

          {chapter.sources.length > 0 && (
            <section className="mt-10 text-sm">
              <h2 className="mb-2 font-semibold text-muted">Kilder</h2>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                {chapter.sources.map((s) => (
                  <li key={s.title}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-fg">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <nav className="mt-10 grid grid-cols-2 gap-3">
            {chapter.prev ? <NavCard to={chapter.prev.id} label="Forrige" title={chapter.prev.title} back /> : <span />}
            {chapter.next && <NavCard to={chapter.next.id} label="Næste" title={chapter.next.title} />}
          </nav>
        </article>
      </main>

      <Player
        index={player.index}
        count={segments.length}
        state={player.state}
        error={player.error}
        rate={voice.rate}
        onPlay={player.play}
        onPause={player.pause}
        onSeek={player.seek}
        onSettings={() => setShowVoices(true)}
      />
      {showVoices && <VoiceSheet settings={voice} onChange={setVoice} onClose={() => setShowVoices(false)} />}
    </div>
  );
}

function NavCard({ to, label, title, back }: { to: string; label: string; title: string; back?: boolean }) {
  return (
    <Link
      to={`/kapitel/${to}`}
      className={`flex min-h-16 items-center gap-2 rounded-xl border border-line bg-surface p-3 hover:border-accent ${back ? '' : 'col-start-2 justify-end text-right'}`}
    >
      {back && <ChevronLeft className="h-5 w-5 shrink-0 text-accent" />}
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block truncate font-medium">{title}</span>
      </span>
      {!back && <ChevronRight className="h-5 w-5 shrink-0 text-accent" />}
    </Link>
  );
}
