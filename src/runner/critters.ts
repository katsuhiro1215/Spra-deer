// 罠にする動物・モンスターの設定。絵は scripts/build-critters.py で切り出した
// public/assets/runner/critters/<key>_<ポーズ番号>.png (シートの並び順: 左上→右下)。
// 見た目に依存しない純粋なデータ(ルールの計算からも使う)。

/** 当たったときの効果: damage=ハート−1 / slow=おそくなる / slip=操作が逆(1.6秒) / ice=曲がれない(1.4秒) */
export type Effect = 'damage' | 'slow' | 'slip' | 'ice';

export interface CritterDef {
  /** 画面での高さ(メートル) */
  size: number;
  /** 当たりの半径 */
  r: number;
  /** この高さ以上で跳べば、飛び越えられる */
  height: number;
  effect: Effect;
  /** ポーズ番号: 普通 / 怒る(突進) / 寝る / 目を回す(当たったあと) */
  pose: { normal: number; angry: number; sleep: number; dizzy: number };
  /** 当たったときの一言 */
  line: string;
}

const c = (size: number, effect: Effect, pose: CritterDef['pose'], line: string, height = Math.min(1.3, size * 0.72)): CritterDef => ({
  size, r: 0.3 + size * 0.28, height, effect, pose, line,
});

export const CRITTERS: Record<string, CritterDef> = {
  // 夜: 影・鳥・キツネ・電気
  kage: c(1.5, 'slip', { normal: 0, angry: 2, sleep: 3, dizzy: 5 }, 'かげに とりつかれた！ 操作が逆に'),
  owl: c(1.5, 'damage', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'ホーッ！ ぶつかった'),
  fox: c(1.3, 'damage', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'コンッ！ ぶつかった'),
  pachi: c(1.4, 'ice', { normal: 0, angry: 4, sleep: 2, dizzy: 3 }, 'ビリビリ！ しびれて 曲がれない'),
  // 雨: スライム・泥・キノコ・カメ
  puni: c(1.3, 'slow', { normal: 0, angry: 3, sleep: 4, dizzy: 1 }, 'ぷにっ！ おそくなった'),
  doro: c(1.3, 'slow', { normal: 0, angry: 1, sleep: 2, dizzy: 4 }, 'どろっ！ おそくなった'),
  noko: c(1.4, 'damage', { normal: 0, angry: 4, sleep: 3, dizzy: 1 }, 'キノコに ぶつかった！'),
  turtle: c(1.2, 'slow', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'カメに ひっかかった'),
  bubu: c(1.4, 'slow', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'ぶくぶく… おそくなった'),
  // 雪: 雪だるま・氷・クリスマス
  snowy: c(1.8, 'ice', { normal: 0, angry: 4, sleep: 2, dizzy: 5 }, '雪だるま！ つるつる すべる'),
  frosty: c(1.7, 'ice', { normal: 0, angry: 4, sleep: 2, dizzy: 3 }, 'こおった！ 曲がれない'),
  gingi: c(1.6, 'damage', { normal: 0, angry: 1, sleep: 2, dizzy: 3 }, 'ジンジャーに ぶつかった！'),
  rabbit: c(1.4, 'damage', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'ウサギと ごっつん！'),
  candi: c(1.9, 'damage', { normal: 0, angry: 1, sleep: 2, dizzy: 4 }, 'キャンディに ぶつかった！'),
  // 山: クマ・タヌキ・リス・岩・トゲ
  bear: c(1.9, 'damage', { normal: 0, angry: 2, sleep: 3, dizzy: 1 }, 'クマに ぶつかった！'),
  tanuki: c(1.5, 'slip', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'ばかされた！ 操作が逆に'),
  squirrel: c(1.3, 'damage', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'リスと ごっつん！'),
  koron: c(1.6, 'damage', { normal: 0, angry: 2, sleep: 5, dizzy: 4 }, 'ごろごろ岩に ぶつかった！'),
  goro: c(2.2, 'damage', { normal: 0, angry: 1, sleep: 3, dizzy: 5 }, 'ゴーレムに ぶつかった！'),
  toge: c(1.4, 'damage', { normal: 0, angry: 1, sleep: 3, dizzy: 5 }, 'トゲが ささった！'),
};

export const CRITTER_KEYS = Object.keys(CRITTERS);

/** 動き方 */
export type Behavior = 'sleep' | 'cross' | 'hop' | 'charge';
