import clsx from 'clsx';
import { rankPlayers } from '@/engine/scoring';
import type { PublicPlayer } from '@/engine/types';

export interface ScoreboardProps {
  players: PublicPlayer[];
  gained: Record<string, number> | null;
  highlightId?: string | null;
  showGain?: boolean;
  className?: string;
}

/** Ranked list with shared ranks for ties, a +gain column and a ★ on the leader(s). */
export function Scoreboard({
  players,
  gained,
  highlightId,
  showGain = true,
  className,
}: ScoreboardProps) {
  const ranked = rankPlayers(players, gained);
  if (ranked.length === 0) return <p className="text-muted">No players.</p>;
  const top = ranked[0]?.score ?? 0;
  return (
    <ol
      className={clsx('overflow-hidden rounded-2xl border-2 border-line bg-panel', className)}
      aria-label="Scoreboard"
    >
      {ranked.map((r) => {
        const leader = r.score === top && top > 0;
        return (
          <li
            key={r.id}
            className={clsx(
              'grid min-h-14 grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b border-line px-4 last:border-b-0',
              highlightId === r.id && 'bg-brand/10',
            )}
            aria-current={highlightId === r.id ? 'true' : undefined}
          >
            <span className="text-lg font-extrabold tabular-nums text-muted">{r.rank}</span>
            <span className="truncate text-lg font-semibold">
              {r.name}
              {leader ? (
                <span
                  className="ml-2 text-hi drop-shadow-[0_1px_0_rgb(0_0_0/0.25)]"
                  aria-label="leader"
                >
                  ★
                </span>
              ) : null}
            </span>
            {showGain ? (
              <span
                className={clsx(
                  'text-sm font-semibold tabular-nums',
                  r.gained > 0 ? 'text-good' : 'text-muted/60',
                )}
              >
                {r.gained > 0 ? `+${r.gained}` : '—'}
              </span>
            ) : (
              <span />
            )}
            <span className="min-w-8 text-right text-xl font-extrabold tabular-nums">
              {r.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
