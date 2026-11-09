# Spruと鹿。（SpraDeer）

奈良公園が舞台の縦画面ゲーム集。TypeScript / Phaser 3 / Vite / Sass。

- 設計書: SmartSprouts の rooms/Spra/dev/SpraDeer/design.md
- 土台: showcases/deersample2（2026-11-09 に本開発へ移行。試作時のREADME・検証記録は docs/prototype/ に保存）
- キャラクター画像4点（spru・spru-clear・spru-oops・deer）は showcases/deersample/public/assets/ から無加工でコピー。正式な素材の原本は rooms/Spra/Mascot/

## 起動

    nvm use
    npm ci
    npm run dev      # http://127.0.0.1:5178/

## 検証

    npm test
    npm run build

## 状態（2026-11-09）

- 面データ化済み（src/game/levels.ts）。遊べる面は 1-1・1-2・1-4。1-3（歩く鹿）と1-5（総仕上げ）は動く鹿の実装後に追加するため「準備中」表示。
- 画面: タイトル → 面選択（直前の面をクリアすると次が開く）→ ゲーム → 結果（次の面へ／もう一度／面選択へ）。
- 記録: 面ごとのクリア数・最短タイム・挑戦回数を localStorage（spra-deer:progress:v1）に保存。
- 面の追加は levels.ts にデータを足し、STAGE_1 の枠に登録する。

次の予定は設計書「11. 初期開発の順番」の 3 以降（Spruの方向別歩行 → 動く鹿と1-3 → 1-5）。
