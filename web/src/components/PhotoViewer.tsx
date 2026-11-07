import { X } from 'lucide-react';
import { useEffect } from 'react';

// A photo on the whole screen, uncropped. Tap anywhere (or ✕ / Esc) to close; the browser's
// own pinch-zoom still works for a closer look.
export default function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Billedet i fuld størrelse"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      <button
        onClick={onClose}
        aria-label="Luk billedet"
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 rounded-full bg-black/60 p-2 text-white"
      >
        <X className="h-6 w-6" />
      </button>
    </div>
  );
}
