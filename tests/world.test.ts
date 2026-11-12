import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, wallRect, type World, type Input } from '../src/game/world.ts';
import { RULES, GOAL } from '../src/game/stage.ts';
import { facingOf } from '../src/game/facing.ts';
import { LEVEL_1_1, LEVEL_1_2, LEVEL_1_3, LEVEL_1_4, LEVEL_1_5, LEVEL_2_1, LEVEL_2_2, LEVEL_2_3, LEVEL_2_4, LEVEL_2_5, PLAYABLE, STAGES, type LevelDefinition } from '../src/game/levels.ts';

// ---- 道具 ----
const empty: LevelDefinition = {
  id: 't', stage: 1, title: 't', intro: '', start: { x: 360, y: 1500 }, poops: [], deers: [], traps: [], walls: [], sliders: [], chasers: [], rain: [], chapters: [],
  hints: { poop: 'p', fall: 'f', wall: 'w' },
};
const make = (patch: Partial<LevelDefinition>): World => createWorld({ ...empty, ...patch });
function run(w: World, input: Input, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / RULES.step); i++) step(w, { ...input, jump: i === 0 && input.jump });
}
function walk(w: World, x: number, y: number) {
  for (let i = 0; i < 4000; i++) {
    const dx = x - w.player.x, dy = y - w.player.y, distance = Math.hypot(dx, dy);
    if (distance < 2 || w.outcome === 'clear') return;
    assert.equal(w.outcome, 'playing', `route failed near ${Math.round(w.player.x)}, ${Math.round(w.player.y)} (${w.outcome})`);
    step(w, { x: dx / distance, y: dy / distance });
  }
  assert.fail('waypoint not reached');
}
/** 入力しながらジャンプし、着地まで進める。 */
function leap(w: World, dx: number, dy: number) {
  step(w, { x: dx, y: dy, jump: true });
  for (let i = 0; i < 200 && w.player.jumpTime >= 0 && w.outcome === 'playing'; i++) step(w, { x: dx, y: dy });
}
type Move = [number, number] | ['j', number, number] | ['w', number];
function follow(w: World, route: Move[]) {
  for (const m of route) {
    if (m[0] === 'w') run(w, { x: 0, y: 0 }, m[1] as number);
    else if (m[0] === 'j') { leap(w, m[1] as number, m[2] as number); assert.equal(w.outcome === 'poop' || w.outcome === 'fall' || w.outcome === 'wall', false, `died while jumping: ${w.outcome}`); }
    else walk(w, m[0] as number, m[1] as number);
  }
}
const failsWith = (level: LevelDefinition, route: Move[], outcome: string) => {
  const w = createWorld(level);
  try { follow(w, route); } catch { /* 途中で失敗する経路 */ }
  assert.equal(w.outcome, outcome);
};

// ---- 基本ルール ----
test('poop contact ends the run and freezes further simulation', () => {
  const w = make({ poops: [{ x: 360, y: 1400 }] });
  run(w, { x: 0, y: -1 }, 1);
  assert.equal(w.outcome, 'poop');
  const frozen = JSON.stringify(w); run(w, { x: 1, y: 0, jump: true }, 1);
  assert.equal(JSON.stringify(w), frozen);
});
test('a well timed jump clears poop and lands with a cooldown', () => {
  const w = make({ poops: [{ x: 360, y: 1400 }] });
  run(w, { x: 0, y: -1, jump: true }, .84);
  assert.equal(w.outcome, 'playing'); assert.equal(w.jumps, 1);
  assert.equal(w.player.height, 0); assert.ok(w.player.y < 1400 - 35); assert.ok(w.player.cooldown > 0);
  step(w, { x: 0, y: 0, jump: true }); assert.equal(w.jumps, 1);
});
test('movement cannot accelerate diagonally', () => {
  const a = make({}), b = make({});
  run(a, { x: 1, y: 0 }, .3); run(b, { x: 1, y: -1 }, .3);
  assert.ok(Math.abs(Math.hypot(b.player.x - 360, b.player.y - 1500) - (a.player.x - 360)) < 1e-8);
});

