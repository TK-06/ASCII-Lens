'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'ink' | 'blue' | 'orange' | 'ghost';

const SURFACE: Record<Variant, string> = {
  ink: 'bg-ink text-paper',
  blue: 'bg-blue text-paper',
  orange: 'bg-orange text-ink',
  ghost: 'bg-field text-ink',
};

export interface PressProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

/**
 * The one button in the system.
 *
 * Hard keyline, zero radius, and a solid offset shadow it sinks into when
 * pressed — depth by displacement rather than by blur, which is how a second
 * ink pass actually sits off-register from the first.
 */
export function Press({
  variant = 'ghost',
  className = '',
  children,
  ...rest
}: PressProps) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        'press drop-sm keyline',
        'px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
        SURFACE[variant],
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}
