import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from '../src/wallet.ts';
import { Closet, COSTUMES, WHO, onSale } from '../src/closet.ts';

function memoryStore(): Storage {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: k => void m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } } as Storage;
}
const dec = new Date(2026, 11, 5);
const nov = new Date(2026, 10, 25);
const withReady = <T>(ready: boolean, f: () => T): T => { const was = COSTUMES.map(c => c.ready); COSTUMES.forEach(c => { c.ready = ready; }); try { return f(); } finally { COSTUMES.forEach((c, i) => { c.ready = was[i]; }); } };
const withArt = <T>(f: () => T): T => withReady(true, f);

test('衣装: 絵が届くまで(ready=false)は 買えない(準備中)', () => withReady(false, () => {
  const st = memoryStore(), w = new Wallet(() => 0, st, ''); w.earn('gold', 999);
  const c = new Closet(w, st, '');
  assert.equal(c.buy('xmas-stag', dec), 'closed');
  assert.equal(w.coins.gold, 999);
}));

test('衣装: クリスマスの3体の絵が public/assets/costume/ に ある', async () => {
  const { existsSync } = await import('node:fs');
  for (const c of COSTUMES) assert.ok(!c.ready || existsSync(new URL(`../public${c.img}`, import.meta.url)), c.img);
});

test('衣装: 12月だけ 買える。買うとゴールドが減って 着る。持てば あとは いつでも着られる', () => withArt(() => {
  const st = memoryStore(), w = new Wallet(() => 0, st, ''); w.earn('gold', 160);
  const c = new Closet(w, st, '');
  assert.equal(onSale(COSTUMES[0], nov), false);
  assert.equal(c.buy('xmas-stag', nov), 'closed');
  assert.equal(c.buy('xmas-stag', dec), 'ok');
  assert.equal(w.coins.gold, 10);
  assert.equal(c.buy('xmas-stag', dec), 'owned');
  assert.equal(c.buy('xmas-doe', dec), 'poor');
  assert.equal(c.wornId('stag'), 'xmas-stag');
  assert.equal(c.look('stag').img, '/assets/costume/xmas-stag.webp');
  assert.equal(c.look('fawn').img, WHO.fawn.base);
  // 1月でも 持っていれば 着られる
  c.takeOff('stag');
  assert.equal(c.look('stag').img, WHO.stag.base);
  assert.equal(c.wear('xmas-stag'), true);
  assert.equal(c.wear('xmas-doe'), false);
}));

test('衣装: 保存して 読みなおせる。持っていないものを 着ている保存は 無視する', () => withArt(() => {
  const st = memoryStore(), w = new Wallet(() => 0, st, ''); w.earn('gold', 500);
  const c = new Closet(w, st, ''); c.buy('xmas-fawn', dec);
  const again = new Closet(new Wallet(() => 0, st, ''), st, '');
  assert.equal(again.has('xmas-fawn'), true);
  assert.equal(again.wornId('fawn'), 'xmas-fawn');
  st.setItem('spra-deer:closet:v1', JSON.stringify({ owned: [], worn: { stag: 'xmas-stag', fawn: 'nothing' } }));
  const bad = new Closet(new Wallet(() => 0, st, ''), st, '');
  assert.equal(bad.wornId('stag'), null);
}));

test('衣装: プレイヤーごとに 別の保存(ゲストの衣装は 1回だけ引きつぐ)', () => withArt(() => {
  const st = memoryStore(), w = new Wallet(() => 0, st, ''); w.earn('gold', 500);
  new Closet(w, st, '').buy('xmas-stag', dec);
  const other = new Closet(new Wallet(() => 0, st, 'p9:'), st, 'p9:');
  assert.equal(other.has('xmas-stag'), true); // はじめての人には ゲストの分を写す
  const second = new Closet(new Wallet(() => 0, st, 'p10:'), st, 'p10:');
  assert.equal(second.has('xmas-stag'), false); // 2人目からは まっさら
}));

test('仲間の鹿: プレミアムコインで仲間にして、そのまま相棒に。足りなければ買えない', async () => {
  const { readBuddy, runFramePath, unlockedBy, FRIENDS } = await import('../src/friends.ts');
  const st = memoryStore(), w = new Wallet(() => 0, st, ''); w.earn('premium', 16);
  const c = new Closet(w, st, '');
  assert.equal(c.buyFriend('lumi'), 'ok');
  assert.equal(w.coins.premium, 1);
  assert.equal(c.buddyId, 'lumi');
  assert.equal(c.buyFriend('lumi'), 'owned');
  assert.equal(c.buyFriend('spra'), 'poor');
  assert.equal(c.setBuddy('spra'), false, '持っていない鹿は、相棒にできない');
  assert.equal(c.setBuddy(null), true);
  assert.equal(c.buddyId, null);
  // 走るゲームのページ(別ページ)が、保存から相棒を読める
  assert.equal(readBuddy(st, ''), null);
  c.setBuddy('lumi');
  assert.equal(readBuddy(st, ''), 'lumi');
  assert.equal(runFramePath('lumi', 2), '/assets/deerfriends/lumi_run_2.webp');
  assert.equal(runFramePath(null, 2), '/assets/kasuga/run_2.png');
  // 保存して読みなおせる
  const again = new Closet(new Wallet(() => 0, st, ''), st, '');
  assert.equal(again.hasFriend('lumi'), true);
  assert.equal(again.buddyId, 'lumi');
  // 専用の面は、その鹿を持っているときだけ(Spra=4-11・8-11、Lumi=4-12・8-12)
  assert.equal(unlockedBy('4-11')?.id, 'spra');
  assert.equal(unlockedBy('8-12')?.id, 'lumi');
  assert.equal(unlockedBy('4-1'), undefined);
  assert.equal(again.levelUnlocked('8-12'), true);
  assert.equal(again.levelUnlocked('4-11'), false);
  assert.equal(again.levelUnlocked('4-1'), true);
  // 値段は 15〜20(設計書 26-3)
  assert.ok(FRIENDS.every(f => f.premium >= 15 && f.premium <= 20));
});

test('仲間の鹿: 絵が すべてそろっている(立ち姿と走り4コマ)', async () => {
  const { existsSync } = await import('node:fs');
  const { FRIENDS, standOf, runFramePath } = await import('../src/friends.ts');
  for (const f of FRIENDS) {
    assert.ok(existsSync(new URL(`../public${standOf(f.id)}`, import.meta.url)), f.id);
    for (let i = 0; i < 4; i++) assert.ok(existsSync(new URL(`../public${runFramePath(f.id, i)}`, import.meta.url)), `${f.id} run ${i}`);
  }
});
