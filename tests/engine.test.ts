import { describe, expect, it } from 'vitest';

import { convert } from '../src/lib/asciiConvert';
import { ditherToIndices } from '../src/lib/dither';
import { detectEdges } from '../src/lib/edges';
import { levelBounds, luminance, normaliseLuma } from '../src/lib/luminance';
import { EDGE_CHARS, RAMPS, rampIndex, resolveRamp } from '../src/lib/ramps';
import { buildRamp, type RampCanvas } from '../src/render/measureRamp';
import { matchGlyphs } from '../src/lib/structural';
import type { GlyphAtlas } from '../src/render/glyphAtlas';
import { LUMA_WEIGHTS, luminanceWith } from '../src/lib/luminance';
import { computeRows, sampleGrid } from '../src/lib/sample';
import { DEFAULT_OPTIONS } from '../src/lib/types';
import { checkerboard, circle, gradient, horizontalEdge, make, solid, verticalEdge } from './fixtures';

describe('luminance', () => {
  it('weights green highest and blue lowest', () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(53.55);
    expect(luminance(0, 255, 0)).toBeCloseTo(183.6);
    expect(luminance(0, 0, 255)).toBeCloseTo(17.85);
  });

  it('maps black to 0 and white to 255', () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(255);
  });
});

describe('rampIndex', () => {
  const len = RAMPS.simple.length; // 10

  it('hits the exact first and last character at the boundaries', () => {
    expect(rampIndex(0, len)).toBe(0);
    expect(rampIndex(1, len)).toBe(len - 1);
  });

  it('never reads off the end for any value in range', () => {
    for (let i = 0; i <= 1000; i++) {
      const index = rampIndex(i / 1000, len);
      expect(RAMPS.simple[index]).toBeTypeOf('string');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(len);
    }
  });

  it('clamps out-of-range input instead of overflowing', () => {
    expect(rampIndex(-5, len)).toBe(0);
    expect(rampIndex(99, len)).toBe(len - 1);
  });

  it('handles a single-character ramp', () => {
    expect(rampIndex(0.5, 1)).toBe(0);
  });
});

describe('resolveRamp', () => {
  it('resolves preset names', () => {
    expect(resolveRamp('simple')).toBe(RAMPS.simple);
    expect(resolveRamp('blocks')).toBe(RAMPS.blocks);
  });

  it('passes literal ramps through', () => {
    expect(resolveRamp('.oO@')).toBe('.oO@');
  });

  it('reverses when inverted', () => {
    expect(resolveRamp('.oO@', true)).toBe('@Oo.');
    expect(resolveRamp('simple', true)).toBe([...RAMPS.simple].reverse().join(''));
  });

  it('rejects an empty ramp', () => {
    expect(() => resolveRamp('')).toThrow();
  });
});

describe('computeRows', () => {
  it('halves the row count at charAspect 0.5 for a square image', () => {
    expect(computeRows(100, 100, 50, 0.5)).toBe(25);
  });

  it('tracks the source aspect ratio', () => {
    expect(computeRows(200, 100, 100, 0.5)).toBe(25);
    expect(computeRows(100, 200, 100, 0.5)).toBe(100);
  });

  it('never returns zero rows for extreme aspect ratios', () => {
    expect(computeRows(1000, 1, 10, 0.5)).toBe(1);
  });
});

describe('sampleGrid', () => {
  it('averages every pixel in a cell, not just one', () => {
    // Left half pure red, right half pure blue.
    const img = make(4, 2, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255]));
    const grid = sampleGrid(img, 2, 1);

    expect([...grid.rgb.slice(0, 3)]).toEqual([255, 0, 0]);
    expect([...grid.rgb.slice(3, 6)]).toEqual([0, 0, 255]);
  });

  it('produces a true mean for a mixed cell', () => {
    // One black pixel, one white pixel, collapsed into a single cell.
    const img = make(2, 1, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255]));
    const grid = sampleGrid(img, 1, 1);

    expect(grid.rgb[0]).toBeCloseTo(128, -1);
    expect(grid.luma[0]).toBeCloseTo(127.5, 0);
  });

  it('preserves a solid colour exactly', () => {
    const grid = sampleGrid(solid(16, 16, 10, 200, 30), 4, 4);
    for (let i = 0; i < 16; i++) {
      expect([...grid.rgb.slice(i * 3, i * 3 + 3)]).toEqual([10, 200, 30]);
    }
  });

  it('composites alpha over black', () => {
    const img = make(2, 2, () => [255, 255, 255, 0]);
    const grid = sampleGrid(img, 1, 1);
    expect(grid.luma[0]).toBe(0);
  });

  it('does not leave empty cells when upsampling past the source size', () => {
    // 8 cells across a 2px-wide image: every cell must still get a pixel.
    const grid = sampleGrid(solid(2, 2, 255, 255, 255), 8, 8);
    expect([...grid.luma].every((v) => v > 250)) .toBe(true);
  });

  it('averages a checkerboard to mid grey', () => {
    const grid = sampleGrid(checkerboard(64, 64, 1), 8, 8);
    for (const v of grid.luma) expect(v).toBeCloseTo(127.5, 0);
  });
});

