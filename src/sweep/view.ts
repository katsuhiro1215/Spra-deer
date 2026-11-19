// WORLD 3「奈良公園、大掃除！」の描画(three.js)。参道・木・灯籠・大仏さま・Spra となかま・ほうき・うんこ・鹿・お花・ゲート・たる・走ってくる鹿。
// ルールは sim.ts。ここは、その状態を絵にするだけ。道のり s は奥(−z)へのびる。Spra は z=0 にいて、世界のほうが手前へ流れる。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WBAL, type Bolt, type Poop, type SweepDeer, type SweepEvent, type SweepRun } from './sim.ts';
import type { DeerKind, PoopKind, SweepLevel } from './levels.ts';

const ASSET = '/assets';
const DEER_H: Record<DeerKind, number> = { fawn: 1.3, doe: 1.45, stag: 1.6 };
const POOP_SIZE: Record<PoopKind, number> = { small: 0.2, medium: 0.3, large: 0.42 };
const SPRA_H = 1.05;
/** なかまの Spra の大きさ(先頭の何倍) */
const HELPER = 0.62;
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
type Helper = { s: THREE.Sprite; broom: THREE.Group; zone: THREE.Mesh; shadow: THREE.Mesh; pop: number };
type GateObj = { g: THREE.Group; s: number; panels: THREE.Mesh[]; i: number };
type Tumbler = { s: THREE.Sprite; v: THREE.Vector3; spin: number; life: number };

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
  /** 大仏さま(大仏さまの出る面だけ) */
  private buddha: THREE.Mesh | null = null;
  private buddhaTex: THREE.Texture[] = [];
  /** ゴール(名所の絵か、赤い鳥居) */
  private goal!: THREE.Object3D;
  /** 雨のすじ・雨の強さ(0〜1。なめらかに かわる) */
  private rain: THREE.LineSegments | null = null;
  private rainK = 0;
  private hemi!: THREE.HemisphereLight;
  private hemiBase = 1.0;
  private sky = { clear: new THREE.Color('#bfe2f2'), fog: new THREE.Color('#d4e9ef'), rain: new THREE.Color('#7f8d99'), rainFog: new THREE.Color('#8e9aa4') };
  /** 夜の面: Spra の持つ灯り・ゆらめく火(お松明・ろうそく) */
  private lamp: THREE.PointLight | null = null;
  private flames: THREE.Object3D[] = [];
  /** 風の強さ(−1〜1。なめらかに かわる) */
  private windK = 0;
  /** 池(浮見堂)の水面の模様 */
  private waterTex: THREE.Texture | null = null;
  /** 雷(予告の輪・落ちた光・こげあと) */
  private boltObjs = new Map<number, { ring: THREE.Mesh; beam: THREE.Mesh; scorch: THREE.Mesh }>();
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
  private poopMat: { normal: THREE.MeshStandardMaterial; hard: THREE.MeshStandardMaterial; wet: THREE.MeshStandardMaterial };
  private poopGeo: THREE.BufferGeometry[];
  private flowerTex: THREE.Texture[] = [];
  private flowerSprites = new Map<number, THREE.Sprite>();
  private particles: Particle[] = [];
  private pmat: Record<'soft' | 'star' | 'crumb' | 'petal', THREE.SpriteMaterial>;
  private tmpV = new THREE.Vector3();
  private length: number;
  private level: SweepLevel;
  private helpers: Helper[] = [];
  private shownTeam = 1;
  private gates: GateObj[] = [];
  private barrelObjs = new Map<number, { g: THREE.Group; shake: number }>();
  private chargerSprites = new Map<number, { s: THREE.Sprite; shadow: THREE.Mesh }>();
  private stagFront: THREE.Texture;
  private tumblers: Tumbler[] = [];

  constructor(host: HTMLElement, level: SweepLevel) {
    this.host = host;
    this.level = level;
    this.length = level.length;
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
    this.hemi = new THREE.HemisphereLight(0xe4f1ff, 0x7a6a48, 1.0);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
    sun.position.set(-4, 9, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 30;
    sun.target.position.set(0, 0, -4);
    this.scene.add(sun, sun.target);
    // 夜: 空も霧も 紺色に、月あかり。Spra のまわりだけ あたたかい灯り
    if (level.night) {
      this.sky = { clear: new THREE.Color('#0d1330'), fog: new THREE.Color('#121a3a'), rain: new THREE.Color('#0a0f22'), rainFog: new THREE.Color('#0e1428') };
      this.scene.background = this.sky.clear.clone();
      this.scene.fog = new THREE.Fog(this.sky.fog.clone(), 7, 30);
      this.hemi.color.set('#8a9cff'); this.hemi.groundColor.set('#2a2230');
      this.hemiBase = 0.2;
      sun.color.set('#9fb4ff'); sun.intensity = 0.22;
      this.renderer.toneMappingExposure = 0.9;
      this.scene.environmentIntensity = 0.12;
      this.lamp = new THREE.PointLight('#ffc27a', 9, 9, 1.6);
      this.scene.add(this.lamp);
    }

    // 地面: 芝と、まん中の参道(砂利)。歩くと、模様が手前へ流れる
    this.grassTex = grainTex('#8fc266', [['#7db257', 900, 3], ['#a6d47b', 700, 2], ['#6aa047', 300, 2]], 3);
    this.grassTex.repeat.set(20, 30);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), new THREE.MeshStandardMaterial({ map: this.grassTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.z = -35; ground.receiveShadow = true;
    // 道: 春日大社・東大寺は石だたみ、ほかは砂利
    const stoneWay = level.place === 'kasuga' || level.place === 'todaiji' || level.place === 'naramachi' || level.place === 'nigatsudo';
    this.pathTex = stoneWay
      ? grainTex('#c9c4b8', [['#b4aea2', 1100, 4], ['#dcd8cd', 700, 3], ['#9f998d', 400, 2]], 9)
      : grainTex(level.place === 'wakakusa' ? '#e3d3a8' : '#dcc8a0', [['#cbb38a', 1200, 3], ['#ebdcbc', 700, 2], ['#b9a07a', 300, 2], ['#f4ead2', 200, 1]], 5);
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
    this.buildGoal();
    if (level.rain?.length) this.buildRain();

    // 大仏さま(ボスの面だけ)。目が光ると、絵を光る目にかえる
    if (level.buddha) {
      this.buddhaTex = [loadTex(`${ASSET}/runner/daibutsu_0.png`), loadTex(`${ASSET}/runner/daibutsu_1.png`)];
      this.disposables.push(...this.buddhaTex);
      this.buddha = new THREE.Mesh(new THREE.PlaneGeometry(10, 9.2), new THREE.MeshBasicMaterial({ map: this.buddhaTex[0], transparent: true, alphaTest: 0.1, fog: false }));
      this.scene.add(this.buddha);
    }

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
      // 雨で べちゃべちゃ(こい色で、てかてか)
      wet: new THREE.MeshStandardMaterial({ color: '#4e2c14', roughness: 0.12, metalness: 0.25 }),
    };
    this.poopGeo = [new THREE.TorusGeometry(0.62, 0.32, 10, 24), new THREE.TorusGeometry(0.42, 0.27, 10, 22), new THREE.ConeGeometry(0.34, 0.5, 14)];
    this.disposables.push(...this.poopGeo, this.poopMat.normal, this.poopMat.hard, this.poopMat.wet);

    this.buildHelpers();
    this.buildGates();
    this.stagFront = loadTex(`${ASSET}/bake/stag_front.png`);
    this.disposables.push(this.stagFront);
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
    // 場所ごとに: 春日大社は灯籠がずらり、若草山は 木が少なく ひらけた草原、奈良公園は 芝で休む鹿
    // ならまちは 町家と ろうそく(燈花会)、浮見堂は 左に池、二月堂は 杉と灯籠
    const place = this.level.place;
    if (this.level.night) lamp.emissiveIntensity = 2.4;
    if (place === 'naramachi') { this.buildTown(); this.buildStalls(); return; }
    const cedar = place === 'kasuga' || place === 'nigatsudo';
    const gap = cedar ? 2.6 : PROP_GAP;
    const lanternRate = place === 'kasuga' ? 1 : place === 'nigatsudo' ? 0.55 : place === 'wakakusa' ? 0 : place === 'kofukuji' || place === 'ukimido' ? 0.2 : 0.32;
    if (cedar) leafMats.forEach((m, i) => m.color.set(['#3f7a33', '#4a8a3a', '#356d2c', '#58964a'][i]));
    // 道のり全体ぶんを、はじめに置いておく(見えない所は fog と、カメラの外)
    for (let s = -10; s < this.length + 30; s += gap) {
      for (const side of [-1, 1]) {
        const k = s * 2 + (side > 0 ? 1 : 0), r = hash(k);
        let obj: THREE.Object3D;
        const x = side * (WBAL.half + 1.0 + r * 3.5) * (place === 'wakakusa' ? 1.8 : 1);
        if (place === 'wakakusa' && r > 0.3) continue;
        // 浮見堂: 左は 池(木は 右だけ)
        if (place === 'ukimido' && side < 0) continue;
        if (cedar && r > 0.5) {
          // 灯籠のうしろの杉
          const tree = new THREE.Group();
          const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.2; tree.add(trunk);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 8), leafMats[Math.floor(r * 4) % 4]); cone.position.y = 3.4; cone.castShadow = true; tree.add(cone);
          tree.scale.setScalar(0.9 + r * 0.5);
          this.props.push({ obj: tree, s: s + 1.3, x: side * (WBAL.half + 2.2 + r * 2) });
          this.scene.add(tree);
        }
        if (r < lanternRate) {
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
    // 奈良公園: 芝で休む鹿(にぎやかし)
    if (place === 'park' || place === 'wakakusa') {
      const lie = loadTex(`${ASSET}/bake/stag_lie.png`);
      this.disposables.push(lie);
      for (let s = 4; s < this.length + 20; s += 9) {
        const r = hash(s * 3.1), side = r < 0.5 ? -1 : 1;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lie, transparent: true, alphaTest: 0.1 }));
        sp.center.set(0.5, 0.02); sp.scale.set(1.1, 1.25, 1);
        this.scene.add(sp);
        this.props.push({ obj: sp, s, x: side * (WBAL.half + 1.2 + hash(s * 7.7) * 3) });
      }
    }
    // 若草山: 奥に、なだらかな 緑の山
    if (place === 'wakakusa') {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7fb85a', roughness: 1, fog: false }));
      hill.scale.set(40, 11, 14); hill.position.set(4, -1, -70);
      this.scene.add(hill);
    }
    if (place === 'ukimido') this.buildPond();
    this.buildStalls();
  }
  /** ならまち: 格子の町家が ならび、参道の両はしに ろうそく(燈花会)。夜は 格子の中が ぽうっと明るい */
  private buildTown(): void {
    const lattice = canvasTex(256, 256, g => {
      g.fillStyle = '#ffcf87'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#3a271b';
      for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 9, 256);
      g.fillRect(0, 0, 256, 40); g.fillRect(0, 160, 256, 96);
    });
    this.disposables.push(lattice);
    const wall = new THREE.MeshStandardMaterial({ color: '#4a3426', roughness: 0.9 });
    const front = new THREE.MeshStandardMaterial({ map: lattice, emissive: new THREE.Color('#ffb060'), emissiveMap: lattice, emissiveIntensity: this.level.night ? 0.9 : 0.1, roughness: 0.8 });
    const roof = new THREE.MeshStandardMaterial({ color: '#3b3f47', roughness: 0.7 });
    const paper = new THREE.MeshStandardMaterial({ color: '#e8453a', emissive: new THREE.Color('#ff7a3a'), emissiveIntensity: this.level.night ? 1.6 : 0.2 });
    const bodyGeo = new THREE.BoxGeometry(2.4, 2.6, 3.8), roofGeo = new THREE.BoxGeometry(1.6, 0.12, 4.0), lanternGeo = new THREE.SphereGeometry(0.16, 12, 8);
    for (let s = -10; s < this.length + 30; s += 4) {
      for (const side of [-1, 1]) {
        const r = hash(s * 3 + side), g = new THREE.Group();
        // 参道に向いた面だけ 格子(左の家は +x、右の家は −x)
        const mats = side < 0 ? [front, wall, wall, wall, wall, wall] : [wall, front, wall, wall, wall, wall];
        const body = new THREE.Mesh(bodyGeo, mats); body.position.y = 1.3; body.castShadow = true; g.add(body);
        for (const k of [-1, 1]) { const rf = new THREE.Mesh(roofGeo, roof); rf.position.set(k * 0.68, 2.85, 0); rf.rotation.z = -k * 0.42; g.add(rf); }
        // 軒先の ちょうちん
        if (r < 0.55) { const lt = new THREE.Mesh(lanternGeo, paper); lt.scale.y = 1.3; lt.position.set(-side * 1.35, 2.05, (r - 0.3) * 2); g.add(lt); }
        g.scale.y = 0.9 + r * 0.25;
        this.scene.add(g);
        this.props.push({ obj: g, s: s + r * 0.4, x: side * (WBAL.half + 2.1) });
      }
    }
    this.buildCandles();
  }
  /** 燈花会: 参道の両はしに、ろうそくの灯りが 2列 */
  private buildCandles(): void {
    const glow = canvasTex(64, 64, g => {
      const grd = g.createRadialGradient(32, 36, 0, 32, 36, 30);
      grd.addColorStop(0, 'rgba(255,240,200,1)'); grd.addColorStop(0.3, 'rgba(255,180,90,0.6)'); grd.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    });
    this.disposables.push(glow);
    const mat = new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const cupMat = new THREE.MeshStandardMaterial({ color: '#f4efe4', emissive: new THREE.Color('#ffcf87'), emissiveIntensity: 1.2, roughness: 0.6 });
    const cupGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.12, 8);
    for (let s = -10; s < this.length + 30; s += 1.4) {
      for (const side of [-1, 1]) for (const row of [0, 1]) {
        const g = new THREE.Group();
        const cup = new THREE.Mesh(cupGeo, cupMat); cup.position.y = 0.06; g.add(cup);
        const sp = new THREE.Sprite(mat); sp.scale.setScalar(0.45); sp.position.y = 0.18; sp.userData.base = 0.45; g.add(sp);
        this.flames.push(sp);
        this.scene.add(g);
        this.props.push({ obj: g, s: s + row * 0.7 + hash(s * 5 + side) * 0.2, x: side * (WBAL.half + 0.25 + row * 0.38) });
      }
    }
  }
  /** 浮見堂: 参道の左に 池(水面の模様が ゆっくり流れる) */
  private buildPond(): void {
    this.waterTex = grainTex('#4f86a8', [['#5f97b9', 600, 6], ['#3f7697', 500, 5], ['#9cc8de', 160, 3]], 11);
    this.waterTex.repeat.set(10, 30);
    const pond = new THREE.Mesh(new THREE.PlaneGeometry(30, 90), new THREE.MeshStandardMaterial({ map: this.waterTex, roughness: 0.15, metalness: 0.2 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(-WBAL.half - 0.9 - 15, 0.012, -35);
    const bank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 90), new THREE.MeshStandardMaterial({ color: '#8f8a7e', roughness: 0.95 }));
    bank.position.set(-WBAL.half - 0.8, 0.05, -35);
    this.scene.add(pond, bank);
  }
  /** せんべい売り場の屋台(赤い屋根・「鹿せんべい」の のぼり・つんだ せんべい) */
  private buildStalls(): void {
    const stalls = this.level.stalls ?? [];
    if (!stalls.length) return;
    const banner = canvasTex(64, 256, g => {
      g.fillStyle = '#f7f2e4'; g.fillRect(0, 0, 64, 256);
      g.fillStyle = '#c8302a'; g.fillRect(0, 0, 64, 14);
      g.fillStyle = '#5a2a14'; g.font = 'bold 38px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      [...'鹿せんべい'].forEach((ch, i) => g.fillText(ch, 32, 46 + i * 42));
    });
    this.disposables.push(banner);
    const wood = new THREE.MeshStandardMaterial({ color: '#9a6a3c', roughness: 0.8 }), cloth = new THREE.MeshStandardMaterial({ color: '#d8463a', roughness: 0.7 });
    const senbei = new THREE.MeshStandardMaterial({ color: '#d9a65a', roughness: 0.8 }), flag = new THREE.MeshBasicMaterial({ map: banner, side: THREE.DoubleSide });
    for (const st of stalls) {
      const g = new THREE.Group();
      const counter = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.6), wood); counter.position.y = 0.4; counter.castShadow = true; g.add(counter);
      for (const [px, pz] of [[-0.45, -0.75], [0.45, -0.75], [-0.45, 0.75], [0.45, 0.75]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), wood); p.position.set(px, 0.9, pz); g.add(p); }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 2.0), cloth); roof.position.y = 1.82; roof.rotation.z = st.side * 0.15; roof.castShadow = true; g.add(roof);
      for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), senbei); c.position.set(-st.side * 0.15, 0.82 + i * 0.035, (i % 3 - 1) * 0.4); g.add(c); }
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.36), flag); fl.position.set(-st.side * 0.62, 1.25, 0.9); g.add(fl);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 6), wood); pole.position.set(-st.side * 0.8, 1.0, 0.9); g.add(pole);
      this.scene.add(g);
      this.props.push({ obj: g, s: st.s, x: st.side * (WBAL.half + 1.0) });
    }
  }
  /** ゴール: 名所の絵(興福寺の五重塔・春日大社の楼門 など)か、赤い鳥居 */
  private buildGoal(): void {
    const gd = this.level.goal;
    if (gd.img) {
      const tex = loadTex(gd.img);
      this.disposables.push(tex);
      const w = gd.w ?? 8, h = gd.h ?? 6;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1, fog: false }));
      m.position.y = h / 2 - 0.2;
      const g = new THREE.Group(); g.add(m);
      this.goal = g;
    } else if (gd.model === 'ukimido') {
      this.goal = this.buildUkimido();
    } else if (gd.model === 'nigatsudo') {
      this.goal = this.buildNigatsudo();
    } else {
      const red = new THREE.MeshStandardMaterial({ color: '#d8342c', roughness: 0.5 }), black = new THREE.MeshStandardMaterial({ color: '#2a2422', roughness: 0.6 });
      const g = new THREE.Group();
      for (const x of [-WBAL.half - 0.3, WBAL.half + 0.3]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.6, 14), red); pl.position.set(x, 2.3, 0); pl.castShadow = true; g.add(pl); }
      const kasagi = new THREE.Mesh(new THREE.BoxGeometry(WBAL.half * 2 + 2.2, 0.32, 0.5), black); kasagi.position.y = 4.75; g.add(kasagi);
      const shimaki = new THREE.Mesh(new THREE.BoxGeometry(WBAL.half * 2 + 1.8, 0.26, 0.44), red); shimaki.position.y = 4.45; g.add(shimaki);
      const nuki = new THREE.Mesh(new THREE.BoxGeometry(WBAL.half * 2 + 1.2, 0.22, 0.3), red); nuki.position.y = 3.6; g.add(nuki);
      this.goal = g;
    }
    this.scene.add(this.goal);
  }
  /** 浮見堂: 池に うかぶ 六角形の おどう(ひのきの屋根・白木の柱) */
  private buildUkimido(): THREE.Group {
    const g = new THREE.Group();
    const water = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshStandardMaterial({ color: '#4f86a8', roughness: 0.15, metalness: 0.2 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.014, -3);
    const post = new THREE.MeshStandardMaterial({ color: '#d9c8a6', roughness: 0.7 }), roof = new THREE.MeshStandardMaterial({ color: '#4c4644', roughness: 0.75 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 0.25, 6), post); floor.position.set(0, 0.5, -3);
    g.add(water, floor);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), post); p.position.set(Math.cos(a) * 2.8, 1.8, -3 + Math.sin(a) * 2.8); p.castShadow = true; g.add(p);
    }
    const rf = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.9, 6), roof); rf.position.set(0, 3.9, -3); rf.castShadow = true; g.add(rf);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshStandardMaterial({ color: '#c9a440', metalness: 0.7, roughness: 0.3 })); top.position.set(0, 4.95, -3); g.add(top);
    // 参道から おどうへの 橋
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(WBAL.half * 1.4, 0.2, 3), post); bridge.position.set(0, 0.3, 1.2); g.add(bridge);
    g.scale.setScalar(1.15);
    return g;
  }
  /** 二月堂: 山の斜面に 柱で立つ 舞台づくり。のきに つり灯籠、舞台で お松明が もえる */
  private buildNigatsudo(): THREE.Group {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#7a4e30', roughness: 0.8 }), wall = new THREE.MeshStandardMaterial({ color: '#d8cdb4', roughness: 0.9 }), roof = new THREE.MeshStandardMaterial({ color: '#3d3a38', roughness: 0.7 });
    for (let i = -3; i <= 3; i++) for (const z of [-1.6, 0, 1.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.6, 8), wood); p.position.set(i * 1.5, 1.8, z - 4); p.castShadow = true; g.add(p); }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 4.4), wood); deck.position.set(0, 3.7, -4); g.add(deck);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.6, 3.4), wall); hall.position.set(0, 5.15, -4.6); g.add(hall);
    const rf = new THREE.Mesh(new THREE.ConeGeometry(8.2, 2.6, 4), roof); rf.rotation.y = Math.PI / 4; rf.scale.set(1, 1, 0.45); rf.position.set(0, 7.6, -4.6); rf.castShadow = true; g.add(rf);
    const lanternMat = new THREE.MeshStandardMaterial({ color: '#c9a440', emissive: new THREE.Color('#ffb347'), emissiveIntensity: this.level.night ? 2 : 0.3, metalness: 0.5, roughness: 0.4 });
    for (let i = -3; i <= 3; i++) { const lt = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.4, 6), lanternMat); lt.position.set(i * 1.3, 6.2, -2.4); g.add(lt); }
    // お松明(舞台の上で もえる火)
    const fire = new THREE.MeshBasicMaterial({ color: '#ff8a1a', transparent: true, opacity: 0.9, fog: false });
    for (const x of [-4.2, -1.4, 1.4, 4.2]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), fire); f.position.set(x, 4.4, -2.2); f.userData.base = 1; g.add(f); this.flames.push(f); }
    // 画面の上(表示の下)に かくれないように、ひくめに
    g.scale.setScalar(0.62);
    return g;
  }
  /** 雨のすじ(カメラのまわりの箱の中を、くり返し落ちる) */
  private buildRain(): void {
    const n = 420, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 14, y = Math.random() * 9, z = -Math.random() * 24 + 4;
      pos.set([x, y, z, x + 0.05, y - 0.45, z + 0.08], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#dfeaf5', transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  /** なかまの Spra(いちばん多い人数ぶん、はじめに作って、人数だけ見せる) */
  private buildHelpers(): void {
    for (let i = 0; i < this.level.teamMax - 1; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.spraTex.l[0], transparent: true, alphaTest: 0.1 }));
      s.center.set(0.5, 0.02); s.visible = false; s.renderOrder = 3;
      const broom = this.broom.clone();
      broom.scale.setScalar(HELPER * 0.75); broom.visible = false;
      const zone = new THREE.Mesh(this.zone.geometry, new THREE.MeshBasicMaterial({ color: '#fff6c8', transparent: true, opacity: 0.1, depthWrite: false }));
      zone.rotation.x = -Math.PI / 2; zone.renderOrder = 1; zone.visible = false;
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2; shadow.visible = false;
      this.scene.add(s, broom, zone, shadow);
      this.helpers.push({ s, broom, zone, shadow, pop: 1 });
    }
  }
  /** ゲート: 参道を横ぎる門。左右に数字の板(+ は青、× は金、− は赤) */
  private buildGates(): void {
    const postMat = new THREE.MeshStandardMaterial({ color: '#c8302a', roughness: 0.6 });
    const panelTex = (label: string) => canvasTex(256, 128, g => {
      const bad = label[0] === '-', mul = label[0] === 'x';
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, bad ? '#ff6a5a' : mul ? '#ffd84a' : '#5fb8ff'); grd.addColorStop(1, bad ? '#c8302a' : mul ? '#e09a10' : '#1e78dc');
      g.fillStyle = grd; g.beginPath(); g.roundRect(6, 6, 244, 116, 20); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 8; g.stroke();
      g.fillStyle = mul ? '#5a3200' : '#ffffff';
      g.font = 'bold 76px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label.replace('x', '×').replace('-', '−'), 128, 68);
    });
    (this.level.gates ?? []).forEach((gd, i) => {
      const g = new THREE.Group();
      const panels = [gd.left, gd.right].map((label, k) => {
        const tex = panelTex(label);
        this.disposables.push(tex);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(WBAL.half - 0.15, 1.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
        m.position.set((k ? 1 : -1) * WBAL.half / 2, 1.55, 0); m.renderOrder = 4;
        g.add(m);
        return m;
      });
      for (const x of [-WBAL.half - 0.1, 0, WBAL.half + 0.1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.1, 10), postMat);
        post.position.set(x, 1.05, 0); post.castShadow = true;
        g.add(post);
      }
      this.scene.add(g);
      this.gates.push({ g, s: gd.s, panels, i });
    });
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
      case 'herd':
        // 群れが 来る: 足音で 少し ゆれる
        this.shake = Math.max(this.shake, 0.25);
        break;
      case 'wind':
        this.shake = Math.max(this.shake, 0.2);
        break;
      case 'gate': {
        const gt = this.gates[e.id!];
        const at = new THREE.Vector3((e.x ?? 1) * WBAL.half / 2, 1.5, -0.3);
        if (gt) gt.panels[(e.x ?? 1) < 0 ? 0 : 1].scale.setScalar(1.3);
        this.emit((e.n ?? 0) >= 0 ? 'star' : 'soft', at, { n: (e.n ?? 0) >= 0 ? 26 : 10, spread: 1.6, vr: 3, size: 0.22, life: 0.9, gravity: 2, color: (e.n ?? 0) >= 0 ? undefined : '#ff8a7a' });
        if ((e.n ?? 0) < 0) this.shake = Math.max(this.shake, 0.4);
        break;
      }
      case 'barrelHit': {
        const b = this.barrelObjs.get(e.id!);
        if (b) b.shake = 0.2;
        if (p) this.emit('crumb', p.setY(0.6), { n: 4, spread: 0.3, vr: 1.5, size: 0.07, life: 0.4, gravity: 5, color: '#a8743a' });
        break;
      }
      case 'barrel':
        if (!p) break;
        this.emit('crumb', p.clone().setY(0.5), { n: 18, spread: 0.5, vr: 3, size: 0.1, life: 0.7, gravity: 6, color: '#a8743a' });
        this.emit('star', p.setY(0.9), { n: 22, spread: 0.6, vr: 2.6, size: 0.2, life: 0.9, gravity: 2 });
        break;
      case 'bump': {
        // はじき飛ばされた なかま(先頭にぶつかったときは、まわりの なかま)
        if (!p) break;
        for (let k = 0; k < (e.n ?? 1); k++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.spraTex.l[0], transparent: true, alphaTest: 0.1 }));
          s.center.set(0.5, 0.5);
          const img = this.spraTex.l[0].image as { width?: number; height?: number } | undefined;
          const aspect = img?.width && img.height ? img.width / img.height : 0.6;
          s.scale.set(SPRA_H * HELPER * aspect, SPRA_H * HELPER, 1);
          s.position.copy(p).setY(0.5).add(new THREE.Vector3(k * 0.3, 0, 0));
          this.scene.add(s);
          const side = (e.x ?? 0) >= 0 ? 1 : -1;
          this.tumblers.push({ s, v: new THREE.Vector3(side * (2.5 + Math.random() * 1.5), 4 + Math.random() * 1.5, 1.2), spin: side * (8 + Math.random() * 4), life: 0 });
        }
        this.emit('soft', p.setY(0.4), { n: 6, spread: 0.4, v: new THREE.Vector3(0, 0.6, 0), vr: 1, size: 0.4, life: 0.6, grow: 1.2, color: '#e8dcc4', opacity: 0.8 });
        this.shake = Math.max(this.shake, e.hard ? 0.6 : 0.3);
        break;
      }
      case 'bolt':
        if (!p) break;
        this.emit('star', p.clone().setY(0.3), { n: 26, spread: 1.4, vr: 4, size: 0.22, life: 0.6, gravity: 3, color: this.level.bolts?.fire ? '#ff9a2a' : '#fff6a0' });
        this.emit('soft', p.setY(0.2), { n: 8, spread: 1.2, v: new THREE.Vector3(0, 0.8, 0), vr: 1, size: 0.6, life: 0.9, grow: 1.2, color: '#5a5652', opacity: 0.6 });
        this.shake = Math.max(this.shake, 0.9);
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
    if (this.waterTex) { this.waterTex.offset.y = (d / 90) * 30 % 1; this.waterTex.offset.x = (this.time * 0.02) % 1; }
    // ゆらめく火(ろうそく・お松明)
    this.flames.forEach((f, i) => f.scale.setScalar((f.userData.base ?? 1) * (0.88 + 0.14 * Math.sin(this.time * (11 + (i % 5)) + i * 1.7))));
    if (this.lamp) this.lamp.position.set(run.x, 1.7, -0.8);
    for (const pr of this.props) {
      const z = -(pr.s - d);
      pr.obj.visible = z < 6 && z > -64;
      pr.obj.position.set(pr.x, 0, z);
    }
    // ゴール(遠くても見えるように、ある所より奥には行かない)。ボスの面は、大仏殿の前に 大仏さまが 立ちはだかる
    const boss = !!this.buddha;
    const gz = -(run.level.length + (boss ? 18 : 3) - d);
    this.goal.position.set(0, 0, Math.max(gz, boss ? -68 : -56));
    if (this.buddha) {
      const bz = -(run.level.length + 5 - d);
      this.buddha.position.set(0, 4.3, Math.max(bz, -52));
      (this.buddha.material as THREE.MeshBasicMaterial).map = this.buddhaTex[run.buddha === 'glow' || (run.buddha === 'warn' && Math.sin(this.time * 18) > 0.3) ? 1 : 0];
      // ボスなので、ずっと 奥に 見えている
    }
    this.paintWeather(run, dt);

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

    this.paintHelpers(run, dt, frame, sw);
    this.paintGates(run, dt);
    this.paintBarrels(run, dt);
    this.paintChargers(run);
    this.paintPoops(run, dt);
    this.paintDeer(run.deer, run);
    this.paintFlowers(run);

    // カメラは Spra の横の位置に、なめらかについていく
    this.camX += (run.x * 0.55 - this.camX) * Math.min(1, dt * 4);
    this.aim();
    this.finishFrame(dt);
  }

  /** 雨(空が暗くなり、すじが落ちる)と雷(予告の赤い輪 → 光の柱 → こげあと) */
  private paintWeather(run: SweepRun, dt: number): void {
    this.rainK += ((run.raining ? 1 : 0) - this.rainK) * Math.min(1, dt * 1.5);
    const k = this.rainK;
    (this.scene.background as THREE.Color).copy(this.sky.clear).lerp(this.sky.rain, k);
    (this.scene.fog as THREE.Fog).color.copy(this.sky.fog).lerp(this.sky.rainFog, k);
    this.hemi.intensity = this.hemiBase * (1.0 - 0.35 * k);
    // 風: 雨すじが ななめに、葉っぱが 横へ 飛ぶ。Spra も 少し かたむく
    this.windK += (run.wind - this.windK) * Math.min(1, dt * 3);
    const wk = this.windK;
    if (Math.abs(wk) > 0.15 && Math.random() < dt * 30 * Math.abs(wk)) {
      const z = -1 - Math.random() * 12;
      this.emit('petal', new THREE.Vector3(this.camX - Math.sign(wk) * 6, 0.3 + Math.random() * 2.2, z), { n: 1, spread: 0.5, v: new THREE.Vector3(wk * 7, 0.4, 0.3), vr: 1.2, size: 0.13, life: 1.6, color: Math.random() < 0.6 ? '#6fae47' : '#c9a25a' });
    }
    if (Math.abs(wk) > 0.15 && Math.random() < dt * 14) this.emit('soft', new THREE.Vector3(this.camX - Math.sign(wk) * 5, 0.2 + Math.random() * 1.5, -Math.random() * 8), { n: 1, spread: 0.3, v: new THREE.Vector3(wk * 9, 0, 0), size: 0.5, life: 0.8, grow: 2, color: '#ffffff', opacity: 0.18 });
    this.spra.material.rotation = -wk * 0.12;
    if (this.rain) {
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.8 * k;
      this.rain.visible = k > 0.02;
      if (this.rain.visible) {
        const a = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute, arr = a.array as Float32Array;
        for (let i = 0; i < arr.length; i += 6) {
          let y = arr[i + 1] - 15 * dt;
          if (y < 0) y += 9;
          arr[i + 1] = y; arr[i + 4] = y - 0.45;
          arr[i] = arr[i + 3] - 0.05 - wk * 0.35;
        }
        a.needsUpdate = true;
        this.rain.position.x = this.camX;
      }
    }
    const alive = new Set<number>();
    for (const b of run.bolts) {
      alive.add(b.id);
      let o = this.boltObjs.get(b.id);
      if (!o) o = this.makeBolt();
      this.boltObjs.set(b.id, o);
      this.placeBolt(b, o, run);
    }
    for (const [id, o] of this.boltObjs) if (!alive.has(id)) { this.scene.remove(o.ring, o.beam, o.scorch); for (const m of [o.ring, o.beam, o.scorch]) { (m.material as THREE.Material).dispose(); } this.boltObjs.delete(id); }
  }
  private makeBolt() {
    // お松明の火の粉は オレンジの輪と、火の柱
    const fire = !!this.level.bolts?.fire;
    const ring = new THREE.Mesh(new THREE.RingGeometry(WBAL.boltR * 0.82, WBAL.boltR, 40), new THREE.MeshBasicMaterial({ color: fire ? '#ff9a1a' : '#ff3a2a', transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(fire ? 0.3 : 0.14, fire ? 0.5 : 0.3, 16, 8, 1, true), new THREE.MeshBasicMaterial({ color: fire ? '#ffb347' : '#fffbd0', transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
    beam.renderOrder = 6;
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(WBAL.boltR * 0.8, 24), new THREE.MeshBasicMaterial({ color: '#2a2018', transparent: true, opacity: 0.5, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    this.scene.add(ring, beam, scorch);
    return { ring, beam, scorch };
  }
  private placeBolt(b: Bolt, o: { ring: THREE.Mesh; beam: THREE.Mesh; scorch: THREE.Mesh }, run: SweepRun): void {
    const p = this.at(run, b.s, b.x);
    const warn = b.t < 0, prog = warn ? 1 + b.t / WBAL.boltWarn : 0;
    o.ring.visible = warn;
    o.ring.position.copy(p).setY(0.03);
    // 予告: 輪が ちかちか、だんだん速く
    (o.ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.45 * Math.abs(Math.sin(this.time * (8 + prog * 18)));
    o.ring.scale.setScalar(1 + (1 - prog) * 0.25);
    o.beam.visible = !warn && b.t < 0.22;
    o.beam.position.copy(p).setY(8);
    o.beam.scale.set(1 + Math.random() * 0.4, 1, 1 + Math.random() * 0.4);
    o.scorch.visible = !warn;
    o.scorch.position.copy(p).setY(0.02);
    (o.scorch.material as THREE.MeshBasicMaterial).opacity = warn ? 0 : 0.5 * Math.max(0, 1 - b.t / 1.2);
  }

  private paintHelpers(run: SweepRun, dt: number, frame: number, sw: number): void {
    const ms = run.members(), st = run.stats;
    if (run.team > this.shownTeam) for (let i = this.shownTeam - 1; i < run.team - 1; i++) if (this.helpers[i]) this.helpers[i].pop = 0;
    this.shownTeam = run.team;
    this.helpers.forEach((h, i) => {
      const m = ms[i + 1], on = !!m;
      h.s.visible = h.broom.visible = h.shadow.visible = h.zone.visible = on;
      if (!m) return;
      h.pop = Math.min(1, h.pop + dt / 0.35);
      const k = ease(h.pop), bounce = 1 + Math.sin(Math.min(1, h.pop) * Math.PI) * 0.35;
      const tex = this.spraTex[this.spraDir][(frame + i) % 3], mat = h.s.material;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      const img = tex.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img.height ? img.width / img.height : 0.6, hh = SPRA_H * HELPER * k * bounce;
      h.s.scale.set(hh * aspect, hh, 1);
      const z = -m.a + 0.25, bob = run.pace > 0.5 ? Math.abs(Math.sin(this.time * 9 + i)) * 0.03 : 0;
      h.s.position.set(m.x, bob + (1 - k) * 0.6, z);
      h.shadow.position.set(m.x, 0.012, z);
      h.broom.position.set(m.x + 0.22, 0, z - 0.3);
      h.broom.rotation.y = -0.6 + sw * 1.4 * (i % 2 ? 1 : 0.85);
      h.broom.visible = st.level < 4;
      const reach = st.reach * WBAL.helperReach;
      h.zone.position.set(m.x, 0.021, -m.a - reach / 2);
      h.zone.scale.set(WBAL.helperWidth, reach, 1);
    });
    // はじき飛ばされた なかま
    this.tumblers = this.tumblers.filter(t => {
      t.life += dt;
      t.v.y -= 12 * dt;
      t.s.position.addScaledVector(t.v, dt);
      t.s.material.rotation += t.spin * dt;
      t.s.material.opacity = Math.max(0, 1 - t.life / 1.1);
      if (t.life > 1.1) { this.scene.remove(t.s); t.s.material.dispose(); return false; }
      return true;
    });
  }
  private paintGates(run: SweepRun, dt: number): void {
    for (const gt of this.gates) {
      const z = -(gt.s - run.d);
      gt.g.visible = z < 4 && z > -60;
      gt.g.position.set(0, 0, z);
      // 通ったあとは、えらばなかった側を うすく
      const passed = run.gateIndex > gt.i;
      gt.panels.forEach(pn => {
        pn.scale.setScalar(Math.max(1, pn.scale.x - dt * 1.2));
        (pn.material as THREE.MeshBasicMaterial).opacity = passed && pn.scale.x <= 1.0001 ? 0.35 : 0.92;
      });
    }
  }
  private paintBarrels(run: SweepRun, dt: number): void {
    const alive = new Set<number>();
    for (const b of run.barrels) {
      alive.add(b.id);
      let o = this.barrelObjs.get(b.id);
      if (!o) {
        const g = new THREE.Group();
        const wood = new THREE.MeshStandardMaterial({ color: '#b07a45', roughness: 0.7 }), band = new THREE.MeshStandardMaterial({ color: '#4a4a52', metalness: 0.6, roughness: 0.4 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.72, 20), wood);
        body.position.y = 0.36; body.castShadow = true;
        g.add(body);
        for (const y of [0.14, 0.58]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.025, 6, 24), band); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }
        // ふたの上に、なかまの Spra の顔(中にいる)
        const peek = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.spraTex.l[1], transparent: true, alphaTest: 0.1 }));
        peek.center.set(0.5, 0); peek.scale.set(0.3, 0.5, 1); peek.position.y = 0.6;
        g.add(peek);
        this.scene.add(g);
        o = { g, shake: 0 };
        this.barrelObjs.set(b.id, o);
      }
      o.shake = Math.max(0, o.shake - dt);
      o.g.position.copy(this.at(run, b.s, b.x)).add(new THREE.Vector3(Math.sin(this.time * 60) * o.shake * 0.15, 0, 0));
      o.g.scale.setScalar(0.85 + 0.15 * (b.hp / b.maxHp));
    }
    for (const [id, o] of this.barrelObjs) if (!alive.has(id)) { this.scene.remove(o.g); this.barrelObjs.delete(id); }
  }
  private paintChargers(run: SweepRun): void {
    const alive = new Set<number>();
    for (const c of run.chargers) {
      alive.add(c.id);
      let o = this.chargerSprites.get(c.id);
      if (!o) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.stagFront, transparent: true, alphaTest: 0.08 }));
        s.center.set(0.5, 0.02);
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.2, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        this.scene.add(s, shadow);
        o = { s, shadow };
        this.chargerSprites.set(c.id, o);
      }
      const img = this.stagFront.image as { width?: number; height?: number } | undefined;
      const aspect = img?.width && img.height ? img.width / img.height : 0.74;
      o.s.scale.set(1.45 * aspect, 1.45, 1);
      const pos = this.at(run, c.s, c.x, Math.abs(Math.sin(this.time * 14 + c.id)) * 0.18);
      o.s.position.copy(pos);
      o.shadow.position.set(pos.x, 0.012, pos.z);
      if (Math.random() < 0.3) this.emit('soft', pos.clone().setY(0.1), { n: 1, spread: 0.4, v: new THREE.Vector3(0, 0.3, 1), vr: 0.4, size: 0.3, life: 0.5, grow: 1, color: '#e0d2b4', opacity: 0.6 });
    }
    for (const [id, o] of this.chargerSprites) if (!alive.has(id)) { this.scene.remove(o.s, o.shadow); o.s.material.dispose(); this.chargerSprites.delete(id); }
  }

  private paintPoops(run: SweepRun, dt: number): void {
    const alive = new Set<number>();
    for (const p of run.poops) {
      alive.add(p.id);
      let pm = this.poopMeshes.get(p.id);
      if (!pm) {
        const g = new THREE.Group(), mat = p.hard ? this.poopMat.hard : p.wet ? this.poopMat.wet : this.poopMat.normal;
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
    for (const o of this.barrelObjs.values()) this.scene.remove(o.g);
    this.barrelObjs.clear();
    for (const o of this.chargerSprites.values()) { this.scene.remove(o.s, o.shadow); o.s.material.dispose(); }
    this.chargerSprites.clear();
    for (const t of this.tumblers) { this.scene.remove(t.s); t.s.material.dispose(); }
    this.tumblers = [];
    this.shownTeam = 1;
  }
  /** 画面の位置(たる・走ってくる鹿のふきだし用) */
  barrelTop(run: SweepRun, s: number, x: number): THREE.Vector3 { return this.at(run, s, x, 1.25); }

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
