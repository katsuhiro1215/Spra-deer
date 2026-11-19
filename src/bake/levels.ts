// WORLD 2「鹿せんべい大作戦」の面のデータ(設計書 30章)。せんべい屋台で、焼いて・渡す(bake)/積んで・とどける(tower)/投げて・配る(toss)。
// 面は、このデータを足せば作れる(焼ける速さ・鹿の来る時刻・注文の数・待てる時間・ゆれる速さ)。

import type { FriendId } from '../sweep/levels.ts';

export type DeerKind = 'fawn' | 'doe' | 'stag';
export type { FriendId };

/** 焼き加減の注文(2-5 から)。soft = 両面「やわらか」(金色の前で裏返す・取る)/crisp = 両面「こんがり」(極上) */
export type Taste = 'soft' | 'crisp';
/** 鹿の来る時刻と注文(この順に、空いた場所へ来る。空きがなければ、空くまで待つ) */
export type Arrival = { t: number; kind: DeerKind; want: number; taste?: Taste };

/** 屋台を出す場所(2-5 から 面ごとに かわる): 奥に見える名所の絵・夜・雨 */
export type W2Scene = { place: string; landmark?: { img: string; w: number; h: number; x?: number; z?: number }; night?: boolean; rain?: boolean; /** 奥に 若草山(緑の山) */ hill?: boolean };
/** 面の共通: 場所と、お店を手伝う なかま */
type W2Common = { scene?: W2Scene; helpers?: FriendId[] };

/** くいしんぼう鹿(並ばずに、台のせんべいをこっそり食べに来る)の来る時刻と、来る側(−1=左・1=右) */
export type Sneak = { t: number; side: -1 | 1 };

/** プレミアムコインの出る条件。streak=極上を n 枚続けて作る/earlyShoo=くいしんぼう鹿を、台に着く前に全部追いはらってクリア */
export type PremiumRule = { kind: 'streak'; n: number } | { kind: 'earlyShoo' };

/** 片面の焼け方(秒)。ok から裏返せる・perfect の間は「こんがり」・smoke から煙・burn で焦げる */
export type Cook = { ok: number; perfect: [number, number]; smoke: number; burn: number };

export type BakeLevel = W2Common & {
  mode?: 'bake';
  id: string;
  title: string;
  summary: string;
  /** はじめに出す一言 */
  intro: string;
  /** 制限時間(秒) */
  time: number;
  /** 満足させる鹿の数(そろった時点でクリア) */
  goal: number;
  /** 鉄板の数 */
  plates: number;
  cook: Cook;
  /** 鹿が待てる秒数(注文の途中で1枚もらうと、少し待ってくれる) */
  patience: Record<DeerKind, number>;
  arrivals: Arrival[];
  /** くいしんぼう鹿(2-2 から) */
  sneaks?: Sneak[];
  /** 鉄板ごとの火の強さ(焼ける速さの倍。2-8 から。無ければ みんな 1) */
  heat?: number[];
  premium: PremiumRule;
  /** その面ならではの一言(時刻) */
  notes?: { t: number; text: string }[];
};

/** 積む面(せんべいタワー)の、鹿の注文: 何段のタワーがほしいか */
export type TowerOrder = { kind: DeerKind; want: number };

export type TowerLevel = W2Common & {
  mode: 'tower';
  id: string;
  title: string;
  summary: string;
  intro: string;
  /** 制限時間(秒) */
  time: number;
  /** とどけるタワーの数(そろった時点でクリア) */
  goal: number;
  /** 鹿の注文(この順に1頭ずつ来る) */
  orders: TowerOrder[];
  /** 鹿が待てる秒数 */
  patience: number;
  /** 左右にゆれる、せんべいの速さ(m/秒)と、1段ごとの速くなり方 */
  swing: { speed: number; accel: number };
  /** プレミアムコイン: n 段以上のタワーをとどける */
  premiumHeight: number;
  /** 風(2-6 から): from 秒から、every 秒ごとに dur 秒ふく。落ちている せんべいが 横へ 流される(force m/秒) */
  wind?: { from: number; every: number; dur: number; force: number };
  /** タワーの いちばん下を 食べに来る鹿(2-6 から): 来る時刻と 側(−1=左・1=右)。タップで おいはらう */
  nibblers?: { t: number; side: -1 | 1 }[];
  notes?: { t: number; text: string }[];
};

