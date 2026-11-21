// WORLD 8「鹿と暴走トロッコ」の面(線路のデータ)。面を足すときは、ここにデータを足す。
import { Track, type Coin, type Fork, type Gap, type Pursuit, type Terrain, type TrackDef } from './track.ts';

export type CartLevel = {
  id: string; title: string; summary: string;
  /** はじめに出す一言 */
  intro: string;
  goalName: string;
  /** その場所の少し手前で出す一言(その面ならではの所の、やり方) */
  notes?: { s: number; text: string }[];
  track: TrackDef;
};

type C = Omit<Coin, 'id'>;
/** 線路にそって、step おきにコインを並べる。 */
const line = (from: number, to: number, step = 9, side: -1 | 0 | 1 = 0, h = 0.9): C[] => {
  const out: C[] = [];
  for (let s = from; s <= to; s += step) out.push({ s, side, h });
  return out;
};
/** ジャンプの道すじにそって、山なりに並べる(跳ばないと取れない)。 */
const arc = (from: number, to: number, n: number, peak = 2.6, kind?: 'gold'): C[] =>
  Array.from({ length: n }, (_, i) => {
    const k = (i + 0.5) / n;
    return { s: from + (to - from) * k, side: 0 as const, h: 0.9 + peak * 4 * k * (1 - k) * 0.75 + 0.6, kind: kind && i === Math.floor(n / 2) ? kind : undefined };
  });

/** 空中のコインを、[s, 高さ, 種類] で並べる(飛ぶ道すじに合わせるとき)。 */
const air = (pts: [number, number, ('gold' | 'premium')?][], side: -1 | 0 | 1 = 0): C[] =>
  pts.map(([s, h, kind]) => ({ s, side, h, kind }));

/**
 * 8-1 はじめての暴走(約1500m・70秒前後)。
 * 出発 → 下り坂 → ゆるいカーブ → 小さな渓谷(ジャンプ) → 落石と枝 → 急な下り → 急カーブ(ブレーキ)
 * → 上り坂(鹿のダッシュ) → 大渓谷(ダッシュ+ジャンプ) → 紅葉のカーブ → ゴールへ一直線
 */
const LEVEL_8_1: CartLevel = {
  id: '8-1', title: 'はじめての暴走', summary: '山の線路を、ふもとの駅まで',
  intro: '鹿が 走りだした！ しっかり つかまって！',
  goalName: 'ふもとの駅',
  track: {
    segments: [
      { len: 90, slope: -1.5, terrain: 'forest', name: '出発の森' },
      { len: 170, slope: -6, terrain: 'hillL', name: '風を感じる下り坂' },
      { len: 110, slope: -2.5, turn: 60, terrain: 'hillL', name: '木もれ日のカーブ' },
      { len: 50, slope: -1.5, terrain: 'forest' },
      { len: 70, slope: -1, terrain: 'canyon', name: '小さな渓谷' },
      { len: 110, slope: -2, terrain: 'forest', name: '落石の森' },
      { len: 200, slope: -8.5, terrain: 'hillR', name: '暴走ダウンヒル' },
      { len: 70, slope: -2, turn: -85, terrain: 'cut', name: '山腹の急カーブ' },
      { len: 120, slope: 5, terrain: 'forest', name: '鹿の ふんばりどころ' },
      { len: 90, slope: -5, terrain: 'hillR' },
      { len: 90, slope: -1, terrain: 'canyon', name: '大渓谷' },
      { len: 100, slope: -3, turn: 65, terrain: 'hillR', name: '紅葉のカーブ' },
      { len: 230, slope: -7, terrain: 'ridge', name: 'ゴールへ 一直線' },
    ],
    gaps: [{ from: 452, to: 459 }, { from: 1112, to: 1134 }],
    obstacles: [
      { s: 540, kind: 'rock' },
      { s: 580, kind: 'branch', side: 1 },
      { s: 715, kind: 'log' },
      { s: 1215, kind: 'branch', side: -1 },
      { s: 1335, kind: 'rock' },
      { s: 1395, kind: 'branch', side: 1 },
      { s: 1445, kind: 'log' },
    ],
    coins: [
      ...line(30, 84), ...line(110, 250, 10),
      ...line(280, 360, 10, 1), // カーブの内側(右へ傾けて取る)
      ...line(385, 435, 10), ...arc(448, 464, 3), ...line(475, 520, 9),
      ...arc(534, 548, 3, 2), ...line(572, 590, 9, -1),
      ...line(620, 700, 10), ...arc(708, 724, 3, 2, 'gold'), ...line(735, 780, 9),
      ...line(815, 860, 9, -1), // 急カーブの内側(左へ傾けて取る)
      ...line(890, 980, 10), ...line(1000, 1090, 10),
      ...arc(1108, 1140, 5, 3, 'gold'),
      ...line(1150, 1170, 10), ...line(1185, 1260, 10, 1),
      ...line(1285, 1325, 8), ...arc(1329, 1343, 3, 2), ...line(1355, 1385, 10), ...line(1390, 1400, 10, -1),
      ...line(1410, 1436, 9),
      // プレミアム: 最後の倒木を、ダッシュの大ジャンプで越えた先の、高い所
      { s: 1458, side: 0, h: 3.6, kind: 'premium' },
      ...line(1470, 1495, 8),
    ],
    checkpoints: [{ s: 500, name: '見はり小屋' }, { s: 990, name: '峠の小屋' }],
  },
};

/**
 * 8-2 急カーブの森(約1680m)。テーマは「カーブで速さをあやつる」。
 * S字(右・左と続けて傾ける) → 杉林のヘアピン(強いブレーキ) → 上り坂 → 内がわに枝があるカーブ(内へ傾けられないので、先に減速)
 * → 沢の切れ目 → 3つ続くカーブ → 急降下のあとの、駅前の急カーブ
 * プレミアム: ヘアピンの外がわ。しっかり減速して、外へ体を傾けたときだけ取れる。
 */
const LEVEL_8_2: CartLevel = {
  id: '8-2', title: '急カーブの森', summary: 'くねくね曲がる、杉の森の線路',
  intro: 'カーブだらけの 森だ！ ブレーキと かたむきを 使いこなそう',
  goalName: '杉の森の駅',
  notes: [
    { s: 205, text: 'S字カーブ！ 右、そして すぐ左へ かたむけよう' },
    { s: 545, text: 'ヘアピンカーブ！ 手前で しっかり ブレーキ' },
    { s: 835, text: 'カーブの 内がわに 枝！ 内へ かたむけられないので、先に ゆっくりに しよう' },
    { s: 1125, text: 'カーブが 3つ 続くよ。右・左・右！' },
  ],
  track: {
    segments: [
      { len: 80, slope: -2, terrain: 'forest', name: '出発の森' },
      { len: 130, slope: -6, terrain: 'hillR', name: '森の下り坂' },
      { len: 70, slope: -3, turn: 55, terrain: 'hillR', name: 'S字カーブ' },
      { len: 70, slope: -3, turn: -55, terrain: 'hillL' },
      { len: 60, slope: -2, terrain: 'forest', name: '杉の小道' },
      { len: 140, slope: -7, terrain: 'hillL', name: '森の急降下' },
      { len: 70, slope: -2, turn: 105, terrain: 'cut', name: '杉林のヘアピン' },
      { len: 100, slope: 4, terrain: 'forest', name: 'ふんばり坂' },
      { len: 120, slope: -6, terrain: 'ridge', name: '尾根の下り' },
      { len: 90, slope: -2, turn: -70, terrain: 'hillL', name: '枝のカーブ' },
      { len: 60, slope: -2, terrain: 'forest' },
      { len: 70, slope: -1, terrain: 'canyon', name: '沢の切れ目' },
      { len: 70, slope: -3, terrain: 'forest' },
      { len: 70, slope: -4, turn: 50, terrain: 'hillR', name: '3つの カーブ' },
      { len: 70, slope: -4, turn: -55, terrain: 'hillL' },
      { len: 70, slope: -4, turn: 55, terrain: 'hillR' },
      { len: 160, slope: -8, terrain: 'ridge', name: '最後の急降下' },
      { len: 70, slope: -2, turn: -100, terrain: 'cut', name: '駅前の急カーブ' },
      { len: 110, slope: -1, terrain: 'forest', name: 'ゴールへ' },
    ],
    gaps: [{ from: 1015, to: 1023 }],
    obstacles: [
      { s: 385, kind: 'rock' },
      { s: 470, kind: 'branch', side: -1 },
      { s: 885, kind: 'branch', side: -1 }, // 左カーブの内がわ
      { s: 1100, kind: 'log' },
      { s: 1420, kind: 'rock' },
      { s: 1460, kind: 'branch', side: 1 },
      { s: 1630, kind: 'log' },
    ],
    coins: [
      ...line(25, 75), ...line(95, 200, 10),
      ...line(222, 270, 8, 1), ...line(292, 340, 8, -1), // S字は、それぞれ内がわ
      ...line(360, 376, 8), ...arc(379, 391, 3, 2), ...line(400, 450, 10),
      ...line(464, 476, 6, 1), ...line(490, 540, 10),
      ...line(558, 578, 10, 1), ...line(602, 612, 10, 1),
      // プレミアム: ヘアピンの外がわ(しっかり減速して、外へ傾ける)
      { s: 590, side: -1, h: 0.9, kind: 'premium' },
      ...line(632, 712, 10), ...line(730, 830, 10),
      ...line(850, 874, 8, -1), ...line(880, 890, 5, 1), ...line(900, 924, 8, -1),
      ...line(940, 1005, 9), ...arc(1011, 1027, 3, 2.6, 'gold'),
      ...line(1035, 1088, 9), ...arc(1094, 1106, 3, 2, 'gold'), ...line(1115, 1125, 10),
      ...line(1142, 1190, 8, 1), ...line(1212, 1260, 8, -1), ...line(1282, 1330, 8, 1),
      ...line(1350, 1410, 10), ...arc(1414, 1426, 3, 2), ...line(1435, 1450, 8), ...line(1455, 1465, 5, -1), ...line(1475, 1495, 10),
      ...line(1512, 1560, 8, -1),
      ...line(1580, 1620, 10), ...arc(1624, 1636, 3, 2), ...line(1645, 1675, 10),
    ],
    checkpoints: [{ s: 630, name: '炭焼き小屋' }, { s: 1070, name: '沢の見はり台' }],
  },
};

/**
 * 8-3 ジャンプ渓谷(約1740m)。テーマは「いろいろな切れ目を跳ぶ」。
 * 一の谷(小) → 落石の森 → 二連の谷(着地して、すぐもう一回) → 上りの谷(おそくなるので、ダッシュ)
 * → 谷底への急降下とカーブ → 落石の谷(着地のすぐ先に岩) → 大渓谷(22m)
 * プレミアム: 大渓谷の向こうの空中。ダッシュの全速(約115km/h以上)で跳んだときだけ届く。
 */
