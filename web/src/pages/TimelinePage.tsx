import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { cached, fetchTopic, formatYear, type Timeline, type Topic } from '../api';
import Status from '../components/Status';
import { useLoad } from '../useLoad';

// Codex colours for the period bands, in order.
const bandColors = ['var(--color-ochre)', 'var(--color-jade)', 'var(--color-accent)', 'var(--color-blue)', 'var(--color-muted)'];

const Axis = 64; // x of the time axis
const Band = 14; // width of the period band
const Gap = 72; // assumed room per event label until it has been measured
const Space = 14; // between two labels
const PeriodMin = 120; // min. height of a period without events
const Head = 44; // room for the period title

type Placed = { year: number; label: string; chapter?: string; y: number };
type PlacedPeriod = { id: string; label: string; from: number; to: number; y: number; height: number; color: string };

// Vertical timeline: each period is a coloured band; events inside it are spread out in year
// order, as close to their place in the period as the labels allow. Very long and very short
// periods would otherwise make the scale useless (8000 years of hunters vs. 650 years of kings).
// heights: the measured height of each event label (in the sorted event order), once known.
function sortedEvents(timeline: Timeline) {
  return timeline.periods.flatMap((p) =>
    timeline.events.filter((e) => e.year >= p.from && e.year < p.to).sort((a, b) => a.year - b.year),
  );
}

function layout(timeline: Timeline, heights: number[]) {
  const periods: PlacedPeriod[] = [];
  const events: Placed[] = [];
  let y = 8;
  timeline.periods.forEach((p, i) => {
    const inside = timeline.events.filter((e) => e.year >= p.from && e.year < p.to).sort((a, b) => a.year - b.year);
    const base = Math.max(PeriodMin, inside.length * Gap);
    const top = y + Head;
    let next = top; // first free y
    for (const e of inside) {
      const ideal = top + ((e.year - p.from) / (p.to - p.from)) * base;
      const at = Math.max(ideal, next);
      events.push({ ...e, y: at });
      next = at + (heights[events.length - 1] ?? Gap) + Space;
    }
    const height = Math.max(Head + base, next - y + Space);
    periods.push({ ...p, y, height, color: bandColors[i % bandColors.length] });
    y += height;
  });
  return { periods, events, height: y + 8 };
}

export default function TimelinePage() {
  const [data, error] = useLoad(() => Promise.all([cached<Timeline>('/api/topic/timeline'), fetchTopic()]), 'timeline');
  if (!data) return <Status error={error} />;
  return <TimelineView timeline={data[0]} topic={data[1]} />;
}

function TimelineView({ timeline, topic }: { timeline: Timeline; topic: Topic }) {
  const [params] = useSearchParams();
  const focus = params.get('kapitel');
  const count = useMemo(() => sortedEvents(timeline).length, [timeline]);
  const [heights, setHeights] = useState<number[]>([]);
  const labels = useRef<(HTMLLIElement | null)[]>([]);
  const { periods, events, height } = useMemo(() => layout(timeline, heights), [timeline, heights]);

  // Measure the labels (they wrap differently on every screen) and lay out again.
  useLayoutEffect(() => {
    const measure = () => {
      const next = Array.from({ length: count }, (_, i) => labels.current[i]?.offsetHeight ?? Gap);
      setHeights((old) => (old.length === next.length && old.every((h, i) => h === next[i]) ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    labels.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [count]);
  const chapterOf = (id?: string) => topic.chapters.find((c) => c.id === id);
  const firstFocused = useRef<HTMLLIElement | null>(null);
  const focusChapter = chapterOf(focus ?? undefined);

  useEffect(() => {
    firstFocused.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);

  const thisYear = new Date().getFullYear();
  let markedFirst = false;

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Tidslinje</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        {focusChapter ? (
          <>
            Fremhævet: kapitel {focusChapter.number}, {focusChapter.title}.{' '}
            <Link to="/tidslinje" className="text-blue underline">
              Vis alt
            </Link>
          </>
        ) : (
          'Perioderne er ikke tegnet i samme målestok – tryk på en begivenhed for at læse om den.'
        )}
      </p>

      <div className="relative" style={{ height }}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {periods.map((p) => (
            <g key={p.id}>
              <rect x={Axis - Band / 2} y={p.y} width={Band} height={p.height} fill={p.color} stroke="var(--color-fg)" strokeWidth={2} />
            </g>
          ))}
          {events.map((e) => {
            const on = !focus || e.chapter === focus;
            return (
              <g key={`${e.year}-${e.label}`} opacity={on ? 1 : 0.35}>
                <line x1={Axis + Band / 2} x2={Axis + 26} y1={e.y + 12} y2={e.y + 12} stroke="var(--color-fg)" strokeWidth={1.5} />
                <circle cx={Axis} cy={e.y + 12} r={on && focus ? 7 : 5} fill="var(--color-surface)" stroke="var(--color-fg)" strokeWidth={2} />
              </g>
            );
          })}
        </svg>

        {periods.map((p) => (
          <div key={p.id} className="absolute right-0 left-0" style={{ top: p.y }}>
            <span className="absolute w-14 text-right text-[11px] leading-tight text-muted tabular-nums" style={{ left: 0, top: -6 }}>
              {formatYear(p.from)}
            </span>
            <h2 className="absolute font-serif text-lg font-semibold" style={{ left: Axis + 26, top: 6 }}>
              {p.label}
              <span className="ml-2 font-sans text-xs font-normal text-muted">
                {formatYear(p.from)} – {p.to >= thisYear ? 'i dag' : formatYear(p.to)}
              </span>
            </h2>
          </div>
        ))}

        <ol>
          {events.map((e, i) => {
            const chapter = chapterOf(e.chapter);
            const on = !focus || e.chapter === focus;
            const first = on && !!focus && !markedFirst;
            if (first) markedFirst = true;
            return (
              <li
                key={`${e.year}-${e.label}`}
                ref={(el) => {
                  labels.current[i] = el;
                  if (first) firstFocused.current = el;
                }}
                className={`absolute right-0 transition-opacity ${on ? '' : 'opacity-40'}`}
                style={{ top: e.y, left: Axis + 34 }}
              >
                <span className="font-serif font-semibold text-accent tabular-nums">{formatYear(e.year)}</span>
                {chapter ? (
                  <Link to={`/kapitel/${chapter.id}`} className="block leading-snug hover:underline">
                    {e.label} <span className="text-sm whitespace-nowrap text-blue">· kap. {chapter.number}</span>
                  </Link>
                ) : (
                  <p className="leading-snug">{e.label}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
