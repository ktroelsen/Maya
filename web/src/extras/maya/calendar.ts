// The Maya calendars for a date (proleptic Gregorian), with the common GMT correlation:
// the Long Count's day 0 (13.0.0.0.0, 4 Ajaw 8 Kumk'u, in 3114 BC) is Julian Day 584283.
// Check: 21 December 2012 = 13.0.0.0.0 4 Ajaw 3 K'ank'in.
export const Correlation = 584283;

export const DayNames: [string, string][] = [
  ['Imix', 'krokodille, vand'],
  ["Ik'", 'vind'],
  ["Ak'bal", 'nat'],
  ["K'an", 'majs, frø'],
  ['Chikchan', 'slange'],
  ['Kimi', 'død'],
  ["Manik'", 'hjort'],
  ['Lamat', 'stjerne'],
  ['Muluk', 'vand'],
  ['Ok', 'hund'],
  ['Chuwen', 'abe'],
  ['Eb', 'vej'],
  ['Ben', 'siv'],
  ['Ix', 'jaguar'],
  ['Men', 'ørn'],
  ['Kib', 'grib'],
  ['Kaban', 'jord'],
  ["Etz'nab", 'flint'],
  ['Kawak', 'storm'],
  ['Ajaw', 'herre, sol'],
];

export const Months = [
  'Pop', "Wo'", 'Sip', "Sotz'", 'Sek', 'Xul', "Yaxk'in", 'Mol', "Ch'en", 'Yax',
  "Sak'", 'Keh', 'Mak', "K'ank'in", 'Muwan', 'Pax', "K'ayab", "Kumk'u", 'Wayeb',
];

export const LongCountUnits: [string, string][] = [
  ["bak'tun", '144.000 dage, ca. 394 år'],
  ["k'atun", '7.200 dage, ca. 20 år'],
  ['tun', '360 dage'],
  ['winal', '20 dage'],
  ["k'in", '1 dag'],
];

/** Julian Day Number of a calendar date (year, month 1–12, day), proleptic Gregorian. */
export function julianDay(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year); // years below 100 too
  return Math.floor(date.getTime() / 86_400_000) + 2_440_588;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export type MayaDate = {
  days: number; // since 13.0.0.0.0
  longCount: number[]; // bak'tun, k'atun, tun, winal, k'in
  tzolkin: { number: number; name: string; meaning: string };
  haab: { day: number; month: string };
};

export function mayaDate(year: number, month: number, day: number): MayaDate {
  const days = julianDay(year, month, day) - Correlation;
  const longCount = [144_000, 7_200, 360, 20, 1].map((unit, i, units) => {
    const rest = i === 0 ? days : mod(days, units[i - 1]);
    return Math.floor(rest / unit);
  });
  const [name, meaning] = DayNames[mod(days + 19, 20)];
  const haab = mod(days + 348, 365);
  return {
    days,
    longCount,
    tzolkin: { number: mod(days + 3, 13) + 1, name, meaning },
    haab: { day: haab % 20, month: Months[Math.floor(haab / 20)] },
  };
}

/** A number in base 20, highest place first (pure vigesimal, as for counting – not the Long Count). */
export function vigesimal(n: number): number[] {
  const digits = [n % 20];
  for (let rest = Math.floor(n / 20); rest > 0; rest = Math.floor(rest / 20)) digits.unshift(rest % 20);
  return digits;
}
