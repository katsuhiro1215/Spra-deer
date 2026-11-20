// WORLD 5「鹿の背中で ぴょんぴょん」の面(設計書 34章)。Spra が 鹿の背中や頭を足場に、上へ上へ跳んでいく。
// 足場の並びは、区間ごとの決まり(どの鹿が出るか・すき間)から、決まった乱数で作る(毎回同じ並び)。

/**
 * 足場になる鹿: lie=寝ころぶ鹿(広くて動かない)、walk=歩く鹿(左右に動く)、bow=おじぎ鹿(おじぎ中に乗ると大ジャンプ)、
 * sleep=ねむい鹿(1回乗ると起きて、行ってしまう)、hop=はねる子鹿(上下に ぴょんぴょん動く)
 */
export type PadKind = 'lie' | 'walk' | 'bow' | 'sleep' | 'hop';

/** 空のようす: day=昼、forest=森、evening=夕方、sky=雲の上、night=夜(まわりが暗い) */
export type JumpScene = 'day' | 'forest' | 'evening' | 'sky' | 'night';

export type JumpSection = {
  /** この高さ(m)まで */
  until: number;
  /** 出る鹿の割合 */
  kinds: Partial<Record<PadKind, number>>;
  /** 足場の高さの すき間(m) [最小, 最大] */
  gap: [number, number];
  /** 歩く鹿の速さ(m/秒) */
  walkSpeed?: number;
  /** 区間の名前(画面に出す) */
  name?: string;
  /** せんべいを置く間かく(m)。取っておくと、落ちたとき 鹿が受けとめてくれる */
  senbeiEvery?: number;
  /** カラスを飛ばす間かく(m)と 速さ(m/秒) */
  crowEvery?: number; crowSpeed?: number;
  /** 風の強さ(m/秒。20m ごとに 向きが かわる) */
  wind?: number;
};

export type JumpLevel = {
  id: string; title: string; summary: string;
  intro: string;
  lesson: string;
  /** ゴールの高さ(m)と、その名前 */
  goal: number; goalName: string;
  sections: JumpSection[];
  /** 乱数のたね(足場の並びが変わる) */
  seed: number;
  /** その高さの少し手前で出す一言 */
  notes?: { y: number; text: string }[];
  scene: JumpScene;
  /** ふもとに見える 奈良の名所(runner/landmarks の絵) */
  landmark?: 'kasuga' | 'kofukuji-pagoda' | 'todaiji-hall';
};

/** 5-1 若草山を のぼろう: 寝ころぶ鹿 → 歩く鹿 → おじぎ鹿 の順に出てくる */
const LEVEL_5_1: JumpLevel = {
  id: '5-1', title: '若草山を のぼろう', summary: '鹿の背中で ぴょんぴょん、てっぺんまで',
  intro: '鹿の背中で ぴょんぴょん！ 若草山の てっぺんへ',
  lesson: '◀ ▶ で 左右へ。鹿に 乗ると、ひとりでに 跳ねる。おじぎ中の 鹿に 乗ると、大ジャンプ！',
  goal: 150, goalName: '若草山の てっぺん',
  seed: 51, scene: 'day',
  sections: [
    { until: 30, kinds: { lie: 1 }, gap: [1.8, 2.4], name: 'ふもとの 原っぱ' },
    { until: 70, kinds: { lie: 0.55, walk: 0.45 }, gap: [2.0, 2.6], walkSpeed: 0.9, name: '鹿の 散歩道' },
    { until: 110, kinds: { lie: 0.4, walk: 0.25, bow: 0.35 }, gap: [2.1, 2.7], walkSpeed: 1.0, name: 'おじぎの 坂' },
    { until: 150, kinds: { lie: 0.3, walk: 0.35, bow: 0.35 }, gap: [2.1, 2.8], walkSpeed: 1.2, name: '山頂の 手前' },
  ],
  notes: [
    { y: 28, text: '歩く鹿が 出てきた！ 動きを 見て 乗ろう' },
    { y: 68, text: 'おじぎ鹿！ 頭を 下げた ときに 乗ると、大ジャンプ' },
  ],
};

