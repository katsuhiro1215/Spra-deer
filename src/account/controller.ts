// アカウントまわりの動き(設計書 37章)。ホーム(main.ts)の画面の上で、ログイン・登録・プレイヤーえらび・ランキングを出す。
import { ApiError, createApi, type Stats } from './api.ts';
import { accountRowsHTML, loginHTML, profilesHTML, rankingHTML, rankingPublicHTML, registerHTML, termsHTML } from './screens.ts';
import { API_BASE, LOGIN_ENABLED, loadAccount, needsLogin, saveAccount, signedIn, type Account } from './store.ts';
import type { Progress } from '../progress.ts';

export type AccountNav = {
  /** 画面を出す */
  show(html: string): void;
  home(): void;
  settings(): void;
  /** いまのワールドの面えらびへ もどる */
  backToWorld(): void;
  /** 記録が かわったので、今の画面を かきなおす */
  refresh(): void;
  /** 面の名前(ランキングの見出し) */
  titleOf(level: string): string;
};

export class AccountController {
  acc: Account = loadAccount();
  readonly api = createApi(() => this.acc.token);
  stats: Stats | null = null;
  private statsAt = 0;
  private busy = false;

  constructor(private nav: AccountNav, private progress: Progress) {}

  get enabled(): boolean { return LOGIN_ENABLED; }
  needsLogin(level: string): boolean { return needsLogin(level, this.acc); }
  rows(): string { return accountRowsHTML(this.acc, LOGIN_ENABLED); }
  get signedIn(): boolean { return signedIn(this.acc); }

  /** はじめに: ログインが まだ有効かを確かめ、預けた記録を取りこむ。遊ばれた数も読む */
  start(): void {
    void this.loadStats();
    if (!LOGIN_ENABLED || !this.acc.token) return;
    this.api.getUser().then(u => {
      this.acc.user = { id: u.id, name: u.name, email: u.email, termsOutdated: u.termsOutdated };
      saveAccount(this.acc);
      if (this.signedIn && !u.termsOutdated) return this.syncRecords();
    }).catch(e => { if (e instanceof ApiError && e.status === 401) this.forget(); });
  }

  /** 遊ばれた数(10分ごとに読みなおす)。読めたら画面を かきなおす */
  async loadStats(): Promise<void> {
    if (!API_BASE || Date.now() - this.statsAt < 600_000) return;
    this.statsAt = Date.now();
    try { this.stats = await this.api.stats(); this.nav.refresh(); } catch { this.statsAt = 0; }
  }

  private async syncRecords(): Promise<void> {
    if (!this.signedIn) return;
    try {
      const { records } = await this.api.records(this.acc.profileId!);
      if (this.progress.merge(records)) this.nav.refresh();
    } catch { /* 通信できなくても遊べる */ }
  }

  /** ログアウト(この端末のログインの印を消す。記録はプレイヤーごとに この端末に残る) */
  private forget(): void {
    this.acc = { ...this.acc, token: null, user: null, profileId: null, profileName: null };
    saveAccount(this.acc);
  }

  /** プレイヤーが かわったら、記録・コインの場所が かわるので、読みなおす */
  private reloadHome(): void {
    location.hash = '#select';
    location.reload();
  }

  /** ボタン。受けたら true */
  handle(action: string, b: HTMLElement): boolean {
    switch (action) {
      case 'login': this.nav.show(loginHTML()); return true;
      case 'need-login': this.nav.show(loginHTML('この面は、ログインすると あそべます')); return true;
      case 'register': void this.openRegister(); return true;
      case 'profiles': void this.openProfiles(); return true;
      case 'pick-profile': this.pick(Number(b.dataset.id), b.dataset.name ?? ''); return true;
      case 'accept-terms': void this.acceptTerms(); return true;
      case 'logout': void this.logout(); return true;
      case 'ranking': void this.openRanking(b.dataset.level ?? '', (b.dataset.scope as 'family' | 'all') ?? 'family'); return true;
      case 'ranking-public': void this.openPublic(); return true;
      case 'set-public': void this.setPublic(b.dataset.on === '1'); return true;
      case 'back-world': this.nav.backToWorld(); return true;
    }
    return false;
  }

  /** フォーム。受けたら true */
  submit(form: HTMLFormElement): boolean {
    const kind = form.dataset.form;
    const v = (k: string) => (form.elements.namedItem(k) as HTMLInputElement | null)?.value.trim() ?? '';
    if (this.busy) return true;
    if (kind === 'login') { void this.login(v('email'), (form.elements.namedItem('password') as HTMLInputElement).value); return true; }
    if (kind === 'register') {
      void this.register({ name: v('name'), email: v('email'), password: (form.elements.namedItem('password') as HTMLInputElement).value, passwordConfirmation: (form.elements.namedItem('password_confirmation') as HTMLInputElement).value, terms: (form.elements.namedItem('terms') as HTMLInputElement).checked, inviteCode: v('invite_code') || undefined });
      return true;
    }
    if (kind === 'add-profile') { void this.addProfile(v('name')); return true; }
    if (kind === 'set-public') { void this.setPublic(true, (form.elements.namedItem('password') as HTMLInputElement).value); return true; }
    return false;
  }

