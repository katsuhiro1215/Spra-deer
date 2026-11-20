// WORLD 6「鹿ずもう」の組み立て: 入力・画面の表示(HUD)・音・ループ・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { RunnerAudio } from '../runner/audio.ts';
import { SUMO_LEVELS, type SumoLevel } from './levels.ts';
import { Bout, RULES, type BoutEvent } from './sim.ts';
import { SumoView } from './view.ts';

const STEP = 1 / 60;
/** BGM は、専用の曲ができるまで 2Dの面の曲を仮に使う */
const SUMO_BGM = { url: '/assets/audio/play.mp3', loopStart: 0, loopEnd: 1e4, volume: 0.28 };

const TIPS = {
  tired: '連打すると 息切れ。緑のときに 1回ずつ 押そう',
  dodge: '相手が ためたら、「今！」で いなす → すぐ押すと 切り返し',
  charge: 'ため押しは、金色で 手をはなすと 強く押せるよ',
  time: '時間切れは、押しこんでいる方の 勝ち。もっと前へ！',
};

export function startSumo(root: HTMLElement, level: SumoLevel): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const wallet = new Wallet();
  const progress = new Progress();
  const view = new SumoView(q('stage'), level);
  const nextLevel = SUMO_LEVELS[SUMO_LEVELS.findIndex(l => l.id === level.id) + 1];
  let bout = new Bout(level);
  let charged = false, recorded = false, paused = false;

  q('lv-id').textContent = `面 ${level.id}`;
  q('lv-title').textContent = level.title;
  q('s-title').textContent = level.title;
  q('s-lead').textContent = level.summary;
  q('s-lesson').textContent = level.lesson;
  const elOppName = q('opp-name'), elOppTitle = q('opp-title');

  // ---- 音 ----
  const audio = new RunnerAudio();
  const tone = (f0: number, f1: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, delay = 0) => {
    const ac = audio.ctx;
    if (!ac) return;
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.out ?? ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  };
  const thud = (dur: number, vol: number, freq: number) => {
    const ac = audio.ctx;
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(audio.out ?? ac.destination);
    src.start();
  };
  const sound = (e: BoutEvent) => {
    switch (e.kind) {
      case 'start': tone(520, 780, 0.25, 'triangle', 0.09); thud(0.3, 0.4, 300); break;
      case 'perfect': thud(0.18, 0.5, 420); tone(660, 990, 0.14, 'triangle', 0.07); break;
      case 'push': thud(0.15, 0.35, 360); break;
      case 'tired': tone(300, 200, 0.25, 'sine', 0.06); break;
      case 'charge': thud(0.35, 0.65, 300); tone(260, 520, 0.25, 'sawtooth', 0.05); break;
      case 'dodge': tone(450, 900, 0.18, 'sine', 0.07); break;
      case 'counter': audio.sfx('dash'); thud(0.3, 0.6, 500); break;
      case 'parry': tone(450, 1200, 0.25, 'sine', 0.08); thud(0.25, 0.4, 700); break;
      case 'enemy': thud(0.2, 0.4, 220); break;
      case 'strong': thud(0.45, 0.75, 180); audio.sfx('hit'); break;
      case 'windup': tone(210, 260, 0.6, 'triangle', 0.06); break;
      case 'feint': tone(520, 300, 0.2, 'square', 0.04); break;
      case 'round': audio.sfx('checkpoint'); break;
      case 'won': audio.stopMusic(); audio.jingle('clear'); break;
      case 'lost': case 'draw': audio.stopMusic(); audio.jingle('fail'); break;
    }
  };

  // ---- 画面の表示 ----
  const elStart = q('start'), elResult = q('result'), elPause = q('pause');
  const elTime = q('time'), elPos = q('pos'), elStam = q('stam'), elStamV = q('stam-v'), elBeat = q('beat'), elBeatLabel = q('beat-label');
  const elPush = q<HTMLButtonElement>('push'), elCharge = q<HTMLButtonElement>('charge'), elEvade = q<HTMLButtonElement>('evade');
  const elChargeFill = q('charge-fill'), elEvadeSub = q('evade-sub'), elWarn = q('warn'), elWarnText = q('warn-text'), elWarnFill = q('warn-fill');
  const elFeed = q('feed'), elCount = q('count'), elCoach = q('coach');
  const elRound = q('round');
  let feedTimer = 0;
  const feedback = (e: BoutEvent) => {
    if (e.kind === 'won' || e.kind === 'lost' || e.kind === 'draw') return;
    elFeed.textContent = e.text; elFeed.dataset.kind = e.kind;
    elFeed.classList.remove('on'); void elFeed.offsetWidth; elFeed.classList.add('on');
    window.clearTimeout(feedTimer);
    feedTimer = window.setTimeout(() => elFeed.classList.remove('on'), 900);
  };
  const paintHud = () => {
    const b = bout, active = b.active && !paused;
    if (elOppName.textContent !== b.opp.name) { elOppName.textContent = b.opp.name; elOppTitle.textContent = b.opp.title; }
    elRound.hidden = b.rounds < 2;
    elRound.textContent = `${b.round + 1} / ${b.rounds} 番`;
    elTime.textContent = String(Math.ceil(b.remaining));
    elPos.style.left = `${50 + Math.max(-1, Math.min(1, b.position / RULES.edge)) * 46}%`;
    elPos.parentElement!.classList.toggle('pinch', b.position < -RULES.edge * 0.55);
    elStam.style.width = `${b.stamina}%`; elStamV.textContent = String(Math.round(b.stamina));
    elStam.parentElement!.classList.toggle('low', b.stamina < 25);
    const ch = b.charging;
    elBeat.style.left = `${(ch ? b.charge / RULES.chargeMax : b.beatPhase) * 100}%`;
    elBeat.parentElement!.classList.toggle('charging', ch);
    elBeatLabel.textContent = ch ? '金色で、はなす' : '緑の間に、押す';
    elPush.disabled = !active || ch;
    elPush.classList.toggle('on-beat', active && b.onBeat && !ch);
    elCharge.disabled = !active || (!ch && b.stamina < 18);
    elCharge.classList.toggle('charging', ch);
    elChargeFill.style.width = `${(b.charge / RULES.chargeMax) * 100}%`;
    elEvade.disabled = !active || b.dodgeCooldown > 0 || b.stamina < 14;
    elEvadeSub.textContent = b.dodgeCooldown > 0 ? `あと ${b.dodgeCooldown.toFixed(1)} 秒` : '「今！」で ひらり';
    const windup = active && b.enemyState === 'windup';
    elWarn.hidden = !windup;
    elEvade.classList.toggle('now', b.dodgeNow);
    elWarnText.textContent = b.dodgeNow ? '今！ いなす' : '相手が ためている…';
    elWarn.classList.toggle('now', b.dodgeNow);
    elWarnFill.style.width = `${b.windupProgress * 100}%`;
    elCount.hidden = b.phase !== 'countdown';
    elCount.textContent = String(Math.max(1, Math.ceil(b.countdown)));
    elCoach.textContent = b.vulnerable > 0 ? 'いなした！ 今すぐ 押して 切り返そう'
      : ch ? '金色の所で、手をはなそう'
      : b.stamina < 25 ? 'ひと呼吸。押さない間に スタミナが もどる'
      : windup ? '強い角押しが 来る！ 「今！」で いなす'
      : '連打より、緑のときに ぴったりの一押し';
  };
  const paintStamina = () => {
    const st = wallet.stamina;
    const txt = `体力 ${st} / ${STAMINA_MAX}` + (st < STAMINA_FAIL ? `(回復まで ${waitText(wallet.waitToPlay)})` : '');
    for (const k of ['s-stamina', 'r-stamina']) { const e = q(k); e.textContent = txt; e.classList.toggle('low', st < STAMINA_FAIL); }
  };

  let resultTimer = 0;
  const showResult = () => {
    const won = bout.phase === 'won', stars = bout.stars;
    let newBest = false;
    if (won && !recorded) {
      recorded = true;
      newBest = progress.clear(level.id, bout.totalTime, true);
      const got = clearRewards(wallet, level.id, { silver: bout.silver, star3: stars === 3 });
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '');
      q('r-reward').classList.remove('lose');
    }
    if (!won && !charged) {
      charged = true; wallet.fail(); // 負け・引き分け: 体力が2減る(設計書 25-2)
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    q('r-title').textContent = won ? (bout.pushedOut ? '押し出し！ 勝ち！' : '優勢で 勝ち！') : bout.phase === 'draw' ? '引き分け…' : bout.pushedOut ? '押し出された…' : '時間切れ… 負け';
    const tip = won ? (stars < 3 ? `★3 は ${level.par} 秒までに 押し出し。ため押しや 切り返しを ためそう` : '') :
      bout.stamina < 25 ? TIPS.tired : bout.opp.windupEvery && bout.counters === 0 ? TIPS.dodge : bout.phase === 'draw' || !bout.pushedOut ? TIPS.time : TIPS.charge;
    q('r-tip').textContent = tip;
    q('r-stars').textContent = won ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-perfect').textContent = `${bout.perfects} 回`;
    q('r-counter').textContent = `${bout.counters} 回`;
    q("r-time").textContent = `${bout.totalTime.toFixed(1)} 秒${newBest ? '(ベスト！)' : ''}`;
    const best = progress.get(level.id).best;
    q('r-best').textContent = best === null ? '—' : `${best.toFixed(1)} 秒`;
    const next = q<HTMLAnchorElement>('next');
    next.hidden = !won || !nextLevel;
    if (nextLevel) { next.href = `/sumo/?level=${nextLevel.id}`; next.textContent = `次の面へ(${nextLevel.id}) ▶`; }
    elResult.classList.toggle('fail', !won);
    elResult.classList.add('on');
  };

  const begin = () => {
    if (!wallet.canPlay()) {
      paintStamina();
      elFeed.textContent = `体力が たりません(回復まで ${waitText(wallet.waitToPlay)})`; elFeed.classList.add('on');
      return;
    }
    charged = false; recorded = false; paused = false;
    q('r-reward').textContent = '';
    audio.ensure();
    audio.stopMusic(0); audio.startMusic(SUMO_BGM);
    window.clearTimeout(resultTimer);
    bout = new Bout(level);
    view.reset();
    bout.start();
    progress.attempt(level.id);
    elStart.classList.remove('on'); elResult.classList.remove('on'); elPause.classList.remove('on');
    paintHud();
  };

  // ---- 入力 ----
  const press = (el: HTMLElement, down: () => void, up?: () => void) => {
    el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch { /* そのまま */ }
      if (!paused) down();
    });
    if (up) {
      el.addEventListener('pointerup', () => up());
      el.addEventListener('pointercancel', () => bout.cancelCharge());
      el.addEventListener('lostpointercapture', () => { if (bout.charging) up(); });
    }
  };
  press(elPush, () => bout.push());
  press(elEvade, () => bout.evade());
  press(elCharge, () => bout.beginCharge(), () => bout.releaseCharge());
  const kd = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && bout.phase === 'playing') { setPaused(true); return; }
    if (!bout.active || paused) return;
    if (['Space', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') bout.push();
    else if (e.code === 'KeyA' || e.code === 'ArrowLeft') bout.evade();
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') bout.beginCharge();
  };
  const ku = (e: KeyboardEvent) => { if (e.code === 'KeyD' || e.code === 'ArrowRight') bout.releaseCharge(); };
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  const setPaused = (on: boolean) => {
    if (on && bout.phase !== 'playing' && bout.phase !== 'countdown') return;
    paused = on;
    bout.cancelCharge();
    elPause.classList.toggle('on', on);
    if (on) audio.stopMusic(); else audio.startMusic(SUMO_BGM);
  };
  const onHidden = () => { if (document.hidden) setPaused(true); };
  document.addEventListener('visibilitychange', onHidden);
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
  q('resume').addEventListener('click', () => setPaused(false));
  q('pause-btn').addEventListener('click', () => setPaused(true));
  paintSound(); paintStamina(); paintHud();

  // ---- ループ ----
  let raf = 0, last = performance.now(), acc = 0, prevPhase = bout.phase;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!paused) {
      acc += dt;
      // 強くぶつかった瞬間は、ほんの少し止める(ヒットストップ)
      if (view.stop > 0) acc = 0;
      while (acc >= STEP) { bout.update(STEP); acc -= STEP; }
    } else acc = 0;
    for (const e of bout.drain()) { sound(e); feedback(e); view.fx(e.kind, bout); }
    if (bout.phase !== prevPhase) {
      prevPhase = bout.phase;
      // 押し出しは、吹っ飛ぶのを 見てから 結果を出す
      if (bout.done) resultTimer = window.setTimeout(showResult, bout.pushedOut ? 2900 : 1800);
    }
    paintHud();
    view.render(paused ? 0 : dt, bout);
  };
  raf = requestAnimationFrame(frame);

  // 動作確認用(開発中の自動テストから状態を読む)
  (window as unknown as { __sumo?: unknown }).__sumo = { get bout() { return bout; }, level, view };

  return () => {
    // 勝負の途中でページを離れたら、負けと同じく体力が減る(設計書 25-2)
    if ((bout.phase === 'playing' || bout.phase === 'countdown') && !charged) { charged = true; wallet.fail(); }
    cancelAnimationFrame(raf);
    window.clearTimeout(feedTimer); window.clearTimeout(resultTimer);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    document.removeEventListener('visibilitychange', onHidden);
    root.removeEventListener('contextmenu', noMenu);
    delete (window as unknown as { __sumo?: unknown }).__sumo;
    audio.close();
    view.dispose();
  };
}
