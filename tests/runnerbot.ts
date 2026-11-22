// WORLD 4: ジャンプとよけだけで進むボット(テストと調整に使う)
import { PLAY_HALF, obstacleState, HIT_RADIUS, type Course } from '../src/runner/course.ts';
import { Run, PLAYER_RADIUS, type Input } from '../src/runner/sim.ts';

export const DT = 1 / 120;
const AIR = 0.656; // ジャンプの滞空時間(秒)

/** ジャンプとよけだけで進む簡単なボット(穴・柵・岩・鹿・水たまり・氷は跳び、ふんは避ける)。 */
/** senbei=鹿せんべいを取りにいく(仲間の鹿の面) */
export type BotOpts = { senbei?: boolean; /** 取りにいく せんべいを しぼる(無ければ全部) */ pick?: (id: number) => boolean; /** 鬼ごっこ: 「はしる」を 1秒に この回数 押す */ mash?: number };
/** 鬼ごっこ: 1秒に mash 回の ちょうどの間隔で「はしる」を押す(押す時刻を こえた step で 1回) */
function mashTaps(r: Run, o: BotOpts): number {
  if (!o.mash || !r.course.tag) return 0;
  const k = Math.floor(r.t * o.mash), prev = Math.floor((r.t - DT) * o.mash);
  return k > prev ? 1 : 0;
}
export function bot(r: Run, o2: BotOpts = {}): Input {
  const v = r.speed;
  let left = false;
  let right = false;
  let jump = false;
  // つり橋の上: ゆれに逆らって、まんなかを保つ(板のぬけた所は、下の穴の処理で跳ぶ)
  if (r.onBridge) {
    if (r.x > 0.25) left = true;
    else if (r.x < -0.25) right = true;
  }
  let boltSeen = false;
  for (const o of r.course.obstacles) {
    if (o.kind === 'train') continue; // 電車は、着く前に通りすぎる
    if (o.kind === 'fish') {
      // 金魚: 着く頃に、体の高さを通りそうなら跳ぶ
      const d = o.s - r.s;
      if (d < -1 || d > 20) continue;
      const ta = d / v;
      const at = obstacleState(o, r.t + ta);
      if (at.y > -1 && at.y < 1.3 && Math.abs(at.x - r.x) < 1.3 && ta > 0.24 && ta < 0.34) jump = true;
      continue;
    }
    if (o.kind === 'sheet' || o.kind === 'leaf') {
      // シート・落ち葉: よける(落ち葉は、跳んでもよい)
      const d = o.s - r.s;
      if (d > 0 && d < 10 && Math.abs(o.x - r.x) < HIT_RADIUS[o.kind] + PLAYER_RADIUS + 0.4) {
        if (o.x > r.x) left = true;
        else right = true;
        if (r.x <= -PLAY_HALF + 0.1) { left = false; right = true; }
        if (r.x >= PLAY_HALF - 0.1) { right = false; left = true; }
      }
      continue;
    }
    if (o.kind === 'bomb') continue; // 爆弾は、下でまとめて(いちばん近いものを優先)
    if (o.kind === 'bat') {
      // こうもり: すれちがう直前に跳ぶ(体の高さに降りてくるので)
      const st = r.stateOf(o);
      if (st.y < 0) continue;
      const dd = st.s - r.s;
      if (dd > 0 && dd < 7 && Math.abs(st.x - r.x) < 1.6 && !r.airborne) jump = true;
      continue;
    }
    if (o.kind === 'bolt') {
      // 雷: 光る輪の外へ、よける(いちばん手前の輪だけを見る。左右に続く輪を 先に見て 迷わない)
      const d = o.s - r.s;
      if (d <= -1.8 || boltSeen) continue;
      if (d < 26) boltSeen = true;
      if (d < 26 && Math.abs(o.x - r.x) < (o.radius ?? 1.35) + PLAYER_RADIUS + 0.5) {
        if (o.x > r.x || (o.x === r.x && r.x > 0)) left = true;
        else right = true;
      }
      continue;
    }
    if (o.kind === 'critter') {
      // 動物・モンスター: ぶつかる頃の位置を予想して、ちょうどよい時に跳ぶ(突進は、近づく分も見込む)
      const st = r.stateOf(o);
      const dd = st.s - r.s;
      if (dd < -1 || dd > 25) continue;
      const closing = o.behavior === 'charge' && r.chargeT.has(o.id) ? o.freq : 0;
      const ta = dd / (v + closing);
      const at = obstacleState(o, r.t + ta, r.chargeT.get(o.id));
      if (o.behavior === 'hop' && at.y > 0.5) continue; // その頃は、跳んで浮いている
      if (Math.abs(at.x - r.x) < (o.radius ?? 0.8) + 1.0 && ta > 0.26 && ta < 0.36) jump = true;
      continue;
    }
    const d = o.s - r.s;
    if (d < -1 || d > 18) continue;
    if (o.kind === 'hole') {
      const air = v * AIR;
      const takeoff = Math.max(0, (air - o.len) / 2);
      if (d <= takeoff + 0.25 && d > takeoff - 0.8 && !r.airborne) jump = true;
    } else if (o.kind === 'fence') {
      if (Math.abs(r.x - o.x) < o.halfW + 0.8 && d < v * 0.3 && d > v * 0.1) jump = true;
    } else if (o.kind === 'stone' || o.kind === 'deer') {
      const t = d / v;
      const ox = obstacleState(o, r.t + t).x;
      if (Math.abs(ox - r.x) < 1.9 && t < 0.3 && t > 0.1) jump = true;
      // 速くて、跳んだあとの着地が次に間に合わないときは、横へよける
      if (Math.abs(ox - r.x) < 1.6 && t < 0.5 && (r.airborne || t <= 0.1)) {
        if (ox > r.x) left = true;
        else right = true;
      }
    } else if (o.kind === 'puddle' || o.kind === 'ice') {
      if (Math.abs(o.x - r.x) < HIT_RADIUS[o.kind] + 0.9 && d < v * 0.35 && d > v * 0.1) jump = true;
    } else if (o.kind === 'poop' && d > 0 && d < 9) {
      if (Math.abs(o.x - r.x) < HIT_RADIUS.poop + PLAYER_RADIUS + 0.5) {
        if (o.x - r.x > 0) left = true;
        else right = true;
        if (r.x <= -PLAY_HALF + 0.1) { left = false; right = true; }
        if (r.x >= PLAY_HALF - 0.1) { right = false; left = true; }
      }
    }
  }
  // 爆弾: 投げられた(ねらいが決まった)うち、いちばん近いものの赤い輪の外へ。よけられる側(端までの余り)へ逃げる。
  // ほかの判断より優先する(左右が打ち消し合うと、その場に止まってしまうため)
  let bomb: { ax: number; d: number; rr: number } | undefined;
  for (const o of r.course.obstacles) {
    if (o.kind !== 'bomb' || r.struck.has(o.id)) continue;
    const ax = r.aim.get(o.id);
    const d = o.s - r.s;
    if (ax === undefined || d < -1.8 || d > 30) continue;
    if (!bomb || d < bomb.d) bomb = { ax, d, rr: (o.radius ?? 1.3) + PLAYER_RADIUS + 0.35 };
  }
  if (bomb && Math.abs(bomb.ax - r.x) < bomb.rr) {
    const roomLeft = bomb.ax - bomb.rr - -PLAY_HALF;
    const roomRight = PLAY_HALF - (bomb.ax + bomb.rr);
    const goLeft = roomLeft >= 0 && (roomRight < 0 || r.x < bomb.ax || (r.x === bomb.ax && roomLeft >= roomRight));
    left = goLeft;
    right = !goLeft;
    return { left, right, jump, taps: mashTaps(r, o2) };
  }
  // 鹿せんべい: よける必要がなければ、近いせんべいへ寄る
  if (o2.senbei && !left && !right) {
    const sb = r.course.coins.find((c) => c.kind === 'senbei' && !r.collected.has(c.id) && (!o2.pick || o2.pick(c.id)) && c.s - r.s > 0 && c.s - r.s < 26);
    if (sb && Math.abs(sb.x - r.x) > 0.3) {
      left = sb.x < r.x;
      right = sb.x > r.x;
      return { left, right, jump, taps: mashTaps(r, o2) };
    }
    if (sb) return { left, right, jump, taps: mashTaps(r, o2) };
  }
  // 何もよける必要がなければ、道の中央へもどる(カーブで外へ押されるので)
  if (!left && !right && Math.abs(r.x) > 0.5) {
    left = r.x > 0;
    right = r.x < 0;
  }
  return { left, right, jump, taps: mashTaps(r, o2) };
}

export function play(course: Course, drive: (r: Run) => Input, maxSec = 300): Run {
  const r = new Run(course);
  r.start();
  for (let i = 0; i < maxSec / DT && r.phase === 'running'; i++) r.step(DT, drive(r));
  return r;
}

