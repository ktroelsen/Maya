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

export function chapterSegments(markdown: string): ChapterSegment[] {
  const blocks = markdown.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: ChapterSegment[] = [];
  blocks.forEach((block, paragraph) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
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
  return out;
}

function plain(md: string) {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');
}
