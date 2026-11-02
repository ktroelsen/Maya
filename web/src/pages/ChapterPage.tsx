import { ArrowLeft, ChevronLeft, ChevronRight, History, Images, MapPin, Maximize, ScrollText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { cached, formatPeriod, mediaUrl, type Chapter } from '../api';
import ChapterText from '../components/ChapterText';
import ExtraLinks from '../components/ExtraLinks';
import Figure from '../components/Figure';
import FullscreenSlideshow, { handOverFullscreen } from '../components/FullscreenSlideshow';
import KeepAwakeButton from '../components/KeepAwakeButton';
import OfflineBanner from '../components/OfflineBanner';
import Player from '../components/Player';
import PodcastPlayer from '../components/PodcastPlayer';
import Quiz from '../components/Quiz';
import Status from '../components/Status';
import VoiceSheet from '../components/VoiceSheet';
import { useOnline } from '../offline';
import { getProgress, saveProgress } from '../progress';
import { chapterContent } from '../speech/chapterText';
import { useReaderView } from '../readerView';
import { usePageTitle } from '../topicTitle';
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
      <OfflineBanner />
    </header>
  );
}

function ChapterView({ chapter }: { chapter: Chapter }) {
  usePageTitle(chapter.title);
  // The chapter number and title are read aloud too, so a new chapter announces itself.
  const { segments, figures } = useMemo(() => chapterContent(`### Kapitel ${chapter.number}\n\n# ${chapter.title}\n\n${chapter.markdown}`), [chapter]);
  const [view, setView] = useReaderView();
  const [voice, setVoice] = useVoiceSettings();
  // Start where this device left off (a finished chapter starts from the top again).
  const [start] = useState(() => {
    const p = getProgress(chapter.id);
    return p && !p.done && p.count === segments.length ? p.index : 0;
  });
  // Arriving from the previous chapter's full-screen slideshow: stay in full screen and read on.
  const location = useLocation();
  const navigate = useNavigate();
  const [carryOn] = useState(() => (location.state as { slideshow?: boolean } | null)?.slideshow === true);
  const [fullscreen, setFullscreen] = useState(carryOn);
  const fullscreenRef = useRef(fullscreen);
  fullscreenRef.current = fullscreen;

  // Read to the end in full screen: go on to the next chapter, still in full screen.
  const onEnd = useCallback(() => {
    if (!fullscreenRef.current || !chapter.next) return;
    handOverFullscreen();
    navigate(`/kapitel/${chapter.next.id}`, { state: { slideshow: true } });
  }, [chapter.next, navigate]);
  const player = usePlayer(segments, voice, carryOn ? 0 : start, chapter.title, onEnd);

  // Start reading at once (works where the browser allows sound without a new tap; otherwise
  // the play button is right there).
  const started = useRef(false);
  useEffect(() => {
    if (!carryOn || started.current) return;
    started.current = true;
    player.play();
    // Don't do it again when coming back to this chapter through the history.
    navigate(location.pathname, { replace: true, state: null });
  }, [carryOn, player, navigate, location.pathname]);
  const [finished, setFinished] = useState(false);
  const [showVoices, setShowVoices] = useState(false);
  const online = useOnline();
  const [hero, ...moreImages] = chapter.images;
  const reading = player.state === 'playing' || player.index > 0;
  const slideshow = view === 'pictures';
  const closeFullscreen = useCallback(() => setFullscreen(false), []);

  // The slideshow shows the picture of the section being read (before the first one: the hero).
  const paragraph = segments[player.index]?.paragraph ?? 0;
  const shownFigure = [...figures].reverse().find((f) => f.paragraph <= paragraph);
  const slide = shownFigure
    ? { src: shownFigure.src, alt: shownFigure.alt, caption: shownFigure.caption }
    : hero
      ? { src: hero.src, alt: hero.alt ?? '', caption: hero.caption }
      : null;

  // Remember the sentence; when the last one has been read, offer the next chapter.
  useEffect(() => saveProgress(chapter.id, player.index, segments.length), [chapter.id, player.index, segments.length]);
  useEffect(() => {
    if (player.state === 'playing' && player.index === segments.length - 1) setFinished(true);
  }, [player.state, player.index, segments.length]);

  return (
    <div className="flex h-full flex-col">
      <TopBar title={chapter.title} number={chapter.number} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        {slideshow && slide && (
          <div className="sticky top-0 z-10 border-b border-line bg-ink px-5 pt-4 pb-3 shadow-sm">
            <div className="mx-auto max-w-3xl">
              <div className="codex-frame bg-surface">
                <img key={slide.src} src={mediaUrl(slide.src)} alt={slide.alt} className="fade-in max-h-[45vh] w-full rounded-lg object-contain" />
              </div>
              <p className="mt-2 line-clamp-3 min-h-[3lh] font-serif text-base leading-snug md:text-lg" aria-live="polite">
                {reading ? segments[player.index]?.text : (slide.caption ?? '')}
              </p>
            </div>
          </div>
        )}
        <article className="mx-auto max-w-3xl px-5 py-6">
          {hero && !slideshow && <Figure image={hero} className="mb-6" />}
          <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1">
            {chapter.period && (
              <Link to={`/tidslinje?kapitel=${chapter.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue hover:underline">
                <History className="h-4 w-4" /> {formatPeriod(chapter.period)}
              </Link>
            )}
            {chapter.places.length > 0 && (
              <Link to={`/kort?kapitel=${chapter.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-blue hover:underline">
                <MapPin className="h-4 w-4" /> Se på kortet
              </Link>
            )}
          </div>
          {!player.supported && (
            <p className="mb-4 rounded-xl bg-surface p-3 text-sm text-danger">Denne browser kan ikke læse op.</p>
          )}
          <ChapterText
            segments={segments}
            figures={figures}
            current={player.index}
            active={reading}
            follow={reading && !slideshow}
            showFigures={!slideshow}
            onSelect={player.seek}
          />

          {moreImages.map((img) => (
            <Figure key={img.src} image={img} className="my-6" />
          ))}

          {chapter.podcasts.length > 0 && (
            <section className="mt-10 space-y-3">
              <h2 className="text-xl font-semibold text-accent">Lyt til podcasten</h2>
              {chapter.podcasts.map((p) => (
                <PodcastPlayer key={p.id} podcast={p} />
              ))}
            </section>
          )}

          {chapter.quiz.length > 0 && <Quiz questions={chapter.quiz} />}

          <ExtraLinks extras={chapter.extras ?? []} />

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

      {finished && player.state !== 'playing' && chapter.next && (
        <div className="border-t border-line bg-surface-2 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <p className="text-sm">Kapitlet er slut.</p>
            <Link
              to={`/kapitel/${chapter.next.id}`}
              className="flex min-h-11 items-center gap-1 rounded-full bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-strong"
            >
              Næste: {chapter.next.title} <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
      {!online && voice.provider === 'google' && (
        <p className="border-t border-line bg-surface-2 px-4 py-2 text-center text-sm">
          Google-stemmen kræver net.{' '}
          <button onClick={() => setVoice({ provider: 'browser' })} className="font-medium text-accent underline">
            Brug enhedens stemme
          </button>
        </p>
      )}
      <div className="flex items-center justify-center gap-1 border-t border-line bg-surface pt-2" role="group" aria-label="Visning under oplæsning">
        {(
          [
            ['follow', ScrollText, 'Følg teksten'],
            ['pictures', Images, 'Billedshow'],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            onClick={() => setView(value)}
            aria-pressed={view === value}
            className={`flex items-center gap-1.5 border px-3 py-1.5 text-sm first:rounded-l-full last:rounded-r-full ${
              view === value ? 'border-accent bg-accent text-on-accent' : 'border-line text-muted hover:text-fg'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
        {slide && (
          <button
            onClick={() => {
              setView('pictures');
              setFullscreen(true);
            }}
            aria-label="Billedshow i fuld skærm"
            title="Billedshow i fuld skærm"
            className="ml-1 rounded-lg p-2 text-muted hover:text-fg"
          >
            <Maximize className="h-5 w-5" />
          </button>
        )}
        <KeepAwakeButton />
      </div>
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
      {fullscreen && slide && (
        <FullscreenSlideshow
          slide={slide}
          text={reading ? (segments[player.index]?.text ?? '') : (slide.caption ?? chapter.title)}
          playing={player.state === 'playing'}
          canPrev={player.index > 0}
          canNext={player.index < segments.length - 1}
          onPlay={player.play}
          onPause={player.pause}
          onPrev={() => player.seek(player.index - 1)}
          onNext={() => player.seek(player.index + 1)}
          onClose={closeFullscreen}
        />
      )}
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
