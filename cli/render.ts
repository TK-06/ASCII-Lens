import { basename, extname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { convert } from '../src/lib/asciiConvert';
import { DEFAULT_OPTIONS, type ConvertOptions } from '../src/lib/asciiConvert';
import { toAnsi } from '../src/render/ansi';
import { DEFAULT_DRAW, readImage, renderPng, resolveMonoFont, writeOut } from './canvasIO';

const USAGE = `
  npm run ascii -- <image> [options]

  Conversion
    -w, --width <n>          output width in characters      (default 100)
    -r, --ramp <name|chars>  simple | detailed | blocks | literal ramp
        --char-aspect <f>    character cell w/h              (default ${DEFAULT_OPTIONS.charAspect})
        --gamma <f>          <1 brightens, >1 darkens        (default 1)
        --invert             flip the ramp (dark text on light backgrounds)
        --no-auto-levels     skip the contrast stretch
        --clip <f>           histogram fraction clipped      (default ${DEFAULT_OPTIONS.clip})
        --color              per-character colour
        --dither             Floyd-Steinberg error diffusion
        --edges              Sobel edge strokes
        --edge-threshold <f> edge sensitivity 0-1            (default ${DEFAULT_OPTIONS.edgeThreshold})

  Output
    -o, --out <prefix>       output path without extension   (default out/<name>)
        --no-txt             skip the .txt
        --no-png             skip the .png
        --quiet              do not print to the terminal
        --font <family>      PNG font                        (default Consolas)
        --font-size <n>      PNG font size in px             (default 14)
`;

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got "${v}"`);
  return n;
};

export async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      width: { type: 'string', short: 'w' },
      ramp: { type: 'string', short: 'r' },
      'char-aspect': { type: 'string' },
      gamma: { type: 'string' },
      clip: { type: 'string' },
      invert: { type: 'boolean' },
      'auto-levels': { type: 'boolean', default: true },
      color: { type: 'boolean' },
      dither: { type: 'boolean' },
      edges: { type: 'boolean' },
      'edge-threshold': { type: 'string' },
      out: { type: 'string', short: 'o' },
      txt: { type: 'boolean', default: true },
      png: { type: 'boolean', default: true },
      quiet: { type: 'boolean' },
      font: { type: 'string' },
      'font-size': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const source = positionals[0];
  if (values.help || !source) {
    console.log(USAGE);
    // Asking for help succeeded; omitting the image did not.
    return values.help ? 0 : 1;
  }

  const options: ConvertOptions = {
    cols: Math.max(1, Math.round(num(values.width, 100))),
    ramp: values.ramp ?? DEFAULT_OPTIONS.ramp,
    charAspect: num(values['char-aspect'], DEFAULT_OPTIONS.charAspect),
    gamma: num(values.gamma, DEFAULT_OPTIONS.gamma),
    clip: num(values.clip, DEFAULT_OPTIONS.clip),
    invert: values.invert ?? false,
    autoLevels: values['auto-levels'] ?? true,
    color: values.color ?? false,
    dither: values.dither ?? false,
    edges: values.edges ?? false,
    edgeThreshold: num(values['edge-threshold'], DEFAULT_OPTIONS.edgeThreshold),
  };

  const started = Date.now();
  const image = await readImage(source);
  const result = convert(image, options);
  const elapsed = Date.now() - started;

  if (!values.quiet) {
    console.log(toAnsi(result, options.color));
  }

  const stem = basename(source, extname(source));
  const prefix = values.out ?? join('out', stem);
  const written: string[] = [];

  if (values.txt) {
    await writeOut(`${prefix}.txt`, result.text);
    written.push(`${prefix}.txt`);
  }

  if (values.png) {
    const draw = {
      ...DEFAULT_DRAW,
      fontFamily: resolveMonoFont(values.font),
      fontSize: num(values['font-size'], DEFAULT_DRAW.fontSize),
    };
    await writeOut(`${prefix}.png`, renderPng(result, draw));
    written.push(`${prefix}.png`);
  }

  console.error(
    `\n${image.width}x${image.height} -> ${result.cols}x${result.rows} chars in ${elapsed}ms` +
      (written.length ? `\nwrote ${written.join('  ')}` : ''),
  );

  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`\nascii: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  },
);
