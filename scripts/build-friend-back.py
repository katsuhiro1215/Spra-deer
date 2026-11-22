#!/usr/bin/env python3
"""WORLD 4 の鬼ごっこで にげる 仲間(Lumi・Momo・Kuru・Piko・Ruru)の 後ろ姿4コマを、ゲーム用に書き出す。
(Spra は scripts/build-spru-walk.py の spru-walk/up_0〜3 を使う)

2026-11-22 Owner「Lumi の鹿の面では Lumi が にげる、Kuru の鹿の面では Kuru が にげる」
入力(原本は変更しない): rooms/Spra/Mascot/<番号>_<名前>/walk/ の 真後ろの4コマ(透明背景・2172x724・横並び)
出力: public/assets/friend-back/<id>_<0〜3>.webp(高さを spru-walk/up と そろえる。4コマ共通の枠で切って 足もとを そろえる)
使い方: python3 scripts/build-friend-back.py
"""
import os
from PIL import Image
from spritetools import remove_specks, split_strip, union_crop

MASCOT = '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/Mascot'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'friend-back')
SHEETS = {
    'lumi': '02_Lumi/walk/黄色いスプラウトキャラクターの走りアニメーション.png',
    'momo': '03_Momo/walk/モモ風スプラウトの後ろ姿歩行アニメーション.png',
    'kuru': '04_Kuru/walk/背面歩行するナッツの妖精スプライト.png',
    'piko': '05_Piko/walk/piko_back_walk_4frames_transparent.png',
    'ruru': '06_Ruru/walk/ルルの四コマ歩行アニメーション.png',
}
# Spra の後ろ姿(spru-walk/up_0.png)の高さに そろえる
HEIGHT = Image.open(os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'spru-walk', 'up_0.png')).height


def main():
    os.makedirs(OUT, exist_ok=True)
    for fid, rel in SHEETS.items():
        frames = [remove_specks(f) for f in split_strip(Image.open(os.path.join(MASCOT, rel)).convert('RGBA'))]
        cropped = union_crop(frames)
        k = HEIGHT / cropped[0].height
        for i, f in enumerate(cropped):
            f = f.resize((round(f.width * k), HEIGHT), Image.LANCZOS)
            f.save(os.path.join(OUT, f'{fid}_{i}.webp'), 'WEBP', quality=88, method=6)
        print(fid, cropped[0].size, '->', round(cropped[0].width * k), HEIGHT)


if __name__ == '__main__':
    main()
