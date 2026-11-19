// WORLD 2 せんべい屋台(設計書 30章): 焼く・裏返す・焦げる・渡す・怒る・プレミアム と、2-1 のバランス
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BakeRun, BAL } from '../src/bake/sim.ts';
import { BAKE_LEVELS, LEVEL_2_1, LEVEL_2_2, isBake, type BakeLevel } from '../src/bake/levels.ts';
import { drive } from './bakebot.ts';

const quiet = (extra: Partial<BakeLevel> = {}): BakeLevel => ({ ...LEVEL_2_1, arrivals: [], notes: [], ...extra });
const run = (lv: BakeLevel) => { const r = new BakeRun(lv); r.start(); return r; };
const wait = (r: BakeRun, sec: number) => { for (let i = 0; i < Math.round(sec * 100); i++) r.step(0.01); };

test('焼く: 生地 → 片面 → 早すぎると裏返せない → 裏返す → もう片面 → 台へ', () => {
  const r = run(quiet());
  r.tapPlate(0);
  assert.equal(r.plates[0].state, 'pour');
  wait(r, BAL.pour + 1);
  r.tapPlate(0);
  assert.equal(r.plates[0].state, 'side1', '早すぎると、そのまま');
  assert.ok(r.drainEvents().some(e => e.kind === 'early'));
  wait(r, 3);
  r.tapPlate(0);
  assert.equal(r.plates[0].state, 'flip');
  wait(r, BAL.flip + LEVEL_2_1.cook.ok + 0.2);
  r.tapPlate(0);
  assert.equal(r.plates[0].state, 'empty');
  assert.equal(r.tray.length, 1);
});

test('こんがり: 両面とも金色の間でタップすると極上。5枚続けるとプレミアム', () => {
  const r = run(quiet());
  const mid = (LEVEL_2_1.cook.perfect[0] + LEVEL_2_1.cook.perfect[1]) / 2;
  for (let n = 0; n < 5; n++) {
    r.tapPlate(0); wait(r, BAL.pour + mid); r.tapPlate(0);
    wait(r, BAL.flip + mid); r.tapPlate(0);
    if (n < 4) assert.equal(r.premium, false);
  }
  assert.equal(r.gokujoCount, 5);
  assert.equal(r.premium, true);
  assert.ok(r.tray.every(s => s.gokujo));
  // 普通のせんべい(焼けてすぐ)は極上にならず、続けた数が 0 に戻る
  r.tray.length = 0;
  r.tapPlate(0); wait(r, BAL.pour + LEVEL_2_1.cook.ok + 0.05); r.tapPlate(0);
  wait(r, BAL.flip + mid); r.tapPlate(0);
  assert.equal(r.tray[0].gokujo, false);
  assert.equal(r.streak, 0);
});

test('焦げる: 煙が出て、焼きすぎるとハートが減る。タップで片づけると、また使える', () => {
  const r = run(quiet());
  r.tapPlate(1);
  wait(r, BAL.pour + LEVEL_2_1.cook.smoke + 0.05);
  assert.equal(r.plates[1].smoking, true);
  assert.equal(r.lives, 3);
  wait(r, LEVEL_2_1.cook.burn - LEVEL_2_1.cook.smoke);
  assert.equal(r.plates[1].state, 'burnt');
  assert.equal(r.lives, 2);
  r.tapPlate(1);
  wait(r, BAL.discard + 0.05);
  assert.equal(r.plates[1].state, 'empty');
});

test('台は6枚まで。いっぱいだと台へ移せない(鉄板の上で焼けつづける)', () => {
  const r = run(quiet());
  r.tray = Array.from({ length: BAL.trayMax }, (_, i) => ({ id: 100 + i, gokujo: false }));
  r.tapPlate(0); wait(r, BAL.pour + 3.5); r.tapPlate(0); wait(r, BAL.flip + 3.5);
  r.tapPlate(0);
  assert.equal(r.plates[0].state, 'side2');
  assert.ok(r.drainEvents().some(e => e.kind === 'full'));
});

