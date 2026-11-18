// WORLD 2 せんべい屋台を、決まったやり方で遊ぶボット(テストとバランスの確認用)。
import { BakeRun } from '../src/bake/sim.ts';
import type { BakeLevel } from '../src/bake/levels.ts';

export type Policy = {
  /** いつタップするか: perfect=こんがりのまん中/ok=焼けたらすぐ/late=煙が出てから/never=裏返さない */
  timing?: 'perfect' | 'ok' | 'late' | 'never';
  /** 鹿にわたすか */
  serve?: boolean;
  /** 台と鉄板の上のせんべいを、何枚まで用意するか */
  stock?: number;
  /** 人の反応のおそさ(秒)。タップできると分かってから、これだけ待つ */
  delay?: number;
  /** くいしんぼう鹿を追いはらうか。aim=台をねらいはじめてから/late=食べはじめてから(1枚は取られる) */
  shoo?: boolean | 'aim' | 'late';
};

export function drive(level: BakeLevel, policy: Policy = {}, dt = 1 / 60): BakeRun {
  const { timing = 'perfect', serve = true, stock = 5, delay = 0, shoo = true } = policy;
  const run = new BakeRun(level);
  run.start();
  const c = level.cook;
  const target = timing === 'perfect' ? (c.perfect[0] + c.perfect[1]) / 2 : timing === 'ok' ? c.ok + 0.1 : timing === 'late' ? c.smoke + 0.3 : Infinity;
  const seen = new Map<string, number>();
  const ready = (key: string, now: boolean) => {
    if (!now) { seen.delete(key); return false; }
    if (!seen.has(key)) seen.set(key, run.t);
    return run.t - seen.get(key)! >= delay;
  };
  while (run.phase === 'running' && run.t < level.time + 1) {
    // くいしんぼう鹿: 見えたら(aim/late なら、ねらいはじめて・食べはじめてから)追いはらう
    const sn = run.sneak;
    const when = shoo === true ? ['walk', 'aim'] : shoo === 'aim' ? ['aim'] : shoo === 'late' ? ['eat'] : [];
    if (sn && when.includes(sn.phase) && ready(`s${sn.id}`, true)) run.tapSneak();
    run.plates.forEach((p, i) => {
      const cooking = run.plates.filter(x => x.state !== 'empty' && x.state !== 'burnt' && x.state !== 'discard').length;
      if (p.state === 'burnt' && ready(`b${i}`, true)) run.tapPlate(i);
      else if ((p.state === 'side1' || p.state === 'side2') && p.t >= target) run.tapPlate(i);
      else if (p.state === 'empty' && run.tray.length + cooking < stock && ready(`e${i}`, true)) run.tapPlate(i);
    });
    if (serve && run.tray.length) {
      const waiting = run.deer.filter(d => d.phase === 'wait').sort((a, b) => b.waited / b.patience - a.waited / a.patience);
      const d = waiting[0];
      if (d && ready(`d${d.id}`, true)) run.tapDeer(d.spot);
    }
    run.step(dt);
    run.drainEvents();
  }
  return run;
}
