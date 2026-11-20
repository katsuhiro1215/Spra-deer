// ホームまわりの画面(設計書 25-5)。トップ・ホーム・ワールドの面えらび・お店・なかま・せってい。
// HTML の文字列を返すだけ。ボタンの動き(data-action)は main.ts が受ける。
import { STAGES } from './game/levels.ts';
import type { Progress } from './progress.ts';
import { POTION, STAMINA_MAX, STAMINA_FAIL, waitText, type Wallet } from './wallet.ts';
import pkg from '../package.json';

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
  // 5 は Spra が主役のジャンプ(2026-11-21)。7 は、Spra が主役の新しいゲームを考え中
  { no: 5, name: '鹿の背中で ぴょんぴょん', play: '鹿に 乗って、上へ 上へ', stage: 5, color: '#c98a4b' },
  { no: 6, name: '鹿ずもう', play: 'いろんな鹿と、押し合い勝負', stage: 6, color: '#d36aa6' },
  { no: 7, name: 'ひみつのワールド', play: 'Spraの 新しい あそび(考え中)', color: '#7a6ad8' },
  { no: 8, name: '鹿と暴走トロッコ', play: '鹿が引いて、Spraが止める', stage: 8, color: '#6b8f3a' },
];

const stageOf = (stage: number) => STAGES.find(s => s.stage === stage);
const playable = (stage: number) => (stageOf(stage)?.slots ?? []).filter(s => s.level || s.runnerId);

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
  return `<header class="hs-head"><button class="hs-brand" data-action="title" aria-label="トップへ"><span class="hs-mark">S</span><span class="hs-name">Spraと鹿。</span></button>${statusBar(w)}</header>`;
}

export type Tab = 'home' | 'shop' | 'friends' | 'settings';
function nav(active: Tab): string {
  const items: [Tab, string, string][] = [
    ['home', 'ホーム', '<path d="M4 13L14 4l10 9M7 11v11h14V11"/>'],
    ['shop', 'アイテム', '<path d="M5 9h18l-2 13H7zM10 9a4 4 0 0 1 8 0"/>'],
    ['friends', 'なかま', '<circle cx="10" cy="11" r="4"/><circle cx="19" cy="11" r="3.2"/><path d="M3 23c1-5 4-7 7-7s6 2 7 7M16 17c3-1 7 1 8 5"/>'],
    ['settings', 'せってい', '<circle cx="14" cy="14" r="4"/><path d="M14 3v4M14 21v4M3 14h4M21 14h4M6 6l3 3M19 19l3 3M22 6l-3 3M9 19l-3 3"/>'],
  ];
  return `<nav class="hs-nav" aria-label="メニュー">${items.map(([t, label, d]) => `<button data-action="tab" data-tab="${t}"${t === active ? ' aria-current="page"' : ''}><svg viewBox="0 0 28 28" aria-hidden="true">${d}</svg>${label}</button>`).join('')}</nav>`;
}

function shell(w: Wallet, tab: Tab, body: string, extraClass = ''): string {
  return `<div class="screen home-screen ${extraClass}">${head(w)}<div class="hs-body">${body}</div>${nav(tab)}</div>`;
}

/** トップ画面(ブランド共通: 左上ロゴ・右上バージョン・中央にアプリ名と「はじめる」・下に規約) */
export function titleHTML(): string {
  return `<div class="screen title-screen"><div class="title-corner"><span class="hs-mark">S</span><span class="title-version">${APP_VERSION}</span></div><div class="title-head"><h2 class="wordmark" aria-label="Spraと鹿。"><span class="w-spru">Spra</span><span class="w-to">と</span><span class="w-deer">鹿</span><span class="w-dot">。</span></h2><p class="subtitle">奈良を、鹿と大冒険。</p></div><div class="hero"><img class="hero-fawn" src="/assets/hero/fawn.png" alt="子鹿"><img class="hero-spru" src="/assets/hero/spru.png" alt="Spra"><img class="hero-stag" src="/assets/hero/stag.png" alt="雄鹿"><span class="speech">いっしょに、いこう！</span></div><div class="hill"><button class="play" data-action="home">はじめる</button><nav class="legal-links"><a href="/terms/">利用規約</a><a href="/privacy/">プライバシーポリシー</a></nav></div></div>`;
}

/** ホーム: ストーリーの帯と、ワールド1〜8のカード */
export function homeHTML(p: Progress, w: Wallet): string {
  const cards = WORLDS.map(wd => {
    const slots = wd.stage ? playable(wd.stage) : [];
    if (!slots.length) {
      return `<div class="hs-world soon" style="--wc:${wd.color}"><span class="hs-wno">WORLD ${wd.no}</span><b>${wd.name}</b><small>${wd.play}</small><span class="hs-wstate">準備中</span></div>`;
    }
    const needs = p.stageOpenNeeds(wd.stage!);
    const cleared = p.clearedCount(wd.stage!);
    const state = needs > 0 ? `🔒 前のワールドを あと${needs}面` : `${cleared} / ${slots.length} クリア`;
    return `<button class="hs-world${needs > 0 ? ' locked' : ''}${cleared === slots.length ? ' done' : ''}" style="--wc:${wd.color}" data-action="world" data-stage="${wd.stage}"${needs > 0 ? ' aria-disabled="true"' : ''}><span class="hs-wno">WORLD ${wd.no}</span><b>${wd.name}</b><small>${wd.play}</small><span class="hs-wstate">${state}</span></button>`;
  }).join('');
  const story = `<button class="hs-story" data-action="story"><span class="hs-wno">STORY</span><b>ストーリー</b><small>準備中 ── Spraと鹿の、ぼうけんの物語。</small></button>`;
  return shell(w, 'home', `${story}<div class="hs-worlds">${cards}</div>`);
}

