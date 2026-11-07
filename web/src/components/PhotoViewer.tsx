import { Download, X } from 'lucide-react';
import { useEffect } from 'react';

// A photo on the whole screen, uncropped. Tap anywhere (or ✕ / Esc) to close; the browser's
// own pinch-zoom still works for a closer look. With download, a button saves the photo.
export default function PhotoViewer({ src, alt, download, onClose }: { src: string; alt: string; download?: string; onClose: () => void }) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black p-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
      {download && (
        <a
          href={download}
          download
          onClick={(e) => e.stopPropagation()}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-white"
        >
          <Download className="h-5 w-5" /> Hent billedet
        </a>
      )}
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
