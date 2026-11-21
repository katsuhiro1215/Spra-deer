// アカウントまわりの画面(設計書 37章)。HTML の文字列を返すだけ。ボタン・フォームの動きは account/controller.ts が受ける。
import type { Board, Profile, Stats } from './api.ts';
import type { Account } from './store.ts';

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const LEGAL = '<a href="https://go.spra.jp/terms" target="_blank" rel="noreferrer">Spra Go の利用規約</a>・<a href="https://go.spra.jp/privacy" target="_blank" rel="noreferrer">プライバシーポリシー</a>';
const msgLine = (msg: string) => (msg ? `<p class="ac-msg" role="alert">${esc(msg)}</p>` : '');
const card = (body: string) => `<div class="screen modal-screen ac-screen"><div class="modal-card ac-card">${body}</div></div>`;

export function loginHTML(msg = '', email = ''): string {
  return card(`<span class="eyebrow">Spra Go の アカウント</span><h2>ログイン</h2>
    <p class="ac-lead">Spra Go・Tane と 同じ アカウントで あそべます。<br>ログインすると、どのワールドも 3面目から 先へ すすめます。</p>
    <form class="ac-form" data-form="login">
      <label>メールアドレス<input type="email" name="email" autocomplete="email" required value="${esc(email)}"></label>
      <label>パスワード<input type="password" name="password" autocomplete="current-password" required></label>
      ${msgLine(msg)}
      <button class="primary" type="submit">ログイン</button>
    </form>
    <p class="ac-help"><a href="https://go.spra.jp/forgot-password" target="_blank" rel="noreferrer">パスワードを わすれた</a></p>
    <div class="secondary-row"><button class="secondary" data-action="register">はじめての人(とうろく)</button><button class="secondary" data-action="home">もどる</button></div>`);
}

export function registerHTML(inviteRequired: boolean, msg = ''): string {
  return card(`<span class="eyebrow">Spra Go の アカウント</span><h2>とうろく</h2>
    <p class="ac-lead">おうちの人が とうろくしてね。家族の みんなで つかえます。</p>
    <form class="ac-form" data-form="register">
      <label>おなまえ(おうちの人)<input name="name" autocomplete="name" required maxlength="255"></label>
      <label>メールアドレス<input type="email" name="email" autocomplete="email" required></label>
      <label>パスワード<input type="password" name="password" autocomplete="new-password" required minlength="8"></label>
      <label>パスワード(もういちど)<input type="password" name="password_confirmation" autocomplete="new-password" required minlength="8"></label>
      ${inviteRequired ? '<label>招待コード<input name="invite_code" required></label>' : ''}
      <label class="ac-check"><input type="checkbox" name="terms" required> ${LEGAL} に 同意します</label>
      ${msgLine(msg)}
      <button class="primary" type="submit">とうろくする</button>
    </form>
    <div class="secondary-row"><button class="secondary" data-action="login">ログインへ</button><button class="secondary" data-action="home">もどる</button></div>`);
}

export function termsHTML(msg = ''): string {
  return card(`<span class="eyebrow">おしらせ</span><h2>利用規約が 新しく なりました</h2>
    <p class="ac-lead">${LEGAL} を 読んで、同意してください。</p>${msgLine(msg)}
    <button class="primary" data-action="accept-terms">同意する</button>
    <div class="secondary-row"><button class="secondary" data-action="logout">ログアウト</button></div>`);
}

export function profilesHTML(profiles: Profile[], current: number | null, msg = ''): string {
  const list = profiles.map(p => `<button class="ac-player${p.id === current ? ' on' : ''}" data-action="pick-profile" data-id="${p.id}" data-name="${esc(p.name)}"><span class="ac-face">${esc([...p.name][0] ?? '？')}</span><b>${esc(p.name)}</b></button>`).join('');
  return card(`<span class="eyebrow">家族の プレイヤー</span><h2>だれが あそぶ？</h2>
    <div class="ac-players">${list || '<p class="ac-help">まだ プレイヤーが いません。下で つくってね。</p>'}</div>
    <form class="ac-form ac-row" data-form="add-profile"><input name="name" placeholder="新しい プレイヤーの 名前" maxlength="20" required><button class="primary" type="submit">ふやす</button></form>
    ${msgLine(msg)}
    <p class="ac-help">記録・コイン・体力は、プレイヤーごとに べつべつです。</p>
    <div class="secondary-row">${current ? '<button class="secondary" data-action="home">もどる</button>' : ''}<button class="secondary" data-action="logout">ログアウト</button></div>`);
}

