// WORLD 3「奈良公園、大掃除！」の面のデータ(設計書 32章)。Spra が参道を大仏さままで歩きながら、鹿のうんこを掃除する。
// 試作 showcases/deercleansample(自動で振るほうき・うんこの固さ・ほうきが育つ・よごれ・大仏の目)と、
// deersample3(大仏さまがゴール・掃除するとお花が咲く)を合わせた。
import type { DeerKind } from '../bake/levels.ts';

export type { DeerKind };
export type PoopKind = 'small' | 'medium' | 'large';

/** 場所(景色・道・道ばたの物がかわる) */
export type SweepPlace = 'park' | 'kofukuji' | 'kasuga' | 'wakakusa' | 'todaiji' | 'naramachi' | 'ukimido' | 'nigatsudo';

export type SweepLevel = {
  id: string;
  title: string;
  summary: string;
  intro: string;
  place: SweepPlace;
  /** ゴールの名前と絵(public/assets の中)。絵が無ければ model の建物(浮見堂・二月堂)か、赤い鳥居 */
  goal: { name: string; img?: string; w?: number; h?: number; model?: 'ukimido' | 'nigatsudo' };
  /** なかまの いちばん多い人数(先頭をふくむ) */
  teamMax: number;
  /** 雨の降る間(道のりの進み 0〜1 の、はじめ・おわり)。雨の間は、うんこが べちゃべちゃで固く、ほうきが遅い */
  rain?: [number, number][];
  /** 雷: 道のりの進み from から、every 秒ごとに落ちる(予告の輪のあと)。fire = お松明の火の粉(しくみは同じ。絵と文が かわる) */
  bolts?: { from: number; every: number; fire?: boolean };
  /** 鹿の群れ: 道のり s の所を、n 頭が 一列で横ぎって、1頭ずつ うんこを落とす */
  herds?: { s: number; n: number }[];
  /** せんべい売り場: 道のり s の 左右 side の屋台に、鹿 n 頭が集まって、うんこを どんどん落とす */
  stalls?: { s: number; side: -1 | 1; n: number }[];
  /** 風: 道のりの進み from から、every 秒ごとに dur 秒ふく。Spra と うんこが 横へ流される(force m/秒) */
  wind?: { from: number; every: number; dur: number; force: number };
  /** 夜: まわりが暗く、遠くが見えにくい(のこりの回数も 近くだけ) */
  night?: boolean;
  /** 大仏さままでの道のり(m) */
  length: number;
  /** Spra の歩く速さ(m/秒)。うんこを掃いている間は、ゆっくりになる */
  speed: number;
  /** よごれの上限(この量で 100%。うんこ 小1・中3・大8) */
  limit: number;
  /** 鹿の数: はじめ・何秒ごとに1頭ふえるか・いちばん多いとき */
  deer: { start: number; addEvery: number; max: number; kinds: DeerKind[] };
  /** うんこを落とす間(秒): はじめ → おわり */
  dropEvery: [number, number];
  /** うんこの大きさの出かた(道のりの進み 0〜1 ごと)。[ここから, 小, 中, 大] の重み */
  mix: [number, number, number, number][];
  /** 大仏さまの目が光る(道のりの進み from から)。光っている間に落ちたうんこは、硬い */
  /** extraDeer = 大仏さまが近づくと ふえる鹿・swarm = 目が光っている間だけ どっと出てくる鹿(大混乱) */
  buddha?: { from: number; warn: number; glow: number; cycle: number; extraDeer: number; swarm?: number; hard: number };
  /** ゲート(参道を横ぎる門)。左右どちらかを通る。'+3'・'-4'・'x2' のように書く(数は、Spra のチームの人数) */
  gates?: { s: number; left: string; right: string }[];
  /** おてつだいの たる: 掃いて開けると、仲間が出てくる(hp = 掃く回数、n = 出てくる人数) */
  barrels?: { s: number; x: number; hp: number; n: number }[];
  /** 向こうから走ってくる鹿(道のり s のあたりで出会う)。ぶつかった仲間は、はじき飛ばされる */
  chargers?: { s: number; x: number }[];
  /** プレミアムコイン: よごれ この%以下で ゴール */
  premiumUnder: number;
  notes?: { at: number; text: string }[];
};

