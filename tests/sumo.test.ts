// WORLD 6「鹿ずもう」の勝負のしくみ
import test from 'node:test';
import assert from 'node:assert/strict';
import { Bout, RULES, FEINT_AT } from '../src/sumo/sim.ts';
import { SUMO_LEVELS, sumoById } from '../src/sumo/levels.ts';
import { driveSumo } from './sumobot.ts';

const L1 = sumoById('6-1')!, L2 = sumoById('6-2')!, L4 = sumoById('6-4')!, L6 = sumoById('6-6')!, L7 = sumoById('6-7')!, L9 = sumoById('6-9')!;
const playing = (lv = L1) => { const b = new Bout(lv); b.start(); b.update(3.01); assert.equal(b.phase, 'playing'); return b; };
const until = (b: Bout, f: () => boolean, max = 600) => { for (let i = 0; i < max && !f(); i++) b.update(1 / 60); };

test('面は 6-1〜6-10', () => {
  assert.deepEqual(SUMO_LEVELS.map(l => l.id), Array.from({ length: 10 }, (_, i) => `6-${i + 1}`));
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

test('息切れ: スタミナを使い切ると、しばらく押せない', () => {
  const b = playing();
  b.stamina = 10;
  assert.equal(b.push(), true);
  assert.equal(b.stamina, 0);
  assert.ok(b.gassed > 0);
  b.update(0.3);
  assert.equal(b.push(), false);
  b.update(RULES.gassed);
  assert.equal(b.push(), true);
});

test('6-4 フェイント: ためるふりは「今！」が出ずに やめ、すぐ押してくる', () => {
  const b = playing(L4);
  let saw = false, now = false;
  for (let i = 0; i < 60 * 30 && !saw; i++) {
    b.update(1 / 60);
    b.position = 0; b.velocity = 0; // 押し出されないように(フェイントが出るまで見る)
    if (b.feint && b.dodgeNow) now = true;
    if (b.drain().some(e => e.kind === 'feint')) saw = true;
  }
  assert.ok(saw, 'フェイントが出る');
  assert.equal(now, false, 'ふりのときは「今！」が出ない');
  assert.equal(b.enemyState, 'rest');
  assert.ok(b.enemyTimer < 0.5, 'すぐ押してくる');
  assert.ok(FEINT_AT < 1 - RULES.nowAt / L4.opponents[0].windup, 'ふりは「今！」より前にやめる');
});

test('6-4 は、ためが見えてすぐ いなすと 負ける(「今！」を待てば 勝てる)', () => {
  assert.equal(driveSumo(L4, { evade: 'panic' }).phase, 'lost');
  assert.equal(driveSumo(L4, { evade: 'now' }).phase, 'won');
});

test('6-6 雨: すべるので、同じ押しでも 遠くまで動く', () => {
  const dry = playing(L1), wet = playing(L6);
  dry.velocity = wet.velocity = 1;
  for (let i = 0; i < 60; i++) { dry.update(1 / 60); wet.update(1 / 60); }
  assert.ok(wet.position > dry.position * 1.2);
});

test('6-7 大きな鹿: 重くて、同じ押しでも 動きにくい', () => {
  const a = playing(L1), b = playing(L7);
  a.beginCharge(); a.update(1.1); a.releaseCharge();
  b.beginCharge(); b.update(1.1); b.releaseCharge();
  assert.ok(b.velocity < a.velocity / 1.3);
});

test('6-9 勝ち抜き: 勝つと 次の相手。スタミナは引きつぐ', () => {
  const b = playing(L9);
  b.stamina = 40;
  b.position = RULES.edge - 0.01; b.velocity = 1;
  b.update(1 / 60);
  assert.equal(b.phase, 'countdown');
  assert.equal(b.round, 1);
  assert.equal(b.opp.name, L9.opponents[1].name);
  assert.equal(b.position, 0);
  assert.ok(b.stamina > 40 && b.stamina < 100, 'スタミナは 少しだけ回復');
  assert.ok(b.drain().some(e => e.kind === 'round'));
  const full = driveSumo(L9, { charge: true });
  assert.equal(full.phase, 'won');
  assert.equal(full.round, 2, '3頭目まで 勝つ');
});

test('手ごたえ: 人らしいボット(3回に1回 緑をはずす・「今！」に 0.12秒おくれる)+ため押しで、どの面も 勝てる', () => {
  for (const lv of SUMO_LEVELS) {
    const b = driveSumo(lv, { missEvery: 3, late: 0.12, charge: true });
    assert.equal(b.phase, 'won', lv.id);
  }
});

test('手ごたえ: あとの面ほど、勝つのに時間がかかる(6-1 より 6-10)', () => {
  const t = (id: string) => driveSumo(sumoById(id)!, { missEvery: 3, late: 0.12, charge: true }).totalTime;
  assert.ok(t('6-10') > t('6-1') * 2);
});
