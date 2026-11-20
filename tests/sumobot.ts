// 鹿ずもうのボット(テスト・手ごたえの確認用)。
import { Bout, RULES } from '../src/sumo/sim.ts';
import type { SumoLevel } from '../src/sumo/levels.ts';

export type SumoBotOpt = {
  /** 押す: 'beat'=緑を待つ、'mash'=連打、'none'=何もしない */
  push?: 'beat' | 'mash' | 'none';
  /** 押す前に残しておくスタミナ */
  keep?: number;
  /** いなすか */
  evade?: boolean;
  /** ため押しを使うか(相手が休んでいるとき) */
  charge?: boolean;
  /** タイミングのずれ(秒。0〜この値を、決まった並びで足す) */
  sloppy?: number;
};

export function driveSumo(level: SumoLevel, opt: SumoBotOpt = {}): Bout {
  const b = new Bout(level);
  const { push = 'beat', keep = 25, evade = true, charge = false, sloppy = 0 } = opt;
  b.start();
  const dt = 1 / 60;
  let n = 0, wait = 0, chargeT = 0;
  for (let i = 0; i < 60 * 60 && !b.done; i++) {
    b.update(dt);
    b.drain();
    if (!b.active) continue;
    if (wait > 0) { wait -= dt; continue; }
    if (b.charging) {
      chargeT += dt;
      if (chargeT >= RULES.chargeSweet + 0.1) b.releaseCharge();
      continue;
    }
    if (evade && b.dodgeNow) { b.evade(); continue; }
    if (b.enemyState === 'windup') continue; // ためている相手の前では、ためない
    if (charge && b.stamina > 60 && b.enemyState === 'rest' && b.enemyTimer > 1.3) { if (b.beginCharge()) { chargeT = 0; continue; } }
    if (push === 'mash') { b.push(); continue; }
    if (push === 'beat' && b.onBeat && b.stamina >= keep) {
      if (b.push()) { n++; wait = sloppy * ((n * 7) % 10) / 10; }
    }
  }
  return b;
}
