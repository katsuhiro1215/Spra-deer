// Spra Go のアカウント(設計書 37章)。ログインの入口を on にした形で確かめる(環境変数は 読みこむ前に決める)
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_DEER_LOGIN = 'on';
process.env.NEXT_PUBLIC_SPRA_API_URL = 'http://api.test';

/** 読み書きできる、テスト用の localStorage */
function memoryStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null, removeItem: (k: string) => { m.delete(k); }, setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}
const store = memoryStore();
(globalThis as unknown as { localStorage: Storage }).localStorage = store;

const S = await import('../src/account/store.ts');
const { createApi } = await import('../src/account/api.ts');
const { Progress } = await import('../src/progress.ts');
const { Wallet } = await import('../src/wallet.ts');

const signIn = (profileId: number | null) => S.saveAccount({ ...S.loadAccount(), token: 't0k', user: { id: 1, name: '父', email: 'a@b.c', termsOutdated: false }, profileId, profileName: profileId ? 'たろう' : null });

test('ログインしていないと、各ワールドの3面目から ログインが要る(2面目までは 遊べる)', () => {
  store.clear();
  assert.equal(S.LOGIN_ENABLED, true);
  for (const id of ['1-1', '1-2', '8-2']) assert.equal(S.needsLogin(id), false, id);
  for (const id of ['1-3', '5-10', '8-7']) assert.equal(S.needsLogin(id), true, id);
  // ログインしても、プレイヤーを えらぶまでは まだ
  signIn(null);
  assert.equal(S.needsLogin('1-3'), true);
  signIn(3);
  assert.equal(S.needsLogin('1-3'), false);
});

test('端末ごとの番号は 1回だけ作られ、ずっと同じ', () => {
  store.clear();
  const a = S.loadAccount().anonId;
  assert.match(a, /^[0-9a-f-]{36}$/i);
  assert.equal(S.loadAccount().anonId, a);
});

test('記録・コインは プレイヤーごと。はじめての プレイヤーは ゲストの記録を 1回だけ 引きつぐ', () => {
  store.clear();
  // ゲストで 1-1 を クリア、コインも
  const g = new Progress(); g.attempt('1-1'); g.clear('1-1', 12.5);
  const gw = new Wallet(); gw.earn('silver', 7);
  signIn(3);
  assert.equal(S.storageScope(), 'p3:');
  const p3 = new Progress();
  assert.equal(p3.get('1-1').clears, 1, 'ゲストの記録を 引きついだ');
  assert.equal(new Wallet().coins.silver, 7);
  p3.attempt('1-2'); p3.clear('1-2', 20);
  // 2人目は まっさら
  signIn(4);
  const p4 = new Progress();
  assert.equal(p4.get('1-1').clears, 0);
  assert.equal(new Wallet().coins.silver, 0);
  // 1人目に もどると、1人目の 記録
  signIn(3);
  assert.equal(new Progress().get('1-2').clears, 1);
  // ゲストの 記録は そのまま 残る
  S.saveAccount({ ...S.loadAccount(), token: null, profileId: null });
  assert.equal(new Progress().get('1-2').clears, 0);
  assert.equal(new Progress().get('1-1').clears, 1);
});

test('Spra Go の記録と 合わせる: クリア数は多い方、タイムは速い方', () => {
  store.clear(); signIn(5);
  const p = new Progress();
  p.attempt('2-1'); p.clear('2-1', 30);
  assert.equal(p.merge({ '2-1': { plays: 4, clears: 3, best_ms: 25500 }, '2-2': { plays: 1, clears: 0, best_ms: null }, '9-9': { plays: 1, clears: 1, best_ms: 1 } }), true);
  assert.deepEqual(p.get('2-1'), { attempts: 4, clears: 3, best: 25.5 });
  assert.deepEqual(p.get('2-2'), { attempts: 1, clears: 0, best: null });
  assert.equal(p.merge({ '2-1': { plays: 1, clears: 1, best_ms: 40000 } }), false, '古い記録では 下がらない');
  assert.equal(new Progress().get('2-1').best, 25.5, '保存された');
});

test('通信: X-Spra-App: deer と Bearer トークンを付ける。エラーは 日本語の文で 返す', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const api = createApi(() => 'tok', 'http://api.test', async (url, init) => {
    calls.push({ url: String(url), init: init! });
    if (String(url).endsWith('/plays')) return ok({ message: 'ログインすると遊べます', code: 'login_required' }, 403);
    return ok({ rows: [], me: null, total: 0 });
  });
  await api.ranking('3-4', 'all', 9);
  const h = new Headers(calls[0].init.headers);
  assert.equal(calls[0].url, 'http://api.test/api/deer/ranking/3-4?scope=all&profile_id=9');
  assert.equal(h.get('X-Spra-App'), 'deer');
  assert.equal(h.get('Authorization'), 'Bearer tok');
  await assert.rejects(api.playStart({ level: '1-3', anon_id: 'x' }), (e: Error & { status?: number; code?: string }) => e.status === 403 && e.code === 'login_required' && e.message === 'ログインすると遊べます');
});
