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

- 面データ化済み（src/game/levels.ts）。遊べる面は 1-1・1-2・1-3・1-4。1-5（総仕上げ）は「準備中」表示。
- 画面: タイトル → 面選択（直前の面をクリアすると次が開く）→ ゲーム → 結果（次の面へ／もう一度／面選択へ）。
- 記録: 面ごとのクリア数・最短タイム・挑戦回数を localStorage（spra-deer:progress:v1）に保存。
- 面の追加は levels.ts にデータを足し、STAGE_1 の枠に登録する。

次の予定は設計書「11. 初期開発の順番」の 3 以降（Spruの方向別歩行 → 動く鹿と1-3 → 1-5）。

## Spruの6方向歩行（2026-11-09）

- 向き: 入力を60度ずつ6領域（下・上・右下・左下・右上・左上）に分けて切り替える（src/game/facing.ts）。止まると最後の向きの立ち絵。開始時は奥（上）向き。
- 足の動きは、実際に進んだ距離（歩幅）で進める。壁に押しつけても足は動かない。
- 画像: 斜め4方向は Mascot の walk 画像、真正面・真後ろは同フォルダの4コマ横並びシートを、scripts/build-spru-walk.py で切り出して public/assets/spru-walk/ に書き出す（原本は無加工。大きさは斜めの立ち絵にそろえる）。再生成: python3 scripts/build-spru-walk.py（Pillow必要）
- 既知の課題: 正面の再生成版も、左足前が3コマ続き左右交互になっていない（確認用レビューで判明）。暫定で、手足の組が正しい2コマと中立コマだけを使って交互にしている。理想は「左足前＋右腕上／中立／右足前＋左腕上／中立」の4コマ＋直立の立ち絵。再生成したら、スクリプトのシート名と歩きの順を直して再実行する。縁にごく薄い黄緑のにじみ・足元の小さな点があるため、再生成時に透明背景の書き出しを依頼する。
- 6方向の見た目確認: scripts/walk-shots.mjs（開発サーバー起動中に実行、test-results/ に出力）

## 歩く鹿と 1-3（2026-11-09）

- 鹿は道を行き来し、決まった時刻にその場で止まって（もじもじ＋落とす場所の輪）、うんこを落とす（src/game/world.ts の stepDeers）。動きは時間だけで決まるため毎回同じ。鹿に触れても失敗しない。
- 面データ: DeerDefinition（種類・道・速さ・最初に落とす時刻・間隔・回数・予告時間）。1-3 は雌鹿と子鹿の2頭。
- 画像: rooms/Spra/assets/deer/ の4コマ歩行シート（雄鹿・雌鹿・子鹿 × 右向き・左向き）を scripts/build-deer-walk.py で切り出し（背景除去の残りの色点を消す処理つき。共通部品は scripts/spritetools.py）。正面・後ろ向きの鹿は Owner が生成予定。届いたら向きを増やす。
- 見た目確認: scripts/deer-shots.mjs（1-3の予告と落とした直後）。
