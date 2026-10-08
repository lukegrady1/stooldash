import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface IndexCardProps {
  text: string;
  /** Letter tag shown in the top margin (A, B, C…). */
  letter?: string;
  /** Small note in the top-right margin. */
  corner?: ReactNode;
  /** Highlight the text with the yellow marker (the real definition at reveal). */
  highlight?: boolean;
  picked?: boolean;
  disabled?: boolean;
  hover?: boolean;
  /** Content below the text (reveal details). */
  footer?: ReactNode;
  as?: 'div' | 'button';
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  ariaPressed?: boolean;
}

/**
 * The index card. Every definition, real or fake, is rendered here in the same
 * handwriting font so nothing in the styling gives the real one away.
 */
export function IndexCard({
  text,
  letter,
  corner,
  highlight,
  picked,
  disabled,
  hover,
  footer,
  as = 'div',
  onClick,
  ariaLabel,
  className,
  style,
  ariaPressed,
}: IndexCardProps) {
  const classes = clsx(
    'index-card w-full text-left',
    hover && !disabled && 'index-card--hover cursor-pointer',
    picked && 'index-card--picked',
    disabled && 'index-card--disabled',
    className,
  );
  const inner = (
    <>
      {letter ? (
        <span className="index-card__tag" aria-hidden>
          {letter}
        </span>
      ) : null}
      {corner ? <span className="index-card__corner">{corner}</span> : null}
      <p className="index-card__text">
        {highlight ? <mark className="highlight">{text}</mark> : text}
      </p>
      {footer ? <div className="mt-2 font-ui text-sm leading-5">{footer}</div> : null}
    </>
  );
  if (as === 'button') {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={ariaPressed}
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={classes} aria-label={ariaLabel} style={style}>
      {inner}
    </div>
  );
}
