import { FIELD } from './stage.ts';
import type { ArenaDefinition, HungryDefinition, LineDefinition, NightDefinition, SenbeiDefinition } from './stage.ts';
import { RUNNER_LEVELS } from '../runner/levels.ts';
import { CART_LEVELS, CART_PLANNED } from '../cart/levels.ts';
import { BAKE_LEVELS } from '../bake/levels.ts';
import type { ChaserDefinition, CoinDefinition, CrosserDefinition, CrossDefinition, DeliveryDefinition, HedgeDefinition, PondDefinition, RescueDefinition, StoneDefinition, SweepDefinition, GoalDefinition, Point, RainDefinition, SliderDefinition, TrapDefinition, WallDefinition } from './stage.ts';

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
  /** 通れない植え込みなど(道の形を作る)。 */
  hedges?: HedgeDefinition[];
  /** 池と、飛び石・はすの葉。 */
  ponds?: PondDefinition[];
  stones?: StoneDefinition[];
  /** コイン(シルバー・ゴールド・プレミアム)。 */
  coins?: CoinDefinition[];
  /** 投げるせんべい(拾う場所・最初の枚数)と、せんべいが好きな鹿。 */
  senbei?: SenbeiDefinition;
  hungry?: HungryDefinition[];
  /** 道を横切る列(人力車・鹿の行列)。 */
  lines?: LineDefinition[];
  /** 夜の面(灯りのまわりしか見えない)。 */
  night?: NightDefinition;
  /** 閉じこめられる広場。 */
  arena?: ArenaDefinition;
  chapters: Chapter[];
  /** 失敗の原因と、次の攻略方法（失敗の種類ごと）。water=池に落ちた */
  hints: { poop: string; fall: string; wall: string; caught?: string; water?: string };
};