test('鹿: 歩いてきて、注文の数だけ受け取ると満足。待たせすぎると怒ってハートが減る', () => {
  const r = run(quiet({ arrivals: [{ t: 0, kind: 'doe', want: 2 }, { t: 0, kind: 'fawn', want: 1 }] }));
  wait(r, 0.05);
  const [a, b] = [r.spots.find(d => d?.kind === 'doe')!, r.spots.find(d => d?.kind === 'fawn')!];
  r.tray = [{ id: 1, gokujo: true }, { id: 2, gokujo: true }];
  r.tapDeer(a.spot);
  assert.equal(a.got, 0, '歩いている間は受け取らない');
  wait(r, BAL.walk);
  r.tapDeer(a.spot); wait(r, BAL.eat + 0.05);
  r.tapDeer(a.spot); wait(r, BAL.eat + 0.05);
  assert.equal(a.phase, 'happy');
  assert.equal(r.served, 1);
  assert.equal(r.gold, 1, '2枚以上の注文を、全部極上でわたすとゴールド');
  assert.equal(r.coins, BAL.coinGokujo * 2);
  r.tapDeer(b.spot);
  assert.ok(r.drainEvents().some(e => e.kind === 'empty'), '台が空なら、わたせない');
  wait(r, LEVEL_2_1.patience.fawn);
  assert.equal(b.phase, 'angry');
  assert.equal(r.lives, 2);
  wait(r, BAL.angry + 0.1);
  assert.equal(r.spots[b.spot], null, '怒った鹿は帰る');
});

test('鹿の場所は3つ。空きがないときは、空くまで待ってから来る', () => {
  const r = run(quiet({ arrivals: [0, 0, 0, 0].map(t => ({ t, kind: 'fawn' as const, want: 1 })) }));
  wait(r, 0.05);
  assert.equal(r.deer.length, 3);
  const first = r.deer[0];
  r.tray = [{ id: 1, gokujo: false }];
  wait(r, BAL.walk); r.tapDeer(first.spot); wait(r, BAL.eat + BAL.happy + 0.1);
  assert.equal(r.deer.length, 3, '帰った場所に、4頭目が来る');
  assert.equal(r.spots[first.spot]!.phase, 'walk');
});

test('時間切れで失敗。ハートが0でも失敗', () => {
  const r = run(quiet({ time: 5 }));
  wait(r, 5.05);
  assert.equal(r.phase, 'failed');
  assert.equal(r.reason, 'time');
});

test('2-1: こんがりを狙うと、ハートを減らさずクリアし、プレミアムも出る', () => {
  const r = drive(LEVEL_2_1, { timing: 'perfect', delay: 0.4 });
  assert.equal(r.phase, 'cleared', `served=${r.served} t=${r.t.toFixed(1)} lives=${r.lives}`);
  assert.equal(r.lives, 3);
  assert.equal(r.premium, true);
  assert.ok(r.t < LEVEL_2_1.time - 20, `時間に余裕がある t=${r.t.toFixed(1)}`);
});

test('2-1: 焼けてすぐタップでもクリアできる(プレミアムは出ない)', () => {
  const r = drive(LEVEL_2_1, { timing: 'ok', delay: 0.4 });
  assert.equal(r.phase, 'cleared');
  assert.equal(r.premium, false);
});

test('2-1: 裏返さないと焦げて失敗。鹿にわたさないと怒らせて失敗', () => {
  const a = drive(LEVEL_2_1, { timing: 'never' });
  assert.equal(a.phase, 'failed'); assert.equal(a.reason, 'burnt');
  const b = drive(LEVEL_2_1, { serve: false });
  assert.equal(b.phase, 'failed'); assert.equal(b.reason, 'angry');
});

test('2-1: 先に焼きためないと(1枚ずつ)、鹿を待たせてしまう', () => {
  const r = drive(LEVEL_2_1, { stock: 1, delay: 0.4 });
  assert.ok(r.phase === 'failed' || r.lives < 3, `phase=${r.phase} lives=${r.lives}`);
});

test('どの面も: 鹿の来る時刻が順番どおり・注文は1〜3枚(団体さんは 5枚まで)・こんがりの幅は ok と smoke の間', () => {
  // 焼く面だけ(積む面は tests/tower.test.ts)
  for (const lv of BAKE_LEVELS.filter(isBake)) {
    lv.arrivals.forEach((a, i) => { if (i) assert.ok(a.t >= lv.arrivals[i - 1].t, lv.id); assert.ok(a.want >= 1 && a.want <= (lv.id === '2-8' || lv.id >= '2-9' ? 5 : 3), lv.id); });
    const c = lv.cook;
    assert.ok(c.ok < c.perfect[0] && c.perfect[0] < c.perfect[1] && c.perfect[1] < c.smoke && c.smoke < c.burn, lv.id);
    assert.ok(lv.arrivals.length >= lv.goal + 3, `${lv.id}: 失敗しても取りかえせる数の鹿が来る`);
  }
});

