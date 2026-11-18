// WORLD 8「鹿と暴走トロッコ」を、実ブラウザ(ヘッドレス Chromium)で確かめる。開発サーバーを起動してから実行する。
//   node scripts/cart-check.mjs [http://127.0.0.1:5180]
// 1) ホーム → WORLD 8 → 8-1 が開く  2) 自動操作でゴールまで走り、結果とごほうびが出る  3) 何もしないと失敗し、体力が減る
// 4) 小さい画面でも、操作ボタンが収まる。重さ(描画命令・三角形)も出す
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const output = 'test-results';
await mkdir(output, { recursive: true });
const base = (process.argv[2] ?? 'http://127.0.0.1:5180').replace(/\/$/, '');
// CART_ONLY=8-9,8-10 のように指定すると、その面だけを走らせる(1〜3 と小さい画面の確認は省く)
const only = process.env.CART_ONLY?.split(',');
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const errors = [];
const watch = page => {
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
};

/** ページの中で、先を見て操作するボットを取りつける(tests/cart.test.ts と同じ考え方)。 */
const installBot = () => {
  const c = window.__cart, run = c.run, track = c.track, step = run.step.bind(run);
  const B = { latBase: 7, latLean: 5, latOut: 3 };
  // ヘッドレスのブラウザは絵を描くのが遅い(1秒に1〜2枚)ので、1回の呼び出しで4歩すすめて、確認の時間を短くする
  const SPEED = 4;
  run.step = (dt, input) => { for (let k = 0; k < SPEED && (k === 0 || run.phase === 'running'); k++) one(dt, input); };
  const one = (dt, input) => {
    if (run.phase === 'running') {
      const s = run.s, v = run.v;
      input.left = input.right = input.brake = input.dash = input.jump = false;
      const curv = track.sharpestAhead(s, Math.max(30, v * 2));
      if (Math.abs(curv) > 0.004) {
        const here = track.sharpestAhead(s, Math.max(12, v * 0.4)), dir = Math.abs(here) > 0.004 ? here : curv;
        input.right = dir > 0; input.left = dir < 0;
        // カーブの内がわに枝があると、よけるときに外へ傾くので、早めに減速
        const soon = track.obstacles.find(o => o.kind === 'branch' && o.s > s && o.s - s < Math.max(30, v * 2));
        const lat = soon && (soon.side === 1) === (curv > 0) ? B.latBase - B.latOut : B.latBase + B.latLean;
        if (v > Math.sqrt((lat * 0.8) / Math.abs(curv))) input.brake = true;
      }
      const branch = track.obstacles.find(o => o.kind === 'branch' && o.s > s && o.s - s < Math.max(14, v * 0.7));
      const w = track.windAt(s + v * 0.3);
      if (Math.abs(w) > 0.5) { const need = v * v * track.at(s + v * 0.3).curv - w; input.right = need > 0; input.left = need < 0; }
      // 横の鹿せんべいは、その向きへ傾けて取る(枝が先)
      const sb = track.obstacles.find(o => o.kind === 'senbei' && o.side && o.s > s && o.s - s < Math.max(8, v * 0.5));
      if (sb) { input.right = sb.side === 1; input.left = sb.side === -1; }
      if (branch) { input.left = branch.side === 1; input.right = branch.side === -1; }
      if (!run.air && run.dashCool <= 0 && v < 12 && track.at(s).pitch > 0.05) input.dash = true;
      // 大岩・なだれが近いときは、ダッシュで にげる
      if (run.chaser && !run.air && run.dashCool <= 0 && s - run.chaser.s < 40) input.dash = true;
      if (run.air) {
        const sg = track.shiftGapNear(s);
        if (sg) { input.right = sg.shift > 0; input.left = sg.shift < 0; }
      }
      const crest = track.crestAhead(s, v * 2 + 10);
      if (crest && Math.abs(crest.curveAfter) > 0.006 && !run.air && v > crest.vLift * 0.93) input.brake = true;
      const gap = track.gaps.find(g => g.to > s), ramp = gap && track.rampBefore(gap);
      if (gap && ramp && ramp.s > s - 1) {
        // ジャンプ台: 台の上でジャンプ。届かない速さなら手前でダッシュ(平らな所へ、台+ジャンプで 2秒とぶ)
        if (ramp.s - s < 70 && ramp.s - s > 8 && v * 2 < gap.to + 4 - ramp.s) input.dash = true;
        if (ramp.s - s < Math.max(1, v * 0.06)) input.jump = true;
      } else if (gap) {
        const next = track.gaps.find(g => g.from > gap.to);
        if (next && !run.air && next.from - gap.from < 45 && gap.from - s < 50 && v > next.from - 3 - gap.from) input.brake = true;
        if (gap.from - s < 70 && gap.from - s > 12 && v < gap.to - gap.from + 5) input.dash = true;
        if (!run.air && gap.from - s < Math.max(1.5, v * 0.06) && gap.from - s > -1) input.jump = true;
      }
      const rock = track.obstacles.find(o => (o.kind === 'rock' || o.kind === 'log') && o.s > s && o.s - s < v * 0.4);
      if (rock && !run.air) input.jump = true;
    }
    step(dt, input);
  };
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  let page = await context.newPage(); watch(page);

  if (!only) {
  // 1) ホームから WORLD 8 へ
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.__DEER__?.mode === 'title');
  await page.locator('[data-action="home"]').click();
  await page.locator('[data-action="world"][data-stage="8"]').click();
  await page.screenshot({ path: `${output}/cart-01-select.png` });
  assert.equal(await page.locator('.level-card').count(), 10, 'WORLD 8 は10面');
  await page.locator('[data-level="8-1"]').click();
  await page.waitForURL(/\/cart\/\?level=8-1/);
  await page.waitForFunction(() => !!window.__cart);
  await page.screenshot({ path: `${output}/cart-02-start.png` });
  console.log('ホーム → WORLD 8 → 8-1 が開いた');

  // 2) 自動操作でゴールまで
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('spra-deer:wallet:v1') ?? '{}'));
  await page.locator('[data-ks="go"]').click();
  await page.evaluate(installBot);
  for (const [at, name] of [[300, 'curve'], [455, 'jump'], [700, 'downhill'], [835, 'sharp'], [1120, 'canyon'], [1400, 'final']]) {
    await page.waitForFunction(s => window.__cart.run.s >= s || window.__cart.run.phase !== 'running', at, { timeout: 600000 });
    await page.screenshot({ path: `${output}/cart-run-${name}.png` });
  }
  await page.waitForFunction(() => window.__cart.run.phase !== 'running', null, { timeout: 600000 });
  const end = await page.evaluate(() => { const r = window.__cart.run; return { phase: r.phase, reason: r.reason, t: r.t, lives: r.lives, coins: r.coins, gold: r.gold, max: r.maxV * 3.6 }; });
  assert.equal(end.phase, 'cleared', `ゴールできなかった: ${end.reason}`);
  await page.waitForFunction(() => document.querySelector('[data-ks="result"]').classList.contains('on'), null, { timeout: 120000 });
  await page.screenshot({ path: `${output}/cart-03-clear.png` });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('spra-deer:wallet:v1') ?? '{}'));
  const reward = await page.locator('[data-ks="r-reward"]').textContent();
  assert.match(reward, /シルバー/, 'ごほうびが出る');
  assert.ok(JSON.stringify(after) !== JSON.stringify(before), 'コインが財布に入った');
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('spra-deer:progress:v2') ?? '{}'));
  assert.ok(rec.levels?.['8-1']?.clears >= 1, 'クリアの記録が残る');
  console.log(`自動操作でゴール: ${end.t.toFixed(1)}秒 ハート${end.lives} コイン${end.coins} 金${end.gold} 最高${end.max.toFixed(0)}km/h / ${reward}`);
  const nextHref = await page.locator('[data-ks="next"]').getAttribute('href');
  assert.equal(nextHref, '/cart/?level=8-2', 'クリアすると「次の面へ(8-2)」が出る');
  assert.equal(await page.locator('[data-ks="next"]').isVisible(), true);

  // 3) 何もしないと失敗する(最初の切れ目で落ちる)
  await page.locator('[data-ks="retry"]').click();
  await page.waitForFunction(() => window.__cart.run.phase === 'failed', null, { timeout: 600000 });
  const fail = await page.evaluate(() => ({ reason: window.__cart.run.reason, s: window.__cart.run.s }));
  assert.equal(fail.reason, 'fall');
  await page.waitForFunction(() => document.querySelector('[data-ks="result"]').classList.contains('on'), null, { timeout: 120000 });
  await page.screenshot({ path: `${output}/cart-04-fail.png` });
  assert.match(await page.locator('[data-ks="r-reward"]').textContent(), /体力/, '失敗すると体力が減る');
  console.log(`何もしないと、s=${fail.s.toFixed(0)} で落ちて失敗(体力が減る)`);

  // 重さ
  const perf = await page.evaluate(async () => {
    const c = window.__cart, ren = c.view.renderer; let worst = { calls: 0, triangles: 0, at: 0 };
    document.querySelector('[data-ks="retry"]').click();
    for (const s of [20, 200, 330, 450, 650, 820, 950, 1100, 1250, 1420]) {
      c.run.restore(s, 0, 0, 0, false, []); c.run.phase = 'ready';
      await new Promise(r => setTimeout(r, 500));
      const i = ren.info.render;
      if (i.triangles > worst.triangles) worst = { calls: i.calls, triangles: i.triangles, at: s };
    }
    return worst;
  });
  console.log(`重さ(いちばん重い所 s=${perf.at}): 描画命令 ${perf.calls} / 三角形 ${perf.triangles}`);
  assert.ok(perf.triangles < 260000, '三角形が多すぎる');
  }

  // 5) 8-2・8-3 も、自動操作でゴールまで走れる(8-2 は 8-1 の「次の面へ」から)
  for (const [id, shots] of [['8-2', [[250, 's-curve'], [590, 'hairpin'], [890, 'branch-curve'], [1250, 'three-curves']]], ['8-3', [[475, 'double-gap'], [725, 'uphill-gap'], [1145, 'rock-gap'], [1565, 'big-gap']]], ['8-4', [[150, 'steep'], [290, 'hump'], [520, 'fast-s'], [800, 'hump-curve'], [1190, 'long-jump'], [1330, 'slalom'], [1565, 'big-hump'], [1700, 'brake-zone']]], ['8-5', [[250, 'rattle-bridge'], [494, 'shifted'], [796, 'sunken'], [990, 'collapse'], [1220, 'shift-sunk'], [1530, 'collapse-2']]], ['8-6', [[150, 'climb'], [320, 'tunnel'], [495, 'tunnel-gap'], [760, 'snow'], [1100, 'sky-bridge'], [1400, 'dark-curve'], [1750, 'wind-bridge']]], ['8-7', [[232, 'ramp'], [440, 'islands'], [575, 'forest-ramp'], [820, 'big-ramp'], [1200, 'steps'], [1445, 'zigzag'], [1665, 'sky']]], ['8-8', [[250, 'fog-curve'], [485, 'lantern-gate'], [780, 'cloud-sea'], [1060, 'fog-sharp'], [1205, 'fog-bridge'], [1430, 'fog-shift']]], ['8-9', [[150, 'senbei-hill'], [455, 'boulder-gap'], [1100, 'boulder-2'], [1185, 'uphill-gap'], [1470, 'sprint'], [1570, 'hump'], [1735, 'double-jump']]], ['8-10', [[180, 'avalanche'], [480, 'snow-curve'], [640, 'tunnel'], [885, 'collapse'], [992, 'ramp'], [1250, 'slalom'], [1530, 'fog-shift'], [1880, 'sprint'], [1990, 'finale']]]].filter(([id]) => !only || only.includes(id))) {
    if (id === '8-2' && !only) {
      // もう一度 8-1 をクリアして、結果の「次の面へ」から入る
      await page.goto(`${base}/cart/?level=8-1`); await page.waitForFunction(() => !!window.__cart);
      await page.locator('[data-ks="go"]').click(); await page.evaluate(installBot);
      await page.waitForFunction(() => document.querySelector('[data-ks="result"]').classList.contains('on'), null, { timeout: 600000 });
      await page.locator('[data-ks="next"]').click();
      await page.waitForURL(/\/cart\/\?level=8-2/);
    } else await page.goto(`${base}/cart/?level=${id}`);
    await page.waitForFunction(() => !!window.__cart);
    assert.equal(await page.evaluate(() => window.__cart.level.id), id);
    await page.locator('[data-ks="go"]').click();
    await page.evaluate(installBot);
    for (const [at, name] of shots) {
      await page.waitForFunction(s => window.__cart.run.s >= s || window.__cart.run.phase !== 'running', at, { timeout: 600000 });
      await page.screenshot({ path: `${output}/cart-${id}-${name}.png` });
    }
    await page.waitForFunction(() => window.__cart.run.phase !== 'running', null, { timeout: 600000 });
    const r = await page.evaluate(() => { const r = window.__cart.run; return { phase: r.phase, reason: r.reason, s: r.s, t: r.t, lives: r.lives, coins: r.coins, max: r.maxV * 3.6 }; });
    assert.equal(r.phase, 'cleared', `${id} ゴールできなかった: ${r.reason} s=${r.s.toFixed(0)}`);
    await page.waitForFunction(() => document.querySelector('[data-ks="result"]').classList.contains('on'), null, { timeout: 120000 });
    await page.screenshot({ path: `${output}/cart-${id}-clear.png` });
    const p = await page.evaluate(() => JSON.parse(localStorage.getItem('spra-deer:progress:v2') ?? '{}'));
    assert.ok(p.levels?.[id]?.clears >= 1, `${id} クリアの記録が残る`);
    const w = await page.evaluate(async () => {
      const c = window.__cart, ren = c.view.renderer; let worst = { calls: 0, triangles: 0, at: 0 };
      document.querySelector('[data-ks="retry"]').click();
      for (let s = 20; s < c.track.length; s += 150) {
        c.run.restore(s, 0, 0, 0, false, []); c.run.phase = 'ready';
        await new Promise(r => setTimeout(r, 400));
        const i = ren.info.render;
        if (i.triangles > worst.triangles) worst = { calls: i.calls, triangles: i.triangles, at: s };
      }
      return worst;
    });
    assert.ok(w.triangles < 260000, `${id} 三角形が多すぎる`);
    console.log(`${id} 自動操作でゴール: ${r.t.toFixed(1)}秒 ハート${r.lives} コイン${r.coins} 最高${r.max.toFixed(0)}km/h / 重さ(s=${w.at}) 描画命令 ${w.calls}・三角形 ${w.triangles}`);
  }
  await page.close();

  // 4) 小さい画面
  await context.close();
  if (!only) {
  const small = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true });
  const sp = await small.newPage(); watch(sp);
  await sp.goto(`${base}/cart/?level=8-1`);
  await sp.waitForFunction(() => !!window.__cart);
  const card = await sp.locator('[data-ks="start"] .ks-card').boundingBox();
  assert.ok(card.y >= 0 && card.y + card.height <= 640, `はじめのカードが収まる (${card.y.toFixed(0)}〜${(card.y + card.height).toFixed(0)})`);
  await sp.locator('[data-ks="go"]').click();
  await sp.waitForFunction(() => window.__cart.run.phase === 'running');
  const boxes = await sp.evaluate(() => ['brake', 'dash', 'pad', 'jump'].map(k => document.querySelector(`[data-ks="${k}"]`).getBoundingClientRect().toJSON()));
  for (const b of boxes) assert.ok(b.x >= 0 && b.right <= 361 && b.bottom <= 641 && b.width > 60 && b.height > 50, 'ボタンが画面に収まる');
  // タッチで押すと、きく
  await sp.locator('[data-ks="brake"]').dispatchEvent('pointerdown', { pointerId: 5, pointerType: 'touch' });
  assert.equal(await sp.evaluate(() => window.__cart.input.brake), true);
  await sp.locator('[data-ks="brake"]').dispatchEvent('pointerup', { pointerId: 5, pointerType: 'touch' });
  assert.equal(await sp.evaluate(() => window.__cart.input.brake), false);
  await sp.screenshot({ path: `${output}/cart-05-small.png` });
  console.log('小さい画面(360×640)でも、カードとボタンが収まる');
  await small.close();
  }

  assert.deepEqual(errors, [], 'ブラウザのエラー');
  console.log('WORLD 8 のブラウザ確認: すべて通過');
} finally { await browser.close(); }
