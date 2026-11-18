// WORLD 2 せんべい屋台の描画(three.js)。奈良公園の屋台・鉄板・せんべい・焼き加減の輪・お客の鹿・湯気や煙。
// ルールは sim.ts。ここは、その状態を絵にするだけ(タップの当たり判定も、ここで画面の位置から決める)。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BAL, type BakeEvent, type BakeRun, type Deer, type Plate } from './sim.ts';
import type { BakeLevel, DeerKind, W2Level } from './levels.ts';

const ASSET = '/assets';
export const COUNTER_TOP = 0.92;
const GRIDDLE_TOP = 0.98;
const PLATE_GAP = 0.92;
const PLATE_Z = 0.28;
const SENBEI_R = 0.31;
const TRAY_Z = -0.6;
export const SPOT_Z = -1.78;
const SPOT_X = [-1.25, 0, 1.25];
const DEER_H: Record<DeerKind, number> = { fawn: 1.3, doe: 1.45, stag: 1.6 };
const START_Z = -5.6;
// くいしんぼう鹿: 横から、台の端(カウンターのすぐ向こう)へ忍びよる
const SNEAK_H = 1.2;
const SNEAK_X = 0.98;
const SNEAK_Z = -1.12;
/** 台に前足をかけて、身をのり出す高さ(奈良の鹿がよくやる仕草) */
const SNEAK_LIFT = 0.55;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ease = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

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
  const rnd = mulberry(seed);
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

// せんべいの焼け色(片面の秒数から)。生 → うすい黄 → こんがり金 → 茶 → 焦げ
const RAW = new THREE.Color('#f4e6c2'), LIGHT = new THREE.Color('#ecca82'), GOLD = new THREE.Color('#d99a43'), BROWN = new THREE.Color('#9b5a26'), BURNT = new THREE.Color('#3a2414');
function doneColor(out: THREE.Color, t: number, lv: BakeLevel): THREE.Color {
  const c = lv.cook, mid = (c.perfect[0] + c.perfect[1]) / 2;
  if (t <= c.ok) return out.copy(RAW).lerp(LIGHT, ease(t / c.ok));
  if (t <= mid) return out.copy(LIGHT).lerp(GOLD, ease((t - c.ok) / (mid - c.ok)));
  if (t <= c.smoke) return out.copy(GOLD).lerp(BROWN, ease((t - mid) / (c.smoke - mid)) * 0.55);
  return out.copy(GOLD).lerp(BROWN, 0.55).lerp(BURNT, ease((t - c.smoke) / (c.burn - c.smoke)));
}

