import type { ChaserDefinition, GoalDefinition, Point, RainDefinition, SliderDefinition, TrapDefinition, WallDefinition } from './stage.ts';

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
  chasers: ChaserDefinition[];
  rain: RainDefinition[];
  goal?: GoalDefinition; // 省略するとゴールは中央（GOAL）
  chapters: Chapter[];
  /** 失敗の原因と、次の攻略方法（失敗の種類ごと）。 */
  hints: { poop: string; fall: string; wall: string; caught?: string };
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
    // 安心してゴールへ向かうと、真ん中に大きな穴が開く。左右のはしは通れる。
    { id: 'big-hole', x: 210, y: 400, width: 300, height: 120, warning: .5, silent: true, trigger: 'y', triggerY: 700 },
  ],
  walls: [], sliders: [], chasers: [], rain: [],
  chapters: [
    { above: 3000, text: 'うんこをよけて、上のゴールへ。' },
    { above: 2400, text: '鹿が止まったら、うんこの合図。' },
    { above: 1850, text: '空いている道。…あれ？' },
    { above: 1100, text: 'うんこの場所は、さっきと違うかも。' },
    { above: 700, text: 'あと少し。旗のところへ！' },
    { above: -Infinity, text: 'もう、ゴールは目の前。' },
  ],
  hints: { poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT },
};

/** 1-2: 道を完全にふさぐうんこ。越えた先の穴、着地点へ動くうんこ、走るうんこ。最後は、ゴールが逃げて穴に落とす。 */
export const LEVEL_1_2: LevelDefinition = {
  id: '1-2', stage: 1, title: '越えた先が、あやしい',
  intro: '道がふさがれてる。跳ぶしかない。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 512), ...block(3050), ...row(2600, 512), ...block(2350), ...row(1950, 256), ...row(1500, 448), ...row(1050, 384)],
  deers: [],
  traps: [
    // 1つ目のうんこを越えて着地したところが、いきなり穴になる。横にずらして着地すれば無事。
    { id: 'landing-hole', x: 180, y: 2880, width: 260, height: 130, warning: .05, trigger: 'land', landReach: 110, silent: true },
    // ゴールが逃げるとき、道の途中にも穴が開く。右のはしから回れば無事。
    { id: 'goal-hole', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true },
    { id: 'near-hole', x: 330, y: 700, width: 100, height: 90, warning: .35, silent: true },
  ],
  walls: [], chasers: [], rain: [],
  sliders: [
    // 2つ目のうんこを跳ぶと、右のすみのうんこが、着地点へ動いてくる。
    { id: 'slider', x: 570, y: 2110, toX: 500, toY: 2290, within: 420, speed: 560 },
    // 近づくだけで、横から走ってくるうんこ。
    { id: 'dash', x: 600, y: 1750, toX: 256, toY: 1750, within: 420, speed: 650, trigger: 'near' },
  ],
  // ゴールに近づくと、右へ逃げる。
  goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
  chapters: [
    { above: 3100, text: '道がふさがれてる。跳ぶしかない。' },
    { above: 2550, text: '越えたら、すぐ次へ。' },
    { above: 1900, text: 'もう一度、ふさがれてる…。' },
    { above: 1100, text: 'うんこは、動くこともある。' },
    { above: 600, text: 'あと少し。旗のところへ！' },
    { above: -Infinity, text: '…旗は、動かないよね？' },
  ],
  hints: {
    poop: 'うんこが…動いてきた！？\n跳ぶと、着地点へ向かってくるみたい。\n近づくと走ってくるのもいる。',
    fall: '着地した場所に、穴が…！\n越えたあとと、ゴールの前が危ない。\n着地点や、進む道をずらしてみよう。',
    wall: WALL_HINT,
  },
};

/** 1-3: 突然、横から壁が出てくる。うんこも走る。最後は、ゴールの前で左右から壁が閉じる。出る場所と時間は毎回同じ。 */
export const LEVEL_1_3: LevelDefinition = {
  id: '1-3', stage: 1, title: 'とつぜんの壁',
  intro: 'まっすぐ進めば、すぐゴール。…本当に？',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...row(1800, 256), ...row(1000, 448)],
  deers: [], traps: [], chasers: [], rain: [],
  walls: [
    { id: 'wall-1', side: 'l', y: 2650, thickness: 80, triggerY: 2900, speed: 950, hold: .5 },
    { id: 'wall-2', side: 'r', y: 2050, thickness: 80, triggerY: 2300, speed: 1100, hold: .5 },
    { id: 'wall-3', side: 'l', y: 1350, thickness: 80, triggerY: 1580, speed: 1100, hold: .5 },
    // ゴールの前で、左右から壁が来て、真ん中で閉じる。
    { id: 'wall-4', side: 'l', y: 520, thickness: 80, triggerY: 780, speed: 900, hold: 1, length: 330 },
    { id: 'wall-5', side: 'r', y: 520, thickness: 80, triggerY: 780, speed: 900, hold: 1, length: 330 },
  ],
  sliders: [
    // 近づくと、横から走ってくるうんこ。歩き続けると当たる。
    { id: 'dash-a', x: 114, y: 1700, toX: 560, toY: 1700, within: 165, speed: 500, trigger: 'near' },
    { id: 'dash-b', x: 600, y: 800, toX: 150, toY: 800, within: 170, speed: 500, trigger: 'near' },
  ],
  chapters: [
    { above: 3100, text: 'まっすぐ進めば、すぐゴール。' },
    { above: 2450, text: '壁は、毎回同じ場所に出る。' },
    { above: 1750, text: 'うんこも、走ることがある。' },
    { above: 900, text: 'うんこの先も、気をつけて。' },
    { above: 600, text: 'もう、ゴールは目の前。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: 'うんこが走ってきた…！\n近づくと動くのがいるみたい。\n動き出したら、いったん止まってみよう。',
    fall: FALL_HINT,
    wall: WALL_HINT,
  },
};

