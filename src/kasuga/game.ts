// 「春日大社へ」お試しの組み立て: 入力・画面表示(HUD)・効果音・ループ。
import { COURSE_LENGTH, buildCourse, type ObstacleKind } from './course.ts';
import { Run, type Input, type SimEvent } from './sim.ts';
import { KasugaView } from './view.ts';

const STEP = 1 / 120;

const HINTS: Record<ObstacleKind, string> = {
  hole: 'あな！ ジャンプで とびこえよう',
  poop: 'ふんを ふむと 操作が逆になるよ',
  fence: '柵は ジャンプ、すき間も あるよ',
  stone: 'ころがる岩！ タイミングよくジャンプ',
  deer: '鹿が よこぎるよ！ ジャンプでも越えられる',
};
const MILESTONES: [number, string][] = [
  [500, 'ちょうど 半分！ コインも いっぱい'],
  [800, 'もうすぐ 春日大社だよ'],
  [915, '赤い社殿が 見えてきた！'],
];

export function startKasuga(root: HTMLElement): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const course = buildCourse();
  const view = new KasugaView(q('stage'), course);
  let run = new Run(course);
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
      case 'jump': tone(360, 700, 0.16, 'sine', 0.08); break;
      case 'land': tone(160, 90, 0.08, 'sine', 0.05); break;
      case 'hit': tone(200, 60, 0.3, 'sawtooth', 0.1); break;
      case 'fall': tone(520, 50, 0.6, 'triangle', 0.1); break;
      case 'slip': tone(760, 220, 0.35, 'square', 0.05); break;
      case 'clear': [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.3, 'triangle', 0.1, i * 0.12)); break;
      case 'fail': tone(330, 80, 0.8, 'sawtooth', 0.08); break;
    }
  };

  // ---- HUD ----
  const elCoins = q('coins');
  const elHearts = q('hearts');
  const elFill = q('fill');
  const elMark = q('mark');
  const elToast = q('toast');
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
    elCoins.textContent = String(run.coins);
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, 3 - run.lives));
    const p = `${(run.progress * 100).toFixed(1)}%`;
    elFill.style.width = p;
    elMark.style.left = p;
  };

  let hinted = new Set<ObstacleKind>();
  let miles = new Set<number>();
  let resultTimer = 0;

  const showResult = () => {
    const cleared = run.phase === 'cleared';
    const time = run.t.toFixed(1);
    const total = course.coins.length;
    const stars = cleared ? (run.lives === 3 ? 3 : run.lives === 2 ? 2 : 1) : 0;
    q('r-title').textContent = cleared ? '春日大社に とうちゃく！' : 'ざんねん… もうすこしだった';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-coins').textContent = `${run.coins} / ${total}`;
    q('r-hearts').textContent = '♥'.repeat(Math.max(0, run.lives)) || '—';
    q('r-time').textContent = cleared ? `${time} 秒` : `${Math.floor(run.progress * 100)} % まで`;
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
    miles = new Set();
    input.left = input.right = input.jump = false;
    run.start();
    elStart.classList.remove('on');
    elResult.classList.remove('on');
    paintHud();
    toast('◀ ▶ で よけて、ジャンプで あなを こえよう！', 3200);
  };

  q('go').addEventListener('click', begin);
  q('retry').addEventListener('click', begin);

  // ---- 入力 ----
  const padEl = q('pad');
  const padPointers = new Map<number, 'left' | 'right'>();
  const sideOf = (ev: PointerEvent): 'left' | 'right' => {
    const r = padEl.getBoundingClientRect();
    return ev.clientX < r.left + r.width / 2 ? 'left' : 'right';
  };
  const syncPad = () => {
    const sides = new Set(padPointers.values());
    input.left = sides.has('left') && !sides.has('right');
    input.right = sides.has('right') && !sides.has('left');
    padEl.dataset.dir = input.left ? 'left' : input.right ? 'right' : '';
  };
  const onPadDown = (ev: PointerEvent) => {
    ev.preventDefault();
    padEl.setPointerCapture(ev.pointerId);
    padPointers.set(ev.pointerId, sideOf(ev));
    syncPad();
  };
  const onPadMove = (ev: PointerEvent) => {
    if (!padPointers.has(ev.pointerId)) return;
    padPointers.set(ev.pointerId, sideOf(ev));
    syncPad();
  };
  const onPadUp = (ev: PointerEvent) => {
    padPointers.delete(ev.pointerId);
    syncPad();
  };
  padEl.addEventListener('pointerdown', onPadDown);
  padEl.addEventListener('pointermove', onPadMove);
  padEl.addEventListener('pointerup', onPadUp);
  padEl.addEventListener('pointercancel', onPadUp);

  const jumpEl = q('jump');
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

  const keyMap: Record<string, keyof Input> = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  };
  const onKey = (down: boolean) => (ev: KeyboardEvent) => {
    const k = keyMap[ev.code];
    if (!k) return;
    ev.preventDefault();
    input[k] = down;
  };
  const kd = onKey(true);
  const ku = onKey(false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
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
      if (e.kind === 'hit' || e.kind === 'fall') {
        view.bump(0.4);
        toast(e.kind === 'fall' ? 'あなに おちた…！' : 'いたっ！');
      } else if (e.kind === 'slip') {
        view.bump(0.2);
        toast('ふんで スリップ！ 操作が逆に！', 1800);
      } else if (e.kind === 'clear') {
        toast('春日大社に とうちゃく！', 4000);
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
        if (d > 0 && d < 36 && !hinted.has(o.kind)) {
          hinted.add(o.kind);
          toast(HINTS[o.kind], 2800);
          break;
        }
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
    COURSE_LENGTH,
  };

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer);
    window.clearTimeout(resultTimer);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __kasuga?: unknown }).__kasuga;
    void ac?.close();
    view.dispose();
  };
}
