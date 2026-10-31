import { useEffect, useMemo, useRef } from 'react';
import type { ChapterSegment } from '../speech/chapterText';

type Props = {
  segments: ChapterSegment[];
  current: number;
  active: boolean; // reading: highlight and keep the sentence in view
  onSelect: (index: number) => void;
};

// The chapter as headings and paragraphs of tappable sentences; the one being read is highlighted.
export default function ChapterText({ segments, current, active, onSelect }: Props) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  const blocks = useMemo(() => {
    const groups: { segment: ChapterSegment; index: number }[][] = [];
    segments.forEach((segment, index) => (groups[segment.paragraph] ??= []).push({ segment, index }));
    return groups.filter(Boolean);
  }, [segments]);

  useEffect(() => {
    if (active) refs.current[current]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current, active]);

  return (
    <div className="font-serif text-lg leading-relaxed md:text-xl md:leading-relaxed">
      {blocks.map((group, b) => {
        const sentences = group.map(({ segment, index }) => (
          <span key={index}>
            {index > group[0].index ? ' ' : null}
            <span
              ref={(el) => {
                refs.current[index] = el;
              }}
              onClick={() => onSelect(index)}
              className={`-mx-0.5 cursor-pointer rounded px-0.5 transition-colors ${
                active && index === current ? 'bg-mark' : 'hover:bg-surface-2'
              }`}
            >
              {segment.text}
            </span>
          </span>
        ));
        if (b === 0 && group[0].segment.heading)
          return (
            <h1 key={b} className="mb-5 font-serif text-3xl leading-tight font-semibold md:text-4xl">
              {sentences}
            </h1>
          );
        return group[0].segment.heading ? (
          <h2 key={b} className="mt-8 mb-3 font-sans text-xl font-semibold text-accent md:text-2xl">
            {sentences}
          </h2>
        ) : (
          <p key={b} className="mb-5">
            {sentences}
          </p>
        );
      })}
    </div>
  );
}
