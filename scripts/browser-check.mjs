import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const output = 'test-results';
await mkdir(output, { recursive: true });
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const unlockAll = { levels: { '1-1': { best: 20, attempts: 1, clears: 1 }, '1-2': { best: 25, attempts: 1, clears: 1 }, '1-3': { best: 30, attempts: 1, clears: 1 } } };
await context.addInitScript(data => { if (!localStorage.getItem('spra-deer:progress:v1')) localStorage.setItem('spra-deer:progress:v1', JSON.stringify(data)); }, unlockAll);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const state = () => page.evaluate(() => window.__DEER__);
const snap = name => page.screenshot({ path: `${output}/${name}.png` });
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5178/');
  await page.waitForFunction(() => window.__DEER__?.mode === 'title');
  await snap('01-title-mobile');
  await page.locator('[data-action="select"]').click();
  await page.waitForFunction(() => window.__DEER__?.mode === 'select');
  await snap('01b-select-mobile');
  assert.equal(await page.locator('[data-level="1-4"]').isDisabled(), false, '1-4 is unlocked by the saved progress');
  assert.equal(await page.locator('.level-card.soon').count(), 1, '1-5 is shown as coming soon');
  await page.locator('[data-level="1-4"]').click();
  await page.waitForFunction(() => window.__DEER__?.mode === 'playing' && window.__DEER__.level.id === '1-4');
  await snap('02-start-mobile');
  console.log('Title and start rendered', (await state()).mode);
  if (process.env.SMOKE_ONLY === '1') process.exitCode = 0;
  else {
    const move = async (axis, target) => {
      const initial = (await state()).player[axis];
      if (Math.abs(initial - target) < 4) return;
      const positive = target > initial;
      const key = axis === 'x' ? positive ? 'ArrowRight' : 'ArrowLeft' : positive ? 'ArrowDown' : 'ArrowUp';
      await page.keyboard.down(key);
      await page.waitForFunction(({ axis, target, positive }) => {
        const s = window.__DEER__;
        return s.outcome !== 'playing' || (positive ? s.player[axis] >= target - 2 : s.player[axis] <= target + 2);
      }, { axis, target, positive }, { timeout: 20000 });
      await page.keyboard.up(key);
      const s = await state();
      assert.ok(['playing', 'clear'].includes(s.outcome), `${key} to ${target}: ${s.outcome} at ${s.player.x},${s.player.y}`);
    };
    if (!process.env.ROUTE_ONLY) {
    // Reach the bait gap with real keyboard input; freeze the warning to inspect it.
    await move('x', 256); await move('y', 3220); await move('x', 448); await move('y', 2985);
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => window.__DEER__.traps[0].state === 'shaking');
    await page.keyboard.press('Escape'); await page.keyboard.up('ArrowUp');
    const paused = await state(); assert.equal(paused.mode, 'paused');
    await page.waitForTimeout(700);
    assert.equal((await state()).time, paused.time);
    assert.equal((await state()).traps[0].elapsed, paused.traps[0].elapsed);
    await snap('03-pause');
    await page.locator('[data-action="resume"]').click();
    await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => window.__DEER__.outcome === 'fall');
    await page.keyboard.up('ArrowUp'); await snap('04-collapse');
    await page.waitForFunction(() => window.__DEER__.mode === 'result');
    await snap('05-fall-result');
    console.log('Bait gap, collapse, fall, pause/resume verified');

    await page.locator('[data-action="retry"]').click();
    let fresh = await state(); assert.equal(fresh.player.y, 3580); assert.ok(fresh.traps.every(t => t.state === 'intact'));
    // Multi-touch: one finger steers while the second jumps. Releasing stops movement.
    const pad = await page.locator('#move-pad').boundingBox(), jump = await page.locator('#jump').boundingBox();
    const cdp = await context.newCDPSession(page);
    const p = { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    const drag = { ...p, x: p.x - 30 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drag] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [drag, { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 }] });
    await page.waitForFunction(() => window.__DEER__.jumps === 1 && window.__DEER__.player.height > 20);
    await snap('06-touch-jump');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);
    const released = (await state()).player;
    await page.waitForTimeout(300);
    assert.equal((await state()).player.x, released.x);
    assert.ok(released.x < 360); console.log('Simultaneous touch movement/jump and release verified');
    }

    await page.keyboard.press('r');
    // A full, repeatable route without hidden state mutation or invulnerability.
    const route = [['x',256],['y',3220],['x',448],['y',2960],['x',300],['y',2600],['x',384],['y',2390],['x',256],['y',2200],['x',400],['y',1850],['x',448],['y',1570],['x',384],['y',1230],['x',520],['y',940],['x',256],['y',580],['x',360],['y',450],['y',300]];
    for (const [axis, target] of route) {
      await move(axis, target);
      if (axis === 'y' && target === 450) { await page.waitForTimeout(300); await snap('07-approaching-goal'); }
    }
    await page.waitForFunction(() => window.__DEER__.mode === 'result');
    const complete = await state();
    assert.equal(complete.outcome, 'clear'); assert.ok(complete.record.best > 0); assert.equal(complete.record.clears, 1);
    await snap('07-clear');
    console.log('Full stage clear verified', complete.time.toFixed(2));
    await page.reload(); await page.waitForFunction(() => window.__DEER__?.mode === 'title');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('spra-deer:progress:v1')).levels['1-4'].best);
    assert.equal(stored, complete.record.best);
    console.log('Best time persisted after reload');
    await page.setViewportSize({ width: 360, height: 640 }); await snap('08-small-title');
    assert.ok(await page.locator('[data-action="select"]').isVisible());
    await page.locator('[data-action="select"]').click(); await snap('08b-small-select');
    assert.ok(await page.locator('[data-level="1-4"]').isVisible());
    await page.locator('[data-level="1-4"]').click(); await snap('09-small-game');
    const layout = await page.evaluate(() => {
      const wrap = document.querySelector('#game-wrap').getBoundingClientRect();
      const buttons = ['move-pad', 'jump', 'pause'].map(id => document.getElementById(id).getBoundingClientRect().toJSON());
      return { width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth, wrap: wrap.toJSON(), buttons };
    });
    assert.ok(layout.scroll <= layout.width);
    for (const b of layout.buttons) assert.ok(b.x >= 0 && b.right <= layout.width + 1 && b.y >= 0 && b.bottom <= layout.height + 1);
    await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-action="resume"]').click(); await snap('10-desktop');
    await page.keyboard.press('r'); await page.keyboard.down('ArrowUp');
    await page.waitForFunction(() => window.__DEER__.outcome === 'poop'); await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => window.__DEER__.mode === 'result'); await snap('11-poop-result');
    await page.setViewportSize({ width: 360, height: 640 }); await snap('12-small-result');
    const card = await page.locator('.modal-card').boundingBox();
    assert.ok(card.y >= 0 && card.y + card.height <= 640, 'small-screen result card fits');
    // A fresh visitor can choose only 1-1.
    const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page2 = await fresh.newPage();
    await page2.goto(process.env.GAME_URL || 'http://127.0.0.1:5178/');
    await page2.waitForFunction(() => window.__DEER__?.mode === 'title');
    await page2.locator('[data-action="select"]').click();
    assert.equal(await page2.locator('[data-level="1-1"]').isDisabled(), false);
    assert.equal(await page2.locator('[data-level="1-2"]').isDisabled(), true);
    assert.equal(await page2.locator('[data-level="1-3"]').isDisabled(), true);
    assert.equal(await page2.locator('[data-level="1-4"]').isDisabled(), true);
    await page2.screenshot({ path: `${output}/13-fresh-select.png` });
    await fresh.close();
    console.log('Poop collision and responsive layouts verified');
  }
  assert.deepEqual(errors, [], 'browser console/page errors');
  console.log('Browser checks passed');
} finally { await browser.close(); }
