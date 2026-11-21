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
const withArt = <T>(f: () => T): T => { const was = COSTUMES.map(c => c.ready); COSTUMES.forEach(c => { c.ready = true; }); try { return f(); } finally { COSTUMES.forEach((c, i) => { c.ready = was[i]; }); } };

test('衣装: 絵が届くまでは 買えない(準備中)', () => {
  const st = memoryStore(), w = new Wallet(() => 0, st, ''); w.earn('gold', 999);
  const c = new Closet(w, st, '');
  assert.equal(c.buy('xmas-stag', dec), 'closed');
  assert.equal(w.coins.gold, 999);
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
