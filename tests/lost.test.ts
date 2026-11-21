import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LBAL, LostRun, SOLID, route } from '../src/lost/sim.ts';
import { LOST_LEVELS, LOST_PLANNED, lostById } from '../src/lost/levels.ts';
import { driveLost } from './lostbot.ts';

const L1 = lostById('7-1')!;
const idle = { x: 0, y: 0 };
const walk = (r: LostRun, x: number, y: number, sec: number) => { for (let i = 0; i < sec * 120; i++) r.step(1 / 120, { x, y }); };

test('地図: どの行も 同じ長さ。まわりは 木。スタート・お母さん・子鹿が ある', () => {
  for (const lv of LOST_LEVELS) {
    const w = lv.map[0].length;
    assert.ok(lv.map.every(r => r.length === w), `${lv.id} 行の長さ`);
    for (const [r, row] of lv.map.entries()) for (const [c, ch] of [...row].entries()) {
      if (r === 0 || c === 0 || r === lv.map.length - 1 || c === w - 1) assert.ok(SOLID.has(ch), `${lv.id} ${c},${r} のまわりが あいている`);
      assert.ok('#~L.SMFcgpo'.includes(ch), `${lv.id} 知らない文字 ${ch}`);
    }
    const s = lv.map.join('');
    assert.equal([...s].filter(ch => ch === 'S').length, 1);
    assert.ok(s.includes('M') && s.includes('F'));
  }
});

test('地図: 子鹿・お母さん・コイン・ろうそくに、スタートから 歩いて 行ける', () => {
  for (const lv of LOST_LEVELS) {
    const r = new LostRun(lv);
    const start = { x: r.x, y: r.y };
    for (const p of [...r.fawns, ...r.mothers, ...r.coins, ...r.candles]) assert.ok(route(r, start, p), `${lv.id} ${p.x},${p.y} に 行けない`);
  }
});

test('面は 7-1。のこりは 準備中で 全10面', () => {
  assert.deepEqual(LOST_LEVELS.map(l => l.id), ['7-1']);
  assert.equal(LOST_LEVELS.length + LOST_PLANNED.length, 10);
});

test('木には ぶつかって 止まる。角では 道へ 寄せてもらえる', () => {
  const r = new LostRun(L1); r.start();
  // スタート(5,24)から 下は 木
  walk(r, 0, 1, 1);
  assert.ok(r.y < 25 - LBAL.radius + 1e-6 && r.y > 24.5 - 0.01);
  // 少し 道から ずれていても、上の道(3,23)へ 入れる
  const s = new LostRun(L1); s.start();
  s.x = 3.75; s.y = 24.5;
  walk(s, 0, -1, 0.8);
  assert.ok(s.y < 23.6, `上へ 入れない y=${s.y.toFixed(2)}`);
  assert.ok(s.x <= 4 - LBAL.radius + 1e-6, '道の中へ 寄せてもらえた');
});

