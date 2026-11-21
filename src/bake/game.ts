// WORLD 2「鹿せんべい大作戦」の組み立て: タップ・画面の表示(HUD・注文のふきだし)・Spraの反応・音・ループ・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { RunnerAudio } from '../runner/audio.ts';
import { BAKE_LEVELS, DEER_NAME, type BakeLevel } from './levels.ts';
import { applyCarry, carryOf, type RelayCtx } from './relay.ts';
import { HELPER_TEXT, mountHelpers } from './helpers.ts';
import { BAL, BakeRun, type BakeEvent } from './sim.ts';
import { BakeView } from './view.ts';

const STEP = 1 / 120;
/** BGMは、まだ専用の曲がないので、2Dの面の曲を仮に使う */
/** DEER-08 Spra Deer Sendeiyaki(4.04〜116.51秒をくり返す) */
const BAKE_BGM = { url: '/assets/audio/bake.mp3', loopStart: 4.04, loopEnd: 116.51, volume: 0.32 };

const FAIL_TEXT: Record<string, [string, string]> = {
  burnt: ['せんべいを 焦がしすぎた…', '輪の 金色で タップ！ 煙が 出たら いそいで'],
  angry: ['鹿を おこらせちゃった…', '先に 何枚か 焼いておくと、来たら すぐ わたせるよ'],
  stolen: ['くいしんぼう鹿に 食べられちゃった…', '台に 着く前に、鹿を タップして おいはらおう'],
  time: ['時間ぎれ…', '鉄板を 空けないように、どんどん 焼こう'],
};
type Pose = 'idle' | 'hooray' | 'trouble' | 'wave';

