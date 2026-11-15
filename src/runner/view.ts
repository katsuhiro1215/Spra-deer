// 3D走りゲームの表示(Three.js)。ルールの計算は sim.ts、ここは見た目だけ。
// 面ごとの空・光・天候・景色は RunnerLevel.theme で切り替える。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GOAL_GAP, ROAD_HALF, roadHeading, roadX, type Course, type Obstacle } from './course.ts';
import { CRITTERS, type CritterDef } from './critters.ts';
import type { Landmark, RunnerLevel, Theme } from './levels.ts';
import type { Run } from './sim.ts';

const ASSET = '/assets';
const RED = 0xd8381c;

function rngFor(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTexture(size: number, paint: (g: CanvasRenderingContext2D, n: number) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noiseTexture(base: string, specks: string[], n = 900): THREE.CanvasTexture {
  const rnd = rngFor(7);
  return canvasTexture(256, (g, size) => {
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < n; i++) {
      g.fillStyle = specks[Math.floor(rnd() * specks.length)];
      const r = 0.8 + rnd() * 2.2;
      g.beginPath();
      g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
      g.fill();
    }
  }, true);
}

function skyTexture(theme: Theme): THREE.CanvasTexture {
  return canvasTexture(512, (g, n) => {
    const grd = g.createLinearGradient(0, 0, 0, n);
    theme.sky.forEach((c, i) => grd.addColorStop([0, 0.45, 0.78, 1][i], c));
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    const rnd = rngFor(11);
    if (theme.night) {
      // 星と月
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
        const r = rnd() < 0.1 ? 1.8 : 1;
        g.beginPath();
        g.arc(rnd() * n, rnd() * n * 0.6, r, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#f4f1da';
      g.shadowColor = '#cfd8ff';
      g.shadowBlur = 24;
      g.beginPath();
      g.arc(n * 0.78, n * 0.2, 22, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      return;
    }
    const cloud = theme.weather === 'rain' ? 'rgba(120,132,146,0.8)' : theme.weather === 'snow' ? 'rgba(255,255,255,0.8)' : theme.setting === 'town' ? 'rgba(255,200,160,0.55)' : 'rgba(255,255,255,0.7)';
    g.fillStyle = cloud;
    const count = theme.weather === 'rain' ? 14 : 9;
    for (let i = 0; i < count; i++) {
      const cx = rnd() * n;
      const cy = n * (0.1 + rnd() * 0.32);
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.ellipse(cx + k * 22 - 60, cy + Math.sin(k) * 6, 38 + rnd() * 22, 16 + rnd() * 8, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (g, n) => {
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
  });
}

function loadTex(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

interface PartDef {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  pos?: [number, number, number];
  rotY?: number;
}
interface Placement { x: number; y?: number; z: number; rotY?: number; scale?: number }

/** 同じ形をたくさん置くときの描画まとめ(InstancedMesh)。 */
function addInstanced(parent: THREE.Object3D, parts: PartDef[], places: Placement[], cast = true): void {
  if (!places.length) return;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const pq = new THREE.Quaternion();
  for (const part of parts) {
    const mesh = new THREE.InstancedMesh(part.geo, part.mat, places.length);
    places.forEach((pl, i) => {
      const sc = pl.scale ?? 1;
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(...(part.pos ?? [0, 0, 0])),
        pq.setFromEuler(new THREE.Euler(0, part.rotY ?? 0, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      q.setFromEuler(new THREE.Euler(0, pl.rotY ?? 0, 0));
      m.compose(p.set(pl.x, pl.y ?? 0, pl.z), q, s.set(sc, sc, sc)).multiply(local);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
  }
}

export class KasugaView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private headlight?: THREE.PointLight;
  private footGlow?: THREE.Mesh;
  private deer: THREE.Mesh;
  private deerShadow: THREE.Mesh;
  private runTex: THREE.Texture[] = [];
  private coinDisc!: THREE.InstancedMesh;
  private coinRim!: THREE.InstancedMesh;
  private obstacleObjs: { o: Obstacle; obj: THREE.Object3D; spin?: THREE.Object3D; sprite?: THREE.Mesh; crit?: { def: CritterDef; tex: Record<'normal' | 'angry' | 'sleep' | 'dizzy', THREE.Texture>; pose: string } }[] = [];
  private critterTex = new Map<string, THREE.Texture>();
  private daibutsu?: { mesh: THREE.Mesh; open: THREE.Texture; wake: THREE.Texture; light: THREE.PointLight; eyes: THREE.Points };
  private potionObjs: { id: number; s: number; x: number; y: number; obj: THREE.Group }[] = [];
  private awake = false;
  private walkTex: Record<string, THREE.Texture[]> = {};
  private lastCoinState: Uint8Array;
  private shake = 0;
  private camX = 0;
  private host: HTMLElement;
  private ro: ResizeObserver;
  private course: Course;
  private theme: Theme;
  private level: RunnerLevel;
  private end: number; // 道の終わり(ゴールの先)
  private cine = 0;
  private wheel?: THREE.Object3D;
  private weather?: { pts: THREE.Object3D; pos: Float32Array; n: number; rain: boolean; seed: Float32Array };
  private disposables: { dispose(): void }[] = [];

  constructor(host: HTMLElement, course: Course, level: RunnerLevel) {
    this.host = host;
    this.course = course;
    this.level = level;
    const theme = (this.theme = level.theme);
    this.end = course.length + GOAL_GAP;

    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = theme.exposure;
    r.domElement.className = 'ks-canvas';
    host.appendChild(r.domElement);
    this.renderer = r;

    this.scene.background = skyTexture(theme);
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = theme.env;
    pm.dispose();

    this.camera = new THREE.PerspectiveCamera(62, 9 / 16, 0.3, 420);

    this.scene.add(new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemi));
    this.sun = new THREE.DirectionalLight(theme.sun, theme.sunPower);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    if (theme.night) {
      // 鹿の前を、ぼんやり照らす灯り
      this.headlight = new THREE.PointLight(0xffd9a0, 55, 15, 1.4);
      this.scene.add(this.headlight);
      // 足元の、ぼんやりした光の輪
      const tex = glowTexture();
      this.disposables.push(tex);
      this.footGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: tex, color: 0xffd9a0, transparent: true, opacity: 0.17, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      );
      this.scene.add(this.footGlow);
    }

    this.buildGround();
    if (theme.setting === 'town') {
      this.buildTownScenery();
    } else {
      this.buildSandoScenery(); // 山道も、灯籠・鳥居をのぞいて同じ木々
      if (theme.setting === 'sando') this.buildTorii();
    }
    if (theme.goal === 'shrine') this.buildShrine();
    else if (theme.goal === 'bay') this.buildBay();
    else if (theme.goal === 'todaiji') this.buildTodaiji();
    else if (theme.goal === 'horyuji') this.buildHoryuji();
    else if (theme.goal === 'omiwa') this.buildOmiwa();
    else this.buildSummit();
    for (const lm of level.landmarks ?? []) this.buildLandmark(lm);
    this.buildObstacles();
    this.buildCoins();
    this.buildWeather();
    this.lastCoinState = new Uint8Array(course.coins.length).fill(2); // 2=まだ一度も配置していない

    for (let i = 0; i < 4; i++) this.runTex.push(loadTex(`${ASSET}/kasuga/run_${i}.png`));
    for (const k of ['doe_l', 'doe_r']) this.walkTex[k] = [0, 1, 2, 3].map((i) => loadTex(`${ASSET}/deer-walk/${k}_${i}.png`));

    const dg = new THREE.PlaneGeometry(1.7, 2.267);
    dg.translate(0, 1.13, 0);
    this.deer = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: this.runTex[0], transparent: true, alphaTest: 0.45, toneMapped: false }));
    // 夜と雨は、鹿の絵を少し暗くして、景色になじませる
    (this.deer.material as THREE.MeshBasicMaterial).color.setScalar(theme.night ? 0.78 : theme.weather === 'rain' ? 0.92 : 1);
    this.deer.renderOrder = 2;
    this.scene.add(this.deer);
    this.deerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a2a14, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.deerShadow.position.y = 0.02;
    this.scene.add(this.deerShadow);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  /** 距離 s・道の中心から右へ x の位置を、世界の座標にする(曲がる道に沿う)。psi=道の向き */
  private roadW(s: number, x = 0): { x: number; z: number; psi: number } {
    const psi = roadHeading(this.course, s);
    return { x: roadX(this.course, s) + x * Math.cos(psi), z: -s + x * Math.sin(psi), psi };
  }

  /** 道に沿った、置き物の位置と向き(rotY は、道の向きに足す)。 */
  private rp(s: number, x: number, o: { y?: number; rotY?: number; scale?: number } = {}): Placement {
    const w = this.roadW(s, x);
    return { x: w.x, z: w.z, y: o.y, rotY: -w.psi + (o.rotY ?? 0), scale: o.scale };
  }

  /** 道の面(中心線に沿って曲がる帯)。 */
  private roadRibbon(a: number, b: number, width: number, mat: THREE.Material): THREE.Mesh {
    const n = Math.max(1, Math.ceil((b - a) / 2));
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const s = a + ((b - a) * i) / n;
      const l = this.roadW(s, -width / 2);
      const r = this.roadW(s, width / 2);
      pos.push(l.x, 0, l.z, r.x, 0, r.z);
      uv.push(0, s / 4, width / 4, s / 4);
      if (i < n) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  // ---- 地面 ----
  private buildGround(): void {
    const th = this.theme;
    const gravel = noiseTexture(th.road.base, th.road.specks, 1600);
    const grass = noiseTexture(th.grass.base, th.grass.specks, 1400);
    this.disposables.push(gravel, grass);
    const matRoad = new THREE.MeshStandardMaterial({ map: gravel, roughness: th.road.rough });
    const matGrass = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
    const matCurb = new THREE.MeshStandardMaterial({ color: th.setting === 'town' ? 0xb9b4aa : 0x9a968c, roughness: 0.9 });
    const pierEnd = th.goal === 'bay' ? this.course.length + 60 : this.end - 6;
    const holes = this.course.obstacles.filter((o) => o.kind === 'hole');
    const spans: [number, number][] = [];
    let cur = -30;
    for (const h of holes) {
      spans.push([cur, h.s]);
      cur = h.s + h.len;
    }
    spans.push([cur, pierEnd]);
    const w = ROAD_HALF * 2;
    const dash: Placement[] = [];
    const curbs: Placement[] = [];
    for (const [a, b] of spans) {
      this.scene.add(this.roadRibbon(a, b, w, matRoad));
      // 縁石(2mごとの短い石)
      if (th.setting !== 'mountain') for (let q = Math.ceil(a / 2) * 2; q + 2 <= b + 0.01; q += 2) for (const sx of [-1, 1]) curbs.push(this.rp(q + 1, sx * (ROAD_HALF + 0.2)));
      if (th.setting === 'town') for (let q = Math.ceil(a / 6) * 6; q < b - 2.5; q += 6) dash.push(this.rp(q + 1.2, 0, { y: 0.015 }));
    }
    addInstanced(this.scene, [{ geo: new THREE.BoxGeometry(0.4, 0.22, 2.08), mat: matCurb, pos: [0, 0.11, 0] }], curbs);
    if (dash.length) {
      addInstanced(this.scene, [{ geo: new THREE.BoxGeometry(0.22, 0.02, 2.6), mat: new THREE.MeshStandardMaterial({ color: 0xf4efe0, roughness: 0.7 }) }], dash, false);
    }
    // 地面の芝(曲がる道でも足りるよう、広い1枚。ゴールが海なら、岸まで)
    const grassEnd = th.goal === 'bay' ? pierEnd : this.end + 330;
    const L = grassEnd + 40;
    const gw = 1400;
    const gg = new THREE.PlaneGeometry(gw, L + 600);
    const uv = gg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (gw / 6), uv.getY(i) * ((L + 600) / 6));
    const ground = new THREE.Mesh(gg, matGrass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -(L / 2 - 40) + (th.goal === 'bay' ? 0 : 0));
    ground.receiveShadow = true;
    this.scene.add(ground);
    // 穴(のぞくと深い)
    // 穴: 地面の上に、まっ黒な面をのせる(地面が1枚の大きな面なので、箱の穴だと、うまってしまう)
    const pitMat = new THREE.MeshBasicMaterial({ color: 0x07050a });
    const tapeA = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.6, emissive: 0x4a3200 });
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.5, emissive: 0x401400 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    for (const h of holes) {
      const pw = this.roadW(h.s + h.len / 2, 0);
      const pit = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.8, h.len).rotateX(-Math.PI / 2), pitMat);
      pit.position.set(pw.x, 0.03, pw.z);
      pit.rotation.y = -pw.psi;
      this.scene.add(pit);
      // 穴のふちに、黄色い帯(手前と奥)
      for (const edge of [h.s, h.s + h.len]) {
        const ew = this.roadW(edge, 0);
        const tape = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.08, 0.35), tapeA);
        tape.position.set(ew.x, 0.06, ew.z);
        tape.rotation.y = -ew.psi;
        this.scene.add(tape);
      }
      for (const sx of [-1, 1]) {
        for (const zz of [h.s - 1.4, h.s + h.len + 1.4]) {
          const cw = this.roadW(zz, sx * (ROAD_HALF - 0.5));
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.9, 14), pylonMat);
          cone.position.set(cw.x, 0.45, cw.z);
          cone.castShadow = true;
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.14, 14), stripe);
          band.position.set(cw.x, 0.5, cw.z);
          this.scene.add(cone, band);
        }
      }
    }
  }

  // ---- 参道: 灯籠と杉並木 ----
  private buildSandoScenery(): void {
    const th = this.theme;
    const stone = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0xc9ccd0 : 0xaaa69b, roughness: 0.95 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb040, emissiveIntensity: th.lampGlow, roughness: 0.6 });
    const snowM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const lanternParts: PartDef[] = [
      { geo: new THREE.BoxGeometry(0.95, 0.25, 0.95), mat: stone, pos: [0, 0.125, 0] },
      { geo: new THREE.CylinderGeometry(0.17, 0.2, 0.95, 10), mat: stone, pos: [0, 0.72, 0] },
      { geo: new THREE.CylinderGeometry(0.52, 0.4, 0.14, 8), mat: stone, pos: [0, 1.26, 0] },
      { geo: new THREE.BoxGeometry(0.42, 0.46, 0.42), mat: glow, pos: [0, 1.56, 0] },
      { geo: new THREE.ConeGeometry(0.82, 0.5, 4), mat: th.snowCaps ? snowM : stone, pos: [0, 2.04, 0], rotY: Math.PI / 4 },
      { geo: new THREE.SphereGeometry(0.1, 10, 8), mat: stone, pos: [0, 2.36, 0] },
    ];
    const lp: Placement[] = [];
    for (let s = 10; s < this.end - 8; s += 13) {
      for (const sx of [-1, 1]) lp.push(this.rp(s, sx * (ROAD_HALF + 1.5), { rotY: Math.PI / 4, scale: 1.3 }));
    }
    if (th.setting === 'sando') {
      addInstanced(this.scene, lanternParts, lp);
      if (th.halo > 0) this.addHalos(lp.map((p) => new THREE.Vector3(p.x, 2.0, p.z)), 0xffb450, 3.6 * th.halo + 1.2, Math.min(1, th.halo));
    }

    // 杉(根もと・3段の葉)
    const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
    const leafA = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0x4d7a64 : 0x2f6a3a, roughness: 0.9 });
    const leafB = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0x6a9a82 : 0x3d7d43, roughness: 0.9 });
    const treeParts: PartDef[] = [
      { geo: new THREE.CylinderGeometry(0.35, 0.5, 3.2, 8), mat: trunk, pos: [0, 1.6, 0] },
      { geo: new THREE.ConeGeometry(3.0, 5.2, 9), mat: leafA, pos: [0, 5.0, 0] },
      { geo: new THREE.ConeGeometry(2.4, 4.4, 9), mat: leafB, pos: [0, 7.8, 0] },
      { geo: new THREE.ConeGeometry(1.7, 3.6, 9), mat: leafA, pos: [0, 10.3, 0] },
    ];
    if (th.snowCaps) {
      // 葉の上に、雪をのせる(少し小さい白い円すい)
      treeParts.push(
        { geo: new THREE.ConeGeometry(2.9, 4.2, 9), mat: snowM, pos: [0, 5.55, 0] },
        { geo: new THREE.ConeGeometry(2.3, 3.5, 9), mat: snowM, pos: [0, 8.3, 0] },
        { geo: new THREE.ConeGeometry(1.6, 2.9, 9), mat: snowM, pos: [0, 10.8, 0] },
      );
    }
    const rnd = rngFor(99);
    const tp: Placement[] = [];
    for (let s = -20; s < this.end + 60; s += 4.6) {
      for (const sx of [-1, 1]) {
        if (rnd() < 0.18) continue;
        const near = 8 + rnd() * 6;
        tp.push(this.rp(s + rnd() * 3, sx * near, { scale: 0.8 + rnd() * 0.7, rotY: rnd() * 6 }));
        if (rnd() < 0.5) tp.push(this.rp(s + rnd() * 4, sx * (near + 9 + rnd() * 14), { scale: 1 + rnd() * 0.9, rotY: rnd() * 6 }));
      }
    }
    addInstanced(this.scene, treeParts, tp);

    const bushMat = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0xe9f1f7 : 0x4f9446, roughness: 1 });
    const bp: Placement[] = [];
    for (let s = 0; s < this.end; s += 7) {
      for (const sx of [-1, 1]) if (rnd() < 0.7) bp.push(this.rp(s + rnd() * 6, sx * (ROAD_HALF + 3 + rnd() * 3), { scale: 0.6 + rnd() * 0.6 }));
    }
    addInstanced(this.scene, [{ geo: new THREE.SphereGeometry(1, 10, 8), mat: bushMat, pos: [0, 0.6, 0] }], bp);
  }

  /** 灯りのまわりの、ぼんやりした光(足し合わせ表示)。 */
  private addHalos(points: THREE.Vector3[], color: number, size: number, opacity: number): void {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const tex = glowTexture();
    this.disposables.push(tex);
    const mat = new THREE.PointsMaterial({ map: tex, color, size, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  // ---- 街道: 街灯・並木・ビル ----
  private buildTownScenery(): void {
    const th = this.theme;
    const rnd = rngFor(321);
    // 街灯
    const pole = new THREE.MeshStandardMaterial({ color: 0x3c4048, roughness: 0.6, metalness: 0.3 });
    const bulb = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc060, emissiveIntensity: th.lampGlow, roughness: 0.5 });
    const lampParts: PartDef[] = [
      { geo: new THREE.CylinderGeometry(0.1, 0.16, 6.4, 8), mat: pole, pos: [0, 3.2, 0] },
      { geo: new THREE.BoxGeometry(1.5, 0.12, 0.16), mat: pole, pos: [0.7, 6.4, 0] },
      { geo: new THREE.SphereGeometry(0.28, 12, 10), mat: bulb, pos: [1.35, 6.25, 0] },
    ];
    const lp: Placement[] = [];
    const halos: THREE.Vector3[] = [];
    for (let s = 8; s < this.course.length + 40; s += 22) {
      lp.push(this.rp(s, -(ROAD_HALF + 1.2)));
      lp.push(this.rp(s + 11, ROAD_HALF + 1.2, { rotY: Math.PI }));
      // 灯りの位置は、街灯の腕の先(道の内側へ1.35m)
      const h1 = this.roadW(s, -(ROAD_HALF + 1.2) + 1.35);
      const h2 = this.roadW(s + 11, ROAD_HALF + 1.2 - 1.35);
      halos.push(new THREE.Vector3(h1.x, 6.25, h1.z), new THREE.Vector3(h2.x, 6.25, h2.z));
    }
    addInstanced(this.scene, lampParts, lp);
    if (th.halo > 0) this.addHalos(halos, 0xffc070, 4.2, Math.min(1, th.halo));

    // 並木(丸い木)
    const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x55803a, roughness: 0.95, flatShading: true });
    const tp: Placement[] = [];
    for (let s = 0; s < this.course.length + 40; s += 9) {
      for (const sx of [-1, 1]) if (rnd() < 0.75) tp.push(this.rp(s + rnd() * 4, sx * (ROAD_HALF + 2.6 + rnd() * 1.4), { scale: 0.7 + rnd() * 0.5 }));
    }
    addInstanced(this.scene, [
      { geo: new THREE.CylinderGeometry(0.2, 0.28, 2.4, 8), mat: trunk, pos: [0, 1.2, 0] },
      { geo: new THREE.IcosahedronGeometry(1.6, 1), mat: leaf, pos: [0, 3.5, 0] },
    ], tp);

    // ビル(窓があかり、ゴールが近づくと少なくなる)
    const winTex = (wall: string, lit: string) => canvasTexture(64, (g, n) => {
      g.fillStyle = wall;
      g.fillRect(0, 0, n, n);
      g.fillStyle = lit;
      g.fillRect(14, 12, n - 28, n - 26);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(14, n / 2 - 1, n - 28, 2);
    }, true);
    const types: { w: number; h: number; d: number; wall: string; lit: string }[] = [
      { w: 9, h: 16, d: 9, wall: '#c8b8a8', lit: '#ffd88a' },
      { w: 11, h: 28, d: 10, wall: '#9aa8b8', lit: '#ffe6a8' },
      { w: 8, h: 11, d: 8, wall: '#d6a894', lit: '#ffcf80' },
      { w: 12, h: 21, d: 9, wall: '#b4b8a0', lit: '#fff0b8' },
    ];
    types.forEach((t, k) => {
      const geo = new THREE.BoxGeometry(t.w, t.h, t.d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (t.w / 2.6), uv.getY(i) * (t.h / 2.6));
      const tex = winTex(t.wall, t.lit);
      this.disposables.push(tex);
      const lightMap = winTex('#000000', '#ffb050');
      this.disposables.push(lightMap);
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: lightMap, emissive: 0xffffff, emissiveIntensity: th.night ? 0.8 : 0.35, roughness: 0.85 });
      const places: Placement[] = [];
      for (let s = 30; s < this.course.length + 40; s += 11) {
        for (const sx of [-1, 1]) {
          if (rnd() * 4 > 1 + (k === 0 ? 1.6 : 0.5)) continue;
          const nearEnd = s > this.course.length - 80;
          if (nearEnd && rnd() < 0.85) continue; // 海が見えるよう、ゴール近くは開ける
          const x = sx * (ROAD_HALF + 8 + t.w / 2 + rnd() * 22);
          places.push(this.rp(s + rnd() * 9, x, { y: t.h / 2 }));
        }
      }
      addInstanced(this.scene, [{ geo, mat }], places);
    });
  }

  // ---- 鳥居 ----
  private torii(z: number, scale = 1): THREE.Group {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.55, emissive: 0x200600 });
    const black = new THREE.MeshStandardMaterial({ color: 0x2a2523, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 7, 14), red);
      p.position.set(sx * 4.9, 3.5, 0);
      p.castShadow = true;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.5, 14), black);
      base.position.set(sx * 4.9, 0.25, 0);
      g.add(p, base);
    }
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(11, 0.42, 0.5), red);
    nuki.position.set(0, 5.2, 0);
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.4, 0.8), black);
    shimaki.position.set(0, 7.15, 0);
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(14, 0.55, 1.2), red);
    kasagi.position.set(0, 7.55, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.2, 1.4), black);
    top.position.set(0, 7.9, 0);
    for (const m of [nuki, shimaki, kasagi, top]) m.castShadow = true;
    g.add(nuki, shimaki, kasagi, top);
    const tw = this.roadW(z, 0);
    g.position.set(tw.x, 0, tw.z);
    g.rotation.y = -tw.psi;
    g.scale.setScalar(scale);
    return g;
  }

  private buildTorii(): void {
    const L = this.course.length;
    for (const f of [0.09, 0.23, 0.38, 0.52, 0.65, 0.76, 0.85, 0.92]) this.scene.add(this.torii(Math.round(L * f)));
    this.scene.add(this.torii(L, 1.35)); // ゴールの大鳥居
  }

  // ---- 春日大社 ----
  private buildShrine(): void {
    const th = this.theme;
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5, emissive: 0x240700 });
    const white = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0xffffff : 0xf6f0e2, roughness: 0.85 });
    const roof = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0xe8eef4 : 0x6f5a45, roughness: 0.95 });
    const roofEdge = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0xcfd8e2 : 0x4a3b2d, roughness: 0.9 });
    const stoneM = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0xe6edf3 : 0xcdc5b4, roughness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 0.6, roughness: 0.3, emissive: 0x6a4410, emissiveIntensity: 0.6 });
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffa830, emissiveIntensity: th.lampGlow + 0.4 });
    const lampPts: THREE.Vector3[] = [];

    for (let i = 0; i < 5; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(18 + i * 1.5, 0.5, 2.2), stoneM);
      st.position.set(0, 0.25 + i * 0.5, 17 - i * 1.6 - 6);
      st.receiveShadow = true;
      st.castShadow = true;
      g.add(st);
    }
    const plat = new THREE.Mesh(new THREE.BoxGeometry(46, 2.5, 34), stoneM);
    plat.position.set(0, 1.25, -8);
    plat.receiveShadow = true;
    g.add(plat);

    const building = (x: number, z: number, w: number, d: number, h: number, y0: number, pillarN: number) => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w - 1, h, d - 1), white);
      body.position.y = h / 2;
      body.castShadow = true;
      b.add(body);
      for (let i = 0; i < pillarN; i++) {
        const px = -w / 2 + 0.5 + (i * (w - 1)) / (pillarN - 1);
        for (const pz of [d / 2 - 0.3, -d / 2 + 0.3]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, h, 12), red);
          p.position.set(px, h / 2, pz);
          p.castShadow = true;
          b.add(p);
        }
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.7, d + 0.4), red);
      beam.position.y = h + 0.35;
      b.add(beam);
      const r1 = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.82, h * 0.8, 4), roof);
      r1.rotation.y = Math.PI / 4;
      r1.scale.set((w / Math.hypot(w, d)) * 1.0, 1, (d / Math.hypot(w, d)) * 1.0);
      r1.position.y = h + 0.7 + h * 0.4;
      r1.castShadow = true;
      const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 3.4, 0.5, d + 3.4), roofEdge);
      eave.position.y = h + 0.95;
      eave.castShadow = true;
      b.add(r1, eave);
      const n = Math.max(3, Math.floor(w / 2.4));
      for (let i = 0; i < n; i++) {
        const lx = -w / 2 + 0.8 + (i * (w - 1.6)) / (n - 1);
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 10), lampM);
        lamp.position.set(lx, h - 0.5, d / 2 + 0.9);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.2, 10), gold);
        cap.position.set(lx, h - 0.05, d / 2 + 0.9);
        b.add(lamp, cap);
        lampPts.push(new THREE.Vector3(x + lx, y0 + h - 0.5, z + d / 2 + 0.9));
      }
      b.position.set(x, y0, z);
      g.add(b);
    };
    building(0, 5, 14, 7, 7.5, 2.5, 4);
    building(-15.5, 2, 13, 5, 5.2, 2.5, 4);
    building(15.5, 2, 13, 5, 5.2, 2.5, 4);
    building(0, -10, 18, 10, 8.5, 2.5, 5);
    building(-9, -22, 9, 7, 7, 2.5, 3);
    building(9, -22, 9, 7, 7, 2.5, 3);
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(60, 28, 16),
      new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0xdfe9f1 : th.night ? 0x2a5538 : 0x4d8a47, roughness: 1 }),
    );
    hill.scale.set(1.6, 0.62, 0.9);
    hill.position.set(0, -6, -80);
    g.add(hill);
    const rnd = rngFor(5);
    const treeMat = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0x6a9a82 : 0x2f6a3a, roughness: 0.95 });
    const cone = new THREE.ConeGeometry(3.2, 11, 8);
    for (let i = 0; i < 26; i++) {
      const t = new THREE.Mesh(cone, treeMat);
      t.position.set((rnd() - 0.5) * 120, 5 + rnd() * 3, -34 - rnd() * 30);
      t.scale.setScalar(0.9 + rnd() * 0.8);
      g.add(t);
    }
    const SC = 1.2;
    g.position.set(0, 0, -this.end);
    g.scale.setScalar(SC);
    this.scene.add(g);
    if (th.halo > 0) {
      // 吊り灯籠の光を、社殿の位置に合わせて置く
      this.addHalos(lampPts.map((p) => new THREE.Vector3(p.x * SC, p.y * SC, p.z * SC - this.end)), 0xffb450, 5.5 * th.halo + 1.5, Math.min(1, th.halo));
    }
  }

  // ---- 大阪湾: 海・観覧車・夕日・ゴールゲート ----
  private buildBay(): void {
    const L = this.course.length;
    const pier = L + 60;
    // 海
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 900),
      new THREE.MeshStandardMaterial({ color: 0x2c6c9c, roughness: 0.16, metalness: 0.15 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -1.1, -(pier + 420));
    this.scene.add(sea);
    // 岸のへり
    const quay = new THREE.Mesh(new THREE.BoxGeometry(200, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.9 }));
    quay.position.set(0, -0.5, -(pier + 0.5));
    quay.receiveShadow = true;
    this.scene.add(quay);
    // 夕日のきらめく道
    const glint = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 380),
      new THREE.MeshBasicMaterial({ map: this.glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(-34, -1.0, -(pier + 215));
    this.scene.add(glint);
    // 夕日
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshBasicMaterial({ color: 0xffd48a, fog: false }));
    sunDisc.position.set(-44, 26, -(pier + 400));
    this.scene.add(sunDisc);
    // 遠くの山
    const mtn = new THREE.MeshStandardMaterial({ color: 0x5a4a78, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const h = 28 + ((i * 37) % 30);
      const m = new THREE.Mesh(new THREE.ConeGeometry(55 + (i % 3) * 14, h, 6), mtn);
      m.position.set(-300 + i * 76, h / 2 - 2, -(pier + 560 + (i % 2) * 30));
      this.scene.add(m);
    }
    // 観覧車
    const wheel = new THREE.Group();
    const R = 24;
    const rimM = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.4, emissive: 0xffa060, emissiveIntensity: 0.5 });
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 8, 72), rimM));
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.3, 8, 48), rimM));
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, R, 5), rimM);
      spoke.position.set(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0);
      spoke.rotation.z = a + Math.PI / 2;
      wheel.add(spoke);
      const gon = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 2.4, 2.4),
        new THREE.MeshStandardMaterial({ color: [0xff6a6a, 0xffd24a, 0x5ac8fa, 0x7ee08a][i % 4], roughness: 0.5, emissive: 0x401800, emissiveIntensity: 0.4 }),
      );
      gon.position.set(Math.cos(a) * R, Math.sin(a) * R - 1.6, 0);
      wheel.add(gon);
    }
    wheel.position.set(-62, R + 8, -(pier + 150));
    this.wheel = wheel;
    this.scene.add(wheel);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, R + 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.6 }));
      leg.position.set(-62 + sx * 7, (R + 8) / 2, -(pier + 150));
      leg.rotation.z = -sx * 0.22;
      this.scene.add(leg);
    }
    // ゴールゲート(アーチ)
    const gate = new THREE.Group();
    const post = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.5 });
    const beam = new THREE.MeshStandardMaterial({ color: 0x1f8fd6, roughness: 0.4, emissive: 0x0a3a60, emissiveIntensity: 0.5 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), post);
      p.position.set(sx * 5.6, 4.5, 0);
      p.castShadow = true;
      gate.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(13.6, 2.6, 1.0), beam);
    top.position.set(0, 9.6, 0);
    top.castShadow = true;
    gate.add(top);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(12.4, 2.2),
      new THREE.MeshBasicMaterial({ map: this.bannerTexture(this.level.goalName), transparent: true, toneMapped: false }),
    );
    banner.position.set(0, 9.6, 0.52);
    gate.add(banner);
    gate.position.z = -L;
    gate.scale.setScalar(1.15);
    this.scene.add(gate);
    // 岸の手すり
    const rail = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.6 });
    const posts: Placement[] = [];
    for (let x = -ROAD_HALF - 2; x <= ROAD_HALF + 2; x += 1.6) posts.push({ x, z: -(pier - 0.6) });
    addInstanced(this.scene, [{ geo: new THREE.CylinderGeometry(0.1, 0.1, 1.1, 8), mat: rail, pos: [0, 0.55, 0] }], posts);
  }

  // ---- 塔・堂・門(東大寺・法隆寺・名所で使う部品) ----
  /** 五重塔など。tiers=層の数、w=いちばん下の幅 */
  private pagoda(tiers: number, w: number): THREE.Group {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: this.theme.snowCaps ? 0xf4f7fa : 0xf1e8d6, roughness: 0.85 });
    const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5, emissive: 0x200600 });
    const roof = new THREE.MeshStandardMaterial({ color: this.theme.snowCaps ? 0xe3eaf1 : 0x57493c, roughness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 0.6, roughness: 0.3, emissive: 0x6a4410, emissiveIntensity: 0.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 0.8, w + 3), new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.95 }));
    base.position.y = 0.4;
    base.receiveShadow = true;
    g.add(base);
    let y = 0.8;
    const hT = w * 0.5;
    for (let i = 0; i < tiers; i++) {
      const tw = w * (1 - i * 0.13);
      const body = new THREE.Mesh(new THREE.BoxGeometry(tw, hT, tw), white);
      body.position.y = y + hT / 2;
      body.castShadow = true;
      g.add(body);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const pil = new THREE.Mesh(new THREE.BoxGeometry(0.28, hT, 0.28), red);
        pil.position.set((sx * tw) / 2, y + hT / 2, (sz * tw) / 2);
        g.add(pil);
      }
      const eave = tw + 3.6;
      const cone = new THREE.Mesh(new THREE.ConeGeometry((eave / 2) * Math.SQRT2, hT * 0.5, 4), roof);
      cone.rotation.y = Math.PI / 4;
      cone.position.y = y + hT + hT * 0.2;
      cone.castShadow = true;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(eave, 0.3, eave), roof);
      lip.position.y = y + hT + 0.1;
      g.add(cone, lip);
      y += hT + hT * 0.42;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, w * 0.9, 8), gold);
    spire.position.y = y + (w * 0.9) / 2 - 0.4;
    g.add(spire);
    for (let r = 0; r < 5; r++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 - r * 0.04, 0.05, 6, 14), gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y + 0.5 + r * (w * 0.14);
      g.add(ring);
    }
    return g;
  }

  /** 金堂のような、屋根の大きな堂。 */
  private hall(w: number, d: number, h: number, stories = 1): THREE.Group {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: this.theme.snowCaps ? 0xf4f7fa : 0xf1e8d6, roughness: 0.85 });
    const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5, emissive: 0x200600 });
    const roof = new THREE.MeshStandardMaterial({ color: this.theme.snowCaps ? 0xe3eaf1 : 0x57493c, roughness: 0.95 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.95 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 1.4, d + 6), stone);
    plat.position.y = 0.7;
    plat.receiveShadow = true;
    g.add(plat);
    let y = 1.4;
    for (let k = 0; k < stories; k++) {
      const sw = w * (1 - k * 0.2);
      const sd = d * (1 - k * 0.2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(sw, h, sd), white);
      body.position.y = y + h / 2;
      body.castShadow = true;
      g.add(body);
      const n = Math.max(3, Math.round(sw / 3));
      for (let i = 0; i < n; i++) {
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, h, 10), red);
        pil.position.set(-sw / 2 + 0.4 + (i * (sw - 0.8)) / (n - 1), y + h / 2, sd / 2 + 0.2);
        g.add(pil);
      }
      const eaveW = sw + 5;
      const eaveD = sd + 5;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(eaveW, eaveD) * 0.5, h * 0.7, 4), roof);
      cone.rotation.y = Math.PI / 4;
      cone.scale.set(eaveW / Math.hypot(eaveW, eaveD), 1, eaveD / Math.hypot(eaveW, eaveD));
      cone.position.y = y + h + h * 0.32;
      cone.castShadow = true;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(eaveW, 0.4, eaveD), roof);
      lip.position.y = y + h + 0.15;
      g.add(cone, lip);
      y += h + h * 0.55;
    }
    return g;
  }

  /** 南大門のような、大きな門(道がまんなかを通る)。 */
  private bigGate(): THREE.Group {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a3a22, roughness: 0.7, emissive: 0x1a0600 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x4a3d33, roughness: 0.95 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe8dfcc, roughness: 0.9 });
    for (const sx of [-1, 1]) for (const k of [0, 1]) {
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, 13, 14), wood);
      pil.position.set(sx * (9 + k * 5), 6.5, 0);
      pil.castShadow = true;
      g.add(pil);
    }
    for (const x of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(11, 7, 1.4), white);
      wall.position.set(x * 17.5, 3.5, 0);
      g.add(wall);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 3), wood);
    beam.position.set(0, 13.3, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(30, 4.2, 4.6), wood);
    upper.position.set(0, 16.3, 0);
    upper.castShadow = true;
    const lip1 = new THREE.Mesh(new THREE.BoxGeometry(40, 0.6, 12), roof);
    lip1.position.set(0, 14.4, 0);
    const top = new THREE.Mesh(new THREE.ConeGeometry(21, 6.5, 4), roof);
    top.rotation.y = Math.PI / 4;
    top.scale.set(1, 1, 0.38);
    top.position.set(0, 21.2, 0);
    top.castShadow = true;
    const lip2 = new THREE.Mesh(new THREE.BoxGeometry(38, 0.5, 9), roof);
    lip2.position.set(0, 18.7, 0);
    g.add(beam, upper, lip1, lip2, top);
    return g;
  }

  /** 看板つきの目印(道ばたの木の札)。 */
  private signboard(text: string, s: number, side: number): THREE.Group {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.0, 0.25), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 }));
    post.position.y = 1.5;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const x = c.getContext('2d')!;
    x.fillStyle = '#f1e2c2';
    x.fillRect(0, 0, 256, 96);
    x.strokeStyle = '#6b4a2e';
    x.lineWidth = 8;
    x.strokeRect(4, 4, 248, 88);
    x.fillStyle = '#3a2a1a';
    x.font = '900 46px "M PLUS Rounded 1c", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disposables.push(tex);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    board.position.set(0, 3.1, 0.14);
    g.add(post, board);
    const w = this.roadW(s, side * (ROAD_HALF + 2.4));
    g.position.set(w.x, 0, w.z);
    g.rotation.y = -w.psi + (side > 0 ? -0.35 : 0.35); // 道のほうへ、少し向ける
    return g;
  }

  private buildLandmark(lm: Landmark): void {
    const s = lm.at * this.course.length;
    const model = lm.kind === 'pagoda' ? this.pagoda(3, 6.2) : this.hall(15, 9, 5);
    const w = this.roadW(s, lm.side * (ROAD_HALF + (lm.kind === 'pagoda' ? 9 : 12)));
    model.position.set(w.x, 0, w.z);
    model.rotation.y = -w.psi;
    this.scene.add(model);
    this.scene.add(this.signboard(lm.name, s - 4, lm.side));
  }

  // ---- 東大寺: 南大門・大仏殿・大仏 ----
  private buildTodaiji(): void {
    const L = this.course.length;
    // 南大門(道のとちゅうに、大きな門)
    const gate = this.bigGate();
    const gw = this.roadW(L * 0.42, 0);
    gate.position.set(gw.x, 0, gw.z);
    gate.rotation.y = -gw.psi;
    this.scene.add(gate);

    // 大仏殿
    const hall = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x7c3b24, roughness: 0.75, emissive: 0x150500 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x40362e, roughness: 0.95 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(40 + i * 3, 0.7, 2.6), stone);
      st.position.set(0, 0.35 + i * 0.7, 24 - i * 1.8);
      st.receiveShadow = true;
      hall.add(st);
    }
    const plat = new THREE.Mesh(new THREE.BoxGeometry(84, 4.2, 50), stone);
    plat.position.set(0, 2.1, 0);
    plat.receiveShadow = true;
    hall.add(plat);
    // 左右の壁(まんなかは、大仏が見えるよう開ける)
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(26, 24, 36), wood);
      wall.position.set(sx * 27, 4.2 + 12, 0);
      wall.castShadow = true;
      hall.add(wall);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 2), dark);
    back.position.set(0, 4.2 + 15, -17);
    hall.add(back);
    for (let i = -3; i <= 3; i++) {
      if (Math.abs(i) < 2) continue; // 大仏の顔が見えるよう、まんなかの柱はなし
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 24, 12), wood);
      pil.position.set(i * 5.2, 4.2 + 12, 18.5);
      pil.castShadow = true;
      hall.add(pil);
    }
    const lower = new THREE.Mesh(new THREE.BoxGeometry(90, 1.2, 56), roof);
    lower.position.set(0, 4.2 + 25, 0);
    const lowerCone = new THREE.Mesh(new THREE.ConeGeometry(52, 9, 4), roof);
    lowerCone.rotation.y = Math.PI / 4;
    lowerCone.scale.set(1, 1, 0.62);
    lowerCone.position.set(0, 4.2 + 29.5, 0);
    lowerCone.castShadow = true;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(58, 5, 34), wood);
    upper.position.set(0, 4.2 + 33, 0);
    const upperCone = new THREE.Mesh(new THREE.ConeGeometry(36, 11, 4), roof);
    upperCone.rotation.y = Math.PI / 4;
    upperCone.scale.set(1, 1, 0.62);
    upperCone.position.set(0, 4.2 + 40.5, 0);
    upperCone.castShadow = true;
    hall.add(lower, lowerCone, upper, upperCone);
    // 大仏(目が閉じた絵と、光る絵を、切りかえる)
    const open = loadTex(`${ASSET}/runner/daibutsu_0.png`);
    const wake = loadTex(`${ASSET}/runner/daibutsu_1.png`);
    const dh = 20;
    const dm = new THREE.Mesh(
      new THREE.PlaneGeometry(dh * (640 / 590), dh).translate(0, dh / 2, 0),
      new THREE.MeshBasicMaterial({ map: open, transparent: true, alphaTest: 0.4, toneMapped: false, fog: false, color: 0x666666 }),
    );
    dm.position.set(0, 4.2, -12);
    hall.add(dm);
    const glow = new THREE.PointLight(0xffa830, 0, 60, 1.4);
    glow.position.set(0, 4.2 + dh * 0.72, -6);
    hall.add(glow);
    // 光る目(霧にかくれず、暗闇の遠くから見える)
    const eyeY = 4.2 + dh * 0.775;
    const eyeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.55, eyeY, -(L + 75) - 11.6), new THREE.Vector3(1.55, eyeY, -(L + 75) - 11.6)]);
    const eyeTex = glowTexture();
    this.disposables.push(eyeTex);
    const eyes = new THREE.Points(eyeGeo, new THREE.PointsMaterial({ map: eyeTex, color: 0xffb040, size: 46, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }));
    eyes.frustumCulled = false;
    this.scene.add(eyes);
    this.daibutsu = { mesh: dm, open, wake, light: glow, eyes };
    hall.position.set(0, 0, -(L + 75));
    this.scene.add(hall);
    // 奥の山(春日山)
    const hill = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 14), new THREE.MeshStandardMaterial({ color: this.theme.night ? 0x1d3a2a : 0x3f7a40, roughness: 1 }));
    hill.scale.set(1.8, 0.55, 0.9);
    hill.position.set(0, -8, -(L + 75 + 85));
    this.scene.add(hill);
  }

  // ---- 法隆寺: 五重塔・金堂・中門 ----
  private buildHoryuji(): void {
    const L = this.course.length;
    const end = L + 75;
    const tower = this.pagoda(5, 9);
    tower.position.set(-17, 0, -(end - 4));
    this.scene.add(tower);
    const kondo = this.hall(22, 14, 7, 2);
    kondo.position.set(17, 0, -(end - 4));
    this.scene.add(kondo);
    // 回廊(白い壁と屋根)
    const wall = new THREE.Mesh(new THREE.BoxGeometry(64, 4, 1.2), new THREE.MeshStandardMaterial({ color: this.theme.snowCaps ? 0xf4f7fa : 0xf1e8d6, roughness: 0.9 }));
    wall.position.set(0, 2.5, -(end + 14));
    const wroof = new THREE.Mesh(new THREE.BoxGeometry(66, 0.8, 4.2), new THREE.MeshStandardMaterial({ color: 0x57493c, roughness: 0.95 }));
    wroof.position.set(0, 5, -(end + 14));
    this.scene.add(wall, wroof);
    // 中門(ゴール)
    const gate = this.bigGate();
    gate.scale.setScalar(0.62);
    gate.position.set(0, 0, -L);
    this.scene.add(gate);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 14), new THREE.MeshStandardMaterial({ color: 0x4d8a47, roughness: 1 }));
    hill.scale.set(2.2, 0.4, 0.9);
    hill.position.set(0, -6, -(end + 80));
    this.scene.add(hill);
  }

  // ---- 大神神社: 大鳥居と、神体山の三輪山 ----
  private buildOmiwa(): void {
    const L = this.course.length;
    this.scene.add(this.torii(L, 2.6)); // ゴールの大鳥居
    const snow = this.theme.snowCaps;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(120, 110, 18), new THREE.MeshStandardMaterial({ color: snow ? 0x5d8470 : 0x2f6a3a, roughness: 1, flatShading: true }));
    mtn.position.set(0, 50, -(L + 200));
    this.scene.add(mtn);
    if (snow) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(52, 44, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
      cap.position.set(0, 82, -(L + 200));
      this.scene.add(cap);
    }
    // 三輪山の手前に、杉の森
    const rnd = rngFor(21);
    const leaf = new THREE.MeshStandardMaterial({ color: snow ? 0x6a9a82 : 0x2f6a3a, roughness: 0.95 });
    const cone = new THREE.ConeGeometry(4, 14, 8);
    for (let i = 0; i < 40; i++) {
      const t = new THREE.Mesh(cone, leaf);
      t.position.set((rnd() - 0.5) * 180, 7, -(L + 90 + rnd() * 60));
      t.scale.setScalar(0.9 + rnd() * 0.9);
      this.scene.add(t);
    }
  }

  // ---- 若草山の山頂: 木のゴールゲート・山なみ ----
  private buildSummit(): void {
    const L = this.course.length;
    const wood = new THREE.MeshStandardMaterial({ color: 0x9b6a3c, roughness: 0.85 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x6d4524, roughness: 0.9 });
    const gate = new THREE.Group();
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 9, 1.1), wood);
      p.position.set(sx * 5.4, 4.5, 0);
      p.castShadow = true;
      gate.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(13.4, 2.4, 1.0), woodDark);
    beam.position.set(0, 9.4, 0);
    beam.castShadow = true;
    gate.add(beam);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 2.0),
      new THREE.MeshBasicMaterial({ map: this.bannerTexture(this.level.goalName), transparent: true, toneMapped: false }),
    );
    banner.position.set(0, 9.4, 0.52);
    gate.add(banner);
    gate.position.z = -L;
    gate.scale.setScalar(1.15);
    this.scene.add(gate);
    // 山頂の先に、重なる山なみ(遠いほど、うすい)
    for (let i = 0; i < 16; i++) {
      const layer = i % 3;
      const mat = new THREE.MeshStandardMaterial({ color: [0x5f8f5a, 0x7fa87a, 0xa6c5a3][layer], roughness: 1, flatShading: true });
      const h = 38 + ((i * 29) % 40) + layer * 10;
      const m = new THREE.Mesh(new THREE.ConeGeometry(70 + (i % 4) * 18, h, 7), mat);
      m.position.set(-420 + i * 56, h / 2 - 3, -(L + 230 + layer * 70));
      this.scene.add(m);
    }
    // 山頂の目印の石
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.95, flatShading: true }));
    stone.position.set(-8, 2, -(L + 14));
    stone.castShadow = true;
    this.scene.add(stone);
  }

  private glintTexture(): THREE.CanvasTexture {
    return canvasTexture(128, (g, n) => {
      const grd = g.createLinearGradient(0, 0, n, 0);
      grd.addColorStop(0, 'rgba(255,200,120,0)');
      grd.addColorStop(0.5, 'rgba(255,214,150,0.9)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, n, n);
      g.fillStyle = 'rgba(40,90,140,0.55)';
      const rnd = rngFor(3);
      for (let i = 0; i < 60; i++) g.fillRect(rnd() * n, rnd() * n, 14 + rnd() * 26, 2);
    });
  }

  private bannerTexture(text: string): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.font = '900 64px "M PLUS Rounded 1c", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`${text}  GOAL`, 256, 52);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---- 障害物 ----
  private buildObstacles(): void {
    const town = this.theme.setting === 'town';
    const poopMat = new THREE.MeshPhysicalMaterial({ color: 0x7b4a24, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.35 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1210, roughness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0xb4814b, roughness: 0.85 });
    const redM = new THREE.MeshStandardMaterial({ color: 0xe63a2a, roughness: 0.5 });
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x8e8a83, roughness: 0.95, flatShading: true });
    const barrelM = new THREE.MeshStandardMaterial({ color: 0xb87a3e, roughness: 0.7 });
    const bandM = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.4, metalness: 0.5 });
    const waterM = new THREE.MeshPhysicalMaterial({ color: 0x5c8fb8, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.85, clearcoat: 1 });
    const iceM = new THREE.MeshPhysicalMaterial({ color: 0xcdeaff, roughness: 0.05, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.92 });
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    for (const o of this.course.obstacles) {
      if (o.kind === 'hole') continue;
      const obj = new THREE.Group();
      let spin: THREE.Object3D | undefined;
      let sprite: THREE.Mesh | undefined;
      if (o.kind === 'poop') {
        const tiers: [number, number][] = [[0.62, 0.34], [0.45, 0.7], [0.28, 1.0]];
        for (const [r, y] of tiers) {
          const m = new THREE.Mesh(sphere, poopMat);
          m.scale.set(r, r * 0.72, r);
          m.position.y = y;
          m.castShadow = true;
          obj.add(m);
        }
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 12), poopMat);
        tip.position.y = 1.28;
        tip.rotation.z = 0.35;
        obj.add(tip);
        for (const ex of [-0.17, 0.17]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), white);
          e.position.set(ex, 0.78, 0.38);
          const pu = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), black);
          pu.position.set(ex, 0.78, 0.46);
          obj.add(e, pu);
        }
      } else if (o.kind === 'fence') {
        const w = o.halfW * 2;
        const n = Math.max(2, Math.round(w / 1.1) + 1);
        for (let i = 0; i < n; i++) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.15, 0.22), town ? redM : wood);
          p.position.set(-o.halfW + (i * w) / (n - 1), 0.575, 0);
          p.castShadow = true;
          obj.add(p);
        }
        for (const y of [0.42, 0.86]) {
          if (town) {
            // 赤白のバリケード
            const segs = Math.max(2, Math.round(w / 0.7));
            for (let i = 0; i < segs; i++) {
              const sgm = new THREE.Mesh(new THREE.BoxGeometry(w / segs, 0.2, 0.13), i % 2 ? white : redM);
              sgm.position.set(-o.halfW + ((i + 0.5) * w) / segs, y, 0.05);
              sgm.castShadow = true;
              obj.add(sgm);
            }
          } else {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, 0.13), wood);
            rail.position.set(0, y, 0.05);
            rail.castShadow = true;
            obj.add(rail);
          }
        }
      } else if (o.kind === 'stone') {
        if (town) {
          // 街道では、ころがる樽
          const barrel = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 20).rotateZ(Math.PI / 2), barrelM);
          body.castShadow = true;
          barrel.add(body);
          for (const bx of [-0.45, 0.45]) {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.12, 20).rotateZ(Math.PI / 2), bandM);
            band.position.x = bx;
            barrel.add(band);
          }
          barrel.position.y = 0.8;
          spin = barrel;
          obj.add(barrel);
        } else {
          const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), stoneM);
          rock.position.y = 0.85;
          rock.castShadow = true;
          spin = rock;
          obj.add(rock);
        }
      } else if (o.kind === 'deer') {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 1.78).translate(0, 0.89, 0),
          new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.45, toneMapped: false }),
        );
        (m.material as THREE.MeshBasicMaterial).color.setScalar(this.theme.night ? 0.78 : 1);
        sprite = m;
        obj.add(m);
        const sh = new THREE.Mesh(
          new THREE.CircleGeometry(0.7, 20).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x1a2a14, transparent: true, opacity: 0.3, depthWrite: false }),
        );
        sh.position.y = 0.02;
        obj.add(sh);
      } else if (o.kind === 'puddle') {
        const pd = new THREE.Mesh(new THREE.CircleGeometry(1.2, 28).rotateX(-Math.PI / 2), waterM);
        pd.scale.set(1, 1, 0.8);
        pd.position.y = 0.03;
        obj.add(pd);
      } else if (o.kind === 'ice') {
        const ic = new THREE.Mesh(new THREE.CircleGeometry(1.55, 7).rotateX(-Math.PI / 2), iceM);
        ic.position.y = 0.035;
        ic.rotation.y = o.id;
        obj.add(ic);
        for (let k = 0; k < 4; k++) {
          const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
          crack.position.set(0, 0.045, 0);
          crack.rotation.y = k * 0.8 + o.id;
          obj.add(crack);
        }
      }
      let crit: { def: CritterDef; tex: Record<'normal' | 'angry' | 'sleep' | 'dizzy', THREE.Texture>; pose: string } | undefined;
      if (o.kind === 'critter' && o.critter) {
        const def = CRITTERS[o.critter];
        const t = (n: number) => this.loadCritterTex(o.critter!, n);
        const tex = { normal: t(def.pose.normal), angry: t(def.pose.angry), sleep: t(def.pose.sleep), dizzy: t(def.pose.dizzy) };
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
          new THREE.MeshBasicMaterial({ map: tex.normal, transparent: true, alphaTest: 0.45, toneMapped: false }),
        );
        (m.material as THREE.MeshBasicMaterial).color.setScalar(this.theme.night ? 0.8 : this.theme.weather === 'rain' ? 0.94 : 1);
        m.scale.set(def.size, def.size, 1);
        sprite = m;
        obj.add(m);
        const sh = new THREE.Mesh(
          new THREE.CircleGeometry(def.r, 20).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x1a2a14, transparent: true, opacity: 0.3, depthWrite: false }),
        );
        sh.position.y = 0.02;
        obj.add(sh);
        crit = { def, tex, pose: 'normal' };
      }
      const ow = this.roadW(o.s, o.x);
      obj.position.set(ow.x, 0, ow.z);
      obj.rotation.y = -ow.psi;
      this.scene.add(obj);
      this.obstacleObjs.push({ o, obj, spin, sprite, crit });
    }
  }

  /** 動物・モンスターの、ポーズごとの絵(同じ絵は1回だけ読み込む)。 */
  private loadCritterTex(key: string, pose: number): THREE.Texture {
    const id = `${key}_${pose}`;
    let t = this.critterTex.get(id);
    if (!t) {
      t = loadTex(`${ASSET}/runner/critters/${id}.png`);
      this.critterTex.set(id, t);
    }
    return t;
  }

  // ---- コイン ----
  private buildCoins(): void {
    const n = this.course.coins.length;
    const glow = this.theme.night ? 1.1 : 0.55;
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.85, roughness: 0.28, emissive: 0x7a4a00, emissiveIntensity: glow });
    const rimM = new THREE.MeshStandardMaterial({ color: 0xffe28a, metalness: 0.9, roughness: 0.2, emissive: 0x7a5200, emissiveIntensity: glow });
    this.coinDisc = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 28).rotateX(Math.PI / 2), gold, n);
    this.coinRim = new THREE.InstancedMesh(new THREE.TorusGeometry(0.4, 0.06, 10, 28), rimM, n);
    for (const m of [this.coinDisc, this.coinRim]) {
      m.frustumCulled = false;
      m.castShadow = true;
      this.scene.add(m);
    }
    // 回復薬(ハートが1つふえる)
    for (const c of this.course.coins) {
      if (c.kind !== 'potion') continue;
      const g = new THREE.Group();
      const glass = new THREE.MeshPhysicalMaterial({ color: 0xff5a86, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.9, emissive: 0xff2a60, emissiveIntensity: 0.5 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 16), glass);
      body.scale.set(1, 0.92, 1);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.34, 12), glass);
      neck.position.y = 0.52;
      const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xc49a5a, roughness: 0.9 }));
      cork.position.y = 0.76;
      const cross = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.06), cross);
      const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.06), cross);
      h1.position.z = h2.position.z = 0.44;
      g.add(body, neck, cork, h1, h2);
      g.scale.setScalar(1.5);
      this.scene.add(g);
      this.potionObjs.push({ id: c.id, s: c.s, x: c.x, y: c.y, obj: g });
    }
  }

  /** 大仏の目が光った(罠がふえる)ときの見た目。 */
  private setAwake(on: boolean): void {
    this.awake = on;
    if (!this.daibutsu) return;
    (this.daibutsu.mesh.material as THREE.MeshBasicMaterial).map = on ? this.daibutsu.wake : this.daibutsu.open;
    (this.daibutsu.mesh.material as THREE.MeshBasicMaterial).color.setScalar(on ? 1 : 0.4);
    (this.daibutsu.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    this.daibutsu.light.intensity = on ? 600 : 0;
    (this.daibutsu.eyes.material as THREE.PointsMaterial).opacity = on ? 1 : 0;
  }

  // ---- 雨・雪 ----
  private buildWeather(): void {
    const w = this.theme.weather;
    if (w === 'none') return;
    const rain = w === 'rain';
    const n = rain ? 1300 : 1700;
    const pos = new Float32Array(n * (rain ? 6 : 3));
    const seed = new Float32Array(n * 4);
    const rnd = rngFor(77);
    for (let i = 0; i < n; i++) {
      seed[i * 4] = (rnd() - 0.5) * 34; // x
      seed[i * 4 + 1] = rnd() * 16; // 落ちはじめのずれ
      seed[i * 4 + 2] = -rnd() * 56 + 6; // z(カメラからの相対)
      seed[i * 4 + 3] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    let obj: THREE.Object3D;
    if (rain) {
      obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfe0f2, transparent: true, opacity: 0.45, depthWrite: false }));
    } else {
      const tex = glowTexture();
      this.disposables.push(tex);
      obj = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, color: 0xffffff, size: 0.42, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }));
    }
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.weather = { pts: obj, pos, n, rain, seed };
  }

  private updateWeather(t: number): void {
    const wd = this.weather;
    if (!wd) return;
    const { pos, n, rain, seed } = wd;
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    const cs = Math.cos(this.camPsi);
    const sn = Math.sin(this.camPsi);
    for (let i = 0; i < n; i++) {
      const lx = seed[i * 4];
      const lz = seed[i * 4 + 2];
      // 道の向きに合わせて回した、カメラからの位置
      const sx = lx * cs - lz * sn;
      const sz = lx * sn + lz * cs;
      const r = seed[i * 4 + 3];
      if (rain) {
        // 速く落ちて地面でもどる(カメラのまわりに降り続ける)
        const y = 16 - ((t * (22 + r * 8) + seed[i * 4 + 1]) % 16);
        const k = i * 6;
        pos[k] = cx + sx;
        pos[k + 1] = y;
        pos[k + 2] = cz + sz;
        pos[k + 3] = cx + sx + 0.18;
        pos[k + 4] = y + 0.85;
        pos[k + 5] = cz + sz - 0.08;
      } else {
        const y = 15 - ((t * (1.6 + r * 1.4) + seed[i * 4 + 1]) % 15);
        const k = i * 3;
        pos[k] = cx + sx + Math.sin(t * 0.6 + i) * 0.7;
        pos[k + 1] = y;
        pos[k + 2] = cz + sz + Math.cos(t * 0.5 + i * 1.3) * 0.5;
      }
    }
    (wd.pts as THREE.Mesh).geometry.attributes.position.needsUpdate = true;
  }

  private resize(): void {
    const w = this.host.clientWidth || 360;
    const h = this.host.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.6 ? 62 : 62 - Math.min(14, (w / h - 0.6) * 24);
    this.camera.updateProjectionMatrix();
  }

  /** ぶつかったときの揺れ。 */
  bump(power = 0.35): void {
    this.shake = power;
  }

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  private tmpE = new THREE.Euler();
  private clock = 0;
  private camPsi = 0; // いまの道の向き(カメラの向き)

  render(run: Run, dt: number): void {
    const t = run.t;
    this.clock += dt;
    const px = run.x;
    const pz = -run.s;
    const waving = run.phase === 'cleared' ? Math.sin(t * 9) * 0.06 : 0;

    // 鹿(道の中心から x の位置。道の向きに合わせて、カメラのほうを向く)
    const wd = this.roadW(run.s, px);
    this.camPsi = wd.psi;
    const frame = run.airborne ? 1 : Math.floor(run.stride / 0.85) % 4;
    const mat = this.deer.material as THREE.MeshBasicMaterial;
    if (mat.map !== this.runTex[frame]) mat.map = this.runTex[frame];
    const bob = run.airborne ? 0 : Math.abs(Math.sin(run.stride * 1.9)) * 0.1;
    this.deer.position.set(wd.x, run.y + bob, wd.z);
    this.deer.rotation.set(0, -wd.psi, -run.vx * 0.022 + waving, 'YXZ');
    const squash = run.airborne ? 1 + Math.min(0.1, run.y * 0.04) : 1;
    this.deer.scale.set(1 / squash, squash, 1);
    this.deer.visible = run.invuln > 0 ? Math.floor(t * 16) % 2 === 0 : true;
    this.deerShadow.position.set(wd.x, 0.03, wd.z);
    const ss = Math.max(0.5, 1 - run.y * 0.18);
    this.deerShadow.scale.set(ss, 1, ss);

    // カメラ(鹿の少しうしろ・上から。道に沿って曲がり、左右はゆるく追う)
    this.camX += (px * 0.72 - this.camX) * Math.min(1, dt * 6);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      sx = (Math.random() - 0.5) * this.shake * 0.7;
      sy = (Math.random() - 0.5) * this.shake * 0.5;
    }
    const lift = run.y * 0.25;
    // クリア後は少し引いて、ゴールの景色の全体が見えるようにする
    this.cine += ((run.phase === 'cleared' ? 1 : 0) - this.cine) * Math.min(1, dt * 1.6);
    const c = this.cine;
    const back = this.roadW(run.s - (6.4 + c * 3.2), this.camX + sx);
    const ahead = this.roadW(run.s + 9 + c * 14, this.camX * 0.95);
    this.camera.position.set(back.x, 3.5 + lift + sy + c * 2.2, back.z);
    this.camera.lookAt(ahead.x, 1.5 + lift * 0.5 + c * 2.6, ahead.z);

    // 太陽(月)の影は鹿のまわりだけ
    const sp = this.theme.sunPos;
    this.sun.position.set(wd.x + sp[0], sp[1], wd.z + sp[2]);
    const tw = this.roadW(run.s + 6, px);
    this.sun.target.position.set(tw.x, 0, tw.z);
    this.sun.target.updateMatrixWorld();
    if (this.headlight) {
      const hw = this.roadW(run.s + 4, px);
      this.headlight.position.set(hw.x, 3.4, hw.z);
    }
    if (this.footGlow) {
      const gw = this.roadW(run.s + 3.2, px);
      this.footGlow.position.set(gw.x, 0.05, gw.z);
      this.footGlow.rotation.y = -gw.psi;
    }

    // コイン
    const coins = this.course.coins;
    const spin = t * 2.6;
    for (let i = 0; i < coins.length; i++) {
      const cn = coins[i];
      const near = cn.s - run.s < 170 && cn.s - run.s > -1.5; // 取りそこねて後ろに行ったコインはカメラの前を通らないよう消す
      const alive = !run.collected.has(cn.id) && near;
      if (!alive && this.lastCoinState[i] === 0) continue;
      this.lastCoinState[i] = alive ? 1 : 0;
      const k = alive && cn.kind !== 'potion' ? 1 : 0;
      this.tmpQ.setFromEuler(this.tmpE.set(0, spin + i * 0.7, 0));
      const cw = this.roadW(cn.s, cn.x);
      this.tmpM.compose(this.tmpP.set(cw.x, cn.y + Math.sin(t * 3 + i) * 0.06, cw.z), this.tmpQ, this.tmpS.set(k, k, k));
      this.coinDisc.setMatrixAt(i, this.tmpM);
      this.coinRim.setMatrixAt(i, this.tmpM);
    }
    this.coinDisc.instanceMatrix.needsUpdate = true;
    this.coinRim.instanceMatrix.needsUpdate = true;
    for (const po of this.potionObjs) {
      const near = po.s - run.s < 170 && po.s - run.s > -1.5 && !run.collected.has(po.id);
      po.obj.visible = near;
      if (!near) continue;
      const pw = this.roadW(po.s, po.x);
      po.obj.position.set(pw.x, po.y + Math.sin(t * 3) * 0.12, pw.z);
      po.obj.rotation.y = t * 1.8 - pw.psi;
    }
    // 大仏の目が光る
    const awakeNow = this.course.wake !== undefined && run.progress >= this.course.wake;
    if (awakeNow !== this.awake) this.setAwake(awakeNow);
    if (this.awake && this.daibutsu) (this.daibutsu.eyes.material as THREE.PointsMaterial).opacity = 0.78 + 0.22 * Math.sin(this.clock * 4);

    // 動く障害物
    for (const e of this.obstacleObjs) {
      const st = run.stateOf(e.o);
      if (st.s - run.s > 170 || st.s - run.s < -3.5) {
        e.obj.visible = false;
        continue;
      }
      e.obj.visible = true;
      if (e.crit && e.sprite) {
        // 動物・モンスター: 動き方と状態で、ポーズを切りかえる
        const o = e.o;
        const ow = this.roadW(st.s, st.x);
        e.obj.position.set(ow.x, 0, ow.z);
        e.obj.rotation.y = -this.camPsi; // 絵は、いつもカメラのほうを向く
        const hit = run.consumed.has(o.id);
        const pose = hit ? 'dizzy' : o.behavior === 'sleep' ? 'sleep' : o.behavior === 'charge' ? (run.chargeT.has(o.id) ? 'angry' : 'normal') : o.behavior === 'hop' && st.y > 0.5 ? 'angry' : 'normal';
        if (pose !== e.crit.pose) {
          e.crit.pose = pose;
          const m = e.sprite.material as THREE.MeshBasicMaterial;
          m.map = e.crit.tex[pose as 'normal'];
          m.needsUpdate = true;
        }
        // 絵の縦横比に合わせて大きさをそろえる(読み込み前は正方形)
        const img = e.crit.tex[pose as 'normal'].image as { width: number; height: number } | undefined;
        const aspect = img && img.height ? img.width / img.height : 1;
        const h = e.crit.def.size;
        const walk = o.behavior === 'cross' ? Math.abs(Math.sin(t * 8)) * 0.1 : 0;
        e.sprite.scale.set(h * aspect, h * (1 + (o.behavior === 'charge' && pose === 'angry' ? Math.sin(t * 20) * 0.04 : 0)), 1);
        e.sprite.position.y = st.y + walk;
        e.sprite.rotation.z = o.behavior === 'cross' ? Math.sin(t * 8) * 0.07 * (st.dir || 1) : 0;
        continue;
      }
      if (e.o.kind === 'stone' || e.o.kind === 'deer') {
        const ow = this.roadW(st.s, st.x);
        e.obj.position.set(ow.x, 0, ow.z);
        e.obj.rotation.y = e.o.kind === 'deer' ? -this.camPsi : -ow.psi;
        if (e.spin) {
          if (this.theme.setting === 'town') {
            e.spin.rotation.z -= st.dir * dt * 2.6; // 樽は横にころがる
          } else {
            e.spin.rotation.x -= (run.speed * dt) / 0.85;
            e.spin.rotation.z -= st.dir * dt * 2.4;
          }
        }
        if (e.sprite) {
          const arr = this.walkTex[st.dir < 0 ? 'doe_l' : 'doe_r'];
          const m = e.sprite.material as THREE.MeshBasicMaterial;
          const f = arr[Math.floor(t * 9) % 4];
          if (m.map !== f) {
            m.map = f;
            m.needsUpdate = true;
          }
          e.sprite.position.y = Math.abs(Math.sin((t * 9 * Math.PI) / 4)) * 0.08;
        }
      }
    }

    if (this.wheel) this.wheel.rotation.z -= dt * 0.05;
    this.updateWeather(this.clock);
    this.renderer.toneMappingExposure = this.theme.exposure + this.cine * 0.15;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mm of mats) {
        const tex = (mm as THREE.MeshBasicMaterial).map;
        if (tex) tex.dispose();
        mm.dispose();
      }
    });
    for (const t of this.runTex) t.dispose();
    for (const t of this.critterTex.values()) t.dispose();
    for (const arr of Object.values(this.walkTex)) for (const t of arr) t.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
