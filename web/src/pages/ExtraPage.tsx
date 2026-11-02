import { lazy, Suspense, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { fetchTopic } from '../api';
import Status from '../components/Status';
import { extras } from '../extras/registry';
import { useLoad } from '../useLoad';
import { usePageTitle } from '../topicTitle';

export default function ExtraPage() {
  const { id = '' } = useParams();
  const [topic, error] = useLoad(fetchTopic, 'topic');
  usePageTitle(topic?.extras.find((e) => e.id === id)?.title ?? 'Prøv selv');
  const Component = useMemo(() => (extras[id] ? lazy(extras[id]) : null), [id]);
  if (!topic) return <Status error={error} />;
  const extra = topic.extras.find((e) => e.id === id);
  if (!extra || !Component) return <Status error="Den aktivitet findes ikke." />;
  const chapter = topic.chapters.find((c) => c.id === extra.chapter);

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">{extra.title}</h1>
      {extra.description && <p className="mt-1 mb-6 text-muted">{extra.description}</p>}
      <Suspense fallback={<Status />}>
        <Component />
      </Suspense>
      {chapter && (
        <p className="mt-8 text-sm">
          Læs mere i{' '}
          <Link to={`/kapitel/${chapter.id}`} className="text-blue underline">
            kapitel {chapter.number}: {chapter.title}
          </Link>
          .
        </p>
      )}
    </div>
  );
}