/** せっていの中の、アカウントの欄 */
export function accountRowsHTML(a: Account, enabled: boolean): string {
  if (!enabled) return '';
  if (!a.token) return '<button class="hs-row" data-action="login"><span>ログイン(Spra Go の アカウント)</span><b>›</b></button>';
  return `<div class="hs-row"><span>ログイン中</span><b class="ac-mail">${esc(a.user?.email ?? '')}</b></div>
    <button class="hs-row" data-action="profiles"><span>あそぶ人</span><b>${esc(a.profileName ?? 'えらぶ')} ›</b></button>
    <button class="hs-row" data-action="ranking-public"><span>みんなの ランキング(保護者)</span><b>›</b></button>
    <button class="hs-row" data-action="logout"><span>ログアウト</span><b>›</b></button>`;
}

/** 秒の表示(ミリ秒から) */
export const fmtMs = (ms: number): string => `${(ms / 1000).toFixed(1)} 秒`;

export function rankingHTML(level: string, title: string, scope: 'family' | 'all', board: Board | null, msg = '', isPublic: boolean | null = null): string {
  const tab = (s: 'family' | 'all', label: string) => `<button class="ac-tab${s === scope ? ' on' : ''}" data-action="ranking" data-level="${level}" data-scope="${s}" aria-pressed="${s === scope}">${label}</button>`;
  const rows = board?.rows.map(r => `<li class="${r.is_me ? 'me' : ''}"><span class="ac-rank">${r.rank}</span><b>${esc(r.name)}${r.is_me ? ' (じぶん)' : ''}</b><span>${fmtMs(r.best_ms)}</span></li>`).join('') ?? '';
  const me = board?.me ? `<p class="ac-me">じぶん: ${board.me.rank}位(${fmtMs(board.me.best_ms)})</p>` : '';
  const empty = board && !board.rows.length ? `<p class="ac-help">${scope === 'all' ? 'まだ だれも 記録が ありません' : 'まだ 家族の 記録が ありません'}</p>` : '';
  const note = scope === 'all' ? `<p class="ac-help">名前は 出さず、ニックネームで 出ます。${isPublic === false ? 'あなたの家族は、まだ のっていません(せっていの「みんなの ランキング」で のせられます)。' : ''}</p>` : '';
  return card(`<span class="eyebrow">ランキング ${esc(level)}</span><h2>${esc(title)}</h2>
    <div class="ac-tabs">${tab('family', '家族')}${tab('all', 'みんな')}</div>
    ${board ? `<ol class="ac-board">${rows}</ol>${me}${empty}` : msg ? '' : '<p class="ac-help">よみこみ中…</p>'}${msgLine(msg)}${note}
    <p class="ac-help">クリアした いちばん 速い タイムで ならびます。</p>
    <div class="secondary-row"><button class="secondary" data-action="back-world">もどる</button></div>`);
}

export function rankingPublicHTML(isPublic: boolean | null, nickname: string, msg = ''): string {
  return card(`<span class="eyebrow">保護者の かたへ</span><h2>みんなの ランキング</h2>
    <p class="ac-lead">オンにすると、家族の みんなの 記録が、名前の かわりに ニックネーム(${esc(nickname || '色+どうぶつ')})で、ほかの 人の ランキングに 出ます。家族の ランキングは、いつでも 見られます。</p>
    <p class="ac-state">いまは <b>${isPublic === null ? '…' : isPublic ? 'オン' : 'オフ'}</b></p>
    ${isPublic ? '<button class="primary" data-action="set-public" data-on="0">オフにする</button>' : `<form class="ac-form" data-form="set-public"><label>Spra Go の パスワード(保護者の確認)<input type="password" name="password" autocomplete="current-password" required></label><button class="primary" type="submit">オンにする</button></form>`}
    ${msgLine(msg)}
    <div class="secondary-row"><button class="secondary" data-action="tab" data-tab="settings">もどる</button></div>`);
}

/** 面えらびの、遊ばれた数の 一行 */
export function statsLine(stats: Stats | null, level: string): string {
  const s = stats?.levels.find(l => l.level === level);
  if (!s || !s.plays) return '';
  return `<span class="lv-stats">あそばれた ${s.plays.toLocaleString()}回・クリア ${s.clear_players.toLocaleString()}人</span>`;
}
