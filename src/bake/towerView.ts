// WORLD 2「せんべいタワー」の描画。公園・屋台・お客の鹿・演出は BakeView と共通。ここは、お盆・積んだせんべい・
// ゆれるせんべい(と、落ちる場所の影)・注文の高さの線・カメラ(タワーの高さについていく)。ルールは tower.ts。
import * as THREE from 'three';
import { BakeView, COUNTER_TOP } from './view.ts';
import type { BakeRun } from './sim.ts';
import { TBAL, type Layer, type TowerEvent, type TowerRun } from './tower.ts';
import type { TowerLevel } from './levels.ts';

const PLATE_Z = -0.35;
const BASE_Y = COUNTER_TOP + 0.075;
const MAX_LAYERS = 30;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class TowerView extends BakeView {
  private layers: THREE.Mesh[] = [];
  private layerGeo!: THREE.CylinderGeometry;
  private mat!: { normal: THREE.MeshStandardMaterial; perfect: THREE.MeshStandardMaterial };
  private holder!: THREE.Mesh;
  private aimShadow!: THREE.Mesh;
  private guide!: THREE.Mesh;
  private goalLine!: THREE.Mesh;
  private goalMat!: THREE.MeshBasicMaterial;
  /** カメラの見る高さ(タワーの高さに、なめらかについていく) */
  private camY = 1.2;

  constructor(host: HTMLElement, level: TowerLevel) {
    super(host, level);
    this.layerGeo = new THREE.CylinderGeometry(TBAL.r, TBAL.r * 0.97, TBAL.h * 0.92, 40);
    const m = (c: string, e = 0) => new THREE.MeshStandardMaterial({ color: c, map: this.surfTex, roughness: 0.75, emissive: new THREE.Color('#ffb040'), emissiveIntensity: e });
    this.mat = { normal: m('#e2b467'), perfect: m('#dca052', 0.1) };
    // 朱塗りのお盆(いちばん下の土台)
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(TBAL.plateR + 0.05, TBAL.plateR, 0.05, 48), new THREE.MeshStandardMaterial({ color: '#b8322a', roughness: 0.35, metalness: 0.1 }));
    tray.position.set(0, COUNTER_TOP + 0.045, PLATE_Z); tray.castShadow = true; tray.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(TBAL.plateR + 0.04, 0.018, 8, 48), new THREE.MeshStandardMaterial({ color: '#d6a640', metalness: 0.6, roughness: 0.35 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(0, COUNTER_TOP + 0.072, PLATE_Z);
    this.scene.add(tray, rim);
    for (let k = 0; k < MAX_LAYERS; k++) {
      const s = new THREE.Mesh(this.layerGeo, this.mat.normal);
      s.castShadow = true; s.receiveShadow = true; s.visible = false;
      s.rotation.y = k * 1.7;
      this.scene.add(s);
      this.layers.push(s);
    }
    this.holder = new THREE.Mesh(this.layerGeo, this.mat.normal);
    this.holder.castShadow = true;
    this.scene.add(this.holder);
    // 落ちる場所の影(てっぺんの上に、まるく)と、まっすぐ下への点線がわりの細い線
    this.aimShadow = new THREE.Mesh(new THREE.CircleGeometry(TBAL.r, 32), new THREE.MeshBasicMaterial({ color: '#3a2410', transparent: true, opacity: 0.28, depthWrite: false }));
    this.aimShadow.rotation.x = -Math.PI / 2; this.aimShadow.renderOrder = 3;
    this.guide = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(this.aimShadow, this.guide);
    // 注文の高さの線(とどけられる高さになると、緑に)
    this.goalMat = new THREE.MeshBasicMaterial({ color: '#e04a3a', transparent: true, opacity: 0.85 });
    this.goalLine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.014, 0.014), this.goalMat);
    this.scene.add(this.goalLine);
    this.resize();
  }

  /** 段 k(0 が一番下)の中心の高さ */
  layerY(k: number): number { return BASE_Y + (k + 0.5) * TBAL.h; }
  /** てっぺん(n 段のときの上面)の高さ */
  topY(n: number): number { return BASE_Y + n * TBAL.h; }
  /** 注文の高さの線の、画面の位置(ふきだしに使う) */
  goalAt(want: number): THREE.Vector3 { return new THREE.Vector3(0.5, this.topY(want), PLATE_Z + 0.32); }
  towerTop(n: number): THREE.Vector3 { return new THREE.Vector3(0, this.topY(n), PLATE_Z); }

  protected resize(): void {
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.aim();
  }
  /** カメラ: お盆を正面の少し上から。ゆれる幅が横に収まる距離から、タワーの高さについていく */
  private aim(): void {
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 640;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w / h);
    const pitch = THREE.MathUtils.degToRad(25);
    const target = new THREE.Vector3(0, this.camY ?? 1.2, -0.55);
    const dist = Math.max(3.8, 1.12 / tanH + 0.2);
    this.camera.position.set(0, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
    this.camera.lookAt(target);
    this.camera.setViewOffset(w, h, 0, -Math.round(h * 0.06), w, h);
    this.camera.updateProjectionMatrix();
  }

  onTowerEvent(e: TowerEvent, run: TowerRun): void {
    const n = run.height;
    switch (e.kind) {
      case 'land':
      case 'perfect': {
        const at = new THREE.Vector3(run.topX(), this.topY(n), PLATE_Z);
        this.emit('crumb', at, { n: 6, spread: 0.4, vr: 1.2, size: 0.05, life: 0.5, gravity: 4 });
        this.shake = Math.max(this.shake, e.kind === 'perfect' ? 0.12 : 0.06);
        if (e.kind === 'perfect') {
          this.emit('star', at.clone().setY(at.y + 0.05), { n: 12, spread: 0.5, vr: 2.2, size: 0.15, life: 0.7, gravity: 3 });
          this.emit('soft', at, { n: 1, size: 0.9, life: 0.35, grow: 4, color: '#fff3b0', opacity: 0.8 });
        }
        break;
      }
      case 'miss': {
        // ふちに当たって、横へ落ちていく
        const from = new THREE.Vector3(e.x ?? 0, this.topY(n) + 0.03, PLATE_Z), dir = Math.sign((e.x ?? 0) - run.topX()) || 1;
        const s = new THREE.Mesh(this.layerGeo, this.mat.normal);
        this.fly(s, from, new THREE.Vector3(from.x + dir * 1.3, 0.05, PLATE_Z + 0.9), 0.75, 0.25, 0.5, undefined, -dir * Math.PI * 2);
        break;
      }
      case 'collapse': {
        // 崩れた段が、ばらばらに倒れて落ちる
        const start = e.n ?? 0, fallen = e.fallen ?? [], dir = Math.sign((fallen.at(-1)?.x ?? 1) - (fallen[0]?.x ?? 0)) || 1;
        fallen.forEach((l: Layer, i) => {
          const s = new THREE.Mesh(this.layerGeo, l.perfect ? this.mat.perfect : this.mat.normal);
          s.scale.set(l.r / TBAL.r, 1, l.r / TBAL.r);
          const from = new THREE.Vector3(l.x, this.layerY(start + i), PLATE_Z);
          const to = new THREE.Vector3(l.x + dir * (0.9 + i * 0.18 + Math.random() * 0.3), 0.05, PLATE_Z + 0.4 + Math.random() * 0.8);
          this.fly(s, from, to, 0.6 + i * 0.05, 0.2 + i * 0.03, (Math.random() - 0.5) * 6, undefined, -dir * (2 + Math.random() * 3));
        });
        this.emit('crumb', new THREE.Vector3(0, this.topY(start), PLATE_Z), { n: 20, spread: 0.6, vr: 2.4, size: 0.06, life: 0.8, gravity: 4 });
        this.shake = Math.max(this.shake, 0.7);
        break;
      }
      case 'deliver': {
        // タワーごと、鹿の前へすべっていく
        const g = new THREE.Group();
        (e.fallen ?? []).forEach((l, k) => {
          const s = new THREE.Mesh(this.layerGeo, l.perfect ? this.mat.perfect : this.mat.normal);
          s.scale.set(l.r / TBAL.r, 1, l.r / TBAL.r);
          s.position.set(l.x, (k + 0.5) * TBAL.h, 0); s.castShadow = true;
          g.add(s);
        });
        const to = this.spotPos(2).setY(COUNTER_TOP + 0.08).add(new THREE.Vector3(0, 0, 0.55));
        this.fly(g, new THREE.Vector3(0, BASE_Y, PLATE_Z), to, 0.6, 0.12, 0, () => {
          this.emit('crumb', to.clone().setY(to.y + 0.3), { n: 16, spread: 0.5, vr: 1.8, size: 0.06, life: 0.7, gravity: 4 });
        });
        break;
      }
      case 'big':
        this.emit('star', this.holder.position.clone(), { n: 14, spread: 0.6, vr: 2, size: 0.16, life: 0.8, gravity: 2 });
        break;
      case 'happy':
        this.emit('heart', this.spotPos(2).setY(1.7), { n: 6, spread: 0.6, v: new THREE.Vector3(0, 0.8, 0), vr: 0.5, size: 0.22, life: 1.3 });
        if (e.gold) this.emit('star', this.spotPos(2).setY(1.6), { n: 16, spread: 0.6, vr: 2.6, size: 0.2, life: 1, gravity: 2.5 });
        break;
      case 'angry':
        this.emit('soft', this.spotPos(2).setY(1.7), { n: 4, spread: 0.3, v: new THREE.Vector3(0, 0.6, 0), size: 0.25, life: 0.8, color: '#ff8a7a', opacity: 0.7 });
        break;
      case 'nibble': {
        // いちばん下の段が、鹿の ほうへ 引っぱられて 消える
        const l = e.fallen?.[0];
        if (l) this.emit('crumb', new THREE.Vector3(l.x, BASE_Y, PLATE_Z), { n: 14, spread: 0.4, vr: 1.8, size: 0.06, life: 0.6, gravity: 4 });
        this.shake = Math.max(this.shake, 0.3);
        break;
      }
      case 'premium':
        this.emit('star', this.towerTop(n).setY(this.topY(n) + 0.3), { n: 30, spread: 1.2, vr: 3, size: 0.22, life: 1.4, gravity: 2.5, color: '#e8b8ff' });
        break;
    }
  }

  renderTower(run: TowerRun, dt: number): void {
    this.time += dt;
    const n = run.height, running = run.phase === 'running';
    // 積んだせんべい(ゆれは、上へいくほど大きく横へずれる。少しだけ傾ける)
    const lean = n ? run.swayTop() / n : 0;
    this.layers.forEach((s, k) => {
      const l = run.stack[k];
      s.visible = !!l;
      if (!l) return;
      s.position.set(run.layerX(k), this.layerY(k), PLATE_Z);
      s.scale.set(l.r / TBAL.r, 1, l.r / TBAL.r);
      s.rotation.z = -Math.atan(lean / TBAL.h) * 0.12;
      s.material = l.perfect ? this.mat.perfect : this.mat.normal;
    });
    // ゆれる(落ちる)せんべい
    const f = run.falling, top = this.topY(n);
    const holdR = (f ? f.big : run.hold.big) ? TBAL.bigScale : 1;
    const hx = f ? f.x : run.hold.x, hy = top + (f ? f.y : TBAL.dropH) + TBAL.h * 0.5;
    const show = running && (!!f || run.busy <= 0);
    this.holder.visible = show;
    this.holder.position.set(hx, hy, PLATE_Z);
    this.holder.scale.set(holdR, 1, holdR);
    this.holder.rotation.z = f ? 0 : Math.sin(this.time * 6) * 0.04;
    (this.holder.material as THREE.MeshStandardMaterial) = holdR > 1 ? this.mat.perfect : this.mat.normal;
    // 落ちる場所: てっぺんの上の影と、細い線
    this.aimShadow.visible = this.guide.visible = show && !f;
    this.aimShadow.position.set(hx, top + 0.004, PLATE_Z);
    this.aimShadow.scale.setScalar(holdR);
    this.guide.position.set(hx, top + TBAL.dropH / 2, PLATE_Z + 0.001);
    this.guide.scale.y = TBAL.dropH;
    // 注文の高さの線
    const want = run.customer && (run.customer.phase === 'wait' || run.customer.phase === 'walk') ? run.customer.want : 0;
    this.goalLine.visible = running && want > 0;
    this.goalLine.position.set(0, this.topY(want), PLATE_Z + 0.32);
    this.goalMat.color.set(n >= want ? '#3fbf4a' : '#e04a3a');
    // 鹿(お客は、右に1頭。タワーにかくれないように)
    this.paintDeer(run.customer ? [run.customer] : [], dt);
    // タワーの下を 食べに来る鹿(焼く面の くいしんぼう鹿と 同じ動き)
    this.paintSneak({ sneak: run.nibbler } as unknown as BakeRun);
    // 風: 葉っぱが 横へ とぶ
    if (run.wind && Math.random() < dt * 22) {
      this.emit('crumb', new THREE.Vector3(-run.wind * 3, this.camY + (Math.random() - 0.3) * 1.6, PLATE_Z - Math.random() * 1.5), { n: 1, spread: 0.3, v: new THREE.Vector3(run.wind * 4.5, 0.2, 0), vr: 0.6, size: 0.07, life: 1.3, color: Math.random() < 0.6 ? '#6fae47' : '#c9a25a' });
    }
    // カメラは、タワーの高さに なめらかに ついていく
    const want2 = clamp(BASE_Y + n * TBAL.h * 0.8 + 0.25, 1.2, 4);
    this.camY += (want2 - this.camY) * Math.min(1, dt * 2.5);
    this.aim();
    this.finishFrame(dt);
  }
}
