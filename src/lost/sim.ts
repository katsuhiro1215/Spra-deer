// WORLD 7「鹿のまいご探し」のしくみ(絵を描かない)。単位は マス(1マス = 1)。y は 下向き(画面と同じ)。
import type { LostLevel } from './levels.ts';

export const LBAL = {
  /** Spra の歩く速さ(マス/秒)と、体の半径 */
  speed: 3.2, radius: 0.3,
  /** 子鹿の歩く速さ(Spra より 少し おそい)と、前の人との あいだ */
  fawnSpeed: 2.6, gap: 0.9,
  /** 子鹿に この きょりまで 近づくと、ついてくる */
  call: 1.3,
  /** 道のりで これだけ はなれると「まって〜」、もっと はなれると 止まってしまう(はぐれる) */
  warn: 3.0, lost: 4.6,
  /** お母さんに この きょりまで 連れてくると、とどけた */
  home: 1.6,
  /** ちょうちんの 明るさ(照らす半径)。火が 残り少なくなると(dimAt の割合から) 小さくなる */
  light: 3.4, lightMin: 1.7, dimAt: 0.3,
  /** 石灯籠の 照らす半径 */
  lampLight: 2.3,
  /** ろうそくで もどる 火(秒) */
  candle: 30,
  /** コインなどを 取れる きょり */
  pick: 0.55,
} as const;

export type LCoin = { id: number; x: number; y: number; kind?: 'gold' | 'premium' };
export type Candle = { id: number; x: number; y: number };
export type Pt = { x: number; y: number };
/** 子鹿: lost=まいご(止まって泣いている)、follow=ついてくる、home=お母さんの ところ */
export type Fawn = {
  id: number; x: number; y: number; state: 'lost' | 'follow' | 'home';
  /** ついていく相手(-1 = Spra、0〜 = 前の子鹿) */
  leader: number;
  /** 前の人が 通ったところ(この順に 歩く) */
  path: Pt[];
  /** 向き(1 = 右、-1 = 左)・歩いているか */
  dir: number; moving: boolean;
  /** 「まって〜」を 言ったあとか */
  warned: boolean;
  /** 1回でも 見つけてもらったか */
  met: boolean;
  /** どの お母さんの子か */
  mother: number;
};
export type LostEvent = { kind: 'coin' | 'gold' | 'premium' | 'candle' | 'found' | 'regain' | 'warn' | 'stray' | 'home' | 'dim' | 'clear' | 'fail'; id?: number };
export type LInput = { x: number; y: number };

/** 通れないマス(木・池・石灯籠。地図の外も) */
export const SOLID = new Set(['#', '~', 'L']);

export class LostRun {
  readonly level: LostLevel;
  readonly cols: number; readonly rows: number;
  /** マスの文字(人や物の文字は '.' に直したもの) */
  readonly tiles: string[][];
  /** 1回でも照らしたマス(地図の記おく) */
  readonly seen: Uint8Array;
  readonly lamps: Pt[] = [];
  readonly mothers: Pt[] = [];
  fawns: Fawn[] = [];
  coins: LCoin[] = [];
  candles: Candle[] = [];
  collected = new Set<number>();
  x = 0; y = 0; vx = 0; vy = 0;
  oil: number; t = 0;
  phase: 'ready' | 'running' | 'cleared' | 'failed' = 'ready';
  /** 子鹿が はぐれた回数 */
  strays = 0;
  silver = 0; gold = 0; premium = false;
  private dimmed = false;
  private events: LostEvent[] = [];

