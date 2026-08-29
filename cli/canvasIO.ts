import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { AsciiResult, RgbaImage } from '../src/lib/types';
import {
  DEFAULT_DRAW,
  drawAscii,
  fontString,
  measure,
  type Ctx2DLike,
  type DrawOptions,
} from '../src/render/asciiToCanvas';

/** Fonts to try, in order, when the requested one is not installed. */
const FONT_FALLBACKS = ['Consolas', 'Courier New', 'Lucida Console', 'DejaVu Sans Mono'];

/**
 * Pick a font that is installed AND actually fixed-pitch.
 *
 * The generic "monospace" family resolves to a proportional face here, so a
 * name that merely renders is not good enough: every candidate is measured and
 * rejected unless its glyph advances are uniform.
 */
export function resolveMonoFont(preferred?: string): string {
  const installed = new Set(GlobalFonts.families.map((f) => f.family));
  const ctx = createCanvas(8, 8).getContext('2d') as unknown as Ctx2DLike;

  const isFixedPitch = (family: string): boolean => {
    ctx.font = `16px "${family}"`;
    const widths = ['M', 'i', '.', 'W', '@'].map((c) => ctx.measureText(c).width);
    return widths.every((w) => w > 0 && Math.abs(w - widths[0]) < 0.01);
  };

  const candidates = [preferred, ...FONT_FALLBACKS].filter((f): f is string => Boolean(f));
  for (const family of candidates) {
    if (installed.has(family) && isFixedPitch(family)) return family;
  }

  throw new Error(
    `No fixed-pitch font available. Tried: ${candidates.join(', ')}. ` +
      `Install one, or pass --font with a monospace family you have.`,
  );
}

/** Decode an image file into the engine's platform-agnostic pixel buffer. */
export async function readImage(path: string): Promise<RgbaImage> {
  const img = await loadImage(path);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height);
  return { data: data.data, width: img.width, height: img.height };
}

/** Rasterise an AsciiResult onto its own canvas, sized to fit. */
export function renderCanvas(result: AsciiResult, draw: DrawOptions) {
  // Metrics need a context, and the context needs the size the metrics give,
  // so measure on a throwaway canvas first.
  const probe = createCanvas(8, 8).getContext('2d') as unknown as Ctx2DLike;
  const { width, height } = measure(probe, result, draw);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.font = fontString(draw);
  drawAscii(ctx as unknown as Ctx2DLike, result, draw);
  return canvas;
}

/** Rasterise an AsciiResult to a PNG buffer. */
export function renderPng(result: AsciiResult, draw: DrawOptions): Buffer {
  return renderCanvas(result, draw).toBuffer('image/png');
}

export async function writeOut(path: string, contents: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

export { DEFAULT_DRAW };
export type { DrawOptions };