/** 一覧に出す枠。level も runnerId も無い枠は「準備中」として表示する。 */
export type LevelSlot = { id: string; title: string; summary: string; level?: LevelDefinition; /** 3D走りゲーム(/run/)の面。runner/levels.ts の id */ runnerId?: string; /** 別のページで遊ぶ3Dの面の、ページ(無ければ /run/)。WORLD 8 は /cart/ */ page?: string };

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
  // 道の形(2026-11-16): 植え込みで、ゆるいS字に。コインは、すき間の上と、奥のすみに
  hedges: [{ x: 100, y: 2640, w: 280, h: 50 }, { x: 340, y: 1140, w: 280, h: 50 }],
  coins: [
    { x: 360, y: 3280 }, { x: 384, y: 3150 }, { x: 500, y: 2760 }, { x: 500, y: 2600 }, { x: 448, y: 2500 },
    { x: 150, y: 2160, kind: 'gold' }, // 鹿の道の手前、左のすみ
    { x: 256, y: 1750 }, { x: 230, y: 1250 }, { x: 384, y: 1050 },
    { x: 565, y: 600, kind: 'premium', air: true }, // ゴールの手前、右のすみ(跳ぶと取れる)
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
    { above: 2750, text: '植え込みは、通れない。すき間へ。' },
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
  // 道の形(2026-11-16): 最後のうんこ列の前に、右だけあいた植え込み
  hedges: [{ x: 100, y: 1270, w: 270, h: 50 }],
  coins: [
    { x: 512, y: 3260 }, { x: 560, y: 2900 }, // 跳んだ先の、安全な着地点
    { x: 512, y: 2600 }, { x: 150, y: 2470, kind: 'gold' }, // ふさぐ列のあいだの、左のすみ
    { x: 256, y: 1950 }, { x: 448, y: 1500 }, { x: 470, y: 1200 }, { x: 384, y: 1050 },
    { x: 200, y: 1420, kind: 'premium', air: true }, // 左の奥(跳ぶと取れる)
    { x: 560, y: 820 },
  ],
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
  // 道の形(2026-11-16): 最初は左のすき間、壁のあとは右のすき間
  hedges: [{ x: 300, y: 2900, w: 320, h: 50 }, { x: 100, y: 1180, w: 300, h: 50 }],
  coins: [
    { x: 384, y: 3150 }, { x: 200, y: 3010 }, { x: 200, y: 2820 }, { x: 360, y: 2420 },
    { x: 575, y: 2300, kind: 'gold' }, // 2つ目の壁の手前、右のすみ
    { x: 256, y: 1800 }, { x: 150, y: 1500, kind: 'premium', air: true }, // 走るうんこの先(跳ぶと取れる)
    { x: 500, y: 1260 }, { x: 448, y: 1000 }, { x: 360, y: 660 },
  ],
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
  // 道の形(2026-11-16): まん中へ狭まる植え込みと、分かれ道の柱(左は遠回り、右は近い)。鹿も植え込みを回ってくる
  hedges: [
    { x: 100, y: 2200, w: 150, h: 50 }, { x: 520, y: 2200, w: 100, h: 50 },
    { x: 290, y: 1100, w: 140, h: 200, look: 'rock' },
  ],
  coins: [
    { x: 256, y: 3150 }, { x: 360, y: 2800, kind: 'premium', air: true }, // 跳ぶと取れる(鹿が追ってくる中で)
    { x: 448, y: 2650 }, { x: 380, y: 2160 }, { x: 256, y: 2100 }, { x: 384, y: 1550 },
    { x: 160, y: 1200, kind: 'gold' }, // 分かれ道の、遠回りの左
    { x: 512, y: 1000 }, { x: 360, y: 600 },
  ],
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
  // 道の形(2026-11-16): 最後のすきまのあと、右だけあいた植え込み
  hedges: [{ x: 100, y: 960, w: 320, h: 50 }],
  coins: [
    { x: 512, y: 3260 }, { x: 560, y: 2900 }, { x: 360, y: 2620 }, { x: 360, y: 2200 },
    { x: 150, y: 2560, kind: 'gold' }, // 降ってくる所の、左のすみ
    { x: 256, y: 1850 }, { x: 448, y: 1350 }, { x: 520, y: 900 },
    { x: 150, y: 1150, kind: 'premium', air: true }, // 植え込みの手前、左の奥(跳ぶと取れる)
    { x: 360, y: 600 },
  ],
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
  id: '旧1-6', stage: 1, title: '前からも、後ろからも', // 2026-11-15 WORLD 1 の再編で外した(追う鹿の言いかえ)
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
  id: '旧1-7', stage: 1, title: '雨の降る道', // 2026-11-15 WORLD 1 の再編で外した(降るうんこは、ほかの面に入っている)
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
  id: '旧1-8', stage: 1, title: 'せまる壁', // 2026-11-16 外した(1-7 は「夜の参道」に)
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
  id: '旧1-9', stage: 1, title: '立ち止まれない', // 2026-11-15 WORLD 1 の再編で外した(追う鹿の言いかえ)
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

/** 1-10: ステージ1の最終関門。これまでのしかけが、全部。後半は、閉じこめられる広場(2026-11-16、設計書 28章 A3)。 */
export const LEVEL_1_10: LevelDefinition = {
  id: '1-10', stage: 1, title: '最終関門',
  intro: 'ここまでの、全部。',
  start: { x: 360, y: 3400 },
  poops: [...row(3200, 512), ...block(3080), ...row(2500, 256), ...block(1950), { x: 330, y: 1120 }, { x: 420, y: 1330 }, ...row(900, 256)],
  deers: [],
  // 広場(1000〜1500): 入ると後ろの門が閉まる。8秒、追う鹿2頭と、足もとへ降るうんこから逃げきると、前の門が開く
  arena: { top: 1000, bottom: 1470, enterY: 1445, survive: 8, every: 1.1, warn: .75 },
  hedges: [{ x: 190, y: 1160, w: 70, h: 70, look: 'rock' }, { x: 470, y: 1230, w: 70, h: 70, look: 'rock' }],
  coins: [
    { x: 512, y: 3300 }, { x: 560, y: 2930 }, { x: 256, y: 2500 }, { x: 470, y: 2380 },
    { x: 575, y: 2620, kind: 'gold' }, // 壁の手前、右のすみ
    { x: 520, y: 1800 }, { x: 160, y: 1400 }, { x: 560, y: 1380 }, { x: 360, y: 1230, kind: 'gold' }, { x: 160, y: 1060 }, { x: 560, y: 1060 }, { x: 256, y: 900 },
    { x: 150, y: 1300, kind: 'premium', air: true }, // 広場の左(逃げながら、跳ぶと取れる)
    { x: 560, y: 600, kind: 'gold' },
  ],
  traps: [
    { id: 'landing-hole', x: 180, y: 2900, width: 280, height: 130, warning: .05, trigger: 'land', landReach: 110, silent: true },
    { id: 'hole-1', x: 190, y: 2350, width: 130, height: 100, warning: .3, silent: true },
    { id: 'landing-hole-2', x: 160, y: 1730, width: 300, height: 120, warning: .05, trigger: 'land', landReach: 110, silent: true },
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
  rain: [],
  chasers: [
    { id: 'stag', kind: 'stag', x: 360, y: 2650, triggerY: 2200, speed: 210 },
    // 広場の鹿(門が開くと、座る)
    { id: 'arena-doe', kind: 'doe', x: 150, y: 1060, triggerY: 1445, speed: 165, arena: true },
    { id: 'arena-fawn', kind: 'fawn', x: 570, y: 1080, triggerY: 1445, speed: 180, arena: true },
  ],
  goal: { x: 360, y: 300, moveTo: { x: 550, y: 300, within: 260, speed: 420 } },
  chapters: [
    { above: 3150, text: 'ここまでの、全部。' },
    { above: 2700, text: '壁も、来る。' },
    { above: 2200, text: '鹿も、来る。' },
    { above: 1750, text: 'ふさがれた道は、跳ぶしかない。' },
    { above: 1450, text: 'ひらけた広場…？' },
    { above: 950, text: '逃げきった！ あと少し。' },
    { above: 700, text: '…旗は、動かないよね？' },
    { above: -Infinity, text: 'あと少し。旗のところへ！' },
  ],
  hints: {
    poop: 'ここまでの全部が、お待ちかね。\nどこで何が来るかは、毎回同じ。\n一つずつ、覚えて越えよう。',
    fall: '着地した場所や、すきまの先、\nゴールの前に、穴がある。\n一度見たら、次は避けられる。',
    wall: WALL_HINT,
    caught: '鹿に追いつかれた…！\n広場では、止まらず大きく回ろう。\n岩をはさむと、鹿は回り道をする。',
  },
};

const STOLEN_HINT = 'せんべいを、取られた…！\n鹿は、せんべいの匂いで寄ってくる。\n近づかれる前に、おとりを置こう。';

/** 2-1: はじめての配達。せんべいを持って、目印の鹿へ。道は穴とうんこ。 */
export const LEVEL_2_1: LevelDefinition = {
  id: '旧2-1', stage: 1, title: 'はじめての配達', // 2026-11-15 WORLD 1 の再編で外した(届けるだけ)
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
  id: '旧2-2', stage: 1, title: '届け先は、子鹿', // 2026-11-15 WORLD 1 の再編で外した(見分けるだけ)
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
  id: '旧2-3', stage: 1, title: '横取りしにくる鹿', // 2026-11-15 外した(1-6 は池の面に。せんべいは「投げる」に作り直す)
  // 配達の入門(旧2-1・2-2)を外したので、届けることも、ここで伝える
  intro: 'せんべいを、奥の鹿へ届けよう。\nボタンで置くと、ほかの鹿はそっちへ行く。',
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

/**
 * 新1-6: 池のほとりの、曲がり道(2026-11-15。設計書 28章の A1・A2・C1)。
 * ① 植え込みのS字(すき間を左右に抜ける。行き止まりの袋にゴールド)
 * ② 池の飛び石(左=沈む石、右=動くはすの葉。プレミアムは右の空中)
 * ③ 分かれ道(右は広くて安全そうだが、見えない穴。左は、うんこの間をぬう)
 */
export const LEVEL_1_6_POND: LevelDefinition = {
  id: '1-6', stage: 1, title: '池のほとりの、曲がり道',
  intro: '道が、くねくね曲がっている。\nその先には、池。',
  start: { x: 360, y: 3400 },
  poops: [
    { x: 500, y: 3010 }, { x: 560, y: 2980 }, // S字の右のすき間の先
    { x: 180, y: 2740 }, { x: 240, y: 2700 }, // S字の左のすき間の先
    // ③ 左の道: うんこの間をぬう
    { x: 150, y: 1460 }, { x: 260, y: 1360 }, { x: 160, y: 1240 }, { x: 260, y: 1120 }, { x: 150, y: 1000 }, { x: 250, y: 880 },
    ...row(620, 360),
  ],
  deers: [],
  traps: [
    // ③ 右の道: 広くて安全そう。でも、真ん中が抜ける
    { id: 'right-hole', x: 440, y: 1060, width: 150, height: 130, warning: .25, silent: true },
  ],
  walls: [], sliders: [], chasers: [], rain: [],
  hedges: [
    // ① S字: 右があく → 左があく
    { x: 100, y: 3060, w: 340, h: 60 },
    { x: 280, y: 2790, w: 340, h: 60 },
    // 行き止まりの袋(右下)。ゴールドがあるが、戻る手間がかかる
    { x: 470, y: 2600, w: 150, h: 40 },
    // ② 池の両側は、灯籠の列(池を回り道できない)
    { x: 100, y: 1860, w: 30, h: 560, look: 'lantern' },
    { x: 590, y: 1860, w: 30, h: 560, look: 'lantern' },
    // ③ 分かれ道のまんなか
    { x: 300, y: 820, w: 120, h: 700, look: 'hedge' },
  ],
  ponds: [{ x: 130, y: 1900, w: 460, h: 470 }],
  stones: [
    // 左の道: 3つめが沈む(長く立ち止まらない)
    { id: 'l1', x: 250, y: 2280, r: 36 },
    { id: 'l2', x: 200, y: 2140, r: 34 },
    { id: 'l3', x: 260, y: 2010, r: 32, sink: .9 },
    // 右の道: はすの葉が左右に動く
    { id: 'r1', x: 470, y: 2280, r: 36 },
    { id: 'r2', x: 470, y: 2120, r: 40, lily: true, move: { dx: 70, period: 3.2 } },
    { id: 'r3', x: 470, y: 1990, r: 34 },
  ],
  coins: [
    { x: 360, y: 3250 }, { x: 360, y: 3180 },
    { x: 530, y: 3140 }, { x: 530, y: 2930 }, { x: 470, y: 2880 },
    { x: 180, y: 2880 }, { x: 170, y: 2650 }, { x: 250, y: 2520 },
    { x: 545, y: 2700, kind: 'gold' }, // 行き止まりの袋
    { x: 250, y: 2400 }, { x: 470, y: 2400 },
    { x: 470, y: 2200, kind: 'premium', air: true }, // 動く葉へ跳ぶとちゅう
    { x: 230, y: 2075, air: true }, { x: 225, y: 2210, air: true },
    { x: 360, y: 1800 },
    { x: 205, y: 1410 }, { x: 205, y: 1180 }, { x: 205, y: 940 }, { x: 205, y: 1300, kind: 'gold' },
    { x: 515, y: 1400 }, { x: 515, y: 1300 }, // 右の道の、さそいのコイン
    { x: 360, y: 760 }, { x: 360, y: 480 },
  ],
  chapters: [
    { above: 3150, text: '植え込みの、すき間へ。' },
    { above: 2550, text: '右の奥に、何か光ってる。' },
    { above: 2400, text: '池だ。石の上を、跳んで渡ろう。' },
    { above: 1850, text: '道が、ふたつに分かれてる。' },
    { above: 750, text: 'あと少し。' },
    { above: -Infinity, text: 'ゴールは、目の前。' },
  ],
  hints: {
    poop: 'うんこに、当たった…！\n曲がり道では、すき間の先に注意。',
    fall: '広くて安全そうな道ほど、あやしい。\n分かれ道は、もう一方へ。',
    wall: WALL_HINT,
    water: '池に、落ちた…！\n左の3つめの石は、乗ると沈む。\nはすの葉は、動きに合わせて跳ぼう。',
  },
};

/** すき間(幅90)をふさぐ植え込みの列。gap はすき間の中心。 */
const hedgeRow = (y: number, gap: number, look: 'hedge' | 'lantern' | 'rock' = 'hedge') => [
  { x: 100, y, w: gap - 45 - 100, h: 50, look }, { x: gap + 45, y, w: 620 - gap - 45, h: 50, look },
];

/**
 * 新1-8: せんべいで、道をあける(2026-11-15。設計書 28章の B1)。
 * すき間に立つ鹿へ、せんべいを投げて、どいてもらう。食べ終わると、鹿は元の場所へ戻ってくる。
 * ① 1頭(覚える) ② 左右に1頭ずつ(拾いながら) ③ 池の向こうの1頭(池に投げると、しずむ)
 */
export const LEVEL_1_8_SENBEI: LevelDefinition = {
  id: '1-8', stage: 1, title: 'せんべいで、道をあける',
  intro: 'すき間に、鹿が立っている。\nせんべいを拾って、投げてみよう。',
  start: { x: 360, y: 3400 },
  poops: [
    { x: 180, y: 2800 }, { x: 540, y: 2760 },
    ...row(2350, 420),
    { x: 250, y: 1960 }, { x: 470, y: 1900 },
    ...row(620, 360),
  ],
  deers: [], traps: [], walls: [], sliders: [], chasers: [], rain: [],
  hedges: [
    ...hedgeRow(3000, 360),
    ...hedgeRow(2550, 200),
    ...hedgeRow(2150, 520),
    ...hedgeRow(1150, 360, 'lantern'),
  ],
  ponds: [{ x: 130, y: 1300, w: 460, h: 360 }],
  stones: [
    { id: 's1', x: 360, y: 1610, r: 36 },
    { id: 's2', x: 300, y: 1500, r: 34 },
    { id: 's3', x: 380, y: 1390, r: 36 },
  ],
  senbei: { pickups: [{ x: 360, y: 3260 }, { x: 220, y: 3200 }, { x: 470, y: 2720 }, { x: 300, y: 2300 }, { x: 360, y: 1800 }, { x: 560, y: 1980 }] },
  hungry: [
    { id: 'b1', kind: 'doe', x: 360, y: 3025, mode: 'block', sense: 300, speed: 210, eat: 2.6 },
    { id: 'b2', kind: 'stag', x: 200, y: 2575, mode: 'block', sense: 320, speed: 220, eat: 2.4 },
    { id: 'b3', kind: 'fawn', x: 520, y: 2175, mode: 'block', sense: 320, speed: 230, eat: 2.2 },
    { id: 'b4', kind: 'stag', x: 360, y: 1175, mode: 'block', sense: 260, speed: 220, eat: 2.2 },
  ],
  coins: [
    { x: 360, y: 3180 }, { x: 360, y: 2900 }, { x: 360, y: 2820 },
    { x: 200, y: 2680 }, { x: 200, y: 2460 }, { x: 420, y: 2280 },
    { x: 520, y: 2060 }, { x: 590, y: 2420, kind: 'gold' }, // 右の奥(行き止まり)
    { x: 360, y: 1700 }, { x: 330, y: 1555, air: true }, { x: 340, y: 1445, air: true },
    { x: 540, y: 1250, kind: 'premium', air: true }, // 池をわたった先の右すみ(跳ぶと取れる)
    { x: 360, y: 1050 }, { x: 360, y: 820 }, { x: 360, y: 480 },
  ],
  chapters: [
    { above: 3100, text: 'せんべいを拾って、ボタンで投げる。' },
    { above: 2700, text: '鹿は、食べ終わると戻ってくる。' },
    { above: 2250, text: 'こっちの鹿にも、せんべいを。' },
    { above: 1700, text: '池の向こうにも、鹿が。' },
    { above: 1100, text: 'あと少し。' },
    { above: -Infinity, text: 'ゴールは、目の前。' },
  ],
  hints: {
    poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT,
    water: '池に、落ちた…！\n石から石へ、跳んで渡ろう。\nせんべいも、池に落ちると、しずむ。',
    caught: 'すき間の鹿は、通してくれない。\nせんべいを、すき間から横へ外れた所に投げよう。',
  },
};

/**
 * 新1-9: 追ってくる鹿(2026-11-15。設計書 28章の B1)。
 * せんべいの好きな鹿が、走って追ってくる。せんべいを投げると、食べている間は止まる。
 * ① 前から1頭 ② すき間の鹿と、後ろから1頭 ③ 左右から2頭(1枚では、たりない)
 */
export const LEVEL_1_9_CHASE: LevelDefinition = {
  id: '1-9', stage: 1, title: '追ってくる、くいしんぼう',
  intro: 'せんべいのにおいに、鹿が気づいた！',
  start: { x: 360, y: 3400 },
  poops: [
    { x: 250, y: 3000 }, { x: 470, y: 2950 }, { x: 360, y: 2800 },
    ...row(1750, 360),
    { x: 200, y: 1250 }, { x: 520, y: 1200 },
    ...row(560, 240),
  ],
  deers: [], traps: [], walls: [], sliders: [], chasers: [], rain: [],
  hedges: [
    ...hedgeRow(2300, 360),
    { x: 100, y: 1500, w: 120, h: 60, look: 'rock' }, { x: 500, y: 1500, w: 120, h: 60, look: 'rock' },
  ],
  senbei: { pickups: [{ x: 300, y: 3280 }, { x: 420, y: 3280 }, { x: 180, y: 2480 }, { x: 540, y: 2480 }, { x: 360, y: 2050 }, { x: 290, y: 1620 }, { x: 430, y: 1620 }] },
  hungry: [
    { id: 'c1', kind: 'stag', x: 160, y: 2600, mode: 'chase', sense: 320, speed: 200, eat: 2.6, triggerY: 3200 },
    { id: 'b1', kind: 'doe', x: 360, y: 2325, mode: 'block', sense: 280, speed: 210, eat: 2.4 },
    { id: 'c2', kind: 'doe', x: 580, y: 3100, mode: 'chase', sense: 320, speed: 205, eat: 2.4, triggerY: 2550 },
    { id: 'c3', kind: 'stag', x: 150, y: 1050, mode: 'chase', sense: 320, speed: 205, eat: 2.4, triggerY: 1550 },
    { id: 'c4', kind: 'fawn', x: 570, y: 980, mode: 'chase', sense: 320, speed: 215, eat: 2.2, triggerY: 1450 },
  ],
  coins: [
    { x: 360, y: 3180 }, { x: 200, y: 2900 }, { x: 520, y: 2800 },
    { x: 360, y: 2450 }, { x: 360, y: 2200 }, { x: 140, y: 2150, kind: 'gold' },
    { x: 360, y: 1900 }, { x: 360, y: 1620 },
    { x: 360, y: 1300, kind: 'premium', air: true },
    { x: 360, y: 1000 }, { x: 260, y: 800 }, { x: 460, y: 800 }, { x: 360, y: 450 },
  ],
  chapters: [
    { above: 3150, text: 'せんべいを、拾っておこう。' },
    { above: 2500, text: '来た！ 鹿の方へ、投げて止めよう。' },
    { above: 1800, text: '後ろからも、来る。' },
    { above: 1450, text: '左右から、2頭！' },
    { above: 700, text: 'あと少し。' },
    { above: -Infinity, text: 'ゴールは、目の前。' },
  ],
  hints: {
    poop: POOP_HINT, fall: FALL_HINT, wall: WALL_HINT,
    caught: 'つかまった…！\n鹿の方を向いて、せんべいを投げよう。\n食べている間に、走りぬける。\n跳んでいる間も、つかまらない。',
  },
};

/**
 * 新1-7: 夜の参道(2026-11-16。設計書 28章の C2・C3)。
 * 灯籠のまわりと、Spraの足もとしか見えない。人力車(跳べない)と鹿の行列(跳べる)が、道を横切る。
 * ① 暗い参道(灯りの外のうんこ・崩れる床) ② 横切る列が3本 ③ 暗い曲がり道と、最後の人力車
 */
export const LEVEL_1_7_NIGHT: LevelDefinition = {
  id: '1-7', stage: 1, title: '夜の参道',
  intro: '夜の参道。\n灯籠のまわりしか、見えない。',
  start: { x: 360, y: 3400 },
  poops: [
    { x: 300, y: 3180 }, { x: 470, y: 3080 }, { x: 220, y: 2980 }, { x: 400, y: 2900 }, { x: 520, y: 2800 }, { x: 260, y: 2720 },
    { x: 560, y: 1700 }, { x: 200, y: 1480 }, { x: 330, y: 1400 }, { x: 470, y: 1180 },
    ...row(620, 360),
  ],
  deers: [], walls: [], sliders: [], chasers: [], rain: [],
  traps: [
    { id: 'dark-hole', x: 300, y: 2600, width: 140, height: 90, warning: .45 },
    { id: 'turn-hole', x: 150, y: 1050, width: 130, height: 90, warning: .45 },
  ],
  hedges: [
    { x: 100, y: 1550, w: 340, h: 50 },
    { x: 280, y: 1250, w: 340, h: 50 },
  ],
  lines: [
    { id: 'L1', kind: 'deer', deer: 'doe', y: 2420, x0: 0, speed: 130, count: 4, spacing: 72 },
    { id: 'L2', kind: 'rickshaw', y: 2180, x0: 300, speed: -190, count: 2, spacing: 340 },
    { id: 'L3', kind: 'deer', deer: 'fawn', y: 1940, x0: 420, speed: 165, count: 5, spacing: 64 },
    { id: 'L4', kind: 'rickshaw', y: 880, x0: 100, speed: 230, count: 1, spacing: 0 },
  ],
  night: {
    lights: [
      { x: 140, y: 3250 }, { x: 580, y: 3000 }, { x: 140, y: 2760 },
      { x: 580, y: 2420 }, { x: 140, y: 2180 }, { x: 580, y: 1940 },
      { x: 560, y: 1620 }, { x: 160, y: 1330 }, { x: 590, y: 1000 }, { x: 360, y: 720 }, { x: 360, y: 420 },
    ],
    radius: 170, player: 125,
  },
  coins: [
    { x: 360, y: 3250 }, { x: 140, y: 3120 }, { x: 580, y: 2880 }, { x: 140, y: 2640 },
    { x: 360, y: 2300 }, { x: 360, y: 2060 },
    { x: 590, y: 1440, kind: 'gold' }, // 暗い曲がり角の奥
    { x: 470, y: 1650 }, { x: 200, y: 1380 }, { x: 360, y: 1120 },
    { x: 470, y: 1000, kind: 'premium', air: true },
    { x: 360, y: 780 }, { x: 360, y: 500 },
  ],
  chapters: [
    { above: 3100, text: '灯籠の明かりを、たよりに。' },
    { above: 2500, text: '足もとが、見えにくい…' },
    { above: 1800, text: '列が、道を横切っていく。人力車は、跳べない。' },
    { above: 1000, text: '暗い曲がり道。' },
    { above: 650, text: 'もう一台、来る！' },
    { above: -Infinity, text: 'ゴールの明かりが、見えた。' },
  ],
  hints: {
    poop: 'うんこに、当たった…！\n暗い所は、ゆっくり進もう。\nSpraの足もとは、少し見える。',
    fall: '暗くて、ひびが見えなかった…！\n「ミシッ」と聞こえたら、すぐ離れよう。',
    wall: WALL_HINT,
    caught: 'ぶつかった…！\n人力車は、跳んでも越えられない。\n列のすき間を、ねらって通ろう。\n鹿の行列は、跳べば越えられる。',
  },
};

/** 2-4: おとりで道をつくる。狭いすきまに、鹿が立っている。せんべいで、どかす。 */
export const LEVEL_2_4: LevelDefinition = {
  id: '旧2-4', stage: 1, title: 'おとりで道をつくる', // 2026-11-15 外した(投げるせんべいの新1-8へ)
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
  id: '旧2-5', stage: 1, title: '群れを抜けて', // 2026-11-15 外した(投げるせんべいの新1-9へ)
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

/** 3-1: はじめての大掃除(仮。作り直し予定)。うんこに触れると、掃ける。通り過ぎて残すと「見逃し」。見逃しが溜まると失敗。 */
export const LEVEL_3_1: LevelDefinition = {
  id: '3-1', stage: 3, title: 'はじめての大掃除',
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

/**
 * WORLD 1「Spraの大冒険」の10面(2026-11-15 Owner決定の案A)。旧ステージ2(せんべい配達)を入れ、
 * 似ている面・簡単すぎる面(旧1-6・1-7・1-9・2-1・2-2)を外した。並びは、しかけが毎回かわるように。
 */
export const STAGE_1: LevelSlot[] = [
  { id: '1-1', title: LEVEL_1_1.title, summary: '安全そうな道を、よく見よう', level: LEVEL_1_1 },
  { id: '1-2', title: LEVEL_1_2.title, summary: 'ふさがれた道を、跳ぶ', level: LEVEL_1_2 },
  { id: '1-3', title: LEVEL_1_3.title, summary: '横から、壁が出てくる', level: LEVEL_1_3 },
  { id: '1-4', title: LEVEL_1_4.title, summary: '鹿が、追いかけてくる', level: LEVEL_1_4 },
  { id: '1-5', title: LEVEL_1_5.title, summary: 'ここまでの、全部入り', level: LEVEL_1_5 },
  { id: '1-6', title: LEVEL_1_6_POND.title, summary: '曲がり道と、池の飛び石', level: LEVEL_1_6_POND },
  { id: '1-7', title: LEVEL_1_7_NIGHT.title, summary: '暗い道と、横切る人力車', level: LEVEL_1_7_NIGHT },
  { id: '1-8', title: LEVEL_1_8_SENBEI.title, summary: 'せんべいを投げて、どいてもらう', level: LEVEL_1_8_SENBEI },
  { id: '1-9', title: LEVEL_1_9_CHASE.title, summary: '追ってくる鹿を、せんべいで止める', level: LEVEL_1_9_CHASE },
  { id: '1-10', title: LEVEL_1_10.title, summary: 'WORLD 1 の最終関門', level: LEVEL_1_10 },
];

/** まだ作っていない3D走りの面(行き先のメモ)。2026-11-15に全10面がそろったので(いまは 4-1〜4-10)、今は空 */
const PLANNED: Record<string, { title: string; summary: string }> = {};

export const STAGES: { stage: number; title: string; slots: LevelSlot[] }[] = [
  { stage: 1, title: '足元にご用心', slots: STAGE_1 },
  // WORLD 2 は、Three.js のせんべい屋台(/bake/)。面は bake/levels.ts(設計書 30章)。旧ステージ2(配達)は WORLD 1 へ入れた
  { stage: 2, title: '鹿せんべい大作戦', slots: BAKE_LEVELS.map(l => ({ id: l.id, title: l.title, summary: l.summary, runnerId: l.id, page: '/bake/' })) },
  // 奇数のワールドは Spra が主役、偶数は鹿が主役(2026-11-19 Owner決定。WORLD 3 と 4 を入れかえた。src/renumber.ts)
  // WORLD 3 は掃除(仮の面。遊び方は、これから決める)
  { stage: 3, title: '奈良公園、大掃除！', slots: [{ id: '3-1', title: LEVEL_3_1.title, summary: 'うんこを掃く(作り直し予定)', level: LEVEL_3_1 }] },
  {
    // WORLD 4 は、Three.js の3D走りゲーム(/run/)。作った面は runner/levels.ts、まだの面は行き先だけ書いた「準備中」
    stage: 4, title: '鹿、走る。', slots: Array.from({ length: 10 }, (_, i) => `4-${i + 1}`).map(id => {
      const r = RUNNER_LEVELS.find(x => x.id === id);
      return r ? { id, title: r.title, summary: r.summary, runnerId: id } : { id, ...PLANNED[id] };
    }),
  },
  // ステージ5は保留(5-1の定義は残してある)
  { stage: 5, title: '森のなかま救出', slots: [{ id: '5-1', title: LEVEL_5_1.title, summary: '保留中' }] },
  // WORLD 8 は、Three.js の3Dトロッコ(/cart/)。作った面は cart/levels.ts、まだの面は名前だけの「準備中」
  {
    stage: 8, title: '鹿と暴走トロッコ', slots: [
      ...CART_LEVELS.map(l => ({ id: l.id, title: l.title, summary: l.summary, runnerId: l.id, page: '/cart/' })),
      ...CART_PLANNED.map(l => ({ id: l.id, title: l.title, summary: '準備中' })),
    ],
  },
];

/** 遊べる面だけを、遊ぶ順に並べたもの。 */
export const PLAYABLE: LevelDefinition[] = STAGES.flatMap(s => s.slots.flatMap(slot => (slot.level ? [slot.level] : [])));
/** 遊べる枠(通常の面と3D走りの面)を、遊ぶ順に並べたもの。記録・解放の順に使う。 */
export const ALL_PLAYABLE_SLOTS: { id: string; stage: number; runner: boolean }[] = STAGES.flatMap(g => g.slots.filter(s => s.level || s.runnerId).map(s => ({ id: s.id, stage: g.stage, runner: !!s.runnerId })));
/** 別のページで遊ぶ3Dの面(3D走り・トロッコ)の、行き先。 */
export const pageOf = (id: string): string => `${STAGES.flatMap(g => g.slots).find(s => s.id === id)?.page ?? '/run/'}?level=${id}`;
export const levelById = (id: string): LevelDefinition | undefined => PLAYABLE.find(l => l.id === id);
