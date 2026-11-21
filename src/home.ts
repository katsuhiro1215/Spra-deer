// ホームまわりの画面(設計書 25-5)。トップ・ホーム・ワールドの面えらび・お店・なかま・せってい。
// HTML の文字列を返すだけ。ボタンの動き(data-action)は main.ts が受ける。
import { STAGES } from './game/levels.ts';
import type { Progress } from './progress.ts';
import { POTION, STAMINA_MAX, STAMINA_FAIL, waitText, type Wallet } from './wallet.ts';
import pkg from '../package.json';
import { SEASONS, currentSeason, type Season, type SeasonPick } from './season.ts';
import { COSTUMES, WHO, onSale, type Closet, type Who } from './closet.ts';
import { FRIENDS, standOf, unlockedBy } from './friends.ts';
import { statsLine } from './account/screens.ts';
import type { Stats } from './account/api.ts';

export const APP_VERSION = `v${pkg.version}`;

/**
 * ワールド1〜8(設計書 22章・31章)。stage = 面のデータ(game/levels.ts の STAGES)の番号。無いものは準備中。
 * 奇数のワールドは Spra が主役、偶数は鹿が主役(2026-11-19 Owner決定。WORLD 3 と 4 を入れかえた)
 */
export const WORLDS: { no: number; name: string; play: string; stage?: number; color: string }[] = [
  { no: 1, name: 'Spraの大冒険', play: 'よけて、あつめて、とどける', stage: 1, color: '#5db443' },
  // 3Dのせんべい屋台(設計書 30章)。旧 WORLD 5(せんべいタワー)を統合。旧ステージ2(配達)は WORLD 1 へ入れた(設計書 28章)
  { no: 2, name: '鹿せんべい大作戦', play: '焼いて、積んで、投げて くばる', stage: 2, color: '#e99a2c' },
  { no: 3, name: '奈良公園、大掃除！', play: 'ほうきで、まとめて片付け', stage: 3, color: '#3aa6c9' },
  { no: 4, name: '鹿、走る。', play: '3Dで、奈良から大阪湾へ', stage: 4, color: '#e0533d' },
  // 5 は Spra が主役のジャンプ、7 は Spra が主役の まいご探し(どちらも 2026-11-21)
  { no: 5, name: '鹿の背中で ぴょんぴょん', play: '鹿に 乗って、上へ 上へ', stage: 5, color: '#c98a4b' },
  { no: 6, name: '鹿ずもう', play: 'いろんな鹿と、押し合い勝負', stage: 6, color: '#d36aa6' },
  { no: 7, name: '鹿のまいご探し', play: 'ちょうちんで、子鹿を 見つけて 帰す', stage: 7, color: '#7a6ad8' },
  { no: 8, name: '鹿と暴走トロッコ', play: '鹿が引いて、Spraが止める', stage: 8, color: '#6b8f3a' },
];

const stageOf = (stage: number) => STAGES.find(s => s.stage === stage);
const playable = (stage: number) => (stageOf(stage)?.slots ?? []).filter(s => (s.level || s.runnerId) && !s.bonus);

const fmtMin = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 右上: 体力とコイン。data-live は1秒ごとに書きかえる(main.ts) */
export function statusBar(w: Wallet): string {
  const st = w.stamina, next = w.nextIn;
  const pct = Math.round((st / STAMINA_MAX) * 100);
  return `<div class="hs-status" data-live="status">
    <div class="hs-stamina" aria-label="体力 ${st} / ${STAMINA_MAX}"><span class="hs-st-icon" aria-hidden="true"></span><span class="hs-st-bar"><i style="width:${pct}%"></i></span><b>${st}<small>/${STAMINA_MAX}</small></b>${next !== null ? `<small class="hs-st-next">+1 ${fmtMin(next)}</small>` : ''}</div>
    <div class="hs-coins"><span class="hs-coin silver" aria-label="シルバーコイン ${w.coins.silver}枚"><i></i>${w.coins.silver}</span><span class="hs-coin gold" aria-label="ゴールドコイン ${w.coins.gold}枚"><i></i>${w.coins.gold}</span><span class="hs-coin premium" aria-label="プレミアムコイン ${w.coins.premium}枚"><i></i>${w.coins.premium}</span></div>
  </div>`;
}

