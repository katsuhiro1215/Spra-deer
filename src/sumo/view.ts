// WORLD 6「鹿ずもう」の3Dの絵: 奈良公園の土俵・2頭の鹿・応援のSpra・土ぼこり・カメラ。
// 縦の画面に合わせて、押し合う向き(X)を ななめに見る(自分の鹿が手前、相手が奥)。
import * as THREE from 'three';
import { PLAYER_DEER, type SumoLevel } from './levels.ts';
import { make3dDeer, type DeerActor } from './deer.ts';
import type { Bout } from './sim.ts';

const ASSET = '/assets';
const TEAM_ME = 0x4f9a5c, TEAM_THEM = 0xd0563c;
/** カメラの向き(Y回転、ラジアン)。0 = 真横から。マイナス = 自分の鹿の後ろへまわる */
const CAM_YAW = -0.5;

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
    this.scene.background = new THREE.Color(0xbfdcef);
    this.scene.fog = new THREE.Fog(0xcfe3d6, 22, 52);
    this.scene.add(new THREE.HemisphereLight(0xfff4d9, 0x6d8060, 2.4));
    const sun = new THREE.DirectionalLight(0xffedcc, 3.0);
    sun.position.set(-4, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.environment();
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

  private makeDeer() {
    this.player = make3dDeer(PLAYER_DEER, TEAM_ME);
    this.opponent = make3dDeer(this.level.opponent, TEAM_THEM);
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

  render(dt: number, b: Bout): void {
    this.time += dt;
    const t = this.time, fighting = b.phase === 'playing' || b.phase === 'countdown';
    const c = b.position * 0.72;
    // 組み合う間合い: 角の先が ふれあう位置(押した瞬間は、少し近づく)
    const squeeze = (b.playerImpact + b.enemyImpact) * 0.04;
    const gapP = fighting ? this.player.reach - squeeze : this.player.reach + 0.3;
    const gapO = fighting ? this.opponent.reach - squeeze : this.opponent.reach + 0.3;
    const evade = b.dodge > 0 ? Math.sin((b.dodge / 0.47) * Math.PI) * 0.9 : 0;
    const stumble = b.enemyState === 'stumble';
    this.player.root.position.set(c - gapP, 0, evade);
    this.opponent.root.position.set(c + gapO + (stumble ? 0.25 : 0), 0, stumble ? -0.3 : 0);
    this.player.root.rotation.y = evade * 0.3;
    this.opponent.root.rotation.y = Math.PI + (stumble ? 0.2 : 0);
    const speed = Math.abs(b.velocity);
    this.player.animate({ t, moving: speed, impact: b.playerImpact, charging: b.charging, dodging: b.dodge > 0, won: b.phase === 'won', lost: b.phase === 'lost', engaged: fighting });
    this.opponent.animate({ t, moving: speed, impact: b.enemyImpact, charging: b.enemyState === 'windup', dodging: false, won: b.phase === 'lost', lost: b.phase === 'won', engaged: fighting });
    // Spra の応援(勝ち=ばんざい、負けそう=こまり顔)
    const sm = this.spra.material as THREE.MeshBasicMaterial;
    const mood = b.phase === 'won' || b.position > 1.4 ? 1 : b.phase === 'lost' || b.position < -1.4 ? 2 : 0;
    if (sm.map !== this.spraTex[mood]) { sm.map = this.spraTex[mood]; sm.needsUpdate = true; }
    this.spra.position.y = 0.75 + (mood === 1 ? Math.max(0, Math.sin(t * 8)) * 0.25 : 0);
    // カメラ: 押し合いの中心を、ななめ後ろの上から(縦の画面に合わせて、近づける)
    const aspect = this.camera.aspect, dist = 13 * Math.max(1, 0.62 / aspect) ** 0.6;
    const look = new THREE.Vector3(c * 0.6, 1.05, 0);
    const pos = new THREE.Vector3(look.x + Math.sin(CAM_YAW) * dist, 4.6, Math.cos(CAM_YAW) * dist);
    if (this.camPos.lengthSq() === 0) { this.camPos.copy(pos); this.camLook.copy(look); }
    this.camPos.lerp(pos, 0.08); this.camLook.lerp(look, 0.08);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const yaw = Math.atan2(this.camPos.x - this.camLook.x, this.camPos.z - this.camLook.z);
    this.spra.rotation.y = yaw;
    // 土ぼこり(強く押したとき・大きく動いたとき)
    for (let i = 0; i < this.dust.length; i++) {
      const p = this.dust[i], phase = (t * 1.3 + i * 0.13) % 1;
      const active = (b.playerImpact > 0.2 || b.enemyImpact > 0.2 || speed > 0.6) && fighting;
      p.visible = active;
      p.position.set(c + (i % 2 ? 1.2 : -1.2) + Math.sin(i * 2) * phase * 0.6, 0.08 + Math.sin(phase * Math.PI) * 0.3, Math.cos(i * 4) * 0.7);
      p.scale.setScalar((1 - phase) * 1.6);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.observer.disconnect();
    this.player.dispose(); this.opponent.dispose();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
