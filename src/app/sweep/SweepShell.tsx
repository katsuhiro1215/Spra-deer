'use client';

import { useEffect, useRef, useState } from 'react';
import { Loading } from '../Loading';
import '../run/run.css';
import './sweep.css';
import { needsLogin } from '../../account/store.ts';

// WORLD 3「奈良公園、大掃除！」の画面の土台。見た目の共通部分は、3D走り(run.css)と同じものを使う
export function SweepShell() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    // three.js はブラウザ側でだけ読み込む。面は /sweep/?level=3-1 のように指定する(無ければ3-1)
    Promise.all([import('../../sweep/game.ts'), import('../../sweep/levels.ts')]).then(([game, levels]) => {
      if (cancelled || !ref.current) return;
      const id = new URLSearchParams(window.location.search).get('level') ?? '3-1';
      // ログインが要る面(各ワールドの3面目から)は、ホームのログインへ(設計書 37章)
      if (needsLogin(id)) { location.replace('/#login'); return; }
      stop = game.startSweep(ref.current, levels.sweepById(id) ?? levels.SWEEP_LEVELS[0]);
      setReady(true);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <>
      <Loading done={ready} />
    <div className="ks-root sw-root" ref={ref}>
      <div className="ks-frame" data-ks="frame">
        <div className="ks-stage" data-ks="stage" />
        <div className="sw-labels" data-ks="labels" />

        <div className="ks-hud">
          <div className="ks-hud-top">
            <div className="ks-chip">
              <span className="ks-coin-icon" />
              <b data-ks="coins">0</b>
              <span className="ks-coin-icon gold" />
              <b data-ks="gold">0</b>
            </div>
            <div className="ks-chip ks-level">
              <small data-ks="lv-id" />
              <span data-ks="lv-title" />
            </div>
          </div>
          {/* よごれ(100%で失敗)と、大仏さままでの道のり */}
          <div className="sw-bar">
            <div className="sw-dirt" data-ks="dirt-box">
              <small>よごれ</small>
              <b data-ks="dirt">0</b>
              <small>%</small>
              <span className="sw-dirt-bar">
                <i data-ks="dirt-bar" />
              </span>
            </div>
            <div className="sw-road" aria-label="大仏さままで">
              <span className="sw-road-bar">
                <i data-ks="road-bar" />
                <em data-ks="road-spra" />
              </span>
              <span className="sw-buddha-icon" />
            </div>
          </div>
          {/* ほうき(Lv と、次のほうきまで)・お花・コンボ */}
          <div className="sw-info">
            <span className="sw-broom" data-ks="broom">
              <b data-ks="broom-lv">Lv1</b>
              <span data-ks="broom-name" />
              <i className="sw-broom-bar">
                <i data-ks="broom-bar" />
              </i>
            </span>
            <span className="sw-team" aria-label="なかまの人数">
              <i className="sw-team-icon" />×<b data-ks="team">1</b>
            </span>
            <span className="sw-flowers">
              ✿ <b data-ks="flowers">0</b>
            </span>
            <span className="sw-combo" data-ks="combo" hidden />
          </div>
          {/* 大仏さま(後半。目が光ると、うんこが硬くなる) */}
          <div className="sw-buddha" data-ks="buddha" hidden />
          <div className="sw-alert" data-ks="alert" />
          <div className="ks-toast sw-toast" data-ks="toast" />
        </div>

        <div className="ks-overlay on" data-ks="start">
          <div className="ks-card">
            <p className="ks-badge">WORLD 3 奈良公園、大掃除！</p>
            <h1 data-ks="s-title" />
            <p className="ks-lead" data-ks="s-lead" />
            <p className="ks-prem-note" data-ks="s-prem" />
            <ul className="ks-how">
              <li>
                <b>左右</b> 指で なぞって、Spra を動かす
              </li>
              <li>
                <b>ほうき</b> 自動で ふる。前の 光る所の うんこを 掃く
              </li>
              <li>
                <b>数字</b> 大きい うんこは 何回も 掃く(のこりの回数)
              </li>
              <li>
                <b>よごれ</b> 掃きのこして 通りすぎると ふえる。100%で おしまい
              </li>
              <li>
                <b>なかま</b> ゲート・たるで ふえる。走ってくる鹿・赤いゲートで へる
              </li>
              <li>
                <b>✿</b> 掃除すると お花が咲いて、よごれが へる
              </li>
            </ul>
            <p className="sw-keys">キーボード: ← → (A・D) = 動く</p>
            <p className="ks-stamina" data-ks="s-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-s" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn" data-ks="go">
              掃除を はじめる
            </button>
            <a className="ks-link" href="/#world-3">
              ← 面えらびへ
            </a>
          </div>
        </div>

        <div className="ks-overlay" data-ks="result">
          <div className="ks-card">
            <h2 data-ks="r-title" />
            <p className="sw-tip" data-ks="r-tip" />
            <p className="ks-stars" data-ks="r-stars" />
            <p className="ks-reward" data-ks="r-reward" />
            <dl className="ks-stats">
              <div><dt>よごれ</dt><dd data-ks="r-dirt" /></div>
              <div><dt>掃除した うんこ</dt><dd data-ks="r-cleaned" /></div>
              <div><dt>咲いた お花</dt><dd data-ks="r-flowers" /></div>
              <div><dt>ほうき</dt><dd data-ks="r-broom" /></div>
              <div><dt>なかま</dt><dd data-ks="r-team" /></div>
              <div><dt>きろく</dt><dd data-ks="r-time" /></div>
              <div><dt>ベスト</dt><dd data-ks="r-best" /></div>
            </dl>
            <a className="ks-btn ks-btn-next" data-ks="next" href="/sweep/" hidden>
              次の面へ
            </a>
            <p className="ks-stamina" data-ks="r-stamina" />
            <button type="button" className="ks-sound" data-ks="snd-r" aria-pressed="true">
              ♪ 音 ON
            </button>
            <button type="button" className="ks-btn ks-btn-sub" data-ks="retry">
              もういちど
            </button>
            <a className="ks-link" href="/#world-3">
              ← 面えらびへ
            </a>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
