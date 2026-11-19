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

test("鹿の群れ: 先で 一列に 参道を横ぎって、1頭ずつ うんこを落とす(横に ならぶ)。ふつうの鹿の数には 入らない", () => {
  const r = start(quiet({ herds: [{ s: 20, n: 5 }] }));
  r.cooldown = 99; // 掃かないで、落ちた うんこを 数える
  wait(r, (20 - WBAL.herdAppear) / r.level.speed + 0.1);
  assert.ok(r.deer.filter(d => d.mode === "herd").length === 5, "5頭の群れ");
  wait(r, 6);
  const row = r.poops.filter(p => Math.abs(p.s - 20) < 1.5);
  assert.equal(row.length, 5, "1頭 1こずつ");
  const xs = row.map(p => p.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1.5, "横に ちらばって ならぶ");
  assert.equal(r.deer.filter(d => d.mode === "herd").length, 0, "横ぎりおわると いなくなる");
});

test("せんべい売り場: 屋台の側に 鹿が集まって、大きめの うんこを 何こか落とし、Spra が来ると にげる", () => {
  const r = start(quiet({ stalls: [{ s: 20, side: 1, n: 3 }] }));
  r.cooldown = 99;
  wait(r, (20 - WBAL.stallAppear) / r.level.speed + 0.1);
  assert.equal(r.deer.filter(d => d.mode === "stall").length, 3);
  wait(r, 8);
  const ps = r.poops;
  assert.ok(ps.length >= 3 && ps.length <= 3 * WBAL.stallDrops, `うんこ ${ps.length}こ`);
  assert.ok(ps.every(p => p.x > 0), "屋台の側(右)に たまる");
  assert.ok(ps.every(p => p.kind !== "small"), "せんべいを食べた鹿の うんこは 小さくない");
  assert.ok(r.deer.every(d => d.leaving), "落としおわると にげていく");
});

test("風: ふいている間は、Spra のねらいと うんこが 横へ流される(小さいほど よく流れる)。やむと とまる", () => {
  const r = start(quiet({ wind: { from: 0, every: 999, dur: 2, force: 1 } }));
  r.cooldown = 99;
  const small = put(r, 6, 0), large = put(r, 6.2, 0, "large");
  wait(r, 0.05);
  assert.notEqual(r.wind, 0);
  const dir = r.wind;
  wait(r, 1);
  assert.ok(r.targetX * dir > 0.8, "ねらいが 流された");
  assert.ok(small.x * dir > large.x * dir && large.x * dir > 0, "小さい うんこほど よく流れる");
  wait(r, 1.2);
  assert.equal(r.wind, 0, "やんだ");
  assert.ok(kinds(r).includes("windEnd"));
  const sx = small.x, tx = r.targetX;
  wait(r, 0.5);
  assert.equal(small.x, sx, "やむと 流れない");
  assert.equal(r.targetX, tx);
});

test("なかま: たるの中の なかまが 出てくる。+ゲートは Spra、x2 は いまの顔ぶれが ふえる。へるときは Spra から", () => {
  const r = start(quiet({ barrels: [{ s: 1.0, x: 0, hp: 1, n: 2, friend: "ruru" }], gates: [{ s: 3, left: "x2", right: "+1" }] }));
  wait(r, 0.3);
  assert.deepEqual(r.crew, ["ruru", "ruru"]);
  assert.ok(r.drainEvents().some(e => e.kind === "barrel" && e.who === "ruru"));
  r.steer(-1); wait(r, 2);
  assert.equal(r.team, 6);
  assert.deepEqual(r.crew, ["ruru", "ruru", "ruru", "ruru", "ruru"], "x2 で Ruru が ふえる");
  const r2 = start(quiet({ gates: [{ s: 1, left: "+2", right: "+2" }] }));
  r2.team = 3; r2.crew = ["kuru", "momo"];
  wait(r2, 1);
  assert.deepEqual(r2.crew, ["kuru", "momo", "spra", "spra"], "+ は Spra");
  const r3 = start(quiet({ gates: [{ s: 1, left: "-3", right: "-3" }] }));
  r3.team = 6; r3.crew = ["spra", "kuru", "spra", "momo", "spra"];
  wait(r3, 1);
  assert.deepEqual(r3.crew, ["kuru", "momo"], "Spra から先に へる");
});

