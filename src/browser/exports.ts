import type { AsciiResult } from '../lib/types';
import {
  drawAscii,
  fontString,
  measure,
  type Ctx2DLike,
  type DrawOptions,
} from '../render/asciiToCanvas';

/** Exports render at a fixed size, independent of the preview zoom. */
const EXPORT_FONT_SIZE = 14;

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately can cancel the download in some browsers; one tick
  // is enough for the navigation to have been queued.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API unavailable (needs HTTPS or localhost)');
  }
  await navigator.clipboard.writeText(text);
}

export function downloadText(text: string, filename: string): void {
  saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
}

/**
 * Declared `async` deliberately: the guards below throw before any Promise
 * would otherwise be constructed, so a plain function would throw
 * synchronously and escape the caller's `.catch()` as an uncaught error.
 */
export async function downloadPng(
  result: AsciiResult,
  draw: DrawOptions,
  filename: string,
): Promise<void> {
  const exportDraw: DrawOptions = { ...draw, fontSize: EXPORT_FONT_SIZE, padding: 16 };

  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('Could not get a 2D context');
  probe.font = fontString(exportDraw);
  const { width, height } = measure(probe as unknown as Ctx2DLike, result, exportDraw);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context');
  drawAscii(ctx as unknown as Ctx2DLike, result, exportDraw);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode the PNG'));
        return;
      }
      saveBlob(blob, filename);
      resolve();
    }, 'image/png');
  });
}

/** `ASCII-Lens-2026-08-29T03-14-05.png` — sortable and collision-free. */
export function stamp(ext: string): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `ASCII-Lens-${iso}.${ext}`;
}
