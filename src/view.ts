import Phaser from 'phaser';
import { GOAL, VIEW, type Point } from './game/stage.ts';
import type { LevelDefinition } from './game/levels.ts';
import { dropSpot, wallRect, type World, type Trap, type Event } from './game/world.ts';

import walk from './game/spru-walk.json';
import deerWalk from './game/deer-walk.json';
import type { Facing } from './game/facing.ts';

/** 歩行コマの表示倍率。斜めの「立ち」の高さがゲーム内で132pxになる大きさ。 */
const WALK_SCALE = 132 / walk.referenceHeight;
/** 足を1コマ進める歩幅（ゲーム座標のpx）。 */
const STRIDE_PER_FRAME = 34;
/** 歩く鹿の表示の高さ（ゲーム座標のpx）と、足を1コマ進める歩幅。 */
const DEER_HEIGHT = { stag: 150, doe: 132, fawn: 98 } as const;
const DEER_STRIDE = 30;
export const deerKey = (kind: keyof typeof deerWalk, side: 'r' | 'l', index: number) => `deer-${kind}-${side}-${index}`;
export const walkKey = (facing: Facing, index: number) => `walk-${facing}-${index}`;
/** 歩いていれば歩幅に応じたコマ、止まっていれば立ちのコマ。 */
function walkTexture(facing: Facing, stride: number, walking: boolean): string {
  const set = walk[facing];
  return walkKey(facing, walking ? set.cycle[Math.floor(stride / STRIDE_PER_FRAME) % set.cycle.length] : set.idle);
}

const FONT ='"Yu Gothic", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';
const C = { grass: 0xc3d397, grassDark: 0xa9bd7f, path: 0xece6bd, edge: 0xd8d6a5, green: 0x355942, leaf: 0x86a260, pale: 0xfbf7df, brown: 0x7e6142 };
type Particle = { shape: Phaser.GameObjects.Arc; vx: number; vy: number; born: number; duration: number; x: number; y: number };

