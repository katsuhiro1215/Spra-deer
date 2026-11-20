// WORLD 2「せんべいタワー」(積む面)の組み立て: タップで落とす・おとどけ・HUD・Spraの反応・音・ループ・記録。
// 見た目の部品(はじめ・おわりの画面、HUD)は、焼く面と同じページ(BakeShell)を使う。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { RunnerAudio } from '../runner/audio.ts';
import { BAKE_LEVELS, DEER_NAME, type TowerLevel } from './levels.ts';
import { TBAL, TowerRun, type TowerEvent } from './tower.ts';
import { TowerView } from './towerView.ts';
import { applyCarry, carryOf, type RelayCtx } from './relay.ts';
import { HELPER_TEXT, mountHelpers } from './helpers.ts';

const STEP = 1 / 120;
/** DEER-08 Spra Deer Sendeiyaki(4.04〜116.51秒をくり返す) */
const BAKE_BGM = { url: '/assets/audio/bake.mp3', loopStart: 4.04, loopEnd: 116.51, volume: 0.32 };
const FAIL_TEXT: Record<string, [string, string]> = {
  collapse: ['タワーが 崩れちゃった…', 'まん中に 積むと 安定する。ぐらぐら してきたら、早めに「おとどけ」'],
  angry: ['鹿を 待たせすぎた…', '注文の 高さまで 積んだら、すぐ「おとどけ」できるよ'],
  time: ['時間ぎれ…', '注文の 高さまで 積んだら「おとどけ」しよう'],
  nibbled: ['タワーの 下を 食べられちゃった…', '鹿が 来たら、タップで おいはらおう'],
};
type Pose = 'idle' | 'hooray' | 'trouble' | 'wave';

