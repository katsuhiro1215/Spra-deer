// WORLD 6「鹿ずもう」の勝負のしくみ
import test from 'node:test';
import assert from 'node:assert/strict';
import { Bout, RULES } from '../src/sumo/sim.ts';
import { SUMO_LEVELS, sumoById } from '../src/sumo/levels.ts';
import { driveSumo } from './sumobot.ts';

const L1 = sumoById('6-1')!, L2 = sumoById('6-2')!;
const playing = (lv = L1) => { const b = new Bout(lv); b.start(); b.update(3.01); assert.equal(b.phase, 'playing'); return b; };
const until = (b: Bout, f: () => boolean, max = 600) => { for (let i = 0; i < max && !f(); i++) b.update(1 / 60); };

test('面は 6-1(立体の鹿)と 6-2(絵の鹿)', () => {
  assert.deepEqual(SUMO_LEVELS.map(l => [l.id, l.art]), [['6-1', '3d'], ['6-2', 'image']]);
});

test('カウントダウンの間は 押せず、3秒で はっけよい', () => {
  const b = new Bout(L1); b.start();
  assert.equal(b.push(), false);
  b.update(2.9); assert.equal(b.phase, 'countdown');
  b.update(0.2); assert.equal(b.phase, 'playing');
  assert.equal(b.drain().at(-1)?.kind, 'start');
});

test('緑のタイミングで押すと、強くて スタミナも 少なくてすむ', () => {
  const a = playing(), c = playing();
  until(a, () => a.onBeat); a.push();
  until(c, () => !c.onBeat); c.push();
  assert.ok(a.velocity > c.velocity * 2.5);
  assert.ok(a.stamina > c.stamina);
});

test('連打は 0.25秒あけないと きかない', () => {
  const b = playing();
  assert.equal(b.push(), true);
  assert.equal(b.push(), false);
  b.update(0.26);
  assert.equal(b.push(), true);
});

test('ため押し: 金色(1.0〜1.35秒)で はなすと 会心', () => {
  const a = playing(), c = playing();
  a.beginCharge(); a.update(1.1); a.releaseCharge();
  c.beginCharge(); c.update(0.5); c.releaseCharge();
  assert.ok(a.velocity > c.velocity * 1.5);
  assert.equal(a.perfects, 1);
});

test('6-1 の相手は ためない。6-2 は3回に1回 ためる', () => {
  const a = playing(L1); until(a, () => a.enemyAttacks >= 6, 6000);
  assert.ok(!a.drain().some(e => e.kind === 'windup'));
  const b = playing(L2); until(b, () => b.enemyState === 'windup', 6000);
  assert.equal(b.enemyAttacks, 3);
});

test('「今！」で いなすと、相手がよろけて 切り返しのチャンス', () => {
  const b = playing(L2);
  until(b, () => b.dodgeNow, 6000);
  assert.equal(b.evade(), true);
  until(b, () => b.enemyState !== 'windup');
  assert.equal(b.enemyState, 'stumble');
  assert.ok(b.vulnerable > 0);
  // 切り返しは、同じタイミングの ふつうの押しより強い
  const c = playing(L2); c.time = b.time; c.velocity = b.velocity;
  const v = b.velocity; b.push(); c.push();
  assert.ok(b.velocity - v > (c.velocity - v) * 1.5, '切り返しは強い');
  assert.equal(b.counters, 1);
});

test('いなさないと、強い角押しで 大きく押される', () => {
  const b = playing(L2);
  until(b, () => b.enemyState === 'windup', 6000);
  until(b, () => b.enemyState !== 'windup');
  assert.ok(b.velocity < -1.5);
});

test('何もしないと 押し出されて負け', () => {
  for (const lv of SUMO_LEVELS) {
    const b = driveSumo(lv, { push: 'none', evade: false });
    assert.equal(b.phase, 'lost', lv.id);
  }
});

test('緑のタイミングで押せば、どの面も 勝てる(★2以上)', () => {
  for (const lv of SUMO_LEVELS) {
    const b = driveSumo(lv, { push: 'beat' });
    assert.equal(b.phase, 'won', lv.id);
    assert.ok(b.stars >= 2, `${lv.id} stars ${b.stars} t=${b.time.toFixed(1)}`);
  }
});

test('6-2 は、いなさないと 勝ちにくい(いなすと 早く勝てる)', () => {
  const no = driveSumo(L2, { push: 'beat', evade: false }), yes = driveSumo(L2, { push: 'beat', evade: true });
  assert.equal(yes.phase, 'won');
  assert.ok(no.phase !== 'won' || no.time > yes.time + 3, `no=${no.phase} ${no.time.toFixed(1)} yes=${yes.time.toFixed(1)}`);
});

test('連打だけでは 息切れして 勝ちにくい', () => {
  const mash = driveSumo(L1, { push: 'mash' }), beat = driveSumo(L1, { push: 'beat' });
  assert.ok(mash.phase !== 'won' || mash.time > beat.time, `mash=${mash.phase} ${mash.time.toFixed(1)} beat=${beat.time.toFixed(1)}`);
});

test('★とコイン: 負けは 0、勝ちは 15枚から', () => {
  const lose = driveSumo(L1, { push: 'none', evade: false });
  assert.equal(lose.stars, 0); assert.equal(lose.silver, 0);
  const win = driveSumo(L1);
  assert.ok(win.silver >= 15);
  assert.ok(RULES.edge > 2);
});