// 10面の流れ(設計書 32-2): 場所をかえながら、しかけを1つずつ足して、だんだん ハチャメチャに。大仏さまは最後の 3-10 でボスとして出す。
// 鹿のほうが なかまより少し多く見えるように(なかまの上限は 8〜12人)。
const LANDMARK = '/assets/runner/landmarks';

export const LEVEL_3_1: SweepLevel = {
  id: '3-1', title: '奈良公園を きれいに', summary: '鹿がいっぱいの 奈良公園を、ぴかぴかに',
  intro: '左右に動いて、うんこを ほうきの前へ！ ほうきは 自動で ふるよ',
  place: 'park', goal: { name: '奈良公園の 鳥居' }, teamMax: 8,
  length: 150, speed: 2.4, limit: 55,
  deer: { start: 3, addEvery: 7, max: 7, kinds: ['fawn', 'doe', 'stag'] },
  dropEvery: [2.4, 1.7],
  mix: [[0, 1, 0, 0], [0.12, 0.7, 0.3, 0], [0.4, 0.5, 0.4, 0.1]],
  // はじめは どちらもプラスの ゲートと、たる
  gates: [{ s: 14, left: '+1', right: '+2' }, { s: 45, left: 'x2', right: '+2' }, { s: 85, left: '+3', right: '+1' }, { s: 118, left: '+2', right: 'x2' }],
  barrels: [{ s: 30, x: -1.2, hp: 8, n: 2 }, { s: 66, x: 1.2, hp: 14, n: 3 }, { s: 100, x: 0, hp: 20, n: 3 }],
  premiumUnder: 10,
  notes: [
    { at: 0.06, text: 'ゲートを くぐると、仲間の Spra が ふえる！ 仲間も ほうきを ふるよ' },
    { at: 0.17, text: 'たるを 掃いて 開けると、仲間が 出てくるよ' },
    { at: 0.35, text: '大きい うんこは、何回も 掃こう(数字が のこりの回数)' },
  ],
};

export const LEVEL_3_2: SweepLevel = {
  id: '3-2', title: '興福寺の 五重塔へ', summary: '走ってくる鹿を よけて、五重塔まで',
  intro: '鹿が 走ってくるよ！ ぶつかった 仲間は はじき飛ばされる',
  place: 'kofukuji', goal: { name: '興福寺の 五重塔', img: `${LANDMARK}/kofukuji-pagoda.webp`, w: 5, h: 8.7 }, teamMax: 9,
  length: 160, speed: 2.4, limit: 62,
  deer: { start: 3, addEvery: 6, max: 8, kinds: ['doe', 'fawn', 'stag'] },
  dropEvery: [2.2, 1.5],
  mix: [[0, 0.8, 0.2, 0], [0.2, 0.55, 0.37, 0.08], [0.5, 0.45, 0.4, 0.15]],
  gates: [{ s: 14, left: '+2', right: '+1' }, { s: 42, left: '-2', right: '+3' }, { s: 76, left: 'x2', right: '-3' }, { s: 110, left: '+3', right: '-2' }, { s: 138, left: '-4', right: 'x2' }],
  barrels: [{ s: 28, x: 1.2, hp: 10, n: 2 }, { s: 92, x: -1.2, hp: 18, n: 3 }],
  chargers: [{ s: 34, x: 0 }, { s: 58, x: -1 }, { s: 66, x: 1.1 }, { s: 88, x: 0.3 }, { s: 104, x: -1.3 }, { s: 124, x: 1 }, { s: 128, x: -0.5 }, { s: 148, x: 0.6 }],
  premiumUnder: 12,
  notes: [
    { at: 0.24, text: '赤い ゲートは 仲間が へる！ 数字を 見て えらぼう' },
  ],
};

