import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_LENGTH, PLAY_HALF, buildCourse, hillY, obstacleState, roadCurv, roadGrade, roadHeading, roadX, roadY, HIT_RADIUS, type Course, type Obstacle } from '../src/runner/course.ts';
import { Run, PLAYER_RADIUS, type Input } from '../src/runner/sim.ts';
import { RUNNER_LEVELS, courseOf, runnerById } from '../src/runner/levels.ts';

const DT = 1 / 120;
const AIR = 0.656; // ジャンプの滞空時間(秒)

/** ジャンプとよけだけで進む簡単なボット(穴・柵・岩・鹿・水たまり・氷は跳び、ふんは避ける)。 */
function bot(r: Run): Input {
  const v = r.speed;
  let left = false;
  let right = false;
  let jump = false;
  for (const o of r.course.obstacles) {
    if (o.kind === 'critter') {
      // 動物・モンスター: ぶつかる頃の位置を予想して、ちょうどよい時に跳ぶ(突進は、近づく分も見込む)
      const st = r.stateOf(o);
      const dd = st.s - r.s;
      if (dd < -1 || dd > 25) continue;
      const closing = o.behavior === 'charge' && r.chargeT.has(o.id) ? o.freq : 0;
      const ta = dd / (v + closing);
      const at = obstacleState(o, r.t + ta, r.chargeT.get(o.id));
      if (o.behavior === 'hop' && at.y > 0.5) continue; // その頃は、跳んで浮いている
      if (Math.abs(at.x - r.x) < (o.radius ?? 0.8) + 1.0 && ta > 0.26 && ta < 0.36) jump = true;
      continue;
    }
    const d = o.s - r.s;
    if (d < -1 || d > 18) continue;
    if (o.kind === 'hole') {
      const air = v * AIR;
      const takeoff = Math.max(0, (air - o.len) / 2);
      if (d <= takeoff + 0.25 && d > takeoff - 0.8 && !r.airborne) jump = true;
    } else if (o.kind === 'fence') {
      if (Math.abs(r.x - o.x) < o.halfW + 0.8 && d < v * 0.3 && d > v * 0.1) jump = true;
    } else if (o.kind === 'stone' || o.kind === 'deer') {
      const t = d / v;
      const ox = obstacleState(o, r.t + t).x;
      if (Math.abs(ox - r.x) < 1.9 && t < 0.3 && t > 0.1) jump = true;
    } else if (o.kind === 'puddle' || o.kind === 'ice') {
      if (Math.abs(o.x - r.x) < HIT_RADIUS[o.kind] + 0.9 && d < v * 0.35 && d > v * 0.1) jump = true;
    } else if (o.kind === 'poop' && d > 0 && d < 9) {
      if (Math.abs(o.x - r.x) < HIT_RADIUS.poop + PLAYER_RADIUS + 0.5) {
        if (o.x - r.x > 0) left = true;
        else right = true;
        if (r.x <= -PLAY_HALF + 0.1) { left = false; right = true; }
        if (r.x >= PLAY_HALF - 0.1) { right = false; left = true; }
      }
    }
  }
  // 何もよける必要がなければ、道の中央へもどる(カーブで外へ押されるので)
  if (!left && !right && Math.abs(r.x) > 0.5) {
    left = r.x > 0;
    right = r.x < 0;
  }
  return { left, right, jump };
}

function play(course: Course, drive: (r: Run) => Input, maxSec = 300): Run {
  const r = new Run(course);
  r.start();
  for (let i = 0; i < maxSec / DT && r.phase === 'running'; i++) r.step(DT, drive(r));
  return r;
}

test('コースは毎回同じ', () => {
  assert.deepEqual(buildCourse(), buildCourse());
  for (const l of RUNNER_LEVELS) assert.deepEqual(courseOf(l), courseOf(l));
});

test('面の設定が正しい: 番号が重ならず、3-10が最長で最終面', () => {
  const ids = RUNNER_LEVELS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(runnerById('3-10'));
  const longest = Math.max(...RUNNER_LEVELS.map((l) => l.length));
  assert.equal(runnerById('3-10')!.length, longest);
  for (const l of RUNNER_LEVELS) {
    assert.ok(l.rules.speed1 >= l.rules.speed0 && l.rules.steerAccel > 0, l.id);
    assert.ok(l.title && l.summary && l.intro && l.goalName, l.id);
  }
});

