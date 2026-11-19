// WORLD 3「奈良公園、大掃除！」のルール。画面とは切りはなす(テストで動きを確かめる)。設計書 32章。
// Spra は参道を大仏さままで歩く(道のり s。Spra の位置が d)。前を歩く鹿が、うんこを落とす。
// ほうきは自動で振られ、Spra の前の範囲のうんこを掃く。うんこは大きいほど固い(何回も掃く)。足もとにうんこがある間は、立ち止まって掃く(ふまない)。
// 掃ききれずに通りすぎたうんこは「よごれ」になる(のこっていた分だけ)。よごれ 100% で失敗。大仏さまに着けばクリア。
// 掃除したうんこは肥料になって、道ばたにお花が咲く(よごれが少し減る)。点数がたまると、ほうきが育つ(ワイド → つよい → 竜巻)。
// 仲間の Spra(チーム): ゲート(+3・×2 など)を通る・おてつだいの たるを掃いて開けると ふえる。赤いゲート・走ってくる鹿で へる。
// 仲間も みんな前でほうきを振る(範囲が重なると、たくさん掃ける)。先頭の Spra は いなくならない。
// しかけ(面ごと): 雨・雷(お松明の火の粉も同じしくみ)・走ってくる鹿・鹿の群れ(横ぎって 一列に落とす)・せんべい売り場(鹿が集まる)・風(横へ流される)・大仏さまの目(ボス)。
import type { DeerKind, FriendId, PoopKind, SweepLevel } from './levels.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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
  /** チーム: いちばん多い人数・仲間の間(m)・仲間のほうきの幅・届き(先頭の何倍)・1回で掃ける数 */
  teamMax: 24,
  gap: 0.5,
  helperWidth: 0.8,
  helperReach: 0.85,
  helperTargets: 2,
  /** 走ってくる鹿: 出てくる所(先、m)・速さ(m/秒)・ぶつかる幅・1頭で はじき飛ばす いちばん多い人数・先頭にぶつかったとき へる人数 */
  chargeAppear: 16,
  chargeSpeed: 3.4,
  chargeHitX: 0.42,
  chargeHitZ: 0.35,
  chargeMaxHits: 5,
  chargeLeaderLoss: 2,
  /** 雨: べちゃべちゃの うんこの固さ(何倍)・ほうきの遅さ(振る間が何倍) */
  wetHp: 1.6,
  rainSlow: 1.3,
  /** 雷: 予告の秒数・輪の半径・はじき飛ばす いちばん多い人数・先頭がしびれる秒数 */
  boltWarn: 1.5,
  boltR: 1.1,
  boltMaxHits: 4,
  boltStun: 0.9,
  /** 鹿の群れ: 出てくる所(先、m)・横ぎる速さ(m/秒)・一列の間(m) */
  herdAppear: 16,
  herdSpeed: 2.6,
  herdGap: 0.9,
  /** せんべい売り場: 鹿が集まりはじめる所(先、m)・集まる速さ・落とす間(秒)・1頭が落とす数・この近さまで来ると にげる(m) */
  stallAppear: 15,
  stallRun: 3.2,
  stallDrop: 1.3,
  stallDrops: 3,
  stallFlee: 1.4,
  /** 売り場の鹿の うんこが 大きいになる割合(小は いつも中になる) */
  stallBig: 0.15,
  /** 風: うんこが流される速さ(Spra の何倍。小さいほど よく流れる) */
  windPoop: { small: 0.7, medium: 0.45, large: 0.2 } as Record<PoopKind, number>,
  /** なかまの能力: Ruru が べちゃべちゃ・硬い うんこを掃く力(何倍)・Piko のほうきの届き(何倍)・Piko がいると 風で流される割合・
   *  Momo が掃くと お花の数え(何こぶん)・Momo がいると お花が減らす よごれ(何倍)・Lumi がいると 雷・火の粉の予告が のびる(秒) */
  ruruPower: 2,
  pikoReach: 1.35,
  pikoWind: 0.35,
  momoCount: 1.5,
  momoHeal: 1.5,
  lumiWarn: 0.7,
};

