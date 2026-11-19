// 体力・コイン・面のひらき方(設計書 25章)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, clearRewards, STAMINA_MAX, STAMINA_FAIL, STAMINA_REGEN_MS, POTION } from '../src/wallet.ts';
import { Progress } from '../src/progress.ts';
import { ALL_PLAYABLE_SLOTS } from '../src/game/levels.ts';

/** 読み書きできる、テスト用の localStorage */
function memoryStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

test('体力: 最初は満タン。失敗で2減り、3分で1つ戻る', () => {
  let t = 1_000_000;
  const w = new Wallet(() => t, memoryStore());
  assert.equal(w.stamina, STAMINA_MAX);
  assert.equal(w.nextIn, null);
  w.fail();
  assert.equal(w.stamina, STAMINA_MAX - STAMINA_FAIL);
  t += STAMINA_REGEN_MS - 1;
  assert.equal(w.stamina, STAMINA_MAX - 2);
  t += 1;
  assert.equal(w.stamina, STAMINA_MAX - 1);
  t += STAMINA_REGEN_MS * 10;
  assert.equal(w.stamina, STAMINA_MAX, '満タンより増えない');
});

test('体力: ゼロから満タンまで1時間', () => {
  let t = 0;
  const w = new Wallet(() => t, memoryStore());
  for (let i = 0; i < STAMINA_MAX / STAMINA_FAIL; i++) w.fail();
  assert.equal(w.stamina, 0);
  assert.equal(w.canPlay(), false);
  assert.equal(w.waitToPlay, 2 * STAMINA_REGEN_MS);
  t += 60 * 60 * 1000;
  assert.equal(w.stamina, STAMINA_MAX);
});

test('体力: 途中の時間(端数)は、次の回復に持ちこす', () => {
  let t = 0;
  const w = new Wallet(() => t, memoryStore());
  w.fail(); // 18。ここから数える
  t += STAMINA_REGEN_MS * 1.5;
  assert.equal(w.stamina, 19);
  assert.equal(w.nextIn, STAMINA_REGEN_MS * 0.5);
  w.fail(); // 17。端数(半分)はそのまま
  t += STAMINA_REGEN_MS * 0.5;
  assert.equal(w.stamina, 18);
});

test('保存して、読み直せる(体力・コイン・プレミアムの取った面)', () => {
  let t = 5000;
  const store = memoryStore();
  const a = new Wallet(() => t, store);
  a.fail();
  a.earn('silver', 120);
  a.takePremium('3-1');
  const b = new Wallet(() => t, store);
  assert.equal(b.stamina, STAMINA_MAX - 2);
  assert.equal(b.coins.silver, 120);
  assert.equal(b.coins.premium, 1);
  assert.equal(b.hasPremium('3-1'), true);
  assert.equal(b.takePremium('3-1'), false, '同じ面のプレミアムは1回だけ');
  assert.equal(b.coins.premium, 1);
});

test('こわれた保存データでも遊べる', () => {
  const store = memoryStore();
  store.setItem('spra-deer:wallet:v1', '{"stamina":-5,"at":"x","coins":{"silver":1.5,"gold":-1}}');
  const w = new Wallet(() => 0, store);
  assert.equal(w.stamina, 0);
  assert.deepEqual(w.coins, { silver: 0, gold: 0, premium: 0 });
});

test('クリアのごほうび: シルバーは取ったぶん、ゴールドははじめてのクリア+2・★3+3(1回だけ)', () => {
  const w = new Wallet(() => 0, memoryStore());
  const g1 = clearRewards(w, '3-1', { silver: 140, star3: false });
  assert.deepEqual(g1, { silver: 140, gold: 2, premium: 0 });
  const g2 = clearRewards(w, '3-1', { silver: 190, gold: 1, star3: true });
  assert.deepEqual(g2, { silver: 190, gold: 4, premium: 0 });
  const g3 = clearRewards(w, '3-1', { silver: 190, star3: true });
  assert.deepEqual(g3, { silver: 190, gold: 0, premium: 0 });
  assert.equal(w.coins.gold, 6);
});

test('回復薬: シルバー300枚で体力+10。足りない・満タンなら買わない', () => {
  const w = new Wallet(() => 0, memoryStore());
  assert.equal(w.buyPotion(), false, '満タン');
  for (let i = 0; i < 8; i++) w.fail(); // 4
  assert.equal(w.buyPotion(), false, 'コインが足りない');
  w.earn('silver', POTION.price);
  assert.equal(w.buyPotion(), true);
  assert.equal(w.stamina, 14);
  assert.equal(w.coins.silver, 0);
});

