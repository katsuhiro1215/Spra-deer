// WORLD 6「鹿ずもう」の3Dの絵: 奈良公園の土俵・2頭の鹿・応援のSpra・土ぼこり・カメラ。
// 縦の画面に合わせて、押し合う向き(X)を ななめに見る(自分の鹿が手前、相手が奥)。
import * as THREE from 'three';
import { PLAYER_DEER, type SumoLevel, type SumoScene } from './levels.ts';
import { make3dDeer, type DeerActor } from './deer.ts';
import type { Bout, BoutEvent } from './sim.ts';

const ASSET = '/assets';
const TEAM_ME = 0x4f9a5c, TEAM_THEM = 0xd0563c;
/** カメラの向き(Y回転、ラジアン)。0 = 真横から。マイナス = 自分の鹿の後ろへまわる */
const CAM_YAW = -0.5;

/** 天気と時間ごとの、空・霧・光 */
const SCENES: Record<SumoScene, { sky: number; fog: number; fogNear: number; hemi: number; hemiI: number; sun: number; sunI: number; sunY: number; exposure: number }> = {
  day: { sky: 0xbfdcef, fog: 0xcfe3d6, fogNear: 22, hemi: 0xfff4d9, hemiI: 2.4, sun: 0xffedcc, sunI: 3.0, sunY: 10, exposure: 1.15 },
  rain: { sky: 0x9aa8b0, fog: 0xa4b0b4, fogNear: 12, hemi: 0xdfe6ea, hemiI: 2.0, sun: 0xdde4ea, sunI: 1.1, sunY: 10, exposure: 1.05 },
  evening: { sky: 0xf2b48a, fog: 0xeab48e, fogNear: 18, hemi: 0xffd2a6, hemiI: 2.0, sun: 0xffa860, sunI: 2.8, sunY: 4, exposure: 1.1 },
  night: { sky: 0x1c2442, fog: 0x1c2442, fogNear: 12, hemi: 0x8090c0, hemiI: 0.9, sun: 0xa8b8e8, sunI: 0.7, sunY: 10, exposure: 1.2 },
};

export class SumoView {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  private player!: DeerActor;
  private opponent!: DeerActor;
  private dust: THREE.Mesh[] = [];
  private spra: THREE.Mesh;
  private spraTex: THREE.Texture[] = [];
  private observer: ResizeObserver;
  private time = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private disposables: { dispose(): void }[] = [];

