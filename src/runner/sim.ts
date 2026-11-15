// 3D走りゲームの進行計算(見た目に依存しない)。
import { DEFAULT_RULES, HIT_RADIUS, PLAY_HALF, obstacleRadius, obstacleState, roadBend, roadCurv, roadGrade, type Course, type Obstacle, type ObstacleState, type Rules } from './course.ts';
import type { Effect } from './critters.ts';

export interface Input {
  left: boolean;
  right: boolean;
  jump: boolean; // 押している間 true(押した瞬間を内部で検出)
}

export type Phase = 'ready' | 'running' | 'cleared' | 'failed';
export type SimEvent = { kind: 'coin' | 'heal' | 'jump' | 'launch' | 'land' | 'hit' | 'fall' | 'slip' | 'slow' | 'slide' | 'clear' | 'fail'; id?: number };

export const PLAYER_RADIUS = 0.45;
const JUMP_V = 10.5;
const GRAVITY = 32;
export const MAX_LIVES = 3;
/** カーブで、外側へ押される強さ(大きいほど、曲がり角で操作が要る) */
const DRIFT_GAIN = 7;
/** 坂で、速さが変わる強さ(登り10%で約2割おそく、下り10%で約2割速く) */
const SLOPE_GAIN = 2.2;

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
  /** 突進する動物が動き出した時刻(障害物の id → 時刻) */
  readonly chargeT = new Map<number, number>();
  private readonly chargers: Obstacle[];

  constructor(course: Course) {
    this.course = course;
    this.rules = course.rules ?? DEFAULT_RULES;
    this.chargers = course.obstacles.filter((o) => o.behavior === 'charge');
  }

  get speed(): number {
    return baseSpeed(this.s, this.course.length, this.rules) * this.speedMul * this.slopeMul;
  }
  /** 坂での速さの倍率(登りはおそく、下りは速く)。 */
  get slopeMul(): number {
    if (!this.course.hills) return 1;
    return Math.max(0.7, Math.min(1.35, 1 - SLOPE_GAIN * roadGrade(this.course, this.s)));
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
    // カーブでは、外側へ押し出される(右カーブなら、左へ)
    const drift = this.course.curve ? -roadCurv(this.course, this.s) * this.speed * DRIFT_GAIN : 0;
    this.x += (this.vx + drift) * dt;
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
    // y は道からの高さ。道が下へ曲がる所(坂の頂上・ジャンプ台の先)では、道が落ちていく分だけ体が浮く
    const v = this.speed;
    const acc = -GRAVITY - roadBend(this.course, this.s) * v * v;
    if (this.y === 0 && this.vy <= 0) {
      if (acc <= 0) return;
      this.events.push({ kind: 'launch' }); // 地面から飛び出した
    }
    this.vy += acc * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.events.push({ kind: 'land' });
    }
  }

  private damage(kind: 'hit' | 'fall', id?: number): void {
    this.events.push({ kind, id });
    this.invuln = 1.6;
    this.speedMul = 0.55;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.phase = 'failed';
      this.events.push({ kind: 'fail' });
    }
  }

  /** 障害物の、いまの位置(突進する動物は、近づいてくる)。 */
  stateOf(o: Obstacle): ObstacleState {
    return obstacleState(o, this.t, this.chargeT.get(o.id));
  }

  /** 当たったときの効果をかける。 */
  private applyEffect(effect: Effect, id: number): void {
    if (effect === 'slip') {
      this.slip = 1.6;
      this.speedMul = Math.min(this.speedMul, 0.7);
      this.events.push({ kind: 'slip', id });
    } else if (effect === 'slow') {
      this.speedMul = Math.min(this.speedMul, 0.6);
      this.events.push({ kind: 'slow', id });
    } else if (effect === 'ice') {
      this.ice = 1.4;
      this.events.push({ kind: 'slide', id });
    } else {
      this.damage('hit', id);
    }
  }

  private collide(): void {
    // 突進する動物は、プレイヤーが近づいたら動き出す
    for (const o of this.chargers) {
      if (!this.chargeT.has(o.id) && o.s - this.s < (o.trig ?? 38)) this.chargeT.set(o.id, this.t);
    }
    for (const o of this.course.obstacles) {
      // 突進するもの以外は、ずっと同じ位置なので、遠いものは調べない
      if (o.behavior !== 'charge' && (o.s > this.s + 3 + o.len || o.s + o.len < this.s - 3)) continue;
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
        const effect: Effect = o.kind === 'poop' ? 'slip' : o.kind === 'puddle' ? 'slow' : o.kind === 'ice' ? 'ice' : o.kind === 'critter' ? (o.effect ?? 'damage') : 'damage';
        this.applyEffect(effect, o.id);
      }
    }
  }

  private touches(o: Obstacle): boolean {
    if (o.kind === 'fence') {
      return Math.abs(o.s - this.s) < HIT_RADIUS.fence + PLAYER_RADIUS * 0.6 && Math.abs(this.x - o.x) < o.halfW + PLAYER_RADIUS * 0.6;
    }
    const st = this.stateOf(o);
    if (st.y > 0.5) return false; // 跳ねて、浮いている間は、下を通れる
    const ds = Math.abs(st.s - this.s);
    const r = obstacleRadius(o) + PLAYER_RADIUS;
    const dx = st.x - this.x;
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
      if (dx * dx + ds * ds + dy * dy < (c.kind === 'potion' ? 1.5 : 1.05) ** 2) {
        this.collected.add(c.id);
        if (c.kind === 'potion') {
          // 回復薬: ハートが1つふえる(3つまで)
          this.lives = Math.min(MAX_LIVES, this.lives + 1);
          this.events.push({ kind: 'heal', id: c.id });
        } else {
          this.coins += 1;
          this.events.push({ kind: 'coin', id: c.id });
        }
      }
    }
  }
}