// ---- 床の穴（予兆なし） ----
const trapLevel = (extra: object) => ({ traps: [{ id: 'h', x: 320, y: 1200, width: 100, height: 100, warning: .3, silent: true, ...extra }] });
test('a silent trap gives no warning event, then opens and drops a walker', () => {
  const w = make({ ...trapLevel({}), start: { x: 370, y: 1400 } });
  const kinds = new Set<string>();
  for (let i = 0; i < 240; i++) { step(w, { x: 0, y: -1 }); w.events.forEach(e => kinds.add(e.kind)); }
  assert.ok(!kinds.has('warning')); assert.ok(kinds.has('collapse')); assert.equal(w.outcome, 'fall');
});
test('a landing trap opens only when a jump lands near it', () => {
  const trap = trapLevel({ trigger: 'land', warning: .05, landReach: 90 });
  const walked = make({ ...trap, start: { x: 370, y: 1400 } });
  run(walked, { x: 0, y: 0 }, 1); walk(walked, 370, 1330);
  assert.equal(walked.traps[0].state, 'intact', 'walking nearby does not trigger a landing trap');
  const over = make({ ...trap, start: { x: 370, y: 1480 } });
  leap(over, 0, -1); // y 1480 -> 約1287。穴の中に着地
  assert.equal(over.traps[0].state === 'intact', false); run(over, { x: 0, y: 0 }, .2);
  assert.equal(over.outcome, 'fall');
  const side = make({ ...trap, start: { x: 560, y: 1480 } });
  leap(side, -.2, -1); run(side, { x: 0, y: 0 }, .2);
  assert.equal(side.outcome, 'playing', 'landing beside the hole is safe');
});
test('a jump over an open hole is safe and a landing in it is not', () => {
  const w = make({ ...trapLevel({}), start: { x: 370, y: 1480 } });
  w.traps[0].state = 'open';
  leap(w, 0, -1); // 約 1287 に着地する → 穴の中
  assert.equal(w.outcome, 'fall');
  const over = make({ ...trapLevel({ height: 60, y: 1330 }), start: { x: 370, y: 1480 } });
  over.traps[0].state = 'open';
  leap(over, 0, -1);
  assert.equal(over.outcome, 'playing');
});

// ---- 動くうんこ ----
const sliderLevel = { sliders: [{ id: 's', x: 560, y: 1200, toX: 360, toY: 1300, within: 400, speed: 600 }], start: { x: 360, y: 1500 } };
test('a slider waits while you walk, and slides to the landing spot when you jump', () => {
  const w = make(sliderLevel);
  run(w, { x: 0, y: -1 }, .4);
  assert.equal(w.sliders[0].state, 'idle');
  const j = make(sliderLevel);
  leap(j, 0, -1); // 約 1307 に着地 → (360,1300) のうんこと重なる
  assert.equal(j.sliders[0].state === 'idle', false); assert.equal(j.outcome, 'poop');
  const side = make(sliderLevel);
  leap(side, -.9, -.5); // 着地点をずらす
  assert.equal(side.sliders[0].state, 'done'); assert.equal(side.outcome, 'playing');
});
test('a slider far from the jump does not move', () => {
  const w = make({ sliders: [{ id: 's', x: 560, y: 300, toX: 360, toY: 300, within: 300, speed: 600 }] });
  leap(w, 0, -1);
  assert.equal(w.sliders[0].state, 'idle');
});

