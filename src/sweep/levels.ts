// WORLD 3「奈良公園、大掃除！」の面のデータ(設計書 32章)。Spra が参道を大仏さままで歩きながら、鹿のうんこを掃除する。
// 試作 showcases/deercleansample(自動で振るほうき・うんこの固さ・ほうきが育つ・よごれ・大仏の目)と、
// deersample3(大仏さまがゴール・掃除するとお花が咲く)を合わせた。
import type { DeerKind } from '../bake/levels.ts';

export type { DeerKind };
export type PoopKind = 'small' | 'medium' | 'large';

export type SweepLevel = {
  id: string;
  title: string;
  summary: string;
  intro: string;
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
  buddha?: { from: number; warn: number; glow: number; cycle: number; extraDeer: number; hard: number };
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

export const LEVEL_3_1: SweepLevel = {
  id: '3-1', title: 'はじめての大掃除', summary: '大仏さままで、参道を ぴかぴかに',
  intro: '左右に動いて、うんこを ほうきの前へ！ ほうきは 自動で ふるよ',
  length: 160, speed: 2.4, limit: 55,
  deer: { start: 2, addEvery: 9, max: 5, kinds: ['fawn', 'doe', 'stag'] },
  dropEvery: [2.0, 1.5],
  mix: [[0, 1, 0, 0], [0.12, 0.7, 0.3, 0], [0.35, 0.45, 0.42, 0.13]],
  buddha: { from: 0.55, warn: 2, glow: 3, cycle: 10, extraDeer: 2, hard: 0.55 },
  // ゲートで仲間をふやす。はじめは どちらも プラス、だんだん えらぶ ゲートに
  gates: [
    { s: 14, left: '+2', right: '+4' }, { s: 38, left: 'x2', right: '+3' }, { s: 64, left: '-3', right: '+5' },
    { s: 94, left: 'x2', right: '-6' }, { s: 124, left: '+8', right: 'x2' },
  ],
  barrels: [{ s: 52, x: -1.3, hp: 10, n: 4 }, { s: 82, x: 1.3, hp: 16, n: 6 }, { s: 112, x: 0, hp: 24, n: 8 }],
  // 走ってくる鹿は、後半から
  chargers: [{ s: 72, x: 0.8 }, { s: 88, x: -1 }, { s: 102, x: 1.2 }, { s: 106, x: -0.6 }, { s: 130, x: 0 }, { s: 140, x: 1.4 }, { s: 146, x: -1.2 }],
  premiumUnder: 10,
  notes: [
    { at: 0.06, text: 'ゲートを くぐると、仲間の Spra が ふえる！' },
    { at: 0.3, text: 'たるを 掃いて 開けると、仲間が 出てくるよ' },
    { at: 0.43, text: '鹿が 走ってくる！ ぶつかった 仲間は はじき飛ばされる。よけて！' },
    { at: 0.55, text: 'もうすぐ 大仏さま！ 目が 光ると、うんこが 硬くなる…' },
  ],
};

export const SWEEP_LEVELS: SweepLevel[] = [LEVEL_3_1];
export const sweepById = (id: string): SweepLevel | undefined => SWEEP_LEVELS.find(l => l.id === id);
