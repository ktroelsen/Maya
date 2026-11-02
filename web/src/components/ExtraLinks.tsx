import { Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import type { Extra } from '../api';

/** "Prøv selv": cards linking to the topic's interactive extras. */
export default function ExtraLinks({ extras, title = 'Prøv selv' }: { extras: Extra[]; title?: string }) {
  if (extras.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-semibold tracking-widest text-muted uppercase">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {extras.map((e) => (
          <Link key={e.id} to={`/ekstra/${e.id}`} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 hover:border-accent">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <span>
              <span className="block font-medium">{e.title}</span>
              {e.description && <span className="mt-0.5 block text-sm text-muted">{e.description}</span>}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
