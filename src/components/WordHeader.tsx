import clsx from 'clsx';

export interface WordHeaderProps {
  word: string;
  roundIndex: number;
  totalRounds: number;
  size?: 'sm' | 'lg';
  className?: string;
}

/** "Word 3 of 10", the big word, and its spelling with the letters spaced out. */
export function WordHeader({
  word,
  roundIndex,
  totalRounds,
  size = 'lg',
  className,
}: WordHeaderProps) {
  const spelled = Array.from(word).join(' ');
  return (
    <header className={clsx('text-center', className)}>
      <p className="text-sm font-semibold text-muted">
        Word {roundIndex + 1} of {totalRounds}
      </p>
      <h1 className={clsx('word-display mt-1', size === 'sm' && 'text-[clamp(32px,9vw,52px)]')}>
        {word}
      </h1>
      <p className="spell mt-2 text-sm sm:text-base" aria-label={`Spelled ${spelled}`}>
        {spelled}
      </p>
    </header>
  );
}