/** 5-2 春日の森: ねむい鹿(1回乗ると 行ってしまう) */
const LEVEL_5_2: JumpLevel = {
  id: '5-2', title: '春日の森の ねむい鹿', summary: '1回 乗ると 起きてしまう 鹿に 気をつけて',
  intro: '春日の森を 上へ！ ねむい鹿は 1回だけ',
  lesson: 'zzz の 鹿は、1回 乗ると 起きて 行ってしまう。落ちたら もう 乗れないので、次の 鹿を 先に 見ておこう',
  goal: 170, goalName: '森の 上', seed: 52, scene: 'forest', landmark: 'kasuga',
  sections: [
    { until: 40, kinds: { lie: 0.6, walk: 0.4 }, gap: [2.0, 2.6], walkSpeed: 1.0, name: '春日の 参道' },
    { until: 110, kinds: { lie: 0.3, walk: 0.3, sleep: 0.4 }, gap: [2.1, 2.7], walkSpeed: 1.1, name: 'ねむい 森' },
    { until: 170, kinds: { lie: 0.2, walk: 0.3, sleep: 0.3, bow: 0.2 }, gap: [2.1, 2.8], walkSpeed: 1.2, name: '森の こずえ' },
  ],
  notes: [{ y: 38, text: 'zzz… ねむい鹿！ 1回 乗ると 起きて 行っちゃうよ' }],
};

/** 5-3 せんべい: 取っておくと、落ちても 鹿が受けとめてくれる */
const LEVEL_5_3: JumpLevel = {
  id: '5-3', title: 'せんべいで 助けてもらおう', summary: 'せんべいを 持っていると、落ちても 鹿が 受けとめてくれる',
  intro: 'せんべいを 取っておこう！',
  lesson: 'せんべいを 取って おくと、落ちたとき 鹿が 受けとめて 大ジャンプ。ハートが へらない(2まいまで 持てる)',
  goal: 180, goalName: '飛火野の 上', seed: 53, scene: 'day',
  sections: [
    { until: 50, kinds: { lie: 0.4, walk: 0.3, sleep: 0.3 }, gap: [2.1, 2.7], walkSpeed: 1.1, senbeiEvery: 25, name: 'せんべい 原っぱ' },
    { until: 120, kinds: { lie: 0.2, walk: 0.3, sleep: 0.3, bow: 0.2 }, gap: [2.2, 2.8], walkSpeed: 1.3, senbeiEvery: 35, name: 'ゆれる 鹿' },
    { until: 180, kinds: { lie: 0.15, walk: 0.35, sleep: 0.3, bow: 0.2 }, gap: [2.3, 2.8], walkSpeed: 1.5, senbeiEvery: 40, name: '空に ちかい 坂' },
  ],
  notes: [{ y: 3, text: 'せんべいを 取って おこう！ 落ちても 鹿が 受けとめてくれる' }],
};

/** 5-4 五重塔とカラス: 横切るカラスに当たると、下へ はじかれる */
const LEVEL_5_4: JumpLevel = {
  id: '5-4', title: '五重塔と カラス', summary: '横切る カラスを よけて、五重塔より 高く',
  intro: '五重塔より 高く！ カラスに 気をつけて',
  lesson: 'カラスに 当たると、下へ はじかれる。飛んでくる 向きを 見て、すきまを ぬけよう',
  goal: 200, goalName: '五重塔の 上の 空', seed: 54, scene: 'day', landmark: 'kofukuji-pagoda',
  sections: [
    { until: 40, kinds: { lie: 0.5, walk: 0.3, sleep: 0.2 }, gap: [2.1, 2.7], walkSpeed: 1.1, name: '興福寺の 庭' },
    { until: 130, kinds: { lie: 0.3, walk: 0.3, sleep: 0.2, bow: 0.2 }, gap: [2.2, 2.8], walkSpeed: 1.2, crowEvery: 16, crowSpeed: 2.0, senbeiEvery: 45, name: 'カラスの 通り道' },
    { until: 200, kinds: { lie: 0.2, walk: 0.35, sleep: 0.25, bow: 0.2 }, gap: [2.2, 2.8], walkSpeed: 1.4, crowEvery: 12, crowSpeed: 2.6, senbeiEvery: 45, name: '塔の てっぺん' },
  ],
  notes: [{ y: 38, text: 'カァ！ カラスだ！ 当たると 下へ はじかれるよ' }],
};

