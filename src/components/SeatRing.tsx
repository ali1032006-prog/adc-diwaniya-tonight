import { usePrefs } from '../lib/prefs';

export type Seat = { initials: string; mine?: boolean } | null;

interface Props {
  game: 'kout' | 'baloot' | 'tarneeb' | 'trix';
  seats: Seat[]; // length 6 for Kout, 4 for the others; null = open seat
  size?: number;
  decorative?: boolean; // true when a nearby text already says the same thing
}

export const SEATS_FOR: Record<Props['game'], number> = { kout: 6, baloot: 4, tarneeb: 4, trix: 4 };

/** Seat centre on a ring around the table, starting at the top and running clockwise. */
export function seatPosition(i: number, n: number, radius = 37): { x: number; y: number } {
  const a = (-90 + (360 / n) * i) * (Math.PI / 180);
  return { x: +(50 + radius * Math.cos(a)).toFixed(2), y: +(50 + radius * Math.sin(a)).toFixed(2) };
}

/** The live seat ring: a card table seen from above with its seats around it. */
export function SeatRing({ game, seats, size = 112, decorative = false }: Props) {
  const { t, fmt } = usePrefs();
  const n = seats.length;
  const open = seats.filter((s) => s === null).length;
  const label = t.seatRing(t.games[game], n - open, n, open, fmt);
  return (
    <svg
      className="seat-ring"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <circle className="seat-ring__table" cx="50" cy="50" r="22" />
      <text className="seat-ring__game" x="50" y="50" dominantBaseline="central" textAnchor="middle">
        {t.games[game]}
      </text>
      {seats.map((s, i) => {
        const { x, y } = seatPosition(i, n);
        return s === null ? (
          <g key={`o${i}`} className="seat seat--open">
            <circle cx={x} cy={y} r="10" />
            <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} />
          </g>
        ) : (
          <g key={`t${i}`} className={s.mine ? 'seat seat--taken seat--mine' : 'seat seat--taken'}>
            <circle cx={x} cy={y} r="10" />
            <text x={x} y={y} dominantBaseline="central" textAnchor="middle">
              {s.initials}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
