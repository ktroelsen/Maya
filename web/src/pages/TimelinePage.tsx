import { Link } from 'react-router';
import { cached, fetchTopic, formatYear, type Timeline, type Topic } from '../api';
import Status from '../components/Status';
import { useLoad } from '../useLoad';

const periodColors = ['bg-muted', 'bg-ochre', 'bg-accent', 'bg-blue', 'bg-jade'];

// Periods and events in order. (A zoomable SVG timeline in codex style comes later.)
export default function TimelinePage() {
  const [data, error] = useLoad(
    () => Promise.all([cached<Timeline>('/api/topic/timeline'), fetchTopic()]),
    'timeline',
  );
  if (!data) return <Status error={error} />;
  const [timeline, topic] = data as [Timeline, Topic];
  const titleOf = (id?: string) => topic.chapters.find((c) => c.id === id);

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-semibold">Tidslinje</h1>
      <ol className="space-y-8">
        {timeline.periods.map((p, i) => {
          const events = timeline.events.filter((e) => e.year >= p.from && e.year < p.to).sort((a, b) => a.year - b.year);
          return (
            <li key={p.id}>
              <div className="mb-3 flex items-center gap-3">
                <span className={`h-4 w-4 rounded-full ${periodColors[i % periodColors.length]}`} />
                <h2 className="text-lg font-semibold">{p.label}</h2>
                <span className="text-sm text-muted">
                  {formatYear(p.from)} – {p.to >= new Date().getFullYear() ? 'i dag' : formatYear(p.to)}
                </span>
              </div>
              {events.length > 0 && (
                <ol className="ml-2 space-y-3 border-l-2 border-line pl-5">
                  {events.map((e) => {
                    const chapter = titleOf(e.chapter);
                    return (
                      <li key={`${e.year}-${e.label}`}>
                        <span className="font-serif font-semibold text-accent tabular-nums">{formatYear(e.year)}</span>
                        <p>{e.label}</p>
                        {chapter && (
                          <Link to={`/kapitel/${chapter.id}`} className="text-sm text-blue underline">
                            Kapitel {chapter.number}: {chapter.title}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