/** 5-5 風: 20m ごとに向きのかわる風に 流される */
const LEVEL_5_5: JumpLevel = {
  id: '5-5', title: '風の 吹く 夕やけ', summary: '風に 流されないように、鹿の 上へ',
  intro: '風が 吹いてきた！ 流される 向きを 見て',
  lesson: '風が 吹くと、横へ 流される。木の葉の 向きが 風の 向き。少し 反対へ 動いて ねらおう',
  goal: 200, goalName: '夕やけの 空', seed: 55, scene: 'evening',
  sections: [
    { until: 30, kinds: { lie: 0.5, walk: 0.3, bow: 0.2 }, gap: [2.1, 2.7], walkSpeed: 1.1, name: '夕やけの 丘' },
    { until: 120, kinds: { lie: 0.35, walk: 0.25, sleep: 0.2, bow: 0.2 }, gap: [2.1, 2.7], walkSpeed: 1.2, wind: 2.2, senbeiEvery: 40, name: '風の 通り道' },
    { until: 200, kinds: { lie: 0.25, walk: 0.3, sleep: 0.25, bow: 0.2 }, gap: [2.2, 2.8], walkSpeed: 1.3, wind: 2.6, crowEvery: 20, crowSpeed: 2.2, senbeiEvery: 45, name: '強い 風' },
  ],
  notes: [{ y: 28, text: '風だ！ 木の葉の 向きに 流されるよ' }],
};

/** 5-6 はねる子鹿: 上下に ぴょんぴょん動く足場 */
const LEVEL_5_6: JumpLevel = {
  id: '5-6', title: 'はねる 子鹿', summary: 'ぴょんぴょん はねる 子鹿に、うまく 乗ろう',
  intro: '子鹿が はねてる！ タイミングを 見て',
  lesson: '子鹿は 上下に はねている。上がってくる ときに 乗れるよう、少し 待ってから 下りよう',
  goal: 210, goalName: '雲の 下', seed: 56, scene: 'day',
  sections: [
    { until: 40, kinds: { lie: 0.4, walk: 0.3, hop: 0.3 }, gap: [2.1, 2.7], walkSpeed: 1.1, name: '子鹿の 原っぱ' },
    { until: 140, kinds: { lie: 0.2, walk: 0.2, sleep: 0.2, bow: 0.15, hop: 0.25 }, gap: [2.2, 2.8], walkSpeed: 1.3, crowEvery: 22, crowSpeed: 2.2, senbeiEvery: 40, name: 'ぴょんぴょん 広場' },
    { until: 210, kinds: { lie: 0.15, walk: 0.25, sleep: 0.2, bow: 0.15, hop: 0.25 }, gap: [2.2, 2.8], walkSpeed: 1.4, wind: 2.0, crowEvery: 18, crowSpeed: 2.4, senbeiEvery: 45, name: '雲の 近く' },
  ],
  notes: [{ y: 3, text: 'はねる 子鹿！ 上がってくる ときに 乗ろう' }],
};

/** 5-7 雲の上: 風とカラスと ねむい鹿 */
const LEVEL_5_7: JumpLevel = {
  id: '5-7', title: '雲の 上の 鹿たち', summary: '雲の上でも、鹿たちが 待っている',
  intro: '雲の 上に 出た！ 風と カラスに 気をつけて',
  lesson: '雲の 上は 風が 強い。カラスも 多い。せんべいを 取りながら 進もう',
  goal: 220, goalName: '雲の 上の 広場', seed: 57, scene: 'sky',
  sections: [
    { until: 60, kinds: { lie: 0.3, walk: 0.3, sleep: 0.2, hop: 0.2 }, gap: [2.2, 2.8], walkSpeed: 1.3, wind: 2.2, senbeiEvery: 30, name: '雲の 入り口' },
    { until: 150, kinds: { lie: 0.15, walk: 0.3, sleep: 0.25, bow: 0.15, hop: 0.15 }, gap: [2.2, 2.8], walkSpeed: 1.4, wind: 2.6, crowEvery: 16, crowSpeed: 2.4, senbeiEvery: 40, name: '風の 雲' },
    { until: 220, kinds: { lie: 0.15, walk: 0.3, sleep: 0.25, bow: 0.15, hop: 0.15 }, gap: [2.3, 2.8], walkSpeed: 1.5, wind: 2.6, crowEvery: 13, crowSpeed: 2.6, senbeiEvery: 45, name: '雲の てっぺん' },
  ],
};