  private async run<T>(f: () => Promise<T>, onError: (msg: string) => void): Promise<T | undefined> {
    this.busy = true;
    try { return await f(); } catch (e) { onError(e instanceof ApiError ? e.message : 'つうしんに しっぱいしました。もういちど ためしてね'); return undefined; } finally { this.busy = false; }
  }

  private async login(email: string, password: string): Promise<void> {
    const r = await this.run(() => this.api.login(email, password), msg => this.nav.show(loginHTML(msg, email)));
    if (!r) return;
    this.acc = { ...this.acc, token: r.token, user: r.user, profileId: null, profileName: null };
    saveAccount(this.acc);
    if (r.user.termsOutdated) this.nav.show(termsHTML()); else await this.openProfiles();
  }

  private async openRegister(): Promise<void> {
    const info = await this.run(() => this.api.registration(), msg => this.nav.show(loginHTML(msg)));
    if (!info) return;
    if (!info.open) { this.nav.show(loginHTML('いまは とうろくを お休みしています')); return; }
    this.nav.show(registerHTML(info.invite_required));
  }

  private async register(form: Parameters<typeof this.api.register>[0]): Promise<void> {
    const r = await this.run(() => this.api.register(form), msg => this.nav.show(registerHTML(!!form.inviteCode, msg)));
    if (!r) return;
    this.acc = { ...this.acc, token: r.token, user: r.user, profileId: null, profileName: null };
    saveAccount(this.acc);
    await this.openProfiles();
  }

  private async acceptTerms(): Promise<void> {
    const ok = await this.run(async () => { const u = await this.api.getUser(); await this.api.acceptTerms(u.termsVersion); return true; }, msg => this.nav.show(termsHTML(msg)));
    if (!ok) return;
    if (this.acc.user) this.acc.user.termsOutdated = false;
    saveAccount(this.acc);
    await this.openProfiles();
  }

  private async openProfiles(msg = ''): Promise<void> {
    if (!this.acc.token) { this.nav.show(loginHTML()); return; }
    const list = await this.run(() => this.api.profiles(), m => this.nav.show(profilesHTML([], this.acc.profileId, m)));
    if (list) this.nav.show(profilesHTML(list, this.acc.profileId, msg));
  }

  private async addProfile(name: string): Promise<void> {
    if (!name) return;
    const p = await this.run(() => this.api.createProfile(name.slice(0, 20)), m => void this.openProfiles(m));
    if (p) await this.openProfiles();
  }

  private pick(id: number, name: string): void {
    if (!id) return;
    const changed = this.acc.profileId !== id;
    this.acc = { ...this.acc, profileId: id, profileName: name };
    saveAccount(this.acc);
    if (changed) this.reloadHome(); else this.nav.home();
  }

  private async logout(): Promise<void> {
    await this.api.logout().catch(() => null);
    this.forget();
    this.reloadHome();
  }

  private async openRanking(level: string, scope: 'family' | 'all'): Promise<void> {
    if (!this.signedIn) { this.nav.show(loginHTML('ランキングは、ログインすると 見られます')); return; }
    const title = this.nav.titleOf(level);
    this.nav.show(rankingHTML(level, title, scope, null));
    const board = await this.run(() => this.api.ranking(level, scope, this.acc.profileId!), msg => this.nav.show(rankingHTML(level, title, scope, null, msg)));
    if (!board) return;
    let isPublic: boolean | null = null;
    if (scope === 'all') isPublic = (await this.api.rankingSettings(this.acc.profileId!).catch(() => null))?.public ?? null;
    this.nav.show(rankingHTML(level, title, scope, board, '', isPublic));
  }

  private async openPublic(msg = ''): Promise<void> {
    if (!this.signedIn) { void this.openProfiles(); return; }
    this.nav.show(rankingPublicHTML(null, '', msg));
    const s = await this.run(() => this.api.rankingSettings(this.acc.profileId!), m => this.nav.show(rankingPublicHTML(null, '', m)));
    if (s) this.nav.show(rankingPublicHTML(s.public, s.nickname, msg));
  }

  private async setPublic(on: boolean, password?: string): Promise<void> {
    const s = await this.run(() => this.api.setRankingPublic(this.acc.profileId!, on, password), m => void this.openPublic(m));
    if (s) this.nav.show(rankingPublicHTML(s.public, s.nickname, s.public ? 'オンに しました' : 'オフに しました'));
  }
}
