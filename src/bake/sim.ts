// WORLD 2 せんべい屋台のルール(画面とは切りはなす。テストで動きを確かめる)。設計書 30章。
// 鉄板: 空き → 生地を置く → 片面を焼く → 裏返す → もう片面 → 台へ。焼きすぎると焦げる(ハート −1)。
// 鹿: 来て、注文の数だけ受け取ると満足して帰る。待たせすぎると怒って帰る(ハート −1)。
import type { BakeLevel, DeerKind } from './levels.ts';

export const BAL = {
  /** 生地を流す時間 */
  pour: 0.3,
  /** 裏返す時間(この間は焼けない) */
  flip: 0.4,
  /** 焦げを片づける時間 */
  discard: 0.35,
  /** 鹿が歩いてくる時間 */
  walk: 2.4,
  /** 1枚食べる時間 */
  eat: 0.7,
  /** 満足して帰る・怒って帰る時間 */
  happy: 1.6,
  angry: 1.4,
  /** 台に置けるせんべいの数 */
  trayMax: 6,
  /** 1枚もらうと、待った時間がこれだけ戻る(注文の多い鹿が、途中で怒らないように) */
  serveRelief: 8,
  /** せんべい1枚のシルバーコイン(極上は多い) */
  coin: 5,
  coinGokujo: 10,
  lives: 3,
} as const;

export type Quality = 'good' | 'perfect';
export type PlateState = 'empty' | 'pour' | 'side1' | 'flip' | 'side2' | 'burnt' | 'discard';
export type Plate = { state: PlateState; t: number; side1: Quality | null; smoking: boolean; /** 鉄板の上のせんべいの番号(絵と結びつける) */ sid: number };
export type Senbei = { id: number; gokujo: boolean };
export type DeerPhase = 'walk' | 'wait' | 'eat' | 'happy' | 'angry';
export type Deer = {
  id: number; kind: DeerKind; want: number; got: number; spot: number; phase: DeerPhase;
  /** いまの動きの経過(秒) */
  t: number;
  /** 待った時間(秒)。patience をこえると怒る */
  waited: number; patience: number;
  /** もらったせんべいが全部極上か */
  allGokujo: boolean;
  /** 来た向き(−1=左から、1=右から) */
  from: -1 | 1;
};
export type FailReason = 'burnt' | 'angry' | 'time';
export type BakeEvent = {
  kind: 'pour' | 'early' | 'flip' | 'collect' | 'full' | 'smoke' | 'burnt' | 'discard' | 'arrive' | 'serve' | 'empty' | 'happy' | 'angry' | 'heart' | 'premium' | 'clear' | 'fail';
  plate?: number; deer?: number; q?: Quality; gokujo?: boolean; gold?: boolean; sid?: number;
};

/** 鹿の来る場所の選び方(来るたびに、えらぶ順を変える) */
const SPOT_ORDER = [[1, 0, 2], [0, 2, 1], [2, 1, 0], [1, 2, 0]];

export class BakeRun {
  phase: 'ready' | 'running' | 'cleared' | 'failed' = 'ready';
  reason: FailReason | null = null;
  t = 0;
  lives: number = BAL.lives;
  served = 0;
  coins = 0;
  gold = 0;
  premium = false;
  /** 極上を続けて作った数(普通のせんべい・焦げで 0 に戻る) */
  streak = 0;
  gokujoCount = 0;
  perfectFlips = 0;
  burntCount = 0;
  angryCount = 0;
  plates: Plate[];
  tray: Senbei[] = [];
  spots: (Deer | null)[] = [null, null, null];
  private nextArrival = 0;
  private nextId = 1;
  private deerCount = 0;
  events: BakeEvent[] = [];

  readonly level: BakeLevel;
  constructor(level: BakeLevel) {
    this.level = level;
    this.plates = Array.from({ length: level.plates }, () => ({ state: 'empty' as PlateState, t: 0, side1: null, smoking: false, sid: 0 }));
  }

  start() { if (this.phase === 'ready') this.phase = 'running'; }
  drainEvents(): BakeEvent[] { const e = this.events; this.events = []; return e; }
  get timeLeft() { return Math.max(0, this.level.time - this.t); }
  get deer(): Deer[] { return this.spots.filter((d): d is Deer => !!d); }
  /** 片面の焼け具合の質 */
  quality(t: number): Quality { const [a, b] = this.level.cook.perfect; return t >= a && t <= b ? 'perfect' : 'good'; }

  private loseHeart(reason: FailReason) {
    this.lives--;
    this.events.push({ kind: 'heart' });
    if (this.lives <= 0) this.fail(reason);
  }
  private fail(reason: FailReason) {
    if (this.phase !== 'running') return;
    this.phase = 'failed'; this.reason = reason;
    this.events.push({ kind: 'fail' });
  }