/** 5-8 夜空: まわりが暗く、近くしか見えない */
const LEVEL_5_8: JumpLevel = {
  id: '5-8', title: '夜空の 星あつめ', summary: '暗い 夜空を、鹿の 光を たよりに',
  intro: '夜に なった！ まわりが 見えにくいよ',
  lesson: '夜は 近くしか 見えない。おじぎ鹿の 大ジャンプで 星(ゴールド)を 集めよう',
  goal: 220, goalName: '星の 広場', seed: 58, scene: 'night',
  sections: [
    { until: 60, kinds: { lie: 0.4, walk: 0.25, bow: 0.35 }, gap: [2.1, 2.7], walkSpeed: 1.1, senbeiEvery: 30, name: '夜の はじまり' },
    { until: 150, kinds: { lie: 0.2, walk: 0.25, sleep: 0.2, bow: 0.35 }, gap: [2.2, 2.8], walkSpeed: 1.3, crowEvery: 24, crowSpeed: 2.0, senbeiEvery: 40, name: '星の 道' },
    { until: 220, kinds: { lie: 0.15, walk: 0.25, sleep: 0.2, bow: 0.25, hop: 0.15 }, gap: [2.2, 2.8], walkSpeed: 1.4, crowEvery: 18, crowSpeed: 2.3, senbeiEvery: 45, name: '天の川' },
  ],
};

/** 5-9 大仏殿より高く: ここまでの 全部 */
const LEVEL_5_9: JumpLevel = {
  id: '5-9', title: '大仏殿より 高く', summary: 'ここまでの しかけ 全部で、もっと 高く',
  intro: '大仏殿より 高く！ ここまでの 全部だよ',
  lesson: 'ねむい鹿・はねる子鹿・カラス・風。せんべいを 取って、落ちたときの そなえを',
  goal: 260, goalName: '大仏殿の 上の 空', seed: 59, scene: 'evening', landmark: 'todaiji-hall',
  sections: [
    { until: 60, kinds: { lie: 0.3, walk: 0.3, sleep: 0.2, bow: 0.2 }, gap: [2.2, 2.8], walkSpeed: 1.3, senbeiEvery: 35, name: '大仏殿の 前' },
    { until: 170, kinds: { lie: 0.15, walk: 0.25, sleep: 0.25, bow: 0.15, hop: 0.2 }, gap: [2.3, 2.8], walkSpeed: 1.5, wind: 2.2, crowEvery: 19, crowSpeed: 2.6, senbeiEvery: 45, name: '屋根の 上' },
    { until: 260, kinds: { lie: 0.2, walk: 0.3, sleep: 0.2, bow: 0.15, hop: 0.15 }, gap: [2.3, 2.8], walkSpeed: 1.5, wind: 2.6, crowEvery: 15, crowSpeed: 2.6, senbeiEvery: 50, name: '金の しびの 上' },
  ],
};

/** 5-10 空の上へ: いちばん高く、いちばん長い */
const LEVEL_5_10: JumpLevel = {
  id: '5-10', title: '鹿と いっしょに 空の上へ', summary: 'いちばん 高い 空の上を めざして',
  intro: 'さいごの 大ジャンプ！ 空の上へ',
  lesson: '320m の 長い 道のり。せんべいを 2まい 持って、カラスと 風に 負けずに 空の上へ',
  goal: 320, goalName: '空の 上', seed: 60, scene: 'sky',
  sections: [
    { until: 80, kinds: { lie: 0.25, walk: 0.3, sleep: 0.2, bow: 0.15, hop: 0.1 }, gap: [2.2, 2.8], walkSpeed: 1.4, wind: 2.2, crowEvery: 24, crowSpeed: 2.4, senbeiEvery: 35, name: '空への 入り口' },
    { until: 200, kinds: { lie: 0.2, walk: 0.3, sleep: 0.15, bow: 0.15, hop: 0.2 }, gap: [2.3, 2.8], walkSpeed: 1.5, wind: 2.3, crowEvery: 18, crowSpeed: 2.6, senbeiEvery: 45, name: '風の 回廊' },
    { until: 320, kinds: { lie: 0.2, walk: 0.3, sleep: 0.2, bow: 0.15, hop: 0.15 }, gap: [2.3, 2.8], walkSpeed: 1.5, wind: 2.4, crowEvery: 15, crowSpeed: 2.6, senbeiEvery: 50, name: '空の 上の 手前' },
  ],
};

export const JUMP_LEVELS: JumpLevel[] = [LEVEL_5_1, LEVEL_5_2, LEVEL_5_3, LEVEL_5_4, LEVEL_5_5, LEVEL_5_6, LEVEL_5_7, LEVEL_5_8, LEVEL_5_9, LEVEL_5_10];
export const jumpById = (id: string): JumpLevel | undefined => JUMP_LEVELS.find(l => l.id === id);
/** まだ作っていない面(名前だけ) */
export const JUMP_PLANNED: { id: string; title: string }[] = [];
