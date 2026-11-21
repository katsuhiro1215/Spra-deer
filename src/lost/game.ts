// WORLD 7「鹿のまいご探し」の組み立て: 入力(さわって動かす・矢じるしキー)・絵(2Dの canvas)・画面の表示・音・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { RunnerAudio } from '../runner/audio.ts';
import { facingOf, type Facing } from '../game/facing.ts';
import { LOST_LEVELS, type LostLevel } from './levels.ts';
import { LBAL, LostRun, type Fawn, type LInput, type LostEvent, type Senbei, type Stag } from './sim.ts';

const STEP = 1 / 120;
/** BGM: Spra Deer Lost Child(DEER-13)。108秒をくり返す */
const LOST_BGM = { url: '/assets/audio/lost.mp3', loopStart: 22.59, loopEnd: 130.89, volume: 0.36 };
const A = '/assets';
/** 画面の横に 見えるマスの数 */
const VIEW_COLS = 9;

/** Spra の歩く絵(6つの向き)。cycle = 歩くときの こまの順 */
const WALK: Record<Facing, { n: number; cycle: number[]; idle: number }> = {
  dr: { n: 3, cycle: [1, 0, 2, 0], idle: 0 }, dl: { n: 3, cycle: [1, 0, 2, 0], idle: 0 },
  ur: { n: 3, cycle: [1, 0, 2, 0], idle: 0 }, ul: { n: 3, cycle: [1, 0, 2, 0], idle: 0 },
  down: { n: 4, cycle: [2, 1, 3, 1], idle: 1 }, up: { n: 4, cycle: [1, 2, 3, 2], idle: 0 },
};
const spraSrc = (f: Facing, i: number) => `${A}/spru-walk/${f}_${i}.png`;
const fawnSrc = (dir: number, i: number) => `${A}/deer-walk/fawn_${dir < 0 ? 'l' : 'r'}_${i}.png`;
const MOTHER = `${A}/deer-walk/doe_l_0.png`;
const stagSrc = (dir: number, i: number) => `${A}/deer-walk/stag_${dir < 0 ? 'l' : 'r'}_${i}.png`;
/** リボンの色(お母さんが 2頭の面: M・F は ピンク、N・G は 水色) */
const RIBBON = ['#ff5f93', '#3fa2ff'];
/** 絵の高さ(マス) */
const H_SPRA = 1.2, H_FAWN = 0.85, H_MOTHER = 1.2, H_STAG = 1.55;

/** 位置から決まる 0〜1 の数(木の形を少しずつ変える) */
const hash = (c: number, r: number) => { const s = Math.sin(c * 127.1 + r * 311.7) * 43758.5453; return s - Math.floor(s); };

