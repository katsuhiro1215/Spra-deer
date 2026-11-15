// 3D走りゲームの表示(Three.js)。ルールの計算は sim.ts、ここは見た目だけ。
// 面ごとの空・光・天候・景色は RunnerLevel.theme で切り替える。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BRIDGE_HALF, FISH_X0, FISH_X1, GOAL_GAP, RAMP_DROP, ROAD_HALF, bridgeSway, hillY, roadHeading, roadX, roadY, type Course, type Obstacle } from './course.ts';
import { CRITTERS, type CritterDef } from './critters.ts';
import { LANDMARK_ASPECT } from './landmarks.ts';
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
  /** コインの形(種類ごと: 0=シルバー 1=ゴールド 2=プレミアム) */
  private coinSets: { disc: THREE.InstancedMesh; rim: THREE.InstancedMesh }[] = [];
  /** コースのコインの番号 → 種類 */
  private coinTier: number[] = [];
  /** プレミアムコインの光(取ったら消す) */
  private premiumHalo?: { id: number; s: number; x: number; y: number; obj: THREE.Sprite };
  private obstacleObjs: { o: Obstacle; obj: THREE.Object3D; spin?: THREE.Object3D; sprite?: THREE.Mesh; crit?: { def: CritterDef; tex: Record<'normal' | 'angry' | 'sleep' | 'dizzy', THREE.Texture>; pose: string } }[] = [];
  private critterTex = new Map<string, THREE.Texture>();
  private daibutsu?: { mesh: THREE.Mesh; open: THREE.Texture; wake: THREE.Texture; light: THREE.PointLight; eyes: THREE.Points; hall: THREE.Mesh };
  private potionObjs: { id: number; s: number; x: number; y: number; obj: THREE.Group }[] = [];
  private awake = false;
  private walkTex: Record<string, THREE.Texture[]> = {};
  private shake = 0;
  private camX = 0;
  private host: HTMLElement;
  private ro: ResizeObserver;
  private course: Course;
  private theme: Theme;
  private level: RunnerLevel;
  private end: number; // 道の終わり(ゴールの先)
  private cine = 0;
  /** 道の中心線の左右のずれ(1mごと。地面の高さを求めるときに使う) */
  private clX?: Float64Array;
  /** カメラの高さの基準(坂に合わせて、なめらかに追う) */
  private camBase = 0;
  private camLook = 0;
  private weather?: { pts: THREE.Object3D; pos: Float32Array; n: number; rain: boolean; seed: Float32Array; flutter: boolean };
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

    // 鹿の絵(走る鹿・歩く鹿)。ゴールの景色(奈良公園の鹿)でも使うので、先に読む
    for (let i = 0; i < 4; i++) this.runTex.push(loadTex(`${ASSET}/kasuga/run_${i}.png`));
    for (const k of ['doe_l', 'doe_r']) this.walkTex[k] = [0, 1, 2, 3].map((i) => loadTex(`${ASSET}/deer-walk/${k}_${i}.png`));

    this.buildGround();
    if (level.scenes) {
      this.buildScenes(level.scenes);
    } else if (theme.setting === 'town') {
      // 山を下りて街に入る面は、手前を杉の山道にする
      const from = level.townFrom ? course.length * level.townFrom : 0;
      if (from > 0) this.buildSandoScenery(-20, from);
      this.buildTownScenery(from);
    } else {
      this.buildSandoScenery(); // 山道も、灯籠・鳥居をのぞいて同じ木々
      if (theme.setting === 'sando') this.buildTorii();
    }
    const before = this.scene.children.length;
    if (theme.goal === 'shrine') this.buildShrine();
    else if (theme.goal === 'bay') this.buildBay();
    else if (theme.goal === 'todaiji') this.buildTodaiji();
    else if (theme.goal === 'horyuji') this.buildHoryuji();
    else if (theme.goal === 'omiwa') this.buildOmiwa();
    else if (theme.goal === 'heijo') this.buildHeijo();
    else if (theme.goal === 'zaodo') this.buildZaodo();
    else if (theme.goal === 'castle') this.buildCastle();
    else if (theme.goal === 'park') this.buildPark();
    else this.buildSummit();
    // ゴールの景色は、ゴールの道の高さ(坂を登った・下った先)に置く
    const hEnd = this.gy(course.length);
    if (hEnd !== 0) for (const ch of this.scene.children.slice(before)) if (!ch.userData.placed) ch.position.y += hEnd;
    for (const lm of level.landmarks ?? []) this.buildLandmark(lm);
    this.buildObstacles();
    this.buildCoins();
    this.buildWeather();

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

  /** 距離 s・道の中心から右へ x の位置を、世界の座標にする(曲がる道に沿う)。psi=道の向き、y=道の高さ(坂・ジャンプ台) */
  private roadW(s: number, x = 0): { x: number; y: number; z: number; psi: number } {
    const psi = roadHeading(this.course, s);
    return { x: roadX(this.course, s) + x * Math.cos(psi), y: roadY(this.course, s), z: -s + x * Math.sin(psi), psi };
  }

  /** 坂のある面か(地面を、高さのある1枚にする)。 */
  private get hilly(): boolean {
    return !!this.course.hills || !!this.course.bridge;
  }

  /** つり橋の下の谷の深さ(0〜1。橋の両端では0、まんなかで1) */
  private valley(s: number): number {
    const b = this.course.bridge;
    if (!b) return 0;
    const sm = (a: number, c: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - a) / (c - a)));
      return t * t * (3 - 2 * t);
    };
    return sm(b.from - 4, b.from + 36, s) * (1 - sm(b.to - 36, b.to + 4, s));
  }
  /** 谷の深さ[m] */
  private static VALLEY_DEPTH = 40;
  /** つり橋のあたりか(道ばたの置き物は、橋の高さでなく谷の地面に置く) */
  private nearBridge(s: number): boolean {
    const b = this.course.bridge;
    return !!b && s > b.from - 4 && s < b.to + 4;
  }

  /** 地面(芝)の高さ。坂の高さに、山道では、道から離れるほど上がる斜面(土手)を足す。 */
  private terrainAt(X: number, Z: number, sHint: number): { h: number; d: number } {
    if (!this.hilly) return { h: 0, d: 0 };
    // 道の中心線のうち、いちばん近い所を探す(s=-Z の点までの距離より遠くは探さない)
    if (!this.clX) {
      this.clX = new Float64Array(this.end + 1200);
      for (let i = 0; i < this.clX.length; i++) this.clX[i] = roadX(this.course, i - 200);
    }
    const cl = this.clX;
    const cx = (s: number) => cl[Math.max(0, Math.min(cl.length - 1, s + 200))];
    const s0 = Math.round(sHint);
    const dx0 = X - cx(s0);
    let best = dx0 * dx0 + (Z + s0) ** 2;
    let bs = s0;
    const W = Math.min(90, Math.ceil(Math.sqrt(best)) + 1);
    for (let s = s0 - W; s <= s0 + W; s++) {
      const dx = X - cx(s);
      const dz = Z + s;
      const d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bs = s; }
    }
    const d = Math.sqrt(best);
    const v = this.valley(bs);
    // 山道は両わきが土手。つり橋の下は、深い谷(橋から離れると、少しずつ上がる)
    const bank = this.theme.setting === 'mountain' ? Math.min(26, Math.max(0, d - 9) ** 1.25 * 0.22) * (1 - v) : 0;
    const drop = v * (KasugaView.VALLEY_DEPTH - Math.min(30, Math.max(0, d - 40) * 0.25));
    return { h: hillY(this.course, bs) + bank - drop, d };
  }

  /** 道に沿った、置き物の位置と向き(rotY は、道の向きに足す)。高さは地面に合わせる。 */
  private rp(s: number, x: number, o: { y?: number; rotY?: number; scale?: number } = {}): Placement {
    const w = this.roadW(s, x);
    const g = !this.hilly ? 0 : Math.abs(x) < 9 && !this.nearBridge(s) ? hillY(this.course, s) : this.terrainAt(w.x, w.z, s).h;
    return { x: w.x, z: w.z, y: (o.y ?? 0) + g, rotY: -w.psi + (o.rotY ?? 0), scale: o.scale };
  }

  /** 絵の色あい(夜は暗く、雨は少しくすませ、夕方は暖かく)。景色になじませる */
  private themeTint(): THREE.Color {
    const th = this.theme;
    if (th.night) return new THREE.Color(0x7a80a0);
    if (th.weather === 'rain') return new THREE.Color(0xd2d7dd);
    return new THREE.Color(0xffffff).lerp(new THREE.Color(th.sun), 0.25);
  }

  /**
   * 名所・アイテムの絵の板(public/assets/runner/landmarks/<name>.webp)。下の辺のまんなかが原点。
   * height=高さ[m]。横幅は絵の縦横比から決める
   */
  private board(name: string, height: number, o: { fog?: boolean; tint?: THREE.Color; cast?: boolean } = {}): THREE.Mesh {
    const aspect = LANDMARK_ASPECT[name] ?? 1;
    const tex = loadTex(`${ASSET}/runner/landmarks/${name}.webp`);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(height * aspect, height).translate(0, height / 2, 0),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, toneMapped: false, fog: o.fog ?? true, side: THREE.DoubleSide }),
    );
    (m.material as THREE.MeshBasicMaterial).color.copy(o.tint ?? this.themeTint());
    return m;
  }

  /** 木の絵を、十字に組んだ2枚の板で、たくさん置く(どの向きからも木に見える)。 */
  private imageTrees(name: string, places: Placement[], height = 9): void {
    if (!places.length) return;
    const aspect = LANDMARK_ASPECT[name] ?? 0.8;
    const geo = new THREE.PlaneGeometry(height * aspect, height).translate(0, height / 2, 0);
    const mat = new THREE.MeshBasicMaterial({ map: loadTex(`${ASSET}/runner/landmarks/${name}.webp`), alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide });
    mat.color.copy(this.themeTint());
    // 影は四角くなるので落とさない
    addInstanced(this.scene, [{ geo, mat, rotY: Math.PI / 4 }, { geo, mat, rotY: -Math.PI / 4 }], places, false);
  }

  /** 遠景(生駒山・大阪の街): カメラの前方、遠くに置く絵。s が範囲の中のときだけ、ふわっと見える */
  private backdrops: { mesh: THREE.Mesh; from: number; to: number }[] = [];
  private addBackdrop(name: string, width: number, from: number, to: number): void {
    const aspect = LANDMARK_ASPECT[name] ?? 3;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / aspect).translate(0, width / aspect / 2, 0),
      new THREE.MeshBasicMaterial({ map: loadTex(`${ASSET}/runner/landmarks/${name}.webp`), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    // 遠くのかすみ: 少し明るく、空の色に寄せる
    (m.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(this.theme.fog), 0.25));
    m.renderOrder = -1;
    m.frustumCulled = false;
    m.visible = false;
    this.scene.add(m);
    this.backdrops.push({ mesh: m, from, to });
  }

  /** 坂の高さ(ジャンプ台を除く。置き物や門を立てる高さ)。 */
  private gy(s: number): number {
    return hillY(this.course, s);
  }

  /** 道の面(中心線に沿って曲がる帯)。坂・ジャンプ台の高さに沿う。yOff=道からの浮かせ */
  private roadRibbon(a: number, b: number, width: number, mat: THREE.Material, yOff = 0, vScale = 4, xOff = 0): THREE.Mesh {
    const base = this.hilly ? 1 : 2;
    const bumps = this.course.bumps ?? [];
    const nearRamp = (s: number) => bumps.some((bp) => s > bp.s - bp.len - 0.6 && s < bp.s + RAMP_DROP + 0.6);
    const ss: number[] = [];
    for (let s = a; s < b; s += nearRamp(s) ? 0.4 : base) ss.push(s);
    ss.push(b);
    const n = ss.length - 1;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const s = ss[i];
      const l = this.roadW(s, xOff - width / 2);
      const r = this.roadW(s, xOff + width / 2);
      pos.push(l.x, l.y + yOff, l.z, r.x, r.y + yOff, r.z);
      uv.push(0, s / vScale, width / 4, s / vScale);
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
    // つり橋の区間は、道でなく、せまい板の橋にする
    const br = this.course.bridge;
    const deckSpans: [number, number][] = [];
    const roadSpans: [number, number][] = [];
    for (const [a, b] of spans) {
      if (!br || b <= br.from || a >= br.to) { roadSpans.push([a, b]); continue; }
      if (a < br.from) roadSpans.push([a, br.from]);
      deckSpans.push([Math.max(a, br.from), Math.min(b, br.to)]);
      if (b > br.to) roadSpans.push([br.to, b]);
    }
    for (const [a, b] of roadSpans) {
      this.scene.add(this.roadRibbon(a, b, w, matRoad));
      // 縁石(2mごとの短い石)
      if (th.setting !== 'mountain') for (let q = Math.ceil(a / 2) * 2; q + 2 <= b + 0.01; q += 2) for (const sx of [-1, 1]) curbs.push(this.rp(q + 1, sx * (ROAD_HALF + 0.2)));
      if (th.setting === 'town') for (let q = Math.ceil(a / 6) * 6; q < b - 2.5; q += 6) dash.push(this.rp(q + 1.2, 0, { y: 0.015 }));
    }
    if (br) this.buildBridge(deckSpans);
    if (th.setting === 'river') this.buildCanal();
    addInstanced(this.scene, [{ geo: new THREE.BoxGeometry(0.4, 0.22, 2.08), mat: matCurb, pos: [0, 0.11, 0] }], curbs);
    if (dash.length) {
      addInstanced(this.scene, [{ geo: new THREE.BoxGeometry(0.22, 0.02, 2.6), mat: new THREE.MeshStandardMaterial({ color: 0xf4efe0, roughness: 0.7 }) }], dash, false);
    }
    // 地面の芝(曲がる道でも足りるよう、広い1枚。ゴールが海なら、岸まで)
    const grassEnd = th.goal === 'bay' ? pierEnd : this.end + 330;
    const L = grassEnd + 40;
    if (this.hilly) {
      // ゴールが海なら、地面は岸(pierEnd)まで。その先は海
      this.scene.add(this.buildTerrain(matGrass, th.goal === 'bay' ? pierEnd - 120 : L));
    } else {
      const gw = 1400;
      // 大きな三角形2枚だと、奥行きの計算の誤差で、道が芝に隠れる所が出る。細かく分けておく
      const gg = new THREE.PlaneGeometry(gw, L + 600, 40, Math.ceil((L + 600) / 20));
      const uv = gg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (gw / 6), uv.getY(i) * ((L + 600) / 6));
      const ground = new THREE.Mesh(gg, matGrass);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.05, -(L / 2 - 40));
      ground.receiveShadow = true;
      this.scene.add(ground);
    }
    // 穴: 地面の上に、まっ黒な面をのせる(地面が1枚の大きな面なので、箱の穴だと、うまってしまう)
    const pitMat = new THREE.MeshBasicMaterial({ color: 0x07050a });
    const tapeA = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.6, emissive: 0x4a3200 });
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0xff6a2a, roughness: 0.5, emissive: 0x401400 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    for (const h of holes) {
      if (br && h.s > br.from && h.s < br.to) continue; // 橋の板のぬけた所は、谷が見えるだけ
      this.scene.add(this.roadRibbon(h.s, h.s + h.len, w + 0.8, pitMat, 0.03));
      // 穴のふちに、黄色い帯(手前と奥)
      for (const edge of [h.s, h.s + h.len]) {
        const ew = this.roadW(edge, 0);
        const tape = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.08, 0.35), tapeA);
        tape.position.set(ew.x, ew.y + 0.06, ew.z);
        tape.rotation.y = -ew.psi;
        this.scene.add(tape);
      }
      for (const sx of [-1, 1]) {
        for (const zz of [h.s - 1.4, h.s + h.len + 1.4]) {
          const cw = this.roadW(zz, sx * (ROAD_HALF - 0.5));
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.9, 14), pylonMat);
          cone.position.set(cw.x, cw.y + 0.45, cw.z);
          cone.castShadow = true;
          const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.14, 14), stripe);
          band.position.set(cw.x, cw.y + 0.5, cw.z);
          this.scene.add(cone, band);
        }
      }
    }
    this.buildRamps(w);
  }

  /** 坂のある面の地面: 道の高さに合わせた、高さのある1枚(道の近くは細かく、遠くは粗く)。 */
  private buildTerrain(mat: THREE.Material, L: number): THREE.Group {
    // 軽くする(スマホ向け): 道の近く(±20m)は2mおき、その外は4mおき。前後は2mおき
    const cols: number[] = [];
    for (const x of [-340, -260, -200, -160, -130, -105, -88]) cols.push(x);
    for (let x = -76; x < -20; x += 4) cols.push(x);
    for (let x = -20; x <= 20; x += 2) cols.push(x);
    for (let x = 24; x <= 76; x += 4) cols.push(x);
    for (const x of [88, 105, 130, 160, 200, 260, 340]) cols.push(x);
    const z0 = 80;
    const z1 = -(L + 120);
    const dz = 2;
    const rows = Math.ceil((z0 - z1) / dz) + 1;
    const nc = cols.length;
    const pos = new Float32Array(rows * nc * 3);
    const uv = new Float32Array(rows * nc * 2);
    for (let j = 0; j < rows; j++) {
      const Z = z0 - j * dz;
      for (let i = 0; i < nc; i++) {
        const X = cols[i];
        const { h, d } = this.terrainAt(X, Z, -Z);
        // 道の下は少し低くして、芝が道からはみ出さないようにする
        const off = d < ROAD_HALF + 0.6 ? -0.14 : -0.04;
        const k = (j * nc + i) * 3;
        pos[k] = X;
        pos[k + 1] = h + off;
        pos[k + 2] = Z;
        uv[(j * nc + i) * 2] = X / 6;
        uv[(j * nc + i) * 2 + 1] = Z / 6;
      }
    }
    const quads = (j0: number, j1: number): number[] => {
      const idx: number[] = [];
      for (let j = j0; j < j1; j++) {
        for (let i = 0; i < nc - 1; i++) {
          const a = j * nc + i;
          const b = a + 1;
          const c = a + nc;
          const e = c + 1;
          idx.push(a, c, b, b, c, e);
        }
      }
      return idx;
    };
    // 法線は全体で計算する(区切りの所で、光の当たり方が変わらないように)
    const full = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(pos, 3);
    const uvAttr = new THREE.BufferAttribute(uv, 2);
    full.setAttribute('position', posAttr);
    full.setAttribute('uv', uvAttr);
    full.setIndex(quads(0, rows - 1));
    full.computeVertexNormals();
    const normal = full.getAttribute('normal');
    full.setIndex(null); // 全体の三角形の一覧は、法線の計算にだけ使う
    // 200mずつに区切る。見えない区切り(後ろ・遠く)は描かない(カメラの見える範囲は420m)
    const group = new THREE.Group();
    const per = Math.round(200 / dz);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let k = 1; k < pos.length; k += 3) {
      minY = Math.min(minY, pos[k]);
      maxY = Math.max(maxY, pos[k]);
    }
    for (let j0 = 0; j0 < rows - 1; j0 += per) {
      const j1 = Math.min(rows - 1, j0 + per);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', posAttr);
      g.setAttribute('uv', uvAttr);
      g.setAttribute('normal', normal);
      g.setIndex(quads(j0, j1));
      // 位置の配列は全体で共有しているので、区切りごとの大きさは手で決める
      const za = z0 - j0 * dz;
      const zb = z0 - j1 * dz;
      g.boundingBox = new THREE.Box3(new THREE.Vector3(cols[0], minY, zb), new THREE.Vector3(cols[nc - 1], maxY, za));
      g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }

  /** つり橋: 板の床・手すりのロープ・2本の太いケーブルと吊り糸・両端の塔・谷底の川。 */
  private buildBridge(deckSpans: [number, number][]): void {
    const br = this.course.bridge!;
    const planks = canvasTexture(128, (g, n) => {
      const rnd = rngFor(41);
      for (let i = 0; i < 8; i++) {
        const c = 150 + Math.floor(rnd() * 40);
        g.fillStyle = `rgb(${c},${Math.floor(c * 0.72)},${Math.floor(c * 0.48)})`;
        g.fillRect(0, (i * n) / 8, n, n / 8 - 3);
        g.fillStyle = 'rgba(40,24,10,0.9)';
        g.fillRect(0, ((i + 1) * n) / 8 - 3, n, 3);
      }
    }, true);
    this.disposables.push(planks);
    const deckMat = new THREE.MeshStandardMaterial({ map: planks, roughness: 0.85 });
    const dw = BRIDGE_HALF * 2 + 0.4;
    for (const [a, b] of deckSpans) {
      const top = this.roadRibbon(a, b, dw, deckMat, 0, 4);
      top.castShadow = true;
      this.scene.add(top);
    }
    // 手すりのロープと柱
    const ropeM = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.6, metalness: 0.4 });
    const posts: Placement[] = [];
    const len = br.to - br.from;
    const towerH = 14;
    const cableAt = (s: number) => {
      const u = (s - br.from) / len;
      return towerH - (towerH - 1.4) * 4 * u * (1 - u); // 塔の上から、まんなかで低くたれる
    };
    for (const sx of [-1, 1]) {
      const hand: THREE.Vector3[] = [];
      const cable: THREE.Vector3[] = [];
      for (let s = br.from; s <= br.to + 0.01; s += 3) {
        const p = this.roadW(s, sx * (BRIDGE_HALF + 0.2));
        const y = this.gy(s);
        hand.push(new THREE.Vector3(p.x, y + 1.05, p.z));
        cable.push(new THREE.Vector3(p.x, y + cableAt(s), p.z));
        posts.push({ x: p.x, y, z: p.z });
      }
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hand), hand.length * 2, 0.05, 6), ropeM));
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cable), cable.length * 2, 0.1, 6), steel));
      // 吊り糸(ケーブルから手すりへ)
      const pts: number[] = [];
      for (let i = 0; i < hand.length; i++) pts.push(hand[i].x, hand[i].y, hand[i].z, cable[i].x, cable[i].y, cable[i].z);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5a4a3a })));
    }
    addInstanced(this.scene, [{ geo: new THREE.CylinderGeometry(0.05, 0.05, 1.05, 6), mat: ropeM, pos: [0, 0.52, 0] }], posts, false);
    // 両端の塔(鉄の門形)
    for (const s of [br.from, br.to]) {
      const w = this.roadW(s, 0);
      const t = new THREE.Group();
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, towerH + 0.6, 0.5), steel);
        leg.position.set(sx * (BRIDGE_HALF + 0.45), (towerH + 0.6) / 2, 0);
        leg.castShadow = true;
        t.add(leg);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(BRIDGE_HALF * 2 + 1.6, 0.5, 0.5), steel);
      beam.position.y = towerH + 0.4;
      t.add(beam);
      t.position.set(w.x, this.gy(s), w.z);
      t.rotation.y = -w.psi;
      this.scene.add(t);
    }
    // 谷底の川(エメラルド色)
    const mid = (br.from + br.to) / 2;
    const mw = this.roadW(mid, 0);
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(900, len * 0.45).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2f9a8a, roughness: 0.12, metalness: 0.1 }),
    );
    river.position.set(mw.x, this.gy(mid) - KasugaView.VALLEY_DEPTH + 0.8, mw.z);
    river.rotation.y = -mw.psi;
    this.scene.add(river);
  }

  /** 川ぞいの道: 道の左に、石の縁の水路(金魚が跳ぶ)。 */
  private buildCanal(): void {
    const water = new THREE.MeshStandardMaterial({ color: 0x4f9ec4, roughness: 0.08, metalness: 0.1 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xb0aa9c, roughness: 0.9 });
    const x = -(ROAD_HALF + 2.6);
    const end = this.course.length + 60;
    this.scene.add(this.roadRibbon(-20, end, 3.0, water, 0.02, 4, x));
    const edges: Placement[] = [];
    for (let s = -20; s < end; s += 2) for (const ex of [x - 1.65, x + 1.65]) edges.push(this.rp(s + 1, ex));
    addInstanced(this.scene, [{ geo: new THREE.BoxGeometry(0.35, 0.3, 2.08), mat: stone, pos: [0, 0.1, 0] }], edges, false);
  }

  /** ジャンプ台: 台の面に矢印、両わきに黄色と黒のしま模様の板。 */
  private buildRamps(w: number): void {
    const bumps = this.course.bumps;
    if (!bumps?.length) return;
    const arrows = canvasTexture(128, (g, n) => {
      g.clearRect(0, 0, n, n);
      g.fillStyle = 'rgba(255,120,30,0.95)';
      // 前向きの「へ」の字の矢印を2つ(絵の上が、進む向き)
      const v: [number, number][] = [[0.1, 0.3], [0.5, 0], [0.9, 0.3], [0.9, 0.44], [0.5, 0.14], [0.1, 0.44]];
      for (const y0 of [0.03, 0.52]) {
        g.beginPath();
        v.forEach(([px, py], i) => (i ? g.lineTo(px * n, (y0 + py) * n) : g.moveTo(px * n, (y0 + py) * n)));
        g.closePath();
        g.fill();
      }
    }, true);
    arrows.wrapS = THREE.ClampToEdgeWrapping;
    const stripes = canvasTexture(64, (g, n) => {
      for (let i = -2; i < 6; i++) {
        g.fillStyle = i % 2 ? '#1d1d22' : '#ffc21a';
        g.beginPath();
        g.moveTo(i * 16, 0);
        g.lineTo(i * 16 + 16, 0);
        g.lineTo(i * 16 + 16 + n, n);
        g.lineTo(i * 16 + n, n);
        g.closePath();
        g.fill();
      }
    }, true);
    this.disposables.push(arrows, stripes);
    const deck = new THREE.MeshStandardMaterial({ color: 0xd9dde4, roughness: 0.55, metalness: 0.1 });
    const arrowMat = new THREE.MeshBasicMaterial({ map: arrows, transparent: true, depthWrite: false, toneMapped: false });
    this.rampArrows = arrows; // 矢印は、前へ流れるように動かす(ダッシュ台らしく)
    const sideMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6, side: THREE.DoubleSide });
    for (const b of bumps) {
      const a = b.s - b.len;
      const e = b.s + RAMP_DROP;
      this.scene.add(this.roadRibbon(a, b.s + 0.05, w, deck, 0.02));
      this.scene.add(this.roadRibbon(a + 1.5, b.s - 0.3, 4, arrowMat, 0.05, 2.2)); // 幅4m=絵の横幅ちょうど
      // 両わきの板(地面から台の面まで)
      for (const sx of [-1, 1]) {
        const pos: number[] = [];
        const uv: number[] = [];
        const idx: number[] = [];
        let n = 0;
        for (let s = a; s <= e + 0.001; s += 0.4) {
          const p = this.roadW(s, sx * (w / 2 + 0.02));
          const top = p.y + 0.05;
          const bot = this.gy(s) - 0.15;
          pos.push(p.x, bot, p.z, p.x, top, p.z);
          uv.push(s / 1.6, 0, s / 1.6, (top - bot) / 1.6);
          if (n > 0) {
            const k = (n - 1) * 2;
            idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
          }
          n++;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, sideMat);
        m.castShadow = true;
        this.scene.add(m);
      }
    }
  }

  // ---- 参道: 灯籠と杉並木(from〜to の間) ----
  private buildSandoScenery(from = -20, to = this.end + 60): void {
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
    for (let s = 10; s < Math.min(to, this.end - 8); s += 13) {
      for (const sx of [-1, 1]) lp.push(this.rp(s, sx * (ROAD_HALF + 1.5), { rotY: Math.PI / 4, scale: 1.3 }));
    }
    if (th.setting === 'sando') {
      addInstanced(this.scene, lanternParts, lp);
      if (th.halo > 0) this.addHalos(lp.map((p) => new THREE.Vector3(p.x, (p.y ?? 0) + 2.0, p.z)), 0xffb450, 3.6 * th.halo + 1.2, Math.min(1, th.halo));
    }

    // 杉(根もと・3段の葉)。紅葉・桜の面は、丸い木
    const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
    const leafA = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0x4d7a64 : 0x2f6a3a, roughness: 0.9 });
    const leafB = new THREE.MeshStandardMaterial({ color: th.snowCaps ? 0x6a9a82 : 0x3d7d43, roughness: 0.9 });
    const round = th.foliage === 'maple' || th.foliage === 'sakura'; // 紅葉・桜は、木の絵
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
    for (let s = from; s < to; s += 4.6) {
      for (const sx of [-1, 1]) {
        if (rnd() < 0.18) continue;
        const near = 8 + rnd() * 6;
        tp.push(this.rp(s + rnd() * 3, sx * near, { scale: 0.8 + rnd() * 0.7, rotY: rnd() * 6 }));
        if (rnd() < 0.5) tp.push(this.rp(s + rnd() * 4, sx * (near + 9 + rnd() * 14), { scale: 1 + rnd() * 0.9, rotY: rnd() * 6 }));
      }
    }
    if (round) {
      this.imageTrees(th.foliage === 'maple' ? 'maple-tree' : 'sakura-tree', tp, 8.5);
    } else {
      addInstanced(this.scene, treeParts, tp);
    }

    const bushColor = th.snowCaps ? 0xe9f1f7 : th.foliage === 'maple' ? 0xc8662e : 0x4f9446;
    const bushMat = new THREE.MeshStandardMaterial({ color: bushColor, roughness: 1 });
    const bp: Placement[] = [];
    for (let s = Math.max(0, from); s < Math.min(to, this.end); s += 7) {
      for (const sx of [-1, 1]) {
        const canal = th.setting === 'river' && sx < 0 ? 3.5 : 0; // 水路のある側は、水路の外へ
        if (rnd() < 0.7) bp.push(this.rp(s + rnd() * 6, sx * (ROAD_HALF + 3 + canal + rnd() * 3), { scale: 0.6 + rnd() * 0.6 }));
      }
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
  /** 区間ごとに景色を変える(長い面: 奈良の街→生駒山→大阪の大都会)。 */
  private buildScenes(scenes: NonNullable<RunnerLevel['scenes']>): void {
    const L = this.course.length;
    scenes.forEach((sc, i) => {
      const a = i === 0 ? -20 : sc.at * L;
      // 最後の区間が街なら、街灯・並木はゴールの少し先まで(海の上には置かない)
      const last = sc.setting === 'town' || sc.setting === 'city' ? L + 40 : this.end + 60;
      const b = i + 1 < scenes.length ? scenes[i + 1].at * L : last;
      if (sc.setting === 'town') this.buildTownScenery(Math.max(0, a), b);
      else if (sc.setting === 'city') this.buildTownScenery(a, b, true);
      else this.buildSandoScenery(a, b);
    });
    // 生駒山の頂上: 赤白の電波塔と看板
    const ikoma = scenes.find((sc) => sc.name === '生駒山');
    if (ikoma) {
      const sTop = this.level.checkpoints?.[0] ? this.level.checkpoints[0].at * L : ikoma.at * L + 300;
      const red = new THREE.MeshStandardMaterial({ color: 0xd8382a, roughness: 0.6 });
      const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
      for (const [side, off, h] of [[1, 26, 46], [-1, 34, 38], [1, 52, 30]] as const) {
        const w = this.roadW(sTop + off * 0.4, side * off);
        const t = new THREE.Group();
        const n = 8;
        for (let k = 0; k < n; k++) {
          const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.9 - k * 0.07, 1.0 - k * 0.07, h / n, 10), k % 2 ? white : red);
          seg.position.y = h / n / 2 + (k * h) / n;
          t.add(seg);
        }
        const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.6, 14), white);
        deck.position.y = h * 0.7;
        t.add(deck);
        t.position.set(w.x, this.terrainAt(w.x, w.z, sTop).h, w.z);
        this.scene.add(t);
      }
      this.scene.add(this.signboard('生駒山', sTop - 6, -1));
    }
    // 大阪: 鉄の展望塔(道ばた)
    const city = scenes.find((sc) => sc.setting === 'city');
    if (city) {
      const s1 = city.at * L + (L - city.at * L) * 0.35;
      const w = this.roadW(s1, 30);
      const tower = this.latticeTower();
      tower.position.set(w.x, this.gy(s1), w.z);
      this.scene.add(tower);
    }
    // 遠景の絵: 奈良の街からは生駒山、生駒山を下りはじめると大阪の街並み(通天閣・大阪城)
    if (ikoma) this.addBackdrop('ikoma', 380, 0, ikoma.at * L + 40);
    const sTop = this.level.checkpoints?.[0]?.at;
    if (city && sTop !== undefined) this.addBackdrop('osaka-skyline', 400, sTop * L - 10, city.at * L + 60);
    // チェックポイントの門(青いアーチ)
    for (const cp of this.level.checkpoints ?? []) this.scene.add(this.checkpointGate(cp.at * L, cp.name));
  }

  /** 通天閣のような、鉄骨の展望塔。 */
  private latticeTower(): THREE.Group {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.45, metalness: 0.6 });
    const neon = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffb040, emissiveIntensity: 1.6 });
    // 4本の脚(すそ広がり)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 30, 6), steel);
      leg.position.set(sx * 4, 15, sz * 4);
      leg.rotation.set(sz * 0.18, 0, -sx * 0.18);
      g.add(leg);
    }
    for (let k = 0; k < 6; k++) {
      const ring = new THREE.Mesh(new THREE.BoxGeometry(10 - k * 1.3, 0.3, 10 - k * 1.3), steel);
      ring.position.y = 3 + k * 5;
      g.add(ring);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 5, 7), steel);
    deck.position.y = 32;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.2, 7.2), neon);
    sign.position.y = 27;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.8, 12, 8), steel);
    spire.position.y = 40.5;
    g.add(deck, sign, spire);
    for (const m of g.children) m.castShadow = true;
    return g;
  }

  /** チェックポイントの門(青と白のアーチに名前)。 */
  private checkpointGate(s: number, name: string): THREE.Group {
    const g = new THREE.Group();
    const post = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.5 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x2f9be0, roughness: 0.4, emissive: 0x0a3a60, emissiveIntensity: 0.5 });
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8), post);
      p.position.set(sx * (ROAD_HALF + 0.8), 3.5, 0);
      p.castShadow = true;
      g.add(p);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 3, 1.8, 0.7), blue);
    top.position.y = 7.4;
    g.add(top);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2 + 2.6, 1.5),
      new THREE.MeshBasicMaterial({ map: this.bannerTexture(name, ' CHECK'), transparent: true, toneMapped: false }),
    );
    banner.position.set(0, 7.4, 0.37);
    g.add(banner);
    const w = this.roadW(s, 0);
    g.position.set(w.x, this.gy(s), w.z);
    g.rotation.y = -w.psi;
    return g;
  }

  private buildTownScenery(from = 0, to = this.course.length + 40, city = false): void {
    const th = this.theme;
    const rnd = rngFor(321 + Math.floor(from));
    const openEnd = th.goal === 'bay' || th.goal === 'heijo'; // ゴールの景色が見えるよう、ゴール近くは建物を減らす
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
    for (let s = 8 + Math.ceil(from / 22) * 22; s < to; s += 22) {
      lp.push(this.rp(s, -(ROAD_HALF + 1.2)));
      lp.push(this.rp(s + 11, ROAD_HALF + 1.2, { rotY: Math.PI }));
      // 灯りの位置は、街灯の腕の先(道の内側へ1.35m)
      const h1 = this.roadW(s, -(ROAD_HALF + 1.2) + 1.35);
      const h2 = this.roadW(s + 11, ROAD_HALF + 1.2 - 1.35);
      halos.push(new THREE.Vector3(h1.x, this.gy(s) + 6.25, h1.z), new THREE.Vector3(h2.x, this.gy(s + 11) + 6.25, h2.z));
    }
    addInstanced(this.scene, lampParts, lp);
    if (th.halo > 0) this.addHalos(halos, 0xffc070, 4.2, Math.min(1, th.halo));

    // 並木(丸い木)
    const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x55803a, roughness: 0.95, flatShading: true });
    const tp: Placement[] = [];
    for (let s = from; s < to; s += 9) {
      for (const sx of [-1, 1]) if (rnd() < (city ? 0.45 : 0.75)) tp.push(this.rp(s + rnd() * 4, sx * (ROAD_HALF + 2.6 + rnd() * 1.4), { scale: 0.7 + rnd() * 0.5 }));
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
    // 大都会(city)は、ガラスの高いビルを、道の近くにぎっしり
    const types: { w: number; h: number; d: number; wall: string; lit: string }[] = city ? [
      { w: 14, h: 52, d: 14, wall: '#8fa6bf', lit: '#ffe6a8' },
      { w: 16, h: 78, d: 15, wall: '#6f879f', lit: '#fff0c0' },
      { w: 12, h: 38, d: 12, wall: '#b9a99a', lit: '#ffd88a' },
      { w: 18, h: 96, d: 16, wall: '#5d7590', lit: '#ffe8b0' },
    ] : [
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
      for (let s = 30 + from; s < to; s += city ? 9 : 11) {
        for (const sx of [-1, 1]) {
          if (rnd() * 4 > 1 + (k === 0 ? 1.6 : 0.5) + (city ? 0.6 : 0)) continue;
          const nearEnd = s > this.course.length - (city ? 240 : 80); // 高いビルは、遠くから海をかくすので、手前から減らす
          if (openEnd && nearEnd && rnd() < 0.85) continue; // 海・門が見えるよう、ゴール近くは開ける
          const x = sx * (ROAD_HALF + (city ? 7 : 8) + t.w / 2 + rnd() * (city ? 30 : 22));
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
    g.position.set(tw.x, this.gy(z), tw.z);
    g.rotation.y = -tw.psi;
    g.scale.setScalar(scale);
    g.userData.placed = true;
    return g;
  }

  private buildTorii(): void {
    const L = this.course.length;
    for (const f of [0.09, 0.23, 0.38, 0.52, 0.65, 0.76, 0.85, 0.92]) this.scene.add(this.torii(Math.round(L * f)));
    if (this.theme.goal !== 'omiwa') this.scene.add(this.torii(L, 1.35)); // ゴールの大鳥居(大神神社は絵の鳥居)
  }

  // ---- 春日大社 ----
  private buildShrine(): void {
    const th = this.theme;
    const g = new THREE.Group();
    // 中門と回廊(絵)。参道の正面、ゴールの奥に立てる
    const H = 26;
    const pic = this.board('kasuga', H);
    pic.position.set(0, 0, -8);
    g.add(pic);
    // 奥の山と杉(絵のうしろを、深い森に見せる)
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
    g.position.set(0, 0, -this.end);
    this.scene.add(g);
    if (th.halo > 0) {
      // 石灯籠の光(絵の中の4基の位置)
      const W = H * (LANDMARK_ASPECT['kasuga'] ?? 2);
      const pts = [0.14, 0.31, 0.69, 0.86].map((u) => new THREE.Vector3((u - 0.5) * W, H * 0.23, -8 - this.end + 0.2));
      this.addHalos(pts, 0xffb450, 5.5 * th.halo + 1.5, Math.min(1, th.halo));
    }
  }

  // ---- 大阪湾: 海・観覧車・夕日・ゴールゲート ----
  private buildBay(): void {
    const L = this.course.length;
    const pier = L + 60;
    // 遠景(絵): 観覧車・夕日・船・大橋。絵の中の海の線(下から約30%)を、手前の海につなぐ
    const far = pier + 200; // カメラの見える距離(420m)の内側
    const BW = 380; // 観覧車(絵の左16%)と夕日(56%)が、たて画面に両方入る大きさ
    const BH = BW / (LANDMARK_ASPECT['osaka-bay'] ?? 3);
    const bay = new THREE.Mesh(
      new THREE.PlaneGeometry(BW, BH).translate(0, BH / 2, 0),
      new THREE.MeshBasicMaterial({ map: loadTex(`${ASSET}/runner/landmarks/osaka-bay.webp`), alphaMap: this.topFade(), transparent: true, toneMapped: false, fog: false, depthWrite: false }),
    );
    const cx = (0.5 - 0.36) * BW; // 絵の36%の所を正面に
    bay.position.set(cx, -1.1 - BH * 0.3, -far);
    bay.renderOrder = -1;
    bay.frustumCulled = false;
    this.scene.add(bay);
    // 手前の海(絵の海の色に合わせる)
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, far - pier),
      new THREE.MeshStandardMaterial({ color: 0x4a5a8e, roughness: 0.16, metalness: 0.15 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -1.1, -(pier + (far - pier) / 2));
    this.scene.add(sea);
    // 岸のへり
    const quay = new THREE.Mesh(new THREE.BoxGeometry(200, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.9 }));
    quay.position.set(0, -0.5, -(pier + 0.5));
    quay.receiveShadow = true;
    this.scene.add(quay);
    // 夕日のきらめく道(絵の夕日の下へ)
    const glint = new THREE.Mesh(
      new THREE.PlaneGeometry(40, far - pier),
      new THREE.MeshBasicMaterial({ map: this.glintTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(cx + BW * (0.56 - 0.5), -1.0, -(pier + (far - pier) / 2));
    this.scene.add(glint);
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
  /** 金堂のような、屋根の大きな堂。 */
  private hall(w: number, d: number, h: number, stories = 1, colors: { body?: number; pillar?: number; roof?: number } = {}): THREE.Group {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: colors.body ?? (this.theme.snowCaps ? 0xf4f7fa : 0xf1e8d6), roughness: 0.85 });
    const red = new THREE.MeshStandardMaterial({ color: colors.pillar ?? RED, roughness: 0.5, emissive: 0x200600 });
    const roof = new THREE.MeshStandardMaterial({ color: colors.roof ?? (this.theme.snowCaps ? 0xe3eaf1 : 0x57493c), roughness: 0.95 });
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
  private bigGate(color = 0x8a3a22): THREE.Group {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive: 0x1a0600 });
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
    g.position.set(w.x, this.gy(s), w.z);
    g.rotation.y = -w.psi + (side > 0 ? -0.35 : 0.35); // 道のほうへ、少し向ける
    return g;
  }

  private buildLandmark(lm: Landmark): void {
    const s = lm.at * this.course.length;
    // 名所の絵(薬師寺の塔・興福寺の五重塔・唐招提寺の金堂)。道から少し離して、道のほうへ少し向ける
    const [name, h, off]: [string, number, number] =
      lm.kind === 'pagoda' ? ['yakushiji-pagoda', 26, 10] : lm.kind === 'pagoda5' ? ['kofukuji-pagoda', 30, 11] : ['toshodaiji-hall', 14, 19];
    const w = this.roadW(s, lm.side * (ROAD_HALF + off));
    const b = this.board(name, h);
    b.position.set(w.x, this.terrainAt(w.x, w.z, s).h - 0.3, w.z);
    b.rotation.y = -w.psi - lm.side * 0.25;
    this.scene.add(b);
    this.scene.add(this.signboard(lm.name, s - 4, lm.side));
  }

  // ---- 東大寺: 南大門・大仏殿・大仏 ----
  private buildTodaiji(): void {
    const L = this.course.length;
    const end = L + GOAL_GAP;
    // 南大門(道のとちゅうに、大きな門。まんなかの通り道は、絵でも透明)
    const gate = this.board('nandaimon', 30);
    const gw = this.roadW(L * 0.42, 0);
    gate.position.set(gw.x, this.gy(L * 0.42), gw.z);
    gate.rotation.y = -gw.psi;
    gate.userData.placed = true; // 高さは合わせ済み(ゴールの高さに、さらに上げない)
    this.scene.add(gate);

    // 大仏殿(絵)。夜の霧に隠れないよう霧なしで、暗く。大仏の目が光ると明るくなる
    const hall = new THREE.Group();
    const hb = this.board('todaiji-hall', 46, { fog: false, tint: new THREE.Color(0x3a3a50) });
    hb.position.set(0, 0, -16);
    hall.add(hb);
    // 大仏(目が閉じた絵と、光る絵を、切りかえる)。大仏殿の前に座る
    const open = loadTex(`${ASSET}/runner/daibutsu_0.png`);
    const wake = loadTex(`${ASSET}/runner/daibutsu_1.png`);
    const dh = 20;
    const dz = -6;
    const dm = new THREE.Mesh(
      new THREE.PlaneGeometry(dh * (640 / 590), dh).translate(0, dh / 2, 0),
      new THREE.MeshBasicMaterial({ map: open, transparent: true, alphaTest: 0.4, toneMapped: false, fog: false, color: 0x666666 }),
    );
    dm.position.set(0, 0, dz);
    hall.add(dm);
    const glow = new THREE.PointLight(0xffa830, 0, 60, 1.4);
    glow.position.set(0, dh * 0.72, dz + 6);
    hall.add(glow);
    // 光る目(霧にかくれず、暗闇の遠くから見える)
    const eyeY = dh * 0.775;
    const eyeGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.55, eyeY, -end + dz + 0.4), new THREE.Vector3(1.55, eyeY, -end + dz + 0.4)]);
    const eyeTex = glowTexture();
    this.disposables.push(eyeTex);
    const eyes = new THREE.Points(eyeGeo, new THREE.PointsMaterial({ map: eyeTex, color: 0xffb040, size: 46, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false, fog: false }));
    eyes.frustumCulled = false;
    this.scene.add(eyes);
    this.daibutsu = { mesh: dm, open, wake, light: glow, eyes, hall: hb };
    hall.position.set(0, 0, -end);
    this.scene.add(hall);
    // 奥の山(春日山)
    const hill = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 14), new THREE.MeshStandardMaterial({ color: this.theme.night ? 0x1d3a2a : 0x3f7a40, roughness: 1 }));
    hill.scale.set(1.8, 0.55, 0.9);
    hill.position.set(0, -8, -(end + 85));
    this.scene.add(hill);
  }

  // ---- 法隆寺: 五重塔と金堂(絵)・中門 ----
  private buildHoryuji(): void {
    const L = this.course.length;
    const end = L + GOAL_GAP;
    const pic = this.board('horyuji', 34);
    pic.position.set(0, 0, -(end + 2));
    this.scene.add(pic);
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

  // ---- 大神神社: ゴールの大鳥居と、雪の三輪山(絵) ----
  private buildOmiwa(): void {
    const end = this.course.length + GOAL_GAP;
    // ゴールの大鳥居と雪の三輪山は、1枚の絵(鳥居の下をくぐって、参道の奥へ)
    const pic = this.board('omiwa-snow', 46);
    pic.position.set(0, -0.6, -(end + 14));
    this.scene.add(pic);
  }

  // ---- 平城宮跡: 朱色の朱雀門(絵・ゴール)・奥の大極殿 ----
  private buildHeijo(): void {
    const L = this.course.length;
    // 朱雀門は、ゴールの少し先(ゴールした鹿は、門の手前で止まって見上げる)
    const gz = -(L + 48);
    const gate = this.board('suzakumon', 34);
    gate.position.set(0, -0.3, gz);
    this.scene.add(gate);
    // 奥の大極殿
    const hall = this.hall(44, 20, 9);
    hall.position.set(0, 0, -(L + 220));
    hall.scale.setScalar(1.3);
    this.scene.add(hall);
    // 夕日
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 40), new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false }));
    sunDisc.position.set(-90, 30, -(L + 380));
    this.scene.add(sunDisc);
    // 遠くの生駒山(この先の大阪へつづく)
    const mtn = new THREE.MeshStandardMaterial({ color: 0x7a6a8e, roughness: 1, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const h = 40 + ((i * 31) % 26);
      const m = new THREE.Mesh(new THREE.ConeGeometry(80 + (i % 3) * 20, h, 6), mtn);
      m.position.set(-360 + i * 100, h / 2 - 3, -(L + 520 + (i % 2) * 40));
      this.scene.add(m);
    }
  }

  /** ゴールの景色のまわりに置く木(紅葉・桜の絵)。 */
  private roundTrees(kind: 'maple' | 'sakura', spots: { x: number; z: number; s: number }[]): void {
    this.imageTrees(kind === 'maple' ? 'maple-tree' : 'sakura-tree', spots.map((p) => ({ x: p.x, z: p.z, scale: p.s })), 9);
  }

  /** 遠くの山なみ(重なるほど、うすい色)。 */
  private ranges(z0: number, cols: number[]): void {
    for (let i = 0; i < 16; i++) {
      const layer = i % 3;
      const mat = new THREE.MeshStandardMaterial({ color: cols[layer], roughness: 1, flatShading: true });
      const h = 38 + ((i * 29) % 40) + layer * 10;
      const m = new THREE.Mesh(new THREE.ConeGeometry(70 + (i % 4) * 18, h, 7), mat);
      m.position.set(-420 + i * 56, h / 2 - 3, -(z0 + layer * 70));
      this.scene.add(m);
    }
  }

  // ---- 金峯山寺の蔵王堂(吉野・絵)と、紅葉 ----
  private buildZaodo(): void {
    const end = this.course.length + GOAL_GAP;
    const pic = this.board('zaodo', 40);
    pic.position.set(0, -0.3, -(end + 4));
    this.scene.add(pic);
    const rnd = rngFor(17);
    const spots: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const sx = rnd() < 0.5 ? -1 : 1;
      spots.push({ x: sx * (34 + rnd() * 45), z: -(end - 30 + rnd() * 80), s: 1 + rnd() * 0.8 });
    }
    this.roundTrees('maple', spots);
    this.ranges(end + 200, [0x9a5a3a, 0xc08a5a, 0xd8b896]);
  }

  // ---- 郡山城(絵): 石垣の上の天守と桜。手前に堀 ----
  private buildCastle(): void {
    const end = this.course.length + GOAL_GAP;
    const pic = this.board('koriyama-castle', 50);
    pic.position.set(0, -0.5, -(end + 22));
    this.scene.add(pic);
    // 堀
    const moat = new THREE.Mesh(new THREE.PlaneGeometry(140, 10).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8aa8, roughness: 0.1 }));
    moat.position.set(0, 0.02, -(end - 8));
    this.scene.add(moat);
    // 堀にかかる橋(道のつづき)
    const span = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 11), new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8 }));
    span.position.set(0, 0.2, -(end - 8));
    this.scene.add(span);
    const rnd = rngFor(23);
    const spots: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const sx = rnd() < 0.5 ? -1 : 1;
      spots.push({ x: sx * (40 + rnd() * 40), z: -(end - 26 + rnd() * 70), s: 0.9 + rnd() * 0.7 });
    }
    this.roundTrees('sakura', spots);
    this.ranges(end + 220, [0x5f8f5a, 0x7fa87a, 0xa6c5a3]);
  }

  // ---- 奈良公園: 大きな鳥居・芝生の鹿たち・興福寺の五重塔(絵)・若草山 ----
  private buildPark(): void {
    const L = this.course.length;
    const end = L + GOAL_GAP;
    this.scene.add(this.torii(L, 1.5));
    // 芝生で休む鹿たち(絵の板。カメラのほうを向く)
    const rnd = rngFor(31);
    for (let i = 0; i < 8; i++) {
      const tex = this.walkTex[rnd() < 0.5 ? 'doe_l' : 'doe_r'][0];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.78).translate(0, 0.89, 0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.45, toneMapped: false }));
      const sx = i % 2 ? -1 : 1;
      m.position.set(sx * (6 + rnd() * 22), 0, -(L + 14 + rnd() * 50));
      m.scale.setScalar(1.1 + rnd() * 0.3);
      this.scene.add(m);
    }
    const tower = this.board('kofukuji-pagoda', 40);
    tower.position.set(-46, 0, -(end + 70));
    this.scene.add(tower);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 14), new THREE.MeshStandardMaterial({ color: 0x7fb85a, roughness: 1 }));
    hill.scale.set(1.6, 0.5, 0.9);
    hill.position.set(40, -6, -(end + 170));
    this.scene.add(hill);
    const spots: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 22; i++) {
      const sx = rnd() < 0.5 ? -1 : 1;
      spots.push({ x: sx * (14 + rnd() * 50), z: -(L - 10 + rnd() * 110), s: 0.9 + rnd() * 0.6 });
    }
    this.roundTrees('sakura', spots);
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

  /** 上の端を、空へふわっと消す透明度の地図(下から60%までは不透明、上の端で0)。 */
  private topFade(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const gr = ctx.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#000');
    gr.addColorStop(0.4, '#fff');
    gr.addColorStop(1, '#fff');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  }

  /** まるい光(まんなかが明るく、外へ消える) */
  private glowTex?: THREE.CanvasTexture;
  private glowTexture(): THREE.CanvasTexture {
    if (this.glowTex) return this.glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(c);
    return this.glowTex;
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

  private bannerTexture(text: string, suffix = '  GOAL'): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.font = '900 64px "M PLUS Rounded 1c", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // 長い名前は、はみ出さないよう文字を小さくする
    const wTxt = g.measureText(`${text}${suffix}`).width;
    if (wTxt > 490) g.font = `900 ${Math.floor((64 * 490) / wTxt)}px "M PLUS Rounded 1c", sans-serif`;
    g.fillText(`${text}${suffix}`, 256, 52);
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
      } else if (o.kind === 'fence' && o.deco === 'crossing') {
        // 踏切の遮断機: 黄色と黒のしま模様の棒(すき間の側が、棒の先)
        const w = o.halfW * 2;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.16), this.crossingStripe());
        arm.position.set(0, 0.95, 0);
        arm.castShadow = true;
        obj.add(arm);
        for (const ex of [-o.halfW, o.halfW]) {
          if (Math.abs(o.x + ex) < ROAD_HALF - 0.1) continue; // 棒の先(すき間の側)には柱を立てない
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.6 }));
          post.position.set(ex, 0.6, 0);
          obj.add(post);
        }
      } else if (o.kind === 'train') {
        obj.add(this.trainModel(o.amp));
        this.buildTrack(o);
      } else if (o.kind === 'bomb') {
        // ラムガの子分(爆弾): [0]子分の絵(道の外・少し先) [1]赤い輪 [2]赤い円 [3]爆弾 [4]爆発の光 [5]焦げあと
        const minion = this.minionBoard('bomber', 1.9);
        minion.position.set(o.x, 0, -6);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.05, 1.4, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
        );
        ring.position.y = 0.07;
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(1.35, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
        );
        fill.position.y = 0.06;
        const bomb = new THREE.Group();
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.4, metalness: 0.3 }));
        const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23a, toneMapped: false }));
        fuse.position.y = 0.48;
        bomb.add(ball, fuse);
        bomb.visible = false;
        const flash = new THREE.Mesh(
          new THREE.SphereGeometry(1, 20, 14),
          new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        );
        flash.visible = false;
        const scorch = new THREE.Mesh(
          new THREE.CircleGeometry(1.1, 24).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.5, depthWrite: false }),
        );
        scorch.position.y = 0.04;
        scorch.visible = false;
        obj.add(minion, ring, fill, bomb, flash, scorch);
      } else if (o.kind === 'bat') {
        // こうもり: [0]絵 [1]地面の影(降りてくるほど濃く)
        const bat = this.minionBoard('bat', 1.25);
        const sh = new THREE.Mesh(
          new THREE.CircleGeometry(0.8, 20).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x2a1040, transparent: true, opacity: 0, depthWrite: false }),
        );
        sh.position.y = 0.03;
        obj.add(bat, sh);
      } else if (o.kind === 'bolt') {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.88, 1.4, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xffd21a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        );
        ring.position.y = 0.06;
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(1.35, 40).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
        );
        fill.position.y = 0.05;
        const bolt = new THREE.Mesh(
          new THREE.PlaneGeometry(4, 34).translate(0, 17, 0),
          new THREE.MeshBasicMaterial({ map: this.boltTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide }),
        );
        bolt.visible = false;
        const scorch = new THREE.Mesh(
          new THREE.CircleGeometry(1.1, 24).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.55, depthWrite: false }),
        );
        scorch.position.y = 0.04;
        scorch.visible = false;
        obj.add(ring, fill, bolt, scorch);
        sprite = bolt;
      } else if (o.kind === 'leaf') {
        // 落ち葉の山: こんもりした山と、まわりに散らばる葉
        const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: 0xc9562a, roughness: 1, flatShading: true }));
        mound.scale.set(1.15, 0.28, 1.0);
        obj.add(mound);
        const rl = rngFor(o.id + 3);
        const leafCols = [0xd9452a, 0xf08a2a, 0xf2c043, 0xb8341f];
        for (let k = 0; k < 16; k++) {
          const a = rl() * Math.PI * 2;
          const r = 0.3 + rl() * 1.1;
          const lf = new THREE.Mesh(new THREE.CircleGeometry(0.16, 5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: leafCols[k % 4], roughness: 0.9, side: THREE.DoubleSide }));
          lf.scale.set(1.6, 1, 1);
          lf.position.set(Math.cos(a) * r, 0.05 + (r < 0.9 ? 0.26 * (1 - r / 1.15) : 0), Math.sin(a) * r);
          lf.rotation.y = rl() * 6;
          obj.add(lf);
        }
      } else if (o.kind === 'sheet') {
        // 花見のシート: 青いシートに、お弁当と湯のみ
        const tarp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f7fd6, roughness: 0.6 }));
        tarp.position.y = 0.03;
        obj.add(tarp);
        const box = new THREE.MeshStandardMaterial({ color: 0x2a1c18, roughness: 0.4 });
        const lid = new THREE.MeshStandardMaterial({ color: 0xc8322a, roughness: 0.4 });
        for (const [bx, bz] of [[-0.45, -0.2], [0.35, 0.3]]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.42), box);
          b.position.set(bx, 0.14, bz);
          const l = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.04, 0.44), lid);
          l.position.set(bx, 0.27, bz);
          obj.add(b, l);
        }
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 }));
        cup.position.set(0.6, 0.11, -0.5);
        obj.add(cup);
      } else if (o.kind === 'fish') {
        obj.add(this.goldfishModel());
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
      obj.position.set(ow.x, ow.y, ow.z);
      obj.rotation.y = -ow.psi;
      this.scene.add(obj);
      this.obstacleObjs.push({ o, obj, spin, sprite, crit });
    }
  }

  private stripeMat?: THREE.Material;
  /** 踏切の遮断機の、黄色と黒のしま模様。 */
  private crossingStripe(): THREE.Material {
    if (!this.stripeMat) {
      const tex = canvasTexture(64, (g, n) => {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = i % 2 ? '#1d1d22' : '#ffc21a';
          g.fillRect((i * n) / 4, 0, n / 4, n);
        }
      }, true);
      tex.repeat.set(3, 1);
      this.disposables.push(tex);
      this.stripeMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0x2a1c00 });
    }
    return this.stripeMat;
  }

  /** 電車(2両。長い向きが、道を横切る向き)。近鉄ふうの、赤とクリーム色。 */
  /** 電車(絵の板。赤とクリーム色の2両)。長さ len で、進む向き(x)に沿って立てる。 */
  private trainModel(len: number): THREE.Group {
    const g = new THREE.Group();
    const pic = this.board('train', len / (LANDMARK_ASPECT['train'] ?? 4));
    pic.position.y = 0.15;
    g.add(pic);
    // 影だけ落とす、見えない箱(絵の板は影が四角くなるため)
    const shade = new THREE.Mesh(new THREE.BoxGeometry(len * 0.95, 4, 2.8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    shade.position.y = 2.2;
    shade.castShadow = true;
    g.add(shade);
    return g;
  }

  /** 金魚(赤い体・ひらひらの尾・白い目)。頭が +x を向く。 */
  private goldfishModel(): THREE.Group {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.35, emissive: 0x401000 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), red);
    body.scale.set(1.25, 0.9, 0.7);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff8a4a, roughness: 0.4, transparent: true, opacity: 0.9 }));
    tail.position.x = -0.68;
    tail.scale.set(1, 1, 0.3);
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const sz of [-0.27, 0.27]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), white);
      e.position.set(0.3, 0.1, sz);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), black);
      p.position.set(0.36, 0.1, sz * 1.15);
      g.add(e, p);
    }
    body.castShadow = true;
    g.add(body, tail);
    g.scale.setScalar(1.25);
    return g;
  }

  private signals: { o: Obstacle; lamps: THREE.Mesh[] }[] = [];
  /** 線路(道を横切る2本のレール)と、警報機(赤いランプ・バッテン印)。 */
  private buildTrack(o: Obstacle): void {
    const w = this.roadW(o.s, 0);
    const track = new THREE.Group();
    // 道の外の砂利(道の上は、道の面のまま)
    const ballastM = new THREE.MeshStandardMaterial({ color: 0x6d6862, roughness: 1 });
    for (const sx of [-1, 1]) {
      const ballast = new THREE.Mesh(new THREE.BoxGeometry(100, 0.12, 3.6), ballastM);
      ballast.position.set(sx * (ROAD_HALF + 0.2 + 50), 0, 0);
      ballast.receiveShadow = true;
      track.add(ballast);
    }
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.3, metalness: 0.8 });
    for (const z of [-0.72, 0.72]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(200, 0.14, 0.12), steel);
      rail.position.set(0, 0.07, z);
      track.add(rail);
    }
    const sleepers: Placement[] = [];
    for (let x = -60; x <= 60; x += 0.9) if (Math.abs(x) > ROAD_HALF + 0.3) sleepers.push({ x, z: 0 });
    addInstanced(track, [{ geo: new THREE.BoxGeometry(0.28, 0.1, 2.4), mat: new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }), pos: [0, 0.02, 0] }], sleepers, false);
    track.position.set(w.x, this.gy(o.s), w.z);
    track.rotation.y = -w.psi;
    this.scene.add(track);
    // 警報機(道の両わき、線路の手前)
    const lamps: THREE.Mesh[] = [];
    const postM = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    const blackM = new THREE.MeshStandardMaterial({ color: 0x1d1d22, roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const p = this.roadW(o.s - 2.6, sx * (ROAD_HALF + 0.9));
      const sig = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 10), postM);
      pole.position.y = 1.7;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 0.08), blackM);
      bar.position.y = 2.3;
      sig.add(pole, bar);
      for (const r of [Math.PI / 5, -Math.PI / 5]) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.22, 0.05), this.crossingStripe());
        cross.position.set(0, 3.2, 0.02);
        cross.rotation.z = r;
        sig.add(cross);
      }
      for (const lx of [-0.5, 0.5]) {
        const lampM = new THREE.MeshStandardMaterial({ color: 0x5a1010, emissive: 0xff2010, emissiveIntensity: 0, roughness: 0.4 });
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), lampM);
        l.position.set(lx, 2.3, 0.12);
        sig.add(l);
        lamps.push(l);
      }
      sig.position.set(p.x, this.gy(o.s), p.z);
      sig.rotation.y = -p.psi;
      this.scene.add(sig);
    }
    this.signals.push({ o, lamps });
  }

  private boltTex?: THREE.CanvasTexture;
  /** 雷のいなずま(ぎざぎざの光)。 */
  private boltTexture(): THREE.CanvasTexture {
    if (!this.boltTex) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 512;
      const g = c.getContext('2d')!;
      const rnd = rngFor(13);
      const pts: [number, number][] = [];
      for (let y = 0; y <= 512; y += 40) pts.push([32 + (y === 0 || y >= 512 ? 0 : (rnd() - 0.5) * 34), y]);
      for (const [lw, col] of [[18, 'rgba(255,230,120,0.35)'], [8, 'rgba(255,245,180,0.85)'], [3, '#ffffff']] as const) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.lineJoin = 'round';
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
      this.boltTex = new THREE.CanvasTexture(c);
      this.boltTex.colorSpace = THREE.SRGBColorSpace;
      this.disposables.push(this.boltTex);
    }
    return this.boltTex;
  }

  /** 雷が落ちたときの、やわらかい光(短く明るくして、すぐ戻す。点滅はさせない) */
  private flashV = 0;
  flash(): void {
    this.flashV = 1;
  }

  /** 動物・モンスターの、ポーズごとの絵(同じ絵は1回だけ読み込む)。 */
  /** 親(道の向き psi に合わせた入れ物)の中の絵を、カメラのほうへ向ける。縦横比も絵に合わせる */
  private faceCamera(m: THREE.Mesh, psi: number, _t: number): void {
    m.rotation.y = -this.camPsi + psi;
    const img = (m.material as THREE.MeshBasicMaterial).map?.image as { width: number; height: number } | undefined;
    const h = m.userData.h as number | undefined;
    if (img && img.height && h) m.scale.x = h * (img.width / img.height);
  }

  /** ラムガの子分の絵(scripts/build-minions.py で切り出した)。足もとが原点 */
  private minionTex = new Map<string, THREE.Texture>();
  private minionBoard(name: string, height: number): THREE.Mesh {
    let tex = this.minionTex.get(name);
    if (!tex) {
      tex = loadTex(`${ASSET}/runner/minions/${name}.png`);
      this.minionTex.set(name, tex);
    }
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.45, toneMapped: false, side: THREE.DoubleSide }),
    );
    (m.material as THREE.MeshBasicMaterial).color.setScalar(this.theme.night ? 0.85 : 1);
    m.userData.h = height;
    m.scale.set(height, height, 1);
    return m;
  }

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
    const glow = this.theme.night ? 1.1 : 0.55;
    // 種類ごとに、別の材質(シルバー・ゴールド・プレミアム)。光り方(emissive)まで色を変えるため、まとめずに分ける
    const mat = (color: number, emissive: number, metal: number, k = 1) =>
      new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: 0.28, emissive, emissiveIntensity: glow * k });
    const kinds: { disc: THREE.Material; rim: THREE.Material }[] = [
      { disc: mat(0xc9d2dc, 0x3c4652, 0.75), rim: mat(0xeef2f6, 0x4a5462, 0.8) }, // シルバー(ふつう)
      { disc: mat(0xffc83a, 0x7a4a00, 0.85), rim: mat(0xffe28a, 0x7a5200, 0.9) }, // ゴールド(いままでのコインの色)
      { disc: mat(0xb05cff, 0x6a1fb0, 0.5, 1.6), rim: mat(0xf0c8ff, 0x8a3ad8, 0.6, 1.6) }, // プレミアム
    ];
    const tierOf = (c: { kind?: string }) => (c.kind === 'gold' ? 1 : c.kind === 'premium' ? 2 : 0);
    const counts = [0, 0, 0];
    this.coinTier = this.course.coins.map((c) => tierOf(c));
    for (const c of this.course.coins) counts[tierOf(c)]++;
    // 軽くする(スマホ向け): コインは数百枚あり、全部を毎フレーム描くので、形は粗めに・影は落とさない
    const discGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 18).rotateX(Math.PI / 2);
    const rimGeo = new THREE.TorusGeometry(0.4, 0.06, 6, 18);
    this.coinSets = kinds.map((k, i) => {
      const disc = new THREE.InstancedMesh(discGeo, k.disc, Math.max(1, counts[i]));
      const rim = new THREE.InstancedMesh(rimGeo, k.rim, Math.max(1, counts[i]));
      for (const m of [disc, rim]) {
        m.frustumCulled = false;
        m.castShadow = false;
        // まだ置いていない(数が0の種類の、空の1つ)は見せない
        for (let j = 0; j < m.count; j++) m.setMatrixAt(j, new THREE.Matrix4().makeScale(0, 0, 0));
        this.scene.add(m);
      }
      return { disc, rim };
    });
    this.course.coins.forEach((c) => {
      // プレミアムは、遠くからでも見える光の輪
      if (c.kind === 'premium') {
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: 0xd59bff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
        halo.scale.setScalar(3.6);
        this.scene.add(halo);
        this.premiumHalo = { id: c.id, s: c.s, x: c.x, y: c.y, obj: halo };
      }
    });
    // 回復薬(ハートが1つふえる)
    for (const c of this.course.coins) {
      if (c.kind !== 'potion') continue;
      // 回復薬の絵(いつもカメラのほうを向く)。夜も見えるよう、色はそのまま
      const g = new THREE.Group();
      const b = this.board('potion', 2.0, { tint: new THREE.Color(0xffffff) });
      b.position.y = -0.7;
      g.add(b);
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
    (this.daibutsu.hall.material as THREE.MeshBasicMaterial).color.set(on ? 0x9a8a88 : 0x3a3a50);
  }

  // ---- 雨・雪 ----
  private buildWeather(): void {
    const w = this.theme.weather;
    if (w === 'none') return;
    const rain = w === 'rain';
    const flutter = w === 'leaves' || w === 'petals'; // 落ち葉・花びら: ひらひら舞う
    const n = rain ? 1300 : flutter ? 1000 : 1700;
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
    } else if (flutter) {
      // 1枚ずつ色を変える(紅葉=赤・橙・黄 / 桜=ピンク)
      const palette = (w === 'leaves' ? [0xd9452a, 0xf08a2a, 0xf2c043, 0xb8341f] : [0xffc4d6, 0xffe2ea, 0xff9fbf]).map((c) => new THREE.Color(c));
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) palette[i % palette.length].toArray(col, i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const tex = canvasTexture(64, (g, s) => {
        g.clearRect(0, 0, s, s);
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(s / 2, s / 2, s * 0.42, s * 0.24, 0.6, 0, Math.PI * 2);
        g.fill();
      });
      this.disposables.push(tex);
      obj = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, vertexColors: true, size: w === 'leaves' ? 0.36 : 0.26, transparent: true, alphaTest: 0.3, depthWrite: false, sizeAttenuation: true }));
    } else {
      const tex = glowTexture();
      this.disposables.push(tex);
      obj = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, color: 0xffffff, size: 0.42, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }));
    }
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.weather = { pts: obj, pos, n, rain, seed, flutter };
  }

  private updateWeather(t: number): void {
    const wd = this.weather;
    if (!wd) return;
    const { pos, n, rain, seed, flutter } = wd;
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    const by = this.camBase; // 坂の高さに合わせて降らせる
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
        const y = by + 16 - ((t * (22 + r * 8) + seed[i * 4 + 1]) % 16);
        const k = i * 6;
        pos[k] = cx + sx;
        pos[k + 1] = y;
        pos[k + 2] = cz + sz;
        pos[k + 3] = cx + sx + 0.18;
        pos[k + 4] = y + 0.85;
        pos[k + 5] = cz + sz - 0.08;
      } else if (flutter) {
        // ひらひら: ゆっくり落ちながら、大きく左右にゆれる
        const y = by + 14 - ((t * (1.0 + r * 1.1) + seed[i * 4 + 1]) % 14);
        const k = i * 3;
        pos[k] = cx + sx + Math.sin(t * (0.9 + r) + i) * 1.6;
        pos[k + 1] = y;
        pos[k + 2] = cz + sz + Math.cos(t * 0.7 + i * 1.3) * 0.9;
      } else {
        const y = by + 15 - ((t * (1.6 + r * 1.4) + seed[i * 4 + 1]) % 15);
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
    this.baseFov = w / h < 0.6 ? 62 : 62 - Math.min(14, (w / h - 0.6) * 24);
    this.camera.fov = this.baseFov + this.fovKick;
    this.camera.updateProjectionMatrix();
  }
  private baseFov = 62;
  /** ダッシュ中に、画面を少し広角にする量[度] */
  private fovKick = 0;
  private rampArrows?: THREE.Texture;

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
    this.deer.position.set(wd.x, wd.y + run.y + bob, wd.z);
    this.deer.rotation.set(0, -wd.psi, -run.vx * 0.022 + waving, 'YXZ');
    const squash = run.airborne ? 1 + Math.min(0.1, run.y * 0.04) : 1;
    this.deer.scale.set(1 / squash, squash, 1);
    this.deer.visible = run.invuln > 0 ? Math.floor(t * 16) % 2 === 0 : true;
    this.deerShadow.position.set(wd.x, wd.y + 0.03, wd.z);
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
    // ジャンプ台で高く飛んだときは、カメラも上げて、鹿が画面の上から出ないようにする
    const lift = run.y * 0.25 + Math.max(0, run.y - 1.6) * 0.45;
    // クリア後は少し引いて、ゴールの景色の全体が見えるようにする
    this.cine += ((run.phase === 'cleared' ? 1 : 0) - this.cine) * Math.min(1, dt * 1.6);
    const c = this.cine;
    const sBack = run.s - (6.4 + c * 3.2);
    const sAhead = run.s + 9 + c * 14;
    const back = this.roadW(sBack, this.camX + sx);
    const ahead = this.roadW(sAhead, this.camX * 0.95);
    // 坂: カメラの高さは、坂だけ(ジャンプ台は除く)の高さを、なめらかに追う
    const k = Math.min(1, dt * 5);
    const baseT = Math.max(this.gy(sBack), this.gy(run.s) - 0.6);
    const lookT = this.gy(sAhead) * 0.7 + this.gy(run.s) * 0.3;
    if (this.clock <= dt) { this.camBase = baseT; this.camLook = lookT; }
    this.camBase += (baseT - this.camBase) * k;
    this.camLook += (lookT - this.camLook) * k;
    this.camera.position.set(back.x, this.camBase + 3.5 + lift + sy + c * 2.2, back.z);
    this.camera.lookAt(ahead.x, this.camLook + 1.5 + lift * 0.5 + c * 2.6, ahead.z);
    // つり橋の上では、ゆれに合わせて画面が少しかたむく
    if (run.onBridge) this.camera.rotateZ(-bridgeSway(run.t) * 0.012);

    // 太陽(月)の影は鹿のまわりだけ
    const sp = this.theme.sunPos;
    const gy = this.gy(run.s);
    this.sun.position.set(wd.x + sp[0], gy + sp[1], wd.z + sp[2]);
    const tw = this.roadW(run.s + 6, px);
    this.sun.target.position.set(tw.x, gy, tw.z);
    this.sun.target.updateMatrixWorld();
    if (this.headlight) {
      const hw = this.roadW(run.s + 4, px);
      this.headlight.position.set(hw.x, hw.y + 3.4, hw.z);
    }
    if (this.footGlow) {
      const gw = this.roadW(run.s + 3.2, px);
      const grade = (roadY(this.course, run.s + 6.4) - roadY(this.course, run.s)) / 6.4;
      this.footGlow.position.set(gw.x, gw.y + 0.05, gw.z);
      this.footGlow.rotation.set(Math.atan(grade), -gw.psi, 0, 'YXZ');
    }

    // コイン
    // 軽くする(スマホ向け): 近くの取れるコインだけを、前から詰めて描く(遠い・取ったコインは描かない)
    const coins = this.course.coins;
    const spin = t * 2.6;
    const used = [0, 0, 0];
    for (let i = 0; i < coins.length; i++) {
      const cn = coins[i];
      if (cn.kind === 'potion') continue;
      // 取りそこねて後ろに行ったコインは、カメラの前を通らないよう消す
      if (cn.s - run.s > 170 || cn.s - run.s < -1.5 || run.collected.has(cn.id)) continue;
      const k = cn.kind === 'premium' ? 1.7 : cn.kind === 'gold' ? 1.3 : 1;
      this.tmpQ.setFromEuler(this.tmpE.set(0, spin + i * 0.7, 0));
      const cw = this.roadW(cn.s, cn.x);
      this.tmpM.compose(this.tmpP.set(cw.x, cw.y + cn.y + Math.sin(t * 3 + i) * 0.06, cw.z), this.tmpQ, this.tmpS.set(k, k, k));
      const tier = this.coinTier[i];
      const set = this.coinSets[tier];
      set.disc.setMatrixAt(used[tier], this.tmpM);
      set.rim.setMatrixAt(used[tier], this.tmpM);
      used[tier]++;
    }
    this.coinSets.forEach((set, tier) => {
      set.disc.count = used[tier];
      set.rim.count = used[tier];
      set.disc.instanceMatrix.needsUpdate = true;
      set.rim.instanceMatrix.needsUpdate = true;
    });
    if (this.premiumHalo) {
      const h = this.premiumHalo;
      const on = !run.collected.has(h.id) && h.s - run.s < 170 && h.s - run.s > -1.5;
      h.obj.visible = on;
      if (on) {
        const hw = this.roadW(h.s, h.x);
        h.obj.position.set(hw.x, hw.y + h.y, hw.z);
        h.obj.scale.setScalar(3.2 + 0.5 * Math.sin(t * 5));
      }
    }
    for (const po of this.potionObjs) {
      const near = po.s - run.s < 170 && po.s - run.s > -1.5 && !run.collected.has(po.id);
      po.obj.visible = near;
      if (!near) continue;
      const pw = this.roadW(po.s, po.x);
      po.obj.position.set(pw.x, pw.y + po.y + Math.sin(t * 3) * 0.12, pw.z);
      po.obj.rotation.y = -this.camPsi;
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
      if (e.o.kind === 'train') {
        // 電車: 線路の上を、道を横切って走る
        e.obj.visible = Math.abs(st.x) < 160;
        const tw = this.roadW(e.o.s, st.x);
        e.obj.position.set(tw.x, this.gy(e.o.s), tw.z);
        e.obj.rotation.y = -this.roadW(e.o.s, 0).psi;
        continue;
      }
      if (e.o.kind === 'fish') {
        // 金魚: 水路から弧をえがいて、道を横切る(水の中では見えない)
        e.obj.visible = st.y > -1;
        const fw = this.roadW(e.o.s, st.x);
        e.obj.position.set(fw.x, this.gy(e.o.s) + Math.max(0, st.y) + 0.3, fw.z);
        e.obj.rotation.y = -fw.psi;
        // 弧に合わせて、頭を上・下へ向ける
        const u = (st.x - FISH_X0) / (FISH_X1 - FISH_X0);
        e.obj.children[0].rotation.z = 0.9 * (1 - 2 * Math.min(1, Math.max(0, u)));
        continue;
      }
      if (e.o.kind === 'bomb') {
        // 爆弾: 子分が投げる → 赤い輪(ねらった所) → 爆発 → 焦げあと
        const t0 = run.chargeT.get(e.o.id);
        const [minion, ring, fill, bomb, flash, scorch] = e.obj.children as THREE.Mesh[];
        const ow = this.roadW(e.o.s, 0);
        e.obj.position.set(ow.x, ow.y, ow.z);
        e.obj.rotation.y = -ow.psi;
        this.faceCamera(minion, ow.psi, t);
        const d = t0 === undefined ? -1 : run.t - t0;
        const aim = run.aim.get(e.o.id) ?? 0;
        const flying = t0 !== undefined && d < e.o.freq;
        for (const m of [ring, fill, scorch]) m.position.x = aim;
        const u = flying ? d / e.o.freq : 0;
        (ring.material as THREE.MeshBasicMaterial).opacity = flying ? 0.7 + 0.3 * Math.abs(Math.sin(d * (7 + u * 10))) : 0;
        (fill.material as THREE.MeshBasicMaterial).opacity = flying ? 0.12 + u * 0.3 : 0;
        bomb.visible = flying;
        if (flying) {
          // 子分の手もと(道の外・6m先・高さ1.4m)から、ねらった所へ、山なりに
          const x0 = e.o.x;
          bomb.position.set(x0 + (aim - x0) * u, 1.4 * (1 - u) + 0.42 + 5.5 * u * (1 - u), -6 * (1 - u));
          bomb.rotation.z = d * 8;
        }
        const boom = t0 !== undefined && d >= e.o.freq && d < e.o.freq + 0.4;
        flash.visible = boom;
        if (boom) {
          const k = (d - e.o.freq) / 0.4;
          flash.position.set(aim, 0.6, 0);
          flash.scale.setScalar(0.6 + 2.2 * k);
          (flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        }
        scorch.visible = t0 !== undefined && d >= e.o.freq;
        continue;
      }
      if (e.o.kind === 'bat') {
        // こうもり: 前の高い所から、ねらった位置へ降りてくる
        e.obj.visible = st.y > -1;
        if (!e.obj.visible) continue;
        const [bat, sh] = e.obj.children as THREE.Mesh[];
        const bw = this.roadW(st.s, st.x);
        e.obj.position.set(bw.x, this.gy(st.s), bw.z);
        e.obj.rotation.y = -bw.psi;
        this.faceCamera(bat, bw.psi, t);
        bat.position.y = st.y - 0.3;
        // はばたき(横に少しのびちぢみ)
        const hb = bat.userData.h as number;
        bat.scale.set(hb * 1.64 * (0.85 + 0.15 * Math.abs(Math.sin(t * 14))), hb, 1);
        (sh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.45 - st.y * 0.07);
        continue;
      }
      if (e.o.kind === 'bolt') {
        // 雷: 光る輪(予告) → いなずま → 焦げあと
        const t0 = run.chargeT.get(e.o.id);
        const [ring, fill, bolt, scorch] = e.obj.children as THREE.Mesh[];
        const d = t0 === undefined ? -1 : run.t - t0;
        const warn = t0 !== undefined && d < e.o.freq;
        const u = warn ? d / e.o.freq : 0; // 0→1 で、だんだん強く
        (ring.material as THREE.MeshBasicMaterial).opacity = warn ? 0.65 + 0.35 * Math.abs(Math.sin(d * (6 + u * 10))) : 0;
        (fill.material as THREE.MeshBasicMaterial).opacity = warn ? 0.18 + u * 0.3 : 0;
        const strike = t0 !== undefined && d >= e.o.freq && d < e.o.freq + 0.32;
        bolt.visible = strike;
        if (strike) {
          bolt.rotation.y = -this.camPsi + Math.sin(d * 50) * 0.3;
          bolt.scale.x = 0.8 + Math.random() * 0.5;
        }
        scorch.visible = t0 !== undefined && d >= e.o.freq;
        continue;
      }
      if (e.crit && e.sprite) {
        // 動物・モンスター: 動き方と状態で、ポーズを切りかえる
        const o = e.o;
        const ow = this.roadW(st.s, st.x);
        e.obj.position.set(ow.x, ow.y, ow.z);
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
        e.obj.position.set(ow.x, ow.y, ow.z);
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

    // 踏切の警報機: 電車が動き出したら、左右のランプが交互に光る(鹿が通りすぎるまで)
    for (const sg of this.signals) {
      const on = run.chargeT.has(sg.o.id) && run.s < sg.o.s + 6;
      const phase = Math.floor(this.clock * 2.2) % 2;
      sg.lamps.forEach((l, i) => {
        (l.material as THREE.MeshStandardMaterial).emissiveIntensity = on && i % 2 === phase ? 3.2 : 0;
      });
    }
    // 遠景の絵: カメラの前方 300m に置き、範囲の出入りで、ふわっと出し入れする
    for (const bd of this.backdrops) {
      const fade = Math.min(1, (run.s - bd.from + 30) / 30, (bd.to - run.s) / 40);
      const m = bd.mesh;
      m.visible = fade > 0;
      if (!m.visible) continue;
      (m.material as THREE.MeshBasicMaterial).opacity = fade;
      const D = 300;
      // 高さは海抜(出発地点)を基準にする: 生駒山の上からは、大阪の街を見下ろす
      m.position.set(this.camera.position.x + Math.sin(this.camPsi) * D, -24, this.camera.position.z - Math.cos(this.camPsi) * D);
      m.rotation.y = -this.camPsi;
    }
    this.updateWeather(this.clock);
    // ジャンプ台: 矢印を流し、ダッシュ中は画面を広角にして、速さを感じさせる
    if (this.rampArrows) this.rampArrows.offset.y -= dt * 1.6;
    const kick = run.boost > 0 ? 9 * Math.min(1, run.boost / 0.9) : 0;
    if (Math.abs(kick - this.fovKick) > 0.05) {
      this.fovKick += (kick - this.fovKick) * Math.min(1, dt * 6);
      this.camera.fov = this.baseFov + this.fovKick;
      this.camera.updateProjectionMatrix();
    }
    // 雷の光は、やわらかく戻す
    this.flashV = Math.max(0, this.flashV - dt * 3);
    this.renderer.toneMappingExposure = this.theme.exposure + this.cine * 0.15 + this.flashV * 0.55;
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
    for (const t of this.minionTex.values()) t.dispose();
    for (const arr of Object.values(this.walkTex)) for (const t of arr) t.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
