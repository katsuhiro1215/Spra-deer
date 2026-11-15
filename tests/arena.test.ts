// 閉じこめられる広場(設計書 28章 A3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, type Input, type World } from '../src/game/world.ts';
import { RULES } from '../src/game/stage.ts';
import { LEVEL_1_1, LEVEL_1_10, type LevelDefinition } from '../src/game/levels.ts';

const arena = { top: 2600, bottom: 3100, enterY: 3075, survive: 4, every: 1, warn: .6 };
const level = (extra: Partial<LevelDefinition> = {}): LevelDefinition => ({
  ...LEVEL_1_1, poops: [], deers: [], traps: [], walls: [], sliders: [], chasers: [], rain: [], arena, start: { x: 360, y: 3300 }, ...extra,
});
const tick = (w: World, input: Input, sec: number) => {
  for (let i = 0; i < sec / RULES.step && w.outcome === 'playing'; i++) step(w, input);
  return w;
};

/** 広場の左へ → 上へ → 右へ。4秒あまり、止まらずに大きく回る */
const loop = (w: World) => { tick(w, { x: -1, y: 0 }, .9); tick(w, { x: 0, y: -1 }, 1.5); tick(w, { x: 1, y: 0 }, 1.9); };

test('広場: 入ると後ろの門が閉まって戻れない。前の門は、逃げきるまで開かない', () => {
  const w = tick(createWorld(level()), { x: 0, y: -1 }, 1.2);
  assert.equal(w.arena!.state, 'closed');
  assert.ok(w.player.y > 2600 + 14, `前の門で止まる y=${w.player.y.toFixed(0)}`);
  tick(w, { x: 0, y: 1 }, 1);
  assert.ok(w.player.y < 3100 - 14, `後ろへも戻れない y=${w.player.y.toFixed(0)}`);
});

test('広場: 足もとにうんこが降る。動き続ければ当たらず、逃げきると前の門が開く', () => {
  const still = tick(createWorld(level()), { x: 0, y: -1 }, 1);
  tick(still, { x: 0, y: 0 }, 3);
  assert.equal(still.outcome, 'poop', '止まっていると当たる');
  // 広場を大きく回る(同じ場所に戻らない)
  const w = tick(createWorld(level()), { x: 0, y: -1 }, 1);
  loop(w);
  assert.equal(w.outcome, 'playing');
  assert.equal(w.arena!.state, 'open');
  assert.ok(w.poops.length >= 3, `うんこが落ちた ${w.poops.length}`);
  tick(w, { x: 0, y: -1 }, 2);
  assert.ok(w.player.y < 2600, '前の門を通れる');
});

test('広場の鹿: 入ると追ってきて、門が開くと座る(もう追わない)', () => {
  const chasers = [{ id: 'a', kind: 'doe' as const, x: 580, y: 3000, triggerY: 3075, speed: 60, arena: true }];
  const w = tick(createWorld(level({ chasers })), { x: 0, y: -1 }, 1);
  assert.equal(w.chasers[0].state, 'chase');
  loop(w);
  assert.equal(w.outcome, 'playing');
  tick(w, { x: 0, y: 0 }, .1);
  assert.equal(w.chasers[0].state, 'rest');
});

test('1-10: 広場がある', () => {
  assert.ok(LEVEL_1_10.arena && LEVEL_1_10.chasers.filter(c => c.arena).length === 2);
});