/** 仲間の並ぶ所(先頭からの 横 dx・前 da)。先頭のまわりの、前と横から うまっていく */
export const SLOTS: { dx: number; da: number }[] = (() => {
  const out: { dx: number; da: number; score: number }[] = [];
  for (let row = -2; row <= 4; row++) {
    const da = row * WBAL.gap * 0.85, shift = row % 2 ? WBAL.gap / 2 : 0;
    for (let c = -6; c <= 6; c++) {
      const dx = c * WBAL.gap + shift;
      if (Math.abs(dx) < 1e-9 && row === 0) continue;
      // 前(da>0)と横を先に。うしろは あと
      out.push({ dx, da, score: Math.abs(dx) * 0.9 + Math.abs(da) * 1.2 + (da < 0 ? 0.6 : 0) });
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, WBAL.teamMax - 1).map(({ dx, da }) => ({ dx, da }));
})();

export type Barrel = { id: number; s: number; x: number; hp: number; maxHp: number; n: number; friend: FriendId };
export type Charger = { id: number; s: number; x: number; hits: number; hitLeader: boolean; cool: number };
/** チームの ひとり(i = なかまの番号。先頭は -1) */
export type Member = { x: number; a: number; leader: boolean; kind: FriendId; i: number };
/** ゲートの数字('+3'・'-4'・'x2')を、通ったあとの人数にする */
export function applyGate(team: number, g: string, max: number = WBAL.teamMax): number {
  const n = Number(g.slice(1));
  const v = g[0] === '+' ? team + n : g[0] === '-' ? team - n : g[0] === 'x' ? team * n : team;
  return clamp(Math.round(v), 1, max);
}

export type Poop = { id: number; kind: PoopKind; s: number; x: number; hp: number; maxHp: number; hard: boolean; t: number; wet?: boolean };
/** 雷(予告の間は t < 0。落ちた所) */
export type Bolt = { id: number; s: number; x: number; t: number };
export type SweepDeer = {
  id: number; kind: DeerKind; s: number; x: number; dir: 1 | -1;
  /** 前を歩く距離のねらい・落とすまで(秒)・帰るまで(秒) */
  aim: number; dropIn: number; life: number;
  /** 帰っている途中(横へ出ていく) */
  leaving: boolean;
  /** 大仏さまの目が光ったときに、どっと出てきた鹿(光りおわると帰る) */
  swarm?: boolean;
  /** 群れで横ぎる鹿(herd)・せんべい売り場に集まる鹿(stall)。ふつうの鹿の数には 入れない */
  mode?: 'herd' | 'stall';
  /** 群れ: うんこを落とす横の位置。売り場: 集まる横の位置 */
  home?: number;
  /** 売り場の鹿の、のこりの落とす数 */
  drops?: number;
  /** 落とした直後(絵のため) */
  dropPose: number;
};
export type Flower = { id: number; s: number; x: number; hue: number; t: number };
export type SweepEvent = {
  kind: 'drop' | 'sweep' | 'hit' | 'clean' | 'miss' | 'level' | 'flower' | 'warn' | 'glow' | 'clear' | 'fail' | 'combo' | 'gate' | 'barrelHit' | 'barrel' | 'charge' | 'bump' | 'rain' | 'rainEnd' | 'boltWarn' | 'bolt' | 'swarm' | 'herd' | 'stall' | 'wind' | 'windEnd' | 'block';
  /** だれが(たるから出てきた・はじき飛ばされた・鹿を とめた なかま) */
  who?: FriendId;
  id?: number; x?: number; s?: number; n?: number; hard?: boolean; poop?: PoopKind;
};

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
  /** チームの人数(先頭の Spra をふくむ) */
  team = 1;
  /** なかま(先頭のうしろ。入った順)。足りない分は Spra */
  crew: FriendId[] = [];
  /** お花までの数え(Momo が掃くと 多く数える) */
  private flowerPts = 0;
  bestTeam = 1;
  /** 通ったゲートの数(次のゲートの番号) */
  gateIndex = 0;
  barrels: Barrel[] = [];
  chargers: Charger[] = [];
  private chargeIndex = 0;
  /** 雷(予告中・落ちた直後) */
  bolts: Bolt[] = [];
  private nextBolt = 0;
  /** 先頭がしびれている(動けない)のこりの秒数 */
  stun = 0;
  /** 雨が降っているか */
  raining = false;
  /** 風の向き(−1 = 左へ・1 = 右へ・0 = ふいていない)と、のこりの秒数 */
  wind: -1 | 0 | 1 = 0;
  windLeft = 0;
  private nextWind = 0;
  private herdIndex = 0;
  private stallIndex = 0;
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
    this.barrels = (level.barrels ?? []).map(b => ({ id: this.nextId++, s: b.s, x: b.x, hp: b.hp, maxHp: b.hp, n: b.n, friend: b.friend ?? 'spra' }));
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
  /** チームのみんなの位置(参道の中に おさまるように、横は つめる)。いちばん目が先頭 */
  members(): Member[] {
    const out: Member[] = [{ x: this.x, a: 0, leader: true, kind: 'spra', i: -1 }];
    for (let i = 0; i < this.team - 1; i++) {
      const sl = SLOTS[i];
      out.push({ x: clamp(this.x + sl.dx, -WBAL.half + 0.25, WBAL.half - 0.25), a: sl.da, leader: false, kind: this.crew[i] ?? 'spra', i });
    }
    return out;
  }
  /** チームに その なかまが いるか */
  has(kind: FriendId): boolean { return this.crew.slice(0, this.team - 1).includes(kind); }
  /** 人数を かえる: へるときは あとから入った なかまから。ふえるときは add の なかま(無ければ、いまの顔ぶれを くり返す = x2 のゲート) */
  private setTeam(n: number, add?: FriendId) {
    const want = clamp(Math.round(n), 1, this.level.teamMax) - 1;
    this.crew = this.crew.slice(0, Math.min(this.crew.length, this.team - 1));
    while (this.crew.length < this.team - 1) this.crew.push('spra');
    while (this.crew.length > want) this.crew.pop();
    const base = [...this.crew];
    for (let k = 0; this.crew.length < want; k++) this.crew.push(add ?? (base.length ? base[k % base.length] : 'spra'));
    this.team = want + 1;
    this.bestTeam = Math.max(this.bestTeam, this.team);
  }
  /** はじき飛ばされた なかまを、チームから外す */
  private knock(m: Member) {
    if (m.i >= 0 && m.i < this.crew.length) this.crew.splice(m.i, 1);
    this.team = Math.max(1, this.team - 1);
  }
  /** (x, 先 a, 半径 r)のものが、その人のほうきの範囲にあるか */
  private zoneHas(m: Member, x: number, a: number, r: number): boolean {
    const st = this.stats, w = m.leader ? st.width : WBAL.helperWidth, reach = m.leader ? st.reach : st.reach * WBAL.helperReach * (m.kind === 'piko' ? WBAL.pikoReach : 1);
    const rel = a - m.a;
    return rel >= -0.1 && rel <= reach && Math.abs(x - m.x) <= w / 2 + r;
  }
  /** うんこが、だれかの ほうきの範囲にあるか */
  inReach(p: Poop): boolean {
    const a = this.ahead(p.s), r = WBAL.poop[p.kind].r;
    return this.members().some(m => this.zoneHas(m, p.x, a, r));
  }

  /** 左右の位置のねらい(指・キー)。参道の外へは出ない */
  steer(x: number) { this.targetX = clamp(x, -WBAL.reachX, WBAL.reachX); }

  step(dt: number): void {
    if (this.phase !== 'running') return;
    this.t += dt;
    // 左右
    this.stun = Math.max(0, this.stun - dt);
    const dx = this.stun > 0 ? 0 : this.targetX - this.x;
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), WBAL.moveSpeed * dt);
    // 歩く(掃いている間は、ゆっくり)
    const atFoot = (s: number, x: number, r: number) => { const a = this.ahead(s); return a >= -0.1 && a <= WBAL.footAhead && Math.abs(x - this.x) <= WBAL.footX + r; };
    // たるも、足もとにあれば 立ち止まって開ける(通りぬけない)
    const busy = this.poops.some(p => atFoot(p.s, p.x, WBAL.poop[p.kind].r)) || this.barrels.some(b => atFoot(b.s, b.x, 0.35));
    this.pace = this.level.speed * (busy ? WBAL.slow : 1);
    this.d += this.pace * dt;
    this.stepBuddha();
    this.stepHerds();
    this.stepStalls();
    this.stepDeer(dt);
    this.stepGates();
    this.stepChargers(dt);
    this.stepWeather(dt);
    this.stepWind(dt);
    // 通りすぎた たるは、もう開けられない
    this.barrels = this.barrels.filter(b => this.ahead(b.s) >= WBAL.passAt - 1);
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
    if (this.cooldown <= 0) { this.cooldown += this.stats.interval * (this.raining ? WBAL.rainSlow : 1); this.sweep(); }
    if (this.d >= this.level.length) this.end('cleared');
  }

  private end(phase: 'cleared' | 'failed') {
    if (this.phase !== 'running') return;
    this.phase = phase;
    if (phase === 'cleared' && this.premiumOn && this.pollution <= this.level.premiumUnder) this.premium = true;
    this.events.push({ kind: phase === 'cleared' ? 'clear' : 'fail' });
  }

  /** ほうきを振る: みんなが、それぞれの前の範囲のうんこ(と たる)を、近い順に掃く。範囲が重なると、何回も当たる */
  private sweep() {
    const st = this.stats;
    this.events.push({ kind: 'sweep', x: this.x, n: st.level });
    const power = new Map<Poop, number>(), barrelPow = new Map<Barrel, number>(), byMomo = new Set<Poop>();
    for (const m of this.members()) {
      const cap = m.leader ? st.targets : WBAL.helperTargets;
      const near = this.poops.filter(p => this.zoneHas(m, p.x, this.ahead(p.s), WBAL.poop[p.kind].r)).sort((a, b) => this.ahead(a.s) - this.ahead(b.s)).slice(0, cap);
      for (const p of near) {
        // Ruru は 水で ふやかすので、べちゃべちゃ・硬い うんこに つよい
        power.set(p, (power.get(p) ?? 0) + st.power * (m.kind === 'ruru' && (p.wet || p.hard) ? WBAL.ruruPower : 1));
        if (m.kind === 'momo') byMomo.add(p);
      }
      if (near.length < cap) for (const b of this.barrels) if (this.zoneHas(m, b.x, this.ahead(b.s), 0.35)) barrelPow.set(b, (barrelPow.get(b) ?? 0) + st.power);
    }
    for (const [b, pw] of barrelPow) {
      b.hp = Math.max(0, b.hp - pw);
      if (b.hp > 0) { this.events.push({ kind: 'barrelHit', id: b.id, x: b.x, s: b.s, n: b.hp }); continue; }
      this.barrels.splice(this.barrels.indexOf(b), 1);
      const before = this.team;
      this.setTeam(this.team + b.n, b.friend);
      this.events.push({ kind: 'barrel', id: b.id, x: b.x, s: b.s, n: this.team - before, who: b.friend });
    }
    const hits = [...power.keys()];
    let flowers = 0;
    for (const p of hits) {
      p.hp = Math.max(0, p.hp - power.get(p)!);
      if (p.hp > 0) { this.events.push({ kind: 'hit', id: p.id, x: p.x, s: p.s, n: p.hp }); continue; }
      const score = WBAL.poop[p.kind].score * (p.hard ? WBAL.hardScore : 1);
      this.score += score; this.cleaned++;
      if (p.hard) { this.hardCleaned++; if (this.hardCleaned % 3 === 0) this.gold++; }
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboLeft = WBAL.comboWindow;
      this.events.push({ kind: 'clean', id: p.id, x: p.x, s: p.s, n: score, hard: p.hard, poop: p.kind });
      if (this.combo >= 5 && this.combo % 5 === 0) this.events.push({ kind: 'combo', n: this.combo });
      // お花: Momo が掃いた うんこは 多く数える
      this.flowerPts += byMomo.has(p) ? WBAL.momoCount : 1;
      while (this.flowerPts >= WBAL.flowerEvery - 1e-9) { this.flowerPts -= WBAL.flowerEvery; flowers++; }
    }
    this.poops = this.poops.filter(p => p.hp > 0);
    for (let i = 0; i < flowers; i++) this.bloom();
    // ほうきが育つ
    const old = this.broom;
    while (this.broom < WBAL.brooms.length - 1 && this.score >= WBAL.brooms[this.broom + 1].threshold) this.broom++;
    if (this.broom !== old) { this.cooldown = Math.min(this.cooldown, 0.2); this.events.push({ kind: 'level', n: this.stats.level }); }
  }
  /** ゲート: 先頭の Spra が通った側の数字で、人数が かわる */
  private stepGates() {
    const gs = this.level.gates ?? [];
    while (this.gateIndex < gs.length && this.d >= gs[this.gateIndex].s) {
      const g = gs[this.gateIndex++], side = this.x < 0 ? g.left : g.right, before = this.team;
      // + は Spra が ふえる。x は いまの顔ぶれが ふえる
      this.setTeam(applyGate(this.team, side, this.level.teamMax), side[0] === '+' ? 'spra' : undefined);
      this.events.push({ kind: 'gate', x: this.x < 0 ? -1 : 1, s: g.s, n: this.team - before, id: this.gateIndex - 1 });
    }
  }
  /** 走ってくる鹿: 先から来て、ぶつかった仲間を はじき飛ばす(1頭で5人まで)。先頭にぶつかると 2人へる */
  private stepChargers(dt: number) {
    const cs = this.level.chargers ?? [];
    while (this.chargeIndex < cs.length && this.d >= cs[this.chargeIndex].s - WBAL.chargeAppear) {
      const c = cs[this.chargeIndex++];
      const ch: Charger = { id: this.nextId++, s: this.d + WBAL.chargeAppear, x: c.x, hits: 0, hitLeader: false, cool: 0 };
      this.chargers.push(ch);
      this.events.push({ kind: 'charge', id: ch.id, x: ch.x, s: ch.s });
    }
    for (const c of [...this.chargers]) {
      c.s -= WBAL.chargeSpeed * dt;
      c.cool = Math.max(0, c.cool - dt);
      if (this.ahead(c.s) < -3) { this.chargers.splice(this.chargers.indexOf(c), 1); continue; }
      if (c.cool > 0) continue;
      for (const m of this.members()) {
        if (Math.abs(this.ahead(c.s) - m.a) > WBAL.chargeHitZ || Math.abs(c.x - m.x) > WBAL.chargeHitX) continue;
        if (m.leader) {
          if (c.hitLeader) continue;
          c.hitLeader = true;
          const lost = Math.min(this.team - 1, WBAL.chargeLeaderLoss);
          this.setTeam(this.team - lost);
          this.events.push({ kind: 'bump', id: c.id, x: m.x, s: this.d + m.a, n: lost, hard: true });
        } else if (m.kind === 'kuru') {
          // Kuru は 固い からで 鹿を とめる(その鹿は もう だれも とばさない)
          if (c.hits >= WBAL.chargeMaxHits) continue;
          c.hits = WBAL.chargeMaxHits; c.hitLeader = true;
          this.events.push({ kind: 'block', id: c.id, x: m.x, s: this.d + m.a, who: 'kuru' });
        } else {
          if (c.hits >= WBAL.chargeMaxHits) continue;
          c.hits++;
          this.knock(m);
          this.events.push({ kind: 'bump', id: c.id, x: m.x, s: this.d + m.a, n: 1, who: m.kind });
        }
        c.cool = 0.12;
        break;
      }
    }
  }

  /** 雨と雷 */
  private stepWeather(dt: number) {
    const k = this.progress, wet = (this.level.rain ?? []).some(([a, b]) => k >= a && k < b);
    if (wet !== this.raining) { this.raining = wet; this.events.push({ kind: wet ? 'rain' : 'rainEnd' }); }
    const bo = this.level.bolts;
    for (const b of [...this.bolts]) {
      const before = b.t;
      b.t += dt;
      if (before < 0 && b.t >= 0) this.strike(b);
      if (b.t > 1.2) this.bolts.splice(this.bolts.indexOf(b), 1);
    }
    if (!bo || k < bo.from) return;
    this.nextBolt -= dt;
    if (this.nextBolt > 0) return;
    this.nextBolt = bo.every * (0.8 + this.rng() * 0.4);
    // チームの あたり(だれかの少し先)に落ちる。予告の輪を見て、よける
    const ms = this.members(), m = ms[Math.floor(this.rng() * ms.length)];
    const b: Bolt = { id: this.nextId++, s: this.d + m.a + 1.2 + this.rng() * 1.5, x: clamp(m.x + (this.rng() - 0.5) * 0.8, -WBAL.half + 0.4, WBAL.half - 0.4), t: -(WBAL.boltWarn + (this.has('lumi') ? WBAL.lumiWarn : 0)) };
    this.bolts.push(b);
    this.events.push({ kind: 'boltWarn', id: b.id, x: b.x, s: b.s });
  }
  /** 雷が落ちた: 輪の中の なかまは はじき飛ばされ、先頭は しびれる。うんこは 飛び散る(小さく分かれる) */
  private strike(b: Bolt) {
    let leader = false;
    const hit: Member[] = [];
    for (const m of this.members()) {
      if (Math.hypot(m.x - b.x, this.d + m.a - b.s) > WBAL.boltR) continue;
      // Kuru は 固い からで とばされない
      if (m.leader) leader = true; else if (m.kind !== 'kuru' && hit.length < WBAL.boltMaxHits) hit.push(m);
    }
    const lost = hit.length;
    for (const m of hit.sort((p, q) => q.i - p.i)) this.knock(m);
    if (leader) this.stun = WBAL.boltStun;
    for (const p of [...this.poops]) {
      if (p.kind === 'small' || Math.hypot(p.x - b.x, p.s - b.s) > WBAL.boltR) continue;
      this.poops.splice(this.poops.indexOf(p), 1);
      const n = p.kind === 'large' ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.rng();
        const hp = WBAL.poop.small.hp * (p.hard ? WBAL.hardHp : 1);
        this.poops.push({ id: this.nextId++, kind: 'small', s: p.s + Math.sin(a) * 1.4, x: clamp(p.x + Math.cos(a) * 1.4, -WBAL.half + 0.2, WBAL.half - 0.2), hp, maxHp: hp, hard: p.hard, t: 0, wet: p.wet });
      }
    }
    this.events.push({ kind: 'bolt', id: b.id, x: b.x, s: b.s, n: lost, hard: leader });
  }

  /** 鹿の群れ: 先で 一列になって 参道を横ぎり、1頭ずつ うんこを落としていく(横 いっぱいに ならぶ) */
  private stepHerds() {
    const hs = this.level.herds ?? [], kinds = this.level.deer.kinds;
    while (this.herdIndex < hs.length && this.d >= hs[this.herdIndex].s - WBAL.herdAppear) {
      const h = hs[this.herdIndex++], dir: 1 | -1 = this.rng() < 0.5 ? 1 : -1;
      for (let k = 0; k < h.n; k++) {
        this.deer.push({
          id: this.nextId++, kind: kinds[(this.deerMade + k) % kinds.length], s: h.s + (this.rng() - 0.5) * 1.6, x: -dir * (WBAL.half + 1.2 + k * WBAL.herdGap), dir,
          aim: 0, dropIn: 0, life: 99, leaving: false, dropPose: 0, mode: 'herd', home: (this.rng() * 2 - 1) * (WBAL.half - 0.4), drops: 1,
        });
      }
      this.events.push({ kind: 'herd', s: h.s, x: dir, n: h.n });
    }
  }
  /** せんべい売り場: 屋台のまわりに 鹿が集まって、うんこを どんどん落とす(Spra が近づくと にげる) */
  private stepStalls() {
    const ss = this.level.stalls ?? [], kinds = this.level.deer.kinds;
    while (this.stallIndex < ss.length && this.d >= ss[this.stallIndex].s - WBAL.stallAppear) {
      const st = ss[this.stallIndex++];
      for (let k = 0; k < st.n; k++) {
        this.deer.push({
          id: this.nextId++, kind: kinds[(this.deerMade + k) % kinds.length], s: st.s + (this.rng() - 0.5) * 3, x: st.side * (WBAL.half + 1.5 + this.rng() * 2.5), dir: (-st.side) as 1 | -1,
          aim: 0, dropIn: 0.4 + this.rng() * 0.9, life: 99, leaving: false, dropPose: 0, mode: 'stall', home: st.side * (WBAL.half - 0.35 - this.rng() * 1.5), drops: WBAL.stallDrops,
        });
      }
      this.events.push({ kind: 'stall', s: st.s, x: st.side, n: st.n });
    }
  }
  /** 風: ときどき 横から ふいて、Spra(ねらいの位置)と うんこを 流す。小さい うんこほど よく流れて、参道のはしに たまる */
  private stepWind(dt: number) {
    const w = this.level.wind;
    if (!w) return;
    if (this.windLeft > 0) {
      this.windLeft -= dt;
      const f = w.force * this.wind * dt;
      // Piko がいると、チームは 流されにくい(うんこは 流れる)
      this.targetX = clamp(this.targetX + f * (this.has('piko') ? WBAL.pikoWind : 1), -WBAL.reachX, WBAL.reachX);
      for (const p of this.poops) p.x = clamp(p.x + f * WBAL.windPoop[p.kind], -WBAL.half + 0.2, WBAL.half - 0.2);
      if (this.windLeft <= 0) { this.wind = 0; this.windLeft = 0; this.events.push({ kind: 'windEnd' }); }
      return;
    }
    if (this.progress < w.from) return;
    this.nextWind -= dt;
    if (this.nextWind > 0) return;
    this.nextWind = w.every * (0.8 + this.rng() * 0.4);
    this.wind = this.rng() < 0.5 ? -1 : 1;
    this.windLeft = w.dur;
    this.events.push({ kind: 'wind', n: this.wind });
  }

  /** 道ばたに、お花が咲く(よごれが少し減る)。Spra の少し先に咲くので、近づきながら見える */
  private bloom() {
    const side = this.flowers.length % 2 ? 1 : -1;
    const f: Flower = { id: this.nextId++, s: this.d + 4 + this.rng() * 3, x: side * (WBAL.half + 0.3 + this.rng() * 0.6), hue: this.rng(), t: 0 };
    this.flowers.push(f);
    if (this.flowers.length > 80) this.flowers.shift();
    this.dirt = Math.max(0, this.dirt - WBAL.flowerHeal * (this.has('momo') ? WBAL.momoHeal : 1));
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
    if (!b || this.buddhaAt === null) return n;
    return n + b.extraDeer + (this.buddha === 'glow' ? b.swarm ?? 0 : 0);
  }
  private stepDeer(dt: number) {
    const lv = this.level, live = this.deer.filter(d => !d.leaving && !d.mode), want = this.wantDeer();
    if (live.length < want) this.spawnDeer(this.buddha === 'glow');
    // 目が光りおわったら、どっと出てきた鹿は帰っていく
    else if (live.length > want) { const d = live.find(x => x.swarm) ?? live[0]; d.leaving = true; d.dir = d.x >= 0 ? 1 : -1; }
    for (const d of [...this.deer]) {
      d.dropPose = Math.max(0, d.dropPose - dt);
      if (d.mode === 'herd') {
        // 一列で 横ぎる(道のりの位置は そのまま)。決めた所で、1回 落とす
        d.x += d.dir * WBAL.herdSpeed * dt;
        if (d.drops && d.dir * (d.x - (d.home ?? 0)) >= 0) { d.drops = 0; if (this.ahead(d.s) > 0.8) this.drop(d); }
        // 向こう側へ 横ぎりおわったら いなくなる(出てくる側は 参道から遠くても 消さない)
        if (d.dir * d.x > WBAL.half + 1.5 || this.ahead(d.s) < -3) this.deer.splice(this.deer.indexOf(d), 1);
        continue;
      }
      if (d.mode === 'stall' && !d.leaving) {
        // 屋台の前へ かけよって、落とす。Spra が近づくか、落としおわると にげる
        const gap = (d.home ?? 0) - d.x;
        d.x += Math.sign(gap) * Math.min(Math.abs(gap), WBAL.stallRun * dt);
        if (this.ahead(d.s) < WBAL.stallFlee || !d.drops) { d.leaving = true; d.dir = d.x >= 0 ? 1 : -1; continue; }
        d.dropIn -= dt;
        if (Math.abs(gap) < 0.3 && d.dropIn <= 0) { this.drop(d); d.drops = (d.drops ?? 1) - 1; d.dropIn = WBAL.stallDrop * (0.7 + this.rng() * 0.6); }
        continue;
      }
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
      // 横から かけこんでくる鹿(参道の外にいる間)
      if (Math.abs(d.x) > WBAL.reachX + 0.05) { d.x -= Math.sign(d.x) * 3.5 * dt; continue; }
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
  private spawnDeer(swarm = false) {
    const kinds = this.level.deer.kinds, n = this.deerMade++;
    if (swarm) {
      // 大混乱: 参道の横から、すぐ前に かけこんでくる
      const side = this.rng() < 0.5 ? -1 : 1;
      this.deer.push({
        id: this.nextId++, kind: kinds[n % kinds.length], s: this.d + 5 + this.rng() * 7, x: side * (WBAL.half + 1.5), dir: (-side) as 1 | -1,
        aim: WBAL.deerAhead[0] + this.rng() * 5, dropIn: 0.3 + this.rng() * 0.8, life: 99, leaving: false, dropPose: 0, swarm: true,
      });
      return;
    }
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
    // せんべいを食べた鹿の うんこは、ひとまわり大きい
    let kind = this.kindNow();
    if (d.mode === 'stall') kind = kind === 'small' ? 'medium' : this.rng() < WBAL.stallBig ? 'large' : kind;
    const b = this.level.buddha;
    const hard = !!b && this.buddha === 'glow' && this.rng() < b.hard;
    // 雨の間は、べちゃべちゃで固い
    const wet = this.raining, hp = Math.ceil(WBAL.poop[kind].hp * (hard ? WBAL.hardHp : 1) * (wet ? WBAL.wetHp : 1));
    // 鹿のおしりの後ろ(手前)に落ちる
    const p: Poop = { id: this.nextId++, kind, s: d.s - 0.35, x: clamp(d.x - d.dir * 0.12, -WBAL.half + 0.2, WBAL.half - 0.2), hp, maxHp: hp, hard, t: 0, wet };
    this.poops.push(p);
    d.dropPose = 0.3;
    this.events.push({ kind: 'drop', id: p.id, x: p.x, s: p.s, hard, poop: kind });
  }
}
