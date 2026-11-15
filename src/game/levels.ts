import { FIELD } from './stage.ts';
import { RUNNER_LEVELS } from '../runner/levels.ts';
import type { ChaserDefinition, CrosserDefinition, CrossDefinition, DeliveryDefinition, RescueDefinition, SweepDefinition, GoalDefinition, Point, RainDefinition, SliderDefinition, TrapDefinition, WallDefinition } from './stage.ts';

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
  /** ステージ2の面（せんべい配達）。あると、ボタンは「せんべいを置く」になり、ゴールは届け先の鹿になる。 */
  delivery?: DeliveryDefinition;
  /** ステージ3（大掃除）。 */
  sweep?: SweepDefinition;
  /** ステージ4（横断）。 */
  cross?: CrossDefinition;
  /** ステージ5（救出）。 */
  rescue?: RescueDefinition;
  chapters: Chapter[];
  /** 失敗の原因と、次の攻略方法（失敗の種類ごと）。 */
  hints: { poop: string; fall: string; wall: string; caught?: string };
};

/** 一覧に出す枠。level も runnerId も無い枠は「準備中」として表示する。 */
export type LevelSlot = { id: string; title: string; summary: string; level?: LevelDefinition; /** 3D走りゲーム(/run/)の面。runner/levels.ts の id */ runnerId?: string };

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

/** 1-5: 全部入り。ふさぐうんこ→降ってくるうんこと壁→追いかける鹿とおとりの穴→逃げるゴール。 */
export const LEVEL_1_5: LevelDefinition = {
  id: '1-5', stage: 1, title: '全部入り',
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

/** 1-6: 前からも、後ろからも。鹿が正面から突っ込み、後ろからも追う。止まれない中で、壁と雨と穴。 */
export const LEVEL_1_6: LevelDefinition = {
  id: '1-6', stage: 1, title: '前からも、後ろからも',
  intro: '鹿が、前から来る！？',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 256), ...row(2550, 512), ...row(2000, 256), ...block(1500), ...row(1000, 448)],
  deers: [], sliders: [],
  traps: [
    { id: 'hole-1', x: 190, y: 3000, width: 130, height: 100, warning: .35, silent: true },
    { id: 'hole-2', x: 440, y: 2420, width: 130, height: 100, warning: .35, silent: true },
    { id: 'landing-hole', x: 150, y: 1280, width: 280, height: 120, warning: .05, trigger: 'land', landReach: 110, silent: true },
    { id: 'goal-hole', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true },
    { id: 'near-hole', x: 330, y: 700, width: 100, height: 90, warning: .35, silent: true },
  ],
  walls: [{ id: 'wall-1', side: 'r', y: 1800, thickness: 80, triggerY: 2050, speed: 1100, hold: .5 }],
  rain: [
    { id: 'rain-1', triggerY: 1200, delay: .2, warn: .8, aim: 'player' },
    { id: 'rain-2', triggerY: 1130, delay: .2, warn: .8, aim: 'player' },
  ],
  chasers: [
    { id: 'stag', kind: 'stag', x: 360, y: 3750, triggerY: 3300, speed: 205 },
    // 正面から、突っ込んでくる。
    { id: 'doe', kind: 'doe', x: 360, y: 2300, triggerY: 2950, speed: 170 },
  ],
  goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
  chapters: [
    { above: 3300, text: '後ろから、鹿が来る！' },
    { above: 2950, text: '前からも、来た…！' },
    { above: 2050, text: '止まれない。壁にも注意。' },
    { above: 1550, text: 'ふさがれた道は、跳ぶしかない。' },
    { above: 1200, text: '上からも、来る。' },
    { above: 600, text: '…旗は、動かないよね？' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: POOP_HINT,
    fall: FALL_HINT,
    wall: WALL_HINT,
    caught: '鹿につかまった…！\n前から来る鹿は、ジャンプで越えよう。\n止まると、後ろの鹿に追いつかれる。',
  },
};

