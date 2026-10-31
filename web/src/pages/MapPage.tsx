import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { History, MapPin, Pause, Play, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link, useSearchParams } from 'react-router';
import { cached, fetchTopic, formatYear, type PlaceProps, type Places, type Timeline, type Topic } from '../api';
import Status from '../components/Status';
import { makeTimeScale, placeState, type TimeScale } from '../timeScale';
import { useLoad } from '../useLoad';

type Place = PlaceProps & { lat: number; lon: number };

// Codex-style markers: red ochre dot with a black outline; highlighted places are bigger and
// blue. In the time travel: abandoned cities are small and grey ("ruin"), landscapes hollow,
// and a place where something happens right now pulses.
type Look = 'normal' | 'on' | 'dim' | 'ruin' | 'landscape' | 'pulse';
const icons = new Map<Look, L.DivIcon>();
const icon = (look: Look) => {
  let i = icons.get(look);
  if (!i) {
    const big = look === 'on' || look === 'pulse';
    const size = big ? 22 : look === 'ruin' ? 10 : 14;
    i = L.divIcon({
      className: '',
      html: `<span class="map-dot map-dot-${look}"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -10],
    });
    icons.set(look, i);
  }
  return i;
};

export default function MapPage() {
  const [data, error] = useLoad(
    () => Promise.all([cached<Places>('/api/topic/places'), fetchTopic(), cached<Timeline>('/api/topic/timeline')]),
    'places',
  );
  if (!data) return <Status error={error} />;
  return <MapView places={data[0]} topic={data[1]} timeline={data[2]} />;
}

function MapView({ places, topic, timeline }: { places: Places; topic: Topic; timeline: Timeline }) {
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

  // Time travel: t (0…1 on the time axis) while on; null shows every place.
  const scale = useMemo(() => makeTimeScale(timeline, places), [timeline, places]);
  const [t, setT] = useState<number | null>(null);
  const year = t === null ? null : scale.yearAt(t);
  const eventWindow = 0.025;
  const nowEvent =
    year === null
      ? null
      : [...timeline.events].reverse().find((e) => e.year <= year && scale.tAt(year) - scale.tAt(e.year) < eventWindow * 1.6) ?? null;
  const look = (p: Place): Look | null => {
    if (year !== null) {
      const state = placeState(p, year, scale, eventWindow);
      if (state === 'hidden') return null;
      if (state === 'event' || (state === 'active' && nowEvent?.place === p.id)) return 'pulse';
      if (state === 'ruin' || state === 'landscape') return state;
      return 'normal';
    }
    const on = !!focus && p.chapters.includes(focus);
    return on || selected === p.id ? 'on' : focus ? 'dim' : 'normal';
  };

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

      <div className="codex-frame relative mb-6 bg-surface">
        {year !== null && (
          <div className="pointer-events-none absolute top-3 right-3 z-[500] rounded-lg border border-line bg-surface/90 px-3 py-1 text-right shadow">
            <p className="font-serif text-xl font-semibold tabular-nums">{formatYear(year)}</p>
            {nowEvent && <p className="max-w-48 text-xs leading-tight text-muted">{nowEvent.label}</p>}
          </div>
        )}
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
          <FitTo places={year === null && shown.length ? shown : all} />
          {all.map((p) => {
            const l = look(p);
            if (!l) return null;
            return (
              <Marker
                key={p.id}
                position={[p.lat, p.lon]}
                title={p.name}
                alt={p.name}
                keyboard
                icon={icon(l)}
                zIndexOffset={l === 'on' || l === 'pulse' ? 1000 : l === 'ruin' ? -100 : 0}
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

      <TimeTravel scale={scale} t={t} onChange={setT} timeline={timeline} event={nowEvent} topic={topic} />

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

// Play the map through time: cities appear as they rise and turn grey when abandoned, and the
// events of the timeline flash at their place.
function TimeTravel({
  scale,
  t,
  onChange,
  timeline,
  event,
  topic,
}: {
  scale: TimeScale;
  t: number | null;
  onChange: (t: number | null) => void;
  timeline: Timeline;
  event: Timeline['events'][number] | null;
  topic: Topic;
}) {
  const [playing, setPlaying] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const Seconds = 75; // the whole story at normal speed

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const next = Math.min(1, (tRef.current ?? 0) + (now - last) / 1000 / Seconds);
      last = now;
      onChange(next);
      if (next >= 1) return setPlaying(false);
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, onChange]);

  if (t === null)
    return (
      <button
        onClick={() => {
          onChange(0);
          setPlaying(true);
        }}
        className="mb-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-accent bg-surface font-medium text-accent hover:bg-accent/10"
      >
        <History className="h-5 w-5" /> Afspil tidslinjen på kortet
      </button>
    );

  const year = scale.yearAt(t);
  const period = timeline.periods.find((p) => year >= p.from && year < p.to);
  const chapter = event?.chapter ? topic.chapters.find((c) => c.id === event.chapter) : undefined;
  return (
    <section className="mb-6 rounded-xl border border-line bg-surface p-4" aria-label="Tidsrejse på kortet">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (t >= 1) onChange(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? 'Pause' : 'Afspil'}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent hover:bg-accent-strong"
        >
          {playing ? <Pause className="h-6 w-6" fill="currentColor" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-2xl font-semibold tabular-nums" aria-live="off">
            {formatYear(year)}
          </p>
          <p className="truncate text-sm text-muted">{period?.label}</p>
        </div>
        <button
          onClick={() => {
            setPlaying(false);
            onChange(null);
          }}
          aria-label="Luk tidsrejsen og vis alle steder"
          className="rounded-lg p-2 text-muted hover:text-fg"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(t * 1000)}
        onChange={(e) => {
          setPlaying(false);
          onChange(Number(e.target.value) / 1000);
        }}
        aria-label="År"
        aria-valuetext={formatYear(year)}
        className="mt-3 h-2 w-full cursor-pointer accent-[var(--color-accent)]"
      />
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>{formatYear(scale.start)}</span>
        <span>i dag</span>
      </div>
      <p className="mt-3 min-h-[2lh] text-sm leading-snug" aria-live="polite">
        {event && (
          <>
            <span className="font-semibold text-accent">{formatYear(event.year)}:</span> {event.label}
            {chapter && (
              <>
                {' '}
                <Link to={`/kapitel/${chapter.id}`} className="whitespace-nowrap text-blue underline">
                  kap. {chapter.number}
                </Link>
              </>
            )}
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-muted">
        Byerne vises i deres storhedstid (ca. årstal) og bliver grå, når de forlades. Tidsaksen er ikke i samme målestok.
      </p>
    </section>
  );
}
