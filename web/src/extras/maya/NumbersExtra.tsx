import { useState } from 'react';
import BarDot from './BarDot';
import { vigesimal } from './calendar';

const Places = ['enere', 'tyvere', 'fire hundreder', 'otte tusinder', 'hundrede og tres tusinder'];

// "Tal med prikker og streger": a number written in stacked places of twenty, highest on top.
export default function NumbersExtra() {
  const [text, setText] = useState('2026');
  const n = Math.max(0, Math.min(3_199_999, Math.floor(Number(text) || 0)));
  const digits = vigesimal(n);

  return (
    <div>
      <label htmlFor="number" className="block text-sm text-muted">
        Skriv et tal (0 – 3.199.999)
      </label>
      <input
        id="number"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 7))}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-lg tabular-nums"
      />

      <section className="mt-6 rounded-xl border border-line bg-surface p-4" aria-label={`${n} med mayatal`}>
        <ol className="space-y-4">
          {digits.map((digit, i) => {
            const place = digits.length - 1 - i;
            return (
              <li key={i} className="flex items-center gap-4 border-b border-line pb-4 last:border-0 last:pb-0">
                <div className="flex w-20 shrink-0 justify-center">
                  <BarDot value={digit} size={56} />
                </div>
                <p className="text-sm">
                  <span className="font-medium">{digit}</span> × {(20 ** place).toLocaleString('da-DK')}{' '}
                  <span className="text-muted">({Places[place]})</span>
                </p>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 font-serif text-lg">
          = {digits.map((d, i) => `${d}×${(20 ** (digits.length - 1 - i)).toLocaleString('da-DK')}`).join(' + ')} ={' '}
          <strong>{n.toLocaleString('da-DK')}</strong>
        </p>
      </section>

      <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
        <p>En prik er 1, en streg er 5, og en skal er 0. Etagerne læses oppefra og ned, og hver etage er 20 gange mere værd end den under.</p>
        <p className="mt-2 text-muted">I den lange kalender er tredje etage dog 360 (18 × 20) i stedet for 400 – så året passer bedre.</p>
      </div>
    </div>
  );
}
