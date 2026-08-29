import { convert, type ConvertOptions } from '../src/lib/asciiConvert';
import type { AsciiResult } from '../src/lib/types';
import { cssFontFamily, DEFAULT_DRAW, type DrawOptions } from '../src/render/asciiToCanvas';
import { copyText, downloadPng, downloadText, stamp } from '../src/browser/exports';
import { render, type RendererKind, type RenderTargets } from '../src/browser/renderers';
import { imageSource, webcamSource, type FrameSource } from '../src/browser/sources';

/**
 * Browsers honour a real stack, and unlike @napi-rs/canvas the `monospace`
 * generic resolves properly. `ui-monospace` is deliberately absent: in Chromium
 * it measures an advance ratio of 0.89, i.e. it is not fixed-pitch there.
 */
const BROWSER_MONO = '"Cascadia Mono", Consolas, "Courier New", monospace';

const FALLBACK_RAMP = ' .:-=+*#%@';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

// ---------------------------------------------------------------- state

type Mode = 'upload' | 'webcam';

const state = {
  cols: 120,
  ramp: 'blocks',
  customRamp: FALLBACK_RAMP,
  useCustom: false,
  charAspect: 0.55,
  fontSize: 10,
  gamma: 1,
  clip: 0.01,
  autoLevels: true,
  invert: false,
  color: false,
  dither: false,
  edges: false,
  edgeThreshold: 0.5,
  renderer: 'canvas' as RendererKind,
  mode: 'upload' as Mode,
  mirror: true,
};

const convertOptions = (): ConvertOptions => ({
  cols: state.cols,
  // An empty custom ramp would throw; fall back rather than break the loop.
  ramp: state.useCustom ? state.customRamp || FALLBACK_RAMP : state.ramp,
  charAspect: state.charAspect,
  gamma: state.gamma,
  clip: state.clip,
  autoLevels: state.autoLevels,
  invert: state.invert,
  color: state.color,
  dither: state.dither,
  edges: state.edges,
  edgeThreshold: state.edgeThreshold,
});

const drawOptions = (): DrawOptions => ({
  ...DEFAULT_DRAW,
  fontFamily: BROWSER_MONO,
  fontSize: state.fontSize,
  padding: 12,
});

/**
 * Advance width per em of the font the browser actually picked.
 *
 * The correct character aspect is a property of the rendered font, not a
 * constant: Consolas is 0.55 but a fallback can differ by 7% or more, which
 * shows up as a stretched or squashed image. Measure instead of assuming.
 */
function measureCharAspect(): number {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 0.55;
  ctx.font = `100px ${cssFontFamily(BROWSER_MONO)}`;
  const width = ctx.measureText('M').width;
  return width > 0 ? width / 100 : 0.55;
}

// ---------------------------------------------------------------- elements

const targets: RenderTargets = {
  canvas: $<HTMLCanvasElement>('canvas'),
  pre: $<HTMLPreElement>('pre'),
};

const video = $<HTMLVideoElement>('video');
const hud = $('hud');
const emptyState = $('empty');

// ---------------------------------------------------------------- toast

let toastTimer = 0;

function toast(message: string, isError = false): void {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('err', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, isError ? 7000 : 2400);
}

const message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// ---------------------------------------------------------------- render loop

let source: FrameSource | null = null;
let latest: AsciiResult | null = null;
let fps = 0;
let previousFrame = 0;
let lastTimings = { convertMs: 0, renderMs: 0 };

/**
 * Two flags, because the two halves cost very different amounts. Converting a
 * still image is ~5 ms; redrawing an existing result is ~0.2 ms. Font size and
 * renderer choice feed only the draw half, so they must not re-sample the
 * whole image.
 */
let convertDirty = true;
let renderDirty = true;

/** Source or conversion options changed: re-run everything. */
const invalidate = (): void => {
  convertDirty = true;
  renderDirty = true;
};

