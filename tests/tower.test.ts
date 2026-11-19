// WORLD 2 せんべいタワー(設計書 30-6): 落とす・乗る・こんがり・落ちる・崩れる・大判・とどける・ゆれ と、2-3 のバランス
import { test } from "node:test";
import assert from "node:assert/strict";
import { TowerRun, TBAL } from "../src/bake/tower.ts";
import { BAKE_LEVELS, LEVEL_2_3, type TowerLevel } from "../src/bake/levels.ts";
import { driveTower } from "./towerbot.ts";

const lv = (extra: Partial<TowerLevel> = {}): TowerLevel => ({ ...LEVEL_2_3, notes: [], ...extra });
const start = (l = lv()) => { const r = new TowerRun(l); r.start(); return r; };
const wait = (r: TowerRun, sec: number) => { for (let i = 0; i < Math.round(sec * 240); i++) r.step(1 / 240); };
/** ゆれているせんべいを x に置いてから落とし、着くまで待つ */
const dropAt = (r: TowerRun, x: number) => { r.hold.x = x; r.drop(); r.falling!.x = x; wait(r, 0.45); };

test("落とす: お盆のまん中付近はこんがり(ぴったり)。少しずれると、ずれたまま乗る。ふちより外は落ちる", () => {
  const r = start();
  dropAt(r, 0.02);
  assert.equal(r.height, 1); assert.equal(r.stack[0].x, 0); assert.equal(r.stack[0].perfect, true);
  dropAt(r, 0.15);
  assert.equal(r.height, 2); assert.ok(Math.abs(r.stack[1].x - 0.15) < 1e-9); assert.equal(r.stack[1].perfect, false);
  dropAt(r, 0.15 + TBAL.r + 0.02);
  assert.equal(r.height, 2, "ふちより外は乗らない"); assert.equal(r.misses, 1); assert.equal(r.lives, 3, "落としただけでは ♥ は減らない");
});

test("崩れる: 上の重心が、下の段のふちより外へ出ると、そこから上が落ちて ♥−1(下の段は残る)", () => {
  const r = start();
  dropAt(r, 0);
  dropAt(r, 0.18); dropAt(r, 0.36);
  assert.equal(r.height, 3, "2段目・3段目の重心(0.27)は、まだ1段目のふち(0.3)の内");
  assert.equal(r.collapses, 0);
  // 4段目をさらに外へ: 2〜4段目の重心(0.36)が 1段目のふちをこえる
  dropAt(r, 0.54);
  assert.equal(r.collapses, 1); assert.equal(r.lives, 2);
  assert.equal(r.height, 1, "1段目だけ残る");
  assert.ok(r.busy > 0, "崩れている間は、次を落とせない");
});

test("大判せんべい: こんがりを3回続けると、大きなせんべいが来る", () => {
  const r = start();
  for (let i = 0; i < TBAL.bigAfter; i++) { assert.equal(r.hold.big, false); dropAt(r, 0); }
  assert.equal(r.hold.big, true);
  dropAt(r, 0);
  assert.ok(Math.abs(r.stack.at(-1)!.r - TBAL.r * TBAL.bigScale) < 1e-9);
  assert.equal(r.hold.big, false);
});

test("ゆれ: 3段までは ゆれない。高く・不安定なほど大きいが、上限をこえない", () => {
  const r = start();
  for (let i = 0; i < 3; i++) dropAt(r, 0);
  for (let k = 0; k < 50; k++) { r.t = k * 0.1; assert.equal(r.swayTop(), 0); }
  for (let i = 0; i < 9; i++) dropAt(r, i % 2 ? 0.08 : -0.08);
  let max = 0;
  for (let k = 0; k < 100; k++) { r.t = k * 0.05; max = Math.max(max, Math.abs(r.swayTop())); }
  assert.ok(max > 0.1 && max <= TBAL.swayMax + 1e-9, `max=${max}`);
});

test("とどける: 注文の段数より低いと、まだ。とどけるとコイン。注文より4段多いとゴールド。12段でプレミアム", () => {
  const r = start(lv({ orders: [{ kind: "doe", want: 4 }, { kind: "doe", want: 4 }] }));
  r.swayTop = () => 0; // ゆれを止めて、まん中に積む
  wait(r, TBAL.walk + 0.05);
  for (let i = 0; i < 3; i++) dropAt(r, 0);
  r.deliver();
  assert.ok(r.drainEvents().some(e => e.kind === "notYet"));
  for (let i = 0; i < 9; i++) dropAt(r, 0);
  assert.equal(r.height, 12);
  r.deliver();
  assert.equal(r.delivered, 1); assert.equal(r.gold, 1); assert.equal(r.premium, true);
  assert.equal(r.coins, 12 * TBAL.coinPer + 8 * TBAL.coinExtra + 12 * TBAL.coinPerfect);
  assert.equal(r.height, 0, "とどけたら、お盆は空");
  assert.equal(r.customer!.phase, "happy");
});

