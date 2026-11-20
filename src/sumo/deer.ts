// 鹿ずもうの鹿(2種類の作り方)。どちらも +X が前。足もとが原点。
//   make3dDeer: 部品(胴・脚・首・頭・耳・しっぽ・枝分かれした角)を組み合わせた立体の鹿。試作 deersample9 の DeerModel.ts を移した
//   makeImageDeer: 絵本風の絵を板に貼った鹿(ほかのワールドと同じ作り方)。体を傾けたり、つぶしたりして動かす
import * as THREE from 'three';
import type { SumoDeer } from './levels.ts';

export type DeerPose = {
  t: number;
  /** 動いている速さ(脚の動き) */
  moving: number;
  /** 押したときの衝撃(0〜1.5) */
  impact: number;
  charging: boolean; dodging: boolean; won: boolean; lost: boolean;
  /** 組み合っている(はっけよいの後) */
  engaged: boolean;
};

export type DeerActor = {
  root: THREE.Group;
  /** 体の中心から、角の先まで(組み合う間合い) */
  reach: number;
  animate(p: DeerPose): void;
  /** カメラの向き(Y回転)。絵の鹿は、いつもカメラへ向ける */
  face(cameraYaw: number): void;
  dispose(): void;
};

const disposeTree = (root: THREE.Object3D) => root.traverse(o => {
  if (o instanceof THREE.Mesh) {
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
  }
});

/** 立体の鹿。team = まわしの色 */
export function make3dDeer(type: SumoDeer, team: number): DeerActor {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group();
  root.add(body); body.add(head); head.position.set(0.59, 1.66, 0);
  const legs: THREE.Group[] = [];
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  const mat = (color: number) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.84 }));
    return mats.get(color)!;
  };
  const ell = (parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, detail = 2) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), mat(c));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const branch = (parent: THREE.Object3D, a: number[], b: number[], r1: number, r2: number, c: number) => {
    const start = new THREE.Vector3(a[0], a[1], a[2]), end = new THREE.Vector3(b[0], b[1], b[2]), delta = end.clone().sub(start);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, delta.length(), 7), mat(c));
    m.position.copy(start.add(end).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // 胴・おしり・胸・首
  ell(body, -0.12, 1.17, 0, 0.83, 0.48, 0.38, type.coat);
  ell(body, -0.71, 1.25, 0, 0.31, 0.35, 0.37, type.coat); ell(body, 0.39, 1.26, 0, 0.37, 0.51, 0.38, type.coat);
  ell(body, -0.82, 1.17, 0, 0.14, 0.27, 0.31, 0xf2dfb9);
  const tail = ell(body, -1, 1.45, 0, 0.24, 0.11, 0.13, type.coat); tail.rotation.z = -0.55;
  branch(body, [0.36, 1.18, 0], [0.63, 1.8, 0], 0.29, 0.22, type.coat);
  ell(body, 0.52, 1.51, 0, 0.19, 0.37, 0.24, 0xe2c49a);
  // 脚(4本。ももと すね と ひづめ)
  for (const z of [-0.28, 0.28]) for (const x of [-0.62, 0.46]) {
    const leg = new THREE.Group(); leg.position.set(x, 1.15, z); body.add(leg); legs.push(leg);
    branch(leg, [0, 0, 0], [0.04, -0.5, 0], 0.115, 0.075, type.coat);
    branch(leg, [0.04, -0.5, 0], [-0.04, -1.01, 0], 0.065, 0.047, type.dark);
    ell(leg, -0.005, -1.04, 0, 0.13, 0.085, 0.095, 0x483f36, 1);
  }
  // 頭・鼻・目・耳・角
  ell(head, 0.13, 0.12, 0, 0.36, 0.31, 0.25, type.coat);
  ell(head, 0.44, -0.03, 0, 0.32, 0.18, 0.19, type.coat); ell(head, 0.47, -0.1, 0, 0.26, 0.09, 0.17, 0xf3dfba);
  ell(head, 0.7, -0.02, 0, 0.085, 0.1, 0.15, 0x3e352d);
  for (const z of [-1, 1]) {
    const ear = ell(head, -0.08, 0.4, z * 0.33, 0.12, 0.31, 0.1, type.coat); ear.rotation.x = z * 0.8; ear.rotation.z = 0.4;
    const inner = ell(head, -0.02, 0.43, z * 0.35, 0.045, 0.19, 0.065, 0xe3b795); inner.rotation.x = z * 0.8;
    ell(head, 0.26, 0.17, z * 0.228, 0.085, 0.095, 0.033, 0x342e27); ell(head, 0.285, 0.2, z * 0.256, 0.025, 0.03, 0.009, 0xfff7df);
    const antler = new THREE.Group(); antler.position.set(0.01, 0.36, z * 0.17); antler.scale.setScalar(type.antlerSize); head.add(antler);
    const pts = [[0, 0, 0], [-0.12, 0.34, z * 0.13], [-0.07, 0.67, z * 0.23], [0.16, 0.96, z * 0.31], [0.4, 1.12, z * 0.34]];
    for (let i = 0; i < pts.length - 1; i++) branch(antler, pts[i], pts[i + 1], 0.065 - i * 0.013, 0.05 - i * 0.013, type.antler);
    branch(antler, pts[1], [0.28, 0.56, z * 0.14], 0.045, 0.012, type.antler);
    branch(antler, pts[2], [0.32, 0.84, z * 0.17], 0.038, 0.009, type.antler);
    branch(antler, pts[3], [0.03, 1.2, z * 0.42], 0.026, 0.007, type.antler);
  }
  // 白い斑点(鹿の子もよう)
  for (const z of [-1, 1]) for (let i = 0; i < 8; i++) {
    const x = -0.67 + (i % 4) * 0.27, y = 1.35 + Math.floor(i / 4) * 0.16;
    ell(body, x, y, z * (0.34 - Math.floor(i / 4) * 0.07), 0.052, 0.035, 0.018, 0xf5ddb3, 1);
  }
  // まわし
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.395, 0.042, 6, 36), mat(team));
  belt.rotation.y = Math.PI / 2; belt.position.set(-0.05, 1.17, 0); belt.scale.set(1.12, 1, 1); body.add(belt);
  const knot = ell(body, -0.03, 1.16, 0.4, 0.12, 0.095, 0.07, team, 1); knot.rotation.z = 0.3;
  const scale = type.size * 0.92;
  root.scale.setScalar(scale);
  return {
    root, reach: 1.35 * scale,
    animate(p) {
      const { t } = p;
      body.position.y = Math.sin(t * 2.5) * 0.013 + (p.won ? Math.max(0, Math.sin(t * 7)) * 0.09 : 0);
      body.rotation.z = p.lost ? 0.07 : -p.impact * 0.055;
      head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, p.won ? 0.12 : p.lost ? -0.7 : p.charging ? -1.12 : (p.engaged ? -0.93 : -0.36) - p.impact * 0.12, 0.15);
      head.rotation.y = Math.sin(t * 1.8) * 0.025;
      legs.forEach((leg, i) => {
        leg.rotation.z = Math.sin(t * (p.moving > 0.08 ? 14 : 2) + i * Math.PI * 0.8) * Math.min(0.28, p.moving * 0.25 + 0.015) + (p.charging ? (i < 2 ? 0.16 : -0.16) : 0);
      });
      tail.rotation.y = Math.sin(t * 5) * 0.2;
      body.rotation.x = p.dodging ? 0.13 : 0;
    },
    face() { /* 立体なので、向きはそのまま */ },
    dispose() { disposeTree(root); },
  };
}