export const LEVEL_3_3: SweepLevel = {
  id: '3-3', title: '雨の 春日大社参道', summary: '雨で べちゃべちゃ。灯籠の参道を 春日大社へ',
  intro: '雨が 降ってきた… べちゃべちゃの うんこは なかなか とれない！',
  place: 'kasuga', goal: { name: '春日大社の 楼門', img: `${LANDMARK}/kasuga.webp`, w: 11, h: 5.4 }, teamMax: 10,
  length: 165, speed: 2.4, limit: 66,
  deer: { start: 3, addEvery: 6, max: 8, kinds: ['doe', 'stag', 'fawn'] },
  dropEvery: [2.2, 1.5],
  mix: [[0, 0.7, 0.3, 0], [0.25, 0.5, 0.4, 0.1], [0.55, 0.4, 0.42, 0.18]],
  rain: [[0.12, 0.8]],
  gates: [{ s: 12, left: '+2', right: '+3' }, { s: 44, left: 'x2', right: '-2' }, { s: 82, left: '-3', right: '+4' }, { s: 120, left: 'x2', right: '+3' }],
  barrels: [{ s: 30, x: 0, hp: 12, n: 3 }, { s: 64, x: -1.3, hp: 18, n: 3 }, { s: 100, x: 1.3, hp: 22, n: 4 }],
  chargers: [{ s: 54, x: 0.8 }, { s: 92, x: -0.8 }, { s: 136, x: 0 }, { s: 150, x: 1.2 }],
  premiumUnder: 12,
  notes: [
    { at: 0.14, text: '雨の間は うんこが べちゃべちゃ(固い)。ほうきも 遅くなる' },
    { at: 0.6, text: '春日大社まで あと少し！ 灯籠の 参道を ぴかぴかに' },
  ],
};

export const LEVEL_3_4: SweepLevel = {
  id: '3-4', title: '雷の 若草山', summary: '雷が ゴロゴロ。光る輪から にげて',
  intro: '雷だ！ 地面の 赤い輪から はなれて！',
  place: 'wakakusa', goal: { name: '若草山の ふもと' }, teamMax: 10,
  length: 170, speed: 2.4, limit: 58,
  deer: { start: 4, addEvery: 6, max: 9, kinds: ['stag', 'doe', 'fawn'] },
  dropEvery: [2.1, 1.4],
  mix: [[0, 0.7, 0.3, 0], [0.25, 0.5, 0.38, 0.12], [0.55, 0.4, 0.4, 0.2]],
  rain: [[0.55, 0.8]],
  bolts: { from: 0.1, every: 3.4 },
  gates: [{ s: 12, left: '+3', right: '+2' }, { s: 48, left: '-3', right: 'x2' }, { s: 90, left: '+4', right: '-2' }, { s: 130, left: 'x2', right: '-4' }],
  barrels: [{ s: 32, x: 1.2, hp: 12, n: 3 }, { s: 72, x: -1.2, hp: 18, n: 4 }, { s: 110, x: 0, hp: 24, n: 4 }],
  chargers: [{ s: 60, x: -0.6 }, { s: 98, x: 1 }, { s: 120, x: -1.2 }, { s: 146, x: 0.4 }, { s: 158, x: -0.4 }],
  premiumUnder: 12,
  notes: [
    { at: 0.11, text: '赤い輪に 雷が落ちる！ 仲間は はじき飛ばされ、うんこは 飛び散る' },
    { at: 0.55, text: '雨も 降ってきた！ 雷と 雨の ダブルパンチ！' },
  ],
};

