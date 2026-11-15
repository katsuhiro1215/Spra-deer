import { FIELD, GOAL, RULES, type CoinDefinition, type HedgeDefinition, type StoneDefinition, type CrosserDefinition, type RescueDefinition, type ThiefDefinition, type ChaserDefinition, type GoalDefinition, type Point, type TrapDefinition, type WallDefinition, type SliderDefinition } from './stage.ts';
import type { DeerDefinition, LevelDefinition } from './levels.ts';
import { facingOf, type Facing } from './facing.ts';
export type Input = { x: number; y: number; jump?: boolean };
export type Trap = TrapDefinition & { state: 'intact' | 'shaking' | 'open'; elapsed: number };
export type Event = {
  kind: 'coin' | 'gold' | 'premium' | 'sink' | 'water' | 'jump' | 'land' | 'warning' | 'collapse' | 'poop' | 'fall' | 'clear' | 'dropWarning' | 'drop' | 'wall' | 'slide' | 'crush' | 'goalMove' | 'chase' | 'caught' | 'bait' | 'eat' | 'stolen' | 'sweep' | 'found' | 'lost' | 'miss';
  x: number; y: number; id?: string;
};
/** 歩く鹿。walk=歩く, warn=止まって予告中。 */
export type Deer = {
  id: string; kind: DeerDefinition['kind']; x: number; y: number; dir: 1 | -1;
  state: 'walk' | 'warn'; timer: number; dropped: number; nextDrop: number; walked: number;
};
/** 横から出てくる壁。progress 0=隠れている, 1=道をふさいでいる。 */
export type Wall = WallDefinition & { length: number; state: 'idle' | 'in' | 'hold' | 'out' | 'done'; progress: number; timer: number };
/** 追いかけてくる鹿。 */
export type Chaser = { id: string; kind: ChaserDefinition['kind']; x: number; y: number; dir: 1 | -1; state: 'idle' | 'chase'; walked: number };
/** 降ってくるうんこ。wait=落ち始めを待つ, warn=影が出ている, done=落ちた。 */
export type Rain = { id: string; state: 'idle' | 'wait' | 'warn' | 'done'; timer: number; tx: number; ty: number };
/** 今のゴール。動くゴールなら、位置が変わる。 */
export type Goal = Point & { state: 'idle' | 'moving' | 'done' };
/** ジャンプで動き出すうんこ。cx, cy が今の位置。 */
export type Slider = SliderDefinition & { cx: number; cy: number; state: 'idle' | 'moving' | 'done' };
/** せんべいを狙う鹿。idle=その場, chase=せんべいへ向かう, eat=置かれたせんべいを食べている, full=満腹（もう追わない）。 */
export type Thief = { id: string; kind: ThiefDefinition['kind']; x: number; y: number; dir: 1 | -1; state: 'idle' | 'chase' | 'eat' | 'full'; timer: number; walked: number; bait: number };
/** 置いたせんべい。by は食べに来た鹿（-1=まだ誰も来ていない）。gone は食べ終わり。 */
export type Bait = Point & { by: number; gone: boolean };
/** 道を横切る動物。位置は時間だけで決まる。 */
export type Crosser = { id: string; kind: CrosserDefinition['kind']; x: number; y: number; dir: 1 | -1; walked: number };
/** 飛び石・はすの葉。x は今の位置(動く葉)。stand=乗っている秒数、sunk=沈んでいる(down 秒後に浮く)。 */
export type Stone = StoneDefinition & { cx: number; stand: number; sunk: boolean; down: number };
/** コイン。taken=取った。 */
export type Coin = CoinDefinition & { taken: boolean };
/** 迷子の鹿。lost=まだ見つけていない, follow=ついてくる（Spruが通った道を、少し遅れてたどる）。 */
export type Follower = { kind: RescueDefinition['kind']; x: number; y: number; dir: 1 | -1; state: 'lost' | 'follow'; walked: number; trail: Point[] };
export type Outcome = 'playing' | 'poop' | 'fall' | 'water' | 'wall' | 'caught' | 'stolen' | 'dirty' | 'hit' | 'lost' | 'clear';
export type World = {
  level: LevelDefinition;
  player: Point & { height: number; jumpTime: number; cooldown: number; facing: Facing; stride: number; moving: boolean };
  traps: Trap[]; deers: Deer[]; walls: Wall[]; sliders: Slider[]; chasers: Chaser[]; rain: Rain[]; goal: Goal;
  thieves: Thief[]; baits: Bait[]; baitsLeft: number;
  crossers: Crosser[]; follower: Follower | null; swept: number; sweepTime: number; missed: number; combo: number; bestCombo: number;
  stones: Stone[]; coins: Coin[];
  /** 取ったコイン(シルバー)・ゴールドの数、プレミアムを取ったか */
  silver: number; gold: number; premium: boolean;
  /** 面に置かれたうんこ＋鹿が落としたうんこ。当たり判定はこれと sliders を使う。 */
  poops: Point[];
  time: number; jumps: number; outcome: Outcome;
  events: Event[]; furthest: number;
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
/** 壁の大きさ。道（FIELD）の幅をまたいで覆い、隠れているときは画面の外にいる。左の壁は左端から、右の壁は右端から出てくる。 */
export const WALL = { length: 560, left: FIELD.left - 34, right: FIELD.right + 34, margin: 160 };
export const wallHide = (length: number) => length + WALL.margin;
export function wallRect(wall: Pick<Wall, 'side' | 'progress' | 'y' | 'thickness'> & { length?: number }) {
  const length = wall.length ?? WALL.length, hide = wallHide(length), away = (1 - wall.progress) * hide;
  const x = wall.side === 'l' ? WALL.left - away : WALL.right - length + away;
  return { x, y: wall.y - wall.thickness / 2, w: length, h: wall.thickness };
}
/** 横断する動物の位置。道の左右の外まで行って、反対側から戻ってくる。 */
const CROSS_MARGIN = 140;
export const crossSpan = () => FIELD.right - FIELD.left + CROSS_MARGIN * 2;
export function crossX(c: CrosserDefinition, t: number) {
  const span = crossSpan();
  return FIELD.left - CROSS_MARGIN + (((c.x0 + c.speed * t) % span) + span) % span;
}
export function createWorld(level: LevelDefinition): World {
  return {
    level, player: { ...level.start, height: 0, jumpTime: -1, cooldown: 0, facing: 'up', stride: 0, moving: false },
    traps: level.traps.map(t => ({ ...t, state: 'intact', elapsed: 0 })),
    deers: level.deers.map(d => ({ id: d.id, kind: d.kind, x: d.startX, y: d.y, dir: d.startDir, state: 'walk', timer: 0, dropped: 0, nextDrop: d.firstDrop, walked: 0 })),
    walls: level.walls.map(wall => ({ ...wall, length: wall.length ?? WALL.length, state: 'idle', progress: 0, timer: 0 })),
    chasers: level.chasers.map(c => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, dir: 1, state: 'idle', walked: 0 })),
    thieves: (level.delivery?.thieves ?? []).map(t => ({ id: t.id, kind: t.kind, x: t.x, y: t.y, dir: 1, state: 'idle', timer: 0, walked: 0, bait: -1 })),
    baits: [], baitsLeft: level.delivery?.baits ?? 0,
    crossers: (level.cross?.crossers ?? []).map(c => ({ id: c.id, kind: c.kind, x: crossX(c, 0), y: c.y, dir: c.speed >= 0 ? 1 : -1, walked: 0 })),
    follower: level.rescue ? { kind: level.rescue.kind, x: level.rescue.x, y: level.rescue.y, dir: 1, state: 'lost', walked: 0, trail: [] } : null,
    swept: 0, sweepTime: -1, missed: 0, combo: 0, bestCombo: 0,
    rain: level.rain.map(r => ({ id: r.id, state: 'idle', timer: 0, tx: r.x ?? 0, ty: r.y ?? 0 })),
    goal: { x: (level.goal ?? GOAL).x, y: (level.goal ?? GOAL).y, state: 'idle' },
    sliders: level.sliders.map(s => ({ ...s, cx: s.x, cy: s.y, state: 'idle' })),
    poops: level.poops.map(p => ({ ...p })),
    stones: (level.stones ?? []).map(s => ({ ...s, cx: s.x, stand: 0, sunk: false, down: 0 })),
    coins: (level.coins ?? []).map(c => ({ ...c, taken: false })),
    silver: 0, gold: 0, premium: false,
    time: 0, jumps: 0, outcome: 'playing', events: [], furthest: level.start.y,
  };
}
/** 鹿が落とすうんこの位置（体の後ろ側）。 */
export const dropSpot = (d: Pick<Deer, 'x' | 'y' | 'dir'>): Point => ({ x: d.x - d.dir * 34, y: d.y });
function stepDeers(w: World, dt: number) {
  w.level.deers.forEach((def, i) => {
    const d = w.deers[i];
    if (d.state === 'walk') {
      const move = def.speed * dt;
      d.x += d.dir * move; d.walked += move;
      if (d.x >= def.x2) { d.x = def.x2; d.dir = -1; } else if (d.x <= def.x1) { d.x = def.x1; d.dir = 1; }
      if (d.dropped < def.drops && w.time >= d.nextDrop) {
        d.state = 'warn'; d.timer = 0;
        const s = dropSpot(d); w.events.push({ kind: 'dropWarning', x: s.x, y: s.y, id: d.id });
      }
    } else {
      d.timer += dt;
      if (d.timer >= def.warning) {
        const s = dropSpot(d);
        w.poops.push(s); d.dropped++; d.state = 'walk'; d.nextDrop = w.time + def.dropEvery - def.warning;
        w.events.push({ kind: 'drop', x: s.x, y: s.y, id: d.id });
      }
    }
  });
}
function stepWalls(w: World, dt: number) {
  const p = w.player;
  for (const wall of w.walls) {
    const rate = wall.speed / wallHide(wall.length);
    if (wall.state === 'idle' && p.y <= wall.triggerY) {
      wall.state = 'in'; w.events.push({ kind: 'wall', x: p.x, y: wall.y, id: wall.id });
    }
    if (wall.state === 'in') {
      wall.progress = Math.min(1, wall.progress + rate * dt);
      if (wall.progress >= 1) { wall.state = 'hold'; wall.timer = 0; }
    } else if (wall.state === 'hold') {
      wall.timer += dt;
      if (wall.timer >= wall.hold) wall.state = 'out';
    } else if (wall.state === 'out') {
      wall.progress = Math.max(0, wall.progress - rate * dt);
      if (wall.progress <= 0) wall.state = 'done';
    }
  }
}
function hitsWall(p: Point, wall: Wall): boolean {
  if (wall.progress <= 0) return false;
  const r = wallRect(wall);
  const x = clamp(p.x, r.x, r.x + r.w), y = clamp(p.y, r.y, r.y + r.h);
  return Math.hypot(p.x - x, p.y - y) < RULES.radius;
}
function stepSliders(w: World, dt: number, jumped: boolean) {
  const p = w.player;
  for (const s of w.sliders) {
    if (s.state === 'idle' && ((s.trigger ?? 'jump') === 'jump' ? jumped : true) && Math.hypot(p.x - s.x, p.y - s.y) < s.within) {
      s.state = 'moving'; w.events.push({ kind: 'slide', x: s.cx, y: s.cy, id: s.id });
    }
    if (s.state === 'moving') {
      const dx = s.toX - s.cx, dy = s.toY - s.cy, d = Math.hypot(dx, dy), move = s.speed * dt;
      if (move >= d) { s.cx = s.toX; s.cy = s.toY; s.state = 'done'; }
      else { s.cx += dx / d * move; s.cy += dy / d * move; }
    }
  }
}
const CAUGHT_REACH = 40;
function stepChasers(w: World, dt: number) {
  const p = w.player;
  w.level.chasers.forEach((def, i) => {
    const c = w.chasers[i];
    if (c.state === 'idle' && p.y <= def.triggerY) { c.state = 'chase'; w.events.push({ kind: 'chase', x: c.x, y: c.y, id: c.id }); }
    if (c.state !== 'chase') return;
    const dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy) || 1, move = Math.min(def.speed * dt, d);
    c.x += dx / d * move; c.y += dy / d * move; c.walked += move;
    if (Math.abs(dx) > 8) c.dir = dx > 0 ? 1 : -1;
  });
}
const BAIT_EAT = 2.6, BAIT_ARRIVE = 18;
/**
 * せんべいを狙う鹿。sense 以内にせんべいがあると走り出す。持っているSpruと、置かれたせんべいのうち、近いほうへ向かう。
 * 置かれたせんべいに着くと、eat 秒だけ食べて、また追いかける。
 */
