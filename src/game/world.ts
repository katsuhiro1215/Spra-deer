import { FIELD, GOAL, RULES, type Point, type TrapDefinition } from './stage.ts';
import type { DeerDefinition, LevelDefinition } from './levels.ts';
import { facingOf, type Facing } from './facing.ts';
export type Input = { x: number; y: number; jump?: boolean };
export type Trap = TrapDefinition & { state: 'intact' | 'shaking' | 'open'; elapsed: number };
export type Event = { kind: 'jump' | 'land' | 'warning' | 'collapse' | 'poop' | 'fall' | 'clear' | 'dropWarning' | 'drop'; x: number; y: number; id?: string };
/** 歩く鹿。walk=歩く, warn=止まって予告中。 */
export type Deer = {
  id: string; kind: DeerDefinition['kind']; x: number; y: number; dir: 1 | -1;
  state: 'walk' | 'warn'; timer: number; dropped: number; nextDrop: number; walked: number;
};
export type World = {
  level: LevelDefinition;
  player: Point & { height: number; jumpTime: number; cooldown: number; facing: Facing; stride: number; moving: boolean };
  traps: Trap[]; deers: Deer[];
  /** 面に置かれたうんこ＋鹿が落としたうんこ。当たり判定はこれを使う。 */
  poops: Point[];
  time: number; jumps: number; outcome: 'playing' | 'poop' | 'fall' | 'clear';
  events: Event[]; furthest: number;
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function createWorld(level: LevelDefinition): World {
  return {
    level, player: { ...level.start, height: 0, jumpTime: -1, cooldown: 0, facing: 'up', stride: 0, moving: false },
    traps: level.traps.map(t => ({ ...t, state: 'intact', elapsed: 0 })),
    deers: level.deers.map(d => ({ id: d.id, kind: d.kind, x: d.startX, y: d.y, dir: d.startDir, state: 'walk', timer: 0, dropped: 0, nextDrop: d.firstDrop, walked: 0 })),
    poops: level.poops.map(p => ({ ...p })),
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
export function inHole(p: Point, t: TrapDefinition): boolean {
  // Test the foot/shadow centre against the inner edge; the sprite is not the collider.
  return p.x > t.x + 7 && p.x < t.x + t.width - 7 && p.y > t.y + 7 && p.y < t.y + t.height - 7;
}
function near(p: Point, t: TrapDefinition) {
  const x = clamp(p.x, t.x, t.x + t.width), y = clamp(p.y, t.y, t.y + t.height);
  return Math.hypot(p.x - x, p.y - y) < 68;
}
export function step(w: World, input: Input, dt = RULES.step): void {
  if (w.outcome !== 'playing') return;
  w.events = [];
  w.time += dt;
  const p = w.player;
  p.cooldown = Math.max(0, p.cooldown - dt);
  if (input.jump && p.jumpTime < 0 && p.cooldown <= 0) {
    p.jumpTime = 0; w.jumps++; w.events.push({ kind: 'jump', x: p.x, y: p.y });
  }
  const length = Math.hypot(input.x, input.y);
  const dx = input.x / Math.max(1, length), dy = input.y / Math.max(1, length);
  p.moving = length > .02;
  const fromX = p.x, fromY = p.y;
  p.x = clamp(p.x + dx * RULES.speed * dt, FIELD.left, FIELD.right);
  p.y = clamp(p.y + dy * RULES.speed * dt, FIELD.top, FIELD.bottom);
  // 向きは入力で、歩幅（足の出し入れ）は実際に進んだ距離で決める。壁に押しつけても足は動かない。
  if (p.moving) p.facing = facingOf(dx, dy);
  p.stride += Math.hypot(p.x - fromX, p.y - fromY);
  if (p.jumpTime >= 0) {
    p.jumpTime += dt;
    const t = p.jumpTime / RULES.jumpDuration;
    p.height = Math.max(0, 4 * RULES.jumpHeight * t * (1 - t));
    if (t >= 1) {
      p.jumpTime = -1; p.height = 0; p.cooldown = RULES.jumpCooldown;
      w.events.push({ kind: 'land', x: p.x, y: p.y });
    }
  }
  stepDeers(w, dt);
  for (const trap of w.traps) {
    if (trap.state === 'intact' && near(p, trap)) {
      trap.state = 'shaking'; trap.elapsed = 0;
      w.events.push({ kind: 'warning', x: trap.x + trap.width / 2, y: trap.y + trap.height / 2, id: trap.id });
    }
    if (trap.state === 'shaking') {
      trap.elapsed += dt;
      if (trap.elapsed >= trap.warning) {
        trap.state = 'open';
        w.events.push({ kind: 'collapse', x: trap.x + trap.width / 2, y: trap.y + trap.height / 2, id: trap.id });
      }
    }
  }
  if (p.height < 22 && w.poops.some(o => Math.hypot(o.x - p.x, o.y - p.y) < RULES.radius + RULES.poopRadius)) {
    w.outcome = 'poop'; w.events.push({ kind: 'poop', x: p.x, y: p.y });
  } else if (p.jumpTime < 0 && w.traps.some(t => t.state === 'open' && inHole(p, t))) {
    w.outcome = 'fall'; w.events.push({ kind: 'fall', x: p.x, y: p.y });
  } else if (p.jumpTime < 0 && Math.hypot(p.x - GOAL.x, p.y - GOAL.y) < GOAL.radius) {
    w.outcome = 'clear'; w.events.push({ kind: 'clear', x: p.x, y: p.y });
  }
  w.furthest = Math.min(w.furthest, p.y);
}
