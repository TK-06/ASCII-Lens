'use client';

import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';

import { convert } from '@/src/lib/asciiConvert';
import type { AsciiResult } from '@/src/lib/types';
import { render } from '@/src/browser/renderers';
import { DEFAULT_DRAW, type DrawOptions } from '@/src/render/asciiToCanvas';
import type { FrameSource } from '@/src/browser/sources';
import type { LensOptions } from '@/lib/options';
import type { GlyphAtlas } from '@/src/render/glyphAtlas';
import type { ConvertOptions } from '@/src/lib/asciiConvert';

export interface StageStats {
  cols: number;
  rows: number;
  convertMs: number;
  renderMs: number;
  fps: number;
}

export interface StageHandle {
  /** Latest result, for the export controls. Null until a frame has rendered. */
  current: () => AsciiResult | null;
  drawOptions: () => DrawOptions;
}

const ART_FONT =
  'Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", ui-monospace, monospace';

/**
 * Translate the UI's engine choice into engine options.
 *
 * `classic` deliberately turns OFF the things that make our output better —
 * Rec.601 weights and no contrast stretch — because a comparison is only
 * meaningful if the other approach is reproduced faithfully rather than
 * strawmanned.
 */
function engineOptions(o: LensOptions, atlas: GlyphAtlas | null): ConvertOptions {
  const base: ConvertOptions = {
    cols: o.cols,
    ramp: o.ramp,
    charAspect: o.charAspect,
    gamma: o.gamma,
    clip: o.clip,
    autoLevels: o.autoLevels,
    invert: o.invert,
    color: o.color,
    colorMode: o.colorMode,
    dither: o.dither,
    edges: o.edges,
    edgeThreshold: o.edgeThreshold,
  };

  if (o.engine === 'classic') {
    return { ...base, lumaSet: 'bt601', autoLevels: false, dither: false, ramp: 'simple' };
  }
  if (o.engine === 'shape' && atlas) {
    return { ...base, atlas, toneWeight: o.toneWeight };
  }
  return base;
}

export function AsciiStage({
  source,
  options,
  atlas,
  onStats,
  onError,
  handleRef,
}: {
  source: FrameSource | null;
  options: LensOptions;
  atlas: GlyphAtlas | null;
  onStats: (s: StageStats | null) => void;
  onError: (message: string) => void;
  handleRef: RefObject<StageHandle | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const latest = useRef<AsciiResult | null>(null);

  // Read through refs inside the loop so changing an option never restarts it.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const atlasRef = useRef(atlas);
  atlasRef.current = atlas;
  const sourceRef = useRef(source);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const dirty = useRef(true);
  useEffect(() => {
    sourceRef.current = source;
    dirty.current = true;
    if (!source) {
      latest.current = null;
      onStatsRef.current(null);
    }
  }, [source]);

  // Any option change invalidates the frame; the loop redraws once and idles.
  useEffect(() => {
    dirty.current = true;
  }, [options, atlas]);

  const draw = (): DrawOptions => ({
    ...DEFAULT_DRAW,
    fontFamily: ART_FONT,
    fontSize: optionsRef.current.fontSize,
    background: 'transparent',
    foreground: '#13161c',
    padding: 0,
  });

  useImperativeHandle(handleRef, () => ({
    current: () => latest.current,
    drawOptions: draw,
  }));

  useEffect(() => {
    let raf = 0;
    let previous = 0;
    let fps = 0;
    let failed = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const src = sourceRef.current;
      if (!src) return;
      if (!src.live && !dirty.current) return;
      if (failed && !dirty.current) return;

      const pixels = src.frame();
      if (!pixels) return;

      const opts = optionsRef.current;
      const canvas = canvasRef.current;
      const pre = preRef.current;
      if (!canvas || !pre) return;

      try {
        const t0 = performance.now();
        const result = convert(pixels, engineOptions(opts, atlasRef.current));
        const convertMs = performance.now() - t0;

        // Measured, not guessed: a <pre> is ~0.1 ms for plain output where the
        // canvas is 0.4 ms, and the text stays selectable. Colour reverses it —
        // the canvas is roughly 40% faster once every cell needs its own fill.
        const renderMs = render(
          opts.color ? 'canvas' : 'dom',
          result,
          { canvas, pre },
          draw(),
        );

        if (src.live && previous) {
          const delta = now - previous;
          if (delta > 0) fps = fps ? fps * 0.9 + (1000 / delta) * 0.1 : 1000 / delta;
        }
        previous = now;

        latest.current = result;
        failed = false;
        dirty.current = false;
        onStatsRef.current({
          cols: result.cols,
          rows: result.rows,
          convertMs,
          renderMs,
          fps,
        });
      } catch (err) {
        // Clear the flag first, or the same failure re-throws every frame.
        dirty.current = false;
        failed = true;
        onErrorRef.current(err instanceof Error ? err.message : String(err));
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const showCanvas = Boolean(source) && options.color;
  const showPre = Boolean(source) && !options.color;

  return (
    <div className="grid max-w-full place-items-center">
      <canvas
        ref={canvasRef}
        hidden={!showCanvas}
        className="max-w-full keyline drop-blue bg-field"
      />
      <pre
        ref={preRef}
        hidden={!showPre}
        aria-label="ASCII output"
        className="art keyline drop-blue max-w-full overflow-hidden bg-field p-3"
      />
    </div>
  );
}
