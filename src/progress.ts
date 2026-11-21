import { ALL_PLAYABLE_SLOTS } from './game/levels.ts';
import { swapWorld34 } from './renumber.ts';
import { claimGuest, storageScope } from './account/store.ts';
import { playEnded, playStarted } from './account/plays.ts';

export type LevelRecord = { best: number | null; attempts: number; clears: number };
const KEY = 'spra-deer:progress:v3';
/** WORLD 3・4 の入れかえ(2026-11-19)の前の記録。旧 3-n → 新 4-n、旧 4-1 → 新 3-1 */
const V2_KEY = 'spra-deer:progress:v2';
/** 2026-11-15 の WORLD 1 再編の前の記録(v1)。新しい番号 → 古い番号。外した面の記録は引きつがない */
const OLD_KEY = 'spra-deer:progress:v1';
const FROM_V1: Record<string, string> = { '1-6': '2-3', '1-7': '1-8', '1-8': '2-4', '1-9': '2-5' };
const UNCHANGED_V1 = new Set(['1-1', '1-2', '1-3', '1-4', '1-5', '1-10']);
/** 開発中は true にして、すべての面を最初から遊べるようにする(テスト用)。公開のいまは false: 前の面をクリアすると次の面が開く、本来の動き。 */
export const UNLOCK_ALL = false;
const empty = (): LevelRecord => ({ best: null, attempts: 0, clears: 0 });
const count = (n: unknown) => (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0);

/** 面ごとの記録。ブラウザの localStorage に保存する(ログイン中は、プレイヤーごと)。保存できない環境でも遊べる。 */
export class Progress {
  private levels = new Map<string, LevelRecord>();
  canSave = true;
  private readonly key: string;

  constructor() {
    const scope = storageScope();
    this.key = scope + KEY;
    try {
      claimGuest(scope, KEY);
      let saved = JSON.parse(localStorage.getItem(this.key) || 'null');
      // 古い記録の引きつぎは、ゲストの場所だけ(プレイヤーごとの場所ができる前の記録)
      let v2 = saved || scope ? null : JSON.parse(localStorage.getItem(V2_KEY) || 'null');
      if (!saved && !v2 && !scope) {
        // 古い記録があれば、新しい番号に置きかえて引きつぐ
        const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
        const ol = old && typeof old === 'object' ? old.levels : null;
        if (ol && typeof ol === 'object') {
          const levels: Record<string, unknown> = {};
          for (const [id, r] of Object.entries(ol)) if (!/^[12]-/.test(id) || UNCHANGED_V1.has(id)) levels[id] = r;
          for (const [to, from] of Object.entries(FROM_V1)) if (ol[from]) levels[to] = ol[from];
          v2 = { levels };
        }
      }
      if (!saved && v2 && typeof v2 === 'object' && v2.levels && typeof v2.levels === 'object') {
        saved = { levels: Object.fromEntries(Object.entries(v2.levels).map(([id, r]) => [swapWorld34(id), r])) };
        localStorage.setItem(this.key, JSON.stringify(saved));
      }
      const levels = saved && typeof saved === 'object' ? saved.levels : null;
      if (levels && typeof levels === 'object') {
        // 知らない面の記録は無視する（データ側から面を消しても壊れない）。
        for (const level of ALL_PLAYABLE_SLOTS) {
          const r = levels[level.id];
          if (r && typeof r === 'object') {
            this.levels.set(level.id, { best: Number.isFinite(r.best) && r.best > 0 ? r.best : null, attempts: count(r.attempts), clears: count(r.clears) });
          }
        }
      }
    } catch { this.canSave = false; }
  }

  get(id: string): LevelRecord { return this.levels.get(id) ?? empty(); }
  private edit(id: string, change: (r: LevelRecord) => void) {
    const r = { ...this.get(id) }; change(r); this.levels.set(id, r);
    try { localStorage.setItem(this.key, JSON.stringify({ levels: Object.fromEntries(this.levels) })); } catch { this.canSave = false; }
  }
  /** 面を始めた(遊んだ回として Spra Go にも送る) */
  attempt(id: string) { this.edit(id, r => { r.attempts++; }); playStarted(id); }
  /** 失敗した(Spra Go に送る。記録は変わらない) */
  fail(id: string) { playEnded(id, 'fail'); }
  /** 途中でやめた */
  quit(id: string) { playEnded(id, 'quit'); }
  /**
   * Spra Go に預けた記録と合わせる(別の端末で遊んだ分)。クリア数・遊んだ数は多い方、タイムは速い方。
   * 合わせて変わったら true
   */
  merge(remote: Record<string, { plays: number; clears: number; best_ms: number | null }>): boolean {
    let changed = false;
    for (const level of ALL_PLAYABLE_SLOTS) {
      const r = remote[level.id];
      if (!r) continue;
      const cur = this.get(level.id);
      const best = r.best_ms !== null && r.best_ms > 0 ? r.best_ms / 1000 : null;
      const next: LevelRecord = {
        attempts: Math.max(cur.attempts, count(r.plays)),
        clears: Math.max(cur.clears, count(r.clears)),
        best: cur.best === null ? best : best === null ? cur.best : Math.min(cur.best, best),
      };
      if (next.attempts !== cur.attempts || next.clears !== cur.clears || next.best !== cur.best) { this.levels.set(level.id, next); changed = true; }
    }
    if (changed) try { localStorage.setItem(this.key, JSON.stringify({ levels: Object.fromEntries(this.levels) })); } catch { this.canSave = false; }
    return changed;
  }
  /** クリアを記録し、自己ベストを更新したら true。recordTime=false(途中から続けたとき)は、タイムを記録しない。 */
  clear(id: string, time: number, recordTime = true, stars?: number): boolean {
    const isBest = recordTime && (this.get(id).best === null || time < this.get(id).best!);
    this.edit(id, r => { r.clears++; if (isBest) r.best = time; });
    // 途中から続けたとき(recordTime=false)は、タイムを送らない(ランキングに載せない)
    playEnded(id, 'clear', recordTime ? time : undefined, stars);
    return isBest;
  }
  /** 開発中に全部の面を開くか(テストでは false にして、本来の開き方を確かめる) */
  unlockAll = UNLOCK_ALL;
  /**
   * 面が選べるか。ワールドの中は順番どおり(1-2 は 1-1 のクリアで開く)。
   * どのワールドも、最初の面(1-1・2-1・3-1…)は、最初から選べる(2026-11-22 Owner決定。いろんなゲームを試せるように)。
   */
  isUnlocked(id: string): boolean {
    const slot = ALL_PLAYABLE_SLOTS.find(l => l.id === id);
    if (!slot) return false;
    if (this.unlockAll) return true;
    const same = ALL_PLAYABLE_SLOTS.filter(l => l.stage === slot.stage);
    const pos = same.indexOf(slot);
    if (pos > 0) return this.get(same[pos - 1].id).clears > 0;
    return true; // ワールドの最初の面
  }
  /** ワールドが開くまでに、前のワールドで要るクリア数。いまは、どのワールドも最初から開いている(常に 0) */
  stageOpenNeeds(_stage: number): number { return 0; }
  clearedCount(stage: number): number { return ALL_PLAYABLE_SLOTS.filter(l => l.stage === stage && this.get(l.id).clears > 0).length; }
}
