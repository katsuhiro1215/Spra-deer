// 3D走りゲームの組み立て: 入力・画面表示(HUD)・効果音・ループ・記録。
import { Progress } from '../progress.ts';
import type { Obstacle } from './course.ts';
import { CRITTERS } from './critters.ts';
import { RUNNER_LEVELS, courseOf, type RunnerLevel } from './levels.ts';
import { Run, type Input, type SimEvent } from './sim.ts';
import { KasugaView } from './view.ts';

const STEP = 1 / 120;

/** はじめて見る罠に出す一言(種類ごとに1回)。動物・モンスターは、動き方ごと。 */
const HINTS: Record<string, string> = {
  hole: 'あな！ ジャンプで とびこえよう',
  poop: 'ふんを ふむと 操作が逆になるよ',
  fence: '柵は ジャンプ、すき間も あるよ',
  stone: 'ころがる岩！ タイミングよくジャンプ',
  deer: '鹿が よこぎるよ！ ジャンプでも越えられる',
  puddle: 'みずたまり！ ふむと おそくなるよ',
  ice: 'こおり！ ふむと つるつる すべるよ',
  'critter:sleep': 'ねている どうぶつ！ そっと よけよう',
  'critter:cross': 'どうぶつが よこぎるよ！ タイミングを見て',
  'critter:hop': 'ぴょんぴょん！ とんでいる あいだに 通ろう',
  'critter:charge': 'つっこんでくる！ よけるか ジャンプ！',
};
const hintKey = (o: Obstacle) => (o.kind === 'critter' ? `critter:${o.behavior}` : o.kind);

