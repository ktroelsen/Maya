import { MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { cached, fetchTopic, type Places, type Topic } from '../api';
import Status from '../components/Status';
import { useLoad } from '../useLoad';

// The places of the story. (The interactive map comes later; for now a list with map links.)
export default function MapPage() {
  const [data, error] = useLoad(() => Promise.all([cached<Places>('/api/topic/places'), fetchTopic()]), 'places');
  if (!data) return <Status error={error} />;
  const [places, topic] = data as [Places, Topic];

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-semibold">Steder</h1>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {places.features
          .slice()
          .sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'da'))
          .map(({ properties: p, geometry }) => {
            const [lon, lat] = geometry.coordinates;
            const chapters = topic.chapters.filter((c) => p.chapters.includes(c.id));
            return (
              <li key={p.id} className="flex items-start gap-3 p-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline decoration-line hover:decoration-accent"
                  >
                    {p.name}
                  </a>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {chapters.map((c) => (
                      <Link key={c.id} to={`/kapitel/${c.id}`} className="text-blue underline">
                        Kap. {c.number}
                      </Link>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
