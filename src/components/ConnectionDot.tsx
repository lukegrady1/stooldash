import clsx from 'clsx';
import type { Connection } from '@/hooks/useGame';

const LABEL: Record<Connection, string> = {
  connecting: 'Connecting',
  live: 'Live',
  polling: 'Connected',
  offline: "Can't reach the game",
};

export function ConnectionDot({
  connection,
  className,
}: {
  connection: Connection;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 text-xs font-semibold text-muted',
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'inline-block size-2 rounded-full',
          connection === 'live' && 'bg-good',
          connection === 'polling' && 'bg-good/70',
          connection === 'connecting' && 'animate-pulse bg-muted',
          connection === 'offline' && 'bg-warn',
        )}
      />
      {LABEL[connection]}
    </span>
  );
}
