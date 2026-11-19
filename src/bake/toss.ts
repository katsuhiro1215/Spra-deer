// WORLD 2 の「配る」面(せんべい くばり)のルール。画面とは切りはなす(テストで動きを確かめる)。設計書 30-7。
// 屋台の前から、公園にいる鹿へ せんべいを投げる。向きと強さ(とぶ距離)を決めて投げ、鹿の まわりに落ちれば受けとる。
// はずれたせんべいは地面に落ち、近くの鹿が拾いに来ることもある(拾い食い。コインは少し)。せんべいの数には かぎりがある。
import type { DeerKind, TossArrival, TossLevel } from './levels.ts';

export const SBAL = {
  /** 投げる所(屋台の前のふち。Spra の手)。x は 0 */
  originZ: -0.95,
  originY: 1.3,
  /** 鹿が受けとる高さ(口のあたり)。とぶせんべいは、ここで着く。受けとれなければ地面へ */
  catchY: 0.75,
  /** とぶ距離(m): 力 0 → dMin、力 1 → dMax */
  dMin: 1.2,
  dMax: 9.6,
  /** 投げられる向き(まっすぐ前から左右に。ラジアン) */
  maxAngle: 1.1,
  /** とぶ時間 = base + per × 距離(秒)。山の高さ = hBase + hPer × 距離(m) */
  flightBase: 0.4,
  flightPer: 0.06,
  hBase: 0.5,
  hPer: 0.16,
  /** 投げてから、次のせんべいを持つまで(秒) */
  reload: 0.3,
  /** 受けとれる半径(鹿の大きさで)と、「ぴったり」の半径 */
  catchR: { fawn: 0.62, doe: 0.72, stag: 0.85 } as Record<DeerKind, number>,
  perfectR: 0.26,
  /** 落ちたせんべいに、気づいて拾いに来る距離・歩く速さ */
  pickR: 1.1,
  pickSpeed: 1.6,
  /** 地面のせんべいが消えるまで(誰も拾わないとき。ほかの鹿が持っていく) */
  groundLife: 4,
  /** 鹿: 来る・帰る速さ(m/秒)・食べる・よろこぶ・おこる(秒) */
  walkSpeed: 2.2,
  eat: 0.6,
  happy: 1.4,
  angry: 1.4,
  /** 帰るとき、その場で ぴょんと はねる・おこる間 */
  hopHold: 0.5,
  /** 1枚もらうと、少し待ってくれる(秒) */
  relief: 5,
  /** 同じ場所には、ほかの鹿が去るまで来ない(m) */
  spotGap: 1.0,
  lives: 3,
  /** コイン: 1枚・屋台から 1mごと・ぴったり・拾い食い・あまったせんべい1枚 */
  coin: 4,
  coinPerM: 1,
  coinPerfect: 3,
  coinPick: 2,
  coinLeft: 2,
  /** この距離(m)より遠い鹿に「ぴったり」で、ゴールド */
  goldDist: 6,
};

