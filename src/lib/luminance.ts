/**
 * Luminance weight sets.
 *
 * `bt709` is the Rec.709 / sRGB set from the project brief and weights green
 * hardest. `bt601` is the older Rec.601 set, which most ASCII converters use —
 * including Glyphcast — and lifts red and blue relative to green. The two
 * disagree most on saturated reds and greens, so the choice is visible on a
 * colourful source and invisible on a grey one.
 */
export const LUMA_WEIGHTS = {
  bt709: [0.21, 0.72, 0.07],
  bt601: [0.299, 0.587, 0.114],
} as const;

export type LumaSet = keyof typeof LUMA_WEIGHTS;

/** Perceptual luminance, 0-255, using Rec.709 weights. */
export function luminance(r: number, g: number, b: number): number {
  return 0.21 * r + 0.72 * g + 0.07 * b;
}

/** Perceptual luminance, 0-255, with an explicit weight set. */
export function luminanceWith(
  r: number,
  g: number,
  b: number,
  set: LumaSet,
): number {
  const [wr, wg, wb] = LUMA_WEIGHTS[set];
  return wr * r + wg * g + wb * b;
}

export interface LevelOptions {
  autoLevels: boolean;
  clip: number;
  gamma: number;
}

/**
 * Find the luminance range to stretch, by clipping a fraction of the histogram
 * off each end. Returns raw 0-255 bounds.
 *
 * Clipping a percentile rather than taking the true min/max means one stray
 * specular highlight or one crushed shadow pixel can't veto the stretch for the
 * whole image.
 */
export function levelBounds(
  luma: Float32Array,
  clip: number,
): { lo: number; hi: number } {
  const histogram = new Int32Array(256);
  for (let i = 0; i < luma.length; i++) {
    const v = luma[i];
    const bin = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    histogram[bin]++;
  }

  const cut = Math.floor(luma.length * Math.max(0, Math.min(0.2, clip)));

  let lo = 0;
  for (let seen = 0; lo < 255; lo++) {
    seen += histogram[lo];
    if (seen > cut) break;
  }

  let hi = 255;
  for (let seen = 0; hi > 0; hi--) {
    seen += histogram[hi];
    if (seen > cut) break;
  }

  return { lo, hi };
}

/**
 * Map a 0-255 luma grid onto 0-1, applying auto-levels then gamma.
 *
 * Without auto-levels most photographs occupy a narrow band of the range and
 * collapse into three or four midtone characters, which reads as mush. The
 * stretch is what makes real images look like anything at all.
 */
export function normaliseLuma(
  luma: Float32Array,
  opts: LevelOptions,
): Float32Array {
  return applyLevels(luma, resolveLevels(luma, opts), opts.gamma);
}

/** The stretch that `normaliseLuma` would apply, so a second grid can reuse it. */
export function resolveLevels(
  luma: Float32Array,
  opts: LevelOptions,
): { lo: number; hi: number } {
  if (!opts.autoLevels) return { lo: 0, hi: 255 };
  const bounds = levelBounds(luma, opts.clip);
  // A flat image has no range to stretch; leave it alone rather than divide
  // by ~zero and amplify sensor noise into garbage.
  return bounds.hi - bounds.lo >= 1 ? bounds : { lo: 0, hi: 255 };
}

/**
 * Map 0-255 onto 0-1 with a given stretch and gamma.
 *
 * Split out so the fine sub-cell grid used for shape matching gets the exact
 * same tone curve as the coarse grid. Levelling them independently would give
 * the two grids different contrast and the matcher would chase a picture that
 * does not match the one being drawn.
 */
export function applyLevels(
  luma: Float32Array,
  bounds: { lo: number; hi: number },
  gammaValue: number,
): Float32Array {
  const out = new Float32Array(luma.length);
  const { lo, hi } = bounds;
  const opts = { gamma: gammaValue };

  const span = hi - lo;
  const gamma = opts.gamma > 0 ? opts.gamma : 1;
  const applyGamma = gamma !== 1;

  for (let i = 0; i < luma.length; i++) {
    let v = (luma[i] - lo) / span;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    out[i] = applyGamma ? Math.pow(v, gamma) : v;
  }

  return out;
}
