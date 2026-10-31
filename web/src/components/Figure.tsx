import { mediaUrl, type Image } from '../api';

// An illustration or photo with caption; illustrations are marked as such.
export default function Figure({ image, className = '' }: { image: Image; className?: string }) {
  return (
    <figure className={className}>
      <div className="codex-frame bg-surface">
        <img src={mediaUrl(image.src)} alt={image.alt ?? ''} className="w-full rounded-lg" loading="lazy" />
      </div>
      {(image.caption || image.credit || image.illustration) && (
        <figcaption className="mt-2 text-sm text-muted">
          {image.caption}
          {image.illustration && <span className="ml-1 italic">(Illustration – ikke et fotografi.)</span>}
          {image.credit && <span className="block text-xs">{image.credit}</span>}
        </figcaption>
      )}
    </figure>
  );
}
