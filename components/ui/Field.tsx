'use client';

import { useId } from 'react';

export const FIELD_LABEL = 'text-[9.5px] font-bold uppercase tracking-[0.11em] text-muted';

/** A labelled range. The number is part of the label so it never needs a tooltip. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = String,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-[132px] flex-col gap-[3px]">
      <label htmlFor={id} className={`${FIELD_LABEL} flex justify-between gap-2`}>
        <span>{label}</span>
        <span className="text-ink tabular-nums">{format(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

/** Native select, restyled. Native because it is genuinely better on mobile. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-[3px]">
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="keyline bg-field px-2 py-[3px] pr-6 text-[11px] font-semibold text-ink
                   appearance-none bg-[length:8px] bg-no-repeat
                   [background-position:right_7px_center]
                   [background-image:linear-gradient(45deg,transparent_50%,var(--color-ink)_50%),linear-gradient(135deg,var(--color-ink)_50%,transparent_50%)]
                   [background-size:5px_5px,5px_5px]
                   [background-position:calc(100%-11px)_calc(50%+1px),calc(100%-6px)_calc(50%+1px)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A checkbox drawn as a press-toggle.
 *
 * The whole control is the hit target and the "on" state is a filled ink
 * block, not a tick — at this size a tick is a smudge.
 */
export function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'press keyline flex items-center gap-2 px-2.5 py-[5px]',
        'text-[10px] font-bold uppercase tracking-[0.08em]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
        checked ? 'bg-ink text-paper drop-sm' : 'bg-field text-muted',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'block h-[9px] w-[9px] border-2 border-current',
          checked ? 'bg-orange' : 'bg-transparent',
        ].join(' ')}
      />
      {label}
    </button>
  );
}

/**
 * A row of mutually exclusive values, printed as one block.
 *
 * Same construction as the mode tabs — a single keyline around the group with
 * rules between the cells — so the set reads as one object rather than as a
 * huddle of separate buttons. Nothing is selected when the current value falls
 * outside the set; that absence is the "custom" state, and it is deliberate:
 * lighting up the nearest step would claim a precision the value does not have.
 *
 * Coarse pointers get 44px cells from the global button rule in globals.css.
 */
export function Segmented<T extends string | number>({
  ariaLabel,
  value,
  options,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: readonly { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="keyline flex bg-field"
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={[
              'min-w-0 flex-1 px-2 py-[4px] transition-none',
              'text-[10px] font-bold uppercase tracking-[0.08em]',
              'disabled:cursor-not-allowed disabled:opacity-40',
              i > 0 ? 'border-l-[2.5px] border-ink' : '',
              // Named explicitly so :hover cannot win at equal specificity and
              // silently strip the selected cell's fill.
              active ? 'bg-ink text-paper hover:bg-ink' : 'text-muted hover:bg-stage',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
