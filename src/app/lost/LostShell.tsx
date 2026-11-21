'use client';

import { useEffect, useRef } from 'react';
import '../run/run.css';
import './lost.css';

// WORLD 7「鹿のまいご探し」の画面の土台。見た目の共通部分は、3D走り(run.css)と同じものを使う
export function LostShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // 面は /lost/?level=7-1 のように指定する(無ければ7-1)
    Promise.all([import('../../lost/game.ts'), import('../../lost/levels.ts')]).then(([game, levels]) => {
      if (cancelled || !ref.current) return;
      const id = new URLSearchParams(window.location.search).get('level') ?? '7-1';
      stop = game.startLost(ref.current, levels.lostById(id) ?? levels.LOST_LEVELS[0]);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="ks-root lo-root" ref={ref}>
      <div className="ks-frame">
        <div className="ks-stage" data-ks="stage" />

        <div className="ks-hud">
          <div className="ks-hud-top">
            <div className="ks-chip">
              <span className="ks-coin-icon" />
              <b data-ks="coins">0</b>
              <span className="ks-coin-icon gold" />
              <b data-ks="gold">0</b>
              <span className="ks-prem" data-ks="prem" hidden>
                ◆
              </span>
            </div>
            <div className="ks-chip ks-level">
              <small data-ks="lv-id" />
              <span data-ks="lv-title" />
            </div>
            <div className="ks-chip lo-fawns" data-ks="fawns">子鹿 0/1</div>
          </div>
          <div className="ks-progress lo-oil">
            <div className="ks-progress-bar">
              <div className="ks-progress-fill" data-ks="fill" />
            </div>
            <span className="ks-progress-goal" data-ks="oil" />
          </div>
          <div className="ks-toast lo-toast" data-ks="toast" />
        </div>

        <p className="lo-howto">画面を さわったまま 動かすと、その方向へ 歩くよ</p>

        <div className="ks-overlay on" data-ks="start">
          <div className="ks-card">
            <p className="ks-badge">WORLD 7 鹿のまいご探し</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <p className="lo-lesson" data-ks="s-lesson" />
            <ul className="ks-how">
              <li>
                <b>歩く</b> 画面を さわったまま 動かす(矢じるしキーでも)
              </li>
              <li>
                <b>子鹿</b> 近づくと、うしろを ついてくる
              </li>
              <li>
                <b>待つ</b> 「まって〜」と 言ったら 止まってあげよう
              </li>
              <li>
                <b>火</b> ちょうちんの 火が 消えるまでに 帰ろう
              </li>
            </ul>
            <p className="ks-prem-note" data-ks="s-prem" />
            <p className="ks-stamina" data-ks="s-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-s" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn" data-ks="go">
              はじめる
            </button>
            <a className="ks-link" href="/#world-7">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="lo-tip" data-ks="r-tip" />
            <p className="ks-stars" data-ks="r-stars" />
            <p className="ks-reward" data-ks="r-reward" />
            <dl className="ks-stats">
              <div><dt>コイン</dt><dd data-ks="r-coins" /></div>
              <div><dt>はぐれた</dt><dd data-ks="r-stray" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/lost/" hidden>
              次の面へ
            </a>
            <p className="ks-stamina" data-ks="r-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-r" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn ks-btn-sub" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/#world-7">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
