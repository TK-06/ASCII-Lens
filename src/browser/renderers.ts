import type { AsciiResult } from '../lib/types';
import {
  cssFontFamily,
  drawAscii,
  measure,
  type Ctx2DLike,
  type DrawOptions,
} from '../render/asciiToCanvas';

export type RendererKind = 'canvas' | 'dom';

export interface RenderTargets {
  canvas: HTMLCanvasElement;
  pre: HTMLPreElement;
}

/** Retina is worth it, beyond 2x is just memory bandwidth. */
const MAX_DPR = 2;

/**
 * Canvas ceilings, which differ enormously by device.
 *
 * Desktop Chrome allows a 65535px edge. iOS Safari is far stricter — 4096 on
 * older hardware — and every engine also caps total area. Past either limit
 * the canvas does not throw, it silently renders nothing, so the check has to
 * happen before drawing.
 *
 * The mobile risk is specifically the device pixel ratio: a phone at 3x turns
 * a 1600px-wide output into a 4800px backing store, which is over the limit on
 * hardware where the CSS size looked perfectly reasonable.
 */
const DESKTOP_MAX_EDGE = 16384;
const TOUCH_MAX_EDGE = 4096;

function maxEdge(): number {
  if (typeof window === 'undefined' || !window.matchMedia) return DESKTOP_MAX_EDGE;
  return window.matchMedia('(pointer: coarse)').matches
    ? TOUCH_MAX_EDGE
    : DESKTOP_MAX_EDGE;
}

const fitsCanvasLimits = (w: number, h: number): boolean => {
  const edge = maxEdge();
  return w <= edge && h <= edge && w * h <= edge * edge;
};

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/**
 * Escape text for innerHTML.
 *
 * Not optional: the `detailed` ramp literally contains `<`, `>` and `&`, so an
 * unescaped colour render would inject broken markup and drop characters.
 */
const escapeHtml = (s: string): string => s.replace(/[&<>]/g, (c) => HTML_ESCAPES[c]);

function show(el: HTMLElement, visible: boolean): void {
  el.hidden = !visible;
}

/** Paint to a canvas, at device pixel ratio. */
function renderCanvas(
  result: AsciiResult,
  canvas: HTMLCanvasElement,
  draw: DrawOptions,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context');

  const { width, height } = measure(ctx as unknown as Ctx2DLike, result, draw);

  // A tall, narrow source at a high column count and a large font can ask for a
  // canvas past the browser's limits, where it silently comes back blank. Drop
  // to 1x first, then refuse with something the user can act on.
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  if (!fitsCanvasLimits(width * dpr, height * dpr)) dpr = 1;
  if (!fitsCanvasLimits(width, height)) {
    throw new Error(
      `Output is too large to draw (${result.cols}x${result.rows} chars = ` +
        `${Math.ceil(width)}x${Math.ceil(height)}px). Lower the width or font size.`,
    );
  }

  const pxW = Math.max(1, Math.ceil(width * dpr));
  const pxH = Math.max(1, Math.ceil(height * dpr));

  // Assigning width/height resets all context state, so the transform and font
  // must be re-applied afterwards, not before.
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawAscii(ctx as unknown as Ctx2DLike, result, draw);
}

/** Paint into a <pre>, the approach the project brief describes. */
function renderDom(result: AsciiResult, pre: HTMLPreElement, draw: DrawOptions): void {
  pre.style.fontFamily = cssFontFamily(draw.fontFamily);
  pre.style.fontSize = `${draw.fontSize}px`;
  pre.style.lineHeight = String(draw.lineHeight);
  pre.style.background = draw.background;

  if (!result.colors) {
    pre.style.color = draw.foreground;
    // textContent, not innerHTML: no escaping needed and far cheaper.
    pre.textContent = result.text;
    return;
  }

  const { cols, rows, chars, colors } = result;
  const parts: string[] = [];

  for (let y = 0; y < rows; y++) {
    let run = '';
    let runColor = '';

    const flush = (): void => {
      if (!run) return;
      parts.push(`<span style="color:${runColor}">${escapeHtml(run)}</span>`);
      run = '';
    };

    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const color = `rgb(${colors[i * 3]},${colors[i * 3 + 1]},${colors[i * 3 + 2]})`;
      // One span per character would be tens of thousands of nodes per frame.
      // Coalescing equal-coloured runs is what makes this survivable at all.
      if (color !== runColor) {
        flush();
        runColor = color;
      }
      run += chars[i];
    }

    flush();
    if (y < rows - 1) parts.push('\n');
  }

  pre.innerHTML = parts.join('');
}

/** Render with the chosen backend and return how long it took, in ms. */
export function render(
  kind: RendererKind,
  result: AsciiResult,
  targets: RenderTargets,
  draw: DrawOptions,
): number {
  const started = performance.now();

  if (kind === 'canvas') {
    renderCanvas(result, targets.canvas, draw);
  } else {
    renderDom(result, targets.pre, draw);
  }

  show(targets.canvas, kind === 'canvas');
  show(targets.pre, kind === 'dom');

  return performance.now() - started;
}