test('どの面も: 障害物は前から順で、穴は跳べる長さ、コインが十分ある', () => {
  for (const l of RUNNER_LEVELS) {
    const c = courseOf(l);
    for (let i = 1; i < c.obstacles.length; i++) assert.ok(c.obstacles[i].s >= c.obstacles[i - 1].s, l.id);
    for (const o of c.obstacles.filter((x: Obstacle) => x.kind === 'hole')) assert.ok(o.len <= 6.6, `${l.id}: 穴が長すぎる ${o.len}`);
    assert.ok(c.coins.length >= 120, `${l.id}: コイン ${c.coins.length}`);
    assert.ok(c.obstacles.filter((o) => o.kind === 'hole').length >= 1, l.id);
    assert.ok(c.obstacles.every((o) => o.s < l.length - 40), `${l.id}: ゴール直前に障害物がある`);
  }
  assert.ok(courseOf(runnerById('3-5')!).obstacles.some((o) => o.kind === 'puddle'), '雨の面にはみずたまり');
  assert.ok(courseOf(runnerById('3-6')!).obstacles.some((o) => o.kind === 'ice'), '雪の面にはこおり');
});

test('動物・モンスターの罠が、面ごとに4つの動きで出る', () => {
  for (const id of ['3-2', '3-3', '3-5', '3-6']) {
    const l = runnerById(id)!;
    const crit = courseOf(l).obstacles.filter((o) => o.kind === 'critter');
    const behaviors = new Set(crit.map((o) => o.behavior));
    for (const b of ['sleep', 'cross', 'hop', 'charge']) assert.ok(behaviors.has(b as 'sleep'), `${id}: ${b} が無い`);
    assert.ok(crit.every((o) => l.critters!.includes(o.critter!)), `${id}: 設定外のキャラ`);
    assert.ok(crit.length >= 8, `${id}: 動物の罠が少ない ${crit.length}`);
  }
  assert.ok(!courseOf(runnerById('3-1')!).obstacles.some((o) => o.kind === 'critter'), '3-1は今までどおり');
});

const critterCourse = (behavior: 'sleep' | 'hop' | 'charge', effect: 'damage' | 'slip' | 'slow' | 'ice' = 'damage'): Course => ({
  obstacles: [{ id: 0, kind: 'critter', critter: 'fox', behavior, effect, radius: 0.8, trig: 38, s: behavior === 'charge' ? 45 : 8, x: 0, len: 0, halfW: 0, height: 1.0, amp: 0, freq: behavior === 'charge' ? 9 : 0.7, phase: 0 }],
  coins: [], length: COURSE_LENGTH,
});

test('寝ている動物にぶつかると効果が出る(効果ごとに違う)', () => {
  const none = { left: false, right: false, jump: false };
  const dmg = new Run(critterCourse('sleep', 'damage'));
  dmg.start();
  for (let i = 0; i < 400 && dmg.lives === 3; i++) dmg.step(DT, none);
  assert.equal(dmg.lives, 2);
  const slip = new Run(critterCourse('sleep', 'slip'));
  slip.start();
  for (let i = 0; i < 400 && slip.slip === 0; i++) slip.step(DT, none);
  assert.ok(slip.slip > 0 && slip.lives === 3);
  const ice = new Run(critterCourse('sleep', 'ice'));
  ice.start();
  for (let i = 0; i < 400 && ice.ice === 0; i++) ice.step(DT, none);
  assert.ok(ice.ice > 0 && ice.lives === 3);
});

test('突進する動物は、近づくまで動かず、近づくと正面から走ってくる', () => {
  const r = new Run(critterCourse('charge'));
  r.start();
  const o = r.course.obstacles[0];
  r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.stateOf(o).s, 45, 'まだ動かない');
  for (let i = 0; i < 240; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.ok(r.chargeT.has(0), '近づいたので、動き出した');
  assert.ok(r.stateOf(o).s < 45 - 5, '手前へ近づいている');
  for (let i = 0; i < 600 && r.lives === 3; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.lives, 2, '立ち止まっていると、ぶつかる');
});

