/**
 * End-to-end check of the playground against a real Chromium.
 *
 * Needs the dev server running:  npm run play   (in another terminal)
 * then                          npm run verify
 *
 * Chromium's fake media device means Webcam Mode is genuinely exercised here,
 * not just the upload path.
 */
import { existsSync } from 'node:fs';

import { chromium, type ConsoleMessage, type Page } from 'playwright';

declare global {
  interface Window {
    __lens: {
      invalidate(): void;
      timings(): { convertMs: number; renderMs: number };
      setRenderer(kind: 'canvas' | 'dom'): void;
    };
  }
}

const URL = process.env.PLAY_URL ?? 'http://localhost:5173/';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

const section = (title: string): void => console.log(`\n${title}`);

const median = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** Brightness spread across the output canvas: flat means nothing was drawn. */
async function canvasStats(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#canvas');
    if (!c || !c.width) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 4 * 17) {
      const v = d[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { w: c.width, h: c.height, spread: max - min };
  });
}

const hudText = (page: Page) => page.locator('#hud').innerText();

async function settle(page: Page, frames = 3): Promise<void> {
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
}

/** Warm, repeated measurement — one cold frame is not a fair comparison. */
async function benchmark(
  page: Page,
  kind: 'canvas' | 'dom',
  cols: number,
  color: boolean,
): Promise<{ convert: number; render: number }> {
  await page.locator('#cols').fill(String(cols));
  const colorBox = page.locator('#color');
  if (color) await colorBox.check();
  else await colorBox.uncheck();

  await page.evaluate((k) => window.__lens.setRenderer(k), kind);

  const samples = await page.evaluate(async (runs) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    const out: { convertMs: number; renderMs: number }[] = [];
    for (let i = 0; i < runs; i++) {
      window.__lens.invalidate();
      await raf();
      await raf();
      out.push(window.__lens.timings());
    }
    return out;
  }, 24);

  // Drop the first third: JIT warm-up and first-paint costs.
  const warm = samples.slice(8);
  return {
    convert: median(warm.map((s) => s.convertMs)),
    render: median(warm.map((s) => s.renderMs)),
  };
}

