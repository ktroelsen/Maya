import { CloudDownload, CloudOff, Check } from 'lucide-react';
import { useState } from 'react';
import { downloadForOffline, loadOfflineInfo, offlineSupported, useOnline, type OfflineInfo } from '../offline';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('da-DK', { maximumFractionDigits: 1 })} MB`;
const date = (ms: number) =>
  new Date(ms).toLocaleString('da-DK', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// "Hent til offline" on the cover: everything for the museum, in one tap.
export default function OfflineCard() {
  const [info, setInfo] = useState<OfflineInfo | null>(loadOfflineInfo);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const online = useOnline();
  if (!offlineSupported()) return null;

  async function download() {
    setError(null);
    setProgress([0, 1]);
    try {
      setInfo(await downloadForOffline((done, total) => setProgress([done, total])));
    } catch {
      setError('Det lykkedes ikke at hente det hele. Tjek forbindelsen, og prøv igen.');
    } finally {
      setProgress(null);
    }
  }

  return (
    <section className="mt-10 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        {info ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-jade" /> : <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-muted" />}
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{info ? 'Klar til brug uden net' : 'Brug appen uden net'}</h2>
          <p className="mt-1 text-sm text-muted">
            {info
              ? `Hentet ${date(info.savedAt)} (${mb(info.bytes)}). Tekster, billeder, podcast, tidslinje og ordliste virker offline. Oplæsning offline kræver enhedens egen stemme, og kortets baggrund kræver net.`
              : 'Hent alle kapitler, billeder og podcasten til telefonen, så du kan bruge appen på museet, selv uden forbindelse.'}
          </p>
          {progress ? (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-accent transition-all" style={{ width: `${(progress[0] / progress[1]) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted tabular-nums">
                Henter {progress[0]} af {progress[1]}…
              </p>
            </div>
          ) : (
            <button
              onClick={() => void download()}
              disabled={!online}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-accent px-4 text-sm font-medium text-accent hover:bg-accent/10 disabled:opacity-50"
            >
              <CloudDownload className="h-4 w-4" />
              {info ? 'Hent igen (opdatér)' : 'Hent til offline'}
            </button>
          )}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      </div>
    </section>
  );
}
