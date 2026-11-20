// 鹿ずもうのボット(テスト・手ごたえの確認用)。
import { Bout, RULES } from '../src/sumo/sim.ts';
import type { SumoLevel } from '../src/sumo/levels.ts';

export type SumoBotOpt = {
  /** 押す: 'beat'=緑を待つ、'mash'=連打、'none'=何もしない */
  push?: 'beat' | 'mash' | 'none';
  /** 押す前に残しておくスタミナ */
  keep?: number;
  /** いなす: 'now'=「今！」で、'panic'=ためが見えたら すぐ、'none'=いなさない */
  evade?: 'now' | 'panic' | 'none' | boolean;
  /** 「今！」から いなすまでの遅れ(秒) */
  late?: number;
  /** ため押しを使うか(相手が休んでいるとき) */
  charge?: boolean;
  /** N回に1回、緑をはずして押す(人の手のずれ。0=はずさない) */
  missEvery?: number;
};

export function driveSumo(level: SumoLevel, opt: SumoBotOpt = {}): Bout {
  const b = new Bout(level);
  const { push = 'beat', keep = 25, charge = false, late = 0, missEvery = 0 } = opt;
  const evade = opt.evade === true || opt.evade === undefined ? 'now' : opt.evade === false ? 'none' : opt.evade;
  b.start();
  const dt = 1 / 60;
  let n = 0, chargeT = 0, nowT = -1, wasWindup = false, lastBeat = -1;
  for (let i = 0; i < 60 * 60 * 4 && !b.done; i++) {
    b.update(dt);
    b.drain();
    if (!b.active) continue;
    if (b.charging) {
      chargeT += dt;
      if (chargeT >= RULES.chargeSweet + 0.1) b.releaseCharge();
      continue;
    }
    const windup = b.enemyState === 'windup';
    if (evade === 'panic' && windup && !wasWindup) b.evade();
    wasWindup = windup;
    if (evade === 'now') {
      if (b.dodgeNow) { nowT = nowT < 0 ? 0 : nowT + dt; if (nowT >= late) { b.evade(); nowT = -1; } continue; }
      nowT = -1;
    }
    if (windup) continue; // ためている相手の前では、ためない
    if (charge && b.stamina > 55 && b.enemyState === 'rest') { if (b.beginCharge()) { chargeT = 0; continue; } }
    if (push === 'mash') { b.push(); continue; }
    if (push === 'beat' && b.stamina >= keep && b.pushCooldown <= 0) {
      // 緑のときに押す。missEvery 回に1回は、少し早すぎる(緑の手前で押してしまう)
      // 1拍に1回だけ押す
      const beat = Math.floor(b.time / RULES.beat);
      const miss = missEvery > 0 && (n + 1) % missEvery === 0;
      const ph = b.beatPhase;
      if (beat !== lastBeat && (miss ? ph > 0.2 && ph < 0.3 : b.onBeat)) { if (b.push()) { n++; lastBeat = beat; } }
    }
  }
  return b;
}
