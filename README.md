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

## 状態

試作（deersample2）をそのまま移した段階。次は設計書の「11. 初期開発の順番」に沿って、ステージ選択・面データ化（1-1〜1-5）へ進む。
