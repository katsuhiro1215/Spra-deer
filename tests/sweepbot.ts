// WORLD 3 大掃除を、決まったやり方で遊ぶボット(テストとバランスの確認用)。
// 少し先までのうんこを見て、チームのほうきに いちばん多く(よごれの多い順に)入る位置へ動く。
// ゲートは人数が多くなる側へ(gateMiss の割合で まちがえる)、走ってくる鹿は よける(dodge)。人の反応のおくれと、位置のずれを入れる。
import { SweepRun, WBAL, SLOTS, applyGate } from '../src/sweep/sim.ts';
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
  /** ゲートで まちがえる割合(0〜1) */
  gateMiss?: number;
  /** 走ってくる鹿を よけるか */
  dodge?: boolean;
  /** たるを ねらうか */
  barrels?: boolean;
};

export function driveSweep(level: SweepLevel, policy: SweepPolicy = {}, dt = 1 / 60): SweepRun {
  const { look = 4, every = 0.35, err = 0, seed = 1, idle = false, gateMiss = 0, dodge = true, barrels = true } = policy;
  let a = (seed * 7919) >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const run = new SweepRun(level, { seed });
  run.start();
  let wait = 0;
  const gateWrong = new Map<number, boolean>();
  while (run.phase === 'running' && run.t < 600) {
    wait -= dt;
    if (!idle && wait <= 0) {
      wait = every;
      const st = run.stats, gates = level.gates ?? [], g = gates[run.gateIndex];
      let target: number | null = null;
      // ゲートが近いなら、人数が多くなる側へ
      if (g && g.s - run.d < 5) {
        if (!gateWrong.has(run.gateIndex)) gateWrong.set(run.gateIndex, rnd() < gateMiss);
        const left = applyGate(run.team, g.left, level.teamMax), right = applyGate(run.team, g.right, level.teamMax);
        let side = left >= right ? -1 : 1;
        if (gateWrong.get(run.gateIndex)) side = -side;
        target = side * 1.4;
      }
      if (target === null) {
        let best = run.x, bestV = -Infinity;
        for (let x = -WBAL.reachX; x <= WBAL.reachX + 1e-9; x += 0.15) {
          const ms = [{ x, a: 0, w: st.width }, ...SLOTS.slice(0, run.team - 1).map(sl => ({ x: Math.max(-WBAL.half + 0.25, Math.min(WBAL.half - 0.25, x + sl.dx)), a: sl.da, w: WBAL.helperWidth }))];
          let v = 0;
          for (const p of run.poops) {
            const ah = run.ahead(p.s);
            if (ah < -0.1 || ah > look) continue;
            if (ms.some(m => Math.abs(p.x - m.x) <= m.w / 2 + WBAL.poop[p.kind].r)) v += (p.hp / p.maxHp) * WBAL.poop[p.kind].pollution / (1 + ah);
          }
          if (barrels) for (const b of run.barrels) { const ah = run.ahead(b.s); if (ah > -0.1 && ah < look + 3 && ms.some(m => Math.abs(b.x - m.x) <= m.w / 2 + 0.35)) v += 4; }
          // 雷の輪からは にげる
          if (dodge) for (const b of run.bolts) if (b.t < 0) v -= ms.filter(m => Math.hypot(m.x - b.x, run.d + m.a - b.s) < WBAL.boltR + 0.2).length * 3;
          if (dodge) for (const c of run.chargers) { const ah = run.ahead(c.s); if (ah > -0.5 && ah < 8) v -= ms.filter(m => Math.abs(c.x - m.x) < WBAL.chargeHitX + 0.1).length * 3; }
          v -= Math.abs(x - run.x) * 0.02;
          if (v > bestV) { bestV = v; best = x; }
        }
        target = best;
      }
      run.steer(target + (rnd() * 2 - 1) * err);
    }
    run.step(dt);
    run.drainEvents();
  }
  return run;
}
