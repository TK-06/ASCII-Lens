/**
 * Mobile checks against real device emulation.
 *
 * A desktop browser resized to 420px is NOT a mobile test: it has a mouse, a
 * device pixel ratio of 1, desktop canvas limits and no touch. This runs the
 * app under WebKit (Safari's actual engine, i.e. every iOS browser) and under
 * Chromium with Pixel emulation, with touch enabled and real DPRs.
 *
 *   npm run build && npx next start -p 3000
 *   npm run verify:mobile
 */
import { existsSync } from 'node:fs';

import { chromium, devices, webkit, type Browser, type Page } from 'playwright';

const URL = process.env.APP_URL ?? 'http://localhost:3000/';

/** Apple and Android both put the minimum comfortable touch target at ~44px. */
const MIN_TOUCH = 44;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(device: string, name: string, ok: boolean, detail = ''): void {
  const tag = `[${device}] ${name}`;
  if (ok) {
    passed++;
    console.log(`  PASS  ${tag}${detail ? `  (${detail})` : ''}`);
  } else {
    failed++;
    failures.push(tag);
    console.log(`  FAIL  ${tag}${detail ? `  (${detail})` : ''}`);
  }
}

/** Every control a finger has to hit, with its rendered box. */
async function touchTargets(page: Page) {
  return page.evaluate(() => {
    const sel = 'button, [role="tab"], [role="switch"], select, input[type="range"]';
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
            .trim()
            .slice(0, 28),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      });
  });
}

/** iOS Safari zooms the whole page when a form control under 16px is focused. */
async function smallFormText(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('select, input:not([type="range"]):not([type="file"]), textarea')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        px: parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((x) => x.px < 16),
  );
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