/** 配る面の鹿: 来る時刻・立つ場所(x, z。屋台は z=0、公園の奥ほど z がマイナス)・ほしい枚数。move があると、その場所との間を行ったり来たりする */
export type TossArrival = { t: number; kind: DeerKind; at: [number, number]; want: number; move?: [number, number]; speed?: number };

export type TossLevel = W2Common & {
  mode: 'toss';
  id: string;
  title: string;
  summary: string;
  intro: string;
  /** 制限時間(秒) */
  time: number;
  /** 満足させる鹿の数(そろった時点でクリア) */
  goal: number;
  /** 持っている せんべいの数(鹿せんべいは 10まいで1束) */
  senbei: number;
  /** 鹿が待てる秒数 */
  patience: Record<DeerKind, number>;
  arrivals: TossArrival[];
  /** 投げる前に見える、とぶ道すじの長さ(0〜1。1 なら落ちる所まで見える) */
  guide: number;
  /** プレミアムコイン: 「ぴったり」キャッチを n 回続ける */
  premiumStreak: number;
  /** 風(2-7 から): from 秒から、every 秒ごとに dur 秒ふく。とんでいる せんべいが 横へ 流される(force m/秒) */
  wind?: { from: number; every: number; dur: number; force: number };
  notes?: { t: number; text: string }[];
};

export type W2Level = BakeLevel | TowerLevel | TossLevel;

/** 鹿の種類ごとの名前 */
export const DEER_NAME: Record<DeerKind, string> = { fawn: '子鹿', doe: 'めす鹿', stag: '大きな鹿' };

const seq = (list: [number, DeerKind, number, Taste?][]): Arrival[] => list.map(([t, kind, want, taste]) => ({ t, kind, want, ...(taste ? { taste } : {}) }));

export const LEVEL_2_1: BakeLevel = {
  id: '2-1', title: 'はじめての せんべい屋', summary: '焼いて、裏返して、鹿にわたす',
  intro: '空いた鉄板を タップして、生地を のせよう！',
  time: 120, goal: 8, plates: 3,
  cook: { ok: 3.0, perfect: [3.7, 4.5], smoke: 5.2, burn: 6.4 },
  patience: { fawn: 26, doe: 30, stag: 36 },
  // はじめは1頭ずつ、ゆっくり。なれてきたころに、2枚・3枚の注文と、重なる来店
  arrivals: seq([
    [5, 'fawn', 1], [16, 'fawn', 1], [26, 'doe', 2], [34, 'fawn', 1], [42, 'doe', 2], [49, 'fawn', 1],
    [56, 'stag', 3], [62, 'doe', 2], [68, 'fawn', 1], [74, 'doe', 2], [80, 'stag', 3], [86, 'fawn', 1],
    [92, 'doe', 2], [98, 'fawn', 1], [104, 'doe', 2], [110, 'fawn', 1],
  ]),
  premium: { kind: 'streak', n: 5 },
  notes: [
    { t: 54, text: '大きな鹿は、3まい ほしい！ 先に 焼いておこう' },
    { t: 85, text: 'いそがしく なってきた！ 鉄板を 空けないで' },
  ],
};

export const LEVEL_2_2: BakeLevel = {
  id: '2-2', title: 'くいしんぼう鹿', summary: '台のせんべいを ねらう鹿を おいはらう',
  intro: '今日は くいしんぼうな鹿が いるみたい… 台の せんべいに 気をつけて！',
  time: 120, goal: 10, plates: 3,
  cook: { ok: 3.0, perfect: [3.7, 4.5], smoke: 5.2, burn: 6.4 },
  patience: { fawn: 24, doe: 28, stag: 34 },
  arrivals: seq([
    [4, 'fawn', 1], [12, 'doe', 2], [22, 'fawn', 1], [30, 'doe', 2], [38, 'stag', 3], [46, 'fawn', 1],
    [53, 'doe', 2], [60, 'fawn', 1], [66, 'stag', 3], [72, 'doe', 2], [78, 'fawn', 1], [84, 'doe', 2],
    [90, 'fawn', 1], [96, 'stag', 3], [102, 'doe', 2], [108, 'fawn', 1],
  ]),
  // はじめの1頭は、ほかの鹿が少ないときに。あとは、いそがしい所に重ねる
  sneaks: [
    { t: 20, side: 1 }, { t: 34, side: -1 }, { t: 46, side: 1 }, { t: 57, side: -1 }, { t: 67, side: 1 }, { t: 77, side: -1 },
    { t: 88, side: 1 }, { t: 99, side: -1 },
  ],
  premium: { kind: 'earlyShoo' },
  notes: [
    { t: 50, text: 'くいしんぼう鹿は、台に 着く前に タップで おいはらえる！' },
  ],
};