test('跳ねている間は下を通れる(跳ねる動物)', () => {
  const o = critterCourse('hop').obstacles[0];
  const ups = [0, 0.3, 0.5, 0.7, 1.0, 1.3, 1.4].map((t) => obstacleState(o, t).y);
  assert.ok(ups.some((y) => y > 0.5) && ups.some((y) => y < 0.5), '浮く時間と、地面にいる時間がある');
});

test('曲がる道: 出だしとゴール前はまっすぐ。3-1と3-10は、ずっとまっすぐ', () => {
  for (const l of RUNNER_LEVELS) {
    const c = courseOf(l);
    assert.ok(Math.abs(roadX(c, 0)) < 1e-9, l.id);
    assert.ok(Math.abs(roadX(c, l.length - 100)) < 0.01 && Math.abs(roadX(c, l.length)) < 0.01, `${l.id}: ゴール前がまっすぐでない`);
    if (!l.curve) {
      assert.equal(roadHeading(c, l.length / 2), 0, l.id);
      assert.equal(roadCurv(c, l.length / 2), 0, l.id);
    } else {
      const mid = Array.from({ length: 40 }, (_, i) => Math.abs(roadHeading(c, 150 + (i * (l.length - 350)) / 40)));
      assert.ok(Math.max(...mid) > 0.1, `${l.id}: カーブが小さすぎる`);
    }
  }
  assert.ok(!runnerById('3-1')!.curve && !runnerById('3-10')!.curve);
  assert.ok(runnerById('3-3')!.curve!.amp > runnerById('3-2')!.curve!.amp, '山道のほうが、きついカーブ');
});

test('カーブでは、外側へ押される(右カーブなら左へ)', () => {
  const c = courseOf(runnerById('3-3')!);
  // 曲がりが一番きつい所を探す
  let best = 0;
  for (let s = 200; s < 800; s += 1) if (Math.abs(roadCurv(c, s)) > Math.abs(roadCurv(c, best))) best = s;
  const k = roadCurv(c, best);
  assert.ok(Math.abs(k) > 0.02, `曲がりがゆるい: ${k}`);
  const r = new Run({ ...c, obstacles: [], coins: [] });
  r.start();
  r.s = best;
  const x0 = r.x;
  for (let i = 0; i < 60; i++) r.step(DT, { left: false, right: false, jump: false });
  const moved = r.x - x0;
  assert.ok(k > 0 ? moved < -0.3 : moved > 0.3, `外へ押されない: k=${k.toFixed(3)} moved=${moved.toFixed(2)}`);
  const flat = new Run(buildCourse());
  flat.start();
  for (let i = 0; i < 60; i++) flat.step(DT, { left: false, right: false, jump: false });
  assert.equal(flat.x, 0, 'まっすぐな道では、押されない');
});

test('回復薬: ハートが1つふえる(3つまで)。置いてある面だけ', () => {
  const rain = courseOf(runnerById('3-5')!);
  const potions = rain.coins.filter((c) => c.kind === 'potion');
  assert.equal(potions.length, 2, '薬師寺と唐招提寺に1つずつ');
  for (const p of potions) assert.ok(!rain.obstacles.some((o) => Math.abs(o.s - p.s) < 16 + o.len), '罠のすぐそばには置かない');
  assert.ok(!courseOf(runnerById('3-1')!).coins.some((c) => c.kind === 'potion'), '3-1には無い');
  const r = new Run({ obstacles: [], coins: [{ id: 0, s: 3, x: 0, y: 1.1, kind: 'potion' }], length: COURSE_LENGTH });
  r.start();
  r.lives = 1;
  for (let i = 0; i < 300; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.lives, 2);
  assert.equal(r.coins, 0, '回復薬は、コインに数えない');
  const full = new Run({ obstacles: [], coins: [{ id: 0, s: 3, x: 0, y: 1.1, kind: 'potion' }], length: COURSE_LENGTH });
  full.start();
  for (let i = 0; i < 300; i++) full.step(DT, { left: false, right: false, jump: false });
  assert.equal(full.lives, 3, '3つより、ふえない');
});