async function run(name: string, browser: Browser, deviceName: string) {
  const device = devices[deviceName];
  const context = await browser.newContext({
    ...device,
    permissions: name === 'iPhone' ? [] : ['camera'],
  });
  const page = await context.newPage();

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  console.log(`\n${name} — ${deviceName} (${device.viewport.width}x${device.viewport.height} @${device.deviceScaleFactor}x, touch=${device.hasTouch})`);

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  check(name, 'app renders', (await page.title()) === 'ASCII-Lens');
  check(name, 'no console errors on load', errors.length === 0, errors.slice(0, 2).join(' | '));

  const noHScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check(name, 'no horizontal page scroll', noHScroll);

  // --- landing touch targets ---
  let small = (await touchTargets(page)).filter((t) => t.h < MIN_TOUCH);
  check(
    name,
    `landing controls are finger-sized (>=${MIN_TOUCH}px tall)`,
    small.length === 0,
    small.length ? small.map((t) => `${t.label} ${t.w}x${t.h}`).join(', ') : '',
  );

  await page.screenshot({ path: `out/mobile-${name.toLowerCase()}-landing.png` });

  // --- load an image by tapping, not by dragging: phones have no drag ---
  await page.setInputFiles('input[type=file]', samplePath());
  await page.waitForTimeout(1800);

  const hud = (await page.locator('header p').innerText()).replace(/\s+/g, ' ');
  check(name, 'image converts', /\d+×\d+/.test(hud), hud);

  const art = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, shownW: Math.round(r.width) };
  });
  check(name, 'output canvas is present and non-zero', !!art && art.w > 0, art ? `${art.w}x${art.h} backing` : 'none');
  check(
    name,
    'output fits the viewport width',
    !!art && art.shownW <= device.viewport.width,
    art ? `${art.shownW}px shown` : '',
  );

  // --- controls once loaded ---
  small = (await touchTargets(page)).filter((t) => t.h < MIN_TOUCH);
  check(
    name,
    `loaded controls are finger-sized (>=${MIN_TOUCH}px tall)`,
    small.length === 0,
    small.length ? `${small.length} too small: ` + small.slice(0, 4).map((t) => `${t.label} ${t.h}px`).join(', ') : '',
  );

  const zoomers = await smallFormText(page);
  check(
    name,
    'form controls are >=16px so iOS does not zoom on focus',
    zoomers.length === 0,
    zoomers.length ? zoomers.map((z) => `${z.tag} ${z.px}px`).join(', ') : '',
  );

  // The picture is the point; landing on a wall of controls is a failure even
  // if every control is the right size.
  const fold = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { top: Math.round(r.top), vh: window.innerHeight, visible: r.top < window.innerHeight };
  });
  check(
    name,
    'output is visible without scrolling',
    !!fold && fold.visible,
    fold ? `canvas starts at ${fold.top}px of ${fold.vh}px viewport` : '',
  );

  await page.screenshot({ path: `out/mobile-${name.toLowerCase()}-loaded.png` });

  // Controls are collapsed on touch, so open them before poking at toggles.
  const adjust = page.getByRole('button', { name: 'Adjust' });
  if (await adjust.isVisible().catch(() => false)) {
    await adjust.tap();
    await page.waitForTimeout(400);
    check(name, 'Adjust opens the full control bar',
      await page.getByRole('switch', { name: /dither/i }).isVisible());
    await page.screenshot({ path: `out/mobile-${name.toLowerCase()}-controls.png` });
  }

  // Push width to the maximum: at 3x DPR this is where an unclamped backing
  // store would sail past iOS Safari's canvas limit and render blank.
  // fill(), not a direct value assignment: React ignores a mutated .value
  // because its internal tracker never sees the change, so the slider would
  // silently stay where it was and this check would trivially pass.
  const width = page.locator('input[type=range]').first();
  const maxWidth = await width.getAttribute('max');
  await width.fill(maxWidth ?? '300');
  await page.waitForTimeout(1500);
  const wide = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas');
    if (!c) return null;
    const ctx = c.getContext('2d');
    const d = ctx?.getImageData(0, 0, Math.min(c.width, 60), Math.min(c.height, 60)).data;
    let min = 255, max = 0;
    for (let i = 0; d && i < d.length; i += 4) { if (d[i] < min) min = d[i]; if (d[i] > max) max = d[i]; }
    return { w: c.width, h: c.height, spread: max - min };
  });
  const gridNow = (await page.locator('header p').innerText()).match(/(\d+)×/)?.[1];
  check(name, 'width slider actually reached its maximum',
    gridNow === maxWidth, `cols=${gridNow}, max=${maxWidth}`);
  check(name, 'max width stays inside the device canvas limit',
    !!wide && wide.w <= 4096 && wide.h <= 4096,
    wide ? `${wide.w}x${wide.h} backing` : 'none');
  check(name, 'max width still draws something', !!wide && wide.spread > 5,
    wide ? `spread=${wide.spread}` : '');

  // --- a real tap, not a synthetic click ---
  const ditherBefore = await page.getByRole('switch', { name: /dither/i }).getAttribute('aria-checked');
  await page.getByRole('switch', { name: /dither/i }).tap();
  await page.waitForTimeout(600);
  const ditherAfter = await page.getByRole('switch', { name: /dither/i }).getAttribute('aria-checked');
  check(name, 'tapping a toggle works', ditherBefore !== ditherAfter, `${ditherBefore} -> ${ditherAfter}`);

  await page.getByRole('tab', { name: /webcam/i }).tap();
  await page.waitForTimeout(2500);
  const camState = await page.evaluate(() => {
    const v = document.querySelector('video');
    const s = v?.srcObject as MediaStream | null;
    return {
      tracks: s?.getTracks().filter((t) => t.readyState === 'live').length ?? 0,
      facing: s?.getVideoTracks()[0]?.getSettings().facingMode ?? 'unknown',
      inline: v?.hasAttribute('playsinline') ?? false,
    };
  });
  check(name, 'video element has playsinline (iOS refuses inline video without it)', camState.inline);
  console.log(`        camera: ${camState.tracks} live track(s), facingMode=${camState.facing}`);

  await page.screenshot({ path: `out/mobile-${name.toLowerCase()}-webcam.png` });

  check(name, 'no console errors across the run', errors.length === 0, errors.slice(0, 2).join(' | '));

  await context.close();
}

async function main(): Promise<void> {
  const wk = await webkit.launch();
  const cr = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  try {
    await run('iPhone', wk, 'iPhone 14');
    await run('Android', cr, 'Pixel 7');
  } finally {
    await wk.close();
    await cr.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log(`failing:\n  - ${failures.join('\n  - ')}`);
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error('\nharness error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
