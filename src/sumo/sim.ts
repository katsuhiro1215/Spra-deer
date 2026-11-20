// WORLD 6「鹿ずもう」の勝負のしくみ(絵を描かない。1/60秒ずつ進める。乱数を使わないので、同じ操作なら同じ結果)。
// 試作(showcases/deersample9 の Match.ts)のルールを移した: 押す(緑のタイミング)・ため押し(金色で はなす)・いなす(相手の「今！」で)。
import { PLAYER_DEER, type SumoLevel, type SumoOpponent } from './levels.ts';

export const RULES = {
  /** 土俵の端(この位置まで押したら、押し出し) */
  edge: 2.8,
  /** 緑のタイミングの周期(秒)と、ぴったりの幅 */
  beat: 0.92, perfectWindow: 0.14,
  pushCooldown: 0.25, dodgeCooldown: 2.3,
  /** ため押し: 最長、金色の区間 */
  chargeMax: 1.5, chargeSweet: 1.0, chargeSweetEnd: 1.35,
  /** 「いなす」の受付(秒)と、「今！」を出す残り時間 */
  dodgeTime: 0.47, nowAt: 0.36,
  /** 時間切れのとき、これより押しこんでいれば勝ち */
  judge: 0.18,
  /** 息切れで押せない時間(秒) */
  gassed: 1.5,
} as const;

export type Phase = 'ready' | 'countdown' | 'playing' | 'won' | 'lost' | 'draw';
export type BoutEvent = { kind: 'push' | 'perfect' | 'charge' | 'dodge' | 'counter' | 'enemy' | 'strong' | 'windup' | 'feint' | 'tired' | 'start' | 'round' | 'won' | 'lost' | 'draw'; text: string };

