// WORLD 3 大掃除(設計書 32章): 掃く・固さ・通りすぎ(よごれ)・立ち止まる・ほうきが育つ・お花・大仏さまの目・クリアと失敗 と、3-1 のバランス
import { test } from "node:test";
import assert from "node:assert/strict";
import { SweepRun, WBAL, applyGate, type Poop } from "../src/sweep/sim.ts";
import { LEVEL_3_1, BUDDHA_BOSS, SWEEP_LEVELS, type SweepLevel, type PoopKind } from "../src/sweep/levels.ts";
import { driveSweep } from "./sweepbot.ts";

/** 鹿の来ない面(うんこは手で置く) */
const quiet = (extra: Partial<SweepLevel> = {}): SweepLevel => ({ ...LEVEL_3_1, notes: [], buddha: undefined, rain: undefined, bolts: undefined, teamMax: 24, gates: [], barrels: [], chargers: [], deer: { start: 0, addEvery: 999, max: 0, kinds: ["doe"] }, ...extra });
const start = (lv = quiet()) => { const r = new SweepRun(lv, { seed: 1 }); r.start(); return r; };
let nid = 1000;
const put = (r: SweepRun, ahead: number, x: number, kind: PoopKind = "small", hard = false): Poop => {
  const hp = WBAL.poop[kind].hp * (hard ? WBAL.hardHp : 1);
  const p: Poop = { id: nid++, kind, s: r.d + ahead, x, hp, maxHp: hp, hard, t: 0 };
  r.poops.push(p);
  return p;
};
const wait = (r: SweepRun, sec: number) => { for (let i = 0; i < Math.round(sec * 120); i++) r.step(1 / 120); };
const kinds = (r: SweepRun) => r.drainEvents().map(e => e.kind);

test("掃く: ほうきの範囲のうんこは、自動で掃ける。小は1回、中は3回。範囲の外は掃けない", () => {
  const r = start();
  const small = put(r, 0.8, 0), medium = put(r, 1.0, 0.3, "medium"), far = put(r, 0.9, 1.6);
  wait(r, 0.3);
  assert.ok(!r.poops.includes(small), "小は1回で消える");
  assert.equal(medium.hp, 2, "中は1回で 1つ減る");
  assert.equal(far.hp, 1, "横の外は掃けない");
  wait(r, WBAL.brooms[0].interval * 2 + 0.05);
  assert.ok(!r.poops.includes(medium), "中は3回で消える");
  assert.equal(r.cleaned, 2);
  assert.equal(r.score, WBAL.poop.small.score + WBAL.poop.medium.score);
});

test("立ち止まる: 足もとにうんこがある間は止まって掃く(ふまない)。なければ ふつうの速さ", () => {
  const r = start();
  wait(r, 0.5);
  assert.ok(Math.abs(r.pace - LEVEL_3_1.speed) < 1e-9);
  put(r, 0.6, 0, "large");
  wait(r, 0.1);
  assert.equal(r.pace, LEVEL_3_1.speed * WBAL.slow, "大きいうんこの前で立ち止まる");
  wait(r, 8 * WBAL.brooms[0].interval + 0.5);
  assert.equal(r.poops.length, 0, "立ち止まって、大きいうんこも掃ききれる");
  assert.equal(r.missed, 0);
});

test("通りすぎ: 掃きのこしたうんこは、のこっていた分だけ よごれになる。100%で失敗", () => {
  const r = start();
  r.steer(-2); wait(r, 0.6);
  const p = put(r, 3, 1.8, "large");
  p.hp = 4;
  wait(r, 3);
  assert.equal(r.missed, 1);
  assert.ok(Math.abs(r.dirt - WBAL.poop.large.pollution / 2) < 1e-9, "半分のこっていたら、半分");
  assert.ok(kinds(r).includes("miss"));
  for (let i = 0; i < 20; i++) put(r, 2 + i * 0.2, 1.8, "large");
  wait(r, 6);
  assert.equal(r.phase, "failed");
  assert.equal(r.pollution, 100);
});

test("ほうきが育つ: 点数がたまると ワイド → つよい → 竜巻。広く・強く・速くなる", () => {
  const r = start();
  assert.equal(r.stats.level, 1);
  r.score = WBAL.brooms[1].threshold - 10;
  put(r, 0.5, 0);
  wait(r, 0.4);
  assert.equal(r.stats.level, 2);
  assert.ok(kinds(r).includes("level"));
  r.score = WBAL.brooms[3].threshold;
  put(r, 0.5, 0);
  wait(r, 0.7);
  assert.equal(r.stats.level, 4);
  const [a, , , d] = WBAL.brooms;
  assert.ok(d.width > a.width && d.power > a.power && d.interval < a.interval && d.targets > a.targets);
});

