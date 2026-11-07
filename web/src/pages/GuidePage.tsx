import { Camera, FileText, ImageUp, Pause, Send, Trash2, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError, fetchTopic, fetchVisionAvailable, problemDetail, type GuideEntry } from '../api';
import { deleteEntry, guideHistorySupported, listEntries } from '../guideHistory';
import PhotoViewer from '../components/PhotoViewer';
import Status from '../components/Status';
import { useOnline } from '../offline';
import { shrinkPhoto } from '../photo';
import { segmentText } from '../speech/segments';
import { engine, useVoiceSettings } from '../speech/settings';
import { usePageTitle } from '../topicTitle';

type Mode = 'object' | 'sign';

// "Guide in the pocket": photograph an object or a sign at the exhibition and get it explained,
// with the chapters that tell more. Needs a network (Gemini on the server).
export default function GuidePage() {
  usePageTitle('Spørg guiden');
  const [available, setAvailable] = useState<boolean | null>(null);
  const online = useOnline();
  const [draft, setDraft] = useState<{ file: Blob; url: string; mode: Mode } | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GuideEntry[]>([]);
  const [readNow, setReadNow] = useState<string | null>(null); // a sign just photographed: read it aloud
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const nextMode = useRef<Mode>('object');

  useEffect(() => void fetchVisionAvailable().then(setAvailable), []);

  // Everyone's answers, from the server. Answers this phone kept before they were shared are
  // handed over first (once), so nothing gets lost.
  useEffect(() => {
    void (async () => {
      try {
        const topic = await fetchTopic();
        if (navigator.onLine && guideHistorySupported()) await handOverLocal(topic.id);
      } catch {
        /* keep them on the phone for next time */
      }
      setHistory(await api<GuideEntry[]>('/api/guide').catch(() => []));
    })();
  }, []);

  if (available === null) return <Status />;

  function pick(mode: Mode, from: 'camera' | 'library') {
    nextMode.current = mode;
    (from === 'camera' ? camera : library).current?.click();
  }

  async function chosen(file: File | undefined) {
    if (!file) return;
    setError(null);
    const small = await shrinkPhoto(file);
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft({ file: small, url: URL.createObjectURL(small), mode: nextMode.current });
  }

  async function ask() {
    if (!draft) return;
    // A sign's text is read aloud when the answer comes; unlock the voice inside this tap (iOS).
    if (draft.mode === 'sign') engine.prime();
    setAsking(true);
    setError(null);
    const form = new FormData();
    form.append('image', draft.file, 'foto.jpg');
    form.append('mode', draft.mode);
    if (question.trim()) form.append('question', question.trim());
    try {
      const res = await fetch('/api/vision', { method: 'POST', body: form });
      const text = await res.text();
      if (!res.ok) throw new ApiError(res.status, res.statusText, problemDetail(text));
      const saved = JSON.parse(text) as GuideEntry;
      setHistory((h) => [saved, ...h]);
      if (saved.answer.signText) setReadNow(saved.id);
      URL.revokeObjectURL(draft.url);
      setDraft(null);
      setQuestion('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.detail
          ? err.detail
          : err instanceof ApiError && err.status === 429
            ? 'Du har spurgt mange gange på kort tid. Vent et minut, og prøv igen.'
            : 'Det lykkedes ikke at spørge guiden. Tjek forbindelsen, og prøv igen.',
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Spørg guiden</h1>
      <p className="mt-1 mb-6 text-muted">
        Tag et billede af en genstand eller et skilt på udstillingen, så fortæller guiden, hvad det er, og hvor du kan læse mere.
      </p>

      {!available ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm">Billedgenkendelsen er ikke slået til på serveren.</p>
      ) : !online ? (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm">Guiden kræver net. Resten af appen virker offline.</p>
      ) : draft ? (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="relative">
            <img src={draft.url} alt="Dit billede" className="max-h-80 w-full rounded-lg object-contain" />
            <button
              onClick={() => setDraft(null)}
              aria-label="Fjern billedet"
              className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-3 block text-sm text-muted" htmlFor="question">
            {draft.mode === 'sign' ? 'Skilt' : 'Genstand'} – vil du spørge om noget bestemt? (valgfrit)
          </label>
          <input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
            placeholder="Fx: Hvem har båret den?"
            className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2.5"
            onKeyDown={(e) => e.key === 'Enter' && !asking && void ask()}
          />
          <button
            onClick={() => void ask()}
            disabled={asking}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-accent font-medium text-on-accent hover:bg-accent-strong disabled:opacity-60"
          >
            <Send className="h-5 w-5" /> {asking ? 'Guiden kigger på billedet…' : 'Spørg guiden'}
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          <BigButton icon={Camera} title="Fotografér en genstand" onClick={() => pick('object', 'camera')} />
          <BigButton icon={FileText} title="Fotografér et skilt" onClick={() => pick('sign', 'camera')} />
          <button onClick={() => pick('object', 'library')} className="flex items-center justify-center gap-2 py-2 text-sm text-blue underline">
            <ImageUp className="h-4 w-4" /> Vælg et billede, du allerede har taget
          </button>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void chosen(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      <input ref={library} type="file" accept="image/*" hidden onChange={(e) => void chosen(e.target.files?.[0]).finally(() => (e.target.value = ''))} />

      {history.length > 0 && (
        <h2 className="mt-10 mb-3 text-sm font-semibold tracking-widest text-muted uppercase">
          Billeder fra alle ({history.length})
        </h2>
      )}
      <ol className="space-y-6">
        {history.map((h) => (
          <AnswerCard
            key={h.id}
            entry={h}
            readAtOnce={readNow === h.id}
            onDelete={() => {
              if (!window.confirm('Slet billedet og svaret? Det forsvinder for alle.')) return;
              void api(`/api/guide/${h.id}`, { method: 'DELETE' })
                .then(() => setHistory((list) => list.filter((x) => x.id !== h.id)))
                .catch(() => window.alert('Det lykkedes ikke at slette. Er du på nettet?'));
            }}
          />
        ))}
      </ol>
      {history.length > 0 && <p className="mt-6 text-xs text-muted">Svarene er lavet af AI (Gemini) og kan tage fejl. Billeder og svar deles med alle, der bruger appen.</p>}
    </div>
  );
}

function BigButton({ icon: Icon, title, onClick }: { icon: typeof Camera; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-16 items-center gap-4 rounded-xl border-2 border-accent bg-surface px-5 text-left text-lg font-medium hover:bg-accent/10"
    >
      <Icon className="h-7 w-7 shrink-0 text-accent" />
      {title}
    </button>
  );
}

function AnswerCard({ entry, onDelete, readAtOnce = false }: { entry: GuideEntry; onDelete: () => void; readAtOnce?: boolean }) {
  const [zoomed, setZoomed] = useState(false);
  const closeZoom = useCallback(() => setZoomed(false), []);
  const [voice] = useVoiceSettings();
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0); // a new token per reading, so a stopped one quietly ends
  const active = useRef(false);
  const { answer } = entry;
  const when = new Date(entry.createdAt).toLocaleString('da-DK', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  // Leaving the page stops the reading.
  useEffect(
    () => () => {
      if (active.current) engine.cancel();
    },
    [],
  );

  // Read the answer aloud, sentence by sentence, with the reader's chosen voice.
  async function read() {
    if (speaking) {
      run.current++;
      active.current = false;
      engine.cancel();
      return setSpeaking(false);
    }
    const token = ++run.current;
    active.current = true;
    setSpeaking(true);
    // A sign: its own text first, then the explanation.
    const text = answer.signText ? `${answer.signText}\n\n${answer.answer}` : `${answer.title}.\n\n${answer.answer}`;
    for (const s of segmentText(text)) {
      const result = await engine.speak(s.text, voice);
      if (token !== run.current || result !== 'end') break;
    }
    if (token === run.current) {
      active.current = false;
      setSpeaking(false);
    }
  }

  // Just photographed a sign: read its text aloud straight away.
  const readOnce = useRef(false);
  useEffect(() => {
    if (!readAtOnce || readOnce.current) return;
    readOnce.current = true;
    void read();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface">
      <button onClick={() => setZoomed(true)} aria-label="Vis billedet i fuld størrelse" className="block w-full">
        <img src={entry.photo} alt="Billedet, guiden svarede på" loading="lazy" className="max-h-56 w-full object-cover" />
      </button>
      {zoomed && <PhotoViewer src={entry.photo} alt="Billedet, guiden svarede på" onClose={closeZoom} />}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 font-serif text-xl font-semibold">{answer.title}</h2>
          <button
            onClick={() => void read()}
            aria-label={speaking ? 'Stop oplæsning' : 'Læs svaret op'}
            className="shrink-0 rounded-full border border-line p-2 text-accent hover:bg-surface-2"
          >
            {speaking ? <Pause className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button onClick={onDelete} aria-label="Slet billede og svar" className="shrink-0 rounded-full border border-line p-2 text-muted hover:text-danger">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {entry.mode === 'Sign' ? 'Skilt' : 'Genstand'} · {when}
        </p>
        {entry.question && <p className="mt-1 text-sm text-muted italic">»{entry.question}«</p>}
        {answer.signText && (
          <section className="mt-3 rounded-lg border-l-4 border-ochre bg-surface-2 px-4 py-3" aria-label="Teksten på skiltet">
            <p className="mb-1 text-xs font-semibold tracking-widest text-muted uppercase">Teksten på skiltet</p>
            <div className="space-y-2 font-serif text-lg leading-relaxed">
              {answer.signText.split(/\n\s*\n/).map((p, i) => (
                <p key={i} className="whitespace-pre-line">
                  {p}
                </p>
              ))}
            </div>
          </section>
        )}
        <div className="mt-2 space-y-3 font-serif text-lg leading-relaxed">
          {answer.answer.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {answer.chapters.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {answer.chapters.map((c) => (
              <Link
                key={c.id}
                to={`/kapitel/${c.id}`}
                className="rounded-full border border-blue/50 px-3 py-1.5 text-sm text-blue hover:bg-blue/10"
              >
                Kap. {c.number}: {c.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

// Before answers were shared, the phone kept them itself: send each to the server, then forget it.
async function handOverLocal(topic: string) {
  for (const local of await listEntries(topic)) {
    const form = new FormData();
    form.append('image', local.photo, 'foto.jpg');
    form.append(
      'entry',
      JSON.stringify({
        mode: local.mode === 'sign' ? 'Sign' : 'Object',
        question: local.question,
        answer: local.answer,
        createdAt: new Date(local.createdAt).toISOString(),
      }),
    );
    const res = await fetch('/api/guide', { method: 'POST', body: form });
    if (res.ok || res.status === 400) await deleteEntry(local.id); // 400: unusable, don't retry forever
    else break; // try again next time
  }
}
