import type { RampName } from './types';

/**
 * Character ramps, ordered darkest -> lightest source pixel.
 *
 * Each begins with a space so that true black is empty. See AsciiOptions.invert
 * for the light-on-dark vs dark-on-light distinction.
 */
export const RAMPS: Record<RampName, string> = {
  simple: ' .:-=+*#%@',

  /**
   * Derived by measurement, not tradition.
   *
   * The classic 70-character ramp
   * (` .'\`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$`)
   * is ordered by eye, and rasterising it shows why the output looks like
   * noise: 36 of its 69 steps go BACKWARDS in real ink coverage, so the ramp
   * repeatedly reverses direction mid-gradient.
   *
   * This one comes from `npm run ramp -- -n 16`, which rasterises every
   * printable ASCII glyph in Consolas, measures the ink in each character
   * cell, and picks 16 evenly spaced across the coverage range. Result: no
   * backwards steps, and step deviation about a third of the classic ramp's.
   *
   * Coverage is a property of the FONT, so regenerate with `--font` if the app
   * ever ships a different face.
   */
  detailed: ' .-,;+)]aXO8gQ&@',

  blocks: ' ░▒▓█',
};

/** Glyphs used for Sobel edges, indexed by quantised gradient direction. */
export const EDGE_CHARS = ['-', '/', '|', '\\'] as const;

function isRampName(value: string): value is RampName {
  return Object.prototype.hasOwnProperty.call(RAMPS, value);
}

/**
 * Turn an option value into a literal ramp string.
 *
 * A name resolves to its preset; anything else is treated as a literal ramp, so
 * callers can pass their own. Inversion is applied here, by reversing the
 * string, rather than by flipping luminance later - one place, one direction.
 */
export function resolveRamp(ramp: string, invert = false): string {
  const resolved = isRampName(ramp) ? RAMPS[ramp] : ramp;
  if (resolved.length === 0) {
    throw new Error('Ramp must contain at least one character');
  }
  return invert ? [...resolved].reverse().join('') : resolved;
}

/**
 * Map normalised luminance to a ramp index.
 *
 * `value` is clamped to 0-1 first, so the boundaries are exact: 0 always yields
 * the first character and 1 always yields the last. Scaling by `length` and
 * flooring would return `length` at exactly 1.0 and read off the end, which is
 * the classic undefined-character bug in every ASCII art tutorial.
 */
export function rampIndex(value: number, rampLength: number): number {
  if (rampLength <= 1) return 0;
  const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
  return Math.round(clamped * (rampLength - 1));
}