export const LEVEL_3_5: SweepLevel = {
  id: '3-5', title: '東大寺 南大門へ', summary: '鹿の群れが 参道を 横ぎる！ 一列の うんこを 掃こう',
  intro: '鹿の群れが 来るよ！ 横いっぱいに うんこが ならぶ',
  place: 'todaiji', goal: { name: '東大寺の 南大門', img: `${LANDMARK}/nandaimon.webp`, w: 10, h: 6.4 }, teamMax: 10,
  length: 170, speed: 2.4, limit: 62,
  deer: { start: 3, addEvery: 6, max: 7, kinds: ['doe', 'fawn', 'stag'] },
  dropEvery: [2.3, 1.6],
  mix: [[0, 0.8, 0.2, 0], [0.25, 0.55, 0.35, 0.1], [0.55, 0.45, 0.4, 0.15]],
  herds: [{ s: 28, n: 4 }, { s: 58, n: 5 }, { s: 92, n: 5 }, { s: 124, n: 6 }, { s: 150, n: 6 }],
  gates: [{ s: 12, left: '+2', right: '+3' }, { s: 44, left: 'x2', right: '-2' }, { s: 76, left: '+3', right: '-3' }, { s: 110, left: '-3', right: 'x2' }, { s: 138, left: '+3', right: '+1' }],
  barrels: [{ s: 20, x: -1.2, hp: 10, n: 2 }, { s: 68, x: 1.2, hp: 16, n: 3 }, { s: 102, x: 0, hp: 22, n: 4 }],
  chargers: [{ s: 84, x: 0.6 }, { s: 116, x: -1 }, { s: 160, x: 0.2 }],
  premiumUnder: 12,
  notes: [
    { at: 0.08, text: '鹿の群れが 横ぎるよ！ 一列に ならんだ うんこは、なかまと いっしょに 横はばで 掃こう' },
    { at: 0.85, text: '南大門が 見えてきた！ 仁王さまに ぴかぴかの 参道を 見せよう' },
  ],
};

export const LEVEL_3_6: SweepLevel = {
  id: '3-6', title: '夜の 燈花会', summary: 'ろうそくの灯りの 夜の参道。暗くて 先が 見えにくい',
  intro: '夜の 奈良は まっくら… 近くの うんこを 見のがさないで！',
  place: 'naramachi', night: true, goal: { name: '灯りの 五重塔', img: `${LANDMARK}/kofukuji-pagoda.webp`, w: 5, h: 8.7 }, teamMax: 10,
  length: 170, speed: 2.4, limit: 60,
  deer: { start: 4, addEvery: 6, max: 8, kinds: ['stag', 'doe', 'fawn'] },
  dropEvery: [2.2, 1.5],
  mix: [[0, 0.75, 0.25, 0], [0.25, 0.5, 0.38, 0.12], [0.55, 0.42, 0.4, 0.18]],
  herds: [{ s: 66, n: 5 }, { s: 132, n: 5 }],
  gates: [{ s: 12, left: '+3', right: '+2' }, { s: 46, left: '-2', right: 'x2' }, { s: 84, left: 'x2', right: '-3' }, { s: 118, left: '+4', right: '-4' }],
  barrels: [{ s: 28, x: 1.2, hp: 12, n: 3 }, { s: 74, x: -1.2, hp: 18, n: 3 }, { s: 104, x: 0, hp: 22, n: 4 }],
  chargers: [{ s: 38, x: -0.6 }, { s: 58, x: 1 }, { s: 96, x: -1.2 }, { s: 126, x: 0.4 }, { s: 146, x: -0.4 }, { s: 158, x: 1.1 }],
  premiumUnder: 12,
  notes: [
    { at: 0.04, text: '夜は 遠くが 見えにくい。のこりの 回数も 近くに 来てから 出るよ' },
    { at: 0.2, text: '暗やみから 鹿が 走ってくる！ 「！」が 見えたら よけて' },
  ],
};