export class ParkView {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Ellipse;
  private marker: Phaser.GameObjects.Graphics;
  private deerFx: Phaser.GameObjects.Graphics;
  private walkers = new Map<string, { image: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse }>();
  private dropped: Phaser.GameObjects.Graphics[] = [];
  private sliderShapes = new Map<string, Phaser.GameObjects.Graphics>();
  private wallShapes = new Map<string, Phaser.GameObjects.Graphics>();
  private rainGraphic?: Phaser.GameObjects.Graphics;
  private trapGraphics: Phaser.GameObjects.Graphics;
  private particles: Particle[] = [];
  private labels: { text: Phaser.GameObjects.Text; born: number; y: number }[] = [];
  private deer: { image: Phaser.GameObjects.Image; y: number; phase: number }[] = [];
  private level: LevelDefinition;
  private staticObjects: Phaser.GameObjects.GameObject[] = [];
  private cameraY: number;
  private playerHeight = 132;
  private playerWidth = 90;
  private goalGate: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, level: LevelDefinition) {
    this.scene = scene;
    this.level = level;
    this.cameraY = level.start.y - 800;
    this.drawLevel();
    this.trapGraphics = scene.add.graphics().setDepth(2);
    this.goalGate = scene.add.image(GOAL.x, GOAL.y + 62, 'gate-goal').setOrigin(.5, 1);
    this.goalGate.setDisplaySize(310, 310 * this.goalGate.frame.height / this.goalGate.frame.width);
    const { x, y } = level.start;
    this.shadow = scene.add.ellipse(x, y, 60, 20, 0x415535, .23).setDepth(10);
    this.marker = scene.add.graphics();
    this.deerFx = scene.add.graphics().setDepth(9);
    this.sprite = scene.add.image(x, y, 'spru').setOrigin(.5, 1);
    const frame = this.sprite.frame;
    this.playerWidth = this.playerHeight * frame.width / frame.height;
    this.sprite.setDisplaySize(this.playerWidth, this.playerHeight);
  }

  private label(x: number, y: number, value: string, size: number, color = '#355942') {
    return this.scene.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(.5);
  }

  private tree(g: Phaser.GameObjects.Graphics, x: number, y: number, scale = 1) {
    g.fillStyle(0x647f43, .15).fillEllipse(x + 8, y + 24, 100 * scale, 33 * scale);
    g.fillStyle(0x9b946a).fillRoundedRect(x - 7, y - 34, 14, 66, 6);
    g.fillStyle(0x8ca65f).fillCircle(x, y - 70, 51 * scale);
    g.fillStyle(0xa2ba73).fillCircle(x - 19 * scale, y - 87, 38 * scale);
    g.fillStyle(0xb4c88a).fillCircle(x + 19 * scale, y - 105, 27 * scale);
    g.lineStyle(2, 0x799851, .6).beginPath().moveTo(x - 19, y - 81).lineTo(x - 3, y - 91).lineTo(x + 11, y - 84).strokePath();
  }

  /** 面を切り替える。公園・うんこ・鹿の飾りを描き直す。 */
  setLevel(level: LevelDefinition) {
    if (level === this.level) { this.reset(); return; }
    this.level = level;
    for (const o of this.staticObjects) o.destroy();
    this.staticObjects = []; this.deer = [];
    this.drawLevel();
    this.reset();
  }

  private drawLevel() {
    const known = new Set(this.scene.children.list);
    this.drawPark();
    this.staticObjects = this.scene.children.list.filter(o => !known.has(o));
  }

  private poopShape(poop: Point) {
    const g = this.scene.add.graphics().setDepth(poop.y).setPosition(poop.x, poop.y);
    g.fillStyle(0x665b3c, .15).fillEllipse(1, 9, 51, 21);
    for (const [dx, dy, r] of [[-11, 1, 10], [7, 4, 10], [0, -10, 9], [15, -8, 8]]) {
      g.fillStyle(0x78553b).fillCircle(dx, dy, r);
      g.fillStyle(0xaa8460).fillEllipse(dx - 2, dy - 3, r * .85, r * .45);
    }
    return g;
  }

  private drawPark() {
    const s = this.scene, start0 = this.level.start, ground = s.add.graphics().setDepth(0);
    ground.fillStyle(C.grass).fillRect(0, 0, VIEW.width, 4100);
    ground.fillStyle(C.grassDark, .28);
    for (let i = 0; i < 28; i++) ground.fillEllipse((i * 263) % 720, i * 157, 240 + (i % 3) * 100, 180);
    ground.fillStyle(C.edge).fillRoundedRect(82, 160, 556, 3780, 100);
    ground.fillStyle(C.path).fillRoundedRect(98, 175, 524, 3750, 90);
    // Fine deterministic grains and leaves give the long path a continuous surface.
    for (let i = 0; i < 1150; i++) {
      const x = 110 + (i * 137) % 502, y = 200 + (i * 367) % 3680;
      ground.fillStyle(i % 3 ? 0xc7bd8f : 0xffffff, i % 3 ? .27 : .35).fillCircle(x, y, i % 4 ? 1.3 : 2.2);
    }
    for (let y = 180; y < 3980; y += 72) {
      ground.fillStyle(0xf2efd2, .75).fillRoundedRect(87, y, 16, 38, 6).fillRoundedRect(618, y + 22, 16, 38, 6);
      ground.fillStyle(0x8ca764, .5).fillEllipse(66, y + 9, 33, 13).fillEllipse(660, y + 38, 36, 14);
    }
    for (let y = 220; y < 3970; y += 220) {
      const plants = s.add.graphics().setDepth(y + 20);
      this.tree(plants, 30 + (y % 3) * 5, y, .9);
      this.tree(plants, 693, y + 90, 1.05);
      for (let i = 0; i < 5; i++) {
        const side = i % 2 ? 654 : 71, cy = y + 35 + i * 17;
        ground.lineStyle(2, 0x8b9f62).lineBetween(side, cy, side + 3, cy - 12);
        ground.fillStyle(i % 3 ? 0xfaf2d0 : 0xe6bba4).fillCircle(side + 3, cy - 14, 4);
      }
    }
    // The deer watch from the verge; they do not obstruct the safe detours.
    // 道ばたの飾りの鹿。動く鹿（歩く鹿・追いかける鹿）がいる面では、紛らわしいので出さない。
    const decorations: number[][] = this.level.deers.length || this.level.chasers.length ? [] : [[53, 3190, 0], [671, 2680, 1], [53, 1840, 0], [674, 930, 1]];
    for (const [x, y, flip] of decorations) {
      s.add.ellipse(x, y, 83, 24, 0x54713b, .15).setDepth(y - 1);
      const image = s.add.image(x, y, 'deer').setOrigin(.5, 1).setDepth(y).setFlipX(!!flip);
      image.setDisplaySize(128 * image.frame.width / image.frame.height, 128);
      this.deer.push({ image, y, phase: y / 150 });
    }
    for (const poop of this.level.poops) this.poopShape(poop);
    // スタートゲート。Spruはアーチの下に立つ（ゲートは、Spruより奥に描く）。
    const gate = s.add.image(start0.x, start0.y + 26, 'gate-start').setOrigin(.5, 1).setDepth(start0.y - 5);
    gate.setDisplaySize(380, 380 * gate.frame.height / gate.frame.width);
    this.label(start0.x, start0.y + 80, '奈良さんぽ、出発。', 26, '#839467').setDepth(1);
    // A small rest garden is visible beyond the actual goal, not a fake finish.
    ground.fillStyle(0xd4dcb0).fillEllipse(360, 305, 450, 210);
    ground.lineStyle(3, 0xc0c992).strokeEllipse(360, 305, 450, 210);
    ground.fillStyle(0xf6edb9).fillEllipse(GOAL.x, GOAL.y, 143, 60);
    ground.lineStyle(3, 0xc0a260).strokeEllipse(GOAL.x, GOAL.y, 143, 60);
    this.label(360, 160, 'おつかれさま、の旗', 27, '#6e8250').setDepth(1);
    const fence = s.add.graphics().setDepth(1);
    fence.lineStyle(6, 0x9da773).lineBetween(150, 205, 570, 205);
    for (let x = 150; x <= 570; x += 35) fence.lineStyle(7, 0xa9b27e).lineBetween(x, 190, x, 226);
    const sign = s.add.graphics().setDepth(start0.y - 50);
    sign.fillStyle(0x9a8964).fillRoundedRect(572, start0.y - 80, 9, 70, 3);
    sign.fillStyle(0xf6edcf).fillRoundedRect(529, start0.y - 130, 96, 56, 9);
    this.label(576, start0.y - 102, '公園入口', 17, '#758258').setDepth(start0.y - 49);
  }

  private drawTrap(t: Trap, now: number) {
    const g = this.trapGraphics, { x, y, width: w, height: h } = t;
    // 予兆なしの床は、穴になるまで普通の道に見える。
    if (t.silent && t.state !== 'open') return;
    if (t.state === 'open') {
      g.fillStyle(0xb5a77c, .8).fillRoundedRect(x - 8, y - 4, w + 16, h + 16, 16);
      const outline = [
        { x, y: y + 10 }, { x: x + 22, y: y + 2 }, { x: x + w * .46, y }, { x: x + w * .65, y: y + 9 },
        { x: x + w - 10, y: y + 1 }, { x: x + w, y: y + h * .4 }, { x: x + w - 8, y: y + h - 9 },
        { x: x + w * .75, y: y + h }, { x: x + w * .42, y: y + h - 6 }, { x: x + 12, y: y + h }, { x: x - 3, y: y + h * .6 },
      ];
      g.fillStyle(0x655b47).fillPoints(outline, true);
      g.fillStyle(0x343e32).fillRoundedRect(x + 10, y + 20, w - 20, h - 30, 17);
      g.fillStyle(0x24372e).fillEllipse(x + w / 2, y + h * .68, w - 22, h * .4);
      g.lineStyle(4, 0xded5a8).beginPath().moveTo(x + 15, y + h - 4).lineTo(x + w * .38, y + h - 9).lineTo(x + w * .5, y + h - 6).strokePath();
      return;
    }
    const shaking = t.state === 'shaking';
    const shift = shaking ? Math.sin(now * 65) * 3 : 0;
    g.fillStyle(shaking ? 0xdfd2a3 : 0xe6dfb4, shaking ? 1 : .65).fillRoundedRect(x + shift, y, w, h, 12);
    if (shaking) {
      const progress = Math.min(1, t.elapsed / t.warning);
      g.lineStyle(3, 0xc09659, .8).strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 14);
      g.fillStyle(0xac7846, .45).fillRoundedRect(x, y + h + 10, w * progress, 5, 2);
    }
    const cx = x + w * .55 + shift, cy = y + h * .5;
    g.lineStyle(shaking ? 3.5 : 2, shaking ? 0x907044 : 0xb8ad7e, shaking ? .95 : .65);
    g.beginPath().moveTo(cx - 25, cy - 29).lineTo(cx - 7, cy - 10).lineTo(cx - 17, cy + 3).lineTo(cx + 7, cy + 16).lineTo(cx + 13, cy + 32).strokePath();
    g.beginPath().moveTo(cx - 7, cy - 10).lineTo(cx + 16, cy - 17).lineTo(cx + 27, cy - 9).strokePath();
    if (shaking) g.beginPath().moveTo(cx - 17, cy + 3).lineTo(x + 16, y + h - 16).moveTo(cx + 13, cy + 32).lineTo(x + w - 15, y + h - 10).strokePath();
  }

  event(e: Event, now: number) {
    if (e.kind === 'dropWarning') {
      const text = this.label(e.x, e.y - 120, 'もじもじ…', 26, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (e.kind === 'drop') this.dropped.push(this.poopShape(e));
    if (e.kind === 'wall') this.scene.cameras.main.shake(140, .005);
    if (e.kind === 'crush') this.scene.cameras.main.shake(220, .01);
    if (e.kind === 'warning' || e.kind === 'collapse') {
      const text = this.label(e.x, e.y - 32, e.kind === 'warning' ? 'ミシッ…' : 'えっ！？', e.kind === 'warning' ? 29 : 35, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (['collapse', 'land', 'poop', 'clear', 'drop'].includes(e.kind)) {
      const count = e.kind === 'clear' ? 34 : e.kind === 'collapse' ? 16 : 7;
      for (let i = 0; i < count; i++) {
        const a = i * 2.4, radius = e.kind === 'collapse' ? 65 : 20;
        const x = e.x + Math.cos(a) * radius, y = e.y + Math.sin(a) * radius * .6;
        const color = e.kind === 'clear' ? [0xe7bb65, 0x99b568, 0xf4edd0][i % 3] : e.kind === 'poop' ? 0x987346 : 0xcfbd8b;
        const shape = this.scene.add.circle(x, y, 3 + i % 5, color, .85).setDepth(9000);
        this.particles.push({ shape, born: now, duration: e.kind === 'clear' ? 1.7 : .6, x, y, vx: Math.cos(a) * (40 + i * 3), vy: -55 - (i % 5) * 12 });
      }
    }
  }

  reset() {
    this.cameraY = this.level.start.y - 800;
    for (const p of this.particles) p.shape.destroy();
    for (const l of this.labels) l.text.destroy();
    this.particles = []; this.labels = [];
    for (const g of this.dropped) g.destroy();
    for (const g of this.sliderShapes.values()) g.destroy();
    this.sliderShapes.clear(); this.rainGraphic?.clear();
    for (const g of this.wallShapes.values()) g.destroy();
    this.wallShapes.clear();
    for (const k of this.walkers.values()) { k.image.destroy(); k.shadow.destroy(); }
    this.dropped = []; this.walkers.clear();
    this.sprite.setTexture('spru').setAlpha(1).setAngle(0);
  }

  /** 横から出てくる壁と、ジャンプで動き出すうんこ。 */
  private renderWallsAndSliders(w: World) {
    for (const s of w.sliders) {
      let shape = this.sliderShapes.get(s.id);
      if (!shape) { shape = this.poopShape({ x: s.cx, y: s.cy }); this.sliderShapes.set(s.id, shape); }
      shape.setPosition(s.cx, s.cy).setDepth(s.cy);
    }
    for (const wall of w.walls) {
      // 壁ごとに描き、Spruと同じく y で前後を決める（跳び越えるとき、壁の裏に隠れないように）。
      let g = this.wallShapes.get(wall.id);
      if (!g) { g = this.scene.add.graphics(); this.wallShapes.set(wall.id, g); }
      g.clear().setDepth(wall.y + 40);
      if (wall.progress <= 0) continue;
      const r = wallRect(wall);
      g.fillStyle(0x4d3a28, .25).fillRoundedRect(r.x + 6, r.y + 12, r.w, r.h, 18);
      g.fillStyle(0x8a6a45).fillRoundedRect(r.x, r.y, r.w, r.h, 18);
      g.fillStyle(0xa98258).fillRoundedRect(r.x, r.y, r.w, r.h * .35, 18);
      g.lineStyle(3, 0x6b4f32, .7);
      for (let x = r.x + 70; x < r.x + r.w - 20; x += 90) g.lineBetween(x, r.y + 8, x, r.y + r.h - 8);
      g.lineStyle(4, 0x5e4429).strokeRoundedRect(r.x, r.y, r.w, r.h, 18);
    }
  }

  /** 歩く鹿。歩いた距離でコマを進め、予告中はその場で足踏みし、落とす場所に輪を出す。 */
  private renderDeers(w: World) {
    this.deerFx.clear(); this.rainGraphic?.clear();
    const place = (id: string, kind: keyof typeof DEER_HEIGHT, x: number, y: number, dir: 1 | -1, moving: boolean, walked: number, wobble = 0) => {
      let walker = this.walkers.get(id);
      if (!walker) {
        walker = { image: this.scene.add.image(x, y, deerKey(kind, 'r', 0)).setOrigin(.5, 1), shadow: this.scene.add.ellipse(x, y, 90, 24, 0x54713b, .2) };
        this.walkers.set(id, walker);
      }
      const side = dir > 0 ? 'r' : 'l', set = deerWalk[kind][side];
      const index = moving ? Math.floor(walked / DEER_STRIDE) % set.frames.length : 1;
      walker.image.setTexture(deerKey(kind, side, index));
      const scale = DEER_HEIGHT[kind] / set.refHeight, frame = walker.image.frame;
      walker.image.setDisplaySize(frame.width * scale, frame.height * scale).setPosition(x + wobble, y + 6).setDepth(y + 10);
      walker.shadow.setPosition(x, y + 2).setDepth(y);
    };
    for (const d of w.deers) {
      place(d.id, d.kind, d.x, d.y, d.dir, d.state === 'walk', d.walked, d.state === 'warn' ? Math.sin(d.timer * 60) * 2 : 0);
      if (d.state === 'warn') {
        // 落とす場所の予告。輪が少しずつ濃くなる。
        const def = w.level.deers.find(x => x.id === d.id)!, spot = dropSpot(d), t = Math.min(1, d.timer / def.warning);
        this.deerFx.lineStyle(4, 0x8a5a36, .35 + t * .5).strokeEllipse(spot.x, spot.y + 4, 62, 30);
        this.deerFx.fillStyle(0x8a5a36, .1 + t * .2).fillEllipse(spot.x, spot.y + 4, 62, 30);
      }
    }
    // 追いかけてくる鹿
    for (const c of w.chasers) place(c.id, c.kind, c.x, c.y, c.dir, c.state === 'chase', c.walked);
    // 降ってくるうんこ: 影が濃くなり、うんこが落ちてくる
    for (const r of w.rain) {
      if (r.state !== 'warn') continue;
      const def = w.level.rain.find(x => x.id === r.id)!, t = Math.min(1, r.timer / def.warn);
      this.deerFx.fillStyle(0x3d3a24, .12 + t * .3).fillEllipse(r.tx, r.ty + 6, 30 + t * 36, 14 + t * 16);
      const fall = (1 - t) * (1 - t) * 720;
      const g = this.rainGraphic ?? (this.rainGraphic = this.scene.add.graphics().setDepth(9500));
      g.fillStyle(0x78553b).fillCircle(r.tx, r.ty - fall - 14, 15).fillStyle(0xaa8460).fillEllipse(r.tx - 3, r.ty - fall - 19, 14, 8);
    }
  }

  render(w: World, dt: number, now: number, lossAge: number, showPlayer = true) {
    const p = w.player;
    // Leave room above the park so the finish flag stays below the fixed HUD.
    const target = Phaser.Math.Clamp(p.y - 800, -240, 2820);
    this.cameraY = Phaser.Math.Linear(this.cameraY, target, 1 - Math.exp(-dt * 12));
    this.scene.cameras.main.setScroll(0, this.cameraY);
    this.trapGraphics.clear();
    for (const trap of w.traps) this.drawTrap(trap, now);
    const falling = w.outcome === 'fall';
    const factor = falling ? Math.max(.02, 1 - lossAge * 1.5) : 1;
    // 歩き・ジャンプ・落下は6方向の歩行コマ、クリアと失敗は専用の1枚絵。
    const walking = w.outcome === 'playing' || w.outcome === 'fall';
    this.sprite.setTexture(walking ? walkTexture(p.facing, p.stride, p.moving && p.jumpTime < 0) : w.outcome === 'clear' ? 'spru-clear' : 'spru-oops');
    const frame = this.sprite.frame;
    const [baseWidth, baseHeight] = walking ? [frame.width * WALK_SCALE, frame.height * WALK_SCALE] : [this.playerHeight * frame.width / frame.height, this.playerHeight];
    this.sprite.setDisplaySize(baseWidth * factor, baseHeight * factor);
    this.sprite.setPosition(p.x, p.y + 5 - p.height + (falling ? lossAge * 30 : 0));
    this.sprite.setDepth(p.y + 60 + p.height).setFlipX(false).setAlpha(falling ? Math.max(0, 1 - lossAge * 1.35) : 1);
    this.sprite.setAngle(falling ? lossAge * 105 : 0);
    this.renderDeers(w);
    this.renderWallsAndSliders(w);
    this.sprite.setVisible(showPlayer);
    this.shadow.setVisible(showPlayer);
    this.shadow.setPosition(p.x, p.y).setDepth(p.y - 1).setAlpha(falling ? 0 : .22 - p.height * .0013).setScale(1 - p.height / 260);
    this.marker.clear();
    if (p.jumpTime >= 0) {
      this.marker.lineStyle(2, 0x64764d, .6).strokeEllipse(p.x, p.y, 38, 14).setDepth(p.y - 2);
    }
    for (const d of this.deer) d.image.y = d.y + Math.sin(now * 2 + d.phase) * 2;
    for (const particle of this.particles) {
      const age = now - particle.born;
      particle.shape.setPosition(particle.x + particle.vx * age, particle.y + particle.vy * age + 100 * age * age);
      particle.shape.setAlpha(Math.max(0, 1 - age / particle.duration));
      if (age > particle.duration) particle.shape.destroy();
    }
    this.particles = this.particles.filter(particle => now - particle.born <= particle.duration);
    for (const l of this.labels) {
      const age = now - l.born; l.text.setY(l.y - age * 20).setAlpha(Math.max(0, 1 - age / 1.2));
      if (age > 1.2) l.text.destroy();
    }
    this.labels = this.labels.filter(l => now - l.born <= 1.2);
    // 旗はゴールの位置について行く（動くゴールがあるため）。基準は、中央ゴール (360,300) のときの形。
    // ゴールゲートはゴールの位置について行く（動くゴールがあるため）。Spruはゲートの手前を通ってクリアする。
    this.goalGate.setPosition(w.goal.x, w.goal.y + 62).setDepth(w.goal.y - 20);
  }
}
