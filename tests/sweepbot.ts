// WORLD 3 大掃除を、決まったやり方で遊ぶボット(テストとバランスの確認用)。
// 少し先までのうんこを見て、ほうきの幅に いちばん多く(よごれの多い順に)入る位置へ動く。人の反応のおくれと、位置のずれを入れる。
import { SweepRun, WBAL } from '../src/sweep/sim.ts';
import type { SweepLevel } from '../src/sweep/levels.ts';

export type SweepPolicy = {
  /** どこまで先を見るか(m) */
  look?: number;
  /** ねらいを決めなおす間(秒。人の反応) */
  every?: number;
  /** ねらいのずれ(m、±) */
  err?: number;
  seed?: number;
  /** 動かない(まん中に立ったまま) */
  idle?: boolean;
};

export function driveSweep(level: SweepLevel, policy: SweepPolicy = {}, dt = 1 / 60): SweepRun {
  const { look = 4, every = 0.35, err = 0, seed = 1, idle = false } = policy;
  let a = (seed * 7919) >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const run = new SweepRun(level, { seed });
  run.start();
  let wait = 0;
  while (run.phase === 'running' && run.t < 600) {
    wait -= dt;
    if (!idle && wait <= 0) {
      wait = every;
      const w = run.stats.width;
      const cand = run.poops.filter(p => { const ah = run.ahead(p.s); return ah > -0.1 && ah < look; });
      let best = run.x, bestV = -1;
      for (let x = -WBAL.reachX; x <= WBAL.reachX + 1e-9; x += 0.15) {
        let v = 0;
        for (const p of cand) if (Math.abs(p.x - x) <= w / 2 + WBAL.poop[p.kind].r) v += (p.hp / p.maxHp) * WBAL.poop[p.kind].pollution / (1 + run.ahead(p.s));
        // 今の位置の近くを少しだけ好む(行ったり来たりしない)
        v -= Math.abs(x - run.x) * 0.02;
        if (v > bestV) { bestV = v; best = x; }
      }
      run.steer(best + (rnd() * 2 - 1) * err);
    }
    run.step(dt);
    run.drainEvents();
  }
  return run;
}
