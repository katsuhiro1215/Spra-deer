'use client';

import { useEffect, useRef } from 'react';
import '../run/run.css';
import './bake.css';

// WORLD 2「鹿せんべい大作戦」(せんべい屋台)の画面の土台。見た目の共通部分は、3D走り(run.css)と同じものを使う
export function BakeShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // three.js はブラウザ側でだけ読み込む。面は /bake/?level=2-1 のように指定する(無ければ2-1)
    // 焼く面(game.ts)・積む面(towerGame.ts)・配る面(tossGame.ts)は、面のデータの mode で分ける
    Promise.all([import('../../bake/game.ts'), import('../../bake/towerGame.ts'), import('../../bake/tossGame.ts'), import('../../bake/levels.ts')]).then(([game, tower, toss, levels]) => {
      if (cancelled || !ref.current) return;
      const id = new URLSearchParams(window.location.search).get('level') ?? '2-1';
      const level = levels.bakeById(id) ?? levels.BAKE_LEVELS[0];
      stop = levels.isTower(level) ? tower.startTower(ref.current, level) : levels.isToss(level) ? toss.startToss(ref.current, level) : game.startBake(ref.current, level);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="ks-root bk-root" ref={ref}>
      <div className="ks-frame" data-ks="frame">
        <div className="ks-stage" data-ks="stage" />
        <div className="bk-labels" data-ks="labels" />

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
          <div className="bk-bar">
            <div className="bk-time">
              <small>のこり</small>
              <b data-ks="time">0</b>
              <small>秒</small>
              <span className="bk-time-bar">
                <i data-ks="time-bar" />
              </span>
            </div>
            <div className="bk-served" aria-label="まんぞくした鹿">
              <span className="bk-deer-icon" />
              <b data-ks="served">0</b>
              <small data-ks="goal" />
            </div>
          </div>
          <div className="bk-streak" data-ks="streak" hidden />
          {/* 積む面だけ: 高さと、ぐらぐら度 */}
          <div className="bk-tower-info">
            <span>
              高さ <b data-ks="t-height">0</b>段
            </span>
            <span className="bk-stab" data-ks="t-stab">
              ぐらぐら
              <i className="bk-stab-bar">
                <i data-ks="t-stab-bar" />
              </i>
            </span>
          </div>
          {/* 配る面だけ: のこりの せんべいと、ぴったりの連続 */}
          <div className="bk-toss-info">
            <span className="bk-stock" data-ks="t-stock-box">
              せんべい <b data-ks="t-stock">0</b>まい
            </span>
            <span className="bk-pstreak" data-ks="t-streak" hidden />
          </div>
          <div className="bk-alert" data-ks="alert" />
          <div className="ks-toast bk-toast" data-ks="toast" />
        </div>

        <button type="button" className="bk-deliver" data-ks="deliver" disabled>
          <b>おとどけ！</b>
          <small />
        </button>

        <div className="bk-spra">
          <img data-ks="spra" src="/assets/bake/spra_idle.png" alt="Spra" />
          <span className="bk-say" data-ks="say" />
        </div>
        {/* お店を手伝う なかま(2-5 から) */}
        <div className="bk-helpers" data-ks="helpers" />

        <div className="ks-overlay on" data-ks="start">
          <div className="ks-card">
            <p className="ks-badge">WORLD 2 鹿せんべい大作戦</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <p className="ks-prem-note" data-ks="s-prem" />
            <ul className="ks-how" data-ks="how">
              <li>
                <b>鉄板</b> タップで 生地を のせる
              </li>
              <li>
                <b>金色</b> で タップ →「こんがり」
              </li>
              <li>
                <b>鹿</b> タップで せんべいを わたす
              </li>
              <li>
                <b>♥</b> 焦がす・待たせすぎで へる
              </li>
            </ul>
            <p className="bk-keys" data-ks="keys">キーボード: 1・2・3 = 鉄板/Q・W・E = 鹿</p>
            <p className="ks-stamina" data-ks="s-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-s" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn" data-ks="go">
              おみせを ひらく
            </button>
            <a className="ks-link" href="/#world-2">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="bk-tip" data-ks="r-tip" />
            <p className="ks-stars" data-ks="r-stars" />
            <p className="ks-reward" data-ks="r-reward" />
            <dl className="ks-stats">
              <div><dt data-ks="r-l1">まんぞくした鹿</dt><dd data-ks="r-served" /></div>
              <div><dt data-ks="r-l2">極上せんべい</dt><dd data-ks="r-gokujo" /></div>
              <div><dt>コイン</dt><dd data-ks="r-coins" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/bake/" hidden>
              次の面へ
            </a>
            <p className="ks-stamina" data-ks="r-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-r" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn ks-btn-sub" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/#world-2">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