export function startLost(root: HTMLElement, level: LostLevel): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const wallet = new Wallet();
  const progress = new Progress();
  const stage = q('stage');
  const canvas = document.createElement('canvas');
  canvas.className = 'ks-canvas';
  stage.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const dark = document.createElement('canvas');
  const dctx = dark.getContext('2d')!;
  const nextLevel = LOST_LEVELS[LOST_LEVELS.findIndex(l => l.id === level.id) + 1];
  const premiumTaken = wallet.hasPremium(level.id);

  // 絵を読みこむ
  const imgs = new Map<string, HTMLImageElement>();
  const img = (src: string) => {
    let i = imgs.get(src);
    if (!i) { i = new Image(); i.src = src; imgs.set(src, i); }
    return i;
  };
  for (const [f, w] of Object.entries(WALK)) for (let i = 0; i < w.n; i++) img(spraSrc(f as Facing, i));
  for (let i = 0; i < 4; i++) { img(fawnSrc(1, i)); img(fawnSrc(-1, i)); img(stagSrc(1, i)); img(stagSrc(-1, i)); }
  img(MOTHER);

  // 画面の大きさ(1マス = scale px)
  let W = 0, H = 0, scale = 1, dpr = 1;
  const resize = () => {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    for (const c of [canvas, dark]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    scale = W / VIEW_COLS;
  };
  const newRun = () => {
    const r = new LostRun(level);
    if (premiumTaken) r.coins = r.coins.filter(c => c.kind !== 'premium');
    return r;
  };
  let run = newRun();
  const silverTotal = () => run.coins.filter(c => !c.kind).length;
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  q('lv-id').textContent = `面 ${level.id}`;
  q('lv-title').textContent = level.title;
  q('s-title').textContent = level.title;
  q('s-lead').textContent = level.summary;
  q('s-lesson').textContent = level.lesson;
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ' : '◆ この面には プレミアムコインが 1まい かくれている';

  // ---- 音 ----
  const audio = new RunnerAudio();
  const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, delay = 0) => {
    const ac = audio.ctx;
    if (!ac) return;
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.out ?? ac.destination);
    o.start(ac.currentTime); o.stop(t0 + dur + 0.02);
  };
  const sound = (e: LostEvent) => {
    switch (e.kind) {
      case 'coin': tone(1180, 1760, 0.1, 'triangle', 0.06); break;
      case 'gold': audio.sfx('gold'); break;
      case 'premium': audio.sfx('premium'); break;
      case 'candle': audio.sfx('heal'); break;
      case 'found': tone(880, 1320, 0.14, 'triangle', 0.07); tone(1320, 1760, 0.2, 'triangle', 0.07, 0.12); break;
      case 'regain': tone(880, 1320, 0.14, 'triangle', 0.07); break;
      case 'warn': tone(620, 520, 0.16, 'sine', 0.06); break;
      case 'stray': tone(760, 380, 0.45, 'sine', 0.07); break;
      case 'home': audio.sfx('checkpoint'); break;
      case 'dim': tone(320, 200, 0.45, 'sine', 0.06); break;
      case 'lamp': tone(520, 1040, 0.25, 'triangle', 0.06); tone(780, 1560, 0.3, 'sine', 0.04, 0.08); break;
      case 'senbei': tone(660, 990, 0.12, 'triangle', 0.07); break;
      case 'eat': tone(500, 420, 0.1, 'square', 0.03); tone(500, 420, 0.1, 'square', 0.03, 0.16); break;
      case 'bump': audio.sfx('hit'); break;
      case 'scare': tone(900, 500, 0.25, 'sine', 0.05); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elCoins = q('coins'), elGold = q('gold'), elPrem = q('prem'), elFawns = q('fawns'), elFill = q('fill'), elOil = q('oil');
  const elToast = q('toast'), elStart = q('start'), elResult = q('result');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2200) => {
    elToast.textContent = msg; elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  const paintHud = () => {
    elCoins.textContent = String(run.silver); elGold.textContent = String(run.gold); elPrem.hidden = !run.premium;
    elFawns.textContent = `子鹿 ${run.homeCount}/${run.fawns.length}`;
    const k = run.oil / level.oil;
    elFill.style.width = `${k * 100}%`;
    elFill.classList.toggle('low', k < LBAL.dimAt);
    elOil.textContent = `ちょうちんの 火 ${Math.ceil(run.oil)}秒`;
  };
  const paintStamina = () => {
    const st = wallet.stamina;
    const txt = `体力 ${st} / ${STAMINA_MAX}` + (st < STAMINA_FAIL ? `(回復まで ${waitText(wallet.waitToPlay)})` : '');
    for (const k of ['s-stamina', 'r-stamina']) { const e = q(k); e.textContent = txt; e.classList.toggle('low', st < STAMINA_FAIL); }
  };
  let charged = false, recorded = false, resultTimer = 0;
  const showResult = () => {
    const cleared = run.phase === 'cleared', stars = run.stars;
    let newBest = false;
    if (cleared && !recorded) {
      recorded = true;
      newBest = progress.clear(level.id, run.t, true);
      const got = clearRewards(wallet, level.id, { silver: run.silver, gold: run.gold, star3: stars === 3 });
      const prem = run.premium && wallet.takePremium(level.id);
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '') + (prem ? '　+1 プレミアム！' : '');
      q('r-reward').classList.remove('lose');
    }
    if (!cleared && !charged) {
      charged = true; wallet.fail(); // 失敗: 体力が2減る(設計書 25-2)
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    q('r-title').textContent = cleared ? 'お母さんに 会えたね！' : 'ちょうちんの 火が 消えちゃった…';
    q('r-tip').textContent = cleared
      ? stars < 3 ? (run.strays > 0 ? '子鹿を はぐれさせずに 帰ると ★が ふえるよ' : `${level.par}秒より 早く 帰ると ★が ふえるよ`) : ''
      : '子鹿が おくれたら、止まって 待ってあげよう。ろうそくを 取ると 火が もどるよ';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-coins').textContent = `${run.silver} / ${silverTotal()}` + (run.gold ? `　金 ${run.gold}` : '') + (run.premium ? '　◆' : '');
    q('r-stray').textContent = `${run.strays} 回`;
    q('r-time').textContent = cleared ? `${run.t.toFixed(1)} 秒${newBest ? '(ベスト！)' : ''}` : `子鹿 ${run.homeCount} / ${run.fawns.length}`;
    const best = progress.get(level.id).best;
    q('r-best').textContent = best === null ? '—' : `${best.toFixed(1)} 秒`;
    const next = q<HTMLAnchorElement>('next');
    next.hidden = !cleared || !nextLevel;
    if (nextLevel) { next.href = `/lost/?level=${nextLevel.id}`; next.textContent = `次の面へ(${nextLevel.id}) ▶`; }
    elResult.classList.toggle('fail', !cleared);
    elResult.classList.add('on');
  };

  const begin = () => {
    if (!wallet.canPlay()) { paintStamina(); toast(`体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`, 3000); return; }
    charged = false; recorded = false;
    q('r-reward').textContent = '';
    audio.ensure();
    audio.stopMusic(0); audio.startMusic(LOST_BGM);
    window.clearTimeout(resultTimer);
    run = newRun();
    run.start();
    walked = 0; facing = 'up';
    progress.attempt(level.id);
    elStart.classList.remove('on'); elResult.classList.remove('on');
    paintHud();
    toast(level.intro, 3200);
  };

  // ---- 入力: 画面を さわって 動かす(さわった所が まん中)・矢じるしキー ----
  const input: LInput = { x: 0, y: 0 };
  const keys = new Set<string>();
  let stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  const STICK_R = 46;
  const apply = () => {
    const kx = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
    const ky = Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW'));
    if (kx || ky) { const m = Math.hypot(kx, ky); input.x = kx / m; input.y = ky / m; return; }
    if (stick) {
      let x = (stick.x - stick.ox) / STICK_R, y = (stick.y - stick.oy) / STICK_R;
      const m = Math.hypot(x, y);
      if (m < 0.18) x = y = 0; else if (m > 1) { x /= m; y /= m; }
      input.x = x; input.y = y;
    } else { input.x = 0; input.y = 0; }
  };
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
  const kd = (e: KeyboardEvent) => { if (KEYS.includes(e.code)) { e.preventDefault(); keys.add(e.code); apply(); } };
  const ku = (e: KeyboardEvent) => { keys.delete(e.code); apply(); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  const frame = root.querySelector<HTMLElement>('.ks-frame')!;
  const local = (ev: PointerEvent) => { const r = stage.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const down = (ev: PointerEvent) => {
    if ((ev.target as HTMLElement).closest('.ks-overlay, button, a') || stick) return;
    ev.preventDefault();
    const p = local(ev);
    stick = { id: ev.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y }; apply();
  };
  const move = (ev: PointerEvent) => {
    if (!stick || ev.pointerId !== stick.id) return;
    const p = local(ev);
    stick.x = p.x; stick.y = p.y;
    // 指が 遠くへ 行ったら、まん中も ついていく(向きを かえやすい)
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, m = Math.hypot(dx, dy);
    if (m > STICK_R * 1.6) { stick.ox = stick.x - (dx / m) * STICK_R * 1.6; stick.oy = stick.y - (dy / m) * STICK_R * 1.6; }
    apply();
  };
  const up = (ev: PointerEvent) => { if (stick && ev.pointerId === stick.id) { stick = null; apply(); } };
  frame.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  const onHidden = () => { keys.clear(); stick = null; apply(); };
  window.addEventListener('blur', onHidden);
  const noMenu = (e: Event) => e.preventDefault();
  root.addEventListener('contextmenu', noMenu);

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
  q('go').addEventListener('click', () => begin());
  q('retry').addEventListener('click', () => begin());
  paintSound(); paintStamina(); paintHud();

  // ---- 絵 ----
  const pops: { text: string; x: number; y: number; t: number; color: string }[] = [];
  let camX = 0, camY = 0, walked = 0, facing: Facing = 'up', cry = 0;
  const sx = (x: number) => (x - camX) * scale;
  const sy = (y: number) => (y - camY) * scale;
  const font = (k: number) => `900 ${Math.round(scale * k)}px 'M PLUS Rounded 1c', sans-serif`;
  const label = (text: string, x: number, y: number, color: string, k = 0.3) => {
    ctx.font = font(k); ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.fillStyle = color;
    ctx.strokeText(text, x, y); ctx.fillText(text, x, y);
  };
  /** 絵を、足もと(x, 下の y)に合わせて 描く */
  const drawImg = (src: string, x: number, bottom: number, h: number, flip = false) => {
    const i = img(src);
    if (!i.complete || !i.naturalWidth) return;
    const ph = h * scale, pw = (ph * i.naturalWidth) / i.naturalHeight;
    ctx.save(); ctx.translate(sx(x), sy(bottom));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(i, -pw / 2, -ph, pw, ph);
    ctx.restore();
  };
  const shadow = (x: number, y: number, rx: number) => {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(sx(x), sy(y), rx * scale, rx * 0.38 * scale, 0, 0, Math.PI * 2); ctx.fill();
  };
  const tile = (c: number, r: number) => (c < 0 || r < 0 || c >= run.cols || r >= run.rows ? '#' : run.tiles[r][c]);

  const drawGround = (c0: number, c1: number, r0: number, r1: number) => {
    ctx.fillStyle = '#3f6a34'; ctx.fillRect(0, 0, W, H);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const t = tile(c, r), x = sx(c), y = sy(r), s = scale + 1;
      if (t === '~') {
        ctx.fillStyle = '#2b5f8e'; ctx.fillRect(x, y, s, s);
        ctx.strokeStyle = 'rgba(180,220,255,0.35)'; ctx.lineWidth = 2;
        const w = Math.sin(run.t * 1.5 + c + r * 2) * scale * 0.1;
        ctx.beginPath(); ctx.moveTo(x + scale * 0.2 + w, y + scale * 0.5); ctx.lineTo(x + scale * 0.6 + w, y + scale * 0.5); ctx.stroke();
      } else if (t !== '#') {
        // 道(砂利)。となりの道と つながって見えるよう、少し大きめ
        ctx.fillStyle = '#c9b68a'; ctx.fillRect(x - 1, y - 1, s + 1, s + 1);
        ctx.fillStyle = 'rgba(120,100,70,0.25)';
        for (let k = 0; k < 3; k++) { const h = hash(c * 3 + k, r * 5 - k); ctx.fillRect(x + h * scale * 0.85, y + hash(r + k, c) * scale * 0.85, 3, 3); }
      } else {
        ctx.fillStyle = hash(c, r) > 0.5 ? '#3f6a34' : '#456f38'; ctx.fillRect(x, y, s, s);
      }
    }
  };
  const drawTree = (c: number, r: number) => {
    const h = hash(c, r), cx = c + 0.5 + (h - 0.5) * 0.12, rad = 0.56 + h * 0.1;
    shadow(cx, r + 0.88, 0.42);
    ctx.fillStyle = '#5b3d24'; ctx.fillRect(sx(cx - 0.07), sy(r + 0.5), scale * 0.14, scale * 0.4);
    const px = sx(cx), py = sy(r + 0.32);
    ctx.fillStyle = h > 0.66 ? '#2c5a33' : h > 0.33 ? '#2f6538' : '#356b36';
    ctx.beginPath(); ctx.arc(px, py, rad * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,190,110,0.35)';
    ctx.beginPath(); ctx.arc(px - rad * scale * 0.3, py - rad * scale * 0.3, rad * scale * 0.5, 0, Math.PI * 2); ctx.fill();
  };
  /** 石灯籠(春日大社に 多い、石の あかり) */
  const drawLamp = (c: number, r: number, lit = true) => {
    const x = sx(c + 0.5), b = sy(r + 0.9), u = scale;
    shadow(c + 0.5, r + 0.9, 0.35);
    ctx.fillStyle = '#8d8a80';
    ctx.fillRect(x - u * 0.28, b - u * 0.12, u * 0.56, u * 0.12); // 台
    ctx.fillRect(x - u * 0.09, b - u * 0.62, u * 0.18, u * 0.5); // 柱
    ctx.fillRect(x - u * 0.24, b - u * 0.7, u * 0.48, u * 0.1); // 受け
    const fl = 0.85 + Math.sin(run.t * 9 + c) * 0.08 + Math.sin(run.t * 23 + r) * 0.05;
    ctx.fillStyle = '#6f6c63'; ctx.fillRect(x - u * 0.2, b - u * 1.0, u * 0.4, u * 0.3); // 火袋
    ctx.fillStyle = lit ? `rgba(255,${Math.round(190 * fl)},90,${fl})` : '#2e2c28'; ctx.fillRect(x - u * 0.12, b - u * 0.95, u * 0.24, u * 0.2);
    ctx.fillStyle = '#5d5a52'; // 笠
    ctx.beginPath(); ctx.moveTo(x - u * 0.36, b - u * 0.98); ctx.lineTo(x + u * 0.36, b - u * 0.98); ctx.lineTo(x + u * 0.08, b - u * 1.2); ctx.lineTo(x - u * 0.08, b - u * 1.2); ctx.fill();
    ctx.fillRect(x - u * 0.05, b - u * 1.3, u * 0.1, u * 0.1);
  };
  /** Spra が 手に持つ ちょうちん */
  const drawChochin = (x: number, feet: number, side: number, swing: number) => {
    const hx = sx(x + side * 0.24), hy = sy(feet - 0.55), u = scale;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(swing);
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -u * 0.12); ctx.lineTo(0, u * 0.02); ctx.stroke();
    const g = ctx.createRadialGradient(0, u * 0.15, u * 0.02, 0, u * 0.15, u * 0.2);
    g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#ff9a3a'); g.addColorStop(1, '#d9481f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, u * 0.15, u * 0.12, u * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a1d14'; ctx.fillRect(-u * 0.07, u * 0.0, u * 0.14, u * 0.035); ctx.fillRect(-u * 0.07, u * 0.28, u * 0.14, u * 0.035);
    ctx.strokeStyle = 'rgba(160,50,20,0.6)'; ctx.lineWidth = 1;
    for (const k of [0.09, 0.15, 0.21]) { ctx.beginPath(); ctx.moveTo(-u * 0.11, u * k); ctx.lineTo(u * 0.11, u * k); ctx.stroke(); }
    ctx.restore();
  };
  /** リボン(お母さんが 2頭の面だけ。同じ色の 親子) */
  const ribbon = (x: number, y: number, color: string) => {
    if (run.mothers.length < 2) return;
    const px = sx(x), py = sy(y), u = scale * 0.13;
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + k * u * 1.4, py - u * 0.8); ctx.lineTo(px + k * u * 1.4, py + u * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(px, py, u * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  const drawFawn = (f: Fawn) => {
    const bob = f.state === 'lost' ? Math.sin(run.t * 2 + f.id) * 0.02 : 0;
    shadow(f.x, f.y + 0.28, 0.3);
    const frame = f.moving ? Math.floor(run.t * 9 + f.id) % 4 : 0;
    drawImg(fawnSrc(f.dir, frame), f.x, f.y + 0.3 + bob, H_FAWN);
    ribbon(f.x + f.dir * 0.12, f.y + 0.3 + bob - H_FAWN * 0.5, RIBBON[run.mothers[f.mother]?.id ?? 0]);
  };
  const drawMother = (i: number) => {
    const m = run.mothers[i];
    shadow(m.x, m.y + 0.3, 0.42);
    drawImg(MOTHER, m.x, m.y + 0.32, H_MOTHER);
    ribbon(m.x - 0.18, m.y + 0.32 - H_MOTHER * 0.55, RIBBON[m.id]);
  };
  /** 見回りの 大きな鹿 */
  const drawStag = (st: Stag) => {
    shadow(st.x, st.y + 0.3, 0.5);
    const frame = st.rest > 0 ? 0 : Math.floor(run.t * 6 + st.id) % 4;
    drawImg(stagSrc(st.dir, frame), st.x, st.y + 0.34, H_STAG);
  };
  /** 道ばたの せんべい */
  const drawSenbei = (sb: Senbei) => {
    const x = sx(sb.x), y = sy(sb.y), r = scale * 0.2;
    ctx.fillStyle = '#d9a25b'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#a8702f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#b97a3a';
    for (const [dx, dy] of [[-0.3, -0.2], [0.25, -0.1], [0, 0.3]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r * 0.7, r * 0.1, 0, Math.PI * 2); ctx.fill(); }
  };
  const drawSpra = () => {
    const moving = Math.hypot(run.vx, run.vy) > 0.3;
    const w = WALK[facing];
    const frame = moving ? w.cycle[Math.floor(walked * 2.6) % w.cycle.length] : w.idle;
    const feet = run.y + 0.28, side = facing === 'dl' || facing === 'ul' ? -1 : 1;
    shadow(run.x, feet, 0.26);
    const swing = Math.sin(run.t * 9) * (moving ? 0.25 : 0.06);
    // 奥向きのときは ちょうちんが 前(先に Spra を描く)。手前向きのときは うしろの手
    if (facing === 'up' || facing === 'ul' || facing === 'ur') { drawImg(spraSrc(facing, frame), run.x, feet, H_SPRA); drawChochin(run.x, feet, side, swing); }
    else { drawChochin(run.x, feet, side, swing); drawImg(spraSrc(facing, frame), run.x, feet, H_SPRA); }
  };
  /** 暗やみ: 照らしたことのある所は うっすら、ちょうちん・石灯籠の まわりは 明るい */
  const drawDark = (c0: number, c1: number, r0: number, r1: number) => {
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = 'rgba(6,10,32,0.95)'; dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';
    dctx.fillStyle = 'rgba(0,0,0,0.34)';
    for (let r = Math.max(0, r0); r <= Math.min(run.rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(run.cols - 1, c1); c++) {
      if (!level.fog && run.seen[r * run.cols + c]) dctx.fillRect(sx(c), sy(r), scale + 0.5, scale + 0.5);
    }
    const hole = (x: number, y: number, rad: number) => {
      const g = dctx.createRadialGradient(sx(x), sy(y), rad * scale * 0.45, sx(x), sy(y), rad * scale);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g;
      dctx.beginPath(); dctx.arc(sx(x), sy(y), rad * scale, 0, Math.PI * 2); dctx.fill();
    };
    const fl = 1 + Math.sin(run.t * 11) * 0.015 + Math.sin(run.t * 4.3) * 0.02;
    hole(run.x, run.y - 0.2, run.lightRadius * fl);
    for (const l of run.lamps) if (l.lit) hole(l.x, l.y, LBAL.lampLight * (1 + Math.sin(run.t * 7 + l.x) * 0.02));
    for (const m of run.mothers) hole(m.x, m.y, 1.1);
    ctx.drawImage(dark, 0, 0, W, H);
    // ちょうちんの あたたかい色
    const g = ctx.createRadialGradient(sx(run.x), sy(run.y - 0.2), 0, sx(run.x), sy(run.y - 0.2), run.lightRadius * scale);
    g.addColorStop(0, 'rgba(255,190,90,0.22)'); g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };
  /** 画面の はしの 矢じるし(子鹿・お母さんの いる方向) */
  const drawCompass = () => {
    const lost = run.fawns.filter(f => f.state === 'lost').sort((a, b) => Math.hypot(a.x - run.x, a.y - run.y) - Math.hypot(b.x - run.x, b.y - run.y))[0];
    const lead = run.fawns.find(f => f.state === 'follow' && f.leader < 0);
    const target = lead ? run.mothers[lead.mother] : level.compass === 'all' ? lost : undefined;
    if (!target) return;
    const dx = target.x - run.x, dy = target.y - run.y, d = Math.hypot(dx, dy);
    if (d < run.lightRadius - 0.3) return;
    const a = Math.atan2(dy, dx), rr = 1.25 + Math.sin(run.t * 4) * 0.08;
    const x = sx(run.x + Math.cos(a) * rr), y = sy(run.y - 0.4 + Math.sin(a) * rr);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = lead ? (run.mothers.length > 1 ? RIBBON[run.mothers[lead.mother].id] : '#ffb3c8') : '#ffd36b'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    const u = scale * 0.22;
    ctx.beginPath(); ctx.moveTo(u, 0); ctx.lineTo(-u * 0.7, -u * 0.75); ctx.lineTo(-u * 0.35, 0); ctx.lineTo(-u * 0.7, u * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    label(lead ? 'お母さん' : '子鹿', x, y - scale * 0.3, lead ? '#ffd0dc' : '#ffe9a8', 0.22);
  };

  const draw = (dt: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // カメラ: Spra を まん中に。地図の はしでは 止める(上下は、上の表示と 下の あそびの分 だけ 外も 見せる)
    const vh = H / scale;
    const tx = Math.max(0, Math.min(run.cols - VIEW_COLS, run.x - VIEW_COLS / 2));
    const ty = Math.max(-3.8, Math.min(run.rows - vh + 1.2, run.y - vh * 0.55));
    const k = Math.min(1, dt * 8);
    camX += (tx - camX) * k; camY += (ty - camY) * k;
    const c0 = Math.floor(camX) - 1, c1 = Math.ceil(camX + VIEW_COLS) + 1, r0 = Math.floor(camY) - 1, r1 = Math.ceil(camY + vh) + 2;
    drawGround(c0, c1, r0, r1);
    // コイン・ろうそく(地面の上)
    for (const c of run.coins) {
      if (run.collected.has(c.id)) continue;
      const x = sx(c.x), y = sy(c.y), r = scale * (c.kind ? 0.2 : 0.15), spin = Math.abs(Math.sin(run.t * 3 + c.id));
      ctx.save(); ctx.translate(x, y); ctx.scale(0.35 + spin * 0.65, 1);
      if (c.kind === 'premium') {
        ctx.fillStyle = '#b06ff0'; ctx.beginPath(); ctx.moveTo(0, -r * 1.3); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.3); ctx.lineTo(-r, 0); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.fillStyle = c.kind === 'gold' ? '#ffc83a' : '#dfe5ea'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c.kind === 'gold' ? '#c98a10' : '#8e99a4'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }
    for (const sb of run.senbei) if (!run.gone.has(sb.id)) drawSenbei(sb);
    // 木・石灯籠・人や鹿を、足もとの 高さの順に 描く(下にいるものが 手前)
    const items: { y: number; f: () => void }[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const t = tile(c, r);
      if (t === '#') items.push({ y: r + 0.9, f: () => drawTree(c, r) });
      else if (t === 'L' || t === 'l') items.push({ y: r + 0.9, f: () => drawLamp(c, r, t === 'L') });
    }
    for (const k2 of run.candles) {
      if (run.collected.has(-1 - k2.id)) continue;
      items.push({ y: k2.y + 0.2, f: () => {
        const x = sx(k2.x), y = sy(k2.y + 0.2), u = scale;
        ctx.fillStyle = '#f4efe2'; ctx.fillRect(x - u * 0.06, y - u * 0.36, u * 0.12, u * 0.36);
        const fl = 1 + Math.sin(run.t * 13 + k2.id) * 0.15;
        ctx.fillStyle = '#ffb547'; ctx.beginPath(); ctx.ellipse(x, y - u * 0.45, u * 0.05 * fl, u * 0.1 * fl, 0, 0, Math.PI * 2); ctx.fill();
      } });
    }
    run.mothers.forEach((m, i) => items.push({ y: m.y + 0.32, f: () => drawMother(i) }));
    for (const f of run.fawns) items.push({ y: f.y + 0.3, f: () => drawFawn(f) });
    for (const st of run.stags) items.push({ y: st.y + 0.34, f: () => drawStag(st) });
    items.push({ y: run.y + 0.28, f: drawSpra });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.f();

    drawDark(c0, c1, r0, r1);

    // 霧: 白い もやが ゆっくり 流れる
    if (level.fog) {
      for (let i = 0; i < 7; i++) {
        const fx = ((((i * 0.31 + run.t * 0.02 * (1 + (i % 3))) % 1.4) + 1.4) % 1.4 - 0.2) * W, fy = ((i * 0.37) % 1) * H;
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, W * 0.45);
        g.addColorStop(0, 'rgba(200,210,230,0.16)'); g.addColorStop(1, 'rgba(200,210,230,0)');
        ctx.fillStyle = g; ctx.fillRect(fx - W * 0.45, fy - W * 0.45, W * 0.9, W * 0.9);
      }
    }
    // 大きな鹿の 目は、暗くても 光って見える
    for (const st of run.stags) {
      const ex = sx(st.x + st.dir * 0.42), ey = sy(st.y + 0.34 - H_STAG * 0.7);
      ctx.fillStyle = '#fff3a0'; ctx.shadowColor = '#ffe36b'; ctx.shadowBlur = 8;
      for (const k of [0, 1]) { ctx.beginPath(); ctx.arc(ex - st.dir * k * scale * 0.1, ey, scale * 0.045, 0, Math.PI * 2); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    // ぶつかって 目が まわっている
    if (run.stun > 0) label('★ ☆ ★', sx(run.x + Math.sin(run.t * 12) * 0.1), sy(run.y - 1.15), '#ffe36b', 0.22);
    // ろうそくは 暗くても 小さく 光って見える
    for (const k2 of run.candles) {
      if (run.collected.has(-1 - k2.id)) continue;
      const g = ctx.createRadialGradient(sx(k2.x), sy(k2.y - 0.25), 0, sx(k2.x), sy(k2.y - 0.25), scale * 0.5);
      g.addColorStop(0, 'rgba(255,200,110,0.7)'); g.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx(k2.x), sy(k2.y - 0.25), scale * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    // まいごの子鹿: 「ぴぃ…」と鳴く 声の輪(暗くても 見える)
    const cycle = 2.4, ph = (run.t % cycle) / cycle;
    if (run.phase === 'running' && (run.t % cycle) < cry) {
      for (const f of run.fawns) {
        if (f.state !== 'lost') continue;
        const d = Math.hypot(f.x - run.x, f.y - run.y);
        if (d < 10) tone(1500, 1150, 0.18, 'sine', 0.05 * (1 - d / 10));
      }
    }
    cry = run.t % cycle;
    for (const f of run.fawns) {
      if (f.state === 'lost') {
        for (const off of [0, 0.25]) {
          const p = ph - off;
          if (p < 0) continue;
          ctx.strokeStyle = `rgba(255,232,170,${(1 - p) * 0.75})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), (0.3 + p * 2) * scale, 0, Math.PI * 2); ctx.stroke();
        }
        if (ph < 0.45) {
          const px = sx(f.x), py = sy(f.y - 0.85), d = Math.hypot(f.x - run.x, f.y - run.y);
          if (px > -10 && px < W + 10 && py > 90 && py < H - 30) label('ぴぃ…', px, py, '#fff2c8', 0.28);
          else if (d < 14) {
            // 画面の外: 声が 聞こえる 方の はしに 小さく 出す
            const cx = W / 2, cy = sy(run.y), a = Math.atan2(py - cy, px - cx);
            const ex = Math.max(34, Math.min(W - 34, cx + Math.cos(a) * W)), ey = Math.max(120, Math.min(H - 40, cy + Math.sin(a) * W));
            ctx.globalAlpha = 0.5 + 0.5 * (1 - d / 14);
            label('ぴぃ…', ex, ey, '#fff2c8', 0.24);
            ctx.globalAlpha = 1;
          }
        }
      } else if (f.eat) {
        if (!f.eat.back) label('もぐもぐ', sx(f.x), sy(f.y - 0.85), '#ffd79a', 0.24);
      } else if (f.state === 'follow' && run.connected(f) && run.pathLen(f) > LBAL.warn) {
        label('まって〜', sx(f.x), sy(f.y - 0.85), '#ffd0dc', 0.26);
      } else if (f.state === 'home') {
        const hy = sy(f.y - 0.9 - ((run.t * 0.6) % 1) * 0.5);
        ctx.globalAlpha = 1 - ((run.t * 0.6) % 1);
        label('♥', sx(f.x + 0.35), hy, '#ff7a9a', 0.34);
        ctx.globalAlpha = 1;
      }
    }
    // お母さん: 子鹿を 待っている
    run.mothers.forEach((m, i) => {
      if (run.fawns.some(f => f.mother === i && f.state !== 'home') && Math.sin(run.t * 1.3 + i) > 0.2) label('ぼうや〜', sx(m.x), sy(m.y - 1.05), '#ffe0e8', 0.24);
    });
    if (level.compass && run.phase === 'running') drawCompass();
    // ぽんっと出る文字
    for (const p of pops) {
      p.t += dt;
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.1);
      const half = 60, px = Math.min(W - half, Math.max(half, sx(p.x)));
      label(p.text, px, sy(p.y) - p.t * 40, p.color, 0.36);
      ctx.globalAlpha = 1;
    }
    for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 1.1) pops.splice(i, 1);
    // さわって 動かす まる
    if (stick && run.phase === 'running') {
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(stick.ox + input.x * STICK_R, stick.oy + input.y * STICK_R, STICK_R * 0.42, 0, Math.PI * 2); ctx.fill();
    }
  };

  // ---- ループ ----
  let raf = 0, last = performance.now(), acc = 0, prevPhase = run.phase;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; acc += dt;
    while (acc >= STEP) { run.step(STEP, input); acc -= STEP; }
    const sp = Math.hypot(run.vx, run.vy);
    if (sp > 0.3) { facing = facingOf(run.vx, run.vy); walked += dt * (sp / LBAL.speed); }
    for (const e of run.drain()) {
      sound(e);
      const f = e.id !== undefined ? run.fawns[e.id] : undefined;
      if (e.kind === 'found') { toast(level.notes?.found ?? '見つけた！', 3200); if (f) pops.push({ text: '見つけた！', x: f.x, y: f.y - 1, t: 0, color: '#ffe36b' }); }
      else if (e.kind === 'regain' && f) pops.push({ text: 'いっしょに 行こう', x: f.x, y: f.y - 1, t: 0, color: '#ffe36b' });
      else if (e.kind === 'warn') toast(level.notes?.warn ?? 'まって〜！', 2400);
      else if (e.kind === 'stray') toast(level.notes?.stray ?? '子鹿が 止まっちゃった', 3200);
      else if (e.kind === 'home' && f) { pops.push({ text: 'お母さん！', x: f.x, y: f.y - 1, t: 0, color: '#ff9ab4' }); const left = run.fawns.filter(g => g.state !== 'home').length; if (left) toast(`あと ${left}ひき！`, 2200); }
      else if (e.kind === 'candle') pops.push({ text: `ろうそく！ 火が +${LBAL.candle}秒`, x: run.x, y: run.y - 1.2, t: 0, color: '#ffc46b' });
      else if (e.kind === 'dim') toast('ちょうちんの 火が 小さくなってきた…', 2600);
      else if (e.kind === 'gold') pops.push({ text: 'ゴールド！', x: run.x, y: run.y - 1.2, t: 0, color: '#ffc83a' });
      else if (e.kind === 'premium') toast('◆ プレミアムコイン！！', 2400);
      else if (e.kind === 'lamp') { const l = run.lamps[e.id ?? 0]; pops.push({ text: '灯籠に 火が ついた！', x: l.x, y: l.y - 1, t: 0, color: '#ffd36b' }); }
      else if (e.kind === 'senbei') pops.push({ text: 'せんべいを 拾った', x: run.x, y: run.y - 1.2, t: 0, color: '#f0b45a' });
      else if (e.kind === 'eat') toast('子鹿が せんべいを 食べに 行っちゃった！ 食べおわるまで 待ってあげよう', 3000);
      else if (e.kind === 'bump') { pops.push({ text: 'ドン！', x: run.x, y: run.y - 1.2, t: 0, color: '#ff8a6a' }); toast(run.fawns.some(g => g.state === 'lost' && g.met) ? '大きな鹿に ぶつかった！ 子鹿が びっくりして 止まっちゃった' : '大きな鹿に ぶつかった！', 3000); }
      else if (e.kind === 'clear') toast(run.fawns.length > 1 ? 'みんな お母さんに 会えたね！' : 'お母さんに 会えたね！', 3000);
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') resultTimer = window.setTimeout(showResult, run.phase === 'cleared' ? 2400 : 1300);
    }
    paintHud();
    draw(dt);
  };
  raf = requestAnimationFrame(loop);

  // 動作確認用(開発中の自動テストから状態を読む)
  (window as unknown as { __lost?: unknown }).__lost = { get run() { return run; }, input, level };

  return () => {
    if (run.phase === 'running' && !charged) { charged = true; wallet.fail(); }
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer); window.clearTimeout(resultTimer);
    ro.disconnect();
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', onHidden);
    frame.removeEventListener('pointerdown', down);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __lost?: unknown }).__lost;
    audio.close();
    canvas.remove();
  };
}
