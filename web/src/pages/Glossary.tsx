import { Link } from 'react-router';
import { cached, fetchTopic, type GlossaryEntry, type Topic } from '../api';
import Status from '../components/Status';
import { useLoad } from '../useLoad';

export default function Glossary() {
  const [data, error] = useLoad(() => Promise.all([cached<GlossaryEntry[]>('/api/topic/glossary'), fetchTopic()]), 'glossary');
  if (!data) return <Status error={error} />;
  const [entries, topic] = data as [GlossaryEntry[], Topic];

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-semibold">Ordliste</h1>
      <dl className="space-y-4">
        {entries
          .slice()
          .sort((a, b) => a.term.localeCompare(b.term, 'da'))
          .map((e) => (
            <div key={e.term} className="rounded-xl border border-line bg-surface p-4">
              <dt className="font-serif text-lg font-semibold text-accent">{e.term}</dt>
              <dd className="mt-1">{e.definition}</dd>
              <dd className="mt-1 flex flex-wrap gap-x-3 text-sm">
                {topic.chapters
                  .filter((c) => e.chapters.includes(c.id))
                  .map((c) => (
                    <Link key={c.id} to={`/kapitel/${c.id}`} className="text-blue underline">
                      Kap. {c.number}: {c.title}
                    </Link>
                  ))}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
