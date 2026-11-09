import { PLAYABLE } from './game/levels.ts';

export type LevelRecord = { best: number | null; attempts: number; clears: number };
const KEY = 'spra-deer:progress:v1';
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
        for (const level of PLAYABLE) {
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
  /** クリアを記録し、自己ベストを更新したら true。 */
  clear(id: string, time: number): boolean {
    const isBest = this.get(id).best === null || time < this.get(id).best!;
    this.edit(id, r => { r.clears++; if (isBest) r.best = time; });
    return isBest;
  }
  /** 遊べる面のうち、直前の面をクリアした面（最初の面は常に）が選べる。 */
  isUnlocked(id: string): boolean {
    const index = PLAYABLE.findIndex(l => l.id === id);
    return index === 0 || (index > 0 && this.get(PLAYABLE[index - 1].id).clears > 0);
  }
  clearedCount(stage: number): number { return PLAYABLE.filter(l => l.stage === stage && this.get(l.id).clears > 0).length; }
}
