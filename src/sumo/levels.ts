// WORLD 6「鹿ずもう」の面。相手の鹿と、その強さ・見た目をここに書く(設計書 33章)。
// 元になった試作: showcases/deersample9(Owner依頼の別AIの試作。ルールの考え方を移し、縦の画面に作り直した)

/** 鹿の見た目: 3d=立体の鹿(部品を組み合わせた模型)、image=絵本風の絵(板に貼った絵) */
export type SumoArt = '3d' | 'image';

export type SumoDeer = {
  name: string;
  /** 毛の色・足先の色・角の色(立体の鹿) */
  coat: number; dark: number; antler: number;
  /** 体の大きさ・角の大きさ(1=ふつう) */
  size: number; antlerSize: number;
  /** 絵の鹿のとき: 絵のファイル(左向きの絵)と、色の重ね(0xffffff=そのまま) */
  image: string; tint: number;
};

export type SumoOpponent = SumoDeer & {
  /** 肩書き(「のんびり屋」など) */
  title: string;
  /** 押す力(1=ふつう)。ふつうの押しの強さに かかる */
  force: number;
  /** ふつうの押しの間隔(秒) */
  interval: number;
  /** 何回に1回、ためて強く押すか(0=ためない)。ためる時間(秒) */
  windupEvery: number; windup: number;
};

export type SumoLevel = {
  id: string; title: string; summary: string;
  /** はじめの一言 */
  intro: string;
  /** その面で覚えること(はじめの画面に出す) */
  lesson: string;
  art: SumoArt;
  opponent: SumoOpponent;
  /** 勝負の時間(秒) */
  duration: number;
  /** ★3: この秒数までに押し出す */
  par: number;
};

/** 自分の鹿(いまは1頭。バランス型) */
export const PLAYER_DEER: SumoDeer & { power: number; recovery: number; dodge: number } = {
  name: 'あなたの鹿', coat: 0xbb7949, dark: 0x785033, antler: 0xe4c899, size: 1, antlerSize: 1,
  image: 'deer.png', tint: 0xffffff,
  power: 1, recovery: 1, dodge: 1,
};

/** 6-1 のんびり鹿: ためて押してこない。押す・ため押しを覚える */
const LEVEL_6_1: SumoLevel = {
  id: '6-1', title: 'はじめての はっけよい', summary: 'のんびり鹿と、押し合い勝負',
  intro: 'はっけよい！ 緑のときに 押そう',
  lesson: '緑のタイミングで「押す」。長押しの「ため押し」は、金色で はなす',
  art: '3d',
  opponent: {
    name: 'のんびり鹿', title: 'のんびり屋', coat: 0xc69060, dark: 0x7d5838, antler: 0xead2a4, size: 0.95, antlerSize: 0.8,
    image: 'stag.png', tint: 0xffffff,
    force: 1.0, interval: 1.4, windupEvery: 0, windup: 1.2,
  },
  duration: 45, par: 20,
};

/** 6-2 力自慢: 3回に1回、ためて強く押してくる。「いなす」を覚える */
const LEVEL_6_2: SumoLevel = {
  id: '6-2', title: '角と角の 力くらべ', summary: '力自慢の鹿の、強い角押しを いなそう',
  intro: '相手が ためたら、「今！」で いなす',
  lesson: '相手が ためたら、「今！」の合図で「いなす」。すぐ押すと 切り返し',
  art: 'image',
  opponent: {
    name: '力自慢の鹿', title: '力自慢', coat: 0x8a6a52, dark: 0x4e433d, antler: 0xd8bc90, size: 1.08, antlerSize: 1.18,
    image: 'stag.png', tint: 0xc9b29e,
    force: 1.8, interval: 1.4, windupEvery: 3, windup: 1.2,
  },
  duration: 45, par: 22,
};

export const SUMO_LEVELS: SumoLevel[] = [LEVEL_6_1, LEVEL_6_2];
export const sumoById = (id: string): SumoLevel | undefined => SUMO_LEVELS.find(l => l.id === id);
/** まだ作っていない面(名前だけ) */
export const SUMO_PLANNED: { id: string; title: string }[] = Array.from({ length: 8 }, (_, i) => ({ id: `6-${i + 3}`, title: '準備中' }));
