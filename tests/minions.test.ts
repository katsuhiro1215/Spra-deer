// ラムガの子分の攻撃(爆弾・こうもり)
import test from 'node:test';
import assert from 'node:assert/strict';
import { HIT_RADIUS, OBSTACLE_HEIGHT, type Course, type Obstacle } from '../src/runner/course.ts';
import { Run, type Input } from '../src/runner/sim.ts';
import { RUNNER_LEVELS, courseOf } from '../src/runner/levels.ts';

const DT = 1 / 120;
const rules = { speed0: 15, speed1: 15, steerAccel: 42, steerSpeed: 6.8 };
const ob = (o: Partial<Obstacle> & Pick<Obstacle, 'kind' | 's'>): Obstacle => ({ id: 0, x: 0, len: 0, halfW: 0, height: OBSTACLE_HEIGHT[o.kind], amp: 0, freq: 0, phase: 0, ...o });

function play(course: Course, drive: (r: Run) => Input, untilS: number): Run {
  const r = new Run(course);
  r.start();
  for (let i = 0; i < 120 * 20 && r.s < untilS; i++) r.step(DT, drive(r));
  return r;
}
const idle = (): Input => ({ left: false, right: false, jump: false });

const bombCourse = (): Course => ({
  obstacles: [ob({ kind: 'bomb', s: 60, x: 5.2, freq: 1.3, trig: 15 * 1.4, radius: HIT_RADIUS.bomb })], coins: [], length: 1000, rules,
});

test('爆弾: 投げた瞬間の鹿の位置をねらう。動かないと当たる', () => {
  const r = play(bombCourse(), (run) => ({ left: false, right: run.s < 30, jump: false }), 70);
  // s<30 で右へ動いていた → ねらいは、そのときの位置(右寄り)
  assert.ok(r.aim.get(0)! > 1, `ねらい ${r.aim.get(0)}`);
  assert.equal(r.lives, 2, '同じ所にいたので当たる');
});

test('爆弾: 赤い輪の外へよければ当たらない。跳んでもよけられない', () => {
  const away = play(bombCourse(), (run) => ({ left: run.aim.has(0), right: false, jump: false }), 70);
  assert.equal(away.lives, 3, '輪の外へ出た');
  const jumper = play(bombCourse(), (run) => ({ left: false, right: false, jump: run.s > 56 && run.s < 57 }), 70);
  assert.equal(jumper.lives, 2, '跳んでも当たる');
});

const batCourse = (): Course => ({
  obstacles: [ob({ kind: 'bat', s: 60, x: 0, freq: 1.15, trig: 15 * 1.2 + 1, radius: HIT_RADIUS.bat })], coins: [], length: 1000, rules,
});

test('こうもり: 動かないと当たる。横へよけるか、跳べば当たらない', () => {
  assert.equal(play(batCourse(), idle, 70).lives, 2, 'そのままだと当たる');
  assert.equal(play(batCourse(), (run) => ({ left: run.aim.has(0), right: false, jump: false }), 70).lives, 3, '横へよけた');
  assert.equal(play(batCourse(), (run) => ({ left: false, right: false, jump: run.s > 54 && run.s < 55 }), 70).lives, 3, "跳んでかわした(すれちがう0.3秒ほど前に跳ぶ)");
});

test('ラムガの子分が出る面: 3-3・3-7〜3-10', () => {
  const has = (id: string, k: Obstacle['kind']) => courseOf(RUNNER_LEVELS.find((l) => l.id === id)!).obstacles.some((o) => o.kind === k);
  assert.ok(has('3-3', 'bat') && has('3-8', 'bat') && has('3-10', 'bat'));
  assert.ok(has('3-7', 'bomb') && has('3-9', 'bomb') && has('3-10', 'bomb'));
  for (const id of ['3-1', '3-2', '3-4', '3-5', '3-6']) assert.ok(!has(id, 'bomb') && !has(id, 'bat'), `${id}には出ない`);
});
