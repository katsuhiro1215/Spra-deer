import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, type World, type Input } from '../src/game/world.ts';
import { RULES, GOAL } from '../src/game/stage.ts';
import { LEVEL_1_1, LEVEL_1_2, LEVEL_1_3, LEVEL_1_4, LEVEL_1_5, PLAYABLE, STAGES } from '../src/game/levels.ts';

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
  assert.deepEqual(ids, ['1-1', '1-2', '1-3', '1-4', '1-5']);
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

// 1-3: 歩く鹿
test("1-3: deer stop to warn, then drop a poop at a fixed spot and time", () => {
  const w = createWorld(LEVEL_1_3);
  const log: string[] = [];
  for (let i = 0; i < 120 * 4; i++) { step(w, { x: 0, y: 0 }); for (const e of w.events) if (e.kind === "dropWarning" || e.kind === "drop") log.push(w.time.toFixed(2) + " " + e.kind + " " + e.id); }
  assert.ok(log.some(l => l.endsWith("dropWarning doe")) && log.some(l => l.endsWith("drop doe")));
  assert.ok(log.indexOf(log.find(l => l.endsWith("dropWarning doe"))!) < log.indexOf(log.find(l => l.endsWith("drop doe"))!));
  const again = createWorld(LEVEL_1_3); for (let i = 0; i < 120 * 4; i++) step(again, { x: 0, y: 0 });
  assert.deepEqual(again.poops, w.poops); // 毎回同じ
  assert.equal(w.poops.length, LEVEL_1_3.poops.length + w.deers.reduce((n, d) => n + d.dropped, 0));
});
test("1-3: a standing deer does not walk while warning, and touching a deer is harmless", () => {
  const w = createWorld(LEVEL_1_3);
  while (w.deers[0].state === "walk") step(w, { x: 0, y: 0 });
  const x = w.deers[0].x; run(w, { x: 0, y: 0 }, .5); assert.equal(w.deers[0].x, x);
  const w2 = createWorld(LEVEL_1_3); w2.player.x = 200; w2.player.y = 1960; // 鹿の道のすぐ手前
  walk(w2, 200, 1860); assert.equal(w2.outcome, "playing");
});
test("1-3 is completable by reading where the deer drop, and walking the old gap column fails", () => {
  const route: [number, number][] = [[384,2340],[384,2160],[360,1960],[360,1790],[256,1590],[256,1410],[400,1330],[400,1170],[448,1090],[448,910],[GOAL.x,GOAL.y]];
  const w = createWorld(LEVEL_1_3);
  for (const [x, y] of route) walk(w, x, y);
  assert.equal(w.outcome, "clear"); assert.ok(w.poops.length > LEVEL_1_3.poops.length);
  const naive = createWorld(LEVEL_1_3);
  const old: [number, number][] = [[384,2340],[384,2160],[360,1960],[360,1790],[256,1590],[256,1410],[256,1100]];
  assert.throws(() => { for (const [x, y] of old) walk(naive, x, y); }, /route failed/);
  assert.equal(naive.outcome, "poop");
});

// 1-5: 総仕上げ（うんこの列・歩く鹿・崩れる床）
const ROUTE_1_5: [number, number][] = [[384,3240],[384,3060],[384,2700],[448,2600],[448,2460],[300,2460],[300,2200],[300,1900],[256,1800],[256,1710],[400,1710],[400,1480],[384,1140],[384,960],[GOAL.x,GOAL.y]];
test("1-5 is completable by combining all the lessons, and uses every mechanic", () => {
  const w = createWorld(LEVEL_1_5);
  for (const [x, y] of ROUTE_1_5) walk(w, x, y);
  assert.equal(w.outcome, "clear");
  assert.ok(w.traps.every(t => t.state === "open"), "both traps were triggered and passed safely");
  assert.ok(w.poops.length > LEVEL_1_5.poops.length, "deer dropped new poop along the way");
});
test("1-5: both bait gaps drop a straight walk into the hole", () => {
  const first = createWorld(LEVEL_1_5);
  assert.throws(() => { for (const [x, y] of [[384,3240],[384,3060],[384,2700],[448,2600],[448,2300]] as [number, number][]) walk(first, x, y); }, /route failed/);
  assert.equal(first.outcome, "fall");
  const second = createWorld(LEVEL_1_5);
  assert.throws(() => { for (const [x, y] of ROUTE_1_5.slice(0, 8).concat([[256,1800],[256,1500]]) as [number, number][]) walk(second, x, y); }, /route failed/);
  assert.equal(second.outcome, "fall");
});