/** Only display options changed: reuse the existing AsciiResult. */
const invalidateDraw = (): void => {
  renderDirty = true;
};

function updateHud(convertMs: number, renderMs: number, result: AsciiResult): void {
  const parts = [
    `${result.cols}x${result.rows}`,
    `conv ${convertMs.toFixed(2)}ms`,
    `draw ${renderMs.toFixed(2)}ms`,
  ];
  if (source?.live) parts.push(`${fps.toFixed(0)} fps`);
  hud.textContent = parts.join('  ·  ');
}

function drawFrame(now: number): void {
  if (!source) return;

  let result = latest;
  let convertMs = lastTimings.convertMs;

  if (source.live || convertDirty || !result) {
    const pixels = source.frame();
    if (!pixels) return;

    const startedConvert = performance.now();
    try {
      result = convert(pixels, convertOptions());
    } catch (err) {
      // Clear both, or the same failure re-runs on every single frame.
      convertDirty = false;
      renderDirty = false;
      toast(`Conversion failed: ${message(err)}`, true);
      return;
    }
    convertMs = performance.now() - startedConvert;
  }

  let renderMs: number;
  try {
    renderMs = render(state.renderer, result, targets, drawOptions());
  } catch (err) {
    convertDirty = false;
    renderDirty = false;
    toast(`Render failed: ${message(err)}`, true);
    return;
  }

  if (source.live && previousFrame) {
    const delta = now - previousFrame;
    if (delta > 0) {
      const instant = 1000 / delta;
      // Smoothed, or the readout is unreadable noise.
      fps = fps ? fps * 0.9 + instant * 0.1 : instant;
    }
  }
  previousFrame = now;

  latest = result;
  lastTimings = { convertMs, renderMs };
  convertDirty = false;
  renderDirty = false;
  emptyState.hidden = true;
  updateHud(convertMs, renderMs, result);
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  if (!source) return;
  // A still image only needs redrawing when a control moved.
  if (!source.live && !convertDirty && !renderDirty) return;
  drawFrame(now);
}

// ---------------------------------------------------------------- sources

function stopSource(): void {
  source?.stop();
  source = null;
  latest = null;
  fps = 0;
  previousFrame = 0;
  targets.canvas.hidden = true;
  targets.pre.hidden = true;
  emptyState.hidden = false;
  hud.textContent = 'ready';
  // Otherwise the panel keeps naming a file that is no longer loaded.
  $('sourceinfo').textContent = 'no image loaded';
}

async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    toast(`${file.name} is not an image`, true);
    return;
  }
  try {
    const next = await imageSource(file);
    stopSource();
    source = next;
    $('sourceinfo').textContent = next.label;
    invalidate();
  } catch (err) {
    toast(message(err), true);
  }
}

function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError') {
    return 'Camera permission denied. Allow it via the icon in the address bar, then press Start.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera found.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is already in use by another app.';
  }
  return message(err);
}

/**
 * Cancellation token for camera acquisition.
 *
 * getUserMedia stays pending for as long as the permission prompt is open, and
 * `source` is null that whole time — so a teardown during that window would
 * stop nothing, and the late continuation would then install a live camera
 * behind the user's back. Bumping this invalidates any acquisition in flight.
 */
let cameraGeneration = 0;

async function startCamera(): Promise<void> {
  if (source?.kind === 'webcam') return;

  const generation = ++cameraGeneration;
  // Disable up front, not after the await, or a second click starts a second
  // stream whose play() aborts the first.
  $<HTMLButtonElement>('cam-start').disabled = true;
  $('caminfo').textContent = 'starting…';

  try {
    const next = await webcamSource({
      video,
      mirror: () => state.mirror,
      onLost: () => {
        stopCamera();
        toast('The camera was disconnected or taken by another app.', true);
      },
    });

    // Superseded by a newer start, cancelled by Stop, or the user left webcam
    // mode while the prompt was open. Tear it down instead of installing it.
    if (generation !== cameraGeneration || state.mode !== 'webcam') {
      next.stop();
      return;
    }

    stopSource();
    source = next;
    $('caminfo').textContent = next.label;
    $<HTMLButtonElement>('cam-stop').disabled = false;
    invalidate();
  } catch (err) {
    if (generation !== cameraGeneration) return;
    $('caminfo').textContent = 'camera off';
    $<HTMLButtonElement>('cam-start').disabled = false;
    toast(cameraError(err), true);
  }
}

