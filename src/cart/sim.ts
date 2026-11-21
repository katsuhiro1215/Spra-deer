// WORLD 8「鹿と暴走トロッコ」: 走りのルール(描画なし。テストからも使う)
// 鹿とトロッコは、ひとつの走るかたまりとして扱う(位置・速さ・ジャンプは共通)。
import { FORK_W, forkShape, type Chase, type Fork, type Track } from './track.ts';

export type Input = { left: boolean; right: boolean; jump: boolean; brake: boolean; dash: boolean };
export type CartEventKind = 'coin' | 'gold' | 'premium' | 'jump' | 'lift' | 'ramp' | 'land' | 'hit' | 'drop' | 'derail' | 'dash' | 'tilt' | 'senbei' | 'chase' | 'chaseEnd' | 'caught' | 'clear' | 'fail'
  // 追いかけっこ: 分かれ道に入った(正しい・まちがい)、連結した、鹿のトロッコが谷へ
  | 'forkRight' | 'forkWrong' | 'hitch' | 'deerLost';
export type CartEvent = { kind: CartEventKind; id?: number };
export type FailReason = '' | 'fall' | 'derail' | 'miss' | 'broken' | 'caught' | 'cliff' | 'lost';
/** 追ってきている大岩・なだれ(s は線路の上の位置) */
export type Chaser = { s: number; v: number; to: number; kind: Chase['kind'] };

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
  snowSlip: 0.5, // 雪の上で、ブレーキがきかなくなる割合
  rampV: 12, rampBoost: 4, rampWindow: 0.15, // ジャンプ台: 上向きの速さ、台の上でジャンプしたときの上乗せ、台を離れてからジャンプがきく時間
  airSteer: 3.5, airSteerFree: 0.5, // 空中で体を傾けると、横へ動ける速さ(m/s)。ずれた線路へ向かう側だけ大きく動け、ほかは 0.5m まで
  senbeiDash: 1.6, senbeiReach: 1.8, // 鹿せんべい: 食べると、この秒数だけ全力で走る(ダッシュの待ち時間も0に)。この高さまでなら、跳んでいても食べられる
  catchDist: 4, // 大岩・なだれが、これより近づくと追いつかれる(m)
  // 追いかけっこ(8-11〜): 連結する近さ(m)、連結したあとのブレーキのきき(2台ぶん重い)、
  // まちがった分かれ道(古いレール)での最高速の割合、分かれ道で「選んだ」と見なす体の傾き、止まったと見なす速さ、
  // 鹿のトロッコがカーブで落とす速さ(横向きの力が latBase のこの割合まで)
  couple: 3, coupledBrake: 0.7, wrongCap: 0.7, forkLean: 0.3, stopV: 0.6, deerCurve: 0.85, hitchGap: 2.6,
} as const;

/** 追いかけっこの ★: 谷のふちまでの道のりの、どこで追いついたか(早いほど多い。コースを約3000mに のばしたので 80%・90%) */
export function pursuitStars(hitchS: number, cliff: number): 1 | 2 | 3 {
  const k = hitchS / cliff;
  return k <= 0.8 ? 3 : k <= 0.9 ? 2 : 1;
}

