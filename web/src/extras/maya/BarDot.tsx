// One Maya numeral, 0–19: dots for ones above bars for fives; a shell for zero. Codex colours.
export default function BarDot({ value, size = 64, label }: { value: number; size?: number; label?: string }) {
  const bars = Math.floor(value / 5);
  const dots = value % 5;
  const w = 100;
  const barH = 12;
  const gap = 6;
  const dotR = 7;
  const h = value === 0 ? 60 : bars * (barH + gap) + (dots ? dotR * 2 + gap : 0);
  return (
    <svg
      viewBox={`0 0 ${w} ${Math.max(h, 20)}`}
      width={size}
      height={(size * Math.max(h, 20)) / w}
      role="img"
      aria-label={label ?? String(value)}
      className="overflow-visible"
    >
      {value === 0 ? (
        // A stylised shell.
        <g stroke="var(--color-fg)" strokeWidth={4} fill="var(--color-ochre)">
          <ellipse cx={50} cy={30} rx={40} ry={24} />
          <path d="M18 30 Q50 6 82 30 M26 38 Q50 20 74 38" fill="none" />
        </g>
      ) : (
        <>
          {Array.from({ length: dots }, (_, i) => (
            <circle
              key={`d${i}`}
              cx={w / 2 + (i - (dots - 1) / 2) * (dotR * 2 + 6)}
              cy={dotR}
              r={dotR}
              fill="var(--color-blue)"
              stroke="var(--color-fg)"
              strokeWidth={3}
            />
          ))}
          {Array.from({ length: bars }, (_, i) => (
            <rect
              key={`b${i}`}
              x={8}
              y={(dots ? dotR * 2 + gap : 0) + i * (barH + gap)}
              width={w - 16}
              height={barH}
              rx={4}
              fill="var(--color-accent)"
              stroke="var(--color-fg)"
              strokeWidth={3}
            />
          ))}
        </>
      )}
    </svg>
  );
}