const LEVEL_8_3: CartLevel = {
  id: '8-3', title: 'ジャンプ渓谷', summary: '切れ目だらけの、谷の線路',
  intro: '谷だらけの 線路だ！ 黄色い枕木で ジャンプ！',
  goalName: '渓谷の駅',
  notes: [
    { s: 445, text: '切れ目が 2つ 続くよ！ 着地したら、すぐ もう一回 ジャンプ' },
    { s: 690, text: '上りの 切れ目！ 上り坂は おそくなるから、ダッシュで 速さを つけよう' },
    { s: 1105, text: '着地した すぐ先に 岩！ 続けて ジャンプ' },
  ],
  track: {
    segments: [
      { len: 80, slope: -2, terrain: 'forest', name: '出発の森' },
      { len: 140, slope: -6, terrain: 'hillL', name: '谷へ下る道' },
      { len: 70, slope: -1, terrain: 'canyon', name: '一の谷' },
      { len: 70, slope: -3, turn: 50, terrain: 'cut', name: '岩かべのカーブ' },
      { len: 90, slope: -5, terrain: 'forest', name: '落石の森' },
      { len: 110, slope: -1, terrain: 'canyon', name: '二連の谷' },
      { len: 60, slope: -3, terrain: 'forest' },
      { len: 80, slope: 4, terrain: 'forest', name: '鹿の上り坂' },
      { len: 70, slope: 3, terrain: 'canyon', name: '上りの谷' },
      { len: 80, slope: -4, terrain: 'forest' },
      { len: 130, slope: -7, terrain: 'hillR', name: '谷底への急降下' },
      { len: 70, slope: -2, turn: -95, terrain: 'cut', name: '谷底のカーブ' },
      { len: 60, slope: -2, terrain: 'forest' },
      { len: 100, slope: -1, terrain: 'canyon', name: '落石の谷' },
      { len: 120, slope: -6, terrain: 'ridge', name: '風の尾根' },
      { len: 70, slope: -2, turn: 60, terrain: 'hillR', name: '尾根のカーブ' },
      { len: 140, slope: -8, terrain: 'hillL', name: 'ラストの下り' },
      { len: 100, slope: -1, terrain: 'canyon', name: '大渓谷' },
      { len: 140, slope: -2, terrain: 'forest', name: '渓谷の駅へ' },
    ],
    gaps: [
      { from: 248, to: 255 },
      { from: 478, to: 486 }, { from: 516, to: 524 },
      { from: 722, to: 732 },
      { from: 1140, to: 1150 },
      { from: 1568, to: 1590 },
    ],
    obstacles: [
      { s: 395, kind: 'rock' },
      { s: 430, kind: 'log' },
      { s: 900, kind: 'branch', side: -1 },
      { s: 950, kind: 'rock' },
      { s: 1180, kind: 'rock' }, // 落石の谷: 着地のすぐ先
      { s: 1700, kind: 'log' },
      { s: 1740, kind: 'branch', side: 1 },
    ],
    coins: [
      ...line(25, 75), ...line(95, 210, 10), ...line(225, 242, 8), ...arc(244, 259, 3), ...line(265, 285, 10),
      ...line(300, 350, 10, 1),
      ...line(365, 388, 8), ...arc(390, 402, 3, 2), ...line(410, 422, 6), ...arc(425, 437, 3, 2, 'gold'), ...line(445, 470, 9),
      ...arc(474, 490, 3), ...line(495, 510, 7), ...arc(512, 528, 3), ...line(535, 555, 10),
      ...line(570, 610, 10), ...line(630, 690, 10),
      ...arc(717, 737, 3, 2.6, 'gold'), ...line(745, 840, 10),
      ...line(860, 890, 10), ...line(895, 905, 5, 1), ...line(915, 940, 10), ...arc(944, 956, 3, 2), ...line(965, 975, 10),
      ...line(990, 1040, 10, -1),
      ...line(1060, 1130, 10), ...arc(1136, 1154, 3), ...line(1160, 1170, 5), ...arc(1174, 1186, 3, 2, 'gold'), ...line(1195, 1205, 10),
      ...line(1220, 1320, 10), ...line(1340, 1390, 10, 1), ...line(1410, 1560, 10),
      ...arc(1564, 1592, 5, 3),
      // プレミアム: 大渓谷の向こうの空中(下り坂でダッシュして、全速で跳ぶと届く)
      { s: 1596, side: 0, h: 2.2, kind: 'premium' },
      ...line(1604, 1640, 9),
      ...line(1650, 1690, 10), ...arc(1694, 1706, 3, 2), ...line(1715, 1730, 8), ...line(1735, 1745, 5, -1), ...line(1755, 1775, 10),
    ],
    checkpoints: [{ s: 600, name: 'つり橋の小屋' }, { s: 1215, name: '尾根の小屋' }],
  },
};

/**
 * 8-4 超高速ダウンヒル(約1970m)。テーマは「ほとんど落ちるような急坂を、144km/h で」。
 * この面だけ最高速が上がる(ふつう 144km/h・ダッシュ 166km/h)。
 * いきなりの急降下 → こぶで空へ → 高速S字(ブレーキでなく傾けて回る) → こぶの先の急カーブ(浮かないよう減速)
 * → 垂直落下の坂 → 32m の大ジャンプ → 枝のスラローム → 大こぶからのスカイダイブ → ブレーキゾーン → 谷底の急カーブ
 * プレミアム: 大こぶの上の、高い空。ダッシュの全速で、こぶから飛びだしたときだけ届く。
 */
const LEVEL_8_4: CartLevel = {
  id: '8-4', title: '超高速ダウンヒル', summary: 'がけのような 急坂を、まっさかさま',
  intro: 'ここは がけのような 急坂！ 速さは 144km/h まで 出るよ',
  goalName: 'ふもとの里の駅',
  notes: [
    { s: 250, text: 'こぶだ！ 速いまま こえると、空へ とびだすよ' },
    { s: 435, text: '速いカーブは、ブレーキより かたむけ！ 内がわへ' },
    { s: 790, text: 'こぶの先に 急カーブ！ ブレーキで、浮かないように' },
    { s: 1255, text: '枝が 左右から 次々に！' },
    { s: 1525, text: '大こぶ！ ダッシュで とびこめば、高く 遠くへ' },
    { s: 1660, text: 'ブレーキゾーン！ 谷底の急カーブまでに 速さを おとそう' },
  ],
  track: {
    vMax: 40,
    segments: [
      { len: 60, slope: -2, terrain: 'ridge', name: '山頂の駅' },
      { len: 200, slope: -13, terrain: 'hillL', name: 'いきなりの 急降下' },
      { len: 24, slope: 7, terrain: 'ridge', name: 'こぶ' },
      { len: 160, slope: -15, terrain: 'ridge', name: '空へ とびだせ' },
      { len: 160, slope: -9, turn: 50, terrain: 'hillR', name: '高速S字' },
      { len: 160, slope: -9, turn: -55, terrain: 'hillL' },
      { len: 30, slope: -4, terrain: 'forest' },
      { len: 20, slope: 4, terrain: 'forest', name: 'こぶの先は 急カーブ' },
      { len: 40, slope: -10, terrain: 'forest' },
      { len: 70, slope: -3, turn: -85, terrain: 'cut', name: '森の急カーブ' },
      { len: 50, slope: -2, terrain: 'forest' },
      { len: 180, slope: -14, terrain: 'hillR', name: '垂直落下の坂' },
      { len: 100, slope: -1, terrain: 'canyon', name: '大ジャンプの谷' },
      { len: 160, slope: -8, terrain: 'forest', name: '枝のスラローム' },
      { len: 120, slope: -13, terrain: 'ridge', name: '最後の急降下' },
      { len: 22, slope: 6, terrain: 'ridge', name: '大こぶ' },
      { len: 110, slope: -14, terrain: 'ridge', name: 'スカイダイブ' },
      { len: 60, slope: -3, terrain: 'forest', name: 'ブレーキゾーン' },
      { len: 70, slope: -2, turn: 100, terrain: 'cut', name: '谷底の急カーブ' },
      { len: 60, slope: 3, terrain: 'forest', name: 'ふもとへの上り' },
      { len: 120, slope: -5, terrain: 'forest', name: 'ゴールへ' },
    ],
    gaps: [{ from: 1180, to: 1212 }],
    obstacles: [
      { s: 380, kind: 'rock' },
      { s: 1080, kind: 'rock' },
      { s: 1290, kind: 'branch', side: 1 }, { s: 1318, kind: 'branch', side: -1 },
      { s: 1346, kind: 'branch', side: 1 }, { s: 1374, kind: 'branch', side: -1 },
      { s: 1920, kind: 'log' },
    ],
    coins: [
      ...line(20, 55, 9), ...line(70, 250, 12),
      ...line(286, 316, 6, 0, 1.5), ...line(325, 340, 15), ...line(345, 372, 9), ...arc(374, 386, 3, 2), ...line(395, 435, 10),
      ...line(450, 590, 14, 1), ...line(612, 750, 14, -1),
      ...line(770, 790, 10), ...line(825, 845, 10), ...line(860, 910, 10, -1),
      ...line(930, 965, 9), ...line(985, 1070, 12), ...arc(1074, 1086, 3, 2), ...line(1100, 1170, 12),
      ...arc(1176, 1216, 6, 3.4, 'gold'),
      ...line(1225, 1280, 10), ...line(1284, 1296, 6, -1), ...line(1312, 1324, 6, 1), ...line(1340, 1352, 6, -1), ...line(1368, 1380, 6, 1),
      ...line(1395, 1525, 13),
      // 大こぶから飛んだ道すじにそって(ふつうに飛ぶと、だいたい取れる)
      ...[[1560, 1.3], [1566, 1.8], [1572, 2.5], [1578, 2.9], [1590, 2.6], [1596, 1.8]].map(([s, h]) => ({ s, side: 0 as const, h, kind: s === 1578 ? 'gold' as const : undefined })),
      // プレミアム: 大こぶの上の高い空(ダッシュの全速で飛びだしたときだけ届く)
      { s: 1584, side: 0, h: 4.6, kind: 'premium' },
      ...line(1615, 1660, 12), ...line(1670, 1715, 9),
      ...line(1735, 1785, 10, 1), ...line(1800, 1850, 10), ...line(1865, 1905, 10), ...arc(1914, 1926, 3, 2), ...line(1935, 1965, 10),
    ],
    checkpoints: [{ s: 935, name: '中腹の見はり小屋' }, { s: 1240, name: '谷の見はり台' }],
  },
};

