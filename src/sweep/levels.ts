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
  /** プレミアムコイン: よごれ この%以下で ゴール */
  premiumUnder: number;
  notes?: { at: number; text: string }[];
};

export const LEVEL_3_1: SweepLevel = {
  id: '3-1', title: 'はじめての大掃除', summary: '大仏さままで、参道を ぴかぴかに',
  intro: '左右に動いて、うんこを ほうきの前へ！ ほうきは 自動で ふるよ',
  length: 150, speed: 2.4, limit: 55,
  deer: { start: 2, addEvery: 9, max: 5, kinds: ['fawn', 'doe', 'stag'] },
  dropEvery: [2.0, 1.5],
  mix: [[0, 1, 0, 0], [0.12, 0.7, 0.3, 0], [0.35, 0.45, 0.42, 0.13]],
  buddha: { from: 0.55, warn: 2, glow: 3, cycle: 10, extraDeer: 2, hard: 0.55 },
  premiumUnder: 10,
  notes: [
    { at: 0.12, text: '大きい うんこは、何回も 掃こう(数字が のこりの回数)' },
    { at: 0.45, text: 'もうすぐ 大仏さま！ 目が 光ると、うんこが 硬くなる…' },
  ],
};

export const SWEEP_LEVELS: SweepLevel[] = [LEVEL_3_1];
export const sweepById = (id: string): SweepLevel | undefined => SWEEP_LEVELS.find(l => l.id === id);
