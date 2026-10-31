import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { fetchTopic, formatPeriod, mediaUrl } from '../api';
import Status from '../components/Status';
import { lastUnfinished, useProgress } from '../progress';
import { useLoad } from '../useLoad';

// The cover and the story line: all chapters in order.
export default function Home() {
  const [topic, error] = useLoad(fetchTopic, 'topic');
  const progress = useProgress();
  if (!topic) return <Status error={error} />;

  // Continue the chapter left half-read, else the first chapter not read yet.
  const resumeId = lastUnfinished(progress);
  const resume =
    topic.chapters.find((c) => c.id === resumeId) ?? topic.chapters.find((c) => !progress[c.id]?.done);
  const started = topic.chapters.some((c) => progress[c.id]);
  const readCount = topic.chapters.filter((c) => progress[c.id]?.done).length;

  return (
    <div>
      {topic.cover && (
        <div className="codex-frame mb-6 bg-surface">
          <img src={mediaUrl(topic.cover)} alt="" className="w-full rounded-lg" />
        </div>
      )}
      <h1 className="font-serif text-3xl font-semibold md:text-4xl">{topic.title}</h1>
      {topic.subtitle && <p className="mt-1 text-muted">{topic.subtitle}</p>}
      {topic.intro && <p className="mt-4 font-serif text-lg leading-relaxed">{topic.intro}</p>}

      {resume && (
        <Link
          to={`/kapitel/${resume.id}`}
          className="mt-6 inline-flex min-h-12 max-w-full items-center gap-2 rounded-full bg-accent px-6 font-medium text-on-accent shadow hover:bg-accent-strong"
        >
          {started ? `Fortsæt: ${resume.number}. ${resume.title}` : 'Start fortællingen'} <ChevronRight className="h-5 w-5 shrink-0" />
        </Link>
      )}

      <div className="mt-10 mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-widest text-muted uppercase">Kapitler</h2>
        {readCount > 0 && (
          <span className="text-sm text-muted">
            {readCount} af {topic.chapters.length} læst
          </span>
        )}
      </div>
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {topic.chapters.map((c) => (
          <li key={c.id}>
            <Link to={`/kapitel/${c.id}`} className="flex items-center gap-4 p-4 hover:bg-surface-2">
              {progress[c.id]?.done ? (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-jade text-on-accent" aria-label={`Kapitel ${c.number}, læst`}>
                  <Check className="h-5 w-5" />
                </span>
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-accent font-serif text-lg font-semibold text-accent">
                  {c.number}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.title}</span>
                {c.period && <span className="block text-xs text-blue">{formatPeriod(c.period)}</span>}
                {c.summary && <span className="mt-0.5 block text-sm text-muted">{c.summary}</span>}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
