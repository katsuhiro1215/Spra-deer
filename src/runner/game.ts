// 3D走りゲームの組み立て: 入力・画面表示(HUD)・効果音・ループ・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
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
  crossing: 'カンカン… 踏切だ！ 遮断機は すき間か ジャンプで',
  bolt: '光る輪に 雷が落ちる！ 輪の外へ よけて！',
  leaf: '落ち葉の山！ ふむと すべるよ',
  fish: '金魚が 跳んでくる！ 低い所は ジャンプで くぐれる',
  sheet: '花見の シート！ ふむと コインを 落とすよ',
};
const hintKey = (o: Obstacle) => (o.kind === 'critter' ? `critter:${o.behavior}` : o.deco ?? o.kind);

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
  // チェックポイント: 通過したときの状態を覚えておき、失敗したら、そこから続けられる
  type Snapshot = { s: number; name: string; coins: number; collected: Set<number>; t: number };
  const CPS = (level.checkpoints ?? []).map((c) => ({ s: c.at * course.length, name: c.name }));
  const cpEls = CPS.map((c) => {
    const el = document.createElement('span');
    el.className = 'ks-progress-cp';
    el.style.left = `${(c.s / course.length) * 100}%`;
    q('mark').before(el);
    return el;
  });
  let saved: Snapshot | null = null;
  const wallet = new Wallet();
  let charged = false; // この回の失敗で、体力をもう減らしたか
  let continued = false;
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
      // 踏切の「カンカン」(2つの音を交互に、約4秒)
      case 'bell': for (let i = 0; i < 9; i++) tone(i % 2 ? 760 : 900, i % 2 ? 750 : 890, 0.22, 'square', 0.035, i * 0.45); break;
      case 'warn': tone(1400, 1600, 0.12, 'sine', 0.04); break;
      case 'thunder': noise(0.9, 0.16, 380); tone(90, 40, 0.9, 'sawtooth', 0.06); break;
      case 'spill': [880, 660, 520].forEach((f, i) => tone(f, f * 0.9, 0.12, 'triangle', 0.07, i * 0.07)); break;
      // 法螺貝(ブオォ〜): 低い音を、少しゆらして長く
      case 'charge': if (level.horn) { tone(196, 208, 1.1, 'sawtooth', 0.05); tone(392, 410, 1.1, 'triangle', 0.03); } break;
    }
  };
  /** ざーっ・ゴロゴロという音(短いノイズ)。 */
  const noise = (dur: number, vol: number, freq: number) => {
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start();
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
    const msg = run.ice > 0 ? 'つるつる中… 曲がれない' : run.slip > 0 ? '操作が逆！' : run.boost > 0 ? 'ダッシュ！' : '';
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
  /** 体力の行(はじめる・結果のカード) */
  const paintStamina = () => {
    const st = wallet.stamina;
    const txt = `体力 ${st} / ${STAMINA_MAX}` + (st < STAMINA_FAIL ? `(回復まで ${waitText(wallet.waitToPlay)})` : '');
    for (const k of ['s-stamina', 'r-stamina']) {
      const e = q(k);
      e.textContent = txt;
      e.classList.toggle('low', st < STAMINA_FAIL);
    }
  };
  const showResult = () => {
    const cleared = run.phase === 'cleared';
    const time = run.t.toFixed(1);
    const total = course.coins.length;
    const stars = cleared ? (run.lives === 3 ? 3 : run.lives === 2 ? 2 : 1) : 0;
    let newBest = false;
    if (cleared && !recorded) {
      recorded = true;
      newBest = progress.clear(level.id, run.t, !continued); // 途中から続けたときは、タイムを記録しない
      // ごほうび(設計書 25-3): 取ったコインはシルバーとして持ち帰り。はじめてのクリア・★3でゴールド
      const got = clearRewards(wallet, level.id, { silver: run.coins, star3: stars === 3 });
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '');
      q('r-reward').classList.remove('lose');
    }
    if (!cleared && !charged) {
      // 失敗: 体力が2減る(設計書 25-2)
      charged = true;
      wallet.fail();
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    const best = progress.get(level.id).best;
    q('r-title').textContent = cleared ? `${level.goalName}に とうちゃく！` : 'ざんねん… もうすこしだった';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-coins').textContent = `${run.coins} / ${total}`;
    q('r-hearts').textContent = '♥'.repeat(Math.max(0, run.lives)) || '—';
    q('r-time').textContent = cleared
      ? `${time} 秒${continued ? '（途中から）' : newBest ? '（ベスト更新！）' : ''}`
      : `${Math.floor(run.progress * 100)} % まで`;
    const cont = q<HTMLButtonElement>('cont');
    cont.hidden = cleared || !saved;
    if (saved) cont.textContent = `${saved.name}から つづける`;
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

  const begin = (from: Snapshot | null = null) => {
    if (!wallet.canPlay()) {
      // 体力が足りない: 始めない(ホームのアイテムで回復薬が使える)
      paintStamina();
      toast(`体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`, 3000);
      return;
    }
    charged = false;
    q('r-reward').textContent = '';
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
    continued = !!from;
    if (from) {
      // チェックポイントから: 位置・コイン・取ったコインをもどす。後ろの電車・雷・突進は、もう終わった扱い
      run.s = from.s;
      run.t = from.t;
      run.coins = from.coins;
      for (const id of from.collected) run.collected.add(id);
      for (const o of course.obstacles) {
        if (o.trig !== undefined && o.s < from.s + 2) {
          run.chargeT.set(o.id, -1e6);
          run.struck.add(o.id);
        }
      }
      for (const [s] of MILESTONES) if (s <= from.s) miles.add(s);
    } else {
      saved = null;
    }
    cpEls.forEach((el, i) => el.classList.toggle('passed', !!saved && CPS[i].s <= saved.s));
    releaseAll();
    run.start();
    if (!from) progress.attempt(level.id);
    elStart.classList.remove('on');
    elResult.classList.remove('on');
    startRain();
    paintHud();
    toast(from ? `${from.name}から 再スタート！` : level.intro, 3600);
  };

  q('go').addEventListener('click', () => begin());
  q('retry').addEventListener('click', () => begin());
  q('cont').addEventListener('click', () => begin(saved));

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
      const hitObj = e.id !== undefined ? byId.get(e.id) : undefined;
      const hitCritter = hitObj?.critter;
      if (e.kind === 'thunder') {
        view.flash();
        view.bump(0.15);
      } else if (e.kind === 'launch' && run.boost > 0) {
        view.bump(0.12);
        toast('ジャンプ台！ ダッシュ！', 1400);
      } else if (e.kind === 'charge') {
        if (level.horn) toast('ブオォ〜 法螺貝だ！ 何かが 突進してくる！', 2200);
      } else if (e.kind === 'spill') {
        view.bump(0.15);
        toast(run.spilled > 0 ? `シートを ふんじゃった… コインを ${run.spilled}まい 落とした` : 'シートを ふんじゃった！', 2000);
      } else if (e.kind === 'slow' && hitObj?.kind === 'fish') {
        view.bump(0.2);
        toast('金魚が ぴちっ！ おそくなった', 1800);
      } else if (e.kind === 'slide' && hitObj?.kind === 'leaf') {
        toast('落ち葉で すべった！', 1500);
      } else if (e.kind === 'fall' && run.onBridge) {
        view.bump(0.4);
        toast('つり橋から 落ちた…！ まんなかを たもって', 2000);
      } else if (e.kind === 'hit' && hitObj?.kind === 'bolt') {
        view.bump(0.4);
        toast('ビリビリッ！ 雷に 打たれた…', 2000);
      } else if (e.kind === 'hit' && hitObj?.kind === 'train') {
        view.bump(0.5);
        toast('電車に ぶつかった！', 2000);
      } else if (hitCritter && (e.kind === 'hit' || e.kind === 'slip' || e.kind === 'slow' || e.kind === 'slide')) {
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
      if (!hinted.has('bridge') && course.bridge && course.bridge.from - run.s > 0 && course.bridge.from - run.s < 40) {
        hinted.add('bridge');
        toast('谷瀬のつり橋！ ゆれて 押されるよ。◀ ▶ で まんなかへ！', 3200);
      }
      if (!hinted.has('ramp') && course.bumps?.some((b) => b.s - run.s > 0 && b.s - run.s < 40)) {
        hinted.add('ramp');
        toast('ジャンプ台！ 乗ると ダッシュ。先っぽで 跳ぶと 大ジャンプ！', 2800);
      }
      if (course.wake !== undefined && !woke && run.progress >= course.wake) {
        woke = true;
        view.bump(0.3);
        tone(110, 70, 1.2, 'sawtooth', 0.08);
        toast('大仏さまの 目が 光った…！ 罠が ふえるよ！', 3400);
      }
      CPS.forEach((c, i) => {
        if (run.s >= c.s && (!saved || saved.s < c.s)) {
          saved = { s: c.s, name: c.name, coins: run.coins, collected: new Set(run.collected), t: run.t };
          cpEls[i].classList.add('passed');
          [784, 988, 1175].forEach((f, k) => tone(f, f, 0.16, 'triangle', 0.08, k * 0.09));
          toast(`チェックポイント！ ${c.name}`, 2200);
        }
      });
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

  paintStamina();

  return () => {
    // 走っている途中でページを離れたら、失敗と同じく体力が減る(設計書 25-2)
    if (run.phase === 'running' && !charged) {
      charged = true;
      wallet.fail();
    }
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
