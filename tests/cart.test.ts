// WORLD 8「鹿と暴走トロッコ」: 走りのルールと、8-1 がクリアできること
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track, type TrackDef } from '../src/cart/track.ts';
import { CartRun, BAL, type Input } from '../src/cart/sim.ts';
import { CART_LEVELS, cartById, trackOf } from '../src/cart/levels.ts';
import { DT, none, drive as driveLevel, type Policy } from './cartbot.ts';
const def = (extra: Partial<TrackDef> & Pick<TrackDef, 'segments'>): TrackDef => ({ gaps: [], obstacles: [], coins: [], ...extra });
const go = (run: CartRun, sec: number, input: (r: CartRun) => Partial<Input> = () => ({})) => {
  run.start();
  for (let i = 0; i < sec / DT && run.phase === 'running'; i++) run.step(DT, { ...none(), ...input(run) });
  return run;
};

test('下り坂では、何もしなくても加速する。ブレーキで減速する', () => {
  const t = new Track(def({ segments: [{ len: 600, slope: -8 }] }));
  const free = go(new CartRun(t), 8);
  assert.ok(free.v > 20, `8秒で ${(free.v * 3.6).toFixed(0)} km/h`);
  const braked = go(new CartRun(t), 8, () => ({ brake: true }));
  assert.ok(braked.v < 6, `ブレーキで ${(braked.v * 3.6).toFixed(0)} km/h`);
  assert.ok(free.v <= BAL.vMax + 0.01, 'ふつうの最高速をこえない');
});

test('上り坂ではおそくなるが、鹿が引くので止まらない。ダッシュで速くなる', () => {
  const t = new Track(def({ segments: [{ len: 80, slope: 0 }, { len: 600, slope: 5 }] }));
  const r = go(new CartRun(t), 20);
  assert.equal(r.phase, 'running');
  assert.ok(r.v > 5 && r.v < 10, `上り坂で ${r.v.toFixed(1)} m/s`);
  const flat = new Track(def({ segments: [{ len: 900, slope: 0 }] }));
  const a = go(new CartRun(flat), 1.5), b = go(new CartRun(flat), 1.5, () => ({ dash: true }));
  assert.ok(b.v > a.v + 6, `ダッシュ ${b.v.toFixed(1)} / なし ${a.v.toFixed(1)}`);
  assert.ok(b.dashCool > 0, 'つづけては使えない');
});

test('ジャンプ: 速いほど遠くへとぶ。平らな所では、ちょうど1秒', () => {
  const t = new Track(def({ segments: [{ len: 900, slope: 0 }] }));
  const dist = (v: number) => {
    const r = new CartRun(t); r.start(); r.v = v;
    r.step(DT, { ...none(), jump: true });
    const from = r.s; let n = 0;
    while (r.air && n++ < 600) r.step(DT, none());
    return r.s - from;
  };
  assert.ok(Math.abs(dist(10) - 10) < 0.6, `10m/s で ${dist(10).toFixed(1)} m`);
  assert.ok(dist(28) > dist(10) * 2.5);
});

const gapTrack = (len: number) => new Track(def({ segments: [{ len: 400, slope: 0 }], gaps: [{ from: 100, to: 100 + len }] }));
const jumpAt = (t: Track, v: number, at: number) => {
  const r = new CartRun(t); r.start();
  for (let i = 0; i < 20 / DT && r.phase === 'running' && r.s < 200; i++) { if (!r.air) r.v = v; r.step(DT, { ...none(), jump: r.s >= at && r.jumps === 0 }); }
  return r;
};

test('線路の切れ目: 跳ばないと落ちる。速さが足りないと届かない。少しおくれても、まだ跳べる', () => {
  const t = gapTrack(20);
  assert.equal(jumpAt(t, 26, 99).phase, 'running', '26m/s なら届く');
  const slow = jumpAt(t, 14, 99);
  assert.equal(slow.phase, 'failed'); assert.equal(slow.reason, 'fall');
  const none_ = jumpAt(t, 26, 9999);
  assert.equal(none_.phase, 'failed'); assert.equal(none_.reason, 'fall');
  assert.equal(jumpAt(t, 26, 101.5).phase, 'running', 'ふちを少しすぎても、まだ跳べる');
  assert.equal(jumpAt(t, 26, 60).phase, 'failed', '早すぎると、手前に着地して落ちる');
});

