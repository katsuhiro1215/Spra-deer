// ステージ3「鹿の大脱走」の面の一覧(3D走りゲームのシリーズ)。
// 面を足すときは、ここに1つ書くだけ。見た目は theme、手ごたえは rules、仕掛けは seed/extra で変える。
import { buildCourse, type Course, type Curve, type HillPoint, type PatternName, type Rules } from './course.ts';

/** 天気: leaves=舞う落ち葉 / petals=桜吹雪 */
export type Weather = 'none' | 'rain' | 'snow' | 'leaves' | 'petals';
/** 道の景色: sando=灯籠と杉の参道 / town=街道(夕焼けの街) / mountain=灯籠のない山道 / river=左に水路のある川ぞいの道 */
export type Setting = 'sando' | 'town' | 'mountain' | 'river';
/**
 * ゴールの景色: shrine=春日大社 / todaiji=東大寺の大仏殿 / horyuji=法隆寺 / omiwa=大神神社 / bay=大阪湾 / summit=山頂
 * heijo=平城宮跡の朱雀門 / zaodo=金峯山寺の蔵王堂 / castle=郡山城 / park=奈良公園
 */
export type GoalScene = 'shrine' | 'todaiji' | 'horyuji' | 'omiwa' | 'bay' | 'summit' | 'heijo' | 'zaodo' | 'castle' | 'park';
/** 道ばたの木: cedar=杉(既定) / maple=紅葉 / sakura=桜 */
export type Foliage = 'cedar' | 'maple' | 'sakura';

export interface Theme {
  setting: Setting;
  goal: GoalScene;
  weather: Weather;
  night: boolean;
  /** 空のグラデーション(上→地平線)。 */
  sky: [string, string, string, string];
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunPower: number;
  sunPos: [number, number, number];
  env: number;
  exposure: number;
  road: { base: string; specks: string[]; rough: number };
  grass: { base: string; specks: string[] };
  /** 灯籠の灯りの強さ(夜は強く)。 */
  lampGlow: number;
  /** 灯りのまわりのぼんやりした光(0=なし)。 */
  halo: number;
  /** 木に雪をのせる。 */
  snowCaps: boolean;
  /** 道ばたの木(無ければ杉) */
  foliage?: Foliage;
}

/** 道ばたの名所(目印と、回復薬の場所)。at=コース全体に対する割合。 */
export interface Landmark {
  at: number;
  /** pagoda=三重の塔 / pagoda5=五重塔 / hall=金堂 */
  kind: 'pagoda' | 'pagoda5' | 'hall';
  side: 1 | -1;
  name: string;
}

export interface RunnerLevel {
  id: string;
  title: string;
  summary: string;
  intro: string;
  length: number;
  seed: number;
  difficulty: number;
  extra: PatternName[];
  /** この面に出る動物・モンスター(critters.ts の名前) */
  critters?: string[];
  opening?: PatternName[];
  rules: Rules;
  /** 曲がる道(無ければ、まっすぐ) */
  curve?: Curve;
  /** 坂(無ければ、平ら)。ゴールの100m手前からは平らにする */
  hills?: HillPoint[];
  /** 街道の面で、ここ(割合)より手前は、杉の山道の景色にする(山を下りて街に入る) */
  townFrom?: number;
  /** この割合より先でだけ出す罠(例: 踏切は街に入ってから) */
  after?: Partial<Record<PatternName, number>>;
  /** つり橋の区間(割合) */
  bridge?: { from: number; to: number };
  /** 突進する動物が動き出すとき、法螺貝が鳴る(吉野) */
  horn?: boolean;
  theme: Theme;
  /** 回復薬を置く場所(割合) */
  potions?: number[];
  /** この割合を過ぎると、大仏の目が光り、罠がぐっとふえる */
  wake?: number;
  landmarks?: Landmark[];
  goalName: string;
  /** 半分・8割・9割を過ぎたときの一言。 */
  lines: [string, string, string];
}

const SANDO = { setting: 'sando', goal: 'shrine' } as const;

