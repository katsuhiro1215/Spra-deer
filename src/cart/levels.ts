// WORLD 8「鹿と暴走トロッコ」の面(線路のデータ)。面を足すときは、ここにデータを足す。
import { Track, type Coin, type TrackDef } from './track.ts';

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

export const CART_LEVELS: CartLevel[] = [LEVEL_8_1, LEVEL_8_2, LEVEL_8_3, LEVEL_8_4];
export const cartById = (id: string): CartLevel | undefined => CART_LEVELS.find(l => l.id === id);
export const trackOf = (level: CartLevel): Track => new Track(level.track);

/** これから作る面(名前だけ。面えらびに「準備中」で出す)。 */
export const CART_PLANNED: { id: string; title: string }[] = [
  { id: '8-5', title: '崩れた線路' }, { id: '8-6', title: '山岳トロッコ' }, { id: '8-7', title: '連続ジャンプ' },
  { id: '8-8', title: '霧の山道' }, { id: '8-9', title: '鹿の全力疾走' }, { id: '8-10', title: '奈良山脈 大滑降' },
];
