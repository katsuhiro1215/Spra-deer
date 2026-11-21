// WORLD 7 のボット(テスト・手ごたえの確認用)。まいごの子鹿 → お母さん の順に、マスの最短の道を歩く。
// 見回りの 大きな鹿の 近くの マスは 通らない(道が ふさがっていたら 待つ。近づいてきたら にげる)。
import { LBAL, LostRun, route, type Pt } from '../src/lost/sim.ts';
import type { LostLevel } from '../src/lost/levels.ts';

export type LostBotOpt = {
  /** 子鹿が おくれたら 待つ(false = 待たずに 走りつづける) */
  wait?: boolean;
  /** 寄り道の回数(はじめに 行き止まりへ 行ってから さがす。なれていない人の 代わり) */
  detours?: number;
  /** 何もしない */
  idle?: boolean;
  /** 大きな鹿を 気にしない */
  reckless?: boolean;
};

export function driveLost(level: LostLevel, opt: LostBotOpt = {}): LostRun {
  const run = new LostRun(level);
  const { wait = true, detours = 0, idle = false, reckless = false } = opt;
  run.start();
  const dt = 1 / 120;
  // 寄り道の行き先: スタートから 遠い 行き止まり(まわり3方が 木)
  const deadEnds: Pt[] = [];
  for (let r = 1; r < run.rows - 1; r++) for (let c = 1; c < run.cols - 1; c++) {
    if (run.solid(c, r)) continue;
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => run.solid(c + dc, r + dr)).length;
    if (walls === 3) deadEnds.push({ x: c + 0.5, y: r + 0.5 });
  }
  deadEnds.sort((a, b) => Math.hypot(b.x - run.x, b.y - run.y) - Math.hypot(a.x - run.x, a.y - run.y));
  const visits = deadEnds.filter(p => !run.fawns.some(f => Math.hypot(f.x - p.x, f.y - p.y) < 2)).slice(0, detours);
  const stagNear = (c: number, r: number, d = 1.7) => run.stags.some(s => Math.hypot(s.x - (c + 0.5), s.y - (r + 0.5)) < d);
  const pathDist = (p: Pt) => route(run, run, p)?.length ?? 1e9;
  let path: Pt[] | null = null, goal: Pt | null = null;
  for (let i = 0; i < 120 * 900 && run.phase === 'running'; i++) {
    run.drain();
    if (idle) { run.step(dt, { x: 0, y: 0 }); continue; }
    // 行き先: 寄り道 → いちばん近い まいご → 列の 先頭の子の お母さん
    if (visits.length && Math.hypot(visits[0].x - run.x, visits[0].y - run.y) < 0.4) visits.shift();
    let next: Pt;
    if (visits.length) next = visits[0];
    else {
      const lost = run.fawns.filter(f => f.state === 'lost');
      if (lost.length) next = i % 30 === 0 || !goal ? lost.sort((a, b) => pathDist(a) - pathDist(b))[0] : (lost.find(f => f.x === goal!.x && f.y === goal!.y) ?? lost[0]);
      else {
        const lead = run.fawns.find(f => f.state === 'follow' && f.leader < 0);
        next = run.mothers[lead?.mother ?? 0];
      }
    }
    const stags = run.stags.length > 0 && !reckless;
    if (!goal || goal.x !== next.x || goal.y !== next.y || !path || (stags && i % 30 === 0) || i % 60 === 0) {
      goal = next;
      path = route(run, run, next, stags ? (c, r) => stagNear(c, r) : undefined);
      // 今いる マスの まん中へは もどらない(マスの さかいめで 行ったり来たり しない)
      if (path && path.length > 1 && Math.hypot(path[1].x - run.x, path[1].y - run.y) <= 1.2) path.shift();
    }
    // 大きな鹿が 近づいてきたら、はなれる マスへ にげる
    if (stags) {
      const s = run.stags.find(q => Math.hypot(q.x - run.x, q.y - run.y) < 1.6);
      if (s) {
        const c = Math.floor(run.x), r = Math.floor(run.y);
        const opts = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dc, dr]) => !run.solid(c + dc, r + dr))
          .map(([dc, dr]) => ({ x: c + dc + 0.5, y: r + dr + 0.5 })).sort((a, b) => Math.hypot(b.x - s.x, b.y - s.y) - Math.hypot(a.x - s.x, a.y - s.y));
        const p = opts[0], dx = p.x - run.x, dy = p.y - run.y, d = Math.hypot(dx, dy);
        run.step(dt, d > 0.05 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 });
        path = null;
        continue;
      }
    }
    // 子鹿が おくれていたら(せんべいを 食べていたら) 待つ
    const late = run.fawns.some(f => run.connected(f) && (f.eat || run.pathLen(f) > LBAL.warn - 0.6));
    if ((wait && late) || !path) { run.step(dt, { x: 0, y: 0 }); continue; }
    while (path.length > 1 && Math.hypot(path[0].x - run.x, path[0].y - run.y) < 0.12) path.shift();
    const p = path[0] ?? next;
    const dx = p.x - run.x, dy = p.y - run.y, d = Math.hypot(dx, dy);
    run.step(dt, d > 0.05 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 });
  }
  return run;
}