  // ---- 操作 ----
  /** 鉄板をタップ: 空きなら生地を置く・焼けていたら裏返す/台へ・焦げなら片づける */
  tapPlate(i: number): void {
    const p = this.plates[i];
    if (!p || this.phase !== 'running') return;
    const c = this.level.cook;
    switch (p.state) {
      case 'empty':
        p.state = 'pour'; p.t = 0; p.side1 = null; p.smoking = false; p.sid = this.nextId++;
        this.events.push({ kind: 'pour', plate: i, sid: p.sid });
        break;
      case 'side1': {
        if (p.t < c.ok) { this.events.push({ kind: 'early', plate: i }); break; }
        const q = this.quality(p.t);
        if (q === 'perfect') this.perfectFlips++;
        p.side1 = q; p.state = 'flip'; p.t = 0; p.smoking = false;
        this.events.push({ kind: 'flip', plate: i, q, sid: p.sid });
        break;
      }
      case 'side2': {
        if (p.t < c.ok) { this.events.push({ kind: 'early', plate: i }); break; }
        if (this.tray.length >= BAL.trayMax) { this.events.push({ kind: 'full', plate: i }); break; }
        const q = this.quality(p.t);
        if (q === 'perfect') this.perfectFlips++;
        const gokujo = p.side1 === 'perfect' && q === 'perfect';
        this.tray.push({ id: p.sid, gokujo });
        if (gokujo) { this.gokujoCount++; this.streak++; } else this.streak = 0;
        this.events.push({ kind: 'collect', plate: i, q, gokujo, sid: p.sid });
        if (gokujo && this.streak >= this.level.premiumStreak && !this.premium) {
          this.premium = true;
          this.events.push({ kind: 'premium' });
        }
        p.state = 'empty'; p.t = 0; p.side1 = null; p.smoking = false;
        break;
      }
      case 'burnt':
        p.state = 'discard'; p.t = 0;
        this.events.push({ kind: 'discard', plate: i, sid: p.sid });
        break;
    }
  }

  /** 鹿をタップ: 台のせんべいを1枚わたす */
  tapDeer(spot: number): void {
    const d = this.spots[spot];
    if (!d || this.phase !== 'running' || d.phase !== 'wait') return;
    const s = this.tray.shift();
    if (!s) { this.events.push({ kind: 'empty', deer: d.id }); return; }
    d.got++;
    d.allGokujo &&= s.gokujo;
    d.waited = Math.max(0, d.waited - BAL.serveRelief);
    d.phase = 'eat'; d.t = 0;
    this.coins += s.gokujo ? BAL.coinGokujo : BAL.coin;
    this.events.push({ kind: 'serve', deer: d.id, gokujo: s.gokujo, sid: s.id });
  }

  // ---- 時間を進める ----
  step(dt: number): void {
    if (this.phase !== 'running') {
      // 終わったあとも、帰っていく鹿の動きだけは進める(絵のため)
      for (const d of this.deer) if (d.phase === 'happy' || d.phase === 'angry') this.stepDeer(d, dt);
      return;
    }
    this.t += dt;
    const c = this.level.cook;
    this.plates.forEach((p, i) => {
      p.t += dt;
      if (p.state === 'pour' && p.t >= BAL.pour) { p.state = 'side1'; p.t = 0; }
      else if (p.state === 'flip' && p.t >= BAL.flip) { p.state = 'side2'; p.t = 0; }
      else if (p.state === 'discard' && p.t >= BAL.discard) { p.state = 'empty'; p.t = 0; }
      else if (p.state === 'side1' || p.state === 'side2') {
        if (p.t >= c.smoke && !p.smoking) { p.smoking = true; this.events.push({ kind: 'smoke', plate: i }); }
        if (p.t >= c.burn) {
          p.state = 'burnt'; p.t = 0; p.smoking = false;
          this.burntCount++; this.streak = 0;
          this.events.push({ kind: 'burnt', plate: i, sid: p.sid });
          this.loseHeart('burnt');
        }
      }
    });
    if (this.phase !== 'running') return;
    this.arrive();
    for (const d of this.deer) {
      this.stepDeer(d, dt);
      if (this.phase !== 'running') return;
    }
    if (this.t >= this.level.time) this.fail('time');
  }

  private arrive() {
    const list = this.level.arrivals;
    while (this.nextArrival < list.length && this.t >= list[this.nextArrival].t) {
      const order = SPOT_ORDER[this.deerCount % SPOT_ORDER.length];
      const spot = order.find(s => !this.spots[s]);
      if (spot === undefined) return; // 空くまで待つ(時刻をすぎていたら、空いたらすぐ来る)
      const a = list[this.nextArrival++];
      this.deerCount++;
      this.spots[spot] = {
        id: this.nextId++, kind: a.kind, want: a.want, got: 0, spot, phase: 'walk', t: 0,
        waited: 0, patience: this.level.patience[a.kind], allGokujo: true,
        from: spot === 0 ? -1 : spot === 2 ? 1 : this.deerCount % 2 ? -1 : 1,
      };
    }
  }

  private stepDeer(d: Deer, dt: number) {
    d.t += dt;
    switch (d.phase) {
      case 'walk':
        if (d.t >= BAL.walk) { d.phase = 'wait'; d.t = 0; this.events.push({ kind: 'arrive', deer: d.id }); }
        break;
      case 'wait':
        d.waited += dt;
        if (d.waited >= d.patience) {
          // 極上の連続(streak)は切らない。焼き方の記録なので
          d.phase = 'angry'; d.t = 0; this.angryCount++;
          this.events.push({ kind: 'angry', deer: d.id });
          this.loseHeart('angry');
        }
        break;
      case 'eat':
        if (d.t >= BAL.eat) {
          if (d.got >= d.want) {
            d.phase = 'happy'; d.t = 0;
            this.served++;
            const gold = d.allGokujo && d.want >= 2;
            if (gold) this.gold++;
            this.events.push({ kind: 'happy', deer: d.id, gold });
            if (this.served >= this.level.goal) { this.phase = 'cleared'; this.events.push({ kind: 'clear' }); }
          } else { d.phase = 'wait'; d.t = 0; }
        }
        break;
      case 'happy':
      case 'angry':
        if (d.t >= (d.phase === 'happy' ? BAL.happy : BAL.angry)) this.spots[d.spot] = null;
        break;
    }
  }
}
