import { createWorld, step, type World, type Input } from '../src/game/world.ts';
import type { LevelDefinition } from '../src/game/levels.ts';

/**
 * 面がクリアできることを、シミュレーションで確かめる探索ボット。
 * 一定の時間（macro 秒）ごとに「8方向 / 止まる / ジャンプ付き」を選び、同じ場所（bucket）の状態をまとめて、
 * 先頭から band 以上遅れた状態は捨てる。見つかれば、実際に再生できる入力列を返す（＝クリア可能の証明）。
 * 見つからないのは「無理」ではなく「ボットが見つけられなかった」の意味。
 */
export type Action = { x: number; y: number; jump: boolean; throw?: boolean };
export type SolveResult = { ok: true; actions: Action[]; time: number; jumps: number } | { ok: false; reason: string; best: number };

const DIRS: [number, number][] = [[0, 0], [0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [0, 1]];
const S2 = Math.SQRT1_2;
const norm = ([x, y]: [number, number]): [number, number] => (x && y ? [x * S2, y * S2] : [x, y]);
const ACTIONS: Action[] = [
  ...DIRS.map(d => { const [x, y] = norm(d); return { x, y, jump: false }; }),
  ...DIRS.slice(1).map(d => { const [x, y] = norm(d); return { x, y, jump: true }; }),
];
/** 投げるせんべいの面: その方向を向いて投げる(そのあと、同じ方向へ歩く) */
const THROWS: Action[] = DIRS.slice(1).map(d => { const [x, y] = norm(d); return { x, y, jump: false, throw: true }; });
const input = (a: Action, i: number): Input => ({ x: a.x, y: a.y, jump: a.jump && i === 0, throw: !!a.throw && i === 0 });

type Node = { w: World; parent: Node | null; action: Action | null };

export function solve(level: LevelDefinition, opts: { macro?: number; bucket?: number; band?: number; maxTime?: number; maxLayer?: number } = {}): SolveResult {
  const macro = opts.macro ?? .25, bucket = opts.bucket ?? 40, band = opts.band ?? 300, maxTime = opts.maxTime ?? 60, maxLayer = opts.maxLayer ?? 700;
  const steps = Math.round(macro / (1 / 120));
  let layer: Node[] = [{ w: createWorld(level), parent: null, action: null }];
  // 進み具合は「上に進んだ位置」。
  const score = (w: World) => w.player.y;
  let best = level.start.y;
  let deaths: Record<string, number> = {};
  for (let t = 0; t < maxTime / macro && layer.length; t++) {
    const next = new Map<string, Node>();
    deaths = {};
    for (const node of layer) {
      for (const a of node.w.held > 0 ? [...ACTIONS, ...THROWS] : ACTIONS) {
        const p = node.w.player;
        if (a.jump && (p.height > 0 || p.jumpTime >= 0 || p.cooldown > 0 || level.cross || level.rescue)) continue;
        const w = structuredClone(node.w);
        for (let i = 0; i < steps && w.outcome === 'playing'; i++) step(w, input(a, i));
        if (w.outcome === 'clear') return { ok: true, actions: unwind({ w, parent: node, action: a }), time: w.time, jumps: w.jumps };
        if (w.outcome !== 'playing') { deaths[w.outcome] = (deaths[w.outcome] ?? 0) + 1; continue; }
        const q = w.player;
        const key = `${Math.round(q.x / bucket)},${Math.round(q.y / bucket)},${q.height > 0 ? 1 : 0},${w.walls.map(x => x.state[0]).join('')}${w.traps.map(x => x.state[0]).join('')}${w.chasers.map(x => Math.round(x.x / 90) + ':' + Math.round(x.y / 90)).join('')}${w.sliders.map(x => x.state[0]).join('')}${w.baitsLeft}:${w.poops.length}:${w.follower ? w.follower.state[0] + Math.round(w.follower.x / 60) + ':' + Math.round(w.follower.y / 60) : ''}${w.thieves.map(x => x.state[0] + Math.round(x.x / 90) + ':' + Math.round(x.y / 90)).join('')}|${w.arena ? w.arena.state[0] + w.drops.length : ''}${w.held}${w.hungry.map(x => x.state[0] + Math.round(x.x / 60) + ':' + Math.round(x.y / 60)).join('')}`;
        if (!next.has(key)) next.set(key, { w, parent: node, action: a });
      }
    }
    let nodes = [...next.values()];
    if (!nodes.length) return { ok: false, reason: `no live states; last deaths ${JSON.stringify(deaths)}; last y ${Math.round(Math.min(...layer.map(n => n.w.player.y)))} x ${layer.map(n => Math.round(n.w.player.x)).slice(0, 5)}`, best };
    const top = Math.min(...nodes.map(n => score(n.w)));
    best = Math.min(best, top);
    nodes = nodes.filter(n => score(n.w) <= top + band);
    if (nodes.length > maxLayer) { nodes.sort((a, b) => score(a.w) - score(b.w)); nodes = nodes.slice(0, maxLayer); }
    layer = nodes;
  }
  return { ok: false, reason: 'time limit', best };
}

function unwind(node: Node): Action[] {
  const out: Action[] = [];
  for (let n: Node | null = node; n && n.action; n = n.parent) out.push(n.action);
  return out.reverse();
}

/** solve が返した入力列を再生して、本当にクリアすることを確かめる。 */
export function replay(level: LevelDefinition, actions: Action[], macro = .25): World {
  const w = createWorld(level), steps = Math.round(macro / (1 / 120));
  for (const a of actions) for (let i = 0; i < steps && w.outcome === 'playing'; i++) step(w, input(a, i));
  return w;
}
