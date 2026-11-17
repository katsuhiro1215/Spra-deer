// WORLD 8「鹿と暴走トロッコ」: 走りのルール(描画なし。テストからも使う)
// 鹿とトロッコは、ひとつの走るかたまりとして扱う(位置・速さ・ジャンプは共通)。
import type { Track } from './track.ts';

export type Input = { left: boolean; right: boolean; jump: boolean; brake: boolean; dash: boolean };
export type CartEventKind = 'coin' | 'gold' | 'premium' | 'jump' | 'land' | 'hit' | 'drop' | 'derail' | 'dash' | 'tilt' | 'clear' | 'fail';
export type CartEvent = { kind: CartEventKind; id?: number };
export type FailReason = '' | 'fall' | 'derail' | 'miss' | 'broken';

/** 調整する数値。速さは m/s(画面の km/h は 3.6 倍)。 */
export const BAL = {
  g: 16, // 重力(坂の加速。空中と同じ強さ。本物より強めにして、すぐ速くなるように)
  roll: 0.2, // 車輪の抵抗
  drag: 0.0012, // 空気の抵抗(速さの2乗にかかる)
  brake: 9, // ブレーキの減速
  dashAcc: 7, dashTime: 1.5, dashCool: 5, // 鹿のダッシュ
  vStart: 9, vMax: 30, vDash: 36, vMin: 2,
  pull: 5, vPull: 12, // 鹿が引く力(おそいときほど強い。上り坂でも止まらない)
  jumpV: 8, airG: 16, // ジャンプの上向きの速さと、空中の重力(平らな所で、ちょうど1秒とぶ)
  latBase: 7, latLean: 5, latOut: 3, // カーブの横向きの力の上限(内側へ傾けると上がり、外側へ傾けると下がる)
  tiltRate: 0.3, tiltDecay: 1.6, // 上限をこえると車輪が浮きはじめ(tilt)、1 になると脱線
  leanRate: 4.5, // 体を傾ける速さ
  coyote: 0.1, // 線路の切れ目に入ってから、まだ跳べる時間(秒)
  jumpBuffer: 0.12, // ボタンを少し早く押しても、きく時間(秒)
  landWidth: 1.4, // 着地のとき、線路のまん中からずれてよい幅
  hitSlow: 0.55, hitSafe: 1.1, // ぶつかったときの減速と、そのあと無敵の時間
  clear: { rock: 0.9, log: 0.6 }, // 跳びこえるのに要る高さ
  leanDodge: 0.45, // 枝をよける・横のコインを取るのに要る傾き
} as const;

export class CartRun {
  track: Track;
  phase: 'ready' | 'running' | 'cleared' | 'failed' = 'ready';
  reason: FailReason = '';
  /** 線路にそった距離・速さ・時間 */
  s = 0; v: number = BAL.vStart; t = 0;
  /** 今いる場所(空中では、線路からはなれて放物線でとぶ) */
  px = 0; py = 0; pz = 0;
  vx = 0; vy = 0; vz = 0;
  air = false; airT = 0;
  /** 線路からの高さ */
  height = 0;
  /** 線路のまん中からの横ずれ(空中だけ) */
  side = 0;
  /** 体の傾き -1(左)〜1(右) */
  lean = 0;
  /** 車輪の浮き 0〜1(1で脱線)と、外へたおれる向き */
  tilt = 0; tiltDir = 0;
  /** 今かかっている横向きの力と、その上限(画面の警告用) */
  lat = 0; latLimit: number = BAL.latBase;
  lives = 3; coins = 0; gold = 0; premium = false;
  collected = new Set<number>();
  hitIds = new Set<number>();
  dashT = 0; dashCool = 0; safeT = 0;
  braking = false;
  maxV = 0; jumps = 0;
  private events: CartEvent[] = [];
  private jumpHeld = false; private dashHeld = false; private jumpBuf = 0;
  private edgeT = 0; private doomed = false; private warned = false;
  private nextCoin = 0; private nextObstacle = 0;

  constructor(track: Track) {
    this.track = track;
    this.place();
  }
  start(): void { if (this.phase === 'ready') this.phase = 'running'; }
  get progress(): number { return Math.max(0, Math.min(1, this.s / this.track.length)); }
  drainEvents(): CartEvent[] { const e = this.events; this.events = []; return e; }