/**
 * 絵の鹿。url = 左向きの絵。faceRight = 右(+X)向きにするなら、左右を反転する。
 * 絵の縦横比(aspect = 横/縦)と、絵の中で体が占める横幅の割合(bodyW)から、間合いを決める
 */
export function makeImageDeer(url: string, aspect: number, type: SumoDeer, team: number, faceRight: boolean, bodyW = 0.85): DeerActor {
  const root = new THREE.Group(), turn = new THREE.Group(), pivot = new THREE.Group();
  root.add(turn); turn.add(pivot);
  const h = 2.25 * type.size, w = h * aspect;
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false, color: type.tint });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  plane.position.y = h / 2;
  plane.scale.x = faceRight ? -1 : 1;
  pivot.add(plane);
  // 影と、まわしの色の輪(どちらが自分か分かるように)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(w * 0.36, 28), new THREE.MeshBasicMaterial({ color: 0x5b4a2f, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.05; shadow.scale.y = 0.45;
  const ring = new THREE.Mesh(new THREE.RingGeometry(w * 0.3, w * 0.36, 32), new THREE.MeshBasicMaterial({ color: team, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.y = 0.45;
  root.add(shadow, ring);
  const dir = faceRight ? 1 : -1;
  let lean = 0;
  return {
    root, reach: (w * bodyW) / 2,
    animate(p) {
      const { t } = p;
      // 前へ傾ける(押すとき・組み合っているとき)。ためているときは、低く かまえて ぷるぷる
      const want = p.won ? -0.05 : p.lost ? -0.28 : p.charging ? 0.2 : p.engaged ? 0.12 + p.impact * 0.12 : 0;
      lean += (want - lean) * 0.15;
      pivot.rotation.z = -lean * dir;
      const squash = p.charging ? 0.9 : 1 - p.impact * 0.05;
      pivot.scale.set(1 + (1 - squash) * 0.6, squash, 1);
      const hop = p.won ? Math.max(0, Math.sin(t * 7)) * 0.3 : 0;
      const shake = p.charging ? Math.sin(t * 60) * 0.02 : 0;
      const step = p.moving > 0.08 ? Math.abs(Math.sin(t * 14)) * 0.05 : Math.sin(t * 2.5) * 0.015;
      pivot.position.set(shake, hop + step, 0);
    },
    face(cameraYaw) { turn.rotation.y = cameraYaw; },
    dispose() { disposeTree(root); },
  };
}