export function startRunner(root: HTMLElement, level: RunnerLevel): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const course = courseOf(level);
  const view = new KasugaView(q('stage'), course, level);
  const progress = new Progress();
  const MILESTONES: [number, string][] = [
    [course.length * 0.5, level.lines[0]],
    [course.length * 0.8, level.lines[1]],
    [course.length * 0.92, level.lines[2]],
  ];
  const nextLevel = RUNNER_LEVELS[RUNNER_LEVELS.findIndex((l) => l.id === level.id) + 1];
  q('lv-id').textContent = `面 ${level.id}`;
  q('lv-title').textContent = level.title;
  q('lv-goal').textContent = level.goalName;
  q('s-title').textContent = level.title;
  q('s-lead').textContent = level.summary;
  let run = new Run(course);
  const byId = new Map(course.obstacles.map((o) => [o.id, o]));
  const input: Input = { left: false, right: false, jump: false };

  // ---- 効果音(WebAudio。最初のタップで有効化) ----
  let ac: AudioContext | null = null;
  const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.09, delay = 0) => {
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };
  const sound = (e: SimEvent) => {
    switch (e.kind) {
      case 'coin': tone(1180, 1760, 0.13, 'triangle', 0.08); break;
      case 'heal': [660, 880, 1100, 1320].forEach((f, i) => tone(f, f * 1.02, 0.22, 'sine', 0.09, i * 0.08)); break;
      case 'jump': tone(360, 700, 0.16, 'sine', 0.08); break;
      case 'launch': tone(280, 980, 0.3, 'triangle', 0.08); break;
      case 'land': tone(160, 90, 0.08, 'sine', 0.05); break;
      case 'hit': tone(200, 60, 0.3, 'sawtooth', 0.1); break;
      case 'fall': tone(520, 50, 0.6, 'triangle', 0.1); break;
      case 'slip': tone(760, 220, 0.35, 'square', 0.05); break;
      case 'slow': tone(300, 140, 0.25, 'sine', 0.08); break;
      case 'slide': tone(1500, 900, 0.4, 'triangle', 0.05); break;
      case 'clear': [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.3, 'triangle', 0.1, i * 0.12)); break;
      case 'fail': tone(330, 80, 0.8, 'sawtooth', 0.08); break;
    }
  };

  // 雨の面だけ、さーっという雨の音(ノイズ)を小さく流す
  let rainNode: AudioBufferSourceNode | null = null;
  const startRain = () => {
    if (level.theme.weather !== 'rain' || !ac || rainNode) return;
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3200;
    const gain = ac.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
    rainNode = src;
  };

  // ---- HUD ----
  const elCoins = q('coins');
  const elHearts = q('hearts');
  const elFill = q('fill');
  const elMark = q('mark');
  const elToast = q('toast');
  const elStatus = q('status');
  const elStart = q('start');
  const elResult = q('result');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2200) => {
    elToast.textContent = msg;
    elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  const paintHud = () => {
    // 操作できない・逆になっている間は、画面に出す(「反応しない」と見えないように)
    const msg = run.ice > 0 ? 'つるつる中… 曲がれない' : run.slip > 0 ? '操作が逆！' : '';
    if (elStatus.textContent !== msg) elStatus.textContent = msg;
    elStatus.classList.toggle('on', msg !== '');
    elCoins.textContent = String(run.coins);
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, 3 - run.lives));
    const p = `${(run.progress * 100).toFixed(1)}%`;
    elFill.style.width = p;
    elMark.style.left = p;
  };

  let hinted = new Set<string>();
  let woke = false; // 大仏の目が光った合図を出したか
  let miles = new Set<number>();
  let resultTimer = 0;

  let recorded = false;
  const showResult = () => {
    const cleared = run.phase === 'cleared';
    const time = run.t.toFixed(1);
    const total = course.coins.length;
    const stars = cleared ? (run.lives === 3 ? 3 : run.lives === 2 ? 2 : 1) : 0;
    let newBest = false;
    if (cleared && !recorded) {
      recorded = true;
      newBest = progress.clear(level.id, run.t);
    }
    const best = progress.get(level.id).best;
    q('r-title').textContent = cleared ? `${level.goalName}に とうちゃく！` : 'ざんねん… もうすこしだった';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-coins').textContent = `${run.coins} / ${total}`;
    q('r-hearts').textContent = '♥'.repeat(Math.max(0, run.lives)) || '—';
    q('r-time').textContent = cleared ? `${time} 秒${newBest ? '（ベスト更新！）' : ''}` : `${Math.floor(run.progress * 100)} % まで`;
    q('r-best').textContent = best === null ? '—' : `${best.toFixed(1)} 秒`;
    // クリアしたら次の面へ(最後の面なら、面えらびへ)
    const next = q<HTMLAnchorElement>('next');
    next.hidden = !cleared || !nextLevel;
    if (nextLevel) {
      next.href = `/run/?level=${nextLevel.id}`;
      next.textContent = `次の面へ（${nextLevel.id}）▶`;
    }
    elResult.classList.toggle('fail', !cleared);
    elResult.classList.add('on');
  };

  const begin = () => {
    if (!ac) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ac = new Ctor();
      } catch {
        ac = null;
      }
    }
    void ac?.resume();
    window.clearTimeout(resultTimer);
    run = new Run(course);
    hinted = new Set();
    woke = false;
    miles = new Set();
    recorded = false;
    releaseAll();
    run.start();
    progress.attempt(level.id);
    elStart.classList.remove('on');
    elResult.classList.remove('on');
    startRain();
    paintHud();
    toast(level.intro, 3600);
  };

  q('go').addEventListener('click', begin);
  q('retry').addEventListener('click', begin);

  // ---- 入力 ----
  // 左右は「キーボード」と「パッド」の2か所から入る。どちらも、最後に押した向きを優先する。
  // (左右を同時に押しても打ち消し合わない。キーの「離した」を取りこぼしても、次に押した向きが効く)
  const padEl = q('pad');
  const jumpEl = q('jump');
  const keyCodes: string[] = []; // 押している左右のキー(押した順)
  const padPointers = new Map<number, 'left' | 'right'>();
  const dirOfKey: Record<string, 'left' | 'right'> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const jumpKeys = new Set(['Space', 'ArrowUp', 'KeyW']);
  const applyDir = () => {
    const kb = keyCodes.length ? dirOfKey[keyCodes[keyCodes.length - 1]] : undefined;
    const pads = [...padPointers.values()];
    const dir = kb ?? pads[pads.length - 1];
    input.left = dir === 'left';
    input.right = dir === 'right';
    padEl.dataset.dir = dir ?? '';
  };
  /** すべての入力を離した状態にする(はじめ・画面が見えなくなったとき) */
  const releaseAll = () => {
    keyCodes.length = 0;
    padPointers.clear();
    input.jump = false;
    jumpEl.classList.remove('down');
    applyDir();
  };

  const sideOf = (ev: PointerEvent): 'left' | 'right' => {
    const r = padEl.getBoundingClientRect();
    return ev.clientX < r.left + r.width / 2 ? 'left' : 'right';
  };
  const onPadDown = (ev: PointerEvent) => {
    ev.preventDefault();
    padEl.setPointerCapture(ev.pointerId);
    padPointers.delete(ev.pointerId);
    padPointers.set(ev.pointerId, sideOf(ev));
    applyDir();
  };
  const onPadMove = (ev: PointerEvent) => {
    if (!padPointers.has(ev.pointerId)) return;
    const side = sideOf(ev);
    if (padPointers.get(ev.pointerId) !== side) {
      padPointers.delete(ev.pointerId);
      padPointers.set(ev.pointerId, side); // 向きを変えた指を、最後に押した扱いにする
      applyDir();
    }
  };
  const onPadUp = (ev: PointerEvent) => {
    padPointers.delete(ev.pointerId);
    applyDir();
  };
  padEl.addEventListener('pointerdown', onPadDown);
  padEl.addEventListener('pointermove', onPadMove);
  padEl.addEventListener('pointerup', onPadUp);
  padEl.addEventListener('pointercancel', onPadUp);
  padEl.addEventListener('lostpointercapture', onPadUp);

  const onJumpDown = (ev: PointerEvent) => {
    ev.preventDefault();
    jumpEl.setPointerCapture(ev.pointerId);
    input.jump = true;
    jumpEl.classList.add('down');
  };
  const onJumpUp = () => {
    input.jump = false;
    jumpEl.classList.remove('down');
  };
  jumpEl.addEventListener('pointerdown', onJumpDown);
  jumpEl.addEventListener('pointerup', onJumpUp);
  jumpEl.addEventListener('pointercancel', onJumpUp);

  const kd = (ev: KeyboardEvent) => {
    if (dirOfKey[ev.code]) {
      ev.preventDefault();
      if (ev.repeat) return;
      const i = keyCodes.indexOf(ev.code);
      if (i >= 0) keyCodes.splice(i, 1);
      keyCodes.push(ev.code);
      applyDir();
    } else if (jumpKeys.has(ev.code)) {
      ev.preventDefault();
      input.jump = true;
    }
  };
  const ku = (ev: KeyboardEvent) => {
    if (dirOfKey[ev.code]) {
      const i = keyCodes.indexOf(ev.code);
      if (i >= 0) keyCodes.splice(i, 1);
      applyDir();
    } else if (jumpKeys.has(ev.code)) {
      input.jump = false;
    }
  };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  // 画面を離れたとき(別のウィンドウ・タブ)は、キーの「離した」が届かないので、全部離した扱いにする
  const onHidden = () => releaseAll();
  window.addEventListener('blur', onHidden);
  document.addEventListener('visibilitychange', onHidden);
  const noMenu = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);

  // ---- ループ ----
  let raf = 0;
  let last = performance.now();
  let acc = 0;
  let prevPhase = run.phase;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      run.step(STEP, input);
      acc -= STEP;
    }
    for (const e of run.drainEvents()) {
      sound(e);
      const hitCritter = e.id !== undefined ? byId.get(e.id)?.critter : undefined;
      if (hitCritter && (e.kind === 'hit' || e.kind === 'slip' || e.kind === 'slow' || e.kind === 'slide')) {
        view.bump(e.kind === 'hit' ? 0.4 : 0.2);
        toast(CRITTERS[hitCritter].line, 2000);
      } else if (e.kind === 'hit' || e.kind === 'fall') {
        view.bump(0.4);
        toast(e.kind === 'fall' ? 'あなに おちた…！' : 'いたっ！');
      } else if (e.kind === 'slip') {
        view.bump(0.2);
        toast('ふんで スリップ！ 操作が逆に！', 1800);
      } else if (e.kind === 'heal') {
        toast('回復薬！ ハートが ふえた', 2000);
      } else if (e.kind === 'slow') {
        toast('ばしゃっ！ おそくなった', 1400);
      } else if (e.kind === 'slide') {
        view.bump(0.12);
        toast('つるつる〜！ 曲がれない！', 1600);
      } else if (e.kind === 'clear') {
        toast(`${level.goalName}に とうちゃく！`, 4000);
      }
      if (e.kind === 'coin') {
        elCoins.classList.remove('ks-pop');
        void elCoins.offsetWidth;
        elCoins.classList.add('ks-pop');
      }
    }
    if (run.phase === 'running') {
      for (const o of course.obstacles) {
        const d = o.s - run.s;
        if (d > 0 && d < 36 && !hinted.has(hintKey(o))) {
          hinted.add(hintKey(o));
          toast(HINTS[hintKey(o)], 2800);
          break;
        }
      }
      if (!hinted.has('ramp') && course.bumps?.some((b) => b.s - run.s > 0 && b.s - run.s < 40)) {
        hinted.add('ramp');
        toast('ジャンプ台！ 先っぽで 跳ぶと 大ジャンプ！', 2800);
      }
      if (course.wake !== undefined && !woke && run.progress >= course.wake) {
        woke = true;
        view.bump(0.3);
        tone(110, 70, 1.2, 'sawtooth', 0.08);
        toast('大仏さまの 目が 光った…！ 罠が ふえるよ！', 3400);
      }
      for (const [s, msg] of MILESTONES) {
        if (run.s >= s && !miles.has(s)) {
          miles.add(s);
          toast(msg, 2600);
        }
      }
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') {
        resultTimer = window.setTimeout(showResult, run.phase === 'cleared' ? 2600 : 900);
      }
    }
    paintHud();
    view.render(run, dt);
  };
  paintHud();
  raf = requestAnimationFrame(frame);

  // 動作確認用(開発中の自動テストから状態を読む)
  (window as unknown as { __kasuga?: unknown }).__kasuga = {
    get run() { return run; },
    course,
    input,
    level,
    view,
  };

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer);
    window.clearTimeout(resultTimer);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', onHidden);
    document.removeEventListener('visibilitychange', onHidden);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __kasuga?: unknown }).__kasuga;
    try { rainNode?.stop(); } catch { /* 止まっていたら何もしない */ }
    void ac?.close();
    view.dispose();
  };
}