  /** チェックポイントから続ける。 */
  restore(s: number, t: number, coins: number, gold: number, premium: boolean, collected: Iterable<number>): void {
    this.s = s; this.t = t; this.coins = coins; this.gold = gold; this.premium = premium;
    for (const id of collected) this.collected.add(id);
    this.v = Math.max(BAL.vStart, 12);
    this.nextCoin = this.track.coins.findIndex(c => c.s > s); if (this.nextCoin < 0) this.nextCoin = this.track.coins.length;
    this.nextObstacle = this.track.obstacles.findIndex(o => o.s > s); if (this.nextObstacle < 0) this.nextObstacle = this.track.obstacles.length;
    this.place();
  }

  private place(): void {
    const p = this.track.at(this.s);
    this.px = p.x; this.py = p.y; this.pz = p.z; this.height = 0; this.side = 0;
  }
  private fail(reason: FailReason, kind: CartEventKind): void {
    this.phase = 'failed'; this.reason = reason; this.braking = false;
    this.events.push({ kind }, { kind: 'fail' });
  }
  private takeOff(vy: number): void {
    const p = this.track.at(this.s), flat = Math.cos(p.pitch);
    this.air = true; this.airT = 0; this.edgeT = 0;
    this.vx = Math.sin(p.heading) * flat * this.v;
    this.vz = -Math.cos(p.heading) * flat * this.v;
    this.vy = Math.sin(p.pitch) * this.v + vy;
    this.px = p.x; this.py = p.y; this.pz = p.z;
  }