const DAY: Theme = {
  ...SANDO, weather: 'none', night: false,
  sky: ['#5aa9ec', '#a9d6f5', '#e6f2ea', '#eef4df'],
  fog: 0xe3f0e6, fogNear: 90, fogFar: 340,
  hemiSky: 0xdcefff, hemiGround: 0x8fae7a, hemi: 0.85,
  sun: 0xfff0d2, sunPower: 2.6, sunPos: [14, 26, 8], env: 0.45, exposure: 1.05,
  road: { base: '#cdbf9f', specks: ['#b9a984', '#ddd0b4', '#a8987a', '#e6dcc4'], rough: 1 },
  grass: { base: '#6fae4f', specks: ['#5f9d43', '#82c25e', '#559338'] },
  lampGlow: 1.6, halo: 0, snowCaps: false,
};

const NIGHT: Theme = {
  ...SANDO, weather: 'none', night: true,
  // まっくらな参道。鹿の足元だけがぼんやり見える(霧を近くに寄せ、環境光をほぼ消している)
  sky: ['#02040f', '#050a1e', '#0a1330', '#111b3d'],
  fog: 0x070b1f, fogNear: 6, fogFar: 46,
  hemiSky: 0x4a5fa0, hemiGround: 0x141c2c, hemi: 0.16,
  sun: 0xa8bcff, sunPower: 0.45, sunPos: [-12, 28, 12], env: 0.04, exposure: 1.25,
  road: { base: '#a39d8c', specks: ['#8c8778', '#b8b2a0', '#7d7869'], rough: 1 },
  grass: { base: '#2f6a46', specks: ['#285a3c', '#3b7a52', '#23503a'] },
  lampGlow: 5, halo: 1, snowCaps: false,
};

const RAIN: Theme = {
  ...SANDO, weather: 'rain', night: false,
  sky: ['#667688', '#92a0ae', '#bcc7d0', '#d3dade'],
  fog: 0xb4bfc7, fogNear: 30, fogFar: 220,
  hemiSky: 0xcad6e2, hemiGround: 0x6f8070, hemi: 0.85,
  sun: 0xdfe6ee, sunPower: 1.2, sunPos: [10, 26, 10], env: 0.3, exposure: 1.0,
  road: { base: '#8d8576', specks: ['#7a7366', '#9d9585', '#6e675a'], rough: 0.32 },
  grass: { base: '#4c8a46', specks: ['#3f7a3b', '#5a9a52', '#356e34'] },
  lampGlow: 3, halo: 0.45, snowCaps: false,
};

const SNOW: Theme = {
  ...SANDO, weather: 'snow', night: false,
  sky: ['#8aa0be', '#b9c9dc', '#e1eaf2', '#f1f5f9'],
  fog: 0xe6edf4, fogNear: 40, fogFar: 240,
  hemiSky: 0xeaf2ff, hemiGround: 0xb7c4d4, hemi: 1.0,
  sun: 0xfff6e6, sunPower: 1.9, sunPos: [14, 24, 8], env: 0.5, exposure: 1.1,
  road: { base: '#d3dde8', specks: ['#bccadb', '#eef3f8', '#c6d3e2'], rough: 0.8 },
  grass: { base: '#f3f7fb', specks: ['#dce6f0', '#ffffff', '#cfdbe8'] },
  lampGlow: 3, halo: 0.55, snowCaps: true,
};

const MOUNTAIN: Theme = {
  setting: 'mountain', goal: 'summit', weather: 'none', night: false,
  sky: ['#4fa3e8', '#9ccff2', '#d9efe6', '#eef5dc'],
  fog: 0xdcebe0, fogNear: 70, fogFar: 300,
  hemiSky: 0xdcefff, hemiGround: 0x8fae7a, hemi: 0.85,
  sun: 0xfff0d2, sunPower: 2.6, sunPos: [14, 26, 8], env: 0.45, exposure: 1.05,
  road: { base: '#b89d74', specks: ['#a68a62', '#c9b088', '#9a8056', '#d6c298'], rough: 1 },
  grass: { base: '#86ad55', specks: ['#76a047', '#98bf66', '#6a9440'] },
  lampGlow: 1.6, halo: 0, snowCaps: false,
};