/** ワールドの面えらび */
export function worldHTML(stage: number, p: Progress, w: Wallet): string {
  const wd = WORLDS.find(x => x.stage === stage);
  const group = stageOf(stage);
  const slots = group?.slots ?? [];
  const cards = slots.map(slot => {
    if (!slot.level && !slot.runnerId) return `<div class="level-card soon"><b>${slot.id}</b><span class="lv-name">${slot.title}<small>準備中</small></span></div>`;
    const record = p.get(slot.id), open = p.isUnlocked(slot.id);
    const status = !open ? 'ロック中' : record.best !== null ? `ベスト ${record.best.toFixed(1)}秒` : '未クリア';
    return `<button class="level-card${record.clears ? ' done' : ''}" data-action="${slot.runnerId ? 'run' : 'start'}" data-level="${slot.id}"${open ? '' : ' disabled'}><b>${slot.id}</b><span class="lv-name">${slot.title}<small>${slot.summary}</small></span><span class="lv-best">${status}</span></button>`;
  }).join('');
  const total = playable(stage).length;
  return shell(w, 'home', `<div class="hs-world-head" style="--wc:${wd?.color ?? '#5db443'}"><button class="secondary" data-action="home">← ホーム</button><div><span class="hs-wno">WORLD ${wd?.no ?? stage}</span><h2>${wd?.name ?? group?.title ?? ''}</h2></div><span class="count">${p.clearedCount(stage)} / ${total}</span></div><div class="levels">${cards}</div>`, 'world-screen');
}

/** 体力が足りないとき(面を始める前) */
export function tiredHTML(w: Wallet, back: string): string {
  const can = w.coins.silver >= POTION.price;
  return `<div class="screen modal-screen"><div class="modal-card"><span class="eyebrow">ひと休み</span><h2>体力が たりない…</h2><p>体力が ${STAMINA_FAIL} 以上で、面を始められます。<br>回復まで <b>${waitText(w.waitToPlay)}</b>(3分で1つ回復)</p>${statusBar(w)}<button class="primary" data-action="buy-potion"${can ? '' : ' disabled'}>回復薬をつかう(シルバー${POTION.price}枚で +${POTION.heal})</button><div class="secondary-row"><button class="secondary" data-action="${back}">もどる</button></div></div></div>`;
}

export function shopHTML(w: Wallet, note = ''): string {
  const full = w.stamina >= STAMINA_MAX;
  const can = w.coins.silver >= POTION.price && !full;
  const items = [
    `<div class="hs-item"><span class="hs-item-pic potion"></span><div><b>回復薬</b><small>体力 +${POTION.heal}</small></div><button class="hs-buy silver" data-action="buy-potion"${can ? '' : ' disabled'}><i></i>${POTION.price}</button></div>`,
    `<div class="hs-item soon"><span class="hs-item-pic costume"></span><div><b>衣装の鹿</b><small>桜・雪・紅葉・忍者・武者 など</small></div><span class="hs-buy gold"><i></i>準備中</span></div>`,
    `<div class="hs-item soon"><span class="hs-item-pic chara"></span><div><b>なかまキャラクター</b><small>Lumi・Ruru で あそべる</small></div><span class="hs-buy premium"><i></i>準備中</span></div>`,
  ].join('');
  const msg = note || (full ? '体力は満タンです。' : '');
  return shell(w, 'shop', `<h2 class="hs-title">アイテム</h2>${msg ? `<p class="hs-note" role="status">${msg}</p>` : ''}<div class="hs-items">${items}</div><p class="hs-help">シルバー: 面の中のコイン(クリアで持ち帰り)/ゴールド: はじめてのクリア・★3/プレミアム: 各面に1枚だけ隠れている</p>`);
}

export function friendsHTML(w: Wallet): string {
  return shell(w, 'friends', `<h2 class="hs-title">なかま</h2><div class="hs-friends"><img src="/assets/hero/spru.png" alt="Spra"><img src="/assets/hero/fawn.png" alt="子鹿"></div><p class="hs-note">いまの なかま: Spra・子鹿</p><p class="hs-help">衣装の鹿や、Lumi・Ruru は、アイテムで手に入るようになります(準備中)。</p>`);
}

export function settingsHTML(w: Wallet, soundOn: boolean): string {
  return shell(w, 'settings', `<h2 class="hs-title">せってい</h2><div class="hs-settings"><button class="hs-row" data-action="sound" aria-pressed="${soundOn}"><span>音(BGM・効果音)</span><b>${soundOn ? 'ON' : 'OFF'}</b></button><a class="hs-row" href="/terms/"><span>利用規約</span><b>›</b></a><a class="hs-row" href="/privacy/"><span>プライバシーポリシー</span><b>›</b></a><div class="hs-row"><span>バージョン</span><b>${APP_VERSION}</b></div></div><p class="hs-help">記録・体力・コインは、このブラウザに保存されます。${w.canSave ? '' : '(この環境では保存できません)'}</p>`);
}
