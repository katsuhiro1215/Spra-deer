// WORLD 3「奈良公園、大掃除！」の描画(three.js)。参道・木・灯籠・大仏さま・Spra・ほうき・うんこ・鹿・お花。
// ルールは sim.ts。ここは、その状態を絵にするだけ。道のり s は奥(−z)へのびる。Spra は z=0 にいて、世界のほうが手前へ流れる。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WBAL, type Poop, type SweepDeer, type SweepEvent, type SweepRun } from './sim.ts';
import type { DeerKind, PoopKind } from './levels.ts';

const ASSET = '/assets';
const DEER_H: Record<DeerKind, number> = { fawn: 1.3, doe: 1.45, stag: 1.6 };
const POOP_SIZE: Record<PoopKind, number> = { small: 0.2, medium: 0.3, large: 0.42 };
const SPRA_H = 1.05;
/** 道ばたの木・灯籠を置く間(m) */
const PROP_GAP = 5;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function grainTex(base: string, dots: [string, number, number][], seed = 1): THREE.CanvasTexture {
  let a = seed;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  return canvasTex(256, 256, g => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (const [color, n, size] of dots) {
      g.fillStyle = color;
      for (let i = 0; i < n; i++) g.fillRect(rnd() * 256, rnd() * 256, size * (0.5 + rnd()), size * (0.5 + rnd()));
    }
  }, true);
}
function loadTex(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

type Particle = { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; spin: number; gravity: number; base: number };
type DeerSprite = { s: THREE.Sprite; shadow: THREE.Mesh };
type PoopMesh = { g: THREE.Group; pop: number; wobble: number };

export class SweepView {
  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 9 / 16, 0.1, 140);
  private ro: ResizeObserver;
  private disposables: { dispose(): void }[] = [];
  private time = 0;
  private shake = 0;
  private camX = 0;
  private grassTex: THREE.Texture;
  private pathTex: THREE.Texture;
  private props: { obj: THREE.Object3D; s: number; x: number }[] = [];
  private buddha: THREE.Mesh;
  private buddhaTex: THREE.Texture[];
  private spra: THREE.Sprite;
  private spraTex: { l: THREE.Texture[]; r: THREE.Texture[] };
  private spraDir: 'l' | 'r' = 'l';
  private spraLastX = 0;
  private broom: THREE.Group;
  private swing = 1;
  private zone: THREE.Mesh;
  private zoneMat: THREE.MeshBasicMaterial;
  private tornado: THREE.Group;
  private deerTex: Record<string, THREE.Texture> = {};
  private deerSprites = new Map<number, DeerSprite>();
  private poopMeshes = new Map<number, PoopMesh>();
  private poopMat: { normal: THREE.MeshStandardMaterial; hard: THREE.MeshStandardMaterial };
  private poopGeo: THREE.BufferGeometry[];
  private flowerTex: THREE.Texture[] = [];
  private flowerSprites = new Map<number, THREE.Sprite>();
  private particles: Particle[] = [];
  private pmat: Record<'soft' | 'star' | 'crumb' | 'petal', THREE.SpriteMaterial>;
  private tmpV = new THREE.Vector3();
  private length: number;

  constructor(host: HTMLElement, length: number) {
    this.host = host;
    this.length = length;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'ks-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#bfe2f2');
    this.scene.fog = new THREE.Fog('#d4e9ef', 22, 60);
    const pmrem = new THREE.PMREMGenerator(this.renderer), env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env; this.scene.environmentIntensity = 0.35;
    pmrem.dispose(); this.disposables.push(env);
    this.scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x7a6a48, 1.0));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
    sun.position.set(-4, 9, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 30;
    sun.target.position.set(0, 0, -4);
    this.scene.add(sun, sun.target);

    // 地面: 芝と、まん中の参道(砂利)。歩くと、模様が手前へ流れる
    this.grassTex = grainTex('#8fc266', [['#7db257', 900, 3], ['#a6d47b', 700, 2], ['#6aa047', 300, 2]], 3);
    this.grassTex.repeat.set(20, 30);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -35; ground.receiveShadow = true;
    this.pathTex = grainTex('#dcc8a0', [['#cbb38a', 1200, 3], ['#ebdcbc', 700, 2], ['#b9a07a', 300, 2], ['#f4ead2', 200, 1]], 5);
    this.pathTex.repeat.set(2, 30);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(WBAL.half * 2, 90), new THREE.MeshStandardMaterial({ map: this.pathTex, roughness: 1 }));
    path.rotation.x = -Math.PI / 2; path.position.set(0, 0.005, -35); path.receiveShadow = true;
    // 参道のふちの石
    const edgeMat = new THREE.MeshStandardMaterial({ color: '#b9b3a6', roughness: 0.9 });
    for (const x of [-WBAL.half, WBAL.half]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 90), edgeMat);
      edge.position.set(x, 0.04, -35); edge.receiveShadow = true;
      this.scene.add(edge);
    }
    this.scene.add(ground, path);
    this.buildProps();

    // 大仏さま(道のりの終わり)。目が光ると、絵を光る目にかえる
    this.buddhaTex = [loadTex(`${ASSET}/runner/daibutsu_0.png`), loadTex(`${ASSET}/runner/daibutsu_1.png`)];
    this.disposables.push(...this.buddhaTex);
    this.buddha = new THREE.Mesh(new THREE.PlaneGeometry(10, 9.2), new THREE.MeshBasicMaterial({ map: this.buddhaTex[0], transparent: true, alphaTest: 0.1, fog: false }));
    this.scene.add(this.buddha);

    // Spra(後ろ姿で歩く。右へ動くときは、左右を反転)
    const ul = [0, 1, 2].map(i => loadTex(`${ASSET}/spru-walk/ul_${i}.png`));
    const ur = ul.map(t => { const c = t.clone(); c.repeat.x = -1; c.offset.x = 1; c.needsUpdate = true; return c; });
    this.spraTex = { l: ul, r: ur };
    this.disposables.push(...ul, ...ur);
    this.spra = new THREE.Sprite(new THREE.SpriteMaterial({ map: ul[0], transparent: true, alphaTest: 0.1 }));
    this.spra.center.set(0.5, 0.02);
    this.spra.renderOrder = 3;
    const spraShadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.2, depthWrite: false }));
    spraShadow.rotation.x = -Math.PI / 2; spraShadow.position.y = 0.012; spraShadow.name = 'spraShadow';
    this.scene.add(this.spra, spraShadow);

    // ほうき(Spra の前で左右に振る)
    this.broom = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), new THREE.MeshStandardMaterial({ color: '#a5713f', roughness: 0.7 }));
    stick.rotation.set(-0.9, 0, -0.35); stick.position.set(0.12, 0.42, 0.18);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#e8c56a', roughness: 0.9, side: THREE.DoubleSide }));
    head.rotation.x = -Math.PI / 2 - 0.9; head.position.set(0, 0.09, -0.22); head.scale.set(1.4, 1, 0.5);
    stick.castShadow = head.castShadow = true;
    this.broom.add(stick, head);
    this.scene.add(this.broom);
    // ほうきの届く範囲(地面にうすく)
    this.zoneMat = new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.22, depthWrite: false });
    this.zone = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.zoneMat);
    this.zone.rotation.x = -Math.PI / 2; this.zone.renderOrder = 1;
    this.scene.add(this.zone);
    // 竜巻ほうき(いちばん上)のうず
    this.tornado = new THREE.Group();
    const tMat = new THREE.MeshBasicMaterial({ color: '#e2fffa', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.35, 0.05, 6, 32, Math.PI * 1.4), tMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2 + i * 0.35;
      this.tornado.add(ring);
    }
    this.tornado.visible = false;
    this.scene.add(this.tornado);

    // うんこ: ソフトクリームのような、まき まき の3段
    this.poopMat = {
      normal: new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.55, metalness: 0.05 }),
      hard: new THREE.MeshStandardMaterial({ color: '#b58a2e', roughness: 0.3, metalness: 0.65, emissive: new THREE.Color('#5a3c00'), emissiveIntensity: 0.4 }),
    };
    this.poopGeo = [new THREE.TorusGeometry(0.62, 0.32, 10, 24), new THREE.TorusGeometry(0.42, 0.27, 10, 22), new THREE.ConeGeometry(0.34, 0.5, 14)];
    this.disposables.push(...this.poopGeo, this.poopMat.normal, this.poopMat.hard);

    this.loadDeer();
    this.makeFlowers();
    this.pmat = this.makeParticleMats();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  // ---- 作る ----
  private buildProps(): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 });
    const leafMats = ['#5f9e3e', '#6fae47', '#4f8c37', '#7dbb52'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
    const leafGeo = new THREE.IcosahedronGeometry(1, 1), trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 8);
    const stone = new THREE.MeshStandardMaterial({ color: '#b9b3a6', roughness: 0.95 });
    const lamp = new THREE.MeshStandardMaterial({ color: '#ffe7a8', emissive: new THREE.Color('#ffcf6b'), emissiveIntensity: 0.5 });
    // 道のり全体ぶんを、はじめに置いておく(見えない所は fog と、カメラの外)
    for (let s = -10; s < this.length + 30; s += PROP_GAP) {
      for (const side of [-1, 1]) {
        const k = s * 2 + (side > 0 ? 1 : 0), r = hash(k);
        let obj: THREE.Object3D;
        const x = side * (WBAL.half + 1.0 + r * 3.5);
        if (r < 0.32) {
          // 石灯籠(参道のすぐ横)
          const g = new THREE.Group();
          const add = (geo: THREE.BufferGeometry, y: number, m: THREE.Material = stone) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); };
          add(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 6), 0.1);
          add(new THREE.CylinderGeometry(0.1, 0.11, 0.8, 8), 0.6);
          add(new THREE.CylinderGeometry(0.28, 0.24, 0.13, 6), 1.05);
          add(new THREE.BoxGeometry(0.32, 0.28, 0.32), 1.26, lamp);
          add(new THREE.ConeGeometry(0.45, 0.3, 6), 1.55);
          g.position.x = side * (WBAL.half + 0.6);
          obj = g;
          this.props.push({ obj, s: s + r * 2, x: g.position.x });
        } else {
          const tree = new THREE.Group();
          const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.2; trunk.castShadow = true;
          tree.add(trunk);
          for (let i = 0; i < 4; i++) {
            const leaf = new THREE.Mesh(leafGeo, leafMats[Math.floor(hash(k * 7 + i) * leafMats.length)]);
            leaf.position.set((hash(k + i * 3) - 0.5) * 1.6, 2.8 + hash(k + i * 5) * 1.4, (hash(k + i * 9) - 0.5) * 1.6);
            leaf.scale.setScalar(1.0 + hash(k + i * 11) * 0.7);
            leaf.castShadow = true;
            tree.add(leaf);
          }
          tree.scale.setScalar(0.8 + r * 0.6);
          obj = tree;
          this.props.push({ obj, s: s + r * 3, x });
        }
        this.scene.add(obj);
      }
    }
  }

  private loadDeer(): void {
    for (const kind of ['fawn', 'doe', 'stag']) for (const d of ['ur', 'ul']) for (let i = 0; i < 4; i++) this.deerTex[`${kind}_${d}_${i}`] = loadTex(`${ASSET}/sweep/${kind}_${d}_${i}.png`);
    this.disposables.push(...Object.values(this.deerTex));
  }
  private makeFlowers(): void {
    // 4色の花(花びら5まい + まん中)。草むらといっしょに
    const colors = [['#ff8fb1', '#ffd23a'], ['#ffd23a', '#e07a1a'], ['#b48cff', '#fff4c8'], ['#ff6a5a', '#fff4c8']];
    for (const [petal, mid] of colors) {
      const t = canvasTex(128, 128, g => {
        g.fillStyle = '#5c9e3a';
        g.beginPath(); g.ellipse(64, 112, 46, 14, 0, 0, 7); g.fill();
        g.strokeStyle = '#4f8c37'; g.lineWidth = 6; g.beginPath(); g.moveTo(64, 112); g.lineTo(64, 62); g.stroke();
        for (const [cx, cy, r] of [[64, 52, 1], [34, 78, 0.7], [94, 80, 0.7]] as [number, number, number][]) {
          g.fillStyle = petal;
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 13 * r, cy + Math.sin(a) * 13 * r, 11 * r, 8 * r, a, 0, 7); g.fill(); }
          g.fillStyle = mid; g.beginPath(); g.arc(cx, cy, 7 * r, 0, 7); g.fill();
        }
      });
      this.flowerTex.push(t);
    }
    this.disposables.push(...this.flowerTex);
  }
  private makeParticleMats() {
    const soft = canvasTex(64, 64, g => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    });
    const star = canvasTex(64, 64, g => {
      g.translate(32, 32); g.fillStyle = '#fff6c4';
      g.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? 9 : 30, a = (i * Math.PI) / 4; g.lineTo(Math.sin(a) * r, -Math.cos(a) * r); }
      g.fill();
    });
    const crumb = canvasTex(32, 32, g => { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill(); });
    const petal = canvasTex(32, 32, g => { g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(16, 16, 13, 7, 0.6, 0, 7); g.fill(); });
    this.disposables.push(soft, star, crumb, petal);
    const m = (map: THREE.Texture, blending: THREE.Blending = THREE.NormalBlending) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending });
    return { soft: m(soft), star: m(star, THREE.AdditiveBlending), crumb: m(crumb), petal: m(petal) };
  }

  // ---- 位置 ----
  /** 道のり s・横 x の地面の点(いまの Spra から見た位置) */
  at(run: SweepRun, s: number, x: number, y = 0): THREE.Vector3 { return new THREE.Vector3(x, y, -(s - run.d)); }
  toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = this.tmpV.copy(p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.host.clientWidth, y: (-v.y * 0.5 + 0.5) * this.host.clientHeight };
  }
  /** 画面の横の位置(px)の、Spra の足もとの線での x(指で動かすときに使う) */
  pxPerMeter(): number {
    const a = this.toScreen(new THREE.Vector3(this.camX - 1, 0, 0)), b = this.toScreen(new THREE.Vector3(this.camX + 1, 0, 0));
    return Math.abs(b.x - a.x) / 2;
  }

  private resize(): void {
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.aim();
  }
  /** カメラ: Spra のうしろの上から、参道の奥へ。左右は Spra に少しついていく */
  private aim(): void {
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 640;
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w / h);
    // 縦長ほど引いて、手前の参道の幅が見えるように
    const back = clamp(1.9 / tanH - 2.5, 2.8, 5);
    this.camera.position.set(this.camX, 3.3 + back * 0.25, back);
    this.camera.lookAt(this.camX * 0.6, 0, -6);
    this.camera.setViewOffset(w, h, 0, Math.round(h * 0.09), w, h);
    this.camera.updateProjectionMatrix();
  }

  // ---- 演出 ----
  private emit(mat: keyof SweepView['pmat'], at: THREE.Vector3, o: { n?: number; spread?: number; v?: THREE.Vector3; vr?: number; size?: number; life?: number; grow?: number; gravity?: number; color?: string; opacity?: number }): void {
    const n = o.n ?? 1;
    for (let k = 0; k < n; k++) {
      if (this.particles.length > 260) return;
      const m = this.pmat[mat].clone();
      if (o.color) m.color.set(o.color);
      m.opacity = o.opacity ?? 1;
      const s = new THREE.Sprite(m), size = (o.size ?? 0.2) * (0.7 + Math.random() * 0.6);
      s.scale.setScalar(size);
      const sp = o.spread ?? 0.1;
      s.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp * 0.3, (Math.random() - 0.5) * sp));
      s.renderOrder = 5;
      this.scene.add(s);
      const vr = o.vr ?? 0;
      const v = (o.v?.clone() ?? new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * vr, Math.random() * vr * 0.5, (Math.random() - 0.5) * vr * 0.35));
      this.particles.push({ s, v, life: 0, max: (o.life ?? 1) * (0.7 + Math.random() * 0.6), grow: o.grow ?? 0, spin: (Math.random() - 0.5) * 4, gravity: o.gravity ?? 0, base: m.opacity });
    }
  }

  onEvent(e: SweepEvent, run: SweepRun): void {
    const p = e.s !== undefined ? this.at(run, e.s, e.x ?? 0) : null;
    switch (e.kind) {
      case 'drop': {
        const pm = this.poopMeshes.get(e.id!);
        if (pm) pm.pop = 0;
        break;
      }
      case 'sweep': {
        this.swing = 0;
        // 風: ほうきの前に、白い筋
        const st = run.stats, n = 3 + st.level * 2;
        this.emit('soft', new THREE.Vector3(run.x, 0.15, -st.reach * 0.5), { n, spread: st.width, v: new THREE.Vector3(0, 0.2, -1.6), vr: 0.8, size: 0.32, life: 0.35, grow: 2, opacity: 0.35 });
        break;
      }
      case 'hit':
        if (p) this.emit('crumb', p.setY(0.15), { n: 5, spread: 0.2, vr: 1.6, size: 0.06, life: 0.4, gravity: 5, color: '#7a4a24' });
        break;
      case 'clean':
        if (!p) break;
        this.emit('star', p.clone().setY(0.25), { n: e.hard ? 12 : e.poop === 'large' ? 9 : 4, spread: 0.3, vr: 2, size: e.hard ? 0.22 : 0.15, life: 0.6, gravity: 2, color: e.hard ? '#ffd23a' : undefined });
        this.emit('soft', p.setY(0.12), { n: 3, spread: 0.25, v: new THREE.Vector3(0, 0.4, 0), vr: 0.4, size: 0.35, life: 0.5, grow: 1.4, color: '#e8dcc4', opacity: 0.7 });
        break;
      case 'miss':
        if (p) this.emit('soft', p.setY(0.2), { n: 4, spread: 0.3, v: new THREE.Vector3(0, 0.5, 0), vr: 0.3, size: 0.4, life: 0.7, grow: 1, color: '#9a7a5a', opacity: 0.6 });
        this.shake = Math.max(this.shake, 0.3);
        break;
      case 'flower':
        if (p) this.emit('petal', p.setY(0.4), { n: 10, spread: 0.6, v: new THREE.Vector3(0, 0.8, 0), vr: 1.4, size: 0.12, life: 1.1, gravity: 1.2, color: ['#ff8fb1', '#ffd23a', '#b48cff', '#ff6a5a'][Math.floor(Math.random() * 4)] });
        break;
      case 'level':
        this.emit('star', new THREE.Vector3(run.x, 0.8, -0.4), { n: 30, spread: 1.2, vr: 3.2, size: 0.24, life: 1.1, gravity: 2.5 });
        this.emit('soft', new THREE.Vector3(run.x, 0.5, -0.4), { n: 1, size: 2.4, life: 0.4, grow: 3, color: '#fff3b0', opacity: 0.8 });
        break;
      case 'glow':
        this.shake = Math.max(this.shake, 0.5);
        break;
      case 'clear':
        this.emit('petal', new THREE.Vector3(run.x, 2, -2), { n: 60, spread: 4, v: new THREE.Vector3(0, -0.2, 0), vr: 1.5, size: 0.14, life: 2.4, gravity: 0.4, color: '#ff9fbf' });
        break;
    }
  }

  // ---- 毎フレーム ----
  render(run: SweepRun, dt: number): void {
    this.time += dt;
    const d = run.d;
    // 地面の模様を流す
    this.grassTex.offset.y = (d / 90) * 30 % 1;
    this.pathTex.offset.y = (d / 90) * 30 % 1;
    for (const pr of this.props) {
      const z = -(pr.s - d);
      pr.obj.visible = z < 6 && z > -64;
      pr.obj.position.set(pr.x, 0, z);
    }
    // 大仏さま(道のりの終わりの先)
    const bz = -(run.level.length + 9 - d);
    this.buddha.position.set(0, 4.3, Math.max(bz, -58));
    (this.buddha.material as THREE.MeshBasicMaterial).map = this.buddhaTex[run.buddha === 'glow' || (run.buddha === 'warn' && Math.sin(this.time * 18) > 0.3) ? 1 : 0];
    this.buddha.visible = bz > -62;

    // Spra
    const moving = run.phase === 'running' && run.pace > 0.5;
    const vx = run.x - this.spraLastX;
    if (Math.abs(vx) > 1e-4) this.spraDir = vx > 0 ? 'r' : 'l';
    this.spraLastX = run.x;
    const frame = moving || Math.abs(vx) > 1e-4 ? Math.floor(this.time * 9) % 3 : 0;
    const smat = this.spra.material;
    const tex = this.spraTex[this.spraDir][frame];
    if (smat.map !== tex) { smat.map = tex; smat.needsUpdate = true; }
    const img = tex.image as { width?: number; height?: number } | undefined;
    const aspect = img?.width && img.height ? img.width / img.height : 0.6;
    this.spra.scale.set(SPRA_H * aspect, SPRA_H, 1);
    this.spra.position.set(run.x, moving ? Math.abs(Math.sin(this.time * 9)) * 0.04 : 0, 0.25);
    this.scene.getObjectByName('spraShadow')!.position.set(run.x, 0.012, 0.25);

    // ほうきと範囲
    const st = run.stats;
    this.swing = Math.min(1, this.swing + dt / 0.22);
    const sw = Math.sin(ease(this.swing) * Math.PI) * (this.swing < 1 ? 1 : 0);
    this.broom.position.set(run.x + 0.32, 0, -0.1);
    this.broom.rotation.y = -0.6 + sw * 1.4;
    this.broom.visible = st.level < 4;
    this.zone.position.set(run.x, 0.02, -st.reach / 2);
    this.zone.scale.set(st.width, st.reach, 1);
    this.zoneMat.color.set(['#fff6c8', '#eaffb4', '#c2fff1', '#e2fffa'][st.level - 1]);
    this.zoneMat.opacity = 0.18 + (this.swing < 1 ? 0.12 * (1 - this.swing) : 0);
    this.tornado.visible = st.level >= 4;
    if (this.tornado.visible) {
      this.tornado.position.set(run.x, 0, -st.reach * 0.45);
      this.tornado.rotation.y = this.time * 9;
      this.tornado.children.forEach((c, i) => { c.rotation.z = this.time * (6 + i * 2); });
      if (Math.random() < dt * 20) this.emit('soft', new THREE.Vector3(run.x, 0.2, -st.reach * 0.45), { n: 1, spread: st.width * 0.7, v: new THREE.Vector3(0, 1.4, 0), vr: 1.2, size: 0.3, life: 0.5, grow: 1, opacity: 0.4 });
    }

    this.paintPoops(run, dt);
    this.paintDeer(run.deer, run);
    this.paintFlowers(run);

    // カメラは Spra の横の位置に、なめらかについていく
    this.camX += (run.x * 0.55 - this.camX) * Math.min(1, dt * 4);
    this.aim();
    this.finishFrame(dt);
  }

  private paintPoops(run: SweepRun, dt: number): void {
    const alive = new Set<number>();
    for (const p of run.poops) {
      alive.add(p.id);
      let pm = this.poopMeshes.get(p.id);
      if (!pm) {
        const g = new THREE.Group(), mat = p.hard ? this.poopMat.hard : this.poopMat.normal;
        const [a, b, c] = this.poopGeo;
        const t1 = new THREE.Mesh(a, mat); t1.rotation.x = Math.PI / 2; t1.position.y = 0.3;
        const t2 = new THREE.Mesh(b, mat); t2.rotation.x = Math.PI / 2; t2.position.y = 0.72;
        const t3 = new THREE.Mesh(c, mat); t3.position.y = 1.12;
        for (const m of [t1, t2, t3]) { m.castShadow = true; g.add(m); }
        this.scene.add(g);
        pm = { g, pop: 1, wobble: 0 };
        this.poopMeshes.set(p.id, pm);
      }
      this.placePoop(p, pm, run, dt);
    }
    for (const [id, pm] of this.poopMeshes) if (!alive.has(id)) { this.scene.remove(pm.g); this.poopMeshes.delete(id); }
  }
  private placePoop(p: Poop, pm: PoopMesh, run: SweepRun, dt: number): void {
    pm.pop = Math.min(1, pm.pop + dt / 0.3);
    // 掃かれるたびに、小さくなる(のこりの固さ)
    const left = 0.45 + 0.55 * (p.hp / p.maxHp), size = POOP_SIZE[p.kind] * left;
    const k = ease(pm.pop), drop = (1 - k) * 0.5;
    pm.g.scale.set(size * (0.7 + 0.3 * k), size * (0.5 + 0.5 * k), size * (0.7 + 0.3 * k));
    pm.g.position.copy(this.at(run, p.s, p.x, drop));
    // ほうきの範囲に入っていると、ぷるぷる
    pm.g.rotation.z = run.inReach(p) ? Math.sin(this.time * 30 + p.id) * 0.08 : 0;
  }

  private paintDeer(list: SweepDeer[], run: SweepRun): void {
    const alive = new Set<number>();
    for (const d of list) {
      alive.add(d.id);
      let ds = this.deerSprites.get(d.id);
      if (!ds) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08 }));
        s.center.set(0.5, 0.02);
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 1.4, 1);
        this.scene.add(s, shadow);
        ds = { s, shadow };
        this.deerSprites.set(d.id, ds);
      }
      const dir = d.dir > 0 ? 'ur' : 'ul', frame = `${d.kind}_${dir}_${Math.floor(this.time * 8 + d.id) % 4}`;
      const tex = this.deerTex[frame], mat = ds.s.material;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      const img = tex.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img.height ? img.width / img.height : 0.72, h = DEER_H[d.kind];
      // 落とした直後は、ちょっと しっぽを上げる(縦にのびる)
      const pose = d.dropPose > 0 ? 1 + Math.sin((d.dropPose / 0.3) * Math.PI) * 0.06 : 1;
      ds.s.scale.set(h * aspect, h * pose, 1);
      const pos = this.at(run, d.s, d.x, Math.abs(Math.sin(this.time * 8 + d.id)) * 0.03);
      ds.s.position.copy(pos);
      ds.shadow.position.set(pos.x, 0.011, pos.z);
    }
    for (const [id, ds] of this.deerSprites) {
      if (alive.has(id)) continue;
      this.scene.remove(ds.s, ds.shadow);
      ds.s.material.dispose(); (ds.shadow.material as THREE.Material).dispose(); ds.shadow.geometry.dispose();
      this.deerSprites.delete(id);
    }
  }

  private paintFlowers(run: SweepRun): void {
    const alive = new Set<number>();
    for (const f of run.flowers) {
      alive.add(f.id);
      let s = this.flowerSprites.get(f.id);
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flowerTex[Math.floor(f.hue * this.flowerTex.length)], transparent: true, alphaTest: 0.1 }));
        s.center.set(0.5, 0.05);
        this.scene.add(s);
        this.flowerSprites.set(f.id, s);
      }
      // ぽん と咲く
      const k = ease(f.t / 0.45), bounce = 1 + Math.sin(clamp(f.t / 0.6, 0, 1) * Math.PI) * 0.25;
      s.scale.setScalar(0.9 * k * bounce);
      s.position.copy(this.at(run, f.s, f.x));
      s.visible = s.position.z < 6;
    }
    for (const [id, s] of this.flowerSprites) if (!alive.has(id)) { this.scene.remove(s); s.material.dispose(); this.flowerSprites.delete(id); }
  }

  private finishFrame(dt: number): void {
    this.particles = this.particles.filter(p => {
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { this.scene.remove(p.s); p.s.material.dispose(); return false; }
      p.v.y -= p.gravity * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.multiplyScalar(1 + p.grow * dt);
      p.s.material.rotation += p.spin * dt;
      p.s.material.opacity = p.base * (1 - k * k);
      return true;
    });
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.08, sy = (Math.random() - 0.5) * this.shake * 0.08;
    this.camera.position.x += sx; this.camera.position.y += sy;
    this.renderer.render(this.scene, this.camera);
    this.camera.position.x -= sx; this.camera.position.y -= sy;
  }

  /** やり直すとき: うんこ・鹿・お花・粒の絵を片づける(番号は 1 から振りなおしになる) */
  clearRun(): void {
    for (const pm of this.poopMeshes.values()) this.scene.remove(pm.g);
    this.poopMeshes.clear();
    for (const ds of this.deerSprites.values()) { this.scene.remove(ds.s, ds.shadow); ds.s.material.dispose(); }
    this.deerSprites.clear();
    for (const s of this.flowerSprites.values()) { this.scene.remove(s); s.material.dispose(); }
    this.flowerSprites.clear();
    for (const p of this.particles) { this.scene.remove(p.s); p.s.material.dispose(); }
    this.particles = [];
  }

  dispose(): void {
    this.ro.disconnect();
    for (const d of this.disposables) d.dispose();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