/**
 * 8-5 崩れた線路(約1750m)。テーマは「こわれかけた廃線を、とびうつる」。
 * がたがた橋(小さな切れ目が3つ) → ずれた線路(右へ 2.4m。空中で傾けて寄せる) → 沈んだ線路(6m 下へ)
 * → 古い長い橋(近づくと崩れる) → ずれて沈んだ線路 → 尾根の廃線 → 最後の橋(2回 崩れる)
 * プレミアム: ずれた線路の上の、反対がわ(左)。いったん左へ傾けて取ってから、右へ寄せる。
 */
const LEVEL_8_5: CartLevel = {
  id: '8-5', title: '崩れた線路', summary: 'こわれかけた 廃線を、とびうつれ',
  intro: '使われなくなった 古い線路だ。こわれている所に 気をつけて！',
  goalName: '廃線の終点駅',
  notes: [
    { s: 195, text: 'がたがた橋！ 小さな 切れ目が 3つ。ポン・ポン・ポンと 跳ぼう' },
    { s: 455, text: '線路が 右に ずれてる！ 跳んだら 空中で 右へ かたむけて' },
    { s: 755, text: '線路が 崩れて 沈んでいる！ 下の線路へ とびうつれ' },
    { s: 965, text: '古い橋だ… 崩れたら すぐ ジャンプ！' },
    { s: 1165, text: '左に ずれて、しかも 沈んでいる！' },
    { s: 1455, text: '最後の橋も 古い… 2回 崩れるよ！' },
  ],
  track: {
    segments: [
      { len: 80, slope: -2, terrain: 'forest', name: '廃線の駅' },
      { len: 120, slope: -6, terrain: 'hillL', name: '草むらの下り' },
      { len: 130, slope: -1, terrain: 'canyon', name: 'がたがた橋' },
      { len: 70, slope: -3, turn: 55, terrain: 'hillR', name: '古いカーブ' },
      { len: 60, slope: -4, terrain: 'forest' },
      { len: 90, slope: -1, terrain: 'canyon', name: 'ずれた線路' },
      { len: 80, slope: -5, terrain: 'forest', name: '倒木の森' },
      { len: 70, slope: -2, turn: -70, terrain: 'cut', name: '岩かべのカーブ' },
      { len: 60, slope: -3, terrain: 'forest' },
      { len: 110, slope: -2, terrain: 'canyon', name: '沈んだ線路' },
      { len: 100, slope: -6, terrain: 'hillR', name: '崖ぞいの下り' },
      { len: 140, slope: -1, terrain: 'canyon', name: '古い長い橋' },
      { len: 60, slope: -3, turn: 45, terrain: 'hillL' },
      { len: 100, slope: -1, terrain: 'canyon', name: 'ずれて沈んだ線路' },
      { len: 120, slope: -10, terrain: 'ridge', name: '尾根の廃線' },
      { len: 70, slope: -2, turn: -95, terrain: 'hillR', name: '廃線の急カーブ' },
      { len: 170, slope: -1, terrain: 'canyon', name: '最後の崩れる橋' },
      { len: 120, slope: -3, terrain: 'forest', name: '終点の駅へ' },
    ],
    gaps: [
      { from: 220, to: 224 }, { from: 254, to: 258 }, { from: 288, to: 292 },
      { from: 490, to: 498, shift: 2.4 },
      { from: 790, to: 800, drop: 6 },
      { from: 1010, to: 1019, collapse: true },
      { from: 1215, to: 1225, shift: -2.6, drop: 4 },
      { from: 1500, to: 1508, collapse: true }, { from: 1545, to: 1555, collapse: true },
    ],
    obstacles: [
      { s: 440, kind: 'rock' },
      { s: 600, kind: 'log' }, { s: 625, kind: 'branch', side: 1 },
      { s: 910, kind: 'branch', side: -1 },
      { s: 1340, kind: 'rock' }, { s: 1380, kind: 'log' },
      { s: 1700, kind: 'log' },
    ],
    coins: [
      ...line(25, 75), ...line(95, 195, 10),
      ...line(205, 214, 9), ...arc(217, 227, 2, 2), ...line(234, 248, 7), ...arc(251, 261, 2, 2), ...line(268, 282, 7), ...arc(285, 295, 2, 2, 'gold'), ...line(302, 322, 10),
      ...line(345, 395, 10, 1), ...line(410, 430, 10), ...arc(434, 446, 3, 2), ...line(455, 480, 9),
      // ずれた線路: 空中のコインは、寄せる側(右)。体を傾けたまま取れる
      ...air([[494, 2.4], [498, 2.9], [502, 2.7]], 1),
      // プレミアム: ずれた線路の上の、反対がわ(左)
      { s: 492, side: -1, h: 1.9, kind: 'premium' },
      ...line(510, 590, 10), ...arc(594, 606, 3, 2), ...line(612, 618, 6), ...line(622, 628, 6, -1),
      ...line(645, 695, 10, -1), ...line(710, 780, 10),
      // 沈んだ線路: 下の線路へ とびうつる道すじにそって(線路が下がるぶん、高い)
      ...air([[794, 4.8], [800, 8.9, 'gold'], [806, 8.0], [812, 5.9]]), ...line(825, 900, 10), ...line(905, 915, 5, 1), ...line(925, 1000, 10),
      ...arc(1006, 1023, 3, 2), ...line(1030, 1105, 10),
      ...line(1125, 1165, 10, 1), ...line(1180, 1205, 9), ...air([[1219, 4.0], [1225, 6.9], [1231, 6.0], [1237, 3.9]], -1), ...line(1245, 1330, 10),
      ...arc(1334, 1346, 3, 2), ...line(1355, 1370, 8), ...arc(1374, 1386, 3, 2, 'gold'),
      ...line(1400, 1450, 10, -1), ...line(1465, 1490, 9), ...arc(1496, 1512, 3, 2), ...line(1520, 1535, 7), ...arc(1541, 1559, 3, 2), ...line(1570, 1690, 10),
      ...arc(1694, 1706, 3, 2), ...line(1715, 1745, 10),
    ],
    checkpoints: [{ s: 720, name: '信号小屋' }, { s: 1290, name: '鉄橋の見はり台' }],
  },
};

/**
 * 8-6 山岳トロッコ(約2000m)。テーマは「けわしい山を、こえていく」。
 * けわしい上り坂 → 長いトンネル(暗い・中にカーブと落石) → 出たらすぐ谷 → 雪の峠 → 雪の下りと急カーブ
 * → 天空の鉄橋(深い谷・右へ押す横風・途中に切れ目) → 暗いトンネルの中の急カーブ → 急降下 → 谷風の鉄橋(左へ押す風)
 * プレミアム: 天空の鉄橋の、風下がわ。風が弱まった一瞬に、風下へ傾けて取る(強い風のときに傾けると、あぶない)。
 */
const LEVEL_8_6: CartLevel = {
  id: '8-6', title: '山岳トロッコ', summary: 'トンネル・雪の峠・天空の鉄橋',
  intro: 'けわしい 山を こえて、向こうの 駅まで！',
  goalName: '峠の向こうの駅',
  notes: [
    { s: 65, text: 'けわしい 上り坂！ ダッシュを くり返して のぼろう' },
    { s: 225, text: 'トンネルだ！ 暗いから、岩に 気をつけて' },
    { s: 690, text: '雪の上は すべる！ ブレーキが 半分しか きかないよ。早めに おとそう' },
    { s: 440, text: 'トンネルを 出たら、すぐ 谷！ ジャンプの 用意' },
    { s: 965, text: '天空の鉄橋！ 強い 横風が 右へ 押してくる。左へ かたむけて こらえよう' },
    { s: 1330, text: '暗い トンネルの中で、急カーブ！' },
    { s: 1625, text: '谷風が 左へ 押してくる！ 右へ かたむけて、切れ目は ジャンプ' },
  ],
  track: {
    segments: [
      { len: 70, slope: -1, terrain: 'forest', name: '山のふもと駅' },
      { len: 130, slope: 4, terrain: 'forest', name: 'けわしい上り坂' },
      { len: 40, slope: 1, terrain: 'cut' },
      { len: 160, slope: -3, turn: 35, terrain: 'tunnel', name: '長いトンネル' },
      { len: 70, slope: -3, terrain: 'tunnel' },
      { len: 80, slope: -1, terrain: 'canyon', name: 'トンネルの先の谷' },
      { len: 120, slope: 3.5, terrain: 'ridge', snow: true, name: '雪の峠へ' },
      { len: 30, slope: 1, terrain: 'ridge', snow: true, name: '峠' },
      { len: 160, slope: -11, terrain: 'hillL', snow: true, name: '雪の下り' },
      { len: 70, slope: -2, turn: -95, terrain: 'cut', snow: true, name: '雪のカーブ' },
      { len: 50, slope: -2, terrain: 'forest', snow: true },
      { len: 280, slope: -3, terrain: 'gorge', wind: 11, name: '天空の鉄橋' },
      { len: 80, slope: -3, turn: 50, terrain: 'hillR' },
      { len: 100, slope: -3, turn: -90, terrain: 'tunnel', name: '暗いカーブのトンネル' },
      { len: 50, slope: -3, terrain: 'tunnel' },
      { len: 150, slope: -10, terrain: 'hillL', name: 'ふもとへの急降下' },
      { len: 200, slope: -3, terrain: 'gorge', wind: -11, name: '谷風の鉄橋' },
      { len: 120, slope: -4, terrain: 'forest', name: '峠の向こうの駅へ' },
    ],
    // 区間: 上り 70-200 / トンネル 240-470(カーブは 400 まで) / 谷 470-550 / 雪 550-980 / 天空の鉄橋 980-1260
    //       / トンネル 1340-1490(カーブは 1440 まで) / 急降下 1490-1640 / 谷風の鉄橋 1640-1840 / ゴール 1960
    gaps: [{ from: 500, to: 512 }, { from: 1170, to: 1180 }, { from: 1760, to: 1776 }],
    obstacles: [
      { s: 330, kind: 'rock' }, { s: 425, kind: 'rock' }, // トンネルの中の落石
      { s: 790, kind: 'branch', side: 1 }, { s: 840, kind: 'rock' },
      { s: 1465, kind: 'rock' }, // 暗いカーブを抜けた所
      { s: 1600, kind: 'log' },
      { s: 1910, kind: 'log' },
    ],
    coins: [
      ...line(20, 65, 9), ...line(80, 190, 11), ...line(205, 235, 10),
      ...line(250, 320, 10, 1), ...arc(324, 336, 3, 2), ...line(345, 395, 10, 1), ...arc(419, 431, 3, 2, 'gold'), ...line(440, 490, 10),
      ...arc(496, 516, 4, 2.4), ...line(525, 545, 10), ...line(560, 665, 11),
      ...line(680, 780, 10), ...line(785, 795, 5, -1), ...arc(834, 846, 3, 2), ...line(855, 858, 3),
      ...line(865, 925, 10, -1), ...line(935, 975, 10),
      // 天空の鉄橋: 風上(左)にコイン
      ...line(990, 1160, 10, -1), ...arc(1166, 1184, 3, 2.4, 'gold'), ...line(1190, 1235, 9, -1),
      // プレミアム: 風下(右)がわ。風が弱まった一瞬に
      { s: 1245, side: 1, h: 0.9, kind: 'premium' },
      ...line(1252, 1258, 6, -1),
      ...line(1270, 1330, 10, 1), ...line(1350, 1430, 10, -1), ...line(1445, 1455, 10), ...arc(1459, 1471, 3, 2), ...line(1478, 1488, 10),
      ...line(1500, 1590, 10), ...arc(1594, 1606, 3, 2), ...line(1615, 1635, 10),
      // 谷風の鉄橋: 風上(右)にコイン
      ...line(1650, 1750, 10, 1), ...arc(1756, 1780, 5, 2.6, 'gold'), ...line(1790, 1835, 9, 1),
      ...line(1850, 1900, 10), ...arc(1904, 1916, 3, 2), ...line(1925, 1955, 10),
    ],
    checkpoints: [{ s: 985, name: '峠の山小屋' }, { s: 1520, name: 'トンネルの出口' }],
  },
};