test('急カーブ: 速すぎると、車輪が浮いてから脱線する。内側へ体を傾けると、ねばれる。ブレーキなら安全', () => {
  // 半径 約45m のカーブ(右)
  const t = new Track(def({ segments: [{ len: 100, slope: 0 }, { len: 80, slope: 0, turn: 100 }, { len: 200, slope: 0 }] }));
  const at = (v: number, lean: Partial<Input>) => {
    const r = new CartRun(t); r.start();
    for (let i = 0; i < 20 / DT && r.phase === 'running' && r.s < 220; i++) { r.v = v; r.step(DT, { ...none(), ...lean }); }
    return r;
  };
  const fast = at(26, {});
  assert.equal(fast.reason, 'derail');
  assert.ok(fast.s > 105, `カーブに入ってすぐではなく、少しねばる s=${fast.s.toFixed(0)}`);
  assert.equal(at(21, {}).reason, 'derail', '傾けないと、21m/s でも脱線');
  assert.equal(at(21, { right: true }).phase, 'running', '内側(右)へ傾けると、21m/s で回れる');
  assert.equal(at(21, { left: true }).reason, 'derail', '外側へ傾けると、もっと危ない');
  assert.equal(at(15, {}).phase, 'running', '15m/s なら、何もしなくても回れる');
});

test('障害物: 岩・倒木は跳んで越える。枝は、反対へ体を傾けてよける。当たるとハートが減って、おそくなる', () => {
  const t = new Track(def({ segments: [{ len: 500, slope: 0 }], obstacles: [{ s: 60, kind: 'rock' }, { s: 160, kind: 'branch', side: 1 }, { s: 260, kind: 'log' }] }));
  const hit = go(new CartRun(t), 40, r => (r.s > 400 ? { brake: true } : {}));
  assert.equal(hit.phase, 'failed'); assert.equal(hit.reason, 'broken');
  const ok = new CartRun(t); ok.start();
  for (let i = 0; i < 40 / DT && ok.s < 300; i++) {
    ok.v = 18;
    ok.step(DT, { ...none(), jump: (ok.s > 52 && ok.s < 54) || (ok.s > 252 && ok.s < 254), left: ok.s > 150 && ok.s < 165 });
  }
  assert.equal(ok.lives, 3);
  const one = new CartRun(t); one.start(); one.v = 18;
  for (let i = 0; i < 4 / DT && one.s < 70; i++) one.step(DT, none());
  assert.equal(one.lives, 2); assert.ok(one.v < 12, `当たると減速 ${one.v.toFixed(1)}`);
});

test('コイン: まん中は通るだけ。横は体を傾けて、高い所は跳んで取る', () => {
  const t = new Track(def({ segments: [{ len: 300, slope: 0 }], coins: [{ s: 30, side: 0, h: 0.9 }, { s: 60, side: 1, h: 0.9 }, { s: 100, side: 0, h: 3.2, kind: 'gold' }] }));
  const plain = go(new CartRun(t), 14);
  assert.deepEqual([plain.coins, plain.gold], [1, 0]);
  const all = new CartRun(t); all.start();
  for (let i = 0; i < 20 / DT && all.s < 150; i++) { all.v = 16; all.step(DT, { ...none(), right: all.s > 50 && all.s < 62, jump: all.s > 92 && all.s < 93 }); }
  assert.deepEqual([all.coins, all.gold], [2, 1]);
});

// ---- 8-1 を、自動で走る(ボットは tests/cartbot.ts) ----
const L1 = cartById('8-1')!, L2 = cartById('8-2')!, L3 = cartById('8-3')!;
const drive = (policy: Policy = {}) => driveLevel(L1, policy);

test('8-1: 先を見て操作すれば、ハートを減らさずにクリアできる(60〜95秒)', () => {
  const r = drive();
  assert.equal(r.phase, 'cleared', `${r.reason} s=${r.s.toFixed(0)}`);
  assert.equal(r.lives, 3);
  assert.ok(r.t > 55 && r.t < 95, `タイム ${r.t.toFixed(1)} 秒`);
  assert.ok(r.maxV * 3.6 > 100, `最高 ${(r.maxV * 3.6).toFixed(0)} km/h`);
  assert.ok(r.coins > 60, `コイン ${r.coins}`);
  console.log(`8-1 ボット: ${r.t.toFixed(1)}秒 最高${(r.maxV * 3.6).toFixed(0)}km/h コイン${r.coins} 金${r.gold} ジャンプ${r.jumps}回`);
});

test('8-1: ブレーキを使わないと、急カーブで脱線する', () => {
  const r = drive({ brake: false });
  assert.equal(r.reason, 'derail');
  assert.ok(r.s > 800 && r.s < 880, `急カーブで s=${r.s.toFixed(0)}`);
});

