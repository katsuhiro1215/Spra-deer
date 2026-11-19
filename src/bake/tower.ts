// WORLD 2 の「積む」面(せんべいタワー)のルール。画面とは切りはなす(テストで動きを確かめる)。設計書 30-6。
// 左右にゆれるせんべいを、タップで落として積む。ずれて積むと、上の重心がはみ出したところから崩れる(本物の積み木と同じ)。
// 注文の段数まで積んだら「おとどけ」。もっと積むと、ごほうびがふえる(崩れたら ♥−1 で、タワーはやり直し)。
import type { DeerKind, TowerLevel } from './levels.ts';
import type { Deer } from './sim.ts';

export const TBAL = {
  /** せんべいの半径・厚み(m) */
  r: 0.3,
  h: 0.085,
  /** お盆の半径(いちばん下の土台) */
  plateR: 0.46,
  /** こんがり(パーフェクト)のずれの幅。これより近いと、ぴったり真上に乗る */
  perfect: 0.04,
  /** パーフェクトを何回続けると、大判せんべい(大きくて安定する)が来るか */
  bigAfter: 3,
  bigScale: 1.35,
  /** ゆれる幅(まん中から左右に) */
  span: 0.75,
  /** 落とす高さ(タワーのてっぺんから) */
  dropH: 0.5,
  g: 9.8,
  /** タワーのゆれ: 何段目からゆれだすか・1段ごとのゆれ幅・不安定なときの増え方・いちばん大きいゆれ・速さ */
  swayFrom: 3,
  swayPer: 0.02,
  swayUnstable: 1.6,
  swayMax: 0.26,
  swayFreq: 2.6,
  /** 鹿 */
  walk: 2.4,
  happy: 1.6,
  angry: 1.4,
  /** とどける・崩れるあいだは、次を落とせない */
  deliverT: 0.7,
  collapseT: 1.1,
  lives: 3,
  /** コイン: 1段ごと・注文より多い段・パーフェクト */
  coinPer: 4,
  coinExtra: 8,
  coinPerfect: 2,
  /** 注文より この段数以上 多く積んでとどけると、ゴールド */
  goldExtra: 4,
  /** 風: ふく前の 予告(秒)・Piko が手伝うと 流される割合 */
  windWarn: 1.4,
  pikoWind: 0.35,
  /** 下を食べる鹿: 歩いてくる・ねらう(予告)・1段 食べる間(秒)・何段 食べるか・逃げる時間 */
  nibWalk: 2.4,
  nibAim: 1.8,
  nibBite: 1.5,
  nibBites: 2,
  nibFlee: 0.9,
} as const;

export type Layer = { x: number; r: number; perfect: boolean };
export type TowerEvent = {
  kind: 'drop' | 'land' | 'perfect' | 'miss' | 'collapse' | 'big' | 'deliver' | 'arrive' | 'happy' | 'angry' | 'heart' | 'premium' | 'clear' | 'fail' | 'notYet'
    | 'windWarn' | 'wind' | 'windEnd' | 'nibbler' | 'nibAim' | 'nibble' | 'nibShoo' | 'nibLeave';
  /** 着いた段・崩れはじめた段・とどけた段数 */
  n?: number; x?: number; gold?: boolean; deer?: number;
  /** 崩れて落ちた段・とどけたタワー(絵のため) */
  fallen?: Layer[];
};
export type TowerFail = 'collapse' | 'angry' | 'time' | 'nibbled';

export class TowerRun {
  phase: 'ready' | 'running' | 'cleared' | 'failed' = 'ready';
  reason: TowerFail | null = null;
  t = 0;
  lives: number = TBAL.lives;
  coins = 0;
  gold = 0;
  premium = false;
  delivered = 0;
  best = 0;
  perfects = 0;
  collapses = 0;
  misses = 0;
  /** 積んだせんべい(下から)。x は、タワーの「まっすぐのとき」の位置 */
  stack: Layer[] = [];
  /** ゆれている(持っている)せんべい */
  hold = { x: -TBAL.span, dir: 1, big: false };
  /** 落ちている途中のせんべい(てっぺんからの高さ y) */
  falling: { x: number; y: number; vy: number; big: boolean } | null = null;
  customer: Deer | null = null;
  /** とどける・崩れる間の待ち(秒) */
  busy = 0;
  /** パーフェクトの連続 */
  perfectRun = 0;
  /** 風: 向き(−1/0/1)・予告の向き・のこりの秒数 */
  wind: -1 | 0 | 1 = 0;
  windComing: -1 | 0 | 1 = 0;
  windLeft = 0;
  private nextWind = 0;
  /** タワーの下を食べに来た鹿(1頭ずつ) */
  nibbler: { id: number; side: -1 | 1; phase: 'walk' | 'aim' | 'eat' | 'flee'; t: number; bites: number } | null = null;
  private nibIndex = 0;
  /** 食べられた段の数 */
  eaten = 0;
  events: TowerEvent[] = [];
  readonly level: TowerLevel;
  private premiumOn: boolean;
  private nextOrder = 0;
  private nextId = 1;
  private orderCount = 0;