/**
 * 8-7 連続ジャンプ(約1880m)。テーマは「跳んで、跳んで、跳びつづける」。
 * ジャンプ台の谷 → 空中の線路(短い線路が続く。速すぎると次の切れ目に落ちる) → 森のジャンプ台(倒木を2本 とびこす)
 * → 大ジャンプ台(36m。台の上でジャンプ) → 下りの連続倒木 → 段々の谷(1段ずつ下へ) → ジグザグの線路(右へ・左へ)
 * → 大空へ(44m。ダッシュして、台の上でジャンプしないと届かない)
 * プレミアム: 森のジャンプ台の、ずっと上(高さ約8.5m)。乗るだけで倒木はこえられるが、台の上でジャンプしたときだけ届く。
 */
const LEVEL_8_7: CartLevel = {
  id: '8-7', title: '連続ジャンプ', summary: 'ジャンプ台で、谷から谷へ',
  intro: '跳んで、跳んで、跳びつづけろ！',
  goalName: '雲の上の駅',
  notes: [
    { s: 195, text: 'ジャンプ台だ！ 乗るだけで、高く とびだすよ' },
    { s: 375, text: '空中の線路！ 短い線路が 続くよ。速すぎると、次の切れ目に 落ちる' },
    { s: 760, text: '大ジャンプ台！ 台の上で ジャンプすると、もっと高く 遠くへ' },
    { s: 1145, text: '段々の谷！ 1段ずつ 下へ とびおりよう' },
    { s: 1365, text: 'ジグザグの線路！ 右へ、そして すぐ左へ' },
    { s: 1600, text: '最後の大空へ！ ダッシュして、台の上で ジャンプ！' },
  ],
  track: {
    // 区間: 助走 70-200 / ジャンプ台の谷 200-320 / 空中の線路 380-540 / 森 540-640 / 大ジャンプ台 770-910
    //       / 段々の谷 1150-1290 / ジグザグ 1370-1490 / 大空へ 1610-1770 / ゴール 1880
    segments: [
      { len: 70, slope: -2, terrain: 'forest', name: '出発の駅' },
      { len: 130, slope: -7, terrain: 'hillL', name: '助走の坂' },
      { len: 120, slope: -1, terrain: 'canyon', name: 'ジャンプ台の谷' },
      { len: 60, slope: -3, turn: 40, terrain: 'hillR' },
      { len: 160, slope: -1, terrain: 'canyon', name: '空中の線路' },
      { len: 100, slope: -6, terrain: 'forest', name: '森のジャンプ台' },
      { len: 70, slope: -2, turn: -70, terrain: 'cut', name: '岩のカーブ' },
      { len: 60, slope: -6, terrain: 'forest' },
      { len: 140, slope: -1, terrain: 'canyon', name: '大ジャンプ台' },
      { len: 120, slope: -8, terrain: 'hillL', name: '下りの連続倒木' },
      { len: 70, slope: -2, turn: 80, terrain: 'cut', name: '谷へのカーブ' },
      { len: 50, slope: -2, terrain: 'forest' },
      { len: 140, slope: -1, terrain: 'canyon', name: '段々の谷' },
      { len: 80, slope: -4, turn: -50, terrain: 'hillR' },
      { len: 120, slope: -1, terrain: 'canyon', name: 'ジグザグの線路' },
      { len: 120, slope: -7, terrain: 'ridge', name: '最後の助走' },
      { len: 160, slope: -1, terrain: 'gorge', name: '大空へ' },
      { len: 110, slope: -3, terrain: 'forest', name: '雲の上の駅へ' },
    ],
    gaps: [
      { from: 236, to: 258 },
      { from: 418, to: 430 }, { from: 445, to: 457 }, { from: 472, to: 484 }, { from: 499, to: 511 },
      { from: 808, to: 844 },
      { from: 1170, to: 1180, drop: 4 }, { from: 1205, to: 1215, drop: 4 }, { from: 1240, to: 1250, drop: 4 },
      { from: 1408, to: 1418, shift: 2.2 }, { from: 1440, to: 1450, shift: -2.2 },
      { from: 1650, to: 1694 },
    ],
    obstacles: [
      { s: 228, kind: 'ramp' },
      { s: 565, kind: 'ramp' }, { s: 578, kind: 'log' }, { s: 592, kind: 'log' },
      { s: 800, kind: 'ramp' },
      { s: 950, kind: 'log' }, { s: 975, kind: 'log' }, { s: 1000, kind: 'log' },
      { s: 1640, kind: 'ramp' },
      { s: 1830, kind: 'log' },
    ],
    coins: [
      ...line(20, 65, 9), ...line(80, 195, 11), ...line(205, 222, 8),
      ...air([[234, 3.4], [240, 4.9], [246, 5.4, 'gold'], [252, 4.9], [258, 3.4]]),
      ...line(268, 315, 9), ...line(330, 375, 10, 1), ...line(385, 412, 9),
      ...[418, 445, 472].flatMap(e => air([[e + 4, 2.3], [e + 10, 2.9]])), ...air([[503, 2.3], [509, 2.9, 'gold']]),
      ...line(435, 440, 5), ...line(462, 467, 5), ...line(489, 494, 5),
      // 森のジャンプ台: 乗るだけで倒木2本をこえる。プレミアムは、そのずっと上(台の上でジャンプしたときだけ届く)
      ...line(520, 556, 9), ...air([[571, 3.3], [577, 4.8], [589, 4.8], [595, 3.3]]),
      { s: 583, side: 0, h: 8.5, kind: 'premium' },
      ...line(605, 635, 10),
      ...line(650, 700, 10, -1), ...line(715, 792, 11),
      ...air([[808, 5.2], [816, 7.9], [824, 8.9, 'gold'], [832, 8.3], [840, 6.0]]),
      ...line(855, 905, 10), ...line(915, 940, 9), ...arc(944, 956, 3, 2), ...line(962, 968, 6), ...arc(969, 981, 3, 2),
      ...line(987, 993, 6), ...arc(994, 1006, 3, 2, 'gold'), ...line(1012, 1025, 7),
      ...line(1040, 1090, 10, 1), ...line(1105, 1162, 11),
      ...line(1185, 1200, 5), ...line(1220, 1235, 5), ...line(1255, 1285, 10),
      ...line(1300, 1360, 10, -1), ...line(1375, 1400, 9),
      ...air([[1412, 2.4], [1418, 2.9]], 1), ...line(1428, 1436, 8), ...air([[1444, 2.4], [1450, 2.9]], -1), ...line(1460, 1485, 9),
      ...line(1495, 1605, 11), ...line(1618, 1634, 8),
      ...air([[1655, 6.9], [1670, 8.9, 'gold'], [1685, 6.9], [1694, 3.8]]), ...line(1705, 1765, 10),
      ...line(1780, 1820, 10), ...arc(1824, 1836, 3, 2), ...line(1845, 1875, 10),
    ],
    checkpoints: [{ s: 725, name: '森の見はり台' }, { s: 1120, name: '谷の小屋' }],
  },
};

/**
 * 8-8 霧の山道(約1790m)。テーマは「見えない道を、灯りと音で読む」。
 * 霧の入口 → 見えないカーブ → 霧のS字 → 霧の谷 → 雲の上へ(霧が晴れて、雲海の尾根) → 霧へふたたび(急降下)
 * → 霧の急カーブ → 霧の古い橋(崩れる) → ずれた霧の線路 → 最後の下り(枝) → 最後の霧カーブ → 霧の晴れた駅
 * 霧の中の急カーブには、外がわに光る灯籠が並び、手前で鈴が鳴る。
 * プレミアム: 霧の中に立つ「灯籠の門」の下の空中。門が見えたら、すぐ跳ぶ。
 */