// ---- 壁 ----
const wallLevel = { walls: [{ id: 'w', side: 'l' as const, y: 1200, thickness: 80, triggerY: 1400, speed: 900, hold: .5 }], start: { x: 360, y: 1500 } };
test('a wall is hidden until you pass its trigger, then crushes a walker; waiting is safe', () => {
  const w = make(wallLevel);
  run(w, { x: 0, y: -1 }, .3); // y≈1430。まだ出ない
  assert.equal(w.walls[0].state, 'idle');
  run(w, { x: 0, y: -1 }, .5); // y≈1315 を通過 → 出てくる → ぶつかる
  run(w, { x: 0, y: -1 }, 1);
  assert.equal(w.outcome, 'wall');
  const waiter = make(wallLevel);
  walk(waiter, 360, 1390); // トリガーを越えたら止まる
  assert.equal(waiter.walls[0].state === 'idle', false);
  run(waiter, { x: 0, y: 0 }, 4);
  assert.equal(waiter.walls[0].state, 'done'); assert.equal(waiter.outcome, 'playing');
  walk(waiter, 360, 1100); assert.equal(waiter.outcome, 'playing');
});
test('a wall covers the whole road while closed, and jumping over it is safe', () => {
  const closed = wallRect({ side: 'r', progress: 1, y: 1200, thickness: 80 });
  assert.ok(closed.x <= 114 && closed.x + closed.w >= 606);
  const hidden = wallRect({ side: 'r', progress: 0, y: 1200, thickness: 80 });
  assert.ok(hidden.x > 720, 'hidden off screen');
  const w = make({ walls: [{ id: 'w', side: 'l', y: 1250, thickness: 60, triggerY: 1480, speed: 3000, hold: 2 }], start: { x: 360, y: 1500 } });
  step(w, { x: 0, y: 0 }); step(w, { x: 0, y: -1 });
  walk(w, 360, 1380);
  assert.equal(w.walls[0].progress, 1, 'the wall is closed across the road');
  leap(w, 0, -1);
  assert.equal(w.outcome, 'playing');
});

// ---- 向きと歩幅 ----
test('input direction maps to six facings, sideways ties go to the near side', () => {
  const deg = (d: number) => facingOf(Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180));
  assert.equal(deg(90), 'down'); assert.equal(deg(270), 'up');
  assert.equal(deg(30), 'dr'); assert.equal(deg(150), 'dl'); assert.equal(deg(210), 'ul'); assert.equal(deg(330), 'ur');
  assert.equal(deg(0), 'dr'); assert.equal(deg(180), 'dl');
  assert.equal(deg(59), 'dr'); assert.equal(deg(61), 'down'); assert.equal(deg(119), 'down'); assert.equal(deg(121), 'dl');
  assert.equal(deg(239), 'ul'); assert.equal(deg(241), 'up'); assert.equal(deg(299), 'up'); assert.equal(deg(301), 'ur');
});
test('the player faces the goal at the start, turns with input, and keeps the last facing when stopped', () => {
  const w = make({});
  assert.equal(w.player.facing, 'up');
  run(w, { x: 1, y: 0 }, .1); assert.equal(w.player.facing, 'dr');
  run(w, { x: -1, y: -1 }, .1); assert.equal(w.player.facing, 'ul');
  run(w, { x: 0, y: 0 }, .1); assert.equal(w.player.facing, 'ul');
});
test('stride grows with the distance actually walked, not while pushing against the edge or standing', () => {
  const w = make({});
  run(w, { x: 0, y: -1 }, 1); assert.ok(Math.abs(w.player.stride - RULES.speed) < 2);
  const stood = w.player.stride; run(w, { x: 0, y: 0 }, 1); assert.equal(w.player.stride, stood);
  const edge = make({}); edge.player.x = 114;
  run(edge, { x: -1, y: 0 }, 1); assert.equal(edge.player.stride, 0);
});

// ---- 歩く鹿 ----
test('deer stop to warn, then drop a poop at a fixed spot and time', () => {
  const w = createWorld(LEVEL_1_1);
  const log: string[] = [];
  for (let i = 0; i < 120 * 4; i++) { step(w, { x: 0, y: 0 }); for (const e of w.events) if (e.kind === 'dropWarning' || e.kind === 'drop') log.push(w.time.toFixed(2) + ' ' + e.kind + ' ' + e.id); }
  assert.ok(log.some(l => l.endsWith('dropWarning doe')) && log.some(l => l.endsWith('drop doe')));
  const again = createWorld(LEVEL_1_1); for (let i = 0; i < 120 * 4; i++) step(again, { x: 0, y: 0 });
  assert.deepEqual(again.poops, w.poops); // 毎回同じ
  assert.equal(w.poops.length, LEVEL_1_1.poops.length + w.deers.reduce((n, d) => n + d.dropped, 0));
});

