import Phaser from 'phaser';
import { VIEW, GOAL, RULES } from './game/stage.ts';
import { PLAYABLE, STAGES, levelById, type LevelDefinition } from './game/levels.ts';
import { createWorld, step, type World, type Event } from './game/world.ts';
import { Progress } from './progress.ts';
import { ParkView, walkKey, deerKey } from './view.ts';
import deerWalk from './game/deer-walk.json';
import walk from './game/spru-walk.json';
import type { Facing } from './game/facing.ts';
import { Controls } from './input.ts';
import './styles.scss';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const progress = new Progress();
const CAUGHT_HINT = '鹿が追いかけてきた…！\n止まると追いつかれる。\nジャンプで鹿を越えるのもアリ。';

type Track = 'home' | 'play' | 'clear' | 'fail';
class Sound {
  enabled = false;
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
        audio = new Audio(`assets/audio/${target}.mp3`);
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
    const notes: Partial<Record<Event['kind'], [number, number, number]>> = { jump: [390, 730, .13], warning: [160, 110, .17], collapse: [110, 38, .28], poop: [180, 75, .22], fall: [390, 85, .4], clear: [540, 1080, .42], wall: [120, 45, .3], slide: [320, 190, .12], crush: [150, 40, .35], chase: [200, 330, .2], caught: [260, 90, .3], drop: [240, 120, .14] };
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
soundButton.id = 'sound'; soundButton.textContent = '音 OFF'; soundButton.setAttribute('aria-label', '効果音をオンにする'); soundButton.setAttribute('aria-pressed', 'false');
el('game-wrap').append(soundButton);
soundButton.addEventListener('click', () => {
  sound.enabled = !sound.enabled; sound.unlock(); sound.syncMusic(); soundButton.textContent = sound.enabled ? '音 ON' : '音 OFF';
  soundButton.setAttribute('aria-pressed', String(sound.enabled)); soundButton.setAttribute('aria-label', sound.enabled ? '効果音をオフにする' : '効果音をオンにする');
});

class Boot extends Phaser.Scene {
  private failed = false;
  constructor() { super('Boot'); }
  preload() {
    for (const name of ['spru', 'spru-clear', 'spru-oops', 'deer']) this.load.image(name, `assets/${name}.png`);
    for (const name of ['start', 'goal']) this.load.image(`gate-${name}`, `assets/gate/${name}.png`);
    for (const facing of Object.keys(walk).filter(k => k !== 'referenceHeight') as Facing[]) walk[facing].frames.forEach((f, i) => this.load.image(walkKey(facing, i), `assets/spru-walk/${f.file}`));
    for (const kind of Object.keys(deerWalk) as (keyof typeof deerWalk)[]) for (const side of ['r', 'l'] as const) deerWalk[kind][side].frames.forEach((f, i) => this.load.image(deerKey(kind, side, i), `assets/deer-walk/${f.file}`));
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
    this.controls = new Controls(() => this.pause(), () => { if (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'dying' || this.mode === 'result') this.begin(this.level); });
    el('pause').addEventListener('click', () => this.pause());
    window.addEventListener('blur', () => { if (this.mode === 'playing') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'playing') this.pause(); });
    el('overlay').addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      const action = button?.dataset.action, target = levelById(button?.dataset.level ?? '');
      if (action === 'select') this.select();
      if ((action === 'start' || action === 'next') && target && progress.isUnlocked(target.id)) this.begin(target);
      if (action === 'retry') this.begin(this.level);
      if (action === 'resume') this.resume();
      if (action === 'title') this.title();
    });
    this.title();
    if (import.meta.env.DEV) Object.defineProperty(window, '__DEER__', { configurable: true, get: () => JSON.parse(JSON.stringify({ mode: this.mode, ...this.world, record: progress.get(this.level.id), canSave: progress.canSave })) });
  }
  private idle(mode: 'title' | 'select') {
    this.mode = mode; this.controls.enable(false); this.world = createWorld(this.level); this.view.reset(); sound.music('home');
    el('hud').hidden = el('controls').hidden = true; el('message').textContent = '';
  }
  private title() {
    this.idle('title');
    // 構成は tane.spra.jp に合わせる（空→丘、キャラ3体、極太の丸ゴシックのロゴ、丘の上の大きなボタン）。
    el('overlay').innerHTML = `<div class="screen title-screen"><div class="title-head"><p class="brand-line"><b>S</b>spra</p><h2 class="wordmark" aria-label="Spruと鹿。"><span class="w-spru">Spru</span><span class="w-to">と</span><span class="w-deer">鹿</span><span class="w-dot">。</span></h2><p class="subtitle">足元には、ご用心。</p></div><div class="hero"><img class="hero-fawn" src="assets/hero/fawn.png" alt="子鹿"><img class="hero-spru" src="assets/hero/spru.png" alt="Spru"><img class="hero-stag" src="assets/hero/stag.png" alt="雄鹿"><span class="speech">こっち、空いてるよ。</span></div><div class="hill"><button class="play" data-action="select">あそぶ</button><p class="howto">ドラッグで移動、ボタンでジャンプ。<br>鹿に、悪気はありません。たぶん。</p></div></div>`;
  }
  private select() {
    this.idle('select');
    const groups = STAGES.map(group => {
      const cleared = progress.clearedCount(group.stage), total = group.slots.filter(s => s.level).length;
      const head = `<header><span class="eyebrow">STAGE ${group.stage}</span><h3>${group.title}</h3>${total ? `<span class="count">${cleared} / ${group.slots.length}</span>` : ''}</header>`;
      if (!group.slots.length) return `<section class="stage-group">${head}<p class="soon-note">準備中です。</p></section>`;
      const cards = group.slots.map(slot => {
        if (!slot.level) return `<div class="level-card soon"><b>${slot.id}</b><span class="lv-name">${slot.title}<small>準備中</small></span></div>`;
        const record = progress.get(slot.id), open = progress.isUnlocked(slot.id);
        const status = !open ? 'ロック中' : record.best !== null ? `ベスト ${record.best.toFixed(1)}秒` : '未クリア';
        return `<button class="level-card${record.clears ? ' done' : ''}" data-action="start" data-level="${slot.id}"${open ? '' : ' disabled'}><b>${slot.id}</b><span class="lv-name">${slot.title}<small>${slot.summary}</small></span><span class="lv-best">${status}</span></button>`;
      }).join('');
      return `<section class="stage-group">${head}<div class="levels">${cards}</div></section>`;
    }).join('');
    el('overlay').innerHTML = `<div class="screen select-screen"><div class="select-head"><button class="secondary" data-action="title">タイトルへ</button><h2>面をえらぶ</h2></div>${groups}</div>`;
  }
  private begin(level: LevelDefinition) {
    this.level = level; this.view.setLevel(level);
    this.world = createWorld(level); this.view.reset(); this.accumulator = 0; this.visualTime = 0; this.lossAge = 0;
    this.mode = 'playing'; this.controls.enable(true); progress.attempt(level.id); sound.unlock(); sound.music('play');
    el('hud-level').textContent = `面 ${level.id}`; el('hud-title').textContent = level.title;
    el('hud').hidden = el('controls').hidden = false; el('overlay').innerHTML = ''; this.lastChapter = '';
    this.message(level.intro, 4);
    el('game').focus({ preventScroll: true }); this.hud();
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
    sound.music(clear ? 'clear' : 'fail');
    const index = PLAYABLE.indexOf(level), next = clear ? PLAYABLE[index + 1] : undefined;
    const attempts = progress.get(level.id).attempts;
    const title = clear ? '無事に、おさんぽ。' : w.outcome === 'fall' ? '地面まで、いたずら。' : w.outcome === 'wall' ? 'ぐえっ、壁…！' : w.outcome === 'caught' ? 'つかまった！' : 'あっ、足元…！';
    const copy = clear ? '数々のしかけを、見事に突破。\n鹿は、何も知らない顔。' : w.outcome === 'fall' ? level.hints.fall : w.outcome === 'wall' ? level.hints.wall : w.outcome === 'caught' ? (level.hints.caught ?? CAUGHT_HINT) : level.hints.poop;
    const primary = next ? `<button class="primary" data-action="next" data-level="${next.id}">次の面へ（${next.id}） <span>▶</span></button>` : `<button class="primary" data-action="retry">${clear ? 'もう一度あそぶ' : 'すぐに、もう一回'} <span>▶</span></button>`;
    const secondary = `<div class="secondary-row">${next ? '<button class="secondary" data-action="retry">もう一度あそぶ</button>' : ''}<button class="secondary" data-action="select">面選択へ</button></div>`;
    el('overlay').innerHTML = `<div class="screen modal-screen result-screen"><div class="modal-card"><span class="eyebrow">${clear ? newBest ? '自己ベスト更新！' : `${level.id} クリア` : `${attempts}回目の挑戦`}</span><img class="result-spru" src="assets/${clear ? 'spru-clear' : 'spru-oops'}.png" alt="${clear ? '喜ぶSpru' : '困ったSpru'}"><h2>${title}</h2><p class="result-copy">${copy.replaceAll('\n', '<br>')}</p><div class="result-stats"><div><span>${clear ? 'クリアタイム' : 'ここまでの時間'}</span><strong>${w.time.toFixed(1)}<small>秒</small></strong></div><div><span>${clear ? 'ジャンプ' : 'ゴールへの進み具合'}</span><strong>${clear ? w.jumps : this.progress()}<small>${clear ? '回' : '%'}</small></strong></div></div>${primary}${secondary}<p class="save-note">${clear ? progress.canSave ? '自己ベストはこのブラウザに保存されます。' : 'この環境では記録を保存できません。' : 'Rキーでも再挑戦。しかけの場所は同じです。'}</p></div></div>`;
    el('overlay').querySelector<HTMLButtonElement>('.primary')?.focus({ preventScroll: true }); this.hud();
  }
  private progress() { const { start } = this.level; return Math.min(100, Math.max(0, Math.round((start.y - this.world.furthest) / (start.y - GOAL.y - GOAL.radius) * 100))); }
  private hud() {
    const best = progress.get(this.level.id).best;
    el('timer').innerHTML = `${this.world.time.toFixed(1)}<small>秒</small>`;
    el('best').textContent = best === null ? '—' : `${best.toFixed(1)}秒`;
    el('progress').style.width = `${this.progress()}%`;
    document.querySelector('.progress')!.setAttribute('aria-valuenow', String(this.progress()));
    const p = this.world.player, busy = p.jumpTime >= 0 || p.cooldown > 0;
    el('jump').classList.toggle('busy', busy); el('jump-hint').textContent = p.jumpTime >= 0 ? 'ジャンプ中' : busy ? 'ひと呼吸' : 'Space';
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
el('reload').addEventListener('click', () => window.location.reload());
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: VIEW.width, height: VIEW.height,
  backgroundColor: '#c3d397', antialias: true, audio: { noAudio: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 }, scene: [Boot, Park],
});