const LEVEL_8_8: CartLevel = {
  id: '8-8', title: '霧の山道', summary: '見えない道を、灯りと鈴の音で',
  intro: '霧の 山道だ。灯籠の 明かりと、鈴の 音を たよりに 進もう',
  goalName: '霧の晴れた駅',
  notes: [
    { s: 595, text: '霧を ぬけて、雲の上へ！' },
    { s: 880, text: 'また 霧の中へ… 急な下りの先に、急カーブ' },
    { s: 1160, text: '霧の中の 古い橋！ 崩れたら すぐ ジャンプ' },
    { s: 1395, text: 'ずれた線路！ 跳んだら 空中で 左へ' },
    { s: 1600, text: '最後の 霧の カーブ！' },
  ],
  track: {
    // 区間: 霧のカーブ 210-280・330-400・400-470 / 霧の谷 510-600 / 雲海の尾根 730-870 / 急降下 894-1034
    //       / 霧の急カーブ 1034-1114 / 古い橋 1164-1324 / ずれた線路 1384-1484 / 最後の霧カーブ 1604-1674 / ゴール 1794
    segments: [
      { len: 70, slope: -2, terrain: 'forest', fog: 0.3, name: '霧の入口' },
      { len: 140, slope: -6, terrain: 'hillL', fog: 0.7, name: '白い下り坂' },
      { len: 70, slope: -2, turn: 75, terrain: 'cut', fog: 0.95, name: '見えないカーブ' },
      { len: 50, slope: -3, terrain: 'forest', fog: 0.95 },
      { len: 70, slope: -2, turn: -75, terrain: 'hillR', fog: 1, name: '霧のS字' },
      { len: 70, slope: -2, turn: 75, terrain: 'hillL', fog: 1 },
      { len: 40, slope: -2, terrain: 'forest', fog: 0.9 },
      { len: 90, slope: -1, terrain: 'canyon', fog: 0.8, name: '霧の谷' },
      { len: 130, slope: 5, terrain: 'ridge', fog: 0.2, name: '雲の上へ' },
      { len: 140, slope: -2, terrain: 'ridge', cloudSea: true, name: '雲海の尾根' },
      { len: 24, slope: 6, terrain: 'ridge', name: '雲海のこぶ' },
      { len: 140, slope: -12, terrain: 'hillR', fog: 0.6, name: '霧へ ふたたび' },
      { len: 80, slope: -2, turn: -95, terrain: 'cut', fog: 1, name: '霧の急カーブ' },
      { len: 50, slope: -2, terrain: 'forest', fog: 1 },
      { len: 160, slope: -1, terrain: 'canyon', fog: 0.9, name: '霧の古い橋' },
      { len: 60, slope: -3, turn: 60, terrain: 'hillL', fog: 0.8 },
      { len: 100, slope: -1, terrain: 'canyon', fog: 0.8, name: 'ずれた霧の線路' },
      { len: 120, slope: -8, terrain: 'ridge', fog: 0.4, name: '最後の下り' },
      { len: 70, slope: -2, turn: 90, terrain: 'cut', fog: 0.9, name: '最後の霧カーブ' },
      { len: 120, slope: -3, terrain: 'forest', name: '霧の晴れた駅へ' },
    ],
    gaps: [
      { from: 545, to: 557 },
      { from: 1200, to: 1209, collapse: true },
      { from: 1425, to: 1435, shift: -2.4 },
    ],
    obstacles: [
      { s: 315, kind: 'rock' },
      { s: 640, kind: 'log' },
      { s: 1150, kind: 'rock' },
      { s: 1530, kind: 'branch', side: 1 }, { s: 1560, kind: 'branch', side: -1 },
      { s: 1740, kind: 'log' },
    ],
    lanternGates: [490],
    coins: [
      ...line(20, 65, 9), ...line(80, 200, 10),
      ...line(220, 270, 10, 1), ...line(285, 305, 10), ...arc(309, 321, 3, 2), ...line(330, 395, 9, -1), ...line(405, 465, 9, 1),
      // プレミアム: 霧の中の灯籠の門の下の空中(門が見えたら、すぐ跳ぶ)
      { s: 490, side: 0, h: 3.0, kind: 'premium' },
      ...line(500, 535, 9), ...arc(541, 561, 4, 2.4, 'gold'), ...line(565, 595, 10),
      ...line(610, 630, 10), ...arc(634, 646, 3, 2), ...line(655, 725, 10),
      ...line(735, 865, 10), ...air([[872, 1.6], [880, 1.9], [888, 1.6]]),
      ...line(900, 1030, 10), ...line(1040, 1110, 10, -1), ...line(1120, 1140, 10), ...arc(1144, 1156, 3, 2),
      ...line(1165, 1190, 9), ...arc(1196, 1213, 3, 2, 'gold'), ...line(1220, 1320, 10),
      ...line(1330, 1380, 10, 1), ...line(1390, 1415, 9), ...air([[1429, 2.4], [1435, 2.9], [1441, 2.6]], -1), ...line(1450, 1480, 10),
      ...line(1490, 1520, 10), ...line(1525, 1535, 5, -1), ...line(1545, 1550, 5), ...line(1555, 1565, 5, 1), ...line(1575, 1600, 9),
      ...line(1610, 1670, 10, 1), ...line(1685, 1730, 9), ...arc(1734, 1746, 3, 2), ...line(1755, 1790, 9),
    ],
    checkpoints: [{ s: 700, name: '雲の上の小屋' }, { s: 1140, name: '霧の見はり小屋' }],
  },
};

/**
 * 8-9 鹿の全力疾走(約1900m)。テーマは「後ろから大岩！ 鹿せんべいで、全力で にげる」。
 * 8-4 と反対に、上り坂が主役。上り坂ではトロッコがおそくなり、後ろから転がってくる大岩が追いついてくる。
 * 鹿せんべい坂(駅を出てすぐ大岩。せんべいを食べて全力疾走) → にげろ！(下り) → 大岩の谷(大岩は谷へ落ちる)
 * → つづら折り(上りのカーブと枝) → 尾根の急降下と急カーブ → ふたたび大岩 → 上りの谷(せんべいで速さをつけて跳ぶ)
 * → 大岩の落ちる谷 → 鹿の全力疾走(せんべいを続けて食べる) → 鹿のこぶ → 全力の大ジャンプ(28m)
 * プレミアム: 鹿のこぶの向こうの空。せんべいを続けて食べて全速になり、こぶのてっぺんでジャンプしたときだけ届く。
 */
const LEVEL_8_9: CartLevel = {
  id: '8-9', title: '鹿の全力疾走', summary: '後ろから 大岩！ せんべいで 全力疾走',
  intro: 'ゴゴゴ… 何の音？ 鹿が 耳を ぴんと 立てた！',
  goalName: '鹿の里の駅',
  notes: [
    { s: 85, text: '鹿せんべいを 食べると、鹿が 全力で 走る！ 横のは 体を かたむけて 取ろう' },
    { s: 545, text: 'つづら折りの 上り坂。枝に 気をつけて' },
    { s: 940, text: 'また 大岩だ！ 上りの 切れ目は、せんべいで 速さを つけて とびこえろ' },
    { s: 1385, text: '鹿の 全力疾走！ せんべいを 続けて 食べよう' },
    { s: 1540, text: 'こぶの てっぺんで ジャンプすると、遠くまで とべるよ' },
  ],
  track: {
    // 区間: せんべい坂 90-290 / にげろ 315-415 / 大岩の谷 415-505 / つづら折り 555-695 / 急降下 695-825 / 急カーブ 825-895
    //       / 大岩の上り坂 1005-1145 / 上りの谷 1145-1215 / 大岩の落ちる谷 1285-1365 / 全力疾走 1395-1555 / こぶ 1555-1577
    //       / こぶの向こう 1577-1657 / 大ジャンプ 1697-1797 / ゴール 1897
    segments: [
      { len: 60, slope: 0, terrain: 'forest', name: '谷の駅' },
      { len: 30, slope: 2, terrain: 'forest' },
      { len: 200, slope: 6, terrain: 'hillR', name: '鹿せんべい坂' },
      { len: 25, slope: 1, terrain: 'ridge', name: '峠' },
      { len: 100, slope: -8, terrain: 'ridge', name: 'にげろ！' },
      { len: 90, slope: -1, terrain: 'canyon', name: '大岩の谷' },
      { len: 50, slope: -2, terrain: 'forest' },
      { len: 70, slope: 3, turn: 60, terrain: 'cut', name: 'つづら折り' },
      { len: 70, slope: 3, turn: -60, terrain: 'cut' },
      { len: 130, slope: -9, terrain: 'hillL', name: '尾根の急降下' },
      { len: 70, slope: -2, turn: -95, terrain: 'cut', name: '尾根の急カーブ' },
      { len: 50, slope: -1, terrain: 'forest' },
      { len: 60, slope: -2, terrain: 'forest', name: 'ふたたび 大岩' },
      { len: 140, slope: 6, terrain: 'hillL', name: '大岩の上り坂' },
      { len: 70, slope: 3, terrain: 'canyon', name: '上りの谷' },
      { len: 70, slope: -7, terrain: 'ridge' },
      { len: 80, slope: -1, terrain: 'canyon', name: '大岩の落ちる谷' },
      { len: 30, slope: -2, terrain: 'forest' },
      { len: 160, slope: -1.5, terrain: 'ridge', name: '鹿の全力疾走' },
      { len: 22, slope: 8, terrain: 'ridge', name: '鹿のこぶ' },
      { len: 80, slope: -14, terrain: 'ridge', name: 'こぶの向こう' },
      { len: 40, slope: -2, terrain: 'ridge' },
      { len: 180, slope: -1, terrain: 'canyon', name: '全力の 二段ジャンプ' },
      { len: 100, slope: -2, terrain: 'forest', name: '鹿の里の駅へ' },
    ],
    gaps: [{ from: 450, to: 460 }, { from: 1180, to: 1189 }, { from: 1315, to: 1325 }, { from: 1727, to: 1759 }, { from: 1810, to: 1842 }],
    chases: [
      { from: 70, to: 450, v: 19, behind: 60, kind: 'boulder' },
      { from: 955, to: 1315, v: 20, behind: 45, kind: 'boulder' },
    ],
    obstacles: [
      { s: 95, kind: 'senbei' }, { s: 165, kind: 'senbei', side: -1 }, { s: 235, kind: 'senbei', side: 1 },
      { s: 370, kind: 'rock' },
      { s: 590, kind: 'branch', side: -1 }, { s: 660, kind: 'branch', side: 1 },
      { s: 760, kind: 'rock' },
      { s: 985, kind: 'rock' },
      { s: 1035, kind: 'senbei', side: -1 }, { s: 1100, kind: 'senbei' }, { s: 1160, kind: 'senbei' },
      { s: 1405, kind: 'senbei' }, { s: 1435, kind: 'senbei', side: -1 }, { s: 1465, kind: 'senbei', side: 1 }, { s: 1495, kind: 'senbei', side: -1 }, { s: 1525, kind: 'senbei' },
      // 二段ジャンプの間のせんべい(1つ目でダッシュを使うと、2つ目までに待ち時間が終わらない)
      { s: 1700, kind: 'senbei' }, { s: 1785, kind: 'senbei' },
      { s: 1930, kind: 'log' },
    ],
    coins: [
      ...line(20, 85, 9), ...line(90, 100, 10), ...line(115, 165, 10), ...line(170, 180, 5, -1), ...line(190, 235, 9), ...line(240, 250, 5, 1), ...line(260, 310, 10),
      ...line(325, 360, 9), ...arc(364, 376, 3, 2), ...line(385, 410, 9), ...line(420, 442, 8), ...arc(446, 464, 3, 2.4, 'gold'), ...line(470, 500, 10), ...line(510, 550, 10),
      ...line(562, 580, 9, 1), ...line(595, 620, 9, 1), ...line(635, 652, 9, -1), ...line(665, 690, 9, -1),
      ...line(705, 750, 11), ...arc(754, 766, 3, 2), ...line(775, 820, 11), ...line(835, 885, 10, -1),
      ...line(900, 970, 10), ...arc(979, 991, 3, 2), ...line(998, 1020, 8),
      ...line(1030, 1040, 5, -1), ...line(1048, 1172, 9), ...arc(1176, 1193, 3, 2, 'gold'), ...line(1198, 1210, 6),
      ...line(1220, 1280, 10), ...line(1290, 1308, 9), ...arc(1311, 1329, 3, 2.4), ...line(1335, 1390, 9),
      ...line(1410, 1422, 6), ...line(1430, 1440, 5, -1), ...line(1446, 1452, 6), ...line(1460, 1470, 5, 1), ...line(1476, 1482, 6), ...line(1490, 1500, 5, -1), ...line(1505, 1550, 9),
      ...line(1558, 1570, 6),
      // プレミアム: こぶの向こうの空(全速で、こぶのてっぺんでジャンプしたときだけ届く)
      { s: 1614, side: 0, h: 10.6, kind: 'premium' },
      ...line(1585, 1655, 10), ...line(1662, 1720, 9), ...arc(1724, 1762, 5, 2.6, 'gold'), ...line(1768, 1802, 8), ...arc(1807, 1845, 5, 2.6, 'gold'),
      ...line(1852, 1920, 10), ...arc(1924, 1936, 3, 2), ...line(1942, 1972, 9),
    ],
    checkpoints: [{ s: 530, name: 'つり橋の小屋' }, { s: 920, name: '炭焼き小屋' }],
  },
};

