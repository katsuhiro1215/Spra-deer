// WORLD 2 せんべい くばり(設計書 30-7): 投げる・受けとる・ぴったり・はずれ・拾い食い・待たせすぎ・せんべい切れ・歩く鹿 と、2-4 のバランス
import { test } from "node:test";
import assert from "node:assert/strict";
import { TossRun, SBAL } from "../src/bake/toss.ts";
import { BAKE_LEVELS, LEVEL_2_4, type TossLevel, type TossArrival } from "../src/bake/levels.ts";
import { driveToss } from "./tossbot.ts";

const lv = (arrivals: TossArrival[], extra: Partial<TossLevel> = {}): TossLevel => ({ ...LEVEL_2_4, notes: [], arrivals, ...extra });
const one = (x: number, z: number, want = 1, extra: Partial<TossArrival> = {}): TossArrival => ({ t: 0, kind: "doe", at: [x, z], want, ...extra });
const start = (l: TossLevel) => { const r = new TossRun(l); r.start(); return r; };
const wait = (r: TossRun, sec: number) => { for (let i = 0; i < Math.round(sec * 240); i++) r.step(1 / 240); };
/** 鹿が着くまで待つ */
const arrive = (r: TossRun) => { wait(r, 3.2); assert.ok(r.deer.every(d => d.phase === "wait"), "鹿が着いて待っている"); };
/** (x, z)へ投げて、着くまで待つ */
const toss = (r: TossRun, x: number, z: number) => { assert.ok(r.throwTo(x, z), "投げられる"); wait(r, 1.2); };
const kinds = (r: TossRun) => r.drainEvents().map(e => e.kind);

test("ねらい: 向きと力から着く所を決める。aimFor はその逆。遠いほど長く高くとぶ", () => {
  const r = start(lv([]));
  for (const [x, z] of [[0, -3.4], [1.1, -5.4], [-2, -7.8]] as [number, number][]) {
    const a = r.aimFor(x, z), p = r.aim(a.heading, a.power);
    assert.ok(Math.abs(p.x - x) < 1e-9 && Math.abs(p.z - z) < 1e-9);
  }
  const near = r.aim(0, 0.1), far = r.aim(0, 0.9);
  assert.ok(far.dist > near.dist && far.T > near.T && far.h > near.h);
  assert.ok(Math.abs(r.aim(5, 1).x - Math.sin(SBAL.maxAngle) * SBAL.dMax) < 1e-9, "横すぎる向きは、はしで止める");
});

test("投げる: 鹿の輪に入れば受けとって満足。まん中は「ぴったり」。投げたら、少しの間 次は投げられない", () => {
  const r = start(lv([one(0, -3.4), one(1.5, -5.4)], { goal: 5 }));
  arrive(r); r.drainEvents();
  assert.ok(r.throwTo(0.05, -3.4));
  assert.equal(r.stock, LEVEL_2_4.senbei - 1);
  assert.equal(r.throwTo(1.5, -5.4), false, "持ちかえる間は投げられない");
  wait(r, 1.2);
  const ev = kinds(r);
  assert.ok(ev.includes("perfect") && ev.includes("served"));
  assert.equal(r.served, 1); assert.equal(r.perfects, 1); assert.equal(r.streak, 1);
  // ふち近く(輪の内・まん中の外)は、ふつうのキャッチ。連続は切れる
  toss(r, 1.5 + SBAL.catchR.doe - 0.08, -5.4);
  assert.equal(r.served, 2); assert.equal(r.caught, 2); assert.equal(r.perfects, 1); assert.equal(r.streak, 0);
  assert.ok(r.coins > 0);
});

test("2まい ほしい鹿は、2まい目で満足。1まいもらうと、少し待ってくれる", () => {
  const r = start(lv([one(0, -5.4, 2)], { goal: 5 }));
  arrive(r);
  wait(r, 8);
  toss(r, 0, -5.4);
  const d = r.deer[0];
  assert.equal(d.got, 1); assert.equal(r.served, 0);
  assert.ok(d.waited < 8 - SBAL.relief + 1.5, "待った時間が へる");
  wait(r, 0.4);
  toss(r, 0, -5.4);
  assert.equal(r.served, 1);
});

test("はずれ: 地面に落ちる。近くの鹿は拾って食べる(コインは少し)。だれもいなければ、しばらくして消える", () => {
  const r = start(lv([one(0, -5.4)], { goal: 5 }));
  arrive(r); r.drainEvents();
  // 輪の外・拾える近さ
  toss(r, 0, -5.4 + SBAL.catchR.doe + 0.2);
  assert.equal(r.misses, 1); assert.equal(r.streak, 0);
  wait(r, 1.5);
  const ev = kinds(r);
  assert.ok(ev.includes("miss") && ev.includes("pick"));
  assert.equal(r.picks, 1); assert.equal(r.served, 1); assert.equal(r.ground.length, 0);
  // だれもいない所
  const r2 = start(lv([], { goal: 5 }));
  toss(r2, 2, -8);
  assert.equal(r2.ground.length, 1);
  wait(r2, SBAL.groundLife + 0.1);
  assert.equal(r2.ground.length, 0);
  assert.ok(kinds(r2).includes("vanish"));
});

test("待たせすぎると、鹿はおこって帰り ♥−1", () => {
  const r = start(lv([one(0, -3.4)], { goal: 5 }));
  arrive(r);
  wait(r, LEVEL_2_4.patience.doe + 0.1);
  assert.equal(r.lives, SBAL.lives - 1);
  assert.ok(kinds(r).includes("angry"));
});

