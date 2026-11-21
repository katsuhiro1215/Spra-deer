import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LBAL, LostRun, SOLID, FAWN_KEYS, MOTHER_KEYS, route } from '../src/lost/sim.ts';
import { LOST_LEVELS, LOST_PLANNED, lostById } from '../src/lost/levels.ts';
import { driveLost } from './lostbot.ts';

const L1 = lostById('7-1')!, L2 = lostById('7-2')!, L3 = lostById('7-3')!, L4 = lostById('7-4')!, L5 = lostById('7-5')!, L6 = lostById('7-6')!, L7 = lostById('7-7')!;
const idle = { x: 0, y: 0 };
const walk = (r: LostRun, x: number, y: number, sec: number) => { for (let i = 0; i < sec * 120; i++) r.step(1 / 120, { x, y }); };

test('地図: どの行も 同じ長さ。まわりは 木。スタート・お母さん・子鹿が ある', () => {
  for (const lv of LOST_LEVELS) {
    const w = lv.map[0].length;
    assert.ok(lv.map.every(r => r.length === w), `${lv.id} 行の長さ`);
    for (const [r, row] of lv.map.entries()) for (const [c, ch] of [...row].entries()) {
      if (r === 0 || c === 0 || r === lv.map.length - 1 || c === w - 1) assert.ok(SOLID.has(ch), `${lv.id} ${c},${r} のまわりが あいている`);
      assert.ok('#~Ll.SMNFGcgpos'.includes(ch), `${lv.id} 知らない文字 ${ch}`);
    }
    const s = lv.map.join('');
    assert.equal([...s].filter(ch => ch === 'S').length, 1);
    assert.ok(s.includes('M') && s.includes('F'));
    // 子鹿の お母さんが いる(G の子には N のお母さん)
    for (const [i, f] of [...FAWN_KEYS].entries()) if (s.includes(f)) assert.ok(s.includes(MOTHER_KEYS[i]), `${lv.id} ${f} の お母さんが いない`);
  }
});

test('地図: 子鹿・お母さん・コイン・ろうそくに、スタートから 歩いて 行ける', () => {
  for (const lv of LOST_LEVELS) {
    const r = new LostRun(lv);
    const start = { x: r.x, y: r.y };
    for (const p of [...r.fawns, ...r.mothers, ...r.coins, ...r.candles, ...r.senbei]) assert.ok(route(r, start, p), `${lv.id} ${p.x},${p.y} に 行けない`);
  }
});

test('面は 7-1〜7-10(全10面)。あとの面ほど 子鹿が 多い', () => {
  assert.deepEqual(LOST_LEVELS.map(l => l.id), Array.from({ length: 10 }, (_, i) => `7-${i + 1}`));
  assert.equal(LOST_PLANNED.length, 0);
  const n = LOST_LEVELS.map(l => new LostRun(l).fawns.length);
  assert.equal(n[0], 1); assert.equal(n.at(-1), 4);
  for (const lv of LOST_LEVELS) assert.ok(lv.par < lv.oil, lv.id);
});

/** 子鹿の となりの 道に Spra を置く */
const beside = (r: LostRun, p: { x: number; y: number }) => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!r.solid(Math.floor(p.x + dx), Math.floor(p.y + dy))) { r.x = p.x + dx; r.y = p.y + dy; return; }
  assert.fail('となりに 道が ない');
};

test('7-2 子鹿が 2ひき: あとで 見つけた子が 列の 先頭(Spra の すぐ うしろ)に 入る', () => {
  const r = new LostRun(L2); r.start();
  const [a, b] = r.fawns;
  beside(r, a); r.step(1 / 120, idle);
  assert.equal(a.state, 'follow'); assert.equal(a.leader, -1);
  b.x = a.x; b.y = a.y; r.step(1 / 120, idle); // 2ひき目も Spra の そばに
  assert.equal(b.state, 'follow'); assert.equal(b.leader, -1);
  assert.equal(a.leader, b.id, '前の 先頭の子は、新しい子に ついていく');
  assert.ok(r.connected(a) && r.connected(b));
});

test('7-3 火の 消えた 石灯籠: 近づくと 火が つき、まわりが 見えるように なる', () => {
  const r = new LostRun(L3); r.start();
  const l = r.lamps.find(q => !q.lit)!;
  assert.ok(l, '消えた 灯籠が ある');
  beside(r, l); r.step(1 / 120, idle);
  assert.ok(l.lit);
  assert.equal(r.tiles[Math.floor(l.y)][Math.floor(l.x)], 'L');
  assert.ok(r.drain().some(e => e.kind === 'lamp'));
  assert.ok(r.solid(Math.floor(l.x), Math.floor(l.y)), '灯籠は 通れない');
});

