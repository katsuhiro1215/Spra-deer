import * as Phaser from 'phaser';
import { VIEW, GOAL, RULES } from './game/stage.ts';
import { ALL_PLAYABLE_SLOTS, PLAYABLE, levelById, type LevelDefinition } from './game/levels.ts';
import { createWorld, step, type World, type Event } from './game/world.ts';
import { Progress } from './progress.ts';
import { Wallet, clearRewards } from './wallet.ts';
import { titleHTML, homeHTML, worldHTML, shopHTML, friendsHTML, settingsHTML, tiredHTML, statusBar, type Tab } from './home.ts';
import { ParkView, walkKey, deerKey } from './view.ts';
import deerWalk from './game/deer-walk.json';
import walk from './game/spru-walk.json';
import type { Facing } from './game/facing.ts';
import { Controls } from './input.ts';
import './styles.scss';

// Next.js の静的書き出し（ルートは /）。アセットは絶対パスで読む。

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const progress = new Progress();
const wallet = new Wallet();
const WATER_HINT = '池に、落ちた…！\n石や はすの葉の上を、跳んで渡ろう。\n乗ると沈む石もある。';
const STOLEN_DEFAULT = 'せんべいを、取られた…！\n鹿は、せんべいの匂いで寄ってくる。';
const CAUGHT_HINT = '鹿が追いかけてきた…！\n止まると追いつかれる。\nジャンプで鹿を越えるのもアリ。';

type Track = 'home' | 'play' | 'clear' | 'fail';
/** 音の ON/OFF の保存先(3D走りと同じ。src/runner/audio.ts の SOUND_KEY) */
const SOUND_KEY = 'spra-deer:sound:v1';
class Sound {
  // 2Dの面は、はじめは音なし。前にONにした人は、ONのまま(最初のタップで鳴りはじめる)
  enabled = (() => { try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch { return false; } })();
  /** ブラウザの決まりで鳴らせなかった曲を、タップのあとで鳴らし直す */
  retry() { const want = this.want; this.current = null; this.want = null; this.syncMusic(); this.want = want; this.syncMusic(); }
  private context?: AudioContext;
  // BGM（SpraTheme/assets/deer の書き出し）。ブラウザの制約で、音をONにするまで鳴らさない。
  private tracks = new Map<Track, HTMLAudioElement>();
  private want: Track | null = null;
  private current: Track | null = null;
  music(track: Track | null) { this.want = track; this.syncMusic(); }
  syncMusic() {
    const target = this.enabled ? this.want : null;
    if (this.current && this.current !== target) this.tracks.get(this.current)?.pause();
    if (target && this.current !== target) {
      let audio = this.tracks.get(target);
      if (!audio) {
        audio = new Audio(`/assets/audio/${target}.mp3`);
        audio.loop = target === 'home' || target === 'play'; audio.volume = target === 'play' ? .55 : .7;
        this.tracks.set(target, audio);
      }
      audio.currentTime = 0; void audio.play().catch(() => { /* 音は任意 */ });
    }
    this.current = target;
  }
  unlock() {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Sound is optional. */ }
  }
  play(kind: Event['kind']) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const notes: Partial<Record<Event['kind'], [number, number, number]>> = { jump: [390, 730, .13], warning: [160, 110, .17], collapse: [110, 38, .28], poop: [180, 75, .22], fall: [390, 85, .4], clear: [540, 1080, .42], wall: [120, 45, .3], slide: [320, 190, .12], crush: [150, 40, .35], chase: [200, 330, .2], caught: [260, 90, .3], drop: [240, 120, .14], bait: [330, 220, .1], eat: [200, 260, .12], pickup: [880, 1320, .12], throw: [300, 520, .1], senbeiLand: [260, 180, .08], splash: [420, 120, .25], lure: [620, 880, .14], stolen: [260, 90, .3], sweep: [260, 420, .12], found: [500, 900, .2], lost: [260, 90, .3], coin: [1180, 1760, .12], gold: [880, 1760, .3], premium: [660, 1320, .5], sink: [300, 120, .3], water: [420, 90, .45] };
    const data = notes[kind]; if (!data) return;
    const [start, end, duration] = data, ctx = this.context;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = kind === 'collapse' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(start, ctx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + duration);
    gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.07, ctx.currentTime + .015); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}
