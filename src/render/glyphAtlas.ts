import { ASCII_POOL, type RampCanvas } from './measureRamp';

/**
 * Every candidate glyph reduced to a small coverage bitmap.
 *
 * A luminance ramp only knows how much ink a character has, never where that
 * ink sits. `/` and `\` are interchangeable to a ramp, and so are `-` and `|`,
 * which is why ramp output loses every edge and diagonal in the source. An
 * atlas keeps the shape, so a cell can be matched on structure instead of only
 * on brightness.
 */
export interface GlyphAtlas {
  chars: string[];
  /** Samples across one character cell. */
  sx: number;
  sy: number;
  /** chars.length * sx * sy coverage values in 0-1, row-major within a glyph. */
  cells: Float32Array;
  /** Mean coverage per glyph, for tone-weighted scoring. */
  means: Float32Array;
  /**
   * The achievable mean-coverage range across the pool.
   *
   * This matters more than it looks. Normalised cell brightness runs 0-1, but
   * the densest printable ASCII glyph in Consolas only reaches about 0.39 ink
   * coverage. Comparing a 0.9 cell against a pool that tops out at 0.39 makes
   * every bright cell pick the same few dense glyphs, and the picture
   * collapses into a slab. The matcher rescales into this range first.
   */
  minMean: number;
  maxMean: number;
}

export interface AtlasOptions {
  /** Must be a real fixed-pitch family. */
  fontFamily: string;
  /** Rasterisation size. Bigger is more faithful and slower to build (once). */
  fontSize?: number;
  pool?: string;
  /** Samples per cell. A character cell is about 1:2, so 4x8 keeps them square. */
  sx?: number;
  sy?: number;
  exclude?: string;
}

/**
 * Rasterise each glyph once and box-average it down to an sx-by-sy grid.
 *
 * Built once per font and reused for every frame, so this can afford to be
 * slow; the per-frame cost is only the matching.
 */
export function buildGlyphAtlas(
  makeCanvas: (w: number, h: number) => RampCanvas,
  opts: AtlasOptions,
): GlyphAtlas {
  const fontSize = opts.fontSize ?? 64;
  const sx = opts.sx ?? 4;
  const sy = opts.sy ?? 8;
  const exclude = new Set([...(opts.exclude ?? '')]);
  const chars = [...(opts.pool ?? ASCII_POOL)].filter((c) => !exclude.has(c));

  const probe = makeCanvas(8, 8).getContext('2d');
  if (!probe) throw new Error('Could not get a 2D context');
  probe.font = `${fontSize}px ${opts.fontFamily}`;
  const cellW = Math.max(sx, Math.ceil(probe.measureText('M').width));
  const cellH = Math.max(sy, Math.ceil(fontSize));

  const canvas = makeCanvas(cellW, cellH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context');

  const cells = new Float32Array(chars.length * sx * sy);
  const means = new Float32Array(chars.length);

  // Sub-box pixel boundaries, computed once.
  const xEdge = Array.from({ length: sx + 1 }, (_, i) => Math.floor((i * cellW) / sx));
  const yEdge = Array.from({ length: sy + 1 }, (_, j) => Math.floor((j * cellH) / sy));

  chars.forEach((char, g) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cellW, cellH);
    ctx.font = `${fontSize}px ${opts.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(char, 0, cellH / 2);

    const { data } = ctx.getImageData(0, 0, cellW, cellH);
    let total = 0;

    for (let j = 0; j < sy; j++) {
      const y0 = yEdge[j];
      const y1 = Math.max(y0 + 1, yEdge[j + 1]);
      for (let i = 0; i < sx; i++) {
        const x0 = xEdge[i];
        const x1 = Math.max(x0 + 1, xEdge[i + 1]);

        let ink = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
          let p = (y * cellW + x0) * 4;
          for (let x = x0; x < x1; x++, p += 4) {
            ink += data[p];
            n++;
          }
        }
        const v = n > 0 ? ink / (n * 255) : 0;
        cells[g * sx * sy + j * sx + i] = v;
        total += v;
      }
    }

    means[g] = total / (sx * sy);
  });

  let minMean = Infinity;
  let maxMean = -Infinity;
  for (const m of means) {
    if (m < minMean) minMean = m;
    if (m > maxMean) maxMean = m;
  }

  return { chars, sx, sy, cells, means, minMean, maxMean };
}
