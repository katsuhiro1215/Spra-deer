// WORLD 5「鹿の背中で ぴょんぴょん」の組み立て: 入力・絵(2Dの canvas)・画面の表示・音・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { RunnerAudio } from '../runner/audio.ts';
import { JUMP_LEVELS, type JumpLevel, type JumpScene } from './levels.ts';
import { JBAL, JumpRun, type JInput, type JumpEvent, type Pad } from './sim.ts';

const STEP = 1 / 120;
/** BGM: Spra Deer Jump(DEER-11)。68秒をくり返す */
const JUMP_BGM = { url: '/assets/audio/jump.mp3', loopStart: 28.09, loopEnd: 96.11, volume: 0.36 };
const A = '/assets';

/** 鹿の絵: 絵の高さ(m)と、足場(背中・頭)が 絵の下から どれだけ上か(m) */
const ART = {
  lie: { src: [`${A}/bake/stag_lie.png`], h: 1.55, top: 0.85 },
  walk: { src: [0, 1, 2, 3].map(i => `${A}/deer-walk/doe_r_${i}.png`), h: 1.6, top: 0.93 },
  bow: { src: [`${A}/bake/stag_front.png`, `${A}/bake/stag_sneak.png`], h: 1.7, top: 1.19 },
  sleep: { src: [`${A}/bake/stag_lie.png`, `${A}/bake/stag_front.png`], h: 1.55, top: 0.85 },
  hop: { src: [0, 1, 2, 3].map(i => `${A}/deer-walk/doe_r_${i}.png`), h: 1.3, top: 0.76 },
} as const;
/** 空のようす: 下の方の高さ(0)と てっぺん(1)の、空の色 [上, 下] と、山の色 */
const SKY: Record<JumpScene, { lo: [string, string]; hi: [string, string]; hill: string }> = {
  day: { lo: ['#a9dcf5', '#e2f5f0'], hi: ['#5aa6e8', '#bfe4f5'], hill: '#a7c98a' },
  forest: { lo: ['#b9e2cf', '#e6f4d8'], hi: ['#6db6d9', '#cdebd6'], hill: '#5f9a57' },
  evening: { lo: ['#f7c08f', '#fde7c3'], hi: ['#d77fa0', '#f6b98a'], hill: '#b98b6a' },
  sky: { lo: ['#cfeaff', '#ffffff'], hi: ['#7cc0f5', '#e6f5ff'], hill: '#ffffff' },
  night: { lo: ['#1d2a55', '#34477a'], hi: ['#0b1230', '#1d2a55'], hill: '#24325e' },
};
const LANDMARK = { kasuga: { src: `${A}/runner/landmarks/kasuga.webp`, h: 4.2 }, 'kofukuji-pagoda': { src: `${A}/runner/landmarks/kofukuji-pagoda.webp`, h: 9 }, 'todaiji-hall': { src: `${A}/runner/landmarks/todaiji-hall.webp`, h: 5.2 } } as const;
const SPRA = { up: `${A}/bake/spra_hooray.png`, idle: `${A}/bake/spra_idle.png`, oops: `${A}/bake/spra_trouble.png`, h: 1.45 };

/** 2つの色(#rrggbb)を k で まぜる */
const mix = (a: string, b: string, k: number): string => {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
};

