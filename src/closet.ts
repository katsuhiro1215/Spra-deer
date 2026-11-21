// 衣装(着せ替え)。鹿(雄鹿・雌鹿・子鹿)に着せる。ホーム・なかま・お店で見せる(ゲームの中は いつもの絵のまま。2026-11-21 Owner決定)。
// 買った衣装と、着ている衣装は、あそぶ人ごとに この端末へ保存する(コイン・体力と同じ保存の場所の決まり)。
import type { Wallet } from './wallet.ts';
import { claimGuest, storageScope } from './account/store.ts';
import { friendOf, standOf, unlockedBy, type Friend, type FriendId } from './friends.ts';

export type Who = 'stag' | 'doe' | 'fawn';

export const WHO: Record<Who, { label: string; base: string }> = {
  stag: { label: '雄鹿', base: '/assets/hero/stag.png' },
  doe: { label: '雌鹿', base: '/assets/hero/doe.png' },
  fawn: { label: '子鹿', base: '/assets/hero/fawn.png' },
};

export type Costume = {
  id: string;
  name: string;
  who: Who;
  /** 絵(透過 WebP)。public/assets/costume/ に置く */
  img: string;
  /** ゴールドコインの値段(設計書 26-3: 季節・特別の衣装は 120〜200) */
  gold: number;
  /** 買える月(1〜12)。その月以外は、買えない(持っていれば いつでも着られる) */
  months: number[];
  /** 絵が届いて、public/assets/costume/ に置いたら true。false のあいだは お店に「準備中」と出す */
  ready: boolean;
  /** 絵の大きさの合わせ(1=ふだんの絵と同じ体の大きさ。帽子などで はみ出す分を、絵ごとに直す) */
  fit?: number;
};

/** 12月限定のクリスマス(依頼文: rooms/Spra/dev/SpraDeer/xmas/prompts/ready/)。値段は 遊ぶ速さを見て決め直す */
export const COSTUMES: Costume[] = [
  { id: 'xmas-stag', name: 'クリスマスの雄鹿', who: 'stag', img: '/assets/costume/xmas-stag.webp', gold: 150, months: [12], ready: true },
  { id: 'xmas-doe', name: 'クリスマスの雌鹿', who: 'doe', img: '/assets/costume/xmas-doe.webp', gold: 150, months: [12], ready: true },
  { id: 'xmas-fawn', name: 'クリスマスの子鹿', who: 'fawn', img: '/assets/costume/xmas-fawn.webp', gold: 120, months: [12], ready: true },
];

export const costumeOf = (id: string): Costume | undefined => COSTUMES.find(c => c.id === id);
export const onSale = (c: Costume, now: Date): boolean => c.ready && c.months.includes(now.getMonth() + 1);

const KEY = 'spra-deer:closet:v1';
type Saved = { owned: string[]; worn: Partial<Record<Who, string>>; friends?: string[]; buddy?: string };

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export type BuyResult = 'ok' | 'owned' | 'closed' | 'poor' | 'unknown';

export class Closet {
  private owned = new Set<string>();
  private worn: Partial<Record<Who, string>> = {};
  /** 仲間にした鹿(プレミアムコイン)と、走るゲームに出す相棒 */
  private friends = new Set<FriendId>();
  private buddy: FriendId | null = null;
  private store: Storage | null;
  private readonly key: string;
  private wallet: Wallet;

