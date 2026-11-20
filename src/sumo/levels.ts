// WORLD 6「鹿ずもう」の面。相手の鹿と、その強さ・見た目をここに書く(設計書 33章)。
// 鹿は立体(部品を組み合わせた模型)。絵の鹿とくらべて、立体に決めた(2026-11-20 Owner)
// 元になった試作: showcases/deersample9(Owner依頼の別AIの試作。ルールの考え方を移し、縦の画面に作り直した)

export type SumoDeer = {
  name: string;
  /** 毛の色・足先の色・角の色(立体の鹿) */
  coat: number; dark: number; antler: number;
  /** 体の大きさ・角の大きさ(1=ふつう) */
  size: number; antlerSize: number;
  /** 横綱の白い綱をしめる */
  rope?: boolean;
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
  /** ためた何回に1回が、ためるふり(フェイント)か(0=しない)。ふりのあとは、すぐ ふつうに押してくる */
  feintEvery?: number;
  /** 重さ(1=ふつう)。重いほど、こちらの押しで動きにくい */
  weight?: number;
};

/** 土俵の場所と天気(見た目) */
export type SumoScene = 'day' | 'rain' | 'night' | 'evening';

export type SumoLevel = {
  id: string; title: string; summary: string;
  /** はじめの一言 */
  intro: string;
  /** その面で覚えること(はじめの画面に出す) */
  lesson: string;
  /** 相手(2頭以上なら、勝ち抜き。前の相手に勝つと、次の相手が出てくる) */
  opponents: SumoOpponent[];
  /** 1番の時間(秒) */
  duration: number;
  /** ★3: この秒数までに押し出す(勝ち抜きは、全部の番の合計) */
  par: number;
  scene: SumoScene;
  /** 土俵のすべりやすさ(押した勢いの へり方。ふつう 2.35。小さいほど すべる) */
  friction?: number;
};

/** 自分の鹿(いまは1頭。バランス型) */
export const PLAYER_DEER: SumoDeer & { power: number; recovery: number; dodge: number } = {
  name: 'あなたの鹿', coat: 0xbb7949, dark: 0x785033, antler: 0xe4c899, size: 1, antlerSize: 1,
  power: 1, recovery: 1, dodge: 1,
};

// ---- 相手の鹿 ----
const NONBIRI: SumoOpponent = {
  name: 'のんびり鹿', title: 'のんびり屋', coat: 0xc69060, dark: 0x7d5838, antler: 0xead2a4, size: 0.95, antlerSize: 0.8,
  force: 0.8, interval: 1.6, windupEvery: 0, windup: 1.2,
};
const CHIKARA: SumoOpponent = {
  name: '力自慢の鹿', title: '力自慢', coat: 0x8a6a52, dark: 0x4e433d, antler: 0xd8bc90, size: 1.08, antlerSize: 1.18,
  force: 1.62, interval: 1.4, windupEvery: 3, windup: 1.2,
};
const SUBAYAI: SumoOpponent = {
  name: 'すばやい鹿', title: 'すばしっこい', coat: 0xd6a067, dark: 0x8a6440, antler: 0xf0dcb4, size: 0.88, antlerSize: 0.9,
  force: 0.53, interval: 0.98, windupEvery: 0, windup: 1.0,
};
const ITAZURA: SumoOpponent = {
  name: 'いたずら鹿', title: 'フェイント上手', coat: 0xb98250, dark: 0x6e4a2c, antler: 0xe6cc98, size: 0.98, antlerSize: 1.0,
  force: 1.6, interval: 1.3, windupEvery: 2, windup: 1.2, feintEvery: 2,
};
const YASUMANAI: SumoOpponent = {
  name: '休まない鹿', title: 'がんばり屋', coat: 0xa87850, dark: 0x664630, antler: 0xdcc292, size: 1.02, antlerSize: 1.05,
  force: 0.74, interval: 1.14, windupEvery: 0, windup: 1.2,
};
const OOJIKA: SumoOpponent = {
  name: '大きな鹿', title: 'どっしり', coat: 0x7a5c46, dark: 0x463830, antler: 0xd2b588, size: 1.22, antlerSize: 1.3,
  force: 1.2, interval: 1.5, windupEvery: 3, windup: 1.3, weight: 1.45,
};
const AME: SumoOpponent = {
  name: '雨の日の鹿', title: 'すべり上手', coat: 0x9a7458, dark: 0x5a4434, antler: 0xd8c09a, size: 1.0, antlerSize: 1.0,
  force: 1.95, interval: 1.3, windupEvery: 3, windup: 1.1,
};
const YORU: SumoOpponent = {
  name: '夜ふかし鹿', title: 'くせ者', coat: 0x8e6a4c, dark: 0x4e3a2a, antler: 0xe0c89c, size: 1.0, antlerSize: 1.1,
  force: 2.17, interval: 1.05, windupEvery: 2, windup: 1.1, feintEvery: 3,
};
const YOKOZUNA: SumoOpponent = {
  name: '横綱鹿', title: '奈良公園の横綱', coat: 0x6e5240, dark: 0x3e3028, antler: 0xf2e2bc, size: 1.28, antlerSize: 1.4, rope: true,
  force: 1.19, interval: 1.15, windupEvery: 3, windup: 1.15, feintEvery: 3, weight: 1.3,
};

/** 6-1 のんびり鹿: ためて押してこない。押す・ため押しを覚える */
const LEVEL_6_1: SumoLevel = {
  id: '6-1', title: 'はじめての はっけよい', summary: 'のんびり鹿と、押し合い勝負',
  intro: 'はっけよい！ 緑のときに 押そう',
  lesson: '緑のタイミングで「押す」。長押しの「ため押し」は、金色で はなす',
  opponents: [NONBIRI], duration: 45, par: 20, scene: 'day',
};

