// WORLD 5「鹿の背中で ぴょんぴょん」のしくみ(絵を描かない)。単位は m。左右は つながっている(右の端から出ると 左から出てくる)。
import type { JumpLevel, PadKind } from './levels.ts';

export const JBAL = {
  /** 横の幅(m)。左右は つながっている */
  width: 9,
  gravity: 30,
  /** ふつうの跳ね(高さ 約3.75m)と、おじぎ鹿の大ジャンプ(約7.3m) */
  jump: 15, superJump: 21,
  /** 左右の速さ・加速 */
  runMax: 7.5, runAccel: 70,
  /** おじぎの周期と、おじぎしている間(周期の終わりの この秒数) */
  bowCycle: 2.6, bowTime: 0.85,
  /** はねる子鹿: 上下の はば(m)と 周期(秒) */
  hopAmp: 0.9, hopCycle: 1.8,
  /** 落ちたあと、ふわりと 持ち上げる速さ */
  rescue: 17,
  /** コイン・せんべいを取れる きょり */
  pick: 0.6,
  /** Spra の背の高さ(体の まん中で コインを取る) */
  spraH: 1.45,
  /** カラスに当たる きょり・はじかれたあとの 下向きの速さ・当たらない時間 */
  crowHit: 0.6, crowKnock: 4, crowSafe: 1.2,
  /** せんべいは いくつまで 持てるか */
  senbeiMax: 2,
  /** ねむい鹿が 行ってから、また もどってくるまで(秒) */
  sleepBack: 3,
} as const;

export type Pad = {
  id: number; kind: PadKind | 'ground'; x: number; y: number; w: number; dir: number; speed: number; phase: number; lo: number; hi: number;
  /** 上下に動く足場(はねる子鹿)の、まん中の高さ */
  baseY: number;
  /** ねむい鹿: 起きて 行ってしまった時刻(-1 = まだ いる) */
  goneAt: number;
};
export type JCoin = { id: number; x: number; y: number; kind?: 'gold' | 'premium' };
/** せんべい(取っておくと、落ちたとき 鹿が受けとめてくれる) */
export type JSenbei = { id: number; x: number; y: number };
/** カラス: 高さ y を、左右へ 飛んでいく */
export type Crow = { id: number; y: number; x: number; dir: number; speed: number };
export type JumpEvent = { kind: 'bounce' | 'super' | 'coin' | 'gold' | 'premium' | 'senbei' | 'catch' | 'crow' | 'wake' | 'fall' | 'clear' | 'fail'; id?: number };
export type JInput = { left: boolean; right: boolean };

/** 決まった乱数(同じ たねなら、同じ並び) */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
/** 鹿ごとの 足場の幅 */
export const PAD_W: Record<PadKind | 'ground', number> = { lie: 1.35, walk: 1.2, bow: 1.05, sleep: 1.35, hop: 1.0, ground: JBAL.width };

/** 面のデータから、足場・コイン・せんべい・カラスを並べる */
export function buildCourse(level: JumpLevel): { pads: Pad[]; coins: JCoin[]; senbei: JSenbei[]; crows: Crow[] } {
  const r = rng(level.seed);
  const W = JBAL.width;
  const pad = (o: Omit<Pad, 'baseY' | 'goneAt'>): Pad => ({ ...o, baseY: o.y, goneAt: -1 });
  const pads: Pad[] = [pad({ id: 0, kind: 'ground', x: W / 2, y: 0, w: W, dir: 0, speed: 0, phase: 0, lo: 0, hi: W })];
  const coins: JCoin[] = [], senbei: JSenbei[] = [], crows: Crow[] = [];
  let y = 0, x = W / 2, id = 1, cid = 0, sid = 0, crowId = 0, premiumDone = false, lastCrow = 0, lastSenbei = 0;
  for (const sec of level.sections) {
    const entries = Object.entries(sec.kinds) as [PadKind, number][];
    const total = entries.reduce((a, [, v]) => a + v, 0);
    while (y < sec.until - 0.5) {
      let pick = r() * total, kind: PadKind = entries[0][0];
      for (const [k, v] of entries) { if (pick < v) { kind = k; break; } pick -= v; }
      // はねる子鹿は 上下に動くので、そのぶん すき間を せまくする
      const g = sec.gap[0] + r() * (sec.gap[1] - sec.gap[0]) - (kind === 'hop' ? JBAL.hopAmp : 0);
      const ny = y + Math.max(1.2, g);
      if (ny > level.goal - 0.8) break; // ゴールの足場の すぐ下には 置かない
      const prevY = y;
      y = ny;
      // 前の足場から、左右へ 0.8〜2.8m ずらす
      x = (x + (r() < 0.5 ? -1 : 1) * (0.8 + r() * 2.0) + W) % W;
      x = Math.min(W - 0.9, Math.max(0.9, x));
      const lo = Math.max(0.8, x - 1.3), hi = Math.min(W - 0.8, x + 1.3);
      pads.push(pad({ id: id++, kind, x, y, w: PAD_W[kind], dir: r() < 0.5 ? -1 : 1, speed: kind === 'walk' ? sec.walkSpeed ?? 1.2 : 0, phase: r() * JBAL.bowCycle, lo, hi }));
      // コイン: 足場の上に、ときどき縦に並べる。おじぎ鹿の上の 高い所には ゴールド(大ジャンプでないと 届かない)
      if (kind === 'bow' && r() < 0.6) coins.push({ id: cid++, x, y: y + 5.4, kind: 'gold' });
      else if (r() < 0.45) for (let k = 0; k < 3; k++) coins.push({ id: cid++, x, y: y + 1.1 + k * 0.7 });
      // プレミアムコイン: 面の後半の おじぎ鹿の上に 1まい(大ジャンプの てっぺん)
      if (!premiumDone && kind === 'bow' && y > level.goal * 0.5) { coins.push({ id: cid++, x, y: y + 6.8, kind: 'premium' }); premiumDone = true; }
      // せんべい: 決まった間かくで、足場の上に
      if (sec.senbeiEvery && y - lastSenbei >= sec.senbeiEvery) { senbei.push({ id: sid++, x, y: y + 1.6 }); lastSenbei = y; }
      // カラス: 決まった間かくで、前の足場と この足場の あいだの高さを 飛ぶ(跳んで上がる ときに 横切る。着地する 高さは さける)
      if (sec.crowEvery && y - lastCrow >= sec.crowEvery) {
        crows.push({ id: crowId++, y: prevY + (y - prevY) * 0.5 + 0.4, x: r() * W, dir: r() < 0.5 ? -1 : 1, speed: sec.crowSpeed ?? 2.2 });
        lastCrow = y;
      }
    }
  }
  // ゴールの足場(広い寝ころび鹿)
  pads.push(pad({ id: id++, kind: 'lie', x: W / 2, y: level.goal, w: 3, dir: 0, speed: 0, phase: 0, lo: 0, hi: W }));
  return { pads, coins, senbei, crows };
}

