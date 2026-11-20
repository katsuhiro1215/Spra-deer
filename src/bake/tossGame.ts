// WORLD 2「せんべい くばり」(配る面)の組み立て: なぞって投げる・HUD・鹿のふきだし・Spraの反応・音・ループ・記録。
// 見た目の部品(はじめ・おわりの画面、HUD)は、焼く面と同じページ(BakeShell)を使う。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { RunnerAudio } from '../runner/audio.ts';
import { BAKE_LEVELS, DEER_NAME, type TossLevel } from './levels.ts';
import { SBAL, TossRun, type TossEvent } from './toss.ts';
import { TossView } from './tossView.ts';
import { applyCarry, carryOf, type RelayCtx } from './relay.ts';
import { HELPER_TEXT, mountHelpers } from './helpers.ts';

const STEP = 1 / 120;
/** DEER-08 Spra Deer Sendeiyaki(4.04〜116.51秒をくり返す) */
const BAKE_BGM = { url: '/assets/audio/bake.mp3', loopStart: 4.04, loopEnd: 116.51, volume: 0.32 };
/** なぞりはじめと みなす長さ(px) */
const DRAG_MIN = 12;
const FAIL_TEXT: Record<string, [string, string]> = {
  empty: ['せんべいが なくなっちゃった…', '鹿の 足もとの 輪を よく見て。長く なぞるほど 遠くへ とぶよ'],
  angry: ['鹿を 待たせすぎた…', '待ちくたびれている鹿(ふきだしが赤い)から 先に 投げよう'],
  time: ['時間ぎれ…', '近くの鹿から どんどん 投げよう'],
};
type Pose = 'idle' | 'hooray' | 'trouble' | 'wave';

