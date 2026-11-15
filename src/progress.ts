import { ALL_PLAYABLE_SLOTS } from './game/levels.ts';

export type LevelRecord = { best: number | null; attempts: number; clears: number };
const KEY = 'spra-deer:progress:v1';
/** 開発中は、すべての面を最初から遊べる。公開前に false に戻す（前の面をクリアすると次の面が開く、本来の動きになる）。 */
export const UNLOCK_ALL = true;
const empty = (): LevelRecord => ({ best: null, attempts: 0, clears: 0 });
const count = (n: unknown) => (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0);

/** 面ごとの記録。ブラウザの localStorage に保存する。保存できない環境でも遊べる。 */
export class Progress {
  private levels = new Map<string, LevelRecord>();
  canSave = true;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
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
    try { localStorage.setItem(KEY, JSON.stringify({ levels: Object.fromEntries(this.levels) })); } catch { this.canSave = false; }
  }
  attempt(id: string) { this.edit(id, r => { r.attempts++; }); }
  /** クリアを記録し、自己ベストを更新したら true。recordTime=false(途中から続けたとき)は、タイムを記録しない。 */
  clear(id: string, time: number, recordTime = true): boolean {
    const isBest = recordTime && (this.get(id).best === null || time < this.get(id).best!);
    this.edit(id, r => { r.clears++; if (isBest) r.best = time; });
    return isBest;
  }
  /** 開発中に全部の面を開くか(テストでは false にして、本来の開き方を確かめる) */
  unlockAll = UNLOCK_ALL;
  /** 次のワールドが開くのに要る、前のワールドのクリア数(設計書 25-1) */
  static readonly STAGE_KEY_CLEARS = 3;
  /**
   * 面が選べるか(設計書 25-1)。ワールドの中は順番どおり(1-2 は 1-1 のクリアで開く)。
   * ワールドの最初の面は、前のワールドの面を3つ(面が3つ未満なら全部)クリアすると開く。最初のワールドの最初の面は、いつでも選べる。
   */
  isUnlocked(id: string): boolean {
    const slot = ALL_PLAYABLE_SLOTS.find(l => l.id === id);
    if (!slot) return false;
    if (this.unlockAll) return true;
    const same = ALL_PLAYABLE_SLOTS.filter(l => l.stage === slot.stage);
    const pos = same.indexOf(slot);
    if (pos > 0) return this.get(same[pos - 1].id).clears > 0;
    return this.stageOpenNeeds(slot.stage) === 0;
  }
  /** そのワールドが開くまでに、前のワールドで、あといくつクリアが要るか(開いていれば 0) */
  stageOpenNeeds(stage: number): number {
    const stages = [...new Set(ALL_PLAYABLE_SLOTS.map(l => l.stage))];
    const i = stages.indexOf(stage);
    if (i <= 0 || this.unlockAll) return 0;
    const prev = stages[i - 1];
    const need = Math.min(Progress.STAGE_KEY_CLEARS, ALL_PLAYABLE_SLOTS.filter(l => l.stage === prev).length);
    return Math.max(0, need - this.clearedCount(prev));
  }
  clearedCount(stage: number): number { return ALL_PLAYABLE_SLOTS.filter(l => l.stage === stage && this.get(l.id).clears > 0).length; }
}
