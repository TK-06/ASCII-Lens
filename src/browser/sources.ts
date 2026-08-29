import type { RgbaImage } from '../lib/types';

/**
 * A source of frames for the engine.
 *
 * Upload and webcam differ only in whether `frame()` changes over time, so the
 * render loop can treat them identically and only consult `live`.
 */
export interface FrameSource {
  readonly kind: 'image' | 'webcam';
  readonly live: boolean;
  readonly label: string;
  /** Which camera produced this, when the source is a webcam. */
  readonly facing?: 'user' | 'environment';
  /** Latest pixels, or null if nothing is ready yet. */
  frame(): RgbaImage | null;
  stop(): void;
}

/**
 * Longest edge kept when decoding a still image.
 *
 * Output is at most ~300 characters wide, so pixels beyond this contribute
 * nothing visible, while a 6000px photo would mean re-averaging 24M pixels on
 * every slider drag.
 */
const MAX_STILL_EDGE = 1600;

function scaleToFit(w: number, h: number, max: number): [number, number] {
  const longest = Math.max(w, h);
  // Clamp on BOTH paths. An SVG with no intrinsic size reports naturalWidth 0,
  // which satisfies `longest <= max` and would flow 0x0 through to
  // getImageData(0, 0, 0, 0) — that throws IndexSizeError.
  if (longest <= max) return [Math.max(1, w), Math.max(1, h)];
  const k = max / longest;
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

function readPixels(
  drawable: CanvasImageSource,
  w: number,
  h: number,
  canvas: HTMLCanvasElement,
): RgbaImage {
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get a 2D context');
  ctx.drawImage(drawable, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  return { data: data.data, width: w, height: h };
}

/** Decode a File into a cached, size-capped pixel buffer. */
export async function imageSource(file: File): Promise<FrameSource> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Could not decode ${file.name}`));
      img.src = url;
    });

    const [w, h] = scaleToFit(img.naturalWidth, img.naturalHeight, MAX_STILL_EDGE);
    const pixels = readPixels(img, w, h, document.createElement('canvas'));
    const scaled = w !== img.naturalWidth;

    return {
      kind: 'image',
      live: false,
      label:
        `${file.name} — ${img.naturalWidth}x${img.naturalHeight}` +
        (scaled ? ` (working at ${w}x${h})` : ''),
      frame: () => pixels,
      stop: () => {},
    };
  } finally {
    // Safe once decode has finished: the bitmap is already in memory, and
    // leaking object URLs across repeated uploads is a real memory cost.
    URL.revokeObjectURL(url);
  }
}

export type Facing = 'user' | 'environment';

export interface WebcamOptions {
  video: HTMLVideoElement;
  mirror: () => boolean;
  /** Front or rear camera. Meaningful on phones; ignored by most laptops. */
  facing?: Facing;
  /** Called if the device goes away on its own — unplugged, or taken by another app. */
  onLost?: () => void;
}

/**
 * True when the device offers more than one camera.
 *
 * Labels are empty until permission has been granted, but the COUNT is
 * available beforehand, which is all that is needed to decide whether a flip
 * control is worth showing.
 */
export async function hasMultipleCameras(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length > 1;
  } catch {
    return false;
  }
}

/** Open the camera and expose each rendered video frame as pixels. */
export async function webcamSource(opts: WebcamOptions): Promise<FrameSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'getUserMedia is unavailable. It needs a secure context: localhost or HTTPS.',
    );
  }

  // `ideal` rather than `exact` throughout: a laptop has no environment camera
  // and an over-constrained request would fail outright instead of falling
  // back to the only camera present.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 960 },
      height: { ideal: 540 },
      facingMode: { ideal: opts.facing ?? 'user' },
    },
    audio: false,
  });

  // Everything past this point can throw — video.play() rejects with
  // AbortError if srcObject is reassigned, and getContext can return null.
  // Without this guard the stream stays live with no reference to it, so
  // nothing can ever stop it and the camera light stays on until reload.
  try {
    return await openStream(stream, opts);
  } catch (err) {
    for (const track of stream.getTracks()) track.stop();
    opts.video.srcObject = null;
    throw err;
  }
}

async function openStream(
  stream: MediaStream,
  opts: WebcamOptions,
): Promise<FrameSource> {
  const { video, mirror } = opts;
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();

  const scratch = document.createElement('canvas');
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get a 2D context');

  const settings = stream.getVideoTracks()[0]?.getSettings();
  const facing = (settings?.facingMode as Facing | undefined) ?? opts.facing ?? 'user';

  // A track can end without us asking — the device is unplugged, or another
  // app takes it. Nothing else notices: the video element keeps its last
  // decoded frame and videoWidth stays non-zero, so the preview would sit on a
  // frozen image reporting a healthy frame rate.
  let lost = false;
  const handleEnded = (): void => {
    if (lost) return;
    lost = true;
    opts.onLost?.();
  };
  for (const track of stream.getTracks()) {
    track.addEventListener('ended', handleEnded);
  }

  return {
    kind: 'webcam',
    live: true,
    facing,
    label: `camera — ${settings?.width ?? '?'}x${settings?.height ?? '?'}`,

    frame() {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return null;

      if (scratch.width !== w || scratch.height !== h) {
        scratch.width = w;
        scratch.height = h;
      }

      // Mirroring here rather than in CSS means the exported PNG and the
      // preview agree; flipping only the display would silently disagree.
      ctx.save();
      if (mirror()) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      const data = ctx.getImageData(0, 0, w, h);
      return { data: data.data, width: w, height: h };
    },

    stop() {
      // Mark first: calling track.stop() fires 'ended', and a deliberate
      // teardown must not be reported as the device being lost.
      lost = true;
      for (const track of stream.getTracks()) {
        track.removeEventListener('ended', handleEnded);
        track.stop();
      }
      video.srcObject = null;
    },
  };
}
