'use client';

import { useId, useState } from 'react';

import { Choice, FIELD_LABEL, Segmented, Slider, Toggle } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { useCoarsePointer } from '@/lib/useCoarsePointer';
import {
  COLOR_CHOICES,
  DEFAULTS,
  ENGINE_CHOICES,
  MAX_COLS,
  RAMP_CHOICES,
  RESOLUTION_PRESETS,
  type LensOptions,
  type Mode,
} from '@/lib/options';

type Patch = Partial<LensOptions>;

const MIN_COLS = 30;

/**
 * Resolution — how many characters wide the picture is drawn.
 *
 * This is the only control that changes what the picture *is* rather than how
 * it is toned, so it gets its own block at the head of the bar and roughly
 * twice the width of a plain field. The presets cover the four answers people
 * actually want; the slider is there for everything between them. They are one
 * value, not two settings that can disagree — which is why no preset lights up
 * when the slider sits between two steps.
 */
function Resolution({
  cols,
  mode,
  disabled,
  onChange,
}: {
  cols: number;
  mode: Mode;
  disabled: boolean;
  onChange: (patch: Patch) => void;
}) {
  const id = useId();
  const max = MAX_COLS[mode];
  const value = Math.min(cols, max);

  return (
    <div className="flex min-w-[210px] flex-col gap-[5px] sm:min-w-[248px]">
      <label htmlFor={id} className={`${FIELD_LABEL} flex justify-between gap-2`}>
        <span>Resolution</span>
        <span className="text-ink tabular-nums">{value}</span>
      </label>

      <Segmented
        ariaLabel="Resolution presets"
        value={value}
        options={RESOLUTION_PRESETS[mode]}
        disabled={disabled}
        onChange={(next) => onChange({ cols: next })}
      />

      {/* Deliberately the first range in the document: the mobile end-to-end
          run reaches for `input[type=range]` first to push width to its
          ceiling, and that check is the one guarding the iOS canvas limit. */}
      <input
        id={id}
        type="range"
        min={MIN_COLS}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange({ cols: Number(e.target.value) })}
        className="w-full"
      />
    </div>
  );
}

/**
 * Tone and effects, as a bar across the top of the working area.
 *
 * On a desktop everything that changes the picture lives on one line, with the
 * rarely-touched tone controls folded behind "More".
 *
 * On a phone the same bar is 450px tall against a ~660px viewport, which would
 * push the picture entirely below the fold — you would land on controls rather
 * than on your image. So touch devices get it collapsed to a single row, with
 * resolution (the control people actually reach for) still on it. There it is
 * the preset row rather than the slider: dragging a thumb along a track is the
 * least pleasant thing you can ask an actual thumb to do, and the exact number
 * is already reported in the masthead. The slider is one tap away behind
 * "Adjust", and the row is the same height either way.
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
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Segmented
              ariaLabel="Resolution"
              value={Math.min(options.cols, maxCols)}
              options={RESOLUTION_PRESETS[mode]}
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
        <Resolution
          cols={options.cols}
          mode={mode}
          disabled={disabled}
          onChange={onChange}
        />

        {/* The rule says where the subject ends and the treatment begins. */}
        <span className="mx-1 hidden h-11 w-[2.5px] bg-ink lg:block" aria-hidden />

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