export const LEVEL_2_3: TowerLevel = {
  mode: 'tower',
  id: '2-3', title: 'せんべいタワー', summary: 'せんべいを 高く積んで、とどける',
  intro: 'ゆれる せんべいを、タップで 落として 積もう！',
  time: 100, goal: 5,
  // 注文は だんだん高く。最後の大きな鹿は8段
  orders: [
    { kind: 'fawn', want: 3 }, { kind: 'doe', want: 4 }, { kind: 'fawn', want: 5 }, { kind: 'doe', want: 6 }, { kind: 'stag', want: 8 },
    { kind: 'doe', want: 6 }, { kind: 'stag', want: 8 }, { kind: 'fawn', want: 5 },
  ],
  patience: 30,
  swing: { speed: 0.85, accel: 0.07 },
  premiumHeight: 12,
  notes: [
    { t: 3, text: '注文の 高さで「おとどけ」！ 高く積むほど ごほうび アップ' },
  ],
};

// 配る面の立ち位置(手前・まん中・奥)。屋台から 約2.5m・4.5m・7m
const NEAR = -3.4, MID = -5.4, FAR = -7.8;
/** 山の上(2-7。屋台から 約8.6m) */
const TOP = -9.6;
const toss = (list: [number, DeerKind, number, number, number, [number, number]?, number?][]): TossArrival[] =>
  list.map(([t, kind, x, z, want, move, speed]) => ({ t, kind, at: [x, z], want, ...(move ? { move, speed: speed ?? 0.5 } : {}) }));

export const LEVEL_2_4: TossLevel = {
  mode: 'toss',
  id: '2-4', title: 'せんべい くばり', summary: '公園の鹿へ、せんべいを 投げて とどける',
  intro: '鹿のほうへ 指で スーッと なぞって、はなすと 投げるよ！',
  time: 90, goal: 12, senbei: 20,
  patience: { fawn: 13, doe: 15, stag: 18 },
  // はじめは手前の鹿から1頭ずつ。だんだん奥へ、2頭ずつ。40秒すぎから、歩きまわる鹿
  arrivals: toss([
    [2, 'fawn', 0, NEAR, 1], [6, 'doe', -0.9, MID, 1], [10, 'fawn', 1.1, NEAR, 1], [14, 'stag', 0, FAR, 2],
    [19, 'doe', -1.1, NEAR, 1], [20, 'fawn', 1.0, MID, 1], [25, 'doe', -2.0, FAR, 1], [27, 'fawn', 0.2, NEAR, 1],
    [32, 'stag', 2.0, FAR, 2], [33, 'doe', -1.0, MID, 1], [40, 'fawn', -1.6, MID, 1, [1.6, MID], 0.55], [42, 'doe', 1.1, NEAR, 1],
    [47, 'doe', -2.0, FAR, 2, [0.4, FAR], 0.45], [49, 'fawn', -0.8, NEAR, 1], [54, 'fawn', 1.6, MID, 1, [-1.2, MID], 0.6],
    [56, 'stag', 0.4, FAR, 2], [62, 'doe', -1.1, NEAR, 1], [64, 'fawn', 1.8, FAR, 1], [70, 'doe', 0, MID, 1],
  ]),
  guide: 0.6,
  premiumStreak: 4,
  notes: [
    { t: 16, text: '長く なぞるほど 遠くへ とぶよ。奥の鹿は 長めに！' },
    { t: 50, text: '歩いている鹿は、少し先を ねらおう' },
  ],
};

// 2-5 から: 屋台が 奈良を まわる(奥に 名所)。なかまが 1人ずつ お店を 手伝う(設計書 30-8)
const LANDMARK = '/assets/runner/landmarks';