/** 左右がつながっているときの、a から b への近い向きの きょり */
export const wrapDx = (a: number, b: number): number => {
  const W = JBAL.width;
  let d = b - a;
  if (d > W / 2) d -= W; else if (d < -W / 2) d += W;
  return d;
};

export class JumpRun {
  readonly level: JumpLevel;
  pads: Pad[]; coins: JCoin[]; senbeiItems: JSenbei[]; crows: Crow[];
  phase: 'ready' | 'running' | 'cleared' | 'failed' = 'ready';
  /** Spra の足もとの位置と速さ */
  x = JBAL.width / 2; y = 0; vx = 0; vy = 0;
  t = 0; lives = 3;
  /** 画面の下の端の高さ(上がるだけ) */
  camY = 0;
  /** 画面の縦の長さ(m)。画面の形で決まる */
  viewH: number;
  maxY = 0;
  silver = 0; gold = 0; premium = false;
  collected = new Set<number>();
  /** 持っている せんべい */
  senbei = 0;
  /** カラスに はじかれたあと、当たらない残り時間 */
  safe = 0;
  /** 今いる高さの 風(m/秒²。+ は右へ) */
  wind = 0;
  /** 最後に乗った足場 */
  lastPad: Pad | null = null;
  bounces = 0; supers = 0; falls = 0; crowHits = 0; catches = 0;
  private events: JumpEvent[] = [];

  constructor(level: JumpLevel, viewH = 16) {
    this.level = level;
    const c = buildCourse(level);
    this.pads = c.pads; this.coins = c.coins; this.senbeiItems = c.senbei; this.crows = c.crows;
    this.viewH = viewH;
  }

  drain(): JumpEvent[] { return this.events.splice(0); }
  start(): void { if (this.phase === 'ready') { this.phase = 'running'; this.vy = JBAL.jump; } }
  /** おじぎしているか(足場ごと) */
  bowing(p: Pad): boolean { return p.kind === 'bow' && (this.t + p.phase) % JBAL.bowCycle > JBAL.bowCycle - JBAL.bowTime; }
  get progress(): number { return Math.min(1, this.maxY / this.level.goal); }
  /** その高さの 風(区間ごと。20m ごとに 向きが かわる) */
  windAt(y: number): number {
    const sec = this.level.sections.find(s => y < s.until) ?? this.level.sections.at(-1);
    if (!sec?.wind) return 0;
    return Math.floor(y / 20) % 2 === 0 ? sec.wind : -sec.wind;
  }