export function startToss(root: HTMLElement, level: TossLevel, relay?: RelayCtx): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  root.classList.add('bk-mode-toss');
  const wallet = new Wallet();
  const progress = new Progress();
  // リレー面(2-9・2-10)では、記録と コインは その面の番号で つける
  const rid = relay?.id ?? level.id;
  const premiumTaken = wallet.hasPremium(rid);
  const newRun = () => applyCarry(new TossRun(level, { premium: !premiumTaken }), relay);
  const stage = q('stage');
  const view = new TossView(stage, level);
  const nextLevel = BAKE_LEVELS[BAKE_LEVELS.findIndex(l => l.id === rid) + 1];
  let run = newRun();
  let charged = false, recorded = false;
  const bundles = level.senbei % 10 === 0 ? `${level.senbei / 10}束(${level.senbei}まい)` : `${level.senbei}まい`;

  q('lv-id').textContent = `面 ${rid}`;
  q('lv-title').textContent = relay ? `${relay.title}(${relay.part + 1}/${relay.parts})` : level.title;
  q('goal').textContent = `/ ${level.goal}頭`;
  q('s-title').textContent = relay ? relay.title : level.title;
  q('s-lead').textContent = `${level.summary}。せんべい ${bundles}で、鹿 ${level.goal}頭を まんぞく させよう！`;
  if (relay) q('s-lead').textContent = `${relay.summary}。まずは: ${q('s-lead').textContent}`;
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ' : `◆「ぴったり」を ${level.premiumStreak}回 続けると…？`;
  q('how').innerHTML = [
    '<li><b>なぞる</b> 鹿のほうへ 指を すべらせて、はなすと 投げる</li>',
    '<li><b>長さ</b> 長く なぞるほど 遠くへ とぶ</li>',
    '<li><b>輪</b> 鹿の 足もとの 輪に 落とすと キャッチ！ まん中の 金色は「ぴったり」</li>',
    '<li><b>♥</b> 鹿を 待たせすぎると へる。せんべいが なくなると おしまい</li>',
  ].join('');
  q('keys').textContent = 'キーボード: ←→ = 向き/↑↓ = 強さ/スペース = 投げる';
  const helpers = mountHelpers(root, level.helpers);
  {
    const extra: string[] = [];
    if (level.wind) extra.push('<li><b>風</b> とんでいる せんべいが 流される。矢印の 反対に ずらそう</li>');
    for (const id of level.helpers ?? []) { const t = HELPER_TEXT[id]; if (t) extra.push(`<li><b>なかま</b> ${t}</li>`); }
    q('how').insertAdjacentHTML('beforeend', extra.join(''));
  }
  q('go').textContent = 'せんべいを くばる';
  q('r-l1').textContent = 'まんぞくした鹿';
  q('r-l2').textContent = 'ぴったり キャッチ';

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
  const noise = (dur: number, vol: number, type: BiquadFilterType, freq: number, delay = 0, Q = 0.8, freq1?: number) => {
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime + delay;
    src.buffer = buf; f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = Q;
    if (freq1) f.frequency.exponentialRampToValueAtTime(freq1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(audio.out ?? ac.destination);
    src.start(t0);
  };
  const sound = (e: TossEvent) => {
    switch (e.kind) {
      // ひゅっ(遠くへ投げるほど長く)
      case 'throw': noise(0.18 + (e.dist ?? 3) * 0.02, 0.22, 'bandpass', 700, 0, 1.2, 2600); break;
      case 'catch': noise(0.06, 0.25, 'lowpass', 1400); tone(660, 880, 0.12, 'triangle', 0.07); break;
      // ぴったりは、続くほど高い音
      case 'perfect': {
        const f = 784 * Math.pow(2, Math.min(e.n ?? 1, 8) / 12);
        noise(0.06, 0.25, 'lowpass', 1400); tone(f, f, 0.14, 'sine', 0.07); tone(f * 1.5, f * 1.5, 0.18, 'sine', 0.05, 0.08);
        if (e.gold) audio.sfx('gold');
        break;
      }
      case 'miss': noise(0.12, 0.3, 'lowpass', 400); tone(300, 160, 0.2, 'triangle', 0.05); break;
      case 'pick': noise(0.1, 0.25, 'bandpass', 1800, 0, 2); noise(0.08, 0.2, 'bandpass', 2200, 0.12, 2); break;
      case 'vanish': tone(500, 300, 0.2, 'sine', 0.03); break;
      case 'arrive': tone(900, 1300, 0.12, 'sine', 0.05); tone(1100, 1500, 0.1, 'sine', 0.04, 0.14); break;
      case 'served': [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.05, 0.06 * i)); break;
      case 'angry': tone(420, 200, 0.3, 'square', 0.045); tone(380, 180, 0.3, 'square', 0.04, 0.18); break;
      case 'heart': audio.sfx('hit'); break;
      case 'premium': audio.sfx('premium'); break;
      case 'windWarn': noise(1.6, 0.12, 'bandpass', 500, 0, 1.2); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elCoins = q('coins'), elGold = q('gold'), elPrem = q('prem'), elHearts = q('hearts');
  const elTime = q('time'), elTimeBar = q('time-bar'), elServed = q('served');
  const elAlert = q('alert'), elToast = q('toast'), elStart = q('start'), elResult = q('result');
  const elSpra = q<HTMLImageElement>('spra'), elSay = q('say'), elLabels = q('labels');
  const elStock = q('t-stock'), elStockBox = q('t-stock-box'), elStreak = q('t-streak');
  let toastTimer = 0, poseTimer = 0;
  const toast = (msg: string, ms = 2400) => {
    elToast.textContent = msg; elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  const react = (pose: Pose, say = '', ms = 1400) => {
    elSpra.src = `/assets/bake/spra_${pose}.png`; elSpra.dataset.pose = pose;
    if (say) { elSay.textContent = say; elSay.classList.add('on'); } else elSay.classList.remove('on');
    window.clearTimeout(poseTimer);
    poseTimer = window.setTimeout(() => { elSpra.src = '/assets/bake/spra_idle.png'; elSpra.dataset.pose = 'idle'; elSay.classList.remove('on'); }, ms);
  };
  /** 鹿の上に、ふわっと出る一言(ぴったり！ など) */
  const pop = (x: number, z: number, y: number, text: string, tone_ = '') => {
    const p = view.toScreen(view.handPos().set(x, y, z));
    const el = document.createElement('div');
    el.className = 'bk-pop'; el.textContent = text; el.dataset.tone = tone_;
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    elLabels.append(el);
    window.setTimeout(() => el.remove(), 1000);
  };
  // 鹿の注文のふきだし(鹿ごと。番号で引く)
  const bubbles = new Map<number, { el: HTMLElement; key: string }>();
  const paintBubbles = () => {
    const running = run.phase === 'running', seen = new Set<number>();
    for (const d of run.deer) {
      const show = running && (d.phase === 'wait' || d.phase === 'eat' || d.phase === 'pick');
      if (!show) continue;
      seen.add(d.id);
      let b = bubbles.get(d.id);
      if (!b) {
        const el = document.createElement('div');
        el.className = 'bk-order bk-order-sm'; el.innerHTML = '<span class="bk-pat"></span><span class="bk-icons"></span>';
        elLabels.append(el);
        b = { el, key: '' };
        bubbles.set(d.id, b);
      }
      const at = view.toScreen(view.deerTop(d));
      b.el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
      const left = 1 - d.waited / d.patience;
      b.el.style.setProperty('--p', String(Math.max(0, left)));
      b.el.dataset.tone = left < 0.18 ? 'red' : left < 0.4 ? 'yellow' : '';
      const key = `${d.got}/${d.want}`;
      if (b.key !== key) {
        b.key = key;
        b.el.querySelector('.bk-icons')!.innerHTML = Array.from({ length: d.want }, (_, k) => `<i class="${k < d.got ? 'got' : ''}"></i>`).join('');
        b.el.setAttribute('aria-label', `${DEER_NAME[d.kind]}: ${d.want}まい ほしい(${d.got}まい もらった)`);
      }
    }
    for (const [id, b] of bubbles) if (!seen.has(id)) { b.el.remove(); bubbles.delete(id); }
  };
  const alertText = (): [string, string] => {
    if (run.phase !== 'running') return ['', ''];
    if (run.stock > 0 && run.stock <= 3) return [`のこり ${run.stock}まい！ よく ねらって`, 'red'];
    if (run.windComing) return [run.windComing > 0 ? '風が くる！ → → →' : '風が くる！ ← ← ←', 'yellow'];
    if (run.wind) return [run.wind > 0 ? '風 → → →  左に ずらして！' : '風 ← ← ←  右に ずらして！', 'yellow'];
    if (run.deer.some(d => d.phase === 'wait' && d.waited / d.patience > 0.7)) return ['鹿が 待ちくたびれてる！', 'yellow'];
    if (run.streak >= 2) return [`ぴったり ×${run.streak} れんぞく！`, 'gold'];
    return ['', ''];
  };
  const paintHud = () => {
    elCoins.textContent = String(run.coins);
    elGold.textContent = String(run.gold);
    elPrem.hidden = !run.premium;
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, SBAL.lives - run.lives));
    const left = Math.ceil(run.timeLeft);
    elTime.textContent = String(left);
    elTime.parentElement!.classList.toggle('hurry', left <= 15 && run.phase === 'running');
    elTimeBar.style.width = `${(run.timeLeft / level.time) * 100}%`;
    elServed.textContent = `${run.served}`;
    elStock.textContent = `${run.stock}`;
    elStockBox.dataset.tone = run.stock <= 3 ? 'red' : run.stock <= 6 ? 'yellow' : '';
    elStreak.textContent = run.streak >= 1 ? `ぴったり ×${run.streak}` : '';
    elStreak.hidden = run.streak < 1;
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
    q('r-title').textContent = cleared ? 'くばり おわり！ だいせいこう！' : why?.[0] ?? 'ざんねん…';
    q('r-tip').textContent = cleared ? (run.stock ? `あまった せんべい ${run.stock}まいも コインに！` : '') : why?.[1] ?? '';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-served').textContent = `${run.served} / ${level.goal} 頭`;
    q('r-gokujo').textContent = `${run.perfects} 回` + (run.bestStreak >= 2 ? `(れんぞく ${run.bestStreak})` : '');
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
    view.clearRun();
    drag = null; view.aiming = null;
    hinted = new Set();
    run.start();
    if (!relay || relay.part === 0) progress.attempt(rid);
    elStart.classList.remove('on'); elResult.classList.remove('on');
    react('wave', 'せんべい いかが〜！', 1800);
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

  // ---- 入力: なぞって、はなすと投げる ----
  // 画面で なぞった向きを、そのまま公園の向きにする(手の真下の地面から、なぞった向きの地面へ)。
  // 手前へ引いても(パチンコのように)前へ とぶ。長さが強さ(とぶ距離)
  const frameEl = q('frame');
  let drag: { id: number; x: number; y: number } | null = null;
  const local = (ev: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const aimFrom = (dx: number, dy: number): { heading: number; power: number } | null => {
    const len = Math.hypot(dx, dy);
    if (len < DRAG_MIN) return null;
    let ux = dx / len, uy = dy / len;
    if (uy > 0) { ux = -ux; uy = -uy; }
    const hs = view.toScreen(view.handPos()), K = 160;
    const b = view.groundAt(hs.x, hs.y), w = view.groundAt(hs.x + ux * K, hs.y + uy * K);
    const heading = b && w ? Math.atan2(w.x - b.x, b.z - w.z) : Math.atan2(ux, -uy);
    const full = Math.min(stage.clientHeight * 0.42, 340);
    return { heading, power: Math.min(1, (len - DRAG_MIN) / (full - DRAG_MIN)) };
  };
  const onDown = (ev: PointerEvent) => {
    if ((ev.target as HTMLElement).closest('a, button, .ks-overlay.on')) return;
    ev.preventDefault();
    if (run.phase !== 'running' || drag) return;
    const p = local(ev);
    drag = { id: ev.pointerId, x: p.x, y: p.y };
    frameEl.setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const p = local(ev);
    view.aiming = aimFrom(p.x - drag.x, p.y - drag.y);
  };
  const onUp = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const p = local(ev), a = aimFrom(p.x - drag.x, p.y - drag.y);
    drag = null; view.aiming = null;
    if (ev.type === 'pointercancel' || !a) { if (!a && run.phase === 'running') hint('tapOnly', '指を 鹿のほうへ スーッと なぞってから はなそう', 2600); return; }
    if (!run.ready) { if (run.stock > 0) hint('reload', '次の せんべいを 持つまで、ちょっと まってね', 1600); return; }
    run.throw(a.heading, a.power);
  };
  frameEl.addEventListener('pointerdown', onDown);
  frameEl.addEventListener('pointermove', onMove);
  frameEl.addEventListener('pointerup', onUp);
  frameEl.addEventListener('pointercancel', onUp);
  // キーボード: 向き・強さを決めて、スペースで投げる
  const kb = { heading: 0, power: 0.35, on: false };
  const keys = new Set<string>();
  const kd = (ev: KeyboardEvent) => {
    if (run.phase !== 'running') return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.code)) { ev.preventDefault(); keys.add(ev.code); kb.on = true; }
    else if (ev.code === 'Space') {
      ev.preventDefault();
      if (!ev.repeat && run.ready) { run.throw(kb.heading, kb.power); }
    }
  };
  const ku = (ev: KeyboardEvent) => { keys.delete(ev.code); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  const onHidden = () => { if (document.hidden) audio.suspend(); else audio.resume(); };
  document.addEventListener('visibilitychange', onHidden);
  const noMenu = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);

  const onEvent = (e: TossEvent) => {
    sound(e);
    view.onTossEvent(e, run);
    const d = e.deer !== undefined ? run.deer.find(x => x.id === e.deer) : undefined;
    const top = d ? view.deerTop(d) : null;
    switch (e.kind) {
      case 'throw': if (elSpra.dataset.pose === 'idle') react('wave', '', 350); break;
      case 'catch':
        if (top) pop(top.x, top.z, top.y, 'キャッチ！');
        react('hooray', 'ナイス！', 700);
        hint('catch', 'キャッチ！ 輪の まん中(金色)なら「ぴったり」で コイン アップ', 3000);
        break;
      case 'perfect':
        if (top) pop(top.x, top.z, top.y, e.gold ? 'ぴったり！ 金！' : (e.n ?? 0) >= 2 ? `ぴったり ×${e.n}！` : 'ぴったり！', e.gold ? 'gold' : 'perfect');
        react('hooray', (e.n ?? 0) >= 2 ? `ぴったり ×${e.n}！` : 'ぴったり！', 800);
        if (e.gold) toast('遠くの鹿に ぴったり！ ゴールドコイン！', 2000);
        break;
      case 'miss': {
        react('trouble', 'あっ…', 800);
        const near = run.ground.find(g => g.id === e.id)?.claimed;
        hint('miss', near ? '落ちても、近くの鹿が 拾って たべてくれることも' : 'はずれ… 鹿の 足もとの 輪を ねらおう', 3000);
        break;
      }
      case 'pick': if (top) pop(top.x, top.z, top.y, 'ひろった！', 'pick'); break;
      case 'arrive':
        if (d && d.move) hint('moving', '歩いている鹿だ！ 少し 先を ねらおう', 2800);
        else if (d) hint(`arrive${d.z < -6.5 ? 'far' : ''}`, d.z < -6.5 ? '奥の鹿は、長めに なぞって 遠くへ！' : '鹿が おじぎ！ 足もとの 輪を ねらって 投げよう', 3000);
        if (level.helpers?.includes('momo') && Math.random() < 0.25) helpers.say('momo', 'ゆっくり 待っててね', 1300);
        break;
      case 'served': if (d && d.want >= 2) toast(`${DEER_NAME[d.kind]}も まんぞく！`, 1400); break;
      case 'angry': react('trouble', 'ごめんね…', 1600); toast('鹿が おこって 帰っちゃった…', 2000); break;
      case 'premium': toast(`◆ プレミアムコイン！！ ぴったり ${level.premiumStreak}れんぞく！`, 3200); break;
      case 'windWarn': hint('wind', '風が くるよ！ とんでいる せんべいが 矢印の 向きに 流される', 2600); if (level.helpers?.includes('piko')) helpers.say('piko', 'ふーっ！ 風よ よわまれ！', 1500); break;
      case 'clear': toast('目標たっせい！ くばり おわり！', 3000); react('hooray', 'やったね！', 4000); break;
      case 'fail': react('trouble', '', 4000); break;
    }
  };

  let raf = 0, last = performance.now(), acc = 0, prevPhase = run.phase;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; acc += dt;
    // キーボードのねらい
    if (keys.size) {
      if (keys.has('ArrowLeft')) kb.heading -= dt * 0.9;
      if (keys.has('ArrowRight')) kb.heading += dt * 0.9;
      if (keys.has('ArrowUp')) kb.power += dt * 0.5;
      if (keys.has('ArrowDown')) kb.power -= dt * 0.5;
      kb.heading = Math.max(-SBAL.maxAngle, Math.min(SBAL.maxAngle, kb.heading)); kb.power = Math.max(0, Math.min(1, kb.power));
    }
    if (kb.on && !drag) view.aiming = run.phase === 'running' ? { heading: kb.heading, power: kb.power } : null;
    while (acc >= STEP) { run.step(STEP); acc -= STEP; }
    for (const e of run.drainEvents()) onEvent(e);
    if (run.phase === 'running') {
      level.notes?.forEach((n, i) => { if (run.t >= n.t) hint(`note${i}`, n.text, 3800); });
      if (run.timeLeft <= 15) hint('hurry', 'のこり 15秒！', 1800);
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') { drag = null; view.aiming = null; resultTimer = window.setTimeout(() => (relay && run.phase === 'cleared' && relay.part < relay.parts - 1 ? relay.next(carryOf(run, relay)) : showResult()), run.phase === 'cleared' ? 2400 : 1600); }
    }
    paintHud();
    view.renderToss(run, dt);
    paintBubbles();
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
    frameEl.removeEventListener('pointermove', onMove);
    frameEl.removeEventListener('pointerup', onUp);
    frameEl.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    document.removeEventListener('visibilitychange', onHidden);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __bake?: unknown }).__bake;
    audio.close();
    view.dispose();
    helpers.dispose();
    elLabels.replaceChildren();
    root.classList.remove('bk-mode-toss');
  };
}
