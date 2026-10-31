import { WifiOff } from 'lucide-react';
import { useOnline } from '../offline';

/** A thin strip when the device has no network. */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-ochre/30 px-3 py-1.5 text-xs" role="status">
      <WifiOff className="h-3.5 w-3.5" /> Du er offline – det hentede indhold virker stadig.
    </div>
  );
}