const sound = new Sound();
const soundButton = document.createElement('button');
soundButton.id = 'sound';
el('game-wrap').append(soundButton);
const paintSoundButton = () => {
  soundButton.textContent = sound.enabled ? '音 ON' : '音 OFF';
  soundButton.setAttribute('aria-pressed', String(sound.enabled)); soundButton.setAttribute('aria-label', sound.enabled ? '効果音をオフにする' : '効果音をオンにする');
};
paintSoundButton();
const toggleSound = () => {
  sound.enabled = !sound.enabled; sound.unlock(); sound.syncMusic(); paintSoundButton();
  try { localStorage.setItem(SOUND_KEY, sound.enabled ? 'on' : 'off'); } catch { /* 保存できなくても鳴らし分けはできる */ }
};
soundButton.addEventListener('click', toggleSound);
// 前回ONだった人: 最初のタップで、音を有効にして曲を鳴らし直す(ボタン自体のタップは、ボタンの処理にまかせる)
document.addEventListener('pointerdown', e => {
  if (!sound.enabled || (e.target as HTMLElement).closest('#sound, [data-action="sound"]')) return;
  sound.unlock(); sound.retry();
}, { once: true });

class Boot extends Phaser.Scene {
  private failed = false;
  constructor() { super('Boot'); }
  preload() {
    for (const name of ['spru', 'spru-clear', 'spru-oops', 'deer']) this.load.image(name, `/assets/${name}.png`);
    for (const name of ['start', 'goal']) this.load.image(`gate-${name}`, `/assets/gate/${name}.png`);
    for (const facing of Object.keys(walk).filter(k => k !== 'referenceHeight') as Facing[]) walk[facing].frames.forEach((f, i) => this.load.image(walkKey(facing, i), `/assets/spru-walk/${f.file}`));
    for (const kind of Object.keys(deerWalk) as (keyof typeof deerWalk)[]) for (const side of ['r', 'l'] as const) deerWalk[kind][side].frames.forEach((f, i) => this.load.image(deerKey(kind, side, i), `/assets/deer-walk/${f.file}`));
    this.load.on('loaderror', () => { this.failed = true; el('fatal').hidden = false; });
  }
  create() {
    if (this.failed) return;
    // Trim the transparent margins at runtime, preserving the supplied images.
    for (const name of ['spru', 'spru-clear', 'spru-oops', 'deer']) {
      const texture = this.textures.get(name), source = texture.getSourceImage() as HTMLImageElement;
      const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(source, 0, 0);
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let left = source.width, top = source.height, right = -1, bottom = -1;
      for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
        if (bytes[(y * source.width + x) * 4 + 3] > 24) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
      }
      if (right >= left && bottom >= top) texture.get().setSize(right - left + 1, bottom - top + 1, left, top);
    }
    this.scene.start('Park');
  }
}

type Mode = 'title' | 'select' | 'playing' | 'paused' | 'dying' | 'result';

