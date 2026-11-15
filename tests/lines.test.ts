// 横切る列・夜の面(設計書 28章 C2・C3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, lineX, type Input, type World } from '../src/game/world.ts';
import { RULES, FIELD } from '../src/game/stage.ts';
import { LEVEL_1_1, LEVEL_1_7_NIGHT, type LevelDefinition } from '../src/game/levels.ts';

const blank = (extra: Partial<LevelDefinition>): LevelDefinition => ({
  ...LEVEL_1_1, poops: [], deers: [], traps: [], walls: [], sliders: [], chasers: [], rain: [], ...extra,
});
const tick = (w: World, input: Input, sec: number) => {
  for (let i = 0; i < sec / RULES.step && w.outcome === 'playing'; i++) step(w, i === 0 ? input : { x: input.x, y: input.y });
  return w;
};

test('列: 先頭のあとに、spacing ずつ遅れて並ぶ。道の外で折り返して、また来る', () => {
  const def = { id: 'L', kind: 'deer' as const, y: 3000, x0: 400, speed: 100, count: 3, spacing: 70 };
  assert.equal(lineX(def, 0, 0) - lineX(def, 1, 0), 70);
  const span = FIELD.right - FIELD.left + 280;
  assert.ok(Math.abs(lineX(def, 0, span / 100) - lineX(def, 0, 0)) < 1e-6, '一周すると、同じ場所');
});

test('人力車: 跳んでも越えられない。鹿の行列: 跳べば越えられる', () => {
  // Spraの真上の道を、ちょうど通りかかる列
  const at = (kind: 'rickshaw' | 'deer') => blank({ lines: [{ id: 'L', kind, y: 3300, x0: 360 + 140 - FIELD.left - 120, speed: 120, count: 1, spacing: 0 }], start: { x: 360, y: 3300 } });
  const r = tick(createWorld(at('rickshaw')), { x: 0, y: 0, jump: true }, 1.2);
  assert.equal(r.outcome, 'hit');
  // 鹿が来る少し前に跳ぶと、高いうちに足の下を通り過ぎる
  const d = createWorld(at('deer'));
  tick(d, { x: 0, y: 0 }, .64);
  tick(d, { x: 0, y: 0, jump: true }, 1.2);
  assert.equal(d.outcome, 'playing');
  const d2 = tick(createWorld(at('deer')), { x: 0, y: 0 }, 1.5);
  assert.equal(d2.outcome, 'hit', '跳ばないと、ぶつかる');
});

test('新1-7: 夜で、列がある。まっすぐ走るだけでは、ぶつかるか、うんこに当たる', () => {
  assert.ok(LEVEL_1_7_NIGHT.night!.lights.length >= 6);
  assert.ok(LEVEL_1_7_NIGHT.lines!.some(l => l.kind === 'rickshaw') && LEVEL_1_7_NIGHT.lines!.some(l => l.kind === 'deer'));
  const w = tick(createWorld(LEVEL_1_7_NIGHT), { x: 0, y: -1 }, 20);
  assert.notEqual(w.outcome, 'clear');
  // 列だけの道(うんこ・穴・植え込みなし)でも、まっすぐ走ると、どれかに当たる
  const only = tick(createWorld({ ...LEVEL_1_7_NIGHT, poops: [], traps: [], hedges: [] }), { x: 0, y: -1 }, 20);
  assert.equal(only.outcome, 'hit');
});
