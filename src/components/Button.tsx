import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  busy?: boolean;
  children: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-ink hover:brightness-110 active:brightness-95 shadow-[0_2px_0_rgb(0_0_0/0.12)]',
  secondary: 'bg-panel text-ink border-2 border-line hover:border-brand/60 active:bg-desk',
  danger: 'bg-panel text-warn border-2 border-warn/40 hover:bg-warn/10',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-panel/60',
};

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-[15px] rounded-xl',
  lg: 'min-h-14 px-6 text-lg rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  busy = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={clsx(
        'inline-flex items-center justify-center gap-2 font-semibold transition-[filter,background-color,border-color,transform] duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy ? (
        <span
          className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : null}
      {children}
    </button>
  );
}