/** 夜の東大寺(大仏殿がゴール) */
const NIGHT_TODAIJI: Theme = { ...NIGHT, goal: 'todaiji' };
/** 山道は、坂の向こうが見えにくいよう、霧を近くにする */
const MOUNTAIN_MIST: Theme = { ...MOUNTAIN, fogNear: 26, fogFar: 150 };
const RAIN_HORYUJI: Theme = { ...RAIN, goal: 'horyuji' };
const SNOW_OMIWA: Theme = { ...SNOW, goal: 'omiwa' };

/** 夕方の街(若草山を下りて、平城宮跡へ) */
const EVENING_HEIJO: Theme = {
  setting: 'town', goal: 'heijo', weather: 'none', night: false,
  sky: ['#3e4f9c', '#b57aa0', '#f3a878', '#ffdcae'],
  fog: 0xf0c6a6, fogNear: 60, fogFar: 300,
  hemiSky: 0xffe2c8, hemiGround: 0x7a6e5a, hemi: 0.85,
  sun: 0xffb070, sunPower: 2.3, sunPos: [-16, 14, -6], env: 0.35, exposure: 1.08,
  road: { base: '#6a6c72', specks: ['#5c5e64', '#787a80', '#515359'], rough: 0.9 },
  grass: { base: '#7f9a4e', specks: ['#6f8a42', '#90ab5c', '#62803a'] },
  lampGlow: 3.2, halo: 0.55, snowCaps: false,
};

/** 秋の吉野(紅葉と落ち葉) */
const AUTUMN_YOSHINO: Theme = {
  setting: 'mountain', goal: 'zaodo', weather: 'leaves', night: false, foliage: 'maple',
  sky: ['#4c8fd8', '#9cc6ec', '#f1dcc0', '#f6e6c8'],
  fog: 0xefdcc2, fogNear: 50, fogFar: 230,
  hemiSky: 0xffeedd, hemiGround: 0x9a7a4a, hemi: 0.85,
  sun: 0xffd9a8, sunPower: 2.4, sunPos: [14, 22, 6], env: 0.4, exposure: 1.05,
  road: { base: '#b59a72', specks: ['#a3875e', '#c7ad86', '#94784f', '#d4b98e'], rough: 1 },
  grass: { base: '#a8954a', specks: ['#988640', '#b9a75a', '#c08a3c', '#8a7a38'] },
  lampGlow: 1.6, halo: 0, snowCaps: false,
};

/** 谷瀬のつり橋(深い緑の谷)から、郡山城へ */
const BRIDGE_CASTLE: Theme = {
  ...MOUNTAIN, goal: 'castle', fogNear: 80, fogFar: 320,
  grass: { base: '#5f9a48', specks: ['#4f8a3c', '#72ad58', '#467e34'] },
};

/** 春の佐保川(桜吹雪)から、奈良公園へ */
const SPRING_PARK: Theme = {
  setting: 'river', goal: 'park', weather: 'petals', night: false, foliage: 'sakura',
  sky: ['#6ab0ee', '#b6dcf6', '#f4e6ee', '#f6eef0'],
  fog: 0xf4e4ea, fogNear: 60, fogFar: 280,
  hemiSky: 0xfff0f4, hemiGround: 0x8fae7a, hemi: 0.9,
  sun: 0xfff2e2, sunPower: 2.5, sunPos: [14, 26, 8], env: 0.45, exposure: 1.06,
  road: { base: '#d6c9aa', specks: ['#c4b692', '#e2d6bb', '#b9a985', '#f0c8d4'], rough: 1 },
  grass: { base: '#78b452', specks: ['#68a344', '#8ac462', '#f2c4d2', '#5c9638'] },
  lampGlow: 1.6, halo: 0, snowCaps: false,
};

const BAY: Theme = {
  setting: 'town', goal: 'bay', weather: 'none', night: false,
  sky: ['#4a4896', '#bc6c9a', '#f2a068', '#ffd9a0'],
  fog: 0xf0c4a0, fogNear: 70, fogFar: 340,
  hemiSky: 0xffe0c0, hemiGround: 0x7a6a60, hemi: 0.85,
  sun: 0xffa860, sunPower: 2.4, sunPos: [-18, 12, -10], env: 0.35, exposure: 1.1,
  road: { base: '#5d6068', specks: ['#50535a', '#6b6e76', '#464950'], rough: 0.9 },
  grass: { base: '#718f4c', specks: ['#617f3f', '#84a25a', '#56733a'] },
  lampGlow: 3.5, halo: 0.7, snowCaps: false,
};

