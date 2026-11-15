// 3D走りゲームのコース定義(見た目に依存しない)。
// 前へ進む向きを s(メートル)、左右を x で表す。同じ設定(seed)なら必ず同じコースになる。

import { CRITTERS, type Behavior, type Effect } from './critters.ts';

export const ROAD_HALF = 3.6; // 参道・道路の幅の半分
export const PLAY_HALF = 3.0; // 鹿が動ける範囲の半分
export const COURSE_LENGTH = 1000; // 既定の長さ
/** ゴールの先、背景の建物(社殿・港)までの距離。 */
export const GOAL_GAP = 75;

export type ObstacleKind = 'hole' | 'poop' | 'fence' | 'stone' | 'deer' | 'puddle' | 'ice' | 'critter' | 'train' | 'bolt' | 'leaf' | 'fish' | 'sheet' | 'bomb' | 'bat';

/** 金魚: 左の水路(この位置)から、道を横切って右へ跳ぶ */
export const FISH_X0 = -(3.6 + 2.6);
export const FISH_X1 = 3.6 + 1.4;
/** 金魚が空中にいる時間[秒] */
export const FISH_FLY = 1.3;

/** つり橋の、落ちずに走れる幅の半分[m] */
export const BRIDGE_HALF = 1.9;
/** つり橋のゆれ(左右へ押す速さ[m/秒])。ゆっくりした揺れに、5秒ごとの突風が加わる */
export function bridgeSway(t: number): number {
  const k = Math.floor(t / 5);
  const u = t - k * 5;
  const gust = u < 1.2 ? 3.0 * Math.sin((Math.PI * u) / 1.2) * (k % 2 ? 1 : -1) : 0;
  return 1.5 * Math.sin(1.1 * t) + 0.9 * Math.sin(2.3 * t + 1) + gust;
}

/** 雷が落ちている時間[秒](この間に、その場所にいると当たる) */
export const BOLT_TIME = 0.45;
/** 電車の、道の前後方向の半分の幅[m] */
export const TRAIN_HALF_DEPTH = 1.6;

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  s: number; // 前後の位置(穴は手前の端。突進するものは、はじまりの位置)
  x: number; // 左右の中心(動くものは基準)
  len: number; // 穴の長さ
  halfW: number; // 柵・穴の幅の半分
  height: number; // これ以上の高さで跳べば越えられる
  amp: number; // 左右の振れ幅(転がる岩)
  freq: number; // 転がる岩=角速度 / 横切る=秒速 / 跳ねる=1秒あたりの回数 / 突進=秒速
  phase: number;
  // ---- 動物・モンスター(kind='critter') ----
  critter?: string; // キャラの名前(critters.ts)
  behavior?: Behavior; // 動き方
  effect?: Effect; // 当たったときの効果
  radius?: number; // 当たりの半径(無ければ、種類ごとの既定)
  trig?: number; // 動きはじめる距離(プレイヤーがこの近さに来たら、突進・電車・雷が動き出す)
  /** 見た目の種類(crossing=踏切の遮断機。当たりは柵と同じ) */
  deco?: 'crossing';
}
// 電車(kind='train'): s=線路の位置、freq=電車の秒速、amp=電車の長さ、phase=走る向き(+1=右へ)
// 雷(kind='bolt'): s,x=落ちる場所、freq=予告(光る輪)の秒数。予告のあと BOLT_TIME の間だけ当たる
// ラムガの子分(ストーリーの敵。設計書 25-7):
//  爆弾(kind='bomb'): s=落ちる所、x=投げる子分の立つ位置(道の外)、freq=投げてから落ちるまでの秒数。
//    投げた瞬間の鹿の左右の位置をねらう(赤い輪)。落ちてから BOLT_TIME の間だけ当たる。跳んでもよけられない
//  こうもり(kind='bat'): s=鹿とすれちがう所、freq=急降下の秒数。動き出した瞬間の鹿の左右の位置へ降りてくる。
//    横へよけるか、ジャンプでかわす

export interface Coin {
  id: number;
  s: number;
  x: number;
  y: number; // 地面からの高さ(ジャンプで取るコインは高い)
  /**
   * potion=回復薬(ハートが1つふえる)/gold=ゴールドコイン(少しだけ。取りにくい所)/
   * premium=プレミアムコイン(1つの面に1枚だけ。とても取りにくい所)。無ければ、ふつうのコイン(シルバー)
   */
  kind?: 'potion' | 'gold' | 'premium';
}

/** ゴールドコインの数(コースの長さで決める。1000mで5枚、2400mで7枚) */
export const goldCount = (length: number): number => 3 + Math.floor(length / 500);

/** 走りの手ごたえ。面ごとに変える(雨や雪では、左右がすべる)。 */
export interface Rules {
  speed0: number; // 出だしの秒速
  speed1: number; // ゴール手前の秒速
  steerAccel: number; // 左右の動きだしのよさ(小さいほどすべる)
  steerSpeed: number; // 左右の最高速度
}
export const DEFAULT_RULES: Rules = { speed0: 13, speed1: 20, steerAccel: 42, steerSpeed: 6.8 };

