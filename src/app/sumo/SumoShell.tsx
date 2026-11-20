'use client';

import { useEffect, useRef } from 'react';
import '../run/run.css';
import './sumo.css';

// WORLD 6「鹿ずもう」の画面の土台。見た目の共通部分は、3D走り(run.css)と同じものを使う
export function SumoShell() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // three.js はブラウザ側でだけ読み込む。面は /sumo/?level=6-1、鹿の見た目は &art=3d または &art=image
    Promise.all([import('../../sumo/game.ts'), import('../../sumo/levels.ts')]).then(([game, levels]) => {
      if (cancelled || !ref.current) return;
      const p = new URLSearchParams(window.location.search);
      const level = levels.sumoById(p.get('level') ?? '6-1') ?? levels.SUMO_LEVELS[0];
      const art = p.get('art');
      stop = game.startSumo(ref.current, level, art === '3d' || art === 'image' ? art : undefined);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="ks-root sm-root" ref={ref}>
      <div className="ks-frame">
        <div className="ks-stage" data-ks="stage" />

        <div className="ks-hud sm-hud">
          <div className="ks-hud-top">
            <div className="ks-chip ks-level">
              <small data-ks="lv-id" />
              <span data-ks="lv-title" />
            </div>
            <div className="ks-chip sm-time">
              <b data-ks="time">45</b>
              <small>秒</small>
            </div>
            <button type="button" className="ks-chip sm-pause" data-ks="pause-btn" aria-label="一時停止">
              Ⅱ
            </button>
          </div>
          <div className="sm-names">
            <span className="sm-me">
              <i />
              あなた
            </span>
            <span className="sm-vs">VS</span>
            <span className="sm-them">
              <small data-ks="opp-title" />
              <b data-ks="opp-name" />
              <i />
            </span>
          </div>
          <div className="sm-ring">
            <span className="sm-ring-l">ピンチ</span>
            <span className="sm-ring-bar">
              <i data-ks="pos" />
            </span>
            <span className="sm-ring-r">押し出せ！</span>
          </div>
          <div className="sm-warn" data-ks="warn" hidden>
            <b data-ks="warn-text">相手が ためている…</b>
            <span>
              <i data-ks="warn-fill" />
            </span>
          </div>
          <div className="sm-feed" data-ks="feed" />
          <div className="sm-count" data-ks="count" hidden>
            3
          </div>
        </div>

        <div className="sm-controls">
          <div className="sm-meters">
            <div className="sm-meter sm-stam">
              <small>
                スタミナ <b data-ks="stam-v">100</b>
              </small>
              <span>
                <i data-ks="stam" />
              </span>
            </div>
            <div className="sm-meter sm-timing">
              <small data-ks="beat-label">緑の間に、押す</small>
              <span>
                <em />
                <i data-ks="beat" />
              </span>
            </div>
          </div>
          <div className="sm-buttons">
            <button type="button" className="sm-btn sm-evade" data-ks="evade" aria-label="いなす">
              <b>いなす</b>
              <small data-ks="evade-sub">「今！」で ひらり</small>
            </button>
            <button type="button" className="sm-btn sm-push" data-ks="push" aria-label="押す">
              <b>押す</b>
              <small>緑のときに</small>
            </button>
            <button type="button" className="sm-btn sm-charge" data-ks="charge" aria-label="ため押し">
              <b>ため押し</b>
              <small>長押し → はなす</small>
              <span className="sm-charge-bar">
                <i data-ks="charge-fill" />
              </span>
            </button>
          </div>
          <p className="sm-coach" data-ks="coach" />
        </div>

        <div className="ks-overlay on" data-ks="start">
          <div className="ks-card">
            <p className="ks-badge">WORLD 6 鹿ずもう</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <p className="sm-lesson" data-ks="s-lesson" />
            <ul className="ks-how">
              <li>
                <b>押す</b> 緑のときに タップ
              </li>
              <li>
                <b>ため押し</b> 長押し → 金色で はなす
              </li>
              <li>
                <b>いなす</b> 「今！」で タップ
              </li>
              <li>
                <b>勝ち</b> 土俵の外へ 押し出す
              </li>
            </ul>
            <p className="sm-keys">キーボード: スペース=押す・D=ため押し・A=いなす</p>
            <div className="sm-art" role="group" aria-label="鹿の見た目(くらべる用)">
              <small>鹿の見た目</small>
              <button type="button" data-art="3d" aria-pressed="false">
                立体
              </button>
              <button type="button" data-art="image" aria-pressed="false">
                絵
              </button>
            </div>
            <p className="ks-stamina" data-ks="s-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-s" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn" data-ks="go">
              はっけよい！
            </button>
            <a className="ks-link" href="/#world-6">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="pause">
          <div className="ks-card">
            <h2>ひと休み</h2>
            <p className="ks-lead">勝負の時間は 止まっています</p>
            <button type="button" className="ks-btn" data-ks="resume">
              勝負に もどる
            </button>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="sm-tip" data-ks="r-tip" />
            <p className="ks-stars" data-ks="r-stars" />
            <p className="ks-reward" data-ks="r-reward" />
            <dl className="ks-stats">
              <div><dt>ぴったり</dt><dd data-ks="r-perfect" /></div>
              <div><dt>切り返し</dt><dd data-ks="r-counter" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/sumo/" hidden>
              次の面へ
            </a>
            <p className="ks-stamina" data-ks="r-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-r" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn ks-btn-sub" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/#world-6">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
