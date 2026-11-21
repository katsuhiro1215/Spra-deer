// WORLD 7 のボット(テスト・手ごたえの確認用)。まいごの子鹿 → お母さん の順に、マスの最短の道を歩く。
import { LBAL, LostRun, route, type Pt } from '../src/lost/sim.ts';
import type { LostLevel } from '../src/lost/levels.ts';

export type LostBotOpt = {
  /** 子鹿が おくれたら 待つ(false = 待たずに 走りつづける) */
  wait?: boolean;
  /** 寄り道の回数(はじめに 行き止まりへ 行ってから さがす。なれていない人の 代わり) */
  detours?: number;
  /** 何もしない */
  idle?: boolean;
};

export function driveLost(level: LostLevel, opt: LostBotOpt = {}): LostRun {
  const run = new LostRun(level);
  const { wait = true, detours = 0, idle = false } = opt;
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
  let path: Pt[] | null = null, goal: Pt | null = null;
  for (let i = 0; i < 120 * 600 && run.phase === 'running'; i++) {
    run.drain();
    if (idle) { run.step(dt, { x: 0, y: 0 }); continue; }
    // 行き先: 寄り道 → いちばん近い まいご → お母さん
    if (visits.length && Math.hypot(visits[0].x - run.x, visits[0].y - run.y) < 0.4) visits.shift();
    const lost = run.fawns.filter(f => f.state === 'lost').sort((a, b) => Math.hypot(a.x - run.x, a.y - run.y) - Math.hypot(b.x - run.x, b.y - run.y))[0];
    const following = run.fawns.find(f => run.connected(f));
    const next: Pt = visits[0] ?? lost ?? run.mothers[following?.mother ?? 0];
    if (!goal || goal.x !== next.x || goal.y !== next.y || !path) { goal = next; path = route(run, run, next); }
    // 子鹿が おくれていたら 待つ
    const late = run.fawns.some(f => run.connected(f) && run.pathLen(f) > LBAL.warn - 0.6);
    if (wait && late) { run.step(dt, { x: 0, y: 0 }); continue; }
    while (path && path.length > 1 && Math.hypot(path[0].x - run.x, path[0].y - run.y) < 0.12) path.shift();
    const p = path?.[0] ?? next;
    const dx = p.x - run.x, dy = p.y - run.y, d = Math.hypot(dx, dy);
    run.step(dt, d > 0.05 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 });
    // 道から はずれたら(ぶつかって 止まったら) 道を 引きなおす
    if (i % 60 === 0) path = route(run, run, next);
  }
  return run;
}
