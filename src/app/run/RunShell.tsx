'use client';

import { useEffect, useRef } from 'react';
import './run.css';
import { needsLogin } from '../../account/store.ts';

export function RunShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // three.js はブラウザ側でだけ読み込む。面は /run/?level=4-2 のように指定する(無ければ4-1)。古い番号(3-n)は 4-n へ読みかえる
    Promise.all([import('../../runner/game.ts'), import('../../runner/levels.ts')]).then(([game, levels]) => {
      if (cancelled || !ref.current) return;
      const id = new URLSearchParams(window.location.search).get('level')?.replace(/^3-/, '4-') ?? '4-1';
      const level = levels.runnerById(id) ?? levels.RUNNER_LEVELS[0];
      // ログインが要る面(各ワールドの3面目から)は、ホームのログインへ(設計書 37章)
      if (needsLogin(level.id)) { location.replace('/#login'); return; }
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
            <p className="ks-badge">WORLD 4 鹿、走る。</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <p className="ks-prem-note" data-ks="s-prem" />
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
            <p className="ks-stamina" data-ks="s-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-s" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn" data-ks="go">
              はじめる
            </button>
            <a className="ks-link" href="/#world-4">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="ks-stars" data-ks="r-stars" />
            <p className="ks-reward" data-ks="r-reward" />
            <dl className="ks-stats">
              <div><dt>コイン</dt><dd data-ks="r-coins" /></div>
              <div><dt>のこりハート</dt><dd data-ks="r-hearts" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/run/" hidden>
              次の面へ
            </a>
            <button type="button" className="ks-btn" data-ks="cont" hidden>
              途中から つづける
            </button>
            <p className="ks-stamina" data-ks="r-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-r" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn ks-btn-sub" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/#world-4">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
