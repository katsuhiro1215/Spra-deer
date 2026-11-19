// 体力と3種類のコイン(設計書 25章)。ブラウザの localStorage に保存する。保存できない環境でも遊べる。
// 2Dの面(/)と3D走り(/run/)の両方から使う。数字は仮の値(遊んでもらってから直す)。

/** 体力の最大 */
export const STAMINA_MAX = 20;
/** 失敗(ミス・途中でやめる)で減る体力。これより少ないと、面を始められない */
export const STAMINA_FAIL = 2;
/** 体力が1回復するまでの時間(3分。ゼロから満タンまで1時間) */
export const STAMINA_REGEN_MS = 3 * 60 * 1000;
/** 回復薬: 体力+10、シルバーコイン300枚 */
export const POTION = { heal: 10, price: 300 } as const;

import { swapWorld34Key } from './renumber.ts';

export type CoinKind = 'silver' | 'gold' | 'premium';
export type Coins = Record<CoinKind, number>;

const KEY = 'spra-deer:wallet:v1';
/** WORLD 3・4 の入れかえ(2026-11-19)のあとの保存か。印が無ければ、面の番号を新しくする */
const RENUMBERED = 1;
const count = (n: unknown) => (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0);

type Saved = { stamina: number; at: number; coins: Coins; premiumTaken: string[]; rewards: string[]; renumbered?: number };

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export class Wallet {
  canSave = true;
  private value: number = STAMINA_MAX;
  /** value を数えはじめた時刻(ここから STAMINA_REGEN_MS ごとに1つ増える) */
  private at: number;
  readonly coins: Coins = { silver: 0, gold: 0, premium: 0 };
  /** プレミアムコインを取った面(1つの面に1枚だけ。取ったら次からは出ない) */
  private premiumTaken = new Set<string>();
  /** 1回だけのごほうびをもらった印(例: 'first:4-1'・'star3:4-1') */
  private rewards = new Set<string>();

  private now: () => number;
  private store: Storage | null;

  constructor(now: () => number = () => Date.now(), store: Storage | null = storage()) {
    this.now = now;
    this.store = store;
    this.at = now();
    if (!store) { this.canSave = false; return; }
    try {
      const s = JSON.parse(store.getItem(KEY) || 'null') as Partial<Saved> | null;
      if (s && typeof s === 'object') {
        this.value = Math.min(STAMINA_MAX, count(s.stamina));
        this.at = typeof s.at === 'number' && Number.isFinite(s.at) && s.at <= this.now() ? s.at : this.now();
        if (s.coins && typeof s.coins === 'object') for (const k of ['silver', 'gold', 'premium'] as const) this.coins[k] = count(s.coins[k]);
        const fix = s.renumbered === RENUMBERED ? (id: string) => id : swapWorld34Key;
        if (Array.isArray(s.premiumTaken)) for (const id of s.premiumTaken) if (typeof id === 'string') this.premiumTaken.add(fix(id));
        if (Array.isArray(s.rewards)) for (const id of s.rewards) if (typeof id === 'string') this.rewards.add(fix(id));
        if (s.renumbered !== RENUMBERED) this.save();
      }
    } catch { this.canSave = false; }
  }

  private save(): void {
    if (!this.store) return;
    const s: Saved = { stamina: this.value, at: this.at, coins: { ...this.coins }, premiumTaken: [...this.premiumTaken], rewards: [...this.rewards], renumbered: RENUMBERED };
    try { this.store.setItem(KEY, JSON.stringify(s)); } catch { this.canSave = false; }
  }

  /** 時間がたったぶんを足して、今の体力にそろえる(端数の時間は残す) */
  private settle(): void {
    const t = this.now();
    if (this.value >= STAMINA_MAX) { this.at = t; return; }
    const gained = Math.floor(Math.max(0, t - this.at) / STAMINA_REGEN_MS);
    if (gained <= 0) return;
    this.value = Math.min(STAMINA_MAX, this.value + gained);
    this.at = this.value >= STAMINA_MAX ? t : this.at + gained * STAMINA_REGEN_MS;
  }

  get stamina(): number { this.settle(); return this.value; }
  /** 次の1つが回復するまでのミリ秒(満タンなら null) */
  get nextIn(): number | null {
    this.settle();
    return this.value >= STAMINA_MAX ? null : Math.max(0, STAMINA_REGEN_MS - (this.now() - this.at));
  }
  /** 面を始められるまでのミリ秒(今すぐ始められるなら 0) */
  get waitToPlay(): number {
    const st = this.stamina;
    if (st >= STAMINA_FAIL) return 0;
    return (this.nextIn ?? 0) + (STAMINA_FAIL - st - 1) * STAMINA_REGEN_MS;
  }
  canPlay(): boolean { return this.stamina >= STAMINA_FAIL; }

  /** 失敗したとき(途中でやめたときも)。体力を減らす */
  fail(): void {
    this.settle();
    const wasFull = this.value >= STAMINA_MAX;
    this.value = Math.max(0, this.value - STAMINA_FAIL);
    if (wasFull) this.at = this.now(); // 満タンから減ったら、ここから回復を数える
    this.save();
  }
  heal(n: number): void {
    this.settle();
    this.value = Math.min(STAMINA_MAX, this.value + n);
    if (this.value >= STAMINA_MAX) this.at = this.now();
    this.save();
  }

  earn(kind: CoinKind, n: number): void {
    if (!(n > 0)) return;
    this.coins[kind] += Math.floor(n);
    this.save();
  }
  /** 払えたら true */
  spend(kind: CoinKind, n: number): boolean {
    if (this.coins[kind] < n) return false;
    this.coins[kind] -= n;
    this.save();
    return true;
  }
  /** 回復薬を買って、すぐ使う。買えたら true(満タンのときは買わない) */
  buyPotion(): boolean {
    if (this.stamina >= STAMINA_MAX || !this.spend('silver', POTION.price)) return false;
    this.heal(POTION.heal);
    return true;
  }

  hasPremium(levelId: string): boolean { return this.premiumTaken.has(levelId); }
  /** その面のプレミアムコインを取った(1回目だけ増える)。増えたら true */
  takePremium(levelId: string): boolean {
    if (this.premiumTaken.has(levelId)) return false;
    this.premiumTaken.add(levelId);
    this.coins.premium += 1;
    this.save();
    return true;
  }
  /** 1回だけのごほうび(はじめてのクリアなど)。まだなら渡して true */
  rewardOnce(key: string, kind: CoinKind, n: number): boolean {
    if (this.rewards.has(key)) return false;
    this.rewards.add(key);
    this.coins[kind] += n;
    this.save();
    return true;
  }
}

/** 面をクリアしたときのごほうび(設計書 25-3)。もらったものを返す */
export function clearRewards(w: Wallet, levelId: string, o: { silver: number; gold?: number; star3?: boolean }): Coins {
  const got: Coins = { silver: Math.max(0, Math.floor(o.silver)), gold: Math.max(0, Math.floor(o.gold ?? 0)), premium: 0 };
  w.earn('silver', got.silver);
  w.earn('gold', got.gold);
  if (w.rewardOnce(`first:${levelId}`, 'gold', 2)) got.gold += 2;
  if (o.star3 && w.rewardOnce(`star3:${levelId}`, 'gold', 3)) got.gold += 3;
  return got;
}

/** 体力が足りないときの「あと何分」の文 */
export function waitText(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m <= 1 ? 'あと1分ほど' : `あと${m}分`;
}