export const LEVEL_2_5: BakeLevel = {
  id: '2-5', title: 'ちゅうもん いろいろ', summary: '春日大社の 参道で。「やわらか」と「こんがり」の 注文',
  intro: '今日は 春日大社の 参道に お店を 出すよ！ 鹿の 注文を よく見てね',
  scene: { place: 'kasuga', landmark: { img: `${LANDMARK}/kasuga.webp`, w: 10, h: 4.9, z: -11 } },
  helpers: ['lumi'],
  time: 120, goal: 10, plates: 4,
  cook: { ok: 3.0, perfect: [3.7, 4.5], smoke: 5.2, burn: 6.4 },
  patience: { fawn: 26, doe: 30, stag: 36 },
  // 子鹿は「やわらか」、大きな鹿は「こんがり」が すき。めす鹿は どちらでも
  arrivals: seq([
    [4, 'fawn', 1, 'soft'], [12, 'doe', 2], [20, 'stag', 2, 'crisp'], [28, 'fawn', 1, 'soft'], [34, 'doe', 2], [40, 'fawn', 2, 'soft'],
    [47, 'stag', 3, 'crisp'], [53, 'doe', 2], [59, 'fawn', 1, 'soft'], [65, 'stag', 2, 'crisp'], [71, 'doe', 2], [77, 'fawn', 2, 'soft'],
    [83, 'stag', 3, 'crisp'], [89, 'doe', 2], [95, 'fawn', 1, 'soft'], [101, 'doe', 2], [107, 'fawn', 1, 'soft'],
  ]),
  premium: { kind: 'streak', n: 5 },
  notes: [
    { t: 3, text: '子鹿は「やわらか」が すき！ 輪が 緑のうちに 裏返して、緑のうちに 取ろう' },
    { t: 19, text: '大きな鹿は「こんがり」(金色)が すき！ 鉄板が 4まいに ふえたよ' },
  ],
};

export const LEVEL_2_6: TowerLevel = {
  mode: 'tower',
  id: '2-6', title: 'ぐらぐらタワー', summary: '興福寺の 五重塔の 前で。風と、下を 食べる鹿',
  intro: '五重塔の 前に お店を 出すよ！ 風と、くいしんぼうに 気をつけて',
  scene: { place: 'kofukuji', landmark: { img: `${LANDMARK}/kofukuji-pagoda.webp`, w: 3.6, h: 6.3, x: -3.2, z: -9 } },
  helpers: ['piko'],
  time: 110, goal: 6,
  orders: [
    { kind: 'fawn', want: 4 }, { kind: 'doe', want: 5 }, { kind: 'fawn', want: 5 }, { kind: 'stag', want: 7 }, { kind: 'doe', want: 6 }, { kind: 'stag', want: 8 },
    { kind: 'doe', want: 6 }, { kind: 'stag', want: 8 }, { kind: 'fawn', want: 5 },
  ],
  patience: 32,
  swing: { speed: 0.9, accel: 0.07 },
  premiumHeight: 12,
  wind: { from: 10, every: 9, dur: 3, force: 1.1 },
  nibblers: [{ t: 18, side: -1 }, { t: 34, side: 1 }, { t: 50, side: -1 }, { t: 64, side: 1 }, { t: 78, side: -1 }, { t: 92, side: 1 }],
  notes: [
    { t: 8, text: '風が ふくと、落ちる せんべいが 流される！ 矢印の 反対に 少し ずらして 落とそう(Piko が 風を やわらげてくれる)' },
    { t: 17, text: 'タワーの 下を 食べに 鹿が 来た！ 鹿を タップで おいはらおう' },
  ],
};

