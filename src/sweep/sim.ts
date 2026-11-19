// WORLD 3「奈良公園、大掃除！」のルール。画面とは切りはなす(テストで動きを確かめる)。設計書 32章。
// Spra は参道を大仏さままで歩く(道のり s。Spra の位置が d)。前を歩く鹿が、うんこを落とす。
// ほうきは自動で振られ、Spra の前の範囲のうんこを掃く。うんこは大きいほど固い(何回も掃く)。足もとにうんこがある間は、立ち止まって掃く(ふまない)。
// 掃ききれずに通りすぎたうんこは「よごれ」になる(のこっていた分だけ)。よごれ 100% で失敗。大仏さまに着けばクリア。
// 掃除したうんこは肥料になって、道ばたにお花が咲く(よごれが少し減る)。点数がたまると、ほうきが育つ(ワイド → つよい → 竜巻)。
import type { DeerKind, PoopKind, SweepLevel } from './levels.ts';

export const WBAL = {
  /** 参道の幅の半分・Spra が動ける幅の半分(m)・左右に動く速さ(m/秒) */
  half: 2.4,
  reachX: 2.05,
  moveSpeed: 7,
  poop: {
    small: { hp: 1, score: 10, pollution: 1, r: 0.16 },
    medium: { hp: 3, score: 30, pollution: 3, r: 0.24 },
    large: { hp: 8, score: 80, pollution: 8, r: 0.33 },
  } as Record<PoopKind, { hp: number; score: number; pollution: number; r: number }>,
  /** ほうき: 育つ点数・掃ける幅・前への届き(m)・振る間(秒)・1回の力・1回で掃ける数 */
  brooms: [
    { level: 1, name: 'ふつうの ほうき', threshold: 0, width: 1.3, reach: 1.7, interval: 0.68, power: 1, targets: 3 },
    { level: 2, name: 'ワイドほうき', threshold: 300, width: 2.1, reach: 1.9, interval: 0.54, power: 1, targets: 7 },
    { level: 3, name: 'つよい ほうき', threshold: 1000, width: 2.7, reach: 2.2, interval: 0.42, power: 3, targets: 12 },
    { level: 4, name: '竜巻ほうき', threshold: 2400, width: 3.6, reach: 2.7, interval: 0.27, power: 4, targets: 40 },
  ],
  /** 足もと(まっすぐ前の近く)にうんこがある間の、歩く速さの割合。うんこを ふまないように、立ち止まって掃く(0 = 止まる) */
  slow: 0,
  footX: 0.6,
  footAhead: 1.1,
  /** 通りすぎたと みなす所(Spra より後ろ、m) */
  passAt: -0.3,
  /** 鹿: 前を歩く距離(この間をうろうろ)・来る所・帰るまで(秒)・左右のふらつき(m/秒)・うんこを落とせる距離 */
  deerAhead: [5, 14] as [number, number],
  deerEnter: 18,
  deerLife: [9, 15] as [number, number],
  deerSide: 0.35,
  deerExit: 1.6,
  dropAhead: [5, 15] as [number, number],
  /** つづけて掃除したと みなす間(秒) */
  comboWindow: 2.2,
  /** お花: 何こ掃除するごとに咲くか・よごれをどれだけ減らすか */
  flowerEvery: 6,
  flowerHeal: 1,
  /** 硬いうんこ(大仏さまの目が光っている間に落ちた): 固さ・点数の倍 */
  hardHp: 2,
  hardScore: 2,
  /** 大仏さまの目は、近づいてから この秒数のあとに、はじめて光る */
  buddhaFirst: 4,
};

