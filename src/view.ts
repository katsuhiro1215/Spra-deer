import * as Phaser from 'phaser';
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
  private flowerList: { x: number; y: number; born: number; color: number }[] = [];
  private visualTime = 0;
  private walkers = new Map<string, { image: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Ellipse }>();
  /** 人力車(鹿が引く)。台ごとの絵 */
  private carts = new Map<string, Phaser.GameObjects.Graphics>();
  /** 夜の暗さ(灯りのまわりを消して、見える所をつくる) */
  private dark?: Phaser.GameObjects.RenderTexture;
  private lightBrush?: Phaser.GameObjects.Image;
  private dropped: Phaser.GameObjects.Graphics[] = [];
  private sliderShapes = new Map<string, Phaser.GameObjects.Graphics>();
  private wallShapes = new Map<string, Phaser.GameObjects.Graphics>();
  private rainGraphic?: Phaser.GameObjects.Graphics;
  private trapGraphics: Phaser.GameObjects.Graphics;
  /** 飛び石・はすの葉・コイン(毎フレーム描き直す) */
  private terrainFx!: Phaser.GameObjects.Graphics;
  private coinFx!: Phaser.GameObjects.Graphics;
  /** 頭の上に出すもの(持っているせんべい・「！」・飛んでいるせんべい) */
  private overFx!: Phaser.GameObjects.Graphics;
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
    this.terrainFx = scene.add.graphics().setDepth(3);
    this.coinFx = scene.add.graphics().setDepth(8500);
    this.overFx = scene.add.graphics().setDepth(8600);
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
    const decorations: number[][] = this.level.deers.length || this.level.chasers.length || this.level.hungry?.length || this.level.delivery || this.level.cross || this.level.rescue ? [] : [[53, 3190, 0], [671, 2680, 1], [53, 1840, 0], [674, 930, 1]];
    for (const [x, y, flip] of decorations) {
      s.add.ellipse(x, y, 83, 24, 0x54713b, .15).setDepth(y - 1);
      const image = s.add.image(x, y, 'deer').setOrigin(.5, 1).setDepth(y).setFlipX(!!flip);
      image.setDisplaySize(128 * image.frame.width / image.frame.height, 128);
      this.deer.push({ image, y, phase: y / 150 });
    }
    for (const poop of this.level.poops) this.poopShape(poop);
    if (this.level.cross) {
      for (const y of new Set(this.level.cross.crossers.map(c => c.y))) {
        ground.fillStyle(0xc9b484, .5).fillRoundedRect(100, y - 46, 520, 92, 14);
        ground.lineStyle(4, 0xf3ecc8, .55);
        for (let x = 120; x < 600; x += 56) ground.lineBetween(x, y, x + 28, y);
      }
    }
    // スタートゲート。Spraはアーチの下に立つ（ゲートは、Spraより奥に描く）。
    const gate = s.add.image(start0.x, start0.y + 26, 'gate-start').setOrigin(.5, 1).setDepth(start0.y - 5);
    gate.setDisplaySize(380, 380 * gate.frame.height / gate.frame.width);
    this.label(start0.x, start0.y + 80, '奈良さんぽ、出発。', 26, '#839467').setDepth(1);
    // A small rest garden is visible beyond the actual goal, not a fake finish.
    ground.fillStyle(0xd4dcb0).fillEllipse(360, 305, 450, 210);
    ground.lineStyle(3, 0xc0c992).strokeEllipse(360, 305, 450, 210);
    ground.fillStyle(0xf6edb9).fillEllipse(GOAL.x, GOAL.y, 143, 60);
    ground.lineStyle(3, 0xc0a260).strokeEllipse(GOAL.x, GOAL.y, 143, 60);
    this.label(360, 160, this.level.delivery ? 'お届け先は、この先' : 'おつかれさま、の旗', 27, '#6e8250').setDepth(1);
    const fence = s.add.graphics().setDepth(1);
    fence.lineStyle(6, 0x9da773).lineBetween(150, 205, 570, 205);
    for (let x = 150; x <= 570; x += 35) fence.lineStyle(7, 0xa9b27e).lineBetween(x, 190, x, 226);
    const sign = s.add.graphics().setDepth(start0.y - 50);
    sign.fillStyle(0x9a8964).fillRoundedRect(572, start0.y - 80, 9, 70, 3);
    sign.fillStyle(0xf6edcf).fillRoundedRect(529, start0.y - 130, 96, 56, 9);
    this.label(576, start0.y - 102, '公園入口', 17, '#758258').setDepth(start0.y - 49);
    this.drawTerrain();
  }

  /** 池(道の上に描く)と、通れない植え込み・灯籠の列・岩。横切る列の道と、夜の灯籠。 */
  private drawTerrain() {
    const s = this.scene;
    for (const y of new Set((this.level.lines ?? []).map(l => l.y))) {
      const g = s.add.graphics().setDepth(1);
      g.fillStyle(0xbfa77a, .55).fillRect(60, y - 44, 600, 88);
      g.lineStyle(3, 0x8f7a52, .5).lineBetween(60, y - 44, 660, y - 44).lineBetween(60, y + 44, 660, y + 44);
      g.fillStyle(0xd8c79c, .6);
      for (let x = 80; x < 640; x += 46) g.fillRoundedRect(x, y - 30 + ((x / 46) % 2) * 22, 30, 16, 5);
    }
    for (const l of this.level.night?.lights ?? []) {
      const g = s.add.graphics().setDepth(l.y);
      g.fillStyle(0x3d4a30, .25).fillEllipse(l.x, l.y + 4, 46, 16);
      g.fillStyle(0x9d977f).fillRect(l.x - 5, l.y - 40, 10, 42).fillRoundedRect(l.x - 16, l.y - 6, 32, 10, 3);
      g.fillStyle(0xb3ab94).fillRoundedRect(l.x - 14, l.y - 66, 28, 28, 4);
      g.fillStyle(0xffd27a).fillRect(l.x - 8, l.y - 60, 16, 14);
      g.fillStyle(0x8f8873).fillTriangle(l.x - 22, l.y - 64, l.x + 22, l.y - 64, l.x, l.y - 86);
    }
    for (const o of this.level.ponds ?? []) {
      const g = s.add.graphics().setDepth(1);
      g.fillStyle(0x7d9a6a, .5).fillRoundedRect(o.x - 10, o.y - 8, o.w + 20, o.h + 18, 34);
      g.fillStyle(0x4f93b8).fillRoundedRect(o.x, o.y, o.w, o.h, 28);
      g.fillStyle(0x6fb3d6, .55).fillRoundedRect(o.x + 10, o.y + 8, o.w - 20, o.h * .45, 22);
      g.lineStyle(3, 0xd8f0f7, .55);
      for (let i = 0; i < Math.max(3, Math.floor((o.w * o.h) / 9000)); i++) {
        const x = o.x + 30 + ((i * 97) % Math.max(1, o.w - 60)), y = o.y + 20 + ((i * 61) % Math.max(1, o.h - 40));
        g.lineBetween(x, y, x + 22, y);
      }
    }
    for (const h of this.level.hedges ?? []) {
      const g = s.add.graphics().setDepth(h.y + h.h);
      const look = h.look ?? 'hedge';
      g.fillStyle(0x3d5530, .22).fillRoundedRect(h.x + 6, h.y + 12, h.w, h.h, 20);
      if (look === 'rock') {
        g.fillStyle(0x9a9686).fillRoundedRect(h.x, h.y, h.w, h.h, 26);
        g.fillStyle(0xb9b5a3).fillRoundedRect(h.x + 6, h.y + 4, h.w - 12, h.h * .45, 20);
      } else if (look === 'lantern') {
        g.fillStyle(0xc9c2ad).fillRoundedRect(h.x, h.y + h.h * .35, h.w, h.h * .65, 6);
        for (let x = h.x + 22; x < h.x + h.w - 10; x += 56) {
          g.fillStyle(0xb3ab94).fillRoundedRect(x - 12, h.y - 34, 24, 50, 4);
          g.fillStyle(0xffe3a0).fillRect(x - 7, h.y - 22, 14, 12);
          g.fillStyle(0x8f8873).fillTriangle(x - 20, h.y - 30, x + 20, h.y - 30, x, h.y - 50);
        }
      } else {
        g.fillStyle(0x5f8a43).fillRoundedRect(h.x, h.y, h.w, h.h, 22);
        g.fillStyle(0x76a352);
        for (let x = h.x + 18; x < h.x + h.w - 8; x += 30) for (let y = h.y + 14; y < h.y + h.h - 6; y += 28) g.fillCircle(x + ((y / 28) % 2) * 10, y, 15);
        g.fillStyle(0x93bf6b, .8);
        for (let x = h.x + 24; x < h.x + h.w - 12; x += 44) g.fillCircle(x, h.y + 12, 9);
      }
    }
  }

  /** 飛び石・はすの葉(沈む石はゆれて、沈むと消える)と、コイン。 */
  private renderTerrain(w: World) {
    const g = this.terrainFx.clear();
    for (const gate of w.gates) {
      g.fillStyle(0x3d4a30, .25).fillRect(gate.x, gate.y + gate.h - 6, gate.w, 14);
      g.fillStyle(0x9a6b3f).fillRect(gate.x, gate.y + 8, gate.w, 10).fillRect(gate.x, gate.y + 24, gate.w, 10);
      for (let x = gate.x + 10; x < gate.x + gate.w; x += 44) g.fillStyle(0x7a5130).fillRoundedRect(x, gate.y - 14, 16, gate.h + 16, 5).fillStyle(0xb98a56).fillRect(x + 3, gate.y - 10, 4, gate.h + 6);
    }
    for (const st of w.stones) {
      if (st.sunk) {
        g.lineStyle(3, 0xd8f0f7, .7 - st.down * .2).strokeEllipse(st.cx, st.y, st.r * 2.2 + st.down * 20, st.r * 1.1 + st.down * 10);
        continue;
      }
      const warn = st.sink !== undefined && st.stand > 0 ? Math.min(1, st.stand / st.sink) : 0;
      const shake = warn ? Math.sin(w.time * 50) * 3 * warn : 0;
      if (st.lily) {
        g.fillStyle(0x3f7a3a).fillEllipse(st.cx + shake, st.y + 3, st.r * 2.1, st.r * 1.3);
        g.fillStyle(0x6fb04f).fillEllipse(st.cx + shake, st.y, st.r * 2, st.r * 1.2);
        g.fillStyle(0x4f93b8).fillTriangle(st.cx + shake, st.y, st.cx + shake + st.r, st.y - st.r * .3, st.cx + shake + st.r, st.y + st.r * .2);
      } else {
        g.fillStyle(0x6b6a5c, .5).fillEllipse(st.cx + shake, st.y + 6, st.r * 2.1, st.r * 1.2);
        g.fillStyle(warn ? 0xa79c86 : 0xb8b4a2).fillEllipse(st.cx + shake, st.y, st.r * 2, st.r * 1.15);
        g.fillStyle(0xd6d2c0, .8).fillEllipse(st.cx + shake - st.r * .2, st.y - st.r * .2, st.r * 1.1, st.r * .5);
        if (warn) g.lineStyle(2, 0x6d5f45, .5 + warn * .4).lineBetween(st.cx + shake - st.r * .5, st.y, st.cx + shake + st.r * .4, st.y + st.r * .2);
      }
    }
    const c = this.coinFx.clear();
    for (const coin of w.coins) {
      if (coin.taken) continue;
      const spin = Math.abs(Math.cos(w.time * 3 + coin.x * .01)) * .7 + .3;
      const lift = coin.air ? 70 : 18;
      const r = coin.kind === 'premium' ? 24 : coin.kind === 'gold' ? 20 : 16;
      const [face, rim] = coin.kind === 'premium' ? [0xc77dff, 0xf0c8ff] : coin.kind === 'gold' ? [0xffc83a, 0xffe28a] : [0xd5dde6, 0xf4f7fa];
      c.fillStyle(0x3d4a30, .2).fillEllipse(coin.x, coin.y + 4, r * 1.6, r * .6);
      if (coin.air) c.lineStyle(2, 0xffffff, .35).lineBetween(coin.x, coin.y, coin.x, coin.y - lift + r);
      if (coin.kind === 'premium') c.fillStyle(0xe0b0ff, .25 + .15 * Math.sin(w.time * 5)).fillCircle(coin.x, coin.y - lift, r * 2);
      c.fillStyle(rim).fillEllipse(coin.x, coin.y - lift, r * 2 * spin, r * 2);
      c.fillStyle(face).fillEllipse(coin.x, coin.y - lift, r * 1.5 * spin, r * 1.5);
    }
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
    if (e.kind === 'found' || e.kind === 'lost') {
      const text = this.label(e.x, e.y - 90, e.kind === 'found' ? 'みつけた！' : 'はぐれた…！', 28, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (e.kind === 'bait' || e.kind === 'eat' || e.kind === 'stolen') {
      const text = this.label(e.x, e.y - 70, e.kind === 'bait' ? 'ポトッ' : e.kind === 'eat' ? 'もぐもぐ' : 'あっ、取られた！', e.kind === 'stolen' ? 30 : 24, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (e.kind === 'crush') this.scene.cameras.main.shake(220, .01);
    if (e.kind === 'gateClose' || e.kind === 'gateOpen') {
      if (e.kind === 'gateClose') this.scene.cameras.main.shake(260, .008);
      const text = this.label(e.x, e.y - 40, e.kind === 'gateClose' ? 'ガシャン！' : 'ひらいた！', 32, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (e.kind === 'pickup' || e.kind === 'splash' || e.kind === 'lure') {
      const word = { pickup: 'せんべい！', splash: 'ぽちゃん…', lure: 'あっ、せんべい！' }[e.kind];
      const text = this.label(e.x, e.y - (e.kind === 'lure' ? 120 : 50), word, 24, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (e.kind === 'sink' || e.kind === 'water' || e.kind === 'gold' || e.kind === 'premium') {
      const word = { sink: 'ぶくぶく…', water: 'ばしゃーん！', gold: 'ゴールド！', premium: 'プレミアム！！' }[e.kind];
      const text = this.label(e.x, e.y - 60, word, e.kind === 'premium' ? 32 : 26, e.kind === 'premium' ? '#8a3ad8' : '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (e.kind === 'warning' || e.kind === 'collapse') {
      const text = this.label(e.x, e.y - 32, e.kind === 'warning' ? 'ミシッ…' : 'えっ！？', e.kind === 'warning' ? 29 : 35, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (e.kind === 'sweep') {
      this.flowerList.push({ x: e.x, y: e.y, born: now, color: [0xff9ec0, 0xffe27a, 0xffffff, 0xb59cff][this.flowerList.length % 4] });
      if (this.flowerList.length > 60) this.flowerList.shift();
    }
    if (e.kind === 'miss') {
      const text = this.label(e.x, e.y - 30, 'みのがし…', 26, '#755338').setDepth(8000);
      text.setStroke('#fff9dc', 6);
      this.labels.push({ text, born: now, y: text.y });
    }
    if (['collapse', 'land', 'poop', 'clear', 'drop', 'sweep'].includes(e.kind)) {
      const count = e.kind === 'clear' ? 34 : e.kind === 'collapse' ? 16 : 7;
      for (let i = 0; i < count; i++) {
        const a = i * 2.4, radius = e.kind === 'collapse' ? 65 : 20;
        const x = e.x + Math.cos(a) * radius, y = e.y + Math.sin(a) * radius * .6;
        const color = e.kind === 'clear' ? [0xe7bb65, 0x99b568, 0xf4edd0][i % 3] : e.kind === 'poop' ? 0x987346 : e.kind === 'sweep' ? 0xb7d27a : 0xcfbd8b;
        const shape = this.scene.add.circle(x, y, 3 + i % 5, color, .85).setDepth(9000);
        this.particles.push({ shape, born: now, duration: e.kind === 'clear' ? 1.7 : .6, x, y, vx: Math.cos(a) * (40 + i * 3), vy: -55 - (i % 5) * 12 });
      }
    }
  }

  reset() {
    this.flowerList = [];
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
    for (const g of this.carts.values()) g.destroy();
    this.carts.clear();
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
      // 壁ごとに描き、Spraと同じく y で前後を決める（跳び越えるとき、壁の裏に隠れないように）。
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

  /** 人力車の車(右向きに描いて、向きは setScale で変える)。上にちょうちん。 */
  private cart(id: string) {
    let g = this.carts.get(id);
    if (g) return g;
    g = this.scene.add.graphics();
    g.fillStyle(0x3d4a30, .22).fillEllipse(10, 0, 130, 26);
    g.lineStyle(5, 0x6b4a2c).lineBetween(-4, -40, 66, -30); // かじ棒(前の鹿へ)
    g.fillStyle(0xa8322a).fillRoundedRect(-46, -74, 58, 42, 8); // 座席
    g.fillStyle(0x5a1f1a).fillRoundedRect(-52, -108, 40, 46, { tl: 22, tr: 6, bl: 4, br: 4 }); // ほろ
    g.fillStyle(0x2f2a24).fillRect(-46, -36, 58, 6);
    g.lineStyle(5, 0x3b2a1e).strokeCircle(-18, -24, 24);
    g.lineStyle(2, 0x3b2a1e);
    for (let a = 0; a < Math.PI; a += Math.PI / 4) g.lineBetween(-18 - Math.cos(a) * 22, -24 - Math.sin(a) * 22, -18 + Math.cos(a) * 22, -24 + Math.sin(a) * 22);
    g.fillStyle(0xffe3a0).fillRoundedRect(4, -98, 14, 18, 6).lineStyle(2, 0xc0392b).strokeRoundedRect(4, -98, 14, 18, 6); // ちょうちん
    this.carts.set(id, g);
    return g;
  }

  /** 夜の暗さ。灯り・Spraの足もと・人力車のちょうちんのまわりだけ、明るくする。 */
  private renderNight(w: World) {
    const night = this.level.night;
    if (!night) { this.dark?.setVisible(false); return; }
    if (!this.scene.textures.exists('night-light')) {
      const c = this.scene.textures.createCanvas('night-light', 256, 256)!, ctx = c.getContext();
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(.55, 'rgba(255,255,255,.92)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256); c.refresh();
    }
    this.lightBrush ??= this.scene.make.image({ key: 'night-light', add: false }, false).setOrigin(.5);
    this.dark ??= this.scene.add.renderTexture(0, 0, VIEW.width, VIEW.height).setOrigin(0).setScrollFactor(0).setDepth(7900);
    const rt = this.dark.setVisible(true), top = this.cameraY, b = this.lightBrush;
    rt.clear(); rt.fill(0x0b1330, .86);
    const light = (x: number, y: number, r: number) => {
      if (y + r < top || y - r > top + VIEW.height) return;
      b.setPosition(x, y - top).setScale(r / 128); rt.erase(b);
    };
    for (const l of night.lights) light(l.x, l.y - 30, night.radius ?? 170);
    for (const m of w.lines) if (m.kind === 'rickshaw') light(m.x, m.y - 40, 120);
    light(w.player.x, w.player.y - 30 - w.player.height, night.player ?? 125);
  }

  /** 鹿せんべい（まるいせんべい）。 */
  private senbei(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha: number) {
    g.fillStyle(0x6f4d2a, .22 * alpha).fillEllipse(x + 2, y + r * .55, r * 2.2, r * .9);
    g.fillStyle(0xe0b36a, alpha).fillCircle(x, y, r).lineStyle(2, 0xa9772f, alpha).strokeCircle(x, y, r);
    g.lineStyle(2, 0xb98a46, alpha).lineBetween(x - r * .5, y - r * .15, x + r * .5, y - r * .15).lineBetween(x - r * .4, y + r * .35, x + r * .4, y + r * .35);
  }

  /** 歩く鹿。歩いた距離でコマを進め、予告中はその場で足踏みし、落とす場所に輪を出す。 */
  private renderDeers(w: World) {
    this.deerFx.clear(); this.overFx.clear(); this.rainGraphic?.clear();
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
    // 投げるせんべい: 道のせんべい(拾える)、飛んでいる/落ちているせんべい、せんべいが好きな鹿
    if (w.level.senbei || w.hungry.length) {
      const g = this.deerFx;
      for (const k of w.pickups) {
        if (k.taken) continue;
        const glow = .5 + .5 * Math.sin(w.time * 4 + k.x);
        g.fillStyle(0xfff3c4, .25 + glow * .25).fillCircle(k.x, k.y - 4, 26);
        this.senbei(g, k.x, k.y - 4, 15, 1);
      }
      for (const s of w.thrown) {
        if (s.state === 'eaten' || s.state === 'lost') continue;
        const lift = s.state === 'fly' ? 4 * 70 * s.t * (1 - s.t) : 0;
        if (lift) g.fillStyle(0x6f4d2a, .18).fillEllipse(s.x, s.y + 6, 26, 10);
        this.senbei(lift ? this.overFx : g, s.x, s.y - lift, 14, s.by >= 0 && w.hungry[s.by]?.state === 'eat' ? .8 : 1);
      }
      for (const h of w.hungry) {
        place(`h:${h.id}`, h.kind, h.x, h.y, h.dir, h.state === 'chase' || h.state === 'go' || h.state === 'back', h.walked, h.state === 'eat' ? Math.sin(h.timer * 18) * 2 : 0);
        // ふさいでいる鹿: 足もとに、通れないしるし(うすい輪)
        if (h.mode === 'block' && h.state === 'idle') g.lineStyle(3, 0xb98a46, .35).strokeEllipse(h.x, h.y + 4, 80, 30);
        // 追ってくる鹿: 走っている間は、頭の上に「！」
        if (h.mode === 'chase' && h.state === 'chase') {
          const top = h.y - DEER_HEIGHT[h.kind] - 26;
          this.overFx.fillStyle(0xfff9dc).fillCircle(h.x, top - 6, 17).fillStyle(0xd0603a).fillRoundedRect(h.x - 4, top - 18, 8, 15, 3).fillCircle(h.x, top + 3, 4);
        }
      }
      // 持っているせんべい(Spraの頭の上に、枚数ぶん)
      if (w.outcome === 'playing') for (let i = 0; i < w.held; i++) this.senbei(this.overFx, w.player.x - (w.held - 1) * 9 + i * 18, w.player.y - 96 - w.player.height, 9, 1);
    }
    // ステージ4: 道を横切る動物
    for (const c of w.crossers) place(c.id, c.kind, c.x, c.y + 20, c.dir, true, c.walked);
    // 横切る列: 鹿の行列と、鹿が引く人力車(前を鹿、後ろに車)
    for (const m of w.lines) {
      const def = w.level.lines![m.line];
      if (m.kind === 'deer') { place(`L:${m.id}`, def.deer ?? 'doe', m.x, m.y + 20, m.dir, true, m.walked); continue; }
      place(`L:${m.id}`, 'doe', m.x + m.dir * 46, m.y + 20, m.dir, true, m.walked);
      this.cart(m.id).setPosition(m.x - m.dir * 34, m.y + 22).setScale(m.dir, 1).setDepth(m.y + 14);
    }
    // ステージ5: 迷子の鹿（見つけると、ついてくる）
    if (w.follower) {
      const f = w.follower;
      place('follower', f.kind, f.x, f.y, f.dir, f.state === 'follow' && w.player.moving, f.walked);
      if (f.state === 'lost') {
        const top = f.y - DEER_HEIGHT[f.kind] - 34 + Math.sin(w.time * 4) * 5;
        this.deerFx.fillStyle(0xfffbe8).fillEllipse(f.x, top, 60, 38).lineStyle(3, 0x7a8f5a).strokeEllipse(f.x, top, 60, 38);
        this.deerFx.fillStyle(0x7a8f5a).fillCircle(f.x - 14, top, 4).fillCircle(f.x, top, 4).fillCircle(f.x + 14, top, 4);
      }
    }
    // ステージ3: 掃除のあとに、花が咲く
    for (const f of this.flowerList) {
      const age = Math.min(1, (this.visualTime - f.born) / .35), r = 10 * age;
      for (let i = 0; i < 5; i++) this.deerFx.fillStyle(f.color, .95).fillCircle(f.x + Math.cos(i * 1.2566) * r, f.y + Math.sin(i * 1.2566) * r * .7, 6 * age);
      this.deerFx.fillStyle(0xfff4a8).fillCircle(f.x, f.y, 4 * age);
    }
    // ステージ2: せんべいを狙う鹿、置かれたせんべい、持っているせんべい、届け先の鹿
    const delivery = w.level.delivery;
    if (delivery) {
      for (const t of w.thieves) place(t.id, t.kind, t.x, t.y, t.dir, t.state === 'chase', t.walked, t.state === 'eat' ? Math.sin(t.timer * 18) * 2 : 0);
      for (const b of w.baits) if (!b.gone) this.senbei(this.deerFx, b.x, b.y, 15, b.by >= 0 ? .85 : 1);
      const moving = w.goal.state === 'moving';
      place('target', delivery.targetKind, w.goal.x, w.goal.y, w.goal.x > 360 ? -1 : 1, moving, w.time * 260);
      if (delivery.mark) {
        const bob = Math.sin(w.time * 5) * 6, top = w.goal.y - DEER_HEIGHT[delivery.targetKind] - 24 + bob;
        this.deerFx.fillStyle(0xd0603a).fillTriangle(w.goal.x - 15, top - 22, w.goal.x + 15, top - 22, w.goal.x, top).lineStyle(3, 0xfff6d8).strokeTriangle(w.goal.x - 15, top - 22, w.goal.x + 15, top - 22, w.goal.x, top);
      }
      if (w.outcome === 'playing') this.senbei(this.deerFx, w.player.x + 20, w.player.y - 58, 11, 1);
    }
    // 降ってくるうんこ: 影が濃くなり、うんこが落ちてくる
    const arena = w.level.arena;
    for (const d of w.drops) {
      if (!arena || d.t < 0) continue;
      const t = Math.min(1, d.t / arena.warn);
      this.deerFx.fillStyle(0x3d3a24, .12 + t * .3).fillEllipse(d.x, d.y + 6, 30 + t * 36, 14 + t * 16);
      const fall = (1 - t) * (1 - t) * 720;
      const g = this.rainGraphic ?? (this.rainGraphic = this.scene.add.graphics().setDepth(9500));
      g.fillStyle(0x78553b).fillCircle(d.x, d.y - fall - 14, 15).fillStyle(0xaa8460).fillEllipse(d.x - 3, d.y - fall - 19, 14, 8);
    }
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
    this.visualTime = now;
    this.visualTime = now;
    const p = w.player;
    // Leave room above the park so the finish flag stays below the fixed HUD.
    const lock = w.arena?.state === 'closed' && this.level.arena;
    const target = lock ? lock.top - 400 : Phaser.Math.Clamp(p.y - 800, -240, 2820);
    this.cameraY = Phaser.Math.Linear(this.cameraY, target, 1 - Math.exp(-dt * 12));
    this.scene.cameras.main.setScroll(0, this.cameraY);
    this.trapGraphics.clear();
    for (const trap of w.traps) this.drawTrap(trap, now);
    const falling = w.outcome === 'fall' || w.outcome === 'water';
    const factor = falling ? Math.max(.02, 1 - lossAge * 1.5) : 1;
    // 歩き・ジャンプ・落下は6方向の歩行コマ、クリアと失敗は専用の1枚絵。
    const walking = w.outcome === 'playing' || falling;
    this.sprite.setTexture(walking ? walkTexture(p.facing, p.stride, p.moving && p.jumpTime < 0) : w.outcome === 'clear' ? 'spru-clear' : 'spru-oops');
    const frame = this.sprite.frame;
    const [baseWidth, baseHeight] = walking ? [frame.width * WALK_SCALE, frame.height * WALK_SCALE] : [this.playerHeight * frame.width / frame.height, this.playerHeight];
    this.sprite.setDisplaySize(baseWidth * factor, baseHeight * factor);
    this.sprite.setPosition(p.x, p.y + 5 - p.height + (falling ? lossAge * 30 : 0));
    this.sprite.setDepth(p.y + 60 + p.height).setFlipX(false).setAlpha(falling ? Math.max(0, 1 - lossAge * 1.35) : 1);
    this.sprite.setAngle(falling ? lossAge * 105 : 0);
    this.renderTerrain(w);
    this.renderDeers(w);
    this.renderNight(w);
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
    // ゴールゲートはゴールの位置について行く（動くゴールがあるため）。Spraはゲートの手前を通ってクリアする。
    this.goalGate.setPosition(w.goal.x, w.goal.y + 62).setDepth(w.goal.y - 20).setVisible(!w.level.delivery);
  }
}