// ---- 新しい仕掛け（動くゴール、位置で開く穴、左右から閉じる壁、走るうんこ） ----
test('a goal that runs away moves when you get close, and a goal-triggered hole opens', () => {
  const w = make({
    start: { x: 360, y: 700 }, goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
    traps: [{ id: 'g', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true }],
  });
  run(w, { x: 0, y: -1 }, 1); // y≈465 → 距離165 で逃げ出す
  assert.notEqual(w.goal.state, 'idle'); run(w, { x: 0, y: 0 }, 1);
  assert.deepEqual([w.goal.x, w.goal.y, w.goal.state], [550, 300, 'done']);
  assert.equal(w.traps[0].state, 'open');
  walk(w, 360, 300); // 元の場所に立っても、クリアにならない
  assert.equal(w.outcome, 'playing');
});
test('a y-triggered hole opens once you pass the line, and a side lane stays safe', () => {
  const lv = { start: { x: 360, y: 900 }, traps: [{ id: 'b', x: 210, y: 400, width: 300, height: 120, warning: .5, trigger: 'y' as const, triggerY: 700, silent: true }] };
  const straight = make(lv);
  for (let i = 0; i < 600 && straight.outcome === 'playing'; i++) step(straight, { x: 0, y: -1 });
  assert.equal(straight.outcome, 'fall');
  const side = make(lv);
  walk(side, 150, 780); walk(side, 150, 380); walk(side, 360, 300);
  assert.equal(side.outcome, 'clear');
});
test('walls from both sides close the middle, and one short wall leaves a gap', () => {
  const both = [
    { id: 'a', side: 'l' as const, y: 1200, thickness: 80, triggerY: 1400, speed: 900, hold: 1, length: 330 },
    { id: 'b', side: 'r' as const, y: 1200, thickness: 80, triggerY: 1400, speed: 900, hold: 1, length: 330 },
  ];
  const w = make({ walls: both, start: { x: 448, y: 1500 } });
  walk(w, 448, 1390); run(w, { x: 0, y: 0 }, 1);
  const l = wallRect(w.walls[0]), r = wallRect(w.walls[1]);
  assert.ok(l.x + l.w >= r.x, 'the two walls meet in the middle');
  const w2 = make({ walls: [both[0]], start: { x: 540, y: 1500 } });
  run(w2, { x: 0, y: -1 }, 3);
  assert.equal(w2.outcome, 'playing', 'a short wall from the left does not reach the right side');
});
test('a running poop starts when you come near, and only catches someone who keeps walking', () => {
  const lv = { start: { x: 256, y: 2100 }, sliders: [{ id: 'd', x: 114, y: 1700, toX: 560, toY: 1700, within: 165, speed: 500, trigger: 'near' as const }] };
  const runner = make(lv);
  for (let i = 0; i < 480 && runner.outcome === 'playing'; i++) step(runner, { x: 0, y: -1 });
  assert.equal(runner.outcome, 'poop');
  const waiter = make(lv);
  for (let i = 0; i < 720 && waiter.outcome === 'playing'; i++) step(waiter, { x: 0, y: waiter.sliders[0].state === 'moving' ? 0 : -1 });
  assert.equal(waiter.outcome, 'playing');
});

