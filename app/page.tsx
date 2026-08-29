'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AsciiStage, type StageHandle, type StageStats } from '@/components/AsciiStage';
import { ControlBar } from '@/components/ControlBar';
import { ImageDropzone } from '@/components/ImageDropzone';
import { ModeSwitcher } from '@/components/ModeSwitcher';
import { WebcamPanel } from '@/components/WebcamPanel';
import { Press } from '@/components/ui/Press';
import { DEFAULTS, MAX_COLS, type LensOptions, type Mode } from '@/lib/options';
import { useCoarsePointer } from '@/lib/useCoarsePointer';
import { useGlyphAtlas } from '@/lib/useGlyphAtlas';
import { useFrameSource } from '@/lib/useFrameSource';
import { copyText, downloadPng, downloadText, stamp } from '@/src/browser/exports';
import { cssFontFamily } from '@/src/render/asciiToCanvas';

const ART_FONT =
  'Consolas, "Cascadia Mono", "DejaVu Sans Mono", "Liberation Mono", ui-monospace, monospace';

/**
 * The right character aspect is a property of the font the browser actually
 * resolved, not a constant. Consolas is 0.55, but a fallback can differ by
 * more than 7%, which shows as a vertically stretched picture.
 */
function measureAspect(): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return DEFAULTS.charAspect;
  ctx.font = `100px ${cssFontFamily(ART_FONT)}`;
  const w = ctx.measureText('M').width;
  return w > 0 ? Number((w / 100).toFixed(3)) : DEFAULTS.charAspect;
}

