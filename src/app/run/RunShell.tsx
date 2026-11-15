'use client';

import { useEffect, useRef } from 'react';
import './run.css';

export function RunShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // three.js はブラウザ側でだけ読み込む。面は /run/?level=3-2 のように指定する(無ければ3-1)
    Promise.all([import('../../runner/game.ts'), import('../../runner/levels.ts')]).then(([game, levels]) => {
      if (cancelled || !ref.current) return;
      const id = new URLSearchParams(window.location.search).get('level') ?? '3-1';
      const level = levels.runnerById(id) ?? levels.RUNNER_LEVELS[0];
      stop = game.startRunner(ref.current, level);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="ks-root" ref={ref}>
      <div className="ks-frame">
        <div className="ks-stage" data-ks="stage" />

        <div className="ks-hud">
          <div className="ks-hud-top">
            <div className="ks-chip">
              <span className="ks-coin-icon" />
              <b data-ks="coins">0</b>
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
          <div className="ks-status" data-ks="status" />
          <div className="ks-toast" data-ks="toast" />
        </div>

        <div className="ks-controls">
          <div className="ks-pad" data-ks="pad">
            <span className="ks-arrow l">◀</span>
            <span className="ks-arrow r">▶</span>
          </div>
          <button type="button" className="ks-jump" data-ks="jump" aria-label="ジャンプ">
            ジャンプ
          </button>
        </div>

        <div className="ks-overlay on" data-ks="start">
          <div className="ks-card">
            <p className="ks-badge">鹿の大脱走</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <ul className="ks-how">
              <li>
                <b>◀ ▶</b> 左右にうごく(キーボードは ← →)
              </li>
              <li>
                <b>ジャンプ</b> あなや 柵を こえる(スペース)
              </li>
              <li>
                <b>コイン</b> たくさん あつめよう
              </li>
            </ul>
            <button type="button" className="ks-btn" data-ks="go">
              はじめる
            </button>
            <a className="ks-link" href="/#select">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="ks-stars" data-ks="r-stars" />
            <dl className="ks-stats">
              <div><dt>コイン</dt><dd data-ks="r-coins" /></div>
              <div><dt>のこりハート</dt><dd data-ks="r-hearts" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/run/" hidden>
              次の面へ
            </a>
            <button type="button" className="ks-btn ks-btn-sub" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/#select">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