test('大仏の目が光ったあと(wake)は、罠の間隔がつまる', () => {
  const l = runnerById('3-2')!;
  assert.ok(l.wake && l.wake > 0.4 && l.wake < 0.8);
  const c = courseOf(l);
  const gaps = (from: number, to: number) => {
    const xs = c.obstacles.filter((o) => o.s >= from && o.s < to).map((o) => o.s);
    return xs.length / (to - from);
  };
  const before = gaps(100, l.length * l.wake!);
  const after = gaps(l.length * l.wake!, l.length - 100);
  assert.ok(after > before * 1.3, `目覚めたあとが、1.3倍以上こむ: ${before.toFixed(3)} → ${after.toFixed(3)}`);
});

test('何もしないと穴に落ちて失敗する', () => {
  const r = play(buildCourse(), () => ({ left: false, right: false, jump: false }));
  assert.equal(r.phase, 'failed');
  assert.ok(r.s < COURSE_LENGTH);
});

test('どの面も、ジャンプとよけだけのボットがゴールできる', () => {
  for (const l of RUNNER_LEVELS) {
    const r = play(courseOf(l), bot);
    assert.equal(r.phase, 'cleared', `${l.id}: s=${r.s.toFixed(0)} lives=${r.lives}`);
    assert.ok(r.lives >= 2, `${l.id}: ボットでもハートが ${3 - r.lives} 個へる`);
    assert.ok(r.coins > 10, `${l.id}: コイン ${r.coins}`);
  }
});

test('穴の上でジャンプしていれば落ちない/着地すると落ちる', () => {
  const r = new Run({ obstacles: [{ id: 0, kind: 'hole', s: 10, x: 0, len: 5, halfW: 3.6, height: 0, amp: 0, freq: 0, phase: 0 }], coins: [], length: COURSE_LENGTH });
  r.start();
  r.s = 9;
  for (let i = 0; i < 400 && r.s < 18; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.lives, 2);
});

const one = (kind: Obstacle['kind'], x = 0): Course => ({
  obstacles: [{ id: 0, kind, s: 5, x, len: 0, halfW: 0, height: 0.3, amp: 0, freq: 0, phase: 0 }], coins: [], length: COURSE_LENGTH,
});

