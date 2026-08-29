import { createCanvas } from '@napi-rs/canvas';
import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { convert, type ConvertOptions } from '../src/lib/asciiConvert';
import { RAMPS } from '../src/lib/ramps';
import { DEFAULT_DRAW, readImage, renderCanvas, resolveMonoFont, writeOut } from './canvasIO';

const USAGE = `
  npm run compare -- <image> [options]

  Renders one contact sheet: every ramp crossed with every mode, so the
  variants can be judged side by side instead of one flag at a time.

    -w, --width <n>     characters per tile           (default 80)
    -o, --out <path>    output png                    (default out/<name>-compare.png)
        --font <family> monospace font                (default Consolas)
        --font-size <n> px                            (default 9)
        --levels        compare tone curves instead of ramps x modes
`;

const RAMP_NAMES = Object.keys(RAMPS) as (keyof typeof RAMPS)[];

interface Variant {
  label: string;
  options: Partial<ConvertOptions>;
}

/** Ramps down the rows, rendering modes across the columns. */
function rampsByMode(): { variants: Variant[]; columns: number } {
  const modes: Variant[] = [
    { label: 'plain', options: {} },
    { label: 'dither', options: { dither: true } },
    { label: 'edges', options: { edges: true } },
  ];
  const variants: Variant[] = [];
  for (const ramp of RAMP_NAMES) {
    for (const mode of modes) {
      variants.push({ label: `${ramp} / ${mode.label}`, options: { ramp, ...mode.options } });
    }
  }
  return { variants, columns: modes.length };
}

/** Tone-curve sweep: does auto-levels earn its place, and at what gamma? */
function levelSweep(): { variants: Variant[]; columns: number } {
  const variants: Variant[] = [
    { label: 'raw (no auto-levels)', options: { autoLevels: false } },
    { label: 'auto-levels', options: { autoLevels: true } },
    { label: 'auto-levels, clip 5%', options: { autoLevels: true, clip: 0.05 } },
    { label: 'gamma 0.6 (brighter)', options: { gamma: 0.6 } },
    { label: 'gamma 1.0', options: { gamma: 1 } },
    { label: 'gamma 1.6 (darker)', options: { gamma: 1.6 } },
  ];
  return { variants, columns: 3 };
}

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      width: { type: 'string', short: 'w' },
      out: { type: 'string', short: 'o' },
      font: { type: 'string' },
      'font-size': { type: 'string' },
      levels: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const source = positionals[0];
  if (values.help || !source) {
    console.log(USAGE);
    // Asking for help succeeded; omitting the image did not.
    return values.help ? 0 : 1;
  }

  const cols = Math.max(1, Math.round(Number(values.width ?? 80)));
  const draw = {
    ...DEFAULT_DRAW,
    fontFamily: resolveMonoFont(values.font),
    fontSize: Number(values['font-size'] ?? 9),
    padding: 8,
  };

  const image = await readImage(source);
  const { variants, columns } = values.levels ? levelSweep() : rampsByMode();

  const tiles = variants.map((v) => ({
    label: v.label,
    canvas: renderCanvas(convert(image, { cols, ...v.options }), draw),
  }));

  const tileW = Math.max(...tiles.map((t) => t.canvas.width));
  const tileH = Math.max(...tiles.map((t) => t.canvas.height));
  const rows = Math.ceil(tiles.length / columns);
  const labelH = 22;
  const gap = 14;

  const sheet = createCanvas(
    columns * tileW + (columns + 1) * gap,
    rows * (tileH + labelH) + (rows + 1) * gap,
  );
  const ctx = sheet.getContext('2d');

  ctx.fillStyle = '#08080a';
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  tiles.forEach((tile, i) => {
    const cx = i % columns;
    const cy = Math.floor(i / columns);
    const x = gap + cx * (tileW + gap);
    const y = gap + cy * (tileH + labelH + gap);

    ctx.fillStyle = '#8ab4ff';
    ctx.font = `13px "${draw.fontFamily}"`;
    ctx.textBaseline = 'top';
    ctx.fillText(tile.label, x, y);

    ctx.drawImage(tile.canvas, x, y + labelH);
  });

  const stem = basename(source, extname(source));
  const out = values.out ?? join('out', `${stem}-compare${values.levels ? '-levels' : ''}.png`);
  await writeOut(out, sheet.toBuffer('image/png'));

  console.error(
    `${image.width}x${image.height} -> ${tiles.length} variants @ ${cols} cols\nwrote ${out}`,
  );
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`\ncompare: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
