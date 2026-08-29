import { ditherToIndices } from './dither';
import { detectEdges } from './edges';
import { applyLevels, normaliseLuma, resolveLevels } from './luminance';
import { EDGE_CHARS, rampIndex, resolveRamp } from './ramps';
import { computeRows, sampleGrid } from './sample';
import { matchGlyphs } from './structural';
import type { GlyphAtlas } from '../render/glyphAtlas';
import { DEFAULT_OPTIONS, type AsciiOptions, type AsciiResult, type RgbaImage } from './types';

export type ConvertOptions = Partial<AsciiOptions> & { cols: number };

/**
 * Convert an image to ASCII.
 *
 * The pipeline, in order:
 *   1. work out the row count from the image aspect and the character aspect
 *   2. area-average down to a cols x rows grid of mean colour + luminance
 *   3. normalise luminance to 0-1 (auto-levels, then gamma)
 *   4. pick a ramp index per cell, either directly or via error diffusion
 *   5. optionally override strong-gradient cells with an edge stroke
 *
 * Pure: no DOM, no filesystem, no globals. The same call runs in a browser, in
 * Node, and in a test.
 */
export function convert(img: RgbaImage, options: ConvertOptions): AsciiResult {
  const opts: AsciiOptions = { ...DEFAULT_OPTIONS, ...options };

  const cols = Math.max(1, Math.floor(opts.cols));
  const rows = computeRows(img.width, img.height, cols, opts.charAspect);

  // Split into code points, not UTF-16 units. Indexing the raw string would
  // count an astral character (an emoji ramp, say) as two levels and could
  // emit a lone surrogate. `invert` already reverses code-point-wise, so
  // indexing the same way keeps the two consistent.
  const glyphs = [...resolveRamp(opts.ramp, opts.invert)];
  const levels = glyphs.length;

  const grid = sampleGrid(img, cols, rows, opts.lumaSet);
  const bounds = resolveLevels(grid.luma, opts);
  const norm = applyLevels(grid.luma, bounds, opts.gamma);

  // Shape matching needs the pixels INSIDE each cell, so the image is sampled a
  // second time at sub-cell resolution and levelled with the same curve.
  const atlas = opts.atlas as GlyphAtlas | undefined;
  let matched: Uint16Array | null = null;
  if (atlas) {
    const fine = sampleGrid(img, cols * atlas.sx, rows * atlas.sy, opts.lumaSet);
    let fineNorm = applyLevels(fine.luma, bounds, opts.gamma);
    if (opts.invert) {
      // The atlas stores INK coverage. On an inverted ramp a dark cell is the
      // inky one, so the comparison has to be flipped to match.
      const flipped = new Float32Array(fineNorm.length);
      for (let i = 0; i < fineNorm.length; i++) flipped[i] = 1 - fineNorm[i];
      fineNorm = flipped;
    }
    matched = matchGlyphs(fineNorm, cols, rows, atlas, opts.toneWeight);
  }

  const indices = opts.dither ? ditherToIndices(norm, cols, rows, levels) : null;

  const edgeField = opts.edges ? detectEdges(norm, cols, rows) : null;

  // In `solid` mode colour carries the whole image, so every cell gets the
  // densest glyph and density stops competing with it.
  const solid = opts.color && opts.colorMode === 'solid';
  const densest = glyphs[levels - 1];

  const blank = glyphs[0];

  const chars = new Array<string>(cols * rows);
  for (let i = 0; i < chars.length; i++) {
    if (opts.threshold > 0 && norm[i] < opts.threshold) {
      chars[i] = blank;
      continue;
    }
    if (edgeField && edgeField.magnitude[i] >= opts.edgeThreshold) {
      chars[i] = EDGE_CHARS[edgeField.charIndex[i]];
      continue;
    }
    if (solid) {
      chars[i] = densest;
      continue;
    }
    if (matched) {
      chars[i] = atlas!.chars[matched[i]];
      continue;
    }
    const index = indices ? indices[i] : rampIndex(norm[i], levels);
    chars[i] = glyphs[index];
  }

  const lines = new Array<string>(rows);
  for (let y = 0; y < rows; y++) {
    lines[y] = chars.slice(y * cols, y * cols + cols).join('');
  }

  const result: AsciiResult = { cols, rows, chars, text: lines.join('\n') };
  if (opts.color) {
    result.colors =
      opts.colorMode === 'normalized' ? normalizeBrightness(grid.rgb) : grid.rgb;
  }
  return result;
}

/**
 * Scale each colour up until its brightest channel is saturated.
 *
 * Leaves hue and saturation alone and throws away only the brightness, which
 * the glyph is already encoding. Without this, a dark region gets a sparse
 * glyph AND a dark colour and reads as mud; with it, the colour says "blue"
 * and the glyph says "dark", each doing one job.
 */
function normalizeBrightness(rgb: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    const peak = r > g ? (r > b ? r : b) : g > b ? g : b;
    // A black cell has no hue to recover; leave it black rather than divide by
    // zero and invent a colour out of rounding noise.
    const k = peak > 0 ? 255 / peak : 0;
    out[i] = r * k;
    out[i + 1] = g * k;
    out[i + 2] = b * k;
  }
  return out;
}

export { DEFAULT_OPTIONS } from './types';
export type { AsciiOptions, AsciiResult, RgbaImage, Rgb, RampName, CellGrid } from './types';
export { RAMPS, resolveRamp, rampIndex } from './ramps';
export { computeRows, sampleGrid } from './sample';
export { luminance, luminanceWith, normaliseLuma, levelBounds, LUMA_WEIGHTS } from './luminance';
export { matchGlyphs } from './structural';
export { detectEdges } from './edges';
export { ditherToIndices } from './dither';