describe('normaliseLuma', () => {
  it('stretches a narrow band to the full range', () => {
    const luma = Float32Array.from([100, 110, 120, 130, 140]);
    const out = normaliseLuma(luma, { autoLevels: true, clip: 0, gamma: 1 });
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[4]).toBeCloseTo(1, 5);
  });

  it('leaves a flat image alone rather than amplifying noise', () => {
    const luma = Float32Array.from([128, 128, 128, 128]);
    const out = normaliseLuma(luma, { autoLevels: true, clip: 0, gamma: 1 });
    for (const v of out) expect(v).toBeCloseTo(128 / 255, 5);
  });

  it('maps straight through when auto-levels is off', () => {
    const luma = Float32Array.from([0, 127.5, 255]);
    const out = normaliseLuma(luma, { autoLevels: false, clip: 0, gamma: 1 });
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0.5, 2);
    expect(out[2]).toBeCloseTo(1);
  });

  it('brightens midtones at gamma below 1', () => {
    const luma = Float32Array.from([0, 64, 255]);
    const plain = normaliseLuma(luma, { autoLevels: false, clip: 0, gamma: 1 });
    const bright = normaliseLuma(luma, { autoLevels: false, clip: 0, gamma: 0.5 });
    expect(bright[1]).toBeGreaterThan(plain[1]);
  });

  it('ignores an outlier when clipping', () => {
    // 99 dark pixels plus one blown highlight: the highlight must not set the top.
    const luma = new Float32Array(100);
    for (let i = 0; i < 99; i++) luma[i] = i;
    luma[99] = 255;
    const { hi } = levelBounds(luma, 0.02);
    expect(hi).toBeLessThan(255);
  });

  it('always emits values inside 0..1', () => {
    const luma = Float32Array.from([-10, 0, 90, 255, 300]);
    const out = normaliseLuma(luma, { autoLevels: true, clip: 0.01, gamma: 1.4 });
    for (const v of out) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('ditherToIndices', () => {
  const cols = 16;
  const rows = 16;

  it('emits only valid ramp indices and no NaN', () => {
    const norm = new Float32Array(cols * rows);
    for (let i = 0; i < norm.length; i++) norm[i] = (i % cols) / (cols - 1);
    const out = ditherToIndices(norm, cols, rows, 10);

    expect(out).toHaveLength(cols * rows);
    for (const v of out) {
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(10);
    }
  });

  it('does not mutate the caller grid', () => {
    const norm = new Float32Array(cols * rows).fill(0.5);
    const copy = Float32Array.from(norm);
    ditherToIndices(norm, cols, rows, 4);
    expect([...norm]).toEqual([...copy]);
  });

  it('preserves mean brightness better than flat quantisation', () => {
    // 0.5 with a 2-level ramp: rounding sends every cell to one extreme,
    // diffusion should split them roughly evenly and hold the average.
    const norm = new Float32Array(cols * rows).fill(0.5);
    const out = ditherToIndices(norm, cols, rows, 2);
    const mean = [...out].reduce((a, b) => a + b, 0) / out.length;
    expect(mean).toBeGreaterThan(0.3);
    expect(mean).toBeLessThan(0.7);
  });
});

describe('detectEdges', () => {
  const grid = (img: ReturnType<typeof verticalEdge>, n: number) =>
    normaliseLuma(sampleGrid(img, n, n).luma, { autoLevels: false, clip: 0, gamma: 1 });

  it('marks a vertical boundary with |', () => {
    const n = 8;
    const field = detectEdges(grid(verticalEdge(64, 64), n), n, n);
    const mid = 3 * n + 3; // row 3, col 3: on the boundary
    expect(field.magnitude[mid]).toBeGreaterThan(0.5);
    expect(EDGE_CHARS[field.charIndex[mid]]).toBe('|');
  });

  it('marks a horizontal boundary with -', () => {
    const n = 8;
    const field = detectEdges(grid(horizontalEdge(64, 64), n), n, n);
    const mid = 3 * n + 3;
    expect(field.magnitude[mid]).toBeGreaterThan(0.5);
    expect(EDGE_CHARS[field.charIndex[mid]]).toBe('-');
  });

  it('finds no edges in a flat image', () => {
    const n = 8;
    const flat = new Float32Array(n * n).fill(0.5);
    const field = detectEdges(flat, n, n);
    for (const m of field.magnitude) expect(m).toBeCloseTo(0, 6);
  });
});

describe('buildRamp', () => {
  /**
   * Fake canvas whose "ink" is just the char code, so coverage is exactly
   * predictable. This exercises the even-sampling algorithm, which is the part
   * that matters — real rasterisation is the CLI's job.
   */
  const fakeCanvas = (): ((w: number, h: number) => RampCanvas) => {
    let current = ' ';
    return () => ({
      width: 10,
      height: 10,
      getContext: () => ({
        font: '',
        fillStyle: '' as unknown,
        textBaseline: '',
        textAlign: '',
        fillRect: () => {},
        fillText: (t: string) => { current = t; },
        measureText: () => ({ width: 10 }),
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          // Coverage proportional to code point, so ordering is known.
          const level = Math.min(255, (current.codePointAt(0) ?? 0) - 32);
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < data.length; i += 4) data[i] = level;
          return { data };
        },
      }),
    });
  };

  it('returns exactly the requested number of levels', () => {
    const { ramp } = buildRamp(fakeCanvas(), {
      fontFamily: 'x',
      levels: 12,
      pool: ' abcdefghijklmnopqrstuvwxyz',
    });
    expect([...ramp]).toHaveLength(12);
  });

  it('orders the ramp darkest to lightest with no backwards step', () => {
    const { ramp, measured } = buildRamp(fakeCanvas(), {
      fontFamily: 'x',
      levels: 10,
      pool: ' abcdefghijklmnopqrstuvwxyz',
    });
    const cov = new Map(measured.map((g) => [g.char, g.coverage]));
    const steps = [...ramp].map((c) => cov.get(c)!);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    }
  });

  it('never repeats a character', () => {
    const { ramp } = buildRamp(fakeCanvas(), {
      fontFamily: 'x',
      levels: 14,
      pool: ' abcdefghijklmnopqrstuvwxyz',
    });
    expect(new Set([...ramp]).size).toBe([...ramp].length);
  });

  it('honours the exclude list', () => {
    const { ramp } = buildRamp(fakeCanvas(), {
      fontFamily: 'x',
      levels: 8,
      pool: ' abcdefghijklmnopqrstuvwxyz',
      exclude: 'aeiou',
    });
    for (const vowel of 'aeiou') expect(ramp).not.toContain(vowel);
  });
});