// ---- 2-2: くいしんぼう鹿 ----
test("くいしんぼう鹿: 歩いてきて、台をねらい(予告)、鹿のいる側の端から食べる。1枚目でハート −1", () => {
  const r = run(quiet({ sneaks: [{ t: 0, side: 1 }] }));
  r.tray = [{ id: 1, gokujo: false }, { id: 2, gokujo: true }, { id: 3, gokujo: false }, { id: 4, gokujo: false }];
  wait(r, 0.05);
  assert.equal(r.sneak?.phase, "walk");
  wait(r, BAL.sneakWalk);
  assert.equal(r.sneak?.phase, "aim");
  assert.equal(r.tray.length, 4, "ねらっている間は、まだ食べない");
  wait(r, BAL.sneakAim);
  assert.deepEqual(r.tray.map(s => s.id), [1, 2, 3], "右から来た鹿は、右の端(最後)から食べる");
  assert.equal(r.lives, 2);
  wait(r, BAL.sneakBite * 2 + 0.05);
  assert.equal(r.tray.length, 1, `1回に ${BAL.sneakBites}枚まで`);
  assert.equal(r.lives, 2, "ハートが減るのは、1頭につき1回");
  wait(r, BAL.sneakBite + BAL.sneakLeave + 0.1);
  assert.equal(r.sneak, null, "食べたら帰る");
  assert.equal(r.tray.length, 1);
});

test("くいしんぼう鹿: タップで逃げる(食べている途中でも)。台が空なら、取られずに帰る", () => {
  const a = run(quiet({ sneaks: [{ t: 0, side: -1 }] }));
  a.tray = [{ id: 1, gokujo: false }, { id: 2, gokujo: false }];
  wait(a, 0.05); a.tapSneak();
  assert.equal(a.sneak?.phase, "flee");
  wait(a, BAL.sneakFlee + 0.05);
  assert.equal(a.sneak, null);
  assert.equal(a.tray.length, 2); assert.equal(a.lives, 3); assert.equal(a.shooed, 1); assert.equal(a.lateShoo, 0);
  const b = run(quiet({ sneaks: [{ t: 0, side: -1 }] }));
  b.tray = [{ id: 1, gokujo: false }, { id: 2, gokujo: false }];
  wait(b, BAL.sneakWalk + BAL.sneakAim + 0.05);
  assert.deepEqual(b.tray.map(s => s.id), [2], "左から来た鹿は、左の端から食べる");
  b.tapSneak();
  assert.equal(b.sneak?.phase, "flee"); assert.equal(b.lateShoo, 1);
  const c = run(quiet({ sneaks: [{ t: 0, side: 1 }] }));
  wait(c, BAL.sneakWalk + BAL.sneakAim + BAL.sneakWaitEmpty + BAL.sneakLeave + 0.2);
  assert.equal(c.sneak, null); assert.equal(c.lives, 3); assert.equal(c.stolen, 0);
});

test("2-2: 追いはらえば、反応が2秒おそくてもハートを減らさずクリア。台に着く前に全部追いはらうとプレミアム", () => {
  const r = drive(LEVEL_2_2, { delay: 0.4 });
  assert.equal(r.phase, "cleared", `served=${r.served} lives=${r.lives}`);
  assert.equal(r.lives, 3); assert.equal(r.stolen, 0); assert.equal(r.premium, true);
  const slow = drive(LEVEL_2_2, { delay: 2 });
  assert.equal(slow.phase, "cleared"); assert.equal(slow.lives, 3);
  const aim = drive(LEVEL_2_2, { delay: 0.4, shoo: "aim" });
  assert.equal(aim.phase, "cleared"); assert.equal(aim.lives, 3);
  assert.equal(aim.premium, false, "台をねらってから追いはらうと、プレミアムは出ない");
});

test("2-2: 追いはらわない・食べられてから追いはらうと、失敗する", () => {
  for (const shoo of [false, "late"] as const) {
    const r = drive(LEVEL_2_2, { delay: 0.4, shoo });
    assert.equal(r.phase, "failed", `shoo=${shoo}`);
    assert.equal(r.reason, "stolen");
  }
});

// ---- 2-5 から: 焼き加減の注文・火の強さ・お店を手伝う なかま ----
/** 鉄板 i で、両面を 焼け具合 t1・t2 で 取る */
const bakeOne = (r: BakeRun, i: number, t1: number, t2: number) => {
  r.tapPlate(i); wait(r, BAL.pour + 0.01);
  wait(r, t1); r.tapPlate(i);
  wait(r, BAL.flip + 0.01);
  wait(r, t2); r.tapPlate(i);
};

