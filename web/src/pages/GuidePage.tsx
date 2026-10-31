import { Camera, FileText, ImageUp, Pause, Send, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, fetchVisionAvailable, problemDetail, type VisionAnswer } from '../api';
import Status from '../components/Status';
import { useOnline } from '../offline';
import { shrinkPhoto } from '../photo';
import { segmentText } from '../speech/segments';
import { engine, useVoiceSettings } from '../speech/settings';

type Mode = 'object' | 'sign';
type Asked = { id: number; photo: string; mode: Mode; question: string; answer: VisionAnswer };

// "Guide in the pocket": photograph an object or a sign at the exhibition and get it explained,
// with the chapters that tell more. Needs a network (Gemini on the server).
export default function GuidePage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const online = useOnline();
  const [draft, setDraft] = useState<{ file: Blob; url: string; mode: Mode } | null>(null);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Asked[]>([]);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const nextMode = useRef<Mode>('object');

  useEffect(() => void fetchVisionAvailable().then(setAvailable), []);

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
      const answer = JSON.parse(text) as VisionAnswer;
      setHistory((h) => [{ id: Date.now(), photo: draft.url, mode: draft.mode, question: question.trim(), answer }, ...h]);
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

      <ol className="mt-8 space-y-6">
        {history.map((h) => (
          <AnswerCard key={h.id} asked={h} />
        ))}
      </ol>
      {history.length > 0 && <p className="mt-6 text-xs text-muted">Svarene er lavet af AI (Gemini) og kan tage fejl. De gemmes ikke.</p>}
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

function AnswerCard({ asked }: { asked: Asked }) {
  const [voice] = useVoiceSettings();
  const [speaking, setSpeaking] = useState(false);
  const run = useRef(0); // a new token per reading, so a stopped one quietly ends
  const active = useRef(false);
  const { answer } = asked;

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
    for (const s of segmentText(`${answer.title}.\n\n${answer.answer}`)) {
      const result = await engine.speak(s.text, voice);
      if (token !== run.current || result !== 'end') break;
    }
    if (token === run.current) {
      active.current = false;
      setSpeaking(false);
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface">
      <img src={asked.photo} alt="" className="max-h-56 w-full object-cover" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">{answer.title}</h2>
          <button
            onClick={() => void read()}
            aria-label={speaking ? 'Stop oplæsning' : 'Læs svaret op'}
            className="shrink-0 rounded-full border border-line p-2 text-accent hover:bg-surface-2"
          >
            {speaking ? <Pause className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
        {asked.question && <p className="mt-1 text-sm text-muted italic">»{asked.question}«</p>}
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