/** 6-2 力自慢: 3回に1回、ためて強く押してくる。「いなす」を覚える */
const LEVEL_6_2: SumoLevel = {
  id: '6-2', title: '角と角の 力くらべ', summary: '力自慢の鹿の、強い角押しを いなそう',
  intro: '相手が ためたら、「今！」で いなす',
  lesson: '相手が ためたら、「今！」の合図で「いなす」。すぐ押すと 切り返し',
  opponents: [CHIKARA], duration: 45, par: 22, scene: 'day',
};

/** 6-3 すばやい鹿: 小さな押しを、休まず次々に。スタミナを残して、緑だけ押す */
const LEVEL_6_3: SumoLevel = {
  id: '6-3', title: 'ちょこまか 押し合い', summary: 'すばやい鹿の、こまかい押しに 負けるな',
  intro: 'あわてず、緑のときだけ 押そう',
  lesson: '相手は 小さく すばやく 押してくる。あわてて連打すると 息切れ。スタミナを残して、緑だけ',
  opponents: [SUBAYAI], duration: 45, par: 24, scene: 'day',
};

/** 6-4 いたずら鹿: ためるふり(フェイント)をする。「今！」が出るまで いなさない */
const LEVEL_6_4: SumoLevel = {
  id: '6-4', title: 'いたずら鹿の フェイント', summary: 'ためるふりに だまされるな',
  intro: '「今！」が 出るまで、いなさない',
  lesson: '相手は ためるふりをして、やめることがある。あわてて いなすと、すきができる。「今！」を待とう',
  opponents: [ITAZURA], duration: 45, par: 24, scene: 'day',
};

/** 6-5 休まない鹿: ずっと押してくる。ため押しで ぐっと押し返す */
const LEVEL_6_5: SumoLevel = {
  id: '6-5', title: '休まない 押し相撲', summary: 'ずっと押してくる鹿を、ため押しで 押し返せ',
  intro: '相手は 休まない！ ため押しで 押し返そう',
  lesson: '相手は 休まず押してくる。ふつうの押しだけでは 互角。金色で はなす「ため押し」で 差をつけよう',
  opponents: [YASUMANAI], duration: 45, par: 26, scene: 'day',
};

/** 6-6 雨の土俵: 土がすべって、押した勢いが長く続く(押されたときも) */
const LEVEL_6_6: SumoLevel = {
  id: '6-6', title: '雨の 土俵', summary: 'すべる土俵で、押し出されないように',
  intro: '土俵が すべる！ 押されたら すぐ押し返そう',
  lesson: '雨で 土俵が すべる。押した勢いも 押された勢いも、長く続く。強い角押しは 必ず いなそう',
  opponents: [AME], duration: 45, par: 22, scene: 'rain', friction: 1.5,
};

/** 6-7 大きな鹿: 重くて、ふつうの押しでは動きにくい。ため押しと切り返しで */
const LEVEL_6_7: SumoLevel = {
  id: '6-7', title: 'どっしり 大きな鹿', summary: '重い鹿は、ため押しと 切り返しで 動かす',
  intro: '重い！ ため押しと 切り返しで 動かそう',
  lesson: '大きな鹿は 重くて、ふつうの押しでは 少ししか動かない。ため押しと、いなしてからの切り返しが 決め手',
  opponents: [OOJIKA], duration: 45, par: 28, scene: 'evening',
};

/** 6-8 夜の燈花会: すばやくて、フェイントもする くせ者 */
const LEVEL_6_8: SumoLevel = {
  id: '6-8', title: '燈花会の 夜ずもう', summary: 'ろうそくの灯りの中で、くせ者と勝負',
  intro: '夜の 土俵。フェイントに 気をつけて',
  lesson: 'すばやくて、ためるふりもする くせ者。緑で押し、「今！」で いなし、すきに ため押し',
  opponents: [YORU], duration: 45, par: 26, scene: 'night',
};

/** 6-9 3番勝ち抜き: 相手が次々に変わる。スタミナは引きつぐ */
const LEVEL_6_9: SumoLevel = {
  id: '6-9', title: '3番 勝ち抜き', summary: '3頭に 続けて勝て！ スタミナは 引きつぎ',
  intro: '3番 勝ち抜き！ 1番目は すばやい鹿',
  lesson: '相手が 3頭 続けて出てくる。スタミナは 次の番に 引きつぐので、使いすぎに 注意',
  opponents: [SUBAYAI, ITAZURA, CHIKARA], duration: 40, par: 55, scene: 'day',
};

/** 6-10 横綱鹿: 重くて、強くて、フェイントもする。ここまでの全部 */
const LEVEL_6_10: SumoLevel = {
  id: '6-10', title: '横綱鹿に 挑戦！', summary: '奈良公園の横綱と、大一番',
  intro: '大一番！ ここまでの 全部で 挑もう',
  lesson: '横綱鹿は 重くて 強く、ためるふりもする。緑で押す・「今！」で いなす・切り返し・ため押し。全部を使おう',
  opponents: [YOKOZUNA], duration: 50, par: 34, scene: 'evening',
};

export const SUMO_LEVELS: SumoLevel[] = [LEVEL_6_1, LEVEL_6_2, LEVEL_6_3, LEVEL_6_4, LEVEL_6_5, LEVEL_6_6, LEVEL_6_7, LEVEL_6_8, LEVEL_6_9, LEVEL_6_10];
export const sumoById = (id: string): SumoLevel | undefined => SUMO_LEVELS.find(l => l.id === id);
/** まだ作っていない面(名前だけ) */
export const SUMO_PLANNED: { id: string; title: string }[] = [];
