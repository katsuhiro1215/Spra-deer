import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, type World, type Input } from '../src/game/world.ts';
import { RULES, GOAL } from '../src/game/stage.ts';
import { LEVEL_1_1, LEVEL_1_2, LEVEL_1_4, PLAYABLE, STAGES } from '../src/game/levels.ts';

const create = () => createWorld(LEVEL_1_4);
function run(w: World, input: Input, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / RULES.step); i++) step(w, { ...input, jump: i === 0 && input.jump });
}
function walk(w: World, x: number, y: number) {
  for (let i = 0; i < 2400; i++) {
    const dx = x - w.player.x, dy = y - w.player.y, distance = Math.hypot(dx, dy);
    if (distance < 2 || w.outcome === 'clear') return;
    assert.equal(w.outcome, 'playing', `route failed near ${w.player.x}, ${w.player.y}`);
    step(w, { x: dx / distance, y: dy / distance });
  }
  assert.fail('waypoint not reached');
}
test('poop contact ends the run and freezes further simulation', () => {
  const w = create(); w.player.x = 384; w.player.y = 3390;
  run(w, { x: 0, y: -1 }, 1);
  assert.equal(w.outcome, 'poop');
  const frozen = JSON.stringify(w); run(w, { x: 1, y: 0, jump: true }, 1);
  assert.equal(JSON.stringify(w), frozen);
});
test('a well timed jump clears poop and lands with a cooldown', () => {
  const w = create(); w.player.x = 384; w.player.y = 3390;
  run(w, { x: 0, y: -1, jump: true }, .84);
  assert.equal(w.outcome, 'playing'); assert.equal(w.jumps, 1);
  assert.equal(w.player.height, 0); assert.ok(w.player.y < 3330 - 35); assert.ok(w.player.cooldown > 0);
  step(w, { x: 0, y: 0, jump: true }); assert.equal(w.jumps, 1);
});
test('the safe looking gap warns, collapses, and catches a straight walk', () => {
  const w = create(); w.player.x = 448; w.player.y = 3035;
  const events = new Set<string>();
  for (let i = 0; i < 240; i++) { step(w, { x: 0, y: -1 }); w.events.forEach(e => events.add(e.kind)); }
  assert.equal(w.outcome, 'fall');
  assert.ok(events.has('warning')); assert.ok(events.has('collapse')); assert.ok(events.has('fall'));
});
test('stopping at the warning leaves time to choose a safe detour', () => {
  const w = create(); w.player.x = 448; w.player.y = 2985;
  while (w.traps[0].state === 'intact') step(w, { x: 0, y: -1 });
  run(w, { x: 0, y: 0 }, 1);
  assert.equal(w.traps[0].state, 'open'); assert.equal(w.outcome, 'playing');
  walk(w, 448, 2960); walk(w, 300, 2960); walk(w, 300, 2750);
  assert.equal(w.outcome, 'playing');
});
test('a jump triggers the landing trap and falling occurs only on landing', () => {
  const w = create(); w.player.x = 256; w.player.y = 2260;
  run(w, { x: 0, y: -1, jump: true }, .7);
  assert.equal(w.outcome, 'playing'); assert.equal(w.traps[1].state, 'shaking');
  run(w, { x: 0, y: -1 }, .3);
  assert.equal(w.outcome, 'fall'); assert.equal(w.player.height, 0);
});
test('an already open hole can be jumped across', () => {
  const w = create(); w.player.x = 448; w.player.y = 2925; w.traps[0].state = 'open';
  run(w, { x: 0, y: -1, jump: true }, .84);
  assert.equal(w.outcome, 'playing'); assert.ok(w.player.y < 2780); assert.equal(w.player.height, 0);
});
test('1-4 is completable by reading the gaps and detouring all three traps', () => {
  const w = create();
  const route = [[256,3500],[256,3220],[448,3180],[448,2960],[300,2960],[300,2700],[384,2600],[384,2390],[256,2390],[256,2200],[400,2200],[400,1850],[448,1850],[448,1570],[384,1480],[384,1230],[520,1230],[520,940],[256,850],[256,580],[360,480],[360,300]];
  for (const [x,y] of route) walk(w,x,y);
  assert.equal(w.outcome, 'clear'); assert.equal(w.jumps, 0);
  assert.ok(w.traps.every(t => t.state === 'open'));
});
test('reset restores fixed traps and movement cannot accelerate diagonally', () => {
  const a = create(), b = create();
  run(a, { x: 1, y: 0 }, .3); run(b, { x: 1, y: -1 }, .3);
  assert.ok(Math.abs(Math.hypot(b.player.x - 360, b.player.y - 3580) - (a.player.x - 360)) < 1e-8);
  a.traps[0].state = 'open'; a.jumps = 9;
  const reset = create(); assert.equal(reset.jumps, 0); assert.ok(reset.traps.every(t => t.state === 'intact'));
});

