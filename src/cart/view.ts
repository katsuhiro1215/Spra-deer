// WORLD 8「鹿と暴走トロッコ」の描画(three.js)。山の地形・線路・木の橋・トロッコ・鹿・Spra・カメラ。
// 走りのルールは sim.ts。ここは、その結果を絵にするだけ。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COLLAPSE_AT, type Gap, type Track } from './track.ts';
import { BAL, type CartRun } from './sim.ts';

const ASSET = '/assets';
const CHUNK = 150; // 木・岩をまとめる長さ(見えない所は描かない)
const RAIL = 0.62; // レールの、まん中からの距離
const RAIL_TOP = 0.16; // 線路の基準の高さから、レールの上面まで
const DEER_AHEAD = 3.6; // 鹿は、トロッコのこれだけ前を走る
const SKY_TOP = 0x3f86d8, SKY_HORIZON = 0xd9e8f1;

type Frame = { o: THREE.Vector3; t: THREE.Vector3; r: THREE.Vector3; u: THREE.Vector3; curv: number };
const newFrame = (): Frame => ({ o: new THREE.Vector3(), t: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), curv: 0 });

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth01 = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

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
/** ざらざらした面(地面・砂利・木)。base の色に、明るい・暗い粒をまく。 */
function grainTex(base: string, dots: [string, number, number][], lines?: { color: string; every: number }): THREE.CanvasTexture {
  const rnd = mulberry(base.length * 977 + dots.length);
  return canvasTex(256, 256, g => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (const [color, n, size] of dots) {
      g.fillStyle = color;
      for (let i = 0; i < n; i++) g.fillRect(rnd() * 256, rnd() * 256, size * (0.5 + rnd()), size * (0.5 + rnd()));
    }
    if (lines) {
      g.strokeStyle = lines.color; g.lineWidth = 2;
      for (let y = lines.every; y < 256; y += lines.every) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    }
  }, true);
}
function loadTex(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function softDot(): THREE.CanvasTexture {
  return canvasTex(64, 64, g => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
}
/** 形に色をつける(まとめて1つの形にするため、色は頂点に持たせる)。 */
function tint(geo: THREE.BufferGeometry, color: number, vary = 0, rnd?: () => number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.getAttribute('position').count, c = new THREE.Color(color), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd ? (rnd() - 0.5) * vary : 0);
    for (let j = 0; j < 3 && i + j < n; j++) { arr[(i + j) * 3] = c.r * k; arr[(i + j) * 3 + 1] = c.g * k; arr[(i + j) * 3 + 2] = c.b * k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
/** でこぼこにする(岩・葉のかたまり)。 */
function lumpy(geo: THREE.BufferGeometry, amount: number, rnd: () => number): THREE.BufferGeometry {
  const p = geo.getAttribute('position') as THREE.BufferAttribute, seen = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = seen.get(key);
    if (k === undefined) { k = 1 + (rnd() - 0.5) * amount; seen.set(key, k); }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

type Item = { s: number; m: THREE.Matrix4; color?: THREE.Color };

export class CartView {
  private track: Track;
  private host: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 9 / 16, 0.3, 1200);
  private sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
  private sky: THREE.Mesh;
  private far = new THREE.Group();
  private cart = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private lever!: THREE.Object3D;
  private lantern!: THREE.Object3D;
  private spra!: THREE.Mesh;
  private deer!: THREE.Mesh;
  private deerTex: THREE.Texture[] = [];
  private shadowCart!: THREE.Mesh;
  private shadowDeer!: THREE.Mesh;
  private coinMesh: Record<'silver' | 'gold' | 'premium', THREE.InstancedMesh>;
  private coinSlot = new Map<number, { mesh: THREE.InstancedMesh; i: number; f: Frame; s: number }>();
  private obstacleObj = new Map<number, THREE.Object3D>();
  private streaks!: THREE.InstancedMesh;
  private streakPos: { s: number; u: number; h: number; len: number }[] = [];
  private leaves!: THREE.Points;
  private leafData: { s: number; u: number; h: number; ph: number }[] = [];
  private sparks!: THREE.Points;
  private sparkData: { life: number; v: THREE.Vector3 }[] = [];
  private puffs: { sp: THREE.Sprite; life: number; v: THREE.Vector3 }[] = [];
  private f = newFrame(); private f2 = newFrame(); private f3 = newFrame();
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camReady = false; private lookD = 20;
  /** 崩れる橋の、切れ目をふさいでいる板(近づくと落ちる) */
  private collapse: { gap: Gap; g: THREE.Group; fall: number; vy: number; spin: THREE.Vector3 }[] = [];
  private shake = 0; private time = 0; private failT = 0; private wasAir = false; private spin = 0; private deerClock = 0;
  private frames = 0; private slowFrames = 0; private tuned = false;
  private ro: ResizeObserver;
  private dummy = new THREE.Object3D();
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private m1 = new THREE.Matrix4();
  private disposables: { dispose(): void }[] = [];
  /** 区間ごとにまとめた木・岩(遠い区間は描かない) */
  private chunks: { mesh: THREE.InstancedMesh; from: number; to: number }[] = [];

  constructor(host: HTMLElement, track: Track) {
    this.host = host; this.track = track;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'ks-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.Fog(SKY_HORIZON, 70, 430);

    // 光: 空からのやわらかい光と、太陽(影を落とす)。金属(レール・車輪・コイン)には、まわりの明るさを映す
    const pmrem = new THREE.PMREMGenerator(this.renderer), env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env; this.scene.environmentIntensity = 0.45;
    pmrem.dispose(); this.disposables.push(env);
    this.scene.add(new THREE.HemisphereLight(0xd6e9ff, 0x6b5a40, 0.85));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 170;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.sky = this.buildSky();
    this.buildFar();
    this.buildTerrain();
    this.buildTrack();
    this.buildBridges();
    this.buildCollapse();
    this.buildScenery();
    this.buildObstacles();
    this.buildSigns();
    this.coinMesh = this.buildCoins();
    this.buildCart();
    this.buildEffects();
    this.scene.add(this.cart);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  // ---- 線路の上の位置と向き ----
  /** 線路の点 s の、位置・進む向き(t)・右(r)・上(u)。カーブでは、内側が下がるように傾く(カント)。 */
  private frame(s: number, out: Frame, bank = true): Frame {
    const p = this.track.at(Math.max(0, s));
    const ch = Math.cos(p.heading), sh = Math.sin(p.heading), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    out.t.set(sh * cp, sp, -ch * cp);
    out.o.set(p.x, p.y, p.z);
    if (s < 0) out.o.addScaledVector(out.t, s); // スタートより手前は、まっすぐ延ばす
    out.r.set(ch, 0, sh);
    out.u.crossVectors(out.r, out.t);
    out.curv = p.curv;
    if (bank) {
      const b = clamp(p.curv * 7, -0.16, 0.16), cb = Math.cos(b), sb = Math.sin(b);
      this.v1.copy(out.r);
      out.r.multiplyScalar(cb).addScaledVector(out.u, -sb);
      out.u.multiplyScalar(cb).addScaledVector(this.v1, sb);
    }
    return out;
  }
  /** 線路から横へ u はなれた所の、地面の高さと位置。 */
  private ground(s: number, u: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.track.at(Math.max(0, s)), T = this.track.terrain(Math.max(0, s));
    const ch = Math.cos(p.heading), sh = Math.sin(p.heading);
    let x = p.x, y = p.y, z = p.z;
    if (s < 0) { const cp = Math.cos(p.pitch); x += sh * cp * s; y += Math.sin(p.pitch) * s; z -= ch * cp * s; }
    // カーブの内側は、曲がりの中心より先へ行かない(地面が折り重ならないように)
    let ue = u;
    if (Math.abs(p.curv) > 1e-4 && Math.sign(u) === Math.sign(p.curv)) ue = Math.sign(u) * Math.min(Math.abs(u), 0.85 / Math.abs(p.curv));
    const d = Math.max(0, Math.abs(ue) - 2.3), g = ue < 0 ? T.l : T.r;
    const rise = g > 0 ? Math.min(T.cap, g * d) : g * d;
    const far = Math.min(1, d / 9);
    const n = (Math.sin(s * 0.11 + ue * 0.07) + Math.sin(s * 0.043 - ue * 0.13 + 1.7) + 0.5 * Math.sin(s * 0.31 + ue * 0.23)) * (far * 1.6 + d * 0.035);
    const h = y - 0.42 - T.depth + rise * smooth01(d / 1.4) + n;
    return out.set(x + ch * ue, h, z + sh * ue);
  }

  // ---- 空と遠くの山 ----
  private buildSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(SKY_TOP) }, horizon: { value: new THREE.Color(SKY_HORIZON) }, sunDir: { value: new THREE.Vector3(-0.45, 0.62, -0.64).normalize() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir;
        void main(){ float h = clamp(vDir.y, -0.2, 1.0); vec3 c = mix(horizon, top, pow(smoothstep(-0.02, 0.75, h), 0.7));
          float s = max(0.0, dot(normalize(vDir), sunDir)); c += vec3(1.0, 0.9, 0.7) * (pow(s, 220.0) * 1.4 + pow(s, 9.0) * 0.22);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), mat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky);
    this.disposables.push(sky.geometry, mat);
    return sky;
  }
  /** 遠くの山なみ(3重)と雲。カメラといっしょに動くので、近づかない。 */
  private buildFar(): void {
    const rnd = mulberry(8101);
    const ring = (radius: number, base: number, peak: number, color: number, seed: number) => {
      const n = 120, pos: number[] = [], idx: number[] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const h = base + peak * (0.5 + 0.5 * Math.sin(a * 5 + seed)) * (0.6 + 0.4 * Math.sin(a * 13 + seed * 2)) + peak * 0.25 * Math.sin(a * 31 + seed * 3);
        pos.push(Math.cos(a) * radius, -160, Math.sin(a) * radius, Math.cos(a) * radius, h, Math.sin(a) * radius);
        if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -9;
      this.far.add(m); this.disposables.push(geo, mat);
    };
    ring(860, 40, 150, 0xa9c3d6, 1.3);
    ring(700, 10, 120, 0x8fb0c4, 4.1);
    ring(560, -20, 95, 0x6f96a6, 7.7);
    const cloud = softDot(), cmat = new THREE.SpriteMaterial({ map: cloud, color: 0xffffff, fog: false, transparent: true, opacity: 0.5, depthWrite: false });
    this.disposables.push(cloud, cmat);
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, r = 420 + rnd() * 300;
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Sprite(cmat);
        sp.position.set(Math.cos(a) * r + (rnd() - 0.5) * 120, 210 + rnd() * 170 + k * 6, Math.sin(a) * r + (rnd() - 0.5) * 90);
        sp.scale.set(220 + rnd() * 160, 60 + rnd() * 40, 1); sp.renderOrder = -8;
        this.far.add(sp);
      }
    }
    this.scene.add(this.far);
  }

  // ---- 地面 ----
  private buildTerrain(): void {
    const us = [-150, -105, -75, -54, -39, -28, -20, -14, -10, -7, -5, -3.6, -2.3, 0, 2.3, 3.6, 5, 7, 10, 14, 20, 28, 39, 54, 75, 105, 150];
    const s0 = -45, step = 3, rows = Math.floor((this.track.total - s0) / step) + 1, cols = us.length;
    const pos = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), col = new Float32Array(rows * cols * 3), idx: number[] = [];
    const v = new THREE.Vector3();
    for (let r = 0; r < rows; r++) {
      const s = s0 + r * step;
      for (let c = 0; c < cols; c++) {
        this.ground(s, us[c], v);
        const i = r * cols + c;
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
        uv[i * 2] = us[c] / 5; uv[i * 2 + 1] = s / 5;
        if (r < rows - 1 && c < cols - 1) idx.push(i, i + 1, i + cols, i + 1, i + cols + 1, i + cols);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // 色: 平らな所は草と落ち葉、急な所は岩、線路ぎわは土
    const nrm = geo.getAttribute('normal'), grass = new THREE.Color(), rock = new THREE.Color(0x8b8478), dirt = new THREE.Color(0x8a7a5e), c1 = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      const s = s0 + r * step;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c, u = us[c], ny = nrm.getY(i);
        const patch = 0.5 + 0.5 * Math.sin(s * 0.07 + u * 0.19) * Math.sin(s * 0.023 - u * 0.11);
        grass.setHex(0x5f8f3e).lerp(c1.setHex(0x9a8a45), patch * 0.55); // 草〜落ち葉
        c1.copy(grass).lerp(rock, smooth01((0.86 - ny) / 0.2));
        if (Math.abs(u) < 3.7) c1.lerp(dirt, Math.abs(u) < 2.4 ? 1 : 0.6);
        const shade = 0.9 + 0.2 * Math.sin(s * 0.9 + u * 1.7) * Math.sin(u * 0.6);
        col[i * 3] = c1.r * shade; col[i * 3 + 1] = c1.g * shade; col[i * 3 + 2] = c1.b * shade;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const map = grainTex('#d9d9d9', [['#ffffff', 900, 3], ['#b8b8b8', 900, 3], ['#9c9c9c', 240, 5]]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.disposables.push(geo, mat, map);

    // 谷底の川
    const water = new THREE.MeshStandardMaterial({ color: 0x3f86ad, roughness: 0.18, metalness: 0.25, transparent: true, opacity: 0.9 });
    this.disposables.push(water);
    for (const g of this.track.segments.filter(x => x.terrain === 'canyon')) {
      const mid = (g.from + g.to) / 2, f = this.frame(mid, this.f, false), depth = this.track.terrain(mid).depth;
      const geoW = new THREE.PlaneGeometry(320, Math.max(18, g.len * 0.42));
      const m = new THREE.Mesh(geoW, water);
      m.position.copy(f.o).addScaledVector(new THREE.Vector3(0, 1, 0), -depth + 0.9);
      m.rotation.set(-Math.PI / 2, 0, -Math.atan2(f.t.x, -f.t.z));
      this.scene.add(m); this.disposables.push(geoW);
    }
  }

  /** 線路にそった帯(砂利の道床・橋の板・レール)。ranges の区間だけ作る。half=幅の半分、off=横ずれ、y=高さ、thick=厚み(0 なら面だけ)。 */
  private ribbon(ranges: [number, number][], half: number, off: number, y: number, thick: number, vScale: number): THREE.BufferGeometry {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], f = this.f;
    for (const [a, b] of ranges) {
      const n = Math.max(1, Math.ceil(b - a)), base = pos.length / 3, per = thick > 0 ? 4 : 2;
      for (let i = 0; i <= n; i++) {
        const s = a + ((b - a) * i) / n;
        this.frame(s, f);
        const push = (side: number, dy: number, tu: number) => {
          this.v1.copy(f.o).addScaledVector(f.r, off + side * half).addScaledVector(f.u, y + dy);
          pos.push(this.v1.x, this.v1.y, this.v1.z); uv.push(tu, s * vScale);
        };
        push(-1, 0, 0); push(1, 0, 1);
        if (thick > 0) { push(-1, -thick, 0.1); push(1, -thick, 0.9); }
        if (i < n) {
          const k = base + i * per, m = k + per;
          idx.push(k, k + 1, m, k + 1, m + 1, m);
          if (thick > 0) idx.push(k + 2, k, m + 2, k, m, m + 2, k + 1, k + 3, m + 1, k + 3, m + 3, m + 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  /** 全体から、切れ目(と、橋の所/橋でない所)をのぞいた区間。 */
  private ranges(kind: 'all' | 'ground' | 'bridge'): [number, number][] {
    const out: [number, number][] = [];
    let from: number | null = null;
    for (let s = -45; s <= this.track.total; s++) {
      const bridge = this.track.terrain(Math.max(0, s)).depth > 1.2;
      const ok = !this.track.inGap(s) && (kind === 'all' || (kind === 'bridge') === bridge);
      if (ok && from === null) from = s;
      if (!ok && from !== null) { out.push([from, s - (this.track.inGap(s) ? 1 : 0)]); from = null; }
    }
    if (from !== null) out.push([from, this.track.total]);
    return out.filter(([a, b]) => b - a > 0.5);
  }

  // ---- 線路(道床・枕木・レール) ----
  private buildTrack(): void {
    const gravel = grainTex('#8f897d', [['#b3ad9f', 1400, 3], ['#6d675d', 1400, 3], ['#a59a85', 500, 4]]);
    const bedMat = new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 });
    const bed = new THREE.Mesh(this.ribbon(this.ranges('ground'), 1.55, 0, -0.06, 0.34, 0.4), bedMat);
    bed.receiveShadow = true; bed.frustumCulled = false;
    const railMat = new THREE.MeshStandardMaterial({ color: 0xa9adb5, roughness: 0.32, metalness: 0.75 });
    const all = this.ranges('all');
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(this.ribbon(all, 0.045, side * RAIL, RAIL_TOP, 0.13, 0.5), railMat);
      rail.castShadow = true; rail.frustumCulled = false;
      this.scene.add(rail); this.disposables.push(rail.geometry);
    }
    this.scene.add(bed);
    this.disposables.push(bed.geometry, bedMat, gravel, railMat);

    // 枕木。切れ目の手前は黄色くぬって「ここで跳ぶ」の目印にする
    const wood = grainTex('#6a4c36', [['#7d5c44', 500, 6], ['#523927', 500, 6]], { color: '#4a3323', every: 32 });
    const mat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.95 });
    const geo = new THREE.BoxGeometry(2.05, 0.13, 0.26);
    const spots: number[] = [];
    for (let s = -44; s < this.track.total; s += 0.85) if (!this.track.inGap(s) && !this.track.gaps.some(g => Math.abs(s - g.from) < 0.25 || Math.abs(s - g.to) < 0.25)) spots.push(s);
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const rnd = mulberry(77), c = new THREE.Color();
    spots.forEach((s, i) => {
      const f = this.frame(s, this.f);
      this.m1.makeBasis(f.r, f.u, this.v1.copy(f.t).negate()).setPosition(this.v2.copy(f.o).addScaledVector(f.u, -0.03));
      mesh.setMatrixAt(i, this.m1);
      const mark = this.track.gaps.some(g => !g.collapse && s < g.from && g.from - s < 9);
      mesh.setColorAt(i, mark ? c.setHex(Math.floor(s / 0.85) % 2 ? 0xffd23a : 0xff7b2e) : c.setScalar(0.82 + rnd() * 0.36));
    });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.disposables.push(geo, mat, wood);
  }

  // ---- 崩れる橋: 切れ目をふさぐ古い板とレール。近づくと落ちる ----
  private buildCollapse(): void {
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.95 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8d8a86, roughness: 0.5, metalness: 0.6 });
    const tieGeo = new THREE.BoxGeometry(2.05, 0.13, 0.26);
    this.disposables.push(deckMat, railMat, tieGeo);
    for (const gap of this.track.gaps.filter(g => g.collapse)) {
      const span: [number, number][] = [[gap.from - 0.3, gap.to + 0.3]];
      const c = this.frame((gap.from + gap.to) / 2, this.f, false).o.clone();
      const g = new THREE.Group();
      g.position.copy(c);
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
        geo.translate(-c.x, -c.y, -c.z);
        const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        g.add(m); this.disposables.push(geo);
      };
      add(this.ribbon(span, 1.35, 0, -0.08, 0.16, 0.6), deckMat);
      for (const side of [-1, 1]) add(this.ribbon(span, 0.045, side * RAIL, RAIL_TOP, 0.13, 0.5), railMat);
      for (let s = gap.from + 0.4; s < gap.to; s += 0.85) {
        const f = this.frame(s, this.f);
        const m = new THREE.Mesh(tieGeo, deckMat);
        m.position.copy(f.o).addScaledVector(f.u, -0.03).sub(c);
        m.setRotationFromMatrix(this.m1.makeBasis(f.r, f.u, this.v1.copy(f.t).negate()));
        g.add(m);
      }
      this.scene.add(g);
      this.collapse.push({ gap, g, fall: -1, vy: 0, spin: new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.9) });
    }
  }
  private updateCollapse(run: CartRun, dt: number): void {
    for (const c of this.collapse) {
      const d = c.gap.from - run.s;
      if (c.fall < 0 && d < COLLAPSE_AT && run.phase !== 'ready') {
        c.fall = 0; this.bump(0.25);
        this.puff(this.v1.copy(c.g.position), 10, 3);
      }
      if (c.fall >= 0) {
        c.fall += dt; c.vy -= 16 * dt;
        c.g.position.y += c.vy * dt;
        c.g.rotation.x += c.spin.x * dt; c.g.rotation.y += c.spin.y * dt; c.g.rotation.z += c.spin.z * dt;
        if (c.fall > 4) c.g.visible = false;
      } else if (d < COLLAPSE_AT + 30) {
        // 崩れる前: ぐらぐら ゆれる
        c.g.rotation.z = Math.sin(this.time * 31) * 0.012; c.g.rotation.x = Math.sin(this.time * 23) * 0.008;
      }
    }
  }
  /** チェックポイントから続けるとき: まだ通っていない崩れる橋は、元にもどす */
  resetCollapse(s: number): void {
    for (const c of this.collapse) {
      if (c.gap.from - s < COLLAPSE_AT) { c.fall = 99; c.g.visible = false; continue; }
      c.fall = -1; c.vy = 0; c.g.visible = true; c.g.rotation.set(0, 0, 0);
      c.g.position.copy(this.frame((c.gap.from + c.gap.to) / 2, this.f, false).o);
    }
  }

  // ---- 木の橋(渓谷) ----
  private buildBridges(): void {
    const plank = grainTex('#7a5a3e', [['#8f6c4c', 400, 7], ['#5f4430', 400, 7]], { color: '#3d2a1c', every: 20 });
    const deckMat = new THREE.MeshStandardMaterial({ map: plank, roughness: 0.95 });
    const bridge = this.ranges('bridge');
    const deck = new THREE.Mesh(this.ribbon(bridge, 1.35, 0, -0.08, 0.16, 0.6), deckMat);
    deck.castShadow = true; deck.receiveShadow = true; deck.frustumCulled = false;
    this.scene.add(deck);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x5d4330, roughness: 0.95 });
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(this.ribbon(bridge, 0.14, side * 0.95, -0.24, 0.34, 0.5), beamMat);
      beam.castShadow = true; beam.frustumCulled = false;
      this.scene.add(beam); this.disposables.push(beam.geometry);
    }
    // 橋脚(柱・横木・すじかい)
    const box = new THREE.BoxGeometry(1, 1, 1), items: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), g = new THREE.Vector3();
    const place = (center: THREE.Vector3, sx: number, sy: number, sz: number, basis: THREE.Matrix4, rollZ = 0) => {
      const m = new THREE.Matrix4().copy(basis);
      if (rollZ) m.multiply(new THREE.Matrix4().makeRotationZ(rollZ));
      m.scale(new THREE.Vector3(sx, sy, sz)).setPosition(center);
      items.push(m);
    };
    for (const [a, b] of bridge) {
      for (let s = Math.ceil(a / 6) * 6; s <= b; s += 6) {
        if (this.track.gaps.some(x => s > x.from - 1 && s < x.to + 1)) continue;
        const f = this.frame(s, this.f, false);
        this.ground(s, 0, g);
        const h = f.o.y - 0.4 - g.y;
        if (h < 1.5) continue;
        const basis = new THREE.Matrix4().makeBasis(f.r, up, this.v1.crossVectors(f.r, up));
        for (const side of [-1, 1]) {
          const base = new THREE.Vector3().copy(f.o).addScaledVector(f.r, side * (1.0 + h * 0.035)); // 上は板の下、下へ行くほど外へ開く
          place(new THREE.Vector3(base.x, f.o.y - 0.4 - h / 2, base.z), 0.3, h + 0.6, 0.3, basis, side * -0.07);
        }
        for (let y = 3.2; y < h; y += 5.5) {
          const w = 2.6 + y * 0.14;
          place(new THREE.Vector3(f.o.x, f.o.y - 0.4 - y, f.o.z), w, 0.2, 0.2, basis);
          if (y + 5.5 < h + 2.5) place(new THREE.Vector3(f.o.x, f.o.y - 0.4 - y - 2.75, f.o.z), Math.hypot(w, 5.5), 0.16, 0.16, basis, Math.atan2(5.5, w) * (Math.round(y) % 2 ? 1 : -1));
        }
        place(new THREE.Vector3(f.o.x, f.o.y - 0.5, f.o.z), 3.1, 0.28, 0.34, basis);
      }
    }
    // 切れ目のふち: おれて垂れた板
    for (const gap of this.track.gaps) {
      for (const [s, dir] of [[gap.from, 1], [gap.to, -1]] as const) {
        const f = this.frame(s, this.f);
        for (let k = 0; k < 4; k++) {
          const tilt = 0.5 + k * 0.22, off = (k - 1.5) * 0.62;
          q.setFromAxisAngle(f.r, -dir * tilt);
          const m = new THREE.Matrix4().makeBasis(f.r, f.u, this.v1.copy(f.t).negate());
          m.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
          m.scale(new THREE.Vector3(0.5, 0.07, 1.5 + (k % 2) * 0.5));
          m.setPosition(new THREE.Vector3().copy(f.o).addScaledVector(f.r, off).addScaledVector(f.t, dir * 0.55).addScaledVector(f.u, -0.45 - k * 0.08));
          items.push(m);
        }
      }
    }
    const inst = new THREE.InstancedMesh(box, beamMat, items.length);
    items.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false;
    this.scene.add(inst);
    this.disposables.push(deck.geometry, deckMat, plank, beamMat, box);
  }

  /** 同じ形をたくさん置く。s の区間ごとにまとめて、見えない所は描かない。 */
  private scatter(geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], shadow = true): void {
    const groups = new Map<number, Item[]>();
    for (const it of items) { const k = Math.floor(it.s / CHUNK); (groups.get(k) ?? groups.set(k, []).get(k)!).push(it); }
    for (const [k, list] of groups) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      this.chunks.push({ mesh, from: k * CHUNK, to: (k + 1) * CHUNK });
      list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); if (it.color) mesh.setColorAt(i, it.color); });
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
    }
    this.disposables.push(geo, mat);
  }

  // ---- 木・岩 ----
  private buildScenery(): void {
    const rnd = mulberry(20261117);
    // 杉: 幹と、重なった円すい
    // 近くの木は細かく、遠くの木は粗く作る(軽くするため)
    const cedarOf = (layers: number[][], seg: number) => {
      const parts: THREE.BufferGeometry[] = [tint(new THREE.CylinderGeometry(0.16, 0.3, 3.4, seg > 6 ? 6 : 4, 1, true).translate(0, 1.7, 0), 0x5b4130)];
      layers.forEach(([r, h, y], i) => parts.push(tint(new THREE.ConeGeometry(r, h, seg, 1, true).rotateY(i * 0.7).translate(0, y, 0), 0xffffff, 0.22, rnd)));
      return mergeGeometries(parts)!;
    };
    const cedar = cedarOf([[2.3, 3.4, 2.6], [1.9, 3.0, 4.4], [1.45, 2.7, 6.0], [1.0, 2.4, 7.5], [0.55, 1.9, 8.8]], 8);
    const cedarFar = cedarOf([[2.3, 4.2, 3.0], [1.6, 3.6, 5.6], [0.9, 3.0, 8.0]], 6);
    // もみじ: 幹と、でこぼこの葉のかたまり
    const mapleOf = (blobs: number[][], detail: number) => {
      const parts: THREE.BufferGeometry[] = [tint(new THREE.CylinderGeometry(0.14, 0.24, 2.6, detail ? 6 : 4, 1, true).translate(0, 1.3, 0), 0x4e3a2b)];
      blobs.forEach(([r, x, y, z]) => parts.push(tint(lumpy(new THREE.IcosahedronGeometry(r, detail), 0.3, rnd).translate(x, y, z), 0xffffff, 0.2, rnd)));
      return mergeGeometries(parts)!;
    };
    const maple = mapleOf([[1.7, 0, 3.4, 0], [1.25, 1.1, 2.9, 0.3], [1.3, -0.9, 3.0, -0.5]], 1);
    const mapleFar = mapleOf([[1.9, 0, 3.5, 0], [1.3, 0.8, 4.3, 0.2]], 0);
    const rock = tint(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.45, rnd), 0xffffff, 0.16, rnd);
    const stone = tint(lumpy(new THREE.IcosahedronGeometry(1, 0), 0.45, rnd), 0xffffff, 0.16, rnd);
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });

    const cedars: Item[] = [], maples: Item[] = [], cedarsFar: Item[] = [], maplesFar: Item[] = [], rocks: Item[] = [], stones: Item[] = [];
    const greens = [0x2f6a3a, 0x3a7a42, 0x27603a, 0x44803f], autumn = [0xd4472a, 0xe8822b, 0xf0bd35, 0xc9552a, 0x86ac48, 0xe2a02e];
    const p = new THREE.Vector3(), e = new THREE.Euler(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const put = (list: Item[], s: number, u: number, scale: number, color: number, sink = 0.15, squash = 1) => {
      this.ground(s, u, p);
      p.y -= sink * scale;
      q.setFromEuler(e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08));
      list.push({ s, m: new THREE.Matrix4().compose(p, q, sc.set(scale, scale * squash, scale)), color: new THREE.Color(color).multiplyScalar(0.85 + rnd() * 0.3) });
    };
    for (let s = -40; s < this.track.total; s += 2.6) {
      const T = this.track.terrain(Math.max(0, s)), curv = this.track.at(Math.max(0, s)).curv;
      for (const side of [-1, 1]) {
        const slope = side < 0 ? T.l : T.r, wall = slope > 1.3; // 切り通しの岩かべ
        // 線路ぎわの石
        if (rnd() < 0.5 && T.depth < 1) put(stones, s + rnd() * 2, side * (2.0 + rnd() * 1.6), 0.12 + rnd() * 0.22, 0x9a958a, 0.3, 0.7);
        if (wall && rnd() < 0.55) put(rocks, s + rnd() * 2, side * (3.4 + rnd() * 5), 0.7 + rnd() * 1.3, 0x8d877b, 0.35, 0.8);
        const tries = T.depth > 3 ? 1 : 3;
        for (let k = 0; k < tries; k++) {
          // 近くは少なめ、遠くまで広く
          const u = side * (6.5 + Math.pow(rnd(), 1.7) * 95);
          if (Math.abs(curv) > 1e-4 && Math.sign(u) === Math.sign(curv) && Math.abs(u) > 0.7 / Math.abs(curv)) continue;
          if (wall && Math.abs(u) < 9) continue;
          if (T.depth > 3 && Math.abs(u) < 30 && rnd() < 0.8) continue;
          const nearDensity = Math.abs(u) < 14 ? 0.5 : 0.85;
          if (rnd() > nearDensity) continue;
          const kind = Math.sin(s * 0.021 + side * 2) + (rnd() - 0.5) * 1.6;
          const near = Math.abs(u) < 24;
          if (kind > 0.1) put(near ? cedars : cedarsFar, s + rnd() * 2, u, 0.85 + rnd() * 0.75, greens[Math.floor(rnd() * greens.length)]);
          else put(near ? maples : maplesFar, s + rnd() * 2, u, 0.9 + rnd() * 0.8, autumn[Math.floor(rnd() * autumn.length)]);
        }
        if (rnd() < 0.05 && T.depth < 1 && !wall) put(rocks, s, side * (4 + rnd() * 10), 0.6 + rnd() * 1.1, 0x8d877b, 0.4, 0.75);
      }
    }
    this.scatter(cedar, leafMat, cedars);
    this.scatter(maple, leafMat, maples);
    this.scatter(cedarFar, leafMat, cedarsFar, false); // 遠くの木は、影を落とさない
    this.scatter(mapleFar, leafMat, maplesFar, false);
    this.scatter(rock, rockMat, rocks);
    this.scatter(stone, rockMat, stones, false);
  }

  // ---- 障害物 ----
  private buildObstacles(): void {
    const rnd = mulberry(4242);
    const rockGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.4, rnd);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.9, flatShading: true });
    const bark = grainTex('#5a4232', [['#6e5340', 500, 6], ['#3f2d21', 500, 6]], { color: '#34251b', every: 14 });
    const barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 1 });
    const cutMat = new THREE.MeshStandardMaterial({ color: 0xd9b888, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xd9632b, roughness: 0.95, flatShading: true });
    const logGeo = new THREE.CylinderGeometry(0.34, 0.4, 3.6, 10), limbGeo = new THREE.CylinderGeometry(0.2, 0.34, 4.4, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.42, 0.6, 5, 9), leafGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, rnd);
    this.disposables.push(rockGeo, rockMat, bark, barkMat, cutMat, leafMat, logGeo, limbGeo, trunkGeo, leafGeo);
    for (const o of this.track.obstacles) {
      const f = this.frame(o.s, this.f), g = new THREE.Group();
      g.position.copy(f.o);
      g.setRotationFromMatrix(this.m1.makeBasis(f.r, f.u, this.v1.copy(f.t).negate()));
      if (o.kind === 'rock') {
        // 線路の上に落ちた岩
        for (const [x, y, z, sx, sy] of [[-0.25, 0.5, 0, 0.85, 0.75], [0.55, 0.32, 0.3, 0.5, 0.45], [-0.75, 0.22, -0.35, 0.32, 0.3]]) {
          const m = new THREE.Mesh(rockGeo, rockMat);
          m.position.set(x, y, z); m.scale.set(sx, sy, sx); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          m.castShadow = true; g.add(m);
        }
      } else if (o.kind === 'log') {
        const m = new THREE.Mesh(logGeo, [barkMat, cutMat, cutMat]);
        m.rotation.set(0, 0.12, Math.PI / 2); m.position.set(0, 0.5, 0); m.castShadow = true;
        g.add(m);
        const stub = new THREE.Mesh(limbGeo, barkMat);
        stub.scale.set(0.5, 0.25, 0.5); stub.position.set(0.7, 0.9, 0); stub.rotation.z = -0.5; stub.castShadow = true;
        g.add(stub);
      } else {
        // 横から張り出した太い枝(頭の高さ)。反対へ体を傾けてよける
        const side = o.side ?? 1;
        const trunk = new THREE.Mesh(trunkGeo, barkMat);
        trunk.position.set(side * 3.1, 2.1, 0); trunk.rotation.z = side * 0.12; trunk.castShadow = true;
        const limb = new THREE.Mesh(limbGeo, barkMat);
        limb.position.set(side * 1.25, 1.95, 0); limb.rotation.z = side * (Math.PI / 2 - 0.1); limb.castShadow = true;
        g.add(trunk, limb);
        for (const [x, y, z, r] of [[0.2, 2.15, 0.1, 0.62], [0.95, 2.35, -0.3, 0.75], [1.8, 2.5, 0.25, 0.8], [3.0, 4.6, 0, 1.6]]) {
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.set(side * x, y, z); leaf.scale.setScalar(r); leaf.castShadow = true;
          g.add(leaf);
        }
      }
      this.scene.add(g);
      this.obstacleObj.set(o.id, g);
    }
  }

  // ---- 看板・門・小屋 ----
  private buildSigns(): void {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x6a4c36, roughness: 0.95 });
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), boardGeo = new THREE.PlaneGeometry(1, 1), beamGeo = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(postMat, postGeo, boardGeo, beamGeo);
    const sign = (s: number, u: number, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
      const f = this.frame(s, this.f, false), g = new THREE.Group(), p = this.ground(s, u, new THREE.Vector3());
      g.position.copy(p);
      g.setRotationFromMatrix(this.m1.makeBasis(f.r, new THREE.Vector3(0, 1, 0), this.v1.set(-f.t.x, 0, -f.t.z).normalize()));
      const post = new THREE.Mesh(postGeo, postMat); post.position.y = 1.3; post.castShadow = true;
      const tex = canvasTex(256, Math.round((256 * h) / w), draw), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false });
      const board = new THREE.Mesh(boardGeo, mat); board.scale.set(w, h, 1); board.position.set(0, 2.6 + h / 2 - 0.3, 0.08);
      g.add(post, board); this.scene.add(g);
      this.disposables.push(tex, mat);
    };
    const plate = (g: CanvasRenderingContext2D, w: number, h: number, bg: string, border: string) => {
      g.fillStyle = border; g.beginPath(); g.roundRect(0, 0, w, h, 26); g.fill();
      g.fillStyle = bg; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 18); g.fill();
    };
    // 急カーブの手前: 矢印(きついカーブは赤い「ブレーキ」)
    for (const seg of this.track.segments) {
      const k = (((seg.turn ?? 0) * Math.PI) / 180) / seg.len;
      if (Math.abs(k) < 0.007) continue;
      const sharp = Math.abs(k) > 0.015, dir = Math.sign(k);
      for (const back of sharp ? [70, 38] : [45]) {
        sign(seg.from - back, -dir * 3.4, 1.9, sharp ? 2.3 : 1.9, g => {
          const H = sharp ? 310 : 256;
          plate(g, 256, H, '#ffd23a', '#2b2b2b');
          g.strokeStyle = '#2b2b2b'; g.lineWidth = 26; g.lineCap = 'round'; g.lineJoin = 'round';
          g.beginPath(); g.moveTo(128 - dir * 50, 200); g.quadraticCurveTo(128 - dir * 50, 90, 128 + dir * 40, 90); g.stroke();
          g.fillStyle = '#2b2b2b'; g.beginPath(); g.moveTo(128 + dir * 86, 90); g.lineTo(128 + dir * 36, 44); g.lineTo(128 + dir * 36, 136); g.fill();
          if (sharp) { g.fillStyle = '#d8342c'; g.beginPath(); g.roundRect(22, 226, 212, 64, 12); g.fill(); g.fillStyle = '#fff'; g.font = '900 44px sans-serif'; g.textAlign = 'center'; g.fillText('ブレーキ', 128, 274); }
        });
      }
    }
    // 切れ目の手前: 「ジャンプ」と、要る速さ
    for (const gap of this.track.gaps) {
      const need = Math.ceil(((gap.to - gap.from + 3) * 3.6) / 5) * 5;
      for (const side of [-1, 1]) {
        if (gap.collapse) {
          // 崩れる橋: 切れ目は見えないので「古い橋」の注意だけ
          sign(gap.from - 60, side * 3.3, 2.5, 2.5, g => {
            plate(g, 256, 256, '#ffd23a', '#2b2b2b');
            g.fillStyle = '#2b2b2b'; g.font = '900 58px sans-serif'; g.textAlign = 'center'; g.fillText('古い橋', 128, 100);
            g.font = '900 50px sans-serif'; g.fillText('あぶない', 128, 178);
          });
          continue;
        }
        sign(gap.from - 30, side * 3.3, 2.5, 2.5, g => {
          plate(g, 256, 256, '#fff7e0', '#d8342c');
          g.fillStyle = '#d8342c'; g.font = '900 54px sans-serif'; g.textAlign = 'center'; g.fillText('ジャンプ', 128, 92);
          g.fillStyle = '#2b2b2b'; g.font = '900 78px sans-serif'; g.fillText(`${need}`, 128, 176);
          g.font = '800 30px sans-serif';
          g.fillText(gap.shift ? (gap.shift > 0 ? 'ずれ ▶ 右へ' : '左へ ◀ ずれ') : gap.drop ? '下へ しずむ' : 'km/h 以上', 128, 222);
        });
      }
    }
    // 門(出発・ゴール)と、チェックポイントの小屋
    const gate = (s: number, label: string, color: string) => {
      const f = this.frame(s, this.f, false), g = new THREE.Group();
      g.position.copy(f.o);
      g.setRotationFromMatrix(this.m1.makeBasis(f.r, new THREE.Vector3(0, 1, 0), this.v1.set(-f.t.x, 0, -f.t.z).normalize()));
      for (const x of [-2.5, 2.5]) { const m = new THREE.Mesh(beamGeo, postMat); m.scale.set(0.36, 5.2, 0.36); m.position.set(x, 2.3, 0); m.castShadow = true; g.add(m); }
      const top = new THREE.Mesh(beamGeo, postMat); top.scale.set(6.4, 0.4, 0.5); top.position.set(0, 4.9, 0); top.castShadow = true;
      const top2 = new THREE.Mesh(beamGeo, postMat); top2.scale.set(5.4, 0.3, 0.4); top2.position.set(0, 4.1, 0);
      const tex = canvasTex(512, 128, c => {
        c.fillStyle = color; c.beginPath(); c.roundRect(0, 0, 512, 128, 20); c.fill();
        c.fillStyle = '#fff'; c.font = '900 84px sans-serif'; c.textAlign = 'center'; c.fillText(label, 256, 94);
      });
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
      const board = new THREE.Mesh(boardGeo, mat); board.scale.set(3.6, 0.9, 1); board.position.set(0, 4.5, 0.3);
      g.add(top, top2, board); this.scene.add(g);
      this.disposables.push(tex, mat);
    };
    gate(7, 'しゅっぱつ', '#3b7f26');
    gate(this.track.length, 'ゴール', '#d8342c');
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2a, roughness: 0.9 }), wallMat = new THREE.MeshStandardMaterial({ color: 0xb08a5e, roughness: 0.95 });
    const roofGeo = new THREE.ConeGeometry(2.3, 1.3, 4);
    this.disposables.push(roofMat, wallMat, roofGeo);
    const hut = (s: number, u: number, flag: number) => {
      const f = this.frame(s, this.f, false), g = new THREE.Group(), p = this.ground(s, u, new THREE.Vector3());
      g.position.copy(p);
      g.setRotationFromMatrix(this.m1.makeBasis(f.r, new THREE.Vector3(0, 1, 0), this.v1.set(-f.t.x, 0, -f.t.z).normalize()));
      const wall = new THREE.Mesh(beamGeo, wallMat); wall.scale.set(2.6, 2.2, 2.6); wall.position.y = 1.1; wall.castShadow = true;
      const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.y = 2.85; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
      const pole = new THREE.Mesh(postGeo, postMat); pole.scale.set(1, 1.9, 1); pole.position.set(-2.2, 2.4, 0);
      const fm = new THREE.MeshBasicMaterial({ color: flag, side: THREE.DoubleSide, toneMapped: false });
      const fl = new THREE.Mesh(boardGeo, fm); fl.scale.set(1.3, 0.8, 1); fl.position.set(-1.5, 4.4, 0);
      g.add(wall, roof, pole, fl); this.scene.add(g);
      this.disposables.push(fm);
    };
    for (const c of this.track.checkpoints) hut(c.s, 6.5, 0x3aa6c9);
    hut(this.track.length + 16, 6.2, 0xd8342c);
  }

  // ---- コイン ----
  private buildCoins(): Record<'silver' | 'gold' | 'premium', THREE.InstancedMesh> {
    const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 18).rotateX(Math.PI / 2);
    const make = (color: number, emissive: number, n: number) => {
      const mat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.7 });
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.frustumCulled = false; m.count = n;
      this.scene.add(m); this.disposables.push(mat);
      return m;
    };
    const by = (k?: string) => this.track.coins.filter(c => c.kind === k);
    const out = { silver: make(0xe6edf3, 0x9fb2c4, by(undefined).length), gold: make(0xffc83a, 0xb87400, by('gold').length), premium: make(0xc77dff, 0x7a2fd0, by('premium').length) };
    const n = { silver: 0, gold: 0, premium: 0 };
    for (const c of this.track.coins) {
      const key = c.kind ?? 'silver', f = this.frame(c.s, newFrame());
      f.o.addScaledVector(f.r, c.side * 1.05).addScaledVector(f.u, c.h + RAIL_TOP);
      this.coinSlot.set(c.id, { mesh: out[key], i: n[key]++, f, s: c.s });
    }
    this.disposables.push(geo);
    return out;
  }

  // ---- トロッコ・鹿・Spra ----
  private buildCart(): void {
    const wood = grainTex('#8a5d38', [['#a0714a', 500, 7], ['#6b4628', 500, 7]], { color: '#4a2f1b', every: 51 });
    const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3d43, roughness: 0.5, metalness: 0.7 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(wood, woodMat, iron, box);
    const part = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(box, mat);
      m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true;
      this.cart.add(m);
      return m;
    };
    const Y = RAIL_TOP; // レールの上面
    part(iron, 1.16, 0.1, 1.9, 0, Y + 0.42, 0); // 台枠
    part(woodMat, 1.2, 0.07, 1.84, 0, Y + 0.5, 0); // 床
    for (const side of [-1, 1]) part(woodMat, 0.07, 0.66, 1.9, side * 0.66, Y + 0.82, 0, 0, side * -0.13); // 横の板(上が開いている)
    part(woodMat, 1.36, 0.66, 0.07, 0, Y + 0.82, -0.95, 0.1); // 前
    part(woodMat, 1.36, 0.66, 0.07, 0, Y + 0.82, 0.95, -0.1); // 後ろ
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(iron, 0.07, 0.74, 0.07, sx * 0.69, Y + 0.82, sz * 0.94, 0, sx * -0.13); // 角の金具
    for (const side of [-1, 1]) part(iron, 0.05, 0.05, 1.98, side * 0.72, Y + 1.16, 0); // 上のふち
    part(iron, 1.46, 0.05, 0.05, 0, Y + 1.16, -0.99); part(iron, 1.46, 0.05, 0.05, 0, Y + 1.16, 0.99);
    // 車輪(つば付き)と車軸
    const wheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.09, 16).rotateZ(Math.PI / 2), flangeGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.03, 16).rotateZ(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(0.1, 0.5, 0.06), axleGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.3, 8).rotateZ(Math.PI / 2);
    const light = new THREE.MeshStandardMaterial({ color: 0x9a9da3, roughness: 0.4, metalness: 0.8 });
    this.disposables.push(wheelGeo, flangeGeo, spokeGeo, axleGeo, light);
    for (const z of [-0.62, 0.62]) {
      const axle = new THREE.Mesh(axleGeo, iron); axle.position.set(0, Y + 0.27, z); this.cart.add(axle);
      for (const side of [-1, 1]) {
        const w = new THREE.Group();
        const tyre = new THREE.Mesh(wheelGeo, iron), flange = new THREE.Mesh(flangeGeo, iron); flange.position.x = -side * 0.05;
        const sp1 = new THREE.Mesh(spokeGeo, light), sp2 = new THREE.Mesh(spokeGeo, light); sp1.position.x = sp2.position.x = side * 0.05; sp2.rotation.x = Math.PI / 2;
        tyre.castShadow = true;
        w.add(tyre, flange, sp1, sp2); w.position.set(side * RAIL, Y + 0.27, z);
        this.cart.add(w); this.wheels.push(w);
      }
    }
    // 鹿につなぐ、2本の棒(ながえ)と、胸の横木
    for (const side of [-1, 1]) part(woodMat, 0.08, 0.08, 3.1, side * 0.56, Y + 0.78, -2.45, -0.03);
    part(woodMat, 1.2, 0.08, 0.08, 0, Y + 0.82, -3.95);
    // ブレーキのレバー(左)と、ランタン(右うしろ)
    const lever = new THREE.Group(); lever.position.set(-0.8, Y + 0.6, 0.35);
    const lv = new THREE.Mesh(box, iron); lv.scale.set(0.05, 0.9, 0.05); lv.position.y = 0.45;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.5 })); knob.position.y = 0.92;
    lever.add(lv, knob); this.cart.add(lever); this.lever = lever;
    const lantern = new THREE.Group(); lantern.position.set(0.74, Y + 1.72, 0.9);
    const hook = new THREE.Mesh(box, iron); hook.scale.set(0.04, 0.6, 0.04); hook.position.set(0, -0.28, 0); this.cart.add(hook); hook.position.add(lantern.position);
    const glass = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb84a, emissiveIntensity: 1.2, roughness: 0.4 })); glass.scale.set(0.16, 0.22, 0.16); glass.position.y = -0.16;
    const cap = new THREE.Mesh(box, iron); cap.scale.set(0.2, 0.05, 0.2); cap.position.y = -0.03;
    lantern.add(glass, cap); this.cart.add(lantern); this.lantern = lantern;

    // Spra(後ろ姿の絵。トロッコに乗っている)と、鹿(後ろ姿で駆ける4コマ)
    const plane = new THREE.PlaneGeometry(1, 1);
    this.disposables.push(plane);
    const spraTex = loadTex(`${ASSET}/spru-walk/up_0.png`);
    const spraMat = new THREE.MeshBasicMaterial({ map: spraTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });
    this.spra = new THREE.Mesh(plane, spraMat);
    this.spra.scale.set(0.78, 1.56, 1);
    this.cart.add(this.spra);
    for (let i = 0; i < 4; i++) this.deerTex.push(loadTex(`${ASSET}/kasuga/run_${i}.png`));
    const deerMat = new THREE.MeshBasicMaterial({ map: this.deerTex[0], transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });
    this.deer = new THREE.Mesh(plane, deerMat);
    this.deer.scale.set(1.75, 2.5, 1);
    this.cart.add(this.deer);
    this.disposables.push(spraTex, spraMat, deerMat, ...this.deerTex);

    // 足もとの影(絵は影を落とせないので、丸い影を地面に置く)
    const dot = softDot(), shMat = new THREE.MeshBasicMaterial({ map: dot, color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
    this.shadowCart = new THREE.Mesh(plane, shMat); this.shadowDeer = new THREE.Mesh(plane, shMat);
    this.shadowCart.renderOrder = this.shadowDeer.renderOrder = 2;
    this.scene.add(this.shadowCart, this.shadowDeer);
    this.disposables.push(dot, shMat);
  }

  // ---- 風のすじ・落ち葉・火花・土けむり ----
  private buildEffects(): void {
    const rnd = mulberry(99);
    const sGeo = mergeGeometries([new THREE.PlaneGeometry(0.035, 1), new THREE.PlaneGeometry(0.035, 1).rotateY(Math.PI / 2)])!, sMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.streaks = new THREE.InstancedMesh(sGeo, sMat, 34);
    this.streaks.frustumCulled = false;
    for (let i = 0; i < 34; i++) this.streakPos.push({ s: rnd() * 70, u: (rnd() < 0.5 ? -1 : 1) * (2.2 + rnd() * 6), h: 0.4 + rnd() * 5, len: 2.5 + rnd() * 4 });
    this.scene.add(this.streaks);
    // 落ち葉
    const n = 150, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.leafData.push({ s: rnd() * 110, u: (rnd() - 0.5) * 26, h: 0.3 + rnd() * 7, ph: rnd() * 6.28 });
      c.setHex([0xe8822b, 0xd4472a, 0xf0bd35, 0xc98a2e][i % 4]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dot = softDot(), lMat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, map: dot, transparent: true, alphaTest: 0.2, sizeAttenuation: true });
    this.leaves = new THREE.Points(lGeo, lMat); this.leaves.frustumCulled = false;
    this.scene.add(this.leaves);
    // 火花(ブレーキ・車輪が浮いたとき)
    const kn = 48, kGeo = new THREE.BufferGeometry();
    kGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(kn * 3).fill(-9999), 3));
    const kMat = new THREE.PointsMaterial({ size: 0.13, color: 0xffc04a, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.sparks = new THREE.Points(kGeo, kMat); this.sparks.frustumCulled = false;
    for (let i = 0; i < kn; i++) this.sparkData.push({ life: 0, v: new THREE.Vector3() });
    this.scene.add(this.sparks);
    // 土けむり
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({ map: dot, color: 0xcbbfa6, transparent: true, opacity: 0, depthWrite: false });
      const sp = new THREE.Sprite(mat); sp.visible = false;
      this.scene.add(sp); this.puffs.push({ sp, life: 0, v: new THREE.Vector3() });
      this.disposables.push(mat);
    }
    this.disposables.push(sGeo, sMat, lGeo, lMat, dot, kGeo, kMat);
  }
  private puff(at: THREE.Vector3, n: number, spread: number): void {
    for (const p of this.puffs) {
      if (n <= 0) break;
      if (p.life > 0) continue;
      p.life = 1; p.sp.visible = true;
      p.sp.position.copy(at).add(this.v1.set((Math.random() - 0.5) * spread, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * spread));
      p.v.set((Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2);
      n--;
    }
  }
  private spark(at: THREE.Vector3, back: THREE.Vector3, n: number): void {
    for (const d of this.sparkData) {
      if (n <= 0) break;
      if (d.life > 0) continue;
      d.life = 0.25 + Math.random() * 0.3;
      d.v.copy(back).multiplyScalar(3 + Math.random() * 5).add(this.v1.set((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3));
      const i = this.sparkData.indexOf(d), p = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
      p.setXYZ(i, at.x, at.y, at.z);
      n--;
    }
  }

  /** ゆらす(着地・ぶつかったとき)。 */
  bump(amount: number): void { this.shake = Math.max(this.shake, amount); }

  private resize(): void {
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 下の操作ボタンに重ならないよう、絵の全体を少し上へずらす
    this.camera.setViewOffset(w, h, 0, Math.round(h * 0.13), w, h);
    this.camera.updateProjectionMatrix();
  }

  render(run: CartRun, dt: number): void {
    this.time += dt;
    // 8-4 のように最高速の高い面では 1 をこえる(視野がさらに広がり、速さを感じる)
    const tr = this.track, f = this.f, v = run.v, speed = clamp(v / BAL.vDash, 0, 1.25);
    const failed = run.phase === 'failed';
    this.failT = failed ? this.failT + dt : 0;

    // ---- トロッコの位置と向き ----
    this.frame(run.s, f);
    const pos = this.v2.set(run.px, run.py, run.pz);
    const rattle = run.air ? 0 : Math.sin(this.time * 47) * 0.012 * speed + Math.sin(this.time * 31) * 0.008 * speed;
    let roll = -run.lean * 0.13 - run.tilt * 0.55 * run.tiltDir + rattle;
    let pitch = 0, drop = 0, slide = 0;
    if (run.air) pitch = clamp(Math.atan2(run.vy, Math.hypot(run.vx, run.vz)) - Math.asin(clamp(f.t.y, -1, 1)), -0.5, 0.5) * 0.7;
    if (failed) {
      const k = this.failT;
      if (run.reason === 'derail' || run.reason === 'miss') { slide = run.tiltDir * Math.min(9, v * 0.3 * k + 2 * k); roll -= run.tiltDir * Math.min(2.4, k * 5); drop = -Math.min(3, k * k * 3); pitch += Math.min(0.5, k); }
      else if (run.reason === 'fall') { drop = -8 * k * k; pitch -= Math.min(1.2, k * 1.6); roll += Math.sin(k * 5) * 0.3; }
      else roll += Math.sin(k * 30) * 0.05 * Math.max(0, 1 - k);
    }
    this.cart.position.copy(pos).addScaledVector(f.r, slide);
    this.cart.position.y += drop;
    this.m1.makeBasis(f.r, f.u, this.v1.copy(f.t).negate());
    this.cart.quaternion.setFromRotationMatrix(this.m1);
    this.cart.rotateX(pitch); this.cart.rotateZ(roll);

    this.spin -= (v * dt) / 0.27;
    for (const w of this.wheels) w.rotation.x = this.spin;
    this.lever.rotation.x = run.braking ? -0.75 : -0.15;
    this.lantern.rotation.z = Math.sin(this.time * 6) * 0.1 * (0.3 + speed) + run.lean * 0.25;
    this.lantern.rotation.x = Math.sin(this.time * 4.3) * 0.08 * (0.3 + speed);

    // Spra: トロッコの中。傾けた向きへ体をたおす。ブレーキで後ろへ、ダッシュで前のめり
    const bob = Math.abs(Math.sin(this.time * 23)) * 0.02 * speed;
    this.spra.position.set(run.lean * 0.3, RAIL_TOP + 0.5 + 0.78 + bob, 0.28);
    this.spra.rotation.set(run.braking ? 0.16 : run.dashT > 0 ? -0.12 : 0, 0, -run.lean * 0.34 + (run.tilt > 0.2 ? Math.sin(this.time * 40) * 0.06 : 0));
    const squash = !run.air && this.wasAir ? 0.84 : 1;
    this.spra.scale.y += (1.56 * squash - this.spra.scale.y) * Math.min(1, dt * 14);

    // 鹿: 速いほど足が速い。空中では、のびた姿
    this.deerClock += dt * (run.air ? 0 : 5 + v * 0.55 + (run.dashT > 0 ? 8 : 0));
    const frameNo = run.air ? 1 : Math.floor(this.deerClock) % 4;
    (this.deer.material as THREE.MeshBasicMaterial).map = this.deerTex[frameNo];
    const gallop = run.air ? 0.25 : Math.abs(Math.sin(this.deerClock * Math.PI * 0.5)) * 0.16;
    this.deer.position.set(run.lean * 0.12, RAIL_TOP + 1.2 + gallop, -DEER_AHEAD);
    this.deer.rotation.set(run.air ? 0.25 : run.dashT > 0 ? -0.14 : 0, 0, -run.lean * 0.1);
    this.deer.scale.set(1.75, 2.5 * (run.dashT > 0 ? 1.05 : 1), 1);

    // 影(地面がある所だけ)
    const place = (mesh: THREE.Mesh, s: number, w: number, d: number) => {
      const g = this.frame(s, this.f2);
      mesh.visible = !tr.inGap(s) && !failed;
      if (!mesh.visible) return;
      const k = 1 / (1 + Math.max(0, run.height) * 0.35);
      mesh.position.copy(g.o).addScaledVector(g.u, RAIL_TOP + 0.03);
      mesh.quaternion.setFromRotationMatrix(this.m1.makeBasis(g.r, g.t, g.u));
      mesh.scale.set(w * k, d * k, 1);
    };
    place(this.shadowCart, run.s, 2.6, 3.4);
    place(this.shadowDeer, run.s + DEER_AHEAD, 1.8, 2.6);

    // 遠い区間の木・岩は描かない(霧の先・通りすぎた後ろ)
    for (const c of this.chunks) c.mesh.visible = c.to > run.s - 70 && c.from < run.s + 450;

    // ---- コイン・障害物 ----
    const turn = this.time * 3.2;
    for (const [id, slot] of this.coinSlot) {
      this.dummy.position.copy(slot.f.o);
      this.dummy.position.y += Math.sin(turn + id) * 0.06;
      this.dummy.quaternion.setFromRotationMatrix(this.m1.makeBasis(slot.f.r, slot.f.u, this.v1.copy(slot.f.t).negate()));
      this.dummy.rotateY(turn + id * 0.7);
      // 取ったコインと、通りすぎたコイン(カメラの目の前をふさがないように)は消す
      this.dummy.scale.setScalar(run.collected.has(id) || slot.s < run.s - 0.6 ? 0 : slot.mesh === this.coinMesh.premium ? 1.5 : slot.mesh === this.coinMesh.gold ? 1.2 : 1);
      this.dummy.updateMatrix();
      slot.mesh.setMatrixAt(slot.i, this.dummy.matrix);
    }
    for (const m of Object.values(this.coinMesh)) m.instanceMatrix.needsUpdate = true;
    for (const [id, obj] of this.obstacleObj) if (run.hitIds.has(id) && obj.visible) { obj.visible = false; this.puff(obj.position, 6, 2); }
    this.updateCollapse(run, dt);

    // ---- 効果 ----
    if (!run.air && this.wasAir) { this.bump(0.35); this.puff(pos, 5, 1.6); }
    this.wasAir = run.air;
    if (run.dashT > 0 && !run.air && Math.random() < 0.5) this.puff(this.v1.copy(pos).addScaledVector(f.t, DEER_AHEAD - 0.6), 1, 0.8);
    if (!run.air && !failed && (run.braking && v > 4 || run.tilt > 0.15)) {
      const side = run.tilt > 0.15 ? -run.tiltDir : Math.random() < 0.5 ? -1 : 1;
      this.spark(this.v1.copy(pos).addScaledVector(f.r, side * RAIL).addScaledVector(f.u, RAIL_TOP + 0.05).addScaledVector(f.t, Math.random() < 0.5 ? 0.62 : -0.62), this.v3().copy(f.t).negate(), 2);
    }
    const sp = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.sparkData.forEach((d, i) => {
      if (d.life <= 0) return;
      d.life -= dt; d.v.y -= 14 * dt;
      if (d.life <= 0) sp.setXYZ(i, 0, -9999, 0); else sp.setXYZ(i, sp.getX(i) + d.v.x * dt, sp.getY(i) + d.v.y * dt, sp.getZ(i) + d.v.z * dt);
    });
    sp.needsUpdate = true;
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt * 1.6;
      p.sp.position.addScaledVector(p.v, dt);
      const k = 1 - p.life;
      p.sp.scale.setScalar(0.6 + k * 2.4);
      (p.sp.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life) * 0.5;
      if (p.life <= 0) p.sp.visible = false;
    }
    // 風のすじ: 速いときだけ見える。通りすぎたら、前に出しなおす
    const sMat = this.streaks.material as THREE.MeshBasicMaterial;
    sMat.opacity = clamp((v - 17) / 16, 0, 1) * 0.3;
    this.streakPos.forEach((st, i) => {
      if (st.s < run.s - 8) { st.s = run.s + 40 + Math.random() * 45; st.u = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 6); st.h = 0.4 + Math.random() * 5; }
      const g = this.frame(st.s, this.f2);
      this.dummy.position.copy(g.o).addScaledVector(g.r, st.u).addScaledVector(g.u, st.h);
      this.dummy.quaternion.setFromRotationMatrix(this.m1.makeBasis(g.r, g.t, g.u));
      this.dummy.scale.set(1, st.len * (0.6 + speed), 1);
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
    });
    this.streaks.instanceMatrix.needsUpdate = true;
    // 落ち葉
    const lp = this.leaves.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.leafData.forEach((l, i) => {
      if (l.s < run.s - 10 || l.s > run.s + 130) { l.s = run.s + 30 + Math.random() * 95; l.u = (Math.random() - 0.5) * 26; l.h = 1 + Math.random() * 7; }
      l.h -= dt * 0.5; if (l.h < 0.1) l.h = 6 + Math.random() * 2;
      const g = this.frame(l.s, this.f2, false);
      const sway = Math.sin(this.time * 1.7 + l.ph) * 0.8;
      lp.setXYZ(i, g.o.x + g.r.x * (l.u + sway), g.o.y + l.h, g.o.z + g.r.z * (l.u + sway));
    });
    lp.needsUpdate = true;

    // ---- カメラ: トロッコの後ろ上から。速いほど広く、カーブで少し傾く ----
    this.shake = Math.max(0, this.shake - dt * 1.8);
    // きついカーブでは、見る先を近くする(遠くを見ると、トロッコが画面の端へ寄ってしまう)
    const sharp = Math.abs(this.track.sharpestAhead(run.s - 4, 26));
    this.lookD += (clamp(20 - sharp * 480, 8, 20) - this.lookD) * Math.min(1, dt * 3);
    const back = this.frame(run.s - 7.6 - speed * 1.6, this.f2), ahead = this.frame(run.s + this.lookD, this.f3);
    const lift = Math.max(0, run.height) * 0.55 + (failed && run.reason === 'fall' ? 1.5 : 0);
    const wantPos = this.v1.copy(back.o).addScaledVector(back.u, 3.9 + lift).addScaledVector(back.r, -run.lean * 0.5);
    const wantLook = this.v3().copy(ahead.o).addScaledVector(ahead.u, 1.3 + Math.max(0, run.height) * 0.4);
    if (failed && run.reason !== 'broken') wantLook.copy(this.cart.position);
    if (!this.camReady) { this.camPos.copy(wantPos); this.camLook.copy(wantLook); this.camReady = true; }
    const k = 1 - Math.exp(-dt * (failed ? 3 : 9));
    this.camPos.lerp(wantPos, k); this.camLook.lerp(wantLook, 1 - Math.exp(-dt * 7));
    const sh = this.shake + (run.dashT > 0 ? 0.06 : 0) + speed * 0.018 + run.tilt * 0.08;
    this.camera.position.copy(this.camPos).add(this.v1.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh).multiplyScalar(0.5));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.camLook);
    this.camera.rotateZ(clamp(-f.curv * v * 0.22, -0.14, 0.14) - run.lean * 0.035 + run.tilt * run.tiltDir * -0.08);
    const fov = 56 + 18 * speed * speed + (run.dashT > 0 ? 4 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 5); this.camera.updateProjectionMatrix(); }

    // 空・遠くの山・太陽は、カメラについてくる
    this.sky.position.copy(this.camera.position);
    this.far.position.set(this.camera.position.x, this.camera.position.y - 55, this.camera.position.z);
    this.sun.target.position.copy(pos);
    this.sun.position.copy(pos).add(this.v1.set(-34, 62, -30));

    this.renderer.render(this.scene, this.camera);

    // 重いときは、影をやめて軽くする(はじめの数秒で決める)
    if (!this.tuned && run.phase === 'running') {
      this.frames++;
      if (dt > 0.03) this.slowFrames++;
      if (this.frames >= 150) {
        this.tuned = true;
        if (this.slowFrames > 60) { this.renderer.shadowMap.enabled = false; this.sun.castShadow = false; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25)); this.resize(); }
      }
    }
  }
  private tmp3 = new THREE.Vector3();
  private v3(): THREE.Vector3 { return this.tmp3; }

  dispose(): void {
    this.ro.disconnect();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