export const LEVEL_3_7: SweepLevel = {
  id: '3-7', title: '鹿せんべい 大混雑', summary: 'せんべい売り場に 鹿が わんさか！',
  intro: 'せんべい売り場に 鹿が 集まってくる！ うんこも どっさり！',
  place: 'park', goal: { name: '春日大社の 一の鳥居' }, teamMax: 11,
  length: 175, speed: 2.4, limit: 58,
  deer: { start: 3, addEvery: 6, max: 8, kinds: ['fawn', 'doe', 'stag'] },
  dropEvery: [2.1, 1.45],
  mix: [[0, 0.75, 0.25, 0], [0.25, 0.5, 0.38, 0.12], [0.55, 0.42, 0.4, 0.18]],
  stalls: [{ s: 30, side: 1, n: 3 }, { s: 52, side: -1, n: 4 }, { s: 74, side: 1, n: 5 }, { s: 98, side: -1, n: 5 }, { s: 122, side: 1, n: 6 }, { s: 146, side: -1, n: 6 }],
  herds: [{ s: 86, n: 5 }, { s: 158, n: 6 }],
  gates: [{ s: 12, left: '+2', right: '+3' }, { s: 40, left: 'x2', right: '-2' }, { s: 64, left: '+3', right: '-3' }, { s: 110, left: 'x2', right: '-4' }, { s: 134, left: '+3', right: '-2' }],
  barrels: [{ s: 20, x: 0, hp: 10, n: 3 }, { s: 58, x: 1.2, hp: 16, n: 3 }, { s: 104, x: -1.2, hp: 22, n: 4 }],
  chargers: [{ s: 70, x: -0.8 }, { s: 88, x: 0.1 }, { s: 116, x: 0.8 }, { s: 140, x: 0 }],
  premiumUnder: 12,
  notes: [
    { at: 0.07, text: 'せんべい売り場に 鹿が 集まって、うんこを どんどん 落とす！ 売り場の 側へ いそげ' },
    { at: 0.15, text: 'うんこの 山の 前に 先頭の Spra が 立つと、立ち止まって ぜんぶ 掃けるよ' },
    { at: 0.2, text: 'せんべいを 食べた 鹿の うんこは、大きくて 固い！' },
  ],
};

export const LEVEL_3_8: SweepLevel = {
  id: '3-8', title: '嵐の 浮見堂', summary: '雨・風・雷の 大あらし！ 池の ほとりを 浮見堂へ',
  intro: '嵐だ！ 風で 横へ 流されるよ。ふんばって！',
  place: 'ukimido', goal: { name: '浮見堂', model: 'ukimido' }, teamMax: 11,
  length: 175, speed: 2.4, limit: 74,
  deer: { start: 4, addEvery: 6, max: 8, kinds: ['doe', 'stag', 'fawn'] },
  dropEvery: [2.3, 1.6],
  mix: [[0, 0.7, 0.3, 0], [0.25, 0.5, 0.38, 0.12], [0.55, 0.42, 0.4, 0.18]],
  rain: [[0.05, 0.3], [0.58, 0.8]],
  wind: { from: 0.08, every: 7, dur: 2.4, force: 1.0 },
  bolts: { from: 0.4, every: 5.4 },
  gates: [{ s: 12, left: '+3', right: '+2' }, { s: 46, left: 'x2', right: '-3' }, { s: 82, left: '-3', right: '+4' }, { s: 118, left: 'x2', right: '-4' }, { s: 146, left: '+2', right: '-2' }],
  barrels: [{ s: 28, x: -1.2, hp: 12, n: 3 }, { s: 64, x: 1.2, hp: 18, n: 4 }, { s: 100, x: 0, hp: 22, n: 4 }],
  chargers: [{ s: 56, x: 0.4 }, { s: 108, x: -0.8 }, { s: 136, x: 1 }, { s: 162, x: -0.2 }],
  premiumUnder: 12,
  notes: [
    { at: 0.09, text: '風が ふくと、Spra も うんこも 横へ 流される！ 小さい うんこほど よく 飛ぶ' },
    { at: 0.41, text: '雷まで 鳴りだした！ 赤い輪に 気をつけて' },
  ],
};

