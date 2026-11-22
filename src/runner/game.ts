// 3D走りゲームの組み立て: 入力・画面表示(HUD)・効果音・ループ・記録。
import { Progress } from '../progress.ts';
import { Wallet, clearRewards, waitText, STAMINA_MAX, STAMINA_FAIL } from '../wallet.ts';
import { tagStars, type Obstacle } from './course.ts';
import { CRITTERS } from './critters.ts';
import { RUNNER_LEVELS, courseOf, type RunnerLevel } from './levels.ts';
import { unlockedBy } from '../friends.ts';
import { Run, baseSpeed, type Input, type SimEvent } from './sim.ts';
import { KasugaView } from './view.ts';
import { RunnerAudio, type LoopHandle, type Steps } from './audio.ts';

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
  bomb: 'ラムガの子分だ！ 爆弾を 投げてくる。赤い輪の 外へ にげて！',
  bat: 'こうもりが 急降下！ 横へ よけるか ジャンプ！',
};
const hintKey = (o: Obstacle) => (o.kind === 'critter' ? `critter:${o.behavior}` : o.deco ?? o.kind);

export function startRunner(root: HTMLElement, level: RunnerLevel): () => void {
  const q = <T extends HTMLElement>(k: string) => root.querySelector<T>(`[data-ks="${k}"]`)!;
  const course = courseOf(level);
  const wallet = new Wallet();
  // プレミアムコインは1つの面に1枚だけ。もう取った面には出さない(設計書 25-3)
  const premiumTaken = wallet.hasPremium(level.id);
  if (premiumTaken) course.coins = course.coins.filter((c) => c.kind !== 'premium');
  const silverTotal = course.coins.filter((c) => c.kind === undefined).length;
  const view = new KasugaView(q('stage'), course, level);
  const progress = new Progress();
  const MILESTONES: [number, string][] = [
    [course.length * 0.5, level.lines[0]],
    [course.length * 0.8, level.lines[1]],
    [course.length * 0.92, level.lines[2]],
  ];
  // 次の面(仲間の鹿の面は、ボーナスなので 次は無い)
  const idx = RUNNER_LEVELS.findIndex((l) => l.id === level.id);
  const nextLevel = idx >= 0 ? RUNNER_LEVELS[idx + 1] : undefined;
  // 仲間の鹿の面: ゴールの門が しまるまでの秒数 / 鬼ごっこ(Spra を 追いかけて つかまえる)
  const gate = course.timeLimit;
  const tag = course.tag;
  const friend = unlockedBy(level.id);
  let senbeiHinted = false;
  // チェックポイント: 通過したときの状態を覚えておき、失敗したら、そこから続けられる
  type Snapshot = { s: number; name: string; coins: number; gold: number; premium: boolean; collected: Set<number>; t: number };
  const CPS = (level.checkpoints ?? []).map((c) => ({ s: c.at * course.length, name: c.name }));
  const cpEls = CPS.map((c) => {
    const el = document.createElement('span');
    el.className = 'ks-progress-cp';
    el.style.left = `${(c.s / course.length) * 100}%`;
    q('mark').before(el);
    return el;
  });
  let saved: Snapshot | null = null;
  let charged = false; // この回の失敗で、体力をもう減らしたか
  let continued = false;
  q('lv-id').textContent = `面 ${level.id}`;
  q('lv-title').textContent = level.title;
  q('lv-goal').textContent = level.goalName;
  q('s-title').textContent = level.title;
  q('s-lead').textContent = gate ? `${level.summary}。門は ${gate}秒で しまる！ 鹿せんべいで 速く走ろう`
    : tag ? `${level.summary}。Spraが ${level.goalName}を くぐる前に！` : level.summary;
  q('s-prem').textContent = premiumTaken ? '◆ この面の プレミアムコインは 取ったよ' : '◆ この面には プレミアムコインが 1まい かくれている';
  let run = new Run(course);
  const byId = new Map(course.obstacles.map((o) => [o.id, o]));
  const input: Input = { left: false, right: false, jump: false, taps: 0 };

  // ---- 音(WebAudio。最初のタップで有効化)。BGM・ジングル・効果音のファイルは audio.ts、短い合成音はここ ----
  const audio = new RunnerAudio();
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
    o.connect(g).connect(audio.out ?? ac.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };
  const sound = (e: SimEvent) => {
    switch (e.kind) {
      case 'coin': tone(1180, 1760, 0.13, 'triangle', 0.08); break;
      case 'gold': audio.sfx('gold'); break;
      case 'premium': audio.sfx('premium'); break;
      // ラムガの子分: 爆弾を投げる「ひゅるる」・落ちて「ドカン」/こうもりの「キィー」
      case 'throw': tone(420, 900, 0.5, 'triangle', 0.05); break;
      case 'boom': noise(0.7, 0.22, 700); tone(130, 40, 0.5, 'sawtooth', 0.08); break;
      case 'swoop': tone(1700, 600, 0.45, 'sine', 0.05); tone(1900, 700, 0.45, 'triangle', 0.025, 0.05); break;
      case 'heal': audio.sfx('heal'); break;
      case 'senbei': tone(660, 1320, 0.16, 'triangle', 0.08); tone(990, 1980, 0.2, 'sine', 0.05, 0.06); break;
      case 'jump': audio.sfx('jump'); break;
      // ジャンプ台のダッシュは、きらきら。坂の頂上で浮いただけなら、短い合成音
      case 'launch': if (run.boost > 0) audio.sfx('dash'); else tone(280, 980, 0.3, 'triangle', 0.08); break;
      case 'land': tone(160, 90, 0.08, 'sine', 0.05); break;
      case 'hit': audio.sfx('hit'); tone(200, 60, 0.3, 'sawtooth', 0.06); break;
      case 'fall': tone(520, 50, 0.6, 'triangle', 0.1); break;
      case 'slip': tone(760, 220, 0.35, 'square', 0.05); break;
      case 'slow': audio.sfx('splash'); break;
      case 'slide': tone(1500, 900, 0.4, 'triangle', 0.05); break;
      case 'clear': audio.stopMusic(); audio.jingle('clear'); break;
      case 'fail': audio.stopMusic(); audio.jingle('fail'); break;
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
    src.connect(f).connect(g).connect(audio.out ?? ac.destination);
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
    src.connect(filter).connect(gain).connect(audio.out ?? ac.destination);
    src.start();
    rainNode = src;
  };

  // ---- HUD ----
  const elCoins = q('coins');
  const elGold = q('gold');
  const elPrem = q('prem');
  const elHearts = q('hearts');
  const elFill = q('fill');
  // 鬼ごっこ: 進み具合のバーに、にげる Spra も出す(どれくらい はなれているか 分かるように)
  let elRival: HTMLElement | null = null;
  if (tag) {
    elRival = document.createElement('span');
    elRival.className = 'ks-progress-rival';
    elRival.style.backgroundImage = "url('/assets/spru.png')";
    elRival.title = 'Spra';
    q('mark').before(elRival);
  }
  const elMark = q('mark');
  const elToast = q('toast');
  const elStatus = q('status');
  const elStart = q('start');
  const elResult = q('result');
  // 門が しまるまでの のこり時間(仲間の鹿の面だけ)
  let elGate: HTMLElement | null = null;
  if (gate || tag) {
    elGate = document.createElement('div');
    elGate.className = 'ks-gate';
    elToast.before(elGate);
  }
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
    elGold.textContent = String(run.gold);
    elPrem.hidden = !run.premium;
    elHearts.textContent = '♥'.repeat(Math.max(0, run.lives)) + '♡'.repeat(Math.max(0, 3 - run.lives));
    const p = `${(run.progress * 100).toFixed(1)}%`;
    elFill.style.width = p;
    if (elRival && tag) elRival.style.left = `${(Math.min(1, run.tagS / course.length) * 100).toFixed(1)}%`;
    if (tag) dashEl.style.setProperty('--pace', run.pace.toFixed(2));
    elMark.style.left = p;
    if (elGate && gate) {
      const left = Math.max(0, gate - run.t);
      elGate.textContent = `⛩ 門が しまるまで ${left.toFixed(1)}秒`;
      elGate.classList.toggle('hurry', left < 10);
    }
    if (elGate && tag) {
      // Spra までの きょり。Spra が 門に近いと 赤く点滅
      elGate.textContent = run.phase === 'cleared' ? 'つかまえた！' : `Spraまで ${Math.round(run.gapToSpra)}m`;
      elGate.classList.toggle('hurry', run.phase === 'running' && run.tagS > course.length * 0.9);
    }
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
    // 鬼ごっこは、どこで つかまえたか(早いほど多い)。ほかは のこりのハート
    const stars = cleared ? (tag ? tagStars(run.caughtS, course.length) : run.lives === 3 ? 3 : run.lives === 2 ? 2 : 1) : 0;
    let newBest = false;
    if (cleared && !recorded) {
      recorded = true;
      newBest = progress.clear(level.id, run.t, !continued, stars); // 途中から続けたときは、タイムを記録しない
      // ごほうび(設計書 25-3): 取ったコインはシルバーとして持ち帰り。はじめてのクリア・★3でゴールド
      const got = clearRewards(wallet, level.id, { silver: run.coins, gold: run.gold, star3: stars === 3 });
      // プレミアムは、ゴールまで持ち帰ったときだけ自分のものになる
      const prem = run.premium && wallet.takePremium(level.id);
      q('r-reward').textContent = `+${got.silver} シルバー` + (got.gold ? `　+${got.gold} ゴールド` : '') + (prem ? '　+1 プレミアム！' : '');
      q('r-reward').classList.remove('lose');
    }
    if (!cleared && !charged) {
      // 失敗: 体力が2減る(設計書 25-2)
      charged = true;
      wallet.fail(); progress.fail(level.id);
      q('r-reward').textContent = `体力 −${STAMINA_FAIL}`;
      q('r-reward').classList.add('lose');
    }
    paintStamina();
    const best = progress.get(level.id).best;
    q('r-title').textContent = cleared ? (tag ? 'Spraを つかまえた！' : `${level.goalName}に とうちゃく！`)
      : run.reason === 'late' ? '門が しまっちゃった…' : run.reason === 'escaped' ? 'Spraに にげられた…' : 'ざんねん… もうすこしだった';
    q('r-stars').textContent = cleared ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    q('r-coins').textContent = `${run.coins} / ${silverTotal}` + (run.gold ? `　金 ${run.gold}` : '') + (run.premium ? '　◆' : '');
    q('r-hearts').textContent = '♥'.repeat(Math.max(0, run.lives)) || '—';
    q('r-time').textContent = cleared
      ? `${time} 秒${continued ? '（途中から）' : newBest ? '（ベスト更新！）' : ''}`
      : `${Math.floor(run.progress * 100)} % まで` + (run.reason === 'late' ? '(鹿せんべいで 速く！ ぶつかると おくれるよ)'
        : run.reason === 'escaped' ? `(あと ${Math.round(run.gapToSpra)}m！ せんべいで 速く・ぶつからないように)` : '');
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
    audio.ensure();
    ac = audio.ctx;
    // BGM: 最初から・もういちどは頭から。チェックポイントから続けるときも、頭(前奏)から流す
    audio.stopMusic(0);
    audio.startMusic();
    // 足音(道の種類ごと。Owner の効果音)
    if (!steps) steps = audio.steps(STEP_KIND);
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
      run.gold = from.gold;
      run.premium = from.premium;
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
    if (!from) progress.attempt(level.id);
    elStart.classList.remove('on');
    elResult.classList.remove('on');
    startRain();
    paintHud();
    if (tag && !from && !introSeen) {
      // はじめの1回だけ: にげる Spra を映して「つかまえてごらん！」→ 道にそって 鹿の所へ もどってから 出発
      introSeen = true; introT = 0;
      elSay.innerHTML = '<small>Spra</small>つかまえてごらん！';
      return;
    }
    run.start();
    toast(from ? `${from.name}から 再スタート！` : level.intro, 3600);
  };
  // 足音の種類: 道の景色(雪の面は 雪)
  const STEP_KIND: Steps = level.theme.weather === 'snow' ? 'snow'
    : level.theme.setting === 'path' ? 'grass'
    : level.theme.setting === 'town' || level.theme.setting === 'city' ? 'asphalt'
    : level.theme.setting === 'sando' ? 'gravel' : 'dirt';
  let steps: LoopHandle | null = null;
  // 鬼ごっこの はじめ(WORLD 8 の 追いかけっこと そろえる)。Spra は 演出の間も走っていて、出発の時に ちょうど lead の所へ 着く
  const INTRO = 3.2, INTRO_BACK = 1.1;
  let introT = -1, introSeen = false;
  const elSay = document.createElement('div');
  elSay.className = 'ks-say';
  elSay.setAttribute('aria-live', 'polite');
  elToast.before(elSay);
  const stepIntro = (dt: number) => {
    if (introT < 0 || !tag) return;
    introT += dt;
    const v0 = baseSpeed(tag.lead, course.length, run.rules) * tag.speed;
    run.tagS = tag.lead - v0 * Math.max(0, INTRO - introT);
    const b = Math.max(0, Math.min(1, (introT - (INTRO - INTRO_BACK)) / INTRO_BACK)), e = b * b * (3 - 2 * b);
    view.introS = run.tagS + (run.s - run.tagS) * e;
    elSay.classList.toggle('on', introT > 0.3 && introT < INTRO - INTRO_BACK + 0.15);
    if (introT >= INTRO) {
      introT = -1; view.introS = null; run.tagS = tag.lead; elSay.classList.remove('on');
      run.start(); toast(level.intro, 3600);
    }
  };

  const paintSound = () => {
    for (const k of ['snd-s', 'snd-r']) {
      const b = q<HTMLButtonElement>(k);
      b.textContent = audio.enabled ? '♪ 音 ON' : '♪ 音 OFF';
      b.setAttribute('aria-pressed', String(audio.enabled));
    }
  };
  const toggleSound = () => {
    audio.setEnabled(!audio.enabled);
    paintSound();
  };
  q('snd-s').addEventListener('click', toggleSound);
  q('snd-r').addEventListener('click', toggleSound);
  paintSound();
  q('go').addEventListener('click', () => begin());
  q('retry').addEventListener('click', () => begin());
  q('cont').addEventListener('click', () => begin(saved));

  // ---- 入力 ----
  // 左右は「キーボード」と「パッド」の2か所から入る。どちらも、最後に押した向きを優先する。
  // (左右を同時に押しても打ち消し合わない。キーの「離した」を取りこぼしても、次に押した向きが効く)
  const padEl = q('pad');
  const jumpEl = q('jump');
  // 鬼ごっこ: 「はしる」(連打)。押した回数を input.taps に ためて、次の step で数える
  const dashEl = q('dash');
  dashEl.hidden = !tag;
  if (tag) {
    const how = elStart.querySelector('.ks-how');
    if (how) how.insertAdjacentHTML('afterbegin', '<li><b>はしる</b> 連打すると 速く走る！ Spraに 追いつこう(シフト・E)</li>');
  }
  const runKeys = new Set(['ShiftLeft', 'ShiftRight', 'KeyE']);
  const tap = () => { if (tag && run.phase === 'running') input.taps = (input.taps ?? 0) + 1; };
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

  // 左右の境目(まん中)で指が少しずれても、向きが入れかわらないようにする。
  // 押した所で向きを決め、逆の側へ 半分の4分の1(パッドの幅の1/8)以上 動いたときだけ変える。
  const sideOf = (ev: PointerEvent, prev?: 'left' | 'right'): 'left' | 'right' => {
    const r = padEl.getBoundingClientRect();
    const n = (ev.clientX - (r.left + r.width / 2)) / (r.width / 2); // -1(左はし)〜1(右はし)
    if (prev === 'left') return n > 0.25 ? 'right' : 'left';
    if (prev === 'right') return n < -0.25 ? 'left' : 'right';
    return n < 0 ? 'left' : 'right';
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
    const side = sideOf(ev, padPointers.get(ev.pointerId));
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
  const onDashDown = (ev: PointerEvent) => {
    ev.preventDefault();
    tap();
    dashEl.classList.add('down');
  };
  const onDashUp = () => dashEl.classList.remove('down');
  dashEl.addEventListener('pointerdown', onDashDown);
  dashEl.addEventListener('pointerup', onDashUp);
  dashEl.addEventListener('pointercancel', onDashUp);
  dashEl.addEventListener('pointerleave', onDashUp);
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
    } else if (tag && runKeys.has(ev.code)) {
      ev.preventDefault();
      if (!ev.repeat) tap();
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
  const onHidden = () => {
    releaseAll();
    // 別のタブ・アプリへ行ったら、音も止める(もどったら再開)
    if (document.hidden) audio.suspend();
    else audio.resume();
  };
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
    stepIntro(dt);
    // 足音: 地面を走っている間だけ。速いほど 速く鳴らす
    steps?.set(run.phase === 'running' && !run.airborne ? 1 : 0, Math.max(0.9, Math.min(1.7, run.speed / 15)));
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
      } else if (e.kind === 'hit' && hitObj?.kind === 'bomb') {
        view.bump(0.45);
        toast('ドカーン！ 爆弾に あたった…', 2000);
      } else if (e.kind === 'hit' && hitObj?.kind === 'bat') {
        view.bump(0.35);
        toast('こうもりに ぶつかった！', 2000);
      } else if (e.kind === 'boom') {
        view.bump(0.12);
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
      } else if (e.kind === 'senbei') {
        if (!senbeiHinted) toast(`${friend?.name ?? '鹿'}が せんべいを ぱくっ！ しばらく 速いよ`, 2000);
        senbeiHinted = true;
      } else if (e.kind === 'heal') {
        toast('回復薬！ ハートが ふえた', 2000);
      } else if (e.kind === 'slow') {
        toast('ばしゃっ！ おそくなった', 1400);
      } else if (e.kind === 'slide') {
        view.bump(0.12);
        toast('つるつる〜！ 曲がれない！', 1600);
      } else if (e.kind === 'clear') {
        toast(tag ? 'Spraを つかまえた！' : `${level.goalName}に とうちゃく！`, 4000);
      }
      if (e.kind === 'gold') toast('ゴールドコイン！', 1300);
      if (e.kind === 'premium') {
        view.bump(0.15);
        toast('◆ プレミアムコイン！！ ゴールまで もちかえろう', 2800);
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
          saved = { s: c.s, name: c.name, coins: run.coins, gold: run.gold, premium: run.premium, collected: new Set(run.collected), t: run.t };
          cpEls[i].classList.add('passed');
          audio.sfx('checkpoint');
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
    audio,
  };

  paintStamina();

  return () => {
    // 走っている途中でページを離れたら、失敗と同じく体力が減る(設計書 25-2)
    if (run.phase === 'running' && !charged) {
      charged = true;
      wallet.fail(); progress.quit(level.id);
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
    audio.close();
    view.dispose();
  };
}
