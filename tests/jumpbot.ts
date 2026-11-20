// WORLD 5 のボット(テスト・手ごたえの確認用)。今の足場より上で、届く いちばん低い足場を ねらう。
import { JBAL, JumpRun, wrapDx, type Pad } from '../src/jump/sim.ts';
import type { JumpLevel } from '../src/jump/levels.ts';

export type JumpBotOpt = {
  /** ねらいの ずれ(m)。決まった並びで ±この値 */
  aim?: number;
  /** 反応の おくれ(秒) */
  delay?: number;
  /** 何もしない */
  idle?: boolean;
  /** 画面の縦の長さ(m) */
  viewH?: number;
};

export function driveJump(level: JumpLevel, opt: JumpBotOpt = {}): JumpRun {
  const run = new JumpRun(level, opt.viewH ?? 16);
  const { aim = 0, delay = 0, idle = false } = opt;
  run.start();
  const dt = 1 / 120;
  let target: Pad | null = null, n = 0, lag = 0, off = 0;
  const input = { left: false, right: false };
  const apex = (JBAL.jump * JBAL.jump) / (2 * JBAL.gravity);
  for (let i = 0; i < 120 * 300 && run.phase === 'running'; i++) {
    for (const e of run.drain()) {
      if (e.kind === 'bounce' || e.kind === 'super' || e.kind === 'fall') {
        // 跳ねたら、次の足場を決める
        const base = e.kind === 'fall' ? run.camY : run.lastPad?.y ?? 0;
        const top = base + (e.kind === 'super' ? apex * 1.9 : apex) * 0.92;
        const cands = run.pads.filter(p => p.y > base + 0.3 && p.y <= top);
        target = cands.sort((a, b) => a.y - b.y)[0] ?? null;
        n++; off = aim * (((n * 7) % 11) / 5 - 1); lag = delay;
      }
    }
    if (!idle && target) {
      if (lag > 0) lag -= dt;
      else {
        const d = wrapDx(run.x, target.x + off);
        input.left = d < -0.15; input.right = d > 0.15;
      }
    }
    run.step(dt, input);
  }
  return run;
}
