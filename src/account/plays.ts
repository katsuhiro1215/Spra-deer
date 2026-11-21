// 遊んだ1回を Spra Go に送る(面ごとの遊ばれた数・ランキング。設計書 37章)。
// 送れなくても(通信が切れていても)、ゲームは そのまま遊べる。ログインしていない人は、端末ごとの番号で送る。
import { createApi } from './api.ts';
import { API_BASE, FREE_LEVELS, loadAccount, signedIn, type Account } from './store.ts';

type Pending = { level: string; acc: Account; id: number | null; ready: Promise<number | null> };
let pending: Pending | null = null;
let hooked = false;

const levelNo = (id: string): number => Number(/^\d+-(\d+)$/.exec(id)?.[1] ?? 0);
const apiFor = (acc: Account) => createApi(() => (signedIn(acc) ? acc.token : null));

/** 面を始めた(前の回が終わっていなければ、失敗として閉じる) */
export function playStarted(level: string): void {
  if (!API_BASE || !/^[1-8]-([1-9]|10)$/.test(level)) return;
  if (pending) playEnded(pending.level, 'fail');
  const acc = loadAccount();
  // ログインしていない人は、各ワールドの2面目までしか送れない(サーバーでも断られる)
  if (!signedIn(acc) && levelNo(level) > FREE_LEVELS) return;
  const body = signedIn(acc) ? { level, profile_id: acc.profileId! } : { level, anon_id: acc.anonId };
  const p: Pending = { level, acc, id: null, ready: Promise.resolve(null) };
  p.ready = apiFor(acc).playStart(body).then(r => (p.id = r.id)).catch(() => null);
  pending = p;
  hookUnload();
}

/** 面が終わった(time = 秒) */
export function playEnded(level: string, result: 'clear' | 'fail' | 'quit', time?: number, stars?: number): void {
  const p = pending;
  if (!p || p.level !== level) return;
  pending = null;
  const body = {
    result,
    ...(time !== undefined && Number.isFinite(time) ? { time_ms: Math.round(time * 1000) } : {}),
    ...(stars !== undefined ? { stars } : {}),
    ...(signedIn(p.acc) ? {} : { anon_id: p.acc.anonId }),
  };
  const send = (id: number | null) => { if (id) apiFor(p.acc).playFinish(id, body, result === 'quit').catch(() => {}); };
  // ページを閉じるときは、待たずに送る(keepalive)。番号がまだ届いていなければ、あきらめる
  if (result === 'quit') send(p.id); else void p.ready.then(send);
}

/** 遊んでいる途中で ページを離れたら、「やめた」として送る */
function hookUnload(): void {
  if (hooked || typeof window === 'undefined') return;
  hooked = true;
  window.addEventListener('pagehide', () => { if (pending) playEnded(pending.level, 'quit'); });
}

/** テスト用: 送りかけの回を消す */
export function resetPlays(): void { pending = null; }