export const RUNNER_LEVELS: RunnerLevel[] = [
  {
    id: '3-1', title: '春日大社へ', summary: '灯籠の参道を、まっすぐ駆ける',
    intro: '◀ ▶ で よけて、ジャンプで あなを こえよう！',
    length: 1000, seed: 20261114, difficulty: 0,
    extra: [], rules: { speed0: 13, speed1: 20, steerAccel: 42, steerSpeed: 6.8 },
    theme: DAY, goalName: '春日大社',
    lines: ['ちょうど 半分！ コインも いっぱい', 'もうすぐ 春日大社だよ', '赤い社殿が 見えてきた！'],
  },
  {
    id: '3-2', title: '夜の南大門', summary: '東大寺へ。大仏の目が光ると…',
    intro: '夜の参道。南大門の先に、東大寺が 見えてくる…',
    length: 900, seed: 20261201, difficulty: 0.35,
    extra: ['critterSleep', 'critterCross', 'critterHop', 'critterCharge'], critters: ['kage', 'owl', 'fox', 'pachi'],
    opening: ['hole', 'critterSleep', 'poop', 'critterCross'],
    rules: { speed0: 13, speed1: 21, steerAccel: 42, steerSpeed: 6.8 },
    curve: { amp: 14, wave: 300 },
    wake: 0.6,
    theme: NIGHT_TODAIJI, goalName: '東大寺',
    lines: ['南大門が 見えてきた', '大仏殿の 灯りが 見える…', '大仏さまの 前に 来た！'],
  },
  {
    id: '3-3', title: '若草山のつづら折り', summary: '登りのカーブ。前が見えにくい',
    intro: '若草山を 登るよ！ 登りは おそく、カーブで 外へ 押される！',
    length: 1000, seed: 20261230, difficulty: 0.55,
    extra: ['critterSleep', 'critterCross', 'critterHop', 'critterCharge'], critters: ['bear', 'tanuki', 'squirrel', 'koron', 'goro', 'toge'],
    opening: ['hole', 'critterSleep', 'poop', 'critterCross'],
    rules: { speed0: 14.5, speed1: 21, steerAccel: 40, steerSpeed: 7.0 },
    curve: { amp: 34, wave: 170 },
    // 急な登りと、ひと息つける平らな所が、交互に続く(全部で約40m登る)
    hills: [
      { at: 0.08, h: 0 }, { at: 0.2, h: 8 }, { at: 0.27, h: 9 }, { at: 0.4, h: 17 }, { at: 0.47, h: 18 },
      { at: 0.6, h: 27 }, { at: 0.67, h: 28 }, { at: 0.8, h: 37 }, { at: 0.88, h: 40 },
    ],
    theme: MOUNTAIN_MIST, goalName: '若草山',
    lines: ['つづら折りが つづく…', 'もうすぐ 山頂だよ', '山頂が 見えてきた！'],
  },
  {
    id: '3-4', title: '若草山から平城宮跡へ', summary: '下り坂で加速！ 街の踏切に気をつけて',
    intro: '下り坂は 速いよ！ 街に入ったら 踏切に 気をつけて！',
    length: 1200, seed: 20261215, difficulty: 0.5,
    extra: ['ramp', 'crossing', 'critterSleep', 'critterCross', 'critterCharge'], critters: ['tanuki', 'fox', 'pachi', 'bubu'],
    opening: ['hole', 'ramp', 'poop', 'critterCross'],
    rules: { speed0: 13, speed1: 20, steerAccel: 40, steerSpeed: 7.0 },
    curve: { amp: 18, wave: 260 },
    // 若草山から一気に下る(約45m)。後半は平らな街
    hills: [
      { at: 0.05, h: 0 }, { at: 0.17, h: -10 }, { at: 0.23, h: -12 }, { at: 0.35, h: -24 }, { at: 0.41, h: -26 },
      { at: 0.54, h: -41 }, { at: 0.6, h: -45 },
    ],
    townFrom: 0.5,
    after: { crossing: 0.55 },
    potions: [0.66],
    landmarks: [{ at: 0.66, kind: 'pagoda5', side: 1, name: '興福寺' }],
    theme: EVENING_HEIJO, goalName: '平城宮跡',
    lines: ['街に 入ったよ！ 踏切に 注意', '興福寺の 五重塔で ひと休み', '朱雀門が 見えてきた！'],
  },
  {
    id: '3-5', title: '雨の西の京', summary: '長い田園。薬師寺と唐招提寺で回復',
    intro: '雨で 地面が すべるよ。みずたまりは おそくなる！ 光る輪は 雷！',
    length: 1400, seed: 20261207, difficulty: 0.4,
    extra: ['puddle', 'thunder', 'critterSleep', 'critterCross', 'critterHop', 'critterCharge'], critters: ['puni', 'doro', 'noko', 'turtle', 'bubu'],
    opening: ['hole', 'puddle', 'critterSleep', 'fenceGap'],
    rules: { speed0: 14, speed1: 21, steerAccel: 22, steerSpeed: 6.8 },
    curve: { amp: 22, wave: 240 },
    // 田んぼの中の、ゆるい上り下り
    hills: [
      { at: 0.1, h: 0 }, { at: 0.2, h: 4 }, { at: 0.3, h: 0.5 }, { at: 0.45, h: 5 }, { at: 0.55, h: 1 },
      { at: 0.7, h: 6 }, { at: 0.8, h: 2 }, { at: 0.9, h: 0 },
    ],
    potions: [0.38, 0.68],
    landmarks: [
      { at: 0.38, kind: 'pagoda', side: -1, name: '薬師寺' },
      { at: 0.68, kind: 'hall', side: 1, name: '唐招提寺' },
    ],
    theme: RAIN_HORYUJI, goalName: '法隆寺',
    lines: ['薬師寺の 塔が 見えたよ', '唐招提寺で ひと休み', '雨の向こうに 五重塔が…！'],
  },
  {
    id: '3-6', title: '雪の大神神社', summary: '雪の三輪山へ。こおりの道',
    intro: '雪の参道。こおりを ふむと つるつる すべるよ！',
    length: 900, seed: 20261213, difficulty: 0.45,
    extra: ['ice', 'critterSleep', 'critterCross', 'critterHop', 'critterCharge', 'ramp'], critters: ['snowy', 'frosty', 'gingi', 'rabbit', 'candi'],
    opening: ['hole', 'ice', 'critterSleep', 'poop'],
    rules: { speed0: 12, speed1: 19, steerAccel: 14, steerSpeed: 6.4 },
    curve: { amp: 26, wave: 220 },
    // 三輪山のふもとへ、ゆるく登る
    hills: [{ at: 0.12, h: 0 }, { at: 0.35, h: 7 }, { at: 0.5, h: 8 }, { at: 0.75, h: 16 }, { at: 0.88, h: 18 }],
    theme: SNOW_OMIWA, goalName: '大神神社',
    lines: ['しんしんと 雪が ふっている', '三輪山が 見えてきた', '雪の大鳥居が 見えた！'],
  },
  {
    id: '3-7', title: '紅葉の吉野へ', summary: '落ち葉が舞う山道。法螺貝は突進の合図',
    intro: '落ち葉が 舞って 見えにくい！ 法螺貝が 鳴ったら 突進が 来るよ！',
    length: 1200, seed: 20261222, difficulty: 0.6,
    extra: ['leafPile', 'critterSleep', 'critterCross', 'critterHop', 'critterCharge', 'ramp'], critters: ['toge', 'noko', 'squirrel', 'bear', 'tanuki'],
    opening: ['hole', 'leafPile', 'critterSleep', 'poop'],
    rules: { speed0: 14, speed1: 21, steerAccel: 34, steerSpeed: 7.0 },
    curve: { amp: 28, wave: 200 },
    // 吉野の山へ、上り下りしながら約30m登る
    hills: [
      { at: 0.08, h: 0 }, { at: 0.2, h: 6 }, { at: 0.3, h: 4 }, { at: 0.45, h: 14 }, { at: 0.55, h: 12 },
      { at: 0.72, h: 24 }, { at: 0.88, h: 30 },
    ],
    potions: [0.5],
    horn: true,
    theme: AUTUMN_YOSHINO, goalName: '金峯山寺',
    lines: ['紅葉が きれい… でも 足元に 注意', '吉野の 山が 近づいてきた', '蔵王堂が 見えてきた！'],
  },
  {
    id: '3-8', title: '谷瀬のつり橋', summary: 'ゆれる長い橋を渡って、郡山城へ',
    intro: 'つり橋は ゆれるよ！ ◀ ▶ で まんなかを たもとう！',
    length: 1300, seed: 20261227, difficulty: 0.6,
    extra: ['critterSleep', 'critterCross', 'critterCharge', 'ramp'], critters: ['fox', 'squirrel', 'rabbit', 'goro'],
    opening: ['hole', 'critterSleep', 'poop', 'fenceGap'],
    rules: { speed0: 13.5, speed1: 21, steerAccel: 40, steerSpeed: 7.2 },
    curve: { amp: 20, wave: 230 },
    // 橋の高さまで登り、橋をわたって、城下へ下る
    hills: [{ at: 0.1, h: 0 }, { at: 0.25, h: 8 }, { at: 0.56, h: 8 }, { at: 0.75, h: 0 }],
    bridge: { from: 0.3, to: 0.52 },
    potions: [0.6],
    theme: BRIDGE_CASTLE, goalName: '郡山城',
    lines: ['もうすぐ 橋を わたりきるよ！', 'お城の 石垣が 見えてきた', '郡山城に とうちゃく まぢか！'],
  },
  {
    id: '3-9', title: '佐保川の桜並木', summary: '桜吹雪の川ぞいを、奈良公園へ',
    intro: '桜吹雪！ 花見の シートを ふむと コインを 落とすよ。金魚にも 注意！',
    length: 1300, seed: 20261229, difficulty: 0.65,
    extra: ['hanami', 'goldfish', 'critterSleep', 'critterCross', 'critterHop', 'critterCharge'], critters: ['rabbit', 'puni', 'bubu', 'fox'],
    opening: ['hole', 'hanami', 'goldfish', 'poop'],
    rules: { speed0: 14, speed1: 22, steerAccel: 40, steerSpeed: 7.0 },
    curve: { amp: 16, wave: 280 },
    hills: [{ at: 0.1, h: 0 }, { at: 0.3, h: 3 }, { at: 0.5, h: 0 }, { at: 0.7, h: 4 }, { at: 0.88, h: 6 }],
    potions: [0.45, 0.75],
    theme: SPRING_PARK, goalName: '奈良公園',
    lines: ['桜の トンネルだ！', '若草山が 見えてきた', '奈良公園に 帰ってきた！'],
  },
  {
    id: '3-10', title: '大阪湾をめざせ！', summary: '最長の最終面。街をぬけて、海まで',
    intro: '脱走した鹿は、大阪湾をめざす！ 長いよ、速いよ、気をつけて！',
    length: 1800, seed: 20261220, difficulty: 0.8,
    extra: ['ramp'], rules: { speed0: 15, speed1: 25, steerAccel: 42, steerSpeed: 7.0 },
    theme: BAY, goalName: '大阪湾',
    lines: ['街を ぬけて いくぞ！', '潮の かおりが してきた', '海が 見えてきた！ 観覧車も！'],
  },
];

export const runnerById = (id: string): RunnerLevel | undefined => RUNNER_LEVELS.find((l) => l.id === id);

export function courseOf(level: RunnerLevel): Course {
  return buildCourse({
    seed: level.seed, length: level.length, difficulty: level.difficulty,
    extra: level.extra, critters: level.critters, opening: level.opening, rules: level.rules, curve: level.curve,
    potions: level.potions, wake: level.wake, hills: level.hills, after: level.after, bridge: level.bridge,
  });
}