test("せんべいが なくなって、目標にとどかなければ おしまい(とんでいる・拾われそうな せんべいが 片づいてから)", () => {
  const r = start(lv([one(0, -3.4, 3)], { goal: 1, senbei: 2 }));
  arrive(r);
  toss(r, 0, -3.4);
  assert.ok(r.throwTo(2.5, -9));
  wait(r, 0.3);
  assert.equal(r.phase, "running", "とんでいる間は まだ");
  wait(r, 1.2 + SBAL.groundLife);
  assert.equal(r.phase, "failed"); assert.equal(r.reason, "empty");
});

test("クリア: あまった せんべいは コインに", () => {
  const r = start(lv([one(0, -3.4)], { goal: 1, senbei: 10 }));
  arrive(r);
  const before = r.coins;
  toss(r, 0, -3.4);
  assert.equal(r.phase, "cleared");
  assert.ok(r.coins - before >= 9 * SBAL.coinLeft);
});

test("プレミアム: 「ぴったり」を続けると出る(はずれで連続は切れる)", () => {
  const n = LEVEL_2_4.premiumStreak;
  const r = start(lv([one(0, -3.4, n * 2 + 2)], { goal: 5 }));
  arrive(r);
  for (let i = 0; i < n - 1; i++) { toss(r, 0, -3.4); wait(r, 0.6); }
  toss(r, 2.5, -9);
  assert.equal(r.streak, 0);
  for (let i = 0; i < n; i++) { toss(r, 0, -3.4); wait(r, 0.6); }
  assert.equal(r.premium, true);
});

test("歩く鹿: 待っている間、立つ場所と move の間を 行ったり来たり", () => {
  const r = start(lv([one(-1.6, -5.4, 1, { move: [1.6, -5.4], speed: 0.8 })], { goal: 5 }));
  arrive(r);
  const xs: number[] = [];
  for (let i = 0; i < 40; i++) { wait(r, 0.25); xs.push(r.deer[0].x); }
  assert.ok(Math.max(...xs) > 1.4 && Math.min(...xs) < -1.4, "両はしまで歩く");
  assert.ok(xs.every(x => x >= -1.6 - 1e-9 && x <= 1.6 + 1e-9), "道の外へは出ない");
});

test("同じ場所には、前の鹿が去るまで次の鹿は来ない", () => {
  const r = start(lv([one(0, -3.4), { ...one(0.3, -3.4), t: 1 }], { goal: 5 }));
  wait(r, 4);
  assert.equal(r.deer.length, 1);
  toss(r, 0, -3.4);
  wait(r, SBAL.eat + 0.2);
  assert.equal(r.deer.length, 2, "前の鹿が帰りはじめたら来る");
});

test("2-4 のバランス: ねらいが正確なら プレミアム。ぶれ15%でもクリア。ぶれ35%は せんべい切れが多い", () => {
  const perfect = driveToss(LEVEL_2_4);
  assert.equal(perfect.phase, "cleared"); assert.equal(perfect.premium, true); assert.equal(perfect.lives, 3);
  const H = { react: 1.0, pause: 1.2 };
  let ok15 = 0, ok35 = 0;
  for (let seed = 1; seed <= 20; seed++) {
    if (driveToss(LEVEL_2_4, { errD: 0.15, errX: 0.25, seed, ...H }).phase === "cleared") ok15++;
    if (driveToss(LEVEL_2_4, { errD: 0.35, errX: 0.45, seed, ...H }).phase === "cleared") ok35++;
  }
  assert.ok(ok15 >= 19, `ぶれ15%のクリア ${ok15}/20`);
  assert.ok(ok35 <= 12, `ぶれ35%のクリア ${ok35}/20`);
});

// ---- 2-7: 風・Momo ----
test("風: 予告のあとに ふいて、とんでいる せんべいが 横へ 流される(Piko が手伝うと 弱い)。Momo がいると 鹿が 長く待つ", () => {
  const land = (helpers: ("piko" | "momo")[]) => {
    const r = start(lv([one(0, -5.4)], { helpers, wind: { from: 0, every: 99, dur: 9, force: 1 } }));
    wait(r, SBAL.windWarn + 0.1);
    assert.notEqual(r.wind, 0);
    r.throwTo(0, -5.4);
    const f = r.flights[0];
    let x = 0;
    while (r.flights.includes(f)) { x = f.x1; r.step(1 / 240); }
    return Math.abs(x);
  };
  const free = land([]), piko = land(["piko"]);
  assert.ok(free > 0.4, `流される ${free}`);
  assert.ok(piko < free * 0.5, `Piko ${piko}`);
  const m = start(lv([one(0, -5.4)], { helpers: ["momo"] }));
  wait(m, 0.1);
  assert.ok(m.deer[0].patience > LEVEL_2_4.patience.doe * 1.2);
});

test("2-7 のバランス: ぶれ15%で 風を 見こせば クリア。2-4 より むずかしい(ぶれ25%で 差が出る)", () => {
  const lv27 = BAKE_LEVELS.find(l => l.id === "2-7") as TossLevel;
  let ok = 0, sloppy27 = 0, sloppy24 = 0;
  for (let seed = 1; seed <= 6; seed++) {
    if (driveToss(lv27, { errD: 0.15, errX: 0.2, seed }).phase === "cleared") ok++;
    if (driveToss(lv27, { errD: 0.25, errX: 0.3, react: 1.2, seed }).phase === "cleared") sloppy27++;
    if (driveToss(LEVEL_2_4, { errD: 0.25, errX: 0.3, react: 1.2, seed }).phase === "cleared") sloppy24++;
  }
  assert.ok(ok >= 5, `2-7 ふつう ${ok}/6`);
  assert.ok(sloppy27 < sloppy24, `ぶれ25%: 2-7 ${sloppy27} < 2-4 ${sloppy24}`);
});