  constructor(level: TowerLevel, opts: { premium?: boolean } = {}) {
    this.level = level;
    this.premiumOn = opts.premium ?? true;
  }
  start() { if (this.phase === 'ready') this.phase = 'running'; }
  drainEvents(): TowerEvent[] { const e = this.events; this.events = []; return e; }
  get timeLeft() { return Math.max(0, this.level.time - this.t); }
  get height() { return this.stack.length; }
  get want() { return this.customer?.want ?? 0; }
  /** ゆれる速さ(高くなるほど速い) */
  get swingSpeed() { return this.level.swing.speed + this.level.swing.accel * this.stack.length; }
  /** 持っているせんべいの半径 */
  get holdR() { return this.hold.big ? TBAL.r * TBAL.bigScale : TBAL.r; }

  /** 安定度(0〜1)。それぞれの段について、上の重心が、その段のふちまでどれだけ余裕があるか、のいちばん小さい値 */
  stability(stack: Layer[] = this.stack): number {
    let worst = 1;
    for (let i = -1; i < stack.length - 1; i++) {
      const base = i < 0 ? { x: 0, r: TBAL.plateR } : stack[i];
      const com = this.com(stack, i + 1);
      worst = Math.min(worst, (base.r - Math.abs(com - base.x)) / base.r);
    }
    return Math.max(0, worst);
  }
  /** from 段目から上の重心(大きいせんべいほど重い) */
  private com(stack: Layer[], from: number): number {
    let m = 0, mx = 0;
    for (let k = from; k < stack.length; k++) { const w = stack[k].r * stack[k].r; m += w; mx += w * stack[k].x; }
    return m ? mx / m : 0;
  }
  /** タワーのゆれ: てっぺんの横のずれ(m)。高く・不安定なほど大きい */
  swayTop(): number {
    const n = this.stack.length;
    if (n <= TBAL.swayFrom) return 0;
    const amp = Math.min(TBAL.swayMax, TBAL.swayPer * (n - TBAL.swayFrom) * (1 + TBAL.swayUnstable * (1 - this.stability())));
    return amp * Math.sin(this.t * TBAL.swayFreq);
  }
  /** k 段目(0 が一番下)の、今の横の位置(ゆれを含む) */
  layerX(k: number): number {
    const n = this.stack.length, lean = n ? this.swayTop() / n : 0;
    return this.stack[k].x + lean * (k + 1);
  }
  /** てっぺんの、今の横の位置(ゆれを含む。何もなければお盆のまん中) */
  topX(): number { return this.stack.length ? this.layerX(this.stack.length - 1) : 0; }

  private loseHeart(reason: TowerFail) {
    this.lives--;
    this.events.push({ kind: 'heart' });
    if (this.lives <= 0) this.fail(reason);
  }
  private fail(reason: TowerFail) {
    if (this.phase !== 'running') return;
    this.phase = 'failed'; this.reason = reason;
    this.events.push({ kind: 'fail' });
  }

