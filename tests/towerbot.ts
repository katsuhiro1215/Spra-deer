// WORLD 2 せんべいタワーを、決まったやり方で遊ぶボット(テストとバランスの確認用)。
// 落ちる時間とタワーのゆれを先読みして、てっぺんの真上(+ err のずれ)に来たときに落とす。
import { TowerRun, TBAL } from '../src/bake/tower.ts';
import type { TowerLevel } from '../src/bake/levels.ts';

export type TowerPolicy = {
  /** ねらいのずれ(m)。same=いつも同じ側へ/alt=左右交互へ/rand=±err の間でランダム(人の手のぶれ) */
  err?: number;
  errSide?: 'same' | 'alt' | 'rand';
  /** rand のときの乱数の種 */
  seed?: number;
  /** 注文より何段多く積んでから、とどけるか */
  greed?: number;
  /** とどけるか */
  deliver?: boolean;
  /** ゆれを先読みしない(てっぺんの今の位置をねらう) */
  naive?: boolean;
  /** 風の分を 何割 見こして ずらすか(0 = 風を気にしない・1 = ぴったり) */
  windComp?: number;
  /** 下を食べる鹿を おいはらうまでの 反応(秒。Infinity = おいはらわない) */
  shooDelay?: number;
};

export function driveTower(level: TowerLevel, policy: TowerPolicy = {}, dt = 1 / 120): TowerRun {
  const { err = 0, errSide = 'alt', greed = 0, deliver = true, naive = false, seed = 1, windComp = 0.7, shooDelay = 0.8 } = policy;
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let off = 0;
  const run = new TowerRun(level);
  run.start();
  const T = Math.sqrt((2 * TBAL.dropH) / TBAL.g);
  let drops = 0;
  const seenNib = new Map<number, number>();
  while (run.phase === 'running' && run.t < level.time + 1) {
    const d = run.customer, nb = run.nibbler;
    // 下を食べる鹿: 見えてから shooDelay 秒で おいはらう
    if (nb && !seenNib.has(nb.id)) seenNib.set(nb.id, run.t);
    if (nb && nb.phase !== 'flee' && run.t - seenNib.get(nb.id)! >= shooDelay) run.shoo();
    if (deliver && d && d.phase === 'wait' && run.height >= d.want + greed) run.deliver();
    else if (!run.falling && run.busy <= 0) {
      // てっぺんの「今」と「着くとき」の位置。ゆれは sin なので、時間を進めて求める
      const n = run.height;
      const sway = (t: number) => { const save = run.t; run.t = t; const v = run.swayTop(); run.t = save; return v; };
      const top = n ? run.stack[n - 1].x : 0;
      const lean = n && !naive ? sway(run.t + T) / n : 0;
      if (drops === 0 && errSide !== 'rand') off = -err;
      // 風が ふいている(予告が出ている)ときは、流される分を 見こして 風上に ずらす
      const ws = run.windSpeed || (run.windComing && run.windLeft < T ? run.windComing * (level.wind?.force ?? 0) * (level.helpers?.includes('piko') ? TBAL.pikoWind : 1) : 0);
      const target = top + lean * (n + 1) + off - ws * T * windComp;
      if (Math.abs(run.hold.x - target) < run.swingSpeed * dt * 0.6) {
        run.drop(); drops++;
        off = err * (errSide === 'same' ? 1 : errSide === 'rand' ? rnd() * 2 - 1 : drops % 2 ? 1 : -1);
      }
    }
    run.step(dt);
    run.drainEvents();
  }
  return run;
}