/** 曲がる道。道の中心線の左右のずれを、sin の波(振れ幅 amp[m]・波長 wave[m])で表す。 */
export interface Curve {
  amp: number;
  wave: number;
}

/** 坂。コース全体に対する割合 at(0〜1) の所で、道の高さが h[m]。間は、なめらかにつなぐ。 */
export interface HillPoint {
  at: number;
  h: number;
}

/** ジャンプ台。走って登ると、先(s)から体が飛び出す。s=先の位置、len=登る長さ、h=高さ */
export interface Bump {
  s: number;
  len: number;
  h: number;
}

export interface Course {
  obstacles: Obstacle[];
  coins: Coin[];
  length: number;
  rules?: Rules;
  curve?: Curve;
  /** この割合(0〜1)を過ぎると、罠がぐっとふえる(大仏の目が光ったあと) */
  wake?: number;
  /** 坂(無ければ、平ら) */
  hills?: HillPoint[];
  /** ジャンプ台 */
  bumps?: Bump[];
  /** 道がまっすぐな区間(s の範囲)。つり橋など */
  straights?: [number, number][];
  /** つり橋の区間(s の範囲)。幅がせまく、左右にゆれる */
  bridge?: { from: number; to: number };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Curvy = { curve?: Curve; length: number; straights?: [number, number][] };

/** 距離 s での、道の中心線の左右のずれ[m]。出だしとゴール前は、まっすぐ(0)。 */
export function roadX(course: Curvy, s: number): number {
  const c = course.curve;
  if (!c) return 0;
  const a = 90; // ここからカーブがはじまる
  const b = course.length - 190; // ここから、まっすぐにもどる(ゴールの100m手前で、まっすぐ)
  let env = smooth(a, a + 120, s) * (1 - smooth(b, b + 90, s));
  // まっすぐな区間(つり橋など)では、ずれを0にもどす(手前80mで、なめらかにつなぐ)
  for (const [p, q] of course.straights ?? []) {
    if (s > p - 80 && s < q + 80) {
      const w = smooth(p - 80, p, s) * (1 - smooth(q, q + 80, s));
      env *= 1 - w;
    }
  }
  return c.amp * env * Math.sin((2 * Math.PI * (s - a)) / c.wave);
}
/** 道の向き(進む向きが、まっすぐからどれだけ右へ曲がっているか。ラジアン)。 */
export function roadHeading(course: Curvy, s: number): number {
  if (!course.curve) return 0;
  return Math.atan((roadX(course, s + 0.5) - roadX(course, s - 0.5)) / 1.0);
}
/** 道の曲がりぐあい(右へ曲がるほど正。1/半径[m]ぐらい)。 */
export function roadCurv(course: Curvy, s: number): number {
  if (!course.curve) return 0;
  return roadX(course, s + 1) - 2 * roadX(course, s) + roadX(course, s - 1);
}

type Hilly = { hills?: HillPoint[]; bumps?: Bump[]; length: number };

/** 坂だけの高さ(ジャンプ台を除く。地面・景色の高さ)。 */
export function hillY(course: Hilly, s: number): number {
  const hs = course.hills;
  if (!hs || !hs.length) return 0;
  const L = course.length;
  if (s <= hs[0].at * L) return hs[0].h;
  for (let i = 1; i < hs.length; i++) {
    const a = hs[i - 1];
    const b = hs[i];
    if (s <= b.at * L) return a.h + (b.h - a.h) * smooth(a.at * L, b.at * L, s);
  }
  return hs[hs.length - 1].h;
}

/** ジャンプ台の、先から落ちる面の長さ[m]。 */
export const RAMP_DROP = 2.4;

/** ジャンプ台の高さ。だんだん急になって先(s)で最も高く、その先はすぐ落ちる。 */
export function bumpY(course: Hilly, s: number): number {
  const bs = course.bumps;
  if (!bs) return 0;
  let y = 0;
  for (const b of bs) {
    const u = s - b.s;
    if (u > -b.len && u <= 0) y += b.h * ((u + b.len) / b.len) ** 2;
    else if (u > 0 && u < RAMP_DROP) y += b.h * (1 - smooth(0, RAMP_DROP, u));
  }
  return y;
}

/** 距離 s での、道の高さ[m](坂とこぶ)。 */
export function roadY(course: Hilly, s: number): number {
  return hillY(course, s) + bumpY(course, s);
}

/** 坂の傾き(登りが正)。こぶは含めない(こぶで速さは変わらない)。 */
export function roadGrade(course: Hilly, s: number): number {
  if (!course.hills) return 0;
  return (hillY(course, s + 0.5) - hillY(course, s - 0.5)) / 1.0;
}

/** 坂で、速さが変わる強さ(登り10%で約2割おそく、下り10%で約2割速く) */
export const SLOPE_GAIN = 2.2;
/** 坂での速さの倍率(登りはおそく、下りは速く)。 */
export function slopeMul(course: Hilly, s: number): number {
  if (!course.hills) return 1;
  return Math.max(0.7, Math.min(1.35, 1 - SLOPE_GAIN * roadGrade(course, s)));
}

/** 道の高さの曲がりぐあい(2回微分)。てっぺんでは負。体が浮くかどうかの計算に使う。 */
export function roadBend(course: Hilly, s: number): number {
  if (!course.hills && !course.bumps) return 0;
  const h = 0.25;
  return (roadY(course, s + h) - 2 * roadY(course, s) + roadY(course, s - h)) / (h * h);
}

/** 各障害物の当たりの大きさ(半径)。 */
export const HIT_RADIUS: Record<ObstacleKind, number> = { hole: 0, poop: 0.6, fence: 0.35, stone: 0.85, deer: 0.8, puddle: 1.1, ice: 1.5, critter: 0.8, train: 0, bolt: 1.35, leaf: 1.25, fish: 0.5, sheet: 1.2, bomb: 1.3, bat: 0.75 };
export const OBSTACLE_HEIGHT: Record<ObstacleKind, number> = { hole: 0, poop: 0.55, fence: 1.05, stone: 1.15, deer: 1.25, puddle: 0.3, ice: 0.3, critter: 1.2, train: 99, bolt: 99, leaf: 0.3, fish: 99, sheet: 0.3, bomb: 99, bat: 1.0 };
/** こうもりが、急降下をはじめる所(すれちがう所の何m先か) */
export const BAT_AHEAD = 30;

const DEER_RANGE = (PLAY_HALF + 1.2) * 2;
/** 電車が動き出す位置(道の中心から、電車の先頭まで)[m] */
const TRAIN_START = 60;
const HOP_HEIGHT = 1.7;

export const obstacleRadius = (o: Obstacle): number => o.radius ?? HIT_RADIUS[o.kind];

export interface ObstacleState {
  x: number;
  s: number; // 前後の位置(突進するものは、近づいてくる)
  y: number; // 地面からの高さ(跳ねるもの)
  dir: number; // 動いている向き(+1=右, -1=左, 0=動かない)
}

/** 往復する動き(横切る鹿・動物)。 */
function pingPong(t: number, speed: number, phase: number): { x: number; dir: number } {
  const R = DEER_RANGE;
  const p = (((t * speed + phase) % (2 * R)) + 2 * R) % (2 * R);
  const xx = p < R ? p : 2 * R - p;
  return { x: xx - R / 2, dir: p < R ? 1 : -1 };
}

/**
 * 時刻 t での障害物の位置。突進する動物は、動き出した時刻 t0 を渡す(まだなら、渡さない)。
 * 爆弾・こうもりは、ねらった左右の位置 aim も渡す。
 */
export function obstacleState(o: Obstacle, t: number, t0?: number, aim?: number): ObstacleState {
  if (o.kind === 'bat') {
    // 動き出すまでは見えない(y<0)。前の高い所から、ねらった位置へ降りてきて、すれちがったあとは上へ
    if (t0 === undefined) return { x: 0, s: o.s + BAT_AHEAD, y: -99, dir: 0 };
    const u = (t - t0) / o.freq;
    const x = aim ?? o.x;
    if (u <= 1) return { x, s: o.s + BAT_AHEAD * (1 - u), y: 0.9 + 5 * (1 - u) * (1 - u), dir: 0 };
    return { x, s: o.s - BAT_AHEAD * 0.6 * (u - 1), y: 0.9 + 4 * (u - 1) * (u - 1), dir: 0 };
  }
  if (o.kind === 'bomb') return { x: aim ?? o.x, s: o.s, y: 0, dir: 0 };
  if (o.kind === 'stone') {
    const a = t * o.freq + o.phase;
    return { x: o.x + o.amp * Math.sin(a), s: o.s, y: 0, dir: Math.cos(a) >= 0 ? 1 : -1 };
  }
  if (o.kind === 'deer') {
    const m = pingPong(t, o.freq, o.phase);
    return { x: m.x, s: o.s, y: 0, dir: m.dir };
  }
  if (o.kind === 'fish') {
    // 金魚: freq 秒ごとに、水路から跳び出して、道を横切る(amp=いちばん高い所)。水の中では見えない
    const p = (((t + o.phase) % o.freq) + o.freq) % o.freq;
    const u = p / FISH_FLY;
    if (u > 1) return { x: FISH_X0, s: o.s, y: -9, dir: 0 };
    return { x: FISH_X0 + (FISH_X1 - FISH_X0) * u, s: o.s, y: 4 * o.amp * u * (1 - u), dir: 1 };
  }
  if (o.kind === 'train') {
    // 動き出すまでは、ずっと遠く(見えない)。動き出すと、片側から道を横切っていく
    if (t0 === undefined) return { x: -o.phase * 999, s: o.s, y: 0, dir: 0 };
    return { x: o.phase * (-TRAIN_START - o.amp / 2 + o.freq * (t - t0)), s: o.s, y: 0, dir: o.phase };
  }
  if (o.kind === 'critter') {
    switch (o.behavior) {
      case 'cross': {
        const m = pingPong(t, o.freq, o.phase);
        return { x: m.x, s: o.s, y: 0, dir: m.dir };
      }
      case 'hop':
        return { x: o.x, s: o.s, y: HOP_HEIGHT * Math.abs(Math.sin(Math.PI * (t * o.freq + o.phase))), dir: 0 };
      case 'charge': {
        const run = t0 === undefined ? 0 : Math.max(0, t - t0);
        return { x: o.x + 0.5 * Math.sin(t * 2.2 + o.phase), s: o.s - o.freq * run, y: 0, dir: 0 };
      }
      default:
        break;
    }
  }
  return { x: o.x, s: o.s, y: 0, dir: 0 };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type PatternName =
  | 'hole' | 'poop' | 'fenceGap' | 'stones' | 'deerCross' | 'holePoop' | 'fenceHole' | 'coinSnake' | 'puddle' | 'ice'
  | 'critterSleep' | 'critterCross' | 'critterHop' | 'critterCharge' | 'ramp' | 'crossing' | 'thunder'
  | 'leafPile' | 'goldfish' | 'hanami' | 'minionBomb' | 'minionBat';

export interface CourseOptions {
  seed?: number;
  length?: number;
  /** 0〜1。大きいほど、仕掛けの間隔がつまる。 */
  difficulty?: number;
  /** この面だけの罠(雨=みずたまり、雪=こおり、動物の罠など)。 */
  extra?: PatternName[];
  /** この面に出る動物・モンスター(critters.ts の名前)。critter〜の罠が使う。 */
  critters?: string[];
  /** 最初に順番に出す仕掛け(練習用)。 */
  opening?: PatternName[];
  rules?: Rules;
  /** 曲がる道(無ければ、まっすぐ) */
  curve?: Curve;
  /** 回復薬を置く場所(コース全体に対する割合 0〜1) */
  potions?: number[];
  /** この割合を過ぎると、罠がぐっとふえる(大仏の目が光ったあと) */
  wake?: number;
  /** 坂(無ければ、平ら) */
  hills?: HillPoint[];
  /** この割合より先でだけ出す罠(例: 踏切は、街に入ってから) */
  after?: Partial<Record<PatternName, number>>;
  /** つり橋の区間(コース全体に対する割合) */
  bridge?: { from: number; to: number };
  /** 罠を置かない所(割合。チェックポイント: ここから再スタートするので、すぐ先に罠を置かない) */
  safe?: number[];
}

export function buildCourse(opts: CourseOptions = {}): Course {
  const seed = opts.seed ?? 20261114;
  const length = opts.length ?? COURSE_LENGTH;
  const difficulty = opts.difficulty ?? 0;
  const extra = opts.extra ?? [];
  const rand = mulberry32(seed);
  const obstacles: Obstacle[] = [];
  const coins: Coin[] = [];
  let id = 0;
  const add = (o: Partial<Obstacle> & Pick<Obstacle, 'kind' | 's'>) => {
    obstacles.push({ id: id++, x: 0, len: 0, halfW: 0, height: OBSTACLE_HEIGHT[o.kind], amp: 0, freq: 0, phase: 0, ...o });
  };
  const coin = (s: number, x: number, y = 0.75) => coins.push({ id: id++, s, x, y });
  const line = (s: number, x: number, n: number, step = 2.2, y = 0.75) => {
    for (let i = 0; i < n; i++) coin(s + i * step, x, y);
  };
  const sign = () => (rand() < 0.5 ? -1 : 1);

  // 各パターンは置いた終わりの位置(s)を返す
  const holePattern = (s: number, p: number) => {
    const len = 4.8 + p * 1.6;
    add({ kind: 'hole', s, len, halfW: ROAD_HALF });
    line(s - 11, 0, 3, 2.2);
    for (let k = 0; k < 5; k++) {
      const u = k / 4;
      coin(s - 0.8 + u * (len + 1.6), 0, 0.95 + 0.9 * Math.sin(Math.PI * u));
    }
    return s + len + 2;
  };
  const poopPattern = (s: number) => {
    const f = sign();
    const xs = [-0.3, 1.3, -1.2];
    xs.forEach((x, i) => add({ kind: 'poop', s: s + i * 7.5, x: x * f }));
    coin(s + 3.7, -1.6 * f);
    coin(s + 4.7, -1.5 * f);
    coin(s + 11.2, 0.4 * f);
    coin(s + 12.2, 0.2 * f);
    line(s + 17, -0.2 * f, 3, 2.0);
    return s + 18;
  };
  const fenceGapPattern = (s: number) => {
    const gapX = (rand() * 2 - 1) * 2.0;
    const gapHalf = 1.15;
    const l0 = -ROAD_HALF;
    const l1 = gapX - gapHalf;
    const r0 = gapX + gapHalf;
    const r1 = ROAD_HALF;
    add({ kind: 'fence', s, x: (l0 + l1) / 2, halfW: (l1 - l0) / 2 });
    add({ kind: 'fence', s, x: (r0 + r1) / 2, halfW: (r1 - r0) / 2 });
    line(s - 8, gapX, 4, 2.0);
    coin(s, gapX - 2.6 > -ROAD_HALF ? gapX - 2.4 : gapX + 2.4, 1.6);
    return s + 3;
  };
  const stonesPattern = (s: number) => {
    for (let i = 0; i < 2; i++) {
      add({ kind: 'stone', s: s + i * 11, x: 0, amp: 2.3, freq: 1.5 + rand() * 0.5, phase: rand() * Math.PI * 2 });
      coin(s + i * 11, 0, 1.55);
    }
    line(s + 18, 0, 3, 2.0);
    return s + 20;
  };
  const deerPattern = (s: number) => {
    add({ kind: 'deer', s, freq: 3.2 + rand() * 0.8, phase: rand() * DEER_RANGE * 2 });
    line(s - 7, 0, 3, 2.2);
    coin(s, 0, 1.7);
    return s + 4;
  };
  const holePoopPattern = (s: number, p: number) => {
    const end = holePattern(s, p);
    const f = sign();
    add({ kind: 'poop', s: end + 8, x: 0.4 * f });
    add({ kind: 'poop', s: end + 15, x: -1.1 * f });
    line(end + 21, 0.5 * f, 3, 2.0);
    return end + 22;
  };
  const fenceHolePattern = (s: number, p: number) => {
    add({ kind: 'fence', s, x: 0, halfW: ROAD_HALF });
    coin(s, 0, 1.55);
    line(s - 8, 0, 3, 2.2);
    return holePattern(s + 19, p);
  };
  const snakePattern = (s: number) => {
    const f = sign();
    for (let i = 0; i < 12; i++) coin(s + i * 2.0, Math.sin(i * 0.7) * 2.2 * f);
    return s + 24;
  };
  // みずたまり(雨): ふむと、おそくなる。広くて、よけやすい
  const puddlePattern = (s: number) => {
    const f = sign();
    const xs = [-1.5, 1.1, -0.2];
    xs.forEach((x, i) => add({ kind: 'puddle', s: s + i * 7, x: x * f }));
    line(s - 6, 0.2 * f, 3, 2.0);
    coin(s + 3.5, 2.2 * f);
    coin(s + 10.5, -2.2 * f);
    return s + 16;
  };
  // こおり(雪): ふむと、しばらく左右がきかずに、すべる
  const icePattern = (s: number) => {
    const f = sign();
    add({ kind: 'ice', s, x: -1.0 * f });
    add({ kind: 'ice', s: s + 10, x: 1.2 * f });
    line(s - 7, 0.3 * f, 3, 2.0);
    coin(s + 5, 0.2 * f, 1.5);
    line(s + 14, -0.4 * f, 3, 2.0);
    return s + 16;
  };

  // ---- 動物・モンスターの罠 ----
  const critters = opts.critters ?? [];
  const pick = () => critters[Math.floor(rand() * critters.length)] ?? 'fox';
  const addCritter = (key: string, behavior: Behavior, o: Partial<Obstacle> & Pick<Obstacle, 's'>) => {
    const d = CRITTERS[key];
    add({ kind: 'critter', critter: key, behavior, effect: d.effect, radius: d.r, height: d.height, ...o });
  };
  // 寝ている: 道ばたでぐっすり。1匹なら避けるだけ、2匹なら、すき間を通る
  const critterSleepPattern = (s: number) => {
    if (rand() < 0.45) {
      const x = (rand() * 2 - 1) * 2.0;
      addCritter(pick(), 'sleep', { s, x });
      line(s - 8, x > 0 ? -1.2 : 1.2, 3, 2.2);
      coin(s, x, 1.9);
      return s + 3;
    }
    const gapX = (rand() * 2 - 1) * 1.0;
    const a = pick();
    const b = pick();
    addCritter(a, 'sleep', { s, x: gapX - (1.25 + CRITTERS[a].r) });
    addCritter(b, 'sleep', { s: s + 1.5, x: gapX + (1.25 + CRITTERS[b].r) });
    line(s - 8, gapX, 4, 2.0);
    coin(s, gapX, 1.9);
    return s + 4;
  };
  // 横切る: 左右に歩く。タイミングを見て、通るか跳ぶ
  const critterCrossPattern = (s: number) => {
    addCritter(pick(), 'cross', { s, freq: 3.0 + rand() * 1.2, phase: rand() * DEER_RANGE * 2 });
    line(s - 7, 0, 3, 2.2);
    coin(s, 0, 1.9);
    return s + 4;
  };
  // 跳ねる: 2匹が交互にぴょんぴょん。地面にいる側に当たるので、跳んでいる側を通る
  const critterHopPattern = (s: number) => {
    const a = pick();
    addCritter(a, 'hop', { s, x: -0.8, freq: 0.7, phase: 0 });
    addCritter(pick(), 'hop', { s, x: 0.9, freq: 0.7, phase: 0.5 });
    line(s - 8, 0, 3, 2.2);
    coin(s + 1, -2.5);
    coin(s + 1, 2.6);
    return s + 4;
  };
  // 突進: 近づくと、正面から走ってくる。よけるか、跳ぶ
  const critterChargePattern = (s: number) => {
    const x = (rand() * 2 - 1) * 2.0;
    addCritter(pick(), 'charge', { s: s + 38, x, freq: 8 + rand() * 2, trig: 38, phase: rand() * 6 });
    line(s + 10, x > 0 ? -1.4 : 1.4, 4, 2.2);
    return s + 42;
  };

  // ジャンプ台: 登ると、先から飛び出す。空中のコインを取れる(跳ぶと、もっと高く飛べる)
  const bumps: Bump[] = [];
  const rampPattern = (s: number) => {
    const lip = s + 8;
    bumps.push({ s: lip, len: 9, h: 1.8 });
    line(s - 7, 0, 3, 2.2);
    // 飛び出したときに通る高さ(速さ13〜24m/sで確かめた)。台の先で跳ぶと、上の2枚も取れる
    [[1.5, 2.2], [3, 3.0], [4.5, 3.2], [6, 3.1], [7.5, 2.9]].forEach(([ds, y]) => coin(lip + ds, 0, y));
    coin(lip + 6, 0, 6.0);
    coin(lip + 9, 0, 6.6);
    return lip + 30; // 大ジャンプの着地点まで、罠を置かない
  };

  // その場所での、だいたいの走る速さ(電車・雷の時間合わせに使う。ぶつかって遅くなると、安全側にずれる)
  const rules = opts.rules ?? DEFAULT_RULES;
  const hilly = { hills: opts.hills, length };
  const estSpeed = (s: number) => {
    // 手前80mの坂の分も見込む(下り坂では速く着く)
    let m = 0;
    for (let k = 0; k < 9; k++) m += slopeMul(hilly, s - k * 10);
    return (rules.speed0 + (rules.speed1 - rules.speed0) * Math.min(1, s / length)) * Math.max(1, m / 9);
  };

  // 踏切: 遮断機(すき間あり)と、目の前を通りすぎる電車。電車は、鹿が着く少し前に通りすぎる
  const crossingPattern = (s: number) => {
    const track = s + 8;
    const len = 34;
    const tv = 24;
    const dir = sign();
    const clearT = (TRAIN_START + len + ROAD_HALF + 1) / tv; // 動き出してから、最後尾が道をぬけるまで
    add({ kind: 'train', s: track, freq: tv, amp: len, phase: dir, trig: estSpeed(track) * (clearT + 0.9) });
    const gapX = (rand() * 2 - 1) * 1.6;
    const gapHalf = 1.2;
    const bs = track - 3.2;
    add({ kind: 'fence', s: bs, x: (-ROAD_HALF + gapX - gapHalf) / 2, halfW: (gapX - gapHalf + ROAD_HALF) / 2, deco: 'crossing' });
    add({ kind: 'fence', s: bs, x: (gapX + gapHalf + ROAD_HALF) / 2, halfW: (ROAD_HALF - gapX - gapHalf) / 2, deco: 'crossing' });
    line(bs - 9, gapX, 4, 2.0);
    coin(bs, gapX, 1.7);
    line(track + 3, gapX * 0.5, 3, 2.0);
    return track + 8;
  };
  // 雷: 光る輪のあとに、落ちてくる。輪のない側へよける(跳んでもよけられない)
  const thunderPattern = (s: number) => {
    const f = sign();
    for (let k = 0; k < 3; k++) {
      const bs = s + k * 14;
      const x = (k % 2 ? -1.6 : 1.6) * f;
      const warn = 1.5;
      // 輪が光ってから、鹿が着く少し前に落ちる
      add({ kind: 'bolt', s: bs, x, freq: warn, trig: estSpeed(bs) * (warn + 0.12), radius: HIT_RADIUS.bolt });
      coin(bs, -x * 0.95);
    }
    line(s + 36, 0, 3, 2.0);
    return s + 40;
  };

  // 落ち葉の山(紅葉): ふむと、少しすべる(0.8秒曲がれない)
  const leafPattern = (s: number) => {
    const f = sign();
    [-1.4, 1.3, -0.1].forEach((x, i) => add({ kind: 'leaf', s: s + i * 8, x: x * f }));
    line(s - 6, 0.4 * f, 3, 2.0);
    coin(s + 4, 1.9 * f);
    coin(s + 12, -1.9 * f);
    return s + 20;
  };
  // 金魚(水路のある道): 左の水路から、道を横切って跳ぶ。低い所で当たる(跳べばくぐれる)
  const goldfishPattern = (s: number) => {
    for (let k = 0; k < 2; k++) add({ kind: 'fish', s: s + k * 9, freq: 2.2 + rand() * 0.4, phase: rand() * 3, amp: 1.75 });
    line(s - 6, 0, 3, 2.2);
    coin(s + 4.5, 0, 1.6);
    return s + 14;
  };
  // 花見のシート: ふむと、コインを落とす。すき間を通る
  const hanamiPattern = (s: number) => {
    const f = sign();
    add({ kind: 'sheet', s, x: 1.5 * f });
    add({ kind: 'sheet', s: s + 9, x: -1.5 * f });
    coin(s, -1.6 * f);
    coin(s + 9, 1.6 * f);
    line(s + 14, 0, 3, 2.0);
    return s + 18;
  };

  // ラムガの子分: 爆弾を投げる(2発)。投げた瞬間の鹿の位置に、赤い輪が出て落ちる
  const minionBombPattern = (s: number) => {
    const side = sign();
    for (let k = 0; k < 2; k++) {
      const bs = s + 12 + k * 18;
      const fly = 1.3;
      add({ kind: 'bomb', s: bs, x: side * (k % 2 ? -1 : 1) * (ROAD_HALF + 1.6), freq: fly, trig: estSpeed(bs) * (fly + 0.1), radius: HIT_RADIUS.bomb, height: 99 });
    }
    line(s + 48, 0, 3, 2.2);
    return s + 54;
  };
  // ラムガの子分: こうもりが2匹、鹿の位置へ急降下
  const minionBatPattern = (s: number) => {
    for (let k = 0; k < 2; k++) {
      const bs = s + 14 + k * 20;
      const dive = 1.15;
      add({ kind: 'bat', s: bs, x: 0, freq: dive, trig: estSpeed(bs) * (dive + 0.05) + 1, radius: HIT_RADIUS.bat, height: OBSTACLE_HEIGHT.bat });
      coin(bs, (k % 2 ? 1 : -1) * 2.3);
    }
    line(s + 50, 0, 3, 2.2);
    return s + 56;
  };

  const run = (name: PatternName, s: number, p: number) => {
    switch (name) {
      case 'minionBomb': return minionBombPattern(s);
      case 'minionBat': return minionBatPattern(s);
      case 'leafPile': return leafPattern(s);
      case 'goldfish': return goldfishPattern(s);
      case 'hanami': return hanamiPattern(s);
      case 'crossing': return crossingPattern(s);
      case 'thunder': return thunderPattern(s);
      case 'ramp': return rampPattern(s);
      case 'critterSleep': return critterSleepPattern(s);
      case 'critterCross': return critterCrossPattern(s);
      case 'critterHop': return critterHopPattern(s);
      case 'critterCharge': return critterChargePattern(s);
      case 'hole': return holePattern(s, p);
      case 'poop': return poopPattern(s);
      case 'fenceGap': return fenceGapPattern(s);
      case 'stones': return stonesPattern(s);
      case 'deerCross': return deerPattern(s);
      case 'holePoop': return holePoopPattern(s, p);
      case 'fenceHole': return fenceHolePattern(s, p);
      case 'coinSnake': return snakePattern(s);
      case 'puddle': return puddlePattern(s);
      case 'ice': return icePattern(s);
    }
  };

  line(18, 0, 6, 2.4);
  let s = 62;
  const opening: PatternName[] = opts.opening ?? ['hole', 'coinSnake', 'poop', 'fenceGap'];
  for (const name of opening) s = run(name, s, 0) + 30;

  let prev: PatternName = opening[opening.length - 1] ?? 'fenceGap';
  const used = new Set<PatternName>(opening);
  const endObstacles = length - (critters.length ? 100 : 75); // 突進する動物は手前から走ってくるので、ゴールから離す(3-1は従来どおり)
  const br = opts.bridge ? { from: opts.bridge.from * length, to: opts.bridge.to * length } : undefined;
  const safe = (opts.safe ?? []).map((f) => f * length);
  while (s < endObstacles) {
    const z = safe.find((c) => s + 46 > c - 8 && s < c + 40);
    if (z !== undefined) {
      // チェックポイント: 手前と、再スタートしてすぐの所には、罠を置かない(コインだけ)
      line(z + 6, 0, 6, 2.4);
      s = z + 40;
      continue;
    }
    if (br && s + 46 > br.from && s < br.to) {
      // つり橋: ほかの罠は置かず、板のぬけた所(跳びこえる)だけ。ゆれに耐えて渡る
      line(br.from - 2, 0, 6, 2.4);
      for (let q = br.from + 22; q < br.to - 26; q += 34 + rand() * 12) {
        add({ kind: 'hole', s: q, len: 3.2, halfW: BRIDGE_HALF });
        for (let k = 0; k < 4; k++) coin(q - 0.6 + (k * 4.4) / 3, 0, 1.0 + 0.8 * Math.sin((Math.PI * k) / 3));
        line(q + 8, 0, 3, 2.4);
      }
      s = br.to + 24;
      continue;
    }
    const p = s / length;
    const awake = opts.wake !== undefined && p >= opts.wake; // 大仏の目が光ったあと
    const after = opts.after ?? {};
    const ok = (n: PatternName) => p >= (after[n] ?? 0);
    const ex = extra.filter(ok);
    const pool: PatternName[] = ['hole', 'poop', 'fenceGap', 'coinSnake', ...ex];
    if (p > 0.25) pool.push('stones', 'deerCross', ...ex);
    if (p > 0.5) pool.push('holePoop', 'fenceHole', 'stones', 'deerCross');
    if (awake) pool.push(...ex, ...ex, 'holePoop', 'fenceHole');
    let name = pool[Math.floor(rand() * pool.length)];
    if (name === prev) name = pool[Math.floor(rand() * pool.length)];
    // この面だけの罠は、運に任せず、中盤までに必ず1回は出す(練習にもなる)
    const missing = ex.filter((n) => !used.has(n));
    if (missing.length && p > 0.22) name = missing[0];
    prev = name;
    used.add(name);
    // 近づくほど、罠の間隔がつまる(目が光ったあとは、さらに)
    s = run(name, s, p) + Math.max(awake ? 14 : 22, 38 - 14 * p - 6 * difficulty - (awake ? 10 : 0));
  }

  // ゴール前のコインシャワー(障害物なし)
  const shower = length - 50;
  for (let i = 0; i < 18; i++) {
    const ss = shower + i * 2.6;
    coin(ss, -2.2);
    coin(ss, 0, 0.75 + 0.8 * Math.sin(i * 0.5));
    coin(ss, 2.2);
  }
  obstacles.sort((a, b) => a.s - b.s);
  // 回復薬: 道の中央に1つ。罠のすぐそばは避ける
  for (const f of opts.potions ?? []) {
    let ps = Math.round(length * f);
    while (obstacles.some((o) => Math.abs(o.s - ps) < 16 + o.len)) ps += 6;
    coins.push({ id: id++, s: ps, x: 0, y: 1.1, kind: 'potion' });
  }
  placeSpecialCoins(coins, obstacles, bumps, length, () => id++);
  const course: Course = { obstacles, coins, length, rules: opts.rules, curve: opts.curve, wake: opts.wake };
  if (opts.hills) course.hills = opts.hills;
  if (bumps.length) course.bumps = bumps;
  if (br) {
    course.bridge = br;
    course.straights = [[br.from - 10, br.to + 10]];
  }
  return course;
}

/**
 * ゴールド・プレミアムのコインを置く(設計書 25-3・26-3)。
 * - ゴールド: コースを goldCount 等分し、それぞれで「いちばん取りにくい」ふつうのコイン(高い・端)を金にする
 * - プレミアム: 1枚だけ。中盤〜終盤のジャンプ台があれば、大ジャンプでしか届かない高い所のコイン(先っぽ+9m・高さ6.6m)。
 *   無ければ、終盤の穴の上の、高くて端に寄った所(穴を跳ぶ、いちばん高い所でだけ届く)
 */
function placeSpecialCoins(coins: Coin[], obstacles: Obstacle[], bumps: Bump[], length: number, nextId: () => number): void {
  const isPlain = (c: Coin) => c.kind === undefined;
  // プレミアム
  const lo = length * 0.35;
  const hi = length * 0.92;
  const ramps = bumps.filter((b) => b.s > lo && b.s < hi);
  let premium: Coin | undefined;
  // まんなかのジャンプ台から順に、大ジャンプのコインがある台を探す
  const order = ramps.map((_, i) => i).sort((a, b) => Math.abs(a - (ramps.length - 1) / 2) - Math.abs(b - (ramps.length - 1) / 2));
  for (const i of order) {
    const b = ramps[i];
    premium = coins.find((c) => isPlain(c) && Math.abs(c.s - (b.s + 9)) < 0.01 && c.y > 6);
    if (premium) break;
  }
  if (!premium) {
    const holes = obstacles.filter((o) => o.kind === 'hole' && o.s > length * 0.5 && o.s < hi && o.halfW > 2);
    const h = holes[Math.floor(holes.length / 2)];
    if (h) {
      const s = h.s + h.len / 2;
      // 穴の上のふつうのコインは、まぎらわしいので消す
      for (let i = coins.length - 1; i >= 0; i--) if (isPlain(coins[i]) && Math.abs(coins[i].s - s) < 2.5) coins.splice(i, 1);
      // 高さ3.2m・端に寄せる: 穴を跳ぶとき、跳ぶ場所(いちばん高い所が穴の真ん中)と左右の位置の両方が合ったときだけ届く
      premium = { id: nextId(), s, x: holes.length % 2 ? 2.2 : -2.2, y: 3.2 };
      coins.push(premium);
    }
  }
  if (!premium) {
    // ジャンプ台も穴もない: 終盤の、罠から離れた所の上の高い所(跳んで、いちばん高い所でだけ届く)
    for (let q = Math.round(length * 0.75); q < hi; q += 4) {
      if (obstacles.some((o) => Math.abs(o.s - q) < 12 + o.len)) continue;
      for (let i = coins.length - 1; i >= 0; i--) if (isPlain(coins[i]) && Math.abs(coins[i].s - q) < 2.5) coins.splice(i, 1);
      premium = { id: nextId(), s: q, x: q % 8 < 4 ? 2.2 : -2.2, y: 3.2 };
      coins.push(premium);
      break;
    }
  }
  if (premium) premium.kind = 'premium';
  // ゴールド(ゴール前のコインシャワーと、出だしは除く)
  const from = 60;
  const to = length - 60;
  const n = goldCount(length);
  for (let k = 0; k < n; k++) {
    const a = from + ((to - from) * k) / n;
    const b = from + ((to - from) * (k + 1)) / n;
    let best: Coin | undefined;
    let score = -1;
    for (const c of coins) {
      if (!isPlain(c) || c.s < a || c.s >= b) continue;
      if (premium && Math.abs(c.s - premium.s) < 6) continue;
      const sc = c.y * 2 + Math.abs(c.x) * 0.8;
      if (sc > score) {
        score = sc;
        best = c;
      }
    }
    if (best) best.kind = 'gold';
  }
}
