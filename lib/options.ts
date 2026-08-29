import type { ColorMode, RampName } from '@/src/lib/types';

export type Mode = 'upload' | 'webcam';

/**
 * How a glyph gets chosen for each cell.
 *
 * `ramp`     — average brightness maps to a position in a character ramp. Fast,
 *              smooth tone, but blind to shape: it cannot tell `/` from `\`.
 * `shape`    — the cell's ink pattern is matched against every glyph's bitmap,
 *              so edges and diagonals survive. Slower, and flat regions tend to
 *              settle on one repeated character.
 * `classic`  — the common approach found in other converters, kept honest for
 *              comparison: Rec.601 luminance, no contrast stretch, plain ramp.
 */
export type Engine = 'ramp' | 'shape' | 'classic';

export interface LensOptions {
  engine: Engine;
  /** Shape engine only: 0 pure shape, 1 pure tone. */
  toneWeight: number;
  cols: number;
  ramp: RampName;
  charAspect: number;
  gamma: number;
  clip: number;
  autoLevels: boolean;
  invert: boolean;
  color: boolean;
  colorMode: ColorMode;
  dither: boolean;
  edges: boolean;
  edgeThreshold: number;
  /** Display only — does not affect conversion. */
  fontSize: number;
}

/**
 * Tuned for printing on paper, which is what this design is.
 *
 * `invert: true` because the ramp's default direction assumes light text on a
 * dark ground. On pale stock that is backwards: a sparse glyph lets the paper
 * through, so dark regions would come out light. Inverting makes a dark region
 * dense ink, which is simply how a press works. The user-facing control is
 * therefore labelled "Negative" and maps to `invert: false`.
 *
 * `colorMode: 'direct'` for the same reason. Normalising each cell to full
 * brightness fixes double-darkening on a DARK ground, but on paper density and
 * ink colour are supposed to compound — that is what makes a shadow dark.
 * Normalising here just blows the picture out.
 */
export const DEFAULTS: LensOptions = {
  engine: 'ramp',
  toneWeight: 0.85,
  cols: 140,
  ramp: 'blocks',
  charAspect: 0.55,
  gamma: 1,
  clip: 0.01,
  autoLevels: true,
  invert: true,
  color: true,
  colorMode: 'direct',
  dither: false,
  edges: false,
  edgeThreshold: 0.5,
  fontSize: 9,
};

/**
 * Live colour is the expensive path: roughly 10 ms at 200 columns and 30 ms at
 * 300, against a 16.7 ms frame budget. Still images can go as wide as they
 * like; a webcam feed cannot.
 */
export const MAX_COLS = { upload: 300, webcam: 200 } as const;

export const RAMP_CHOICES = [
  { value: 'blocks' as const, label: 'Blocks' },
  { value: 'simple' as const, label: 'Simple' },
  { value: 'detailed' as const, label: 'Detailed' },
];

export const ENGINE_CHOICES = [
  { value: 'ramp' as const, label: 'Ramp' },
  { value: 'shape' as const, label: 'Shape' },
  { value: 'classic' as const, label: 'Classic' },
];

export const COLOR_CHOICES = [
  { value: 'direct' as const, label: 'Ink' },
  { value: 'solid' as const, label: 'Mosaic' },
  { value: 'normalized' as const, label: 'Vivid' },
];