describe('detailed ramp', () => {
  it('is the measured 16-level ramp, not the traditional 70-char one', () => {
    expect([...RAMPS.detailed]).toHaveLength(16);
    expect(RAMPS.detailed.startsWith(' ')).toBe(true);
    // The traditional ramp ended in '$'; the measured one ends at the densest
    // glyph Consolas actually has.
    expect(RAMPS.detailed.endsWith('@')).toBe(true);
  });
});

describe('colorMode', () => {
  const midBlue = () => solid(32, 32, 20, 40, 120);

  it('direct leaves the sampled colour alone', () => {
    const r = convert(midBlue(), { cols: 8, color: true, colorMode: 'direct' });
    expect([...r.colors!.slice(0, 3)]).toEqual([20, 40, 120]);
  });

  it('normalized lifts the colour to full brightness, keeping the ratios', () => {
    const r = convert(midBlue(), { cols: 8, color: true, colorMode: 'normalized' });
    const [red, green, blue] = [...r.colors!.slice(0, 3)];
    expect(blue).toBe(255);
    // 20:40:120 scaled by 255/120 -> roughly 42:85:255. Hue preserved.
    expect(red).toBeGreaterThan(38);
    expect(red).toBeLessThan(46);
    expect(green).toBeGreaterThan(81);
    expect(green).toBeLessThan(89);
  });

  it('normalized leaves black black instead of inventing a hue', () => {
    const r = convert(solid(16, 16, 0, 0, 0), { cols: 4, color: true, colorMode: 'normalized' });
    expect([...r.colors!.slice(0, 3)]).toEqual([0, 0, 0]);
  });

  it('solid gives every cell the densest glyph', () => {
    const r = convert(gradient(256, 64), {
      cols: 24,
      ramp: 'blocks',
      color: true,
      colorMode: 'solid',
    });
    const densest = [...RAMPS.blocks].at(-1);
    expect(new Set(r.chars)).toEqual(new Set([densest]));
  });

  it('colorMode does nothing when colour is off', () => {
    const plain = convert(midBlue(), { cols: 8, colorMode: 'normalized' });
    expect(plain.colors).toBeUndefined();
  });
});