function stepThieves(w: World, dt: number) {
  const p = w.player, defs = w.level.delivery?.thieves ?? [], eat = w.level.delivery?.eat ?? BAIT_EAT;
  defs.forEach((def, i) => {
    const t = w.thieves[i];
    if (t.state === 'eat') {
      t.timer += dt;
      if (t.timer >= eat) { w.baits[t.bait].gone = true; t.bait = -1; t.state = 'full'; }
      return;
    }
    if (t.state === 'full') return; // 満腹。もう追わない（触れると、取られはする）
    const near = (b: Bait) => !b.gone && b.by < 0 ? Math.hypot(b.x - t.x, b.y - t.y) : Infinity;
    let bait = -1, baitDist = Infinity;
    w.baits.forEach((b, k) => { const d = near(b); if (d < baitDist) { baitDist = d; bait = k; } });
    const playerDist = Math.hypot(p.x - t.x, p.y - t.y);
    if (t.state === 'idle') {
      if (playerDist < def.sense || baitDist < def.sense) { t.state = 'chase'; w.events.push({ kind: 'chase', x: t.x, y: t.y, id: t.id }); } else return;
    }
    const toBait = bait >= 0 && baitDist < playerDist;
    const tx = toBait ? w.baits[bait].x : p.x, ty = toBait ? w.baits[bait].y : p.y;
    const dx = tx - t.x, dy = ty - t.y, d = Math.hypot(dx, dy) || 1, move = Math.min(def.speed * dt, d);
    t.x += dx / d * move; t.y += dy / d * move; t.walked += move;
    if (Math.abs(dx) > 8) t.dir = dx > 0 ? 1 : -1;
    if (toBait && d - move < BAIT_ARRIVE) { t.state = 'eat'; t.timer = 0; t.bait = bait; w.baits[bait].by = i; w.events.push({ kind: 'eat', x: t.x, y: t.y, id: t.id }); }
  });
}
function stepCrossers(w: World) {
  w.level.cross?.crossers.forEach((def, i) => {
    const c = w.crossers[i], x = crossX(def, w.time);
    c.walked += Math.abs(def.speed) * RULES.step; c.x = x;
  });
}
const FOLLOW_STEP = 4;
/** 迷子の鹿は、見つけると、Spruが通った道を lag だけ遅れてたどる。 */
function stepFollower(w: World) {
  const f = w.follower, def = w.level.rescue, p = w.player;
  if (!f || !def) return;
  if (f.state === 'lost') {
    if (Math.hypot(p.x - f.x, p.y - f.y) < def.found) { f.state = 'follow'; f.trail = [{ x: p.x, y: p.y }]; w.events.push({ kind: 'found', x: f.x, y: f.y }); }
    return;
  }
  const last = f.trail[f.trail.length - 1];
  if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= FOLLOW_STEP) f.trail.push({ x: p.x, y: p.y });
  let remain = def.lag, cur: Point = { x: p.x, y: p.y }, pos: Point | null = null, keep = 0;
  for (let i = f.trail.length - 1; i >= 0; i--) {
    const q = f.trail[i], d = Math.hypot(cur.x - q.x, cur.y - q.y);
    if (d >= remain) { const k = remain / d; pos = { x: cur.x + (q.x - cur.x) * k, y: cur.y + (q.y - cur.y) * k }; keep = i; break; }
    remain -= d; cur = q;
  }
  if (keep > 0) f.trail = f.trail.slice(keep);
  const target = pos ?? f.trail[0], dx = target.x - f.x;
  f.walked += Math.hypot(target.x - f.x, target.y - f.y); if (Math.abs(dx) > 1) f.dir = dx > 0 ? 1 : -1;
  f.x = target.x; f.y = target.y;
}
function followerHurt(w: World): boolean {
  const f = w.follower;
  if (!f || f.state !== 'follow') return false;
  const reach = RULES.radius + RULES.poopRadius;
  return w.poops.some(o => Math.hypot(o.x - f.x, o.y - f.y) < reach) || w.sliders.some(s => Math.hypot(s.cx - f.x, s.cy - f.y) < reach)
    || w.traps.some(t => t.state === 'open' && inHole(f, t)) || w.walls.some(wall => hitsWall(f, wall));
}
function stepRain(w: World, dt: number) {
  const p = w.player;
  w.level.rain.forEach((def, i) => {
    const r = w.rain[i];
    if (r.state === 'idle' && p.y <= def.triggerY) { r.state = 'wait'; r.timer = 0; }
    if (r.state === 'wait') {
      r.timer += dt;
      if (r.timer >= def.delay) {
        r.state = 'warn'; r.timer = 0;
        if (def.aim === 'player') { r.tx = p.x; r.ty = p.y; }
      }
    } else if (r.state === 'warn') {
      r.timer += dt;
      if (r.timer >= def.warn) {
        r.state = 'done'; w.poops.push({ x: r.tx, y: r.ty });
        w.events.push({ kind: 'drop', x: r.tx, y: r.ty, id: r.id });
      }
    }
  });
}
function stepGoal(w: World, dt: number) {
  const move = (w.level.goal ?? GOAL as GoalDefinition).moveTo;
  const g = w.goal, p = w.player;
  if (!move) return;
  if (g.state === 'idle' && Math.hypot(p.x - g.x, p.y - g.y) < move.within) { g.state = 'moving'; w.events.push({ kind: 'goalMove', x: g.x, y: g.y }); }
  if (g.state === 'moving') {
    const dx = move.x - g.x, dy = move.y - g.y, d = Math.hypot(dx, dy), step = move.speed * dt;
    if (step >= d) { g.x = move.x; g.y = move.y; g.state = 'done'; } else { g.x += dx / d * step; g.y += dy / d * step; }
  }
}
// ---- 道の形・池・コイン(設計書 28章) ----
/** 植え込みに入っているか(体の半径ぶん、ふくらませて見る)。 */
export function inHedge(p: Point, h: HedgeDefinition, r = RULES.radius): boolean {
  return p.x > h.x - r && p.x < h.x + h.w + r && p.y > h.y - r && p.y < h.y + h.h + r;
}
/** 池の、落ちる所(ふちは少し大目に見る)。 */
export function inPond(p: Point, w: World): boolean {
  return (w.level.ponds ?? []).some(o => p.x > o.x + 6 && p.x < o.x + o.w - 6 && p.y > o.y + 6 && p.y < o.y + o.h - 6);
}
/** 乗っている飛び石(沈んでいるものは除く)。 */
export function standingStone(p: Point, w: World): Stone | undefined {
  return w.stones.find(s => !s.sunk && Math.hypot(p.x - s.cx, p.y - s.y) < s.r);
}
const STONE_UP = 2.4; // 沈んだ石が、また浮くまでの秒
const COIN_REACH = 34;
function stepStones(w: World, dt: number) {
  const p = w.player, onGround = p.jumpTime < 0;
  for (const s of w.stones) {
    if (s.sunk) {
      s.down += dt;
      if (s.down >= STONE_UP) { s.sunk = false; s.down = 0; s.stand = 0; }
      continue;
    }
    const before = s.cx;
    if (s.move) s.cx = s.x + s.move.dx * Math.sin((2 * Math.PI * w.time) / s.move.period);
    const on = onGround && Math.hypot(p.x - before, p.y - s.y) < s.r;
    // 動く葉に乗っていると、いっしょに運ばれる
    if (on && s.move) p.x = clamp(p.x + (s.cx - before), FIELD.left, FIELD.right);
    if (on && s.sink !== undefined) {
      s.stand += dt;
      if (s.stand >= s.sink) { s.sunk = true; s.down = 0; w.events.push({ kind: 'sink', x: s.cx, y: s.y, id: s.id }); }
    } else if (!on) s.stand = 0;
  }
}
function pickCoins(w: World) {
  const p = w.player;
  for (const c of w.coins) {
    if (c.taken) continue;
    // 高い所のコインは、跳んで高く上がっているときだけ取れる
    if (c.air ? p.height < 34 : p.height > 60) continue;
    if (Math.hypot(p.x - c.x, p.y - c.y) > COIN_REACH) continue;
    c.taken = true;
    if (c.kind === 'premium') w.premium = true;
    else if (c.kind === 'gold') w.gold++;
    else w.silver++;
    w.events.push({ kind: c.kind === 'premium' ? 'premium' : c.kind === 'gold' ? 'gold' : 'coin', x: c.x, y: c.y });
  }
}
/** 植え込みに入らないよう、動いた分をもどす(横・縦を別々に見て、壁ぞいにすべれるように)。 */
function blockHedges(w: World, fromX: number, fromY: number) {
  const hedges = w.level.hedges;
  if (!hedges?.length) return;
  const p = w.player;
  const hit = (x: number, y: number) => hedges.some(h => inHedge({ x, y }, h));
  if (!hit(p.x, p.y)) return;
  if (!hit(p.x, fromY)) { p.y = fromY; return; }
  if (!hit(fromX, p.y)) { p.x = fromX; return; }
  p.x = fromX; p.y = fromY;
}