function head(w: Wallet): string {
  return `<header class="hs-head"><button class="hs-brand" data-action="title" aria-label="トップへ"><span class="hs-mark"><img src="/assets/logo.svg" alt="Spra"></span><span class="hs-name">Spraと鹿。</span></button>${statusBar(w)}</header>`;
}

export type Tab = 'home' | 'worlds' | 'shop' | 'friends' | 'settings';
function nav(active: Tab): string {
  const items: [Tab, string, string][] = [
    ['home', 'ホーム', '<path d="M4 13L14 4l10 9M7 11v11h14V11"/>'],
    ['worlds', 'ワールド', '<path d="M4 7l6-2 8 3 6-2v15l-6 2-8-3-6 2zM10 5v15M18 8v15"/>'],
    ['shop', 'アイテム', '<path d="M5 9h18l-2 13H7zM10 9a4 4 0 0 1 8 0"/>'],
    ['friends', 'なかま', '<circle cx="10" cy="11" r="4"/><circle cx="19" cy="11" r="3.2"/><path d="M3 23c1-5 4-7 7-7s6 2 7 7M16 17c3-1 7 1 8 5"/>'],
    ['settings', 'せってい', '<circle cx="14" cy="14" r="4"/><path d="M14 3v4M14 21v4M3 14h4M21 14h4M6 6l3 3M19 19l3 3M22 6l-3 3M9 19l-3 3"/>'],
  ];
  return `<nav class="hs-nav" aria-label="メニュー">${items.map(([t, label, d]) => `<button data-action="tab" data-tab="${t}"${t === active ? ' aria-current="page"' : ''}><svg viewBox="0 0 28 28" aria-hidden="true">${d}</svg>${label}</button>`).join('')}</nav>`;
}

function shell(w: Wallet, tab: Tab, body: string, extraClass = ''): string {
  return `<div class="screen home-screen ${extraClass}">${head(w)}<div class="hs-body">${body}</div>${nav(tab)}</div>`;
}

/** 鹿の絵(着ている衣装があれば、その絵) */
function fig(cls: string, who: Who, closet: Closet | null, alt = WHO[who].label): string {
  const l = closet?.look(who) ?? { img: WHO[who].base, fit: 1 };
  return `<img class="${cls}" src="${l.img}" alt="${alt}"${l.fit !== 1 ? ` style="--fit:${l.fit}"` : ''}>`;
}

/** 季節の背景と、Spra と鹿(トップとホームで同じ。着せ替えと季節が、そのまま両方に出る) */
function sceneHTML(se: Season, closet: Closet | null, inner: string): string {
  // 降ってくるもの(位置・速さ・大きさは 決まった ばらつき)
  const fall = Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 0.83) % 7}s;--t:${7 + ((i * 5) % 6)}s;--s:${0.7 + ((i * 3) % 5) / 8}"></i>`).join('');
  const tree = se.tree ? `<img class="sc-tree l" src="${se.tree}" alt=""><img class="sc-tree r" src="${se.tree}" alt="">` : '';
  return `<div class="hs-scene season-${se.key}" style="--sky1:${se.sky[0]};--sky2:${se.sky[1]};--hill1:${se.hill[0]};--hill2:${se.hill[1]}">
    <img class="sc-far" src="${se.far}" alt="" style="width:${se.farW}cqw">
    <div class="sc-hill"></div>${tree}
    <div class="sc-fall ${se.fall}" aria-hidden="true">${fall}</div>
    <div class="sc-cast">${fig('sc-stag', 'stag', closet)}<img class="sc-spra" src="${se.spra ?? '/assets/hero/spru.png'}" alt="Spra">${closet?.buddyStand ? `<img class="sc-fawn sc-buddy" src="${closet.buddyStand}" alt="${closet.buddyFriend?.name ?? '相棒'}">` : fig('sc-fawn', 'fawn', closet)}</div>
    ${inner}
  </div>`;
}