export const LEVEL_2_7: TossLevel = {
  mode: 'toss',
  id: '2-7', title: '山の上まで くばる', summary: '若草山の ふもとで。山の上の鹿・走る子鹿・風',
  intro: '若草山の ふもとに お店を 出すよ！ 山の上の 鹿にも とどけよう',
  scene: { place: 'wakakusa', hill: true },
  helpers: ['momo'],
  time: 95, goal: 13, senbei: 22,
  patience: { fawn: 12, doe: 14, stag: 17 },
  // 山の上(TOP)の鹿・走りまわる子鹿(速い)・風
  arrivals: toss([
    [2, 'doe', 0, MID, 1], [6, 'fawn', -1.0, NEAR, 1], [9, 'stag', 0.6, FAR, 2], [13, 'doe', -1.4, TOP, 1],
    [17, 'fawn', -1.8, MID, 1, [1.8, MID], 1.3], [21, 'doe', 1.2, NEAR, 1], [25, 'stag', -0.4, TOP, 2], [28, 'fawn', 1.6, FAR, 1],
    [33, 'fawn', 1.8, NEAR, 1, [-1.6, NEAR], 1.4], [36, 'doe', -1.8, FAR, 1], [41, 'stag', 1.4, TOP, 2, [-0.6, TOP], 0.5], [44, 'doe', 0, MID, 1],
    [49, 'fawn', -1.9, MID, 1, [1.9, MID], 1.5], [53, 'doe', 1.1, TOP, 1], [57, 'fawn', 0.4, NEAR, 1], [61, 'stag', -1.6, FAR, 2],
    [66, 'fawn', 1.9, FAR, 1, [-1.2, FAR], 1.2], [70, 'doe', -0.8, TOP, 1], [74, 'doe', 1.2, MID, 1],
  ]),
  guide: 0.55,
  premiumStreak: 4,
  wind: { from: 14, every: 11, dur: 3.5, force: 1.0 },
  notes: [
    { t: 12, text: '山の上の 鹿は 遠いよ！ 長ーく なぞろう' },
    { t: 15, text: '風が ふくと、とんでいる せんべいが 流される！ 矢印の 反対に ずらそう' },
    { t: 17, text: '走る 子鹿は 速い！ 先を ねらおう(Momo が いると、鹿が 長く 待ってくれる)' },
  ],
};

export const LEVEL_2_8: BakeLevel = {
  id: '2-8', title: '鹿の 団体さん', summary: '夜の 燈花会で。団体さんの 大きな注文と、強火・弱火の 鉄板',
  intro: '夜の 燈花会に お店を 出すよ！ 暗いので 焼き色を よく見て',
  scene: { place: 'tokae', night: true },
  helpers: ['ruru'],
  time: 130, goal: 12, plates: 4,
  cook: { ok: 3.0, perfect: [3.7, 4.5], smoke: 5.2, burn: 6.4 },
  // 左はしは 強火(速く焼ける)・右はしは 弱火(ゆっくり)
  heat: [1.35, 1, 1, 0.75],
  patience: { fawn: 28, doe: 32, stag: 40 },
  // 団体さん: 3頭が いっしょに 来て、まとめて たくさん 注文する
  arrivals: seq([
    [4, 'doe', 2], [12, 'fawn', 1, 'soft'],
    [20, 'stag', 4], [20.5, 'doe', 2], [21, 'fawn', 2],
    [42, 'doe', 2, 'crisp'], [48, 'fawn', 1, 'soft'],
    [56, 'stag', 5], [56.5, 'doe', 3], [57, 'fawn', 2, 'soft'],
    [80, 'doe', 2], [86, 'stag', 3, 'crisp'],
    [94, 'stag', 4], [94.5, 'doe', 3], [95, 'fawn', 2], [112, 'fawn', 1],
  ]),
  sneaks: [{ t: 30, side: 1 }, { t: 66, side: -1 }, { t: 104, side: 1 }],
  premium: { kind: 'streak', n: 6 },
  notes: [
    { t: 2, text: '左の 鉄板は 強火(速い)、右は 弱火(ゆっくり)。Ruru が 焦げそうな 鉄板に 水を かけてくれるよ' },
    { t: 18, text: '団体さんだ！ 3頭 いっしょに たくさん 注文！ 先に 焼いておこう' },
  ],
};

export const BAKE_LEVELS: W2Level[] = [LEVEL_2_1, LEVEL_2_2, LEVEL_2_3, LEVEL_2_4, LEVEL_2_5, LEVEL_2_6, LEVEL_2_7, LEVEL_2_8];
export const bakeById = (id: string): W2Level | undefined => BAKE_LEVELS.find(l => l.id === id);
export const isTower = (l: W2Level): l is TowerLevel => l.mode === 'tower';
export const isToss = (l: W2Level): l is TossLevel => l.mode === 'toss';
export const isBake = (l: W2Level): l is BakeLevel => !l.mode || l.mode === 'bake';
