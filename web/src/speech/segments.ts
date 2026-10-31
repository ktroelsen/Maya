// Splits a text into the pieces the player speaks one at a time: sentences, and long
// sentences further at commas/spaces, so no single utterance runs long enough for the
// browser to cut it off. Paragraphs (blank lines) and line breaks are kept for display.
export type Segment = {
  text: string;
  paragraph: number;
  /** Starts a new line inside its paragraph (lists, poems, addresses). */
  newLine: boolean;
};

const MaxLength = 220;

const sentenceSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('da', { granularity: 'sentence' }) : null;

export function segmentText(text: string): Segment[] {
  const segments: Segment[] = [];
  const paragraphs = text.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  paragraphs.forEach((paragraph, p) => {
    paragraph.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, l) => {
      sentences(line).flatMap(splitLong).forEach((piece, s) => {
        segments.push({ text: piece, paragraph: p, newLine: l > 0 && s === 0 });
      });
    });
  });
  return segments;
}

function sentences(line: string): string[] {
  if (!sentenceSegmenter) return line.split(/(?<=[.!?…])\s+/).filter(Boolean);
  return Array.from(sentenceSegmenter.segment(line), (s) => s.segment.trim()).filter(Boolean);
}

// Break an over-long sentence at the last comma/semicolon/colon (else space) before the limit.
function splitLong(sentence: string): string[] {
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > MaxLength) {
    const window = rest.slice(0, MaxLength);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
    if (cut < MaxLength / 3) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = MaxLength - 1;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Rough listening time at the given rate (~150 words a minute at 1×). */
export function listeningMinutes(text: string, rate = 1) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / (150 * rate)));
}