describe('luminance weight sets', () => {
  it('bt601 and bt709 agree on grey and disagree on saturated colour', () => {
    for (const v of [0, 128, 255]) {
      expect(luminanceWith(v, v, v, 'bt601')).toBeCloseTo(luminanceWith(v, v, v, 'bt709'), 4);
    }
    // Rec.601 lifts red relative to Rec.709; that is the whole difference.
    expect(luminanceWith(255, 0, 0, 'bt601')).toBeGreaterThan(
      luminanceWith(255, 0, 0, 'bt709'),
    );
    expect(luminanceWith(0, 255, 0, 'bt601')).toBeLessThan(
      luminanceWith(0, 255, 0, 'bt709'),
    );
  });

  it('every weight set sums to 1 so white maps to full scale', () => {
    for (const w of Object.values(LUMA_WEIGHTS)) {
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 5);
    }
  });
});

describe('matchGlyphs', () => {
  /**
   * A hand-built 2x2 atlas: blank, ink only on the left column, ink
   * everywhere. Small enough that the right answer is obvious by inspection,
   * which is the point of testing the matcher rather than the rasteriser.
   */
  const atlas: GlyphAtlas = {
    chars: [' ', '[', '#'],
    sx: 2,
    sy: 2,
    cells: Float32Array.from([
      0, 0, 0, 0,
      0.8, 0, 0.8, 0,
      0.8, 0.8, 0.8, 0.8,
    ]),
    means: Float32Array.from([0, 0.4, 0.8]),
    minMean: 0,
    maxMean: 0.8,
  };

  /** One cell, given as its 2x2 sub-samples in 0..1. */
  const oneCell = (a: number, b: number, c: number, d: number) =>
    Float32Array.from([a, b, c, d]);

  it('picks the blank glyph for an empty cell', () => {
    const out = matchGlyphs(oneCell(0, 0, 0, 0), 1, 1, atlas, 0.4);
    expect(atlas.chars[out[0]]).toBe(' ');
  });

  it('picks the densest glyph for a full cell', () => {
    const out = matchGlyphs(oneCell(1, 1, 1, 1), 1, 1, atlas, 0.4);
    expect(atlas.chars[out[0]]).toBe('#');
  });

  it('picks the left-weighted glyph for a left-weighted cell', () => {
    // The whole reason shape matching exists: a ramp sees mean 0.5 here and
    // cannot distinguish it from any other half-bright cell.
    const out = matchGlyphs(oneCell(1, 0, 1, 0), 1, 1, atlas, 0.2);
    expect(atlas.chars[out[0]]).toBe('[');
  });

  it('tone weight 1 ignores shape entirely', () => {
    // Same mean as the left-weighted cell, but with tone-only scoring the
    // matcher must not care where the ink sits.
    const shaped = matchGlyphs(oneCell(1, 0, 1, 0), 1, 1, atlas, 1);
    const flat = matchGlyphs(oneCell(0.5, 0.5, 0.5, 0.5), 1, 1, atlas, 1);
    expect(shaped[0]).toBe(flat[0]);
  });

  it('returns one index per cell, all in range', () => {
    const cols = 5;
    const rows = 3;
    const fine = new Float32Array(cols * atlas.sx * rows * atlas.sy);
    for (let i = 0; i < fine.length; i++) fine[i] = (i % 7) / 6;
    const out = matchGlyphs(fine, cols, rows, atlas, 0.4);
    expect(out).toHaveLength(cols * rows);
    for (const v of out) expect(v).toBeLessThan(atlas.chars.length);
  });
});

describe('threshold', () => {
  it('blanks cells below the threshold and leaves the rest alone', () => {
    const opts = { cols: 24, charAspect: 0.5, ramp: 'simple' as const };
    const plain = convert(gradient(256, 64), opts);
    const cut = convert(gradient(256, 64), { ...opts, threshold: 0.5 });

    const blanks = (r: { chars: string[] }) => r.chars.filter((c) => c === ' ').length;
    expect(blanks(cut)).toBeGreaterThan(blanks(plain));
    // The bright end is above the threshold, so it must be untouched.
    expect(cut.chars[23]).toBe(plain.chars[23]);
  });
});

