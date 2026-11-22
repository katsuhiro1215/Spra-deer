// WORLD 8「鹿と暴走トロッコ」の組み立て: 入力・画面の表示(HUD)・音・ループ・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { CART_BGM, RunnerAudio } from '../runner/audio.ts';
import { CART_LEVELS, trackOf, type CartLevel } from './levels.ts';
import { COLLAPSE_AT, SIGNS } from './track.ts';
import { BAL, CartRun, pursuitStars, rampReach, type CartEvent, type Input } from './sim.ts';
import { friendOf } from '../friends.ts';
import { CartView } from './view.ts';

const STEP = 1 / 120;
const KMH = 3.6;

const FAIL_TEXT: Record<string, [string, string]> = {
  fall: ['線路の 切れ目に 落ちた…', '黄色い枕木の所で ジャンプ。速さが たりないときは、手前で ダッシュ！'],
  derail: ['カーブで 脱線した…', 'カーブの前で ブレーキ。内がわへ 体を かたむけると、ねばれるよ'],
  miss: ['着地が 線路から はずれた…', 'ジャンプは、まっすぐな所で'],
  broken: ['トロッコが こわれた…', '岩と 倒木は ジャンプ。枝は、反対へ 体を かたむけて よけよう'],
  caught: ['大岩に 追いつかれた…', '上り坂は ダッシュ！ 鹿せんべいを 食べると、鹿が 全力で 走るよ'],
  caughtAvalanche: ['なだれに のみこまれた…', '止まらずに すべりおりよう。ダッシュで なだれを ふりきれ！'],
  // 追いかけっこ
  cliff: ['止まりきれずに、谷へ…！', '連結したら すぐ ブレーキ！ 早く 追いつくほど、止める きょりが 長く とれるよ'],
  lost: ['間に合わなかった… 鹿のトロッコが 谷へ', 'こぐ(ダッシュ)を どんどん使おう。分かれ道は 鈴の音が する方へ'],
  beaten: ['モンスターに やられた…', '線路の上の モンスターは ジャンプ。わきから 張り出していたら、反対へ かたむけて よけよう'],
};
const CHASER_NAME = { boulder: '大岩', avalanche: 'なだれ' } as const;

