import type { RgbaImage } from '../src/lib/types';

/** Build an RgbaImage from a per-pixel colour function. */
export function make(
  width: number,
  height: number,
  fn: (x: number, y: number) => [number, number, number, number?],
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { data, width, height };
}

export const solid = (w: number, h: number, r: number, g: number, b: number): RgbaImage =>
  make(w, h, () => [r, g, b]);

/** Black on the left, white on the right, ramping linearly. */
export const gradient = (w: number, h: number): RgbaImage =>
  make(w, h, (x) => {
    const v = w === 1 ? 0 : Math.round((x / (w - 1)) * 255);
    return [v, v, v];
  });

/** Hard black/white boundary down the vertical centre line. */
export const verticalEdge = (w: number, h: number): RgbaImage =>
  make(w, h, (x) => (x < w / 2 ? [0, 0, 0] : [255, 255, 255]));

/** Hard black/white boundary across the horizontal centre line. */
export const horizontalEdge = (w: number, h: number): RgbaImage =>
  make(w, h, (_x, y) => (y < h / 2 ? [0, 0, 0] : [255, 255, 255]));

export const checkerboard = (w: number, h: number, size: number): RgbaImage =>
  make(w, h, (x, y) => {
    const on = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0;
    return on ? [255, 255, 255] : [0, 0, 0];
  });

/** White filled circle on black, radius = 40% of the shorter side. */
export const circle = (w: number, h: number): RgbaImage =>
  make(w, h, (x, y) => {
    const dx = x - w / 2;
    const dy = y - h / 2;
    const r = Math.min(w, h) * 0.4;
    return dx * dx + dy * dy <= r * r ? [255, 255, 255] : [0, 0, 0];
  });
