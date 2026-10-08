import clsx from 'clsx';
import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface Common {
  label: string;
  hint?: string;
  error?: string | null;
  hideLabel?: boolean;
  className?: string;
}

export type TextFieldProps = Common & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

const FIELD =
  'w-full rounded-xl border-2 border-line bg-panel px-4 py-3 text-base text-ink placeholder:text-muted/70 focus:border-brand focus-visible:outline-none';

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  className,
  id,
  ...rest
}: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={inputId}
        className={clsx('text-sm font-semibold text-muted', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-describedby={hint || error ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        className={clsx(FIELD, 'min-h-12', error && 'border-warn')}
        {...rest}
      />
      {error ? (
        <p id={hintId} role="alert" className="text-sm font-semibold text-warn">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export type TextAreaProps = Common &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    handwriting?: boolean;
    counter?: number;
  };

export function TextArea({
  label,
  hint,
  error,
  hideLabel,
  className,
  id,
  handwriting,
  counter,
  value,
  ...rest
}: TextAreaProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const len = typeof value === 'string' ? Array.from(value).length : 0;
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between">
        <label
          htmlFor={inputId}
          className={clsx('text-sm font-semibold text-muted', hideLabel && 'sr-only')}
        >
          {label}
        </label>
        {counter ? (
          <span
            className={clsx(
              'text-xs tabular-nums',
              len > counter ? 'font-semibold text-warn' : 'text-muted',
            )}
            aria-live="polite"
          >
            {len} / {counter}
          </span>
        ) : null}
      </div>
      <textarea
        id={inputId}
        value={value}
        aria-describedby={hint || error ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        className={clsx(
          FIELD,
          'min-h-28 resize-y leading-[30px]',
          handwriting && 'handwriting text-xl',
          error && 'border-warn',
        )}
        {...rest}
      />
      {error ? (
        <p id={hintId} role="alert" className="text-sm font-semibold text-warn">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
