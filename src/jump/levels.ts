// WORLD 5「鹿の背中で ぴょんぴょん」の面(設計書 34章)。Spra が 鹿の背中や頭を足場に、上へ上へ跳んでいく。
// 足場の並びは、区間ごとの決まり(どの鹿が出るか・すき間)から、決まった乱数で作る(毎回同じ並び)。

/** 足場になる鹿: lie=寝ころぶ鹿(広くて動かない)、walk=歩く鹿(左右に動く)、bow=おじぎ鹿(おじぎ中に乗ると大ジャンプ) */
export type PadKind = 'lie' | 'walk' | 'bow';

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
};

/** 5-1 若草山を のぼろう: 寝ころぶ鹿 → 歩く鹿 → おじぎ鹿 の順に出てくる */
const LEVEL_5_1: JumpLevel = {
  id: '5-1', title: '若草山を のぼろう', summary: '鹿の背中で ぴょんぴょん、てっぺんまで',
  intro: '鹿の背中で ぴょんぴょん！ 若草山の てっぺんへ',
  lesson: '◀ ▶ で 左右へ。鹿に 乗ると、ひとりでに 跳ねる。おじぎ中の 鹿に 乗ると、大ジャンプ！',
  goal: 150, goalName: '若草山の てっぺん',
  seed: 51,
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

export const JUMP_LEVELS: JumpLevel[] = [LEVEL_5_1];
export const jumpById = (id: string): JumpLevel | undefined => JUMP_LEVELS.find(l => l.id === id);
/** まだ作っていない面(名前だけ) */
export const JUMP_PLANNED: { id: string; title: string }[] = Array.from({ length: 9 }, (_, i) => ({ id: `5-${i + 2}`, title: '準備中' }));