  constructor(private host: HTMLElement, private level: SumoLevel) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    host.append(r.domElement);
    // 天気と時間(昼・雨・夕方・夜)
    const look = SCENES[level.scene];
    this.scene.background = new THREE.Color(look.sky);
    this.scene.fog = new THREE.Fog(look.fog, look.fogNear, 52);
    r.toneMappingExposure = look.exposure;
    this.scene.add(new THREE.HemisphereLight(look.hemi, 0x6d8060, look.hemiI));
    const sun = new THREE.DirectionalLight(look.sun, look.sunI);
    sun.position.set(-4, look.sunY, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.environment();
    if (level.scene === 'night') this.candles();
    if (level.scene === 'rain') this.makeRain();
    this.makeFxPools();
    // 応援のSpra(土俵の外、奥のほう)
    for (const f of ['spra_idle', 'spra_hooray', 'spra_trouble']) {
      const t = new THREE.TextureLoader().load(`${ASSET}/bake/${f}.png`); t.colorSpace = THREE.SRGBColorSpace; this.spraTex.push(t);
    }
    const sm = new THREE.MeshBasicMaterial({ map: this.spraTex[0], transparent: true, alphaTest: 0.3, toneMapped: false });
    this.spra = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), sm);
    this.spra.position.set(-2.4, 0.75, -5.6);
    this.scene.add(this.spra);
    this.disposables.push(sm, ...this.spraTex);
    this.makeDeer();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  /** 夜(燈花会): 土俵のまわりに ろうそくの灯り */
  private candles() {
    const glass = new THREE.MeshBasicMaterial({ color: 0xffd58a });
    const cup = new THREE.CylinderGeometry(0.11, 0.09, 0.22, 10);
    this.disposables.push(glass, cup);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, r = 4.9 + (i % 2) * 0.35;
      // カメラ側(手前)には置かない(大きく写って じゃまになる)
      if (Math.cos(a) * Math.sin(CAM_YAW) + Math.sin(a) * Math.cos(CAM_YAW) > 0.1) continue;
      const c = new THREE.Mesh(cup, glass);
      c.position.set(Math.cos(a) * r, 0.0, Math.sin(a) * r);
      this.scene.add(c);
    }
    for (const [x, z] of [[-3.5, 3.5], [3.5, 3.5], [-3.5, -3.5], [3.5, -3.5]]) {
      const p = new THREE.PointLight(0xffb45c, 9, 9, 1.6);
      p.position.set(x, 1.2, z);
      this.scene.add(p);
    }
  }

  /** 雨: 落ちてくる雨のすじ */
  private rain: THREE.LineSegments | null = null;
  private makeRain() {
    const n = 500, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 24 - 12, z = (Math.sin(i * 78.233) * 12345.678 % 1) * 20 - 10, y = (i * 0.37) % 24;
      pos.set([x, y, z, x + 0.05, y - 0.5, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.55 });
    this.rain = new THREE.LineSegments(geo, mat);
    this.scene.add(this.rain);
    this.disposables.push(geo, mat);
  }

  private makeDeer() {
    this.player = make3dDeer(PLAYER_DEER, TEAM_ME);
    this.opponent = make3dDeer(this.level.opponents[0], TEAM_THEM);
    this.opponent.root.rotation.y = Math.PI;
    this.scene.add(this.player.root, this.opponent.root);
  }

  private mesh(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, shadow = true) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true;
    this.scene.add(m);
    this.disposables.push(geo, mat);
    return m;
  }

  private environment() {
    // 土俵(砂と俵)
    this.mesh(new THREE.CylinderGeometry(4.55, 4.75, 0.28, 80), 0xb4a071, 0, -0.15, 0);
    this.mesh(new THREE.CylinderGeometry(4.38, 4.4, 0.04, 80), 0xdbbd86, 0, 0.015, 0);
    const straw = this.mesh(new THREE.TorusGeometry(4.15, 0.115, 8, 100), 0xa9915e, 0, 0.1, 0); straw.rotation.x = Math.PI / 2;
    const ground = this.mesh(new THREE.PlaneGeometry(140, 140), 0x9fbf7a, 0, -0.31, 0, false); ground.rotation.x = -Math.PI / 2;
    // 仕切り線
    for (const x of [-0.55, 0.55]) this.mesh(new THREE.BoxGeometry(0.055, 0.01, 0.9), 0xf5e3b9, x, 0.049, 0, false);
    for (let i = 0; i < 54; i++) {
      const a = (i / 54) * Math.PI * 2;
      const m = this.mesh(new THREE.BoxGeometry(0.028, 0.14, 0.23), 0xd2bb84, Math.cos(a) * 4.15, 0.11, Math.sin(a) * 4.15, false);
      m.rotation.y = -a;
    }
    // 奥の木々(奈良公園)
    for (let i = 0; i < 22; i++) {
      const a = -1.0 + i * 0.143, rr = 11 + (i % 3) * 2.2; // 奥の半分だけ(手前はカメラ)
      const x = Math.sin(a) * rr, z = -Math.cos(a) * rr;
      this.mesh(new THREE.CylinderGeometry(0.16, 0.26, 2.8, 7), 0x7d6a4f, x, 1.1, z);
      const leaf = this.mesh(new THREE.IcosahedronGeometry(1.9 + (i % 3) * 0.2, 1), [0x6f9a5a, 0x86a868, 0x9db574][i % 3], x, 3.3, z);
      leaf.scale.y = 1.25;
    }
    // 石灯籠
    for (const [x, z] of [[-5.6, -3.2], [5.6, -3.2], [-6.4, 2.6]]) {
      this.mesh(new THREE.BoxGeometry(0.46, 0.18, 0.46), 0x989c87, x, -0.05, z);
      this.mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.85, 6), 0xa8ac97, x, 0.4, z);
      this.mesh(new THREE.BoxGeometry(0.52, 0.48, 0.52), 0xc9ccb0, x, 1, z);
      const cap = this.mesh(new THREE.ConeGeometry(0.58, 0.3, 4), 0x858e78, x, 1.4, z); cap.rotation.y = Math.PI / 4;
    }
    // 低い柵
    for (let i = 0; i < 12; i++) this.mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.65, 5), 0x807d5b, -8 + i * 1.5, 0.05, -6.5);
    this.mesh(new THREE.BoxGeometry(17, 0.07, 0.08), 0x8f8862, 0.25, 0.2, -6.5);
    // 土ぼこり
    for (let i = 0; i < 12; i++) { const p = this.mesh(new THREE.IcosahedronGeometry(0.08, 0), 0xe6d3aa, 0, -2, 0, false); this.dust.push(p); }
  }

  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** 勝ち抜きで、相手が かわったら 鹿を作りなおす */
  private shownRound = 0;

  // ---- 激しい動き(演出だけ。勝負のしくみは変えない) ----
  /** 鹿ごとの動き: back=下がっている量、lungeT=突っこみの経過(-1=なし)、lungeK=強さ、knock=押された量、lift=前足が浮く量 */
  private moves = { player: { back: 0, lungeT: -1, lungeK: 0, knock: 0, lift: 0 }, opponent: { back: 0, lungeT: -1, lungeK: 0, knock: 0, lift: 0 } };
  /** いなされて、相手が前のめりに横へ よろける(経過秒。-1=なし) */
  private whiffT = -1;
  /** 画面のゆれ・一瞬の止まり(秒)・スローモーション(秒) */
  private shake = 0;
  stop = 0;
  private slow = 0;
  /** 吹っ飛ぶ鹿(押し出し・勝ち抜きの負け) */
  private flyers: { actor: DeerActor; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; rot: number; landed: boolean; t: number; temp: boolean; yaw: number }[] = [];
  private sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  private puffs: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
  /** 次の相手が奥から歩いて入ってくる(勝ち抜き) */
  private enterT = -1;

  private makeFxPools() {
    const sg = new THREE.OctahedronGeometry(0.06, 0), sm = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
    const pg = new THREE.IcosahedronGeometry(0.16, 1), pm = new THREE.MeshBasicMaterial({ color: 0xeee0c0, transparent: true, opacity: 0.42, depthWrite: false });
    this.disposables.push(sg, sm, pg, pm);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; this.scene.add(m); this.sparks.push({ m, v: new THREE.Vector3(), life: 0 }); }
    for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(pg, pm); m.visible = false; this.scene.add(m); this.puffs.push({ m, v: new THREE.Vector3(), life: 0 }); }
  }
  /** 角がぶつかった火花 */
  private burst(x: number, y: number, z: number, n: number, power: number) {
    let k = 0;
    for (const s of this.sparks) {
      if (k >= n) break;
      if (s.life > 0) continue;
      const a = k * 2.399 + this.time * 7, up = 0.5 + ((k * 37) % 10) / 10;
      s.v.set(Math.cos(a) * power * 0.8, up * power, Math.sin(a) * power * 0.8);
      s.m.position.set(x, y, z); s.m.visible = true; s.life = 0.35 + (k % 4) * 0.07; k++;
    }
  }
  /** 足もとの土ぼこり(dir = 飛ぶ向き) */
  private dustAt(x: number, z: number, n: number, dir: number, power = 1) {
    let k = 0;
    for (const p of this.puffs) {
      if (k >= n) break;
      if (p.life > 0) continue;
      const a = k * 1.7;
      p.v.set(dir * (0.6 + (k % 3) * 0.5) * power, (0.6 + (k % 2) * 0.5) * power, Math.sin(a) * 1.2 * power);
      p.m.position.set(x + Math.cos(a) * 0.3, 0.12, z + Math.sin(a) * 0.3); p.m.visible = true; p.life = 0.6 + (k % 3) * 0.15; p.m.scale.setScalar(0.6); k++;
    }
  }
  private lunge(who: 'player' | 'opponent', k: number) { const m = this.moves[who]; m.lungeT = 0; m.lungeK = k; }
  private hit(who: 'player' | 'opponent', knock: number, lift: number) { const m = this.moves[who]; m.knock = Math.max(m.knock, knock); m.lift = Math.max(m.lift, lift); }
  /** 押し出された鹿を、土俵の外へ吹っ飛ばす */
  private launch(who: 'player' | 'opponent', b: Bout, temp: boolean) {
    const actor = who === 'player' ? this.player : this.opponent, dir = who === 'player' ? -1 : 1;
    const p = actor.root.position;
    this.flyers.push({ actor, x: p.x, y: 0, z: p.z, vx: dir * 5.2, vy: 8.5, vz: -0.8, spin: dir * -7.5, rot: 0, landed: false, t: 0, temp, yaw: actor.root.rotation.y });
    this.slow = 1.1; this.shake = Math.max(this.shake, 0.5); this.stop = 0.14;
    this.burst(p.x - dir * 1.1, 1.6, p.z, 26, 4.5);
    this.dustAt(p.x, p.z, 14, dir, 1.6);
    if (temp) {
      // 勝ち抜き: 吹っ飛んだ鹿は そのまま残し、新しい相手を 作って 奥から歩かせる
      this.opponent = make3dDeer(b.opp, TEAM_THEM);
      this.scene.add(this.opponent.root);
      this.enterT = 0;
    }
  }

  /** 勝負の出来事に合わせて、大きく動かす */
  fx(kind: BoutEvent['kind'], b: Bout): void {
    const c = b.position * 0.72, hx = c, hy = 1.75;
    switch (kind) {
      case 'start': // 立ち合い: 離れたところから走りこんで、ガツン！
        this.lunge('player', 1.4); this.lunge('opponent', 1.4);
        this.burst(hx, hy, 0, 22, 3.5); this.shake = 0.35; this.stop = 0.1;
        this.dustAt(c - 1.6, 0, 6, -1); this.dustAt(c + 1.6, 0, 6, 1);
        break;
      case 'push': this.lunge('player', 0.35); this.hit('opponent', 0.1, 0); break;
      case 'perfect': this.lunge('player', 0.7); this.hit('opponent', 0.25, 0.12); this.burst(hx, hy, 0, 6, 2); this.shake = Math.max(this.shake, 0.08); break;
      case 'charge':
        this.lunge('player', 1.3); this.hit('opponent', 0.9, 0.5);
        this.burst(hx, hy, 0, 22, 4); this.shake = 0.4; this.stop = 0.1; this.dustAt(c + 1.4, 0, 10, 1, 1.3);
        break;
      case 'counter':
        this.lunge('player', 1.2); this.hit('opponent', 1.0, 0.6);
        this.burst(hx, hy, 0, 26, 4.5); this.shake = 0.45; this.stop = 0.12; this.dustAt(c + 1.4, 0, 12, 1, 1.4);
        break;
      case 'parry': this.whiffT = 0; this.shake = Math.max(this.shake, 0.15); this.dustAt(c + 0.5, 0.8, 10, 1, 1.2); break;
      case 'enemy': this.lunge('opponent', 0.5); this.hit('player', 0.25, 0.08); this.burst(hx, hy, 0, 5, 2); break;
      case 'strong': // 下がってから 突進してくる角押し。前足が浮くほど 押される
        this.lunge('opponent', 2.2); this.hit('player', 1.6, 0.95);
        this.burst(hx, hy, 0, 30, 5); this.shake = 0.55; this.stop = 0.13; this.dustAt(c - 1.4, 0, 14, -1, 1.5);
        break;
      case 'feint': this.moves.opponent.back = 0; this.lunge('opponent', 0.2); break;
      case 'round': this.launch('opponent', b, true); break;
      case 'won': if (b.pushedOut) this.launch('opponent', b, false); else this.slow = 0.6; break;
      case 'lost': if (b.pushedOut) this.launch('player', b, false); else this.slow = 0.6; break;
    }
  }

  /** 突っこみの前後の位置(下がって → 前へ → もどる) */
  private static lungeOffset(t: number, k: number): number {
    if (t < 0) return 0;
    if (t < 0.07) return (-t / 0.07) * 0.18 * k;
    if (t < 0.15) return (-0.18 + ((t - 0.07) / 0.08) * 0.78) * k;
    return Math.max(0, 0.6 * (1 - (t - 0.15) / 0.22)) * k;
  }

  render(dt: number, b: Bout): void {
    // スローモーション(押し出しの瞬間)
    if (this.slow > 0) { this.slow -= dt; dt *= 0.35; }
    this.stop = Math.max(0, this.stop - dt);
    this.time += dt;
    if (b.round !== this.shownRound) this.shownRound = b.round; // 鹿の作り直しは launch() で
    const t = this.time, fighting = b.phase === 'playing' || b.phase === 'countdown';
    const c = b.position * 0.72;
    const mp = this.moves.player, mo = this.moves.opponent;
    // 下がる: はっけよいの前は離れて待つ。相手がためる・こちらがためるときは、後ろへ下がって 足でかく
    const countdown = b.phase === 'countdown';
    const wantBackP = countdown ? 1.3 : b.charging ? (b.charge / 1.5) * 0.9 : 0;
    const wantBackO = countdown ? 1.3 : b.enemyState === 'windup' ? b.windupProgress * 1.8 : 0;
    mp.back += (wantBackP - mp.back) * Math.min(1, dt * 6);
    mo.back += (wantBackO - mo.back) * Math.min(1, dt * 6);
    for (const m of [mp, mo]) {
      if (m.lungeT >= 0) { m.lungeT += dt; if (m.lungeT > 0.4) m.lungeT = -1; }
      m.knock *= Math.exp(-dt * 4); m.lift *= Math.exp(-dt * 3.2);
    }
    const lp = SumoView.lungeOffset(mp.lungeT, mp.lungeK), lo = SumoView.lungeOffset(mo.lungeT, mo.lungeK);
    // 組み合う間合い: 角の先が ふれあう位置
    const squeeze = (b.playerImpact + b.enemyImpact) * 0.04;
    const gapP = fighting ? this.player.reach - squeeze : this.player.reach + 0.3;
    const gapO = fighting ? this.opponent.reach - squeeze : this.opponent.reach + 0.3;
    const evade = b.dodge > 0 ? Math.sin((b.dodge / 0.47) * Math.PI) * 1.1 : 0;
    // いなされた相手: 前のめりに、横へ つっこんで よろける
    let wx = 0, wz = 0, wyaw = 0;
    if (this.whiffT >= 0) {
      this.whiffT += dt;
      const k = this.whiffT < 0.25 ? this.whiffT / 0.25 : Math.max(0, 1 - (this.whiffT - 0.25) / 0.9);
      wx = -1.0 * k; wz = -0.9 * k; wyaw = 0.6 * k;
      if (this.whiffT > 1.2) this.whiffT = -1;
    }
    const playerFlying = this.flyers.some(f => f.actor === this.player);
    const oppFlying = this.flyers.some(f => f.actor === this.opponent);
    if (!playerFlying) {
      this.player.root.position.set(c - gapP - mp.back + lp - mp.knock * 0.7, 0, evade);
      this.player.root.rotation.y = evade * 0.35;
      // 前足が浮く(押された)/頭から つっこむ(突っこみ)/勝ったら 立ち上がる
      const rear = b.phase === 'won' ? 0.55 + Math.sin(t * 6) * 0.06 : 0;
      this.player.rig.rotation.z = mp.lift * 0.75 - (mp.lungeT >= 0 ? 0.12 * mp.lungeK : 0) + rear;
    }
    if (!oppFlying) {
      // 勝ち抜きで入ってくる相手は、奥から歩いてくる
      let enter = 0;
      if (this.enterT >= 0) { this.enterT += dt; enter = Math.max(0, 1 - this.enterT / 1.6) * 5; if (this.enterT > 1.6) this.enterT = -1; }
      this.opponent.root.position.set(c + gapO + mo.back - lo + mo.knock * 0.7 + wx + enter, 0, wz - enter * 0.3);
      this.opponent.root.rotation.y = Math.PI + wyaw;
      const rear = b.phase === 'lost' ? 0.55 + Math.sin(t * 6) * 0.06 : 0;
      this.opponent.rig.rotation.z = mo.lift * 0.75 - (mo.lungeT >= 0 ? 0.12 * mo.lungeK : 0) - (this.whiffT >= 0 ? 0.25 : 0) + rear;
    }
    const speed = Math.abs(b.velocity) + (mp.lungeT >= 0 || mo.lungeT >= 0 ? 0.5 : 0) + (this.enterT >= 0 ? 1 : 0);
    if (!playerFlying) this.player.animate({ t, moving: speed + (mp.back > 0.2 && wantBackP > 0 ? 0.3 : 0), impact: b.playerImpact, charging: b.charging, dodging: b.dodge > 0, won: b.phase === 'won', lost: b.phase === 'lost', engaged: fighting });
    if (!oppFlying) this.opponent.animate({ t, moving: speed + (b.enemyState === 'windup' ? 0.3 : 0), impact: b.enemyImpact, charging: b.enemyState === 'windup', dodging: false, won: b.phase === 'lost', lost: b.phase === 'won', engaged: fighting });
    // 吹っ飛ぶ鹿: 回りながら 弧をえがいて 土俵の外へ。落ちたら 横たわって すべる
    for (const f of this.flyers) {
      f.t += dt;
      if (!f.landed) {
        f.vy -= 20 * dt;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.rot += f.spin * dt;
        const ground = Math.hypot(f.x, f.z) > 4.6 ? -0.3 : 0.02;
        if (f.y <= ground && f.vy < 0) {
          f.y = ground; f.landed = true; f.vx *= 0.35; f.vz *= 0.35;
          this.shake = Math.max(this.shake, 0.35); this.dustAt(f.x, f.z, 14, Math.sign(f.vx), 1.4);
        }
      } else {
        f.x += f.vx * dt; f.z += f.vz * dt; f.vx *= Math.exp(-dt * 3); f.vz *= Math.exp(-dt * 3);
        f.rot += (0 - f.rot) * Math.min(1, dt * 8);
      }
      f.actor.root.position.set(f.x, f.y, f.z);
      f.actor.root.rotation.set(0, f.yaw, 0);
      f.actor.rig.rotation.z = f.rot;
      f.actor.rig.rotation.x = f.landed ? Math.min(1.35, (f.t - 0.6) * 4) : 0; // 落ちたら 横に たおれる
      f.actor.animate({ t, moving: f.landed ? 0 : 2, impact: 0, charging: false, dodging: false, won: false, lost: true, engaged: false });
    }
    // 勝ち抜きで吹っ飛んだ鹿は、少したったら 片づける
    this.flyers = this.flyers.filter(f => {
      if (f.temp && f.t > 2.2) { this.scene.remove(f.actor.root); f.actor.dispose(); return false; }
      return true;
    });
    // 火花・土ぼこり
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt; s.v.y -= 9 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.scale.setScalar(Math.max(0.1, s.life * 3));
      if (s.life <= 0) s.m.visible = false;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt; p.v.multiplyScalar(Math.exp(-dt * 2.5));
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.setScalar(0.5 + (1 - p.life) * 1.5);
      if (p.life <= 0) p.m.visible = false;
    }
    // Spra の応援(勝ち=ばんざい、負けそう=こまり顔)
    const sm = this.spra.material as THREE.MeshBasicMaterial;
    const mood = b.phase === 'won' || b.position > 1.4 ? 1 : b.phase === 'lost' || b.position < -1.4 ? 2 : 0;
    if (sm.map !== this.spraTex[mood]) { sm.map = this.spraTex[mood]; sm.needsUpdate = true; }
    this.spra.position.y = 0.75 + (mood === 1 ? Math.max(0, Math.sin(t * 8)) * 0.25 : 0);
    // カメラ: 押し合いの中心を、ななめ後ろの上から。吹っ飛ぶ鹿がいたら、少し追う
    const aspect = this.camera.aspect, dist = 13 * Math.max(1, 0.62 / aspect) ** 0.6;
    const fly = this.flyers.find(f => !f.temp && f.t < 2.5);
    const lookX = fly ? c * 0.25 + fly.x * 0.5 : c * 0.6;
    const look = new THREE.Vector3(lookX, fly ? 1.05 + Math.max(0, fly.y) * 0.5 : 1.05, 0);
    const zoom = fly ? 1.2 : 1;
    const pos = new THREE.Vector3(look.x + Math.sin(CAM_YAW) * dist * zoom, 4.6 * zoom, Math.cos(CAM_YAW) * dist * zoom);
    if (this.camPos.lengthSq() === 0) { this.camPos.copy(pos); this.camLook.copy(look); }
    this.camPos.lerp(pos, 0.08); this.camLook.lerp(look, 0.08);
    this.camera.position.copy(this.camPos);
    // 画面のゆれ
    this.shake *= Math.exp(-dt * 7);
    if (this.shake > 0.01) this.camera.position.add(new THREE.Vector3(Math.sin(t * 91) * this.shake * 0.5, Math.sin(t * 73 + 1) * this.shake * 0.35, Math.sin(t * 67 + 2) * this.shake * 0.3));
    this.camera.lookAt(this.camLook);
    const yaw = Math.atan2(this.camPos.x - this.camLook.x, this.camPos.z - this.camLook.z);
    this.spra.rotation.y = yaw;
    // 雨を落とす
    if (this.rain) { this.rain.position.y = -((t * 14) % 12); }
    // 押し合っている間の、小さな土ぼこり
    for (let i = 0; i < this.dust.length; i++) {
      const p = this.dust[i], phase = (t * 1.3 + i * 0.13) % 1;
      const active = (b.playerImpact > 0.2 || b.enemyImpact > 0.2 || Math.abs(b.velocity) > 0.6) && fighting;
      p.visible = active;
      p.position.set(c + (i % 2 ? 1.2 : -1.2) + Math.sin(i * 2) * phase * 0.6, 0.08 + Math.sin(phase * Math.PI) * 0.3, Math.cos(i * 4) * 0.7);
      p.scale.setScalar((1 - phase) * 1.6);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** もういちど のとき: 吹っ飛んだ鹿を もどす */
  reset(): void {
    for (const f of this.flyers) {
      if (f.temp) { this.scene.remove(f.actor.root); f.actor.dispose(); }
      else { f.actor.rig.rotation.set(0, 0, 0); }
    }
    this.flyers = [];
    if (this.level.opponents.length > 1) {
      this.scene.remove(this.opponent.root); this.opponent.dispose();
      this.opponent = make3dDeer(this.level.opponents[0], TEAM_THEM);
      this.scene.add(this.opponent.root);
    }
    this.shownRound = 0; this.enterT = -1; this.whiffT = -1; this.slow = 0; this.stop = 0; this.shake = 0;
    for (const m of [this.moves.player, this.moves.opponent]) Object.assign(m, { back: 0, lungeT: -1, lungeK: 0, knock: 0, lift: 0 });
    this.player.rig.rotation.set(0, 0, 0); this.opponent.rig.rotation.set(0, 0, 0);
  }

  dispose(): void {
    this.observer.disconnect();
    this.player.dispose(); this.opponent.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
