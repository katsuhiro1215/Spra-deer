// WORLD 8「鹿と暴走トロッコ」の面(線路のデータ)。面を足すときは、ここにデータを足す。
import { Track, type Coin, type TrackDef } from './track.ts';

export type CartLevel = {
  id: string; title: string; summary: string;
  /** はじめに出す一言 */
  intro: string;
  goalName: string;
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

export const CART_LEVELS: CartLevel[] = [LEVEL_8_1];
export const cartById = (id: string): CartLevel | undefined => CART_LEVELS.find(l => l.id === id);
export const trackOf = (level: CartLevel): Track => new Track(level.track);

/** これから作る面(名前だけ。面えらびに「準備中」で出す)。 */
export const CART_PLANNED: { id: string; title: string }[] = [
  { id: '8-2', title: '急カーブの森' }, { id: '8-3', title: 'ジャンプ渓谷' }, { id: '8-4', title: '超高速ダウンヒル' },
  { id: '8-5', title: '崩れた線路' }, { id: '8-6', title: '山岳トロッコ' }, { id: '8-7', title: '連続ジャンプ' },
  { id: '8-8', title: '霧の山道' }, { id: '8-9', title: '鹿の全力疾走' }, { id: '8-10', title: '奈良山脈 大滑降' },
];
