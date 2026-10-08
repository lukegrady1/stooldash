import clsx from 'clsx';

export function JoinCode({ code, className }: { code: string; className?: string }) {
  const spaced = Array.from(code).join(' ');
  return (
    <p
      className={clsx('join-code select-all text-center', className)}
      aria-label={`Join code ${spaced}`}
    >
      {code}
    </p>
  );
}