test('7-4 見回りの 大きな鹿: 行ったり来たり する。Spra が ぶつかると はじかれて、ついてきた子鹿は びっくりして 止まる', () => {
  const r = new LostRun(L4); r.start();
  const s = r.stags[0];
  const seen = new Set<string>();
  for (let i = 0; i < 120 * 40; i++) { r.step(1 / 120, idle); seen.add(`${Math.floor(s.x)},${Math.floor(s.y)}`); }
  const ends = L4.stags![0].path;
  assert.ok(seen.has(ends[0].join(',')) && seen.has(ends.at(-1)!.join(',')), '道の 両はしまで 行く');
  // ついてくる子鹿を 連れて、大きな鹿に ぶつかる
  const q = new LostRun(L4); q.start();
  const f = q.fawns[0], st = q.stags[0];
  f.state = 'follow'; f.leader = -1; f.x = st.x; f.y = st.y; f.path = [];
  q.x = st.x; q.y = st.y;
  q.step(1 / 120, idle);
  const ev = q.drain().map(e => e.kind);
  assert.ok(ev.includes('bump') && ev.includes('scare'));
  assert.equal(f.state, 'lost');
  assert.ok(q.stun > 0);
  const x0 = q.x, y0 = q.y; q.step(1 / 120, { x: 1, y: 0 });
  assert.ok(Math.hypot(q.x - x0, q.y - y0) < 1e-9, 'ぶつかった あとは 少し 動けない');
});

test('7-5 二組の 親子: 子鹿は 自分の お母さん(同じ リボンの色)の ところでだけ 帰れる', () => {
  const r = new LostRun(L5); r.start();
  assert.equal(r.mothers.length, 2);
  const g = r.fawns.find(f => f.mother === 1)!;
  const wrong = r.mothers[0], right = r.mothers[1];
  for (const m of [wrong, right]) {
    g.state = 'follow'; g.leader = -1; g.path = []; g.x = m.x; g.y = m.y; r.x = m.x; r.y = m.y;
    r.step(1 / 120, idle);
    assert.equal(g.state, m === right ? 'home' : 'follow');
  }
});

test('7-6 霧の 夜: 照らす はんいが せまい', () => {
  assert.ok(L6.fog);
  const a = new LostRun(L1), b = new LostRun(L6);
  assert.ok(b.lightRadius < a.lightRadius - 0.5);
});

test('7-7 せんべい: 子鹿は 近くの せんべいを 食べに 寄り道して、食べたら 列に もどる。Spra が 先に 拾えば 食べない', () => {
  const r = new LostRun(L7); r.start();
  const sb = r.senbei[0], f = r.fawns[0];
  // せんべいの となりに、ついてくる 子鹿と Spra を 置く
  beside(r, sb); f.x = r.x; f.y = r.y; f.state = 'follow'; f.leader = -1; f.path = [];
  r.step(1 / 120, idle);
  assert.ok(f.eat, '食べに 行く');
  assert.ok(r.drain().some(e => e.kind === 'eat'));
  for (let i = 0; i < 120 * (LBAL.eatTime + 1.5); i++) r.step(1 / 120, idle);
  assert.equal(f.eat, null, '食べおわって もどった');
  assert.equal(f.state, 'follow');
  // Spra が 先に 拾うと、もう 食べない
  const q = new LostRun(L7); q.start();
  const s2 = q.senbei[0], g = q.fawns[0];
  q.x = s2.x; q.y = s2.y; q.step(1 / 120, idle);
  assert.ok(q.gone.has(s2.id));
  assert.ok(q.drain().some(e => e.kind === 'senbei'));
  beside(q, s2); g.x = q.x; g.y = q.y; g.state = 'follow'; g.leader = -1; g.path = [];
  q.step(1 / 120, idle);
  assert.equal(g.eat, null);
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
    const slow = driveLost(lv, { detours: 6 });
    assert.equal(slow.phase, 'cleared', `${lv.id} 寄り道しても 火が もつ t=${slow.t.toFixed(1)}`);
    assert.equal(driveLost(lv, { idle: true }).phase, 'failed');
  }
});