describe('convert', () => {
  it('produces a grid of the requested width with matching text', () => {
    const result = convert(gradient(200, 100), { cols: 40, charAspect: 0.5 });

    expect(result.cols).toBe(40);
    expect(result.rows).toBe(10);
    expect(result.chars).toHaveLength(400);

    const lines = result.text.split('\n');
    expect(lines).toHaveLength(10);
    for (const line of lines) expect([...line]).toHaveLength(40);
  });

  it('runs dark to light across a gradient, and reverses when inverted', () => {
    const opts = { cols: 20, charAspect: 0.5, ramp: 'simple' as const };
    const normal = convert(gradient(200, 20), opts);
    const inverted = convert(gradient(200, 20), { ...opts, invert: true });

    expect(normal.chars[0]).toBe(' ');
    expect(normal.chars[19]).toBe('@');
    expect(inverted.chars[0]).toBe('@');
    expect(inverted.chars[19]).toBe(' ');
  });

  it('omits colours unless asked, and returns one triple per cell when asked', () => {
    const plain = convert(solid(32, 32, 200, 40, 40), { cols: 8 });
    expect(plain.colors).toBeUndefined();

    const colored = convert(solid(32, 32, 200, 40, 40), { cols: 8, color: true });
    expect(colored.colors).toHaveLength(colored.cols * colored.rows * 3);
    expect([...colored.colors!.slice(0, 3)]).toEqual([200, 40, 40]);
  });

  it('only ever emits characters from the ramp when edges are off', () => {
    const result = convert(checkerboard(128, 128, 4), { cols: 32, ramp: 'blocks' });
    for (const ch of result.chars) expect(RAMPS.blocks).toContain(ch);
  });

  it('draws edge strokes on a hard boundary when edges are on', () => {
    const result = convert(verticalEdge(128, 128), {
      cols: 32,
      edges: true,
      edgeThreshold: 0.3,
    });
    expect(result.chars).toContain('|');
  });

  it('treats an astral-plane ramp by code point, not UTF-16 unit', () => {
    // Four emoji are four levels, not eight, and no cell may be half a
    // surrogate pair. `invert` already reversed code-point-wise, so indexing
    // had to agree or the two disagreed about what a "level" is.
    const ramp = '\u{1F311}\u{1F313}\u{1F315}\u{1F317}';
    const result = convert(gradient(256, 64), { cols: 32, ramp, charAspect: 0.5 });

    const glyphs = [...ramp];
    expect(glyphs).toHaveLength(4);
    for (const ch of result.chars) {
      expect(glyphs).toContain(ch);
      const code = ch.codePointAt(0)!;
      expect(code >= 0xd800 && code <= 0xdfff).toBe(false);
    }
  });

  it('survives a 1x1 image', () => {
    const result = convert(solid(1, 1, 255, 255, 255), { cols: 1 });
    expect(result.cols).toBe(1);
    expect(result.rows).toBe(1);
    expect(result.chars).toHaveLength(1);
  });

  it('defaults to a 0.55 character aspect', () => {
    // Measured from Consolas: 8.80px advance at a 16px em, at line-height 1.
    expect(DEFAULT_OPTIONS.charAspect).toBe(0.55);
  });

  it('gives every row of a horizontal gradient identical output', () => {
    // Regression guard on the sampler: a left-to-right gradient varies only in
    // x, so any row-to-row difference means cell bounds are drifting.
    const result = convert(gradient(512, 256), { cols: 100, ramp: 'blocks' });
    const rows = result.text.split('\n');
    expect(new Set(rows).size).toBe(1);
  });

  it('never draws more edge strokes as the threshold rises', () => {
    // A circle has edges of many different strengths once area-averaging
    // softens it, so raising the threshold should peel them off gradually.
    const strokes = (t: number) =>
      convert(circle(256, 256), { cols: 64, edges: true, edgeThreshold: t })
        .chars.filter((c) => (EDGE_CHARS as readonly string[]).includes(c)).length;

    const counts = [0.1, 0.3, 0.5, 0.7, 0.9].map(strokes);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
    // The sweep must actually do something, not be uniformly zero.
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[0]).toBeGreaterThan(counts[counts.length - 1]);
  });

  it('renders a stable circle (golden)', () => {
    const result = convert(circle(120, 120), { cols: 24, charAspect: 0.5, autoLevels: false });
    expect(result.text).toMatchSnapshot();
  });
});
