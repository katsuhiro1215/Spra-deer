// WORLD 5「鹿の背中で ぴょんぴょん」のしくみ
import test from 'node:test';
import assert from 'node:assert/strict';
import { JBAL, JumpRun, buildCourse, wrapDx, type Pad } from '../src/jump/sim.ts';
import { JUMP_LEVELS, jumpById } from '../src/jump/levels.ts';
import { driveJump } from './jumpbot.ts';

const L1 = jumpById('5-1')!, L2 = jumpById('5-2')!, L3 = jumpById('5-3')!, L4 = jumpById('5-4')!, L5 = jumpById('5-5')!, L6 = jumpById('5-6')!;
const apex = (JBAL.jump * JBAL.jump) / (2 * JBAL.gravity);

test('足場の すき間は、ふつうの跳ねで 届く(てっぺんの 85%まで)', () => {
  for (const lv of JUMP_LEVELS) {
    const { pads } = buildCourse(lv);
    // はねる子鹿は、いちばん 高く 上がったときで 数える
    const top = (p: (typeof pads)[number]) => p.baseY + (p.kind === 'hop' ? JBAL.hopAmp : 0);
    const sorted = [...pads].sort((a, b) => a.baseY - b.baseY);
    for (let i = 1; i < sorted.length; i++) {
      const gap = top(sorted[i]) - sorted[i - 1].baseY;
      assert.ok(gap <= apex * 0.85, `${lv.id} y=${sorted[i].baseY.toFixed(1)} gap=${gap.toFixed(2)}`);
    }
    const ys = pads.map(p => p.y);
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

test('面は 5-1〜5-10。あとの面ほど 高い', () => {
  assert.deepEqual(JUMP_LEVELS.map(l => l.id), Array.from({ length: 10 }, (_, i) => `5-${i + 1}`));
  assert.ok(JUMP_LEVELS.at(-1)!.goal > JUMP_LEVELS[0].goal * 2);
});

/** 足場の真上から 落とす */
const dropOn = (r: JumpRun, p: Pad) => { r.x = p.x; r.y = p.y + 0.05; r.vy = -6; r.step(1 / 60, { left: false, right: false }); };

test('5-2 ねむい鹿: 1回 乗ると 行ってしまい、しばらくすると もどる', () => {
  const r = new JumpRun(L2); r.start();
  const p = r.pads.find(q => q.kind === 'sleep')!;
  dropOn(r, p);
  assert.equal(r.vy, JBAL.jump);
  assert.ok(p.goneAt >= 0);
  assert.ok(r.drain().some(e => e.kind === 'wake'));
  // 行ってしまった鹿には 乗れない
  r.lastPad = null; dropOn(r, p);
  assert.ok(r.vy < 0);
  // しばらくすると もどってくる
  for (let i = 0; i < 60 * (JBAL.sleepBack + 0.2); i++) r.step(1 / 60, { left: false, right: false });
  assert.equal(p.goneAt, -1);
});

test('5-3 せんべい: 持っていると、落ちても 鹿が受けとめて ハートが へらない', () => {
  const r = new JumpRun(L3); r.start();
  assert.ok(r.senbeiItems.length >= 4);
  r.senbei = 1; r.camY = 20; r.y = 19.5; r.vy = -10;
  r.step(1 / 60, { left: false, right: false });
  assert.equal(r.lives, 3);
  assert.equal(r.senbei, 0);
  assert.equal(r.vy, JBAL.superJump);
  assert.ok(r.drain().some(e => e.kind === 'catch'));
});

test('5-4 カラス: 当たると 下へ はじかれる(ハートは へらない)', () => {
  const r = new JumpRun(L4); r.start();
  const c = r.crows[0];
  assert.ok(c, 'カラスが いる');
  r.crows = [c]; c.speed = 0;
  r.x = c.x; r.y = c.y - JBAL.spraH / 2; r.vy = 5;
  r.step(1 / 60, { left: false, right: false });
  assert.ok(r.vy <= -JBAL.crowKnock + 0.1);
  assert.equal(r.lives, 3);
  assert.equal(r.crowHits, 1);
  // しばらくは 当たらない
  r.y = c.y - JBAL.spraH / 2; r.vy = 5; r.step(1 / 60, { left: false, right: false });
  assert.equal(r.crowHits, 1);
});

test('5-4 カラスは、足場に 着地する 高さには いない', () => {
  for (const lv of JUMP_LEVELS) {
    const { pads, crows } = buildCourse(lv);
    for (const c of crows) for (const p of pads) {
      if (Math.abs(c.y - (p.baseY + JBAL.spraH / 2)) < 0.3) assert.fail(`${lv.id} crow y=${c.y.toFixed(1)} pad y=${p.baseY.toFixed(1)}`);
    }
  }
});

test('5-5 風: 横へ 流される(20m ごとに 向きが かわる)', () => {
  const r = new JumpRun(L5); r.start();
  r.y = 40; r.x = 4.5; r.vy = 0; r.vx = 0;
  const w = r.windAt(40);
  assert.ok(Math.abs(w) > 1);
  assert.equal(Math.sign(r.windAt(60)), -Math.sign(w));
  r.step(0.1, { left: false, right: false });
  assert.ok(Math.sign(r.x - 4.5) === Math.sign(w));
  assert.equal(r.windAt(10), 0, 'はじめの区間は 風なし');
});

test('5-6 はねる子鹿: 上下に 動く', () => {
  const r = new JumpRun(L6); r.start();
  const p = r.pads.find(q => q.kind === 'hop')!;
  const ys = new Set<number>();
  for (let i = 0; i < 60; i++) { r.step(1 / 60, { left: false, right: false }); ys.add(Math.round((p.y - p.baseY) * 10)); }
  assert.ok(ys.size > 5);
  assert.ok(Math.max(...[...ys]) <= JBAL.hopAmp * 10 + 0.5);
});

test('手ごたえ: 少しずれるボット(ねらい ±0.6m・0.15秒おくれ)でも、前半の面は クリアできる', () => {
  for (const lv of JUMP_LEVELS.slice(0, 4)) {
    let ok = 0;
    for (let s = 0; s < 4; s++) if (driveJump(lv, { aim: 0.6, delay: 0.15, seed: s }).phase === 'cleared') ok++;
    assert.ok(ok >= 3, `${lv.id} ${ok}/4`);
  }
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
