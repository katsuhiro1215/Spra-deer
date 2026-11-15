// 使い方: node --experimental-strip-types tests/solve-check.ts [面ID ...]
import { PLAYABLE } from '../src/game/levels.ts';
import { solve, replay } from './solver.ts';

const ids = process.argv.slice(2);
for (const level of PLAYABLE.filter(l => !ids.length || ids.includes(l.id))) {
  const t0 = Date.now();
  const r = solve(level);
  if (r.ok) {
    const w = replay(level, r.actions);
    console.log(`${level.id}: OK ${r.time.toFixed(1)}秒 ジャンプ${r.jumps}回 せんべい${w.baits.length}個 (再生: ${w.outcome}) ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (w.throws) console.log(`${level.id}: 投げたせんべい ${w.throws}枚`);
    if (level.senbei) {
      const none = solve({ ...level, senbei: { pickups: [], start: 0 } });
      console.log(`${level.id}: せんべいなし → ${none.ok ? '解けてしまう（投げるのが必須でない）' : '解けない（投げるのが必須）'}`);
    }
    if (level.delivery && level.delivery.baits > 0) {
      const none = solve({ ...level, delivery: { ...level.delivery, baits: 0 } });
      console.log(`${level.id}: せんべいなし → ${none.ok ? '解けてしまう（おとりが必須でない）' : '解けない（おとりが必須）'}`);
    }
  } else console.log(`${level.id}: 見つからず (${r.reason}, 最高到達y=${Math.round(r.best)}) ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
