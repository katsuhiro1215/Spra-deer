// WORLD 1 の新しいしかけ(設計書 28章): 植え込み・池・飛び石・はすの葉・コイン
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, type Input } from '../src/game/world.ts';
import { RULES } from '../src/game/stage.ts';
import { LEVEL_1_1, LEVEL_1_6_POND, type LevelDefinition } from '../src/game/levels.ts';

/** 何もない面(1-1 の形だけ借りる)に、しかけを足す */
const blank = (extra: Partial<LevelDefinition>): LevelDefinition => ({
  ...LEVEL_1_1, poops: [], deers: [], traps: [], walls: [], sliders: [], chasers: [], rain: [], ...extra,
});
const run = (level: LevelDefinition, input: Input, sec: number, from?: { x: number; y: number }) => {
  const w = createWorld(level);
  if (from) Object.assign(w.player, from);
  for (let i = 0; i < sec / RULES.step && w.outcome === 'playing'; i++) step(w, input);
  return w;
};

test('植え込み: 通り抜けられない(横へはすべって動ける)', () => {
  const level = blank({ hedges: [{ x: 100, y: 3000, w: 520, h: 60 }] });
  const up = run(level, { x: 0, y: -1 }, 3, { x: 360, y: 3200 });
  assert.ok(up.player.y > 3060, `植え込みの手前で止まる y=${up.player.y.toFixed(0)}`);
  const slide = run(level, { x: 1, y: -1 }, 1.5, { x: 300, y: 3200 });
  assert.ok(slide.player.x > 400, '斜めに押すと、横へすべる');
  const jump = run(level, { x: 0, y: -1, jump: true }, 3, { x: 360, y: 3200 });
  assert.ok(jump.player.y > 3060, '跳んでも越えられない');
});

const pondLevel = (stones: LevelDefinition['stones']) => blank({ ponds: [{ x: 130, y: 2800, w: 460, h: 300 }], stones });

test('池: 着地していると落ちる。跳んでいる間は大丈夫', () => {
  const walk = run(pondLevel([]), { x: 0, y: -1 }, 2, { x: 360, y: 3150 });
  assert.equal(walk.outcome, 'water');
  // 跳んで、池の上で着地すると落ちる
  const jump = run(pondLevel([]), { x: 0, y: -1, jump: true }, 2, { x: 360, y: 3150 });
  assert.equal(jump.outcome, 'water');
});

test('飛び石: 乗っていれば落ちない。沈む石は、立ち止まると沈む', () => {
  const safe = run(pondLevel([{ id: 's', x: 360, y: 2950, r: 36 }]), { x: 0, y: 0 }, 3, { x: 360, y: 2950 });
  assert.equal(safe.outcome, 'playing');
  const sink = run(pondLevel([{ id: 's', x: 360, y: 2950, r: 36, sink: .8 }]), { x: 0, y: 0 }, 2, { x: 360, y: 2950 });
  assert.equal(sink.outcome, 'water', '0.8秒で沈んで落ちる');
});

test('はすの葉: 乗っていると、いっしょに運ばれる', () => {
  const w = run(pondLevel([{ id: 'l', x: 360, y: 2950, r: 40, lily: true, move: { dx: 60, period: 4 } }]), { x: 0, y: 0 }, 1, { x: 360, y: 2950 });
  assert.equal(w.outcome, 'playing');
  assert.ok(w.player.x > 400, `右へ運ばれた x=${w.player.x.toFixed(0)}`);
});

test('コイン: 歩いて取れる。高い所のコインは、跳ばないと取れない。種類ごとに数える', () => {
  const level = blank({ coins: [{ x: 360, y: 3300 }, { x: 360, y: 3200, kind: 'gold' }, { x: 360, y: 3100, kind: 'premium', air: true }] });
  const walk = run(level, { x: 0, y: -1 }, 1.6);
  assert.equal(walk.silver, 1);
  assert.equal(walk.gold, 1);
  assert.equal(walk.premium, false, '歩いただけでは、高い所のコインは取れない');
  // 高い所のコインの手前で跳ぶ
  const w = createWorld(level);
  for (let i = 0; i < 2 / RULES.step; i++) step(w, { x: 0, y: -1, jump: w.player.y < 3230 && w.player.y > 3215 });
  assert.equal(w.premium, true, '跳べば取れる');
});

test('新1-6: 池・植え込み・コイン・プレミアムが入っている', () => {
  assert.ok(LEVEL_1_6_POND.ponds?.length && LEVEL_1_6_POND.hedges?.length && LEVEL_1_6_POND.stones?.length);
  assert.equal(LEVEL_1_6_POND.coins!.filter(c => c.kind === 'premium').length, 1);
  assert.ok(LEVEL_1_6_POND.hints.water);
});
