import { FIELD, GOAL, POOPS, RULES, START, TRAPS, type Point, type TrapDefinition } from './stage.ts';
export type Input = { x: number; y: number; jump?: boolean };
export type Trap = TrapDefinition & { state: 'intact' | 'shaking' | 'open'; elapsed: number };
export type Event = { kind: 'jump' | 'land' | 'warning' | 'collapse' | 'poop' | 'fall' | 'clear'; x: number; y: number; id?: string };
export type World = {
  player: Point & { height: number; jumpTime: number; cooldown: number; facing: number; moving: boolean };
  traps: Trap[]; time: number; jumps: number; outcome: 'playing' | 'poop' | 'fall' | 'clear';
  events: Event[]; furthest: number;
};
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function createWorld(): World {
  return { player: { ...START, height: 0, jumpTime: -1, cooldown: 0, facing: 1, moving: false }, traps: TRAPS.map(t => ({ ...t, state: 'intact', elapsed: 0 })), time: 0, jumps: 0, outcome: 'playing', events: [], furthest: START.y };
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
  p.x = clamp(p.x + dx * RULES.speed * dt, FIELD.left, FIELD.right);
  p.y = clamp(p.y + dy * RULES.speed * dt, FIELD.top, FIELD.bottom);
  if (Math.abs(dx) > .05) p.facing = dx < 0 ? -1 : 1;
  if (p.jumpTime >= 0) {
    p.jumpTime += dt;
    const t = p.jumpTime / RULES.jumpDuration;
    p.height = Math.max(0, 4 * RULES.jumpHeight * t * (1 - t));
    if (t >= 1) {
      p.jumpTime = -1; p.height = 0; p.cooldown = RULES.jumpCooldown;
      w.events.push({ kind: 'land', x: p.x, y: p.y });
    }
  }
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
  if (p.height < 22 && POOPS.some(o => Math.hypot(o.x - p.x, o.y - p.y) < RULES.radius + RULES.poopRadius)) {
    w.outcome = 'poop'; w.events.push({ kind: 'poop', x: p.x, y: p.y });
  } else if (p.jumpTime < 0 && w.traps.some(t => t.state === 'open' && inHole(p, t))) {
    w.outcome = 'fall'; w.events.push({ kind: 'fall', x: p.x, y: p.y });
  } else if (p.jumpTime < 0 && Math.hypot(p.x - GOAL.x, p.y - GOAL.y) < GOAL.radius) {
    w.outcome = 'clear'; w.events.push({ kind: 'clear', x: p.x, y: p.y });
  }
  w.furthest = Math.min(w.furthest, p.y);
}
