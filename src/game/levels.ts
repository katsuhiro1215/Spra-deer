import type { Point, SliderDefinition, TrapDefinition, WallDefinition } from './stage.ts';

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
  walls: WallDefinition[];
  sliders: SliderDefinition[];
  chapters: Chapter[];
  /** 失敗の原因と、次の攻略方法（失敗の種類ごと）。 */
  hints: { poop: string; fall: string; wall: string };
};

/** 一覧に出す枠。level が無い枠は「準備中」として表示する。 */
export type LevelSlot = { id: string; title: string; summary: string; level?: LevelDefinition };

/** 8個のうんこが一列に並び、gap の近くだけが空く。 */
const row = (y: number, gap: number): Point[] =>
  Array.from({ length: 8 }, (_, i) => ({ x: 128 + i * 64, y })).filter(p => Math.abs(p.x - gap) > 75);
/** 道を完全にふさぐうんこの列。ジャンプで越えるしかない。 */
const block = (y: number): Point[] => Array.from({ length: 8 }, (_, i) => ({ x: 128 + i * 64, y }));

const POOP_HINT = '鹿が止まって、しっぽを上げたら合図。\n落ちる場所を見て、少し待つか\n反対側から回ろう。';
const FALL_HINT = 'うんこは避けたのに…！\n安全そうな道ほど、あやしい。\n一度見たら、次は避けられる。';
const WALL_HINT = 'いきなり壁が…！\nでも、出てくる場所と時間は毎回同じ。\n出てきたあとに、通ってみよう。';

/** 1-1: 安全そうなすきまにも、床の穴がある。歩く鹿が、道にうんこを落とす。 */
export const LEVEL_1_1: LevelDefinition = {
  id: '1-1', stage: 1, title: '安全そうな道',
  intro: 'うんこをよけて、上のゴールへ。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...row(2500, 448), ...row(1750, 256), ...row(1050, 384)],
  deers: [
    { id: 'doe', kind: 'doe', y: 2850, x1: 150, x2: 570, startX: 170, startDir: 1, speed: 85, firstDrop: 1.5, dropEvery: 3, drops: 3, warning: .9 },
    { id: 'fawn', kind: 'fawn', y: 2000, x1: 150, x2: 570, startX: 550, startDir: -1, speed: 105, firstDrop: 5, dropEvery: 3.2, drops: 3, warning: .9 },
    { id: 'stag', kind: 'stag', y: 1300, x1: 150, x2: 570, startX: 300, startDir: 1, speed: 75, firstDrop: 9, dropEvery: 3.4, drops: 3, warning: 1 },
  ],
  // 床の穴は、ひびも揺れもなく、いきなり開く。
  traps: [
    { id: 'gap-trap', x: 360, y: 2280, width: 176, height: 130, warning: .65, silent: true },
    { id: 'landing-trap', x: 168, y: 1530, width: 176, height: 140, warning: .76, silent: true },
  ],
  walls: [], sliders: [],
  chapters: [
    { above: 3000, text: 'うんこをよけて、上のゴールへ。' },
    { above: 2400, text: '鹿が止まったら、うんこの合図。' },
    { above: 1850, text: '空いている道。…あれ？' },
    { above: 1100, text: 'うんこの場所は、さっきと違うかも。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: { poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT },
};

/** 1-2: 道を完全にふさぐうんこ。跳んで越えると、着地点に穴があく。2つ目は、着地点へ動いてくるうんこ。 */
export const LEVEL_1_2: LevelDefinition = {
  id: '1-2', stage: 1, title: '越えた先が、あやしい',
  intro: '道がふさがれてる。跳ぶしかない。',
  start: { x: 360, y: 2300 },
  poops: [...block(1950), ...row(1500, 512), ...block(1250), ...row(850, 256)],
  deers: [],
  traps: [
    // 1つ目のうんこを越えて着地したところが、いきなり穴になる。横にずらして着地すれば無事。
    { id: 'landing-hole', x: 180, y: 1780, width: 260, height: 130, warning: .05, trigger: 'land', landReach: 110, silent: true },
  ],
  walls: [],
  sliders: [
    // 2つ目のうんこを跳ぶと、右のすみのうんこが、着地点へ動いてくる。
    { id: 'slider', x: 570, y: 1010, toX: 500, toY: 1190, within: 420, speed: 560 },
  ],
  chapters: [
    { above: 2100, text: '道がふさがれてる。跳ぶしかない。' },
    { above: 1450, text: '越えたら、すぐ次へ。' },
    { above: 800, text: 'もう一度、ふさがれてる…。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: 'うんこが…動いてきた！？\n跳ぶと、着地点へ向かってくるみたい。\n着地する場所を、横にずらしてみよう。',
    fall: '着地した場所に、穴が…！\n越えたあとが、いちばん危ない。\n着地点を、横にずらしてみよう。',
    wall: WALL_HINT,
  },
};

/** 1-3: 突然、横から壁が出てくる。出てくる場所と時間は毎回同じ。 */
export const LEVEL_1_3: LevelDefinition = {
  id: '1-3', stage: 1, title: 'とつぜんの壁',
  intro: 'まっすぐ進めば、すぐゴール。…本当に？',
  start: { x: 360, y: 2300 },
  poops: [...row(1560, 384), ...row(1000, 256)],
  deers: [], traps: [], sliders: [],
  walls: [
    { id: 'wall-1', side: 'l', y: 1900, thickness: 80, triggerY: 2110, speed: 950, hold: .8 },
    { id: 'wall-2', side: 'r', y: 1300, thickness: 80, triggerY: 1420, speed: 1100, hold: .8 },
    { id: 'wall-3', side: 'l', y: 700, thickness: 80, triggerY: 1100, speed: 1100, hold: .8 },
  ],
  chapters: [
    { above: 2150, text: 'まっすぐ進めば、すぐゴール。' },
    { above: 1450, text: 'うんこの先も、気をつけて。' },
    { above: 1000, text: '壁は、毎回同じ場所に出る。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: { poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT },
};

/** ステージ1の枠。 */
export const STAGE_1: LevelSlot[] = [
  { id: '1-1', title: LEVEL_1_1.title, summary: '安全そうな道を、よく見よう', level: LEVEL_1_1 },
  { id: '1-2', title: LEVEL_1_2.title, summary: 'ふさがれた道を、跳んで越える', level: LEVEL_1_2 },
  { id: '1-3', title: LEVEL_1_3.title, summary: '横から、壁が出てくる', level: LEVEL_1_3 },
  { id: '1-4', title: '準備中', summary: '' },
  { id: '1-5', title: '準備中', summary: '' },
];

export const STAGES: { stage: number; title: string; slots: LevelSlot[] }[] = [
  { stage: 1, title: '足元にご用心', slots: STAGE_1 },
  { stage: 2, title: '鹿せんべい配達', slots: [] },
  { stage: 3, title: '奈良公園大掃除', slots: [] },
];

/** 遊べる面だけを、遊ぶ順に並べたもの。 */
export const PLAYABLE: LevelDefinition[] = STAGES.flatMap(s => s.slots.flatMap(slot => (slot.level ? [slot.level] : [])));
export const levelById = (id: string): LevelDefinition | undefined => PLAYABLE.find(l => l.id === id);