/** 規約・プライバシーポリシーは Spra Go のページ(Tane と同じ。内容を1か所にそろえる) */
const T = '<a href="https://go.spra.jp/terms" target="_blank" rel="noreferrer">';
const P = '<a href="https://go.spra.jp/privacy" target="_blank" rel="noreferrer">';

/** トップの画像(季節に関わらず1枚。12月だけ クリスマスの夜の絵)。上と下は、文字とボタンのために あけてある */
export const TOP_IMAGES = {
  normal: { src: '/assets/top/top-nara.webp', sky: '#2790f2', night: false },
  xmas: { src: '/assets/top/top-xmas.webp', sky: '#012088', night: true },
};
export const topImageOf = (now: Date) => (now.getMonth() === 11 ? TOP_IMAGES.xmas : TOP_IMAGES.normal);

/** トップ画面(ブランド共通: 左上ロゴ・右上バージョン・中央にアプリ名と「はじめる」・下に規約。規約は Spra Go のページ) */
export function titleHTML(now = new Date()): string {
  const t = topImageOf(now);
  const top = `<div class="title-corner"><span class="hs-mark"><img src="/assets/logo.svg" alt="Spra"></span><span class="title-version">${APP_VERSION}</span></div><div class="title-head"><h2 class="wordmark" aria-label="Spraと鹿。"><span class="w-spru">Spra</span><span class="w-to">と</span><span class="w-deer">鹿</span><span class="w-dot">。</span></h2><p class="subtitle">奈良を、鹿と大冒険。</p></div>`;
  const bottom = `<div class="title-foot"><button class="play" data-action="home">はじめる</button><nav class="legal-links">${T}利用規約</a>${P}プライバシーポリシー</a></nav></div>`;
  return `<div class="screen title-screen title-img${t.night ? ' title-night' : ''}" style="--tbg:${t.sky}"><img class="title-bg" src="${t.src}" alt="">${top}${bottom}</div>`;
}

/** ストーリーは、絵と遊び方ができるまで 隠す(2026-11-21 Owner) */
export const STORY_VISIBLE = false;

