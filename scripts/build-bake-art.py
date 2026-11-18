#!/usr/bin/env python3
"""WORLD 2「鹿せんべい大作戦」(せんべい屋台)の絵を、ゲーム用に書き出す。

入力(原本は変更しない):
  rooms/Spra/assets/deer/かわいい子鹿の4ポーズセット.png  1254x1254、2x2 に4ポーズ(正面・ウインク・いたずら顔・ねそべり)、透明背景
  rooms/Spra/Mascot/01_Spru/ の Spra(待つ・ばんざい・こまった・手をふる)
処理: 切り分け → 背景除去の残りの色点を消す → 不透明な所で切りぬく → 高さをそろえて縮める
出力: public/assets/bake/*.png
使い方: python3 scripts/build-bake-art.py [rooms/Spra のパス]
"""
import os, sys
from PIL import Image
from spritetools import remove_specks, visible_bbox

SPRA = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'bake')

# 4ポーズの並び(左上・右上・左下・右下)
POSES = ['stag_front', 'stag_wink', 'stag_sneak', 'stag_lie']
SPRA_FILES = {
    'spra_idle': 'Mascot/01_Spru/idle/spru_idle_lower_left_01.png',
    'spra_hooray': 'Mascot/01_Spru/reactions/spru_hooray_01.png',
    'spra_trouble': 'Mascot/01_Spru/reactions/spru_trouble_01.png',
    'spra_wave': 'Mascot/01_Spru/actions/spru_wave_lower_left_01.png',
}


def fit(im, height):
    im = im.crop(visible_bbox(im))
    scale = height / im.height
    return im.resize((max(1, round(im.width * scale)), height), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.open(os.path.join(SPRA, 'assets/deer/かわいい子鹿の4ポーズセット.png')).convert('RGBA')
    w, h = sheet.size
    for i, name in enumerate(POSES):
        x, y = (i % 2) * w // 2, (i // 2) * h // 2
        # となりのポーズの足先・角先が入りこむので、大きなかたまり(本体)だけ残す
        part = remove_specks(sheet.crop((x, y, x + w // 2, y + h // 2)), min_area=15000)
        out = fit(part, 400)
        out.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        print(name, out.size)
    for name, rel in SPRA_FILES.items():
        im = Image.open(os.path.join(SPRA, rel)).convert('RGBA')
        out = fit(remove_specks(im, min_area=200), 300)
        out.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        print(name, out.size)


if __name__ == '__main__':
    main()
