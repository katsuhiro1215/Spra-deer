#!/usr/bin/env python3
"""WORLD 3「奈良公園、大掃除！」の絵を、ゲーム用に書き出す。

入力(原本は変更しない):
  rooms/Spra/assets/deer/deer/{子鹿,雌鹿,雄鹿}{右上,左上}.png  2172x724、横に4コマの歩き(後ろ姿で、奥へ歩く)、透明背景
処理: 4コマに切る → 背景除去の残りの色点を消す → 4コマ共通の枠で切りぬく(足元をそろえる) → 高さをそろえて縮める
出力: public/assets/sweep/{fawn,doe,stag}_{ur,ul}_{0..3}.png
使い方: python3 scripts/build-sweep-art.py [rooms/Spra のパス]
"""
import os, sys
from PIL import Image
from spritetools import remove_specks, split_strip, union_crop

SPRA = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'sweep')
KINDS = {'fawn': '子鹿', 'doe': '雌鹿', 'stag': '雄鹿'}
DIRS = {'ur': '右上', 'ul': '左上'}
HEIGHT = 300


def main():
    os.makedirs(OUT, exist_ok=True)
    for kind, jp in KINDS.items():
        for d, jd in DIRS.items():
            sheet = Image.open(os.path.join(SPRA, f'assets/deer/deer/{jp}{jd}.png')).convert('RGBA')
            frames = [remove_specks(f, min_area=4000) for f in split_strip(sheet, 4)]
            for i, f in enumerate(union_crop(frames)):
                scale = HEIGHT / f.height
                out = f.resize((max(1, round(f.width * scale)), HEIGHT), Image.LANCZOS)
                out.save(os.path.join(OUT, f'{kind}_{d}_{i}.png'), optimize=True)
            print(kind, d, out.size)


if __name__ == '__main__':
    main()