// ---- 面ごとの攻略経路（予兆がなくても、2回目には抜けられる） ----
const R11: Move[] = [[384,3240],[384,3060],[384,2700],[448,2600],[448,2460],[300,2460],[300,2200],[300,1900],[256,1800],[256,1710],[400,1710],[400,1480],[384,1140],[384,960]];
test('1-1 is completable by reading the bait gaps and the last big hole, and each trap catches a straight walk', () => {
  const w = createWorld(LEVEL_1_1);
  follow(w, [...R11, [150,780], [150,380], [GOAL.x, GOAL.y]]);
  assert.equal(w.outcome, 'clear');
  assert.ok(w.traps.every(t => t.state === 'open'));
  assert.ok(w.poops.length > LEVEL_1_1.poops.length);
  failsWith(LEVEL_1_1, [[384,3240],[384,3060],[384,2700],[448,2600],[448,2300]], 'fall');
  failsWith(LEVEL_1_1, R11.slice(0, 8).concat([[256,1800],[256,1500]]), 'fall');
  failsWith(LEVEL_1_1, [...R11, [GOAL.x, GOAL.y]], 'fall'); // 安心してゴールへ向かうと、真ん中の大穴
});
const A12: Move[] = [[500,3220],[500,3130],['j',0,-1],[500,2650],[500,2560],[360,2470],[360,2450],['j',0,-1],[256,2050],[256,1960],[256,1900],[350,1790],[350,1650],[420,1560],[420,1420],[400,1140],[440,1000]];
test('1-2: block, landing hole, sliding poop, running poop, and a goal that runs into a hole', () => {
  const w = createWorld(LEVEL_1_2);
  follow(w, [...A12, [520,900], [520,600], [540,420], [550,330]]);
  assert.equal(w.outcome, 'clear'); assert.equal(w.jumps, 2);
  failsWith(LEVEL_1_2, [[360,3000]], 'poop'); // 道は完全にふさがれていて、歩いては通れない
  failsWith(LEVEL_1_2, [[500,3220],[500,3110],[360,3105],['j',0,-1],['w',.5]], 'fall'); // 着地点を穴にずらさないと落ちる
  failsWith(LEVEL_1_2, [[500,3220],[500,3130],['j',0,-1],[500,2650],[500,2560],[500,2380],['j',0,-1]], 'poop'); // まっすぐ跳ぶと、動くうんこに当たる
  failsWith(LEVEL_1_2, [[500,3220],[500,3130],['j',0,-1],[500,2650],[500,2560],[360,2470],[360,2450],['j',0,-1],[256,2050],[256,1960],[256,1700]], 'poop'); // 走るうんこ
  failsWith(LEVEL_1_2, [...A12, [400,900], [400,700]], 'fall'); // 近づくと開く穴
  // 旗を追いかけて、まっすぐ右へ走ると、道の途中の穴に落ちる
  const chase = createWorld(LEVEL_1_2);
  try { follow(chase, [...A12, [520,900], [520,600], [360,420], [360,300], [550,300]]); } catch { /* 落ちる */ }
  assert.equal(chase.outcome, 'fall');
});
const A13: Move[] = [[384,3230],[384,3080],[360,2895],['w',3],[384,2400],[384,2295],['w',3],[256,1960],[256,1850],[256,1780],['w',1.2],[256,1650],[400,1600],[400,1575],['w',3],[448,1100],[448,1020],[448,900],[448,871],['w',1.2]];
test('1-3: walls at fixed places, running poop, and walls closing in from both sides before the goal', () => {
  const w = createWorld(LEVEL_1_3);
  follow(w, [...A13, [448,776], ['w',3], [GOAL.x, GOAL.y]]);
  assert.equal(w.outcome, 'clear'); assert.ok(w.walls.every(x => x.state === 'done'));
  const jumper = createWorld(LEVEL_1_3); // 閉じた壁を、ジャンプで越えてもよい
  follow(jumper, [...A13, [448,776], ['w',1.4], ['j',0,-1], [GOAL.x, GOAL.y]]);
  assert.equal(jumper.outcome, 'clear');
  failsWith(LEVEL_1_3, [[GOAL.x, GOAL.y]], 'wall');
  failsWith(LEVEL_1_3, [...A13, [GOAL.x, GOAL.y]], 'wall'); // ゴール前で待たないと、左右から閉じる壁
  failsWith(LEVEL_1_3, [[384,3230],[384,3080],[360,2895],['w',3],[384,2400],[384,2295],['w',3],[256,1960],[256,1500]], 'poop'); // 走るうんこ
});