export type Poop = { id: number; kind: PoopKind; s: number; x: number; hp: number; maxHp: number; hard: boolean; t: number };
export type SweepDeer = {
  id: number; kind: DeerKind; s: number; x: number; dir: 1 | -1;
  /** 前を歩く距離のねらい・落とすまで(秒)・帰るまで(秒) */
  aim: number; dropIn: number; life: number;
  /** 帰っている途中(横へ出ていく) */
  leaving: boolean;
  /** 落とした直後(絵のため) */
  dropPose: number;
};
export type Flower = { id: number; s: number; x: number; hue: number; t: number };
export type SweepEvent = {
  kind: 'drop' | 'sweep' | 'hit' | 'clean' | 'miss' | 'level' | 'flower' | 'warn' | 'glow' | 'clear' | 'fail' | 'combo';
  id?: number; x?: number; s?: number; n?: number; hard?: boolean; poop?: PoopKind;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SweepRun {
  phase: 'ready' | 'running' | 'cleared' | 'failed' = 'ready';
  t = 0;
  /** Spra の道のりの位置(m)と、左右の位置・ねらい */
  d = 0;
  x = 0;
  targetX = 0;
  /** いまの歩く速さ(掃いている間はゆっくり) */
  pace = 0;
  score = 0;
  gold = 0;
  premium = false;
  /** 通りすぎて のこった よごれ(うんこの量) */
  dirt = 0;
  cleaned = 0;
  hardCleaned = 0;
  missed = 0;
  combo = 0;
  maxCombo = 0;
  comboLeft = 0;
  broom = 0;
  /** 次に ほうきを振るまで(秒) */
  cooldown = 0.25;
  /** 大仏さまの目: 寝ている・光りそう・光っている */
  buddha: 'sleep' | 'warn' | 'glow' = 'sleep';
  buddhaLeft = 0;
  poops: Poop[] = [];
  deer: SweepDeer[] = [];
  flowers: Flower[] = [];
  events: SweepEvent[] = [];
  readonly level: SweepLevel;
  private rng: () => number;
  private premiumOn: boolean;
  private nextId = 1;
  private deerMade = 0;
  private buddhaAt: number | null = null;

  constructor(level: SweepLevel, opts: { premium?: boolean; seed?: number } = {}) {
    this.level = level;
    this.premiumOn = opts.premium ?? true;
    this.rng = opts.seed === undefined ? Math.random : mulberry(opts.seed);
  }
  start() { if (this.phase === 'ready') this.phase = 'running'; }
  drainEvents(): SweepEvent[] { const e = this.events; this.events = []; return e; }
  get stats() { return WBAL.brooms[this.broom]; }
  /** よごれ(%) */
  get pollution() { return clamp((this.dirt / this.level.limit) * 100, 0, 100); }
  /** 道のりの進み(0〜1) */
  get progress() { return clamp(this.d / this.level.length, 0, 1); }
  /** 次のほうきまでの点数(いちばん上なら null) */
  get nextBroomAt(): number | null { return WBAL.brooms[this.broom + 1]?.threshold ?? null; }
  ahead(s: number) { return s - this.d; }
  /** うんこが、いまのほうきの範囲にあるか */
  inReach(p: Poop): boolean {
    const a = this.ahead(p.s), st = this.stats, r = WBAL.poop[p.kind].r;
    return a >= -0.1 && a <= st.reach && Math.abs(p.x - this.x) <= st.width / 2 + r;
  }

  /** 左右の位置のねらい(指・キー)。参道の外へは出ない */
  steer(x: number) { this.targetX = clamp(x, -WBAL.reachX, WBAL.reachX); }

  step(dt: number): void {
    if (this.phase !== 'running') return;
    this.t += dt;
    // 左右
    const dx = this.targetX - this.x;
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), WBAL.moveSpeed * dt);
    // 歩く(掃いている間は、ゆっくり)
    const busy = this.poops.some(p => { const a = this.ahead(p.s); return a >= -0.1 && a <= WBAL.footAhead && Math.abs(p.x - this.x) <= WBAL.footX + WBAL.poop[p.kind].r; });
    this.pace = this.level.speed * (busy ? WBAL.slow : 1);
    this.d += this.pace * dt;
    this.stepBuddha();
    this.stepDeer(dt);
    for (const p of this.poops) p.t += dt;
    for (const f of this.flowers) f.t += dt;
    // 通りすぎたうんこ: のこっていた分が、よごれになる
    for (const p of [...this.poops]) {
      if (this.ahead(p.s) >= WBAL.passAt) continue;
      this.poops.splice(this.poops.indexOf(p), 1);
      const amount = WBAL.poop[p.kind].pollution * (p.hp / p.maxHp);
      this.dirt += amount; this.missed++;
      this.combo = 0; this.comboLeft = 0;
      this.events.push({ kind: 'miss', id: p.id, x: p.x, s: p.s, n: amount, poop: p.kind });
    }
    if (this.pollution >= 100) { this.end('failed'); return; }
    // ほうき
    this.comboLeft = Math.max(0, this.comboLeft - dt);
    if (!this.comboLeft) this.combo = 0;
    this.cooldown -= dt;
    if (this.cooldown <= 0) { this.cooldown += this.stats.interval; this.sweep(); }
    if (this.d >= this.level.length) this.end('cleared');
  }

  private end(phase: 'cleared' | 'failed') {
    if (this.phase !== 'running') return;
    this.phase = phase;
    if (phase === 'cleared' && this.premiumOn && this.pollution <= this.level.premiumUnder) this.premium = true;
    this.events.push({ kind: phase === 'cleared' ? 'clear' : 'fail' });
  }

  /** ほうきを振る: 前の範囲のうんこを、近い順に掃く */
  private sweep() {
    const st = this.stats;
    this.events.push({ kind: 'sweep', x: this.x, n: st.level });
    const hits = this.poops.filter(p => this.inReach(p)).sort((a, b) => this.ahead(a.s) - this.ahead(b.s)).slice(0, st.targets);
    let flowers = 0;
    for (const p of hits) {
      p.hp = Math.max(0, p.hp - st.power);
      if (p.hp > 0) { this.events.push({ kind: 'hit', id: p.id, x: p.x, s: p.s, n: p.hp }); continue; }
      const score = WBAL.poop[p.kind].score * (p.hard ? WBAL.hardScore : 1);
      this.score += score; this.cleaned++;
      if (p.hard) { this.hardCleaned++; if (this.hardCleaned % 3 === 0) this.gold++; }
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboLeft = WBAL.comboWindow;
      this.events.push({ kind: 'clean', id: p.id, x: p.x, s: p.s, n: score, hard: p.hard, poop: p.kind });
      if (this.combo >= 5 && this.combo % 5 === 0) this.events.push({ kind: 'combo', n: this.combo });
      if (this.cleaned % WBAL.flowerEvery === 0) flowers++;
    }
    this.poops = this.poops.filter(p => p.hp > 0);
    for (let i = 0; i < flowers; i++) this.bloom();
    // ほうきが育つ
    const old = this.broom;
    while (this.broom < WBAL.brooms.length - 1 && this.score >= WBAL.brooms[this.broom + 1].threshold) this.broom++;
    if (this.broom !== old) { this.cooldown = Math.min(this.cooldown, 0.2); this.events.push({ kind: 'level', n: this.stats.level }); }
  }
  /** 道ばたに、お花が咲く(よごれが少し減る)。Spra の少し先に咲くので、近づきながら見える */
  private bloom() {
    const side = this.flowers.length % 2 ? 1 : -1;
    const f: Flower = { id: this.nextId++, s: this.d + 4 + this.rng() * 3, x: side * (WBAL.half + 0.3 + this.rng() * 0.6), hue: this.rng(), t: 0 };
    this.flowers.push(f);
    if (this.flowers.length > 80) this.flowers.shift();
    this.dirt = Math.max(0, this.dirt - WBAL.flowerHeal);
    this.events.push({ kind: 'flower', id: f.id, x: f.x, s: f.s, n: this.flowers.length });
  }

  private stepBuddha() {
    const b = this.level.buddha;
    if (!b || this.progress < b.from) return;
    if (this.buddhaAt === null) this.buddhaAt = this.t;
    const tb = this.t - this.buddhaAt - WBAL.buddhaFirst;
    const before = this.buddha;
    this.buddha = 'sleep'; this.buddhaLeft = 0;
    if (tb < 0) return;
    const c = tb % b.cycle;
    if (c < b.warn) { this.buddha = 'warn'; this.buddhaLeft = b.warn - c; }
    else if (c < b.warn + b.glow) { this.buddha = 'glow'; this.buddhaLeft = b.warn + b.glow - c; }
    if (this.buddha !== before && this.buddha !== 'sleep') this.events.push({ kind: this.buddha });
  }

  private wantDeer(): number {
    const lv = this.level.deer, b = this.level.buddha;
    const n = Math.min(lv.max, lv.start + Math.floor(this.t / lv.addEvery));
    return b && this.buddhaAt !== null ? n + b.extraDeer : n;
  }
  private stepDeer(dt: number) {
    const lv = this.level, live = this.deer.filter(d => !d.leaving).length;
    if (live < this.wantDeer()) this.spawnDeer();
    for (const d of [...this.deer]) {
      d.dropPose = Math.max(0, d.dropPose - dt);
      if (d.leaving) {
        // 横へ出ていく
        d.x += d.dir * WBAL.deerExit * dt;
        d.s += this.pace * dt;
        if (Math.abs(d.x) > WBAL.half + 3) this.deer.splice(this.deer.indexOf(d), 1);
        continue;
      }
      // 前を歩く距離を、ねらいに近づける(Spra が ゆっくりなら、鹿も ゆっくり)
      const a = this.ahead(d.s);
      d.s += (this.pace + (d.aim - a) * 0.5) * dt;
      d.x += d.dir * WBAL.deerSide * dt;
      if (Math.abs(d.x) > WBAL.reachX) { d.x = clamp(d.x, -WBAL.reachX, WBAL.reachX); d.dir = (d.dir * -1) as 1 | -1; }
      if (this.rng() < dt * 0.15) d.aim = WBAL.deerAhead[0] + this.rng() * (WBAL.deerAhead[1] - WBAL.deerAhead[0]);
      d.life -= dt;
      if (d.life <= 0) { d.leaving = true; d.dir = d.x >= 0 ? 1 : -1; continue; }
      d.dropIn -= dt;
      const na = this.ahead(d.s);
      if (d.dropIn > 0 || na < WBAL.dropAhead[0] || na > WBAL.dropAhead[1]) continue;
      this.drop(d);
      const k = this.progress, [a0, a1] = lv.dropEvery;
      d.dropIn = (a0 + (a1 - a0) * k) * (0.8 + this.rng() * 0.4);
    }
  }
  private spawnDeer() {
    const kinds = this.level.deer.kinds, n = this.deerMade++;
    // はじめの鹿は、もう前を歩いている。あとの鹿は、奥の横から入ってくる
    const first = n < this.level.deer.start;
    const x = first ? (n % 2 ? 1 : -1) * (0.6 + this.rng() * 1.0) : (this.rng() * 2 - 1) * WBAL.reachX;
    this.deer.push({
      id: this.nextId++, kind: kinds[n % kinds.length], s: this.d + (first ? 7 + n * 3 : WBAL.deerEnter), x, dir: this.rng() < 0.5 ? 1 : -1,
      aim: WBAL.deerAhead[0] + this.rng() * (WBAL.deerAhead[1] - WBAL.deerAhead[0]), dropIn: 0.6 + this.rng() * 1.2,
      life: WBAL.deerLife[0] + this.rng() * (WBAL.deerLife[1] - WBAL.deerLife[0]), leaving: false, dropPose: 0,
    });
  }
  private kindNow(): PoopKind {
    const k = this.progress;
    let row = this.level.mix[0];
    for (const m of this.level.mix) if (k >= m[0]) row = m;
    const [, a, b, c] = row, r = this.rng() * (a + b + c);
    return r < a ? 'small' : r < a + b ? 'medium' : 'large';
  }
  private drop(d: SweepDeer) {
    const kind = this.kindNow(), b = this.level.buddha;
    const hard = !!b && this.buddha === 'glow' && this.rng() < b.hard;
    const hp = WBAL.poop[kind].hp * (hard ? WBAL.hardHp : 1);
    // 鹿のおしりの後ろ(手前)に落ちる
    const p: Poop = { id: this.nextId++, kind, s: d.s - 0.35, x: clamp(d.x - d.dir * 0.12, -WBAL.half + 0.2, WBAL.half - 0.2), hp, maxHp: hp, hard, t: 0 };
    this.poops.push(p);
    d.dropPose = 0.3;
    this.events.push({ kind: 'drop', id: p.id, x: p.x, s: p.s, hard, poop: kind });
  }
}
