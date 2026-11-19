// WORLD 2 せんべい屋台のルール(画面とは切りはなす。テストで動きを確かめる)。設計書 30章。
// 鉄板: 空き → 生地を置く → 片面を焼く → 裏返す → もう片面 → 台へ。焼きすぎると焦げる(ハート −1)。
// 鹿: 来て、注文の数だけ受け取ると満足して帰る。待たせすぎると怒って帰る(ハート −1)。
import type { BakeLevel, DeerKind, Taste } from './levels.ts';

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
  // くいしんぼう鹿: 歩いてくる → 台をねらう(予告) → 1枚ずつ食べる。タップで逃げていく
  sneakWalk: 2.6,
  sneakAim: 1.6,
  sneakBite: 1.1,
  sneakBites: 3,
  /** 台が空のとき、待ってから帰るまで */
  sneakWaitEmpty: 4.5,
  sneakFlee: 0.9,
  sneakLeave: 1.4,
} as const;

/** お店を手伝う なかま(2-5 から): Lumi = 金色の時間が のびる/Ruru = 焦げそうな鉄板に 水(焼け具合が もどる。間をあけて)/
 *  Kuru = 左から来る くいしんぼう鹿を 通せんぼ/Momo = 鹿が 長く 待ってくれる */
export const HELP = {
  lumiWiden: 0.2,
  ruruBack: 1.0,
  ruruCool: 9,
  kuruSide: -1 as -1 | 1,
  momoPatience: 1.3,
};