export function startJump(root: HTMLElement, level: JumpLevel): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const wallet = new Wallet();
  const progress = new Progress();
  const stage = q('stage');
  const canvas = document.createElement('canvas');
  canvas.className = 'ks-canvas';
  stage.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const nextLevel = JUMP_LEVELS[JUMP_LEVELS.findIndex(l => l.id === level.id) + 1];
  const premiumTaken = wallet.hasPremium(level.id);

  // 絵を読みこむ
  const imgs = new Map<string, HTMLImageElement>();
  const img = (src: string) => {
    let i = imgs.get(src);
    if (!i) { i = new Image(); i.src = src; imgs.set(src, i); }
    return i;
  };
  for (const k of Object.values(ART)) for (const s of k.src) img(s);
  for (const s of [SPRA.up, SPRA.idle, SPRA.oops]) img(s);
  if (level.landmark) img(LANDMARK[level.landmark].src);

  // 画面の大きさ(1m = scale px)
  let W = 0, H = 0, scale = 1, dpr = 1;
  const resize = () => {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    scale = W / JBAL.width;
    run.viewH = H / scale;
  };
  const newRun = () => {
    const r = new JumpRun(level, H && scale ? H / scale : 16);
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
  q('lv-goal').textContent = level.goalName;
  q('s-title').textContent = level.title;
  q('s-lead').textContent = level.summary;
  q('s-lesson').textContent = level.lesson;
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ' : '◆ この面には プレミアムコインが 1まい かくれている';

  // ---- 音 ----
  const audio = new RunnerAudio();
  const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.08) => {
    const ac = audio.ctx;
    if (!ac) return;
    const t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.out ?? ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const sound = (e: JumpEvent) => {
    switch (e.kind) {
      case 'bounce': tone(420, 760, 0.12, 'triangle', 0.06); break;
      case 'super': audio.sfx('jump'); tone(520, 1560, 0.4, 'triangle', 0.07); break;
      case 'coin': tone(1180, 1760, 0.1, 'triangle', 0.06); break;
      case 'gold': audio.sfx('gold'); break;
      case 'premium': audio.sfx('premium'); break;
      case 'fall': audio.sfx('hit'); break;
      case 'senbei': tone(660, 990, 0.12, 'triangle', 0.07); tone(990, 1320, 0.12, 'triangle', 0.05); break;
      case 'catch': audio.sfx('dash'); tone(400, 1200, 0.35, 'triangle', 0.07); break;
      case 'crow': tone(700, 420, 0.18, 'sawtooth', 0.05); tone(640, 380, 0.16, 'sawtooth', 0.04); break;
      case 'wake': tone(500, 800, 0.15, 'sine', 0.05); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elCoins = q('coins'), elGold = q('gold'), elPrem = q('prem'), elHearts = q('hearts'), elFill = q('fill'), elMark = q('mark'), elHeight = q('height'), elSenbei = q('senbei'), elWind = q('wind');
  const elToast = q('toast'), elStart = q('start'), elResult = q('result');
  let toastTimer = 0;
  const toast = (msg: string, ms = 2200) => {
    elToast.textContent = msg; elToast.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elToast.classList.remove('on'), ms);
  };
  const paintHud = () => {
    elCoins.textContent = String(run.silver); elGold.textContent = String(run.gold); elPrem.hidden = !run.premium;
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, 3 - run.lives));
    const p = run.progress;
    elFill.style.width = `${p * 100}%`; elMark.style.left = `${p * 100}%`;
    elHeight.textContent = `${Math.floor(run.maxY)} m`;
    elSenbei.hidden = run.senbei <= 0 && !level.sections.some(s => s.senbeiEvery);
    elSenbei.textContent = `せんべい ×${run.senbei}`;
    elWind.hidden = run.wind === 0;
    elWind.textContent = run.wind > 0 ? '風 ▶▶' : '◀◀ 風';
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
      newBest = progress.clear(level.id, run.t, true, stars);
      const got = clearRewards(wallet, level.id, { silver: run.silver, gold: run.gold, star3: stars === 3 });
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
    q('r-title').textContent = cleared ? `${level.goalName}に とうちゃく！` : '落ちちゃった…';
    q('r-tip').textContent = cleared ? (stars < 3 ? '落ちないで のぼると ★3。着地する 鹿を 先に 見ておこう' : '') : '次に乗る 鹿を 早めに 見て、その下へ 動こう。おじぎ鹿で 大ジャンプ！';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-coins').textContent = `${run.silver} / ${silverTotal()}` + (run.gold ? `　金 ${run.gold}` : '') + (run.premium ? '　◆' : '');
    q('r-max').textContent = `${Math.floor(run.maxY)} m`;
    q('r-time').textContent = cleared ? `${run.t.toFixed(1)} 秒${newBest ? '(ベスト！)' : ''}` : `${Math.floor(run.progress * 100)} % まで`;
    const best = progress.get(level.id).best;
    q('r-best').textContent = best === null ? '—' : `${best.toFixed(1)} 秒`;
    const next = q<HTMLAnchorElement>('next');
    next.hidden = !cleared || !nextLevel;
    if (nextLevel) { next.href = `/jump/?level=${nextLevel.id}`; next.textContent = `次の面へ(${nextLevel.id}) ▶`; }
    elResult.classList.toggle('fail', !cleared);
    elResult.classList.add('on');
  };

  const hinted = new Set<string>();
  const begin = () => {
    if (!wallet.canPlay()) { paintStamina(); toast(`体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`, 3000); return; }
    charged = false; recorded = false;
    q('r-reward').textContent = '';
    audio.ensure();
    audio.stopMusic(0); audio.startMusic(JUMP_BGM);
    window.clearTimeout(resultTimer);
    run = newRun();
    hinted.clear();
    run.start();
    progress.attempt(level.id);
    elStart.classList.remove('on'); elResult.classList.remove('on');
    paintHud();
    toast(level.intro, 3000);
  };

  // ---- 入力: ◀ ▶(キー・下のパッド・画面の左右) ----
  const input: JInput = { left: false, right: false };
  const keys = new Set<string>();
  const pointers = new Map<number, 'left' | 'right'>();
  const elPad = q('pad');
  const apply = () => {
    const kl = keys.has('ArrowLeft') || keys.has('KeyA'), kr = keys.has('ArrowRight') || keys.has('KeyD');
    const pads = [...pointers.values()], last = pads[pads.length - 1];
    input.left = kl || (!kr && last === 'left'); input.right = kr || (!kl && last === 'right');
    elPad.dataset.dir = input.left ? 'left' : input.right ? 'right' : '';
  };
  const kd = (e: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) { e.preventDefault(); keys.add(e.code); apply(); } };
  const ku = (e: KeyboardEvent) => { keys.delete(e.code); apply(); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  const side = (ev: PointerEvent): 'left' | 'right' => {
    const r = root.querySelector('.ks-frame')!.getBoundingClientRect();
    return ev.clientX < r.left + r.width / 2 ? 'left' : 'right';
  };
  const down = (ev: PointerEvent) => {
    if ((ev.target as HTMLElement).closest('.ks-overlay, button, a')) return;
    ev.preventDefault();
    pointers.set(ev.pointerId, side(ev)); apply();
  };
  const move = (ev: PointerEvent) => { if (pointers.has(ev.pointerId)) { pointers.set(ev.pointerId, side(ev)); apply(); } };
  const up = (ev: PointerEvent) => { pointers.delete(ev.pointerId); apply(); };
  const frame = root.querySelector<HTMLElement>('.ks-frame')!;
  frame.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  const onHidden = () => { keys.clear(); pointers.clear(); apply(); };
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
  /** ぽんっと出る文字(大ジャンプ など) */
  const pops: { text: string; x: number; y: number; t: number; color: string }[] = [];
  let squash = 0, hurt = 0;
  const sx = (x: number) => x * scale;
  const sy = (y: number) => H - (y - run.camY) * scale;
  const drawImg = (src: string, x: number, bottomY: number, h: number, flip = false, sqx = 1, sqy = 1) => {
    const i = img(src);
    if (!i.complete || !i.naturalWidth) return;
    const w = (h * i.naturalWidth) / i.naturalHeight;
    const px = sx(x), py = sy(bottomY), pw = w * scale * sqx, ph = h * scale * sqy;
    // 左右の端をまたぐときは、反対側にも描く
    for (const off of [0, -JBAL.width * scale, JBAL.width * scale]) {
      const cx = px + off;
      if (cx + pw / 2 < 0 || cx - pw / 2 > W) continue;
      ctx.save();
      ctx.translate(cx, py);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(i, -pw / 2, -ph, pw, ph);
      ctx.restore();
    }
  };
  const drawPad = (p: Pad) => {
    if (p.kind === 'ground') return;
    const top = sy(p.y);
    if (top < -80 || top > H + 120) return;
    if (p.y >= level.goal) return; // ゴールの足場は、山頂として描く
    if (p.kind === 'lie') drawImg(ART.lie.src[0], p.x, p.y - ART.lie.top, ART.lie.h);
    else if (p.kind === 'sleep') {
      if (p.goneAt < 0) {
        drawImg(ART.sleep.src[0], p.x, p.y - ART.sleep.top, ART.sleep.h);
        // zzz(ねむい鹿のしるし)
        ctx.font = `900 ${Math.round(scale * 0.3)}px 'M PLUS Rounded 1c', sans-serif`;
        ctx.textAlign = 'left'; ctx.fillStyle = '#6a7bd8'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        const zy = top - scale * (0.55 + Math.sin(run.t * 2 + p.id) * 0.08);
        ctx.strokeText('zzz', sx(p.x) + scale * 0.35, zy); ctx.fillText('zzz', sx(p.x) + scale * 0.35, zy);
      } else {
        // 起きて、立ち上がって 行ってしまう
        const age = run.t - p.goneAt;
        if (age < 0.9) {
          ctx.globalAlpha = Math.max(0, 1 - age / 0.9);
          drawImg(ART.sleep.src[1], p.x + age * 2.5 * p.dir, p.y - ART.sleep.top + age * 0.5, 1.6);
          ctx.globalAlpha = 1;
        }
      }
    } else if (p.kind === 'hop') drawImg(ART.hop.src[Math.floor(run.t * 10) % 4], p.x, p.y - ART.hop.top, ART.hop.h, p.dir < 0);
    else if (p.kind === 'walk') drawImg(ART.walk.src[Math.floor(run.t * 7) % 4], p.x, p.y - ART.walk.top, ART.walk.h, p.dir < 0);
    else {
      const b = run.bowing(p);
      drawImg(ART.bow.src[b ? 1 : 0], p.x, p.y - ART.bow.top, b ? 1.55 : ART.bow.h);
      // おじぎの合図(もうすぐ・おじぎ中)
      const ph = (run.t + p.phase) % JBAL.bowCycle, soon = ph > JBAL.bowCycle - JBAL.bowTime - 0.5 && !b;
      if (b || soon) {
        ctx.font = `900 ${Math.round(scale * 0.32)}px 'M PLUS Rounded 1c', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = b ? '#ff7a2f' : 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
        const t = b ? 'ぺこり！' : '…';
        ctx.strokeText(t, sx(p.x), top - scale * 0.2); ctx.fillText(t, sx(p.x), top - scale * 0.2);
      }
    }
  };
  const drawBg = () => {
    // 空: 高く のぼるほど、青く 深く
    const k = Math.min(1, run.camY / level.goal), sk = SKY[level.scene];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(sk.lo[0], sk.hi[0], k));
    g.addColorStop(1, mix(sk.lo[1], sk.hi[1], k));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 夜: 星
    if (level.scene === 'night') {
      for (let i = 0; i < 70; i++) {
        const x = ((i * 97) % 100) / 100 * W, y = (((i * 61) % 100) / 100 * H * 1.4 + run.camY * scale * 0.1) % H;
        ctx.fillStyle = `rgba(255,255,230,${0.4 + 0.5 * Math.abs(Math.sin(run.t * 1.5 + i))})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    // 遠くの山(ゆっくり動く)
    const hillY = H + 40 - (-run.camY * 0.12) * scale * 0.4 - run.camY * scale * 0.06;
    ctx.fillStyle = sk.hill;
    ctx.beginPath(); ctx.moveTo(-20, H + 10);
    ctx.quadraticCurveTo(W * 0.25, hillY - scale * 3.5, W * 0.55, hillY - scale * 2.2);
    ctx.quadraticCurveTo(W * 0.85, hillY - scale * 3.2, W + 20, H + 10); ctx.closePath(); ctx.fill();
    // 雲(決まった場所。少しゆっくり動く)
    // 奈良の名所(ふもと。ゆっくり 下へ 流れる)
    if (level.landmark) {
      const lm = LANDMARK[level.landmark];
      const i = img(lm.src);
      const base = H - (0 - run.camY * 0.5) * scale;
      if (i.complete && i.naturalWidth && base - lm.h * scale < H) {
        const h = lm.h * scale, w = (h * i.naturalWidth) / i.naturalHeight;
        ctx.globalAlpha = level.scene === 'night' ? 0.5 : 0.9;
        ctx.drawImage(i, W * 0.5 - w / 2, base - h, w, h);
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = level.scene === 'night' ? 'rgba(200,210,255,0.18)' : 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 40; i++) {
      const wy = i * 6 + ((i * 37) % 5), wx = ((i * 53) % 90) / 10;
      const y = H - (wy - run.camY * 0.7) * scale;
      if (y < -60 || y > H + 60) continue;
      const x = ((wx + run.t * 0.15 * ((i % 3) + 1)) % (JBAL.width + 2) - 1) * scale;
      const r = scale * (0.45 + (i % 3) * 0.15);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.arc(x + r, y + r * 0.2, r * 0.8, 0, Math.PI * 2); ctx.arc(x - r, y + r * 0.25, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    // はじめの 草原
    const gy = sy(0);
    if (gy < H + 10) { ctx.fillStyle = level.scene === 'night' ? '#2f4a3a' : '#7fbf5a'; ctx.fillRect(0, gy, W, H - gy + 10); ctx.fillStyle = '#6aa94a'; ctx.fillRect(0, gy, W, 6); }
    // ゴール: 若草山の てっぺん(草の丘と旗)
    const top = sy(level.goal);
    if (top > -200 && top < H + 200) {
      ctx.fillStyle = level.scene === 'sky' || level.scene === 'night' ? '#f4f8ff' : '#8cc56a';
      ctx.beginPath(); ctx.ellipse(W / 2, top + scale * 0.9, scale * 2.4, scale * 0.95, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(W / 2 - scale * 2.4, top + scale * 0.9, scale * 4.8, H);
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(W / 2 + scale * 1.2, top - scale * 1.8, 4, scale * 1.9);
      ctx.fillStyle = '#ff6b4a';
      ctx.beginPath(); ctx.moveTo(W / 2 + scale * 1.2 + 4, top - scale * 1.8); ctx.lineTo(W / 2 + scale * 2.1, top - scale * 1.55); ctx.lineTo(W / 2 + scale * 1.2 + 4, top - scale * 1.3); ctx.fill();
      ctx.font = `900 ${Math.round(scale * 0.34)}px 'M PLUS Rounded 1c', sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4;
      ctx.strokeText(level.goalName, W / 2, top - scale * 2.2); ctx.fillText(level.goalName, W / 2, top - scale * 2.2);
    }
  };
  /** 星の形(夜の ゴールド) */
  const star = (x: number, y: number, r: number, t: number) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t) * 0.2);
    ctx.fillStyle = '#ffe36b'; ctx.shadowColor = '#ffe36b'; ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.fill(); ctx.restore();
  };
  const draw = (dt: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBg();
    for (const p of run.pads) drawPad(p);
    // コイン
    for (const c of run.coins) {
      if (run.collected.has(c.id)) continue;
      const y = sy(c.y);
      if (y < -20 || y > H + 20) continue;
      const x = sx(c.x), r = scale * (c.kind ? 0.26 : 0.2), spin = Math.abs(Math.sin(run.t * 3 + c.id));
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
    // せんべい
    for (const b of run.senbeiItems) {
      if (run.collected.has(-1 - b.id)) continue;
      const y = sy(b.y);
      if (y < -30 || y > H + 30) continue;
      const x = sx(b.x), r = scale * 0.3, bob = Math.sin(run.t * 3 + b.id) * 3;
      ctx.fillStyle = '#d9a25b'; ctx.beginPath(); ctx.arc(x, y + bob, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#a8702f'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#b97a3a';
      for (const [dx, dy] of [[-0.3, -0.2], [0.25, -0.1], [0, 0.3], [-0.1, 0.05]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + bob + dy * r, r * 0.09, 0, Math.PI * 2); ctx.fill(); }
    }
    // カラス(羽ばたく 黒い鳥)
    for (const c of run.crows) {
      const y = sy(c.y);
      if (y < -30 || y > H + 30) continue;
      for (const off of [0, -JBAL.width, JBAL.width]) {
        const x = sx(c.x + off);
        if (x < -40 || x > W + 40) continue;
        const flap = Math.sin(run.t * 14 + c.id) * scale * 0.28, s2 = scale * 0.32;
        ctx.save(); ctx.translate(x, y); ctx.scale(c.dir, 1);
        ctx.fillStyle = '#26262e';
        ctx.beginPath(); ctx.ellipse(0, 0, s2 * 1.2, s2 * 0.62, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s2 * 1.05, -s2 * 0.25, s2 * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s2 * 0.2, -s2 * 0.2); ctx.lineTo(-s2 * 0.9, -s2 * 0.4 - flap); ctx.lineTo(s2 * 0.5, -s2 * 0.3); ctx.fill();
        ctx.fillStyle = '#f2a33a'; ctx.beginPath(); ctx.moveTo(s2 * 1.4, -s2 * 0.3); ctx.lineTo(s2 * 1.85, -s2 * 0.18); ctx.lineTo(s2 * 1.4, -s2 * 0.08); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s2 * 1.15, -s2 * 0.35, s2 * 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // 風: 木の葉が 流れる
    if (run.wind !== 0) {
      ctx.fillStyle = level.scene === 'night' ? 'rgba(160,200,140,0.5)' : 'rgba(110,170,70,0.75)';
      for (let i = 0; i < 16; i++) {
        const x = ((((i * 0.37 + run.t * 0.35 * Math.sign(run.wind)) % 1) + 1) % 1) * W, y = ((i * 0.61) % 1) * H;
        ctx.save(); ctx.translate(x, y + Math.sin(run.t * 3 + i) * 8); ctx.rotate(run.t * 4 + i);
        ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    // Spra(上がるとき=ばんざい、落ちるとき=ふつう、落ちた直後=こまり顔)
    squash = Math.max(0, squash - dt * 5); hurt = Math.max(0, hurt - dt);
    const face = hurt > 0 ? SPRA.oops : run.vy > 2 ? SPRA.up : SPRA.idle;
    drawImg(face, run.x, run.y, SPRA.h, run.vx < -0.5, 1 + squash * 0.25, 1 - squash * 0.25);
    // 夜: Spra の まわりだけ 明るい。星(ゴールド)は 遠くからも 光って見える
    if (level.scene === 'night') {
      const cx = sx(run.x), cy = sy(run.y + SPRA.h / 2);
      const rg = ctx.createRadialGradient(cx, cy, scale * 2.2, cx, cy, scale * 5.5);
      rg.addColorStop(0, 'rgba(8,12,35,0)'); rg.addColorStop(1, 'rgba(8,12,35,0.86)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
      for (const c of run.coins) {
        if (c.kind !== 'gold' || run.collected.has(c.id)) continue;
        const y = sy(c.y);
        if (y < -20 || y > H + 20) continue;
        star(sx(c.x), y, scale * 0.3, run.t * 2 + c.id);
      }
    }
    // ぽんっと出る文字
    for (const p of pops) {
      p.t += dt;
      const a = Math.max(0, 1 - p.t / 0.9);
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(scale * 0.42)}px 'M PLUS Rounded 1c', sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = p.color; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 4;
      const y = sy(p.y) - p.t * 40;
      // 画面の端で 切れないように、文字の幅の半分は 内がわへ
      const half = ctx.measureText(p.text).width / 2 + 6, px = Math.min(W - half, Math.max(half, sx(p.x)));
      ctx.strokeText(p.text, px, y); ctx.fillText(p.text, px, y);
      ctx.globalAlpha = 1;
    }
    for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > 0.9) pops.splice(i, 1);
  };

  // ---- ループ ----
  let raf = 0, last = performance.now(), acc = 0, prevPhase = run.phase;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; acc += dt;
    while (acc >= STEP) { run.step(STEP, input); acc -= STEP; }
    for (const e of run.drain()) {
      sound(e);
      if (e.kind === 'bounce') squash = 1;
      else if (e.kind === 'super') { squash = 1.4; pops.push({ text: 'ぺこり！ 大ジャンプ！', x: run.x, y: run.y + 1.4, t: 0, color: '#ffd23a' }); }
      else if (e.kind === 'fall') { hurt = 1.2; toast(run.lives > 0 ? 'わっ、落ちた！ ふわっと 助けてもらったよ' : '落ちちゃった…', 2000); }
      else if (e.kind === 'premium') toast('◆ プレミアムコイン！！', 2400);
      else if (e.kind === 'senbei') pops.push({ text: 'せんべい ゲット！', x: run.x, y: run.y + 1.6, t: 0, color: '#f0b45a' });
      else if (e.kind === 'catch') { squash = 1.4; toast('鹿が 受けとめてくれた！(せんべい −1)', 2200); }
      else if (e.kind === 'crow') { hurt = 0.6; pops.push({ text: 'カァ！', x: run.x, y: run.y + 1.6, t: 0, color: '#ffffff' }); }
      else if (e.kind === 'wake') pops.push({ text: 'おきた！', x: run.x, y: run.y - 0.3, t: 0, color: '#9aa8ff' });
      else if (e.kind === 'gold') pops.push({ text: 'ゴールド！', x: run.x, y: run.y + 1.4, t: 0, color: '#ffc83a' });
      else if (e.kind === 'clear') toast(`${level.goalName}に とうちゃく！`, 3000);
    }
    if (run.phase === 'running') {
      level.notes?.forEach((n, i) => { if (run.maxY >= n.y && !hinted.has(`n${i}`)) { hinted.add(`n${i}`); toast(n.text, 3400); } });
    }
    if (run.phase !== prevPhase) {
      prevPhase = run.phase;
      if (run.phase === 'cleared' || run.phase === 'failed') resultTimer = window.setTimeout(showResult, run.phase === 'cleared' ? 2200 : 1300);
    }
    paintHud();
    draw(dt);
  };
  raf = requestAnimationFrame(loop);

  // 動作確認用(開発中の自動テストから状態を読む)
  (window as unknown as { __jump?: unknown }).__jump = { get run() { return run; }, input, level };

  return () => {
    if (run.phase === 'running' && !charged) { charged = true; wallet.fail(); progress.quit(level.id); }
    cancelAnimationFrame(raf);
    window.clearTimeout(toastTimer); window.clearTimeout(resultTimer);
    ro.disconnect();
    window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    window.removeEventListener('blur', onHidden);
    frame.removeEventListener('pointerdown', down);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __jump?: unknown }).__jump;
    audio.close();
    canvas.remove();
  };
}
