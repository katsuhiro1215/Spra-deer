// WORLD 2 の リレー面(2-9・2-10): 1つの面の中で、焼く → 積む → 配る を 順につなぐ。
// ハート・コイン・ゴールド・プレミアム・時間は 次の遊びへ 引きつぐ。どこかで 失敗したら その面は 失敗(もういちど は はじめから)。
// それぞれの遊び(game.ts・towerGame.ts・tossGame.ts)は、relay を受けとると、記録を この面の番号で つけ、2つ目からは すぐ始まる。
import type { RelayLevel, W2Level } from './levels.ts';

export type Carry = { lives: number; coins: number; gold: number; premium: boolean; t: number };
export type RelayCtx = {
  /** 記録・コインの面の番号と、題名・説明 */
  id: string; title: string; summary: string;
  /** いま 何番目か(0 から)・ぜんぶで いくつ */
  part: number; parts: number;
  /** 前の遊びから 引きつぐもの(はじめは null) */
  carry: Carry | null;
  next: (c: Carry) => void;
  restart: () => void;
};
type Starter = (root: HTMLElement, level: W2Level, relay?: RelayCtx) => () => void;

/** 引きつぐものを、新しい遊びの はじめに入れる */
export function applyCarry<T extends { lives: number; coins: number; gold: number; premium: boolean }>(run: T, relay?: RelayCtx): T {
  const c = relay?.carry;
  if (c) { run.lives = c.lives; run.coins = c.coins; run.gold = c.gold; run.premium = c.premium; }
  return run;
}
/** 遊びが おわったときに 引きつぐもの */
export function carryOf(run: { lives: number; coins: number; gold: number; premium: boolean; t: number }, relay: RelayCtx): Carry {
  return { lives: run.lives, coins: run.coins, gold: run.gold, premium: run.premium, t: (relay.carry?.t ?? 0) + run.t };
}

export function startRelay(root: HTMLElement, level: RelayLevel, starterOf: (part: W2Level) => Starter): () => void {
  let stop: (() => void) | null = null;
  const run = (part: number, carry: Carry | null) => {
    stop?.(); stop = null;
    // 前の遊びが つけた ボタンの はたらきを 消す(作りなおす)
    for (const k of ['go', 'retry', 'snd-s', 'snd-r']) {
      const el = root.querySelector(`[data-ks="${k}"]`);
      el?.replaceWith(el.cloneNode(true));
    }
    const lv = level.parts[part];
    stop = starterOf(lv)(root, lv, {
      id: level.id, title: level.title, summary: level.summary, part, parts: level.parts.length, carry,
      next: c => window.setTimeout(() => run(part + 1, c), 0),
      restart: () => window.setTimeout(() => run(0, null), 0),
    });
  };
  run(0, null);
  return () => { stop?.(); stop = null; };
}