export default function Page() {
  const [mode, setMode] = useState<Mode>('upload');
  const [options, setOptions] = useState<LensOptions>(DEFAULTS);
  const [stats, setStats] = useState<StageStats | null>(null);
  const [mirror, setMirror] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<StageHandle | null>(null);

  const {
    source, label, error, busy, loadFile, startCamera, stopCamera, clearError,
    flipCamera, canFlip, facing,
  } = useFrameSource(mode, videoRef, mirror);

  const touch = useCoarsePointer();
  // Built lazily: 40ms of rasterisation nobody pays for unless they ask.
  const atlas = useGlyphAtlas(options.engine === 'shape', ART_FONT);

  const patch = useCallback(
    (p: Partial<LensOptions>) => setOptions((o) => ({ ...o, ...p })),
    [],
  );

  // Measure once on mount rather than trusting the default constant.
  useEffect(() => {
    setOptions((o) => ({ ...o, charAspect: measureAspect() }));
  }, []);

  // A phone has a narrower screen AND a slower CPU, so 140 columns is both
  // illegible and needlessly expensive there.
  useEffect(() => {
    if (touch) setOptions((o) => (o.cols > 90 ? { ...o, cols: 90 } : o));
  }, [touch]);

  // Live colour above ~200 columns misses the frame budget, so entering
  // webcam mode clamps rather than letting the picture stutter.
  useEffect(() => {
    setOptions((o) =>
      o.cols > MAX_COLS[mode] ? { ...o, cols: MAX_COLS[mode] } : o,
    );
  }, [mode]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        setMode('upload');
        void loadFile(file);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [loadFile]);

  // A miss outside the dropzone should not navigate away from the app.
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', swallow);
    window.addEventListener('drop', swallow);
    return () => {
      window.removeEventListener('dragover', swallow);
      window.removeEventListener('drop', swallow);
    };
  }, []);

  const say = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 2600);
  }, []);

  const withResult = (fn: (r: NonNullable<ReturnType<StageHandle['current']>>) => void) => {
    const result = stageRef.current?.current();
    if (!result) {
      say('Nothing to export yet.');
      return;
    }
    fn(result);
  };

  const streaming = source?.kind === 'webcam';
  const hasOutput = Boolean(source);

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ---------------- masthead ---------------- */}
      <header className="border-b-[2.5px] border-ink bg-paper">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_auto_1fr]">
          <h1 className="justify-self-center text-[19px] font-extrabold uppercase leading-none tracking-[-0.035em] sm:justify-self-start">
            <span className="misreg" data-text="ASCII-Lens">
              ASCII-Lens
            </span>
          </h1>

          <div className="justify-self-center">
            <ModeSwitcher mode={mode} onChange={setMode} />
          </div>

          <p
            className="justify-self-center text-[10.5px] font-bold tracking-[0.06em] text-muted tabular-nums sm:justify-self-end"
            aria-live="off"
          >
            {stats
              ? `${stats.cols}×${stats.rows} · ${stats.convertMs.toFixed(1)} ms` +
                (streaming ? ` · ${stats.fps.toFixed(0)} fps` : '')
              : 'Ready'}
          </p>
        </div>
      </header>

      {/* ---------------- tone + effects ---------------- */}
      {/* A full bar of disabled controls on the landing screen reads as broken
          chrome and competes with the dropzone, which is meant to be the only
          thing there. It appears with the first frame. */}
      {hasOutput && (
        <ControlBar options={options} mode={mode} disabled={false} onChange={patch} />
      )}

      {/* ---------------- stage ---------------- */}
      <main className="halftone relative flex flex-1 flex-col items-center justify-center gap-5 bg-stage px-4 py-8">
        {error && (
          <div
            role="alert"
            className="keyline drop-orange max-w-[560px] bg-field px-4 py-3 text-[12px] font-semibold"
          >
            {error}
            <button
              onClick={clearError}
              className="ml-3 underline decoration-2 underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {!hasOutput && mode === 'upload' && <ImageDropzone onFile={loadFile} />}

        {!hasOutput && mode === 'webcam' && (
          <WebcamPanel
            streaming={false}
            busy={busy}
            mirror={mirror}
            canFlip={canFlip}
            facing={facing}
            onStart={() => void startCamera()}
            onStop={stopCamera}
            onMirror={setMirror}
            onFlip={() => void flipCamera()}
          />
        )}

        <AsciiStage
          source={source}
          options={options}
          atlas={atlas}
          onStats={setStats}
          onError={say}
          handleRef={stageRef}
        />

        {/* The way back to a new image stays on screen the whole time. */}
        {hasOutput && (
          <div className="flex w-full max-w-[900px] flex-wrap items-center justify-center gap-2">
            {mode === 'upload' ? (
              <>
                <span className="keyline bg-field px-3 py-1.5 text-[11px] font-semibold">
                  <span className="text-muted">Source </span>
                  <span style={{ fontFamily: 'var(--font-art)' }}>{label}</span>
                </span>
                <ImageDropzone onFile={loadFile} compact />
              </>
            ) : (
              <WebcamPanel
                streaming
                busy={busy}
                mirror={mirror}
                canFlip={canFlip}
                facing={facing}
                onStart={() => void startCamera()}
                onStop={stopCamera}
                onMirror={setMirror}
                onFlip={() => void flipCamera()}
              />
            )}

            <span className="mx-1 hidden h-6 w-[2.5px] bg-ink sm:block" aria-hidden />

            <Press
              onClick={() =>
                withResult((r) =>
                  copyText(r.text).then(
                    () => say(`Copied ${r.cols}×${r.rows} characters`),
                    (e: unknown) => say(e instanceof Error ? e.message : String(e)),
                  ),
                )
              }
            >
              Copy text
            </Press>
            <Press onClick={() => withResult((r) => downloadText(r.text, stamp('txt')))}>
              .txt
            </Press>
            <Press
              variant="blue"
              onClick={() =>
                withResult((r) => {
                  const draw = stageRef.current?.drawOptions();
                  if (!draw) return;
                  // Export on paper, not on the transparent preview ground.
                  downloadPng(
                    r,
                    { ...draw, background: '#f6f4ee', foreground: '#13161c', padding: 16 },
                    stamp('png'),
                  ).catch((e: unknown) => say(e instanceof Error ? e.message : String(e)));
                })
              }
            >
              {streaming ? 'Snapshot .png' : '.png'}
            </Press>
          </div>
        )}
      </main>

      {/* ---------------- colophon ---------------- */}
      <footer className="border-t-[2.5px] border-ink bg-paper">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[10px] font-bold tracking-[0.08em] text-muted">
          <span className="uppercase tracking-[0.1em]">Converted in your browser · nothing is uploaded</span>
          <span className="tabular-nums">
            {stats ? `${stats.renderMs.toFixed(1)} ms draw` : '—'}
          </span>
        </div>
      </footer>

      {/* getUserMedia needs a real video element to decode into. */}
      <video ref={videoRef} playsInline muted hidden />

      {notice && (
        <div
          role="status"
          className="keyline drop-ink fixed bottom-6 left-1/2 -translate-x-1/2 bg-orange px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-ink"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