export function startTower(root: HTMLElement, level: TowerLevel, relay?: RelayCtx): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  root.classList.add('bk-mode-tower');
  const wallet = new Wallet();
  const progress = new Progress();
  // リレー面(2-9・2-10)では、記録と コインは その面の番号で つける
  const rid = relay?.id ?? level.id;
  const premiumTaken = wallet.hasPremium(rid);
  const newRun = () => applyCarry(new TowerRun(level, { premium: !premiumTaken }), relay);
  const view = new TowerView(q('stage'), level);
  const nextLevel = BAKE_LEVELS[BAKE_LEVELS.findIndex(l => l.id === rid) + 1];
  let run = newRun();
  let charged = false, recorded = false;

  q('lv-id').textContent = `面 ${rid}`;
  q('lv-title').textContent = relay ? `${relay.title}(${relay.part + 1}/${relay.parts})` : level.title;
  q('goal').textContent = `/ ${level.goal}頭`;
  q('s-title').textContent = relay ? relay.title : level.title;
  q('s-lead').textContent = `${level.summary}。${level.time}秒で、鹿 ${level.goal}頭に タワーを とどけよう！`;
  if (relay) q('s-lead').textContent = `${relay.summary}。まずは: ${q('s-lead').textContent}`;
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ' : `◆ ${level.premiumHeight}段の タワーを とどけると…？`;
  q('how').innerHTML = [
    '<li><b>タップ</b> ゆれる せんべいを 落とす</li>',
    '<li><b>まん中</b> に 落とすと「ぴったり」。3回続くと 大判せんべい！</li>',
    '<li><b>おとどけ</b> 注文の 高さまで 積んだら。もっと積むと ごほうびが ふえる</li>',
    '<li><b>♥</b> 崩す・待たせすぎで へる</li>',
  ].join('');
  q('keys').textContent = 'キーボード: スペース = 落とす/Enter = おとどけ' + (level.nibblers?.length ? '/S = おいはらう' : '');
  const helpers = mountHelpers(root, level.helpers);
  const howExtra: string[] = [];
  if (level.wind) howExtra.push('<li><b>風</b> 落ちる せんべいが 流される。矢印の 反対に ずらそう</li>');
  if (level.nibblers?.length) howExtra.push('<li><b>いたずら</b> 下を 食べる鹿は タップで おいはらう(食べられると ♥が へる)</li>');
  for (const id of level.helpers ?? []) { const t = HELPER_TEXT[id]; if (t) howExtra.push(`<li><b>なかま</b> ${t}</li>`); }
  q('how').insertAdjacentHTML('beforeend', howExtra.join(''));
  q('go').textContent = 'タワーを つくる';
  q('r-l1').textContent = 'とどけた タワー';
  q('r-l2').textContent = 'いちばん 高い タワー';

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
  const noise = (dur: number, vol: number, type: BiquadFilterType, freq: number, delay = 0, Q = 0.8) => {
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime + delay;
    src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = Q;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(audio.out ?? ac.destination);
    src.start(t0);
  };
  const sound = (e: TowerEvent) => {
    const n = run.height;
    switch (e.kind) {
      case 'drop': tone(700, 380, 0.18, 'sine', 0.05); break;
      // 積むたびに、少しずつ高い音(高くなっていくのが、耳でも分かる)
      case 'land': noise(0.08, 0.3, 'lowpass', 900); tone(220 + n * 22, 200 + n * 22, 0.1, 'triangle', 0.06); break;
      case 'perfect': noise(0.08, 0.3, 'lowpass', 900); tone(523 * Math.pow(2, Math.min(n, 18) / 12), 523 * Math.pow(2, Math.min(n, 18) / 12), 0.2, 'sine', 0.07); break;
      case 'miss': tone(500, 120, 0.5, 'triangle', 0.07); break;
      case 'windWarn': noise(1.6, 0.12, 'bandpass', 500, 0, 1.2); break;
      case 'nibbler': [0, 0.18, 0.36, 0.54].forEach(d => tone(520, 480, 0.06, 'triangle', 0.05, d)); break;
      case 'nibAim': tone(880, 880, 0.1, 'square', 0.04); tone(880, 880, 0.1, 'square', 0.04, 0.16); break;
      case 'nibble': noise(0.09, 0.35, 'bandpass', 3000, 0.1, 1.2); noise(0.08, 0.3, 'bandpass', 2500, 0.2, 1.2); break;
      case 'nibShoo': tone(500, 1400, 0.25, 'sine', 0.07); break;
      case 'collapse': noise(0.7, 0.45, 'lowpass', 700); [0, 0.08, 0.17, 0.27].forEach(d => noise(0.07, 0.25, 'bandpass', 1200 + Math.random() * 800, d)); tone(200, 50, 0.7, 'sawtooth', 0.06); break;
      case 'big': [784, 988, 1175].forEach((f, i) => tone(f, f, 0.16, 'sine', 0.05, i * 0.06)); break;
      case 'deliver': [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.06, 0.07 * i)); break;
      case 'notYet': tone(320, 260, 0.15, 'triangle', 0.06); break;
      case 'arrive': tone(900, 1300, 0.12, 'sine', 0.06); tone(1100, 1500, 0.1, 'sine', 0.05, 0.14); break;
      case 'happy': if (e.gold) audio.sfx('gold'); break;
      case 'angry': tone(420, 200, 0.3, 'square', 0.045); tone(380, 180, 0.3, 'square', 0.04, 0.18); break;
      case 'heart': audio.sfx('hit'); break;
      case 'premium': audio.sfx('premium'); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elCoins = q('coins'), elGold = q('gold'), elPrem = q('prem'), elHearts = q('hearts');
  const elTime = q('time'), elTimeBar = q('time-bar'), elServed = q('served');
  const elAlert = q('alert'), elToast = q('toast'), elStart = q('start'), elResult = q('result');
  const elSpra = q<HTMLImageElement>('spra'), elSay = q('say'), elLabels = q('labels');
  const elHeight = q('t-height'), elStab = q('t-stab'), elStabBar = q('t-stab-bar'), elDeliver = q<HTMLButtonElement>('deliver');
  const goalTag = document.createElement('div');
  goalTag.className = 'bk-goal-tag';
  elLabels.append(goalTag);
  let toastTimer = 0, poseTimer = 0;
  const toast = (msg: string, ms = 2400) => {
    elToast.textContent = msg; elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  const react = (pose: Pose, say = '', ms = 1400) => {
    elSpra.src = `/assets/bake/spra_${pose}.png`; elSpra.dataset.pose = pose;
    if (say) { elSay.textContent = say; elSay.classList.add('on'); }
    window.clearTimeout(poseTimer);
    poseTimer = window.setTimeout(() => { elSpra.src = '/assets/bake/spra_idle.png'; elSpra.dataset.pose = 'idle'; elSay.classList.remove('on'); }, ms);
  };
  const alertText = (): [string, string] => {
    if (run.phase !== 'running') return ['', ''];
    const d = run.customer, n = run.height, st = run.stability(), nb = run.nibbler;
    if (nb && (nb.phase === 'aim' || nb.phase === 'eat')) return ['下を 食べる鹿を タップ！', 'red'];
    if (nb && nb.phase === 'walk') return ['鹿が タワーの 下を ねらってる！', 'yellow'];
    if (run.windComing) return [run.windComing > 0 ? '風が くる！ → → →' : '風が くる！ ← ← ←', 'yellow'];
    if (run.wind) return [run.wind > 0 ? '風 → → →  左に ずらして！' : '風 ← ← ←  右に ずらして！', 'yellow'];
    if (d && d.phase === 'wait' && d.waited / d.patience > 0.7) return n >= d.want ? ['鹿が 待ちくたびれてる！ おとどけ！', 'red'] : ['鹿が 待ちくたびれてる！ いそいで！', 'yellow'];
    if (n >= 3 && st < 0.25) return ['ぐらぐら！ あぶない！', 'red'];
    if (run.hold.big) return ['大判せんべい！ 大きくて 安定するよ', 'gold'];
    return ['', ''];
  };
  const paintHud = () => {
    elCoins.textContent = String(run.coins);
    elGold.textContent = String(run.gold);
    elPrem.hidden = !run.premium;
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, TBAL.lives - run.lives));
    const left = Math.ceil(run.timeLeft);
    elTime.textContent = String(left);
    elTime.parentElement!.classList.toggle('hurry', left <= 15 && run.phase === 'running');
    elTimeBar.style.width = `${(run.timeLeft / level.time) * 100}%`;
    elServed.textContent = `${run.delivered}`;
    const d = run.customer, n = run.height, want = d && (d.phase === 'wait' || d.phase === 'walk') ? d.want : 0;
    elHeight.textContent = `${n}`;
    // ぐらぐら度(安定度の反対)。高いほど赤く、長く
    const wobble = n ? 1 - run.stability() : 0;
    elStabBar.style.width = `${Math.round(wobble * 100)}%`;
    elStab.dataset.tone = wobble > 0.75 ? 'red' : wobble > 0.45 ? 'yellow' : '';
    const ready = run.phase === 'running' && !!d && d.phase === 'wait' && n >= d.want && !run.falling && run.busy <= 0;
    elDeliver.disabled = !ready;
    elDeliver.classList.toggle('extra', ready && n > d!.want);
    elDeliver.querySelector('small')!.textContent = ready ? (n > d!.want ? `+${n - d!.want}段 ボーナス` : '注文どおり') : want ? `あと ${Math.max(0, want - n)}段` : '';
    // 注文の高さの札(線の右はし)
    goalTag.hidden = !want || run.phase !== 'running';
    if (want) {
      const p = view.toScreen(view.goalAt(want));
      goalTag.style.transform = `translate(${p.x}px, ${p.y}px) translate(4px, -50%)`;
      goalTag.textContent = n >= want ? `${want}段 OK！` : `ちゅうもん ${want}段`;
      goalTag.dataset.tone = n >= want ? 'ok' : '';
    }
    const [msg, tone_] = alertText();
    if (elAlert.textContent !== msg) elAlert.textContent = msg;
    elAlert.dataset.tone = tone_;
    elAlert.classList.toggle('on', msg !== '');
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
      newBest = progress.clear(rid, (relay?.carry?.t ?? 0) + run.t);
      const got = clearRewards(wallet, rid, { silver: run.coins, gold: run.gold, star3: stars === 3 });
      const prem = run.premium && wallet.takePremium(rid);
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '') + (prem ? '　+1 プレミアム！' : '');
      q('r-reward').classList.remove('lose');
    }
    if (!cleared && !charged) {
      charged = true; wallet.fail();
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    const best = progress.get(rid).best, why = FAIL_TEXT[run.reason ?? ''];
    q('r-title').textContent = cleared ? 'タワー だいせいこう！' : why?.[0] ?? 'ざんねん…';
    q('r-tip').textContent = cleared ? '' : why?.[1] ?? '';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-served').textContent = `${run.delivered} / ${level.goal} 頭`;
    q('r-gokujo').textContent = `${run.best} 段` + (run.collapses ? `(崩れた ${run.collapses})` : '');
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
    if ((!relay || relay.part === 0) && !wallet.canPlay()) { paintStamina(); toast(`体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`, 3000); return; }
    charged = false; recorded = false;
    q('r-reward').textContent = '';
    audio.ensure(); ac = audio.ctx;
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

  // ---- 入力: 画面のどこをタップしても落とす(「おとどけ」ボタンは、とどける) ----
  const frameEl = q('frame');
  const onDown = (ev: PointerEvent) => {
    if ((ev.target as HTMLElement).closest('a, .ks-overlay.on, .ks-sound')) return;
    if ((ev.target as HTMLElement).closest('[data-ks="deliver"]')) { ev.preventDefault(); run.deliver(); return; }
    if ((ev.target as HTMLElement).closest('button')) return;
    ev.preventDefault();
    if (run.phase !== 'running') return;
    // 下を 食べに来た鹿の 近くを タップしたら、おいはらう(それ以外は 落とす)
    const nb = run.nibbler, at = view.sneakAt;
    if (nb && nb.phase !== 'flee' && at) {
      const r = q('stage').getBoundingClientRect(), p = view.toScreen(at.clone().setY(at.y + 0.5));
      if (Math.hypot(ev.clientX - r.left - p.x, ev.clientY - r.top - p.y) < 80) { run.shoo(); return; }
    }
    run.drop();
  };
  frameEl.addEventListener('pointerdown', onDown);
  const kd = (ev: KeyboardEvent) => {
    if (run.phase !== 'running') return;
    if (ev.code === 'Space') { ev.preventDefault(); if (!ev.repeat) run.drop(); }
    else if (ev.code === 'Enter' || ev.code === 'KeyD') { ev.preventDefault(); run.deliver(); }
    else if (ev.code === 'KeyS') { ev.preventDefault(); run.shoo(); }
  };
  window.addEventListener('keydown', kd);
  const onHidden = () => { if (document.hidden) audio.suspend(); else audio.resume(); };
  document.addEventListener('visibilitychange', onHidden);
  const noMenu = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);

  const onEvent = (e: TowerEvent) => {
    sound(e);
    view.onTowerEvent(e, run);
    switch (e.kind) {
      case 'land': hint('land', 'のった！ まん中に 近いほど、ぐらぐら しないよ', 2600); break;
      case 'perfect': if (run.perfectRun >= 2) react('hooray', `ぴったり ×${run.perfectRun}！`, 800); else react('hooray', 'ぴったり！', 700); break;
      case 'miss': react('trouble', 'あっ…', 900); hint('miss', 'ふちから 落ちちゃった。てっぺんの 上の 影を 見て 落とそう', 3000); break;
      case 'collapse': react('trouble', '崩れた〜！', 1600); toast('タワーが 崩れた！', 1800); break;
      case 'big': toast('ぴったり 3回！ 大判せんべいだ！', 1800); break;
      case 'notYet': toast(`まだ 注文の 高さに たりないよ(あと ${e.n}段)`, 1600); break;
      case 'arrive': {
        const d = run.customer;
        if (d) hint(`arrive${d.want >= 8 ? 'big' : ''}`, d.want >= 8 ? `${DEER_NAME[d.kind]}は ${d.want}段！ 高く 積もう` : `鹿が おじぎ！ ${d.want}段の タワーが ほしいみたい`, 3000);
        break;
      }
      case 'deliver': {
        const d = run.customer;
        react('hooray', e.gold ? '大まんぞく！' : 'どうぞ！', 1200);
        if (d && e.n! > d.want) toast(`${e.n}段！ 注文より ${e.n! - d.want}段 高い！ ボーナス！`, 1800);
        if (e.gold) toast(`${e.n}段の 大タワー！ ゴールドコイン！`, 2200);
        break;
      }
      case 'angry': react('trouble', 'ごめんね…', 1600); toast('鹿が おこって 帰っちゃった…', 2000); break;
      case 'premium': toast('◆ プレミアムコイン！！ タワー名人だ！', 3200); break;
      case 'windWarn': hint('wind', '風が くるよ！ 矢印の 向きに 流される', 2400); if (run.level.helpers?.includes('piko')) helpers.say('piko', 'ふーっ！ 風よ よわまれ！', 1500); break;
      case 'nibbler': hint('nibbler', 'タワーの 下を 食べに 鹿が 来た！ タップで おいはらおう', 3000); break;
      case 'nibAim': react('trouble', 'あっ！ 下は だめ！', 1000); break;
      case 'nibble': react('trouble', '下を 食べられた〜！', 1400); toast('タワーの 下を 食べられた！', 1500); break;
      case 'nibShoo': react('wave', 'じゅんばんに ならんでね！', 1200); break;
      case 'nibBlock': helpers.say('kuru', 'とおせんぼ！'); toast('Kuru が いたずら鹿を 通せんぼ！', 1600); break;
      case 'clear': toast('目標たっせい！ タワー だいせいこう！', 3000); react('hooray', 'やったね！', 4000); break;
      case 'fail': react('trouble', '', 4000); break;
    }
  };

  let raf = 0, last = performance.now(), acc = 0, prevPhase = run.phase;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; acc += dt;
    while (acc >= STEP) { run.step(STEP); acc -= STEP; }
    for (const e of run.drainEvents()) onEvent(e);
    if (run.phase === 'running') {
      level.notes?.forEach((n, i) => { if (run.t >= n.t) hint(`note${i}`, n.text, 3800); });
      if (run.timeLeft <= 15) hint('hurry', 'のこり 15秒！', 1800);
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') resultTimer = window.setTimeout(() => (relay && run.phase === 'cleared' && relay.part < relay.parts - 1 ? relay.next(carryOf(run, relay)) : showResult()), run.phase === 'cleared' ? 2400 : 1600);
    }
    paintHud();
    view.renderTower(run, dt);
  };
  paintHud();
  paintStamina();
  raf = requestAnimationFrame(frame);

  // リレーの 2つ目からは、すぐ はじめる(体力は はじめに 1回だけ)
  if (relay && relay.part > 0) begin();
  (window as unknown as { __bake?: unknown }).__bake = { get run() { return run; }, level, view, audio };

  return () => {
    if (run.phase === 'running' && !charged) { charged = true; wallet.fail(); }
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer); window.clearTimeout(resultTimer); window.clearTimeout(poseTimer);
    frameEl.removeEventListener('pointerdown', onDown);
    window.removeEventListener('keydown', kd);
    document.removeEventListener('visibilitychange', onHidden);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __bake?: unknown }).__bake;
    audio.close();
    view.dispose();
    helpers.dispose();
    elLabels.replaceChildren();
    root.classList.remove('bk-mode-tower');
  };
}