test('8-1: 跳ばないと、小さな渓谷で落ちる。ダッシュしないと、大渓谷に届かない', () => {
  const noJump = drive({ jump: false });
  assert.equal(noJump.reason, 'fall'); assert.ok(noJump.s > 452 && noJump.s < 480, `s=${noJump.s.toFixed(0)}`);
  const noDash = drive({ dash: false });
  assert.equal(noDash.reason, 'fall'); assert.ok(noDash.s > 1112 && noDash.s < 1160, `s=${noDash.s.toFixed(0)}`);
});

test('8-1: ずっとブレーキを押していると、渓谷を越えられない(押しっぱなしではクリアできない)', () => {
  const track = trackOf(CART_LEVELS[0]), run = new CartRun(track);
  run.start();
  for (let i = 0; i < 400 / DT && run.phase === 'running'; i++) {
    const gap = track.gaps.find(g => g.to > run.s);
    const rock = track.obstacles.find(o => o.kind !== 'branch' && o.s > run.s && o.s - run.s < 1.2);
    run.step(DT, { ...none(), brake: true, jump: (!!gap && gap.from - run.s < 0.3 && gap.from - run.s > -0.5) || !!rock });
  }
  assert.equal(run.reason, 'fall', 'おそすぎて、切れ目を越えられない');
});

test('8-1: 面のデータ(プレミアム1枚・切れ目はまっすぐな所・チェックポイント)', () => {
  const lv = CART_LEVELS[0], t = trackOf(lv);
  assert.equal(t.length, 1500);
  assert.equal(t.coins.filter(c => c.kind === 'premium').length, 1);
  for (const g of t.gaps) for (let s = g.from - 30; s <= g.to + 30; s += 5) assert.ok(Math.abs(t.at(s).curv) < 0.002, `切れ目のまわりは、まっすぐ s=${s}`);
  for (const c of t.coins) assert.ok(c.h > 1.5 || !t.inGap(c.s), `切れ目の上のコインは、空中 s=${c.s}`);
  assert.equal(t.checkpoints.length, 2);
});

test('8-1: プレミアムコインは、最後の倒木をダッシュの大ジャンプで越えると取れる(ふつうに跳ぶだけでは取れない)', () => {
  const attempt = (dash: boolean) => {
    const track = trackOf(CART_LEVELS[0]), run = new CartRun(track);
    run.restore(1400, 0, 0, 0, false, []);
    run.start(); run.v = 24;
    for (let i = 0; i < 12 / DT && run.phase === 'running' && run.s < 1475; i++) {
      run.step(DT, { ...none(), dash: dash && run.s > 1405 && run.s < 1410, jump: run.s > 1437 && run.s < 1439 });
    }
    return run;
  };
  assert.equal(attempt(true).premium, true);
  assert.equal(attempt(true).lives, 3);
  assert.equal(attempt(false).premium, false);
});

// ---- すべての面 ----
test('すべての面: プレミアム1枚・切れ目は渓谷の中のまっすぐな所・線路どうしが近づきすぎない', () => {
  assert.deepEqual(CART_LEVELS.map(l => l.id), ['8-1', '8-2', '8-3']);
  for (const lv of CART_LEVELS) {
    const t = trackOf(lv), tag = lv.id;
    assert.equal(t.coins.filter(c => c.kind === 'premium').length, 1, `${tag} プレミアム`);
    for (const g of t.gaps) {
      const seg = t.segments.find(x => g.from >= x.from && g.to <= x.to);
      assert.equal(seg?.terrain, 'canyon', `${tag} 切れ目 ${g.from} は渓谷(橋)の中`);
      for (let s = g.from - 30; s <= g.to + 30; s += 5) assert.ok(Math.abs(t.at(s).curv) < 0.002, `${tag} 切れ目のまわりは、まっすぐ s=${s}`);
    }
    for (const c of t.coins) assert.ok(c.h > 1.5 || !t.inGap(c.s), `${tag} 切れ目の上のコインは、空中 s=${c.s}`);
    assert.equal(t.checkpoints.length, 2, `${tag} チェックポイント`);
    for (const cp of t.checkpoints) assert.ok(!t.gaps.some(g => cp.s > g.from - 40 && cp.s < g.to + 10), `${tag} チェックポイント ${cp.s} は切れ目の近くでない`);
    // 地面は線路の左右150mまで作るので、離れた所どうしが近づくと、地面が重なる
    for (let a = 0; a < t.total; a += 10) for (let b = a + 400; b < t.total; b += 10) {
      const p = t.at(a), q = t.at(b);
      assert.ok(Math.hypot(p.x - q.x, p.z - q.z) > 250, `${tag} s=${a} と ${b} が近い`);
    }
  }
});