function stopCamera(): void {
  cameraGeneration++; // cancels any acquisition still awaiting permission
  if (source?.kind === 'webcam') stopSource();
  $('caminfo').textContent = 'camera off';
  $<HTMLButtonElement>('cam-start').disabled = false;
  $<HTMLButtonElement>('cam-stop').disabled = true;
}

// ---------------------------------------------------------------- modes

function setMode(mode: Mode): void {
  if (state.mode === mode) return;
  state.mode = mode;

  const upload = mode === 'upload';
  $('upload-controls').hidden = !upload;
  $('webcam-controls').hidden = upload;

  for (const [id, active] of [
    ['mode-upload', upload],
    ['mode-webcam', !upload],
  ] as const) {
    const btn = $<HTMLButtonElement>(id);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  }

  // Releasing the camera on the way out is what turns the hardware light off.
  if (upload) {
    stopCamera();
  } else {
    stopSource();
    void startCamera();
  }
}

// ---------------------------------------------------------------- controls

const updaters: (() => void)[] = [];

function bindRange(
  id: string,
  labelId: string,
  apply: (value: number) => void,
  format: (value: number) => string,
  mark: () => void = invalidate,
): void {
  const input = $<HTMLInputElement>(id);
  const label = $(labelId);
  const update = (): void => {
    const value = Number(input.value);
    apply(value);
    label.textContent = format(value);
    mark();
  };
  input.addEventListener('input', update);
  updaters.push(update);
  update();
}

function bindCheck(id: string, apply: (value: boolean) => void): void {
  const input = $<HTMLInputElement>(id);
  const update = (): void => {
    apply(input.checked);
    invalidate();
  };
  input.addEventListener('change', update);
  updaters.push(update);
  update();
}

function bindControls(): void {
  bindRange('cols', 'v-cols', (v) => (state.cols = v), (v) => String(v));
  bindRange('aspect', 'v-aspect', (v) => (state.charAspect = v), (v) => v.toFixed(2));
  bindRange('font', 'v-font', (v) => (state.fontSize = v), (v) => String(v), invalidateDraw);
  bindRange('gamma', 'v-gamma', (v) => (state.gamma = v), (v) => v.toFixed(2));
  bindRange('clip', 'v-clip', (v) => (state.clip = v), (v) => v.toFixed(3));
  bindRange('edge', 'v-edge', (v) => (state.edgeThreshold = v), (v) => v.toFixed(2));

  bindCheck('autolevels', (v) => (state.autoLevels = v));
  bindCheck('invert', (v) => (state.invert = v));
  bindCheck('color', (v) => (state.color = v));
  bindCheck('dither', (v) => (state.dither = v));
  bindCheck('edges', (v) => (state.edges = v));
  bindCheck('mirror', (v) => (state.mirror = v));

  const ramp = $<HTMLSelectElement>('ramp');
  const customRamp = $<HTMLInputElement>('customramp');
  const updateRamp = (): void => {
    state.useCustom = ramp.value === 'custom';
    $('custom-row').hidden = !state.useCustom;
    if (!state.useCustom) state.ramp = ramp.value;
    state.customRamp = customRamp.value;
    invalidate();
  };
  ramp.addEventListener('change', updateRamp);
  customRamp.addEventListener('input', updateRamp);
  updaters.push(updateRamp);
  updateRamp();

  for (const [id, kind] of [
    ['r-canvas', 'canvas'],
    ['r-dom', 'dom'],
  ] as const) {
    $(id).addEventListener('click', () => {
      state.renderer = kind;
      $('r-canvas').classList.toggle('active', kind === 'canvas');
      $('r-dom').classList.toggle('active', kind === 'dom');
      $('r-canvas').setAttribute('aria-checked', String(kind === 'canvas'));
      $('r-dom').setAttribute('aria-checked', String(kind === 'dom'));
      invalidateDraw();
    });
  }
}

