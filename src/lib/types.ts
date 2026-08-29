/**
 * Core types for the ASCII conversion engine.
 *
 * Nothing in src/lib touches a DOM or Node API. The engine's input is a plain
 * object shaped exactly like the browser's ImageData, so a browser caller can
 * pass `ctx.getImageData(...)` straight in, and a Node caller can pass the
 * equivalent from @napi-rs/canvas. Platform code lives in the adapters only.
 */

/** A pixel buffer. Structurally identical to the browser's ImageData. */
export interface RgbaImage {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** A colour as a plain triple, 0-255 per channel. */
export type Rgb = readonly [r: number, g: number, b: number];

export type RampName = 'simple' | 'detailed' | 'blocks';

export type ColorMode = 'direct' | 'normalized' | 'solid';

/** Which luminance weights to use. See LUMA_WEIGHTS. */
export type LumaSet = 'bt709' | 'bt601';

export interface AsciiOptions {
  /** Output width, in characters. */
  cols: number;

  /**
   * Character ramp, ordered darkest source pixel -> lightest source pixel.
   * Either a preset name or a literal ramp string.
   */
  ramp: RampName | string;

  /**
   * Width / height of one rendered character cell. Monospace glyphs are taller
   * than they are wide, so without this the output looks vertically stretched.
   * Measured 0.55 for Consolas at line-height 1.
   */
  charAspect: number;

  /**
   * Reverse the ramp.
   *
   * The default ramp direction assumes LIGHT TEXT ON A DARK BACKGROUND: a
   * bright pixel becomes a dense glyph ('@'), which emits more light. Printing
   * dark text on white paper wants the opposite, which is what invert is for.
   */
  invert: boolean;

  /** Stretch luminance to the full range using percentile clipping. */
  autoLevels: boolean;

  /** Fraction clipped from each end of the histogram when autoLevels is on. */
  clip: number;

  /** Gamma on normalised luminance. <1 brightens midtones, >1 darkens them. */
  gamma: number;

  /** Floyd-Steinberg error diffusion across the character grid. */
  dither: boolean;

  /** Sobel edge detection; strong edges become | / - \ instead of ramp glyphs. */
  edges: boolean;

  /** Normalised gradient magnitude (0-1) above which a cell becomes an edge glyph. */
  edgeThreshold: number;

  /** Populate `colors` on the result with each cell's mean RGB. */
  color: boolean;

  /**
   * How colour and glyph density share the job of carrying the image.
   *
   * `direct` samples the cell colour as-is. Density and colour then BOTH encode
   * luminance, so shadows get darkened twice and go muddy.
   *
   * `normalized` scales each cell's colour up to full brightness, keeping hue
   * and saturation. Density carries luminance, colour carries hue — no double
   * darkening, and the character texture survives.
   *
   * `solid` gives every cell the densest glyph and lets colour do everything.
   * Cleanest image, least ASCII.
   */
  colorMode: ColorMode;

  /** Luminance weight set. bt601 is what most other converters use. */
  lumaSet: LumaSet;

  /**
   * Cells below this normalised brightness are left blank.
   *
   * A cheap way to knock out background without touching the tone curve. 0
   * disables it.
   */
  threshold: number;

  /**
   * Choose each glyph by matching its ink pattern to the cell, instead of by
   * matching average brightness to a ramp.
   *
   * Needs a GlyphAtlas, which has to be built from a real font and therefore
   * cannot be constructed inside this dependency-free module — the caller
   * passes one in. Ignored when absent.
   */
  atlas?: unknown;

  /** 0 = pure shape matching, 1 = pure tone. Only used with an atlas. */
  toneWeight: number;
}

/**
 * The downsampled character grid, before any glyph is chosen.
 *
 * Both arrays are flat and row-major rather than nested. Webcam mode re-runs
 * this every frame, so the layout is chosen for allocation and cache cost.
 */
export interface CellGrid {
  cols: number;
  rows: number;
  /** Mean colour per cell. Length cols * rows * 3. */
  rgb: Uint8ClampedArray;
  /** Mean luminance per cell, 0-255. Length cols * rows. */
  luma: Float32Array;
}

export interface AsciiResult {
  cols: number;
  rows: number;
  /** One entry per cell, row-major. Length cols * rows. */
  chars: string[];
  /** Mean RGB per cell, row-major. Present only when `color` was set. */
  colors?: Uint8ClampedArray;
  /** `chars` assembled into rows joined by \n. */
  text: string;
}

/** Everything except `cols`, which has no sensible default. */
export const DEFAULT_OPTIONS: Omit<AsciiOptions, 'cols'> = {
  ramp: 'simple',
  charAspect: 0.55,
  invert: false,
  autoLevels: true,
  clip: 0.01,
  gamma: 1,
  dither: false,
  edges: false,
  // Tuned on samples/icarus.jpg: at 0.35 roughly half of all non-blank cells
  // became strokes, which replaces the picture instead of accenting it. 0.5
  // keeps it near a quarter, so edges read as an outline over the tones.
  edgeThreshold: 0.5,
  color: false,
  colorMode: 'direct',
  lumaSet: 'bt709',
  threshold: 0,
  toneWeight: 0.4,
};