/** ジャンプ台から平らな所へ飛んだときの、とぶ距離(boost=台の上でジャンプした) */
export const rampReach = (v: number, boost: boolean): number => (v * 2 * (BAL.rampV + (boost ? BAL.rampBoost : 0))) / BAL.airG;

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
  /** 今の横風(強弱をつけたあと。プラスは右へ押す) */
  wind = 0;
  lives = 3; coins = 0; gold = 0; premium = false;
  collected = new Set<number>();
  hitIds = new Set<number>();
  dashT = 0; dashCool = 0; safeT = 0;
  braking = false;
  maxV = 0; jumps = 0;
  /** こぶで浮いた回数 */
  lifts = 0;
  /** ジャンプ台で飛んだ回数と、そのうち台の上でジャンプした回数 */
  ramps = 0; rampBoosts = 0;
  /** 食べた鹿せんべい(数と id) */
  senbei = 0; eaten = new Set<number>();
  /** 今 追ってきているもの(いなければ null)と、追いつかれたもの */
  chaser: Chaser | null = null; caughtBy: Chase['kind'] | '' = '';
  private nextChase = 0;
  private rampT = 99; private rampBoosted = false; private liftJump = false;
  /** この面の、ふつうの最高速と、ダッシュ中の最高速 */
  vMax: number; vDash: number;
  // ---- 追いかけっこ(track.pursuit がある面だけ) ----
  /** 前を走る、鹿の乗ったトロッコの位置・速さ */
  deerS = 0; deerV = 0;
  /** 連結したか、連結した時刻(この時間が ★ と記録になる) */
  coupled = false; hitchT = 0; hitchS = 0;
  /** 今いる分かれ道で、入った側(-1 左・1 右。分かれ道でなければ 0)と、まちがった側か */
  lane: -1 | 0 | 1 = 0; wrong = false;
  private fork: Fork | null = null;
  /** 分かれ道での、まん中からの横ずれ(m)。画面は、この分だけ横にずらして描く */
  laneX = 0;
  private events: CartEvent[] = [];
  private jumpHeld = false; private dashHeld = false; private jumpBuf = 0;
  private edgeT = 0; private doomed = false; private warned = false;
  /** 空中で横へ動いた量と、動ける範囲(飛びだした向きに対して) */
  private steer = 0; private steerLo = 0; private steerHi = 0; private steerRx = 0; private steerRz = 0;
  private nextCoin = 0; private nextObstacle = 0;

  constructor(track: Track) {
    this.track = track;
    this.vMax = track.vMax ?? BAL.vMax;
    this.vDash = this.vMax + (BAL.vDash - BAL.vMax);
    if (track.pursuit) { this.deerS = track.pursuit.lead; this.deerV = track.pursuit.deerStart ?? 20; }
    this.place();
  }
  /** 前のトロッコまでの距離(m)。連結したら 0 */
  get gapToDeer(): number { return this.track.pursuit && !this.coupled ? Math.max(0, this.deerS - this.s) : 0; }
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
    // 追ってくるもの: もう終わった所は出さない(途中から続けたときは、すぐ後ろにあらわれる)
    this.chaser = null;
    this.nextChase = this.track.chases.findIndex(c => c.to > s); if (this.nextChase < 0) this.nextChase = this.track.chases.length;
    this.place();
  }

  private place(): void {
    const p = this.track.at(this.s);
    this.px = p.x + Math.cos(p.heading) * this.laneX; this.py = p.y; this.pz = p.z + Math.sin(p.heading) * this.laneX; this.height = 0; this.side = 0;
  }
  private fail(reason: FailReason, kind: CartEventKind): void {
    this.phase = 'failed'; this.reason = reason; this.braking = false;
    this.events.push({ kind }, { kind: 'fail' });
  }
  private takeOff(vy: number): void {
    const p = this.track.at(this.s), flat = Math.cos(p.pitch);
    this.air = true; this.airT = 0; this.edgeT = 0; this.rampT = 99; this.liftJump = false;
    this.vx = Math.sin(p.heading) * flat * this.v;
    this.vz = -Math.cos(p.heading) * flat * this.v;
    this.vy = Math.sin(p.pitch) * this.v + vy;
    this.px = p.x; this.py = p.y; this.pz = p.z;
    // 空中で横へ動ける範囲: この先の切れ目が「ずれた線路」なら、その向きへ大きく
    const g = this.track.gaps.find(x => x.to > this.s - 1 && x.from < this.s + 40);
    const shift = g?.shift ?? 0, free = BAL.airSteerFree;
    this.steer = 0; this.steerLo = Math.min(0, shift) - free; this.steerHi = Math.max(0, shift) + free;
    this.steerRx = Math.cos(p.heading); this.steerRz = Math.sin(p.heading);
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
    if (input.dash && !this.dashHeld && this.dashCool <= 0 && !this.air && !this.coupled) {
      this.dashT = BAL.dashTime; this.dashCool = BAL.dashCool; this.events.push({ kind: 'dash' });
    }
    this.dashHeld = input.dash;
    const want = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dl = want - this.lean, ml = BAL.leanRate * dt;
    this.lean += Math.abs(dl) <= ml ? dl : Math.sign(dl) * ml;
    this.braking = input.brake && !this.air;

    if (this.air) {
      this.airT += dt; this.rampT += dt;
      // ジャンプ台を離れてすぐにジャンプしても、上乗せがきく
      if (!this.rampBoosted && this.rampT < BAL.rampWindow && this.jumpBuf > 0) {
        this.jumpBuf = 0; this.rampBoosted = true; this.rampBoosts++; this.vy += BAL.rampBoost; this.events.push({ kind: 'jump' });
      }
      // こぶで浮いた直後も、少しの間はまだ跳べる(切れ目のふちと同じ)
      if (this.liftJump && this.jumpBuf > 0 && this.airT < BAL.coyote) {
        this.liftJump = false; this.jumpBuf = 0; this.jumps++; this.vy += BAL.jumpV; this.events.push({ kind: 'jump' });
      }
      if (this.airT >= BAL.coyote) this.liftJump = false;
      this.vy -= BAL.airG * dt;
      this.px += this.vx * dt; this.py += this.vy * dt; this.pz += this.vz * dt;
      // 体を傾けると、横へ少し動ける
      const ns = Math.max(this.steerLo, Math.min(this.steerHi, this.steer + this.lean * BAL.airSteer * dt)), ds = ns - this.steer;
      this.steer = ns; this.px += this.steerRx * ds; this.pz += this.steerRz * ds;
      // 線路のどこの上にいるか(空中では、線路にすいつけない)
      const h = tr.at(this.s).heading;
      this.s += (this.vx * Math.sin(h) - this.vz * Math.cos(h)) * dt;
      const q = tr.at(this.s);
      this.side = (this.px - q.x) * Math.cos(q.heading) + (this.pz - q.z) * Math.sin(q.heading);
      this.height = this.py - q.y;
      // 着地は、線路より速く下へ向かっているときだけ(こぶの上で、少し浮いては着地をくり返さない)
      const trackVy = Math.tan(q.pitch) * Math.hypot(this.vx, this.vz);
      if (this.py <= q.y && this.airT > 0.05 && (this.vy <= trackVy + 0.05 || this.py < q.y - 0.08)) {
        if (this.doomed || tr.inGap(this.s)) {
          // 線路が無い所へ落ちた
          if (!this.doomed) { this.doomed = true; this.events.push({ kind: 'drop' }); }
          if (this.height < -7) { this.fail('fall', 'drop'); return; }
        } else if (Math.abs(this.side) > BAL.landWidth) {
          this.fail('miss', 'derail'); return;
        } else {
          this.air = false; this.py = q.y; this.height = 0; this.side = 0;
          // 線路にそった向きの速さを引きつぐ(急な下り坂へ着地すると、速いまま走れる)
          const flat = Math.cos(q.pitch);
          const along = this.vx * Math.sin(q.heading) * flat + this.vy * Math.sin(q.pitch) - this.vz * Math.cos(q.heading) * flat;
          this.v = Math.max(BAL.vMin, along * 0.98);
          this.events.push({ kind: 'land' });
        }
      }
    } else {
      const p = tr.at(this.s);
      let a = -BAL.g * Math.sin(p.pitch) - BAL.roll - BAL.drag * this.v * this.v;
      // 追いかけっこの面は、鹿が引かない(鹿も前のトロッコに乗っている)。坂だけで走る
      if (!tr.pursuit && this.v < BAL.vPull) a += BAL.pull * (1 - this.v / BAL.vPull);
      // 雪の上では、ブレーキが半分しかきかない(すべる)。連結したあとは2台ぶん重く、ききが弱い
      if (this.braking) a -= BAL.brake * (1 - BAL.snowSlip * tr.snowAt(this.s)) * (this.coupled ? BAL.coupledBrake : 1);
      if (this.dashT > 0) a += BAL.dashAcc;
      this.v += a * dt;
      let cap = this.dashT > 0 ? this.vDash : this.vMax;
      if (this.wrong) cap = Math.min(cap, this.vMax * BAL.wrongCap); // まちがった分かれ道: 古いレールで、ガタガタ おそい
      if (this.v > cap) this.v = Math.max(cap, this.v - 6 * dt);
      this.v = Math.max(this.coupled ? 0 : BAL.vMin, this.v); // 連結したあとは、止まれる
      this.s += this.v * dt;
      if (tr.pursuit) this.updateLane();
      const q = tr.at(this.s);
      this.px = q.x + Math.cos(q.heading) * this.laneX; this.py = q.y; this.pz = q.z + Math.sin(q.heading) * this.laneX; this.height = 0; this.side = 0;

      // カーブと横風: 横向きの力が上限をこえると、車輪が浮いていき、やがて脱線
      // need はプラスなら「右へ傾けると、こらえられる」(右カーブの遠心力・左から吹く風)
      this.wind = tr.windAt(this.s) * (0.7 + 0.3 * Math.sin(this.t * 1.6 + this.s * 0.031));
      const need = this.v * this.v * q.curv - this.wind;
      const dir = Math.sign(need), inward = this.lean * dir;
      this.lat = Math.abs(need);
      this.latLimit = BAL.latBase + BAL.latLean * Math.max(0, inward) - BAL.latOut * Math.max(0, -inward);
      if (this.lat > this.latLimit) {
        this.tilt += (this.lat - this.latLimit) * BAL.tiltRate * dt; this.tiltDir = -dir;
        if (!this.warned && this.tilt > 0.25) { this.warned = true; this.events.push({ kind: 'tilt' }); }
        if (this.tilt >= 1) { this.tilt = 1; this.fail('derail', 'derail'); return; }
      } else {
        this.tilt = Math.max(0, this.tilt - BAL.tiltDecay * dt);
        if (this.tilt === 0) this.warned = false;
      }

      // こぶ(峠): 速すぎると、下へ折れる線路についていけず、車体が浮いて飛ぶ
      const bend = -tr.pitchRate(this.s);
      if (bend > 0 && this.v * this.v * bend > BAL.g * Math.cos(q.pitch) && !tr.inGap(this.s) && this.jumpBuf <= 0) {
        this.lifts++; this.takeOff(0); this.liftJump = true; this.events.push({ kind: 'lift' });
      } else if (tr.inGap(this.s)) {
        // 線路の切れ目: 少しの間は、まだ跳べる。跳ばなければ、そのまま飛び出して落ちる
        this.edgeT += dt;
        if (this.jumpBuf > 0) { this.jumpBuf = 0; this.jumps++; this.takeOff(BAL.jumpV); this.events.push({ kind: 'jump' }); }
        else if (this.edgeT > BAL.coyote) this.takeOff(0);
      } else {
        this.edgeT = 0;
        // ジャンプ台の直前で押したときは、台の上まで とっておく(台を飛びこさない)
        // (この一瞬で台を通りすぎる場合も、台のために とっておく)
        const rampSoon = tr.obstacles.some(o => o.kind === 'ramp' && o.s > prevS && o.s - this.s < this.v * BAL.jumpBuffer + 1);
        if (this.jumpBuf > 0 && !rampSoon) { this.jumpBuf = 0; this.jumps++; this.takeOff(BAL.jumpV); this.events.push({ kind: 'jump' }); }
      }
    }
    this.maxV = Math.max(this.maxV, this.v);

    // 後ろから追ってくるもの: from を通るとあらわれ、同じ速さで追ってくる。to まで来ると落ちる(止まる)
    const cs = tr.chases;
    if (!this.chaser && this.nextChase < cs.length && this.s >= cs[this.nextChase].from) {
      const c = cs[this.nextChase++];
      this.chaser = { s: this.s - c.behind, v: c.v, to: c.to, kind: c.kind };
      this.events.push({ kind: 'chase' });
    }
    if (this.chaser) {
      const c = this.chaser;
      c.s += c.v * dt;
      // to(谷のふち・トンネルの入口)をこえて着地したら、ふりきった(大岩は谷へ落ち、なだれは入口で止まる)
      if (c.s >= c.to || (this.s > c.to + 12 && !this.air)) { this.chaser = null; this.events.push({ kind: 'chaseEnd' }); }
      else if (c.s >= this.s - BAL.catchDist && !this.doomed) { this.caughtBy = c.kind; this.fail('caught', 'caught'); return; }
    }

    // 障害物(通りすぎた瞬間に判定)
    while (this.nextObstacle < tr.obstacles.length && tr.obstacles[this.nextObstacle].s <= this.s) {
      const o = tr.obstacles[this.nextObstacle++];
      if (o.kind === 'ramp') {
        // ジャンプ台: 地面を走っていれば、高く飛びだす。台の上でジャンプしていれば、もっと高く
        if (o.s <= prevS || this.doomed || this.air) continue;
        const boost = this.jumpBuf > 0;
        if (boost) { this.jumpBuf = 0; this.rampBoosts++; }
        this.ramps++; this.takeOff(BAL.rampV + (boost ? BAL.rampBoost : 0));
        this.rampT = 0; this.rampBoosted = boost;
        this.events.push({ kind: 'ramp' });
        continue;
      }
      if (o.kind === 'senbei') {
        // 鹿せんべい: 低い所を通れば、鹿が食べて すぐ全力で走る(横にあるものは、体を傾けて取る)
        if (o.s <= prevS || this.doomed || this.height > BAL.senbeiReach) continue;
        if (o.side && this.lean * o.side <= BAL.leanDodge) continue;
        this.senbei++; this.eaten.add(o.id);
        this.dashT = Math.max(this.dashT, BAL.senbeiDash); this.dashCool = 0;
        this.events.push({ kind: 'senbei', id: o.id });
        continue;
      }
      if (o.s <= prevS || this.safeT > 0 || this.doomed) continue;
      const hit = o.kind === 'branch'
        ? this.lean * (o.side ?? 1) > -BAL.leanDodge // 枝の反対へ、体を傾けていないと当たる
        : this.height < BAL.clear[o.kind as 'rock' | 'log'];
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
    if (tr.pursuit) { this.stepPursuit(dt); return; }
    if (!this.air && this.s >= tr.length) { this.phase = 'cleared'; this.braking = false; this.events.push({ kind: 'clear' }); }
  }

  /** 分かれ道: 入る瞬間の体の傾きで、どちらへ行くか決まる(傾けていなければ、まちがった側へ) */
  private updateLane(): void {
    const f = this.track.forkAt(this.s);
    if (f && this.fork !== f) {
      this.fork = f;
      const pick = Math.abs(this.lean) >= BAL.forkLean ? (Math.sign(this.lean) as -1 | 1) : (-f.correct as -1 | 1);
      this.lane = pick; this.wrong = pick !== f.correct;
      this.events.push({ kind: this.wrong ? 'forkWrong' : 'forkRight' });
    } else if (!f && this.fork) { this.fork = null; this.lane = 0; this.wrong = false; }
    this.laneX = this.fork ? this.lane * FORK_W * forkShape(this.fork, this.s) : 0;
  }

  /** 前のトロッコを動かし、連結・止まった・谷へ を決める */
  private stepPursuit(dt: number): void {
    const tr = this.track, pu = tr.pursuit!;
    if (!this.coupled) {
      const p = tr.at(this.deerS);
      let a = -BAL.g * Math.sin(p.pitch) - BAL.roll - BAL.drag * this.deerV * this.deerV;
      this.deerV = Math.max(BAL.vMin, this.deerV + a * dt);
      // カーブでは、脱線しない速さまで落とす(勝手に走るトロッコは、脱線しない)
      const curv = Math.abs(tr.sharpestAhead(this.deerS, Math.max(10, this.deerV * 0.6)));
      const safe = curv > 1e-4 ? Math.sqrt((BAL.latBase * BAL.deerCurve) / curv) : Infinity;
      this.deerV = Math.min(this.deerV, pu.deerCap, Math.max(BAL.vMin, safe));
      this.deerS += this.deerV * dt;
      if (this.deerS >= pu.cliff) { this.fail('lost', 'deerLost'); return; }
      // 追いついた: 地面の上で、分かれ道の外なら 連結
      if (this.deerS - this.s <= BAL.couple && !this.air && !this.fork) {
        this.coupled = true; this.hitchT = this.t; this.hitchS = this.s; this.dashT = 0;
        this.v = (this.v + this.deerV) / 2; // ぶつかって つながる(速さは2台の間)
        this.events.push({ kind: 'hitch' });
      }
    }
    if (this.coupled) this.deerS = this.s + BAL.hitchGap;
    if (this.s >= pu.cliff) { this.fail('cliff', 'drop'); return; }
    if (this.coupled && !this.air && this.v <= BAL.stopV) {
      this.v = 0; this.phase = 'cleared'; this.braking = false; this.events.push({ kind: 'clear' });
    }
  }
}