export type TossDeerPhase = 'walk' | 'wait' | 'eat' | 'pick' | 'happy' | 'angry';
export type TossDeer = {
  id: number; kind: DeerKind; want: number; got: number; phase: TossDeerPhase;
  /** いまの動きの経過(秒) */
  t: number;
  waited: number; patience: number;
  /** いまの位置 */
  x: number; z: number;
  /** 立つ場所と、行ったり来たりする先(なければ null) */
  home: [number, number]; move: [number, number] | null; speed: number;
  /** 行ったり来たりの進み(0=home・1=move)と向き */
  u: number; dirU: 1 | -1;
  /** 来た所(帰る所) */
  from: [number, number];
  /** walk・pick で歩く時間 */
  walkT: number;
  /** 拾いに行く地面のせんべい・歩きはじめた所・帰りはじめた所 */
  pickId: number | null; pickFrom: [number, number]; leaveFrom: [number, number];
};
/** とんでいるせんべい。(x0,z0) から (x1,z1) へ、T 秒で */
export type Flight = { id: number; x0: number; z0: number; x1: number; z1: number; T: number; h: number; t: number; dist: number };
export type Ground = { id: number; x: number; z: number; t: number; claimed: number | null };
export type TossEvent = {
  kind: 'throw' | 'catch' | 'perfect' | 'miss' | 'pick' | 'vanish' | 'arrive' | 'happy' | 'angry' | 'heart' | 'premium' | 'clear' | 'fail' | 'served';
  deer?: number; id?: number; x?: number; z?: number;
  /** 屋台からの距離(m)・ゴールド・数(ぴったりの連続、あまったせんべい) */
  dist?: number; gold?: boolean; n?: number;
};
export type TossFail = 'angry' | 'empty' | 'time';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export class TossRun {
  phase: 'ready' | 'running' | 'cleared' | 'failed' = 'ready';
  reason: TossFail | null = null;
  t = 0;
  lives: number = SBAL.lives;
  coins = 0;
  gold = 0;
  premium = false;
  /** 満足した鹿 */
  served = 0;
  /** のこりの せんべい */
  stock: number;
  /** 投げた・受けとった・ぴったり・はずれ・拾い食い */
  thrown = 0;
  caught = 0;
  perfects = 0;
  misses = 0;
  picks = 0;
  /** ぴったりの連続と、いちばん長い連続 */
  streak = 0;
  bestStreak = 0;
  /** 次のせんべいを持つまで(秒) */
  reload = 0;
  deer: TossDeer[] = [];
  flights: Flight[] = [];
  ground: Ground[] = [];
  events: TossEvent[] = [];
  readonly level: TossLevel;
  private premiumOn: boolean;
  private nextArrival = 0;
  private nextId = 1;

  constructor(level: TossLevel, opts: { premium?: boolean } = {}) {
    this.level = level;
    this.stock = level.senbei;
    this.premiumOn = opts.premium ?? true;
  }
  start() { if (this.phase === 'ready') this.phase = 'running'; }
  drainEvents(): TossEvent[] { const e = this.events; this.events = []; return e; }
  get timeLeft() { return Math.max(0, this.level.time - this.t); }
  /** 投げられるか(せんべいを持っているか) */
  get ready() { return this.phase === 'running' && this.reload <= 0 && this.stock > 0; }

  // ---- とぶ道すじ ----
  /** 向き(ラジアン。0=まっすぐ前・プラスで右)と力(0〜1)から、とぶ距離と着く所 */
  aim(heading: number, power: number): { x: number; z: number; dist: number; T: number; h: number } {
    const a = clamp(heading, -SBAL.maxAngle, SBAL.maxAngle), p = clamp(power, 0, 1);
    const D = SBAL.dMin + p * (SBAL.dMax - SBAL.dMin);
    return { x: Math.sin(a) * D, z: SBAL.originZ - Math.cos(a) * D, dist: D, T: SBAL.flightBase + SBAL.flightPer * D, h: SBAL.hBase + SBAL.hPer * D };
  }
  /** 着く所(x, z)をねらうときの、向きと力 */
  aimFor(x: number, z: number): { heading: number; power: number } {
    const D = Math.hypot(x, z - SBAL.originZ);
    return { heading: Math.atan2(x, SBAL.originZ - z), power: (D - SBAL.dMin) / (SBAL.dMax - SBAL.dMin) };
  }
  /** とんでいる途中の位置(k: 0〜1) */
  static flightPos(f: { x0: number; z0: number; x1: number; z1: number; h: number }, k: number): { x: number; y: number; z: number } {
    return { x: lerp(f.x0, f.x1, k), y: lerp(SBAL.originY, SBAL.catchY, k) + 4 * f.h * k * (1 - k), z: lerp(f.z0, f.z1, k) };
  }

  private loseHeart(reason: TossFail) {
    this.lives--;
    this.events.push({ kind: 'heart' });
    if (this.lives <= 0) this.fail(reason);
  }
  private fail(reason: TossFail) {
    if (this.phase !== 'running') return;
    this.phase = 'failed'; this.reason = reason;
    this.events.push({ kind: 'fail' });
  }

  // ---- 操作 ----
  /** 投げる。投げられたら true */
  throw(heading: number, power: number): boolean {
    if (!this.ready) return false;
    const a = this.aim(heading, power);
    this.stock--; this.thrown++;
    this.reload = SBAL.reload;
    const f: Flight = { id: this.nextId++, x0: 0, z0: SBAL.originZ, x1: a.x, z1: a.z, T: a.T, h: a.h, t: 0, dist: a.dist };
    this.flights.push(f);
    this.events.push({ kind: 'throw', id: f.id, x: a.x, z: a.z, dist: a.dist });
    return true;
  }
  /** (x, z)をねらって投げる(テスト・ボット用) */
  throwTo(x: number, z: number): boolean { const a = this.aimFor(x, z); return this.throw(a.heading, a.power); }

  // ---- 時間を進める ----
  step(dt: number): void {
    if (this.phase !== 'running') {
      // 終わったあとも、帰っていく鹿は動かす
      for (const d of [...this.deer]) if (d.phase === 'happy' || d.phase === 'angry' || d.phase === 'eat') this.stepDeer(d, dt);
      // とんでいたせんべいは、そのまま着いて消える(もう数えない)
      for (const f of [...this.flights]) { f.t += dt; if (f.t >= f.T) this.flights.splice(this.flights.indexOf(f), 1); }
      return;
    }
    this.t += dt;
    this.reload = Math.max(0, this.reload - dt);
    this.arrive();
    for (const f of [...this.flights]) {
      f.t += dt;
      if (f.t >= f.T) { this.flights.splice(this.flights.indexOf(f), 1); this.land(f); }
      if (this.phase !== 'running') return;
    }
    for (const g of [...this.ground]) {
      g.t += dt;
      if (g.claimed === null && g.t >= SBAL.groundLife) { this.ground.splice(this.ground.indexOf(g), 1); this.events.push({ kind: 'vanish', id: g.id, x: g.x, z: g.z }); }
    }
    for (const d of [...this.deer]) { this.stepDeer(d, dt); if (this.phase !== 'running') return; }
    if (this.t >= this.level.time) { this.fail('time'); return; }
    // せんべいが なくなって、とんでいるのも、拾われそうなのも ない
    if (this.stock <= 0 && !this.flights.length && !this.ground.length && !this.deer.some(d => d.phase === 'pick')) this.fail('empty');
  }

  /** 来る時刻になった鹿を出す(立つ場所に ほかの鹿がいたら、去るまで待つ。順番は守る) */
  private arrive() {
    const list = this.level.arrivals;
    while (this.nextArrival < list.length && list[this.nextArrival].t <= this.t) {
      const a = list[this.nextArrival];
      if (this.deer.some(o => o.phase !== 'happy' && o.phase !== 'angry' && Math.hypot(o.home[0] - a.at[0], o.home[1] - a.at[1]) < SBAL.spotGap)) return;
      this.nextArrival++;
      this.spawn(a);
    }
  }
  private spawn(a: TossArrival) {
    const side = a.at[0] >= 0 ? 1 : -1, from: [number, number] = [side * 5.6, a.at[1] - 0.8];
    const dist = Math.hypot(a.at[0] - from[0], a.at[1] - from[1]);
    this.deer.push({
      id: this.nextId++, kind: a.kind, want: a.want, got: 0, phase: 'walk', t: 0, waited: 0, patience: this.level.patience[a.kind],
      x: from[0], z: from[1], home: [...a.at], move: a.move ? [...a.move] : null, speed: a.speed ?? 0.5, u: 0, dirU: 1,
      from, walkT: Math.max(1.2, dist / SBAL.walkSpeed), pickId: null, pickFrom: [0, 0], leaveFrom: [0, 0],
    });
  }

  /** とんできたせんべいが着いた: 近くで待っている鹿が受けとる。いなければ地面へ */
  private land(f: Flight) {
    let best: TossDeer | null = null, bd = Infinity;
    for (const d of this.deer) {
      if (d.phase !== 'wait') continue;
      const dd = Math.hypot(d.x - f.x1, d.z - f.z1);
      if (dd <= SBAL.catchR[d.kind] && dd < bd) { best = d; bd = dd; }
    }
    if (!best) {
      this.misses++; this.streak = 0;
      const g: Ground = { id: f.id, x: f.x1, z: f.z1, t: 0, claimed: null };
      this.ground.push(g);
      this.events.push({ kind: 'miss', id: f.id, x: f.x1, z: f.z1 });
      const d = this.nearestHungry(g.x, g.z);
      if (d) this.claim(d, g);
      return;
    }
    const d = best, perfect = bd <= SBAL.perfectR, dist = Math.hypot(d.x, d.z - SBAL.originZ);
    this.caught++;
    this.coins += SBAL.coin + Math.floor(dist * SBAL.coinPerM) + (perfect ? SBAL.coinPerfect : 0);
    const gold = perfect && dist >= SBAL.goldDist;
    if (gold) this.gold++;
    if (perfect) { this.perfects++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); } else this.streak = 0;
    this.events.push({ kind: perfect ? 'perfect' : 'catch', deer: d.id, id: f.id, x: d.x, z: d.z, dist, gold, n: this.streak });
    if (perfect && this.premiumOn && !this.premium && this.streak >= this.level.premiumStreak) { this.premium = true; this.events.push({ kind: 'premium' }); }
    this.feed(d);
  }
  /** 1枚もらった(受けとった・拾った)。ほしい数そろえば満足 */
  private feed(d: TossDeer) {
    d.got++;
    d.waited = Math.max(0, d.waited - SBAL.relief);
    d.phase = 'eat'; d.t = 0;
    if (d.got >= d.want) {
      this.served++;
      this.events.push({ kind: 'served', deer: d.id });
      if (this.served >= this.level.goal) {
        this.coins += this.stock * SBAL.coinLeft;
        this.phase = 'cleared';
        this.events.push({ kind: 'clear', n: this.stock });
      }
    }
  }
  private nearestHungry(x: number, z: number): TossDeer | null {
    let best: TossDeer | null = null, bd = SBAL.pickR;
    for (const d of this.deer) {
      if (d.phase !== 'wait') continue;
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd <= bd) { best = d; bd = dd; }
    }
    return best;
  }
  private claim(d: TossDeer, g: Ground) {
    g.claimed = d.id;
    d.phase = 'pick'; d.t = 0; d.pickId = g.id; d.pickFrom = [d.x, d.z];
    d.walkT = Math.max(0.35, Math.hypot(g.x - d.x, g.z - d.z) / SBAL.pickSpeed);
  }
  private leave(d: TossDeer, phase: 'happy' | 'angry') {
    d.phase = phase; d.t = 0; d.leaveFrom = [d.x, d.z];
  }

  private stepDeer(d: TossDeer, dt: number) {
    d.t += dt;
    switch (d.phase) {
      case 'walk': {
        const k = clamp(d.t / d.walkT, 0, 1);
        d.x = lerp(d.from[0], d.home[0], k); d.z = lerp(d.from[1], d.home[1], k);
        if (k >= 1) {
          d.phase = 'wait'; d.t = 0;
          this.events.push({ kind: 'arrive', deer: d.id });
          // 着いたら、足もとに落ちている せんべいに気づく
          const g = this.ground.find(g => g.claimed === null && Math.hypot(g.x - d.x, g.z - d.z) <= SBAL.pickR);
          if (g) this.claim(d, g);
        }
        break;
      }
      case 'wait':
        this.pace(d, dt);
        d.waited += dt;
        if (d.waited >= d.patience) {
          this.leave(d, 'angry');
          this.events.push({ kind: 'angry', deer: d.id });
          this.loseHeart('angry');
        }
        break;
      case 'eat':
        if (d.t >= SBAL.eat) {
          if (d.got >= d.want) { this.leave(d, 'happy'); this.events.push({ kind: 'happy', deer: d.id }); }
          else { d.phase = 'wait'; d.t = 0; }
        }
        break;
      case 'pick': {
        const g = this.ground.find(g => g.id === d.pickId);
        if (!g) { d.phase = 'wait'; d.t = 0; break; }
        const k = clamp(d.t / d.walkT, 0, 1);
        d.x = lerp(d.pickFrom[0], g.x, k); d.z = lerp(d.pickFrom[1], g.z, k);
        if (k >= 1) {
          // 拾った所が、新しい立ち位置(行ったり来たりの道も、いっしょにずらす)
          const sx = g.x - d.pickFrom[0], sz = g.z - d.pickFrom[1];
          d.home = [d.home[0] + sx, d.home[1] + sz];
          if (d.move) d.move = [d.move[0] + sx, d.move[1] + sz];
          this.ground.splice(this.ground.indexOf(g), 1);
          d.pickId = null;
          this.picks++;
          this.coins += SBAL.coinPick;
          this.events.push({ kind: 'pick', deer: d.id, id: g.id, x: g.x, z: g.z });
          this.feed(d);
        }
        break;
      }
      case 'happy':
      case 'angry': {
        const hold = SBAL.hopHold, dur = d.phase === 'happy' ? SBAL.happy : SBAL.angry;
        const k = clamp((d.t - hold) / (dur - hold), 0, 1);
        d.x = lerp(d.leaveFrom[0], d.from[0], k); d.z = lerp(d.leaveFrom[1], d.from[1], k);
        if (d.t >= dur) this.deer.splice(this.deer.indexOf(d), 1);
        break;
      }
    }
  }
  /** 行ったり来たりする鹿(待っている間だけ歩く) */
  private pace(d: TossDeer, dt: number) {
    if (!d.move) { d.x = d.home[0]; d.z = d.home[1]; return; }
    const len = Math.hypot(d.move[0] - d.home[0], d.move[1] - d.home[1]) || 1;
    d.u += d.dirU * (d.speed * dt) / len;
    if (d.u >= 1) { d.u = 2 - d.u; d.dirU = -1; }
    if (d.u <= 0) { d.u = -d.u; d.dirU = 1; }
    d.x = lerp(d.home[0], d.move[0], d.u); d.z = lerp(d.home[1], d.move[1], d.u);
  }
}
