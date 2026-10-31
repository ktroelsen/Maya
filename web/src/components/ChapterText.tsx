import { useEffect, useMemo, useRef } from 'react';
import Figure from './Figure';
import type { ChapterFigure, ChapterSegment } from '../speech/chapterText';

type Props = {
  segments: ChapterSegment[];
  figures: ChapterFigure[];
  current: number;
  active: boolean; // reading: highlight the sentence
  follow: boolean; // keep the sentence being read in view
  showFigures: boolean; // the pictures in the text (off when a slideshow shows them)
  onSelect: (index: number) => void;
};

// The chapter as headings, paragraphs and lists of tappable sentences; the one being read is highlighted.
export default function ChapterText({ segments, figures, current, active, follow, showFigures, onSelect }: Props) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  // Text blocks and pictures in the order they stand in the chapter.
  const blocks = useMemo(() => {
    const groups: { segment: ChapterSegment; index: number }[][] = [];
    segments.forEach((segment, index) => (groups[segment.paragraph] ??= []).push({ segment, index }));
    const items: ({ paragraph: number; group: (typeof groups)[number] } | { paragraph: number; figure: ChapterFigure })[] = [
      ...groups.flatMap((group, paragraph) => (group ? [{ paragraph, group }] : [])),
      ...(showFigures ? figures : []).map((figure) => ({ paragraph: figure.paragraph, figure })),
    ];
    return items.sort((a, b) => a.paragraph - b.paragraph);
  }, [segments, figures, showFigures]);

  useEffect(() => {
    if (follow) refs.current[current]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current, follow]);

  return (
    <div className="font-serif text-lg leading-relaxed md:text-xl md:leading-relaxed">
      {blocks.map((item, b) => {
        if ('figure' in item)
          return (
            <Figure
              key={`f${item.paragraph}`}
              image={{ src: item.figure.src, alt: item.figure.alt, caption: item.figure.caption, credit: null, illustration: true }}
              className="mb-6 font-sans"
            />
          );
        const group = item.group;
        const sentence = (text: string, index: number) => (
          <span
            ref={(el) => {
              refs.current[index] = el;
            }}
            onClick={() => onSelect(index)}
            className={`-mx-0.5 cursor-pointer rounded px-0.5 transition-colors ${
              active && index === current ? 'bg-mark' : 'hover:bg-surface-2'
            }`}
          >
            {text}
          </span>
        );
        const sentences = group.map(({ segment, index }) => (
          <span key={index}>
            {index > group[0].index ? ' ' : null}
            {sentence(segment.text, index)}
          </span>
        ));
        if (b === 0 && group[0].segment.heading)
          return (
            <h1 key={b} className="mb-5 font-serif text-3xl leading-tight font-semibold md:text-4xl">
              {sentences}
            </h1>
          );
        if (group[0].segment.kind === 'list') {
          const items: (typeof group)[] = [];
          group.forEach((g) => (items[g.segment.item] ??= []).push(g));
          return (
            <ul key={b} className="mb-5 list-disc space-y-2 pl-6 marker:text-accent">
              {items.filter(Boolean).map((item) => (
                <li key={item[0].index}>
                  {item.map(({ segment, index }, k) => (
                    <span key={index}>
                      {k > 0 ? ' ' : null}
                      {sentence(segment.text, index)}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          );
        }
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
