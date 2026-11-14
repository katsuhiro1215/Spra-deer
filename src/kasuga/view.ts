// 「春日大社へ」お試しの3D表示(Three.js)。ルールの計算は sim.ts、ここは見た目だけ。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { COURSE_LENGTH, ROAD_HALF, SHRINE_S, obstacleState, type Course, type Obstacle } from './course.ts';
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

function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (g, n) => {
    const grd = g.createLinearGradient(0, 0, 0, n);
    grd.addColorStop(0, '#5aa9ec');
    grd.addColorStop(0.45, '#a9d6f5');
    grd.addColorStop(0.78, '#e6f2ea');
    grd.addColorStop(1, '#eef4df');
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    // やわらかい雲
    const rnd = rngFor(11);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 9; i++) {
      const cx = rnd() * n;
      const cy = n * (0.12 + rnd() * 0.3);
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.ellipse(cx + k * 22 - 60, cy + Math.sin(k) * 6, 38 + rnd() * 22, 16 + rnd() * 8, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
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
  private deer: THREE.Mesh;
  private deerShadow: THREE.Mesh;
  private runTex: THREE.Texture[] = [];
  private coinDisc: THREE.InstancedMesh;
  private coinRim: THREE.InstancedMesh;
  private obstacleObjs: { o: Obstacle; obj: THREE.Object3D; spin?: THREE.Object3D; sprite?: THREE.Mesh }[] = [];
  private walkTex: Record<string, THREE.Texture[]> = {};
  private lastCoinState: Uint8Array;
  private shake = 0;
  private camX = 0;
  private host: HTMLElement;
  private ro: ResizeObserver;
  private course: Course;
  private goalLight = 0;
  private cine = 0;
  private disposables: { dispose(): void }[] = [];

  constructor(host: HTMLElement, course: Course) {
    this.host = host;
    this.course = course;
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.domElement.className = 'ks-canvas';
    host.appendChild(r.domElement);
    this.renderer = r;

    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xe3f0e6, 90, 340);
    const pm = new THREE.PMREMGenerator(r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pm.dispose();

    this.camera = new THREE.PerspectiveCamera(62, 9 / 16, 0.3, 420);

    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x8fae7a, 0.85));
    this.sun = new THREE.DirectionalLight(0xfff0d2, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.buildGround();
    this.buildScenery();
    this.buildTorii();
    this.buildShrine();
    this.buildObstacles();
    [this.coinDisc, this.coinRim] = this.buildCoins();
    this.lastCoinState = new Uint8Array(course.coins.length).fill(2); // 2=まだ一度も配置していない

    for (let i = 0; i < 4; i++) this.runTex.push(loadTex(`${ASSET}/kasuga/run_${i}.png`));
    for (const k of ['doe_l', 'doe_r']) this.walkTex[k] = [0, 1, 2, 3].map((i) => loadTex(`${ASSET}/deer-walk/${k}_${i}.png`));

    const dg = new THREE.PlaneGeometry(1.7, 2.267);
    dg.translate(0, 1.13, 0);
    this.deer = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: this.runTex[0], transparent: true, alphaTest: 0.45, toneMapped: false }));
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

  // ---- 地面 ----
  private buildGround(): void {
    const gravel = noiseTexture('#cdbf9f', ['#b9a984', '#ddd0b4', '#a8987a', '#e6dcc4'], 1600);
    const grass = noiseTexture('#6fae4f', ['#5f9d43', '#82c25e', '#559338'], 1400);
    this.disposables.push(gravel, grass);
    const matRoad = new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 });
    const matGrass = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
    const matCurb = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9 });
    const end = SHRINE_S - 6;
    const holes = this.course.obstacles.filter((o) => o.kind === 'hole');
    const spans: [number, number][] = [];
    let cur = -30;
    for (const h of holes) {
      spans.push([cur, h.s]);
      cur = h.s + h.len;
    }
    spans.push([cur, end]);
    const w = ROAD_HALF * 2;
    for (const [a, b] of spans) {
      const len = b - a;
      const g = new THREE.PlaneGeometry(w, len);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 4), uv.getY(i) * (len / 4));
      const road = new THREE.Mesh(g, matRoad);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0, -(a + b) / 2);
      road.receiveShadow = true;
      this.scene.add(road);
      for (const sx of [-1, 1]) {
        const curb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, len), matCurb);
        curb.position.set(sx * (ROAD_HALF + 0.2), 0.11, -(a + b) / 2);
        curb.receiveShadow = true;
        curb.castShadow = true;
        this.scene.add(curb);
      }
    }
    // 両側の芝
    const L = end + 330;
    const gs = 90;
    for (const sx of [-1, 1]) {
      const g = new THREE.PlaneGeometry(gs, L);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (gs / 6), uv.getY(i) * (L / 6));
      const m = new THREE.Mesh(g, matGrass);
      m.rotation.x = -Math.PI / 2;
      m.position.set(sx * (ROAD_HALF + 0.4 + gs / 2), -0.02, -(L / 2 - 40));
      m.receiveShadow = true;
      this.scene.add(m);
    }
    // 穴(のぞくと深い)
    const pitMat = new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: 1, side: THREE.BackSide });
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.5, emissive: 0x401400 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    for (const h of holes) {
      const pit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 4, h.len), pitMat);
      pit.position.set(0, -2, -(h.s + h.len / 2));
      this.scene.add(pit);
      // 手前に三角コーン(あぶないよの目印)
      for (const sx of [-1, 1]) {
        for (const zz of [h.s - 1.4, h.s + h.len + 1.4]) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.9, 14), pylonMat);
          cone.position.set(sx * (ROAD_HALF - 0.5), 0.45, -zz);
          cone.castShadow = true;
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.14, 14), stripe);
          band.position.set(sx * (ROAD_HALF - 0.5), 0.5, -zz);
          this.scene.add(cone, band);
        }
      }
    }
  }

  // ---- 灯籠と杉並木 ----
  private buildScenery(): void {
    const stone = new THREE.MeshStandardMaterial({ color: 0xaaa69b, roughness: 0.95 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb040, emissiveIntensity: 1.6, roughness: 0.6 });
    const lanternParts: PartDef[] = [
      { geo: new THREE.BoxGeometry(0.95, 0.25, 0.95), mat: stone, pos: [0, 0.125, 0] },
      { geo: new THREE.CylinderGeometry(0.17, 0.2, 0.95, 10), mat: stone, pos: [0, 0.72, 0] },
      { geo: new THREE.CylinderGeometry(0.52, 0.4, 0.14, 8), mat: stone, pos: [0, 1.26, 0] },
      { geo: new THREE.BoxGeometry(0.42, 0.46, 0.42), mat: glow, pos: [0, 1.56, 0] },
      { geo: new THREE.ConeGeometry(0.82, 0.5, 4), mat: stone, pos: [0, 2.04, 0], rotY: Math.PI / 4 },
      { geo: new THREE.SphereGeometry(0.1, 10, 8), mat: stone, pos: [0, 2.36, 0] },
    ];
    const lp: Placement[] = [];
    for (let s = 10; s < SHRINE_S - 8; s += 13) {
      for (const sx of [-1, 1]) lp.push({ x: sx * (ROAD_HALF + 1.5), z: -s, rotY: Math.PI / 4, scale: 1.3 });
    }
    addInstanced(this.scene, lanternParts, lp);

    // 杉(根もと・3段の葉)
    const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
    const leafA = new THREE.MeshStandardMaterial({ color: 0x2f6a3a, roughness: 0.9 });
    const leafB = new THREE.MeshStandardMaterial({ color: 0x3d7d43, roughness: 0.9 });
    const treeParts: PartDef[] = [
      { geo: new THREE.CylinderGeometry(0.35, 0.5, 3.2, 8), mat: trunk, pos: [0, 1.6, 0] },
      { geo: new THREE.ConeGeometry(3.0, 5.2, 9), mat: leafA, pos: [0, 5.0, 0] },
      { geo: new THREE.ConeGeometry(2.4, 4.4, 9), mat: leafB, pos: [0, 7.8, 0] },
      { geo: new THREE.ConeGeometry(1.7, 3.6, 9), mat: leafA, pos: [0, 10.3, 0] },
    ];
    const rnd = rngFor(99);
    const tp: Placement[] = [];
    for (let s = -20; s < SHRINE_S + 60; s += 4.6) {
      for (const sx of [-1, 1]) {
        if (rnd() < 0.18) continue;
        const near = 8 + rnd() * 6;
        tp.push({ x: sx * near, z: -(s + rnd() * 3), scale: 0.8 + rnd() * 0.7, rotY: rnd() * 6 });
        if (rnd() < 0.5) tp.push({ x: sx * (near + 9 + rnd() * 14), z: -(s + rnd() * 4), scale: 1 + rnd() * 0.9, rotY: rnd() * 6 });
      }
    }
    addInstanced(this.scene, treeParts, tp);

    // 低木・石の飾り(参道のにぎわい)
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x4f9446, roughness: 1 });
    const bp: Placement[] = [];
    for (let s = 0; s < SHRINE_S; s += 7) {
      for (const sx of [-1, 1]) if (rnd() < 0.7) bp.push({ x: sx * (ROAD_HALF + 3 + rnd() * 3), z: -(s + rnd() * 6), scale: 0.6 + rnd() * 0.6 });
    }
    addInstanced(this.scene, [{ geo: new THREE.SphereGeometry(1, 10, 8), mat: bushMat, pos: [0, 0.6, 0] }], bp);
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
    g.position.z = -z;
    g.scale.setScalar(scale);
    return g;
  }

  private buildTorii(): void {
    for (const s of [90, 230, 380, 520, 650, 760, 850, 920]) this.scene.add(this.torii(s));
    // ゴールの大鳥居
    this.scene.add(this.torii(COURSE_LENGTH, 1.35));
  }

  // ---- 春日大社 ----
  private buildShrine(): void {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5, emissive: 0x240700 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.85 });
    const roof = new THREE.MeshStandardMaterial({ color: 0x6f5a45, roughness: 0.95 });
    const roofEdge = new THREE.MeshStandardMaterial({ color: 0x4a3b2d, roughness: 0.9 });
    const stoneM = new THREE.MeshStandardMaterial({ color: 0xcdc5b4, roughness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 0.6, roughness: 0.3, emissive: 0x6a4410, emissiveIntensity: 0.6 });
    const lampM = new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffa830, emissiveIntensity: 1.8 });

    // 石段
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
      // 屋根(檜皮葺ふうのピラミッド+軒)
      const r1 = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.82, h * 0.8, 4), roof);
      r1.rotation.y = Math.PI / 4;
      r1.scale.set(w / Math.hypot(w, d) * 1.0, 1, d / Math.hypot(w, d) * 1.0);
      r1.position.y = h + 0.7 + h * 0.4;
      r1.castShadow = true;
      const eave = new THREE.Mesh(new THREE.BoxGeometry(w + 3.4, 0.5, d + 3.4), roofEdge);
      eave.position.y = h + 0.95;
      eave.castShadow = true;
      b.add(r1, eave);
      // 吊り灯籠
      const n = Math.max(3, Math.floor(w / 2.4));
      for (let i = 0; i < n; i++) {
        const lx = -w / 2 + 0.8 + (i * (w - 1.6)) / (n - 1);
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 10), lampM);
        lamp.position.set(lx, h - 0.5, d / 2 + 0.9);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.2, 10), gold);
        cap.position.set(lx, h - 0.05, d / 2 + 0.9);
        b.add(lamp, cap);
      }
      b.position.set(x, y0, z);
      g.add(b);
    };
    // 手前の大きな門(楼門ふう)・回廊・本殿
    building(0, 5, 14, 7, 7.5, 2.5, 4);
    building(-15.5, 2, 13, 5, 5.2, 2.5, 4);
    building(15.5, 2, 13, 5, 5.2, 2.5, 4);
    building(0, -10, 18, 10, 8.5, 2.5, 5);
    building(-9, -22, 9, 7, 7, 2.5, 3);
    building(9, -22, 9, 7, 7, 2.5, 3);
    // 後ろの山(御蓋山)
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(60, 28, 16),
      new THREE.MeshStandardMaterial({ color: 0x4d8a47, roughness: 1 }),
    );
    hill.scale.set(1.6, 0.62, 0.9);
    hill.position.set(0, -6, -80);
    g.add(hill);
    // 後ろの木々
    const rnd = rngFor(5);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f6a3a, roughness: 0.95 });
    const cone = new THREE.ConeGeometry(3.2, 11, 8);
    for (let i = 0; i < 26; i++) {
      const t = new THREE.Mesh(cone, treeMat);
      t.position.set((rnd() - 0.5) * 120, 5 + rnd() * 3, -34 - rnd() * 30);
      t.scale.setScalar(0.9 + rnd() * 0.8);
      g.add(t);
    }
    g.position.set(0, 0, -SHRINE_S);
    g.scale.setScalar(1.2); // 遠くからでも赤い社殿が目に入るように、少し大きく
    this.scene.add(g);
  }

  // ---- 障害物 ----
  private buildObstacles(): void {
    const poopMat = new THREE.MeshPhysicalMaterial({ color: 0x7b4a24, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.35 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1210, roughness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0xb4814b, roughness: 0.85 });
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x8e8a83, roughness: 0.95, flatShading: true });
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
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.15, 0.22), wood);
          p.position.set(-o.halfW + (i * w) / (n - 1), 0.575, 0);
          p.castShadow = true;
          obj.add(p);
        }
        for (const y of [0.42, 0.86]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, 0.13), wood);
          rail.position.set(0, y, 0.05);
          rail.castShadow = true;
          obj.add(rail);
        }
      } else if (o.kind === 'stone') {
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), stoneM);
        rock.position.y = 0.85;
        rock.castShadow = true;
        spin = rock;
        obj.add(rock);
      } else if (o.kind === 'deer') {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 1.78).translate(0, 0.89, 0),
          new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.45, toneMapped: false }),
        );
        sprite = m;
        obj.add(m);
        const sh = new THREE.Mesh(
          new THREE.CircleGeometry(0.7, 20).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x1a2a14, transparent: true, opacity: 0.3, depthWrite: false }),
        );
        sh.position.y = 0.02;
        obj.add(sh);
      }
      obj.position.set(o.x, 0, -o.s);
      this.scene.add(obj);
      this.obstacleObjs.push({ o, obj, spin, sprite });
    }
  }

  // ---- コイン ----
  private buildCoins(): THREE.InstancedMesh[] {
    const n = this.course.coins.length;
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.85, roughness: 0.28, emissive: 0x7a4a00, emissiveIntensity: 0.55 });
    const rimM = new THREE.MeshStandardMaterial({ color: 0xffe28a, metalness: 0.9, roughness: 0.2, emissive: 0x7a5200, emissiveIntensity: 0.5 });
    const disc = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 28).rotateX(Math.PI / 2), gold, n);
    const rim = new THREE.InstancedMesh(new THREE.TorusGeometry(0.4, 0.06, 10, 28), rimM, n);
    for (const m of [disc, rim]) {
      m.frustumCulled = false;
      m.castShadow = true;
      this.scene.add(m);
    }
    return [disc, rim];
  }

  private resize(): void {
    const w = this.host.clientWidth || 360;
    const h = this.host.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // 横長でも縦が足りるようにする
    this.camera.fov = w / h < 0.6 ? 62 : 62 - Math.min(14, (w / h - 0.6) * 24);
    this.camera.updateProjectionMatrix();
  }

  /** 事件(ぶつかった等)の揺れ。 */
  bump(power = 0.35): void {
    this.shake = power;
  }

  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();

  render(run: Run, dt: number): void {
    const t = run.t;
    const px = run.x;
    const pz = -run.s;
    const waving = run.phase === 'cleared' ? Math.sin(t * 9) * 0.06 : 0;

    // 鹿
    const frame = run.airborne ? 1 : Math.floor(run.stride / 0.85) % 4;
    const mat = this.deer.material as THREE.MeshBasicMaterial;
    if (mat.map !== this.runTex[frame]) mat.map = this.runTex[frame];
    const bob = run.airborne ? 0 : Math.abs(Math.sin(run.stride * 1.9)) * 0.1;
    this.deer.position.set(px, run.y + bob, pz);
    this.deer.rotation.z = -run.vx * 0.022 + waving;
    const squash = run.airborne ? 1 + Math.min(0.1, run.y * 0.04) : 1;
    this.deer.scale.set(1 / squash, squash, 1);
    this.deer.visible = run.invuln > 0 ? Math.floor(t * 16) % 2 === 0 : true;
    this.deerShadow.position.set(px, 0.03, pz);
    const ss = Math.max(0.5, 1 - run.y * 0.18);
    this.deerShadow.scale.set(ss, 1, ss);

    // カメラ(鹿の少しうしろ・上から。左右はゆるく追う)
    this.camX += (px * 0.72 - this.camX) * Math.min(1, dt * 6);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      sx = (Math.random() - 0.5) * this.shake * 0.7;
      sy = (Math.random() - 0.5) * this.shake * 0.5;
    }
    const lift = run.y * 0.25;
    // クリア後は少し引いて、春日大社の全体が見えるようにする
    this.cine += ((run.phase === 'cleared' ? 1 : 0) - this.cine) * Math.min(1, dt * 1.6);
    const c = this.cine;
    this.camera.position.set(this.camX + sx, 3.5 + lift + sy + c * 3.4, pz + 6.4 + c * 5);
    this.camera.lookAt(this.camX * 0.95, 1.5 + lift * 0.5 + c * 4.2, pz - 9 - c * 20);

    // 太陽の影は鹿のまわりだけ
    this.sun.position.set(px + 14, 26, pz + 8);
    this.sun.target.position.set(px, 0, pz - 6);
    this.sun.target.updateMatrixWorld();

    // コイン
    const coins = this.course.coins;
    const spin = t * 2.6;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      const near = c.s - run.s < 170 && c.s - run.s > -3; // 取りそこねて後ろに行ったコインはカメラの前を通らないよう消す
      const alive = !run.collected.has(c.id) && near;
      if (!alive && this.lastCoinState[i] === 0) continue;
      this.lastCoinState[i] = alive ? 1 : 0;
      const k = alive ? 1 : 0;
      this.tmpQ.setFromEuler(new THREE.Euler(0, spin + i * 0.7, 0));
      this.tmpM.compose(this.tmpP.set(c.x, c.y + Math.sin(t * 3 + i) * 0.06, -c.s), this.tmpQ, this.tmpS.set(k, k, k));
      this.coinDisc.setMatrixAt(i, this.tmpM);
      this.coinRim.setMatrixAt(i, this.tmpM);
    }
    // 近いコインは毎フレーム回すので、状態の記録は「遠い/取った」だけスキップ
    this.coinDisc.instanceMatrix.needsUpdate = true;
    this.coinRim.instanceMatrix.needsUpdate = true;

    // 動く障害物
    for (const e of this.obstacleObjs) {
      if (e.o.s - run.s > 170 || e.o.s - run.s < -3.5) {
        e.obj.visible = false;
        continue;
      }
      e.obj.visible = true;
      if (e.o.kind === 'stone' || e.o.kind === 'deer') {
        const st = obstacleState(e.o, t);
        e.obj.position.x = st.x;
        if (e.spin) {
          e.spin.rotation.x -= (run.speed * dt) / 0.85; // 手前へころがってくる
          e.spin.rotation.z -= st.dir * dt * 2.4; // 横にもころがる
        }
        if (e.sprite) {
          const arr = this.walkTex[st.dir < 0 ? 'doe_l' : 'doe_r'];
          const m = e.sprite.material as THREE.MeshBasicMaterial;
          const f = arr[Math.floor(t * 9) % 4];
          if (m.map !== f) {
            m.map = f;
            m.needsUpdate = true;
          }
          e.sprite.position.y = Math.abs(Math.sin(t * 9 * Math.PI / 4)) * 0.08;
        }
      }
    }

    // ゴールに近づくほど、空と霧が明るくあたたかく
    this.goalLight += ((run.phase === 'cleared' ? 1 : 0) - this.goalLight) * Math.min(1, dt * 2);
    this.renderer.toneMappingExposure = 1.05 + this.goalLight * 0.15;

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
    for (const arr of Object.values(this.walkTex)) for (const t of arr) t.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
