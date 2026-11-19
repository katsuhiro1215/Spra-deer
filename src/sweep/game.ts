// WORLD 3「奈良公園、大掃除！」の組み立て: 指で左右・HUD・うんこの数字・音・ループ・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { RunnerAudio } from '../runner/audio.ts';
import { SWEEP_LEVELS, type SweepLevel } from './levels.ts';
import { SweepRun, WBAL, type SweepEvent } from './sim.ts';
import { SweepView } from './view.ts';

const STEP = 1 / 120;
const BGM = { url: '/assets/audio/play.mp3', loopStart: 0, loopEnd: 1e4, volume: 0.3 };
/** シルバーコイン = 点数 ÷ この数 */
const SCORE_PER_COIN = 25;

export function startSweep(root: HTMLElement, level: SweepLevel): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const wallet = new Wallet();
  const progress = new Progress();
  const premiumTaken = wallet.hasPremium(level.id);
  const newRun = () => new SweepRun(level, { premium: !premiumTaken });
  const stage = q('stage');
  const view = new SweepView(stage, level.length);
  const nextLevel = SWEEP_LEVELS[SWEEP_LEVELS.findIndex(l => l.id === level.id) + 1];
  let run = newRun();
  let charged = false, recorded = false;

  q('lv-id').textContent = `面 ${level.id}`;
  q('lv-title').textContent = level.title;
  q('s-title').textContent = level.title;
  q('s-lead').textContent = `${level.summary}。大仏さまの所まで ${level.length}m、うんこを 掃除しながら 歩こう！`;
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ' : `◆ よごれ ${level.premiumUnder}%以下で ゴールすると…？`;

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
  let cleanSounds = 0;
  const sound = (e: SweepEvent) => {
    switch (e.kind) {
      // さっ(ほうき)。竜巻は ごうっ
      case 'sweep': if (run.stats.level >= 4) noise(0.28, 0.08, 'bandpass', 500, 0, 0.7, 1400); else noise(0.12, 0.07, 'bandpass', 2400, 0, 1.4, 1200); break;
      case 'hit': noise(0.05, 0.12, 'lowpass', 600); break;
      case 'clean': {
        // 1回のほうきで たくさん掃いても、音は少しだけ
        if (cleanSounds++ > 2) break;
        const f = 660 * Math.pow(2, Math.min(run.combo, 24) / 24);
        tone(f, f * 1.5, 0.09, 'triangle', e.poop === 'small' ? 0.05 : 0.07);
        if (e.poop === 'large' || e.hard) tone(f * 1.25, f * 2, 0.16, 'sine', 0.06, 0.06);
        if (e.hard) audio.sfx('gold');
        break;
      }
      case 'miss': tone(260, 140, 0.25, 'triangle', 0.06); break;
      case 'flower': [880, 1109, 1319].forEach((f, i) => tone(f, f, 0.12, 'sine', 0.05, i * 0.05)); break;
      case 'level': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.07, i * 0.07)); break;
      case 'combo': tone(988, 1319, 0.15, 'sine', 0.05); break;
      case 'warn': [0, 0.4, 0.8].forEach(d => tone(1320, 1240, 0.3, 'sine', 0.05, d)); break;
      case 'glow': tone(110, 80, 1.2, 'sawtooth', 0.05); noise(0.9, 0.12, 'lowpass', 300); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elCoins = q('coins'), elGold = q('gold'), elDirt = q('dirt'), elDirtBox = q('dirt-box'), elDirtBar = q('dirt-bar');
  const elRoadBar = q('road-bar'), elRoadSpra = q('road-spra'), elBroom = q('broom'), elBroomLv = q('broom-lv'), elBroomName = q('broom-name'), elBroomBar = q('broom-bar');
  const elBuddha = q('buddha'), elFlowers = q('flowers'), elCombo = q('combo'), elAlert = q('alert'), elToast = q('toast'), elStart = q('start'), elResult = q('result'), elLabels = q('labels');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2400) => {
    elToast.textContent = msg; elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  const pop = (s: number, x: number, y: number, text: string, tone_ = '') => {
    const p = view.toScreen(view.at(run, s, x, y));
    const el = document.createElement('div');
    el.className = 'sw-pop'; el.textContent = text; el.dataset.tone = tone_;
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    elLabels.append(el);
    window.setTimeout(() => el.remove(), 850);
  };
  // 固いうんこの、のこりの回数
  const hpTags = new Map<number, HTMLElement>();
  const paintLabels = () => {
    const seen = new Set<number>(), running = run.phase === 'running';
    for (const p of run.poops) {
      const a = run.ahead(p.s);
      if (!running || p.maxHp <= 1 || a > 16 || a < -0.2) continue;
      seen.add(p.id);
      let el = hpTags.get(p.id);
      if (!el) { el = document.createElement('div'); el.className = 'sw-hp'; elLabels.append(el); hpTags.set(p.id, el); }
      const at = view.toScreen(view.at(run, p.s, p.x, 0.62 * (p.kind === 'large' ? 1.25 : 1)));
      el.style.transform = `translate(${at.x}px, ${at.y}px) translate(-50%, -100%)`;
      const txt = p.hard ? `硬 ${p.hp}` : `${p.hp}`;
      if (el.textContent !== txt) el.textContent = txt;
      if (p.hard) el.dataset.hard = ''; else delete el.dataset.hard;
    }
    for (const [id, el] of hpTags) if (!seen.has(id)) { el.remove(); hpTags.delete(id); }
  };
  const alertText = (): [string, string] => {
    if (run.phase !== 'running') return ['', ''];
    if (run.buddha === 'glow') return ['目が 光った！ うんこが 硬くなる！', 'gold'];
    if (run.buddha === 'warn') return [`目が 光るまで… ${Math.ceil(run.buddhaLeft)}`, 'yellow'];
    if (run.pollution >= 80) return ['よごれが いっぱい！ のがさないで！', 'red'];
    return ['', ''];
  };
  let lastLv = 1;
  const paintHud = () => {
    elCoins.textContent = String(Math.floor(run.score / SCORE_PER_COIN));
    elGold.textContent = String(run.gold);
    const pol = Math.round(run.pollution);
    elDirt.textContent = String(pol);
    elDirtBar.style.width = `${pol}%`;
    elDirtBox.dataset.tone = pol >= 80 ? 'red' : pol >= 50 ? 'yellow' : '';
    const k = run.progress * 100;
    elRoadBar.style.width = `${k}%`;
    elRoadSpra.style.left = `${k}%`;
    const st = run.stats, next = run.nextBroomAt;
    elBroomLv.textContent = `Lv${st.level}`;
    if (elBroomName.textContent !== st.name) elBroomName.textContent = st.name;
    elBroom.dataset.lv = String(st.level);
    elBroomBar.style.width = next === null ? '100%' : `${Math.min(100, ((run.score - st.threshold) / (next - st.threshold)) * 100)}%`;
    if (st.level !== lastLv) { lastLv = st.level; elBroom.classList.remove('up'); void elBroom.offsetWidth; elBroom.classList.add('up'); }
    elFlowers.textContent = String(run.flowers.length);
    elCombo.hidden = run.combo < 3;
    if (run.combo >= 3) elCombo.textContent = `コンボ ×${run.combo}`;
    const [msg, tone_] = alertText();
    if (elAlert.textContent !== msg) elAlert.textContent = msg;
    elAlert.dataset.tone = tone_;
    elAlert.classList.toggle('on', msg !== '');
    // 大仏さま(近づいてから出る。目が光る前は ちかちか、光ると 光った目の絵)
    const b = level.buddha, show = !!b && run.progress >= b.from && run.phase === 'running';
    elBuddha.hidden = !show;
    if (show) {
      const img = run.buddha === 'glow' || (run.buddha === 'warn' && Math.floor(run.t * 8) % 2 === 0) ? 1 : 0;
      const url = `/assets/runner/daibutsu_${img}.png`;
      if (elBuddha.dataset.img !== url) { elBuddha.dataset.img = url; elBuddha.style.backgroundImage = `url(${url})`; }
      elBuddha.dataset.state = run.buddha;
    }
  };
  const paintStamina = () => {
    const st = wallet.stamina;
    const txt = `体力 ${st} / ${STAMINA_MAX}` + (st < STAMINA_FAIL ? `(回復まで ${waitText(wallet.waitToPlay)})` : '');
    for (const k of ['s-stamina', 'r-stamina']) { const e = q(k); e.textContent = txt; e.classList.toggle('low', st < STAMINA_FAIL); }
  };
  let resultTimer = 0;
  const showResult = () => {
    const cleared = run.phase === 'cleared';
    const pol = Math.round(run.pollution);
    const stars = cleared ? (pol < 30 ? 3 : pol < 60 ? 2 : 1) : 0;
    let newBest = false;
    if (cleared && !recorded) {
      recorded = true;
      newBest = progress.clear(level.id, run.t);
      const got = clearRewards(wallet, level.id, { silver: Math.floor(run.score / SCORE_PER_COIN), gold: run.gold, star3: stars === 3 });
      const prem = run.premium && wallet.takePremium(level.id);
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '') + (prem ? '　+1 プレミアム！' : '');
      q('r-reward').classList.remove('lose');
    }
    if (!cleared && !charged) {
      charged = true; wallet.fail();
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    const best = progress.get(level.id).best;
    q('r-title').textContent = cleared ? '大仏さまに 着いた！ 参道 ぴかぴか！' : '公園が、うんこだらけ…！';
    q('r-tip').textContent = cleared ? '' : `大仏さままで あと ${Math.ceil(level.length - run.d)}m。うんこの 前に 立つと、ほうきが 届くよ`;
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-dirt').textContent = `${pol}%`;
    q('r-cleaned').textContent = `${run.cleaned} こ` + (run.maxCombo >= 5 ? `(コンボ ${run.maxCombo})` : '');
    q('r-flowers').textContent = `${run.flowers.length} こ`;
    q('r-broom').textContent = `Lv${run.stats.level} ${run.stats.name}`;
    q('r-time').textContent = cleared ? `${run.t.toFixed(1)} 秒${newBest ? '(ベスト更新！)' : ''}` : '—';
    q('r-best').textContent = best === null ? '—' : `${best.toFixed(1)} 秒`;
    const next = q<HTMLAnchorElement>('next');
    next.hidden = !cleared || !nextLevel;
    if (nextLevel) { next.href = `/sweep/?level=${nextLevel.id}`; next.textContent = `次の面へ(${nextLevel.id})▶`; }
    elResult.classList.toggle('fail', !cleared);
    elResult.classList.add('on');
  };

  let hinted = new Set<string>();
  const hint = (key: string, msg: string, ms = 3000) => { if (!hinted.has(key)) { hinted.add(key); toast(msg, ms); } };
  const begin = () => {
    if (!wallet.canPlay()) { paintStamina(); toast(`体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`, 3000); return; }
    charged = false; recorded = false;
    q('r-reward').textContent = '';
    audio.ensure(); ac = audio.ctx;
    audio.stopMusic(0); audio.startMusic(BGM);
    window.clearTimeout(resultTimer);
    run = newRun();
    view.clearRun();
    for (const el of hpTags.values()) el.remove();
    hpTags.clear();
    lastLv = 1; drag = null;
    hinted = new Set();
    run.start();
    progress.attempt(level.id);
    elStart.classList.remove('on'); elResult.classList.remove('on');
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
  q('retry').addEventListener('click', () => begin());

  // ---- 入力: 指を置いた所からの、横のずれで動かす(Spra に さわらなくてよい) ----
  const frameEl = q('frame');
  let drag: { id: number; x0: number; target0: number } | null = null;
  const onDown = (ev: PointerEvent) => {
    if ((ev.target as HTMLElement).closest('a, button, .ks-overlay.on')) return;
    ev.preventDefault();
    if (run.phase !== 'running') return;
    drag = { id: ev.pointerId, x0: ev.clientX, target0: run.targetX };
    frameEl.setPointerCapture?.(ev.pointerId);
  };
  const onMove = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.id) return;
    // 指の動きの 1.3倍(小さく動かしても、端まで届く)
    run.steer(drag.target0 + ((ev.clientX - drag.x0) / view.pxPerMeter()) * 1.3);
  };
  const onUp = (ev: PointerEvent) => { if (drag && ev.pointerId === drag.id) drag = null; };
  frameEl.addEventListener('pointerdown', onDown);
  frameEl.addEventListener('pointermove', onMove);
  frameEl.addEventListener('pointerup', onUp);
  frameEl.addEventListener('pointercancel', onUp);
  const keys = new Set<string>();
  const kd = (ev: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(ev.code)) { ev.preventDefault(); keys.add(ev.code); }
  };
  const ku = (ev: KeyboardEvent) => { keys.delete(ev.code); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  const onHidden = () => { if (document.hidden) audio.suspend(); else audio.resume(); };
  document.addEventListener('visibilitychange', onHidden);
  const noMenu = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);

  const onEvent = (e: SweepEvent) => {
    sound(e);
    view.onEvent(e, run);
    switch (e.kind) {
      case 'clean':
        if (e.poop !== 'small' || e.hard) pop(e.s!, e.x!, 0.5, `+${e.n}`, e.hard ? 'gold' : '');
        hint('clean', 'きれいに なった！ 点数が たまると、ほうきが 育つよ', 2600);
        if (e.poop === 'large') hint('large', '大きい うんこ、やっつけた！', 1800);
        break;
      case 'hit':
        if (e.n! >= 3) hint('hit', '数字は のこりの回数。前に 立って、何回も 掃こう', 3000);
        break;
      case 'miss':
        pop(e.s!, e.x!, 0.4, `よごれ +${Math.round(((e.n ?? 0) / level.limit) * 100)}%`, 'miss');
        hint('miss', '掃きのこして 通りすぎると、よごれが ふえる！', 2800);
        break;
      case 'flower':
        pop(e.s!, e.x!, 0.9, '✿ お花が 咲いた！', 'flower');
        hint('flower', 'うんこが 肥料になって、お花が 咲いた！ よごれが 少し へる', 3200);
        break;
      case 'level': {
        const st = run.stats;
        pop(run.d + 1, run.x, 1.4, `${st.name}！`, 'big');
        toast(st.level >= 4 ? '竜巻ほうき！！ まとめて 吹きとばせ！' : `ほうきが 育った！ ${st.name}(Lv${st.level})`, 2400);
        break;
      }
      case 'combo': pop(run.d + 1.2, run.x, 1.1, `${e.n} コンボ！`, 'gold'); break;
      case 'warn': hint('warn', '大仏さまの目が 光ると、落ちた うんこが 硬くなる！', 3000); break;
      case 'clear': toast('大仏さまに 着いた！ 参道が ぴかぴか！', 3000); break;
    }
  };

  let raf = 0, last = performance.now(), acc = 0, prevPhase = run.phase;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; acc += dt;
    if (keys.size && run.phase === 'running') {
      const dir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      // キーは 1秒に 3.5m(指より ゆっくり。ねらった所で止めやすく)
      if (dir) run.steer(run.targetX + dir * 3.5 * dt);
    }
    while (acc >= STEP) { run.step(STEP); acc -= STEP; }
    cleanSounds = 0;
    for (const e of run.drainEvents()) onEvent(e);
    if (run.phase === 'running') {
      level.notes?.forEach((n, i) => { if (run.progress >= n.at) hint(`note${i}`, n.text, 3800); });
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') { drag = null; resultTimer = window.setTimeout(showResult, run.phase === 'cleared' ? 2400 : 1600); }
    }
    paintHud();
    view.render(run, dt);
    paintLabels();
  };
  paintHud();
  paintStamina();
  raf = requestAnimationFrame(frame);

  (window as unknown as { __sweep?: unknown }).__sweep = { get run() { return run; }, level, view, audio, WBAL };

  return () => {
    if (run.phase === 'running' && !charged) { charged = true; wallet.fail(); }
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer); window.clearTimeout(resultTimer);
    frameEl.removeEventListener('pointerdown', onDown);
    frameEl.removeEventListener('pointermove', onMove);
    frameEl.removeEventListener('pointerup', onUp);
    frameEl.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    document.removeEventListener('visibilitychange', onHidden);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __sweep?: unknown }).__sweep;
    audio.close();
    view.dispose();
    elLabels.replaceChildren();
  };
}
