#!/usr/bin/env bash
# Owner が用意した効果音(rooms/Spra/dev/SpraTheme/効果音/。原本は無加工のまま、ここでは読むだけ)から、ゲームで使う分を切り出す。
# 足音は くり返して鳴らすので、まん中の 8秒だけ・モノラル・軽く・音の大きさを そろえる(はじめと終わりを 0.05秒 なめらかに)。
# 使い方: bash scripts/build-sfx.sh   (ffmpeg が要る)
set -euo pipefail
SRC='/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/dev/SpraTheme/効果音'
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../public/assets/audio"
mkdir -p "$OUT/steps" "$OUT/sfx"

# 足音: [出力名]=[原本の名前]
declare -A STEPS=(
  [grass]='芝生の上を歩く'      # 架空の道(みどりの道)
  [gravel]='砂利の上を歩く'     # 参道
  [dirt]='土の上を歩く'         # 山道・川ぞい
  [asphalt]='アスファルトの上を歩く1' # 街・大都会
  [snow]='雪の上を歩く1'        # 雪の面
)
for k in "${!STEPS[@]}"; do
  ffmpeg -v error -y -ss 1 -t 8 -i "$SRC/${STEPS[$k]}.mp3" -ac 1 -b:a 64k \
    -af 'loudnorm=I=-26:TP=-3,afade=t=in:d=0.05,afade=t=out:st=7.95:d=0.05' -ar 44100 "$OUT/steps/$k.mp3"
done

# ひとつだけ鳴らす音
ffmpeg -v error -y -i "$SRC/水をバシャッとかける1.mp3" -ac 1 -b:a 64k "$OUT/sfx/splash.mp3"        # 水たまり
ffmpeg -v error -y -t 2.6 -i "$SRC/風鈴1.mp3" -ac 1 -b:a 64k -af 'afade=t=out:st=1.8:d=0.8' "$OUT/sfx/bell.mp3" # 仲間の鹿のトロッコの鈴
echo ok
