// WORLD 8「鹿と暴走トロッコ」: 走りのルールと、8-1 がクリアできること
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Track, type TrackDef } from '../src/cart/track.ts';
import { CartRun, BAL, type Input } from '../src/cart/sim.ts';
import { CART_LEVELS, trackOf } from '../src/cart/levels.ts';

const DT = 1 / 120;
const none = (): Input => ({ left: false, right: false, jump: false, brake: false, dash: false });
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

// ---- 8-1 を、自動で走る ----
type Policy = { brake?: boolean; lean?: boolean; jump?: boolean; dash?: boolean };
/** 先を見て操作するボット。policy で、やらない操作を決められる。 */
function drive(policy: Policy = {}) {
  const p = { brake: true, lean: true, jump: true, dash: true, ...policy };
  const track = trackOf(CART_LEVELS[0]), run = new CartRun(track);
  run.start();
  for (let i = 0; i < 200 / DT && run.phase === 'running'; i++) {
    const s = run.s, v = run.v, input = none();
    // カーブ: 2秒先までで、いちばんきつい曲がりを見て、内側へ傾け、速すぎたらブレーキ
    const curv = track.sharpestAhead(s, Math.max(30, v * 2));
    if (Math.abs(curv) > 0.004) {
      if (p.lean) { input.right = curv > 0; input.left = curv < 0; }
      const limit = Math.sqrt(((p.lean ? BAL.latBase + BAL.latLean : BAL.latBase) * 0.8) / Math.abs(curv));
      if (p.brake && v > limit) input.brake = true;
    }
    // 枝: 反対へ傾ける(カーブより優先)
    const branch = track.obstacles.find(o => o.kind === 'branch' && o.s > s && o.s - s < Math.max(14, v * 0.7));
    if (branch && p.lean) { input.left = branch.side === 1; input.right = branch.side === -1; }
    // 切れ目: ふちの少し手前で跳ぶ。速さが足りなければ、手前でダッシュ
    const gap = track.gaps.find(g => g.to > s);
    if (gap) {
      const need = (gap.to - gap.from) + 5;
      if (p.dash && gap.from - s < 70 && gap.from - s > 12 && v < need) input.dash = true;
      if (p.jump && !run.air && gap.from - s < Math.max(1.5, v * 0.06) && gap.from - s > -1) input.jump = true;
    }
    // 岩・倒木: 手前で跳ぶ
    const rock = track.obstacles.find(o => o.kind !== 'branch' && o.s > s && o.s - s < v * 0.4);
    if (rock && p.jump && !run.air) input.jump = true;
    run.step(DT, input);
  }
  return run;
}

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
