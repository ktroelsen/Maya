// Thin fetch wrapper; the API is same-origin and open (no login).
export class ApiError extends Error {
  // detail: the server's explanation (ProblemDetails "detail", or a plain-text body), if any.
  constructor(public status: number, message: string, public detail?: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`, problemDetail(text));
  return (text ? JSON.parse(text) : undefined) as T;
}

export function problemDetail(text: string) {
  if (!text) return undefined;
  try {
    const body = JSON.parse(text);
    return typeof body === 'string' ? body : (body.detail ?? body.title);
  } catch {
    return text.length < 300 ? text : undefined;
  }
}

export function errorMessage(err: unknown, fallback = 'Noget gik galt. Prøv igen.') {
  if (err instanceof ApiError) return err.detail ?? fallback;
  return fallback;
}

export type Health = { status: string; version: string; googleVoice: boolean };

/** Years: negative = f.Kr. */
export type Period = { from: number; to: number; label?: string | null };

export type ChapterSummary = { id: string; number: number; title: string; summary: string | null; period: Period | null; image: string | null };

export type Podcast = { id: string; title: string; src: string; description: string | null; chapters: string[] | null };

export type Topic = {
  id: string;
  title: string;
  subtitle: string | null;
  cover: string | null;
  intro: string | null;
  chapters: ChapterSummary[];
  podcasts: Podcast[];
};

export type Image = { src: string; alt: string | null; caption: string | null; credit: string | null; illustration: boolean };
export type Source = { title: string; url: string | null };
export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string | null };
export type ChapterLink = { id: string; number: number; title: string };

export type Chapter = {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  period: Period | null;
  places: string[];
  images: Image[];
  sources: Source[];
  quiz: QuizQuestion[];
  markdown: string;
  podcasts: Podcast[];
  prev: ChapterLink | null;
  next: ChapterLink | null;
};

export type Timeline = {
  periods: { id: string; label: string; from: number; to: number }[];
  events: { year: number; label: string; chapter?: string; place?: string }[];
};

export type GlossaryEntry = { term: string; definition: string; chapters: string[] };

export type Places = {
  type: 'FeatureCollection';
  features: { properties: { id: string; name: string; chapters: string[] }; geometry: { coordinates: [number, number] } }[];
};

/** Media files of the topic live under /media. */
export const mediaUrl = (src: string) => `/media/${src.split('/').map(encodeURIComponent).join('/')}`;

/** "250 e.Kr.", "2000 f.Kr." */
export const formatYear = (year: number) => (year < 0 ? `${-year} f.Kr.` : `${year} e.Kr.`);

export const formatPeriod = (p: Period) => p.label ?? `${formatYear(p.from)} – ${formatYear(p.to)}`;

// Loaded once per page load and shared by all pages.
const cache = new Map<string, Promise<unknown>>();
export function cached<T>(path: string): Promise<T> {
  let hit = cache.get(path) as Promise<T> | undefined;
  if (!hit) {
    hit = api<T>(path);
    hit.catch(() => cache.delete(path));
    cache.set(path, hit);
  }
  return hit;
}

export const fetchTopic = () => cached<Topic>('/api/topic');

/** Whether the Google voice (Chirp 3 HD) is set up on the server. */
export const fetchGoogleVoiceAvailable = () =>
  cached<Health>('/api/health').then((h) => h.googleVoice).catch(() => false);