  // ---- 操作 ----
  /** 風で 流される速さ(m/秒。左が −)。Piko が手伝うと 弱い */
  get windSpeed(): number { const w = this.level.wind; return w && this.wind ? this.wind * w.force * (this.level.helpers?.includes('piko') ? TBAL.pikoWind : 1) : 0; }
  /** 下を食べる鹿を おいはらう */
  shoo(): void {
    const b = this.nibbler;
    if (!b || this.phase !== 'running' || b.phase === 'flee') return;
    b.phase = 'flee'; b.t = 0;
    this.events.push({ kind: 'nibShoo', deer: b.id });
  }
  /** タップ: ゆれているせんべいを落とす */
  drop(): void {
    if (this.phase !== 'running' || this.falling || this.busy > 0) return;
    this.falling = { x: this.hold.x, y: TBAL.dropH, vy: 0, big: this.hold.big };
    this.hold.big = false;
    this.events.push({ kind: 'drop', x: this.hold.x });
  }
  /** おとどけ: 注文の段数まで積んでいたら、鹿にわたす */
  deliver(): void {
    const d = this.customer, n = this.stack.length;
    if (this.phase !== 'running' || !d || d.phase !== 'wait' || this.busy > 0 || this.falling) return;
    if (n < d.want) { this.events.push({ kind: 'notYet', n: d.want - n }); return; }
    const extra = n - d.want, perfects = this.stack.filter(l => l.perfect).length;
    this.coins += n * TBAL.coinPer + extra * TBAL.coinExtra + perfects * TBAL.coinPerfect;
    const gold = extra >= TBAL.goldExtra;
    if (gold) this.gold++;
    this.best = Math.max(this.best, n);
    this.delivered++;
    this.events.push({ kind: 'deliver', n, gold, deer: d.id, fallen: [...this.stack] });
    if (n >= this.level.premiumHeight && !this.premium && this.premiumOn) { this.premium = true; this.events.push({ kind: 'premium' }); }
    this.stack = [];
    this.busy = TBAL.deliverT;
    d.got = d.want; d.allGokujo = gold;
    d.phase = 'happy'; d.t = 0;
    this.events.push({ kind: 'happy', deer: d.id, gold });
    if (this.delivered >= this.level.goal) { this.phase = 'cleared'; this.events.push({ kind: 'clear' }); }
  }

  // ---- 時間を進める ----
  step(dt: number): void {
    if (this.phase !== 'running') {
      const d = this.customer;
      if (d && (d.phase === 'happy' || d.phase === 'angry')) this.stepDeer(d, dt);
      return;
    }
    this.t += dt;
    this.busy = Math.max(0, this.busy - dt);
    // ゆれるせんべい(はしで折り返す)
    const h = this.hold, sp = this.swingSpeed;
    h.x += h.dir * sp * dt;
    if (h.x > TBAL.span) { h.x = 2 * TBAL.span - h.x; h.dir = -1; }
    if (h.x < -TBAL.span) { h.x = -2 * TBAL.span - h.x; h.dir = 1; }
    // 落ちているせんべい
    this.stepWind(dt);
    this.stepNibbler(dt);
    if (this.phase !== 'running') return;
    const f = this.falling;
    if (f) {
      f.x += this.windSpeed * dt;
      f.vy += TBAL.g * dt; f.y -= f.vy * dt;
      if (f.y <= 0) { this.falling = null; this.land(f.x, f.big); }
    }
    // 鹿
    if (!this.customer && this.nextOrder < this.level.orders.length) {
      const o = this.level.orders[this.nextOrder++];
      this.orderCount++;
      this.customer = {
        id: this.nextId++, kind: o.kind as DeerKind, want: o.want, got: 0, spot: 2, phase: 'walk', t: 0,
        waited: 0, patience: this.level.patience, allGokujo: false, from: 1,
      };
    }
    if (this.customer) this.stepDeer(this.customer, dt);
    if (this.phase === 'running' && this.t >= this.level.time) this.fail('time');
  }

  private land(x: number, big: boolean) {
    const n = this.stack.length;
    const top = n ? this.stack[n - 1] : { x: 0, r: TBAL.plateR };
    // ゆれている分を引いて、「まっすぐのとき」の位置になおす
    const lean = n ? this.swayTop() / n : 0;
    let lx = x - lean * (n + 1);
    const r = big ? TBAL.r * TBAL.bigScale : TBAL.r;
    const dx = lx - top.x;
    if (Math.abs(dx) > top.r) {
      // ふちより外: 乗らずに落ちる
      this.misses++; this.perfectRun = 0;
      this.events.push({ kind: 'miss', x, n });
      return;
    }
    const perfect = Math.abs(dx) < TBAL.perfect;
    if (perfect) { lx = top.x; this.perfects++; this.perfectRun++; } else this.perfectRun = 0;
    this.stack.push({ x: lx, r, perfect });
    this.events.push({ kind: perfect ? 'perfect' : 'land', n: this.stack.length, x: lx });
    if (this.checkCollapse()) return;
    if (this.perfectRun >= TBAL.bigAfter) {
      this.perfectRun = 0;
      this.hold.big = true;
      this.events.push({ kind: 'big' });
    }
  }