export function startCart(root: HTMLElement, level: CartLevel): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const track = trackOf(level);
  const wallet = new Wallet();
  const progress = new Progress();
  // プレミアムコインは1つの面に1枚だけ。もう取った面には出さない(設計書 25-3)
  const premiumTaken = wallet.hasPremium(level.id);
  if (premiumTaken) track.coins = track.coins.filter(c => c.kind !== 'premium');
  const silverTotal = track.coins.filter(c => c.kind === undefined).length;
  const view = new CartView(q('stage'), track);
  // 次の面(追いかけっこの面は、ボーナスなので 次は無い)
  const idx = CART_LEVELS.findIndex(l => l.id === level.id);
  const nextLevel = idx >= 0 ? CART_LEVELS[idx + 1] as CartLevel | undefined : undefined;
  // 追いかけっこ(仲間の鹿の面): 鹿は 前のトロッコに乗っている。ダッシュは Spra が こぐ
  const pu = track.pursuit, friendName = pu ? friendOf(pu.friend)?.name ?? '鹿' : '';
  const obstacleById = new Map(track.obstacles.map(o => [o.id, o]));

  // チェックポイント: 通ったときの状態を覚えておき、失敗したら、そこから続けられる
  type Snapshot = { s: number; name: string; t: number; coins: number; gold: number; premium: boolean; collected: Set<number> };
  const cpEls = track.checkpoints.map(c => {
    const el = document.createElement('span');
    el.className = 'ks-progress-cp';
    el.style.left = `${(c.s / track.length) * 100}%`;
    q('mark').before(el);
    return el;
  });
  let saved: Snapshot | null = null;
  let charged = false, continued = false, recorded = false;

  q('lv-id').textContent = `面 ${level.id}`;
  q('lv-title').textContent = level.title;
  q('lv-goal').textContent = level.goalName;
  q('s-title').textContent = level.title;
  q('s-lead').textContent = level.summary;
  if (pu) {
    q('dash').innerHTML = '<b>こぐ</b><small>Spraが 加速</small>';
    q('dash').setAttribute('aria-label', 'こぐ');
    const how = root.querySelector('.ks-how');
    if (how) how.innerHTML = `<li><b>こぐ</b> Spraが こいで 加速。どんどん 使おう(Shift)</li>${track.foes.length ? '<li><b>モンスター</b> 線路の上は ジャンプ、わきから 張り出していたら 反対へ かたむけて よける</li>' : ''}<li><b>◀ ▶</b> 分かれ道は、鈴の音が する方へ かたむける(← →)</li><li><b>ブレーキ</b> 追いついて 連結したら、谷の手前で 止める(↓ / S)</li><li><b>ジャンプ</b> 岩・倒木を とびこえる(スペース)</li>`;
    q('chase').classList.add('pursuit');
    const dt_ = q('r-time').previousElementSibling; if (dt_) dt_.textContent = '追いつくまで';
  }
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ' : '◆ この面には プレミアムコインが 1まい かくれている';

  let run = new CartRun(track);
  const input: Input = { left: false, right: false, jump: false, brake: false, dash: false };

  // ---- 音 ----
  const audio = new RunnerAudio();
  let ac: AudioContext | null = null;
  const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.09, delay = 0) => {
    if (!ac) return;
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.out ?? ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const noiseBuf = (sec: number) => {
    const len = Math.floor(ac!.sampleRate * sec), buf = ac!.createBuffer(1, len, ac!.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };
  /** 短い「ドン」「ガシャ」(ノイズ)。 */
  const thud = (dur: number, vol: number, freq: number, delay = 0) => {
    if (!ac) return;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime + delay;
    src.buffer = noiseBuf(dur);
    f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(audio.out ?? ac.destination);
    src.start(t0);
  };
  // 走っている間ずっと鳴る音: 風・車輪のゴロゴロ・ブレーキのキーッ(大きさを、速さに合わせて変える)
  type Loop = { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode };
  let loops: { wind: Loop; rumble: Loop; screech: Loop; roar: Loop } | null = null;
  const startLoops = () => {
    if (!ac || loops) return;
    const make = (type: BiquadFilterType, freq: number, Q: number): Loop => {
      const src = ac!.createBufferSource(), filter = ac!.createBiquadFilter(), gain = ac!.createGain();
      src.buffer = noiseBuf(2); src.loop = true;
      filter.type = type; filter.frequency.value = freq; filter.Q.value = Q;
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(audio.out ?? ac!.destination);
      src.start();
      return { gain, filter, src };
    };
    // roar: 後ろから追ってくる大岩・なだれの地鳴り
    loops = { wind: make('bandpass', 700, 0.6), rumble: make('lowpass', 150, 0.8), screech: make('bandpass', 2900, 9), roar: make('lowpass', 90, 0.7) };
  };
  const setLoop = (l: Loop, vol: number, freq?: number) => {
    if (!ac) return;
    l.gain.gain.setTargetAtTime(vol, ac.currentTime, 0.06);
    if (freq !== undefined) l.filter.frequency.setTargetAtTime(freq, ac.currentTime, 0.1);
  };
  let nextClack = 0;
  /** 鈴(追いかけっこ): pan=-1 左〜1 右。分かれ道では、鹿のトロッコが行った側から聞こえる */
  const bell = (pan: number, vol: number) => {
    if (!ac) return;
    const sp = ac.createStereoPanner(); sp.pan.value = Math.max(-1, Math.min(1, pan));
    sp.connect(audio.out ?? ac.destination);
    for (const [f, v, d] of [[1568, 1, 0.9], [2349, 0.5, 0.6], [3136, 0.25, 0.4]] as const) {
      const t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(vol * v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g).connect(sp); o.start(t0); o.stop(t0 + d + 0.02);
    }
  };
  let nextBell = 0;
  /** 鈴の聞こえる向き: 鹿のトロッコが分かれ道の中なら、その側。まだなら、まん中(前) */
  const bellSide = (): number => {
    if (!pu) return 0;
    const fk = track.forkAt(run.deerS) ?? pu.forks.find(f => f.at > run.s && f.at <= run.deerS + 5);
    return fk && run.s < fk.at + fk.len ? fk.correct : 0;
  };
  let bellEl: HTMLElement | null = null;
  if (pu) { bellEl = document.createElement('div'); bellEl.className = 'ct-bell'; bellEl.textContent = '🔔'; bellEl.hidden = true; q('stage').after(bellEl); }
  const sound = (e: CartEvent) => {
    switch (e.kind) {
      case 'coin': tone(1180, 1760, 0.13, 'triangle', 0.07); break;
      case 'gold': audio.sfx('gold'); break;
      case 'premium': audio.sfx('premium'); break;
      case 'jump': audio.sfx('jump'); break;
      case 'ramp': audio.sfx('jump'); tone(300, 1100, 0.4, 'triangle', 0.08); break;
      case 'lift': tone(520, 900, 0.35, 'sine', 0.07); hint('lift', 'ふわっ！ こぶで 空へ とびだした！', 2400); break;
      case 'dash': audio.sfx('dash'); break;
      case 'land': thud(0.22, 0.4, 260); tone(120, 60, 0.12, 'sine', 0.08); break;
      case 'hit': audio.sfx('hit'); thud(0.4, 0.35, 500); break;
      case 'tilt': tone(1400, 1700, 0.12, 'square', 0.04); tone(1400, 1700, 0.12, 'square', 0.04, 0.16); break;
      case 'drop': tone(620, 60, 0.9, 'triangle', 0.09); break;
      case 'derail': thud(0.9, 0.5, 900); tone(180, 40, 0.6, 'sawtooth', 0.08); break;
      // 鹿せんべい: サクッ と食べて、鹿が はりきる
      case 'senbei': thud(0.09, 0.35, 3200); thud(0.08, 0.3, 2600, 0.07); tone(660, 1320, 0.25, 'triangle', 0.07, 0.1); audio.sfx('dash'); break;
      case 'chase': thud(1.4, 0.55, 140); tone(70, 45, 1.4, 'sawtooth', 0.05); break;
      case 'chaseEnd': thud(1.2, 0.5, 120, 0.25); break;
      case 'caught': thud(1.2, 0.7, 260); tone(120, 35, 0.9, 'sawtooth', 0.09); break;
      case 'forkRight': tone(880, 1320, 0.18, 'triangle', 0.06); break;
      case 'forkWrong': thud(0.5, 0.3, 700); tone(300, 180, 0.3, 'square', 0.04); break;
      case 'hitch': thud(0.35, 0.6, 900); tone(520, 1040, 0.3, 'triangle', 0.08, 0.05); break;
      case 'deerLost': tone(620, 60, 1.2, 'triangle', 0.09); break;
      case 'foeHit': audio.sfx('hit'); thud(0.45, 0.4, 420); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elCoins = q('coins'), elGold = q('gold'), elPrem = q('prem'), elHearts = q('hearts'), elFill = q('fill'), elMark = q('mark');
  const elSpeed = q('speed'), elSeg = q('seg'), elAlert = q('alert'), elToast = q('toast'), elStart = q('start'), elResult = q('result');
  const elDash = q('dash'), elBrake = q('brake'), elJump = q('jump'), elPad = q('pad'), elSay = q('say');
  const elChase = q('chase'), elChaseName = q('chase-name'), elChaseM = q('chase-m'), elChaseBar = q('chase-bar');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2400) => {
    elToast.textContent = msg; elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  /** 先を見て、今やることを大きく出す(ブレーキ・かたむける・ジャンプ・ダッシュ)。 */
  const alertText = (): [string, string] => {
    if (run.phase !== 'running') return ['', ''];
    const s = run.s, v = run.v;
    if (run.tilt > 0.2) return ['あぶない！ 車輪が 浮いている！', 'red'];
    if (run.air) {
      // ずれた線路の上: 空中で、ずれた側へ傾ける
      const sg = track.shiftGapNear(s);
      return sg ? [sg.shift! > 0 ? '右へ かたむけて ▶ 線路が ずれてる！' : '◀ 左へ かたむけて 線路が ずれてる！', 'jump'] : ['', ''];
    }
    // 追いかけっこ: 連結したら止める / 分かれ道 / まちがえた
    if (pu) {
      if (run.coupled) return v > BAL.stopV ? [`ブレーキ！ 谷まで あと ${Math.max(0, Math.round(pu.cliff - s))}m`, 'red'] : ['', ''];
      if (run.wrong) return ['まちがえた！ おそい…', 'red'];
      // 十二星座のモンスター: 線路の上は ジャンプ、わきから 張り出していたら 反対へ かたむける
      const foe = track.foes.find(x => !run.passed.has(x.id) && x.s > s);
      if (foe) {
        const d = foe.s - s;
        if (foe.dodge === 'jump') { if (d < v * 0.75 + 3) return ['モンスター！ ジャンプ！', 'jump']; if (d < v * 1.8 + 12) return ['線路に モンスター！ ジャンプで こえて', 'yellow']; }
        else if (d < v * 1.5 + 8) return [foe.side === 1 ? '◀ 左へ かたむけて よけて！' : '右へ かたむけて よけて！ ▶', d < v * 0.6 + 3 ? 'red' : 'yellow'];
      }
      const fk = pu.forks.find(f => f.at + 1 > s && f.at - s < v * 2.2 + 14);
      if (fk) return ['分かれ道！ 鈴の方へ', 'yellow'];
    }
    // ジャンプ台
    const ramp = track.obstacles.find(o => o.kind === 'ramp' && o.s > s - 0.5 && o.s - s < v * 2.2 + 12);
    if (ramp) {
      const rg = track.gaps.find(x => x.from >= ramp.s && x.from - ramp.s <= 20);
      if (ramp.s - s < Math.max(4, v * 0.3)) return ['ジャンプ台で ジャンプ！', 'jump'];
      if (rg && rampReach(v, true) < rg.to + 4 - ramp.s) return [run.dashCool <= 0 ? 'スピードが たりない！ ダッシュ！' : 'スピードが たりない！', 'red'];
      return ['ジャンプ台！ 台の上で ジャンプすると、もっと遠くへ', 'yellow'];
    }
    const gap = track.gaps.find(g => g.to > s);
    if (gap && gap.from - s < v * 2.2 + 12 && gap.from - s > -1) {
      // 次の切れ目がすぐ先(空中の線路): 速すぎると、次の切れ目に落ちる
      const next = track.gaps.find(g => g.from > gap.to);
      if (next && next.from - gap.from < 45 && v > next.from - 3 - gap.from && gap.from - s > Math.max(5, v * 0.4)) return ['速すぎる！ ブレーキ', 'red'];
      const need = gap.to - gap.from + 3;
      if (gap.from - s < Math.max(5, v * 0.4)) return [gap.shift ? `ジャンプ！ 空中で ${gap.shift > 0 ? '右へ ▶' : '◀ 左へ'}` : 'ジャンプ！', 'jump'];
      // 崩れる橋: 崩れるまでは、まだ橋がある
      if (gap.collapse) return gap.from - s < COLLAPSE_AT ? ['橋が 崩れた！ ジャンプ！', 'red'] : ['古い橋… ぐらぐら している', 'yellow'];
      if (v < need) return [run.dashCool <= 0 ? 'スピードが たりない！ ダッシュ！' : 'スピードが たりない！', 'red'];
      return ['もうすぐ 切れ目！ 黄色で ジャンプ', 'yellow'];
    }
    // まん中の鹿せんべいは、通るだけで食べられる(知らせない)
    const o = track.obstacles.find(x => x.s > s && !run.hitIds.has(x.id) && !(x.kind === 'senbei' && !x.side));
    if (o && o.s - s < v * 1.3 + 6) {
      if (o.kind === 'senbei') return [o.side === 1 ? 'せんべいは 右！ ▶' : '◀ せんべいは 左！', 'yellow'];
      if (o.kind === 'branch') {
        const dodge = o.side === 1 ? '◀ 左へ かたむけて よけて！' : '右へ かたむけて よけて！ ▶';
        // カーブの内がわの枝: よけると外へ傾くので、速すぎたら先にブレーキ
        const c = track.sharpestAhead(s, o.s - s + 6), kk = Math.abs(c);
        if (kk > 0.006 && (o.side === 1) === (c > 0) && v > Math.sqrt((BAL.latBase - BAL.latOut * 0.5) / kk)) return [`ブレーキ！ ${dodge}`, 'red'];
        return [dodge, 'yellow'];
      }
      if (o.s - s < v * 0.75 + 3) return ['ジャンプ！', 'jump'];
    }
    // こぶ: 先が急カーブなら、浮かないように減速。そうでなければ、飛ぶのを楽しむ
    const crest = track.crestAhead(s, v * 1.6 + 10);
    if (crest && v > crest.vLift * 0.95) {
      if (Math.abs(crest.curveAfter) > 0.006) return ['ブレーキ！ こぶで 浮かないように', 'red'];
      if (crest.s - s < v * 0.8) return ['こぶで とぶぞ！', 'jump'];
    }
    // 後ろから大岩・なだれが せまる: ダッシュで にげる(先の急カーブでブレーキが要るときは、そちらが先)
    const ch = run.chaser;
    if (ch && s - ch.s < 30) {
      const kc = Math.abs(track.sharpestAhead(s + 3, (v * 1.7 + 8) * (1 + track.snowAt(s))));
      if (!(kc > 0.006 && v > Math.sqrt((BAL.latBase + BAL.latLean) / kc) * 0.96)) {
        const who = CHASER_NAME[ch.kind];
        const sb = track.obstacles.some(x => x.kind === 'senbei' && x.s > s && x.s - s < 60);
        return [run.dashCool <= 0 ? `${who}が せまる！ ダッシュ！` : sb ? `${who}が せまる！ せんべいを 食べて！` : `${who}が せまる！ にげろ！`, 'red'];
      }
    }
    // 横風: 風上へ傾ける
    const w = track.windAt(s + v * 0.5);
    if (Math.abs(w) > 0.5) {
      const need = v * v * track.at(s + v * 0.5).curv - w;
      if (Math.abs(need) > BAL.latBase * 0.8 && run.lean * Math.sign(need) < 0.6) return [need > 0 ? '横風！ 右へ かたむけて ▶' : '◀ 横風！ 左へ かたむけて', 'yellow'];
    }
    // 雪の上はブレーキがききにくいので、先のカーブを早めに知らせる
    const curv = track.sharpestAhead(s + 3, (v * 1.7 + 8) * (1 + track.snowAt(s))), k = Math.abs(curv);
    // 傾ける向きは、今いるカーブを優先(S字で、まだ右カーブの中なのに「左へ」と出さない)
    const here = track.sharpestAhead(s, Math.max(12, v * 0.4)), kh = Math.abs(here);
    if (k > 0.006 || kh > 0.004) {
      if (v > Math.sqrt((BAL.latBase + BAL.latLean) / k) * 0.96) return ['ブレーキ！', 'red'];
      const dir = kh > 0.004 ? here : curv;
      if (v > Math.sqrt(BAL.latBase / Math.max(k, kh)) * 0.93) return [dir > 0 ? '右へ かたむけて ▶' : '◀ 左へ かたむけて', 'yellow'];
    }
    return ['', ''];
  };
  const paintHud = () => {
    elCoins.textContent = String(run.coins);
    elGold.textContent = String(run.gold);
    elPrem.hidden = !run.premium;
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, 3 - run.lives));
    const p = `${(run.progress * 100).toFixed(1)}%`;
    elFill.style.width = p; elMark.style.left = p;
    const kmh = Math.round(run.v * KMH);
    elSpeed.textContent = String(run.phase === 'ready' ? 0 : kmh);
    elSpeed.parentElement!.classList.toggle('fast', kmh >= 95);
    const name = track.nameAt(run.s);
    if (elSeg.textContent !== name) elSeg.textContent = name;
    const [msg, tone_] = alertText();
    if (elAlert.textContent !== msg) elAlert.textContent = msg;
    elAlert.dataset.tone = tone_;
    elAlert.classList.toggle('on', msg !== '');
    // 傾ける案内のときは、押す側の矢印を光らせる(枝・カーブ・せんべい・ずれた線路)
    const cue = msg.includes('◀') ? 'left' : msg.includes('▶') ? 'right' : '';
    if (elPad.dataset.cue !== cue) elPad.dataset.cue = cue;
    // 後ろから追ってくるものとの距離(近いほど、バーがのびて赤くなる)
    if (pu) {
      const on = run.phase === 'running';
      elChase.hidden = !on;
      if (on && !run.coupled) {
        const d = run.gapToDeer;
        elChaseName.textContent = `${friendName}まで`;
        elChaseM.textContent = `${Math.round(d)}m`;
        elChaseBar.style.width = `${Math.max(0, Math.min(1, 1 - d / pu.lead)) * 100}%`;
        elChase.classList.toggle('close', d < 20);
      } else if (on) {
        const d = Math.max(0, pu.cliff - run.s);
        elChaseName.textContent = '谷まで';
        elChaseM.textContent = `${Math.round(d)}m`;
        elChaseBar.style.width = `${Math.max(0, Math.min(1, 1 - d / 300)) * 100}%`;
        elChase.classList.toggle('close', d < 80);
      }
      if (bellEl) { const side = run.phase === 'running' && !run.coupled ? bellSide() : 0; bellEl.hidden = side === 0; bellEl.dataset.side = side > 0 ? 'right' : 'left'; }
    }
    const ch = run.phase === 'running' ? run.chaser : null;
    if (!pu) elChase.hidden = !ch;
    if (ch) {
      const d = Math.max(0, run.s - ch.s - BAL.catchDist);
      elChaseName.textContent = CHASER_NAME[ch.kind];
      elChaseM.textContent = `${Math.round(d)}m`;
      elChaseBar.style.width = `${Math.max(0, Math.min(1, 1 - d / 50)) * 100}%`;
      elChase.classList.toggle('close', d < 15);
    }
    elDash.style.setProperty('--cd', String(run.dashCool / BAL.dashCool));
    elDash.classList.toggle('wait', run.dashCool > 0 && run.dashT <= 0);
    elDash.classList.toggle('go', run.dashT > 0);
  };
  const paintStamina = () => {
    const st = wallet.stamina;
    const txt = `体力 ${st} / ${STAMINA_MAX}` + (st < STAMINA_FAIL ? `(回復まで ${waitText(wallet.waitToPlay)})` : '');
    for (const k of ['s-stamina', 'r-stamina']) { const e = q(k); e.textContent = txt; e.classList.toggle('low', st < STAMINA_FAIL); }
  };
  let resultTimer = 0;
  const showResult = () => {
    const cleared = run.phase === 'cleared';
    const stars = cleared ? (pu ? pursuitStars(run.hitchS, pu.cliff) : Math.max(1, run.lives)) : 0;
    let newBest = false;
    if (cleared && !recorded) {
      recorded = true;
      newBest = progress.clear(level.id, pu ? run.hitchT : run.t, !continued, stars); // 追いかけっこは、追いつくまでの時間 // 途中から続けたときは、タイムを記録しない
      const got = clearRewards(wallet, level.id, { silver: run.coins, gold: run.gold, star3: stars === 3 });
      const prem = run.premium && wallet.takePremium(level.id);
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '') + (prem ? '　+1 プレミアム！' : '');
      q('r-reward').classList.remove('lose');
    }
    if (!cleared && !charged) {
      charged = true; wallet.fail(); progress.fail(level.id); // 失敗: 体力が2減る(設計書 25-2)
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    const best = progress.get(level.id).best, why = FAIL_TEXT[run.reason === 'caught' && run.caughtBy === 'avalanche' ? 'caughtAvalanche' : run.reason];
    q('r-title').textContent = cleared ? (pu ? `${friendName}を 止めた！` : `${level.goalName}に とうちゃく！`) : why?.[0] ?? 'ざんねん…';
    q('r-tip').textContent = cleared ? '' : why?.[1] ?? '';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-coins').textContent = `${run.coins} / ${silverTotal}` + (run.gold ? `　金 ${run.gold}` : '') + (run.premium ? '　◆' : '');
    q('r-max').textContent = `${Math.round(run.maxV * KMH)} km/h`;
    q('r-time').textContent = cleared && pu ? `${run.hitchT.toFixed(1)} 秒${newBest ? '（ベスト！）' : ''}` : cleared ? `${run.t.toFixed(1)} 秒${continued ? '（途中から）' : newBest ? '（ベスト更新！）' : ''}` : `${Math.floor(run.progress * 100)} % まで`;
    q('r-best').textContent = best === null ? '—' : `${best.toFixed(1)} 秒`;
    const cont = q<HTMLButtonElement>('cont');
    cont.hidden = cleared || !saved;
    if (saved) cont.textContent = `${saved.name}から つづける`;
    const next = q<HTMLAnchorElement>('next');
    next.hidden = !cleared || !nextLevel;
    if (nextLevel) { next.href = `/cart/?level=${nextLevel.id}`; next.textContent = `次の面へ（${nextLevel.id}）▶`; }
    elResult.classList.toggle('fail', !cleared);
    elResult.classList.add('on');
  };

  let hinted = new Set<string>();
  // 追いかけっこの はじめ(2026-11-22 Owner「相手の鹿が見えないので、なんの面か 分からない」):
  // 谷へ走っていく 仲間の鹿のトロッコを映して「助けてー！」→ 線路にそって 自分のトロッコまで もどってから 出発。
  // 見せるのは ページを開いて はじめの1回だけ(やりなおしでは すぐ出発)
  const INTRO = 3.4, INTRO_BACK = 1.1;
  let introT = -1, introSeen = false;
  const stepIntro = (dt: number) => {
    if (introT < 0 || !pu) return;
    introT += dt;
    // 前のトロッコは もう走っている(出発の時に ちょうど lead の所へ 着くように)
    const v0 = pu.deerStart ?? 20;
    run.deerS = pu.lead - v0 * Math.max(0, INTRO - introT); run.deerV = v0;
    const b = Math.max(0, Math.min(1, (introT - (INTRO - INTRO_BACK)) / INTRO_BACK)), e = b * b * (3 - 2 * b);
    view.introS = run.deerS + (run.s - run.deerS) * e;
    elSay.classList.toggle('on', introT > 0.3 && introT < INTRO - INTRO_BACK + 0.15);
    if (introT >= INTRO) {
      introT = -1; view.introS = null; run.deerS = pu.lead; elSay.classList.remove('on');
      run.start(); toast(level.intro, 3200);
    }
  };
  const begin = (from: Snapshot | null = null) => {
    if (!wallet.canPlay()) {
      paintStamina();
      toast(`体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`, 3000);
      return;
    }
    charged = false; recorded = false; continued = !!from;
    q('r-reward').textContent = '';
    audio.ensure(); ac = audio.ctx;
    startLoops();
    audio.stopMusic(0); audio.startMusic(CART_BGM);
    window.clearTimeout(resultTimer);
    run = new CartRun(track);
    if (from) run.restore(from.s, from.t, from.coins, from.gold, from.premium, from.collected);
    else { saved = null; hinted = new Set(); }
    view.resetCollapse(run.s);
    cpEls.forEach((el, i) => el.classList.toggle('passed', !!saved && track.checkpoints[i].s <= saved.s));
    nextClack = run.s + 6;
    releaseAll();
    if (!from) progress.attempt(level.id);
    elStart.classList.remove('on'); elResult.classList.remove('on');
    paintHud();
    if (pu && !from && !introSeen) {
      introSeen = true; introT = 0;
      elSay.innerHTML = `<small>${friendName}</small>助けてー！`;
      // 前のトロッコの 鈴の音(Owner の効果音「風鈴」)
      audio.sfx('bell');
      return;
    }
    run.start();
    toast(from ? `${from.name}から 再スタート！` : level.intro, 3200);
  };

  const paintSound = () => {
    for (const k of ['snd-s', 'snd-r']) {
      const b = q<HTMLButtonElement>(k);
      b.textContent = audio.enabled ? '♪ 音 ON' : '♪ 音 OFF';
      b.setAttribute('aria-pressed', String(audio.enabled));
    }
  };
  const toggleSound = () => { audio.setEnabled(!audio.enabled); paintSound(); };
  q('snd-s').addEventListener('click', toggleSound);
  q('snd-r').addEventListener('click', toggleSound);
  paintSound();
  q('go').addEventListener('click', () => begin());
  q('retry').addEventListener('click', () => begin());
  q('cont').addEventListener('click', () => begin(saved));

  // ---- 入力 ----
  // 左右は「キーボード」と「パッド」の2か所から入る。どちらも、最後に押した向きを優先する。
  const keyCodes: string[] = [];
  const padPointers = new Map<number, 'left' | 'right'>();
  const dirOfKey: Record<string, 'left' | 'right'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const holdKeys: Record<string, 'jump' | 'brake' | 'dash'> = {
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', ArrowDown: 'brake', KeyS: 'brake', ShiftLeft: 'dash', ShiftRight: 'dash', KeyE: 'dash',
  };
  const holdEl = { jump: elJump, brake: elBrake, dash: elDash };
  const applyDir = () => {
    const kb = keyCodes.length ? dirOfKey[keyCodes[keyCodes.length - 1]] : undefined;
    const pads = [...padPointers.values()], dir = kb ?? pads[pads.length - 1];
    input.left = dir === 'left'; input.right = dir === 'right';
    elPad.dataset.dir = dir ?? '';
  };
  const setHold = (k: 'jump' | 'brake' | 'dash', on: boolean) => { input[k] = on; holdEl[k].classList.toggle('down', on); };
  const releaseAll = () => {
    keyCodes.length = 0; padPointers.clear();
    setHold('jump', false); setHold('brake', false); setHold('dash', false);
    applyDir();
  };
  /** 指がボタンの外へ出ても、離すまで押した扱いにする(できない環境では、何もしない)。 */
  const capture = (el: HTMLElement, ev: PointerEvent) => { try { el.setPointerCapture(ev.pointerId); } catch { /* そのまま */ } };
  // 左右の境目で指が少しずれても、向きが入れかわらないようにする(押した所で決め、逆側へ パッド幅の1/8 以上 動いたときだけ変える)
  const sideOf = (ev: PointerEvent, prev?: 'left' | 'right'): 'left' | 'right' => {
    const r = elPad.getBoundingClientRect();
    const n = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2);
    if (prev === 'left') return n > 0.25 ? 'right' : 'left';
    if (prev === 'right') return n < -0.25 ? 'left' : 'right';
    return n < 0 ? 'left' : 'right';
  };
  const onPadDown = (ev: PointerEvent) => {
    ev.preventDefault(); capture(elPad, ev);
    padPointers.delete(ev.pointerId); padPointers.set(ev.pointerId, sideOf(ev)); applyDir();
  };
  const onPadMove = (ev: PointerEvent) => {
    if (!padPointers.has(ev.pointerId)) return;
    const side = sideOf(ev, padPointers.get(ev.pointerId));
    if (padPointers.get(ev.pointerId) !== side) { padPointers.delete(ev.pointerId); padPointers.set(ev.pointerId, side); applyDir(); }
  };
  const onPadUp = (ev: PointerEvent) => { padPointers.delete(ev.pointerId); applyDir(); };
  elPad.addEventListener('pointerdown', onPadDown);
  elPad.addEventListener('pointermove', onPadMove);
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) elPad.addEventListener(n, onPadUp);
  for (const k of ['jump', 'brake', 'dash'] as const) {
    const el = holdEl[k];
    el.addEventListener('pointerdown', ev => { ev.preventDefault(); capture(el, ev); setHold(k, true); });
    for (const n of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) el.addEventListener(n, () => setHold(k, false));
  }
  const kd = (ev: KeyboardEvent) => {
    if (dirOfKey[ev.code]) {
      ev.preventDefault();
      if (ev.repeat) return;
      const i = keyCodes.indexOf(ev.code);
      if (i >= 0) keyCodes.splice(i, 1);
      keyCodes.push(ev.code); applyDir();
    } else if (holdKeys[ev.code]) { ev.preventDefault(); setHold(holdKeys[ev.code], true); }
  };
  const ku = (ev: KeyboardEvent) => {
    if (dirOfKey[ev.code]) { const i = keyCodes.indexOf(ev.code); if (i >= 0) keyCodes.splice(i, 1); applyDir(); }
    else if (holdKeys[ev.code]) setHold(holdKeys[ev.code], false);
  };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  const onHidden = () => {
    releaseAll();
    if (document.hidden) audio.suspend(); else audio.resume();
  };
  window.addEventListener('blur', onHidden);
  document.addEventListener('visibilitychange', onHidden);
  const noMenu = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);

  /** はじめて出あうものに、一言(種類ごとに1回)。 */
  const fogCurves = track.fogCurves();
  const hint = (key: string, msg: string, ms = 3000) => { if (!hinted.has(key)) { hinted.add(key); toast(msg, ms); } };
  const hints = () => {
    const s = run.s, v = run.v, look = v * 2.4 + 20;
    const seg = track.segments.find(g => g.from > s && g.from - s < look);
    if (seg) {
      const k = Math.abs(((seg.turn ?? 0) * Math.PI) / 180 / seg.len);
      if (k > 0.015) hint('sharp', '急カーブ！ ブレーキで 速さを おとして、内がわへ 体を かたむけよう', 3600);
      else if (k > 0.007) hint('curve', 'カーブでは ◀ ▶ で 内がわへ 体を かたむけると、速いまま 回れるよ', 3600);
      if (!pu && (seg.slope ?? 0) >= 3 && seg.len >= 50) hint('up', '上り坂！ ダッシュで 鹿に がんばってもらおう', 3200);
      if ((seg.slope ?? 0) <= -8) hint('down', '急な下り坂！ どんどん 速くなるよ', 2600);
      if (seg.wind) hint('wind', '強い 横風！ 風上へ 体を かたむけて こらえよう', 3400);
      if (seg.terrain === 'tunnel') hint('tunnel', 'トンネルだ！ 中は 暗いよ。明かりを たよりに', 3000);
      if ((seg.fog ?? 0) >= 0.6) hint('fog', '霧だ！ 先が 見えにくい。光る 灯籠が カーブの 目印。鈴が 鳴ったら カーブ', 4200);
    }
    // 霧の中の急カーブ: 手前で鈴を鳴らす(1つのカーブに1回)
    for (const [a] of fogCurves) {
      if (s < a && a - s < v * 2.2 + 15 && !hinted.has(`bell${a}`)) {
        hinted.add(`bell${a}`);
        tone(1568, 1560, 1.3, 'sine', 0.07); tone(2349, 2340, 0.9, 'sine', 0.035); tone(784, 780, 1.1, 'sine', 0.03, 0.02);
      }
    }
    const gap = track.gaps.find(g => !g.collapse && !track.rampBefore(g) && g.from > s && g.from - s < look + 25);
    if (gap?.shift) hint('shift', '線路が ずれている！ 跳んだら、空中で ずれた方へ 体を かたむけよう', 3800);
    else if (gap) hint(gap.to - gap.from > 15 ? 'biggap' : 'gap', gap.to - gap.from > 15 ? '大きな 切れ目！ 看板の 速さまで ダッシュして、黄色い枕木で ジャンプ！' : '線路が 切れている！ 黄色い枕木の所で ジャンプ！', 3600);
    const o = track.obstacles.find(x => x.s > s && x.s - s < look);
    if (o?.kind === 'ramp') hint('ramp', 'ジャンプ台！ 乗るだけで 高く とぶ。台の上で ジャンプすると、もっと高く 遠くへ', 3600);
    else if (o?.kind === 'senbei') hint('senbei', '鹿せんべいだ！ 食べると、鹿が 全力で 走るよ', 3200);
    else if (o) hint(o.kind, o.kind === 'branch' ? '枝が 張り出している！ 反対へ 体を かたむけて よけよう' : o.kind === 'rock' ? '線路に 岩が！ ジャンプで とびこえよう' : '倒木だ！ ジャンプで とびこえよう', 3000);
    // モンスター: はじめの1体で よけ方を、星座が かわったら 名前を 知らせる
    const fo = track.foes.find(x => x.s > s && x.s - s < look + 40);
    if (fo && !hinted.has('foe')) { hinted.add(`sign${fo.sign}`); hint('foe', `${SIGNS[fo.sign]}の モンスターだ！ 線路の上なら ジャンプ、わきなら 反対へ かたむけて よけよう`, 4200); }
    else if (fo) hint(`sign${fo.sign}`, `こんどは ${SIGNS[fo.sign]}の モンスターたちだ！`, 2600);
    // その面ならではの所(ほかの一言より優先)
    level.notes?.forEach((n, i) => { if (s >= n.s - look && s < n.s + 10) hint(`note${i}`, n.text, 3800); });
  };

  // ---- ループ ----
  let raf = 0, last = performance.now(), acc = 0, prevPhase = run.phase;
  let chaseKind: 'boulder' | 'avalanche' = 'boulder';
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; acc += dt;
    stepIntro(dt);
    while (acc >= STEP) { run.step(STEP, input); acc -= STEP; }
    for (const e of run.drainEvents()) {
      sound(e);
      if (e.kind === 'hit') {
        view.bump(0.5);
        const o = e.id !== undefined ? obstacleById.get(e.id) : undefined;
        toast(o?.kind === 'branch' ? '枝に ぶつかった！ ◀ ▶ で 枝の 反対へ かたむけると よけられるよ' : o?.kind === 'log' ? '倒木に ぶつかった！' : '岩に ぶつかった！', o?.kind === 'branch' ? 3200 : 1800);
      } else if (e.kind === 'dash') { if (pu) hint('pump', 'Spraが こいだ！ こぐ を どんどん 使って 追いつこう', 2400); else toast('鹿の ダッシュ！', 1200); }
      else if (e.kind === 'forkRight') toast('こっちだ！ 鈴の音の方', 1400);
      else if (e.kind === 'forkWrong') { view.bump(0.3); toast('まちがえた！ 古いレールだ… 次の合流まで がまん', 2200); }
      else if (e.kind === 'hitch') { view.bump(0.6); toast(`つかまえた！ ブレーキで 止めて！`, 2600); }
      else if (e.kind === 'deerLost') toast(`${friendName}の トロッコが 谷へ…！`, 2600);
      else if (e.kind === 'foeHit') {
        view.bump(0.55); if (e.id !== undefined) view.foeFlash(e.id);
        const fo = track.foes.find(x => x.id === e.id);
        toast(fo?.dodge === 'lean' ? 'モンスターに ぶつかった！ ◀ ▶ で 反対へ かたむけると よけられるよ' : 'モンスターに ぶつかった！ 線路の上の モンスターは ジャンプで こえよう', 2800);
      }
      else if (e.kind === 'senbei') toast('もぐもぐ！ 鹿の 全力疾走！', 1300);
      else if (e.kind === 'chase' && run.chaser) {
        chaseKind = run.chaser.kind; view.bump(0.4);
        toast(chaseKind === 'avalanche' ? 'なだれだ！ 止まらずに すべりおりろ！' : 'ゴゴゴ… 後ろから 大岩が 転がってきた！ にげろ！', 3200);
      } else if (e.kind === 'chaseEnd') toast(chaseKind === 'avalanche' ? 'トンネルに 逃げこんだ！ なだれを ふりきった！' : '大岩は 谷へ 落ちていった！ ふりきった！', 2600);
      else if (e.kind === 'caught') view.bump(0.9);
      else if (e.kind === 'derail') view.bump(0.7);
      else if (e.kind === 'gold') toast('ゴールドコイン！', 1300);
      else if (e.kind === 'premium') { view.bump(0.15); toast('◆ プレミアムコイン！！ ゴールまで もちかえろう', 2800); }
      else if (e.kind === 'clear') toast(pu ? `止まった！ ${friendName}を 助けた！` : `${level.goalName}に とうちゃく！`, 4000);
      else if (e.kind === 'coin') { elCoins.classList.remove('ks-pop'); void elCoins.offsetWidth; elCoins.classList.add('ks-pop'); }
    }
    const running = run.phase === 'running', speed = Math.min(1, run.v / BAL.vDash);
    if (running) {
      hints();
      // 鈴: 前のトロッコから 鳴る(近いほど大きい。分かれ道では、行った側から)
      if (pu && !run.coupled && run.t >= nextBell) {
        nextBell = run.t + 0.55;
        bell(bellSide() * 0.9, 0.05 * Math.max(0.3, Math.min(1, 1 - run.gapToDeer / 260)));
      }
      track.checkpoints.forEach((c, i) => {
        if (run.s >= c.s && !run.air && (!saved || saved.s < c.s)) {
          saved = { s: c.s, name: c.name, t: run.t, coins: run.coins, gold: run.gold, premium: run.premium, collected: new Set(run.collected) };
          cpEls[i].classList.add('passed');
          audio.sfx('checkpoint');
          toast(`チェックポイント！ ${c.name}`, 2200);
        }
      });
      // レールのつぎ目の「ガタン ゴトン」(走った距離で鳴らす)
      if (!run.air && run.s >= nextClack) {
        nextClack = run.s + 12.5;
        thud(0.07, 0.16 + speed * 0.2, 420); thud(0.07, 0.14 + speed * 0.2, 360, Math.min(0.22, 1.4 / Math.max(4, run.v)));
      }
    }
    if (loops) {
      const moving = (running || run.phase === 'cleared') && run.v > 0.5;
      // 横風の所では、風の音を大きく。トンネルの中は、こもった音
      const gust = Math.abs(run.wind) / 9, tun = track.inTunnel(run.s);
      setLoop(loops.wind, moving ? speed * speed * 0.2 * (tun ? 0.5 : 1) + gust * 0.12 : 0, (tun ? 300 : 500) + speed * (tun ? 600 : 1500) + gust * 400);
      setLoop(loops.rumble, moving && !run.air ? 0.1 + speed * 0.3 : 0, 110 + speed * 160);
      setLoop(loops.screech, running && !run.air && ((run.braking && run.v > 3) || run.tilt > 0.15) ? 0.035 + speed * 0.05 : 0);
      // 地鳴り: 追ってくるものが近いほど大きい
      const near = run.chaser && running ? Math.max(0, Math.min(1, 1 - (run.s - run.chaser.s - 4) / 50)) : 0;
      setLoop(loops.roar, run.chaser && running ? 0.12 + near * 0.55 : 0, 70 + near * 90);
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') resultTimer = window.setTimeout(showResult, run.phase === 'cleared' ? 2800 : 1500);
    }
    paintHud();
    view.render(run, dt);
  };
  paintHud();
  paintStamina();
  raf = requestAnimationFrame(frame);

  // 動作確認用(開発中の自動テストから状態を読む)
  (window as unknown as { __cart?: unknown }).__cart = { get run() { return run; }, track, input, level, view, audio };

  return () => {
    // 走っている途中でページを離れたら、失敗と同じく体力が減る(設計書 25-2)
    if (run.phase === 'running' && !charged) { charged = true; wallet.fail(); progress.quit(level.id); }
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer); window.clearTimeout(resultTimer);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', onHidden);
    document.removeEventListener('visibilitychange', onHidden);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __cart?: unknown }).__cart;
    if (loops) for (const l of Object.values(loops)) { try { l.src.stop(); } catch { /* 止まっていたら何もしない */ } }
    audio.close();
    view.dispose();
  };
}
