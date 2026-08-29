import { createCanvas } from '@napi-rs/canvas';
import { join } from 'node:path';

import type { RgbaImage } from '../src/lib/types';
import { checkerboard, circle, gradient, horizontalEdge, verticalEdge } from '../tests/fixtures';
import { writeOut } from './canvasIO';

/**
 * Write the procedural test patterns out as real PNGs.
 *
 * The unit tests assert on these in memory; having them on disk means the same
 * shapes can be pushed through the CLI, which is how you check by eye that
 * edge detection and dithering do what the assertions claim.
 */
const PATTERNS: Record<string, () => RgbaImage> = {
  gradient: () => gradient(512, 256),
  'edge-vertical': () => verticalEdge(512, 512),
  'edge-horizontal': () => horizontalEdge(512, 512),
  checkerboard: () => checkerboard(512, 512, 16),
  circle: () => circle(512, 512),
};

function toPng(img: RgbaImage): Buffer {
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(img.width, img.height);
  out.data.set(img.data);
  ctx.putImageData(out, 0, 0);
  return canvas.toBuffer('image/png');
}

async function main(): Promise<void> {
  const dir = join('samples', 'generated');
  for (const [name, build] of Object.entries(PATTERNS)) {
    const path = join(dir, `${name}.png`);
    await writeOut(path, toPng(build()));
    console.error(`wrote ${path}`);
  }
}

main().catch((err: unknown) => {
  console.error(`fixtures: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
