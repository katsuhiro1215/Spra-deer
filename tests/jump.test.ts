// WORLD 5「鹿の背中で ぴょんぴょん」のしくみ
import test from 'node:test';
import assert from 'node:assert/strict';
import { JBAL, JumpRun, buildCourse, wrapDx } from '../src/jump/sim.ts';
import { JUMP_LEVELS, jumpById } from '../src/jump/levels.ts';
import { driveJump } from './jumpbot.ts';

const L1 = jumpById('5-1')!;
const apex = (JBAL.jump * JBAL.jump) / (2 * JBAL.gravity);

test('足場の すき間は、ふつうの跳ねで 届く(てっぺんの 85%まで)', () => {
  for (const lv of JUMP_LEVELS) {
    const { pads } = buildCourse(lv);
    const ys = pads.map(p => p.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] <= apex * 0.85, `${lv.id} y=${ys[i]} gap=${(ys[i] - ys[i - 1]).toFixed(2)}`);
    assert.equal(Math.max(...ys), lv.goal);
  }
});

test('同じ面なら、いつも 同じ並び', () => {
  assert.deepEqual(buildCourse(L1).pads.map(p => [p.x, p.y]), buildCourse(L1).pads.map(p => [p.x, p.y]));
});

test('5-1: はじめは 寝ころぶ鹿だけ、あとから 歩く鹿・おじぎ鹿', () => {
  const { pads } = buildCourse(L1);
  assert.ok(pads.filter(p => p.y < 30 && p.kind !== 'ground').every(p => p.kind === 'lie'));
  assert.ok(pads.some(p => p.kind === 'walk' && p.y < 70));
  assert.ok(!pads.some(p => p.kind === 'bow' && p.y < 70));
  assert.ok(pads.some(p => p.kind === 'bow'));
});

test('左右は つながっている', () => {
  const r = new JumpRun(L1); r.start();
  r.x = JBAL.width - 0.05; r.vx = JBAL.runMax;
  r.step(1 / 60, { left: false, right: true });
  assert.ok(r.x < 1);
  assert.ok(Math.abs(wrapDx(8.9, 0.1)) < 0.3);
});

test('鹿に乗ると 跳ねる。おじぎ中の鹿だと 大ジャンプ', () => {
  const r = new JumpRun(L1); r.start();
  const pad = r.pads.find(p => p.kind === 'bow')!;
  // おじぎしていない時に 上から落ちる
  r.t = (JBAL.bowCycle - pad.phase + 0.2) % JBAL.bowCycle; r.x = pad.x; r.y = pad.y + 0.05; r.vy = -6;
  assert.equal(r.bowing(pad), false);
  r.step(1 / 60, { left: false, right: false });
  assert.equal(r.vy, JBAL.jump);
  // おじぎ中
  r.t = (JBAL.bowCycle - pad.phase + JBAL.bowCycle - 0.3) % JBAL.bowCycle; r.x = pad.x; r.y = pad.y + 0.05; r.vy = -6;
  assert.equal(r.bowing(pad), true);
  r.step(1 / 60, { left: false, right: false });
  assert.equal(r.vy, JBAL.superJump);
  assert.equal(r.supers, 1);
});

test('画面の下へ落ちると ハートが へる。3回で 失敗', () => {
  const r = new JumpRun(L1); r.start();
  r.camY = 20; r.y = 21; r.vy = -20;
  for (let i = 0; i < 30 && r.lives === 3; i++) r.step(1 / 60, { left: false, right: false });
  assert.equal(r.lives, 2);
  assert.ok(r.y > r.camY && r.vy > 0, 'ふわりと 持ち上げる');
  r.lives = 1; r.y = r.camY - 1; r.vy = -5;
  r.step(1 / 60, { left: false, right: false });
  assert.equal(r.phase, 'failed');
});

test('ボット: ねらえば ゴールまで のぼれる。何もしないと のぼれない', () => {
  for (const lv of JUMP_LEVELS) {
    const ok = driveJump(lv);
    assert.equal(ok.phase, 'cleared', `${lv.id} maxY=${ok.maxY.toFixed(1)} lives=${ok.lives}`);
    const idle = driveJump(lv, { idle: true });
    assert.notEqual(idle.phase, 'cleared');
  }
});

test('ゴールで クリア。★は 残りのハート', () => {
  const r = driveJump(L1);
  assert.equal(r.phase, 'cleared');
  assert.ok(r.stars >= 1 && r.stars <= 3);
  assert.ok(r.silver > 0);
});