export const LEVEL_3_9: SweepLevel = {
  id: '3-9', title: '二月堂の お水取り', summary: 'お松明の 火の粉が ふる 夜の二月堂',
  intro: 'お水取りの 夜！ 火の粉が ふってくる。オレンジの輪から にげて！',
  place: 'nigatsudo', night: true, goal: { name: '二月堂', model: 'nigatsudo' }, teamMax: 12,
  length: 180, speed: 2.4, limit: 66,
  deer: { start: 4, addEvery: 6, max: 8, kinds: ['stag', 'doe', 'fawn'] },
  dropEvery: [2.1, 1.45],
  mix: [[0, 0.7, 0.3, 0], [0.25, 0.48, 0.38, 0.14], [0.55, 0.4, 0.4, 0.2]],
  bolts: { from: 0.08, every: 4.2, fire: true },
  wind: { from: 0.45, every: 8, dur: 2.2, force: 1.1 },
  herds: [{ s: 40, n: 5 }, { s: 100, n: 6 }, { s: 150, n: 6 }],
  gates: [{ s: 12, left: '+3', right: '+2' }, { s: 48, left: '-3', right: 'x2' }, { s: 86, left: 'x2', right: '-4' }, { s: 122, left: '+4', right: '-3' }, { s: 158, left: '-4', right: '+2' }],
  barrels: [{ s: 26, x: 1.2, hp: 12, n: 3 }, { s: 70, x: -1.2, hp: 18, n: 4 }, { s: 110, x: 0, hp: 24, n: 4 }],
  chargers: [{ s: 62, x: -0.6 }, { s: 94, x: 1 }, { s: 132, x: -1.2 }, { s: 166, x: 0.4 }],
  premiumUnder: 12,
  notes: [
    { at: 0.09, text: 'お松明の 火の粉が ふってくる！ オレンジの輪に 入ると、仲間が とばされる' },
    { at: 0.46, text: '山の 風まで ふいてきた！' },
  ],
};

/** 大仏さま(3-10 のボス)の目。光っている間は、鹿が どっと出てきて 大混乱 */
export const BUDDHA_BOSS = { from: 0.35, warn: 2, glow: 4, cycle: 11, extraDeer: 2, swarm: 10, hard: 0.55 };

export const LEVEL_3_10: SweepLevel = {
  id: '3-10', title: '大仏殿の 大掃除', summary: '大仏さまの 目が 光ると、鹿が どっと出てくる！ 最後の 大掃除',
  intro: 'いよいよ 大仏殿！ 大仏さまの 目に 気をつけて！',
  place: 'todaiji', goal: { name: '大仏殿の 大仏さま', img: `${LANDMARK}/todaiji-hall.webp`, w: 18, h: 11 }, teamMax: 12,
  length: 190, speed: 2.4, limit: 72,
  deer: { start: 4, addEvery: 6, max: 8, kinds: ['stag', 'doe', 'fawn'] },
  dropEvery: [2.2, 1.5],
  mix: [[0, 0.7, 0.3, 0], [0.25, 0.48, 0.38, 0.14], [0.55, 0.4, 0.4, 0.2]],
  buddha: BUDDHA_BOSS,
  rain: [[0.78, 1]],
  herds: [{ s: 34, n: 5 }, { s: 90, n: 6 }, { s: 150, n: 6 }],
  gates: [{ s: 12, left: '+3', right: '+2' }, { s: 44, left: 'x2', right: '-2' }, { s: 78, left: '-3', right: '+4' }, { s: 112, left: 'x2', right: '-4' }, { s: 146, left: '+3', right: '-3' }],
  barrels: [{ s: 24, x: -1.2, hp: 12, n: 3 }, { s: 60, x: 1.2, hp: 18, n: 4 }, { s: 98, x: 0, hp: 24, n: 4 }, { s: 130, x: -1.2, hp: 24, n: 4 }],
  chargers: [{ s: 52, x: 0.6 }, { s: 104, x: -1 }, { s: 140, x: 0.8 }, { s: 172, x: -0.4 }],
  premiumUnder: 12,
  notes: [
    { at: 0.3, text: '大仏さまが 見えてきた… 目が 光ると、鹿が どっと 出てくるよ！' },
    { at: 0.79, text: 'さいごに 雨まで！ 大仏さまは もうすぐ！' },
  ],
};

export const SWEEP_LEVELS: SweepLevel[] = [LEVEL_3_1, LEVEL_3_2, LEVEL_3_3, LEVEL_3_4, LEVEL_3_5, LEVEL_3_6, LEVEL_3_7, LEVEL_3_8, LEVEL_3_9, LEVEL_3_10];
export const sweepById = (id: string): SweepLevel | undefined => SWEEP_LEVELS.find(l => l.id === id);
