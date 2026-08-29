import type { GlyphAtlas } from '../render/glyphAtlas';

/**
 * Pick, for every cell, the glyph whose ink pattern best matches the cell's
 * pixels — rather than the glyph whose average darkness happens to be closest.
 *
 * This is what separates ASCII art that keeps edges and diagonals from ASCII
 * art that turns every boundary into a smear of midtone characters. A ramp
 * cannot tell `/` from `\`; a shape match can.
 *
 * Scoring is sum of squared differences across the sub-cell samples, plus a
 * tone term. The tone term matters: pure SSD will happily trade overall
 * brightness for a slightly better edge, and the picture drifts light or dark
 * in a way that is far more objectionable than a soft edge.
 */
export function matchGlyphs(
  /** Fine luminance grid, 0-1, at (cols*sx) x (rows*sy). */
  fine: Float32Array,
  cols: number,
  rows: number,
  atlas: GlyphAtlas,
  /** 0 = shape only, 1 = tone only. Around 0.4 keeps both honest. */
  toneWeight = 0.4,
): Uint16Array {
  const { sx, sy, cells, means, chars, minMean, maxMean } = atlas;
  const glyphCount = chars.length;
  const per = sx * sy;
  const fineCols = cols * sx;

  // Rescale the image into the ink range the font can actually produce. See
  // GlyphAtlas.minMean — without this every bright cell saturates against a
  // pool that cannot get darker, and the output turns into a solid block.
  const inkSpan = maxMean - minMean;

  const out = new Uint16Array(cols * rows);
  const patch = new Float32Array(per);
  const shapeWeight = 1 - toneWeight;

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      // Gather this cell's sub-samples into a contiguous patch so the inner
      // loop over glyphs walks memory linearly.
      let mean = 0;
      for (let j = 0; j < sy; j++) {
        const row = (cy * sy + j) * fineCols + cx * sx;
        for (let i = 0; i < sx; i++) {
          const v = minMean + fine[row + i] * inkSpan;
          patch[j * sx + i] = v;
          mean += v;
        }
      }
      mean /= per;

      let best = 0;
      let bestScore = Infinity;

      for (let g = 0; g < glyphCount; g++) {
        const base = g * per;
        let ssd = 0;
        for (let k = 0; k < per; k++) {
          const d = patch[k] - cells[base + k];
          ssd += d * d;
        }
        const toneDelta = mean - means[g];
        const score = shapeWeight * (ssd / per) + toneWeight * toneDelta * toneDelta;

        if (score < bestScore) {
          bestScore = score;
          best = g;
        }
      }

      out[cy * cols + cx] = best;
    }
  }

  return out;
}