/**
 * 8-10 奈良山脈 大滑降(約2240m)。WORLD 8 の さいご。山頂の雪から、夕日の奈良の駅まで、山脈をまるごと すべりおりる。
 * なだれの急斜面(なだれが追ってくる) → 雪の大カーブ(雪でブレーキがききにくい) → なだれよけトンネル(逃げこむ)
 * → 天空の大鉄橋(横風・崩れる橋・ジャンプ台) → 紅葉のスラローム → 大こぶの先の急カーブ → 霧の谷(ずれた線路)
 * → 最後の大滑降 → 鹿の全力疾走(せんべい) → 奈良の大渓谷(64m。ダッシュ+台の上でジャンプ)
 * 下るにつれて、空が夕焼けになっていく。
 * プレミアム: 奈良の大渓谷の向こうの空。せんべいを食べて全速になり、台の上でジャンプしたときだけ届く。
 */
const LEVEL_8_10: CartLevel = {
  id: '8-10', title: '奈良山脈 大滑降', summary: '山頂の雪から、夕日の奈良まで',
  intro: '奈良山脈の 頂上だ！ ふもとの 奈良の駅まで、一気に すべりおりよう！',
  goalName: '夕日の奈良の駅',
  notes: [
    { s: 430, text: '雪の大カーブ！ 雪で ブレーキが ききにくい。早めに おとそう' },
    { s: 590, text: 'トンネルへ 逃げこめ！' },
    { s: 850, text: '古い鉄橋だ… 崩れたら ジャンプ！ 横風にも 気をつけて' },
    { s: 960, text: 'ジャンプ台！ 台の上で ジャンプ' },
    { s: 1290, text: 'こぶの先は 急カーブ！ ブレーキ' },
    { s: 1485, text: '霧の谷！ ずれた線路は、空中で 右へ' },
    { s: 1785, text: '最後の 全力疾走！ せんべいを 食べて、台の上で ジャンプ！' },
  ],
  track: {
    vMax: 36,
    // 区間: なだれ 110-614 / 雪のカーブ 454-534 / トンネル 614-794 / 天空の大鉄橋 794-1074 / スラローム 1144-1304 / 大こぶ 1304-1328
    //       / 夕日の急カーブ 1368-1438 / 霧の谷 1488-1588 / 最後の大滑降 1658-1798 / 全力疾走 1798-1958 / 奈良の大渓谷 1958-2118 / ゴール 2238
    segments: [
      { len: 70, slope: -2, terrain: 'ridge', snow: true, dusk: 0, name: '奈良山脈の 頂上駅' },
      { len: 200, slope: -12, terrain: 'hillL', snow: true, dusk: 0, name: 'なだれの急斜面' },
      { len: 24, slope: 6, terrain: 'ridge', snow: true, dusk: 0, name: 'なだれの こぶ' },
      { len: 160, slope: -13, terrain: 'ridge', snow: true, dusk: 0.05, name: 'まっさかさま' },
      { len: 80, slope: -3, turn: 70, terrain: 'cut', snow: true, dusk: 0.1, name: '雪の大カーブ' },
      { len: 80, slope: -8, terrain: 'hillR', snow: true, dusk: 0.1 },
      { len: 150, slope: -4, turn: -40, terrain: 'tunnel', dusk: 0.15, name: 'なだれよけトンネル' },
      { len: 30, slope: -3, terrain: 'tunnel', dusk: 0.2 },
      { len: 280, slope: -2, terrain: 'gorge', wind: -10, dusk: 0.3, name: '天空の大鉄橋' },
      { len: 70, slope: -4, turn: 50, terrain: 'hillR', dusk: 0.4 },
      { len: 160, slope: -9, terrain: 'forest', dusk: 0.5, name: '紅葉のスラローム' },
      { len: 24, slope: 6, terrain: 'ridge', dusk: 0.55, name: '大こぶ' },
      { len: 40, slope: -10, terrain: 'ridge', dusk: 0.55 },
      { len: 70, slope: -2, turn: -90, terrain: 'cut', dusk: 0.6, name: '夕日の急カーブ' },
      { len: 50, slope: -2, terrain: 'forest', dusk: 0.62 },
      { len: 100, slope: -1, terrain: 'canyon', fog: 0.8, dusk: 0.65, name: '霧の谷' },
      { len: 70, slope: -5, turn: 60, terrain: 'hillL', fog: 0.6, dusk: 0.7 },
      { len: 140, slope: -10, terrain: 'ridge', dusk: 0.8, name: '最後の大滑降' },
      { len: 160, slope: -2, terrain: 'ridge', dusk: 0.9, name: '鹿の全力疾走' },
      { len: 160, slope: -1, terrain: 'gorge', dusk: 1, name: '奈良の大渓谷' },
      { len: 120, slope: -3, terrain: 'forest', dusk: 1, name: '夕日の奈良の駅へ' },
    ],
    gaps: [
      { from: 880, to: 889, collapse: true }, { from: 995, to: 1031 },
      { from: 1525, to: 1535, shift: 2.4 },
      { from: 1980, to: 2044 },
    ],
    chases: [{ from: 110, to: 614, v: 33, behind: 40, kind: 'avalanche' }],
    obstacles: [
      { s: 160, kind: 'senbei' },
      { s: 200, kind: 'rock' },
      { s: 778, kind: 'rock' },
      { s: 990, kind: 'ramp' },
      { s: 1180, kind: 'branch', side: 1 }, { s: 1210, kind: 'branch', side: -1 }, { s: 1240, kind: 'branch', side: 1 }, { s: 1270, kind: 'branch', side: -1 },
      { s: 1810, kind: 'senbei' }, { s: 1840, kind: 'senbei', side: -1 }, { s: 1870, kind: 'senbei', side: 1 }, { s: 1900, kind: 'senbei', side: -1 }, { s: 1930, kind: 'senbei' },
      { s: 1975, kind: 'ramp' },
      { s: 2190, kind: 'log' },
    ],
    coins: [
      ...line(20, 65, 9), ...line(80, 190, 12), ...arc(194, 206, 3, 2), ...line(215, 265, 12), ...line(272, 284, 6),
      ...line(300, 450, 12), ...line(460, 530, 10, 1), ...line(540, 610, 10),
      ...line(620, 760, 10, -1), ...line(766, 772, 6), ...arc(772, 784, 3, 2), ...line(790, 792, 2),
      // 天空の大鉄橋: 左へ押す風。風上(右)にコイン
      ...line(800, 870, 10, 1), ...arc(876, 893, 3, 2, 'gold'), ...line(900, 980, 10, 1),
      // ジャンプ台の道すじ(風上へ傾けたまま飛ぶので、右がわ)
      ...air([[1000, 6.0], [1010, 8.0], [1020, 8.8, 'gold'], [1030, 7.9], [1040, 5.6]], 1),
      // プレミアム: 台の上でジャンプした道すじの、ずっと下。ダッシュの速さで、台に乗るだけで とびこえたときだけ通る
      { s: 1012, side: 1, h: 4.4, kind: 'premium' },
      ...line(1040, 1070, 10, 1),
      ...line(1080, 1140, 10, 1), ...line(1150, 1172, 8),
      ...line(1176, 1184, 4, -1), ...line(1206, 1214, 4, 1), ...line(1236, 1244, 4, -1), ...line(1266, 1274, 4, 1), ...line(1285, 1300, 8),
      ...line(1306, 1326, 10), ...line(1332, 1365, 11), ...line(1375, 1435, 10, -1), ...line(1442, 1482, 10),
      ...line(1492, 1518, 9), ...air([[1529, 2.4], [1535, 2.9], [1541, 2.6]], 1), ...line(1550, 1585, 9),
      ...line(1595, 1650, 10, 1), ...line(1665, 1795, 13),
      ...line(1800, 1806, 6), ...line(1835, 1845, 5, -1), ...line(1865, 1875, 5, 1), ...line(1895, 1905, 5, -1), ...line(1915, 1925, 10), ...line(1940, 1970, 10),
      // 奈良の大渓谷: 台の上でジャンプした道すじ
      ...air([[1990, 7.0], [2000, 9.0], [2010, 9.6, 'gold'], [2020, 9.0], [2030, 7.0], [2040, 4.6, 'gold']]),
      ...line(2055, 2115, 10), ...line(2125, 2180, 10), ...arc(2184, 2196, 3, 2), ...line(2205, 2235, 10),
    ],
    checkpoints: [{ s: 810, name: 'トンネルの出口' }, { s: 1460, name: '夕日の見はり台' }],
  },
};

export const CART_LEVELS: CartLevel[] = [LEVEL_8_1, LEVEL_8_2, LEVEL_8_3, LEVEL_8_4, LEVEL_8_5, LEVEL_8_6, LEVEL_8_7, LEVEL_8_8, LEVEL_8_9, LEVEL_8_10];

// ==== 追いかけっこ(仲間の鹿の面。持っている鹿で開く。2026-11-22 Owner案) ====
// 鹿の乗ったトロッコが、坂を勝手に下っていく。Spra のトロッコで追いついて連結し、谷のふち(cliff)より手前で止める。
// 分かれ道は、鹿のトロッコが行った側(鈴の音・見えるトロッコ)へ体を傾ける。まちがえると古いレールで おそくなる。
// チェックポイントは無い(追いかけっこは、はじめから)。
// 2026-11-22 Owner: 「コースが短い・外ばかりで単調」→ 約3000m に のばし、鉱山のトンネルを多く、最高速も上げた。
// 面は「区間の並び」で書き、分かれ道・障害物・コインの位置は pursuitTrack が計算する(長さを変えても ずれない)。

