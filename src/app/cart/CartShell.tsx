'use client';

import { useEffect, useRef } from 'react';
import '../run/run.css';
import './cart.css';

// WORLD 8「鹿と暴走トロッコ」の画面の土台。見た目の共通部分は、3D走り(run.css)と同じものを使う
export function CartShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // three.js はブラウザ側でだけ読み込む。面は /cart/?level=8-1 のように指定する(無ければ8-1)
    Promise.all([import('../../cart/game.ts'), import('../../cart/levels.ts')]).then(([game, levels]) => {
      if (cancelled || !ref.current) return;
      const id = new URLSearchParams(window.location.search).get('level') ?? '8-1';
      const level = levels.cartById(id) ?? levels.CART_LEVELS[0];
      stop = game.startCart(ref.current, level);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="ks-root ct-root" ref={ref}>
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
          <div className="ct-speed">
            <b data-ks="speed">0</b>
            <small>km/h</small>
            <span data-ks="seg" />
          </div>
          <div className="ct-alert" data-ks="alert" />
          <div className="ks-toast ct-toast" data-ks="toast" />
        </div>

        <div className="ct-controls">
          <button type="button" className="ct-btn ct-brake" data-ks="brake" aria-label="ブレーキ">
            <b>ブレーキ</b>
            <small>おしている間</small>
          </button>
          <button type="button" className="ct-btn ct-dash" data-ks="dash" aria-label="ダッシュ">
            <b>ダッシュ</b>
            <small>鹿が 加速</small>
          </button>
          <div className="ks-pad ct-pad" data-ks="pad" aria-label="体をかたむける">
            <span className="ks-arrow l">◀</span>
            <small>かたむける</small>
            <span className="ks-arrow r">▶</span>
          </div>
          <button type="button" className="ks-jump" data-ks="jump" aria-label="ジャンプ">
            ジャンプ
          </button>
        </div>

        <div className="ks-overlay on" data-ks="start">
          <div className="ks-card">
            <p className="ks-badge">WORLD 8 鹿と暴走トロッコ</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <p className="ks-prem-note" data-ks="s-prem" />
            <ul className="ks-how">
              <li>
                <b>ブレーキ</b> 急カーブの前で 速さを おとす(↓ / S)
              </li>
              <li>
                <b>ジャンプ</b> 線路の切れ目・岩を とびこえる(スペース)
              </li>
              <li>
                <b>ダッシュ</b> 鹿が 加速。大ジャンプの前に(Shift)
              </li>
              <li>
                <b>◀ ▶</b> 体を かたむける。カーブ・枝よけに(← →)
              </li>
            </ul>
            <p className="ks-stamina" data-ks="s-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-s" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn" data-ks="go">
              はじめる
            </button>
            <a className="ks-link" href="/#world-8">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="ct-tip" data-ks="r-tip" />
            <p className="ks-stars" data-ks="r-stars" />
            <p className="ks-reward" data-ks="r-reward" />
            <dl className="ks-stats">
              <div><dt>コイン</dt><dd data-ks="r-coins" /></div>
              <div><dt>最高スピード</dt><dd data-ks="r-max" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/cart/" hidden>
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
            <a className="ks-link" href="/#world-8">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