test("Ruru: べちゃべちゃ・硬い うんこを 2倍の力で掃く", () => {
  const go = (crew: ("spra" | "ruru")[]) => {
    const r = start();
    r.team = 2; r.crew = crew; r.x = -1; r.steer(-1);
    const sl = r.members()[1];
    const p = put(r, sl.a + 0.5, sl.x, "large"); p.wet = true; p.hp = p.maxHp = 13;
    r.cooldown = 0; r.step(1 / 120);
    return p.hp;
  };
  // 先頭の ほうきの分は 同じ。Ruru の分だけ 2倍になる
  assert.equal(go(["spra"]) - go(["ruru"]), WBAL.brooms[0].power * (WBAL.ruruPower - 1));
});

test("Kuru: 走ってくる鹿を とめる(だれも とばされない)。雷でも とばされない", () => {
  const r = start(quiet({ chargers: [{ s: 6, x: 0 }] }));
  r.team = 4; r.crew = ["kuru", "kuru", "kuru"];
  r.steer(0);
  const sl = r.members().slice(1);
  r.level.chargers![0].x = sl[0].x;
  wait(r, 4);
  const ev = r.drainEvents();
  assert.ok(ev.some(e => e.kind === "block" && e.who === "kuru"), "Kuru が とめた");
  assert.equal(r.team, 4);
  const b = start(quiet({ bolts: { from: 0, every: 999 } }));
  b.team = 5; b.crew = ["kuru", "kuru", "kuru", "kuru"]; b.cooldown = 99;
  wait(b, 0.05);
  const bolt = b.bolts[0]; bolt.x = b.x; bolt.s = b.d + 0.3;
  wait(b, 2.5);
  assert.equal(b.team, 5, "雷でも とばされない");
});

test("Piko: いると 風で 流されにくい。ほうきの 届きが 長い", () => {
  const drift = (crew: ("spra" | "piko")[]) => {
    const r = start(quiet({ wind: { from: 0, every: 999, dur: 2, force: 1 } }));
    r.team = 2; r.crew = crew; r.cooldown = 99;
    wait(r, 1);
    return Math.abs(r.targetX);
  };
  assert.ok(drift(["piko"]) < drift(["spra"]) * 0.5);
  const r = start();
  r.team = 2; r.crew = ["piko"];
  const sl = r.members()[1];
  const far = put(r, sl.a + WBAL.brooms[0].reach * WBAL.helperReach + 0.2, sl.x);
  assert.ok(r.inReach(far), "Spra なら 届かない所まで 届く");
});

test("Momo: Momo が掃くと お花が 早く咲き、お花の へらす よごれも 多い", () => {
  const flowersAfter = (crew: ("spra" | "momo")[]) => {
    const r = start();
    r.team = 2; r.crew = crew; r.dirt = 10;
    const sl = r.members()[1];
    for (let i = 0; i < 4; i++) { r.cooldown = 0; put(r, sl.a + 0.4, sl.x); r.step(1 / 120); }
    return { n: r.flowers.length, dirt: r.dirt };
  };
  assert.equal(flowersAfter(["spra"]).n, 0);
  const m = flowersAfter(["momo"]);
  assert.equal(m.n, 1, "4こで 咲く");
  assert.equal(m.dirt, 10 - WBAL.flowerHeal * WBAL.momoHeal);
});

test("Lumi: いると 雷・火の粉の 予告が 長い", () => {
  const warn = (crew: ("spra" | "lumi")[]) => {
    const r = start(quiet({ bolts: { from: 0, every: 999 } }));
    r.team = 2; r.crew = crew;
    wait(r, 1 / 120);
    return -r.bolts[0].t;
  };
  assert.ok(warn(["lumi"]) - warn(["spra"]) > WBAL.lumiWarn - 0.05);
});