  step(dt: number, input: Input): void {
    if (this.phase === 'cleared') { // ゴールのあとは、ブレーキをかけて止まる
      this.v = Math.max(0, this.v - 8 * dt);
      this.s = Math.min(this.track.total - 2, this.s + this.v * dt);
      this.lean += (0 - this.lean) * Math.min(1, dt * 4); this.tilt = Math.max(0, this.tilt - dt * 2);
      this.place();
      return;
    }
    if (this.phase !== 'running') return;
    const tr = this.track, prevS = this.s;
    this.t += dt;
    this.dashT = Math.max(0, this.dashT - dt); this.dashCool = Math.max(0, this.dashCool - dt);
    this.safeT = Math.max(0, this.safeT - dt); this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (input.jump && !this.jumpHeld) this.jumpBuf = BAL.jumpBuffer;
    this.jumpHeld = input.jump;
    if (input.dash && !this.dashHeld && this.dashCool <= 0 && !this.air) {
      this.dashT = BAL.dashTime; this.dashCool = BAL.dashCool; this.events.push({ kind: 'dash' });
    }
    this.dashHeld = input.dash;
    const want = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dl = want - this.lean, ml = BAL.leanRate * dt;
    this.lean += Math.abs(dl) <= ml ? dl : Math.sign(dl) * ml;
    this.braking = input.brake && !this.air;

    if (this.air) {
      this.airT += dt;
      this.vy -= BAL.airG * dt;
      this.px += this.vx * dt; this.py += this.vy * dt; this.pz += this.vz * dt;
      // 線路のどこの上にいるか(空中では、線路にすいつけない)
      const h = tr.at(this.s).heading;
      this.s += (this.vx * Math.sin(h) - this.vz * Math.cos(h)) * dt;
      const q = tr.at(this.s);
      this.side = (this.px - q.x) * Math.cos(q.heading) + (this.pz - q.z) * Math.sin(q.heading);
      this.height = this.py - q.y;
      if (this.py <= q.y && this.airT > 0.05) {
        if (this.doomed || tr.inGap(this.s)) {
          // 線路が無い所へ落ちた
          if (!this.doomed) { this.doomed = true; this.events.push({ kind: 'drop' }); }
          if (this.height < -7) { this.fail('fall', 'drop'); return; }
        } else if (Math.abs(this.side) > BAL.landWidth) {
          this.fail('miss', 'derail'); return;
        } else {
          this.air = false; this.py = q.y; this.height = 0; this.side = 0;
          this.v = Math.max(BAL.vMin, Math.hypot(this.vx, this.vz) * 0.98);
          this.events.push({ kind: 'land' });
        }
      }
    } else {
      const p = tr.at(this.s);
      let a = -BAL.g * Math.sin(p.pitch) - BAL.roll - BAL.drag * this.v * this.v;
      if (this.v < BAL.vPull) a += BAL.pull * (1 - this.v / BAL.vPull);
      if (this.braking) a -= BAL.brake;
      if (this.dashT > 0) a += BAL.dashAcc;
      this.v += a * dt;
      const cap = this.dashT > 0 ? BAL.vDash : BAL.vMax;
      if (this.v > cap) this.v = Math.max(cap, this.v - 6 * dt);
      this.v = Math.max(BAL.vMin, this.v);
      this.s += this.v * dt;
      const q = tr.at(this.s);
      this.px = q.x; this.py = q.y; this.pz = q.z; this.height = 0; this.side = 0;

      // カーブ: 横向きの力が上限をこえると、車輪が浮いていき、やがて脱線
      const dir = Math.sign(q.curv), inward = this.lean * dir;
      this.lat = this.v * this.v * Math.abs(q.curv);
      this.latLimit = BAL.latBase + BAL.latLean * Math.max(0, inward) - BAL.latOut * Math.max(0, -inward);
      if (this.lat > this.latLimit) {
        this.tilt += (this.lat - this.latLimit) * BAL.tiltRate * dt; this.tiltDir = -dir;
        if (!this.warned && this.tilt > 0.25) { this.warned = true; this.events.push({ kind: 'tilt' }); }
        if (this.tilt >= 1) { this.tilt = 1; this.fail('derail', 'derail'); return; }
      } else {
        this.tilt = Math.max(0, this.tilt - BAL.tiltDecay * dt);
        if (this.tilt === 0) this.warned = false;
      }

      // 線路の切れ目: 少しの間は、まだ跳べる。跳ばなければ、そのまま飛び出して落ちる
      if (tr.inGap(this.s)) {
        this.edgeT += dt;
        if (this.jumpBuf > 0) { this.jumpBuf = 0; this.jumps++; this.takeOff(BAL.jumpV); this.events.push({ kind: 'jump' }); }
        else if (this.edgeT > BAL.coyote) this.takeOff(0);
      } else {
        this.edgeT = 0;
        if (this.jumpBuf > 0) { this.jumpBuf = 0; this.jumps++; this.takeOff(BAL.jumpV); this.events.push({ kind: 'jump' }); }
      }
    }
    this.maxV = Math.max(this.maxV, this.v);

    // 障害物(通りすぎた瞬間に判定)
    while (this.nextObstacle < tr.obstacles.length && tr.obstacles[this.nextObstacle].s <= this.s) {
      const o = tr.obstacles[this.nextObstacle++];
      if (o.s <= prevS || this.safeT > 0 || this.doomed) continue;
      const hit = o.kind === 'branch'
        ? this.lean * (o.side ?? 1) > -BAL.leanDodge // 枝の反対へ、体を傾けていないと当たる
        : this.height < BAL.clear[o.kind];
      if (!hit) continue;
      this.lives--; this.hitIds.add(o.id); this.safeT = BAL.hitSafe;
      this.v = Math.max(BAL.vMin + 2, this.v * BAL.hitSlow);
      if (this.air) { this.vx *= BAL.hitSlow; this.vz *= BAL.hitSlow; }
      this.events.push({ kind: 'hit', id: o.id });
      if (this.lives <= 0) { this.fail('broken', 'hit'); return; }
    }
    // コイン
    while (this.nextCoin < tr.coins.length && tr.coins[this.nextCoin].s <= this.s) {
      const c = tr.coins[this.nextCoin++];
      if (c.s <= prevS || this.collected.has(c.id) || this.doomed) continue;
      const sideOk = c.side === 0 ? Math.abs(this.lean) < 0.8 : this.lean * c.side > BAL.leanDodge;
      if (!sideOk || Math.abs(this.height + 0.9 - c.h) > 1.1) continue;
      this.collected.add(c.id);
      if (c.kind === 'premium') this.premium = true; else if (c.kind === 'gold') this.gold++; else this.coins++;
      this.events.push({ kind: c.kind ?? 'coin', id: c.id });
    }
    if (!this.air && this.s >= tr.length) { this.phase = 'cleared'; this.braking = false; this.events.push({ kind: 'clear' }); }
  }
}
