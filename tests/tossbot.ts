// WORLD 2 せんべい くばりを、決まったやり方で遊ぶボット(テストとバランスの確認用)。
// 待っている鹿のうち、いちばん待ちくたびれている鹿をねらう。人の手のぶれ(距離・横)を足して投げる。
import { TossRun, SBAL, type TossDeer } from '../src/bake/toss.ts';
import type { TossLevel } from '../src/bake/levels.ts';

export type TossPolicy = {
  /** 距離のぶれ(距離に対する割合。±この幅でランダム)。人は「どれだけ遠くか」を いちばん まちがえ、遠いほど大きくずれる */
  errD?: number;
  /** 横のぶれ(m) */
  errX?: number;
  seed?: number;
  /** 歩いている鹿の、先を読むか */
  lead?: boolean;
  /** 鹿が着いてから、投げるまでの間(秒。人が気づいて、なぞるまで) */
  react?: number;
  /** 投げたあと、次に投げるまでの間(秒) */
  pause?: number;
};

export function driveToss(level: TossLevel, policy: TossPolicy = {}, dt = 1 / 120): TossRun {
  const { errD = 0, errX = 0, seed = 1, lead = true, react = 0.8, pause = 0.6 } = policy;
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const run = new TossRun(level);
  run.start();
  /** とんでいるせんべいが、どの鹿をねらったか */
  const aimed = new Map<number, number>();
  let wait = 0;
  // 歩く鹿の、T 秒後の位置(行ったり来たり)
  const ahead = (d: TossDeer, T: number): [number, number] => {
    if (!d.move || !lead) return [d.x, d.z];
    const len = Math.hypot(d.move[0] - d.home[0], d.move[1] - d.home[1]) || 1;
    let u = d.u + d.dirU * (d.speed * T) / len;
    if (u > 1) u = 2 - u;
    if (u < 0) u = -u;
    return [d.home[0] + (d.move[0] - d.home[0]) * u, d.home[1] + (d.move[1] - d.home[1]) * u];
  };
  while (run.phase === 'running' && run.t < level.time + 1) {
    wait -= dt;
    if (run.ready && wait <= 0) {
      const inAir = (id: number) => [...aimed.values()].filter(v => v === id).length;
      const cand = run.deer.filter(d => d.phase === 'wait' && d.t >= react && d.want - d.got - inAir(d.id) > 0)
        .sort((p, q) => (p.patience - p.waited) - (q.patience - q.waited));
      const d = cand[0];
      if (d) {
        const D = Math.hypot(d.x, d.z - SBAL.originZ);
        const [tx, tz] = ahead(d, SBAL.flightBase + SBAL.flightPer * D);
        // 屋台から見た向きのまま、距離と横にぶれを足す
        const ang = Math.atan2(tx, SBAL.originZ - tz), dist = Math.hypot(tx, tz - SBAL.originZ) * (1 + (rnd() * 2 - 1) * errD), side = (rnd() * 2 - 1) * errX;
        const x = Math.sin(ang) * dist + Math.cos(ang) * side, z = SBAL.originZ - Math.cos(ang) * dist + Math.sin(ang) * side;
        const before = run.flights.length;
        if (run.throwTo(x, z) && run.flights.length > before) aimed.set(run.flights.at(-1)!.id, d.id);
        wait = pause;
      }
    }
    run.step(dt);
    for (const e of run.drainEvents()) if (e.kind === 'catch' || e.kind === 'perfect' || e.kind === 'miss') aimed.delete(e.id!);
  }
  return run;
}
