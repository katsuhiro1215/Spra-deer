// WORLD 8「鹿と暴走トロッコ」: 線路のデータと、形の計算(描画なし。テストからも使う)
// 単位はメートル。s は線路にそった距離。向き(heading)は 0 が奥(-z)、増えると右へ曲がる。

/** tunnel=トンネル(中は暗い)、gorge=とても深い谷(高い鉄橋) */
export type Terrain = 'forest' | 'hillL' | 'hillR' | 'cut' | 'ridge' | 'canyon' | 'tunnel' | 'gorge';
/**
 * 線路の1区間。slope=坂(度。マイナスが下り)、turn=この区間で曲がる角度(度。プラスが右)。
 * wind=横風(m/s²。プラスは右へ押す。強弱がある)、snow=雪の積もった所、
 * fog=霧の濃さ 0〜1(1 で 45m 先までしか見えない)、cloudSea=下に雲の海が広がる(霧の晴れた尾根)
 */
export type Segment = {
  len: number; slope?: number; turn?: number; terrain?: Terrain; name?: string;
  wind?: number; snow?: boolean; fog?: number; cloudSea?: boolean;
  /** 夕焼けの具合 0〜1(空・霧・光が夕方の色になる) */
  dusk?: number;
};
/**
 * 線路の切れ目(from〜to に線路が無い)。
 * shift=向こう側の線路が横へずれている(m。プラスが右。空中で体を傾けて寄せる)、drop=向こう側が低い(m)、
 * collapse=ふだんは橋がかかっていて、近づくと崩れ落ちる(見た目と警告だけ。走りのルールでは、はじめから切れ目)
 */
export type Gap = { from: number; to: number; shift?: number; drop?: number; collapse?: boolean };
/**
 * rock=落石・log=倒木(跳んで越える)、branch=横から張り出した枝(side の反対へ体を傾けてよける)、
 * ramp=ジャンプ台(乗ると高く飛ぶ。台の上でジャンプすると、もっと高く遠くへ。ぶつかることはない)、
 * senbei=鹿せんべい(通ると鹿が食べて、すぐ全力で走る。side があれば、その向きへ体を傾けて取る)
 */
export type ObstacleKind = 'rock' | 'log' | 'branch' | 'ramp' | 'senbei';
export type Obstacle = { id: number; s: number; kind: ObstacleKind; side?: -1 | 1 };
/** コイン。side=-1 左 / 0 まん中 / 1 右(横は体を傾けて取る)、h=線路からの高さ。kind 無しはシルバー。 */
export type Coin = { id: number; s: number; side: -1 | 0 | 1; h: number; kind?: 'gold' | 'premium' };
export type Checkpoint = { s: number; name: string };
/**
 * 後ろから追ってくるもの(boulder=転がる大岩、avalanche=なだれ)。
 * トロッコが from を通ると、behind メートル後ろにあらわれ、v(m/s)で追ってくる(坂でも速さは変わらない)。
 * to(谷のふち・トンネルの入口)まで来るか、トロッコが to をこえて着地すると、ふりきれる(大岩は谷へ落ち、なだれは止まる)。
 */
export type Chase = { from: number; to: number; v: number; behind: number; kind: 'boulder' | 'avalanche' };
/**
 * 分かれ道(追いかけっこの面)。at〜at+len の間、線路が左右2本に分かれて、また1本にもどる。
 * 鹿のトロッコは correct の側(-1 左・1 右)へ行く。もう片方は古いレールの遠回り(おそくなる)。
 */
export type Fork = { at: number; len: number; correct: -1 | 1 };
/**
 * 追いかけっこ(仲間の鹿の面 8-11〜8-16。2026-11-22 Owner案)。
 * 鹿の乗ったトロッコが lead メートル先から、坂を勝手に下っていく(最高 deerCap m/s。カーブでは安全な速さまで落とす)。
 * 追いついて連結し、cliff(谷のふち。線路が切れている)より手前で止めたらクリア。friend=前のトロッコに乗っている仲間の鹿
 */