test('ふんはスリップ(操作が逆になる)でハートは減らない', () => {
  const r = new Run(one('poop'));
  r.start();
  for (let i = 0; i < 200 && r.slip === 0; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.ok(r.slip > 0);
  assert.equal(r.lives, 3);
  const x0 = r.x;
  for (let i = 0; i < 30; i++) r.step(DT, { left: false, right: true, jump: false });
  assert.ok(r.x < x0, '右を押すと左へ動く');
});

test('みずたまりはおそくなるだけ、こおりは左右がきかなくなる(ハートは減らない)', () => {
  const p = new Run(one('puddle'));
  p.start();
  const before = p.speed;
  for (let i = 0; i < 200 && p.speedMul === 1; i++) p.step(DT, { left: false, right: false, jump: false });
  assert.ok(p.speedMul < 1 && p.speed < before + 3);
  assert.equal(p.lives, 3);

  const ice = new Run(one('ice'));
  ice.start();
  for (let i = 0; i < 200 && ice.ice === 0; i++) ice.step(DT, { left: false, right: false, jump: false });
  assert.ok(ice.ice > 0);
  assert.equal(ice.lives, 3);
  const x0 = ice.x;
  for (let i = 0; i < 60; i++) ice.step(DT, { left: false, right: true, jump: false });
  const slid = ice.x - x0;
  const normal = new Run({ obstacles: [], coins: [], length: COURSE_LENGTH });
  normal.start();
  for (let i = 0; i < 60; i++) normal.step(DT, { left: false, right: true, jump: false });
  assert.ok(slid < normal.x * 0.3, `こおりの上では曲がれない: ${slid.toFixed(2)} vs ${normal.x.toFixed(2)}`);
});

test('雨・雪の面は、左右の動きだしが鈍い', () => {
  const day = runnerById('3-1')!.rules.steerAccel;
  assert.ok(runnerById('3-5')!.rules.steerAccel < day);
  assert.ok(runnerById('3-6')!.rules.steerAccel < runnerById('3-5')!.rules.steerAccel);
});

test('坂: 出だしは高さ0、ゴールの100m手前からは平ら。3-1は平らなまま。3-3は登る', () => {
  for (const l of RUNNER_LEVELS) {
    const c = courseOf(l);
    assert.equal(roadY(c, 0), 0, l.id);
    assert.ok(Math.abs(hillY(c, l.length - 100) - hillY(c, l.length + 80)) < 1e-9, `${l.id}: ゴール前が平らでない`);
    // 急すぎない(一番急な所で 15%まで)
    for (let s = 0; s < l.length; s += 2) assert.ok(Math.abs(roadGrade(c, s)) <= 0.15, `${l.id}: s=${s} 傾き ${roadGrade(c, s).toFixed(3)}`);
  }
  const flat = courseOf(runnerById('3-1')!);
  assert.ok(!flat.hills && !flat.bumps, '3-1は今までどおり平ら');
  const up = courseOf(runnerById('3-3')!);
  assert.ok(hillY(up, 1000) >= 30, '若草山は30m以上登る');
});

test('坂: 登りはおそく、下りは速い', () => {
  const rules = { speed0: 15, speed1: 15, steerAccel: 42, steerSpeed: 6.8 };
  const mk = (h: number): Course => ({ obstacles: [], coins: [], length: 1000, rules, hills: [{ at: 0, h: 0 }, { at: 0.2, h }] });
  const at = (c: Course) => { const r = new Run(c); r.start(); r.s = 100; return r.speed; };
  assert.ok(at(mk(10)) < 15 * 0.9, `登り ${at(mk(10)).toFixed(2)}`);
  assert.ok(at(mk(-10)) > 15 * 1.1, `下り ${at(mk(-10)).toFixed(2)}`);
});

test('ジャンプ台: 何もしなくても飛び出す。台の先で跳ぶと、もっと高く飛ぶ', () => {
  const fly = (jump: boolean) => {
    const c: Course = { obstacles: [], coins: [], length: 1000, rules: { speed0: 16, speed1: 16, steerAccel: 42, steerSpeed: 6.8 }, bumps: [{ s: 50, len: 8, h: 1.3 }] };
    const r = new Run(c);
    r.start();
    r.s = 30;
    let top = 0;
    let launched = false;
    for (let i = 0; i < 300; i++) {
      r.step(DT, { left: false, right: false, jump: jump && r.s > 49 && r.s < 50 });
      for (const e of r.drainEvents()) if (e.kind === 'launch' || e.kind === 'jump') launched = true;
      top = Math.max(top, r.y);
    }
    return { top, launched, y: r.y };
  };
  const plain = fly(false);
  assert.ok(plain.launched && plain.top > 1.2, `飛び出さない: ${plain.top.toFixed(2)}`);
  assert.equal(plain.y, 0, '最後は着地している');
  const big = fly(true);
  assert.ok(big.top > plain.top + 2, `大ジャンプにならない: ${big.top.toFixed(2)}`);
});

test('ジャンプ台のある面では、空中のコインを取れる', () => {
  const l = runnerById('3-10')!;
  const c = courseOf(l);
  assert.ok((c.bumps?.length ?? 0) >= 1, '3-10にジャンプ台がある');
  const r = play(c, bot);
  const air = c.coins.filter((cn) => cn.y >= 1.9 && cn.y < 3 && c.bumps!.some((b) => cn.s > b.s && cn.s < b.s + 8));
  const got = air.filter((cn) => r.collected.has(cn.id)).length;
  assert.ok(got >= air.length * 0.5, `空中のコイン ${got}/${air.length}`);
});

test('コインは同じものを2回取れない', () => {
  const r = new Run({ obstacles: [], coins: [{ id: 0, s: 3, x: 0, y: 0.75 }], length: COURSE_LENGTH });
  r.start();
  for (let i = 0; i < 400; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.coins, 1);
});