export function startBake(root: HTMLElement, base: BakeLevel, relay?: RelayCtx): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const wallet = new Wallet();
  const progress = new Progress();
  // プレミアムコインは1つの面に1枚だけ。もう取った面では出さない(設計書 25-3)
  const level: BakeLevel = base;
  // リレー面(2-9・2-10)では、記録と コインは その面の番号で つける
  const rid = relay?.id ?? level.id;
  const premiumTaken = wallet.hasPremium(rid);
  const newRun = () => applyCarry(new BakeRun(level, { premium: !premiumTaken }), relay);
  const view = new BakeView(q('stage'), level);
  const nextLevel = BAKE_LEVELS[BAKE_LEVELS.findIndex(l => l.id === rid) + 1];
  let run = newRun();
  let charged = false, recorded = false;

  q('lv-id').textContent = `面 ${rid}`;
  q('lv-title').textContent = relay ? `${relay.title}(${relay.part + 1}/${relay.parts})` : level.title;
  q('goal').textContent = `/ ${level.goal}頭`;
  q('s-title').textContent = relay ? relay.title : level.title;
  q('s-lead').textContent = `${level.summary}。${level.time}秒で、鹿を ${level.goal}頭 まんぞくさせよう！`;
  if (relay) q('s-lead').textContent = `${relay.summary}。まずは: ${q('s-lead').textContent}`;
  const pr = level.premium;
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ'
    : pr.kind === 'streak' ? `◆ 極上せんべいを ${pr.n}まい 続けて作ると…？` : '◆ くいしんぼう鹿を、台に 着く前に 全部 おいはらうと…？';
  const helpers = mountHelpers(root, level.helpers);
  for (const id of level.helpers ?? []) { const t = HELPER_TEXT[id]; if (t) { const li = document.createElement('li'); li.innerHTML = `<b>なかま</b> ${t}`; q('how').append(li); } }
  if (level.arrivals.some(a => a.taste)) {
    const li = document.createElement('li');
    li.innerHTML = '<b>注文</b> 白=やわらか(金色の前で タップ)・金=こんがり';
    q('how').append(li);
  }
  if (level.plates > 3) q('keys').textContent = 'キーボード: 1・2・3・4 = 鉄板/Q・W・E = 鹿';
  root.classList.toggle('bk-p4', level.plates > 3);
  if (level.sneaks?.length) {
    const li = document.createElement('li');
    li.innerHTML = '<b>いたずら</b> 鹿は タップで おいはらう(食べられると ♥が へる)';
    q('how').append(li);
    q('keys').textContent = 'キーボード: 1・2・3 = 鉄板/Q・W・E = 鹿/スペース = おいはらう';
  }

  // ---- 音 ----
  const audio = new RunnerAudio();
  let ac: AudioContext | null = null;
  const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, delay = 0) => {
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
  /** ノイズの音(ジュッ・サクッ・ドン)。 */
  const noise = (dur: number, vol: number, type: BiquadFilterType, freq: number, delay = 0, Q = 0.8) => {
    if (!ac) return;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime + delay;
    src.buffer = noiseBuf(dur);
    f.type = type; f.frequency.value = freq; f.Q.value = Q;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(audio.out ?? ac.destination);
    src.start(t0);
  };
  // 鉄板のジュージュー(焼いている枚数で大きさを変える)
  let sizzle: { gain: GainNode; src: AudioBufferSourceNode } | null = null;
  const startSizzle = () => {
    if (!ac || sizzle) return;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gain = ac.createGain();
    src.buffer = noiseBuf(2); src.loop = true;
    f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 0.6;
    gain.gain.value = 0;
    src.connect(f).connect(gain).connect(audio.out ?? ac.destination);
    src.start();
    sizzle = { gain, src };
  };
  const sound = (e: BakeEvent) => {
    switch (e.kind) {
      case 'pour': noise(0.45, 0.16, 'highpass', 3500); tone(180, 120, 0.15, 'sine', 0.05); break;
      case 'flip':
        tone(320, 760, 0.14, 'triangle', 0.06); noise(0.08, 0.22, 'lowpass', 900, BAL.flip - 0.04);
        if (e.q === 'perfect') { tone(1320, 1320, 0.22, 'sine', 0.06, 0.05); tone(1760, 1760, 0.3, 'sine', 0.05, 0.12); }
        break;
      case 'collect':
        tone(660, 990, 0.12, 'triangle', 0.07);
        if (e.gokujo) [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, f, 0.18, 'sine', 0.05, 0.06 * i));
        break;
      case 'early': tone(240, 210, 0.12, 'square', 0.035); break;
      case 'full': tone(300, 260, 0.18, 'triangle', 0.06); break;
      case 'smoke': noise(0.5, 0.1, 'highpass', 2500); break;
      case 'burnt': noise(0.6, 0.35, 'lowpass', 500); tone(170, 60, 0.6, 'sawtooth', 0.06); break;
      case 'discard': noise(0.25, 0.15, 'bandpass', 1200); break;
      case 'arrive': tone(900, 1300, 0.12, 'sine', 0.06); tone(1100, 1500, 0.1, 'sine', 0.05, 0.14); break;
      // サクッ と食べる
      case 'serve': noise(0.08, 0.32, 'bandpass', 3200, 0.3, 1.2); noise(0.07, 0.28, 'bandpass', 2600, 0.38, 1.2); break;
      case 'empty': tone(320, 260, 0.15, 'triangle', 0.06); break;
      case 'happy': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.06, 0.07 * i)); if (e.gold) audio.sfx('gold'); break;
      case 'angry': tone(420, 200, 0.3, 'square', 0.045); tone(380, 180, 0.3, 'square', 0.04, 0.18); break;
      case 'heart': audio.sfx('hit'); break;
      case 'premium': audio.sfx('premium'); break;
      // くいしんぼう鹿: こそこそ足音・ねらう合図・食べられた・おどろいて逃げる
      case 'sneak': [0, 0.18, 0.36, 0.54].forEach(d => tone(520, 480, 0.06, 'triangle', 0.05, d)); break;
      case 'aim': tone(880, 880, 0.1, 'square', 0.04); tone(880, 880, 0.1, 'square', 0.04, 0.16); break;
      case 'steal': noise(0.09, 0.35, 'bandpass', 3000, 0.2, 1.2); noise(0.08, 0.3, 'bandpass', 2500, 0.3, 1.2); break;
      case 'shoo': tone(500, 1400, 0.25, 'sine', 0.07); noise(0.3, 0.15, 'bandpass', 1800); break;
      case 'wrong': tone(420, 360, 0.12, 'triangle', 0.06); tone(360, 300, 0.14, 'triangle', 0.06, 0.12); break;
      // ジュワッ(水)
      case 'water': noise(0.7, 0.3, 'highpass', 2200); tone(900, 300, 0.4, 'sine', 0.04); break;
      case 'block': tone(1200, 1100, 0.06, 'square', 0.06); tone(700, 660, 0.12, 'triangle', 0.06, 0.04); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elCoins = q('coins'), elGold = q('gold'), elPrem = q('prem'), elHearts = q('hearts');
  const elTime = q('time'), elTimeBar = q('time-bar'), elServed = q('served'), elStreak = q('streak');
  const elAlert = q('alert'), elToast = q('toast'), elStart = q('start'), elResult = q('result');
  const elSpra = q<HTMLImageElement>('spra'), elSay = q('say'), elLabels = q('labels');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2400) => {
    elToast.textContent = msg; elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  // Spra のポーズとひとこと(しばらくすると、ふつうに戻る)
  let poseTimer = 0;
  const react = (pose: Pose, say = '', ms = 1400) => {
    elSpra.src = `/assets/bake/spra_${pose}.png`;
    elSpra.dataset.pose = pose;
    if (say) { elSay.textContent = say; elSay.classList.add('on'); }
    window.clearTimeout(poseTimer);
    poseTimer = window.setTimeout(() => { elSpra.src = '/assets/bake/spra_idle.png'; elSpra.dataset.pose = 'idle'; elSay.classList.remove('on'); }, ms);
  };
  // 鉄板の下の札と、鹿の注文のふきだし(画面の位置は、毎フレーム 3D から求める)
  const plateTags = run.plates.map(() => { const el = document.createElement('div'); el.className = 'bk-tag'; elLabels.append(el); return el; });
  const orders = [0, 1, 2].map(() => { const el = document.createElement('div'); el.className = 'bk-order'; el.innerHTML = '<span class="bk-pat"></span><span class="bk-icons"></span><span class="bk-taste"></span>'; elLabels.append(el); return el; });
  const orderKey = ['', '', ''];
  const sneakMark = document.createElement('div');
  sneakMark.className = 'bk-sneak-mark'; sneakMark.textContent = '！'; sneakMark.hidden = true;
  elLabels.append(sneakMark);
  const paintLabels = () => {
    const c = level.cook, running = run.phase === 'running';
    run.plates.forEach((p, i) => {
      const el = plateTags[i], at = view.toScreen(view.plateCenter(i).setZ(view.plateCenter(i).z + 0.55));
      el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)`;
      let text = '', tone_ = '';
      // 火の強さ(2-8 から)
      const heat = level.heat?.[i] ?? 1, fire = heat > 1.1 ? '🔥強火 ' : heat < 0.9 ? '弱火 ' : '';
      // 夜は 暗くて 焼き色が 見えにくい(Lumi がいれば 光で 分かる)
      const dark = !!level.scene?.night && !run.helps('lumi');
      const wantSoft = run.deer.some(d => d.taste === 'soft' && d.got < d.want);
      if (!running) text = '';
      else if (p.state === 'empty') { text = `${fire}＋ 生地`; tone_ = 'empty'; }
      else if (p.state === 'side1' || p.state === 'side2') {
        const verb = p.state === 'side1' ? '↻ うらがえす' : '✓ できあがり';
        if (p.t < c.ok) { text = 'やいてる…'; tone_ = 'wait'; }
        else if (run.quality(p.t) === 'perfect' && !dark) { text = `★ いまだ！`; tone_ = 'gold'; }
        else if (run.quality(p.t) === 'soft' && wantSoft) { text = `◎ やわらか ${verb.slice(0, 1)}`; tone_ = 'soft'; }
        else if (p.smoking) { text = `あぶない！ ${verb.slice(0, 1)}`; tone_ = 'red'; }
        else { text = verb; tone_ = 'ok'; }
      } else if (p.state === 'burnt') { text = '焦げた… すてる'; tone_ = 'red'; }
      if (el.textContent !== text) el.textContent = text;
      el.dataset.tone = tone_;
      el.hidden = !text;
    });
    const sn = run.sneak, at = view.sneakAt;
    sneakMark.hidden = !(running && sn && at && (sn.phase === 'walk' || sn.phase === 'aim' || sn.phase === 'eat'));
    if (!sneakMark.hidden && at) {
      // お客の注文ふきだしに重ならないよう、外がわ(来た側)へずらす
      const p = view.toScreen(at.clone().setY(at.y + 1.15).setX(at.x + sn!.side * 0.45));
      sneakMark.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      sneakMark.dataset.tone = sn!.phase === 'walk' ? '' : 'red';
    }
    for (let s = 0; s < 3; s++) {
      const d = run.spots[s], el = orders[s];
      const show = !!d && (d.phase === 'wait' || d.phase === 'eat');
      el.hidden = !show;
      if (!d || !show) continue;
      const at = view.toScreen(view.spotPos(s).setY(view.deerHeight(d.kind) + 0.32));
      el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
      const left = 1 - d.waited / d.patience;
      el.style.setProperty('--p', String(Math.max(0, left)));
      el.dataset.tone = left < 0.18 ? 'red' : left < 0.4 ? 'yellow' : '';
      const key = `${d.id}:${d.got}/${d.want}`;
      if (orderKey[s] !== key) {
        orderKey[s] = key;
        const tc = d.taste ?? '';
        el.querySelector('.bk-icons')!.innerHTML = Array.from({ length: d.want }, (_, k) => `<i class="${k < d.got ? 'got' : ''} ${tc}"></i>`).join('');
        el.querySelector('.bk-taste')!.textContent = d.taste === 'soft' ? 'やわらか' : d.taste === 'crisp' ? 'こんがり' : '';
        el.setAttribute('aria-label', `${DEER_NAME[d.kind]}: ${d.want}まい ほしい(${d.got}まい もらった)`);
      }
    }
  };
  /** 今いちばん大事なこと(画面の下のほうに大きく) */
  const alertText = (): [string, string] => {
    if (run.phase !== 'running') return ['', ''];
    const c = level.cook;
    const sn = run.sneak;
    if (sn && (sn.phase === 'aim' || sn.phase === 'eat') && run.tray.length) return ['くいしんぼう鹿を タップ！', 'red'];
    if (sn && sn.phase === 'walk' && run.tray.length) return ['鹿が せんべいを ねらってる！', 'yellow'];
    if (run.plates.some(p => p.state === 'burnt')) return ['焦げた せんべいを タップして すてよう', 'red'];
    if (run.plates.some(p => (p.state === 'side1' || p.state === 'side2') && p.smoking)) return ['焦げそう！ はやく タップ！', 'red'];
    const tired = run.deer.find(d => d.phase === 'wait' && d.waited / d.patience > 0.7);
    if (tired) return run.tray.length ? ['鹿が まちくたびれてる！ タップで わたそう', 'yellow'] : ['鹿が まちくたびれてる！ いそいで 焼こう', 'yellow'];
    if (run.tray.length >= BAL.trayMax) return ['台が いっぱい！ 鹿に わたそう', 'yellow'];
    if (!level.scene?.night && run.plates.some(p => (p.state === 'side1' || p.state === 'side2') && run.quality(p.t) === 'perfect' && p.t >= c.ok)) return ['金色！ いまだ！', 'gold'];
    return ['', ''];
  };
  const paintHud = () => {
    elCoins.textContent = String(run.coins);
    elGold.textContent = String(run.gold);
    elPrem.hidden = !run.premium;
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, BAL.lives - run.lives));
    const left = Math.ceil(run.timeLeft);
    elTime.textContent = String(left);
    elTime.parentElement!.classList.toggle('hurry', left <= 15 && run.phase === 'running');
    elTimeBar.style.width = `${(run.timeLeft / level.time) * 100}%`;
    elServed.textContent = `${run.served}`;
    const streak = run.phase === 'running' && run.streak >= 2 ? `こんがり ×${run.streak}` : '';
    if (elStreak.textContent !== streak) elStreak.textContent = streak;
    elStreak.hidden = !streak;
    const [msg, tone_] = alertText();
    if (elAlert.textContent !== msg) elAlert.textContent = msg;
    // 帯は、台の前の面(鉄板の札より下)に出す
    elAlert.style.top = `${view.toScreen(view.plateCenter(0).set(0, 0.62, 1.0)).y}px`;
    elAlert.dataset.tone = tone_;
    elAlert.classList.toggle('on', msg !== '');
    paintLabels();
  };
  const paintStamina = () => {
    const st = wallet.stamina;
    const txt = `体力 ${st} / ${STAMINA_MAX}` + (st < STAMINA_FAIL ? `(回復まで ${waitText(wallet.waitToPlay)})` : '');
    for (const k of ['s-stamina', 'r-stamina']) { const e = q(k); e.textContent = txt; e.classList.toggle('low', st < STAMINA_FAIL); }
  };
  let resultTimer = 0;
  const showResult = () => {
    const cleared = run.phase === 'cleared';
    const stars = cleared ? Math.max(1, run.lives) : 0;
    let newBest = false;
    if (cleared && !recorded) {
      recorded = true;
      newBest = progress.clear(rid, (relay?.carry?.t ?? 0) + run.t, true, stars);
      const got = clearRewards(wallet, rid, { silver: run.coins, gold: run.gold, star3: stars === 3 });
      const prem = run.premium && wallet.takePremium(rid);
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '') + (prem ? '　+1 プレミアム！' : '');
      q('r-reward').classList.remove('lose');
    }
    if (!cleared && !charged) {
      charged = true; wallet.fail(); progress.fail(rid); // 失敗: 体力が2減る(設計書 25-2)
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    const best = progress.get(rid).best, why = FAIL_TEXT[run.reason ?? ''];
    q('r-title').textContent = cleared ? 'おみせ だいせいこう！' : why?.[0] ?? 'ざんねん…';
    q('r-tip').textContent = cleared ? '' : why?.[1] ?? '';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-served').textContent = `${run.served} / ${level.goal} 頭`;
    q('r-gokujo').textContent = `${run.gokujoCount} まい` + (run.burntCount ? `(焦げ ${run.burntCount})` : '') + (run.stolen ? `(取られた ${run.stolen})` : '');
    q('r-coins').textContent = `${run.coins}` + (run.gold ? `　金 ${run.gold}` : '') + (run.premium ? '　◆' : '');
    q('r-time').textContent = cleared ? `${run.t.toFixed(1)} 秒${newBest ? '(ベスト更新！)' : ''}` : '—';
    q('r-best').textContent = best === null ? '—' : `${best.toFixed(1)} 秒`;
    const next = q<HTMLAnchorElement>('next');
    next.hidden = !cleared || !nextLevel;
    if (nextLevel) { next.href = `/bake/?level=${nextLevel.id}`; next.textContent = `次の面へ(${nextLevel.id})▶`; }
    elResult.classList.toggle('fail', !cleared);
    elResult.classList.add('on');
  };

  let hinted = new Set<string>();
  const hint = (key: string, msg: string, ms = 3000) => { if (!hinted.has(key)) { hinted.add(key); toast(msg, ms); } };
  const begin = () => {
    if ((!relay || relay.part === 0) && !wallet.canPlay()) {
      paintStamina();
      toast(`体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`, 3000);
      return;
    }
    charged = false; recorded = false;
    q('r-reward').textContent = '';
    audio.ensure(); ac = audio.ctx;
    startSizzle();
    audio.stopMusic(0); audio.startMusic(BAKE_BGM);
    window.clearTimeout(resultTimer);
    run = newRun();
    hinted = new Set();
    run.start();
    if (!relay || relay.part === 0) progress.attempt(rid);
    elStart.classList.remove('on'); elResult.classList.remove('on');
    react('wave', 'いらっしゃいませ！', 1800);
    paintHud();
    toast(level.intro, 3600);
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
  q('retry').addEventListener('click', () => (relay ? relay.restart() : begin()));

  // ---- 入力: タップした所が鉄板か鹿か(画面の位置で決める)。キーボードは 1〜3=鉄板・Q/W/E=鹿 ----
  const frameEl = q('frame');
  const onDown = (ev: PointerEvent) => {
    if ((ev.target as HTMLElement).closest('button, a, .ks-overlay.on')) return;
    ev.preventDefault();
    if (run.phase !== 'running') return;
    const r = q('stage').getBoundingClientRect();
    const hit = view.pick(ev.clientX - r.left, ev.clientY - r.top, run);
    if (!hit) return;
    if ('sneak' in hit) run.tapSneak();
    else if ('plate' in hit) run.tapPlate(hit.plate); else run.tapDeer(hit.spot);
  };
  frameEl.addEventListener('pointerdown', onDown);
  const kd = (ev: KeyboardEvent) => {
    if (run.phase !== 'running') return;
    const plate = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(ev.code), spot = ['KeyQ', 'KeyW', 'KeyE'].indexOf(ev.code);
    if (ev.code === 'Space') { ev.preventDefault(); run.tapSneak(); }
    else if (plate >= 0) { ev.preventDefault(); run.tapPlate(plate); }
    else if (spot >= 0) { ev.preventDefault(); run.tapDeer(spot); }
  };
  window.addEventListener('keydown', kd);
  const onHidden = () => { if (document.hidden) audio.suspend(); else audio.resume(); };
  document.addEventListener('visibilitychange', onHidden);
  const noMenu = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);

  // ---- 出来事への反応(一言・Spra) ----
  const onEvent = (e: BakeEvent) => {
    sound(e);
    view.onEvent(e, run);
    switch (e.kind) {
      case 'pour': hint('pour', 'ジュ〜！ 輪が ぐるっと 回るよ。金色の所で タップ！', 3400); break;
      case 'early': toast('まだ 焼けてないよ。輪が 緑になってから', 1400); break;
      case 'flip':
        if (e.q === 'perfect') react('hooray', 'こんがり！', 900);
        else hint('flipok', '金色の所で 裏返すと「こんがり」になるよ', 3000);
        break;
      case 'collect':
        if (e.gokujo) { react('hooray', '極上せんべい！', 1200); toast(run.streak >= 2 ? `極上！ ${run.streak}まい 続けて こんがり！` : '極上せんべい！ 両面 こんがり', 1500); }
        hint('collect', 'できた せんべいは、台に ならぶよ。鹿を タップして わたそう', 3600);
        if (e.gokujo && run.helps('lumi') && Math.random() < 0.4) helpers.say('lumi', 'ぴかっ！ こんがり！', 1000);
        break;
      case 'full': toast('台が いっぱい！ 先に 鹿に わたそう', 1800); break;
      case 'smoke': hint('smoke', '煙が出てる！ はやく タップ！', 2400); react('trouble', 'あわわ…', 900); break;
      case 'burnt': react('trouble', '焦げちゃった…', 1600); toast('焦げた！ タップして すてよう', 2000); break;
      case 'arrive': {
        const d = run.deer.find(x => x.id === e.deer);
        hint('arrive', '鹿が おじぎ！ せんべいが ほしいみたい。鹿を タップすると わたせるよ', 3800);
        if (d && d.want >= 3) hint('stag', `${DEER_NAME[d.kind]}は ${d.want}まい ほしい！`, 2600);
        break;
      }
      case 'empty': toast('台に せんべいが ないよ。先に 焼こう', 1600); break;
      case 'serve': if (e.gokujo) react('hooray', 'どうぞ！', 700); break;
      case 'happy': react('hooray', e.gold ? '大まんぞく！' : 'ありがとう！', 1200); if (e.gold) toast('全部 極上で 大まんぞく！ ゴールドコイン！', 2200); break;
      case 'angry': react('trouble', 'ごめんね…', 1600); toast('鹿が おこって 帰っちゃった…', 2000); break;
      case 'premium': toast(level.premium.kind === 'streak' ? '◆ プレミアムコイン！！ 極上の 名人だ！' : '◆ プレミアムコイン！！ 台を 守りきった！', 3200); break;
      case 'sneak': hint('sneak', 'くいしんぼう鹿が きた！ 台の せんべいを ねらってる。タップで おいはらおう！', 3800); break;
      case 'aim': react('trouble', 'あっ！ だめだよ！', 1000); break;
      case 'steal': react('trouble', '食べられた〜！', 1400); toast('せんべいを 食べられた！', 1500); break;
      case 'shoo': react('wave', 'じゅんばんに ならんでね！', 1400); break;
      case 'wrong': {
        const d = run.deer.find(x => x.id === e.deer);
        toast(d?.taste === 'soft' ? 'この鹿は「やわらか」が ほしいって！ 金色の 前で 取ろう' : 'この鹿は「こんがり」が ほしいって！ 両面 金色で', 2200);
        break;
      }
      case 'water': helpers.say('ruru', 'ジュワッ！ 水だよ！'); hint('water', 'Ruru が 焦げそうな 鉄板に 水を かけてくれた！(しばらく 休けい)', 2800); break;
      case 'block': helpers.say('kuru', 'とおせんぼ！'); toast('Kuru が くいしんぼう鹿を 通せんぼ！', 1600); break;

      case 'clear': toast('目標たっせい！ おみせ だいせいこう！', 3000); react('hooray', 'やったね！', 4000); break;
      case 'fail': react('trouble', '', 4000); break;
    }
  };

  // ---- ループ ----
  let raf = 0, last = performance.now(), acc = 0, prevPhase = run.phase;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // 見えない間(別のタブ)は時間を止める: requestAnimationFrame が止まり、戻ったときも 0.1秒までしか進めない
    acc += dt;
    while (acc >= STEP) { run.step(STEP); acc -= STEP; }
    for (const e of run.drainEvents()) onEvent(e);
    if (run.phase === 'running') {
      level.notes?.forEach((n, i) => { if (run.t >= n.t) hint(`note${i}`, n.text, 3400); });
      if (run.timeLeft <= 15) hint('hurry', 'のこり 15秒！', 1800);
    }
    if (sizzle && ac) {
      const n = run.phase === 'running' ? run.plates.filter(p => p.state === 'side1' || p.state === 'side2' || p.state === 'pour').length : 0;
      const smoke = run.plates.some(p => p.smoking) ? 0.04 : 0;
      sizzle.gain.gain.setTargetAtTime(n * 0.022 + smoke, ac.currentTime, 0.15);
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') resultTimer = window.setTimeout(() => (relay && run.phase === 'cleared' && relay.part < relay.parts - 1 ? relay.next(carryOf(run, relay)) : showResult()), run.phase === 'cleared' ? 2400 : 1600);
    }
    paintHud();
    view.render(run, dt);
  };
  paintHud();
  paintStamina();
  raf = requestAnimationFrame(frame);

  // 動作確認用(開発中の自動テストから状態を読む・操作する)
  // リレーの 2つ目からは、すぐ はじめる(体力は はじめに 1回だけ)
  if (relay && relay.part > 0) begin();
  (window as unknown as { __bake?: unknown }).__bake = { get run() { return run; }, level, view, audio };

  return () => {
    // 遊んでいる途中でページを離れたら、失敗と同じく体力が減る(設計書 25-2)
    if (run.phase === 'running' && !charged) { charged = true; wallet.fail(); progress.quit(rid); }
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer); window.clearTimeout(resultTimer); window.clearTimeout(poseTimer);
    frameEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('keydown', kd);
    document.removeEventListener('visibilitychange', onHidden);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __bake?: unknown }).__bake;
    try { sizzle?.src.stop(); } catch { /* 止まっていたら何もしない */ }
    audio.close();
    view.dispose();
    helpers.dispose();
    elLabels.replaceChildren();
    root.classList.remove('bk-p4');
  };
}
