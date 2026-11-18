// WORLD 2「鹿せんべい大作戦」の面のデータ(設計書 30章)。せんべい屋台で、焼いて・渡す。
// 面は、このデータを足せば作れる(焼ける速さ・鹿の来る時刻・注文の数・待てる時間)。

export type DeerKind = 'fawn' | 'doe' | 'stag';

/** 鹿の来る時刻と注文(この順に、空いた場所へ来る。空きがなければ、空くまで待つ) */
export type Arrival = { t: number; kind: DeerKind; want: number };

/** 片面の焼け方(秒)。ok から裏返せる・perfect の間は「こんがり」・smoke から煙・burn で焦げる */
export type Cook = { ok: number; perfect: [number, number]; smoke: number; burn: number };

export type BakeLevel = {
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
  /** 極上せんべいを、何枚続けて作るとプレミアムコインが出るか */
  premiumStreak: number;
  /** その面ならではの一言(時刻) */
  notes?: { t: number; text: string }[];
};

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
  premiumStreak: 5,
  notes: [
    { t: 54, text: '大きな鹿は、3まい ほしい！ 先に 焼いておこう' },
    { t: 85, text: 'いそがしく なってきた！ 鉄板を 空けないで' },
  ],
};

export const BAKE_LEVELS: BakeLevel[] = [LEVEL_2_1];
export const bakeById = (id: string): BakeLevel | undefined => BAKE_LEVELS.find(l => l.id === id);
