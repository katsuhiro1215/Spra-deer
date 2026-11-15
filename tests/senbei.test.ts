// 投げるせんべい(設計書 28章 B1): 拾う・投げる・鹿がつられる・ふさぐ鹿・追ってくる鹿
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, SENBEI, type Input, type World } from '../src/game/world.ts';
import { RULES } from '../src/game/stage.ts';
import { LEVEL_1_1, type LevelDefinition } from '../src/game/levels.ts';

const blank = (extra: Partial<LevelDefinition>): LevelDefinition => ({
  ...LEVEL_1_1, poops: [], deers: [], traps: [], walls: [], sliders: [], chasers: [], rain: [], ...extra,
});
const tick = (w: World, input: Input, sec: number) => {
  for (let i = 0; i < sec / RULES.step && w.outcome === 'playing'; i++) step(w, i === 0 ? input : { x: input.x, y: input.y });
  return w;
};

test('拾う: 歩いて通ると持てる。3枚まで', () => {
  const w = createWorld(blank({ senbei: { pickups: [3300, 3250, 3200, 3150].map(y => ({ x: 360, y })) } }));
  tick(w, { x: 0, y: -1 }, 1.5);
  assert.equal(w.held, SENBEI.max);
  assert.equal(w.pickups.filter(k => !k.taken).length, 1, '4枚目は、道に残る');
});

test('投げる: 向いている方へ飛んで、落ちる。持っていないと投げられない', () => {
  const w = createWorld(blank({ senbei: { pickups: [], start: 1 } }));
  tick(w, { x: 1, y: 0 }, .05); // 右を向く
  tick(w, { x: 0, y: 0, throw: true }, 1);
  assert.equal(w.held, 0);
  assert.equal(w.thrown.length, 1);
  assert.equal(w.thrown[0].state, 'ground');
  assert.ok(w.thrown[0].x > w.player.x + 150, `右へ飛んだ x=${w.thrown[0].x.toFixed(0)}`);
  tick(w, { x: 0, y: 0, throw: true }, 1);
  assert.equal(w.thrown.length, 1, 'もう無いので、投げられない');
});

test('投げる: 植え込みに当たると、手前に落ちる。池に落ちると、なくなる', () => {
  const hedge = createWorld(blank({ senbei: { pickups: [], start: 1 }, hedges: [{ x: 100, y: 3250, w: 520, h: 40 }] }));
  tick(hedge, { x: 0, y: 0, throw: true }, 1);
  assert.ok(hedge.thrown[0].y > 3290, `植え込みの手前 y=${hedge.thrown[0].y.toFixed(0)}`);
  const pond = createWorld(blank({ senbei: { pickups: [], start: 1 }, ponds: [{ x: 130, y: 3100, w: 460, h: 220 }] }));
  tick(pond, { x: 0, y: 0, throw: true }, 1);
  assert.equal(pond.thrown[0].state, 'lost');
});

const blocker = { id: 'b', kind: 'doe' as const, x: 360, y: 3000, mode: 'block' as const, sense: 300, speed: 200, eat: 2 };

test('ふさぐ鹿: 通れない(触れても失敗にはならない)', () => {
  const w = tick(createWorld(blank({ hungry: [blocker] })), { x: 0, y: -1 }, 3);
  assert.equal(w.outcome, 'playing');
  assert.ok(w.player.y > 3000, `鹿の手前で止まる/横へよける y=${w.player.y.toFixed(0)}`);
  assert.ok(Math.hypot(w.player.x - 360, w.player.y - 3000) >= SENBEI.block - 1);
});

test('ふさぐ鹿: せんべいへ走って食べ、食べ終わると元の場所へ戻る', () => {
  // 鹿の近く(すぐ手前)から、左へ投げる
  const w = createWorld(blank({ senbei: { pickups: [], start: 1 }, hungry: [blocker], start: { x: 360, y: 3100 } }));
  tick(w, { x: -1, y: 0 }, .05);
  tick(w, { x: 0, y: 0, throw: true }, 2);
  const h = w.hungry[0];
  assert.equal(h.state, 'eat');
  assert.ok(h.x < 300, `せんべいの所へ行った x=${h.x.toFixed(0)}`);
  tick(w, { x: 0, y: 0 }, 5);
  assert.equal(h.state, 'idle');
  assert.ok(Math.hypot(h.x - 360, h.y - 3000) < 2, `元の場所 (${h.x.toFixed(0)}, ${h.y.toFixed(0)})`);
  assert.equal(w.thrown[0].state, 'eaten');
});

test('追ってくる鹿: 触れるとつかまる。せんべいを投げると、食べている間は止まる', () => {
  const chaser = { id: 'c', kind: 'stag' as const, x: 360, y: 3650, mode: 'chase' as const, sense: 300, speed: 200, eat: 2.5, triggerY: 3500 };
  const caught = tick(createWorld(blank({ hungry: [chaser] })), { x: 0, y: 0 }, 4);
  assert.equal(caught.outcome, 'caught');
  const w = createWorld(blank({ senbei: { pickups: [], start: 1 }, hungry: [chaser] }));
  tick(w, { x: 0, y: 1 }, .05); // 下(鹿の方)を向いて、投げる
  tick(w, { x: 0, y: 0, throw: true }, 2);
  assert.equal(w.outcome, 'playing');
  assert.equal(w.hungry[0].state, 'eat');
  tick(w, { x: 0, y: -1 }, 3);
  assert.equal(w.outcome, 'playing', '食べている間に、逃げられる');
});

test('ふさぐ鹿: せんべいが植え込みのすぐそばに落ちても、引っかからずに食べに行く', () => {
  const hedges = [{ x: 100, y: 3000, w: 215, h: 50 }, { x: 405, y: 3000, w: 215, h: 50 }];
  const w = createWorld(blank({ hedges, senbei: { pickups: [], start: 1 }, hungry: [{ ...blocker, y: 3025 }], start: { x: 330, y: 3120 } }));
  w.player.aimX = -1; w.player.aimY = -.3;
  tick(w, { x: 0, y: 0, throw: true }, 2.4);
  assert.equal(w.hungry[0].state, 'eat', 'すき間から出て、食べている');
});