/** 焼き加減の輪。上から時計回りに、生(灰)→ 焼けた(緑)→ こんがり(金)→ 焼けた(緑)→ 焦げる(赤)。針が今の焼け具合 */
function ringMaterial(lv: BakeLevel): THREE.ShaderMaterial {
  const c = lv.cook, b = c.burn;
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uProg: { value: 0 }, uOn: { value: 0 }, uTime: { value: 0 }, uZ: { value: new THREE.Vector4(c.ok / b, c.perfect[0] / b, c.perfect[1] / b, c.smoke / b) } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uProg; uniform float uOn; uniform float uTime; uniform vec4 uZ; varying vec2 vP;
      void main(){
        float a = atan(vP.x, vP.y); if (a < 0.0) a += 6.2831853; float f = a / 6.2831853;
        bool gold = f >= uZ.y && f <= uZ.z;
        vec3 c = f < uZ.x ? vec3(0.80, 0.82, 0.86) : f < uZ.y ? vec3(0.42, 0.80, 0.33) : gold ? vec3(1.0, 0.80, 0.12) : f < uZ.w ? vec3(0.42, 0.80, 0.33) : vec3(0.95, 0.25, 0.16);
        float done = step(f, uProg);
        bool inGold = uProg >= uZ.y && uProg <= uZ.z;
        float glow = gold && inGold ? 0.35 + 0.25 * sin(uTime * 18.0) : 0.0;
        vec3 col = mix(c * 0.62, c * 1.12, done) + glow;
        float alpha = mix(0.45, 0.97, done);
        float d = abs(f - uProg); d = min(d, 1.0 - d);
        float needle = smoothstep(0.014, 0.0, d);
        col = mix(col, vec3(1.0), needle);
        alpha = max(alpha, needle);
        gl_FragColor = vec4(col, alpha * uOn);
      }`,
  });
}

type Particle = { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; spin: number; gravity: number; base: number };
type Flyer = { obj: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; h: number; spin: number; spinZ?: number; done?: () => void };
type DeerSprite = { s: THREE.Sprite; shadow: THREE.Mesh; lastPhase: string; dir: 'l' | 'r'; leaveFrom: THREE.Vector3 | null };

export class BakeView {
  protected host: HTMLElement;
  protected level: BakeLevel;
  protected renderer: THREE.WebGLRenderer;
  protected scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 120);
  protected ro: ResizeObserver;
  protected disposables: { dispose(): void }[] = [];
  protected time = 0;
  protected shake = 0;
  protected plateX: number[];
  protected senbei: THREE.Mesh[] = [];
  protected senbeiMats: THREE.MeshStandardMaterial[][] = [];
  protected rings: THREE.ShaderMaterial[] = [];
  protected plateGlow: THREE.Mesh[] = [];
  protected trayItems: THREE.Mesh[] = [];
  protected senbeiGeo = new THREE.CylinderGeometry(SENBEI_R, SENBEI_R * 0.98, 0.05, 48);
  protected surfTex: THREE.Texture;
  protected trayMat: { normal: THREE.MeshStandardMaterial; gokujo: THREE.MeshStandardMaterial };
  protected side1Color: THREE.Color[] = [];
  protected particles: Particle[] = [];
  protected pmat: Record<'soft' | 'star' | 'heart' | 'crumb', THREE.SpriteMaterial>;
  protected flyers: Flyer[] = [];
  protected deerTex: Record<string, THREE.Texture> = {};
  protected deerSprites = new Map<number, DeerSprite>();
  protected bgDeer: { s: THREE.Sprite; ph: number; x: number }[] = [];
  /** くいしんぼう鹿(1頭ずつ)。絵は左向き・右向きの2つ */
  protected sneak!: THREE.Sprite;
  protected sneakShadow!: THREE.Mesh;
  protected sneakTex: { l: THREE.Texture; r: THREE.Texture } | null = null;
  /** いまの位置(タップの当たりと、ふきだしに使う)。いないときは null */
  sneakAt: THREE.Vector3 | null = null;
  protected sneakFrom = new THREE.Vector3();
  protected blinkMat = new THREE.MeshStandardMaterial({ color: '#e2b467', roughness: 0.78, emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 0 });
  protected tmpV = new THREE.Vector3();

  /** 積む面(せんべいタワー)では、鉄板と台を作らない(公園・屋台・鹿・演出は共通。TowerView が引きつぐ) */
  protected tower: boolean;
  constructor(host: HTMLElement, w2level: W2Level) {
    const level = w2level as BakeLevel; // 焼く面だけの値(plates など)は、tower では使わない
    this.host = host; this.level = level; this.tower = w2level.mode === 'tower';
    this.plateX = this.tower ? [] : Array.from({ length: level.plates }, (_, i) => (i - (level.plates - 1) / 2) * PLATE_GAP);
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
    this.scene.fog = new THREE.Fog('#cfe6ee', 14, 46);

    const pmrem = new THREE.PMREMGenerator(this.renderer), env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env; this.scene.environmentIntensity = 0.35;
    pmrem.dispose(); this.disposables.push(env);
    this.scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x7a6a48, 1.0));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
    sun.position.set(-4, 9, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 25;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    // 鉄板の熱: せんべいを、下から少し赤く照らす
    const heat = new THREE.PointLight(0xff9a4a, 1.6, 2.6, 2);
    heat.position.set(0, GRIDDLE_TOP + 0.35, PLATE_Z);
    this.scene.add(heat);

    this.surfTex = this.makeSurface();
    const tm = (c: string, e = 0) => new THREE.MeshStandardMaterial({ color: c, map: this.surfTex, roughness: 0.78, emissive: new THREE.Color(c), emissiveIntensity: e });
    this.trayMat = { normal: tm('#e2b467'), gokujo: tm('#d8963c', 0.12) };
    this.pmat = this.makeParticleMats();

    this.buildPark();
    this.buildStall();
    if (!this.tower) { this.buildGriddle(); this.buildTray(); }
    this.loadDeer();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  // ---- 作る ----
  protected makeSurface(): THREE.Texture {
    // せんべいの表面: 細かい粒と、ふちが少し濃い。色は材質の色でつける(白っぽい明暗だけ描く)
    const rnd = mulberry(7);
    return canvasTex(256, 256, g => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) { const v = 200 + rnd() * 55; g.fillStyle = `rgba(${v * 0.92},${v * 0.82},${v * 0.66},0.55)`; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 0, 7); g.fill(); }
      const grd = g.createRadialGradient(128, 128, 70, 128, 128, 128);
      grd.addColorStop(0, 'rgba(120,80,40,0)'); grd.addColorStop(1, 'rgba(120,80,40,0.35)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    });
  }

  protected makeParticleMats() {
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
    const heart = canvasTex(64, 64, g => {
      g.fillStyle = '#ff6f93';
      g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(4, 34, 8, 8, 32, 20); g.bezierCurveTo(56, 8, 60, 34, 32, 54); g.fill();
    });
    const crumb = canvasTex(32, 32, g => { g.fillStyle = '#d9a35a'; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill(); });
    this.disposables.push(soft, star, heart, crumb);
    const m = (map: THREE.Texture, blending: THREE.Blending = THREE.NormalBlending) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending });
    return { soft: m(soft), star: m(star, THREE.AdditiveBlending), heart: m(heart), crumb: m(crumb) };
  }

  protected buildPark(): void {
    const rnd = mulberry(21);
    // 地面: 屋台のまわりは土、その先は芝
    const grass = grainTex('#8fc266', [['#7db257', 900, 3], ['#a6d47b', 700, 2], ['#6aa047', 300, 2]], 3);
    grass.repeat.set(18, 18);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.scene.add(ground);
    const dirt = grainTex('#d8c39a', [['#c9b088', 900, 3], ['#e6d4b0', 600, 2], ['#b89c74', 200, 2]], 5);
    dirt.repeat.set(4, 4);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48), new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, 0.005, -2.2); plaza.scale.set(1.35, 1, 1); plaza.receiveShadow = true;
    this.scene.add(plaza);

    // 木(丸い葉のかたまり)
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.9 });
    const leafMats = ['#5f9e3e', '#6fae47', '#4f8c37', '#7dbb52'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
    const leafGeo = new THREE.IcosahedronGeometry(1, 1), trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 8);
    const spots: [number, number][] = [];
    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? 1 : -1, z = -6 - rnd() * 26, x = side * (3.2 + rnd() * 9) + (rnd() - 0.5) * 2;
      if (Math.abs(x) < 3 && z > -12) continue;
      spots.push([x, z]);
    }
    spots.push([-9, -15], [8, -18], [-3, -24], [4, -28], [0, -34]);
    for (const [x, z] of spots) {
      const s = 0.8 + rnd() * 0.7, tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.2; trunk.castShadow = true;
      tree.add(trunk);
      for (let k = 0; k < 4; k++) {
        const leaf = new THREE.Mesh(leafGeo, leafMats[Math.floor(rnd() * leafMats.length)]);
        leaf.position.set((rnd() - 0.5) * 1.6, 2.8 + rnd() * 1.4, (rnd() - 0.5) * 1.6);
        leaf.scale.setScalar(1.0 + rnd() * 0.7);
        leaf.castShadow = true;
        tree.add(leaf);
      }
      tree.position.set(x, 0, z); tree.scale.setScalar(s);
      this.scene.add(tree);
    }
    // 石灯籠
    const stone = new THREE.MeshStandardMaterial({ color: '#b9b3a6', roughness: 0.95 });
    const lamp = new THREE.MeshStandardMaterial({ color: '#ffe7a8', emissive: new THREE.Color('#ffcf6b'), emissiveIntensity: 0.5 });
    for (const [x, z] of [[-3.6, -4.2], [3.7, -4.6], [-4.4, -9], [4.6, -9.8], [-5.4, -14], [5.6, -15]] as [number, number][]) {
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, y: number, m: THREE.Material = stone) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); };
      add(new THREE.CylinderGeometry(0.38, 0.46, 0.25, 6), 0.12);
      add(new THREE.CylinderGeometry(0.12, 0.14, 0.95, 8), 0.72);
      add(new THREE.CylinderGeometry(0.34, 0.3, 0.16, 6), 1.25);
      add(new THREE.BoxGeometry(0.4, 0.34, 0.4), 1.5, lamp);
      add(new THREE.ConeGeometry(0.56, 0.36, 6), 1.85);
      add(new THREE.SphereGeometry(0.09, 8, 6), 2.08);
      g.position.set(x, 0, z);
      this.scene.add(g);
    }
    // 遠くの五重塔(名所の絵)
    const pagodaTex = loadTex(`${ASSET}/runner/landmarks/kofukuji-pagoda.webp`);
    const pagoda = new THREE.Mesh(new THREE.PlaneGeometry(9, 15), new THREE.MeshBasicMaterial({ map: pagodaTex, transparent: true, alphaTest: 0.1, fog: false }));
    pagoda.position.set(-7.5, 7.0, -36);
    this.scene.add(pagoda);
    this.disposables.push(pagodaTex);
    // 芝で休む鹿(背景のにぎやかし)
    const lie = loadTex(`${ASSET}/bake/stag_lie.png`);
    this.disposables.push(lie);
    for (const [x, z, s] of [[-4.6, -7.2, 1.1], [5.2, -11.5, 1.0], [-2.4, -13.5, 0.9], [7.4, -6.6, 1.1]] as [number, number, number][]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lie, transparent: true, alphaTest: 0.1 }));
      sp.center.set(0.5, 0.02); sp.scale.set(s * 1.2, s * 1.36, 1); sp.position.set(x, 0, z);
      if (x > 0) sp.material.rotation = 0;
      this.scene.add(sp);
      this.bgDeer.push({ s: sp, ph: rnd() * 6, x });
    }
  }

  protected buildStall(): void {
    // 木のカウンター(屋台の台)
    const wood = grainTex('#b07a45', [['#9a6638', 500, 2], ['#c48c55', 400, 2]], 9);
    const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.75 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.7, COUNTER_TOP, 1.9), woodMat);
    counter.position.set(0, COUNTER_TOP / 2, -0.05); counter.castShadow = true; counter.receiveShadow = true;
    this.scene.add(counter);
    const topBoard = new THREE.Mesh(new THREE.BoxGeometry(3.86, 0.06, 2.02), new THREE.MeshStandardMaterial({ map: wood, color: '#d9a46a', roughness: 0.6 }));
    topBoard.position.set(0, COUNTER_TOP + 0.01, -0.05); topBoard.receiveShadow = true;
    this.scene.add(topBoard);
    // 鹿の側のふち: 赤い毛氈
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(3.86, 0.012, 0.62), new THREE.MeshStandardMaterial({ color: '#c8302a', roughness: 0.95 }));
    cloth.position.set(0, COUNTER_TOP + 0.045, -0.78); cloth.receiveShadow = true;
    this.scene.add(cloth);
    // のぼり旗「鹿せんべい」
    const flagTex = canvasTex(128, 512, g => {
      g.fillStyle = '#fbf3e0'; g.fillRect(0, 0, 128, 512);
      g.fillStyle = '#c8302a'; g.fillRect(0, 0, 128, 40); g.fillRect(0, 472, 128, 40);
      g.fillStyle = '#7a2a1a'; g.font = 'bold 78px "Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
      ['鹿', 'せ', 'ん', 'べ', 'い'].forEach((ch, i) => g.fillText(ch, 64, 112 + i * 76));
    });
    this.disposables.push(flagTex);
    for (const x of [-2.15, 2.15]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 8), new THREE.MeshStandardMaterial({ color: '#6b4a2a' }));
      pole.position.set(x, 1.7, -1.05); pole.castShadow = true;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 1.9), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }));
      flag.position.set(x + (x < 0 ? 0.27 : -0.27), 2.25, -1.05); flag.castShadow = true;
      this.scene.add(pole, flag);
    }
    // 帯をまいた、せんべいの束(本物の鹿せんべいは10枚ずつ、紙の帯でまとめて売られている)
    const bandTex = canvasTex(256, 32, g => { g.fillStyle = '#fffdf6'; g.fillRect(0, 0, 256, 32); g.fillStyle = '#3d8a3a'; for (let x = 0; x < 256; x += 48) { g.fillRect(x, 0, 18, 32); } });
    this.disposables.push(bandTex);
    for (const [x, z, n] of [[1.35, -0.62, 10], [-1.35, -0.6, 7]] as [number, number, number][]) {
      const g = new THREE.Group();
      for (let k = 0; k < n; k++) {
        const s = new THREE.Mesh(this.senbeiGeo, this.trayMat.normal);
        s.scale.set(0.62, 0.7, 0.62); s.position.y = k * 0.034; s.rotation.y = k; s.castShadow = true;
        g.add(s);
      }
      const band = new THREE.Mesh(new THREE.CylinderGeometry(SENBEI_R * 0.64, SENBEI_R * 0.64, 0.09, 32, 1, true), new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.9 }));
      band.position.y = n * 0.017; g.add(band);
      g.position.set(x, COUNTER_TOP + 0.06, z);
      this.scene.add(g);
    }
  }

  protected buildGriddle(): void {
    const n = this.level.plates, w = n * PLATE_GAP + 0.32;
    const iron = new THREE.MeshStandardMaterial({ color: '#2b2a2c', roughness: 0.55, metalness: 0.6 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 1.06), iron);
    slab.position.set(0, GRIDDLE_TOP - 0.05, PLATE_Z); slab.castShadow = true; slab.receiveShadow = true;
    this.scene.add(slab);
    // 熱で赤くなったふち
    const glow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.03, 1.1), new THREE.MeshBasicMaterial({ color: '#ff6a1f', transparent: true, opacity: 0.55 }));
    glow.position.set(0, GRIDDLE_TOP - 0.1, PLATE_Z);
    this.scene.add(glow);
    const plateMat = new THREE.MeshStandardMaterial({ color: '#1b1a1c', roughness: 0.35, metalness: 0.75 });
    const tapMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
    this.plateX.forEach((x, i) => {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.012, 48), plateMat);
      plate.position.set(x, GRIDDLE_TOP + 0.002, PLATE_Z); plate.receiveShadow = true;
      this.scene.add(plate);
      // 空いた鉄板の「ここに置ける」光
      const hint = new THREE.Mesh(new THREE.CircleGeometry(0.33, 40), tapMat.clone());
      hint.rotation.x = -Math.PI / 2; hint.position.set(x, GRIDDLE_TOP + 0.012, PLATE_Z);
      this.scene.add(hint);
      this.plateGlow.push(hint);
      const ringMat = ringMaterial(this.level);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.37, 0.45, 96, 1), ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, GRIDDLE_TOP + 0.014, PLATE_Z); ring.renderOrder = 2;
      this.scene.add(ring);
      this.rings.push(ringMat);
      // せんべい(材質: 横・上・下)。上下の面の色を、それぞれの焼け具合で変える
      const mats = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: RAW.clone(), map: this.surfTex, roughness: 0.8, emissive: new THREE.Color('#000000') }));
      const s = new THREE.Mesh(this.senbeiGeo, mats);
      s.castShadow = true; s.visible = false;
      s.position.set(x, GRIDDLE_TOP + 0.03, PLATE_Z);
      this.scene.add(s);
      this.senbei.push(s); this.senbeiMats.push(mats); this.side1Color.push(RAW.clone());
    });
  }

  protected buildTray(): void {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.05, 0.46), new THREE.MeshStandardMaterial({ color: '#d7b07a', roughness: 0.6 }));
    tray.position.set(0, COUNTER_TOP + 0.07, TRAY_Z); tray.castShadow = true; tray.receiveShadow = true;
    this.scene.add(tray);
    for (let k = 0; k < BAL.trayMax; k++) {
      const s = new THREE.Mesh(this.senbeiGeo, this.trayMat.normal);
      s.scale.set(0.6, 0.8, 0.6); s.castShadow = true; s.visible = false;
      s.position.copy(this.traySlot(k));
      s.rotation.set(0.05 * Math.sin(k * 3), k * 0.7, 0.06 * Math.cos(k * 2));
      this.scene.add(s);
      this.trayItems.push(s);
    }
  }
  protected traySlot(k: number): THREE.Vector3 { return new THREE.Vector3(-0.62 + k * 0.248, COUNTER_TOP + 0.115 + (k % 2) * 0.012, TRAY_Z + (k % 2 ? 0.04 : -0.04)); }

  protected loadDeer(): void {
    for (const kind of ['fawn', 'doe', 'stag'] as const) for (const d of ['l', 'r']) for (let i = 0; i < 4; i++) this.deerTex[`${kind}_${d}_${i}`] = loadTex(`${ASSET}/deer-walk/${kind}_${d}_${i}.png`);
    for (const k of ['stag_front', 'stag_wink']) this.deerTex[k] = loadTex(`${ASSET}/bake/${k}.png`);
    this.disposables.push(...Object.values(this.deerTex));
    if (!this.tower && this.level.sneaks?.length) {
      // いたずら顔の絵は、左を向いている。左から来るときは左右を反転する
      const l = loadTex(`${ASSET}/bake/stag_sneak.png`), r = l.clone();
      r.repeat.x = -1; r.offset.x = 1; r.needsUpdate = true;
      this.sneakTex = { l, r };
      this.disposables.push(l, r);
    }
    this.sneak = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08 }));
    this.sneak.center.set(0.5, 0.02); this.sneak.visible = false;
    this.sneakShadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.2, depthWrite: false }));
    this.sneakShadow.rotation.x = -Math.PI / 2; this.sneakShadow.scale.set(1.4, 0.6, 1); this.sneakShadow.visible = false;
    this.scene.add(this.sneak, this.sneakShadow);
  }

  // ---- 位置 ----
  plateCenter(i: number): THREE.Vector3 { return new THREE.Vector3(this.plateX[i], GRIDDLE_TOP, PLATE_Z); }
  spotPos(spot: number): THREE.Vector3 { return new THREE.Vector3(SPOT_X[spot], 0, SPOT_Z); }
  /** 画面の上の位置(px。host の左上から) */
  toScreen(p: THREE.Vector3): { x: number; y: number } {
    const v = this.tmpV.copy(p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.host.clientWidth, y: (-v.y * 0.5 + 0.5) * this.host.clientHeight };
  }
  deerHeight(kind: DeerKind): number { return DEER_H[kind]; }

  /** タップした所が、どの鉄板・どの鹿か(画面の位置で決める) */
  pick(x: number, y: number, run: BakeRun): { plate: number } | { spot: number } | { sneak: true } | null {
    // くいしんぼう鹿がいちばん先(お客の鹿の手前にいるので)。指で押しやすいよう、絵より少し広く
    if (run.sneak && this.sneakAt) {
      const p = this.sneakAt;
      const a = this.toScreen(new THREE.Vector3(p.x - 0.7, p.y + 0.1, p.z)), b = this.toScreen(new THREE.Vector3(p.x + 0.7, p.y + SNEAK_H + 0.35, p.z));
      if (x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return { sneak: true };
    }
    for (let i = 0; i < this.plateX.length; i++) {
      const c = this.plateCenter(i), o = this.toScreen(c);
      const ex = this.toScreen(c.clone().add(new THREE.Vector3(0.5, 0, 0))), ez = this.toScreen(c.clone().add(new THREE.Vector3(0, 0, 0.5)));
      const rx = Math.abs(ex.x - o.x), ry = Math.max(Math.abs(ez.y - o.y), rx * 0.45);
      if (((x - o.x) / rx) ** 2 + ((y - o.y) / ry) ** 2 <= 1) return { plate: i };
    }
    for (let s = 0; s < 3; s++) {
      const d = run.spots[s];
      if (!d) continue;
      const p = this.spotPos(s), h = DEER_H[d.kind];
      const a = this.toScreen(new THREE.Vector3(p.x - 0.5, COUNTER_TOP, p.z)), b = this.toScreen(new THREE.Vector3(p.x + 0.5, h + 0.55, p.z));
      if (x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x) && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return { spot: s };
    }
    return null;
  }

  protected resize(): void {
    const w = this.host.clientWidth || 360, h = this.host.clientHeight || 640;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // 鉄板の列(と台の左右)が、横に収まる距離から見る。縦長の画面ほど引いて見る
    // 鉄板は見る中心より手前(カメラ寄り)にあるので、その近さ(toward)を足した距離にする
    const half = 1.62, tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect;
    const pitch = THREE.MathUtils.degToRad(36);
    const target = new THREE.Vector3(0, 0.85, -1.15);
    const toward = (GRIDDLE_TOP - target.y) * Math.sin(pitch) + (PLATE_Z - target.z) * Math.cos(pitch);
    const dist = Math.max(4.6, half / tanH + toward);
    this.camera.position.set(0, target.y + Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
    this.camera.lookAt(target);
    // 上のHUDと下のSpraの欄に重ならないよう、絵を少し下へずらす
    this.camera.setViewOffset(w, h, 0, -Math.round(h * 0.035), w, h);
    this.camera.updateProjectionMatrix();
  }

  // ---- 演出 ----
  protected emit(mat: keyof BakeView['pmat'], at: THREE.Vector3, o: { n?: number; spread?: number; v?: THREE.Vector3; vr?: number; size?: number; life?: number; grow?: number; gravity?: number; color?: string; opacity?: number }): void {
    const n = o.n ?? 1;
    for (let k = 0; k < n; k++) {
      if (this.particles.length > 220) return;
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
      // 手前(カメラ)へは、あまり飛ばさない(近づくと大きく見えすぎる)
      const v = (o.v?.clone() ?? new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * vr, Math.random() * vr * 0.5, (Math.random() - 0.5) * vr * 0.35));
      this.particles.push({ s, v, life: 0, max: (o.life ?? 1) * (0.7 + Math.random() * 0.6), grow: o.grow ?? 0, spin: (Math.random() - 0.5) * 4, gravity: o.gravity ?? 0, base: m.opacity });
    }
  }
  protected fly(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, dur: number, h: number, spin: number, done?: () => void, spinZ = 0) {
    obj.position.copy(from);
    this.scene.add(obj);
    this.flyers.push({ obj, from: from.clone(), to: to.clone(), t: 0, dur, h, spin, spinZ, done });
  }
  protected flyingSenbei(gokujo: boolean, scale = 1): THREE.Mesh {
    const m = new THREE.Mesh(this.senbeiGeo, gokujo ? this.trayMat.gokujo : this.trayMat.normal);
    m.scale.setScalar(scale); m.castShadow = true;
    return m;
  }

  /** ルールの出来事に合わせた、絵の動き */
  onEvent(e: BakeEvent, run: BakeRun): void {
    const c = e.plate !== undefined ? this.plateCenter(e.plate) : null;
    const deer = e.deer !== undefined ? run.spots.find(d => d?.id === e.deer) ?? null : null;
    switch (e.kind) {
      case 'pour':
        this.emit('soft', c!.clone().setY(GRIDDLE_TOP + 0.08), { n: 6, spread: 0.4, v: new THREE.Vector3(0, 0.6, 0), vr: 0.3, size: 0.32, life: 0.9, grow: 0.6, opacity: 0.55 });
        break;
      case 'flip':
        this.side1Color[e.plate!].copy(this.senbeiMats[e.plate!][2].color);
        if (e.q === 'perfect') this.emit('star', c!.clone().setY(GRIDDLE_TOP + 0.5), { n: 10, spread: 0.3, vr: 2.2, size: 0.16, life: 0.7, gravity: 3 });
        break;
      case 'collect': {
        // 同じフレームで、もう鹿にわたしていることもある(そのときは台の先頭へ飛ぶ)
        const k = clamp(run.tray.length - 1, 0, BAL.trayMax - 1);
        const fl = this.flyingSenbei(!!e.gokujo, 1);
        this.trayItems[k].userData.hold = true;
        this.fly(fl, c!.clone().setY(GRIDDLE_TOP + 0.04), this.traySlot(k), 0.42, 0.55, Math.PI * 2, () => { this.trayItems[k].userData.hold = false; });
        if (e.gokujo) this.emit('star', c!.clone().setY(GRIDDLE_TOP + 0.4), { n: 14, spread: 0.3, vr: 2.6, size: 0.18, life: 0.8, gravity: 3 });
        break;
      }
      case 'smoke':
        break;
      case 'burnt':
        this.emit('soft', c!.clone().setY(GRIDDLE_TOP + 0.1), { n: 10, spread: 0.4, v: new THREE.Vector3(0, 0.8, 0.2), vr: 0.4, size: 0.34, life: 1.2, grow: 0.7, color: '#3c3a38', opacity: 0.6 });
        this.shake = Math.max(this.shake, 0.4);
        break;
      case 'discard': {
        // 焦げは、横へ ぽいっ と捨てる
        const fl = new THREE.Mesh(this.senbeiGeo, new THREE.MeshStandardMaterial({ color: BURNT, roughness: 0.9 }));
        this.fly(fl, c!.clone().setY(GRIDDLE_TOP + 0.04), new THREE.Vector3(this.plateX[e.plate!] + (e.plate! < 1 ? -2.4 : 2.4), 0.2, PLATE_Z + 1.2), 0.45, 0.6, Math.PI * 3, () => { this.scene.remove(fl); (fl.material as THREE.Material).dispose(); });
        break;
      }
      case 'serve': {
        if (!deer) break;
        const from = this.traySlot(0), to = this.spotPos(deer.spot).setY(DEER_H[deer.kind] * 0.7).add(new THREE.Vector3(0, 0, 0.2));
        const fl = this.flyingSenbei(!!e.gokujo, 0.6);
        this.fly(fl, from, to, 0.32, 0.35, Math.PI, () => {
          this.scene.remove(fl);
          this.emit('crumb', to, { n: 8, spread: 0.2, vr: 1.6, size: 0.06, life: 0.6, gravity: 4 });
        });
        break;
      }
      case 'happy':
        if (deer) this.emit('heart', this.spotPos(deer.spot).setY(DEER_H[deer.kind] + 0.1), { n: 5, spread: 0.5, v: new THREE.Vector3(0, 0.8, 0), vr: 0.5, size: 0.22, life: 1.3 });
        if (deer && e.gold) this.emit('star', this.spotPos(deer.spot).setY(DEER_H[deer.kind]), { n: 16, spread: 0.6, vr: 2.6, size: 0.2, life: 1, gravity: 2.5 });
        break;
      case 'angry':
        if (deer) this.emit('soft', this.spotPos(deer.spot).setY(DEER_H[deer.kind] + 0.1), { n: 4, spread: 0.3, v: new THREE.Vector3(0, 0.6, 0), size: 0.25, life: 0.8, color: '#ff8a7a', opacity: 0.7 });
        break;
      case 'steal': {
        // 台の端のせんべいが、くいしんぼう鹿の口へ
        const at = this.sneakAt ?? new THREE.Vector3(0, 0, SNEAK_Z);
        const from = this.traySlot(clamp(e.plate ?? 0, 0, BAL.trayMax - 1)), to = at.clone().setY(at.y + SNEAK_H * 0.55).add(new THREE.Vector3(0, 0, 0.15));
        const fl = this.flyingSenbei(!!e.gokujo, 0.6);
        this.fly(fl, from, to, 0.28, 0.25, Math.PI, () => this.emit('crumb', to, { n: 10, spread: 0.2, vr: 1.6, size: 0.06, life: 0.6, gravity: 4 }));
        this.shake = Math.max(this.shake, 0.25);
        break;
      }
      case 'shoo':
        if (this.sneakAt) this.emit('soft', this.sneakAt.clone().setY(0.25), { n: 8, spread: 0.6, v: new THREE.Vector3(0, 0.4, 0), vr: 0.8, size: 0.32, life: 0.7, grow: 0.8, color: '#e8dcc4', opacity: 0.8 });
        break;
      case 'premium':
        this.emit('star', new THREE.Vector3(0, GRIDDLE_TOP + 0.8, PLATE_Z), { n: 30, spread: 1.4, vr: 3, size: 0.22, life: 1.4, gravity: 2.5, color: '#e8b8ff' });
        break;
    }
  }

  // ---- 毎フレーム ----
  render(run: BakeRun, dt: number): void {
    this.time += dt;
    // 鉄板とせんべい
    run.plates.forEach((p, i) => this.paintPlate(p, i, run, dt));
    // 台のせんべい
    this.trayItems.forEach((m, k) => {
      const s = run.tray[k];
      m.visible = !!s && !m.userData.hold;
      if (s) m.material = s.gokujo ? this.trayMat.gokujo : this.trayMat.normal;
    });
    // くいしんぼう鹿にねらわれている台の端のせんべいは、赤く点滅
    const sn = run.sneak;
    if (sn && (sn.phase === 'aim' || sn.phase === 'eat') && run.tray.length && run.phase === 'running') {
      const k = sn.side < 0 ? 0 : run.tray.length - 1;
      this.blinkMat.emissiveIntensity = 0.35 + 0.35 * Math.sin(this.time * 16);
      this.trayItems[k].material = this.blinkMat;
    }
    if (run.tray.some(s => s.gokujo) && Math.random() < dt * 3) {
      const k = run.tray.findIndex(s => s.gokujo);
      this.emit('star', this.traySlot(k).add(new THREE.Vector3(0, 0.08, 0)), { n: 1, spread: 0.2, size: 0.12, life: 0.6, vr: 0.3 });
    }
    // 鹿
    this.paintDeer(run.deer, dt);
    this.paintSneak(run);
    for (const r of this.rings) r.uniforms.uTime.value = this.time;
    this.finishFrame(dt);
  }

  /** 毎フレームの共通部分: 背景の鹿・飛んでいるもの・粒・カメラのゆれ・描く(TowerView も使う) */
  protected finishFrame(dt: number): void {
    for (const b of this.bgDeer) b.s.position.y = Math.max(0, Math.sin(this.time * 1.3 + b.ph)) * 0.015;
    // 飛んでいるせんべい
    this.flyers = this.flyers.filter(f => {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.obj.position.lerpVectors(f.from, f.to, k);
      f.obj.position.y += Math.sin(Math.PI * k) * f.h;
      f.obj.rotation.x = f.spin * k;
      if (f.spinZ) f.obj.rotation.z = f.spinZ * k;
      if (k >= 1) { this.scene.remove(f.obj); f.done?.(); return false; }
      return true;
    });
    // 粒
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
    // カメラのゆれ(焦げたとき)
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.06, sy = (Math.random() - 0.5) * this.shake * 0.06;
    this.camera.position.x += sx; this.camera.position.y += sy;
    this.renderer.render(this.scene, this.camera);
    this.camera.position.x -= sx; this.camera.position.y -= sy;
  }

  protected paintPlate(p: Plate, i: number, run: BakeRun, dt: number): void {
    const lv = this.level, s = this.senbei[i], mats = this.senbeiMats[i], ring = this.rings[i], c = this.plateCenter(i);
    const glow = this.plateGlow[i].material as THREE.MeshBasicMaterial;
    glow.opacity = p.state === 'empty' && run.phase === 'running' ? 0.1 + 0.08 * Math.sin(this.time * 4 + i) : 0;
    const cooking = p.state === 'side1' || p.state === 'side2';
    ring.uniforms.uOn.value = cooking && run.phase === 'running' ? 1 : 0;
    ring.uniforms.uProg.value = cooking ? clamp(p.t / lv.cook.burn, 0, 1) : 0;
    s.visible = p.state !== 'empty';
    s.scale.set(1, 1, 1);
    s.position.set(c.x, GRIDDLE_TOP + 0.03, c.z);
    s.rotation.set(0, i * 1.3, 0);
    const [side, top, bottom] = mats;
    for (const m of mats) m.emissiveIntensity = 0;
    switch (p.state) {
      case 'pour': {
        const k = ease(p.t / BAL.pour);
        s.scale.set(0.3 + 0.7 * k, 0.4 + 0.6 * k, 0.3 + 0.7 * k);
        top.color.copy(RAW); bottom.color.copy(RAW); side.color.copy(RAW);
        break;
      }
      case 'side1':
        doneColor(bottom.color, p.t, lv);
        // 生の上の面は、焼けるにつれて少しだけ乾いた色に
        top.color.copy(RAW).lerp(LIGHT, clamp(p.t / lv.cook.burn, 0, 1) * 0.35);
        side.color.copy(top.color).lerp(bottom.color, 0.5);
        break;
      case 'flip': {
        const k = clamp(p.t / BAL.flip, 0, 1);
        s.position.y += Math.sin(Math.PI * k) * 0.62;
        s.rotation.x = Math.PI * ease(k);
        s.rotation.z = Math.sin(Math.PI * k) * 0.25;
        top.color.copy(RAW).lerp(LIGHT, 0.2);
        bottom.color.copy(this.side1Color[i]);
        side.color.copy(top.color).lerp(bottom.color, 0.5);
        break;
      }
      case 'side2':
        s.rotation.x = Math.PI;
        // 上を向いているのは、先に焼いた面(bottom)。下で焼けているのは top
        bottom.color.copy(this.side1Color[i]);
        doneColor(top.color, p.t, lv);
        side.color.copy(top.color).lerp(bottom.color, 0.5);
        break;
      case 'burnt':
      case 'discard':
        s.visible = p.state === 'burnt';
        for (const m of mats) m.color.copy(BURNT);
        if (p.state === 'burnt' && Math.random() < dt * 3) this.emit('soft', c.clone().setY(GRIDDLE_TOP + 0.1), { n: 1, spread: 0.3, v: new THREE.Vector3(0, 0.6, 0.15), vr: 0.2, size: 0.26, life: 1.1, grow: 0.5, color: '#5a5652', opacity: 0.4 });
        break;
    }
    // 金色(こんがり)の間は、せんべいが少し光る
    if (cooking) {
      const q = run.quality(p.t), inOk = p.t >= lv.cook.ok;
      if (q === 'perfect') for (const m of mats) { m.emissive.set('#ffb040'); m.emissiveIntensity = 0.12 + 0.08 * Math.sin(this.time * 18); }
      // ゆげ・煙
      const smoking = p.smoking;
      if (Math.random() < dt * (smoking ? 14 : inOk ? 4 : 2.5)) {
        this.emit('soft', c.clone().setY(GRIDDLE_TOP + 0.08), {
          n: 1, spread: 0.45, v: new THREE.Vector3(0, smoking ? 0.9 : 0.55, 0), vr: 0.15, size: smoking ? 0.34 : 0.24, life: smoking ? 1.4 : 1.0, grow: 0.7,
          color: smoking ? (p.t > (lv.cook.smoke + lv.cook.burn) / 2 ? '#5a5652' : '#9a9590') : '#ffffff', opacity: smoking ? 0.6 : 0.35,
        });
      }
    }
  }

  protected paintDeer(list: Deer[], dt: number): void {
    const alive = new Set<number>();
    for (const d of list) {
      alive.add(d.id);
      let ds = this.deerSprites.get(d.id);
      if (!ds) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.08 }));
        s.center.set(0.5, 0.02);
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.18, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1.3, 0.6, 1);
        this.scene.add(s, shadow);
        ds = { s, shadow, lastPhase: '', dir: d.from < 0 ? 'r' : 'l', leaveFrom: null };
        this.deerSprites.set(d.id, ds);
      }
      this.placeDeer(d, ds, dt);
    }
    for (const [id, ds] of this.deerSprites) {
      if (alive.has(id)) continue;
      this.scene.remove(ds.s, ds.shadow);
      ds.s.material.dispose(); (ds.shadow.material as THREE.Material).dispose(); ds.shadow.geometry.dispose();
      this.deerSprites.delete(id);
    }
  }

  protected placeDeer(d: Deer, ds: DeerSprite, dt: number): void {
    const spot = this.spotPos(d.spot), start = new THREE.Vector3(d.from * 4.8, 0, START_Z), h = DEER_H[d.kind];
    const s = ds.s, mat = s.material;
    let pos = spot.clone(), frame = `${d.kind}_${ds.dir}_0`, sx = 1, sy = 1;
    mat.color.set('#ffffff');
    if (d.phase !== ds.lastPhase) { if (d.phase === 'happy' || d.phase === 'angry') ds.leaveFrom = spot.clone(); ds.lastPhase = d.phase; }
    switch (d.phase) {
      case 'walk': {
        const k = clamp(d.t / BAL.walk, 0, 1);
        pos = start.clone().lerp(spot, ease(k));
        ds.dir = spot.x >= start.x ? 'r' : 'l';
        frame = `${d.kind}_${ds.dir}_${Math.floor(d.t * 9) % 4}`;
        pos.y = Math.abs(Math.sin(d.t * 9)) * 0.04;
        break;
      }
      case 'wait': {
        frame = d.kind === 'stag' ? 'stag_front' : `${d.kind}_${ds.dir}_0`;
        // 来たときの「おじぎ」(奈良の鹿は、おじぎをして せんべいをねだる)
        const bow = d.got === 0 && d.t < 1.0 ? Math.sin(clamp(d.t / 1.0, 0, 1) * Math.PI * 2) : 0;
        sy = 1 - Math.max(0, bow) * 0.14; sx = 1 + Math.max(0, bow) * 0.05;
        sy += Math.sin(this.time * 2.4 + d.id) * 0.012;
        // 待ちくたびれてきたら、そわそわ
        const imp = d.waited / d.patience;
        if (imp > 0.65) pos.x += Math.sin(this.time * (imp > 0.85 ? 34 : 18)) * 0.025 * (imp > 0.85 ? 2 : 1);
        if (imp > 0.85) mat.color.set('#ffd9d2');
        break;
      }
      case 'eat':
        frame = d.kind === 'stag' ? 'stag_front' : `${d.kind}_${ds.dir}_0`;
        sy = 1 - Math.abs(Math.sin(d.t * 22)) * 0.06;
        break;
      case 'happy':
      case 'angry': {
        const happy = d.phase === 'happy', hold = happy ? 0.65 : 0.5;
        if (d.t < hold) {
          frame = d.kind === 'stag' ? (happy ? 'stag_wink' : 'stag_front') : `${d.kind}_${ds.dir}_0`;
          if (happy) pos.y = Math.abs(Math.sin((d.t / hold) * Math.PI * 2)) * 0.22;
          else { pos.x += Math.sin(d.t * 50) * 0.05; mat.color.set('#ffc0b4'); }
        } else {
          const k = clamp((d.t - hold) / ((happy ? BAL.happy : BAL.angry) - hold), 0, 1);
          pos = (ds.leaveFrom ?? spot).clone().lerp(start, ease(k));
          const dir = start.x > spot.x ? 'r' : 'l';
          frame = `${d.kind}_${dir}_${Math.floor(d.t * 10) % 4}`;
          pos.y = Math.abs(Math.sin(d.t * 10)) * 0.04;
          if (!happy) mat.color.set('#ffd0c6');
        }
        break;
      }
    }
    const tex = this.deerTex[frame];
    if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
    const img = tex.image as { width?: number; height?: number } | undefined;
    const aspect = img?.width && img.height ? img.width / img.height : 1;
    s.scale.set(h * aspect * sx, h * sy, 1);
    s.position.copy(pos);
    ds.shadow.position.set(pos.x, 0.01, pos.z);
  }

  protected paintSneak(run: BakeRun): void {
    const sn = run.sneak, s = this.sneak;
    if (!sn || !this.sneakTex) { s.visible = this.sneakShadow.visible = false; this.sneakAt = null; return; }
    const side = sn.side, start = new THREE.Vector3(side * 4.4, 0, -2.4), stand = new THREE.Vector3(side * SNEAK_X, 0, SNEAK_Z);
    let pos = stand.clone(), sx = 1, sy = 1, face: 'l' | 'r' = side > 0 ? 'l' : 'r';
    const mat = s.material;
    mat.color.set('#ffffff');
    switch (sn.phase) {
      case 'walk': {
        // こそこそ: 小さく、すばやく跳ねながら近づく
        const k = ease(sn.t / BAL.sneakWalk);
        pos = start.clone().lerp(stand, k);
        // 台に近づいたら、前足をかけて のり出す
        pos.y = Math.abs(Math.sin(sn.t * 12)) * 0.06 * (1 - k) + ease((k - 0.7) / 0.3) * SNEAK_LIFT;
        break;
      }
      case 'aim':
        // 身をかがめて、ねらう(ぷるぷる)
        sy = 0.94 + Math.sin(this.time * 30) * 0.03; sx = 1.04;
        pos.x -= side * 0.08; pos.y = SNEAK_LIFT;
        mat.color.set(Math.sin(this.time * 14) > 0 ? '#ffd2c8' : '#ffffff');
        break;
      case 'eat':
        pos.x -= side * 0.18; pos.y = SNEAK_LIFT + 0.05;
        sy = 1 - Math.abs(Math.sin(sn.t * 20)) * 0.07;
        break;
      case 'flee':
      case 'leave': {
        if (sn.t < 0.05) this.sneakFrom.copy(this.sneakAt ?? stand);
        const dur = sn.phase === 'flee' ? BAL.sneakFlee : BAL.sneakLeave, k = ease(sn.t / dur);
        pos = this.sneakFrom.clone().lerp(start, k);
        // 逃げるときは、大きく跳ねて、向こうを向く(台から下りる)
        const lift = this.sneakFrom.y * (1 - ease(sn.t / 0.25));
        pos.y = lift + Math.abs(Math.sin(sn.t * (sn.phase === 'flee' ? 9 : 10))) * (sn.phase === 'flee' ? 0.35 : 0.05);
        face = side > 0 ? 'r' : 'l';
        break;
      }
    }
    const tex = this.sneakTex[face];
    if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
    const img = tex.image as { width?: number; height?: number } | undefined;
    const aspect = img?.width && img.height ? img.width / img.height : 0.92;
    s.scale.set(SNEAK_H * aspect * sx, SNEAK_H * sy, 1);
    s.position.copy(pos);
    s.visible = true;
    this.sneakShadow.visible = pos.y < 0.2;
    this.sneakShadow.position.set(pos.x, 0.012, pos.z);
    this.sneakAt = (this.sneakAt ?? new THREE.Vector3()).copy(pos);
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