test("待たせすぎると、鹿は怒って帰る(♥−1)。タワーは残る", () => {
  const r = start();
  dropAt(r, 0);
  wait(r, TBAL.walk + LEVEL_2_3.patience + 0.1);
  assert.equal(r.lives, 2); assert.equal(r.height, 1);
});

test("2-3: 注文どおりにとどけると、ハートを減らさずクリア。とどけないと時間切れ", () => {
  const r = driveTower(LEVEL_2_3);
  assert.equal(r.phase, "cleared"); assert.equal(r.lives, 3); assert.equal(r.premium, false);
  const n = driveTower(LEVEL_2_3, { deliver: false });
  assert.equal(n.phase, "failed"); assert.equal(n.reason, "time");
});

test("2-3: 手がぶれても(±0.1m)注文どおりならクリアできる。欲ばって高く積むほど、落としたり崩したりがふえる", () => {
  let fallSafe = 0, fallGreedy = 0, clearSafe = 0;
  for (let s = 1; s <= 20; s++) {
    const a = driveTower(LEVEL_2_3, { err: 0.1, errSide: "rand", seed: s * 7919, naive: true });
    const b = driveTower(LEVEL_2_3, { err: 0.1, errSide: "rand", seed: s * 7919, naive: true, greed: 4 });
    if (a.phase === "cleared") clearSafe++;
    fallSafe += a.misses + a.collapses; fallGreedy += b.misses + b.collapses;
  }
  assert.ok(clearSafe >= 19, `clear=${clearSafe}`);
  assert.ok(fallGreedy > fallSafe * 3 + 5, `safe=${fallSafe} greedy=${fallGreedy}`);
});

test("2-3: いつも同じ側へずらして積むと、崩れる", () => {
  const r = driveTower(LEVEL_2_3, { err: 0.1, errSide: "same" });
  assert.ok(r.collapses > 0);
});

// ---- 2-6: 風・下を食べる鹿・Piko ----
test("風: 予告のあとに ふいて、落ちている せんべいが 流される。Piko が手伝うと 弱い", () => {
  const base = { ...LEVEL_2_3, notes: [], wind: { from: 0, every: 99, dur: 5, force: 1 } } as TowerLevel;
  const drift = (helpers: ("piko")[]) => {
    const r = new TowerRun({ ...base, helpers });
    r.start();
    for (let i = 0; i < 120 * (TBAL.windWarn + 0.1); i++) r.step(1 / 120);
    assert.notEqual(r.wind, 0);
    r.hold.x = 0; r.drop();
    const x0 = r.falling!.x;
    while (r.falling) { const f = r.falling; r.step(1 / 120); if (!r.falling) return Math.abs(f.x - x0); }
    return 0;
  };
  const free = drift([]), piko = drift(["piko"]);
  assert.ok(free > 0.25, `流される ${free}`);
  assert.ok(piko < free * 0.5, `Piko がいると 弱い ${piko}`);
});

test("下を食べる鹿: いちばん下の段を 食べる(1段目で ♥−1)。タップで おいはらえる", () => {
  const lv = { ...LEVEL_2_3, notes: [], orders: [], nibblers: [{ t: 0, side: -1 as const }] } as TowerLevel;
  const r = new TowerRun(lv);
  r.start();
  r.stack = [0, 0, 0, 0].map(() => ({ x: 0, r: TBAL.r, perfect: false }));
  for (let i = 0; i < 120 * (TBAL.nibWalk + TBAL.nibAim + 0.1); i++) r.step(1 / 120);
  assert.equal(r.height, 3, "1段 食べられた");
  assert.equal(r.lives, TBAL.lives - 1);
  const s = new TowerRun(lv);
  s.start();
  s.stack = [0, 0, 0].map(() => ({ x: 0, r: TBAL.r, perfect: false }));
  for (let i = 0; i < 120; i++) s.step(1 / 120);
  s.shoo();
  for (let i = 0; i < 120 * 5; i++) s.step(1 / 120);
  assert.equal(s.height, 3, "おいはらえば 食べられない");
  assert.equal(s.lives, TBAL.lives);
});

test("2-6: 手がぶれても(±0.1m)、風を 見こして 鹿を おいはらえば クリア。おいはらわないと 失敗", () => {
  const lv = BAKE_LEVELS.find(l => l.id === "2-6") as TowerLevel;
  let ok = 0, lazy = 0;
  for (let seed = 1; seed <= 6; seed++) {
    if (driveTower(lv, { err: 0.1, errSide: "rand", seed, windComp: 0.5, shooDelay: 1 }).phase === "cleared") ok++;
    if (driveTower(lv, { err: 0.1, errSide: "rand", seed, windComp: 0.5, shooDelay: 999 }).phase === "cleared") lazy++;
  }
  assert.ok(ok >= 5, `${ok}/6`);
  assert.equal(lazy, 0);
});
