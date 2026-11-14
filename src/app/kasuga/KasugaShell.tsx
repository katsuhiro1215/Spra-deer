'use client';

import { useEffect, useRef } from 'react';
import './kasuga.css';

export function KasugaShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // three.js はブラウザ側でだけ読み込む
    import('../../kasuga/game.ts').then((m) => {
      if (cancelled || !ref.current) return;
      stop = m.startKasuga(ref.current);
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
            <div className="ks-chip ks-hearts" data-ks="hearts">♥♥♥</div>
          </div>
          <div className="ks-progress">
            <div className="ks-progress-bar">
              <div className="ks-progress-fill" data-ks="fill" />
              <span className="ks-progress-mark" data-ks="mark" />
            </div>
            <span className="ks-progress-goal">春日大社</span>
          </div>
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
            <p className="ks-badge">お試し版</p>
            <h1>
              春日大社へ<small>Spraと鹿。</small>
            </h1>
            <p className="ks-lead">
              石灯籠の参道を かけぬけて、赤い春日大社を めざそう。
              <br />
              穴・柵・ころがる岩・ふん に ご用心。コインも あつめよう！
            </p>
            <ul className="ks-how">
              <li>
                <b>◀ ▶</b> 左右にうごく(キーボードは ← →)
              </li>
              <li>
                <b>ジャンプ</b> あなや 柵を こえる(スペース)
              </li>
            </ul>
            <button type="button" className="ks-btn" data-ks="go">
              はじめる
            </button>
            <a className="ks-link" href="/">
              ← Spraと鹿。にもどる
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
            </dl>
            <button type="button" className="ks-btn" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/">
              ← Spraと鹿。にもどる
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
