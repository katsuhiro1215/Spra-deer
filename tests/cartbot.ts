// WORLD 8: 先を見て操作するボット(テストと調整に使う)
import { CartRun, BAL, type Input } from '../src/cart/sim.ts';
import { trackOf, type CartLevel } from '../src/cart/levels.ts';

export const DT = 1 / 120;
export const none = (): Input => ({ left: false, right: false, jump: false, brake: false, dash: false });

/** やらない操作を false にできる。extra で、操作を上書きできる(プレミアムをねらう走り方など)。 */
export type Policy = {
  brake?: boolean; lean?: boolean; jump?: boolean; dash?: boolean;
  extra?: (run: CartRun, input: Input) => void;
  /** チェックポイントなど、途中から走る */
  from?: number;
  /** ここまで来たら止める */
  until?: number;
};

export function drive(level: CartLevel, policy: Policy = {}): CartRun {
  const p = { brake: true, lean: true, jump: true, dash: true, ...policy };
  const track = trackOf(level), run = new CartRun(track);
  if (p.from) run.restore(p.from, 0, 0, 0, false, []);
  run.start();
  for (let i = 0; i < 300 / DT && run.phase === 'running' && run.s < (p.until ?? Infinity); i++) {
    const s = run.s, v = run.v, input = none();
    // 枝: 反対へ傾ける(カーブより優先)。そのぶんカーブでは外へ傾くので、早めに減速する
    const branch = track.obstacles.find(o => o.kind === 'branch' && o.s > s && o.s - s < Math.max(14, v * 0.7));
    // カーブ: 2秒先までで、いちばんきつい曲がりを見て、内側へ傾け、速すぎたらブレーキ
    const curv = track.sharpestAhead(s, Math.max(30, v * 2));
    if (Math.abs(curv) > 0.004) {
      if (p.lean) { input.right = curv > 0; input.left = curv < 0; }
      const soon = track.obstacles.find(o => o.kind === 'branch' && o.s > s && o.s - s < Math.max(30, v * 2));
      const outward = !!soon && p.lean && (soon.side === 1) === (curv > 0);
      const lat = !p.lean ? BAL.latBase : outward ? BAL.latBase - BAL.latOut : BAL.latBase + BAL.latLean;
      const limit = Math.sqrt((lat * 0.8) / Math.abs(curv));
      if (p.brake && v > limit) input.brake = true;
    }
    if (branch && p.lean) { input.left = branch.side === 1; input.right = branch.side === -1; }
    // 切れ目: ふちの少し手前で跳ぶ。速さが足りなければ、手前でダッシュ
    const gap = track.gaps.find(g => g.to > s);
    if (gap) {
      const need = (gap.to - gap.from) + 5;
      if (p.dash && gap.from - s < 70 && gap.from - s > 12 && v < need) input.dash = true;
      if (p.jump && !run.air && gap.from - s < Math.max(1.5, v * 0.06) && gap.from - s > -1) input.jump = true;
    }
    // 岩・倒木: 手前で跳ぶ
    const rock = track.obstacles.find(o => o.kind !== 'branch' && o.s > s && o.s - s < v * 0.4);
    if (rock && p.jump && !run.air) input.jump = true;
    p.extra?.(run, input);
    run.step(DT, input);
  }
  return run;
}
