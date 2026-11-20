'use client';

import { useEffect, useRef } from 'react';
import '../run/run.css';
import './jump.css';

// WORLD 5「鹿の背中で ぴょんぴょん」の画面の土台。見た目の共通部分は、3D走り(run.css)と同じものを使う
export function JumpShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // 面は /jump/?level=5-1 のように指定する(無ければ5-1)
    Promise.all([import('../../jump/game.ts'), import('../../jump/levels.ts')]).then(([game, levels]) => {
      if (cancelled || !ref.current) return;
      const id = new URLSearchParams(window.location.search).get('level') ?? '5-1';
      stop = game.startJump(ref.current, levels.jumpById(id) ?? levels.JUMP_LEVELS[0]);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="ks-root jp-root" ref={ref}>
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
            <div className="ks-chip ks-hearts" data-ks="hearts">♥♥♥</div>
          </div>
          <div className="ks-progress">
            <div className="ks-progress-bar">
              <div className="ks-progress-fill" data-ks="fill" />
              <span className="ks-progress-mark" data-ks="mark" />
            </div>
            <span className="ks-progress-goal" data-ks="lv-goal" />
          </div>
          <div className="jp-height" data-ks="height">0 m</div>
          <div className="jp-side">
            <span className="jp-senbei" data-ks="senbei" hidden />
            <span className="jp-wind" data-ks="wind" hidden />
          </div>
          <div className="ks-toast jp-toast" data-ks="toast" />
        </div>

        <div className="jp-controls">
          <div className="ks-pad jp-pad" data-ks="pad" aria-label="左右へ動く">
            <span className="ks-arrow l">◀</span>
            <small>画面の 左右を おしても 動けるよ</small>
            <span className="ks-arrow r">▶</span>
          </div>
        </div>

        <div className="ks-overlay on" data-ks="start">
          <div className="ks-card">
            <p className="ks-badge">WORLD 5 鹿の背中で ぴょんぴょん</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <p className="jp-lesson" data-ks="s-lesson" />
            <ul className="ks-how">
              <li>
                <b>◀ ▶</b> 左右へ 動く(画面の 左右を おしても)
              </li>
              <li>
                <b>鹿</b> 上から 乗ると、ひとりでに 跳ねる
              </li>
              <li>
                <b>おじぎ</b> 頭を 下げた 鹿に 乗ると 大ジャンプ
              </li>
              <li>
                <b>おちても</b> ハートが 1つ へるだけ。3回で 失敗
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
            <a className="ks-link" href="/#world-5">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="jp-tip" data-ks="r-tip" />
            <p className="ks-stars" data-ks="r-stars" />
            <p className="ks-reward" data-ks="r-reward" />
            <dl className="ks-stats">
              <div><dt>コイン</dt><dd data-ks="r-coins" /></div>
              <div><dt>高さ</dt><dd data-ks="r-max" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/jump/" hidden>
              次の面へ
            </a>
            <p className="ks-stamina" data-ks="r-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-r" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn ks-btn-sub" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/#world-5">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
