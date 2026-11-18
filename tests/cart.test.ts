// WORLD 8「鹿と暴走トロッコ」: 走りのルールと、8-1 がクリアできること
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGED, Track, type TrackDef } from '../src/cart/track.ts';
import { CartRun, BAL, rampReach, type Input } from '../src/cart/sim.ts';
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
const L1 = cartById('8-1')!, L2 = cartById('8-2')!, L3 = cartById('8-3')!, L4 = cartById('8-4')!, L5 = cartById('8-5')!, L6 = cartById('8-6')!, L7 = cartById('8-7')!;
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
  assert.deepEqual(CART_LEVELS.map(l => l.id).slice(0, 4), ['8-1', '8-2', '8-3', '8-4']);
  for (const lv of CART_LEVELS) {
    const t = trackOf(lv), tag = lv.id;
    assert.equal(t.coins.filter(c => c.kind === 'premium').length, 1, `${tag} プレミアム`);
    for (const g of t.gaps) {
      const seg = t.segments.find(x => g.from >= x.from && g.to <= x.to);
      assert.ok(seg?.terrain && BRIDGED.includes(seg.terrain), `${tag} 切れ目 ${g.from} は谷(橋)の中`);
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
    assert.ok(noLean.lives < 3 || noLean.phase === 'failed', '傾けないと、枝に当たる(または、ずれた線路で外れる)');
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

// ---- こぶ(8-4 から) ----
test('こぶ: 速いと、下へ折れる線路から浮いて飛ぶ。おそいと浮かない。浮いても、線路の上へ着地する', () => {
  const t = new Track(def({ segments: [{ len: 200, slope: -12 }, { len: 24, slope: 7 }, { len: 300, slope: -14 }] }));
  const at = (v: number) => {
    const r = new CartRun(t); r.start();
    for (let i = 0; i < 20 / DT && r.phase === 'running' && r.s < 360; i++) { if (!r.air && r.s < 215) r.v = v; r.step(DT, none()); }
    return r;
  };
  assert.equal(at(14).lifts, 0, '50km/h では浮かない');
  const fast = at(36);
  assert.ok(fast.lifts >= 1, '130km/h では浮く');
  assert.equal(fast.lifts, 1, '少し浮いては着地、をくり返さない');
  assert.equal(fast.phase, 'running');
});

test('最高速は面ごとに変えられる(8-4 は 144km/h、ほかは 108km/h)', () => {
  const steep = (vMax?: number) => go(new CartRun(new Track(def({ segments: [{ len: 3000, slope: -14 }], vMax }))), 40);
  assert.ok(Math.abs(steep().v - BAL.vMax) < 0.5);
  assert.ok(Math.abs(steep(40).v - 40) < 0.5);
  assert.equal(L4.track.vMax, 40);
});

// ---- ずれた・沈んだ・崩れる切れ目(8-5 から) ----
test('ずれた線路: 空中で、ずれた側へ傾けると着地できる。傾けないと外れる。ふつうの切れ目では、傾けても 0.5m しか動かない', () => {
  const t = new Track(def({ segments: [{ len: 300, slope: 0 }], gaps: [{ from: 100, to: 108, shift: 2.4 }, { from: 200, to: 208 }] }));
  const fly = (lean: Partial<Input>, until = 150) => {
    const r = new CartRun(t); r.start();
    for (let i = 0; i < 20 / DT && r.phase === 'running' && r.s < until; i++) {
      if (!r.air) r.v = 20;
      r.step(DT, { ...none(), jump: (r.s > 99 && r.s < 100) || (r.s > 199 && r.s < 200), ...(r.air ? lean : {}) });
    }
    return r;
  };
  assert.equal(fly({}).reason, 'miss', '傾けないと、ずれた線路に乗れない');
  assert.equal(fly({ left: true }).reason, 'miss', '反対へ傾けても、だめ');
  assert.equal(fly({ right: true }).phase, 'running');
  assert.ok(Math.abs(t.at(120).x - t.at(90).x - 2.4) < 0.3 || Math.abs(t.at(120).z - t.at(90).z) > 29, '向こうの線路は横にずれている');
  const plain = new Track(def({ segments: [{ len: 300, slope: 0 }], gaps: [{ from: 200, to: 208 }] }));
  for (const lean of [{ left: true }, { right: true }]) {
    const r = new CartRun(plain); r.start();
    for (let i = 0; i < 20 / DT && r.phase === 'running' && r.s < 250; i++) { if (!r.air) r.v = 20; r.step(DT, { ...none(), jump: r.s > 199 && r.s < 200, ...lean }); }
    assert.equal(r.phase, 'running', 'ふつうの切れ目では、傾けていても着地できる');
  }
});

test('沈んだ線路: 向こう側が低い。崩れる橋: 走りのルールでは、はじめから切れ目', () => {
  const t = new Track(def({ segments: [{ len: 300, slope: 0 }], gaps: [{ from: 100, to: 110, drop: 6 }, { from: 200, to: 209, collapse: true }] }));
  assert.ok(Math.abs(t.height(90) - t.height(120) - 6) < 0.01);
  assert.ok(t.inGap(205));
  const r = go(new CartRun(t), 30);
  assert.equal(r.reason, 'fall');
});

// ---- 横風・雪・トンネル(8-6 から) ----
test('横風: 傾けないと、やがて脱線。風上へ傾けると こらえられる。風下へ傾けると、すぐ脱線', () => {
  const t = new Track(def({ segments: [{ len: 50, slope: 0 }, { len: 400, slope: 0, wind: 11 }] }));
  const ride = (lean: Partial<Input>) => {
    const r = new CartRun(t); r.start();
    for (let i = 0; i < 30 / DT && r.phase === 'running' && r.s < 420; i++) { r.v = 15; r.step(DT, { ...none(), ...lean }); }
    return r;
  };
  assert.equal(ride({}).reason, 'derail');
  assert.equal(ride({ left: true }).phase, 'running', '風上(左)へ傾けると、こらえられる');
  const down = ride({ right: true });
  assert.equal(down.reason, 'derail'); assert.ok(down.s < ride({}).s, '風下へ傾けると、もっと早く脱線');
});

test('雪の上では、ブレーキが半分しかきかない。トンネルの区間がわかる', () => {
  const t = new Track(def({ segments: [{ len: 300, slope: 0 }, { len: 300, slope: 0, snow: true }, { len: 200, slope: 0, terrain: 'tunnel' }] }));
  const stop = (from: number) => { const r = new CartRun(t); r.restore(from, 0, 0, 0, false, []); r.start(); r.v = 25; const s0 = r.s; for (let i = 0; i < 2 / DT; i++) r.step(DT, { ...none(), brake: true }); return { v: r.v, d: r.s - s0 }; };
  assert.ok(stop(400).v > stop(50).v + 6, `雪 ${stop(400).v.toFixed(1)} / 土 ${stop(50).v.toFixed(1)} m/s`);
  assert.equal(t.inTunnel(700), true); assert.equal(t.inTunnel(500), false);
  assert.deepEqual(t.tunnels(), [[600, 800]]);
});

// ---- ジャンプ台(8-7 から) ----
test('ジャンプ台: 乗るだけで高く飛ぶ。台の直前・離れてすぐにジャンプすると、もっと遠くへ。台を飛びこさない', () => {
  const t = new Track(def({ segments: [{ len: 400, slope: 0 }], obstacles: [{ s: 100, kind: 'ramp' }] }));
  const fly = (jumpFrom = 0, jumpTo = 0) => {
    const r = new CartRun(t); r.start(); let from = 0, maxH = 0;
    for (let i = 0; i < 20 / DT && r.phase === 'running' && r.s < 200; i++) {
      if (!r.air) r.v = 20;
      const wasAir = r.air;
      r.step(DT, { ...none(), jump: r.s > jumpFrom && r.s < jumpTo });
      if (r.air && !wasAir) from = r.s;
      maxH = Math.max(maxH, r.height);
      if (!r.air && wasAir) return { dist: r.s - from, maxH, r };
    }
    return { dist: 0, maxH, r };
  };
  const plain = fly(), boostBefore = fly(99, 100.5), boostAfter = fly(101, 102);
  assert.ok(Math.abs(plain.dist - rampReach(20, false)) < 2, `乗るだけ ${plain.dist.toFixed(1)}m`);
  assert.ok(plain.maxH > 4 && plain.maxH < 5, `高さ ${plain.maxH.toFixed(1)}m`);
  assert.ok(Math.abs(boostBefore.dist - rampReach(20, true)) < 2, `台の直前でジャンプ ${boostBefore.dist.toFixed(1)}m`);
  assert.ok(Math.abs(boostAfter.dist - rampReach(20, true)) < 2, `台を離れてすぐ ${boostAfter.dist.toFixed(1)}m`);
  assert.equal(boostBefore.r.ramps, 1, '台の直前で押しても、台を飛びこさない');
  assert.equal(fly(104, 106).r.rampBoosts, 0, 'おそいと、上乗せはきかない');
  assert.equal(plain.r.lives, 3, 'ジャンプ台には、ぶつからない');
});

// ---- 8-4 超高速ダウンヒル ----
test('8-4: 144km/h 近くまで出る。こぶの先の急カーブは、こぶの手前で減速しないと、飛んだまま突っこんで脱線する', () => {
  const r = driveLevel(L4);
  assert.ok(r.maxV * 3.6 > 140, `最高 ${(r.maxV * 3.6).toFixed(0)} km/h`);
  assert.ok(r.lifts >= 2, `こぶで浮く ${r.lifts} 回`);
  let lifted = 0;
  const reckless = driveLevel(L4, { until: 960, extra: (run, inp) => {
    if (run.s > 700 && run.s < 812) inp.brake = false;
    for (const e of run.drainEvents()) if (e.kind === 'lift' && run.s > 780) lifted++;
  } });
  assert.equal(lifted, 1, 'こぶで浮く'); assert.equal(reckless.reason, 'derail');
  assert.ok(reckless.s > 850 && reckless.s < 925, `急カーブで s=${reckless.s.toFixed(0)}`);
});

test('8-4: 枝のスラロームは、左右へ続けて傾ける。プレミアムは、大こぶにダッシュで飛びこんだときだけ', () => {
  const noLean = driveLevel(L4, { lean: false });
  assert.deepEqual([...noLean.hitIds].map(i => trackOf(L4).obstacles[i].s).slice(0, 3), [1290, 1318, 1346]);
  const tryDash = (at: number) => driveLevel(L4, { from: 1240, until: 1620, dash: false, extra: (run, inp) => { if (at && run.s > at && run.s < at + 5) inp.dash = true; } });
  assert.equal(tryDash(1480).premium, true); assert.equal(tryDash(1500).premium, true);
  assert.equal(tryDash(0).premium, false, 'ダッシュなしでは、高さが足りない');
  assert.equal(driveLevel(L4).premium, false, 'ふつうに走るだけでは取れない');
});

// ---- 8-5 崩れた線路 ----
test('8-5: 空中で傾けないと、ずれた線路で外れる。がたがた橋は3回続けて跳ぶ。沈んだ線路・崩れる橋も越えられる', () => {
  const noLean = driveLevel(L5, { lean: false });
  assert.equal(noLean.reason, 'miss'); assert.ok(noLean.s > 498 && noLean.s < 520, `ずれた線路で s=${noLean.s.toFixed(0)}`);
  const hop2 = driveLevel(L5, { until: 340, extra: (run, inp) => { if (run.s > 245 && run.s < 260) inp.jump = false; } });
  assert.equal(hop2.reason, 'fall', 'がたがた橋の2つ目で跳ばないと落ちる');
  const t = trackOf(L5);
  assert.ok(t.height(785) - t.height(805) > 6, '沈んだ線路は、向こう側が低い');
  assert.equal(t.gaps.filter(g => g.collapse).length, 3);
  const r = driveLevel(L5);
  assert.ok(r.jumps >= 13, `ジャンプ ${r.jumps} 回`);
});

test('8-5: プレミアムは、ずれた線路で いったん左へ傾けて取り、すぐ右へ寄せたときだけ', () => {
  const tryIt = (switchAt: number) => driveLevel(L5, { until: 560, extra: (run, inp) => { if (run.s > 484 && run.s < switchAt) { inp.left = true; inp.right = false; } } });
  const quick = tryIt(492);
  assert.equal(quick.premium, true); assert.equal(quick.phase, 'running');
  assert.equal(tryIt(494.5).reason, 'miss', '右へ寄せるのが遅いと、外れる');
  assert.equal(driveLevel(L5, { until: 560 }).premium, false, 'ふつうに右へ寄せるだけでは取れない');
});

// ---- 8-6 山岳トロッコ ----
test('8-6: 雪のカーブはブレーキが要る。天空の鉄橋は、風上へ傾けないと脱線。トンネルの先の谷は跳ぶ', () => {
  const t = trackOf(L6);
  assert.equal(t.tunnels().length, 2);
  assert.ok(t.snowAt(800) > 0.9 && t.snowAt(1100) < 0.1, '雪は峠のまわりだけ');
  const noBrake = driveLevel(L6, { brake: false });
  assert.equal(noBrake.reason, 'derail'); assert.ok(noBrake.s > 860 && noBrake.s < 935, `雪のカーブで s=${noBrake.s.toFixed(0)}`);
  const noLean = driveLevel(L6, { from: 985, until: 1270, lean: false });
  assert.equal(noLean.reason, 'derail', '横風で脱線');
  const noJump = driveLevel(L6, { jump: false, from: 440, until: 560 });
  assert.equal(noJump.reason, 'fall'); assert.ok(noJump.s > 500 && noJump.s < 530);
});

test('8-6: プレミアムは、天空の鉄橋の風下がわ。取る直前だけ風下へ傾ける(長く傾けると脱線)', () => {
  const tryIt = (from: number) => driveLevel(L6, { until: 1300, extra: (run, inp) => { if (run.s > from && run.s < 1247) { inp.right = true; inp.left = false; } } });
  const quick = tryIt(1236);
  assert.equal(quick.premium, true); assert.equal(quick.phase, 'running');
  assert.equal(tryIt(1200).reason, 'derail', '長く風下へ傾けると、脱線');
  assert.equal(driveLevel(L6, { until: 1300 }).premium, false);
});

// ---- 8-7 連続ジャンプ ----
test('8-7: 最後の大空は、ダッシュして台の上でジャンプしないと届かない。空中の線路は、速すぎると落ちる', () => {
  const noBoost = driveLevel(L7, { rampJump: false });
  assert.equal(noBoost.reason, 'fall'); assert.ok(noBoost.s > 1650 && noBoost.s < 1720, `大空へで s=${noBoost.s.toFixed(0)}`);
  const noDash = driveLevel(L7, { dash: false });
  assert.equal(noDash.reason, 'fall'); assert.ok(noDash.s > 1650 && noDash.s < 1720);
  const r = driveLevel(L7);
  assert.equal(r.ramps, 4); assert.ok(r.jumps >= 12, `ジャンプ ${r.jumps} 回`);
  // 空中の線路へ、ダッシュで速いまま入ると、次の切れ目に落ちる
  const tooFast = driveLevel(L7, { until: 540, brake: false, extra: (run, inp) => { if (run.s > 380 && run.s < 385) inp.dash = true; } });
  assert.equal(tooFast.reason, 'fall'); assert.ok(tooFast.s > 445 && tooFast.s < 500, `次の切れ目で s=${tooFast.s.toFixed(0)}`);
  assert.equal(driveLevel(L7, { until: 540 }).phase, 'running');
});

test('8-7: プレミアムは、森のジャンプ台で台の上でジャンプしたときだけ(乗るだけでは届かない)', () => {
  const tryIt = (jumpAt: number) => driveLevel(L7, { until: 700, rampJump: false, extra: (run, inp) => { if (jumpAt && run.s > jumpAt && run.s < jumpAt + 0.6) inp.jump = true; } });
  assert.equal(tryIt(564.3).premium, true);
  assert.equal(tryIt(566.5).premium, true, '台を離れてすぐでも、まにあう');
  assert.equal(tryIt(0).premium, false, '乗るだけ');
  assert.equal(tryIt(569).premium, false, 'おそい');
});
