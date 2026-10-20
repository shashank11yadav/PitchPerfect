import { cn } from "@/lib/cn";

const WIDTH = 120;
const HEIGHT = 36;
const PAD = 4;

/** The trend in words, so the line is never the only way to read it. */
export function trendSummary(skillTitle: string, scores: readonly number[]): string {
  const first = scores[0];
  const last = scores.at(-1);
  if (first === undefined || last === undefined) return `${skillTitle}: no scored sessions yet.`;
  if (scores.length === 1) return `${skillTitle}: 1 scored session, ${String(first)}.`;
  if (scores.every((score) => score === first)) {
    return `${skillTitle}: ${String(scores.length)} scored sessions, steady at ${String(first)}.`;
  }
  return `${skillTitle}: ${String(scores.length)} scored sessions, from ${String(first)} to ${String(last)}.`;
}

/** Points of a 0–100 line across the box, oldest on the left. */
function points(scores: readonly number[]): [number, number][] {
  const step = scores.length > 1 ? (WIDTH - PAD * 2) / (scores.length - 1) : 0;
  return scores.map((score, index) => [
    scores.length > 1 ? PAD + index * step : WIDTH / 2,
    PAD + ((100 - score) / 100) * (HEIGHT - PAD * 2),
  ]);
}

interface ScoreTrendProps {
  skillTitle: string;
  /** Overall scores, oldest first. */
  scores: readonly number[];
  className?: string;
}

/** One skill's scores over time: a small line drawn in SVG, with the same facts as text. */
export function ScoreTrend({ skillTitle, scores, className }: ScoreTrendProps) {
  const line = points(scores);
  const last = line.at(-1);
  return (
    <figure className={cn("flex items-center gap-4", className)}>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="h-9 w-30 shrink-0 overflow-visible"
      >
        <line
          x1={PAD}
          x2={WIDTH - PAD}
          y1={HEIGHT / 2}
          y2={HEIGHT / 2}
          className="stroke-border"
          strokeDasharray="2 3"
        />
        {line.length > 1 && (
          <polyline
            points={line.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="stroke-primary"
          />
        )}
        {last && <circle cx={last[0]} cy={last[1]} r="3" className="fill-navy" />}
      </svg>
      <figcaption className="text-small text-ink">{trendSummary(skillTitle, scores)}</figcaption>
    </figure>
  );
}
