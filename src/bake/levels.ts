// WORLD 2「鹿せんべい大作戦」の面のデータ(設計書 30章)。せんべい屋台で、焼いて・渡す(bake)/積んで・とどける(tower)/投げて・配る(toss)。
// 面は、このデータを足せば作れる(焼ける速さ・鹿の来る時刻・注文の数・待てる時間・ゆれる速さ)。

export type DeerKind = 'fawn' | 'doe' | 'stag';

/** 鹿の来る時刻と注文(この順に、空いた場所へ来る。空きがなければ、空くまで待つ) */
export type Arrival = { t: number; kind: DeerKind; want: number };

/** くいしんぼう鹿(並ばずに、台のせんべいをこっそり食べに来る)の来る時刻と、来る側(−1=左・1=右) */
export type Sneak = { t: number; side: -1 | 1 };

/** プレミアムコインの出る条件。streak=極上を n 枚続けて作る/earlyShoo=くいしんぼう鹿を、台に着く前に全部追いはらってクリア */
export type PremiumRule = { kind: 'streak'; n: number } | { kind: 'earlyShoo' };

/** 片面の焼け方(秒)。ok から裏返せる・perfect の間は「こんがり」・smoke から煙・burn で焦げる */
export type Cook = { ok: number; perfect: [number, number]; smoke: number; burn: number };

export type BakeLevel = {
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
  premium: PremiumRule;
  /** その面ならではの一言(時刻) */
  notes?: { t: number; text: string }[];
};

/** 積む面(せんべいタワー)の、鹿の注文: 何段のタワーがほしいか */
export type TowerOrder = { kind: DeerKind; want: number };

export type TowerLevel = {
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
  notes?: { t: number; text: string }[];
};

/** 配る面の鹿: 来る時刻・立つ場所(x, z。屋台は z=0、公園の奥ほど z がマイナス)・ほしい枚数。move があると、その場所との間を行ったり来たりする */
export type TossArrival = { t: number; kind: DeerKind; at: [number, number]; want: number; move?: [number, number]; speed?: number };

export type TossLevel = {
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
  notes?: { t: number; text: string }[];
};

export type W2Level = BakeLevel | TowerLevel | TossLevel;

/** 鹿の種類ごとの名前 */
export const DEER_NAME: Record<DeerKind, string> = { fawn: '子鹿', doe: 'めす鹿', stag: '大きな鹿' };

const seq = (list: [number, DeerKind, number][]): Arrival[] => list.map(([t, kind, want]) => ({ t, kind, want }));

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

export const BAKE_LEVELS: W2Level[] = [LEVEL_2_1, LEVEL_2_2, LEVEL_2_3, LEVEL_2_4];
export const bakeById = (id: string): W2Level | undefined => BAKE_LEVELS.find(l => l.id === id);
export const isTower = (l: W2Level): l is TowerLevel => l.mode === 'tower';
export const isToss = (l: W2Level): l is TossLevel => l.mode === 'toss';
export const isBake = (l: W2Level): l is BakeLevel => !l.mode || l.mode === 'bake';
