import clsx from 'clsx';
import type { PublicPlayer } from '@/engine/types';

export interface StatusChipsProps {
  players: PublicPlayer[];
  /** Which status counts as "done" for this phase. */
  done?: 'submitted' | 'voted';
  highlightId?: string | null;
  onKick?: (playerId: string) => void;
  className?: string;
}

/** One chip per player: a ✓ when done, dimmed when inactive, ★ for "knew it". */
export function StatusChips({ players, done, highlightId, onKick, className }: StatusChipsProps) {
  if (players.length === 0) {
    return <p className={clsx('text-sm text-muted', className)}>Nobody has joined yet.</p>;
  }
  return (
    <ul className={clsx('flex flex-wrap gap-2', className)} aria-label="Players">
      {players.map((p) => {
        const isDone = done ? p.status === done : false;
        const knewIt = p.status === 'knew_it';
        const label = `${p.name}${knewIt ? ', knew it' : isDone ? ', done' : ''}${p.active ? '' : ', away'}`;
        return (
          <li
            key={p.id}
            className={clsx(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold transition-opacity',
              isDone || knewIt
                ? 'border-good/50 bg-good/10 text-good'
                : 'border-line bg-panel text-ink',
              !p.active && 'opacity-45',
              highlightId === p.id && 'ring-2 ring-brand ring-offset-2 ring-offset-desk',
            )}
            aria-label={label}
            title={p.active ? undefined : 'Away'}
          >
            <span aria-hidden className="w-3 text-center">
              {knewIt ? '★' : isDone ? '✓' : ''}
            </span>
            <span className="max-w-[9rem] truncate">{p.name}</span>
            {onKick ? (
              <button
                type="button"
                onClick={() => onKick(p.id)}
                className="-mr-1.5 ml-0.5 grid size-7 place-items-center rounded-full text-muted hover:bg-warn/15 hover:text-warn"
                aria-label={`Remove ${p.name}`}
              >
                ×
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
