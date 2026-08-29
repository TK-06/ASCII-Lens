import type { AsciiResult } from '../lib/types';

/**
 * The slice of CanvasRenderingContext2D this renderer needs.
 *
 * Declared structurally so the same code drives both @napi-rs/canvas in Node
 * and the browser's canvas in the web app. `fillStyle` is `unknown` because the
 * real signatures include gradients and patterns, which would not be assignable
 * to a plain `string`.
 */
export interface Ctx2DLike {
  font: string;
  fillStyle: unknown;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}

export interface DrawOptions {
  /** Must name a real monospace font. The generic "monospace" family does NOT
   *  resolve to a fixed-pitch face under @napi-rs/canvas, which silently
   *  produces ragged output. */
  fontFamily: string;
  fontSize: number;
  /** Multiple of fontSize. 1.0 is what makes the output read as an image. */
  lineHeight: number;
  background: string;
  foreground: string;
  padding: number;
}

export const DEFAULT_DRAW: DrawOptions = {
  fontFamily: 'Consolas',
  fontSize: 14,
  lineHeight: 1,
  background: '#0d0d0f',
  foreground: '#e8e8e8',
  padding: 12,
};

/** CSS generic families, which must never be quoted or they stop being generic. */
const GENERIC_FAMILIES = new Set([
  'monospace', 'serif', 'sans-serif', 'cursive', 'fantasy', 'system-ui',
  'ui-monospace', 'ui-serif', 'ui-sans-serif', 'ui-rounded', 'math', 'emoji',
]);

/**
 * Normalise a font family into a valid CSS font-family value.
 *
 * `fontFamily` may be one name ("Courier New") or a whole stack
 * ("ui-monospace, Consolas, monospace"). Wrapping the entire string in quotes
 * would turn a stack into one bogus family name and silently fall back to a
 * proportional face, so each part is quoted individually and generics are left
 * bare.
 */
export function cssFontFamily(family: string): string {
  return family
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => {
      if (GENERIC_FAMILIES.has(name)) return name;
      if (name.startsWith('"') || name.startsWith("'")) return name;
      return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name) ? name : `"${name}"`;
    })
    .join(', ');
}

export const fontString = (o: DrawOptions): string =>
  `${o.fontSize}px ${cssFontFamily(o.fontFamily)}`;

export interface CellMetrics {
  cellW: number;
  cellH: number;
  width: number;
  height: number;
}

/** Measure one character cell and the full canvas needed for a result. */
export function measure(ctx: Ctx2DLike, result: AsciiResult, o: DrawOptions): CellMetrics {
  ctx.font = fontString(o);
  const cellW = ctx.measureText('M').width;
  const cellH = o.fontSize * o.lineHeight;
  return {
    cellW,
    cellH,
    width: Math.ceil(result.cols * cellW + o.padding * 2),
    height: Math.ceil(result.rows * cellH + o.padding * 2),
  };
}

/** Paint an AsciiResult onto a 2D context sized by `measure`. */
export function drawAscii(ctx: Ctx2DLike, result: AsciiResult, o: DrawOptions): void {
  const { cellW, cellH, width, height } = measure(ctx, result, o);

  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, width, height);

  ctx.font = fontString(o);
  ctx.textBaseline = 'middle';

  const { cols, rows, chars, colors } = result;

  for (let y = 0; y < rows; y++) {
    const py = o.padding + y * cellH + cellH / 2;

    if (colors) {
      // Assigning fillStyle costs a string allocation plus a CSS colour parse,
      // and colour is the slowest path by far, so skip the assignment when the
      // cell's colour is unchanged from the previous one.
      let pr = -1;
      let pg = -1;
      let pb = -1;
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const ch = chars[i];
        if (ch === ' ') continue;
        const r = colors[i * 3];
        const g = colors[i * 3 + 1];
        const b = colors[i * 3 + 2];
        if (r !== pr || g !== pg || b !== pb) {
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          pr = r;
          pg = g;
          pb = b;
        }
        ctx.fillText(ch, o.padding + x * cellW, py);
      }
    } else {
      // One fillText for the whole row. Safe only because the font is truly
      // fixed-pitch, which is verified at startup.
      ctx.fillStyle = o.foreground;
      ctx.fillText(chars.slice(y * cols, y * cols + cols).join(''), o.padding, py);
    }
  }
}
