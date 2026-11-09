import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYABLE } from '../src/game/levels.ts';
import { solve, replay } from './solver.ts';

// 探索ボットで、すべての面に「クリアできる経路がある」ことを確かめる（1面あたり30〜90秒かかるので、通常のテストとは分けてある）。
for (const level of PLAYABLE) {
  test(`${level.id} ${level.title}: a clear route exists (bot search)`, { timeout: 600_000 }, () => {
    const result = solve(level);
    assert.ok(result.ok, result.ok ? '' : `bot found no route (${result.reason}, best y=${Math.round(result.best)})`);
    if (result.ok) assert.equal(replay(level, result.actions).outcome, 'clear');
  });
}