// ---- 追いかける鹿・降ってくるうんこ ----
test('a chaser starts when you pass its line, catches a walker who stops, and can be jumped over', () => {
  const lv = { start: { x: 360, y: 1500 }, chasers: [{ id: 'c', kind: 'stag' as const, x: 360, y: 1900, triggerY: 1450, speed: 150 }] };
  const w = make(lv);
  run(w, { x: 0, y: -1 }, .3); assert.equal(w.chasers[0].state, 'chase');
  run(w, { x: 0, y: 0 }, 4); assert.equal(w.outcome, 'caught');
  const runner = make(lv); run(runner, { x: 0, y: -1 }, 3); assert.equal(runner.outcome, 'playing', 'a faster walker is never caught');
  const jumper = make({ ...lv, chasers: [{ ...lv.chasers[0], y: 1560, speed: 80 }] });
  run(jumper, { x: 0, y: -1 }, .3); run(jumper, { x: 0, y: 1, jump: true }, .1); // 追いつかれる前に跳ぶ
  assert.equal(jumper.outcome, 'playing');
});
test('aimed rain lands where you stood when the shadow appeared, so a moving player is safe and a standing player is hit', () => {
  const lv = { start: { x: 360, y: 1500 }, rain: [{ id: 'r', triggerY: 1450, delay: .2, warn: .8, aim: 'player' as const }] };
  const moving = make(lv);
  for (let i = 0; i < 360; i++) step(moving, { x: 0, y: -1 });
  assert.equal(moving.outcome, 'playing'); assert.equal(moving.poops.length, 1);
  const standing = make(lv);
  walk(standing, 360, 1440); run(standing, { x: 0, y: 0 }, 2);
  assert.equal(standing.outcome, 'poop');
});

// ---- 1-4 / 1-5 ----
const R14: Move[] = [[448,2740],[448,2625],[350,2580],[350,2300],[256,2180],[256,2070],[400,2030],[400,1700],[384,1620],[384,1520],[300,1480],[300,1250],[480,1120],[500,1090],[500,975],[400,930],[400,700],[GOAL.x,GOAL.y]];
test('1-4: reading the bait gaps while a deer chases; stopping gets you caught', () => {
  const w = createWorld(LEVEL_1_4);
  follow(w, [[256,3240],[256,3060],[256,2800], ...R14]);
  assert.equal(w.outcome, 'clear'); assert.ok(w.traps.every(t => t.state === 'open'));
  failsWith(LEVEL_1_4, [[256,3240],[256,3060],[256,2800],[448,2740],[448,2400]], 'fall');
  failsWith(LEVEL_1_4, [[256,3240],[256,3060],[256,2800],['w',3.5], ...R14], 'caught');
});
const A15: Move[] = [[500,3220],[500,3130],['j',0,-1],[500,2800],[430,2500],[360,2328],['w',.8],[430,2328],['w',2.6]];
const B15: Move[] = [[256,1960],[256,1900],[256,1790],[400,1740],[400,1560],[420,1450],[448,1380],[350,1300],[350,1100],[440,1000],[520,900],[520,600],[540,420],[550,330]];
test('1-5: block, falling poop, wall, chasing deer, bait holes, and a goal that runs away', () => {
  const w = createWorld(LEVEL_1_5);
  follow(w, [...A15, ...B15]);
  assert.equal(w.outcome, 'clear'); assert.equal(w.jumps, 1);
  // 壁を待つあいだ、足元に降ってくるうんこを避けないと当たる。
  failsWith(LEVEL_1_5, [[500,3220],[500,3130],['j',0,-1],[500,2800],[430,2500],[360,2328],['w',3.4]], 'poop');
  failsWith(LEVEL_1_5, [[360,3000]], 'poop'); // ふさがれた道
});

