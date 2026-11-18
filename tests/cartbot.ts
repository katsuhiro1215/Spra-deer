// WORLD 8: 先を見て操作するボット(テストと調整に使う)
import { CartRun, BAL, rampReach, type Input } from '../src/cart/sim.ts';
import { trackOf, type CartLevel } from '../src/cart/levels.ts';

export const DT = 1 / 120;
export const none = (): Input => ({ left: false, right: false, jump: false, brake: false, dash: false });

/** やらない操作を false にできる。extra で、操作を上書きできる(プレミアムをねらう走り方など)。 */
export type Policy = {
  brake?: boolean; lean?: boolean; jump?: boolean; dash?: boolean;
  /** ジャンプ台の上でジャンプする(もっと高く遠くへ) */
  rampJump?: boolean;
  extra?: (run: CartRun, input: Input) => void;
  /** チェックポイントなど、途中から走る */
  from?: number;
  /** ここまで来たら止める */
  until?: number;
};

export function drive(level: CartLevel, policy: Policy = {}): CartRun {
  const p = { brake: true, lean: true, jump: true, dash: true, rampJump: true, ...policy };
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
      // 傾ける向きは、今いるカーブを優先(S字で、早すぎる切りかえをしない)
      const here = track.sharpestAhead(s, Math.max(12, v * 0.4)), dir = Math.abs(here) > 0.004 ? here : curv;
      if (p.lean) { input.right = dir > 0; input.left = dir < 0; }
      const soon = track.obstacles.find(o => o.kind === 'branch' && o.s > s && o.s - s < Math.max(30, v * 2));
      const outward = !!soon && p.lean && (soon.side === 1) === (curv > 0);
      const lat = !p.lean ? BAL.latBase : outward ? BAL.latBase - BAL.latOut : BAL.latBase + BAL.latLean;
      const limit = Math.sqrt((lat * 0.8) / Math.abs(curv));
      if (p.brake && v > limit) input.brake = true;
    }
    // 横風: 風上へ傾ける(カーブの中なら、カーブと風を合わせた向き)
    const w = track.windAt(s + v * 0.3);
    if (Math.abs(w) > 0.5 && p.lean) {
      const need = v * v * track.at(s + v * 0.3).curv - w;
      input.right = need > 0; input.left = need < 0;
    }
    if (branch && p.lean) { input.left = branch.side === 1; input.right = branch.side === -1; }
    // ずれた線路: 空中で、ずれた側へ傾ける
    if (run.air && p.lean) {
      const sg = track.shiftGapNear(s);
      if (sg) { input.right = sg.shift! > 0; input.left = sg.shift! < 0; }
    }
    // こぶ: 先が急カーブなら、浮かないように減速する
    const crest = track.crestAhead(s, v * 2 + 10);
    if (crest && Math.abs(crest.curveAfter) > 0.006 && p.brake && !run.air && v > crest.vLift * 0.93) input.brake = true;
    // 切れ目: ふちの少し手前で跳ぶ。速さが足りなければ、手前でダッシュ
    const gap = track.gaps.find(g => g.to > s);
    const ramp = gap && track.rampBefore(gap);
    if (gap && ramp && ramp.s > s - 1) {
      // ジャンプ台の先の切れ目: 台の上でジャンプ(rampJump=false なら乗るだけ)。届かない速さなら、手前でダッシュ
      const dist = gap.to + 4 - ramp.s;
      if (p.dash && ramp.s - s < 70 && ramp.s - s > 8 && rampReach(v, p.rampJump) < dist) input.dash = true;
      if (p.jump && p.rampJump && ramp.s - s < Math.max(1, v * 0.06)) input.jump = true;
    } else if (gap) {
      // 次の切れ目がすぐ先(空中の線路など): 速すぎると、次の切れ目に着地してしまうので減速
      const next = track.gaps.find(g => g.from > gap.to);
      if (next && p.brake && !run.air && next.from - gap.from < 45 && gap.from - s < 50 && v > next.from - 3 - gap.from) input.brake = true;
      const need = (gap.to - gap.from) + 5;
      if (p.dash && gap.from - s < 70 && gap.from - s > 12 && v < need) input.dash = true;
      if (p.jump && !run.air && gap.from - s < Math.max(1.5, v * 0.06) && gap.from - s > -1) input.jump = true;
    }
    // 上り坂: おそいときはダッシュで鹿をはげます
    if (p.dash && !run.air && run.dashCool <= 0 && v < 12 && track.at(s).pitch > 0.05) input.dash = true;
    // 岩・倒木: 手前で跳ぶ(ジャンプ台は、乗るだけ)
    const rock = track.obstacles.find(o => (o.kind === 'rock' || o.kind === 'log') && o.s > s && o.s - s < v * 0.4);
    if (rock && p.jump && !run.air) input.jump = true;
    p.extra?.(run, input);
    run.step(DT, input);
  }
  return run;
}
