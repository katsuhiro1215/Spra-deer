import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_LENGTH, PLAY_HALF, buildCourse, obstacleState, HIT_RADIUS, type Course, type Obstacle } from '../src/runner/course.ts';
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
    assert.ok(c.coins.length >= 150, `${l.id}: コイン ${c.coins.length}`);
    assert.ok(c.obstacles.filter((o) => o.kind === 'hole').length >= 3, l.id);
    assert.ok(c.obstacles.every((o) => o.s < l.length - 40), `${l.id}: ゴール直前に障害物がある`);
  }
  assert.ok(courseOf(runnerById('3-3')!).obstacles.some((o) => o.kind === 'puddle'), '雨の面にはみずたまり');
  assert.ok(courseOf(runnerById('3-4')!).obstacles.some((o) => o.kind === 'ice'), '雪の面にはこおり');
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
  assert.ok(runnerById('3-3')!.rules.steerAccel < day);
  assert.ok(runnerById('3-4')!.rules.steerAccel < runnerById('3-3')!.rules.steerAccel);
});

test('コインは同じものを2回取れない', () => {
  const r = new Run({ obstacles: [], coins: [{ id: 0, s: 3, x: 0, y: 0.75 }], length: COURSE_LENGTH });
  r.start();
  for (let i = 0; i < 400; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.coins, 1);
});