test("お花: 何こか掃除するたびに、道ばたに咲いて よごれが へる", () => {
  const r = start();
  r.dirt = 10;
  for (let i = 0; i < WBAL.flowerEvery; i++) put(r, 0.4 + i * 0.05, (i % 3 - 1) * 0.3);
  wait(r, 1.5);
  assert.equal(r.flowers.length, 1);
  assert.equal(r.dirt, 10 - WBAL.flowerHeal);
  assert.ok(Math.abs(r.flowers[0].x) > WBAL.half, "参道の外(道ばた)に咲く");
});

test("大仏さまの目: 近づくと、予告のあとに光る。光っている間に落ちたうんこは硬い(固さ・点数が2倍)", () => {
  const lv = { ...LEVEL_3_1, notes: [], buddha: BUDDHA_BOSS };
  const r = new SweepRun(lv, { seed: 3 });
  r.start();
  r.d = lv.length * lv.buddha!.from;
  const seen = new Set<string>();
  let hard = 0;
  for (let i = 0; i < 120 * 20 && r.phase === "running"; i++) {
    r.d -= r.pace / 120; // 進まないで、その場で見る
    r.step(1 / 120);
    for (const e of r.drainEvents()) { seen.add(e.kind); if (e.kind === "drop" && e.hard) hard++; }
    r.dirt = 0;
  }
  assert.ok(seen.has("warn") && seen.has("glow"));
  assert.ok(hard > 0, "硬いうんこが落ちた");
  const h = r.poops.find(p => p.hard);
  if (h) assert.equal(h.maxHp, WBAL.poop[h.kind].hp * WBAL.hardHp);
});

test("クリア: 大仏さまに着いたら。よごれが少なければ プレミアム", () => {
  const r = start(quiet({ length: 10 }));
  wait(r, 10 / LEVEL_3_1.speed + 0.5);
  assert.equal(r.phase, "cleared");
  assert.equal(r.premium, true);
  const r2 = start(quiet({ length: 10 }));
  r2.dirt = LEVEL_3_1.limit * 0.5;
  wait(r2, 10 / LEVEL_3_1.speed + 0.5);
  assert.equal(r2.phase, "cleared"); assert.equal(r2.premium, false);
});

test("左右: 参道の外へは出ない", () => {
  const r = start();
  r.steer(9); wait(r, 1);
  assert.equal(r.x, WBAL.reachX);
  r.steer(-9); wait(r, 1);
  assert.equal(r.x, -WBAL.reachX);
});

for (const lv of SWEEP_LEVELS) test(`${lv.id} のバランス: うまく動けば ほぼクリア。動かないと失敗`, () => {
  let good = 0, human = 0, idle = 0;
  for (let seed = 1; seed <= 6; seed++) {
    if (driveSweep(lv, { seed }).phase === "cleared") good++;
    if (driveSweep(lv, { seed, every: 0.5, err: 0.3, gateMiss: 0.15 }).phase === "cleared") human++;
    if (driveSweep(lv, { seed, idle: true }).phase === "cleared") idle++;
  }
  assert.ok(good >= 5, `うまい ${good}/6`);
  assert.ok(human >= 4, `ふつう ${human}/6`);
  assert.equal(idle, 0, "動かないとクリアできない");
});

test("ゲート: 通った側の数字で 人数が かわる(+・−・×)。1人より へらず、いちばん多い人数より ふえない", () => {
  assert.equal(applyGate(3, "+4"), 7);
  assert.equal(applyGate(3, "-5"), 1);
  assert.equal(applyGate(5, "x2"), 10);
  assert.equal(applyGate(20, "x2"), WBAL.teamMax);
  assert.equal(applyGate(6, "x2", 8), 8, "面ごとの上限");
  const r = start(quiet({ gates: [{ s: 3, left: "-2", right: "+4" }, { s: 6, left: "x2", right: "+1" }] }));
  r.steer(1); wait(r, 2);
  assert.equal(r.team, 5, "右(+4)を通った");
  r.steer(-1); wait(r, 2);
  assert.equal(r.team, 10, "左(×2)を通った");
});

test("なかま: みんな前で ほうきを振る。範囲が重なると、1回で たくさん掃ける", () => {
  const solo = start(), crew = start();
  crew.team = 9;
  for (const r of [solo, crew]) { put(r, 0.6, 0, "large"); put(r, 0.9, -1.2, "medium"); put(r, 0.9, 1.2, "medium"); }
  wait(solo, 0.3); wait(crew, 0.3);
  const left = (r: SweepRun) => r.poops.reduce((n, p) => n + p.hp, 0);
  assert.ok(left(crew) < left(solo) - 4, `なかまが いると たくさん へる(${left(crew)} < ${left(solo)})`);
  assert.equal(crew.members().length, 9);
  assert.ok(crew.members().every(m => Math.abs(m.x) <= WBAL.half), "参道の中に並ぶ");
});

