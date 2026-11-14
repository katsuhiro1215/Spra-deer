// 「春日大社へ」お試しコースの定義(見た目に依存しない)。
// 前へ進む向きを s(メートル)、左右を x で表す。同じ種(seed)なら必ず同じコースになる。

export const ROAD_HALF = 3.6; // 参道の幅の半分
export const PLAY_HALF = 3.0; // 鹿が動ける範囲の半分
export const COURSE_LENGTH = 1000; // ゴール(大鳥居)までの距離
export const SHRINE_S = COURSE_LENGTH + 75; // 春日大社の位置

export type ObstacleKind = 'hole' | 'poop' | 'fence' | 'stone' | 'deer';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  s: number; // 前後の位置(穴は手前の端)
  x: number; // 左右の中心(動くものは基準)
  len: number; // 穴の長さ
  halfW: number; // 柵・穴の幅の半分
  height: number; // これ以上の高さで跳べば越えられる
  amp: number; // 左右の振れ幅(転がる岩)
  freq: number; // 転がる岩=角速度 / 横切る鹿=秒速
  phase: number;
}

export interface Coin {
  id: number;
  s: number;
  x: number;
  y: number; // 地面からの高さ(ジャンプで取るコインは高い)
}

export interface Course {
  obstacles: Obstacle[];
  coins: Coin[];
  length: number;
}

/** 各障害物の当たりの大きさ(半径)。 */
export const HIT_RADIUS: Record<ObstacleKind, number> = { hole: 0, poop: 0.6, fence: 0.35, stone: 0.85, deer: 0.8 };
export const OBSTACLE_HEIGHT: Record<ObstacleKind, number> = { hole: 0, poop: 0.55, fence: 1.05, stone: 1.15, deer: 1.25 };

const DEER_RANGE = (PLAY_HALF + 1.2) * 2;

/** 時刻 t での障害物の左右位置と向き(+1=右へ, -1=左へ)。 */
export function obstacleState(o: Obstacle, t: number): { x: number; dir: number } {
  if (o.kind === 'stone') {
    const a = t * o.freq + o.phase;
    return { x: o.x + o.amp * Math.sin(a), dir: Math.cos(a) >= 0 ? 1 : -1 };
  }
  if (o.kind === 'deer') {
    const R = DEER_RANGE;
    const p = (((t * o.freq + o.phase) % (2 * R)) + 2 * R) % (2 * R);
    const xx = p < R ? p : 2 * R - p;
    return { x: xx - R / 2, dir: p < R ? 1 : -1 };
  }
  return { x: o.x, dir: 0 };
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

type PatternName = 'hole' | 'poop' | 'fenceGap' | 'stones' | 'deerCross' | 'holePoop' | 'fenceHole' | 'coinSnake';

export function buildCourse(seed = 20261114): Course {
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

  const run = (name: PatternName, s: number, p: number) => {
    switch (name) {
      case 'hole': return holePattern(s, p);
      case 'poop': return poopPattern(s);
      case 'fenceGap': return fenceGapPattern(s);
      case 'stones': return stonesPattern(s);
      case 'deerCross': return deerPattern(s);
      case 'holePoop': return holePoopPattern(s, p);
      case 'fenceHole': return fenceHolePattern(s, p);
      case 'coinSnake': return snakePattern(s);
    }
  };

  line(18, 0, 6, 2.4);
  let s = 62;
  const opening: PatternName[] = ['hole', 'coinSnake', 'poop', 'fenceGap'];
  for (const name of opening) s = run(name, s, 0) + 30;

  let prev: PatternName = 'fenceGap';
  const END_OBSTACLES = 925;
  while (s < END_OBSTACLES) {
    const p = s / COURSE_LENGTH;
    const pool: PatternName[] = ['hole', 'poop', 'fenceGap', 'coinSnake'];
    if (p > 0.25) pool.push('stones', 'deerCross');
    if (p > 0.5) pool.push('holePoop', 'fenceHole', 'stones', 'deerCross');
    let name = pool[Math.floor(rand() * pool.length)];
    if (name === prev) name = pool[Math.floor(rand() * pool.length)];
    prev = name;
    s = run(name, s, p) + Math.max(22, 38 - 14 * p);
  }

  // ゴール前のコインシャワー(障害物なし)
  for (let i = 0; i < 18; i++) {
    const ss = 950 + i * 2.6;
    coin(ss, -2.2);
    coin(ss, 0, 0.75 + 0.8 * Math.sin(i * 0.5));
    coin(ss, 2.2);
  }
  obstacles.sort((a, b) => a.s - b.s);
  return { obstacles, coins, length: COURSE_LENGTH };
}
