// 3D走りの音: BGM(くり返し)・ジングル(クリア/失敗)・効果音(ファイル)・合成音の出口と、音の ON/OFF。
// 最初の「はじめる」のタップで AudioContext を作る(ブラウザの決まり)。

/** 音の ON/OFF の保存先(2Dの面と同じ)。'off' のときだけ鳴らさない */
export const SOUND_KEY = 'spra-deer:sound:v1';

export function soundOn(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}

/** WORLD 4(鹿、走る。)のBGM(bgm/bgm-prompts.md の DEER-05)。頭から流し、LOOP_START〜LOOP_END をくり返す */
export const RUN_BGM = { url: '/assets/audio/run.mp3', loopStart: 16.02, loopEnd: 141.552, volume: 0.42 };
/** DEER-10 Spra Deer trolley(WORLD 8 トロッコ。7.87〜64.36秒をくり返す) */
export const CART_BGM = { url: '/assets/audio/cart.mp3', loopStart: 7.87, loopEnd: 64.36, volume: 0.42 };

// splash(水たまり)・bell(仲間の鹿のトロッコの鈴)は、Owner が用意した効果音(SpraTheme/効果音。scripts/build-sfx.sh)
export type Sfx = 'jump' | 'dash' | 'heal' | 'hit' | 'gold' | 'premium' | 'checkpoint' | 'splash' | 'bell';
const SFX_VOLUME: Record<Sfx, number> = { jump: 0.35, dash: 0.45, heal: 0.6, hit: 0.5, gold: 0.6, premium: 0.75, checkpoint: 0.55, splash: 0.5, bell: 0.45 };

/** 足音(道の種類ごと。scripts/build-sfx.sh で Owner の効果音から切り出し)。音量は ファイルごとの ちがいを ならす */
export type Steps = 'grass' | 'gravel' | 'dirt' | 'asphalt' | 'snow';
const STEPS_VOLUME: Record<Steps, number> = { grass: 0.5, gravel: 0.45, dirt: 0.45, asphalt: 0.4, snow: 0.28 };
/** くり返して鳴っている音(音量と速さを あとから変える) */
export type LoopHandle = { set(volume: number, rate: number): void; stop(): void };

export class RunnerAudio {
  ctx: AudioContext | null = null;
  /** 合成音・効果音・BGMの出口(ここで ON/OFF する) */
  out: GainNode | null = null;
  enabled = soundOn();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** 最初のタップで呼ぶ。2回目からは再開だけ */
  ensure(): void {
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.out = this.ctx.createGain();
        this.out.gain.value = this.enabled ? 1 : 0;
        this.out.connect(this.ctx.destination);
        // 使う音を先に読みはじめる
        void this.load(RUN_BGM.url);
        for (const k of Object.keys(SFX_VOLUME)) void this.load(`/assets/audio/sfx/${k}.mp3`);
        void this.load('/assets/audio/clear.mp3');
        void this.load('/assets/audio/fail.mp3');
      } catch {
        this.ctx = null;
        this.out = null;
      }
    }
    void this.ctx?.resume().catch(() => {});
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* 保存できなくても鳴らし分けはできる */ }
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  private load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      const ctx = this.ctx;
      p = ctx
        ? fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(url)))).then((b) => ctx.decodeAudioData(b)).catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(url, p);
    }
    return p;
  }

  private playBuffer(url: string, volume: number): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out) return;
    void this.load(url).then((buf) => {
      if (!buf || this.ctx !== ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(out);
      src.start();
    });
  }

  sfx(name: Sfx): void {
    this.playBuffer(`/assets/audio/sfx/${name}.mp3`, SFX_VOLUME[name]);
  }

  /** 足音を くり返し鳴らす。set(0〜1, 速さ)で 走っている間だけ・速いほど 速く鳴らす */
  steps(kind: Steps): LoopHandle {
    const ctx = this.ctx;
    const out = this.out;
    const base = STEPS_VOLUME[kind];
    const st = { src: null as AudioBufferSourceNode | null, gain: null as GainNode | null, vol: 0, rate: 1, dead: false };
    const h: LoopHandle = {
      set(volume, rate) {
        st.vol = volume * base; st.rate = rate;
        if (st.gain && st.src && ctx) {
          st.gain.gain.setTargetAtTime(st.vol, ctx.currentTime, 0.05);
          st.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.15);
        }
      },
      stop() { st.dead = true; try { st.src?.stop(); } catch { /* まだ始まっていない */ } },
    };
    if (!ctx || !out) return h;
    void this.load(`/assets/audio/steps/${kind}.mp3`).then((buf) => {
      if (!buf || st.dead || this.ctx !== ctx) return;
      const g = ctx.createGain();
      g.gain.value = st.vol;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = st.rate;
      src.connect(g).connect(out);
      src.start();
      st.src = src; st.gain = g;
    });
    return h;
  }

  /** BGMを頭から流す(もう流れているなら、そのまま)。曲は、ほかのワールドが選べる(既定は 鹿、走る。の曲) */
  startMusic(bgm: typeof RUN_BGM = RUN_BGM): void {
    const ctx = this.ctx;
    const out = this.out;
    if (!ctx || !out || this.music) return;
    const gain = ctx.createGain();
    gain.gain.value = bgm.volume;
    gain.connect(out);
    const slot = { src: null as AudioBufferSourceNode | null, gain };
    this.music = slot as { src: AudioBufferSourceNode; gain: GainNode };
    void this.load(bgm.url).then((buf) => {
      if (!buf || this.music !== slot) return; // 読みこむ前に止められた
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = bgm.loopStart;
      src.loopEnd = Math.min(bgm.loopEnd, buf.duration);
      src.connect(gain);
      src.start();
      slot.src = src;
    });
  }

  /** BGMを止める(少しだけ小さくしてから) */
  stopMusic(fade = 0.25): void {
    const m = this.music;
    this.music = null;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    m.gain.gain.setTargetAtTime(0, t, fade / 3);
    try { m.src?.stop(t + fade); } catch { /* まだ始まっていない */ }
  }

  /** クリア・失敗のジングル(2Dの面と同じ曲) */
  jingle(kind: 'clear' | 'fail'): void {
    this.playBuffer(`/assets/audio/${kind}.mp3`, 0.7);
  }

  /** 画面が見えない間は、全部止める */
  suspend(): void { void this.ctx?.suspend().catch(() => {}); }
  resume(): void { void this.ctx?.resume().catch(() => {}); }

  close(): void {
    this.stopMusic(0);
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.out = null;
  }
}
