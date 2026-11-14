import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_LENGTH, PLAY_HALF, buildCourse, obstacleState, HIT_RADIUS, type Obstacle } from '../src/kasuga/course.ts';
import { Run, PLAYER_RADIUS, type Input } from '../src/kasuga/sim.ts';

const DT = 1 / 120;
const AIR = 0.656; // ジャンプの滞空時間(秒)

/** ジャンプだけを使って進む簡単なボット(穴・柵・岩・鹿は跳び、ふんは避ける)。 */
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

function play(drive: (r: Run) => Input, maxSec = 200): Run {
  const r = new Run(buildCourse());
  r.start();
  for (let i = 0; i < maxSec / DT && r.phase === 'running'; i++) r.step(DT, drive(r));
  return r;
}

test('コースは毎回同じ', () => {
  assert.deepEqual(buildCourse(), buildCourse());
});

test('障害物は前から順に並び、穴の長さはジャンプで越えられる範囲', () => {
  const c = buildCourse();
  for (let i = 1; i < c.obstacles.length; i++) assert.ok(c.obstacles[i].s >= c.obstacles[i - 1].s);
  for (const o of c.obstacles.filter((x: Obstacle) => x.kind === 'hole')) {
    assert.ok(o.len <= 6.6, `穴が長すぎる: ${o.len}`);
  }
  assert.ok(c.coins.length >= 150, `コインの数: ${c.coins.length}`);
  assert.ok(c.obstacles.filter((o) => o.kind === 'hole').length >= 5);
});

test('何もしないと穴に落ちて失敗する', () => {
  const r = play(() => ({ left: false, right: false, jump: false }));
  assert.equal(r.phase, 'failed');
  assert.ok(r.s < COURSE_LENGTH);
});

test('ジャンプを使うボットはゴールできる', () => {
  const r = play(bot);
  assert.equal(r.phase, 'cleared', `s=${r.s.toFixed(0)} lives=${r.lives}`);
  assert.equal(r.lives, 3, `ボットでもハートが減る: ${r.lives}`); // 避け方どおりに動けばノーミスで行ける
  assert.ok(r.coins > 10, `コイン: ${r.coins}`); // ボットはコインを狙わないので、ぐうぜん取れた分だけ
});

test('穴の上でジャンプしていれば落ちない/着地すると落ちる', () => {
  const r = new Run({ obstacles: [{ id: 0, kind: 'hole', s: 10, x: 0, len: 5, halfW: 3.6, height: 0, amp: 0, freq: 0, phase: 0 }], coins: [], length: COURSE_LENGTH });
  r.start();
  r.s = 9;
  for (let i = 0; i < 400 && r.s < 18; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.lives, 2);
});

test('ふんはスリップ(操作が逆になる)でハートは減らない', () => {
  const course = { obstacles: [{ id: 0, kind: 'poop' as const, s: 5, x: 0, len: 0, halfW: 0, height: 0.55, amp: 0, freq: 0, phase: 0 }], coins: [], length: COURSE_LENGTH };
  const r = new Run(course);
  r.start();
  for (let i = 0; i < 200 && r.slip === 0; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.ok(r.slip > 0);
  assert.equal(r.lives, 3);
  const x0 = r.x;
  for (let i = 0; i < 30; i++) r.step(DT, { left: false, right: true, jump: false });
  assert.ok(r.x < x0, '右を押すと左へ動く');
});

test('コインは同じものを2回取れない', () => {
  const r = new Run({ obstacles: [], coins: [{ id: 0, s: 3, x: 0, y: 0.75 }], length: COURSE_LENGTH });
  r.start();
  for (let i = 0; i < 400; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.coins, 1);
});