test('面のひらき方: ワールドの中は順番、次のワールドは前のワールドを3面クリアで開く', () => {
  const p = new Progress();
  p.unlockAll = false;
  const stages = [...new Set(ALL_PLAYABLE_SLOTS.map(l => l.stage))];
  const w1 = ALL_PLAYABLE_SLOTS.filter(l => l.stage === stages[0]);
  const w2 = ALL_PLAYABLE_SLOTS.filter(l => l.stage === stages[1]);
  assert.equal(p.isUnlocked(w1[0].id), true);
  assert.equal(p.isUnlocked(w1[1].id), false, '1-2 は 1-1 のクリアまで閉じている');
  assert.equal(p.isUnlocked(w2[0].id), false);
  assert.equal(p.stageOpenNeeds(stages[1]), 3);
  p.clear(w1[0].id, 10);
  assert.equal(p.isUnlocked(w1[1].id), true);
  assert.equal(p.isUnlocked(w1[2].id), false);
  p.clear(w1[1].id, 10);
  assert.equal(p.stageOpenNeeds(stages[1]), 1);
  assert.equal(p.isUnlocked(w2[0].id), false);
  p.clear(w1[2].id, 10);
  assert.equal(p.stageOpenNeeds(stages[1]), 0);
  assert.equal(p.isUnlocked(w2[0].id), true, '1-1〜1-3 で、次のワールドが開く');
  // WORLD 2 は作っている途中で、面が1つのこともある(2026-11-19)
  if (w2[1]) assert.equal(p.isUnlocked(w2[1].id), false, '次のワールドの中も順番');
  assert.equal(p.isUnlocked(w1[3].id), true, '1-4 は 1-3 のクリアで開く');
  assert.equal(p.isUnlocked('9-9'), false, '無い面は選べない');
});

test('WORLD 1 の再編(2026-11-15)の前の記録を、新しい番号へ引きつぐ', () => {
  const store = memoryStore();
  const rec = (best: number) => ({ best, attempts: 2, clears: 1 });
  store.setItem('spra-deer:progress:v1', JSON.stringify({ levels: { '1-1': rec(10), '1-6': rec(11), '1-8': rec(12), '2-3': rec(13), '2-5': rec(14), '3-2': rec(15) } }));
  const g = globalThis as { localStorage?: Storage };
  const before = g.localStorage;
  g.localStorage = store;
  try {
    const p = new Progress();
    assert.equal(p.get('1-1').best, 10, '番号が同じ面はそのまま');
    assert.equal(p.get('1-6').best, 13, '新1-6 = 旧2-3(旧1-6の記録は引きつがない)');
    assert.equal(p.get('1-7').best, 12, '新1-7 = 旧1-8');
    assert.equal(p.get('1-9').best, 14, '新1-9 = 旧2-5');
    assert.equal(p.get('1-8').best, null, '旧2-4の記録は無かった');
    assert.equal(p.get('4-2').best, 15, '旧 WORLD 3(鹿、走る。)は WORLD 4 へ');
    assert.ok(store.getItem('spra-deer:progress:v3'), '新しい保存先に書く');
  } finally {
    g.localStorage = before;
  }
});

test("WORLD 3・4 の入れかえ(2026-11-19)の前の記録とコインの印を、新しい番号へ引きつぐ", () => {
  const store = memoryStore();
  const rec = (best: number) => ({ best, attempts: 1, clears: 1 });
  store.setItem("spra-deer:progress:v2", JSON.stringify({ levels: { "1-1": rec(9), "3-2": rec(15), "4-1": rec(30) } }));
  store.setItem("spra-deer:wallet:v1", JSON.stringify({ stamina: 20, at: 0, coins: { silver: 5, gold: 0, premium: 1 }, premiumTaken: ["3-5"], rewards: ["first:3-2", "first:4-1", "first:1-1"] }));
  const g = globalThis as { localStorage?: Storage };
  const before = g.localStorage;
  g.localStorage = store;
  try {
    const p = new Progress();
    assert.equal(p.get("4-2").best, 15, "旧3-2(鹿、走る。)は 4-2");
    assert.equal(p.get("3-1").best, 30, "旧4-1(大掃除)は 3-1");
    assert.equal(p.get("1-1").best, 9);
    assert.ok(store.getItem("spra-deer:progress:v3"));
  } finally {
    g.localStorage = before;
  }
  const w = new Wallet(() => 1000, store);
  assert.equal(w.hasPremium("4-5"), true); assert.equal(w.hasPremium("3-5"), false);
  assert.equal(w.rewardOnce("first:4-2", "gold", 1), false, "旧3-2の はじめてのクリアは もらい済み");
  assert.equal(w.rewardOnce("first:3-1", "gold", 1), false);
  // 2回目に開いても、もう一度入れかえない
  const w2 = new Wallet(() => 1000, store);
  assert.equal(w2.hasPremium("4-5"), true);
});
