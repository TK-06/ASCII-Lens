import { rampIndex } from './ramps';

/**
 * Floyd-Steinberg error diffusion across the character grid.
 *
 * A ramp has maybe ten distinct levels, so a smooth gradient quantises into
 * visible bands. Dithering pushes each cell's rounding error onto its
 * not-yet-visited neighbours, trading those bands for high-frequency noise that
 * the eye averages back into the original gradient.
 *
 * Note this runs on the CHARACTER grid, not the pixel grid: the error is spread
 * between adjacent characters, which is the resolution the viewer actually sees.
 */
export function ditherToIndices(
  norm: Float32Array,
  cols: number,
  rows: number,
  levels: number,
): Uint8Array {
  const out = new Uint8Array(cols * rows);
  if (levels <= 1) return out;

  // Scratch copy: error accumulates here and must not corrupt the caller's grid.
  const buf = Float32Array.from(norm);
  const maxIndex = levels - 1;

  const diffuse = (i: number, err: number, weight: number): void => {
    buf[i] += err * weight;
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const index = rampIndex(buf[i], levels);
      out[i] = index;

      const err = buf[i] - index / maxIndex;
      const hasRight = x + 1 < cols;
      const hasBelow = y + 1 < rows;

      if (hasRight) diffuse(i + 1, err, 7 / 16);
      if (hasBelow) {
        if (x > 0) diffuse(i + cols - 1, err, 3 / 16);
        diffuse(i + cols, err, 5 / 16);
        if (hasRight) diffuse(i + cols + 1, err, 1 / 16);
      }
    }
  }

  return out;
}
