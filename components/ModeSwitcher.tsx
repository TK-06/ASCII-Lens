'use client';

import type { Mode } from '@/lib/options';

const TABS: { id: Mode; label: string }[] = [
  { id: 'upload', label: 'Upload Photo' },
  { id: 'webcam', label: 'Webcam Mode' },
];

/** The only navigation in the product, so it sits dead centre of the masthead. */
export function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div role="tablist" aria-label="Input mode" className="keyline drop-sm flex bg-field">
      {TABS.map((tab, i) => {
        const active = tab.id === mode;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={[
              'px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-none sm:px-5',
              i === 0 ? 'border-r-[2.5px] border-ink' : '',
              // Named explicitly so :hover cannot win at equal specificity and
              // silently strip the selected tab's fill.
              active ? 'bg-ink text-paper hover:bg-ink' : 'text-muted hover:bg-stage',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
