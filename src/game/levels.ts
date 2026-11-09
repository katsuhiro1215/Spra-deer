import type { Point, TrapDefinition } from './stage.ts';

/** 画面上の位置（Y）がこの値より下にいる間、text を案内として表示する。上から順に判定する。 */
export type Chapter = { above: number; text: string };

export type LevelDefinition = {
  id: string; // '1-4' のような表記
  stage: number;
  title: string;
  intro: string; // 開始時に出す一言
  start: Point;
  poops: Point[];
  traps: TrapDefinition[];
  chapters: Chapter[];
  /** 失敗の原因と、次の攻略方法 */
  hints: { poop: string; fall: string };
};

/** 一覧に出す枠。level が無い枠は「準備中」として表示する。 */
export type LevelSlot = { id: string; title: string; summary: string; level?: LevelDefinition };

/** 8個のうんこが一列に並び、gap の近くだけが空く。 */
const row = (y: number, gap: number): Point[] =>
  Array.from({ length: 8 }, (_, i) => ({ x: 128 + i * 64, y })).filter(p => Math.abs(p.x - gap) > 75);

const POOP_HINT = '鹿の落としものを踏んじゃった。\n足元の影を目印に、\nすきまを通ってみよう。';
const NO_FALL = '';

/** 1-1: 少数のうんこ。移動と足元の当たり判定を覚える。 */
export const LEVEL_1_1: LevelDefinition = {
  id: '1-1', stage: 1, title: 'はじめの一歩',
  intro: 'うんこをよけて、上のゴールへ。',
  start: { x: 360, y: 1700 },
  poops: [...row(1450, 384), ...row(1050, 256), ...row(650, 448)],
  traps: [],
  chapters: [
    { above: 1250, text: 'うんこをよけて、上のゴールへ。' },
    { above: 500, text: 'すきまを見つけて、通ろう。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: { poop: POOP_HINT, fall: NO_FALL },
};

/** 1-2: 列と数が増える。すきまを選ぶ、止まって観察する。 */
export const LEVEL_1_2: LevelDefinition = {
  id: '1-2', stage: 1, title: 'すきまをさがせ',
  intro: 'すきまは、毎回ちがう場所。',
  start: { x: 360, y: 2500 },
  poops: [
    ...row(2250, 256), ...row(1980, 448),
    { x: 518, y: 1830 }, { x: 551, y: 1800 },
    ...row(1650, 320), ...row(1330, 448), ...row(1010, 256), ...row(700, 384),
  ],
  traps: [],
  chapters: [
    { above: 2000, text: 'すきまは、毎回ちがう場所。' },
    { above: 1100, text: '止まって、よく見てから進もう。' },
    { above: 560, text: 'もう少し。足元をよく見て。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: { poop: POOP_HINT, fall: NO_FALL },
};

/** 1-4: 安全そうなすきまの床が揺れ、崩れる。試作 deersample2 の内容。 */
export const LEVEL_1_4: LevelDefinition = {
  id: '1-4', stage: 1, title: '足元には、ご用心。',
  intro: 'うんこをよけて、上のゴールへ。',
  start: { x: 360, y: 3580 },
  poops: [
    ...row(3330, 256), ...row(3000, 448),
    { x: 174, y: 2700 }, { x: 200, y: 2665 },
    ...row(2470, 384), ...row(2250, 256),
    { x: 518, y: 1890 }, { x: 551, y: 1860 },
    ...row(1670, 448), ...row(1280, 384),
    ...row(700, 256),
  ],
  // 固定配置なので、驚きも覚えて攻略できる。うんこのすきまごとに、安全な迂回路がある。
  traps: [
    { id: 'first-surprise', x: 360, y: 2780, width: 176, height: 130, warning: .65 },
    { id: 'landing-surprise', x: 168, y: 2030, width: 176, height: 140, warning: .76 },
    { id: 'last-surprise', x: 296, y: 1060, width: 176, height: 150, warning: .72 },
  ],
  chapters: [
    { above: 3070, text: 'うんこをよけて、上のゴールへ。' },
    { above: 2510, text: '空いている道。…あれ？' },
    { above: 1760, text: '跳ぶ前に、着地点も見てみよう。' },
    { above: 850, text: 'もう大丈夫？ 足元をよく見て。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: POOP_HINT,
    fall: 'うんこは避けたのに…！\nひびのある床は、横へ回ろう。\n跳ぶときは、着地点も見てね。',
  },
};

/** ステージ1の5枠。1-3 と 1-5 は動く鹿の実装後に追加する。 */
export const STAGE_1: LevelSlot[] = [
  { id: '1-1', title: LEVEL_1_1.title, summary: '少しのうんこをよけよう', level: LEVEL_1_1 },
  { id: '1-2', title: LEVEL_1_2.title, summary: 'うんこの列を抜けよう', level: LEVEL_1_2 },
  { id: '1-3', title: '歩く鹿', summary: '鹿が新しいうんこを落とす' },
  { id: '1-4', title: LEVEL_1_4.title, summary: '安全そうな床に、ご用心', level: LEVEL_1_4 },
  { id: '1-5', title: 'ステージ1の総仕上げ', summary: '全部まとめて挑戦' },
];

export const STAGES: { stage: number; title: string; slots: LevelSlot[] }[] = [
  { stage: 1, title: '足元にご用心', slots: STAGE_1 },
  { stage: 2, title: '鹿せんべい配達', slots: [] },
  { stage: 3, title: '奈良公園大掃除', slots: [] },
];

/** 遊べる面だけを、遊ぶ順に並べたもの。 */
export const PLAYABLE: LevelDefinition[] = STAGES.flatMap(s => s.slots.flatMap(slot => (slot.level ? [slot.level] : [])));
export const levelById = (id: string): LevelDefinition | undefined => PLAYABLE.find(l => l.id === id);