/** 片面の焼け方: soft = 金色の前(やわらか)・perfect = 金色(こんがり)・good = 金色のあと */
export type Quality = 'good' | 'perfect' | 'soft';
export type PlateState = 'empty' | 'pour' | 'side1' | 'flip' | 'side2' | 'burnt' | 'discard';
export type Plate = { state: PlateState; t: number; side1: Quality | null; smoking: boolean; /** 鉄板の上のせんべいの番号(絵と結びつける) */ sid: number };
export type Senbei = { id: number; gokujo: boolean; /** 両面 やわらか */ soft?: boolean };
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
  /** 焼き加減の注文(無ければ、どれでもよい) */
  taste?: Taste;
};
export type SneakPhase = 'walk' | 'aim' | 'eat' | 'flee' | 'leave';
/** くいしんぼう鹿(1頭ずつ来る) */
export type Sneaker = { id: number; side: -1 | 1; phase: SneakPhase; t: number; bites: number };
export type FailReason = 'burnt' | 'angry' | 'stolen' | 'time';
export type BakeEvent = {
  kind: 'pour' | 'early' | 'flip' | 'collect' | 'full' | 'smoke' | 'burnt' | 'discard' | 'arrive' | 'serve' | 'empty' | 'happy' | 'angry' | 'heart' | 'premium' | 'clear' | 'fail'
    | 'sneak' | 'aim' | 'steal' | 'shoo' | 'sneakLeave' | 'wrong' | 'water' | 'block';
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
  sneak: Sneaker | null = null;
  /** くいしんぼう鹿に取られた枚数・追いはらった数 */
  stolen = 0;
  shooed = 0;
  /** 台に着いてから(ねらう・食べる間に)追いはらった数 */
  lateShoo = 0;
  private nextArrival = 0;
  private nextSneak = 0;
  private nextId = 1;
  private deerCount = 0;
  events: BakeEvent[] = [];

  readonly level: BakeLevel;
  /** プレミアムコインを出すか(もう取った面では出さない) */
  private premiumOn: boolean;
  constructor(level: BakeLevel, opts: { premium?: boolean } = {}) {
    this.level = level;
    this.premiumOn = opts.premium ?? true;
    this.plates = Array.from({ length: level.plates }, () => ({ state: 'empty' as PlateState, t: 0, side1: null, smoking: false, sid: 0 }));
  }

  start() { if (this.phase === 'ready') this.phase = 'running'; }
  drainEvents(): BakeEvent[] { const e = this.events; this.events = []; return e; }
  get timeLeft() { return Math.max(0, this.level.time - this.t); }
  get deer(): Deer[] { return this.spots.filter((d): d is Deer => !!d); }
  /** その なかまが 手伝っているか */
  helps(id: string): boolean { return !!this.level.helpers?.includes(id as never); }
  /** 金色(こんがり)の時間。Lumi が手伝うと 前後に のびる */
  get perfectWin(): [number, number] { const [a, b] = this.level.cook.perfect, w = this.helps('lumi') ? HELP.lumiWiden : 0; return [a - w, b + w]; }
  /** 片面の焼け具合の質 */
  quality(t: number): Quality { const [a, b] = this.perfectWin; return t >= a && t <= b ? 'perfect' : t < a ? 'soft' : 'good'; }
  /** Ruru が 次に 水をかけられるまで(秒) */
  ruruCool = 0;
  /** 焼き加減の注文に合う、台の せんべいの番号(無ければ −1) */
  pickFor(d: Deer): number {
    if (d.taste === 'soft') return this.tray.findIndex(s => s.soft);
    if (d.taste === 'crisp') return this.tray.findIndex(s => s.gokujo);
    return this.tray.length ? 0 : -1;
  }

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
        this.tray.push({ id: p.sid, gokujo, soft: p.side1 === 'soft' && q === 'soft' });
        if (gokujo) { this.gokujoCount++; this.streak++; } else this.streak = 0;
        this.events.push({ kind: 'collect', plate: i, q, gokujo, sid: p.sid });
        const pr = this.level.premium;
        if (gokujo && pr.kind === 'streak' && this.streak >= pr.n) this.givePremium();
        p.state = 'empty'; p.t = 0; p.side1 = null; p.smoking = false;
        break;
      }
      case 'burnt':
        p.state = 'discard'; p.t = 0;
        this.events.push({ kind: 'discard', plate: i, sid: p.sid });
        break;
    }
  }

  private givePremium() {
    if (this.premium || !this.premiumOn) return;
    this.premium = true;
    this.events.push({ kind: 'premium' });
  }

  /** くいしんぼう鹿をタップ: おどろいて逃げていく(食べている途中でも) */
  tapSneak(): void {
    const s = this.sneak;
    if (!s || this.phase !== 'running' || (s.phase !== 'walk' && s.phase !== 'aim' && s.phase !== 'eat')) return;
    if (s.phase !== 'walk') this.lateShoo++;
    s.phase = 'flee'; s.t = 0;
    this.shooed++;
    this.events.push({ kind: 'shoo', deer: s.id });
  }

  /** 鹿をタップ: 台のせんべいを1枚わたす */
  tapDeer(spot: number): void {
    const d = this.spots[spot];
    if (!d || this.phase !== 'running' || d.phase !== 'wait') return;
    if (!this.tray.length) { this.events.push({ kind: 'empty', deer: d.id }); return; }
    // 焼き加減の注文: 合う せんべいが 台に無ければ、受けとらない
    const k = this.pickFor(d);
    if (k < 0) { this.events.push({ kind: 'wrong', deer: d.id }); return; }
    const [s] = this.tray.splice(k, 1);
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
    this.ruruCool = Math.max(0, this.ruruCool - dt);
    this.plates.forEach((p, i) => {
      // 焼いている間だけ、火の強さで 速さが かわる
      p.t += dt * (p.state === 'side1' || p.state === 'side2' ? this.level.heat?.[i] ?? 1 : 1);
      if (p.state === 'pour' && p.t >= BAL.pour) { p.state = 'side1'; p.t = 0; }
      else if (p.state === 'flip' && p.t >= BAL.flip) { p.state = 'side2'; p.t = 0; }
      else if (p.state === 'discard' && p.t >= BAL.discard) { p.state = 'empty'; p.t = 0; }
      else if (p.state === 'side1' || p.state === 'side2') {
        // Ruru: 焦げそうな鉄板に 水をかけて、焼け具合を もどす(間をあけて)
        if (p.t >= c.smoke && this.helps('ruru') && this.ruruCool <= 0) {
          p.t = c.smoke - HELP.ruruBack; p.smoking = false; this.ruruCool = HELP.ruruCool;
          this.events.push({ kind: 'water', plate: i });
        }
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
    this.stepSneak(dt);
    for (const d of this.deer) {
      this.stepDeer(d, dt);
      if (this.phase !== 'running') return;
    }
    if (this.t >= this.level.time) this.fail('time');
  }

  /** くいしんぼう鹿: 時刻が来たら1頭ずつ(前の鹿がいる間は、待ってから)来る */
  private stepSneak(dt: number) {
    const list = this.level.sneaks ?? [];
    if (!this.sneak && this.nextSneak < list.length && this.t >= list[this.nextSneak].t) {
      const a = list[this.nextSneak++];
      this.sneak = { id: this.nextId++, side: a.side, phase: 'walk', t: 0, bites: 0 };
      this.events.push({ kind: 'sneak', deer: this.sneak.id });
    }
    const s = this.sneak;
    if (!s) return;
    s.t += dt;
    switch (s.phase) {
      case 'walk':
        if (s.t >= BAL.sneakWalk) {
          // Kuru: 自分の側から来た くいしんぼう鹿を 通せんぼ(おいはらったのと 同じ)
          if (this.helps('kuru') && s.side === HELP.kuruSide) { s.phase = 'flee'; s.t = 0; this.shooed++; this.events.push({ kind: 'block', deer: s.id }); break; }
          s.phase = 'aim'; s.t = 0; this.events.push({ kind: 'aim', deer: s.id });
        }
        break;
      case 'aim':
        if (s.t >= BAL.sneakAim) { s.phase = 'eat'; s.t = 0; this.bite(s); }
        break;
      case 'eat':
        if (s.bites >= BAL.sneakBites) { if (s.t >= BAL.sneakBite) { s.phase = 'leave'; s.t = 0; } }
        else if (this.tray.length && s.t >= BAL.sneakBite) { s.t = 0; this.bite(s); }
        else if (!this.tray.length && s.t >= BAL.sneakWaitEmpty) { s.phase = 'leave'; s.t = 0; }
        break;
      case 'flee':
      case 'leave':
        if (s.t >= (s.phase === 'flee' ? BAL.sneakFlee : BAL.sneakLeave)) {
          this.sneak = null;
          this.events.push({ kind: 'sneakLeave', deer: s.id });
        }
        break;
    }
  }
  /** 台の、鹿のいる側の端から1枚食べる。1頭目の1枚目でハート −1(食べられたら負け、が分かるように) */
  private bite(s: Sneaker) {
    if (!this.tray.length) return;
    const k = s.side < 0 ? 0 : this.tray.length - 1;
    const [e] = this.tray.splice(k, 1);
    s.bites++;
    this.stolen++;
    this.events.push({ kind: 'steal', deer: s.id, gokujo: e.gokujo, sid: e.id, plate: k });
    if (s.bites === 1) this.loseHeart('stolen');
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
        id: this.nextId++, kind: a.kind, want: a.want, got: 0, spot, phase: 'walk', t: 0, taste: a.taste,
        waited: 0, patience: this.level.patience[a.kind] * (this.helps('momo') ? HELP.momoPatience : 1), allGokujo: true,
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
            if (this.served >= this.level.goal) {
              // 2-2 のプレミアム: くいしんぼう鹿を、台に着く前(歩いている間)に全部追いはらってクリア
              if (this.level.premium.kind === 'earlyShoo' && this.stolen === 0 && this.lateShoo === 0 && this.shooed > 0) this.givePremium();
              this.phase = 'cleared'; this.events.push({ kind: 'clear' });
            }
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