/**
 * 追いかけっこの1区間。turn があればカーブ。fork=この まっすぐな区間に分かれ道(鹿が行く側)。
 * obs=障害物([区間の頭からの距離, 種類, 枝の向き])。premium=プレミアムコイン(区間の頭からの距離。岩の上を跳ぶ所)。
 * gap=線路の切れ目([区間の頭からの距離, 長さ])。cliff=谷(この区間の頭が 谷のふち)
 */
type PSec = {
  len: number; slope: number; turn?: number; terrain?: Terrain; name?: string;
  fork?: -1 | 1; obs?: [number, 'rock' | 'log' | 'branch', (-1 | 1)?][]; premium?: number; gap?: [number, number];
  fog?: number; snow?: boolean; dusk?: number; cliff?: boolean;
};
/** 分かれ道は、まっすぐな区間の 頭から35m の所から(前後のカーブと はなす) */
const FORK_IN = 35;
/** 跳ぶもの(岩・倒木・切れ目)は、まっすぐな区間の 頭から20m〜終わりの45m手前まで(速いと1回で30m以上とぶ。カーブに着地しない) */
const JUMP_IN = 20, JUMP_OUT = 45;

function pursuitTrack(secs: PSec[], pu: Omit<Pursuit, 'forks' | 'cliff'>, vMax: number): TrackDef {
  const segments: TrackDef['segments'] = [], obstacles: TrackDef['obstacles'] = [], coins: C[] = [], gaps: Gap[] = [], forks: Fork[] = [];
  let s = 0, cliff = 0;
  for (const g of secs) {
    segments.push({ len: g.len, slope: g.slope, turn: g.turn, terrain: g.terrain, name: g.name, fog: g.fog, snow: g.snow, dusk: g.dusk });
    if (g.cliff) { cliff = s; gaps.push({ from: s, to: s + 90 }); }
    if (g.fork) forks.push({ at: s + FORK_IN, len: Math.min(170, g.len - 2 * FORK_IN), correct: g.fork });
    const jumps = [...(g.obs ?? []).filter(o => o[1] !== 'branch').map(o => o[0]), ...(g.gap ? [g.gap[0], g.gap[0] + g.gap[1]] : [])];
    if (jumps.length && (g.turn || g.fork || jumps.some(at => at < JUMP_IN || at > g.len - JUMP_OUT))) throw new Error(`跳ぶものは まっすぐな所に: ${g.name}`);
    for (const [at, kind, side] of g.obs ?? []) obstacles.push(side ? { s: s + at, kind, side } : { s: s + at, kind });
    if (g.gap) gaps.push({ from: s + g.gap[0], to: s + g.gap[0] + g.gap[1] });
    if (g.premium !== undefined) coins.push({ s: s + g.premium, side: 0, h: 2.7, kind: 'premium' });
    // コイン: 分かれ道・谷では出さない。障害物・切れ目の近くは あける。トンネルの中は 左右に寄せる(傾けて取る)
    if (!g.fork && !g.cliff) {
      const tunnel = g.terrain === 'tunnel';
      for (let q = s + 14; q < s + g.len - 12; q += 11) {
        const near = (g.obs ?? []).some(([at]) => Math.abs(s + at - q) < 14) || (g.gap && q > s + g.gap[0] - 14 && q < s + g.gap[0] + g.gap[1] + 10) || (g.premium !== undefined && Math.abs(s + g.premium - q) < 6);
        if (!near) coins.push({ s: q, side: tunnel && !g.turn ? (Math.floor(q / 60) % 2 ? 1 : -1) : 0, h: 0.9 });
      }
    }
    s += g.len;
  }
  coins.sort((a, b) => a.s - b.s);
  return { vMax, segments, gaps, obstacles, coins, pursuit: { ...pu, cliff, forks } };
}

/** 追いかけっこの面を作る */
const pursuit = (id: string, friend: string, name: string, summary: string, intro: string, note: string, secs: PSec[], lead: number, deerCap: number, vMax = 33): CartLevel => ({
  id, title: `${name}を おいかけろ`, summary, intro, goalName: '谷の手前で 止める',
  notes: [{ s: 60, text: note }],
  track: pursuitTrack(secs, { friend, lead, deerCap, deerStart: 24 }, vMax),
});

/** 8-11 Spraの鹿(緑の森と 鉱山。基本: 分かれ道3つ・トンネル3つ・岩と倒木) */
const LEVEL_8_11 = pursuit('8-11', 'spra', 'Spraの鹿', '緑の森と 鉱山を ぬけて、暴走トロッコを 止めろ', 'Spraの鹿の トロッコが 走りだした！ 追いかけて！', '分かれ道は 鈴の音が する方へ。トンネルは 暗いよ', [
  { len: 90, slope: -2, terrain: 'forest', name: '若葉の森' },
  { len: 220, slope: -8, terrain: 'hillL', name: '若葉の下り坂', obs: [[120, 'rock']] },
  { len: 110, slope: -3, turn: 70, terrain: 'hillL', name: 'しげみのカーブ' },
  { len: 230, slope: -4, terrain: 'forest', name: '分かれ道の森', fork: 1 },
  { len: 160, slope: -6, terrain: 'tunnel', name: '鉱山トンネル', obs: [[70, 'rock']] },
  { len: 120, slope: -4, turn: -45, terrain: 'tunnel', name: '曲がる坑道' },
  { len: 200, slope: -8, terrain: 'hillR', name: 'みどりの急坂', obs: [[60, 'branch', 1], [130, 'rock']] },
  { len: 110, slope: -3, turn: -75, terrain: 'cut', name: 'こけむした切り通し' },
  { len: 240, slope: -5, terrain: 'ridge', name: '尾根の分かれ道', fork: -1 },
  { len: 200, slope: -7, terrain: 'tunnel', name: 'ふかい坑道', obs: [[50, 'log'], [140, 'rock']] },
  { len: 120, slope: -4, turn: 55, terrain: 'tunnel', name: '坑道の大カーブ' },
  { len: 170, slope: -9, terrain: 'forest', name: '森への 一直線', obs: [[80, 'rock']], premium: 83 },
  { len: 120, slope: -3, turn: 80, terrain: 'forest', name: '大きなカーブ' },
  { len: 240, slope: -5, terrain: 'forest', name: '最後の分かれ道', fork: 1 },
  { len: 180, slope: -6, terrain: 'tunnel', name: '出口の坑道', obs: [[90, 'log']] },
  { len: 100, slope: -4, turn: -45, terrain: 'tunnel' },
  { len: 240, slope: -8, terrain: 'forest', name: 'がけへの 急坂', obs: [[90, 'rock'], [160, 'branch', -1]] },
  { len: 110, slope: -3, turn: -70, terrain: 'hillL', name: 'がけっぷちのカーブ' },
  { len: 220, slope: -6, terrain: 'ridge', name: 'がけへの 一直線', obs: [[100, 'log']] },
  { len: 160, slope: -2, terrain: 'gorge', name: '谷', cliff: true },
], 400, 31);


/** 8-12 Lumiの鹿(黄色い いちょうの森と 霧。霧で前が見えない。分かれ道は 霧の中に3つ。たよりは 鈴の音) */
const LEVEL_8_12 = pursuit('8-12', 'lumi', 'Lumiの鹿', '霧の いちょう坂と 鉱山。見えない分かれ道は、鈴の音で', 'Lumiの鹿の トロッコが 霧の中へ！ 鈴の音を たよりに 追いかけて！', '霧の分かれ道は、見えなくても 鈴の音が する方へ', [
  { len: 90, slope: -2, terrain: 'forest', fog: 0.2, name: 'いちょうの森' },
  { len: 220, slope: -8, terrain: 'hillL', fog: 0.4, name: '黄色い下り坂', obs: [[110, 'rock']] },
  { len: 110, slope: -3, turn: 70, terrain: 'hillL', fog: 0.6, name: '霧のカーブ' },
  { len: 240, slope: -4, terrain: 'forest', fog: 0.95, name: '霧の分かれ道', fork: -1 },
  { len: 180, slope: -6, terrain: 'tunnel', name: '金色の坑道', obs: [[60, 'log'], [130, 'rock']] },
  { len: 110, slope: -4, turn: -50, terrain: 'tunnel', name: '曲がる坑道' },
  { len: 200, slope: -8, terrain: 'hillR', fog: 0.5, name: 'いちょうの急坂', obs: [[70, 'branch', -1], [140, 'rock']], premium: 143 },
  { len: 110, slope: -3, turn: -70, terrain: 'cut', fog: 0.7, name: '切り通し' },
  { len: 240, slope: -4, terrain: 'ridge', fog: 1, name: 'まっ白な尾根', fork: 1 },
  { len: 200, slope: -7, terrain: 'tunnel', name: '霧よけの坑道', obs: [[50, 'rock'], [150, 'log']] },
  { len: 120, slope: -4, turn: 60, terrain: 'tunnel', name: '坑道の大カーブ' },
  { len: 180, slope: -8, terrain: 'forest', fog: 0.4, name: '黄色い一直線', obs: [[90, 'rock']] },
  { len: 110, slope: -3, turn: 75, terrain: 'forest', fog: 0.7, name: '大きなカーブ' },
  { len: 240, slope: -5, terrain: 'forest', fog: 0.95, name: '最後の霧の分かれ道', fork: -1 },
  { len: 180, slope: -6, terrain: 'tunnel', name: '出口の坑道', obs: [[80, 'log']] },
  { len: 100, slope: -4, turn: -50, terrain: 'tunnel' },
  { len: 240, slope: -8, terrain: 'forest', fog: 0.3, name: 'がけへの 急坂', obs: [[80, 'rock'], [170, 'branch', 1]] },
  { len: 110, slope: -3, turn: -65, terrain: 'hillL', fog: 0.5, name: 'がけっぷちのカーブ' },
  { len: 220, slope: -6, terrain: 'ridge', fog: 0.2, name: 'がけへの 一直線', obs: [[110, 'log']] },
  { len: 160, slope: -2, terrain: 'gorge', name: '谷', cliff: true },
], 420, 31);

