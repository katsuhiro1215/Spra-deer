// Spra Go のアカウント(設計書 37章)。ログインの状態は、この端末の localStorage に置く。
// Spra Go のサーバーの場所と、ログインを出すかどうかは、書き出しのときの環境変数で決める(Tane と同じ)。

/** Spra Go のサーバー(空なら、通信を一切しない) */
export const API_BASE = (process.env.NEXT_PUBLIC_SPRA_API_URL ?? '').replace(/\/$/, '');
/** ログインの入口を出すか(既定は出さない。Spraと鹿。の規約の更新が済んでから on にする) */
export const LOGIN_ENABLED = process.env.NEXT_PUBLIC_DEER_LOGIN === 'on' && API_BASE !== '';
/** ログインしなくても遊べる面: 各ワールドの この番号まで(Spra Go の config/deer.php の free_levels と同じ) */
export const FREE_LEVELS = 2;

export type AccountUser = { id: number; name: string; email: string; termsOutdated: boolean };
export type Account = {
  token: string | null;
  user: AccountUser | null;
  /** いま遊んでいるプレイヤー(家族の1人) */
  profileId: number | null;
  profileName: string | null;
  /** ログインしていない人の、端末ごとの番号(遊んだ数を数えるだけ。名前などは持たない) */
  anonId: string;
};

const KEY = 'spra-deer:account:v1';
const storage = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const uuid = (): string => {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* 古い環境 */ }
  // crypto.randomUUID が無い環境の代わり(v4 の形)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
};

export function loadAccount(store: Storage | null = storage()): Account {
  let a: Partial<Account> = {};
  try { a = JSON.parse(store?.getItem(KEY) || '{}') ?? {}; } catch { a = {}; }
  const acc: Account = {
    token: typeof a.token === 'string' && a.token ? a.token : null,
    user: a.user && typeof a.user === 'object' ? a.user as AccountUser : null,
    profileId: typeof a.profileId === 'number' ? a.profileId : null,
    profileName: typeof a.profileName === 'string' ? a.profileName : null,
    anonId: typeof a.anonId === 'string' && /^[0-9a-f-]{36}$/i.test(a.anonId) ? a.anonId : uuid(),
  };
  if (!acc.token) { acc.user = null; acc.profileId = null; acc.profileName = null; }
  if (a.anonId !== acc.anonId) saveAccount(acc, store);
  return acc;
}
export function saveAccount(a: Account, store: Storage | null = storage()): void {
  try { store?.setItem(KEY, JSON.stringify(a)); } catch { /* 保存できない環境 */ }
}
/** ログインして、プレイヤーも選んであるか */
export const signedIn = (a: Account = loadAccount()): boolean => !!(a.token && a.profileId);

/** 面の番号(「ワールド-面」)の、ワールドの中の番号 */
const levelNo = (id: string): number => Number(/^\d+-(\d+)$/.exec(id)?.[1] ?? 0);
/** この面を遊ぶのに、ログインが要るか(ログインの入口が無いあいだは、要らない) */
export function needsLogin(levelId: string, a?: Account): boolean {
  return LOGIN_ENABLED && levelNo(levelId) > FREE_LEVELS && !signedIn(a ?? loadAccount());
}

/**
 * 記録・コイン・体力の保存場所の頭。ログインしてプレイヤーを選んでいれば、そのプレイヤーの分(家族で 別々)。
 * していなければ ''(これまでと同じ場所)
 */
export function storageScope(a?: Account): string {
  if (!LOGIN_ENABLED) return '';
  const acc = a ?? loadAccount();
  return acc.token && acc.profileId ? `p${acc.profileId}:` : '';
}

/** ゲストの記録を、どのプレイヤーへ引きついだか(この端末で1回だけ。設計書 37章) */
const CLAIM_KEY = 'spra-deer:guest-claimed:v1';
/**
 * ログインしてプレイヤーを選んだとき、そのプレイヤーの保存場所が空なら、ゲスト(ログイン前)の記録を写す。
 * 1つの端末で1回だけ(家族の2人目以降は、まっさらから)
 */
export function claimGuest(scope: string, key: string, store: Storage | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  if (!scope || !store) return;
  try {
    const claimed = store.getItem(CLAIM_KEY);
    if (store.getItem(scope + key) !== null || (claimed && claimed !== scope)) return;
    const guest = store.getItem(key);
    if (guest === null) return;
    store.setItem(scope + key, guest);
    store.setItem(CLAIM_KEY, scope);
  } catch { /* 保存できない環境 */ }
}
