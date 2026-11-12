// 使い方: node --max-old-space-size=3000 --experimental-strip-types tests/solve-wide.ts 2-4 [maxLayer] [band] [bucket]
import { PLAYABLE } from '../src/game/levels.ts';
import { solve, replay } from './solver.ts';

const [id, layer, band, bucket] = process.argv.slice(2);
const level = PLAYABLE.find(l => l.id === id)!;
const t0 = Date.now();
const r = solve(level, { maxLayer: Number(layer ?? 2500), band: Number(band ?? 450), bucket: Number(bucket ?? 30) });
console.log(r.ok ? `${id}: OK ${r.time.toFixed(1)}秒 せんべい${replay(level, r.actions).baits.length}個` : `${id}: 見つからず (${r.reason}, y=${Math.round(r.best)})`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