/** 8-13 Momoの鹿(さくら並木と 鉱山。分かれ道が 5つ) */
const LEVEL_8_13 = pursuit('8-13', 'momo', 'Momoの鹿', 'さくら並木と 鉱山。分かれ道が 5つ', 'Momoの鹿の トロッコが さくら並木へ！ 分かれ道が 多いよ！', '分かれ道が 5つ！ 毎回 鈴の音を 聞いて', [
  { len: 80, slope: -2, terrain: 'forest', name: 'さくらの駅' },
  { len: 200, slope: -8, terrain: 'hillL', name: '花びらの下り坂', obs: [[100, 'rock']], premium: 103 },
  { len: 230, slope: -4, terrain: 'forest', name: '一つめの分かれ道', fork: 1 },
  { len: 110, slope: -3, turn: 70, terrain: 'hillR', name: 'さくらのカーブ' },
  { len: 230, slope: -5, terrain: 'ridge', name: '二つめの分かれ道', fork: -1 },
  { len: 180, slope: -6, terrain: 'tunnel', name: '花の坑道', obs: [[60, 'rock'], [130, 'log']] },
  { len: 110, slope: -4, turn: -55, terrain: 'tunnel', name: '曲がる坑道' },
  { len: 230, slope: -5, terrain: 'forest', name: '三つめの分かれ道', fork: -1 },
  { len: 110, slope: -3, turn: -60, terrain: 'cut', name: '切り通し' },
  { len: 180, slope: -8, terrain: 'hillL', name: '花吹雪の急坂', obs: [[60, 'branch', 1], [120, 'rock']] },
  { len: 230, slope: -5, terrain: 'forest', name: '四つめの分かれ道', fork: 1 },
  { len: 200, slope: -7, terrain: 'tunnel', name: 'ふかい坑道', obs: [[60, 'log'], [140, 'rock']] },
  { len: 110, slope: -4, turn: 65, terrain: 'tunnel', name: '坑道の大カーブ' },
  { len: 230, slope: -5, terrain: 'forest', name: '五つめの分かれ道', fork: 1 },
  { len: 110, slope: -3, turn: 60, terrain: 'hillL', name: '花の丘' },
  { len: 240, slope: -8, terrain: 'forest', name: 'がけへの 急坂', obs: [[80, 'rock'], [160, 'branch', -1]] },
  { len: 160, slope: -6, terrain: 'tunnel', name: '最後の坑道', obs: [[70, 'log']] },
  { len: 220, slope: -6, terrain: 'ridge', name: 'がけへの 一直線', obs: [[100, 'rock']] },
  { len: 160, slope: -2, terrain: 'gorge', name: '谷', cliff: true },
], 400, 31);

/** 8-14 Kuruの鹿(茶色い くりの林と 落石の鉱山。障害物が とても多い。ぶつかると がくんと おそくなる) */
const LEVEL_8_14 = pursuit('8-14', 'kuru', 'Kuruの鹿', 'くりの林と 落石の鉱山。倒木と落石だらけ', 'Kuruの鹿の トロッコが くりの林へ！ 倒木や 落石に 気をつけて！', '障害物が たくさん！ ぶつかると おそくなるよ', [
  { len: 90, slope: -2, terrain: 'forest', name: 'くりの林' },
  { len: 240, slope: -8, terrain: 'hillL', name: '落石の坂', obs: [[60, 'rock'], [130, 'log'], [190, 'rock']] },
  { len: 110, slope: -3, turn: -70, terrain: 'cut', name: '切り通し' },
  { len: 230, slope: -5, terrain: 'forest', name: '分かれ道の林', fork: 1 },
  { len: 220, slope: -6, terrain: 'tunnel', name: '落石の坑道', obs: [[40, 'rock'], [100, 'log'], [160, 'rock']] },
  { len: 110, slope: -4, turn: 50, terrain: 'tunnel', name: '曲がる坑道' },
  { len: 220, slope: -8, terrain: 'hillR', name: '枝の トンネル', obs: [[40, 'branch', 1], [80, 'branch', -1], [120, 'rock'], [170, 'log']], premium: 123 },
  { len: 110, slope: -3, turn: 75, terrain: 'forest', name: '大きなカーブ' },
  { len: 230, slope: -5, terrain: 'ridge', name: '尾根の分かれ道', fork: -1 },
  { len: 240, slope: -7, terrain: 'tunnel', name: 'くずれた坑道', obs: [[40, 'log'], [90, 'rock'], [140, 'log'], [190, 'rock']] },
  { len: 110, slope: -4, turn: -55, terrain: 'tunnel' },
  { len: 220, slope: -6, terrain: 'ridge', name: '倒木の尾根', obs: [[40, 'log'], [100, 'branch', 1], [160, 'rock']] },
  { len: 110, slope: -3, turn: -60, terrain: 'hillL', name: 'くりのカーブ' },
  { len: 230, slope: -5, terrain: 'forest', name: '最後の分かれ道', fork: 1 },
  { len: 200, slope: -6, terrain: 'tunnel', name: '出口の坑道', obs: [[50, 'rock'], [140, 'log']] },
  { len: 240, slope: -8, terrain: 'forest', name: 'がけへの 急坂', obs: [[50, 'branch', -1], [100, 'rock'], [180, 'log']] },
  { len: 160, slope: -2, terrain: 'gorge', name: '谷', cliff: true },
], 360, 31);

/** 8-15 Pikoの鹿(夕焼けの もみじ谷と 鉱山。レールの切れ目が 5つ。切れ目は 前半だけ(連結してブレーキをかけたあとに来ると、とびこせない)) */
const LEVEL_8_15 = pursuit('8-15', 'piko', 'Pikoの鹿', '夕焼けの もみじ谷。切れたレールを とびこえて', 'Pikoの鹿の トロッコが 切れたレールを とびこえた！ ジャンプで ついていこう！', 'レールの切れ目！ ふちで ジャンプ', [
  { len: 90, slope: -2, terrain: 'forest', dusk: 0.2, name: 'もみじの森' },
  { len: 240, slope: -7, terrain: 'hillL', dusk: 0.25, name: '切れたレールの坂', gap: [80, 10], obs: [[180, 'rock']] },
  { len: 110, slope: -3, turn: 75, terrain: 'hillR', dusk: 0.3, name: '夕焼けのカーブ' },
  { len: 230, slope: -4, terrain: 'forest', dusk: 0.35, name: '分かれ道の森', fork: -1 },
  { len: 220, slope: -6, terrain: 'canyon', dusk: 0.4, name: 'もみじ谷の 古い橋', gap: [70, 14], obs: [[160, 'log']] },
  { len: 180, slope: -6, terrain: 'tunnel', name: '夕焼けの坑道', obs: [[60, 'rock'], [120, 'log']] },
  { len: 110, slope: -4, turn: -50, terrain: 'tunnel' },
  { len: 220, slope: -6, terrain: 'canyon', dusk: 0.5, name: '二つめの古い橋', gap: [60, 12], premium: 160, obs: [[157, 'rock']] },
  { len: 110, slope: -3, turn: -70, terrain: 'cut', dusk: 0.55, name: '切り通し' },
  { len: 230, slope: -4, terrain: 'ridge', dusk: 0.6, name: '尾根の分かれ道', fork: 1 },
  { len: 220, slope: -6, terrain: 'canyon', dusk: 0.65, name: '三つめの古い橋', gap: [70, 12] },
  { len: 200, slope: -6, terrain: 'tunnel', name: 'ふかい坑道', obs: [[60, 'log'], [140, 'rock']] },
  { len: 110, slope: -4, turn: 60, terrain: 'tunnel' },
  { len: 230, slope: -5, terrain: 'forest', dusk: 0.8, name: '最後の分かれ道', fork: -1 },
  { len: 110, slope: -3, turn: 65, terrain: 'forest', dusk: 0.85, name: '大きなカーブ' },
  { len: 240, slope: -8, terrain: 'forest', dusk: 0.9, name: 'がけへの 急坂', obs: [[80, 'rock'], [160, 'branch', 1]] },
  { len: 200, slope: -6, terrain: 'ridge', dusk: 0.95, name: 'がけへの 一直線', obs: [[100, 'log']] },
  { len: 160, slope: -2, terrain: 'gorge', dusk: 1, name: '谷', cliff: true },
], 380, 31);

/** 8-16 Ruruの鹿(水色の 氷の谷と こおった坑道。雪で ブレーキが 半分しか きかない。うんと早く 追いつかないと 止まれない) */
const LEVEL_8_16 = pursuit('8-16', 'ruru', 'Ruruの鹿', '雪の谷と こおった坑道。ブレーキが ききにくい', 'Ruruの鹿の トロッコが 雪の谷へ！ 雪で ブレーキが ききにくいよ。早く 追いついて！', '雪で すべる！ 連結したら すぐ ブレーキ', [
  { len: 90, slope: -2, terrain: 'ridge', snow: true, name: '氷の駅' },
  { len: 230, slope: -8, terrain: 'hillL', snow: true, name: '雪の下り坂', obs: [[110, 'rock']] },
  { len: 110, slope: -3, turn: 70, terrain: 'cut', snow: true, name: '雪のカーブ' },
  { len: 230, slope: -5, terrain: 'ridge', snow: true, name: '雪の分かれ道', fork: 1 },
  { len: 200, slope: -6, terrain: 'tunnel', snow: true, name: 'こおった坑道', obs: [[60, 'rock'], [140, 'log']] },
  { len: 110, slope: -4, turn: -50, terrain: 'tunnel', snow: true },
  { len: 200, slope: -7, terrain: 'hillR', snow: true, name: 'つららの坂', obs: [[60, 'branch', 1], [120, 'rock']], premium: 123 },
  { len: 110, slope: -3, turn: -75, terrain: 'forest', snow: true, name: '大きなカーブ' },
  { len: 230, slope: -4, terrain: 'ridge', snow: true, name: '氷の尾根の分かれ道', fork: -1 },
  { len: 220, slope: -7, terrain: 'tunnel', snow: true, name: '氷の坑道', obs: [[50, 'log'], [150, 'rock']] },
  { len: 110, slope: -4, turn: 55, terrain: 'tunnel', snow: true },
  { len: 200, slope: -8, terrain: 'hillL', snow: true, name: '雪の急坂', obs: [[90, 'rock']] },
  { len: 110, slope: -3, turn: 75, terrain: 'hillL', snow: true, name: '雪の丘' },
  { len: 230, slope: -5, terrain: 'ridge', snow: true, name: '最後の分かれ道', fork: 1 },
  { len: 180, slope: -6, terrain: 'tunnel', snow: true, name: '出口の坑道', obs: [[80, 'log']] },
  { len: 260, slope: -6, terrain: 'ridge', snow: true, name: 'がけへの 一直線', obs: [[90, 'rock'], [180, 'branch', -1]] },
  { len: 160, slope: -2, terrain: 'gorge', snow: true, name: '氷の谷', cliff: true },
], 360, 31);

export const PURSUIT_LEVELS: CartLevel[] = [LEVEL_8_11, LEVEL_8_12, LEVEL_8_13, LEVEL_8_14, LEVEL_8_15, LEVEL_8_16];
export const cartById = (id: string): CartLevel | undefined => CART_LEVELS.find(l => l.id === id) ?? PURSUIT_LEVELS.find(l => l.id === id);
export const trackOf = (level: CartLevel): Track => new Track(level.track);

/** これから作る面(名前だけ。面えらびに「準備中」で出す)。 */
export const CART_PLANNED: { id: string; title: string }[] = [];