/** フェイント: ためる時間の この割合で、ためるのを やめる(「今！」より前) */
export const FEINT_AT = 0.55;

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export class Bout {
  readonly level: SumoLevel;
  phase: Phase = 'ready';
  time = 0; countdown = 3;
  /** 土俵の上の位置(+ は相手側へ押しこんでいる) */
  position = 0; velocity = 0;
  stamina = 100;
  charge = 0; charging = false;
  dodge = 0; dodgeCooldown = 0; pushCooldown = 0;
  /** いなしたあとの、切り返しのチャンス(秒) */
  vulnerable = 0;
  enemyState: 'rest' | 'windup' | 'stumble' = 'rest';
  enemyTimer = 2.3; enemyAttacks = 0;
  playerImpact = 0; enemyImpact = 0;
  perfects = 0; counters = 0; pushes = 0; feints = 0;
  /** 息切れ(スタミナを使い切った)の残り時間。この間は押せない */
  gassed = 0;
  /** 押し出しで決まったか(時間切れでなく)。勝ち抜きは、全部の番が押し出しか */
  pushedOut = false;
  private allOut = true;
  /** 勝ち抜きの何番目か(0から)と、それまでの番の時間の合計 */
  round = 0;
  private pastTime = 0;
  /** ためた回数と、今のためが ふり(フェイント)か */
  private windups = 0;
  feint = false;
  private events: BoutEvent[] = [];

  constructor(level: SumoLevel) { this.level = level; }

  /** 今の相手 */
  get opp(): SumoOpponent { return this.level.opponents[this.round]; }
  get rounds(): number { return this.level.opponents.length; }
  /** 全部の番の時間の合計 */
  get totalTime(): number { return this.pastTime + this.time; }
  get remaining(): number { return Math.max(0, this.level.duration - this.time); }
  get beatPhase(): number { return (this.time % RULES.beat) / RULES.beat; }
  get onBeat(): boolean { return Math.abs(this.beatPhase - 0.5) < RULES.perfectWindow; }
  get active(): boolean { return this.phase === 'playing'; }
  get done(): boolean { return this.phase === 'won' || this.phase === 'lost' || this.phase === 'draw'; }
  /** 相手の強い押しの直前(いなすなら今)。ためるふりのときは出ない */
  get dodgeNow(): boolean { return this.active && this.enemyState === 'windup' && !this.feint && this.enemyTimer < RULES.nowAt * PLAYER_DEER.dodge; }
  /** ためのすすみぐあい(0〜1。ふりも、本当のためと同じに見える) */
  get windupProgress(): number {
    const w = this.opp.windup;
    return Math.max(0, Math.min(1, 1 - (this.enemyTimer + (this.feint ? w * (1 - FEINT_AT) : 0)) / w));
  }
  /** こちらの押しの勢いを足す(重い相手ほど、動きにくい) */
  private gain(v: number) { this.velocity += v / (this.opp.weight ?? 1); }

  start(): void { if (this.phase === 'ready') this.phase = 'countdown'; }
  drain(): BoutEvent[] { return this.events.splice(0); }
  private emit(kind: BoutEvent['kind'], text: string) { this.events.push({ kind, text }); }
  cancelCharge(): void { this.charging = false; this.charge = 0; }

  push(): boolean {
    if (!this.active || this.pushCooldown > 0 || this.charging || this.gassed > 0) return false;
    this.pushCooldown = RULES.pushCooldown;
    const perfect = this.onBeat, energy = this.stamina >= 12 ? 1 : 0.28;
    this.stamina = Math.max(0, this.stamina - (perfect ? 8 : 15));
    this.pushes++;
    const counter = this.vulnerable > 0;
    this.gain((perfect ? 0.85 : 0.2) * PLAYER_DEER.power * energy * (counter ? 1.8 : 1));
    this.playerImpact = 1;
    if (counter) { this.counters++; this.vulnerable = 0; this.emit('counter', '切り返し！'); }
    else if (this.stamina <= 0) { this.gassed = RULES.gassed; this.emit('tired', '息切れ！ ひと休み'); }
    else if (energy < 1) this.emit('tired', 'ひと呼吸… スタミナ回復');
    else if (perfect) { this.perfects++; this.emit('perfect', 'ぴったり！'); }
    else this.emit('push', 'よいしょ！');
    return true;
  }

  beginCharge(): boolean {
    if (!this.active || this.charging || this.stamina < 18 || this.dodge > 0) return false;
    this.charging = true; this.charge = 0;
    return true;
  }

  releaseCharge(): boolean {
    if (!this.charging) return false;
    const amount = this.charge;
    this.cancelCharge();
    if (!this.active || amount < 0.25) return false;
    const sweet = amount >= RULES.chargeSweet && amount <= RULES.chargeSweetEnd, counter = this.vulnerable > 0;
    this.gain((sweet ? 1.6 : 0.6 + amount * 0.3) * PLAYER_DEER.power * (counter ? 1.4 : 1));
    this.playerImpact = 1.5; this.pushCooldown = 0.35;
    if (counter) { this.counters++; this.vulnerable = 0; }
    if (sweet) this.perfects++;
    this.emit(counter ? 'counter' : 'charge', counter ? 'ためて、切り返し！' : sweet ? '会心の 角押し！' : '角押し！');
    return true;
  }

  evade(): boolean {
    if (!this.active || this.dodgeCooldown > 0 || this.stamina < 14) return false;
    this.cancelCharge();
    this.stamina -= 14;
    this.dodge = RULES.dodgeTime * PLAYER_DEER.dodge;
    this.dodgeCooldown = RULES.dodgeCooldown / PLAYER_DEER.dodge;
    this.emit('dodge', 'すいっ！');
    return true;
  }

  private enemyPush(strong: boolean) {
    const o = this.opp;
    if (this.dodge > 0) {
      this.enemyState = 'stumble'; this.enemyTimer = 1.1; this.vulnerable = 1.6; this.gain(0.4);
      this.emit('counter', 'いなした！ 今が 押しどき');
      return;
    }
    this.velocity -= (strong ? 2.5 : 0.98) * o.force;
    this.enemyImpact = strong ? 1.5 : 1;
    this.emit(strong ? 'strong' : 'enemy', strong ? '相手の 角押し！' : 'ぐぐっ…');
    if (strong && this.charging) { this.cancelCharge(); this.emit('strong', 'ため中を 押された！'); }
    this.enemyState = 'rest'; this.enemyTimer = o.interval;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.phase = 'playing'; this.emit('start', 'はっけよい！'); }
      return;
    }
    if (this.phase !== 'playing') return;
    const o = this.opp;
    this.time += dt;
    this.playerImpact = Math.max(0, this.playerImpact - dt * 3); this.enemyImpact = Math.max(0, this.enemyImpact - dt * 3);
    this.pushCooldown = Math.max(0, this.pushCooldown - dt); this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.dodge = Math.max(0, this.dodge - dt); this.vulnerable = Math.max(0, this.vulnerable - dt);
    this.gassed = Math.max(0, this.gassed - dt);
    if (this.charging) {
      this.charge = Math.min(RULES.chargeMax, this.charge + dt);
      this.stamina = Math.max(0, this.stamina - dt * 24);
      if (this.stamina === 0 || this.charge >= RULES.chargeMax) this.releaseCharge();
    } else this.stamina = Math.min(100, this.stamina + dt * 15 * PLAYER_DEER.recovery);
    this.enemyTimer -= dt;
    if (this.enemyTimer <= 0) {
      if (this.enemyState === 'windup' && this.feint) {
        // ためるふり: やめて、すぐ ふつうに押してくる(あわてて いなすと、ここで押される)
        this.feint = false; this.feints++;
        this.enemyState = 'rest'; this.enemyTimer = 0.45;
        this.emit('feint', 'ためる ふり！');
      } else if (this.enemyState === 'windup') this.enemyPush(true);
      else if (this.enemyState === 'stumble') { this.enemyState = 'rest'; this.enemyTimer = 0.8; }
      else {
        this.enemyAttacks++;
        if (o.windupEvery > 0 && this.enemyAttacks % o.windupEvery === 0) {
          this.windups++;
          this.feint = !!o.feintEvery && this.windups % o.feintEvery === 0;
          this.enemyState = 'windup'; this.enemyTimer = o.windup * (this.feint ? FEINT_AT : 1);
          this.emit('windup', '相手が ためている…');
        } else this.enemyPush(false);
      }
    }
    this.velocity = clamp(this.velocity, -5, 5);
    this.position += this.velocity * dt;
    this.velocity *= Math.exp(-(this.level.friction ?? 2.35) * dt);
    if (this.position >= RULES.edge) this.finish('won', true);
    else if (this.position <= -RULES.edge) this.finish('lost', true);
    else if (this.time >= this.level.duration) this.finish(this.position > RULES.judge ? 'won' : this.position < -RULES.judge ? 'lost' : 'draw', false);
  }

  private finish(phase: 'won' | 'lost' | 'draw', out: boolean) {
    // 勝ち抜き: 次の相手がいれば、少し休んで 次の番へ(スタミナは引きつぐ。少しだけ回復)
    if (phase === 'won' && this.round < this.rounds - 1) {
      this.allOut &&= out;
      this.pastTime += this.time;
      this.round++;
      this.time = 0; this.position = 0; this.velocity = 0;
      this.phase = 'countdown'; this.countdown = 2.5;
      this.stamina = Math.min(100, this.stamina + 25);
      this.cancelCharge(); this.dodge = 0; this.dodgeCooldown = 0; this.vulnerable = 0; this.pushCooldown = 0;
      this.enemyState = 'rest'; this.enemyTimer = 2.3; this.enemyAttacks = 0; this.windups = 0; this.feint = false;
      this.playerImpact = 0; this.enemyImpact = 0;
      this.emit('round', `${this.round}番 勝ち！ 次は ${this.opp.name}`);
      return;
    }
    this.allOut &&= out;
    this.phase = phase; this.pushedOut = this.allOut;
    this.cancelCharge(); this.dodge = 0; this.velocity = 0;
    this.emit(phase, phase === 'won' ? (out ? '押し出し！ 勝ち！' : '時間切れ… 優勢で 勝ち！') : phase === 'lost' ? (out ? '押し出された…' : '時間切れ… 押しこまれた') : '引き分け！');
  }

  /** ★の数(勝ち=1、押し出し=2、早く押し出し=3) */
  get stars(): number {
    if (this.phase !== 'won') return 0;
    if (!this.pushedOut) return 1;
    return this.totalTime <= this.level.par ? 3 : 2;
  }
  /** もらえるシルバーコイン */
  get silver(): number { return this.phase === 'won' ? 15 + this.perfects * 2 + this.counters * 3 : 0; }
}
