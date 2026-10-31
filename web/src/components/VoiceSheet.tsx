import { Check, Cloud, Play, Smartphone, Square, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchGoogleVoiceAvailable } from '../api';
import { browserEngine, engine, googleEngine, Rates, type Provider, type VoiceSettings } from '../speech/settings';
import type { Voice } from '../speech/SpeechEngine';

type Props = {
  settings: VoiceSettings;
  onChange: (change: Partial<VoiceSettings>) => void;
  onClose: () => void;
};

const Sample = (name: string) => `Hej, jeg hedder ${name}. Sådan lyder jeg, når jeg læser en tekst højt for dig.`;

// Bottom sheet (dialog on desktop): who reads aloud (the device or Google), which voice,
// and how fast.
export default function VoiceSheet({ settings, onChange, onClose }: Props) {
  const [browserVoices, setBrowserVoices] = useState<Voice[]>(() => browserEngine.voices());
  const [googleVoices, setGoogleVoices] = useState<Voice[]>(() => googleEngine.voices());
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [allLanguages, setAllLanguages] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => browserEngine.onVoicesChanged(() => setBrowserVoices(browserEngine.voices())), []);
  useEffect(() => googleEngine.onVoicesChanged(() => setGoogleVoices(googleEngine.voices())), []);
  useEffect(() => void fetchGoogleVoiceAvailable().then(setGoogleAvailable), []);

  // Picking Google for the first time: start with its first voice, so it can read at once.
  useEffect(() => {
    if (settings.provider === 'google' && !settings.googleVoice && googleVoices.length)
      onChange({ googleVoice: googleVoices[0].id });
  }, [settings.provider, settings.googleVoice, googleVoices, onChange]);

  // Stop a preview when the sheet closes.
  useEffect(() => () => engine.cancel(), []);

  async function preview(provider: Provider, voice: Voice | null) {
    const id = `${provider}|${voice?.id ?? ''}`;
    if (previewing === id) {
      engine.cancel();
      return setPreviewing(null);
    }
    setPreviewing(id);
    setPreviewError(null);
    const s: VoiceSettings =
      provider === 'google'
        ? { ...settings, provider, googleVoice: voice!.id }
        : { ...settings, provider, voiceId: voice?.id ?? null };
    const result = await engine.speak(Sample(voice?.name.split(' ')[0] ?? 'standardstemmen'), s);
    if (result === 'error') setPreviewError(engine.lastError(s) ?? 'Stemmen kunne ikke afspilles.');
    setPreviewing((p) => (p === id ? null : p));
  }

  const danish = browserVoices.filter((v) => v.lang.toLowerCase().startsWith('da'));
  const shownBrowser = allLanguages || danish.length === 0 ? browserVoices : danish;
  const genders = ['Kvinde', 'Mand', 'Neutral'].filter((g) => googleVoices.some((v) => v.lang === g));

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Oplæser, stemme og hastighed"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl md:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Oplæser og stemme</h2>
          <button onClick={onClose} aria-label="Luk" className="rounded-lg p-1 text-muted hover:text-fg">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-2 text-sm text-muted">Oplæser</p>
        <div className="mb-6 grid gap-2">
          <ProviderCard
            icon={Smartphone}
            title="Enhedens stemme"
            detail="Gratis og virker uden net. Stopper, når skærmen låses."
            selected={settings.provider === 'browser'}
            onClick={() => onChange({ provider: 'browser' })}
          />
          <ProviderCard
            icon={Cloud}
            title="Google Chirp 3 HD"
            detail={
              googleAvailable
                ? 'AI-stemme i høj kvalitet. Kræver net, kan læse med låst skærm.'
                : 'Ikke sat op på serveren (mangler Google-nøgle).'
            }
            selected={settings.provider === 'google'}
            disabled={!googleAvailable}
            onClick={() => onChange({ provider: 'google' })}
          />
        </div>

        <p className="mb-2 text-sm text-muted">Hastighed</p>
        <div className="mb-6 flex flex-wrap gap-2">
          {Rates.map((r) => (
            <button
              key={r}
              onClick={() => onChange({ rate: r })}
              className={`rounded-full px-3 py-1.5 text-sm tabular-nums ${
                settings.rate === r ? 'bg-accent text-on-accent' : 'bg-surface-2 text-fg'
              }`}
            >
              {r.toLocaleString('da-DK')}×
            </button>
          ))}
        </div>

        {previewError && <p className="mb-3 text-sm text-danger">{previewError}</p>}

        {settings.provider === 'google' ? (
          <>
            <p className="mb-2 text-sm text-muted">Google-stemme</p>
            {googleVoices.length === 0 ? (
              <p className="text-sm text-muted">Henter Googles stemmer…</p>
            ) : (
              genders.map((g) => (
                <div key={g} className="mb-4">
                  <p className="mb-1 px-1 text-xs font-medium tracking-wide text-muted uppercase">
                    {g === 'Kvinde' ? 'Kvinder' : g === 'Mand' ? 'Mænd' : 'Neutrale'}
                  </p>
                  <ul className="space-y-1">
                    {googleVoices
                      .filter((v) => v.lang === g)
                      .map((v) => (
                        <VoiceOption
                          key={v.id}
                          label={v.name}
                          selected={settings.googleVoice === v.id}
                          previewing={previewing === `google|${v.id}`}
                          onSelect={() => onChange({ googleVoice: v.id })}
                          onPreview={() => void preview('google', v)}
                        />
                      ))}
                  </ul>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-muted">Enhedens stemme</p>
              {danish.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={allLanguages} onChange={(e) => setAllLanguages(e.target.checked)} />
                  Vis alle sprog
                </label>
              )}
            </div>
            {browserVoices.length === 0 ? (
              <p className="text-sm text-muted">Browseren har ingen stemmer klar endnu. Prøv at trykke afspil.</p>
            ) : (
              <ul className="space-y-1">
                <VoiceOption
                  label="Standard (dansk)"
                  detail="Enhedens standardstemme"
                  selected={!settings.voiceId}
                  previewing={previewing === 'browser|'}
                  onSelect={() => onChange({ voiceId: null })}
                  onPreview={() => void preview('browser', null)}
                />
                {shownBrowser.map((v) => (
                  <VoiceOption
                    key={v.id}
                    label={v.name}
                    detail={`${v.lang}${v.local ? '' : ' · online'}`}
                    selected={settings.voiceId === v.id}
                    previewing={previewing === `browser|${v.id}`}
                    onSelect={() => onChange({ voiceId: v.id })}
                    onPreview={() => void preview('browser', v)}
                  />
                ))}
              </ul>
            )}
            {danish.length === 0 && browserVoices.length > 0 && (
              <p className="mt-3 text-xs text-muted">
                Enheden har ingen dansk stemme. På Android kan den hentes under Indstillinger → Tekst-til-tale.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProviderCard(props: {
  icon: LucideIcon;
  title: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { icon: Icon, title, detail, selected, disabled, onClick } = props;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
        selected ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/50'
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-accent' : 'text-muted'}`} />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      {selected && <Check className="h-5 w-5 shrink-0 text-accent" />}
    </button>
  );
}

function VoiceOption(props: {
  label: string;
  detail?: string;
  selected: boolean;
  previewing: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const { label, detail, selected, previewing, onSelect, onPreview } = props;
  return (
    <li className={`flex items-center rounded-lg ${selected ? 'bg-accent/15 text-accent' : 'hover:bg-surface-2'}`}>
      <button onClick={onSelect} aria-pressed={selected} className="min-w-0 flex-1 px-3 py-2 text-left">
        <span className="block text-sm">{label}</span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </button>
      <button
        onClick={onPreview}
        aria-label={previewing ? `Stop prøve af ${label}` : `Prøv ${label}`}
        className="mr-1 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted hover:text-accent"
      >
        {previewing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        {previewing ? 'Stop' : 'Prøv'}
      </button>
    </li>
  );
}
