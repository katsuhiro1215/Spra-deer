// ゴールド・プレミアムのコイン(設計書 25-3・26-3)
import test from 'node:test';
import assert from 'node:assert/strict';
import { goldCount, type Coin } from '../src/runner/course.ts';
import { Run } from '../src/runner/sim.ts';
import { RUNNER_LEVELS, courseOf } from '../src/runner/levels.ts';

const DT = 1 / 120;

test('どの面も、プレミアムは1枚・ゴールドはコースの長さに合わせた数', () => {
  for (const l of RUNNER_LEVELS) {
    const c = courseOf(l);
    assert.equal(c.coins.filter((x) => x.kind === 'premium').length, 1, `${l.id}: プレミアム`);
    const g = c.coins.filter((x) => x.kind === 'gold').length;
    assert.ok(g >= goldCount(c.length) - 1 && g <= goldCount(c.length), `${l.id}: ゴールド ${g}`);
    // 取りにくい所: 跳ばないと届かない高さ
    const p = c.coins.find((x) => x.kind === 'premium')!;
    assert.ok(p.y >= 3, `${l.id}: プレミアムの高さ ${p.y}`);
  }
});

/** その面の地形(坂・ジャンプ台・曲がり)のまま、罠を消して、1枚のコインを取れるか試す。跳ぶ場所を少しずつ変える */
function reachable(levelId: string, coin: Coin): boolean {
  const base = courseOf(RUNNER_LEVELS.find((l) => l.id === levelId)!);
  const course = { ...base, obstacles: [], coins: [coin] };
  for (let d = -1; d <= 14; d += 0.25) {
    for (const jump of [false, true]) {
      if (!jump && d > -1) continue;
      const r = new Run(course);
      r.start();
      r.s = coin.s - 40;
      r.x = coin.x;
      const jumpAt = coin.s - d;
      for (let i = 0; i < 120 * 6 && r.s < coin.s + 5; i++) {
        // 左右はコインの位置に合わせ続ける
        const dx = coin.x - r.x;
        const press = jump && r.s >= jumpAt && r.s < jumpAt + 0.6;
        r.step(DT, { left: dx < -0.05, right: dx > 0.05, jump: press });
      }
      if (r.premium || r.gold > 0) return true;
    }
  }
  return false;
}

test('プレミアムは、跳ぶ場所がうまく合えば、どの面でも取れる', () => {
  for (const l of RUNNER_LEVELS) {
    const c = courseOf(l);
    const p = c.coins.find((x) => x.kind === 'premium')!;
    assert.ok(reachable(l.id, p), `${l.id}: プレミアム(s=${p.s.toFixed(0)}, x=${p.x}, y=${p.y})に届かない`);
  }
});

test('プレミアムは、ふつうに跳んだだけでは取れない(穴の上のもの)', () => {
  for (const l of RUNNER_LEVELS) {
    const c = courseOf(l);
    const p = c.coins.find((x) => x.kind === 'premium')!;
    if (p.y > 5) continue; // ジャンプ台の大ジャンプのもの
    // 真ん中のまま、穴の手前で跳ぶ(左右を合わせない)
    const r = new Run({ ...c, obstacles: [], coins: [p] });
    r.start();
    r.s = p.s - 40;
    // カーブで外へ押されるので、真ん中を保つように左右を押す
    for (let i = 0; i < 120 * 6 && r.s < p.s + 5; i++) r.step(DT, { left: r.x > 0.1, right: r.x < -0.1, jump: r.s > p.s - 8 && r.s < p.s - 7 });
    assert.equal(r.premium, false, `${l.id}: 真ん中を跳んだだけで取れてしまう`);
  }
});

test('ゴールドとプレミアムは、シルバーの数に入らない', () => {
  const coins: Coin[] = [
    { id: 0, s: 3, x: 0, y: 0.75 },
    { id: 1, s: 5, x: 0, y: 0.75, kind: 'gold' },
    { id: 2, s: 7, x: 0, y: 0.75, kind: 'premium' },
  ];
  const r = new Run({ obstacles: [], coins, length: 1000 });
  r.start();
  for (let i = 0; i < 120; i++) r.step(DT, { left: false, right: false, jump: false });
  assert.equal(r.coins, 1);
  assert.equal(r.gold, 1);
  assert.equal(r.premium, true);
});
