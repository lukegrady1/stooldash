import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Page chrome: a small wordmark bar and a width-constrained main column. */
export function Shell({
  children,
  width = 'md',
  right,
  className,
}: {
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          Balderdash
        </Link>
        <div className="flex items-center gap-3">{right}</div>
      </header>
      <main
        className={clsx(
          'mx-auto w-full flex-1 px-4 pb-10',
          width === 'sm' && 'max-w-md',
          width === 'md' && 'max-w-2xl',
          width === 'lg' && 'max-w-5xl',
          className,
        )}
      >
        {children}
      </main>
    </div>
  );
}