// ---- 面データ ----
// ---- ステージ2（せんべい配達） ----
const T = { id: 't', kind: 'stag' as const, x: 360, y: 1100, sense: 300, speed: 260 };
const deliver = (thieves: object[], baits = 2) => ({ delivery: { baits, targetKind: 'fawn' as const, thieves: thieves as never } });
test('delivery: the button drops a senbei (no jump), limited in number, with a short pause between', () => {
  const w = make(deliver([], 1));
  run(w, { x: 0, y: 0, jump: true }, .05);
  assert.equal(w.jumps, 0); assert.equal(w.player.height, 0); assert.equal(w.baits.length, 1); assert.equal(w.baitsLeft, 0);
  run(w, { x: 0, y: 0 }, .5); run(w, { x: 0, y: 0, jump: true }, .05);
  assert.equal(w.baits.length, 1, 'no senbei left');
});
test('a hungry deer waits until you come within its range, then catches a walker who stands still', () => {
  const w = make(deliver([T]));
  run(w, { x: 0, y: -1 }, .3); assert.equal(w.thieves[0].state, 'idle');
  walk(w, 360, 1300); assert.equal(w.thieves[0].state, 'chase');
  run(w, { x: 0, y: 0 }, 2); assert.equal(w.outcome, 'stolen');
});
test('a placed senbei draws the deer away, it eats for a while and then stays full', () => {
  const w = make({ ...deliver([T]), start: { x: 360, y: 1560 } });
  walk(w, 360, 1370); step(w, { x: 0, y: 0, jump: true });
  assert.equal(w.baits.length, 1);
  walk(w, 150, 1370); // 横へ離れる間に、鹿はせんべいへ向かう
  for (let i = 0; i < 480 && w.thieves[0].state !== 'eat'; i++) step(w, { x: 0, y: 0 });
  assert.equal(w.thieves[0].state, 'eat'); assert.equal(w.outcome, 'playing');
  run(w, { x: 0, y: 0 }, 3);
  assert.equal(w.thieves[0].state, 'full'); assert.equal(w.baits[0].gone, true);
  run(w, { x: 0, y: 0 }, 3); assert.equal(w.outcome, 'playing', 'a full deer no longer chases');
});
test('a deer that does not move (sense 0) only matters if you touch it', () => {
  const w = make(deliver([{ ...T, sense: 0, speed: 0, y: 1300 }]));
  run(w, { x: 0, y: 0 }, 3); assert.equal(w.outcome, 'playing');
  const touch = make({ ...deliver([{ ...T, sense: 0, speed: 0, y: 1300 }]), start: { x: 360, y: 1500 } });
  run(touch, { x: 0, y: -1 }, 1.2); assert.equal(touch.outcome, 'stolen');
  const around = make({ ...deliver([{ ...T, sense: 0, speed: 0, y: 1300 }]), start: { x: 360, y: 1500 } });
  walk(around, 240, 1300); walk(around, 240, 1100); assert.equal(around.outcome, 'playing');
});
test('delivery: reaching the target deer clears the level', () => {
  const w = make({ ...deliver([]), goal: { x: 360, y: 1100 } });
  run(w, { x: 0, y: -1 }, 2); assert.equal(w.outcome, 'clear');
});

test('level data is sound: unique ids, safe start, final chapter, reachable gaps', () => {
  const ids = PLAYABLE.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 10), ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10']);
  for (const level of PLAYABLE) {
    assert.ok(level.poops.every(p => Math.hypot(p.x - level.start.x, p.y - level.start.y) > 150), `${level.id}: poop near start`);
    assert.ok(level.start.y > GOAL.y + 800, `${level.id}: start too close to goal`);
    assert.equal(level.chapters.at(-1)!.above, -Infinity, `${level.id}: chapters need a final entry`);
    assert.ok(level.hints.poop && level.hints.wall && level.hints.fall);
    for (const wall of level.walls) assert.ok(wall.triggerY < level.start.y && wall.triggerY > wall.y + wall.thickness / 2, `${level.id}: ${wall.id} must trigger before the wall`);
    for (const s of level.sliders) assert.ok(Math.hypot(s.x - level.start.x, s.y - level.start.y) > 150);
    for (const c of level.chasers) assert.ok(c.triggerY <= level.start.y - 100, `${level.id}: chaser ${c.id} must start after the player moves`);
  }
  assert.equal(STAGES[0].slots.length, 10);
  assert.equal(STAGES[1].slots.length, 5);
  for (const level of PLAYABLE.filter(l => l.delivery)) {
    for (const t of level.delivery!.thieves) assert.ok(Math.hypot(t.x - level.start.x, t.y - level.start.y) > 350, `${level.id}: ${t.id} too close to start`);
    if (level.delivery!.thieves.length) assert.ok(level.hints.caught, `${level.id}: needs a stolen hint`);
  }
});
