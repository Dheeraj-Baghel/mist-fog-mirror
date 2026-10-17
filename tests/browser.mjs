// Browser checks use a synthetic webcam, never the user's physical camera.
// One check loads the real CDN/WASM/model. A separate deterministic tracker stub
// verifies stroke integration; it is not evidence of real-world tracking quality.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.MIST_URL || 'http://127.0.0.1:4321';
// Keep hosted release evidence separate from the original local baseline.
const artifacts = fileURLToPath(new URL(process.env.MIST_ARTIFACTS_DIR || '../artifacts/testing/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream'] });
const results = [];
const errors = [];
const requests = [];
const check = async (name, run) => {
  const started = Date.now();
  try { await run(); results.push({ name, passed: true, ms: Date.now() - started }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); throw error; }
};
const alphaAt = (page, x, y) => page.evaluate(({ x, y }) => {
  const canvas = document.getElementById('fog');
  const ratio = canvas.width / canvas.clientWidth;
  return canvas.getContext('2d').getImageData(Math.round(x * ratio), Math.round(y * ratio), 1, 1).data[3];
}, { x, y });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, permissions: ['camera'] });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  await page.goto(baseURL, { waitUntil: 'networkidle' });

  await check('desktop landing, privacy, no premature camera or hand-model load', async () => {
    await expect(page.getByRole('heading', { name: 'Something in the mist.' })).toBeVisible();
    await expect(page.locator('#camera-indicator')).toHaveText('camera off');
    assert.equal(await page.evaluate(() => document.getElementById('camera').srcObject), null);
    assert.ok(!requests.some((r) => /mediapipe/.test(r.url)));
    assert.ok(await alphaAt(page, 750, 650) > 200);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${artifacts}desktop.png` });
  });
  await check('mouse leaves a genuinely transparent wipe, not a painted line', async () => {
    await page.mouse.move(720, 620);
    await page.mouse.down();
    await page.mouse.move(920, 650, { steps: 15 });
    await page.mouse.up();
    assert.ok(await alphaAt(page, 820, 635) < 30);
    await expect(page.locator('#welcome')).not.toBeVisible();
    await expect(page.locator('#finger')).not.toHaveClass(/visible/);
    await page.screenshot({ path: `${artifacts}drawing.png` });
  });
  await check('one toggle clears the entire mirror and re-fogs with no old marks', async () => {
    await page.getByRole('button', { name: 'Defog mirror' }).click();
    await expect(page.locator('#fog-toggle')).toHaveAttribute('aria-pressed', 'false');
    assert.equal(await alphaAt(page, 820, 635), 0);
    await page.getByRole('button', { name: 'Fog mirror', exact: true }).click();
    await expect(page.locator('#fog-toggle')).toHaveAttribute('aria-pressed', 'true');
    assert.ok(await alphaAt(page, 820, 635) > 200);
  });
  await check('resize preserves the drawing and canvas dimensions', async () => {
    await page.mouse.move(700, 600);
    await page.mouse.down();
    await page.mouse.move(900, 600, { steps: 15 });
    await page.mouse.up();
    await page.setViewportSize({ width: 1200, height: 750 });
    await page.waitForTimeout(250);
    assert.ok(await alphaAt(page, 800 / 1440 * 1200, 600 / 900 * 750) < 30);
    assert.equal(await page.locator('#fog').evaluate((el) => el.clientWidth), 1200);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
  });
  await check('real camera API, MediaPipe CDN, WASM and hand model initialize', async () => {
    await page.getByRole('button', { name: 'Enable camera', exact: true }).click();
    await expect(page.locator('#camera-indicator')).toHaveText('camera on · local only', { timeout: 15000 });
    await expect(page.locator('#status-text')).toHaveText(/Show one hand|Raise one index|Paused|Drawing/, { timeout: 90000 });
    await expect(page.locator('#error')).toBeHidden();
    assert.ok(await page.locator('#camera').evaluate((el) => el.videoWidth > 0 && el.srcObject.getVideoTracks()[0].readyState === 'live'));
    await page.screenshot({ path: `${artifacts}camera-fogged.png` });
  });
  await check('camera is a true mirrored feed and can be explicitly stopped', async () => {
    assert.equal(await page.locator('#camera').evaluate((el) => getComputedStyle(el).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
    await page.getByRole('button', { name: 'Defog mirror' }).click();
    assert.equal(await alphaAt(page, 500, 500), 0);
    await page.screenshot({ path: `${artifacts}camera-clear.png` });
    await page.getByRole('button', { name: 'Turn camera off', exact: true }).click();
    await expect(page.locator('#camera-indicator')).toHaveText('camera off');
    assert.equal(await page.locator('#camera').evaluate((el) => el.srcObject), null);
  });
  await check('no media upload requests and no uncaught browser exceptions', async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(requests.filter((r) => !['GET', 'HEAD'].includes(r.method)), []);
  });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(baseURL, { waitUntil: 'networkidle' });
  await check('mobile layout and touch wiping work', async () => {
    assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await expect(mobilePage.locator('#start-camera')).toBeInViewport();
    await expect(mobilePage.locator('#fog-toggle')).toBeInViewport();
    await mobilePage.screenshot({ path: `${artifacts}mobile.png` });
    const session = await mobilePage.context().newCDPSession(mobilePage);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 290, y: 610 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 320, y: 630 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await alphaAt(mobilePage, 305, 620) < 30);
    await mobilePage.getByRole('button', { name: 'Defog mirror' }).tap();
    assert.equal(await alphaAt(mobilePage, 305, 620), 0);
  });

  const denied = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  await denied.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Test camera denial', 'NotAllowedError'); };
  });
  const deniedPage = await denied.newPage();
  await deniedPage.goto(baseURL);
  await check('camera denial is actionable and mouse fallback remains usable', async () => {
    await deniedPage.locator('#start-camera').click();
    await expect(deniedPage.locator('#error')).toContainText('Camera permission was denied');
    await expect(deniedPage.locator('#camera-indicator')).toHaveText('camera off');
    await deniedPage.mouse.move(900, 480);
    await deniedPage.mouse.down();
    await deniedPage.mouse.move(1000, 500, { steps: 6 });
    await deniedPage.mouse.up();
    assert.ok(await alphaAt(deniedPage, 950, 490) < 30);
  });

  const gestures = await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true, permissions: ['camera'] });
  await gestures.route('**/npm/@mediapipe/tasks-vision@0.10.21/+esm', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: 'export const FilesetResolver = { forVisionTasks: async () => ({}) }; export const HandLandmarker = { createFromOptions: async () => ({ detectForVideo: () => ({ landmarks: window.__hands || [] }) }) };',
  }));
  const gesturePage = await gestures.newPage();
  await gesturePage.goto(baseURL);
  await gesturePage.locator('#start-camera').click();
  await expect(gesturePage.locator('#status-text')).toHaveText(/Raise one index|Show one hand/, { timeout: 15000 });
  const setHand = async (drawing, x = .5) => gesturePage.evaluate(({ drawing, x }) => {
    const p = Array.from({ length: 21 }, () => ({ x, y: .7, z: 0 }));
    p[0] = { x, y: .95, z: 0 };
    for (let f = 0; f < 4; f++) {
      const base = 5 + f * 4;
      const fx = x - .15 + f * .1;
      const extended = drawing ? f === 0 : true;
      p[base] = { x: fx, y: .7, z: 0 };
      p[base + 1] = { x: fx, y: .5, z: 0 };
      p[base + 2] = { x: fx + (extended ? 0 : .055), y: extended ? .36 : .55, z: 0 };
      p[base + 3] = { x: fx + (extended ? 0 : .04), y: extended ? .22 : .69, z: 0 };
    }
    window.__hands = [p];
  }, { drawing, x });
  await check('synthetic index gesture wipes at the correct mirrored fingertip', async () => {
    await setHand(true);
    await expect(gesturePage.locator('#status-text')).toHaveText(/Drawing/, { timeout: 5000 });
    const tip = await gesturePage.evaluate(() => {
      const v = document.getElementById('camera');
      const scale = Math.max(innerWidth / v.videoWidth, innerHeight / v.videoHeight);
      const w = v.videoWidth * scale;
      const h = v.videoHeight * scale;
      return { x: (innerWidth - w) / 2 + .65 * w, y: (innerHeight - h) / 2 + .22 * h };
    });
    await gesturePage.waitForTimeout(150);
    assert.ok(await alphaAt(gesturePage, tip.x, tip.y) < 30);
  });
  await check('open-hand pause never draws or connects a new stroke across the gap', async () => {
    await setHand(false, .65);
    await expect(gesturePage.locator('#status-text')).toHaveText(/Paused/);
    await gesturePage.waitForTimeout(150);
    const before = await alphaAt(gesturePage, 640, 158);
    assert.ok(before > 200);
    await setHand(true, .65);
    await expect(gesturePage.locator('#status-text')).toHaveText(/Drawing/);
    await gesturePage.waitForTimeout(150);
    // The new stroke is allowed to clear its endpoint, but must not bridge back.
    assert.ok(await alphaAt(gesturePage, 730, 158) > 200);
  });
  await check('losing the hand hides the cursor and safely lifts the pen', async () => {
    await gesturePage.evaluate(() => { window.__hands = []; });
    await expect(gesturePage.locator('#finger')).not.toHaveClass(/visible/);
  });

  console.log(`\n${results.length} browser checks passed.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(`${artifacts}results.json`, JSON.stringify({ testedAt: new Date().toISOString(), baseURL, results, errors, boundaries: ['Synthetic webcam, not physical Mac camera.', 'Actual MediaPipe module/WASM/model startup tested separately from synthetic gesture integration.', 'Real-user hand accuracy and native Safari permission flow require user testing.'] }, null, 2));
  await browser.close();
}
