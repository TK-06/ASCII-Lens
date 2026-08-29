'use client';

import { useState } from 'react';

import { Choice, Slider, Toggle } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { useCoarsePointer } from '@/lib/useCoarsePointer';
import {
  COLOR_CHOICES,
  DEFAULTS,
  ENGINE_CHOICES,
  MAX_COLS,
  RAMP_CHOICES,
  type LensOptions,
  type Mode,
} from '@/lib/options';

type Patch = Partial<LensOptions>;

/**
 * Tone and effects, as a bar across the top of the working area.
 *
 * On a desktop everything that changes the picture lives on one line, with the
 * rarely-touched tone controls folded behind "More".
 *
 * On a phone the same bar is 450px tall against a ~660px viewport, which would
 * push the picture entirely below the fold — you would land on controls rather
 * than on your image. So touch devices get it collapsed to a single row, with
 * width (the control people actually reach for) still on it.
 */
export function ControlBar({
  options,
  mode,
  disabled,
  onChange,
}: {
  options: LensOptions;
  mode: Mode;
  disabled: boolean;
  onChange: (patch: Patch) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const touch = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const maxCols = MAX_COLS[mode];

  const collapsed = touch && !open;

  if (collapsed) {
    return (
      <section
        aria-label="Tone and effects"
        className="border-b-[2.5px] border-ink bg-paper"
      >
        <div className="mx-auto flex max-w-[1400px] items-end gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Slider
              label="Width"
              value={Math.min(options.cols, maxCols)}
              min={30}
              max={maxCols}
              format={(v) => `${v}`}
              onChange={(cols) => onChange({ cols })}
            />
          </div>
          <Press variant="ink" aria-expanded={false} onClick={() => setOpen(true)}>
            Adjust
          </Press>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Tone and effects"
      className="border-b-[2.5px] border-ink bg-paper"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-end gap-x-5 gap-y-3 px-4 py-3">
        <Slider
          label="Width"
          value={Math.min(options.cols, maxCols)}
          min={30}
          max={maxCols}
          disabled={disabled}
          format={(v) => `${v}`}
          onChange={(cols) => onChange({ cols })}
        />

        <Choice
          label="Engine"
          value={options.engine}
          options={ENGINE_CHOICES}
          onChange={(engine) => onChange({ engine })}
        />

        {/* The ramp only means anything when a ramp is what picks the glyph. */}
        {options.engine !== 'shape' && (
          <Choice
            label="Ramp"
            value={options.ramp}
            options={RAMP_CHOICES}
            onChange={(ramp) => onChange({ ramp })}
          />
        )}

        {options.engine === 'shape' && (
          <Slider
            label="Shape / tone"
            value={options.toneWeight}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            format={(v) => v.toFixed(2)}
            onChange={(toneWeight) => onChange({ toneWeight })}
          />
        )}

        {options.color && (
          <Choice
            label="Colour"
            value={options.colorMode}
            options={COLOR_CHOICES}
            onChange={(colorMode) => onChange({ colorMode })}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 pb-[1px]">
          <Toggle
            label="Colour"
            checked={options.color}
            disabled={disabled}
            onChange={(color) => onChange({ color })}
          />
          <Toggle
            label="Dither"
            checked={options.dither}
            disabled={disabled}
            onChange={(dither) => onChange({ dither })}
          />
          <Toggle
            label="Edges"
            checked={options.edges}
            disabled={disabled}
            onChange={(edges) => onChange({ edges })}
          />
          {/* On paper the printed orientation IS the inverted ramp, so the
              control the user sees is the departure from it, not the default. */}
          <Toggle
            label="Negative"
            checked={!options.invert}
            disabled={disabled}
            onChange={(negative) => onChange({ invert: !negative })}
          />
        </div>

        <div className="ml-auto flex items-center gap-2 pb-[1px]">
          <Press
            variant={expanded ? 'ink' : 'ghost'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Less' : 'More'}
          </Press>
          <Press onClick={() => onChange({ ...DEFAULTS, cols: options.cols })}>
            Reset
          </Press>
          {touch && (
            <Press variant="orange" onClick={() => setOpen(false)}>
              Done
            </Press>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t-2 border-dashed border-rule bg-stage">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-end gap-x-5 gap-y-3 px-4 py-3">
            <Slider
              label="Gamma"
              value={options.gamma}
              min={0.3}
              max={2.5}
              step={0.05}
              disabled={disabled}
              format={(v) => v.toFixed(2)}
              onChange={(gamma) => onChange({ gamma })}
            />
            <Slider
              label="Clip"
              value={options.clip}
              min={0}
              max={0.1}
              step={0.005}
              disabled={disabled}
              format={(v) => v.toFixed(3)}
              onChange={(clip) => onChange({ clip })}
            />
            <Slider
              label="Edge threshold"
              value={options.edgeThreshold}
              min={0.05}
              max={0.95}
              step={0.05}
              disabled={disabled || !options.edges}
              format={(v) => v.toFixed(2)}
              onChange={(edgeThreshold) => onChange({ edgeThreshold })}
            />
            <Slider
              label="Char aspect"
              value={options.charAspect}
              min={0.3}
              max={1}
              step={0.01}
              disabled={disabled}
              format={(v) => v.toFixed(2)}
              onChange={(charAspect) => onChange({ charAspect })}
            />
            <Slider
              label="Zoom"
              value={options.fontSize}
              min={4}
              max={20}
              disabled={disabled}
              format={(v) => `${v}px`}
              onChange={(fontSize) => onChange({ fontSize })}
            />
            <div className="pb-[3px]">
              <Toggle
                label="Auto-levels"
                checked={options.autoLevels}
                disabled={disabled}
                onChange={(autoLevels) => onChange({ autoLevels })}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
