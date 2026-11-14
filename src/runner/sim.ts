// 3D走りゲームの進行計算(見た目に依存しない)。
import { DEFAULT_RULES, HIT_RADIUS, PLAY_HALF, obstacleState, type Course, type Obstacle, type Rules } from './course.ts';

export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean; // 押している間 true(押した瞬間を内部で検出)
}

export type Phase = 'ready' | 'running' | 'cleared' | 'failed';
export type SimEvent = { kind: 'coin' | 'jump' | 'land' | 'hit' | 'fall' | 'slip' | 'slow' | 'slide' | 'clear' | 'fail'; id?: number };

export const PLAYER_RADIUS = 0.45;
const JUMP_V = 10.5;
const GRAVITY = 32;
const MAX_LIVES = 3;

export function baseSpeed(s: number, length: number, rules: Rules = DEFAULT_RULES): number {
  return rules.speed0 + (rules.speed1 - rules.speed0) * Math.min(1, s / length);
}

export class Run {
  phase: Phase = 'ready';
  t = 0;
  s = 0;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  speedMul = 1;
  lives = MAX_LIVES;
  coins = 0;
  invuln = 0;
  slip = 0;
  /** こおりをふんだあと、左右がきかない残り時間。 */
  ice = 0;
  stride = 0;
  readonly collected = new Set<number>();
  readonly consumed = new Set<number>();
  private events: SimEvent[] = [];
  private jumpBuf = 0;
  private prevJump = false;

  readonly course: Course;
  readonly rules: Rules;

  constructor(course: Course) {
    this.course = course;
    this.rules = course.rules ?? DEFAULT_RULES;
  }

  get speed(): number {
    return baseSpeed(this.s, this.course.length, this.rules) * this.speedMul;
  }
  get airborne(): boolean {
    return this.y > 0;
  }
  get progress(): number {
    return Math.min(1, this.s / this.course.length);
  }

  start(): void {
    this.phase = 'running';
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  step(dt: number, input: Input): void {
    if (this.phase === 'ready') return;
    this.t += dt;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);

    if (this.phase === 'cleared' || this.phase === 'failed') {
      // 停止演出
      this.speedMul = Math.max(0, this.speedMul - dt * (this.phase === 'cleared' ? 0.4 : 1.6));
      const maxS = this.course.length + 28;
      this.s = Math.min(maxS, this.s + this.speed * dt);
      this.x += (0 - this.x) * Math.min(1, dt * 2);
      this.integrateVertical(dt);
      return;
    }

    // 左右(スリップ中は逆)
    if (this.slip > 0) this.slip = Math.max(0, this.slip - dt);
    if (this.ice > 0) this.ice = Math.max(0, this.ice - dt);
    let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (this.slip > 0) dir = -dir;
    const target = dir * this.rules.steerSpeed;
    const accel = this.ice > 0 ? 2.5 : this.rules.steerAccel; // 氷の上では、ほとんど曲がれない
    const dv = Math.max(-accel * dt, Math.min(accel * dt, target - this.vx));
    this.vx += dv;
    this.x += this.vx * dt;
    if (this.x > PLAY_HALF) { this.x = PLAY_HALF; this.vx = 0; }
    if (this.x < -PLAY_HALF) { this.x = -PLAY_HALF; this.vx = 0; }

    // ジャンプ(少し早押しでも受け付ける)
    if (input.jump && !this.prevJump) this.jumpBuf = 0.14;
    this.prevJump = input.jump;
    if (this.jumpBuf > 0) {
      this.jumpBuf -= dt;
      if (this.y === 0) {
        this.vy = JUMP_V;
        this.jumpBuf = 0;
        this.events.push({ kind: 'jump' });
      }
    }
    this.integrateVertical(dt);

    // 前進。ぶつかったあとは遅くなり、少しずつもどる
    if (this.speedMul < 1) this.speedMul = Math.min(1, this.speedMul + dt * 0.33);
    const adv = this.speed * dt;
    this.s += adv;
    this.stride += adv;

    this.collide();
    this.pickCoins();

    if (this.phase === 'running' && this.s >= this.course.length) {
      this.phase = 'cleared';
      this.events.push({ kind: 'clear' });
    }
  }

  private integrateVertical(dt: number): void {
    if (this.y === 0 && this.vy <= 0) return;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.events.push({ kind: 'land' });
    }
  }

  private damage(kind: 'hit' | 'fall'): void {
    this.events.push({ kind });
    this.invuln = 1.6;
    this.speedMul = 0.55;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.phase = 'failed';
      this.events.push({ kind: 'fail' });
    }
  }

  private collide(): void {
    for (const o of this.course.obstacles) {
      if (o.s > this.s + 3 + o.len) break; // s 昇順の前提
      if (o.s + o.len < this.s - 3) continue;
      if (o.kind === 'hole') {
        // 着地している間だけ落ちる(端は少し大目に見る)
        if (this.y === 0 && this.s > o.s + 0.5 && this.s < o.s + o.len - 0.5) {
          const wasInvuln = this.invuln > 0;
          if (!wasInvuln) this.damage('fall');
          else this.events.push({ kind: 'fall' });
          this.s = o.s + o.len + 1.2;
          this.invuln = Math.max(this.invuln, 1.6);
          this.speedMul = Math.min(this.speedMul, 0.55);
        }
        continue;
      }
      if (this.consumed.has(o.id) || this.invuln > 0) continue;
      if (this.y >= o.height) continue;
      if (this.touches(o)) {
        this.consumed.add(o.id);
        if (o.kind === 'poop') {
          this.slip = 1.6;
          this.speedMul = Math.min(this.speedMul, 0.7);
          this.events.push({ kind: 'slip', id: o.id });
        } else if (o.kind === 'puddle') {
          this.speedMul = Math.min(this.speedMul, 0.6);
          this.events.push({ kind: 'slow', id: o.id });
        } else if (o.kind === 'ice') {
          this.ice = 1.4;
          this.events.push({ kind: 'slide', id: o.id });
        } else {
          this.damage('hit');
        }
      }
    }
  }

  private touches(o: Obstacle): boolean {
    const ds = Math.abs(o.s - this.s);
    if (o.kind === 'fence') {
      return ds < HIT_RADIUS.fence + PLAYER_RADIUS * 0.6 && Math.abs(this.x - o.x) < o.halfW + PLAYER_RADIUS * 0.6;
    }
    const ox = obstacleState(o, this.t).x;
    const r = HIT_RADIUS[o.kind] + PLAYER_RADIUS;
    const dx = ox - this.x;
    return dx * dx + ds * ds < r * r;
  }

  private pickCoins(): void {
    const cy = this.y + 0.7;
    for (const c of this.course.coins) {
      if (this.collected.has(c.id)) continue;
      if (Math.abs(c.s - this.s) > 1.6) continue;
      const dx = c.x - this.x;
      const ds = c.s - this.s;
      const dy = c.y - cy;
      if (dx * dx + ds * ds + dy * dy < 1.05 * 1.05) {
        this.collected.add(c.id);
        this.coins += 1;
        this.events.push({ kind: 'coin', id: c.id });
      }
    }
  }
}