  constructor(wallet: Wallet, store: Storage | null = storage(), scope = storageScope()) {
    this.wallet = wallet;
    this.store = store;
    this.key = scope + KEY;
    claimGuest(scope, KEY, store);
    if (!store) return;
    try {
      const s = JSON.parse(store.getItem(this.key) || 'null') as Partial<Saved> | null;
      if (s && typeof s === 'object') {
        if (Array.isArray(s.owned)) for (const id of s.owned) if (typeof id === 'string' && costumeOf(id)) this.owned.add(id);
        if (Array.isArray(s.friends)) for (const id of s.friends) if (typeof id === 'string' && friendOf(id)) this.friends.add(id as FriendId);
        if (typeof s.buddy === 'string' && this.friends.has(s.buddy as FriendId)) this.buddy = s.buddy as FriendId;
        if (s.worn && typeof s.worn === 'object') {
          for (const who of Object.keys(WHO) as Who[]) {
            const id = s.worn[who];
            if (typeof id === 'string' && this.owned.has(id) && costumeOf(id)?.who === who) this.worn[who] = id;
          }
        }
      }
    } catch { /* 読めなければ はじめから */ }
  }

  private save(): void {
    if (!this.store) return;
    const s: Saved = { owned: [...this.owned], worn: { ...this.worn }, friends: [...this.friends], buddy: this.buddy ?? undefined };
    try { this.store.setItem(this.key, JSON.stringify(s)); } catch { /* 保存できない環境 */ }
  }

  has(id: string): boolean { return this.owned.has(id); }
  wornId(who: Who): string | null { return this.worn[who] ?? null; }

  /** ゴールドで買う。買えたら、そのまま その鹿に着せる */
  buy(id: string, now: Date): BuyResult {
    const c = costumeOf(id);
    if (!c) return 'unknown';
    if (this.owned.has(id)) return 'owned';
    if (!onSale(c, now)) return 'closed';
    if (!this.wallet.spend('gold', c.gold)) return 'poor';
    this.owned.add(id);
    this.worn[c.who] = id;
    this.save();
    return 'ok';
  }

  /** 持っている衣装を着る(who に合わない・持っていないものは 着ない) */
  wear(id: string): boolean {
    const c = costumeOf(id);
    if (!c || !this.owned.has(id) || !c.ready) return false;
    this.worn[c.who] = id;
    this.save();
    return true;
  }
  takeOff(who: Who): void {
    delete this.worn[who];
    this.save();
  }

  // ---- 仲間の鹿(プレミアムコイン) ----
  hasFriend(id: FriendId): boolean { return this.friends.has(id); }
  get buddyId(): FriendId | null { return this.buddy; }
  get buddyFriend(): Friend | undefined { return friendOf(this.buddy); }
  /** 相棒の立ち姿(いなければ null) */
  get buddyStand(): string | null { return this.buddy ? standOf(this.buddy) : null; }
  /** プレミアムコインで仲間にする。買えたら そのまま相棒にする */
  buyFriend(id: FriendId): BuyResult {
    const f = friendOf(id);
    if (!f) return 'unknown';
    if (this.friends.has(id)) return 'owned';
    if (!this.wallet.spend('premium', f.premium)) return 'poor';
    this.friends.add(id);
    this.buddy = id;
    this.save();
    return 'ok';
  }
  /** 走る相棒を えらぶ(null で ふだんの鹿)。持っていないものは えらべない */
  setBuddy(id: FriendId | null): boolean {
    if (id !== null && !this.friends.has(id)) return false;
    this.buddy = id;
    this.save();
    return true;
  }
  /** 持っている鹿のおかげで開く面か(専用の面) */
  levelUnlocked(levelId: string, owner = (id: FriendId) => this.friends.has(id)): boolean {
    const f = unlockedBy(levelId);
    return !f || owner(f.id);
  }

  /** 着ている絵(無ければ ふだんの絵)と、体の大きさの合わせ */
  look(who: Who): { img: string; fit: number } {
    const c = this.worn[who] ? costumeOf(this.worn[who]!) : undefined;
    return c && c.ready ? { img: c.img, fit: c.fit ?? 1 } : { img: WHO[who].base, fit: 1 };
  }
  /** この鹿が着られる、持っている衣装 */
  ownedFor(who: Who): Costume[] { return COSTUMES.filter(c => c.who === who && c.ready && this.owned.has(c.id)); }
}