  /** 風: 予告(矢印)のあとに ふく */
  private stepWind(dt: number) {
    const w = this.level.wind;
    if (!w || this.t < w.from) return;
    if (this.windLeft > 0) {
      this.windLeft -= dt;
      if (this.windLeft <= 0) {
        if (this.windComing) { this.wind = this.windComing; this.windComing = 0; this.windLeft = w.dur; this.events.push({ kind: 'wind', n: this.wind }); }
        else { this.wind = 0; this.windLeft = 0; this.events.push({ kind: 'windEnd' }); }
      }
      return;
    }
    this.nextWind -= dt;
    if (this.nextWind > 0) return;
    this.nextWind = w.every;
    this.windComing = (Math.floor(this.t / w.every) % 2 ? 1 : -1);
    this.windLeft = TBAL.windWarn;
    this.events.push({ kind: 'windWarn', n: this.windComing });
  }
  /** タワーの いちばん下を 食べに来る鹿: 歩いてくる → ねらう(予告) → 1段ずつ 食べる。タップで 逃げる */
  private stepNibbler(dt: number) {
    const list = this.level.nibblers ?? [];
    if (!this.nibbler && this.nibIndex < list.length && this.t >= list[this.nibIndex].t) {
      const a = list[this.nibIndex++];
      this.nibbler = { id: this.nextId++, side: a.side, phase: 'walk', t: 0, bites: 0 };
      this.events.push({ kind: 'nibbler', deer: this.nibbler.id });
    }
    const b = this.nibbler;
    if (!b) return;
    b.t += dt;
    if (b.phase === 'walk' && b.t >= TBAL.nibWalk) { b.phase = 'aim'; b.t = 0; this.events.push({ kind: 'nibAim', deer: b.id }); }
    else if (b.phase === 'aim' && b.t >= TBAL.nibAim) { b.phase = 'eat'; b.t = TBAL.nibBite; }
    else if (b.phase === 'eat' && b.t >= TBAL.nibBite) {
      b.t = 0;
      if (b.bites >= TBAL.nibBites || !this.stack.length) { b.phase = 'flee'; this.events.push({ kind: 'nibLeave', deer: b.id }); return; }
      // いちばん下の段を 食べる(上の段は 1段 下がる)
      const [l] = this.stack.splice(0, 1);
      b.bites++; this.eaten++;
      this.events.push({ kind: 'nibble', deer: b.id, fallen: [l], n: this.stack.length });
      // 1段目を 食べられたら ♥−1(焼く面の くいしんぼう鹿と 同じ)
      if (b.bites === 1) this.loseHeart('nibbled');
      if (this.phase === 'running') this.checkCollapse();
    } else if (b.phase === 'flee' && b.t >= TBAL.nibFlee) { this.nibbler = null; this.events.push({ kind: 'nibLeave', deer: b.id }); }
  }
  /** 崩れるか: 下の段から見て、上の重心がふちの外へ出たら、そこから上が落ちる(♥−1) */
  private checkCollapse(): boolean {
    for (let i = -1; i < this.stack.length - 1; i++) {
      const base = i < 0 ? { x: 0, r: TBAL.plateR } : this.stack[i];
      if (Math.abs(this.com(this.stack, i + 1) - base.x) > base.r) {
        const fallen = this.stack.splice(i + 1);
        this.collapses++; this.perfectRun = 0;
        this.busy = TBAL.collapseT;
        this.events.push({ kind: 'collapse', n: i + 1, fallen });
        this.loseHeart('collapse');
        return true;
      }
    }
    return false;
  }

  private stepDeer(d: Deer, dt: number) {
    d.t += dt;
    switch (d.phase) {
      case 'walk':
        if (d.t >= TBAL.walk) { d.phase = 'wait'; d.t = 0; this.events.push({ kind: 'arrive', deer: d.id }); }
        break;
      case 'wait':
        d.waited += dt;
        if (d.waited >= d.patience) {
          d.phase = 'angry'; d.t = 0;
          this.events.push({ kind: 'angry', deer: d.id });
          this.loseHeart('angry');
        }
        break;
      case 'happy':
      case 'angry':
        if (d.t >= (d.phase === 'happy' ? TBAL.happy : TBAL.angry)) this.customer = null;
        break;
    }
  }
}
