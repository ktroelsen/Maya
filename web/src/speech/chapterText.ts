import { segmentText, type Segment } from './segments';

// A chapter's Markdown as what the player reads: headings, paragraphs and bullet lists, split
// into sentences. Only the Markdown the content uses is understood (## headings, paragraphs,
// "- " lists, **bold**/*italic*, [links](…)); inline markup is dropped, as the text is read aloud.
export type BlockKind = 'heading' | 'paragraph' | 'list';

export type ChapterSegment = Segment & {
  kind: BlockKind;
  heading: boolean;
  /** In a list: which item the sentence belongs to. */
  item: number;
};

const bullet = /^\s*(?:[-*]|\d+\.)\s+/;

/** A picture on a line of its own in the text: shown there, never read aloud. */
export type ChapterFigure = { paragraph: number; src: string; alt: string; caption: string | null };

const figureLine = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/;

export function chapterSegments(markdown: string): ChapterSegment[] {
  return chapterContent(markdown).segments;
}

/** The chapter as sentences to read, and the pictures between them. */
export function chapterContent(markdown: string): { segments: ChapterSegment[]; figures: ChapterFigure[] } {
  const blocks = markdown.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: ChapterSegment[] = [];
  const figures: ChapterFigure[] = [];
  blocks.forEach((block, paragraph) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const pictures = lines.map((l) => figureLine.exec(l));
    if (pictures.every(Boolean)) {
      for (const m of pictures) figures.push({ paragraph, src: m![2], alt: m![1], caption: m![3] ?? null });
      return;
    }
    if (/^#{1,6}\s/.test(block)) {
      for (const s of segmentText(plain(block.replace(/^#{1,6}\s+/, ''))))
        out.push({ ...s, paragraph, kind: 'heading', heading: true, item: 0 });
    } else if (lines.every((l) => bullet.test(l))) {
      lines.forEach((line, item) => {
        for (const s of segmentText(plain(line.replace(bullet, ''))))
          out.push({ ...s, paragraph, newLine: false, kind: 'list', heading: false, item });
      });
    } else {
      for (const s of segmentText(plain(block))) out.push({ ...s, paragraph, kind: 'paragraph', heading: false, item: 0 });
    }
  });
  return { segments: out, figures };
}

function plain(md: string) {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
}
