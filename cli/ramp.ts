import { createCanvas } from '@napi-rs/canvas';
import { parseArgs } from 'node:util';

import {
  buildRamp,
  type RampCanvas,
  type RampCtx,
} from '../src/render/measureRamp';
import { RAMPS } from '../src/lib/ramps';
import { resolveMonoFont } from './canvasIO';

const USAGE = `
  npm run ramp -- [options]

  Rasterises every candidate glyph, measures its real ink coverage, and emits a
  ramp whose steps are evenly spaced in that measurement.

    -n, --levels <n>     characters in the finished ramp   (default 24)
        --font <family>  monospace family to measure       (default Consolas)
        --size <n>       raster size in px                 (default 64)
        --exclude <str>  glyphs to drop from the pool
        --table          also print the full measured table
`;

const makeCanvas = (w: number, h: number): RampCanvas =>
  createCanvas(w, h) as unknown as RampCanvas;

function main(argv: string[]): number {
  const { values } = parseArgs({
    args: argv,
    options: {
      levels: { type: 'string', short: 'n' },
      font: { type: 'string' },
      size: { type: 'string' },
      exclude: { type: 'string' },
      table: { type: 'boolean' },
      rate: { type: 'string', multiple: true },
      presets: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const fontFamily = resolveMonoFont(values.font);
  const levels = Number(values.levels ?? 24);

  // Scoring an existing ramp on the same measurement is the only way to claim
  // a new one is better rather than merely different.
  if (values.rate?.length || values.presets) {
    const all = new Map(
      buildRamp(makeCanvas, { fontFamily, fontSize: 64, levels: 2 }).measured.map(
        (g) => [g.char, g.coverage],
      ),
    );
    console.log(`measured against ${fontFamily}\n`);
    const targets = [...(values.rate ?? [])];
    if (values.presets) targets.unshift(RAMPS.simple, RAMPS.detailed);

    for (const candidate of targets) {
      const cov = [...candidate].map((c) => all.get(c) ?? 0);
      const deltas = cov.slice(1).map((v, i) => v - cov[i]);
      const mean = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
      const backwards = deltas.filter((d) => d < 0).length;
      const spread = Math.sqrt(
        deltas.reduce((a, d) => a + (d - mean) ** 2, 0) / (deltas.length || 1),
      );
      console.log(`  ${JSON.stringify(candidate)}`);
      console.log(
        `    ${String(cov.length).padStart(3)} chars · step sd ${spread.toFixed(4)} ` +
          `· ${backwards} step(s) that go BACKWARDS in density`,
      );
    }
    return 0;
  }

  const { ramp, measured } = buildRamp(makeCanvas, {
    fontFamily,
    fontSize: Number(values.size ?? 64),
    levels,
    // Backslash and backtick are dropped by default: both need escaping in
    // almost every context the ramp gets pasted into, and each has a
    // near-identical twin at the same coverage.
    exclude: values.exclude ?? '\\`',
  });

  if (values.table) {
    console.log(`measured ${measured.length} glyphs in ${fontFamily}:\n`);
    for (const g of measured) {
      const bar = '#'.repeat(Math.round(g.coverage * 60));
      console.log(`  ${JSON.stringify(g.char).padEnd(6)} ${g.coverage.toFixed(4)} ${bar}`);
    }
    console.log('');
  }

  const lookup = new Map(measured.map((g) => [g.char, g.coverage]));
  console.log(`font    : ${fontFamily}`);
  console.log(`levels  : ${levels}`);
  console.log(`ramp    : ${JSON.stringify(ramp)}`);
  console.log(
    `coverage: ${[...ramp].map((c) => (lookup.get(c) ?? 0).toFixed(3)).join(' ')}`,
  );

  // Evenness is the whole point of measuring, so report it rather than assume.
  const steps = [...ramp].map((c) => lookup.get(c) ?? 0);
  const deltas = steps.slice(1).map((v, i) => v - steps[i]);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const worst = Math.max(...deltas.map((d) => Math.abs(d - mean)));
  console.log(`step    : mean ${mean.toFixed(4)}, worst deviation ${worst.toFixed(4)}`);

  return 0;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (err: unknown) {
  console.error(`ramp: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

export type { RampCtx };