for (const lv of CART_LEVELS) {
  test(`${lv.id}: 先を見て操作すれば、ハートを減らさずにクリアできる。ブレーキ・ジャンプ・体の傾きは、どれも要る`, () => {
    const r = driveLevel(lv);
    assert.equal(r.phase, 'cleared', `${r.reason} s=${r.s.toFixed(0)}`);
    assert.equal(r.lives, 3);
    assert.ok(r.t > 55 && r.t < 110, `タイム ${r.t.toFixed(1)} 秒`);
    console.log(`${lv.id} ボット: ${r.t.toFixed(1)}秒 最高${(r.maxV * 3.6).toFixed(0)}km/h コイン${r.coins} 金${r.gold} ジャンプ${r.jumps}回`);
    assert.equal(driveLevel(lv, { brake: false }).reason, 'derail', 'ブレーキなし');
    assert.equal(driveLevel(lv, { jump: false }).reason, 'fall', 'ジャンプなし');
    const noLean = driveLevel(lv, { lean: false });
    assert.ok(noLean.lives < 3, '傾けないと、枝に当たる');
  });
}

// ---- 8-2 急カーブの森 ----
test('8-2: ブレーキを使わないと、ヘアピンで脱線する。ダッシュは要らない', () => {
  const r = driveLevel(L2, { brake: false });
  assert.ok(r.s > 550 && r.s < 640, `ヘアピンで s=${r.s.toFixed(0)}`);
  assert.equal(driveLevel(L2, { dash: false }).phase, 'cleared');
});

test('8-2: プレミアムは、ヘアピンで しっかり減速して、外へ傾けたときだけ取れる', () => {
  const tryAt = (target: number) => driveLevel(L2, { until: 680, extra: (run, inp) => {
    if (run.s > 470 && run.s < 594) inp.brake = run.v > target;
    if (run.s > 582 && run.s < 594) { inp.left = true; inp.right = false; }
  } });
  const slow = tryAt(17);
  assert.equal(slow.phase, 'running'); assert.equal(slow.premium, true); assert.equal(slow.lives, 3);
  assert.equal(tryAt(22).reason, 'derail', '速いまま外へ傾けると、脱線');
  assert.equal(driveLevel(L2, { until: 680 }).premium, false, 'ふつうに内へ傾けて回ると、取れない');
});

// ---- 8-3 ジャンプ渓谷 ----
test('8-3: ダッシュしないと、上りの谷に届かない。ブレーキを使わないと、谷底のカーブで脱線する', () => {
  const noDash = driveLevel(L3, { dash: false });
  assert.equal(noDash.reason, 'fall'); assert.ok(noDash.s > 722 && noDash.s < 760, `上りの谷で s=${noDash.s.toFixed(0)}`);
  const noBrake = driveLevel(L3, { brake: false });
  assert.ok(noBrake.s > 980 && noBrake.s < 1060, `谷底のカーブで s=${noBrake.s.toFixed(0)}`);
});

test('8-3: 二連の谷は、着地してすぐもう一回跳ぶ。落石の谷は、着地のすぐ先の岩を跳ぶ', () => {
  // 2つめの切れ目で跳ばない
  const once = driveLevel(L3, { from: 440, until: 600, extra: (run, inp) => { if (run.s > 500 && run.s < 530) inp.jump = false; } });
  assert.equal(once.reason, 'fall'); assert.ok(once.s > 516 && once.s < 545, `s=${once.s.toFixed(0)}`);
  assert.equal(driveLevel(L3, { from: 440, until: 600 }).phase, 'running');
  // 着地のあと、岩を跳ばない
  const rock = driveLevel(L3, { from: 1100, until: 1210, extra: (run, inp) => { if (run.s > 1160 && run.s < 1185) inp.jump = false; } });
  assert.equal(rock.lives, 2);
});

test('8-3: プレミアムは、最後の下り坂でダッシュして、大渓谷を全速で跳んだときだけ取れる', () => {
  const tryDash = (at: number) => driveLevel(L3, { from: 1400, until: 1640, dash: false, extra: (run, inp) => { if (at && run.s > at && run.s < at + 5) inp.dash = true; } });
  for (const at of [1515, 1525, 1535]) {
    const r = tryDash(at);
    assert.equal(r.premium, true, `ダッシュ@${at}`); assert.equal(r.lives, 3);
  }
  assert.equal(tryDash(1490).premium, false, 'ダッシュが早すぎると、跳ぶときには遅くなっている');
  assert.equal(tryDash(0).reason, 'fall', 'ダッシュしないと、大渓谷に届かない');
});
