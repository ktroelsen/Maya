import { Sun, SunDim } from 'lucide-react';
import { setKeepAwake, useKeepAwake, wakeLockSupported } from '../wakeLock';

/** Toggle: keep the screen on as long as the app is open (e.g. while listening). */
export default function KeepAwakeButton({ className = '' }: { className?: string }) {
  const on = useKeepAwake();
  if (!wakeLockSupported()) return null;
  return (
    <button
      onClick={() => setKeepAwake(!on)}
      aria-pressed={on}
      aria-label="Hold skærmen tændt"
      title={on ? 'Skærmen holdes tændt – tryk for at slå fra' : 'Hold skærmen tændt'}
      className={`rounded-lg p-2 ${on ? 'bg-ochre/30 text-fg' : 'text-muted hover:text-fg'} ${className}`}
    >
      {on ? <Sun className="h-5 w-5" /> : <SunDim className="h-5 w-5" />}
    </button>
  );
}
