import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link, useSearchParams } from 'react-router';
import { cached, fetchTopic, type Places, type Topic } from '../api';
import Status from '../components/Status';
import { useLoad } from '../useLoad';

type Place = { id: string; name: string; chapters: string[]; lat: number; lon: number };

// Codex-style marker: red ochre dot with a black outline; highlighted places are bigger and blue.
const icon = (highlight: boolean, dim: boolean) =>
  L.divIcon({
    className: '',
    html: `<span class="map-dot${highlight ? ' map-dot-on' : ''}${dim ? ' map-dot-dim' : ''}"></span>`,
    iconSize: highlight ? [22, 22] : [14, 14],
    iconAnchor: highlight ? [11, 11] : [7, 7],
    popupAnchor: [0, -10],
  });

export default function MapPage() {
  const [data, error] = useLoad(() => Promise.all([cached<Places>('/api/topic/places'), fetchTopic()]), 'places');
  if (!data) return <Status error={error} />;
  return <MapView places={data[0]} topic={data[1]} />;
}

function MapView({ places, topic }: { places: Places; topic: Topic }) {
  const [params] = useSearchParams();
  const focus = params.get('kapitel');
  const focusChapter = topic.chapters.find((c) => c.id === focus);
  const [selected, setSelected] = useState<string | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);

  const all = useMemo<Place[]>(
    () =>
      places.features
        .map(({ properties: p, geometry }) => ({ ...p, lon: geometry.coordinates[0], lat: geometry.coordinates[1] }))
        .sort((a, b) => a.name.localeCompare(b.name, 'da')),
    [places],
  );
  const shown = focus ? all.filter((p) => p.chapters.includes(focus)) : all;
  const chaptersOf = (p: Place) => topic.chapters.filter((c) => p.chapters.includes(c.id));

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Kort</h1>
      <p className="mt-1 mb-4 text-sm text-muted">
        {focusChapter ? (
          <>
            Steder i kapitel {focusChapter.number}, {focusChapter.title}.{' '}
            <Link to="/kort" className="text-blue underline">
              Vis alle
            </Link>
          </>
        ) : (
          'Tryk på et sted for at se, hvilke kapitler det hører til.'
        )}
      </p>

      <div className="codex-frame mb-6 bg-surface">
        <MapContainer
          className="map-codex h-[55vh] min-h-72 w-full rounded-lg"
          center={[17, -90]}
          zoom={6}
          zoomSnap={0.5}
          scrollWheelZoom={false}
          attributionControl
          ref={setMap}
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={17}
          />
          <FitTo places={shown.length ? shown : all} />
          {all.map((p) => {
            const on = !!focus && p.chapters.includes(focus);
            return (
              <Marker
                key={p.id}
                position={[p.lat, p.lon]}
                title={p.name}
                alt={p.name}
                keyboard
                icon={icon(on || selected === p.id, !!focus && !on)}
                zIndexOffset={on ? 1000 : 0}
                eventHandlers={{ click: () => setSelected(p.id) }}
              >
                <Popup>
                  <strong className="font-serif text-base">{p.name}</strong>
                  <span className="mt-1 block">
                    {chaptersOf(p).map((c) => (
                      <Link key={c.id} to={`/kapitel/${c.id}`} className="mr-2 inline-block text-blue underline">
                        Kap. {c.number}: {c.title}
                      </Link>
                    ))}
                  </span>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {shown.map((p) => (
          <li key={p.id} className="flex items-start gap-3 p-4">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <button onClick={() => setSelected(p.id)} className="text-left font-medium hover:text-accent">
                {p.name}
              </button>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {chaptersOf(p).map((c) => (
                  <Link key={c.id} to={`/kapitel/${c.id}`} className="text-blue underline">
                    Kap. {c.number}
                  </Link>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <FlyToSelected map={map} places={all} selected={selected} />
    </div>
  );
}

// Show all given places when they change (all, or one chapter's).
function FitTo({ places }: { places: Place[] }) {
  const map = useMap();
  const key = places.map((p) => p.id).join();
  useEffect(() => {
    map.invalidateSize();
    if (places.length === 1) map.setView([places[0].lat, places[0].lon], 9);
    else if (places.length) map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon])), { padding: [20, 20], maxZoom: 9 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Picking a place (in the list or on the map) centres it and brings the map into view.
function FlyToSelected({ map, places, selected }: { map: L.Map | null; places: Place[]; selected: string | null }) {
  useEffect(() => {
    const p = places.find((x) => x.id === selected);
    if (!p || !map) return;
    map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 8), { duration: 0.6 });
    map.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [map, places, selected]);
  return null;
}
