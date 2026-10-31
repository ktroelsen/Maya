import { segmentText, type Segment } from './segments';

// A chapter's Markdown as what the player reads: headings and paragraphs, split into
// sentences. Only the Markdown the content uses is understood (## headings, paragraphs,
// **bold**/*italic*, [links](…)); inline markup is dropped, as the text is read aloud.
export type ChapterSegment = Segment & { heading: boolean };

export function chapterSegments(markdown: string): ChapterSegment[] {
  const blocks = markdown.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: ChapterSegment[] = [];
  blocks.forEach((block, paragraph) => {
    const heading = /^#{1,6}\s/.test(block);
    const text = plain(heading ? block.replace(/^#{1,6}\s+/, '') : block);
    for (const s of segmentText(text)) out.push({ ...s, paragraph, heading });
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
