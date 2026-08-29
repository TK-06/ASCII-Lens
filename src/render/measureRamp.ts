/**
 * Build a character ramp by measuring how much ink each glyph actually puts on
 * the page.
 *
 * The traditional 70-character ASCII ramp is ordered by eye and is not
 * monotonic in real ink coverage, so adjacent "levels" can jump backwards in
 * density. That is why the `detailed` preset reads as noise on photographs
 * while the much shorter `simple` preset reads cleanly.
 *
 * Rasterise each candidate glyph into its own character cell, count the ink,
 * sort by that, then sample evenly across the coverage range. Structurally
 * typed against Canvas2D so the same code runs under @napi-rs/canvas in Node
 * and in a browser, where a page can measure the font it actually resolved.
 */

export interface RampCanvas {
  width: number;
  height: number;
  getContext(id: '2d'): RampCtx | null;
}

export interface RampCtx {
  font: string;
  fillStyle: unknown;
  textBaseline: string;
  textAlign: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray };
}

/** Printable ASCII, the usual candidate pool. */
export const ASCII_POOL: string =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`' +
  'abcdefghijklmnopqrstuvwxyz{|}~';

export interface GlyphInk {
  char: string;
  /** Fraction of the character cell covered with ink, 0-1. */
  coverage: number;
}

export interface MeasureOptions {
  /** Must be a real fixed-pitch family; a proportional fallback invalidates the cell. */
  fontFamily: string;
  /** Larger is more accurate and slower. 64 is ample. */
  fontSize?: number;
  /** Cell height as a multiple of font size, matching how output is rendered. */
  lineHeight?: number;
}

/**
 * Measure ink coverage for every candidate glyph.
 *
 * Coverage is over the whole character CELL, not the glyph's bounding box —
 * the cell is what tiles the output, so it is the area that matters.
 */
export function measureGlyphInk(
  makeCanvas: (w: number, h: number) => RampCanvas,
  pool: string,
  opts: MeasureOptions,
): GlyphInk[] {
  const fontSize = opts.fontSize ?? 64;
  const lineHeight = opts.lineHeight ?? 1;

  const probe = makeCanvas(8, 8).getContext('2d');
  if (!probe) throw new Error('Could not get a 2D context');
  probe.font = `${fontSize}px ${opts.fontFamily}`;
  const cellW = Math.max(1, Math.ceil(probe.measureText('M').width));
  const cellH = Math.max(1, Math.ceil(fontSize * lineHeight));

  const canvas = makeCanvas(cellW, cellH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context');

  const out: GlyphInk[] = [];
  const total = cellW * cellH * 255;

  for (const char of [...pool]) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cellW, cellH);
    ctx.font = `${fontSize}px ${opts.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(char, 0, cellH / 2);

    const { data } = ctx.getImageData(0, 0, cellW, cellH);
    // Sum the red channel: ink is white on black, so this is anti-aliasing
    // aware in a way a simple threshold would not be.
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) ink += data[i];

    out.push({ char, coverage: ink / total });
  }

  return out.sort((a, b) => a.coverage - b.coverage);
}

export interface BuildRampOptions extends MeasureOptions {
  /** How many characters the finished ramp should have. */
  levels: number;
  /** Candidate characters. Defaults to printable ASCII. */
  pool?: string;
  /** Drop glyphs whose shape is distracting even at the right density. */
  exclude?: string;
}

/**
 * Build a ramp whose steps are evenly spaced in measured ink coverage.
 *
 * Sampling evenly across COVERAGE rather than taking every Nth glyph from the
 * sorted list is the whole point: real fonts cluster dozens of glyphs around
 * the middle densities and leave gaps at the ends, so an index-based pick
 * produces a ramp that barely moves through the midtones and then lurches.
 */
export function buildRamp(
  makeCanvas: (w: number, h: number) => RampCanvas,
  opts: BuildRampOptions,
): { ramp: string; measured: GlyphInk[] } {
  const exclude = new Set([...(opts.exclude ?? '')]);
  const measured = measureGlyphInk(
    makeCanvas,
    opts.pool ?? ASCII_POOL,
    opts,
  ).filter((g) => !exclude.has(g.char));

  if (measured.length === 0) throw new Error('No glyphs measured');

  const levels = Math.max(2, Math.min(opts.levels, measured.length));
  const min = measured[0].coverage;
  const max = measured[measured.length - 1].coverage;
  const span = max - min || 1;

  const chosen: GlyphInk[] = [];
  const taken = new Set<string>();

  for (let i = 0; i < levels; i++) {
    const target = min + (span * i) / (levels - 1);
    let best: GlyphInk | null = null;
    let bestDelta = Infinity;

    for (const g of measured) {
      if (taken.has(g.char)) continue;
      const delta = Math.abs(g.coverage - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = g;
      }
    }

    if (best) {
      chosen.push(best);
      taken.add(best.char);
    }
  }

  chosen.sort((a, b) => a.coverage - b.coverage);
  return { ramp: chosen.map((g) => g.char).join(''), measured };
}