class Park extends Phaser.Scene {
  level: LevelDefinition = PLAYABLE[0];
  world: World = createWorld(this.level);
  mode: Mode = 'title';
  private view!: ParkView;
  private controls!: Controls;
  private accumulator = 0;
  private visualTime = 0;
  private lossAge = 0;
  private messageUntil = 0;
  private lastChapter = '';
  constructor() { super('Park'); }
  create() {
    this.view = new ParkView(this, this.level);
    this.controls = new Controls(() => this.pause(), () => { if (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'dying' || this.mode === 'result') { this.abandon(); this.tryBegin(this.level); } });
    el('pause').addEventListener('click', () => this.pause());
    window.addEventListener('blur', () => { if (this.mode === 'playing') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'playing') this.pause(); });
    el('overlay').addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      const action = button?.dataset.action, target = levelById(button?.dataset.level ?? '');
      if (!action || button?.getAttribute('aria-disabled') === 'true') return;
      if (action === 'select') { this.abandon(); this.world_(this.stageOf(this.level.id)); }
      if (action === 'home') { this.abandon(); this.home(); }
      if (action === 'tab') this.tab(button!.dataset.tab as Tab);
      if (action === 'world') this.world_(Number(button!.dataset.stage));
      if (action === 'story') this.toast('ストーリーは、準備中です。');
      if (action === 'sound') { toggleSound(); this.tab('settings'); }
      if (action === 'buy-potion') this.buyPotion();
      if ((action === 'start' || action === 'next') && target && progress.isUnlocked(target.id)) this.tryBegin(target);
      // 3D走りゲームの面(ステージ3)は、別のページ(/run/)で遊ぶ
      const runId = button?.dataset.level ?? '';
      if ((action === 'run' || (action === 'next' && !target)) && runId && progress.isUnlocked(runId)) {
        if (wallet.canPlay()) location.href = `/run/?level=${runId}`; else this.tired('home');
      }
      if (action === 'retry') { this.abandon(); this.tryBegin(this.level); }
      if (action === 'resume') this.resume();
      if (action === 'title') { this.abandon(); this.title(); }
    });
    // 走りゲームのページから「面えらびへ」で戻ってきたときは、そのワールドの面えらびから始める
    const m = /^#world-(\d+)$/.exec(location.hash);
    if (m) this.world_(Number(m[1])); else if (location.hash === '#select') this.home(); else this.title();
    // 体力の回復(残り時間)を、1秒ごとに書きかえる
    window.setInterval(() => {
      const live = el('overlay').querySelector('[data-live="status"]');
      if (live) live.outerHTML = statusBar(wallet);
    }, 1000);
    if (process.env.NODE_ENV !== 'production') Object.defineProperty(window, '__DEER_PARK__', { configurable: true, get: () => this }); // 開発中だけ: 確認用に、場面を直接さわる
    if (process.env.NODE_ENV !== 'production') Object.defineProperty(window, '__DEER__', { configurable: true, get: () => JSON.parse(JSON.stringify({ mode: this.mode, ...this.world, record: progress.get(this.level.id), canSave: progress.canSave })) });
  }
  private idle(mode: 'title' | 'select') {
    this.mode = mode; this.controls.enable(false); this.world = createWorld(this.level); this.view.reset(); sound.music('home');
    el('hud').hidden = el('controls').hidden = true; el('message').textContent = '';
    el('game-wrap').classList.toggle('menu', mode === 'select');
  }
  private title() { this.idle('title'); el('overlay').innerHTML = titleHTML(); }
  private home() { this.idle('select'); el('overlay').innerHTML = homeHTML(progress, wallet); }
  private world_(stage: number) {
    if (!(stage > 0)) { this.home(); return; }
    this.idle('select'); el('overlay').innerHTML = worldHTML(stage, progress, wallet);
  }
  private tab(t: Tab, note = '') {
    if (t === 'home') { this.home(); return; }
    this.idle('select');
    el('overlay').innerHTML = t === 'shop' ? shopHTML(wallet, note) : t === 'friends' ? friendsHTML(wallet) : settingsHTML(wallet, sound.enabled);
  }
  private stageOf(id: string): number { return ALL_PLAYABLE_SLOTS.find(l => l.id === id)?.stage ?? 1; }
  /** 遊んでいる面を、とちゅうでやめる(失敗と同じく体力が減る。設計書 25-2) */
  private abandon() {
    if (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'dying') { wallet.fail(); this.mode = 'result'; }
  }
  /** 体力があれば面を始める。足りなければ、回復の案内 */
  private tryBegin(level: LevelDefinition) {
    if (wallet.canPlay()) { this.begin(level); return; }
    this.level = level; this.tired('level');
  }
  /** 体力が足りない案内を、どこから開いたか(level=面を始めようとした) */
  private tiredFrom: 'level' | 'home' = 'home';
  private tired(from: 'level' | 'home') {
    this.idle('select'); this.tiredFrom = from;
    el('overlay').innerHTML = tiredHTML(wallet, from === 'level' ? 'select' : 'home');
  }
  private buyPotion() {
    const inModal = !!el('overlay').querySelector('.modal-card');
    const ok = wallet.buyPotion();
    // 体力不足の案内から買ったときは、そのまま面へ
    if (inModal && ok && this.tiredFrom === 'level') { this.begin(this.level); return; }
    if (inModal) { this.tired(this.tiredFrom); return; }
    this.tab('shop', ok ? '体力が回復した！' : 'シルバーコインが たりません。');
  }
  private toast(text: string) { el('message').textContent = text; window.setTimeout(() => { if (el('message').textContent === text) el('message').textContent = ''; }, 2000); }
  private begin(level: LevelDefinition) {
    this.level = level; this.view.setLevel(level);
    this.world = createWorld(level); this.view.reset(); this.accumulator = 0; this.visualTime = 0; this.lossAge = 0;
    if (wallet.hasPremium(level.id)) this.world.coins = this.world.coins.filter(c => c.kind !== 'premium');
    this.mode = 'playing'; this.controls.enable(true); progress.attempt(level.id); sound.unlock(); sound.music('play');
    el('hud-level').textContent = `面 ${level.id}`; el('hud-title').textContent = level.title;
    el('hud').hidden = el('controls').hidden = false; el('overlay').innerHTML = ''; this.lastChapter = ''; el('game-wrap').classList.remove('menu');
    this.message(level.intro, 4); this.setControls(level);
    el('game').focus({ preventScroll: true }); this.hud();
  }
  private jumpIcon?: string;
  /** ステージごとに、ボタンの意味が変わる（1=ジャンプ, 2=せんべいを置く, 3=そうじする, 4と5=ボタンなし）。 */
  private setControls(level: LevelDefinition) {
    const mode = level.delivery ? 'senbei' : level.sweep || level.cross || level.rescue ? 'none' : 'jump';
    const names = { senbei: 'せんべいを置く', jump: 'ジャンプ', none: '' } as const;
    const icons = { senbei: '<circle cx="30" cy="22" r="16"/><path d="M20 18H40M22 28H38"/>' };
    const button = el('jump'), svg = button.querySelector('svg')!;
    this.jumpIcon ??= svg.innerHTML;
    svg.innerHTML = mode === 'senbei' ? icons[mode] : this.jumpIcon;
    button.style.visibility = mode === 'none' ? 'hidden' : '';
    button.querySelector('strong')!.textContent = names[mode] || 'ジャンプ';
    button.setAttribute('aria-label', names[mode] || 'ジャンプ');
    el('game').setAttribute('aria-label', mode === 'none' ? 'ゲーム画面。方向キーで移動' : `ゲーム画面。方向キーで移動、スペースで${names[mode]}`);
    const toss = !!level.senbei;
    el('throw').hidden = !toss; el('controls').classList.toggle('has-throw', toss);
    const guide = document.querySelectorAll('.keyboard-guide span')[1];
    if (guide) guide.innerHTML = `${mode === 'none' ? '' : `<kbd>Space</kbd> ${names[mode]}　`}${toss ? '<kbd>X</kbd> なげる　' : ''}<kbd>R</kbd> 再挑戦`;
  }
  private message(text: string, duration = 2) { el('message').textContent = text; this.messageUntil = this.world.time + duration; }
  private pause() {
    if (this.mode === 'paused') { this.resume(); return; }
    if (this.mode !== 'playing') return;
    this.mode = 'paused'; this.controls.enable(false); this.accumulator = 0;
    el('overlay').innerHTML = `<div class="screen modal-screen"><div class="modal-card"><span class="eyebrow">ちょっと、ひと休み。</span><h2>鹿も、待っています。</h2><p>時間も、崩れかけの床も止まっています。</p><button class="primary" data-action="resume">つづきから</button><div class="secondary-row"><button class="secondary" data-action="retry">最初からやり直す</button><button class="secondary" data-action="select">面選択へ</button></div></div></div>`;
  }
  private resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing'; this.controls.enable(true); this.accumulator = 0; el('overlay').innerHTML = ''; el('game').focus({ preventScroll: true });
  }
  private finish() {
    this.mode = 'result'; const w = this.world, level = this.level, clear = w.outcome === 'clear';
    const newBest = clear && progress.clear(level.id, w.time);
    // 体力とコイン(設計書 25-2・25-3)。2Dの面は、クリアでシルバー20枚(面の中のコインを入れるまでの仮の値)
    // シルバー: 面の中で取ったコイン+クリアの10枚。ゴールド: 取った金のコイン(+はじめてのクリア)。プレミアム: 持ち帰ると自分のもの
    const got = clear ? clearRewards(wallet, level.id, { silver: 10 + w.silver, gold: w.gold }) : null;
    const prem = clear && w.premium && wallet.takePremium(level.id);
    if (!clear) wallet.fail();
    // 小さい画面でも結果のカードが収まるよう、行を増やさず、いちばん下の注意書きの場所に出す
    const reward = got ? `<p class="save-note reward-line">+${got.silver} <i class="coin silver"></i>${got.gold ? `　+${got.gold} <i class="coin gold"></i>` : ''}${prem ? '　+1 <i class="coin premium"></i>' : ''}</p>` : `<p class="save-note reward-line lose">体力 −2(のこり ${wallet.stamina})</p>`;
    sound.music(clear ? 'clear' : 'fail');
    // 次の面は、通常の面と3D走りの面をまとめた順で決める(2-5の次は、3D走りの3-1)
    const order = ALL_PLAYABLE_SLOTS, nextSlot = clear ? order[order.findIndex(x => x.id === level.id) + 1] : undefined;
    const next = nextSlot ? { id: nextSlot.id, runner: nextSlot.runner } : undefined;
    const attempts = progress.get(level.id).attempts;
    const stat: [string, number, string] = level.senbei ? ['なげたせんべい', w.throws, '枚'] : level.delivery ? ['つかったせんべい', w.baits.length, '個'] : level.sweep ? ['掃いたうんこ', w.swept, '個'] : level.cross ? ['わたった道', new Set(level.cross.crossers.map(c => c.y)).size, '本'] : level.rescue ? ['つれていった鹿', 1, '頭'] : ['ジャンプ', w.jumps, '回'];
    const title = clear ? (level.delivery ? '無事に、お届け。' : level.sweep ? '公園が、ぴかぴか！' : level.cross ? '無事に、横断。' : level.rescue ? '無事に、救出！' : '無事に、おさんぽ。') : w.outcome === 'dirty' ? '公園が、うんこだらけ…！' : w.outcome === 'hit' ? 'ぶつかった！' : w.outcome === 'lost' ? 'はぐれちゃった…！' : w.outcome === 'stolen' ? 'せんべい、取られた！' : w.outcome === 'water' ? 'ばしゃーん！' : w.outcome === 'fall' ? '地面まで、いたずら。' : w.outcome === 'wall' ? 'ぐえっ、壁…！' : w.outcome === 'caught' ? 'つかまった！' : 'あっ、足元…！';
    const copy = clear ? (level.delivery ? 'せんべいは、無事に届いた。\n鹿は、もぐもぐ満足そう。' : level.sweep ? '奈良公園は、きれいになった。\n鹿は、また落とす気まんまん。' : level.cross ? '動物たちの動きを、見事に読んだ。' : level.rescue ? '子鹿は、ほっと一安心。\nSpraの後ろで、ご機嫌。' : '数々のしかけを、見事に突破。\n鹿は、何も知らない顔。') : (w.outcome === 'dirty' || w.outcome === 'hit' || w.outcome === 'lost') ? (level.hints.caught ?? CAUGHT_HINT) : w.outcome === 'stolen' ? (level.hints.caught ?? STOLEN_DEFAULT) : w.outcome === 'water' ? (level.hints.water ?? WATER_HINT) : w.outcome === 'fall' ? level.hints.fall : w.outcome === 'wall' ? level.hints.wall : w.outcome === 'caught' ? (level.hints.caught ?? CAUGHT_HINT) : level.hints.poop;
    const primary = next ? `<button class="primary" data-action="${next.runner ? 'run' : 'next'}" data-level="${next.id}">次の面へ（${next.id}） <span>▶</span></button>` : `<button class="primary" data-action="retry">${clear ? 'もう一度あそぶ' : 'すぐに、もう一回'} <span>▶</span></button>`;
    const secondary = `<div class="secondary-row">${next ? '<button class="secondary" data-action="retry">もう一度あそぶ</button>' : ''}<button class="secondary" data-action="select">面選択へ</button></div>`;
    el('overlay').innerHTML = `<div class="screen modal-screen result-screen"><div class="modal-card"><span class="eyebrow">${clear ? newBest ? '自己ベスト更新！' : `${level.id} クリア` : `${attempts}回目の挑戦`}</span><img class="result-spru" src="/assets/${clear ? 'spru-clear' : 'spru-oops'}.png" alt="${clear ? '喜ぶSpra' : '困ったSpra'}"><h2>${title}</h2><p class="result-copy">${copy.replaceAll('\n', '<br>')}</p><div class="result-stats"><div><span>${clear ? 'クリアタイム' : 'ここまでの時間'}</span><strong>${w.time.toFixed(1)}<small>秒</small></strong></div><div><span>${clear ? stat[0] : 'ゴールへの進み具合'}</span><strong>${clear ? stat[1] : this.progress()}<small>${clear ? stat[2] : '%'}</small></strong></div></div>${primary}${secondary}${reward}</div></div>`;
    el('overlay').querySelector<HTMLButtonElement>('.primary')?.focus({ preventScroll: true }); this.hud();
  }
  private progress() {
    const { start } = this.level; return Math.min(100, Math.max(0, Math.round((start.y - this.world.furthest) / (start.y - GOAL.y - GOAL.radius) * 100))); }
  private hud() {
    const coins = this.world.coins.length > 0;
    el('coin-stat').hidden = !coins;
    if (coins) el('coin-count').textContent = `${this.world.silver}${this.world.gold ? ` 金${this.world.gold}` : ''}${this.world.premium ? ' ◆' : ''}`;
    const best = progress.get(this.level.id).best;
    el('timer').innerHTML = `${this.world.time.toFixed(1)}<small>秒</small>`;
    const sw = this.level.sweep;
    document.querySelector('.best-stat .stat-label')!.textContent = sw ? '見逃し' : '自己ベスト';
    el('best').textContent = sw ? `${this.world.missed} / ${sw.limit}` : best === null ? '—' : `${best.toFixed(1)}秒`;
    el('progress').style.width = `${this.progress()}%`;
    document.querySelector('.progress')!.setAttribute('aria-valuenow', String(this.progress()));
    const p = this.world.player, busy = p.jumpTime >= 0 || p.cooldown > 0;
    if (this.level.cross || this.level.rescue || this.level.sweep) { /* ボタンなし */ } else if (this.level.delivery) { const left = this.world.baitsLeft; el('jump').classList.toggle('busy', left === 0 || p.cooldown > 0); el('jump-hint').textContent = left === 0 ? 'もう、ない' : `のこり ${left}個`; } else { el('jump').classList.toggle('busy', busy); el('jump-hint').textContent = p.jumpTime >= 0 ? 'ジャンプ中' : busy ? 'ひと呼吸' : 'Space'; }
    if (this.level.senbei) { el('throw').classList.toggle('busy', this.world.held === 0); el('throw-hint').textContent = `${this.world.held}枚`; }
    const section = this.level.chapters.find(c => p.y > c.above)?.text ?? '';
    if (section !== this.lastChapter) { this.lastChapter = section; if (this.world.time >= this.messageUntil) this.message(section, 3); }
    if (this.world.time > this.messageUntil) el('message').textContent = '';
  }
  update(_now: number, delta: number) {
    if (!this.view) return;
    const dt = Math.min(delta / 1000, .1);
    if (this.mode === 'playing') {
      if (delta > 500) { this.pause(); return; }
      this.accumulator += dt;
      while (this.accumulator + 1e-9 >= RULES.step && this.mode === 'playing') {
        step(this.world, this.controls.sample()); this.accumulator -= RULES.step;
        for (const event of this.world.events) {
          this.view.event(event, this.visualTime); sound.play(event.kind);
          if (event.kind === 'warning') this.message('ミシッ…！ 足元が揺れてる！', 1.5);
          if (event.kind === 'collapse') this.message('そこ、床が抜けるの！？', 1.4);
        }
        if (this.world.outcome !== 'playing') {
          this.mode = 'dying'; this.lossAge = 0; this.controls.enable(false); this.world.player.moving = false;
        }
      }
      this.hud();
    }
    if (this.mode !== 'paused') {
      this.visualTime += dt;
      if (this.mode === 'dying') { this.lossAge += dt; if (this.lossAge > .9) this.finish(); }
      this.view.render(this.world, dt, this.visualTime, this.lossAge, this.mode !== 'title' && this.mode !== 'select');
    }
  }
}
/** ゲームを起動する。戻り値で止める。 */
export function start() {
  el('reload').addEventListener('click', () => window.location.reload());
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: VIEW.width, height: VIEW.height,
    backgroundColor: '#c3d397', antialias: true, audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 3 }, scene: [Boot, Park],
  });
  return () => game.destroy(true);
}