export type Pursuit = { lead: number; deerCap: number; cliff: number; forks: Fork[]; friend: string; /** 前のトロッコの、はじめの速さ(もう走っている。無ければ 20 m/s) */ deerStart?: number };
export type TrackDef = {
  segments: Segment[];
  gaps: Gap[];
  obstacles: Omit<Obstacle, 'id'>[];
  coins: Omit<Coin, 'id'>[];
  checkpoints?: Checkpoint[];
  /** この面の、ふつうの最高速(m/s)。無ければ BAL.vMax。ダッシュ中は、これより少し上まで出る */
  vMax?: number;
  /** 灯籠の門(線路の両がわに立つ、光る灯籠。霧の中でも見える目印) */
  lanternGates?: number[];
  /** 後ろから追ってくるもの(s の順) */
  chases?: Chase[];
  /** 追いかけっこの面(無ければ ふつうの面) */
  pursuit?: Pursuit;
};

const DEG = Math.PI / 180;
/** 崩れる橋(gap.collapse)が崩れ落ちる、切れ目の手前の距離(m)。 */
export const COLLAPSE_AT = 38;
/** ゴールのあとに続く線路(止まるまで走る分)。 */
export const RUNOUT = 140;

/** 地形の種類ごとの、線路の左右のようす。l/r=線路から離れるほど上がる(+)・下がる(-)割合、cap=上がる高さの上限、depth=谷の深さ。 */
const TERRAIN: Record<Terrain, { l: number; r: number; cap: number; depth: number }> = {
  forest: { l: 0.22, r: 0.18, cap: 26, depth: 0 },
  hillL: { l: 0.95, r: -0.55, cap: 60, depth: 0 },
  hillR: { l: -0.55, r: 0.95, cap: 60, depth: 0 },
  cut: { l: 1.7, r: 1.7, cap: 9, depth: 0 },
  ridge: { l: -0.5, r: -0.45, cap: 26, depth: 0 },
  canyon: { l: 0.12, r: 0.1, cap: 26, depth: 22 },
  tunnel: { l: 2.2, r: 2.2, cap: 30, depth: 0 },
  gorge: { l: 0.08, r: 0.08, cap: 30, depth: 62 },
};
/** 分かれ道で、2本の線路が いちばん離れたときの、まん中からの距離(m) */
export const FORK_W = 3.4;
/** 分かれ道の、まん中からのずれ(0〜1)。はじめの 30% で離れ、終わりの 30% で もどる */
export function forkShape(f: Fork, s: number): number {
  const k = (s - f.at) / f.len;
  if (k <= 0 || k >= 1) return 0;
  const e = Math.min(1, k / 0.3, (1 - k) / 0.3);
  return e * e * (3 - 2 * e);
}
/** 谷(橋がかかる地形) */
export const BRIDGED: Terrain[] = ['canyon', 'gorge'];

export type TrackPoint = { x: number; y: number; z: number; heading: number; pitch: number; curv: number };

