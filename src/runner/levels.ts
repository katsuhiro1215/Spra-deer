// ステージ3「鹿の大脱走」の面の一覧(3D走りゲームのシリーズ)。
// 面を足すときは、ここに1つ書くだけ。見た目は theme、手ごたえは rules、仕掛けは seed/extra で変える。
import { buildCourse, type Course, type PatternName, type Rules } from './course.ts';

export type Weather = 'none' | 'rain' | 'snow';
/** 道の景色: sando=灯籠と杉の参道 / town=街道(夕焼けの街) */
export type Setting = 'sando' | 'town';
/** ゴールの景色: shrine=春日大社 / bay=大阪湾 */
export type GoalScene = 'shrine' | 'bay';

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
  opening?: PatternName[];
  rules: Rules;
  theme: Theme;
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
  sky: ['#040a22', '#0c1844', '#1b2d62', '#2b4075'],
  fog: 0x15204a, fogNear: 18, fogFar: 170,
  hemiSky: 0x7088d0, hemiGround: 0x23324a, hemi: 0.55,
  sun: 0xb4c8ff, sunPower: 1.5, sunPos: [-12, 28, 12], env: 0.14, exposure: 1.2,
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
    id: '3-2', title: '夜の参道', summary: '暗い道。灯籠の灯りだけが頼り',
    intro: '夜の参道。灯籠の灯りを たよりに 走ろう！',
    length: 900, seed: 20261201, difficulty: 0.35,
    extra: [], rules: { speed0: 13, speed1: 21, steerAccel: 42, steerSpeed: 6.8 },
    theme: NIGHT, goalName: '春日大社',
    lines: ['灯籠が ゆれて きれい…', '遠くに ともしびが 見えてきた', '灯りに 照らされた 春日大社！'],
  },
  {
    id: '3-3', title: '雨の参道', summary: '地面がすべる。みずたまりに注意',
    intro: '雨で 地面が すべるよ。みずたまりは おそくなる！',
    length: 900, seed: 20261207, difficulty: 0.4,
    extra: ['puddle'], rules: { speed0: 14, speed1: 21, steerAccel: 22, steerSpeed: 6.8 },
    theme: RAIN, goalName: '春日大社',
    lines: ['雨は まだ やまない…', 'あと もうすこし！', '雨の向こうに 赤い社殿が…！'],
  },
  {
    id: '3-4', title: '雪の参道', summary: 'こおりの上は、つるつる。曲がれない',
    intro: '雪の参道。こおりを ふむと つるつる すべるよ！',
    length: 900, seed: 20261213, difficulty: 0.45,
    extra: ['ice'], rules: { speed0: 12, speed1: 19, steerAccel: 14, steerSpeed: 6.4 },
    theme: SNOW, goalName: '春日大社',
    lines: ['しんしんと 雪が ふっている', '雪の中に 赤が 見えてきた', '雪化粧の 春日大社だ！'],
  },
  {
    id: '3-10', title: '大阪湾をめざせ！', summary: '最長の最終面。街をぬけて、海まで',
    intro: '脱走した鹿は、大阪湾をめざす！ 長いよ、速いよ、気をつけて！',
    length: 1800, seed: 20261220, difficulty: 0.8,
    extra: [], rules: { speed0: 15, speed1: 25, steerAccel: 42, steerSpeed: 7.0 },
    theme: BAY, goalName: '大阪湾',
    lines: ['街を ぬけて いくぞ！', '潮の かおりが してきた', '海が 見えてきた！ 観覧車も！'],
  },
];

export const runnerById = (id: string): RunnerLevel | undefined => RUNNER_LEVELS.find((l) => l.id === id);

export function courseOf(level: RunnerLevel): Course {
  return buildCourse({
    seed: level.seed, length: level.length, difficulty: level.difficulty,
    extra: level.extra, opening: level.opening, rules: level.rules,
  });
}
