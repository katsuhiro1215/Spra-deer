// 実ブラウザ（ヘッドレス Chromium）での操作確認。開発サーバーを起動してから実行する。
//   GAME_URL=http://127.0.0.1:5180/ npm run test:browser
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const output = 'test-results';
await mkdir(output, { recursive: true });
const url = process.env.GAME_URL || 'http://127.0.0.1:5180/';
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const errors = [];
const watch = page => {
  page.setDefaultTimeout(90000); // ヘッドレス（ソフトウェア描画）は遅く、ゲーム内の時間もゆっくり進む
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
};
const state = page => page.evaluate(() => window.__DEER__);
const snap = (page, name) => page.screenshot({ path: `${output}/${name}.png` });
/** トップ →「はじめる」→ ホーム → ワールドの面えらび(設計書 25-5) */
const toWorld = async (page, stage) => {
  // トップなら「はじめる」、ホームまわりなら下のバーの「ホーム」
  if ((await state(page)).mode === 'title') await page.locator('[data-action="home"]').click();
  else await page.locator('[data-action="tab"][data-tab="home"]').click();
  await page.waitForFunction(() => window.__DEER__?.mode === 'select' && !!document.querySelector('.hs-worlds'));
  await page.locator(`[data-action="world"][data-stage="${stage}"]`).click();
};
const open = async (context, levelId) => {
  const page = await context.newPage(); watch(page);
  await page.goto(url);
  await page.waitForFunction(() => window.__DEER__?.mode === 'title');
  await toWorld(page, Number(levelId.split('-')[0]));
  await page.locator(`[data-level="${levelId}"]`).click();
  await page.waitForFunction(id => window.__DEER__?.mode === 'playing' && window.__DEER__.level.id === id, levelId);
  return page;
};
const unlocked = { levels: { '1-1': { best: 20, attempts: 1, clears: 1 }, '1-2': { best: 25, attempts: 1, clears: 1 } } };
try {
  // --- 初めての人: 1-1 だけ選べる ---
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const first = await fresh.newPage(); watch(first);
  await first.goto(url);
  await first.waitForFunction(() => window.__DEER__?.mode === 'title');
  await snap(first, '01-title-mobile');
  await first.locator('[data-action="home"]').click();
  await first.waitForFunction(() => window.__DEER__?.mode === 'select');
  await snap(first, '02-home-fresh');
  assert.equal(await first.locator('.hs-world').count(), 8, 'ワールド1〜8のカード');
  assert.ok(await first.locator('.hs-stamina').isVisible(), '体力が見える');
  // 開発中は全面解放（src/progress.ts の UNLOCK_ALL）。公開前に false へ戻すときは、ここを「1-2 は選べない」に戻す。
  for (const id of ['1-1', '1-2', '1-6', '1-10', '3-1', '4-1']) {
    await toWorld(first, Number(id.split('-')[0]));
    assert.equal(await first.locator(`[data-level="${id}"]`).isDisabled(), false, `${id} is selectable while developing`);
  }
  await snap(first, '02-select-fresh');
  await fresh.close();
  console.log('Fresh visitor: every level is selectable (development unlock)');

  // --- 保存済みの進行で 1-3 まで選べる ---
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(data => { if (!localStorage.getItem('spra-deer:progress:v1')) localStorage.setItem('spra-deer:progress:v1', JSON.stringify(data)); }, unlocked);
  let page = await open(context, '1-1');
  await snap(page, '03-start-1-1');

  // 一時停止: 時間も鹿も止まる
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape'); await page.keyboard.up('ArrowUp');
  const paused = await state(page); assert.equal(paused.mode, 'paused');
  await page.waitForTimeout(600);
  const still = await state(page);
  assert.equal(still.time, paused.time); assert.deepEqual(still.deers.map(d => d.x), paused.deers.map(d => d.x));
  await snap(page, '04-pause');
  await page.locator('[data-action="resume"]').click();
  console.log('Pause/resume verified');

  // うんこに当たる → 結果 → すぐ再挑戦（R キー）
  await page.locator('[data-action="retry"]').count();
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__DEER__.mode === 'playing' && window.__DEER__.time < .3);
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__DEER__.player.x <= 256);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__DEER__.outcome !== 'playing', null, { timeout: 90000 });
  await page.keyboard.up('ArrowUp');
  assert.equal((await state(page)).outcome, 'poop');
  await page.waitForFunction(() => window.__DEER__.mode === 'result');
  await snap(page, '05-result-poop');
  await page.locator('[data-action="retry"]').click();
  const again = await state(page); assert.equal(again.mode, 'playing'); assert.equal(again.player.y, 3400);

  // 2本指: 片方で移動、もう片方でジャンプ。離すと止まる
  const pad = await page.locator('#move-pad').boundingBox(), jump = await page.locator('#jump').boundingBox();
  const cdp = await context.newCDPSession(page);
  const p = { x: pad.x + pad.width / 2, y: pad.y + pad.height / 2, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
  const drag = { ...p, x: p.x - 30 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [drag] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [drag, { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 }] });
  await page.waitForFunction(() => window.__DEER__.jumps === 1 && window.__DEER__.player.height > 20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  const released = (await state(page)).player;
  await page.waitForTimeout(300);
  assert.equal((await state(page)).player.x, released.x);
  assert.ok(released.x < 360);
  console.log('Simultaneous touch movement/jump and release verified');
  await page.close();

  // --- 1-2: 道がふさがれていて、跳ぶと着地点が変わる ---
  page = await open(context, '1-2');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__DEER__.outcome !== 'playing', null, { timeout: 90000 });
  await page.keyboard.up('ArrowUp');
  assert.equal((await state(page)).outcome, 'poop', 'the road is fully blocked; walking into it fails');
  await page.waitForFunction(() => window.__DEER__.mode === 'result');
  await snap(page, '06-1-2-blocked');
  await page.locator('[data-action="retry"]').click();
  // 右へ寄ってからジャンプ → 穴の横に着地して生きている
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__DEER__.player.x >= 470);
  await page.keyboard.up('ArrowRight'); await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__DEER__.player.y <= 3130);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__DEER__.jumps === 1 && window.__DEER__.player.height > 30);
  await snap(page, '07-1-2-jumping');
  await page.waitForFunction(() => window.__DEER__.player.height === 0 && window.__DEER__.jumps === 1);
  await page.keyboard.up('ArrowUp');
  const landed = await state(page);
  assert.equal(landed.outcome, 'playing', 'landing at the right edge is safe');
  assert.ok(landed.traps[0].state !== 'intact', 'the hidden hole opened as you landed');
  await snap(page, '08-1-2-landed');
  console.log('1-2: blocked road, jump over, hidden hole beside the landing verified');
  await page.close();

  // --- 1-3: 壁がいきなり出て、つぶされる ---
  page = await open(context, '1-3');
  await page.keyboard.down('ArrowUp');
  await page.waitForFunction(() => window.__DEER__.walls.some(w => w.progress > .5));
  await snap(page, '09-1-3-wall');
  await page.waitForFunction(() => window.__DEER__.outcome !== 'playing', null, { timeout: 90000 });
  await page.keyboard.up('ArrowUp');
  assert.equal((await state(page)).outcome, 'wall');
  await page.waitForFunction(() => window.__DEER__.mode === 'result');
  await snap(page, '10-1-3-crushed');
  console.log('1-3: sudden wall verified');
  await page.close();

  // --- 小さい画面: 面選択・結果・操作ボタンが収まる ---
  await context.close();
  const small = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
  await small.addInitScript(data => { if (!localStorage.getItem('spra-deer:progress:v1')) localStorage.setItem('spra-deer:progress:v1', JSON.stringify(data)); }, unlocked);
  const sp = await small.newPage(); watch(sp);
  await sp.goto(url);
  await sp.waitForFunction(() => window.__DEER__?.mode === 'title');
  await snap(sp, '11-small-title');
  assert.ok(await sp.locator('[data-action="home"]').isVisible());
  await toWorld(sp, 1); await snap(sp, '12-small-select');
  await sp.locator('[data-level="1-3"]').click();
  await sp.waitForFunction(() => window.__DEER__?.mode === 'playing');
  const layout = await sp.evaluate(() => {
    const buttons = ['move-pad', 'jump', 'pause'].map(id => document.getElementById(id).getBoundingClientRect().toJSON());
    return { width: innerWidth, height: innerHeight, scroll: document.documentElement.scrollWidth, buttons };
  });
  assert.ok(layout.scroll <= layout.width);
  for (const b of layout.buttons) assert.ok(b.x >= 0 && b.right <= layout.width + 1 && b.y >= 0 && b.bottom <= layout.height + 1);
  await sp.keyboard.down('ArrowUp');
  await sp.waitForFunction(() => window.__DEER__.mode === 'result', null, { timeout: 90000 });
  await sp.keyboard.up('ArrowUp'); await snap(sp, '13-small-result');
  const card = await sp.locator('.modal-card').boundingBox();
  assert.ok(card.y >= 0 && card.y + card.height <= 640, 'small-screen result card fits');
  console.log('Responsive layouts verified');
  await small.close();

  assert.deepEqual(errors, [], 'browser console/page errors');
  console.log('Browser checks passed');
} finally { await browser.close(); }
