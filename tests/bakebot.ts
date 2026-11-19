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
  /** 焼き加減の タップの ずれ(実時間で ±秒。人の手の ぶれ)。強火の鉄板ほど、焼け具合では 大きく ずれる */
  jitter?: number;
  seed?: number;
};

export function drive(level: BakeLevel, policy: Policy = {}, dt = 1 / 60): BakeRun {
  const { timing = 'perfect', serve = true, stock = 5, delay = 0, shoo = true, jitter = 0, seed = 1 } = policy;
  let a = (seed * 7919) >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  /** 鉄板ごと・面ごとの ずれ(焼けはじめに 決める) */
  const off = new Map<string, number>();
  const offOf = (i: number, p: { sid: number; state: string }) => { const k = `${p.sid}:${p.state}`; if (!off.has(k)) off.set(k, (rnd() * 2 - 1) * jitter * (level.heat?.[i] ?? 1)); return off.get(k)!; };
  const run = new BakeRun(level);
  run.start();
  const c = level.cook;
  const target = timing === 'perfect' ? (c.perfect[0] + c.perfect[1]) / 2 : timing === 'ok' ? c.ok + 0.1 : timing === 'late' ? c.smoke + 0.3 : Infinity;
  // 「やわらか」の注文(2-5 から): 見えている注文の数だけ、金色の前で 取る せんべいを 焼く
  const softAt = (c.ok + run.perfectWin[0]) / 2;
  const soft = new Set<number>();
  const softNeed = () => run.deer.filter(d => d.taste === 'soft' && (d.phase === 'walk' || d.phase === 'wait' || d.phase === 'eat')).reduce((n, d) => n + d.want - d.got, 0)
    - run.tray.filter(x => x.soft).length - run.plates.filter(p => soft.has(p.sid) && p.state !== 'empty' && p.state !== 'burnt' && p.state !== 'discard').length;
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
      else if ((p.state === 'side1' || p.state === 'side2') && p.t >= (soft.has(p.sid) && timing === 'perfect' ? softAt : target) + offOf(i, p)) run.tapPlate(i);
      else if (p.state === 'empty' && run.tray.length + cooking < stock && ready(`e${i}`, true)) {
        const need = softNeed() > 0;
        run.tapPlate(i);
        if (need) soft.add(run.plates[i].sid);
      }
    });
    if (serve && run.tray.length) {
      const waiting = run.deer.filter(d => d.phase === 'wait' && run.pickFor(d) >= 0).sort((a, b) => b.waited / b.patience - a.waited / a.patience);
      const d = waiting[0];
      if (d && ready(`d${d.id}`, true)) run.tapDeer(d.spot);
    }
    run.step(dt);
    run.drainEvents();
  }
  return run;
}
