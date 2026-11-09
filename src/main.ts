import Phaser from 'phaser';
import { VIEW, START, GOAL, RULES, chapter } from './game/stage.ts';
import { createWorld, step, type World, type Event } from './game/world.ts';
import { ParkView } from './view.ts';
import { Controls } from './input.ts';
import './styles.scss';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE = 'spru-deer-2:stage-1:v1';
type RecordData = { best: number | null; attempts: number; clears: number };
let record: RecordData = { best: null, attempts: 0, clears: 0 };
let canSave = true;
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && typeof saved === 'object') record = {
    best: Number.isFinite(saved.best) && saved.best > 0 ? saved.best : null,
    attempts: Number.isSafeInteger(saved.attempts) && saved.attempts >= 0 ? saved.attempts : 0,
    clears: Number.isSafeInteger(saved.clears) && saved.clears >= 0 ? saved.clears : 0,
  };
} catch { canSave = false; }
function save() { try { localStorage.setItem(STORE, JSON.stringify(record)); } catch { canSave = false; } }

class Sound {
  enabled = false;
  private context?: AudioContext;
  unlock() {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Sound is optional. */ }
  }
  play(kind: Event['kind']) {
    if (!this.enabled || this.context?.state !== 'running') return;
    const notes: Partial<Record<Event['kind'], [number, number, number]>> = { jump: [390, 730, .13], warning: [160, 110, .17], collapse: [110, 38, .28], poop: [180, 75, .22], fall: [390, 85, .4], clear: [540, 1080, .42] };
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
  sound.enabled = !sound.enabled; sound.unlock(); soundButton.textContent = sound.enabled ? '音 ON' : '音 OFF';
  soundButton.setAttribute('aria-pressed', String(sound.enabled)); soundButton.setAttribute('aria-label', sound.enabled ? '効果音をオフにする' : '効果音をオンにする');
});