export function inHole(p: Point, t: TrapDefinition): boolean {
  // Test the foot/shadow centre against the inner edge; the sprite is not the collider.
  return p.x > t.x + 7 && p.x < t.x + t.width - 7 && p.y > t.y + 7 && p.y < t.y + t.height - 7;
}
function near(p: Point, t: TrapDefinition, reach: number) {
  const x = clamp(p.x, t.x, t.x + t.width), y = clamp(p.y, t.y, t.y + t.height);
  return Math.hypot(p.x - x, p.y - y) < reach;
}
export function step(w: World, input: Input, dt = RULES.step): void {
  if (w.outcome !== 'playing') return;
  w.events = [];
  w.time += dt;
  const p = w.player;
  p.cooldown = Math.max(0, p.cooldown - dt);
  let jumped = false;
  const sweep = w.level.sweep;
  if (input.jump && (w.level.delivery || sweep || w.level.cross || w.level.rescue)) {
    // ステージ2以降は、ジャンプしない。2はせんべいを置く。3・4・5はボタンなし（3は、触れると掃ける）。
    if (w.level.delivery && w.baitsLeft > 0 && p.cooldown <= 0) {
      w.baits.push({ x: p.x, y: p.y, by: -1, gone: false }); w.baitsLeft--; p.cooldown = .4;
      w.events.push({ kind: 'bait', x: p.x, y: p.y });
    }
  } else if (input.jump && p.jumpTime < 0 && p.cooldown <= 0) {
    p.jumpTime = 0; w.jumps++; jumped = true; w.events.push({ kind: 'jump', x: p.x, y: p.y });
  }
  const length = Math.hypot(input.x, input.y);
  const dx = input.x / Math.max(1, length), dy = input.y / Math.max(1, length);
  p.moving = length > .02;
  const fromX = p.x, fromY = p.y;
  p.x = clamp(p.x + dx * RULES.speed * dt, FIELD.left, FIELD.right);
  p.y = clamp(p.y + dy * RULES.speed * dt, FIELD.top, FIELD.bottom);
  // 向きは入力で、歩幅（足の出し入れ）は実際に進んだ距離で決める。壁に押しつけても足は動かない。
  blockHedges(w, fromX, fromY);
  if (p.moving) p.facing = facingOf(dx, dy);
  p.stride += Math.hypot(p.x - fromX, p.y - fromY);
  let landed = false;
  if (p.jumpTime >= 0) {
    p.jumpTime += dt;
    const t = p.jumpTime / RULES.jumpDuration;
    p.height = Math.max(0, 4 * RULES.jumpHeight * t * (1 - t));
    if (t >= 1) {
      p.jumpTime = -1; p.height = 0; p.cooldown = RULES.jumpCooldown; landed = true;
      w.events.push({ kind: 'land', x: p.x, y: p.y });
    }
  }
  stepDeers(w, dt);
  stepWalls(w, dt);
  stepSliders(w, dt, jumped);
  stepGoal(w, dt);
  stepChasers(w, dt);
  stepThieves(w, dt);
  stepCrossers(w);
  stepFollower(w);
  stepRain(w, dt);
  stepStones(w, dt);
  pickCoins(w);
  for (const trap of w.traps) {
    if (trap.state === 'intact') {
      const kind = trap.trigger ?? 'near';
      const hit = kind === 'land' ? landed && near(p, trap, trap.landReach ?? 90)
        : kind === 'y' ? p.y <= (trap.triggerY ?? -Infinity)
        : kind === 'goal' ? w.goal.state !== 'idle'
        : near(p, trap, 68);
      if (hit) {
        trap.state = 'shaking'; trap.elapsed = 0;
        if (!trap.silent) w.events.push({ kind: 'warning', x: trap.x + trap.width / 2, y: trap.y + trap.height / 2, id: trap.id });
      }
    }
    if (trap.state === 'shaking') {
      trap.elapsed += dt;
      if (trap.elapsed >= trap.warning) {
        trap.state = 'open';
        w.events.push({ kind: 'collapse', x: trap.x + trap.width / 2, y: trap.y + trap.height / 2, id: trap.id });
      }
    }
  }
  if (sweep) {
    // 触れたうんこは、掃ける。通り過ぎて、後ろに残したうんこは、見逃し。
    const keep: typeof w.poops = [];
    for (const o of w.poops) {
      if (Math.hypot(o.x - p.x, o.y - p.y) <= sweep.radius) {
        w.swept++; w.combo++; w.bestCombo = Math.max(w.bestCombo, w.combo); w.sweepTime = w.time;
        w.events.push({ kind: 'sweep', x: o.x, y: o.y });
      } else if (o.y > p.y + 150) {
        w.missed++; w.combo = 0; w.events.push({ kind: 'miss', x: o.x, y: o.y });
      } else keep.push(o);
    }
    w.poops = keep;
  }
  const poopReach = RULES.radius + RULES.poopRadius;
  if (p.height < 22 && !sweep && (w.poops.some(o => Math.hypot(o.x - p.x, o.y - p.y) < poopReach) || w.sliders.some(s => Math.hypot(s.cx - p.x, s.cy - p.y) < poopReach))) {
    w.outcome = 'poop'; w.events.push({ kind: 'poop', x: p.x, y: p.y });
  } else if (p.height < 22 && w.chasers.some(c => c.state === 'chase' && Math.hypot(c.x - p.x, c.y - p.y) < CAUGHT_REACH)) {
    w.outcome = 'caught'; w.events.push({ kind: 'caught', x: p.x, y: p.y });
  } else if (w.thieves.some(t => Math.hypot(t.x - p.x, t.y - p.y) < CAUGHT_REACH)) {
    w.outcome = 'stolen'; w.events.push({ kind: 'stolen', x: p.x, y: p.y });
  } else if (w.crossers.some(c => Math.abs(c.x - p.x) < 44 && Math.abs(c.y - p.y) < 26)) {
    w.outcome = 'hit'; w.events.push({ kind: 'caught', x: p.x, y: p.y });
  } else if (sweep && w.missed >= sweep.limit) {
    w.outcome = 'dirty'; w.events.push({ kind: 'poop', x: p.x, y: p.y });
  } else if (followerHurt(w)) {
    w.outcome = 'lost'; w.events.push({ kind: 'lost', x: w.follower!.x, y: w.follower!.y });
  } else if (p.height < 22 && w.walls.some(wall => hitsWall(p, wall))) {
    w.outcome = 'wall'; w.events.push({ kind: 'crush', x: p.x, y: p.y });
  } else if (p.jumpTime < 0 && w.traps.some(t => t.state === 'open' && inHole(p, t))) {
    w.outcome = 'fall'; w.events.push({ kind: 'fall', x: p.x, y: p.y });
  } else if (p.jumpTime < 0 && inPond(p, w) && !standingStone(p, w)) {
    w.outcome = 'water'; w.events.push({ kind: 'water', x: p.x, y: p.y });
  } else if (p.jumpTime < 0 && Math.hypot(p.x - w.goal.x, p.y - w.goal.y) < GOAL.radius
    && (!w.level.rescue || (w.follower?.state === 'follow' && Math.hypot(w.follower.x - p.x, w.follower.y - p.y) < 140))) {
    w.outcome = 'clear'; w.events.push({ kind: 'clear', x: p.x, y: p.y });
  }
  w.furthest = Math.min(w.furthest, p.y);
}