// 1-1 と 1-2 は、うんこのすきま（列ごとに x が決まる）を順に抜ければクリアできる。
function gapRoute(rows: [number, number][]): [number, number][] {
  const route: [number, number][] = [];
  for (const [y, gap] of rows) route.push([gap, y + 90], [gap, y - 90]);
  route.push([GOAL.x, GOAL.y]);
  return route;
}
test('1-1 is completable through the gaps, and a straight walk fails', () => {
  const w = createWorld(LEVEL_1_1);
  for (const [x, y] of gapRoute([[1450, 384], [1050, 256], [650, 448]])) walk(w, x, y);
  assert.equal(w.outcome, 'clear');
  const straight = createWorld(LEVEL_1_1);
  run(straight, { x: 0, y: -1 }, 8);
  assert.equal(straight.outcome, 'poop');
});
test('1-2 is completable through the gaps, including the poop pair', () => {
  const w = createWorld(LEVEL_1_2);
  for (const [x, y] of gapRoute([[2250, 256], [1980, 448], [1650, 320], [1330, 448], [1010, 256], [700, 384]])) walk(w, x, y);
  assert.equal(w.outcome, 'clear');
});
test('level data is sound: unique ids, safe start, final chapter, hints for every failure', () => {
  const ids = PLAYABLE.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ['1-1', '1-2', '1-4']);
  for (const level of PLAYABLE) {
    assert.ok(level.poops.every(p => Math.hypot(p.x - level.start.x, p.y - level.start.y) > 150), `${level.id}: poop near start`);
    assert.ok(level.start.y > GOAL.y + 800, `${level.id}: start too close to goal`);
    assert.equal(level.chapters.at(-1)!.above, -Infinity, `${level.id}: chapters need a final entry`);
    assert.ok(level.traps.every(t => level.start.y < t.y || level.start.y > t.y + t.height));
    assert.ok(level.hints.poop.length > 0 && (level.traps.length === 0 || level.hints.fall.length > 0));
  }
  assert.equal(STAGES[0].slots.length, 5);
});

// 向き（6領域）と歩幅
import { facingOf } from "../src/game/facing.ts";
test("input direction maps to six facings, sideways ties go to the near side", () => {
  const deg = (d: number) => facingOf(Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180));
  assert.equal(deg(90), "down"); assert.equal(deg(270), "up");
  assert.equal(deg(30), "dr"); assert.equal(deg(150), "dl"); assert.equal(deg(210), "ul"); assert.equal(deg(330), "ur");
  assert.equal(deg(0), "dr"); assert.equal(deg(180), "dl");
  assert.equal(deg(59), "dr"); assert.equal(deg(61), "down"); assert.equal(deg(119), "down"); assert.equal(deg(121), "dl");
  assert.equal(deg(239), "ul"); assert.equal(deg(241), "up"); assert.equal(deg(299), "up"); assert.equal(deg(301), "ur");
});
test("the player faces the goal at the start, turns with input, and keeps the last facing when stopped", () => {
  const w = createWorld(LEVEL_1_1);
  assert.equal(w.player.facing, "up");
  run(w, { x: 1, y: 0 }, .1); assert.equal(w.player.facing, "dr");
  run(w, { x: -1, y: -1 }, .1); assert.equal(w.player.facing, "ul");
  run(w, { x: 0, y: 0 }, .1); assert.equal(w.player.facing, "ul");
});
test("stride grows with the distance actually walked, not while pushing against the edge or standing", () => {
  const w = createWorld(LEVEL_1_1);
  run(w, { x: 0, y: -1 }, 1); assert.ok(Math.abs(w.player.stride - RULES.speed) < 2);
  const stood = w.player.stride; run(w, { x: 0, y: 0 }, 1); assert.equal(w.player.stride, stood);
  const edge = createWorld(LEVEL_1_1); edge.player.x = 114;
  run(edge, { x: -1, y: 0 }, 1); assert.equal(edge.player.stride, 0);
});
