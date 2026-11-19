// WORLD 2「せんべい くばり」の描画。公園・屋台・演出は BakeView と共通。ここは、屋台のうしろ(Spra の目線)から公園を見るカメラ・
// 手に持ったせんべい・投げる前の道すじ・とんでいるせんべい・地面のせんべい・公園の鹿と、受けとれる輪。ルールは toss.ts。
import * as THREE from 'three';
import { BakeView } from './view.ts';
import { SBAL, TossRun, type TossDeer, type TossEvent } from './toss.ts';
import type { DeerKind, TossLevel } from './levels.ts';

const DEER_H: Record<DeerKind, number> = { fawn: 1.3, doe: 1.45, stag: 1.6 };
const DOTS = 18;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

type TossSprite = { s: THREE.Sprite; shadow: THREE.Mesh; ring: THREE.Mesh; core: THREE.Mesh; dir: 'l' | 'r'; px: number; pz: number; hop: number };

export class TossView extends BakeView {
  private hand!: THREE.Mesh;
  private dots: THREE.Sprite[] = [];
  private dotMat!: THREE.SpriteMaterial;
  private flying = new Map<number, THREE.Mesh>();
  private onGround = new Map<number, THREE.Mesh>();
  private tossDeer = new Map<number, TossSprite>();
  private ringGeo!: THREE.RingGeometry;
  private coreGeo!: THREE.CircleGeometry;
  /** 投げる前のねらい(なければ null) */
  aiming: { heading: number; power: number } | null = null;
  private handPop = 1;
  /** 地面に着く前に拾われた・消えたせんべい */
  private gone = new Set<number>();
  private ray = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(host: HTMLElement, level: TossLevel) {
    super(host, level);
    this.hand = this.flyingSenbei(false, 0.6);
    this.scene.add(this.hand);
    // 道すじの点: 白い丸に、こい茶のふち(明るい地面の上でも見える)。鹿にかくれないよう、いちばん上に描く
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#5a3200'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 21, 0, 7); g.fill();
    const dotTex = new THREE.CanvasTexture(c);
    dotTex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(dotTex);
    this.dotMat = new THREE.SpriteMaterial({ map: dotTex, transparent: true, depthTest: false, depthWrite: false });
    for (let i = 0; i < DOTS; i++) {
      const d = new THREE.Sprite(this.dotMat);
      d.visible = false; d.renderOrder = 6;
      this.scene.add(d);
      this.dots.push(d);
    }
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 48);
    this.coreGeo = new THREE.CircleGeometry(1, 32);
    this.resize();
  }

  /** やり直すとき: とんでいる・地面の せんべいと鹿の絵を片づける(番号は 1 から振りなおしになる) */
  clearRun(): void {
    for (const m of [...this.flying.values(), ...this.onGround.values()]) this.scene.remove(m);
    this.flying.clear(); this.onGround.clear(); this.gone.clear();
    for (const ds of this.tossDeer.values()) {
      this.scene.remove(ds.s, ds.shadow, ds.ring, ds.core);
      ds.s.material.dispose();
      for (const m of [ds.shadow, ds.ring, ds.core]) (m.material as THREE.Material).dispose();
      ds.shadow.geometry.dispose();
    }
    this.tossDeer.clear();
    for (const f of this.flyers) this.scene.remove(f.obj);
    this.flyers = [];
  }

  /** Spra の手(投げる所) */
  handPos(): THREE.Vector3 { return new THREE.Vector3(0, SBAL.originY, SBAL.originZ); }
  deerTop(d: TossDeer): THREE.Vector3 {
    const ds = this.tossDeer.get(d.id);
    return new THREE.Vector3(ds?.px ?? d.x, DEER_H[d.kind] + 0.25 + (ds?.s.position.y ?? 0), ds?.pz ?? d.z);
  }
  /** 画面の位置(px)の真下の地面(なければ null) */
  groundAt(x: number, y: number): THREE.Vector3 | null {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.camera);
    return this.ray.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
  }

  protected resize(): void {
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 屋台のうしろ(Spra の目線)から、公園の奥へ。縦長の画面でも、手前の鹿の列が横に収まるように引く
    this.camera.fov = 55;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w / h);
    // 高めから見下ろして、手前・まん中・奥の列が、画面の上下に分かれて見えるように
    const back = clamp(2.2 / tanH - 5.0, 1.5, 5);
    this.camera.position.set(0, 3.6 + back * 0.45, back);
    this.camera.lookAt(new THREE.Vector3(0, 0, -5.5));
    this.camera.setViewOffset(w, h, 0, -Math.round(h * 0.07), w, h);
    this.camera.updateProjectionMatrix();
  }

  onTossEvent(e: TossEvent, run: TossRun): void {
    const d = e.deer !== undefined ? run.deer.find(x => x.id === e.deer) : undefined;
    switch (e.kind) {
      case 'throw':
        this.handPop = 0;
        this.emit('soft', this.handPos(), { n: 3, spread: 0.2, vr: 0.6, size: 0.18, life: 0.4, grow: 1.5, opacity: 0.5 });
        break;
      case 'catch':
      case 'perfect': {
        const fl = this.flying.get(e.id!);
        if (fl) { this.scene.remove(fl); this.flying.delete(e.id!); }
        const ds = d && this.tossDeer.get(d.id);
        if (ds) ds.hop = 0.35;
        const at = d ? new THREE.Vector3(d.x, DEER_H[d.kind] * 0.6, d.z) : new THREE.Vector3(e.x, 0.8, e.z);
        this.emit('crumb', at, { n: 10, spread: 0.3, vr: 1.8, size: 0.07, life: 0.6, gravity: 4 });
        if (e.kind === 'perfect') {
          this.emit('star', at.clone().setY(at.y + 0.3), { n: e.gold ? 22 : 12, spread: 0.5, vr: 2.4, size: e.gold ? 0.24 : 0.17, life: 0.8, gravity: 2.5, color: e.gold ? '#ffd23a' : undefined });
          this.emit('soft', at, { n: 1, size: 1.1, life: 0.3, grow: 4, color: '#fff3b0', opacity: 0.7 });
        }
        break;
      }
      case 'miss': {
        // 地面に落ちて、少しはねる
        const fl = this.flying.get(e.id!);
        if (fl) { this.scene.remove(fl); this.flying.delete(e.id!); }
        const g = this.flyingSenbei(false, 0.6);
        const from = new THREE.Vector3(e.x, SBAL.catchY, e.z), to = new THREE.Vector3(e.x! + 0.15, 0.03, e.z! + 0.1);
        this.fly(g, from, to, 0.28, 0.12, 0, () => {
          // 落ちきる前に、もう拾われていたら置かない
          if (this.gone.delete(e.id!)) return;
          g.position.copy(to); g.rotation.set(0.04, Math.random() * 6, 0);
          this.scene.add(g);
          this.onGround.set(e.id!, g);
          this.emit('soft', to, { n: 3, spread: 0.3, v: new THREE.Vector3(0, 0.3, 0), vr: 0.4, size: 0.2, life: 0.5, grow: 1, color: '#e8dcc4', opacity: 0.7 });
        }, 0.6);
        break;
      }
      case 'pick':
      case 'vanish': {
        const g = this.onGround.get(e.id!);
        if (g) { this.scene.remove(g); this.onGround.delete(e.id!); } else this.gone.add(e.id!);
        const at = new THREE.Vector3(e.x, 0.15, e.z);
        if (e.kind === 'pick') this.emit('crumb', at, { n: 8, spread: 0.3, vr: 1.2, size: 0.06, life: 0.5, gravity: 4 });
        else this.emit('soft', at, { n: 4, spread: 0.4, v: new THREE.Vector3(0, 0.4, 0), vr: 0.5, size: 0.25, life: 0.6, grow: 1, color: '#d8ccb4', opacity: 0.7 });
        break;
      }
      case 'served':
        if (d) this.emit('heart', new THREE.Vector3(d.x, DEER_H[d.kind] + 0.1, d.z), { n: 5, spread: 0.5, v: new THREE.Vector3(0, 0.8, 0), vr: 0.5, size: 0.26, life: 1.3 });
        break;
      case 'angry':
        if (d) this.emit('soft', new THREE.Vector3(d.x, DEER_H[d.kind] + 0.1, d.z), { n: 4, spread: 0.3, v: new THREE.Vector3(0, 0.6, 0), size: 0.3, life: 0.8, color: '#ff8a7a', opacity: 0.7 });
        break;
      case 'premium':
        this.emit('star', this.handPos().setY(SBAL.originY + 0.8).setZ(-3), { n: 30, spread: 1.6, vr: 3, size: 0.24, life: 1.4, gravity: 2.5, color: '#e8b8ff' });
        break;
    }
  }

  renderToss(run: TossRun, dt: number): void {
    this.time += dt;
    const running = run.phase === 'running';
    // 手に持ったせんべい(投げると消えて、次のが ぽんと出る)
    this.handPop = Math.min(1, this.handPop + dt / SBAL.reload);
    this.hand.visible = running && run.stock > 0 && run.reload <= 0;
    const hp = this.handPos();
    this.hand.position.copy(hp).setY(hp.y + Math.sin(this.time * 3) * 0.015);
    this.hand.scale.setScalar(0.6 * (0.6 + 0.4 * ease(this.handPop)));
    // ねらっている間は、手のせんべいを投げる向きへ少し傾ける
    this.hand.rotation.set(this.aiming ? 0.5 : 0.25, this.aiming ? -this.aiming.heading : 0, 0);
    // 投げる前の道すじ(guide の長さまで)
    const a = running && this.aiming && this.hand.visible ? this.aiming : null;
    if (a) {
      const p = run.aim(a.heading, a.power), f = { x0: 0, z0: SBAL.originZ, x1: p.x, z1: p.z, h: p.h }, g = run.level.guide;
      this.dots.forEach((dot, i) => {
        const k = ((i + 1) / DOTS) * g;
        const q = TossRun.flightPos(f, k);
        dot.visible = true;
        dot.position.set(q.x, q.y, q.z);
        dot.scale.setScalar(0.15 * (1 - (i / DOTS) * 0.45));
      });
      // 遠くへ投げるほど、点が黄色→だいだいに
      this.dotMat.color.setHSL(0.16 - a.power * 0.1, 1, 0.8);
      this.dotMat.opacity = 0.85 + Math.sin(this.time * 10) * 0.12;
    } else for (const d of this.dots) d.visible = false;
    // とんでいるせんべい(くるくる回りながら)
    const live = new Set<number>();
    for (const f of run.flights) {
      live.add(f.id);
      let m = this.flying.get(f.id);
      if (!m) { m = this.flyingSenbei(false, 0.62); this.scene.add(m); this.flying.set(f.id, m); }
      const q = TossRun.flightPos(f, clamp(f.t / f.T, 0, 1));
      m.position.set(q.x, q.y, q.z);
      m.rotation.set(0.35, f.t * 14, 0.15);
    }
    for (const [id, m] of this.flying) if (!live.has(id)) { this.scene.remove(m); this.flying.delete(id); }
    // 地面のせんべい(消える前に、ちかちか)
    for (const g of run.ground) {
      const m = this.onGround.get(g.id);
      if (m) m.visible = g.claimed !== null || g.t < SBAL.groundLife - 1.2 || Math.sin(this.time * 20) > 0;
    }
    this.paintTossDeer(run, dt);
    // 風: 葉っぱが 横へ とぶ
    if (run.wind && Math.random() < dt * 24) {
      this.emit('crumb', new THREE.Vector3(-run.wind * 5, 0.6 + Math.random() * 2.2, -1.5 - Math.random() * 7), { n: 1, spread: 0.3, v: new THREE.Vector3(run.wind * 5, 0.2, 0), vr: 0.6, size: 0.08, life: 1.8, color: Math.random() < 0.6 ? '#6fae47' : '#c9a25a' });
    }
    this.finishFrame(dt);
  }

  private paintTossDeer(run: TossRun, dt: number): void {
    const alive = new Set<number>();
    for (const d of run.deer) {
      alive.add(d.id);
      let ds = this.tossDeer.get(d.id);
      if (!ds) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08 }));
        s.center.set(0.5, 0.02);
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1.3, 0.6, 1);
        // 受けとれる所の輪(白)と、ぴったりの所(金)。待っている間だけ
        const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2;
        const core = new THREE.Mesh(this.coreGeo, new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.5, depthWrite: false }));
        core.rotation.x = -Math.PI / 2; core.renderOrder = 2;
        this.scene.add(s, shadow, ring, core);
        ds = { s, shadow, ring, core, dir: d.from[0] > d.home[0] ? 'l' : 'r', px: d.x, pz: d.z, hop: 0 };
        this.tossDeer.set(d.id, ds);
      }
      this.placeTossDeer(d, ds, dt);
    }
    for (const [id, ds] of this.tossDeer) {
      if (alive.has(id)) continue;
      this.scene.remove(ds.s, ds.shadow, ds.ring, ds.core);
      ds.s.material.dispose();
      for (const m of [ds.shadow, ds.ring, ds.core]) (m.material as THREE.Material).dispose();
      ds.shadow.geometry.dispose();
      this.tossDeer.delete(id);
    }
  }

  private placeTossDeer(d: TossDeer, ds: TossSprite, dt: number): void {
    const s = ds.s, mat = s.material, h = DEER_H[d.kind];
    // 動いた向きで、左右の絵を決める
    const vx = d.x - ds.px;
    if (Math.abs(vx) > 1e-4) ds.dir = vx > 0 ? 'r' : 'l';
    const moving = Math.hypot(vx, d.z - ds.pz) > 1e-4;
    ds.px = d.x; ds.pz = d.z;
    let frame = `${d.kind}_${ds.dir}_0`, sx = 1, sy = 1, y = 0;
    mat.color.set('#ffffff');
    const walkFrame = (rate: number) => { frame = `${d.kind}_${ds.dir}_${Math.floor(this.time * rate) % 4}`; y = Math.abs(Math.sin(this.time * rate)) * 0.04; };
    switch (d.phase) {
      case 'walk':
      case 'pick':
        walkFrame(d.phase === 'pick' ? 11 : 9);
        break;
      case 'wait': {
        if (moving) walkFrame(7);
        else if (d.kind === 'stag') frame = 'stag_front';
        // 来たときの「おじぎ」
        const bow = d.got === 0 && d.t < 1.0 ? Math.sin(clamp(d.t, 0, 1) * Math.PI * 2) : 0;
        sy = 1 - Math.max(0, bow) * 0.14 + Math.sin(this.time * 2.4 + d.id) * 0.012; sx = 1 + Math.max(0, bow) * 0.05;
        if (d.waited / d.patience > 0.85) mat.color.set('#ffd9d2');
        break;
      }
      case 'eat':
        if (d.kind === 'stag') frame = 'stag_front';
        sy = 1 - Math.abs(Math.sin(d.t * 22)) * 0.06;
        break;
      case 'happy':
      case 'angry': {
        const happy = d.phase === 'happy';
        if (d.t < SBAL.hopHold) {
          if (d.kind === 'stag') frame = happy ? 'stag_wink' : 'stag_front';
          if (happy) y = Math.abs(Math.sin((d.t / SBAL.hopHold) * Math.PI * 2)) * 0.22;
          else mat.color.set('#ffc0b4');
        } else {
          ds.dir = d.from[0] > d.x ? 'r' : 'l';
          walkFrame(10);
          if (!happy) mat.color.set('#ffd0c6');
        }
        break;
      }
    }
    // 受けとった瞬間の、小さなジャンプ
    if (ds.hop > 0) { ds.hop = Math.max(0, ds.hop - dt); y += Math.sin((1 - ds.hop / 0.35) * Math.PI) * 0.18; }
    const tex = this.deerTex[frame];
    if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
    const img = tex.image as { width?: number; height?: number } | undefined;
    const aspect = img?.width && img.height ? img.width / img.height : 0.8;
    s.scale.set(h * aspect * sx, h * sy, 1);
    // 待ちくたびれて、そわそわ
    const imp = d.phase === 'wait' ? d.waited / d.patience : 0;
    const jitter = imp > 0.65 && !moving ? Math.sin(this.time * (imp > 0.85 ? 34 : 18)) * 0.025 * (imp > 0.85 ? 2 : 1) : 0;
    s.position.set(d.x + jitter, y, d.z);
    ds.shadow.position.set(d.x, 0.01, d.z);
    // 受けとれる輪
    const show = d.phase === 'wait';
    ds.ring.visible = ds.core.visible = show;
    if (show) {
      const r = SBAL.catchR[d.kind], pulse = 1 + Math.sin(this.time * 4 + d.id) * 0.03;
      ds.ring.position.set(d.x, 0.02, d.z); ds.ring.scale.setScalar(r * pulse);
      ds.core.position.set(d.x, 0.021, d.z); ds.core.scale.setScalar(SBAL.perfectR);
      (ds.ring.material as THREE.MeshBasicMaterial).color.set(imp > 0.85 ? '#ff8a7a' : '#ffffff');
    }
  }
}
