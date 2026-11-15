'use client';

import { useEffect } from 'react';

// ゲーム画面の土台（旧 index.html の body）。中身はゲーム側（src/main.ts）が書き換える。
const MARKUP = "<main id=\"shell\">\n    <section id=\"game-wrap\" aria-label=\"Spraと鹿。ゲーム画面\">\n      <div id=\"game\" tabindex=\"0\" aria-label=\"ゲーム画面。方向キーで移動、スペースでジャンプ\"></div>\n      <div class=\"shade\"></div>\n      <header id=\"hud\" hidden>\n        <div class=\"hud-heading\"><div><span class=\"eyebrow\" id=\"hud-level\">面 1-1</span><h2 id=\"hud-title\">足元には、ご用心。</h2></div><button id=\"pause\" class=\"round-button\" aria-label=\"一時停止\">Ⅱ</button></div>\n        <div class=\"hud-stats\"><div><span class=\"stat-label\">タイム</span><b id=\"timer\">0.0<small>秒</small></b></div><div class=\"best-stat\"><span class=\"stat-label\">自己ベスト</span><b id=\"best\">—</b></div></div>\n        <div class=\"progress\" role=\"progressbar\" aria-label=\"ゴールまでの進み具合\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"0\"><i id=\"progress\"></i></div>\n      </header>\n      <div id=\"message\" role=\"status\" aria-live=\"polite\"></div>\n      <div id=\"controls\" hidden>\n        <div class=\"control-row\">\n          <div class=\"move-control\"><div id=\"move-pad\" aria-label=\"ドラッグして移動\" role=\"group\"><span class=\"pad-up\">↑</span><span class=\"pad-down\">↓</span><span class=\"pad-left\">←</span><span class=\"pad-right\">→</span><div id=\"move-stick\"></div></div><span>ドラッグで移動</span></div>\n          <div class=\"control-note\">指を離すと<br>ピタッと止まる</div>\n          <button id=\"jump\" aria-label=\"ジャンプ\"><svg viewBox=\"0 0 60 44\" aria-hidden=\"true\"><path d=\"M6 34C15 6 43 6 54 34\"/><path d=\"M45 31L54 34L55 24\"/><path d=\"M5 40H17M43 40H55\"/></svg><strong>ジャンプ</strong><span id=\"jump-hint\">Space</span></button>\n        </div>\n      </div>\n      <div id=\"overlay\">\n        <div class=\"screen loading\"><p>奈良さんぽの、準備中…</p></div>\n      </div>\n      <div id=\"fatal\" hidden><h2>読み込みできませんでした</h2><p>ページを再読み込みしてください。</p><button id=\"reload\">再読み込み</button></div>\n    </section>\n  </main>";

export function GameShell() {
  useEffect(() => {
    let stop: (() => void) | undefined, cancelled = false;
    void import('../main.ts').then(m => { if (!cancelled) stop = m.start(); });
    return () => { cancelled = true; stop?.(); };
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: MARKUP }} suppressHydrationWarning />;
}