/** Snapshot of every control's markup value, captured before anything changes. */
const initialValues = new Map<string, string | boolean>();

function captureDefaults(): void {
  for (const el of document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '.panel input, .panel select',
  )) {
    if (!el.id) continue;
    initialValues.set(
      el.id,
      el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value,
    );
  }
}

function resetControls(): void {
  for (const [id, value] of initialValues) {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = value as boolean;
    } else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      el.value = value as string;
    }
  }
  for (const update of updaters) update();
  toast('Controls reset');
}

// ---------------------------------------------------------------- input wiring

function bindDropzone(): void {
  const zone = $('dropzone');
  const file = $<HTMLInputElement>('file');

  zone.addEventListener('click', () => file.click());
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      file.click();
    }
  });

  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    if (chosen) void loadFile(chosen);
    // Reset so re-picking the same file fires change again.
    file.value = '';
  });

  const over = (on: boolean) => (event: DragEvent) => {
    event.preventDefault();
    zone.classList.toggle('over', on);
  };
  zone.addEventListener('dragover', over(true));
  zone.addEventListener('dragleave', over(false));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('over');
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) {
      setMode('upload');
      void loadFile(dropped);
    }
  });

  // Whole-window drop, so a miss outside the zone does not navigate away.
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => event.preventDefault());

  document.addEventListener('paste', (event) => {
    const item = [...(event.clipboardData?.items ?? [])].find((i) =>
      i.type.startsWith('image/'),
    );
    const pasted = item?.getAsFile();
    if (pasted) {
      setMode('upload');
      void loadFile(pasted);
    }
  });
}

function bindExports(): void {
  const needResult = (): AsciiResult | null => {
    if (!latest) toast('Nothing to export yet', true);
    return latest;
  };

  $('copy').addEventListener('click', () => {
    const result = needResult();
    if (!result) return;
    copyText(result.text).then(
      () => toast(`Copied ${result.cols}x${result.rows} characters`),
      (err: unknown) => toast(message(err), true),
    );
  });

  $('dl-txt').addEventListener('click', () => {
    const result = needResult();
    if (result) downloadText(result.text, stamp('txt'));
  });

  $('dl-png').addEventListener('click', () => {
    const result = needResult();
    if (!result) return;
    downloadPng(result, drawOptions(), stamp('png')).catch((err: unknown) =>
      toast(message(err), true),
    );
  });
}

// ---------------------------------------------------------------- boot

// Seed the aspect control from the real font before defaults are captured, so
// Reset restores the measured value rather than the markup placeholder.
const nativeAspect = measureCharAspect();
$<HTMLInputElement>('aspect').value = nativeAspect.toFixed(2);

captureDefaults();
bindControls();
bindDropzone();
bindExports();

$('mode-upload').addEventListener('click', () => setMode('upload'));
$('mode-webcam').addEventListener('click', () => setMode('webcam'));
$('cam-start').addEventListener('click', () => void startCamera());
$('cam-stop').addEventListener('click', () => stopCamera());
$('reset').addEventListener('click', resetControls);

// Free the camera if the tab goes away without a mode switch.
window.addEventListener('pagehide', () => source?.stop());

// Dev-only hook. The e2e harness uses it to force redraws and read warm
// timings; a single cold frame is not a fair renderer comparison.
if (import.meta.env.DEV) {
  Object.assign(window, {
    __lens: {
      invalidate,
      timings: () => lastTimings,
      setRenderer: (kind: RendererKind) => {
        state.renderer = kind;
        invalidate();
      },
    },
  });
}

requestAnimationFrame(loop);