/** 1-7: 雨の降る道。鹿は落とし、空からも降る。降る場所が、すきまをふさぐ。 */
export const LEVEL_1_7: LevelDefinition = {
  id: '1-7', stage: 1, title: '雨の降る道',
  intro: '上から、降ってくる！',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...row(2600, 256), ...row(2050, 512), ...row(1500, 384), ...row(950, 256)],
  sliders: [],
  deers: [
    { id: 'doe', kind: 'doe', y: 2850, x1: 150, x2: 570, startX: 170, startDir: 1, speed: 105, firstDrop: 1.2, dropEvery: 2.6, drops: 4, warning: .8 },
    { id: 'stag', kind: 'stag', y: 1800, x1: 150, x2: 570, startX: 560, startDir: -1, speed: 95, firstDrop: 7, dropEvery: 2.8, drops: 4, warning: .8 },
  ],
  traps: [
    { id: 'hole-1', x: 330, y: 2430, width: 130, height: 100, warning: .35, silent: true },
    { id: 'hole-2', x: 440, y: 1330, width: 130, height: 100, warning: .35, silent: true },
    { id: 'big-hole', x: 210, y: 400, width: 300, height: 120, warning: .5, silent: true, trigger: 'y', triggerY: 700 },
  ],
  walls: [], chasers: [],
  // 降ってくる場所が、すきまの出口をふさぐ。連続で降る。
  rain: [
    { id: 'rain-a1', triggerY: 2700, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-a2', triggerY: 2620, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-a3', triggerY: 2540, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-b1', triggerY: 2150, delay: .1, warn: .8, x: 256, y: 2000 },
    { id: 'rain-b2', triggerY: 2150, delay: .1, warn: .8, x: 420, y: 2000 },
    { id: 'rain-c1', triggerY: 1650, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-c2', triggerY: 1570, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-c3', triggerY: 1490, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-d1', triggerY: 1000, delay: .2, warn: .6, aim: 'player' },
    { id: 'rain-d2', triggerY: 930, delay: .2, warn: .6, aim: 'player' },
    { id: 'rain-d3', triggerY: 860, delay: .2, warn: .6, aim: 'player' },
    { id: 'rain-d4', triggerY: 790, delay: .2, warn: .6, aim: 'player' },
  ],
  chapters: [
    { above: 3100, text: '上から、降ってくる！' },
    { above: 2700, text: '止まらずに、動き続けて。' },
    { above: 2150, text: '降る場所が、道をふさぐ。' },
    { above: 1650, text: 'また、降ってきた…。' },
    { above: 1000, text: 'まだまだ、降る。' },
    { above: 700, text: 'もう、ゴールは目の前。' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: 'うんこが、上から降ってきた…！\n影が出たら、すぐ動こう。\n止まると、足元に落ちる。',
    fall: FALL_HINT,
    wall: WALL_HINT,
  },
};

/** 1-8: せまる壁。左右から閉じる壁、壁を跳んだ先のうんこ、追いかける鹿。 */
export const LEVEL_1_8: LevelDefinition = {
  id: '1-8', stage: 1, title: 'せまる壁',
  intro: '壁は、毎回同じ場所に出る。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...block(2300), ...row(1700, 256), ...block(1100)],
  deers: [], rain: [],
  traps: [
    { id: 'landing-hole-1', x: 180, y: 2100, width: 280, height: 120, warning: .05, trigger: 'land', landReach: 110, silent: true },
    { id: 'hole-1', x: 420, y: 1540, width: 130, height: 100, warning: .35, silent: true },
    { id: 'goal-hole', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true },
    { id: 'near-hole', x: 330, y: 700, width: 100, height: 90, warning: .35, silent: true },
  ],
  walls: [
    { id: 'wall-1', side: 'l', y: 2850, thickness: 80, triggerY: 3080, speed: 1100, hold: .5 },
    { id: 'wall-2l', side: 'l', y: 2600, thickness: 80, triggerY: 2850, speed: 950, hold: .8, length: 330 },
    { id: 'wall-2r', side: 'r', y: 2600, thickness: 80, triggerY: 2850, speed: 950, hold: .8, length: 330 },
    { id: 'wall-3', side: 'r', y: 1950, thickness: 80, triggerY: 2200, speed: 1100, hold: .5 },
    { id: 'wall-4l', side: 'l', y: 1350, thickness: 80, triggerY: 1620, speed: 950, hold: .8, length: 330 },
    { id: 'wall-4r', side: 'r', y: 1350, thickness: 80, triggerY: 1620, speed: 950, hold: .8, length: 330 },
    { id: 'wall-5l', side: 'l', y: 560, thickness: 80, triggerY: 820, speed: 900, hold: 1, length: 330 },
    { id: 'wall-5r', side: 'r', y: 560, thickness: 80, triggerY: 820, speed: 900, hold: 1, length: 330 },
  ],
  sliders: [
    { id: 'dash-a', x: 114, y: 1800, toX: 560, toY: 1800, within: 170, speed: 520, trigger: 'near' },
    { id: 'dash-b', x: 600, y: 900, toX: 150, toY: 900, within: 170, speed: 520, trigger: 'near' },
  ],
  chasers: [{ id: 'stag', kind: 'stag', x: 360, y: 1900, triggerY: 1650, speed: 200 }],
  goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
  chapters: [
    { above: 3100, text: '壁は、毎回同じ場所に出る。' },
    { above: 2850, text: '左右から、閉じてくる。' },
    { above: 2300, text: '壁を跳んだ先も、あやしい。' },
    { above: 1650, text: '後ろから、鹿も来る。' },
    { above: 1100, text: '壁、壁、また壁。' },
    { above: 600, text: '…旗は、動かないよね？' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: 'うんこが走ってきた…！\n近づくと動くのがいる。\n動き出したら、すぐ避けよう。',
    fall: FALL_HINT,
    wall: WALL_HINT,
    caught: '鹿に追いつかれた…！\n壁の前で止まりすぎると、追いつかれる。\n壁は、跳び越えられる。',
  },
};

/** 1-9: 総力戦の手前。追いかける鹿が3頭、雨、走るうんこ、おとりの穴。立ち止まれない。 */
export const LEVEL_1_9: LevelDefinition = {
  id: '1-9', stage: 1, title: '立ち止まれない',
  intro: '今度は、3頭。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 256), ...row(2650, 512), ...row(2150, 256), ...row(1650, 448), ...row(1150, 256), ...row(800, 448)],
  deers: [],
  traps: [
    { id: 'hole-1', x: 190, y: 3000, width: 130, height: 100, warning: .3, silent: true },
    { id: 'hole-2', x: 440, y: 2500, width: 130, height: 100, warning: .3, silent: true },
    { id: 'hole-3', x: 190, y: 2000, width: 130, height: 100, warning: .3, silent: true },
    { id: 'hole-4', x: 380, y: 1500, width: 130, height: 100, warning: .3, silent: true },
    { id: 'hole-5', x: 190, y: 1000, width: 130, height: 100, warning: .3, silent: true },
    { id: 'goal-hole', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true },
  ],
  walls: [{ id: 'wall-1', side: 'l', y: 1800, thickness: 80, triggerY: 2050, speed: 1100, hold: .5 }],
  sliders: [
    { id: 'dash-a', x: 600, y: 2350, toX: 150, toY: 2350, within: 170, speed: 560, trigger: 'near' },
    { id: 'dash-b', x: 114, y: 1350, toX: 560, toY: 1350, within: 170, speed: 560, trigger: 'near' },
  ],
  rain: [
    { id: 'rain-1', triggerY: 1250, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-2', triggerY: 1180, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-3', triggerY: 1110, delay: .2, warn: .7, aim: 'player' },
  ],
  chasers: [
    { id: 'stag', kind: 'stag', x: 360, y: 3750, triggerY: 3300, speed: 215 },
    { id: 'doe', kind: 'doe', x: 580, y: 3000, triggerY: 2650, speed: 210 },
    { id: 'fawn', kind: 'fawn', x: 140, y: 2400, triggerY: 2050, speed: 210 },
  ],
  goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
  chapters: [
    { above: 3300, text: '今度は、3頭。' },
    { above: 2650, text: '1頭、増えた。' },
    { above: 2050, text: 'もう1頭…！' },
    { above: 1300, text: '止まったら、終わり。' },
    { above: 600, text: '…旗は、動かないよね？' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: POOP_HINT,
    fall: FALL_HINT,
    wall: WALL_HINT,
    caught: '鹿に囲まれた…！\n止まらず、すきまの先は早めに横へ。\n降ってくるうんこも、動きながら避けよう。',
  },
};

/** 1-10: ステージ1の最終関門。これまでのしかけが、全部。 */
export const LEVEL_1_10: LevelDefinition = {
  id: '1-10', stage: 1, title: '最終関門',
  intro: 'ここまでの、全部。',
  start: { x: 360, y: 3400 },
  poops: [...row(3200, 512), ...block(3080), ...row(2500, 256), ...block(1950), ...row(1400, 448), ...row(900, 256)],
  deers: [],
  traps: [
    { id: 'landing-hole', x: 180, y: 2900, width: 280, height: 130, warning: .05, trigger: 'land', landReach: 110, silent: true },
    { id: 'hole-1', x: 190, y: 2350, width: 130, height: 100, warning: .3, silent: true },
    { id: 'landing-hole-2', x: 160, y: 1730, width: 300, height: 120, warning: .05, trigger: 'land', landReach: 110, silent: true },
    { id: 'hole-2', x: 400, y: 1250, width: 130, height: 100, warning: .3, silent: true },
    { id: 'hole-3', x: 190, y: 760, width: 130, height: 100, warning: .3, silent: true },
    { id: 'goal-hole', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true },
    { id: 'big-hole', x: 210, y: 420, width: 300, height: 110, warning: .5, silent: true, trigger: 'y', triggerY: 640 },
  ],
  walls: [
    { id: 'wall-1', side: 'l', y: 2700, thickness: 80, triggerY: 2930, speed: 1100, hold: .5 },
    { id: 'wall-2l', side: 'l', y: 2150, thickness: 80, triggerY: 2380, speed: 950, hold: .8, length: 330 },
    { id: 'wall-2r', side: 'r', y: 2150, thickness: 80, triggerY: 2380, speed: 950, hold: .8, length: 330 },
  ],
  sliders: [
    { id: 'slider', x: 570, y: 3010, toX: 500, toY: 3150, within: 420, speed: 560 },
    { id: 'dash', x: 600, y: 1550, toX: 150, toY: 1550, within: 170, speed: 560, trigger: 'near' },
  ],
  rain: [
    { id: 'rain-1', triggerY: 1150, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-2', triggerY: 1080, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-3', triggerY: 1010, delay: .2, warn: .7, aim: 'player' },
  ],
  chasers: [
    { id: 'stag', kind: 'stag', x: 360, y: 2650, triggerY: 2200, speed: 210 },
    { id: 'doe', kind: 'doe', x: 580, y: 1500, triggerY: 1300, speed: 215 },
  ],
  goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
  chapters: [
    { above: 3150, text: 'ここまでの、全部。' },
    { above: 2700, text: '壁も、来る。' },
    { above: 2200, text: '鹿も、来る。' },
    { above: 1750, text: 'ふさがれた道は、跳ぶしかない。' },
    { above: 1200, text: '上からも、来る。' },
    { above: 700, text: '…旗は、動かないよね？' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: 'ここまでの全部が、お待ちかね。\nどこで何が来るかは、毎回同じ。\n一つずつ、覚えて越えよう。',
    fall: '着地した場所や、すきまの先、\nゴールの前に、穴がある。\n一度見たら、次は避けられる。',
    wall: WALL_HINT,
    caught: '鹿に追いつかれた…！\n止まらず、壁は跳び越えよう。\n降ってくるうんこは、動きながら避ける。',
  },
};

const STOLEN_HINT = 'せんべいを、取られた…！\n鹿は、せんべいの匂いで寄ってくる。\n近づかれる前に、おとりを置こう。';

/** 2-1: はじめての配達。せんべいを持って、目印の鹿へ。道は穴とうんこ。 */
export const LEVEL_2_1: LevelDefinition = {
  id: '2-1', stage: 2, title: 'はじめての配達',
  intro: 'せんべいを、あの鹿へ届けよう。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...row(2500, 448), ...row(1750, 256), ...row(1050, 384)],
  deers: [
    { id: 'doe', kind: 'doe', y: 2850, x1: 150, x2: 570, startX: 170, startDir: 1, speed: 85, firstDrop: 1.5, dropEvery: 3, drops: 3, warning: .9 },
    { id: 'fawn', kind: 'fawn', y: 2000, x1: 150, x2: 570, startX: 550, startDir: -1, speed: 105, firstDrop: 5, dropEvery: 3.2, drops: 3, warning: .9 },
  ],
  traps: [
    { id: 'hole-1', x: 330, y: 2260, width: 150, height: 110, warning: .4, silent: true },
    { id: 'hole-2', x: 250, y: 1560, width: 100, height: 110, warning: .4, silent: true },
    { id: 'big-hole', x: 210, y: 420, width: 300, height: 110, warning: .5, silent: true, trigger: 'y', triggerY: 700 },
  ],
  walls: [], sliders: [], chasers: [], rain: [],
  delivery: { baits: 0, targetKind: 'stag', mark: true, thieves: [] },
  chapters: [
    { above: 3000, text: 'せんべいを、あの鹿へ届けよう。' },
    { above: 2400, text: '鹿が止まったら、うんこの合図。' },
    { above: 1800, text: '安全そうな道ほど、あやしい。' },
    { above: 800, text: 'あと少し。鹿のところへ！' },
    { above: -Infinity, text: 'もう、目の前。' },
  ],
  hints: { poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT },
};

/** 2-2: 届け先は、子鹿。大きさの違う鹿の中から、指定された鹿へ。別の鹿に近づくと、せんべいを取られる。 */
export const LEVEL_2_2: LevelDefinition = {
  id: '2-2', stage: 2, title: '届け先は、子鹿',
  intro: '届け先は、子鹿。他の鹿には近づかないで。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 256), ...row(2550, 512), ...row(1900, 384), ...row(1250, 256)],
  deers: [],
  traps: [
    { id: 'hole-1', x: 250, y: 2990, width: 100, height: 100, warning: .35, silent: true },
    { id: 'hole-2', x: 490, y: 2400, width: 90, height: 100, warning: .35, silent: true },
    { id: 'hole-3', x: 380, y: 1730, width: 100, height: 100, warning: .35, silent: true },
  ],
  walls: [], sliders: [], chasers: [], rain: [],
  delivery: {
    baits: 0, targetKind: 'fawn',
    // どれも、その場から動かない。触れると、せんべいを取られる。
    thieves: [
      { id: 'd1', kind: 'stag', x: 150, y: 2750, sense: 0, speed: 0 },
      { id: 'd2', kind: 'doe', x: 570, y: 2150, sense: 0, speed: 0 },
      { id: 'd3', kind: 'stag', x: 300, y: 1560, sense: 0, speed: 0 },
      { id: 'd4', kind: 'doe', x: 540, y: 1020, sense: 0, speed: 0 },
      { id: 'd5', kind: 'stag', x: 190, y: 640, sense: 0, speed: 0 },
      { id: 'd6', kind: 'doe', x: 530, y: 640, sense: 0, speed: 0 },
      { id: 'd7', kind: 'stag', x: 360, y: 760, sense: 0, speed: 0 },
    ],
  },
  goal: { x: 360, y: 300, moveTo: { x: 470, y: 300, within: 230, speed: 300 } },
  chapters: [
    { above: 3100, text: '届け先は、子鹿。' },
    { above: 2300, text: '他の鹿に触れると、取られる。' },
    { above: 1300, text: '鹿の大きさを、よく見て。' },
    { above: 800, text: '子鹿は、どこだ。' },
    { above: -Infinity, text: 'あと少し。子鹿のところへ！' },
  ],
  hints: { poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT, caught: '違う鹿に、せんべいを取られた…！\n届け先は、いちばん小さい子鹿。\n他の鹿には、近づかないように。' },
};

/** 2-3: 横取りしに来る鹿。置いたせんべいを食べている間に、距離をかせぐ。 */
export const LEVEL_2_3: LevelDefinition = {
  id: '2-3', stage: 2, title: '横取りしにくる鹿',
  intro: 'ボタンで、せんべいを置ける。鹿はそっちへ行く。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...row(2650, 256), ...row(2000, 512), ...row(1350, 384), ...row(900, 256)],
  deers: [],
  traps: [
    { id: 'hole-1', x: 330, y: 2540, width: 140, height: 100, warning: .35, silent: true },
    { id: 'hole-2', x: 490, y: 1880, width: 90, height: 100, warning: .35, silent: true },
    { id: 'hole-3', x: 250, y: 800, width: 100, height: 100, warning: .35, silent: true },
  ],
  walls: [], sliders: [], chasers: [], rain: [],
  delivery: {
    baits: 3, targetKind: 'doe', mark: true,
    thieves: [
      { id: 't1', kind: 'stag', x: 580, y: 3000, sense: 340, speed: 262 },
      { id: 't2', kind: 'fawn', x: 140, y: 2300, sense: 340, speed: 272 },
      { id: 't3', kind: 'stag', x: 580, y: 1500, sense: 340, speed: 266 },
    ],
  },
  goal: { x: 360, y: 300, moveTo: { x: 520, y: 300, within: 240, speed: 360 } },
  chapters: [
    { above: 3250, text: 'ボタンで、せんべいを置ける。' },
    { above: 2900, text: '鹿はせんべいに、寄っていく。' },
    { above: 2200, text: 'もう1頭、来る。' },
    { above: 1450, text: 'また、狙われてる。' },
    { above: 700, text: 'あと少し。鹿のところへ！' },
    { above: -Infinity, text: '…動かないよね？' },
  ],
  hints: { poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT, caught: STOLEN_HINT },
};

/** 2-4: おとりで道をつくる。狭いすきまに、鹿が立っている。せんべいで、どかす。 */
export const LEVEL_2_4: LevelDefinition = {
  id: '2-4', stage: 2, title: 'おとりで道をつくる',
  intro: 'すきまに、鹿が立っている。',
  start: { x: 360, y: 3400 },
  poops: [...row(3100, 384), ...row(2500, 256), ...row(1900, 512), ...row(1300, 256), ...row(800, 448)],
  deers: [],
  traps: [
    { id: 'hole-1', x: 440, y: 2440, width: 140, height: 100, warning: .35, silent: true },
    { id: 'hole-2', x: 200, y: 1850, width: 140, height: 100, warning: .35, silent: true },
    { id: 'hole-3', x: 330, y: 1240, width: 140, height: 100, warning: .35, silent: true },
    { id: 'big-hole', x: 210, y: 420, width: 300, height: 110, warning: .5, silent: true, trigger: 'y', triggerY: 700 },
  ],
  walls: [], sliders: [], chasers: [], rain: [],
  delivery: {
    baits: 5, targetKind: 'stag', mark: true,
    thieves: [
      { id: 'g1', kind: 'doe', x: 384, y: 3030, sense: 170, speed: 245 },
      { id: 'g2', kind: 'stag', x: 256, y: 2430, sense: 170, speed: 245 },
      { id: 'g3', kind: 'fawn', x: 512, y: 1830, sense: 170, speed: 245 },
      { id: 'g4', kind: 'doe', x: 256, y: 1230, sense: 170, speed: 245 },
      { id: 'g5', kind: 'stag', x: 448, y: 730, sense: 170, speed: 245 },
    ],
  },
  chapters: [
    { above: 3250, text: 'すきまに、鹿が立っている。' },
    { above: 2900, text: 'せんべいで、おびき出そう。' },
    { above: 2200, text: 'また、立ってる。' },
    { above: 1500, text: 'せんべいは、ぎりぎりの数。' },
    { above: 700, text: 'あと少し。鹿のところへ！' },
    { above: -Infinity, text: 'もう、目の前。' },
  ],
  hints: { poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT, caught: 'すきまの鹿に、せんべいを取られた…！\n近づく前に、手前で置いておびき出そう。\n鹿が食べている間に、すきまを抜ける。' },
};

/** 2-5: 群れの中を抜けて、奥の子鹿へ。 */
export const LEVEL_2_5: LevelDefinition = {
  id: '2-5', stage: 2, title: '群れを抜けて',
  intro: '奥の子鹿へ。群れの中を、抜けよう。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 256), ...row(2600, 512), ...row(2050, 384), ...row(1500, 256), ...row(1000, 448)],
  deers: [
    { id: 'doe', kind: 'doe', y: 2800, x1: 150, x2: 570, startX: 170, startDir: 1, speed: 95, firstDrop: 1.5, dropEvery: 2.8, drops: 4, warning: .8 },
  ],
  traps: [
    { id: 'hole-1', x: 250, y: 3000, width: 100, height: 100, warning: .35, silent: true },
    { id: 'hole-2', x: 490, y: 2450, width: 90, height: 100, warning: .35, silent: true },
    { id: 'hole-3', x: 380, y: 1900, width: 100, height: 100, warning: .35, silent: true },
    { id: 'hole-4', x: 250, y: 1350, width: 100, height: 100, warning: .35, silent: true },
    { id: 'goal-hole', x: 395, y: 250, width: 100, height: 160, warning: .3, trigger: 'goal', silent: true },
  ],
  walls: [], sliders: [], chasers: [],
  rain: [
    { id: 'rain-1', triggerY: 1100, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-2', triggerY: 1030, delay: .2, warn: .7, aim: 'player' },
  ],
  delivery: {
    baits: 4, targetKind: 'fawn',
    thieves: [
      { id: 't1', kind: 'stag', x: 570, y: 3000, sense: 340, speed: 262 },
      { id: 't2', kind: 'doe', x: 150, y: 2450, sense: 340, speed: 268 },
      { id: 't3', kind: 'stag', x: 570, y: 1900, sense: 340, speed: 272 },
      { id: 't4', kind: 'fawn', x: 150, y: 1350, sense: 340, speed: 272 },
      { id: 'd1', kind: 'doe', x: 150, y: 640, sense: 0, speed: 0 },
      { id: 'd2', kind: 'stag', x: 570, y: 640, sense: 0, speed: 0 },
      { id: 'd3', kind: 'stag', x: 360, y: 800, sense: 0, speed: 0 },
    ],
  },
  goal: { x: 360, y: 300, moveTo: { x: 520, y: 300, within: 240, speed: 360 } },
  chapters: [
    { above: 3100, text: '奥の子鹿へ。' },
    { above: 2500, text: '横取りは、まだまだ来る。' },
    { above: 1500, text: 'せんべいは、使いどころ。' },
    { above: 1100, text: '上からも…！' },
    { above: 700, text: '群れの中を、抜けよう。' },
    { above: -Infinity, text: '…子鹿は、動かないよね？' },
  ],
  hints: { poop: 'うんこが、上から降ってきた…！\n影が出たら、動いて避けよう。', fall: FALL_HINT, wall: WALL_HINT, caught: STOLEN_HINT },
};

/** 4-1: はじめての大掃除(仮。作り直し予定)。うんこに触れると、掃ける。通り過ぎて残すと「見逃し」。見逃しが溜まると失敗。 */
export const LEVEL_4_1: LevelDefinition = {
  id: '4-1', stage: 4, title: 'はじめての大掃除',
  intro: 'うんこに触れると、掃除できる！',
  start: { x: 360, y: 3400 },
  poops: [{ x: 170, y: 3150 }, { x: 440, y: 3150 }, { x: 280, y: 2980 }, { x: 550, y: 2980 }, { x: 190, y: 2810 }, { x: 500, y: 2810 }, { x: 250, y: 2640 }, { x: 560, y: 2640 }, { x: 170, y: 2470 }, { x: 440, y: 2470 }, { x: 280, y: 2300 }, { x: 550, y: 2300 }, { x: 190, y: 2130 }, { x: 500, y: 2130 }, { x: 250, y: 1960 }, { x: 560, y: 1960 }, { x: 170, y: 1790 }, { x: 440, y: 1790 }, { x: 280, y: 1620 }, { x: 550, y: 1620 }, { x: 190, y: 1450 }, { x: 500, y: 1450 }, { x: 250, y: 1280 }, { x: 560, y: 1280 }, { x: 170, y: 1110 }, { x: 440, y: 1110 }, { x: 280, y: 940 }, { x: 550, y: 940 }],
  deers: [
    { id: 'doe', kind: 'doe', y: 2300, x1: 150, x2: 570, startX: 170, startDir: 1, speed: 90, firstDrop: 1.5, dropEvery: 1, drops: 3, warning: .6 },
    { id: 'stag', kind: 'stag', y: 1500, x1: 150, x2: 570, startX: 560, startDir: -1, speed: 100, firstDrop: 5, dropEvery: 1, drops: 3, warning: .6 },
  ],
  traps: [], walls: [], sliders: [], chasers: [], rain: [],
  sweep: { limit: 8, radius: 52 },
  chapters: [
    { above: 3250, text: 'うんこに触れると、掃除できる。' },
    { above: 2900, text: '通り過ぎると、見逃し。' },
    { above: 1500, text: '鹿が落としたうんこも、掃こう。' },
    { above: -Infinity, text: 'あと少し。ゴールへ！' },
  ],
  hints: {
    poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT,
    caught: '見逃しが、溜まりすぎた…！\nうんこに、近づいて触れよう。\n左右に動いて、拾いにいこう。',
  },
};

/** 5-1: まいごの子鹿。迷子を見つけると、ついてくる。通った道をたどるので、壁や雨に気をつけて、出口まで。 */
export const LEVEL_5_1: LevelDefinition = {
  id: '5-1', stage: 5, title: 'まいごの子鹿',
  intro: '迷子の子鹿を、見つけて連れて行こう。',
  start: { x: 360, y: 3400 },
  poops: [...row(3150, 384), ...row(2750, 256), ...row(2000, 512), ...row(1450, 256), ...row(900, 384)],
  deers: [], sliders: [], chasers: [],
  traps: [
    { id: 'hole-1', x: 490, y: 1870, width: 90, height: 100, warning: .35, silent: true },
    { id: 'hole-2', x: 250, y: 1330, width: 100, height: 100, warning: .35, silent: true },
    { id: 'hole-3', x: 380, y: 780, width: 100, height: 100, warning: .35, silent: true },
  ],
  walls: [
    { id: 'wall-1', side: 'l', y: 1700, thickness: 80, triggerY: 1930, speed: 1000, hold: .6 },
    { id: 'wall-2', side: 'r', y: 1150, thickness: 80, triggerY: 1380, speed: 1000, hold: .6 },
  ],
  rain: [
    { id: 'rain-1', triggerY: 700, delay: .2, warn: .7, aim: 'player' },
    { id: 'rain-2', triggerY: 630, delay: .2, warn: .7, aim: 'player' },
  ],
  rescue: { kind: 'fawn', x: 520, y: 2330, found: 70, lag: 90 },
  chapters: [
    { above: 3250, text: 'どこかに、迷子の子鹿がいる。' },
    { above: 2550, text: '子鹿は、通った道をついてくる。' },
    { above: 1950, text: '壁も、子鹿の上に来る。' },
    { above: 1200, text: '通れる道を、選んであげよう。' },
    { above: 700, text: 'あと少し。出口へ！' },
    { above: -Infinity, text: 'もう、出口は目の前。' },
  ],
  hints: {
    poop: 'うんこに、当たった…！\nすきまを通る道を、選ぼう。\n子鹿は、同じ道をついてくる。',
    fall: FALL_HINT, wall: WALL_HINT,
    caught: '子鹿が、はぐれてしまった…！\n子鹿は、少し後ろを同じ道でついてくる。\n壁や穴、降ってくるうんこに注意。',
  },
};

/** ステージ1の枠。 */
export const STAGE_1: LevelSlot[] = [
  { id: '1-1', title: LEVEL_1_1.title, summary: '安全そうな道を、よく見よう', level: LEVEL_1_1 },
  { id: '1-2', title: LEVEL_1_2.title, summary: 'ふさがれた道を、跳ぶ', level: LEVEL_1_2 },
  { id: '1-3', title: LEVEL_1_3.title, summary: '横から、壁が出てくる', level: LEVEL_1_3 },
  { id: '1-4', title: LEVEL_1_4.title, summary: '鹿が、追いかけてくる', level: LEVEL_1_4 },
  { id: '1-5', title: LEVEL_1_5.title, summary: '全部まとめて挑戦', level: LEVEL_1_5 },
  { id: '1-6', title: LEVEL_1_6.title, summary: '正面からも、鹿が来る', level: LEVEL_1_6 },
  { id: '1-7', title: LEVEL_1_7.title, summary: '空から、降ってくる', level: LEVEL_1_7 },
  { id: '1-8', title: LEVEL_1_8.title, summary: '壁が、せまってくる', level: LEVEL_1_8 },
  { id: '1-9', title: LEVEL_1_9.title, summary: '3頭の鹿から逃げる', level: LEVEL_1_9 },
  { id: '1-10', title: LEVEL_1_10.title, summary: 'ステージ1の最終関門', level: LEVEL_1_10 },
];

/** まだ作っていない3D走りの面(行き先のメモ) */
const PLANNED: Record<string, { title: string; summary: string }> = {
  '3-7': { title: '吉野 金峯山寺へ', summary: '案を検討中' },
  '3-8': { title: '谷瀬のつり橋から郡山城へ', summary: 'ゆれる橋でバランス' },
  '3-9': { title: '佐保川の桜並木', summary: '桜のトンネルを、奈良公園へ' },
};

export const STAGES: { stage: number; title: string; slots: LevelSlot[] }[] = [
  { stage: 1, title: '足元にご用心', slots: STAGE_1 },
  {
    stage: 2, title: '鹿せんべい配達', slots: [
      { id: '2-1', title: LEVEL_2_1.title, summary: 'せんべいを、持っていく', level: LEVEL_2_1 },
      { id: '2-2', title: LEVEL_2_2.title, summary: '指定された鹿を、見分ける', level: LEVEL_2_2 },
      { id: '2-3', title: LEVEL_2_3.title, summary: '横取りされる前に、おとり', level: LEVEL_2_3 },
      { id: '2-4', title: LEVEL_2_4.title, summary: 'おとりで、道をあける', level: LEVEL_2_4 },
      { id: '2-5', title: LEVEL_2_5.title, summary: '群れを、抜ける', level: LEVEL_2_5 },
    ],
  },
  {
    // ステージ3は、Three.js の3D走りゲーム(/run/)。作った面は runner/levels.ts、まだの面は行き先だけ書いた「準備中」
    stage: 3, title: '鹿の大脱走', slots: Array.from({ length: 10 }, (_, i) => `3-${i + 1}`).map(id => {
      const r = RUNNER_LEVELS.find(x => x.id === id);
      return r ? { id, title: r.title, summary: r.summary, runnerId: id } : { id, ...PLANNED[id] };
    }),
  },
  // ステージ4は掃除(仮の面。遊び方は、これから決める)
  { stage: 4, title: '奈良公園大掃除', slots: [{ id: '4-1', title: LEVEL_4_1.title, summary: 'うんこを掃く(作り直し予定)', level: LEVEL_4_1 }] },
  // ステージ5は保留(5-1の定義は残してある)
  { stage: 5, title: '森のなかま救出', slots: [{ id: '5-1', title: LEVEL_5_1.title, summary: '保留中' }] },
];

/** 遊べる面だけを、遊ぶ順に並べたもの。 */
export const PLAYABLE: LevelDefinition[] = STAGES.flatMap(s => s.slots.flatMap(slot => (slot.level ? [slot.level] : [])));
/** 遊べる枠(通常の面と3D走りの面)を、遊ぶ順に並べたもの。記録・解放の順に使う。 */
export const ALL_PLAYABLE_SLOTS: { id: string; stage: number; runner: boolean }[] = STAGES.flatMap(g => g.slots.filter(s => s.level || s.runnerId).map(s => ({ id: s.id, stage: g.stage, runner: !!s.runnerId })));
export const levelById = (id: string): LevelDefinition | undefined => PLAYABLE.find(l => l.id === id);
