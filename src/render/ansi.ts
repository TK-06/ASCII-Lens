import type { AsciiResult } from '../lib/types';

const RESET = '[0m';

/**
 * Render a result as a terminal string, optionally with 24-bit colour.
 *
 * Pure string manipulation, no I/O, so it is testable and works anywhere.
 */
export function toAnsi(result: AsciiResult, color = false): string {
  const { cols, rows, chars, colors } = result;
  if (!color || !colors) return result.text;

  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    let lastKey = '';
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const r = colors[i * 3];
      const g = colors[i * 3 + 1];
      const b = colors[i * 3 + 2];
      const key = `${r};${g};${b}`;
      // Emitting an escape per character triples the byte count and makes some
      // terminals crawl; only switch when the colour actually changes.
      if (key !== lastKey) {
        line += `[38;2;${key}m`;
        lastKey = key;
      }
      line += chars[i];
    }
    lines.push(line + RESET);
  }
  return lines.join('\n');
}
