import { luminanceWith, type LumaSet } from './luminance';
import type { CellGrid, RgbaImage } from './types';

/**
 * How many character rows an image needs at a given width.
 *
 * A character cell is taller than it is wide, so a 1:1 grid of cells would
 * stretch the image vertically by roughly 2x. Scaling the row count by
 * charAspect cancels that out.
 */
export function computeRows(
  imgWidth: number,
  imgHeight: number,
  cols: number,
  charAspect: number,
): number {
  if (imgWidth <= 0 || imgHeight <= 0) return 1;
  return Math.max(1, Math.round((imgHeight / imgWidth) * cols * charAspect));
}

/** Pixel boundaries for `n` cells across `size` pixels, guaranteeing 1+ px each. */
function bounds(size: number, n: number): Int32Array {
  const edges = new Int32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    edges[i] = Math.floor((i * size) / n);
  }
  return edges;
}

/**
 * Downsample an image to a cols x rows grid of mean colour and luminance.
 *
 * Every source pixel inside a cell is averaged. The obvious alternative, point
 * sampling one pixel per cell, is much cheaper but throws away most of the
 * image: fine detail turns into noise that flickers between characters. On a
 * webcam feed that flicker is the difference between a picture and static.
 *
 * Alpha is composited over black, so transparent PNG regions read as empty.
 */
export function sampleGrid(
  img: RgbaImage,
  cols: number,
  rows: number,
  lumaSet: LumaSet = 'bt709',
): CellGrid {
  const { data, width, height } = img;
  const rgb = new Uint8ClampedArray(cols * rows * 3);
  const luma = new Float32Array(cols * rows);

  if (width <= 0 || height <= 0) return { cols, rows, rgb, luma };

  const xEdges = bounds(width, cols);
  const yEdges = bounds(height, rows);

  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.min(yEdges[cy], height - 1);
    const y1 = Math.max(yEdges[cy + 1], y0 + 1);
    const yEnd = Math.min(y1, height);

    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.min(xEdges[cx], width - 1);
      const x1 = Math.max(xEdges[cx + 1], x0 + 1);
      const xEnd = Math.min(x1, width);

      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;

      for (let y = y0; y < yEnd; y++) {
        let i = (y * width + x0) * 4;
        for (let x = x0; x < xEnd; x++, i += 4) {
          const a = data[i + 3] / 255;
          sr += data[i] * a;
          sg += data[i + 1] * a;
          sb += data[i + 2] * a;
          n++;
        }
      }

      const inv = n > 0 ? 1 / n : 0;
      const r = sr * inv;
      const g = sg * inv;
      const b = sb * inv;

      const cell = cy * cols + cx;
      rgb[cell * 3] = r;
      rgb[cell * 3 + 1] = g;
      rgb[cell * 3 + 2] = b;
      luma[cell] = luminanceWith(r, g, b, lumaSet);
    }
  }

  return { cols, rows, rgb, luma };
}
