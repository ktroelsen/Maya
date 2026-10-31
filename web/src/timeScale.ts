import type { Places, Timeline } from './api';

// A time axis for the map's time travel: 0…1 ↔ years. Like the timeline page, it is not to
// scale: each period gets room for what happens in it, so 8000 quiet years don't swallow the
// 650 busy ones.
export type TimeScale = { start: number; end: number; yearAt: (t: number) => number; tAt: (year: number) => number };

export function makeTimeScale(timeline: Timeline, places: Places, now = new Date().getFullYear()): TimeScale {
  const props = places.features.map((f) => f.properties);
  const years = [
    ...props.flatMap((p) => [p.from, p.to, p.year]).filter((y): y is number => y !== undefined),
    ...timeline.events.filter((e) => e.place).map((e) => e.year),
  ];
  const start = Math.floor((Math.min(...years) - 100) / 100) * 100;
  const end = now;

  // Breakpoints at the period borders inside [start, end], each period weighted by activity.
  const bounds = [start, ...timeline.periods.map((p) => p.from).filter((y) => y > start && y < end), end];
  const weight = (from: number, to: number) =>
    1 + 0.5 * timeline.events.filter((e) => e.year >= from && e.year < to).length + 0.25 * years.filter((y) => y >= from && y < to).length;
  const weights = bounds.slice(1).map((to, i) => weight(bounds[i], to));
  const total = weights.reduce((a, b) => a + b, 0);
  const ts = [0];
  weights.forEach((w) => ts.push(ts[ts.length - 1] + w / total));

  const interpolate = (x: number, xs: number[], ys: number[]) => {
    if (x <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++)
      if (x <= xs[i]) return ys[i - 1] + ((x - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1]);
    return ys[ys.length - 1];
  };
  return {
    start,
    end,
    yearAt: (t) => Math.round(interpolate(t, ts, bounds)),
    tAt: (year) => interpolate(year, bounds, ts),
  };
}

export type PlaceState = 'hidden' | 'active' | 'ruin' | 'landscape' | 'event';

/** How a place looks in a given year. Events show for a short stretch of the axis. */
export function placeState(p: Places['features'][number]['properties'], year: number, scale: TimeScale, window = 0.025): PlaceState {
  switch (p.kind ?? 'city') {
    case 'landscape':
      return 'landscape';
    case 'event':
      return p.year !== undefined && Math.abs(scale.tAt(year) - scale.tAt(p.year)) < window ? 'event' : 'hidden';
    case 'today':
      return p.from !== undefined && year >= p.from ? 'active' : 'hidden';
    default:
      if (p.from === undefined || year < p.from) return 'hidden';
      return p.to !== undefined && year > p.to ? 'ruin' : 'active';
  }
}