/** 1-4: 鹿が追いかけてくる。止まると追いつかれる中で、おとりのすきま（穴）を見抜いて進む。 */
export const LEVEL_1_4: LevelDefinition = {
  id: '1-4', stage: 1, title: '追いかけてくる',
  intro: '後ろから、鹿が来る！',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 256), ...row(2650, 448), ...row(2100, 256), ...row(1550, 384), ...row(1000, 512)],
  deers: [], walls: [], sliders: [], rain: [],
  // うんこのすきまを抜けた先に、穴がある。抜けたら、すぐ横へ。
  traps: [
    { id: 'hole-1', x: 400, y: 2440, width: 140, height: 110, warning: .35, silent: true },
    { id: 'hole-2', x: 190, y: 1890, width: 140, height: 110, warning: .35, silent: true },
    { id: 'hole-3', x: 320, y: 1340, width: 120, height: 110, warning: .35, silent: true },
    { id: 'hole-4', x: 440, y: 790, width: 150, height: 110, warning: .35, silent: true },
  ],
  chasers: [
    { id: 'stag', kind: 'stag', x: 360, y: 3750, triggerY: 3300, speed: 205 },
    { id: 'doe', kind: 'doe', x: 580, y: 2350, triggerY: 1900, speed: 200 },
  ],
  chapters: [
    { above: 3300, text: '後ろから、鹿が来る！' },
    { above: 2900, text: '止まると、追いつかれる。' },
    { above: 2200, text: 'すきまの先も、あやしい。' },
    { above: 1500, text: 'もう1頭、来たかも。' },
    { above: 800, text: 'まだ追ってくる…！' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: POOP_HINT,
    fall: FALL_HINT,
    wall: WALL_HINT,
    caught: '鹿がもう、すぐ後ろに…！\n止まったり、遠回りすると追いつかれる。\nすきまの先の穴は、早めに横へ。',
  },
};

/** 1-5: ステージ1の総仕上げ。ふさぐうんこ→降ってくるうんこと壁→追いかける鹿とおとりの穴→逃げるゴール。 */
export const LEVEL_1_5: LevelDefinition = {
  id: '1-5', stage: 1, title: 'ステージ1の総仕上げ',
  intro: 'これまでの、全部入り。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 512), ...block(3050), ...row(1850, 256), ...row(1350, 448)],
  deers: [], sliders: [],
  traps: [
    // 越えて着地した場所が穴になる（1-2と同じ）。
    { id: 'landing-hole', x: 180, y: 2880, width: 260, height: 130, warning: .05, trigger: 'land', landReach: 110, silent: true },
    // うんこのすきまの先の穴（1-4と同じ）。
    { id: 'hole-1', x: 190, y: 1640, width: 140, height: 110, warning: .35, silent: true },
    { id: 'hole-2', x: 400, y: 1140, width: 140, height: 110, warning: .35, silent: true },
    // ゴールが逃げるとき、道の途中にも穴が開く（1-2と同じ）。
    { id: 'goal-hole', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true },
    { id: 'near-hole', x: 330, y: 700, width: 100, height: 90, warning: .35, silent: true },
  ],
  // 上から降ってくる。影が出たら、動いて避ける。止まると、自分の足元に落ちる。
  rain: [
    { id: 'rain-1', triggerY: 2800, delay: .2, warn: .8, aim: 'player' },
    { id: 'rain-2', triggerY: 2650, delay: .2, warn: .8, aim: 'player' },
    { id: 'rain-3', triggerY: 2500, delay: .2, warn: .8, aim: 'player' },
    { id: 'rain-wait', triggerY: 2335, delay: .3, warn: .9, aim: 'player' },
  ],
  walls: [{ id: 'wall-1', side: 'l', y: 2100, thickness: 80, triggerY: 2330, speed: 1000, hold: .5 }],
  chasers: [{ id: 'doe', kind: 'doe', x: 580, y: 2250, triggerY: 1900, speed: 205 }],
  goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
  chapters: [
    { above: 3100, text: 'これまでの、全部入り。' },
    { above: 2750, text: '上からも、来る。' },
    { above: 2330, text: '止まるなら、足元に注意。' },
    { above: 1900, text: '後ろから、鹿が来る！' },
    { above: 1000, text: 'すきまの先も、あやしい。' },
    { above: 500, text: '…旗は、動かないよね？' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: 'うんこが、上から降ってきた…！\n影が出たら、動いて避けよう。\n止まるときは、足元に気をつけて。',
    fall: '着地した場所や、すきまの先、\nゴールの前に、穴がある。\n一度見たら、次は避けられる。',
    wall: WALL_HINT,
    caught: '鹿に追いつかれた…！\n壁を待つあいだに、距離がつまる。\n降ってくるうんこを避けながら、早めに進もう。',
  },
};

/** ステージ1の枠。 */
export const STAGE_1: LevelSlot[] = [
  { id: '1-1', title: LEVEL_1_1.title, summary: '安全そうな道を、よく見よう', level: LEVEL_1_1 },
  { id: '1-2', title: LEVEL_1_2.title, summary: 'ふさがれた道を、跳ぶ', level: LEVEL_1_2 },
  { id: '1-3', title: LEVEL_1_3.title, summary: '横から、壁が出てくる', level: LEVEL_1_3 },
  { id: '1-4', title: LEVEL_1_4.title, summary: '鹿が、追いかけてくる', level: LEVEL_1_4 },
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