/** ホーム: Spra と鹿が 画面いっぱい。季節で 背景と ひとことが かわる(着せ替え)。「あそぶ」で ワールドえらびへ */
export function homeHTML(p: Progress, w: Wallet, now = new Date(), player: string | null = null, closet: Closet | null = null): string {
  const se = currentSeason(now);
  const line = se.lines[Math.floor(now.getTime() / 60000) % se.lines.length];
  const total = WORLDS.reduce((n, wd) => n + (wd.stage ? playable(wd.stage).length : 0), 0);
  const cleared = WORLDS.reduce((n, wd) => n + (wd.stage ? p.clearedCount(wd.stage) : 0), 0);
  const story = STORY_VISIBLE ? '<button class="sc-story" data-action="story">ストーリー</button>' : '';
  const inner = `<p class="sc-speech"><b>Spra</b>${line}</p>
    <div class="sc-side"><span class="sc-season">${se.label}</span><span class="sc-count">クリア<b>${cleared}</b>/ ${total}</span>${player ? `<button class="sc-player" data-action="profiles">あそぶ人: <b>${player.replace(/[<>&"]/g, '')}</b></button>` : ''}${story}</div>
    <button class="sc-play" data-action="worlds"><small>WORLD 1〜8</small>あそぶ</button>`;
  return shell(w, 'home', sceneHTML(se, closet, inner), 'home-main');
}

/** ワールドえらび: ワールド1〜8のカード */
export function worldsHTML(p: Progress, w: Wallet, stats: Stats | null = null): string {
  const cards = WORLDS.map(wd => {
    const slots = wd.stage ? playable(wd.stage) : [];
    if (!slots.length) {
      return `<div class="hs-world soon" style="--wc:${wd.color}"><span class="hs-wno">WORLD ${wd.no}</span><b>${wd.name}</b><small>${wd.play}</small><span class="hs-wstate">準備中</span></div>`;
    }
    const needs = p.stageOpenNeeds(wd.stage!);
    const cleared = p.clearedCount(wd.stage!);
    const state = needs > 0 ? `🔒 前のワールドを あと${needs}面` : `${cleared} / ${slots.length} クリア`;
    // みんなに 遊ばれた回数(このワールドの全部の面。設計書 37章)
    const plays = stats?.levels.filter(l => l.level.startsWith(`${wd.stage}-`)).reduce((n, l) => n + l.plays, 0) ?? 0;
    const played = plays ? `<span class="hs-wplays">みんなで ${plays.toLocaleString()}回</span>` : '';
    return `<button class="hs-world${needs > 0 ? ' locked' : ''}${cleared === slots.length ? ' done' : ''}" style="--wc:${wd.color}" data-action="world" data-stage="${wd.stage}"${needs > 0 ? ' aria-disabled="true"' : ''}><span class="hs-wno">WORLD ${wd.no}</span><b>${wd.name}</b><small>${wd.play}</small><span class="hs-wstate">${state}</span>${played}</button>`;
  }).join('');
  return shell(w, 'worlds', `<h2 class="hs-title">ワールドを えらぶ</h2><div class="hs-worlds">${cards}</div>`);
}

/** ワールドの面えらび */
/** 面えらびに足すもの(設計書 37章): ログインが要る面・遊ばれた数・ランキングのボタン */
export type WorldExtras = { needsLogin?: (id: string) => boolean; stats?: Stats | null; ranking?: boolean };

export function worldHTML(stage: number, p: Progress, w: Wallet, ex: WorldExtras = {}): string {
  const wd = WORLDS.find(x => x.stage === stage);
  const group = stageOf(stage);
  const slots = group?.slots ?? [];
  const cards = slots.map(slot => {
    if (!slot.level && !slot.runnerId) return `<div class="level-card soon"><b>${slot.id}</b><span class="lv-name">${slot.title}<small>準備中</small></span></div>`;
    const record = p.get(slot.id), open = p.isUnlocked(slot.id), login = open && !!ex.needsLogin?.(slot.id);
    const fr = unlockedBy(slot.id);
    const status = !open ? (fr ? `🔒 ${fr.name}を 仲間にすると` : 'ロック中') : login ? '🔑 ログインで あそべる' : record.best !== null ? `ベスト ${record.best.toFixed(1)}秒` : '未クリア';
    const action = login ? 'need-login' : slot.runnerId ? 'run' : 'start';
    const card = `<button class="level-card${record.clears ? ' done' : ''}${login ? ' need-login' : ''}" data-action="${action}" data-level="${slot.id}"${open ? '' : ' disabled'}><b>${slot.id}</b><span class="lv-name">${slot.title}<small>${slot.summary}</small>${statsLine(ex.stats ?? null, slot.id)}</span><span class="lv-best">${status}</span></button>`;
    return ex.ranking ? `<div class="level-row">${card}<button class="lv-rank" data-action="ranking" data-level="${slot.id}" aria-label="${slot.id} の ランキング">🏆</button></div>` : card;
  }).join('');
  const total = playable(stage).length;
  return shell(w, 'worlds', `<div class="hs-world-head" style="--wc:${wd?.color ?? '#5db443'}"><button class="secondary" data-action="worlds">← ワールド</button><div><span class="hs-wno">WORLD ${wd?.no ?? stage}</span><h2>${wd?.name ?? group?.title ?? ''}</h2></div><span class="count">${p.clearedCount(stage)} / ${total}</span></div><div class="levels">${cards}</div>`, 'world-screen');
}

/** 体力が足りないとき(面を始める前) */
export function tiredHTML(w: Wallet, back: string): string {
  const can = w.coins.silver >= POTION.price;
  return `<div class="screen modal-screen"><div class="modal-card"><span class="eyebrow">ひと休み</span><h2>体力が たりない…</h2><p>体力が ${STAMINA_FAIL} 以上で、面を始められます。<br>回復まで <b>${waitText(w.waitToPlay)}</b>(3分で1つ回復)</p>${statusBar(w)}<button class="primary" data-action="buy-potion"${can ? '' : ' disabled'}>回復薬をつかう(シルバー${POTION.price}枚で +${POTION.heal})</button><div class="secondary-row"><button class="secondary" data-action="${back}">もどる</button></div></div></div>`;
}

export function shopHTML(w: Wallet, note = '', closet: Closet | null = null, now = new Date()): string {
  const full = w.stamina >= STAMINA_MAX;
  const can = w.coins.silver >= POTION.price && !full;
  const rows = [
    `<div class="hs-item"><span class="hs-item-pic potion"></span><div><b>回復薬</b><small>体力 +${POTION.heal}</small></div><button class="hs-buy silver" data-action="buy-potion"${can ? '' : ' disabled'}><i></i>${POTION.price}</button></div>`,
  ];
  // 衣装: 買える(いまの月)ものと、持っているもの。絵がまだのものは「準備中」の1行にまとめる
  const shown = COSTUMES.filter(c => c.ready && (onSale(c, now) || closet?.has(c.id)));
  for (const c of shown) {
    const have = closet?.has(c.id);
    const btn = have ? '<span class="hs-have">もっている</span>' : `<button class="hs-buy gold" data-action="buy-costume" data-id="${c.id}"${w.coins.gold >= c.gold ? '' : ' disabled'}><i></i>${c.gold}</button>`;
    rows.push(`<div class="hs-item costume"><span class="hs-item-pic" style="background-image:url(${c.img})"></span><div><b>${c.name}</b><small>${c.months.length === 1 ? `${c.months[0]}月だけ 買える` : '季節の衣装'}</small></div>${btn}</div>`);
  }
  if (COSTUMES.some(c => !c.ready)) {
    rows.push(`<div class="hs-item soon"><span class="hs-item-pic costume"></span><div><b>衣装の鹿</b><small>12月は クリスマス。ほかの季節も 順に</small></div><span class="hs-buy gold"><i></i>準備中</span></div>`);
  }
  // 仲間の鹿(プレミアムコイン)
  for (const f of FRIENDS) {
    const have = closet?.hasFriend(f.id);
    const btn = have ? '<span class="hs-have">もっている</span>' : `<button class="hs-buy premium" data-action="buy-friend" data-id="${f.id}"${w.coins.premium >= f.premium ? '' : ' disabled'}><i></i>${f.premium}</button>`;
    const note = f.unlocks.length ? `${f.color}の鹿・専用の面(準備中)` : `${f.color}の鹿・走る相棒になる`;
    rows.push(`<div class="hs-item friend"><span class="hs-item-pic" style="background-image:url(${standOf(f.id)})"></span><div><b>${f.name}</b><small>${note}</small></div>${btn}</div>`);
  }
  const msg = note || (full ? '体力は満タンです。' : '');
  return shell(w, 'shop', `<h2 class="hs-title">アイテム</h2>${msg ? `<p class="hs-note" role="status">${msg}</p>` : ''}<div class="hs-items">${rows.join('')}</div><p class="hs-help">シルバー: 面の中のコイン(クリアで持ち帰り)/ゴールド: はじめてのクリア・★3/プレミアム: 各面に1枚だけ隠れている(仲間の鹿を仲間にできる)</p>`);
}

/** なかま: Spra と鹿たち。持っている衣装を 鹿ごとに 着せかえる */
export function friendsHTML(w: Wallet, closet: Closet | null = null): string {
  const deer = (Object.keys(WHO) as Who[]).map(who => {
    const mine = closet?.ownedFor(who) ?? [];
    const cur = closet?.wornId(who) ?? null;
    const chips = mine.length
      ? `<div class="hs-chips"><button class="hs-chip-btn" data-action="wear" data-who="${who}" data-id="" aria-pressed="${cur === null}">ふだん</button>${mine.map(c => `<button class="hs-chip-btn" data-action="wear" data-who="${who}" data-id="${c.id}" aria-pressed="${cur === c.id}">${c.name.replace(/^クリスマスの/, 'クリスマス')}</button>`).join('')}</div>`
      : '<small class="hs-nocos">衣装は、アイテムで 手に入ります</small>';
    return `<div class="hs-deer">${fig('', who, closet)}<b>${WHO[who].label}</b>${chips}</div>`;
  }).join('');
  // 仲間の鹿: 走る相棒を えらぶ(WORLD 4・8 で走る鹿が かわる)。持っていない鹿は かげだけ
  const cur = closet?.buddyId ?? null;
  const pals = FRIENDS.map(f => {
    const have = closet?.hasFriend(f.id);
    if (!have) return `<div class="hs-pal locked"><img src="${standOf(f.id)}" alt=""><b>？？？</b><small>アイテムで 仲間に</small></div>`;
    return `<button class="hs-pal" data-action="buddy" data-id="${f.id}" aria-pressed="${cur === f.id}"><img src="${standOf(f.id)}" alt="${f.name}"><b>${f.name}</b><small>${cur === f.id ? '走っています' : '相棒にする'}</small></button>`;
  }).join('');
  const palHead = `<h3 class="hs-sub">仲間の鹿 <small>(WORLD 4・8 で 走る相棒)</small></h3><div class="hs-pals">${pals}</div>${cur ? '<button class="hs-chip-btn hs-pal-off" data-action="buddy" data-id="">ふだんの鹿に もどす</button>' : ''}`;
  return shell(w, 'friends', `<h2 class="hs-title">なかま</h2><div class="hs-friends"><div class="hs-deer"><img src="/assets/hero/spru.png" alt="Spra"><b>Spra</b></div>${deer}</div>${palHead}<p class="hs-help">衣装は ホームに 出ます(ゲームの中の Spra は いつもの すがた)。仲間の鹿は、プレミアムコインで アイテムから 仲間に できます。</p>`);
}

export function settingsHTML(w: Wallet, soundOn: boolean, season: SeasonPick = 'auto', accountRows = '', signedIn = false): string {
  const seasons = (['auto', 'spring', 'summer', 'autumn', 'winter'] as const).map(k => `<button class="hs-chip-btn" data-action="season" data-season="${k}" aria-pressed="${k === season}">${k === 'auto' ? '自動' : SEASONS[k].label}</button>`).join('');
  return shell(w, 'settings', `<h2 class="hs-title">せってい</h2><div class="hs-settings"><button class="hs-row" data-action="sound" aria-pressed="${soundOn}"><span>音(BGM・効果音)</span><b>${soundOn ? 'ON' : 'OFF'}</b></button><div class="hs-row hs-season-row"><span>ホームの 季節</span><div class="hs-chips">${seasons}</div></div>${accountRows}<a class="hs-row" href="https://go.spra.jp/terms" target="_blank" rel="noreferrer"><span>利用規約</span><b>›</b></a><a class="hs-row" href="https://go.spra.jp/privacy" target="_blank" rel="noreferrer"><span>プライバシーポリシー</span><b>›</b></a><div class="hs-row"><span>バージョン</span><b>${APP_VERSION}</b></div></div><p class="hs-help">${signedIn ? '記録・体力・コインは、あそぶ人ごとに このブラウザに保存されます。クリアの記録(タイム・★)は Spra Go にも あずけるので、ほかの 端末でも 引きつげます。' : '記録・体力・コインは、このブラウザに保存されます。'}${w.canSave ? '' : '(この環境では保存できません)'}</p>`);
}