class Boot extends Phaser.Scene {
  private failed = false;
  constructor() { super('Boot'); }
  preload() {
    for (const name of ['spru', 'spru-clear', 'spru-oops', 'deer']) this.load.image(name, `assets/${name}.png`);
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

class Park extends Phaser.Scene {
  world: World = createWorld();
  mode: 'title' | 'playing' | 'paused' | 'dying' | 'result' = 'title';
  private view!: ParkView;
  private controls!: Controls;
  private accumulator = 0;
  private visualTime = 0;
  private lossAge = 0;
  private messageUntil = 0;
  private lastChapter = '';
  constructor() { super('Park'); }
  create() {
    this.view = new ParkView(this);
    this.controls = new Controls(() => this.pause(), () => { if (this.mode !== 'title') this.begin(); });
    el('pause').addEventListener('click', () => this.pause());
    window.addEventListener('blur', () => { if (this.mode === 'playing') this.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'playing') this.pause(); });
    el('overlay').addEventListener('click', e => {
      const action = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
      if (action === 'begin' || action === 'retry') this.begin();
      if (action === 'resume') this.resume();
      if (action === 'title') this.title();
    });
    this.title();
    if (import.meta.env.DEV) Object.defineProperty(window, '__DEER2__', { configurable: true, get: () => JSON.parse(JSON.stringify({ mode: this.mode, ...this.world, record, canSave })) });
  }
  private title() {
    this.mode = 'title'; this.controls.enable(false); this.world = createWorld(); this.view.reset();
    el('hud').hidden = el('controls').hidden = true; el('message').textContent = '';
    el('overlay').innerHTML = `<div class="screen title-screen"><span class="eyebrow">奈良の、小さなしかけ話。</span><h2>Spruと鹿。</h2><p class="subtitle">足元には、ご用心。</p><div class="title-art"><img class="title-spru" src="assets/spru.png" alt="Spru"><img class="title-deer" src="assets/deer.png" alt="鹿"><span class="speech">こっち、空いてるよ。</span></div><div class="intro-card"><p>うんこをよけて、ゴールへ。<br>…その道、ほんとうに安全？</p><button class="primary" data-action="begin">第1ステージをはじめる <span>▶</span></button><div class="howto"><span>ドラッグ / 方向キーで移動</span><span>ジャンプボタン / Spaceで跳ぶ</span></div></div><p class="screen-foot">鹿に、悪気はありません。たぶん。</p></div>`;
  }
  private begin() {
    this.world = createWorld(); this.view.reset(); this.accumulator = 0; this.visualTime = 0; this.lossAge = 0;
    this.mode = 'playing'; this.controls.enable(true); record.attempts++; save(); sound.unlock();
    el('hud').hidden = el('controls').hidden = false; el('overlay').innerHTML = ''; this.lastChapter = '';
    this.message('うんこをよけて、上のゴールへ。', 4);
    el('game').focus({ preventScroll: true }); this.hud();
  }
  private message(text: string, duration = 2) { el('message').textContent = text; this.messageUntil = this.world.time + duration; }
  private pause() {
    if (this.mode === 'paused') { this.resume(); return; }
    if (this.mode !== 'playing') return;
    this.mode = 'paused'; this.controls.enable(false); this.accumulator = 0;
    el('overlay').innerHTML = `<div class="screen modal-screen"><div class="modal-card"><span class="eyebrow">ちょっと、ひと休み。</span><h2>鹿も、待っています。</h2><p>時間も、崩れかけの床も止まっています。</p><button class="primary" data-action="resume">つづきから</button><button class="secondary" data-action="retry">最初からやり直す</button></div></div>`;
  }
  private resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing'; this.controls.enable(true); this.accumulator = 0; el('overlay').innerHTML = ''; el('game').focus({ preventScroll: true });
  }
  private finish() {
    this.mode = 'result'; const w = this.world, clear = w.outcome === 'clear';
    const newBest = clear && (record.best === null || w.time < record.best);
    if (clear) { record.clears++; if (newBest) record.best = w.time; save(); }
    const title = clear ? '無事に、おさんぽ。' : w.outcome === 'fall' ? '地面まで、いたずら。' : 'あっ、足元…！';
    const copy = clear ? '足元のしかけも、見事に突破。\n鹿は、何も知らない顔。' : w.outcome === 'fall' ? 'うんこは避けたのに…！\nひびのある床は、横へ回ろう。\n跳ぶときは、着地点も見てね。' : '鹿の落としものを踏んじゃった。\n足元の影を目印に、\nすきまを通ってみよう。';
    el('overlay').innerHTML = `<div class="screen modal-screen result-screen"><div class="modal-card"><span class="eyebrow">${clear ? newBest ? '自己ベスト更新！' : '第1ステージ クリア' : `${record.attempts}回目の挑戦`}</span><img class="result-spru" src="assets/${clear ? 'spru-clear' : 'spru-oops'}.png" alt="${clear ? '喜ぶSpru' : '困ったSpru'}"><h2>${title}</h2><p class="result-copy">${copy.replaceAll('\n', '<br>')}</p><div class="result-stats"><div><span>${clear ? 'クリアタイム' : 'ここまでの時間'}</span><strong>${w.time.toFixed(1)}<small>秒</small></strong></div><div><span>${clear ? 'ジャンプ' : 'ゴールへの進み具合'}</span><strong>${clear ? w.jumps : this.progress()}<small>${clear ? '回' : '%'}</small></strong></div></div><button class="primary" data-action="retry">${clear ? 'もう一度あそぶ' : 'すぐに、もう一回'} <span>▶</span></button><button class="secondary" data-action="title">タイトルへ</button><p class="save-note">${clear ? canSave ? '自己ベストはこのブラウザに保存されます。' : 'この環境では記録を保存できません。' : 'Rキーでも再挑戦。しかけの場所は同じです。'}</p></div></div>`;
    el('overlay').querySelector<HTMLButtonElement>('.primary')?.focus({ preventScroll: true }); this.hud();
  }
  private progress() { return Math.min(100, Math.max(0, Math.round((START.y - this.world.furthest) / (START.y - GOAL.y - GOAL.radius) * 100))); }
  private hud() {
    el('timer').innerHTML = `${this.world.time.toFixed(1)}<small>秒</small>`;
    el('best').textContent = record.best === null ? '—' : `${record.best.toFixed(1)}秒`;
    el('progress').style.width = `${this.progress()}%`;
    document.querySelector('.progress')!.setAttribute('aria-valuenow', String(this.progress()));
    const p = this.world.player, busy = p.jumpTime >= 0 || p.cooldown > 0;
    el('jump').classList.toggle('busy', busy); el('jump-hint').textContent = p.jumpTime >= 0 ? 'ジャンプ中' : busy ? 'ひと呼吸' : 'Space';
    const section = chapter(p.y);
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
      this.view.render(this.world, dt, this.visualTime, this.lossAge, this.mode !== 'title');
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