test('焼き加減の注文: 「やわらか」の鹿は やわらか、「こんがり」の鹿は 極上だけ 受けとる。合わないと 受けとらない', () => {
  const c = LEVEL_2_1.cook;
  const r = run(quiet({ arrivals: [{ t: 0, kind: 'fawn', want: 1, taste: 'soft' }, { t: 0, kind: 'stag', want: 1, taste: 'crisp' }] }));
  bakeOne(r, 0, (c.ok + c.perfect[0]) / 2, (c.ok + c.perfect[0]) / 2);
  assert.equal(r.tray[0].soft, true, '両面 金色の前 → やわらか');
  wait(r, BAL.walk);
  const stag = r.deer.find(d => d.kind === 'stag')!, fawn = r.deer.find(d => d.kind === 'fawn')!;
  r.drainEvents();
  r.tapDeer(stag.spot);
  assert.ok(r.drainEvents().some(e => e.kind === 'wrong'), 'こんがりの鹿は やわらかを 受けとらない');
  assert.equal(r.tray.length, 1);
  r.tapDeer(fawn.spot);
  assert.equal(r.tray.length, 0, 'やわらかの鹿は 受けとる');
});

test('火の強さ: 強火の鉄板は 速く焼け、弱火は ゆっくり', () => {
  const r = run(quiet({ plates: 3, heat: [1.5, 1, 0.5] }));
  for (let i = 0; i < 3; i++) r.tapPlate(i);
  wait(r, BAL.pour + 2);
  const [a, b, c] = r.plates.map(p => p.t);
  assert.ok(Math.abs(a - 3) < 0.05 && Math.abs(b - 2) < 0.05 && Math.abs(c - 1) < 0.05, `${a} ${b} ${c}`);
});

test('Ruru: 焦げそうな 鉄板に 水を かけて もどす(間をあけて 1回ずつ)', () => {
  const c = LEVEL_2_1.cook;
  const r = run(quiet({ helpers: ['ruru'] }));
  r.tapPlate(0); r.tapPlate(1);
  wait(r, BAL.pour + c.smoke + 0.05);
  const ev = r.drainEvents();
  assert.equal(ev.filter(e => e.kind === 'water').length, 1, '1回だけ');
  assert.equal(r.burntCount, 0);
  wait(r, c.burn - c.smoke);
  assert.equal(r.burntCount, 1, 'もう1まいは 間に合わず 焦げる');
  const solo = run(quiet());
  solo.tapPlate(0); wait(solo, BAL.pour + c.burn + 0.05);
  assert.equal(solo.burntCount, 1, 'Ruru が いなければ 焦げる');
});

test('Kuru: 左から来た くいしんぼう鹿を 通せんぼ(右から来たのは 通る)', () => {
  const r = run(quiet({ helpers: ['kuru'], sneaks: [{ t: 0, side: -1 }, { t: 0.1, side: 1 }] }));
  wait(r, BAL.sneakWalk + 0.1);
  assert.ok(r.drainEvents().some(e => e.kind === 'block'));
  wait(r, BAL.sneakFlee + 0.1);
  wait(r, BAL.sneakWalk + 0.1);
  assert.equal(r.sneak?.phase, 'aim', '右から来た鹿は 台を ねらう');
});

test('Lumi: 金色の時間が のびる・Momo: 鹿が 長く 待つ', () => {
  const c = LEVEL_2_1.cook;
  const lumi = run(quiet({ helpers: ['lumi'] }));
  assert.equal(lumi.quality(c.perfect[0] - 0.1), 'perfect');
  assert.equal(run(quiet()).quality(c.perfect[0] - 0.1), 'soft');
  const momo = run(quiet({ helpers: ['momo'], arrivals: [{ t: 0, kind: 'doe', want: 1 }] }));
  wait(momo, 0.1);
  assert.ok(momo.deer[0].patience > LEVEL_2_1.patience.doe * 1.2);
});

test('2-5・2-8 のバランス: 人の手の ぶれ(±0.45秒)が あっても クリア。焼き加減を 気にしないと ハートが へる', () => {
  for (const id of ['2-5', '2-8']) {
    const lv = BAKE_LEVELS.find(l => l.id === id)!;
    assert.ok(isBake(lv));
    let clear = 0;
    for (let seed = 1; seed <= 6; seed++) if (drive(lv, { delay: 0.6, jitter: 0.45, seed }).phase === 'cleared') clear++;
    assert.ok(clear >= 5, `${id} ${clear}/6`);
  }
  const careless = drive(BAKE_LEVELS.find(l => l.id === '2-5') as BakeLevel, { timing: 'ok', delay: 0.4 });
  assert.ok(careless.lives < 3, '「やわらか」「こんがり」を 気にしないと ハートが へる');
});