  constructor(level: LostLevel) {
    this.level = level;
    this.rows = level.map.length; this.cols = level.map[0].length;
    this.tiles = level.map.map(r => [...r]);
    this.seen = new Uint8Array(this.cols * this.rows);
    this.oil = level.oil;
    let cid = 0, kid = 0;
    const fawnAt: Pt[] = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const ch = this.tiles[r][c], x = c + 0.5, y = r + 0.5;
      if (ch === 'L') this.lamps.push({ x, y });
      if ('SMFcgpo'.includes(ch)) this.tiles[r][c] = '.';
      if (ch === 'S') { this.x = x; this.y = y; }
      else if (ch === 'M') this.mothers.push({ x, y });
      else if (ch === 'F') fawnAt.push({ x, y });
      else if (ch === 'c') this.coins.push({ id: cid++, x, y });
      else if (ch === 'g') this.coins.push({ id: cid++, x, y, kind: 'gold' });
      else if (ch === 'p') this.coins.push({ id: cid++, x, y, kind: 'premium' });
      else if (ch === 'o') this.candles.push({ id: kid++, x, y });
    }
    this.fawns = fawnAt.map((p, i) => ({ id: i, x: p.x, y: p.y, state: 'lost', leader: -1, path: [], dir: 1, moving: false, warned: false, met: false, mother: Math.min(i, this.mothers.length - 1) }));
    // 石灯籠の まわりは、はじめから 見えている
    for (const l of this.lamps) this.reveal(l.x, l.y, LBAL.lampLight);
  }

  start(): void { this.phase = 'running'; this.reveal(this.x, this.y, this.lightRadius); }

  drain(): LostEvent[] { const e = this.events; this.events = []; return e; }

  /** 通れないマスか */
  solid(c: number, r: number): boolean {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return SOLID.has(this.tiles[r][c]);
  }
  /** 半径 rad の まるが、通れないマスに 重なるか */
  hits(x: number, y: number, rad: number = LBAL.radius): boolean {
    for (let r = Math.floor(y - rad); r <= Math.floor(y + rad); r++) for (let c = Math.floor(x - rad); c <= Math.floor(x + rad); c++) {
      if (!this.solid(c, r)) continue;
      const px = Math.max(c, Math.min(x, c + 1)), py = Math.max(r, Math.min(y, r + 1));
      if ((px - x) ** 2 + (py - y) ** 2 < rad * rad) return true;
    }
    return false;
  }
  /** 2点の あいだに 木や池が ないか(見通し) */
  clear(a: Pt, b: Pt): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
      if (this.solid(Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }
  /** ちょうちんの 照らす半径(火が 少なくなると 小さくなる) */
  get lightRadius(): number {
    const k = Math.min(1, this.oil / (this.level.oil * LBAL.dimAt));
    return LBAL.lightMin + (LBAL.light - LBAL.lightMin) * Math.max(0, k);
  }
  /** 家に帰れた 子鹿の数 */
  get homeCount(): number { return this.fawns.filter(f => f.state === 'home').length; }
  get stars(): number { return this.phase !== 'cleared' ? 0 : 1 + (this.t <= this.level.par ? 1 : 0) + (this.strays === 0 ? 1 : 0); }

  private reveal(x: number, y: number, rad: number): void {
    for (let r = Math.floor(y - rad); r <= Math.floor(y + rad); r++) for (let c = Math.floor(x - rad); c <= Math.floor(x + rad); c++) {
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
      if ((c + 0.5 - x) ** 2 + (r + 0.5 - y) ** 2 <= rad * rad) this.seen[r * this.cols + c] = 1;
    }
  }

  /** ついていく相手の いる場所 */
  private leaderPos(f: Fawn): Pt { return f.leader < 0 ? { x: this.x, y: this.y } : this.fawns[f.leader]; }
  /** 子鹿から 前の人までの 道のり */
  pathLen(f: Fawn): number {
    let d = 0, p: Pt = f;
    for (const q of [...f.path, this.leaderPos(f)]) { d += Math.hypot(q.x - p.x, q.y - p.y); p = q; }
    return d;
  }
  /** Spra に つながっている 子鹿の列の、いちばん うしろ(-1 = だれも いない) */
  private tail(): number {
    let lead = -1;
    for (;;) {
      const next = this.fawns.find(f => f.state === 'follow' && f.leader === lead);
      if (!next) return lead;
      lead = next.id;
    }
  }
  /** Spra に つながっているか(前を たどると Spra) */
  connected(f: Fawn): boolean {
    let g: Fawn | undefined = f;
    for (let i = 0; g && i <= this.fawns.length; i++) {
      if (g.state !== 'follow') return false;
      if (g.leader < 0) return true;
      g = this.fawns[g.leader];
    }
    return false;
  }

  step(dt: number, input: LInput): void {
    if (this.phase !== 'running') return;
    this.t += dt;
    // ---- Spra が歩く(角では、通れる道へ 少し寄せる) ----
    let ix = input.x, iy = input.y;
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    this.vx = ix * LBAL.speed; this.vy = iy * LBAL.speed;
    this.moveAxis('x', this.vx * dt, iy);
    this.moveAxis('y', this.vy * dt, ix);
    this.reveal(this.x, this.y, this.lightRadius);

    // ---- ちょうちんの火 ----
    this.oil = Math.max(0, this.oil - dt);
    if (!this.dimmed && this.oil < this.level.oil * LBAL.dimAt) { this.dimmed = true; this.events.push({ kind: 'dim' }); }
    if (this.oil >= this.level.oil * LBAL.dimAt) this.dimmed = false;

    // ---- 拾う ----
    for (const c of this.coins) {
      if (this.collected.has(c.id) || Math.hypot(c.x - this.x, c.y - this.y) > LBAL.pick) continue;
      this.collected.add(c.id);
      if (c.kind === 'gold') { this.gold++; this.events.push({ kind: 'gold', id: c.id }); }
      else if (c.kind === 'premium') { this.premium = true; this.events.push({ kind: 'premium', id: c.id }); }
      else { this.silver++; this.events.push({ kind: 'coin', id: c.id }); }
    }
    for (const k of this.candles) {
      const key = -1 - k.id;
      if (this.collected.has(key) || Math.hypot(k.x - this.x, k.y - this.y) > LBAL.pick) continue;
      this.collected.add(key);
      this.oil = Math.min(this.level.oil, this.oil + LBAL.candle);
      this.events.push({ kind: 'candle', id: k.id });
    }

    // ---- 子鹿 ----
    const me = { x: this.x, y: this.y };
    for (const f of this.fawns) {
      if (f.state === 'lost') {
        f.moving = false;
        if (Math.hypot(f.x - this.x, f.y - this.y) <= LBAL.call && this.clear(f, me)) {
          f.leader = this.tail(); f.state = 'follow'; f.path = []; f.warned = false;
          this.events.push({ kind: f.met ? 'regain' : 'found', id: f.id });
          f.met = true;
        }
        continue;
      }
      if (f.state === 'home') {
        // お母さんの となりへ 歩いていく
        const mo = this.mothers[f.mother], tx = mo.x - 0.7, ty = mo.y + 0.15;
        const d = Math.hypot(tx - f.x, ty - f.y);
        f.moving = d > 0.05;
        if (f.moving) { const s = Math.min(d, LBAL.fawnSpeed * dt); f.dir = Math.sign(tx - f.x) || f.dir; f.x += ((tx - f.x) / d) * s; f.y += ((ty - f.y) / d) * s; }
        continue;
      }
      // ついていく: 前の人が 通ったところを、そのまま たどる
      const lead = this.leaderPos(f);
      const last = f.path[f.path.length - 1] ?? f;
      if (Math.hypot(lead.x - last.x, lead.y - last.y) > 0.05) f.path.push({ x: lead.x, y: lead.y });
      // すぐ近くに 見えているなら、近道する(Spra が もどってきたとき)
      const near = Math.hypot(lead.x - f.x, lead.y - f.y);
      if (near < 1.2 && this.pathLen(f) > near + 1.2 && this.clear(f, lead)) f.path = [{ x: lead.x, y: lead.y }];
      let budget = LBAL.fawnSpeed * dt, len = this.pathLen(f);
      f.moving = false;
      while (budget > 1e-6 && len > LBAL.gap && f.path.length) {
        const q = f.path[0], d = Math.hypot(q.x - f.x, q.y - f.y);
        const s = Math.min(budget, d, len - LBAL.gap);
        if (d > 1e-6) { if (Math.abs(q.x - f.x) > 1e-3) f.dir = Math.sign(q.x - f.x); f.x += ((q.x - f.x) / d) * s; f.y += ((q.y - f.y) / d) * s; f.moving = true; }
        budget -= s; len -= s;
        if (d - s < 1e-4) f.path.shift(); else break;
      }
      if (!this.connected(f)) continue; // 前の子鹿が 止まっているなら、そのうしろで 待つ
      len = this.pathLen(f);
      if (len > LBAL.lost && near > LBAL.call) {
        f.state = 'lost'; f.path = []; f.moving = false; this.strays++;
        // うしろに ついていた子は、この子に ついたまま(この子を 見つければ、いっしょに 来る)
        this.events.push({ kind: 'stray', id: f.id });
      } else if (len > LBAL.warn && near > LBAL.call) {
        if (!f.warned) { f.warned = true; this.events.push({ kind: 'warn', id: f.id }); }
      } else if (len < LBAL.warn - 1) f.warned = false;
      // お母さんの ところへ 着いた
      const mo = this.mothers[f.mother];
      if (mo && Math.hypot(mo.x - f.x, mo.y - f.y) <= LBAL.home) {
        f.state = 'home';
        for (const g of this.fawns) if (g.state === 'follow' && g.leader === f.id) { g.leader = f.leader; }
        this.events.push({ kind: 'home', id: f.id });
      }
    }

    if (this.fawns.length && this.fawns.every(f => f.state === 'home')) { this.phase = 'cleared'; this.events.push({ kind: 'clear' }); return; }
    if (this.oil <= 0) { this.phase = 'failed'; this.events.push({ kind: 'fail' }); }
  }

  /** 1つの向きに動く。ぶつかったら、通れる道の まん中へ 少し寄せる(角で 引っかからない) */
  private moveAxis(axis: 'x' | 'y', d: number, other: number): void {
    if (Math.abs(d) < 1e-9) return;
    const nx = axis === 'x' ? this.x + d : this.x, ny = axis === 'y' ? this.y + d : this.y;
    if (!this.hits(nx, ny)) { this.x = nx; this.y = ny; return; }
    // 横の入力が 小さいときだけ 寄せる
    if (Math.abs(other) > 0.6) return;
    const along = axis === 'x' ? this.y : this.x;
    const step = Math.abs(d);
    const dir = Math.sign(d);
    for (const off of [0, -1, 1]) {
      const center = Math.floor(along) + 0.5 + off;
      if (Math.abs(center - along) > 0.75) continue;
      // その道の 先が あいているか
      const c = axis === 'x' ? Math.floor(this.x + dir * (LBAL.radius + 0.5)) : Math.floor(center);
      const r = axis === 'x' ? Math.floor(center) : Math.floor(this.y + dir * (LBAL.radius + 0.5));
      if (this.solid(c, r)) continue;
      const s = Math.sign(center - along) * Math.min(step, Math.abs(center - along));
      const tx = axis === 'x' ? this.x : this.x + s, ty = axis === 'x' ? this.y + s : this.y;
      if (!this.hits(tx, ty)) { this.x = tx; this.y = ty; }
      return;
    }
  }
}

/** マスの道を 調べる(テスト・ボット用): a から b までの 最短の マスの並び(通れなければ null) */
export function route(run: LostRun, a: Pt, b: Pt): Pt[] | null {
  const W = run.cols, key = (c: number, r: number) => r * W + c;
  const sc = Math.floor(a.x), sr = Math.floor(a.y), gc = Math.floor(b.x), gr = Math.floor(b.y);
  const prev = new Int32Array(W * run.rows).fill(-2);
  prev[key(sc, sr)] = -1;
  const q = [key(sc, sr)];
  for (let i = 0; i < q.length; i++) {
    const k = q[i], c = k % W, r = (k - c) / W;
    if (c === gc && r === gr) {
      const out: Pt[] = [];
      for (let j = k; j >= 0; j = prev[j]) out.unshift({ x: (j % W) + 0.5, y: Math.floor(j / W) + 0.5 });
      return out;
    }
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (run.solid(nc, nr) || prev[key(nc, nr)] !== -2) continue;
      prev[key(nc, nr)] = k; q.push(key(nc, nr));
    }
  }
  return null;
}
