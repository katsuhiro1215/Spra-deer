import type { Point, TrapDefinition } from './stage.ts';

/** 画面上の位置（Y）がこの値より下にいる間、text を案内として表示する。上から順に判定する。 */
export type Chapter = { above: number; text: string };

/**
 * 道の上を行き来して、決まった間隔でうんこを落とす鹿。動きは時間だけで決まるので、毎回同じになる。
 * 落とす前に、その場で止まって予告する（warning 秒）。
 */
export type DeerDefinition = {
  id: string;
  kind: 'stag' | 'doe' | 'fawn';
  y: number; // 歩く道の高さ
  x1: number; x2: number; // 行き来する範囲
  startX: number; startDir: 1 | -1;
  speed: number;
  firstDrop: number; // 最初に落とす時刻（面の開始から、秒）
  dropEvery: number; // 次に落とすまでの間隔（秒。予告の時間を含む）
  drops: number; // 落とす回数
  warning: number; // 予告の時間（秒）
};

export type LevelDefinition = {
  id: string; // '1-4' のような表記
  stage: number;
  title: string;
  intro: string; // 開始時に出す一言
  start: Point;
  poops: Point[];
  deers: DeerDefinition[];
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
  deers: [],
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
  deers: [],
  traps: [],
  chapters: [
    { above: 2000, text: 'すきまは、毎回ちがう場所。' },
    { above: 1100, text: '止まって、よく見てから進もう。' },
    { above: 560, text: 'もう少し。足元をよく見て。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: { poop: POOP_HINT, fall: NO_FALL },
};

/** 1-3: 歩く鹿が、止まって、進路上へ新しいうんこを落とす。動く相手と、変化する道を読む。 */
export const LEVEL_1_3: LevelDefinition = {
  id: '1-3', stage: 1, title: '歩く鹿のおくりもの',
  intro: '鹿が止まったら、うんこの合図。',
  start: { x: 360, y: 2500 },
  poops: [...row(2250, 384), ...row(1500, 256), ...row(1000, 448)],
  deers: [
    { id: 'doe', kind: 'doe', y: 1880, x1: 150, x2: 570, startX: 170, startDir: 1, speed: 85, firstDrop: 1.4, dropEvery: 3, drops: 3, warning: .9 },
    { id: 'fawn', kind: 'fawn', y: 1250, x1: 150, x2: 570, startX: 550, startDir: -1, speed: 105, firstDrop: 3, dropEvery: 3.2, drops: 3, warning: .9 },
  ],
  traps: [],
  chapters: [
    { above: 2150, text: '鹿が止まったら、うんこの合図。' },
    { above: 1500, text: '鹿は、道の上にも落としていくよ。' },
    { above: 800, text: 'うんこの場所は、さっきと違うかも。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: { poop: '鹿が止まって、しっぽを上げたら合図。\n落ちる場所を見て、少し待つか\n反対側から回ろう。', fall: NO_FALL },
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
  deers: [],
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

/** 1-5: ステージ1の総仕上げ。うんこの列、歩く鹿の落とし物、崩れる床を組み合わせる。新しい仕掛けはない。 */
export const LEVEL_1_5: LevelDefinition = {
  id: '1-5', stage: 1, title: 'ステージ1の総仕上げ',
  intro: 'これまでの、全部入り。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...row(2500, 448), ...row(1750, 256), ...row(1050, 384)],
  deers: [
    { id: 'doe', kind: 'doe', y: 2850, x1: 150, x2: 570, startX: 170, startDir: 1, speed: 85, firstDrop: 1.5, dropEvery: 3, drops: 3, warning: .9 },
    { id: 'fawn', kind: 'fawn', y: 2000, x1: 150, x2: 570, startX: 550, startDir: -1, speed: 105, firstDrop: 5, dropEvery: 3.2, drops: 3, warning: .9 },
    { id: 'stag', kind: 'stag', y: 1300, x1: 150, x2: 570, startX: 300, startDir: 1, speed: 75, firstDrop: 9, dropEvery: 3.4, drops: 3, warning: 1 },
  ],
  traps: [
    { id: 'gap-trap', x: 360, y: 2280, width: 176, height: 130, warning: .65 },
    { id: 'landing-trap', x: 168, y: 1530, width: 176, height: 140, warning: .76 },
  ],
  chapters: [
    { above: 3000, text: 'これまでの、全部入り。' },
    { above: 2400, text: '鹿が止まったら、うんこの合図。' },
    { above: 1850, text: '空いている道。…あれ？' },
    { above: 1100, text: 'うんこの場所は、さっきと違うかも。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: '鹿が止まって、しっぽを上げたら合図。\n落ちる場所を見て、少し待つか\n反対側から回ろう。',
    fall: 'うんこは避けたのに…！\nひびのある床は、横へ回ろう。\n跳ぶときは、着地点も見てね。',
  },
};

/** ステージ1の5枠。 */
export const STAGE_1: LevelSlot[] = [
  { id: '1-1', title: LEVEL_1_1.title, summary: '少しのうんこをよけよう', level: LEVEL_1_1 },
  { id: '1-2', title: LEVEL_1_2.title, summary: 'うんこの列を抜けよう', level: LEVEL_1_2 },
  { id: '1-3', title: LEVEL_1_3.title, summary: '鹿が、道にうんこを落とす', level: LEVEL_1_3 },
  { id: '1-4', title: LEVEL_1_4.title, summary: '安全そうな床に、ご用心', level: LEVEL_1_4 },
  { id: '1-5', title: LEVEL_1_5.title, summary: '全部まとめて挑戦', level: LEVEL_1_5 },
];

export const STAGES: { stage: number; title: string; slots: LevelSlot[] }[] = [
  { stage: 1, title: '足元にご用心', slots: STAGE_1 },
  { stage: 2, title: '鹿せんべい配達', slots: [] },
  { stage: 3, title: '奈良公園大掃除', slots: [] },
];

/** 遊べる面だけを、遊ぶ順に並べたもの。 */
export const PLAYABLE: LevelDefinition[] = STAGES.flatMap(s => s.slots.flatMap(slot => (slot.level ? [slot.level] : [])));
export const levelById = (id: string): LevelDefinition | undefined => PLAYABLE.find(l => l.id === id);
