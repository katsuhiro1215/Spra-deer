import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, type World, type Input } from '../src/game/world.ts';
import { RULES } from '../src/game/stage.ts';

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
  const w = createWorld(); w.player.x = 384; w.player.y = 3390;
  run(w, { x: 0, y: -1 }, 1);
  assert.equal(w.outcome, 'poop');
  const frozen = JSON.stringify(w); run(w, { x: 1, y: 0, jump: true }, 1);
  assert.equal(JSON.stringify(w), frozen);
});
test('a well timed jump clears poop and lands with a cooldown', () => {
  const w = createWorld(); w.player.x = 384; w.player.y = 3390;
  run(w, { x: 0, y: -1, jump: true }, .84);
  assert.equal(w.outcome, 'playing'); assert.equal(w.jumps, 1);
  assert.equal(w.player.height, 0); assert.ok(w.player.y < 3330 - 35); assert.ok(w.player.cooldown > 0);
  step(w, { x: 0, y: 0, jump: true }); assert.equal(w.jumps, 1);
});
test('the safe looking gap warns, collapses, and catches a straight walk', () => {
  const w = createWorld(); w.player.x = 448; w.player.y = 3035;
  const events = new Set<string>();
  for (let i = 0; i < 240; i++) { step(w, { x: 0, y: -1 }); w.events.forEach(e => events.add(e.kind)); }
  assert.equal(w.outcome, 'fall');
  assert.ok(events.has('warning')); assert.ok(events.has('collapse')); assert.ok(events.has('fall'));
});
test('stopping at the warning leaves time to choose a safe detour', () => {
  const w = createWorld(); w.player.x = 448; w.player.y = 2985;
  while (w.traps[0].state === 'intact') step(w, { x: 0, y: -1 });
  run(w, { x: 0, y: 0 }, 1);
  assert.equal(w.traps[0].state, 'open'); assert.equal(w.outcome, 'playing');
  walk(w, 448, 2960); walk(w, 300, 2960); walk(w, 300, 2750);
  assert.equal(w.outcome, 'playing');
});
test('a jump triggers the landing trap and falling occurs only on landing', () => {
  const w = createWorld(); w.player.x = 256; w.player.y = 2260;
  run(w, { x: 0, y: -1, jump: true }, .7);
  assert.equal(w.outcome, 'playing'); assert.equal(w.traps[1].state, 'shaking');
  run(w, { x: 0, y: -1 }, .3);
  assert.equal(w.outcome, 'fall'); assert.equal(w.player.height, 0);
});
test('an already open hole can be jumped across', () => {
  const w = createWorld(); w.player.x = 448; w.player.y = 2925; w.traps[0].state = 'open';
  run(w, { x: 0, y: -1, jump: true }, .84);
  assert.equal(w.outcome, 'playing'); assert.ok(w.player.y < 2780); assert.equal(w.player.height, 0);
});
test('stage 1 is completable by reading the gaps and detouring all three traps', () => {
  const w = createWorld();
  const route = [[256,3500],[256,3220],[448,3180],[448,2960],[300,2960],[300,2700],[384,2600],[384,2390],[256,2390],[256,2200],[400,2200],[400,1850],[448,1850],[448,1570],[384,1480],[384,1230],[520,1230],[520,940],[256,850],[256,580],[360,480],[360,300]];
  for (const [x,y] of route) walk(w,x,y);
  assert.equal(w.outcome, 'clear'); assert.equal(w.jumps, 0);
  assert.ok(w.traps.every(t => t.state === 'open'));
});
test('reset restores fixed traps and movement cannot accelerate diagonally', () => {
  const a = createWorld(), b = createWorld();
  run(a, { x: 1, y: 0 }, .3); run(b, { x: 1, y: -1 }, .3);
  assert.ok(Math.abs(Math.hypot(b.player.x - 360, b.player.y - 3580) - (a.player.x - 360)) < 1e-8);
  a.traps[0].state = 'open'; a.jumps = 9;
  const reset = createWorld(); assert.equal(reset.jumps, 0); assert.ok(reset.traps.every(t => t.state === 'intact'));
});