test("たる: 掃いて開けると なかまが ふえる。通りすぎると もう開けられない", () => {
  const r = start(quiet({ barrels: [{ s: 1.2, x: 0, hp: 2, n: 4 }, { s: 3, x: 2.2, hp: 99, n: 9 }] }));
  wait(r, 1.6);
  assert.equal(r.team, 5);
  assert.ok(r.drainEvents().some(e => e.kind === "barrel"));
  wait(r, 3);
  assert.equal(r.barrels.length, 0, "通りすぎた たるは 消える");
  assert.equal(r.team, 5);
});

test("走ってくる鹿: ぶつかった なかまを はじき飛ばす(1頭で5人まで)。よければ へらない", () => {
  const hit = start(quiet({ chargers: [{ s: 20, x: 0 }] }));
  hit.team = 12;
  wait(hit, 6);
  assert.ok(hit.team < 12 && hit.team >= 12 - WBAL.chargeMaxHits - WBAL.chargeLeaderLoss, `へった(${hit.team})`);
  assert.ok(hit.drainEvents().some(e => e.kind === "bump"));
  const miss = start(quiet({ chargers: [{ s: 20, x: 2.2 }] }));
  miss.team = 3; miss.steer(-2);
  wait(miss, 6);
  assert.equal(miss.team, 3, "よけたら へらない");
});

test("雨: 降っている間に落ちた うんこは べちゃべちゃで固い", () => {
  const r = new SweepRun({ ...LEVEL_3_1, notes: [], gates: [], barrels: [], rain: [[0, 1]] }, { seed: 2 });
  r.start();
  wait(r, 0.05);
  assert.equal(r.raining, true);
  wait(r, 6);
  const wet = r.poops.filter(p => p.wet);
  assert.ok(wet.length > 0);
  for (const p of wet) assert.equal(p.maxHp, Math.ceil(WBAL.poop[p.kind].hp * WBAL.wetHp));
});

test("雷: 予告の輪のあとに落ちる。輪の中の なかまは はじき飛ばされ、先頭は しびれて動けない。うんこは 飛び散る", () => {
  const r = start(quiet({ bolts: { from: 0, every: 999 } }));
  r.team = 8;
  wait(r, 0.05);
  assert.equal(r.bolts.length, 1);
  const b = r.bolts[0];
  b.x = r.x; b.s = r.d + 1.0;
  const big = put(r, 1.0, r.x + 0.3, "large"); big.s = b.s; big.hp = big.maxHp = 999; // 落ちるまで掃ききれない固さに
  const before = r.team;
  r.cooldown = 99; // ほうきを止めて、飛び散った うんこを 数える
  r.steer(r.x); wait(r, WBAL.boltWarn);
  assert.ok(r.team < before, "なかまが へった");
  assert.ok(r.stun > 0, "先頭が しびれた");
  assert.ok(!r.poops.includes(big) && r.poops.filter(p => p.kind === "small").length + r.missed >= 4, "大きい うんこが 小さく 飛び散った");
  const x0 = r.x; r.steer(2); wait(r, 0.3);
  assert.equal(r.x, x0, "しびれている間は 動けない");
});

test("大仏さまの目(ボス): 光っている間は 鹿が どっと出てきて、光りおわると 帰っていく", () => {
  const lv = { ...LEVEL_3_1, notes: [], gates: [], barrels: [], buddha: BUDDHA_BOSS };
  const r = new SweepRun(lv, { seed: 4 });
  r.start();
  r.d = lv.length * BUDDHA_BOSS.from;
  let most = 0, calm = 99;
  for (let i = 0; i < 120 * 30; i++) {
    r.d -= r.pace / 120; r.dirt = 0;
    r.step(1 / 120); r.drainEvents();
    const live = r.deer.filter(d => !d.leaving).length;
    if (r.buddha === "glow") most = Math.max(most, live); else if (r.buddha === "sleep" && r.t > 20) calm = Math.min(calm, live);
  }
  assert.ok(most >= lv.deer.max + BUDDHA_BOSS.swarm, `光ると 鹿が ${most}頭`);
  assert.ok(calm <= lv.deer.max + BUDDHA_BOSS.extraDeer, `光りおわると ${calm}頭に もどる`);
});
