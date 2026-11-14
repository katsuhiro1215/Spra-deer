// 3D走りゲームのコース定義(見た目に依存しない)。
// 前へ進む向きを s(メートル)、左右を x で表す。同じ設定(seed)なら必ず同じコースになる。

import { CRITTERS, type Behavior, type Effect } from './critters.ts';

export const ROAD_HALF = 3.6; // 参道・道路の幅の半分
export const PLAY_HALF = 3.0; // 鹿が動ける範囲の半分
export const COURSE_LENGTH = 1000; // 既定の長さ
/** ゴールの先、背景の建物(社殿・港)までの距離。 */
export const GOAL_GAP = 75;

export type ObstacleKind = 'hole' | 'poop' | 'fence' | 'stone' | 'deer' | 'puddle' | 'ice' | 'critter';

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
  trig?: number; // 突進をはじめる距離(プレイヤーがこの近さに来たら動き出す)
}

export interface Coin {
  id: number;
  s: number;
  x: number;
  y: number; // 地面からの高さ(ジャンプで取るコインは高い)
}

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

export interface Course {
  obstacles: Obstacle[];
  coins: Coin[];
  length: number;
  rules?: Rules;
  curve?: Curve;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 距離 s での、道の中心線の左右のずれ[m]。出だしとゴール前は、まっすぐ(0)。 */
export function roadX(course: { curve?: Curve; length: number }, s: number): number {
  const c = course.curve;
  if (!c) return 0;
  const a = 90; // ここからカーブがはじまる
  const b = course.length - 190; // ここから、まっすぐにもどる(ゴールの100m手前で、まっすぐ)
  const env = smooth(a, a + 120, s) * (1 - smooth(b, b + 90, s));
  return c.amp * env * Math.sin((2 * Math.PI * (s - a)) / c.wave);
}
/** 道の向き(進む向きが、まっすぐからどれだけ右へ曲がっているか。ラジアン)。 */
export function roadHeading(course: { curve?: Curve; length: number }, s: number): number {
  if (!course.curve) return 0;
  return Math.atan((roadX(course, s + 0.5) - roadX(course, s - 0.5)) / 1.0);
}
/** 道の曲がりぐあい(右へ曲がるほど正。1/半径[m]ぐらい)。 */
export function roadCurv(course: { curve?: Curve; length: number }, s: number): number {
  if (!course.curve) return 0;
  return roadX(course, s + 1) - 2 * roadX(course, s) + roadX(course, s - 1);
}

/** 各障害物の当たりの大きさ(半径)。 */
export const HIT_RADIUS: Record<ObstacleKind, number> = { hole: 0, poop: 0.6, fence: 0.35, stone: 0.85, deer: 0.8, puddle: 1.1, ice: 1.5, critter: 0.8 };
export const OBSTACLE_HEIGHT: Record<ObstacleKind, number> = { hole: 0, poop: 0.55, fence: 1.05, stone: 1.15, deer: 1.25, puddle: 0.3, ice: 0.3, critter: 1.2 };

const DEER_RANGE = (PLAY_HALF + 1.2) * 2;
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
 */
export function obstacleState(o: Obstacle, t: number, t0?: number): ObstacleState {
  if (o.kind === 'stone') {
    const a = t * o.freq + o.phase;
    return { x: o.x + o.amp * Math.sin(a), s: o.s, y: 0, dir: Math.cos(a) >= 0 ? 1 : -1 };
  }
  if (o.kind === 'deer') {
    const m = pingPong(t, o.freq, o.phase);
    return { x: m.x, s: o.s, y: 0, dir: m.dir };
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
  | 'critterSleep' | 'critterCross' | 'critterHop' | 'critterCharge';

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

  const run = (name: PatternName, s: number, p: number) => {
    switch (name) {
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
  while (s < endObstacles) {
    const p = s / length;
    const pool: PatternName[] = ['hole', 'poop', 'fenceGap', 'coinSnake', ...extra];
    if (p > 0.25) pool.push('stones', 'deerCross', ...extra);
    if (p > 0.5) pool.push('holePoop', 'fenceHole', 'stones', 'deerCross');
    let name = pool[Math.floor(rand() * pool.length)];
    if (name === prev) name = pool[Math.floor(rand() * pool.length)];
    // この面だけの罠は、運に任せず、中盤までに必ず1回は出す(練習にもなる)
    const missing = extra.filter((n) => !used.has(n));
    if (missing.length && p > 0.22) name = missing[0];
    prev = name;
    used.add(name);
    s = run(name, s, p) + Math.max(22, 38 - 14 * p - 6 * difficulty);
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
  return { obstacles, coins, length, rules: opts.rules, curve: opts.curve };
}
