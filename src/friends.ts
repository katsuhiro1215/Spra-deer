// 仲間の鹿(Spra・Lumi・Piko・Momo・Ruru・Kuru)。プレミアムコインで仲間にする(Owner決定 2026-11-22)。
// 使い道: ①走る鹿(WORLD 4・8)を、仲間の鹿に替える(相棒。見た目だけで強さは変えない) ②ホームとなかまに出る
// ③専用の面が開く(Spra・Lumi から。4-11・8-11 など。面は あとで作る)。
// 絵は scripts/build-deerfriend-art.py で整える(public/assets/deerfriends/)。WORLD 3 で手伝う「なかま」(Lumi など)とは別。

import { storageScope } from './account/store.ts';

export type FriendId = 'spra' | 'lumi' | 'piko' | 'momo' | 'ruru' | 'kuru';

export type Friend = {
  id: FriendId;
  name: string;
  /** 色の名前(お店・なかまの文) */
  color: string;
  /** プレミアムコインの値段(設計書 26-3: 15〜20) */
  premium: number;
  /** 持つと開く専用の面(まだ作っていないものも含む)。空なら、見た目だけ */
  unlocks: string[];
};

// 持つと開く専用の面(Owner決定 2026-11-22): 走る面(WORLD 4)=4-1x、トロッコ(WORLD 8)=8-1x。面は これから作る
export const FRIENDS: Friend[] = [
  { id: 'spra', name: 'Spraの鹿', color: '緑', premium: 15, unlocks: ['4-11', '8-11'] },
  { id: 'lumi', name: 'Lumiの鹿', color: '黄色', premium: 15, unlocks: ['4-12', '8-12'] },
  { id: 'momo', name: 'Momoの鹿', color: 'ピンク', premium: 20, unlocks: ['4-13', '8-13'] },
  { id: 'kuru', name: 'Kuruの鹿', color: '茶色', premium: 20, unlocks: ['4-14', '8-14'] },
  { id: 'piko', name: 'Pikoの鹿', color: 'オレンジ', premium: 20, unlocks: ['4-15', '8-15'] },
  { id: 'ruru', name: 'Ruruの鹿', color: '水色', premium: 20, unlocks: ['4-16', '8-16'] },
];

export const friendOf = (id: string | null | undefined): Friend | undefined => FRIENDS.find(f => f.id === id);
export const standOf = (id: FriendId) => `/assets/deerfriends/${id}.webp`;

/** 3D走りの、走る鹿の絵(後ろ姿の4コマ)。相棒がいなければ、ふだんの鹿 */
export function runFramePath(buddy: string | null, i: number): string {
  return friendOf(buddy) ? `/assets/deerfriends/${buddy}_run_${i}.webp` : `/assets/kasuga/run_${i}.png`;
}

/**
 * WORLD 4 の鬼ごっこで にげる 仲間(2026-11-22 Owner「Lumi の鹿の面では Lumi が、Kuru の鹿の面では Kuru が にげる」)。
 * name=呼び名、back(i)=後ろ姿で走る4コマ(Spra は spru-walk/up、ほかは scripts/build-friend-back.py)、aspect=絵の 横÷たて
 */
export type Runaway = { name: string; back: (i: number) => string; aspect: number };
const BACK_W: Record<FriendId, number> = { spra: 190, lumi: 195, momo: 190, kuru: 302, piko: 305, ruru: 230 };
export function runawayOf(id: FriendId): Runaway {
  return {
    name: id === 'spra' ? 'Spra' : id[0].toUpperCase() + id.slice(1),
    back: (i) => (id === 'spra' ? `/assets/spru-walk/up_${i}.png` : `/assets/friend-back/${id}_${i}.webp`),
    aspect: BACK_W[id] / 377,
  };
}

/** 面を持っているおかげで開くか(専用の面) */
export const unlockedBy = (levelId: string): Friend | undefined => FRIENDS.find(f => f.unlocks.includes(levelId));

/** 保存の置き場(closet.ts と同じ。ゲームのページ(別ページ)からも 相棒を読めるように、ここで直接読む) */
const CLOSET_KEY = 'spra-deer:closet:v1';

/** その仲間の鹿を持っているか(専用の面を開くか)。ゲームのページからも読めるように、保存から直接読む */
export function ownsFriend(id: string, store?: Storage | null, scope = storageScope()): boolean {
  try {
    const st = store === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : store;
    if (!st) return false;
    const s = JSON.parse(st.getItem(scope + CLOSET_KEY) || 'null') as { friends?: unknown } | null;
    return !!s && Array.isArray(s.friends) && s.friends.includes(id);
  } catch { return false; }
}

/** いまの相棒(持っていないものは なし)。走るゲームのページが、はじまるときに読む */
export function readBuddy(store?: Storage | null, scope = storageScope()): FriendId | null {
  try {
    const st = store === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : store;
    if (!st) return null;
    const s = JSON.parse(st.getItem(scope + CLOSET_KEY) || 'null') as { friends?: unknown; buddy?: unknown } | null;
    if (!s || typeof s.buddy !== 'string' || !Array.isArray(s.friends)) return null;
    return friendOf(s.buddy) && s.friends.includes(s.buddy) ? (s.buddy as FriendId) : null;
  } catch { return null; }
}
