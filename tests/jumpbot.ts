// WORLD 5 のボット(テスト・手ごたえの確認用)。今の足場より上で、届く いちばん低い足場を ねらう。
import { JBAL, JumpRun, wrapDx, type Pad } from '../src/jump/sim.ts';
import type { JumpLevel } from '../src/jump/levels.ts';

export type JumpBotOpt = {
  /** ねらいの ずれ(m)。決まった並びで ±この値 */
  aim?: number;
  /** 反応の おくれ(秒) */
  delay?: number;
  /** ねらいの ずれの 並びを かえる */
  seed?: number;
  /** 何もしない */
  idle?: boolean;
  /** 落ちたときに 呼ぶ(調べる用) */
  onFall?: (run: JumpRun, target: Pad | null) => void;
  /** 画面の縦の長さ(m)。ふつうは 390×844 の画面(19.5m) */
  viewH?: number;
};

export function driveJump(level: JumpLevel, opt: JumpBotOpt = {}): JumpRun {
  const run = new JumpRun(level, opt.viewH ?? 19.5); // 390×844 の画面
  const { aim = 0, delay = 0, idle = false } = opt;
  run.start();
  const dt = 1 / 120;
  let target: Pad | null = null, n = 0, lag = 0, off = 0;
  const input = { left: false, right: false };
  const apex = (JBAL.jump * JBAL.jump) / (2 * JBAL.gravity);
  for (let i = 0; i < 120 * 300 && run.phase === 'running'; i++) {
    for (const e of run.drain()) {
      if ((e.kind === 'fall' || e.kind === 'catch') && opt.onFall) opt.onFall(run, target);
      if (e.kind === 'bounce' || e.kind === 'super' || e.kind === 'fall' || e.kind === 'catch' || e.kind === 'crow') {
        // 跳ねたら、次の足場を決める
        const base = e.kind === 'fall' || e.kind === 'catch' ? run.camY : e.kind === 'crow' ? run.y - 3 : run.lastPad?.y ?? 0;
        const top = base + (e.kind === 'super' || e.kind === 'catch' ? apex * 1.9 : apex) * 0.92;
        const high = e.kind === 'super' || e.kind === 'catch';
        const cands = run.pads.filter(p => p.goneAt < 0 && p.baseY > base + (high ? 2 : 0.3) && p.baseY <= top);
        target = cands.sort((a, b) => a.y - b.y)[0] ?? null;
        n++; off = aim * ((((n + (opt.seed ?? 0) * 5) * 7) % 11) / 5 - 1); lag = delay;
      }
    }
    if (!idle && target) {
      if (lag > 0) lag -= dt;
      else {
        let d = wrapDx(run.x, target.x + off);
        // 近くの カラスからは はなれる(上がっている ときに、通り道に いたら)
        const cy = run.y + JBAL.spraH / 2;
        const crow = run.vy > 0 ? run.crows.find(c => c.y > cy - 0.5 && c.y - cy < 3 && Math.abs(wrapDx(run.x, c.x)) < 1.6) : undefined;
        if (crow) d = -Math.sign(wrapDx(run.x, crow.x)) || 1;
        input.left = d < -0.15; input.right = d > 0.15;
      }
    }
    run.step(dt, input);
  }
  return run;
}