test('子鹿に 近づくと ついてくる。はなれすぎると 止まって、また むかえに行くと ついてくる', () => {
  const r = new LostRun(L1); r.start();
  const f = r.fawns[0];
  // 子鹿(1,1)の となり(2,2)へ
  r.x = 2.5; r.y = 1.5;
  r.step(1 / 120, idle);
  assert.equal(f.state, 'follow');
  assert.ok(r.drain().some(e => e.kind === 'found'));
  // 右へ 歩くと、うしろを ついてくる
  walk(r, 1, 0, 0.7);
  assert.ok(f.x > 1.6, 'ついてきた');
  assert.ok(r.pathLen(f) < LBAL.warn);
  // 下へ ずっと 走ると(Spra の方が 速い)、はなれて 止まる
  const s = new LostRun(L1); s.start();
  s.x = 1.5; s.y = 2.5; s.step(1 / 120, idle);
  const g = s.fawns[0];
  assert.equal(g.state, 'follow');
  // (1,2)→(1,1)... 下は (1,2) から先が 木なので、横の道を使う: 2,3 → 2,4 → 2,5 → 1,5 → 1,6 … 1,10
  for (const [x, y] of [[2.5, 2.5], [2.5, 5.5], [1.5, 5.5], [1.5, 10.5], [3.5, 10.5], [3.5, 14.5], [1.5, 14.5], [1.5, 18.5], [3.5, 18.5]]) {
    for (let i = 0; i < 600 && Math.hypot(x - s.x, y - s.y) > 0.05; i++) { const d = Math.hypot(x - s.x, y - s.y); s.step(1 / 120, { x: (x - s.x) / d, y: (y - s.y) / d }); }
  }
  const ev = s.drain().map(e => e.kind);
  assert.ok(ev.includes('warn'), 'まって〜 と言う');
  assert.ok(ev.includes('stray'), 'はぐれる');
  assert.equal(g.state, 'lost');
  assert.equal(s.strays, 1);
  // もどって 近づくと、また ついてくる
  s.x = g.x; s.y = g.y + 0.6;
  if (s.hits(s.x, s.y)) s.y = g.y;
  s.step(1 / 120, idle);
  assert.equal(g.state, 'follow');
  assert.ok(s.drain().some(e => e.kind === 'regain'));
});

test('子鹿を お母さんの ところへ 連れてくると クリア', () => {
  const r = new LostRun(L1); r.start();
  const f = r.fawns[0], m = r.mothers[0];
  f.x = m.x - 3; f.y = m.y; r.x = m.x - 2.2; r.y = m.y;
  r.step(1 / 120, idle);
  assert.equal(f.state, 'follow');
  walk(r, 1, 0, 0.8);
  assert.equal(f.state, 'home');
  assert.equal(r.phase, 'cleared');
  assert.ok(r.drain().some(e => e.kind === 'clear'));
  assert.ok(r.stars >= 2);
});

test('ちょうちんの火: 少なくなると 照らす半径が 小さくなり、消えると 失敗。ろうそくで もどる', () => {
  const r = new LostRun(L1); r.start();
  const full = r.lightRadius;
  r.oil = L1.oil * 0.1; r.step(1 / 120, idle);
  assert.ok(r.lightRadius < full);
  assert.ok(r.drain().some(e => e.kind === 'dim'));
  const k = r.candles[0];
  r.x = k.x; r.y = k.y; r.step(1 / 120, idle);
  assert.ok(r.oil > L1.oil * 0.1 + LBAL.candle - 1);
  r.oil = 0.001; r.x = 5.5; r.y = 24.5; r.step(1 / 120, idle);
  assert.equal(r.phase, 'failed');
});

test('コイン: 近づくと 取れる。照らしたところは 地図に 残る', () => {
  const r = new LostRun(L1); r.start();
  const c = r.coins.find(q => !q.kind)!;
  r.x = c.x; r.y = c.y; r.step(1 / 120, idle);
  assert.equal(r.silver, 1);
  assert.equal(r.seen[Math.floor(c.y) * r.cols + Math.floor(c.x)], 1);
  assert.equal(r.seen[r.cols - 1], 0, '照らしていない すみは まだ 見えない');
});

test('ボット: 待ってあげれば はぐれずに クリア(★3)。待たずに 走ると はぐれる。何もしないと 火が消える', () => {
  for (const lv of LOST_LEVELS) {
    const good = driveLost(lv);
    assert.equal(good.phase, 'cleared', `${lv.id} t=${good.t.toFixed(1)}`);
    assert.equal(good.strays, 0);
    assert.ok(good.t <= lv.par, `${lv.id} ${good.t.toFixed(1)}秒 > par ${lv.par}`);
    const rush = driveLost(lv, { wait: false });
    assert.ok(rush.strays > 0, `${lv.id} 待たなくても はぐれない`);
    const slow = driveLost(lv, { detours: 3 });
    assert.equal(slow.phase, 'cleared', `${lv.id} 寄り道しても 火が もつ t=${slow.t.toFixed(1)}`);
    assert.equal(driveLost(lv, { idle: true }).phase, 'failed');
  }
});
