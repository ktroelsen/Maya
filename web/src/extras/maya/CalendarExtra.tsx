import { useState } from 'react';
import BarDot from './BarDot';
import { LongCountUnits, mayaDate } from './calendar';

const today = () => new Date().toISOString().slice(0, 10);

// "Din dag i mayakalenderen": a date in the Long Count, the 260-day tzolk'in and the 365-day haab'.
export default function CalendarExtra() {
  const [value, setValue] = useState(today);
  const [y, m, d] = value.split('-').map(Number);
  const valid = y > 0 && m > 0 && d > 0;
  const date = valid ? mayaDate(y, m, d) : null;

  return (
    <div>
      <label htmlFor="date" className="block text-sm text-muted">
        Vælg en dato – fx din fødselsdag
      </label>
      <input
        id="date"
        type="date"
        value={value}
        min="1000-01-01"
        max="2999-12-31"
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-lg"
      />

      {date && (
        <>
          <section className="mt-6 rounded-xl border border-line bg-surface p-4">
            <h2 className="font-semibold text-accent">Den lange kalender</h2>
            <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">{date.longCount.join('.')}</p>
            <p className="text-sm text-muted">
              {date.days.toLocaleString('da-DK')} dage siden skabelsesdatoen i 3114 f.Kr.
            </p>
            <ol className="mt-4 space-y-3">
              {date.longCount.map((n, i) => (
                <li key={LongCountUnits[i][0]} className="flex items-center gap-4">
                  <div className="flex w-20 shrink-0 justify-center">
                    <BarDot value={n} size={56} label={`${n} ${LongCountUnits[i][0]}`} />
                  </div>
                  <div>
                    <p className="font-medium">
                      {n} {LongCountUnits[i][0]}
                    </p>
                    <p className="text-xs text-muted">{LongCountUnits[i][1]}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="font-semibold text-accent">Den hellige kalender (tzolk'in)</h2>
              <div className="mt-2 flex items-center gap-4">
                <BarDot value={date.tzolkin.number} size={56} />
                <div>
                  <p className="font-serif text-2xl font-semibold">
                    {date.tzolkin.number} {date.tzolkin.name}
                  </p>
                  <p className="text-sm text-muted">{date.tzolkin.name} betyder »{date.tzolkin.meaning}«</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">260 dage: tallene 1–13 og 20 dagnavne. Dagtællere i Guatemala bruger den stadig.</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <h2 className="font-semibold text-accent">Solåret (haab')</h2>
              <div className="mt-2 flex items-center gap-4">
                <BarDot value={date.haab.day} size={56} />
                <p className="font-serif text-2xl font-semibold">
                  {date.haab.day} {date.haab.month}
                </p>
              </div>
              <p className="mt-2 text-xs text-muted">365 dage: 18 måneder af 20 dage og 5 uheldige dage, Wayeb.</p>
            </div>
          </section>

          <p className="mt-4 text-xs text-muted">
            Omregnet med den mest brugte korrelation (GMT, 584283). Den 21. december 2012 giver 13.0.0.0.0 4 Ajaw 3 K'ank'in.
          </p>
        </>
      )}
    </div>
  );
}
