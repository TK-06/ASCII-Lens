import { EDGE_CHARS } from './ramps';

export interface EdgeField {
  /** Gradient strength per cell, normalised to 0-1. */
  magnitude: Float32Array;
  /** Index into EDGE_CHARS: 0 '-', 1 '/', 2 '|', 3 '\'. */
  charIndex: Uint8Array;
}

/** Largest magnitude Sobel can produce on 0-1 input: sqrt(4^2 + 4^2). */
const MAX_SOBEL = Math.sqrt(32);

/**
 * Sobel edge detection over the character grid.
 *
 * Density ramps convey brightness but lose shape, so a line drawing turns to
 * mud. Replacing strong-gradient cells with a stroke that follows the edge
 * gives back the outline, which is what reads as a "sketch" look.
 *
 * The glyph follows the EDGE, which runs perpendicular to the gradient: a
 * vertical light/dark boundary has a horizontal gradient and wants '|'.
 */
export function detectEdges(
  norm: Float32Array,
  cols: number,
  rows: number,
): EdgeField {
  const magnitude = new Float32Array(cols * rows);
  const charIndex = new Uint8Array(cols * rows);

  // Clamp-to-edge sampling, so border cells get a gradient instead of a
  // phantom black frame around the whole image.
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= cols ? cols - 1 : x;
    const cy = y < 0 ? 0 : y >= rows ? rows - 1 : y;
    return norm[cy * cols + cx];
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tl = at(x - 1, y - 1);
      const tc = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const ml = at(x - 1, y);
      const mr = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const bc = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);

      const i = y * cols + x;
      magnitude[i] = Math.hypot(gx, gy) / MAX_SOBEL;

      // Rotate the gradient by 90 degrees to get the edge direction, then fold
      // onto [0, PI) since a stroke looks the same in either direction.
      let angle = Math.atan2(gy, gx) + Math.PI / 2;
      angle %= Math.PI;
      if (angle < 0) angle += Math.PI;

      charIndex[i] = Math.round(angle / (Math.PI / 4)) % EDGE_CHARS.length;
    }
  }

  return { magnitude, charIndex };
}