/** A sample that exists in a fresh clone. Personal photos are gitignored. */
function samplePath(): string {
  const candidates = ['samples/1404.jpg', 'samples/generated/circle.png'];
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(
    'No sample image found. Run `npm run fixtures` to generate one, ' +
      'or drop any image at samples/1404.jpg.',
  );
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1500, height: 950 },
    permissions: ['camera', 'clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
  });

  // tsx compiles this file with esbuild, which wraps inner function
  // declarations in a __name() helper. Playwright ships the function SOURCE to
  // the page, where that helper does not exist, so define a no-op version.
  // Passed as a raw string so esbuild cannot rewrite the shim itself.
  await context.addInitScript({
    content: 'globalThis.__name = globalThis.__name || function (fn) { return fn; };',
  });

  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  // ------------------------------------------------------------ load
  section('Page load');
  await page.goto(URL, { waitUntil: 'networkidle' });
  check('page loads', (await page.title()) === 'ASCII-Lens playground');
  check('empty state visible before a source', await page.locator('#empty').isVisible());
  check('no console errors on boot', errors.length === 0, errors.join(' | '));

  // The right character aspect is a property of the resolved font, not a
  // constant; a mismatch stretches every render vertically.
  const fontAspect = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return 0;
    c.font = '100px "Cascadia Mono", Consolas, "Courier New", monospace';
    return c.measureText('M').width / 100;
  });
  const seeded = Number(await page.locator('#aspect').inputValue());
  check('char aspect is measured from the real font, not hardcoded',
    fontAspect > 0 && Math.abs(seeded - fontAspect) < 0.011,
    `font=${fontAspect.toFixed(3)} slider=${seeded}`);

  const rendering = await page.evaluate(
    () => getComputedStyle(document.querySelector('#canvas')!).imageRendering,
  );
  check('canvas does not force nearest-neighbour scaling', rendering !== 'pixelated', rendering);

  // ------------------------------------------------------------ upload
  section('Upload Photo mode');
  await page.setInputFiles('#file', samplePath());
  await page.waitForSelector('#canvas:not([hidden])', { timeout: 5000 });
  await settle(page);

  const info = await page.locator('#sourceinfo').innerText();
  check('source label reports file and dimensions', /1404\.jpg.*2560x1440/.test(info), info);
  check('oversized source is capped', /working at 1600x900/.test(info), info);

  let stats = await canvasStats(page);
  check('canvas has real pixels', !!stats && stats.w > 0, stats ? `${stats.w}x${stats.h}` : 'null');
  check('canvas is not blank', !!stats && stats.spread > 60,
    stats ? `spread=${stats.spread}` : 'null');
  check('HUD reports grid and timings',
    /\d+x\d+.*conv .*ms.*draw .*ms/.test(await hudText(page)), await hudText(page));

  // ------------------------------------------------------------ controls
  section('Controls');
  const gridFromHud = async () => (await hudText(page)).match(/^(\d+)x(\d+)/);

  await page.locator('#cols').fill('60');
  await settle(page);
  check('width slider changes columns', (await gridFromHud())?.[1] === '60');

  await page.locator('#cols').fill('200');
  await settle(page);
  check('width slider scales back up', (await gridFromHud())?.[1] === '200');

  const rowsAt = async (aspect: string) => {
    await page.locator('#aspect').fill(aspect);
    await settle(page);
    return Number((await gridFromHud())?.[2]);
  };
  const narrow = await rowsAt('0.4');
  const wide = await rowsAt('0.8');
  check('char aspect changes rows', wide > narrow, `${narrow} -> ${wide}`);
  await page.locator('#aspect').fill('0.55');

  await page.selectOption('#ramp', 'custom');
  check('custom ramp field appears', await page.locator('#custom-row').isVisible());
  await page.locator('#customramp').fill('');
  await settle(page);
  check('empty custom ramp does not crash', errors.length === 0, errors.join(' | '));
  await page.selectOption('#ramp', 'blocks');

  for (const id of ['color', 'dither', 'edges', 'invert']) await page.locator(`#${id}`).check();
  await settle(page);
  stats = await canvasStats(page);
  check('every effect on still renders', !!stats && stats.spread > 40,
    stats ? `spread=${stats.spread}` : 'null');
  check('no errors after toggling every effect', errors.length === 0, errors.join(' | '));
  for (const id of ['dither', 'edges', 'invert']) await page.locator(`#${id}`).uncheck();
  await settle(page);

  // ------------------------------------------------------------ renderers
  section('Renderer toggle');
  await page.locator('#r-dom').click();
  await settle(page);
  check('DOM renderer shows <pre>', await page.locator('#pre').isVisible());
  check('canvas hidden in DOM mode', !(await page.locator('#canvas').isVisible()));
  const spans = await page.locator('#pre span').count();
  check('colour mode emits coloured spans', spans > 0, `${spans} spans`);

  // The custom ramp field accepts arbitrary text. Unescaped, < > & would be
  // parsed as markup and silently eat characters out of the picture.
  await page.selectOption('#ramp', 'custom');
  await page.locator('#customramp').fill(' .<>&#@');
  await settle(page);
  const hostile = (await page.locator('#pre').textContent()) ?? '';
  const markup = (await page.locator('#pre').innerHTML()) ?? '';
  check('angle brackets survive as text, not markup',
    hostile.includes('<') && hostile.includes('>'),
    `${hostile.length} chars of text`);
  check('hostile ramp characters are HTML-escaped in the markup',
    markup.includes('&lt;') && markup.includes('&gt;') && markup.includes('&amp;'));
  check('no errors from a hostile custom ramp', errors.length === 0, errors.join(' | '));
  await page.selectOption('#ramp', 'blocks');

  // ------------------------------------------------------------ benchmark
  section('Warm renderer benchmark (median of 16 frames, 1600x900 source)');
  const table: string[] = [];
  for (const color of [false, true]) {
    for (const cols of [120, 200, 300]) {
      const dom = await benchmark(page, 'dom', cols, color);
      const canvas = await benchmark(page, 'canvas', cols, color);
      const line =
        `  ${String(cols).padStart(3)} cols  ${color ? 'colour' : 'plain '}  ` +
        `convert ${dom.convert.toFixed(2).padStart(6)}ms  |  ` +
        `DOM ${dom.render.toFixed(2).padStart(6)}ms   ` +
        `Canvas ${canvas.render.toFixed(2).padStart(6)}ms`;
      console.log(line);
      table.push(line);
      check(`benchmark ${cols} cols ${color ? 'colour' : 'plain'} produced timings`,
        dom.render > 0 && canvas.render > 0);
    }
  }

  await page.locator('#color').uncheck();
  await page.locator('#cols').fill('200');
  await page.evaluate(() => window.__lens.setRenderer('canvas'));
  await settle(page);

  // ------------------------------------------------------------ exports
  section('Exports');
  const txt = page.waitForEvent('download', { timeout: 8000 });
  await page.locator('#dl-txt').click();
  const txtFile = await txt;
  check('.txt downloads with a stamped name',
    /^ASCII-Lens-.*\.txt$/.test(txtFile.suggestedFilename()), txtFile.suggestedFilename());

  const png = page.waitForEvent('download', { timeout: 8000 });
  await page.locator('#dl-png').click();
  const pngFile = await png;
  check('.png downloads with a stamped name',
    /^ASCII-Lens-.*\.png$/.test(pngFile.suggestedFilename()), pngFile.suggestedFilename());

  await page.locator('#copy').click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('copy puts the ASCII on the clipboard', clip.length > 500, `${clip.length} chars`);
  // Windows/Chromium normalise LF to CRLF on the clipboard, so strip \r first.
  const lines = clip.replace(/\r/g, '').split('\n');
  const widths = new Set(lines.map((l) => [...l].length));
  check('clipboard text is a rectangular grid', lines.length > 5 && widths.size === 1,
    `${lines.length} lines, widths={${[...widths].join(',')}}`);

  await page.screenshot({ path: 'out/e2e-upload.png' });

  // ------------------------------------------------------------ webcam
  section('Webcam mode (Chromium fake device)');
  await page.locator('#mode-webcam').click();
  await page.waitForTimeout(2500);

  check('camera reports a resolution',
    /\d+x\d+/.test(await page.locator('#caminfo').innerText()),
    await page.locator('#caminfo').innerText());
  check('upload controls hidden in webcam mode',
    !(await page.locator('#upload-controls').isVisible()));

  // Regression guard: button:hover once matched the active tab at equal
  // specificity and silently removed its highlight.
  await page.locator('#mode-webcam').hover();
  const activeBg = await page.evaluate(
    () => getComputedStyle(document.querySelector('#mode-webcam')!).backgroundColor,
  );
  check('active mode tab stays highlighted while hovered',
    activeBg === 'rgb(138, 180, 255)', activeBg);

  await settle(page, 12);
  const camHud = await hudText(page);
  check('HUD shows a live fps readout', /fps/.test(camHud), camHud);

  const frameA = await page.evaluate(
    () => document.querySelector<HTMLCanvasElement>('#canvas')?.toDataURL().slice(0, 3000) ?? '',
  );
  await page.waitForTimeout(700);
  const frameB = await page.evaluate(
    () => document.querySelector<HTMLCanvasElement>('#canvas')?.toDataURL().slice(0, 3000) ?? '',
  );
  check('live frames actually update', frameA.length > 0 && frameA !== frameB);
  check('sustains a usable frame rate',
    Number(camHud.match(/([\d.]+) fps/)?.[1] ?? 0) > 20, camHud);

  const liveTracks = () =>
    page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>('#video');
      const s = v?.srcObject as MediaStream | null;
      return s?.getTracks().filter((t) => t.readyState === 'live').length ?? 0;
    });

  check('camera track is live while streaming', (await liveTracks()) > 0);
  await page.screenshot({ path: 'out/e2e-webcam.png' });

  await page.locator('#mode-upload').click();
  await page.waitForTimeout(500);
  check('switching modes releases the camera', (await liveTracks()) === 0);

  // Explicit Stop button, after restarting.
  await page.locator('#mode-webcam').click();
  await page.waitForTimeout(1800);
  check('camera restarts after returning to webcam mode', (await liveTracks()) > 0);
  await page.locator('#cam-stop').click();
  await page.waitForTimeout(400);
  check('Stop button releases the camera', (await liveTracks()) === 0);
  check('Start button re-enabled after stopping',
    !(await page.locator('#cam-start').isDisabled()));

  // ------------------------------------------------------------ done
  section('Console');
  check('no console errors across the whole run', errors.length === 0,
    errors.slice(0, 3).join(' | '));

  await browser.close();

  console.log('\nRenderer benchmark summary');
  for (const line of table) console.log(line);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log(`failing: ${failures.join(', ')}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('\nharness error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