/** 前後 w メートルの平均(坂や曲がりの、つなぎ目をなめらかにする)。 */
function smooth(src: Float64Array, w: number): Float64Array {
  const n = src.length, out = new Float64Array(n), pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w), b = Math.min(n, i + w + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

export class Track {
  /** ゴールまでの長さ */
  length: number;
  /** 作ってある線路の長さ(ゴールのあとの分を含む) */
  total: number;
  gaps: Gap[];
  obstacles: Obstacle[];
  coins: Coin[];
  checkpoints: Checkpoint[];
  vMax?: number;
  lanternGates: number[];
  chases: Chase[];
  pursuit?: Pursuit;
  segments: (Segment & { from: number; to: number })[] = [];
  private px: Float64Array; private py: Float64Array; private pz: Float64Array;
  private hd: Float64Array; private pt: Float64Array; private cv: Float64Array;
  private tl: Float64Array; private tr: Float64Array; private tc: Float64Array; private td: Float64Array;
  private wd: Float64Array; private sn: Float64Array; private tn: Float64Array; private fg: Float64Array; private dk: Float64Array;

  constructor(def: TrackDef) {
    let at = 0;
    for (const g of def.segments) { this.segments.push({ ...g, from: at, to: at + g.len }); at += g.len; }
    this.length = at;
    this.total = at + RUNOUT;
    const n = this.total + 1;
    const pitch = new Float64Array(n), curv = new Float64Array(n);
    const tl = new Float64Array(n), tr = new Float64Array(n), tc = new Float64Array(n), td = new Float64Array(n);
    const wd = new Float64Array(n), sn = new Float64Array(n), tn = new Float64Array(n), fg = new Float64Array(n), dk = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const g = this.segments.find(x => i < x.to);
      // ゴールのあとは、平らな森の中をまっすぐ
      const t = TERRAIN[g?.terrain ?? 'forest'];
      pitch[i] = g ? (g.slope ?? 0) * DEG : 0;
      curv[i] = g ? ((g.turn ?? 0) * DEG) / g.len : 0;
      tl[i] = t.l; tr[i] = t.r; tc[i] = t.cap; td[i] = t.depth;
      wd[i] = g?.wind ?? 0; sn[i] = g?.snow ? 1 : 0; tn[i] = g?.terrain === 'tunnel' ? 1 : 0; fg[i] = g?.fog ?? 0;
      dk[i] = g?.dusk ?? this.segments[this.segments.length - 1].dusk ?? 0;
    }
    this.pt = smooth(pitch, 9); this.cv = smooth(curv, 7);
    this.tl = smooth(tl, 16); this.tr = smooth(tr, 16); this.tc = smooth(tc, 16);
    // 深い谷は、ふちを少し広めになじませる(橋の手前で、がけが急に落ちないように)
    this.td = smooth(td, 9);
    this.wd = smooth(wd, 12); this.sn = smooth(sn, 30); this.tn = tn; this.fg = smooth(fg, 25); this.dk = smooth(dk, 60);
    // ずれた・沈んだ切れ目: 切れ目の中(線路の無い所)で、横と下へ少しずつ動かす
    const lat = new Float64Array(n), sink = new Float64Array(n);
    for (const g of def.gaps) {
      const a = Math.ceil(g.from), b = Math.floor(g.to);
      for (let i = a; i < b && i < n; i++) { lat[i] = (g.shift ?? 0) / (b - a); sink[i] = (g.drop ?? 0) / (b - a); }
    }
    this.px = new Float64Array(n); this.py = new Float64Array(n); this.pz = new Float64Array(n); this.hd = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const h = this.hd[i - 1] + this.cv[i - 1], p = this.pt[i - 1], flat = Math.cos(p);
      this.hd[i] = h;
      this.px[i] = this.px[i - 1] + Math.sin(h) * flat + Math.cos(h) * lat[i - 1];
      this.py[i] = this.py[i - 1] + Math.sin(p) - sink[i - 1];
      this.pz[i] = this.pz[i - 1] - Math.cos(h) * flat + Math.sin(h) * lat[i - 1];
    }
    this.gaps = def.gaps.map(g => ({ ...g }));
    this.obstacles = def.obstacles.map((o, id) => ({ ...o, id })).sort((a, b) => a.s - b.s);
    this.coins = def.coins.map((c, id) => ({ ...c, id })).sort((a, b) => a.s - b.s);
    this.checkpoints = (def.checkpoints ?? []).map(c => ({ ...c }));
    this.vMax = def.vMax;
    this.lanternGates = def.lanternGates ?? [];
    this.chases = (def.chases ?? []).map(c => ({ ...c })).sort((a, b) => a.from - b.from);
    this.pursuit = def.pursuit ? { ...def.pursuit, forks: def.pursuit.forks.map(f => ({ ...f })).sort((a, b) => a.at - b.at) } : undefined;
  }
  /** s が分かれ道の中なら、その分かれ道 */
  forkAt(s: number): Fork | undefined { return this.pursuit?.forks.find(f => s >= f.at && s <= f.at + f.len); }

  private lerp(a: Float64Array, s: number): number {
    const c = Math.max(0, Math.min(this.total - 1e-6, s)), i = Math.floor(c), t = c - i;
    return a[i] + (a[i + 1] - a[i]) * t;
  }
  /** 線路の上の点(距離 s)。 */
  at(s: number): TrackPoint {
    return { x: this.lerp(this.px, s), y: this.lerp(this.py, s), z: this.lerp(this.pz, s), heading: this.lerp(this.hd, s), pitch: this.lerp(this.pt, s), curv: this.lerp(this.cv, s) };
  }
  height(s: number): number { return this.lerp(this.py, s); }
  /** 坂の角度の変わり方(1mあたり)。マイナスは、峠(こぶ)の上のように下へ折れる所 */
  pitchRate(s: number): number { return (this.lerp(this.pt, s + 1) - this.lerp(this.pt, s - 1)) / 2; }
  /** 線路の左右の地形(l・r は離れるほど上がる割合、cap は上限、depth は谷の深さ)。 */
  terrain(s: number): { l: number; r: number; cap: number; depth: number } {
    return { l: this.lerp(this.tl, s), r: this.lerp(this.tr, s), cap: this.lerp(this.tc, s), depth: this.lerp(this.td, s) };
  }
  /** 横風の強さ(強弱をつける前の値。プラスは右へ押す) */
  windAt(s: number): number { return this.lerp(this.wd, s); }
  /** 雪の積もり具合 0〜1 */
  snowAt(s: number): number { return this.lerp(this.sn, s); }
  /** 霧の濃さ 0〜1 */
  fogAt(s: number): number { return this.lerp(this.fg, s); }
  /** 夕焼けの具合 0〜1 */
  duskAt(s: number): number { return this.lerp(this.dk, s); }
  /** 霧の中の急カーブ(灯籠と鈴で知らせる)。[区間の始まり, 終わり, 曲がる向き(+1 右)] */
  fogCurves(): [number, number, number][] {
    return this.segments.filter(g => Math.abs(g.turn ?? 0) >= 40 && this.fogAt((g.from + g.to) / 2) > 0.3).map(g => [g.from, g.to, Math.sign(g.turn!)]);
  }
  /** トンネルの中か */
  inTunnel(s: number): boolean { const c = Math.floor(Math.max(0, Math.min(this.total, s))); return this.tn[c] > 0.5; }
  /** トンネルの区間 [入口, 出口] */
  tunnels(): [number, number][] {
    // 続いている区間は、1本のトンネルにまとめる
    const out: [number, number][] = [];
    for (const g of this.segments) {
      if (g.terrain !== 'tunnel') continue;
      const last = out[out.length - 1];
      if (last && last[1] === g.from) last[1] = g.to; else out.push([g.from, g.to]);
    }
    return out;
  }
  /** 空中で寄せる先の「ずれた線路」(いちばん新しく跳んだもの。まだなら、すぐ先のもの) */
  shiftGapNear(s: number): Gap | undefined {
    const near = this.gaps.filter(g => g.shift && g.from < s + 30 && g.to > s - 30);
    const passed = near.filter(g => g.from <= s + 3);
    return passed.length ? passed[passed.length - 1] : near[0];
  }
  /** 切れ目のすぐ手前(20m 以内)のジャンプ台 */
  rampBefore(g: Gap): Obstacle | undefined {
    return this.obstacles.find(o => o.kind === 'ramp' && o.s <= g.from && g.from - o.s <= 20);
  }
  gapAt(s: number): Gap | undefined { return this.gaps.find(g => s > g.from && s < g.to); }
  inGap(s: number): boolean { return this.gapAt(s) !== undefined; }
  nameAt(s: number): string {
    for (let i = this.segments.length - 1; i >= 0; i--) if (s >= this.segments[i].from && this.segments[i].name) return this.segments[i].name!;
    return '';
  }
  /**
   * s から dist 先までにある、こぶ(峠)。vLift=これより速いと浮く速さ、curveAfter=こぶの先(着地しそうな所)のいちばんきつい曲がり。
   * 浮くような、こぶが無ければ undefined。
   */
  crestAhead(s: number, dist: number, g = 16): { s: number; vLift: number; curveAfter: number } | undefined {
    let best: { s: number; vLift: number } | undefined;
    for (let d = 0; d <= dist; d += 1) {
      const bend = -this.pitchRate(s + d);
      if (bend < 0.004) { if (best) break; continue; }
      const vLift = Math.sqrt((g * Math.cos(this.lerp(this.pt, s + d))) / bend);
      if (!best || vLift < best.vLift) best = { s: s + d, vLift };
    }
    if (!best || best.vLift > 60) return undefined;
    return { ...best, curveAfter: this.sharpestAhead(best.s, 70) };
  }
  /** s から dist 先までで、いちばんきつい曲がり(符号つき)。 */
  sharpestAhead(s: number, dist: number): number {
    let best = 0;
    for (let d = 0; d <= dist; d += 2) { const c = this.lerp(this.cv, s + d); if (Math.abs(c) > Math.abs(best)) best = c; }
    return best;
  }
}