  step(dt: number, input: JInput): void {
    this.t += dt;
    // 足場を動かす(歩く鹿・はねる子鹿)
    for (const p of this.pads) {
      // ねむい鹿は、しばらくすると また もどってきて ねむる(下の鹿から 上へ 行けなくならないように)
      if (p.goneAt >= 0 && this.t - p.goneAt > JBAL.sleepBack) p.goneAt = -1;
      if (p.speed > 0) {
        p.x += p.dir * p.speed * dt;
        if (p.x < p.lo) { p.x = p.lo; p.dir = 1; } else if (p.x > p.hi) { p.x = p.hi; p.dir = -1; }
      }
      if (p.kind === 'hop') p.y = p.baseY + Math.sin(((this.t + p.phase) / JBAL.hopCycle) * Math.PI * 2) * JBAL.hopAmp;
    }
    // カラスを 飛ばす
    for (const c of this.crows) c.x = (((c.x + c.dir * c.speed * dt) % JBAL.width) + JBAL.width) % JBAL.width;
    if (this.phase !== 'running') return;
    const W = JBAL.width;
    this.safe = Math.max(0, this.safe - dt);
    // 左右(風に 流される)
    this.wind = this.windAt(this.y);
    const want = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const target = want * JBAL.runMax, dv = target - this.vx, max = JBAL.runAccel * dt;
    this.vx += Math.abs(dv) <= max ? dv : Math.sign(dv) * max;
    this.x = (((this.x + (this.vx + this.wind) * dt) % W) + W) % W;
    // 上下
    const prevY = this.y;
    this.vy -= JBAL.gravity * dt;
    this.y += this.vy * dt;
    // 落ちてきて、足場に乗ったら 跳ねる
    if (this.vy < 0) {
      for (const p of this.pads) {
        if (p.goneAt >= 0) continue;
        if (prevY >= p.y - 0.15 && this.y <= p.y && Math.abs(wrapDx(p.x, this.x)) <= p.w / 2 + 0.3) {
          this.y = p.y;
          // ゴールの足場に乗ったら クリア
          if (p.y >= this.level.goal) { this.lastPad = p; this.maxY = p.y; this.vy = 0; this.vx = 0; this.phase = 'cleared'; this.events.push({ kind: 'clear' }); return; }
          const big = this.bowing(p);
          this.vy = big ? JBAL.superJump : JBAL.jump;
          this.lastPad = p;
          if (big) { this.supers++; this.events.push({ kind: 'super', id: p.id }); } else { this.bounces++; this.events.push({ kind: 'bounce', id: p.id }); }
          // ねむい鹿: 1回乗ると 起きて、行ってしまう
          if (p.kind === 'sleep') { p.goneAt = this.t; this.events.push({ kind: 'wake', id: p.id }); }
          break;
        }
      }
    }
    this.maxY = Math.max(this.maxY, this.y);
    this.camY = Math.max(this.camY, this.y - this.viewH * 0.42);
    // コイン・せんべい
    const cy = this.y + JBAL.spraH / 2;
    for (const c of this.coins) {
      if (this.collected.has(c.id) || Math.abs(c.y - cy) > JBAL.pick + 0.3) continue;
      if (Math.hypot(wrapDx(c.x, this.x), c.y - cy) > JBAL.pick + 0.25) continue;
      this.collected.add(c.id);
      if (c.kind === 'premium') this.premium = true; else if (c.kind === 'gold') this.gold++; else this.silver++;
      this.events.push({ kind: c.kind ?? 'coin', id: c.id });
    }
    for (const s of this.senbeiItems) {
      if (this.collected.has(-1 - s.id) || this.senbei >= JBAL.senbeiMax) continue;
      if (Math.hypot(wrapDx(s.x, this.x), s.y - cy) > JBAL.pick + 0.35) continue;
      this.collected.add(-1 - s.id); this.senbei++;
      this.events.push({ kind: 'senbei', id: s.id });
    }
    // カラスに当たると、下へ はじかれる(ハートは へらない)
    if (this.safe <= 0) {
      for (const c of this.crows) {
        if (Math.abs(c.y - cy) < JBAL.crowHit && Math.abs(wrapDx(c.x, this.x)) < JBAL.crowHit) {
          this.vy = Math.min(this.vy, -JBAL.crowKnock); this.vx = c.dir * 3; this.safe = JBAL.crowSafe; this.crowHits++;
          this.events.push({ kind: 'crow', id: c.id });
          break;
        }
      }
    }
    // 画面の下へ落ちた: せんべいがあれば 鹿が受けとめてくれる。なければ ハートが へって、ふわりと 持ち上げる
    if (this.y < this.camY - 0.6) {
      if (this.senbei > 0) {
        this.senbei--; this.catches++;
        this.y = this.camY + 0.2; this.vy = JBAL.superJump; this.vx = 0;
        this.events.push({ kind: 'catch' });
        return;
      }
      this.lives--; this.falls++;
      this.events.push({ kind: 'fall' });
      if (this.lives <= 0) { this.phase = 'failed'; this.events.push({ kind: 'fail' }); return; }
      this.y = this.camY + 0.2; this.vy = JBAL.rescue; this.vx = 0;
    }
  }

  /** ★の数(残りのハート) */
  get stars(): number { return this.phase === 'cleared' ? Math.max(1, this.lives) : 0; }
}
