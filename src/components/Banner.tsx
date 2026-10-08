import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Banner({
  tone = 'info',
  children,
  className,
  onDismiss,
}: {
  tone?: 'info' | 'warn' | 'good';
  children: ReactNode;
  className?: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === 'warn' ? 'alert' : 'status'}
      className={clsx(
        'flex items-start justify-between gap-3 rounded-xl border-2 px-4 py-3 text-sm font-semibold',
        tone === 'info' && 'border-line bg-panel text-ink',
        tone === 'warn' && 'border-warn/40 bg-warn/10 text-warn',
        tone === 'good' && 'border-good/40 bg-good/10 text-good',
        className,
      )}
    >
      <div>{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full hover:bg-ink/10"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
