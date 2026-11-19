#!/usr/bin/env python3
"""WORLD 2 せんべい屋台で「お店の手伝い」をする なかまの 正面の立ち絵を、ゲーム用に書き出す。

入力(原本は変更しない。造形レビュー mascot-review を通したもの。2026-11-20):
  Lumi = 02_Lumi/idle/lumi_idle_lower_left_01.png(歩きシートは 左右が反転していたので、向きの正しい立ち絵)
  Momo = 03_Momo/walk/モモのちびキャラ歩行スプライト4コマ.png の 1コマ目
  Kuru = 04_Kuru/walk/木の実マスコット「クル」の歩行アニメーションスプライトシート.png の 1コマ目
  Ruru = 06_Ruru/walk/水滴マスコット・ルルの歩行アニメーションspritesheet.png の 1コマ目
  Piko = 05_Piko/オレンジ色の芽キャベツ風ちびマスコット.png(口を閉じて 正面に立つ。Piko の正式な色は オレンジ)
処理: 1コマ目を切る → ほぼ見えない点(不透明度 8 未満)を消す → 本体の枠で切りぬく → 高さをそろえて縮める
出力: public/assets/bake/friends/{lumi,momo,kuru,piko,ruru}.png
使い方: python3 scripts/build-friend-front.py [rooms/Spra のパス]
"""
import importlib.util, os, sys
from PIL import Image
from spritetools import remove_specks, visible_bbox

SPRA = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'bake', 'friends')
# 歩きシートの 区切り方は、後ろ姿の書き出し(build-friend-art.py)と同じ
_spec = importlib.util.spec_from_file_location('friend_art', os.path.join(HERE, 'build-friend-art.py'))
friend_art = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(friend_art)

SOURCES = {
    'lumi': ('Mascot/02_Lumi/idle/lumi_idle_lower_left_01.png', False),
    'momo': ('Mascot/03_Momo/walk/モモのちびキャラ歩行スプライト4コマ.png', True),
    'kuru': ('Mascot/04_Kuru/walk/木の実マスコット「クル」の歩行アニメーションスプライトシート.png', True),
    'ruru': ('Mascot/06_Ruru/walk/水滴マスコット・ルルの歩行アニメーションspritesheet.png', True),
    'piko': ('Mascot/05_Piko/オレンジ色の芽キャベツ風ちびマスコット.png', False),
}
HEIGHT = 300


def main():
    os.makedirs(OUT, exist_ok=True)
    for fid, (rel, sheet) in SOURCES.items():
        im = Image.open(os.path.join(SPRA, rel)).convert('RGBA')
        if sheet:
            im = friend_art.split_by_gaps(im, 4)[0]
        a = im.getchannel('A').point(lambda v: 0 if v < 8 else v)
        im.putalpha(a)
        im = remove_specks(im, min_area=4000)
        im = im.crop(visible_bbox(im))
        scale = HEIGHT / im.height
        out = im.resize((max(1, round(im.width * scale)), HEIGHT), Image.LANCZOS)
        out.save(os.path.join(OUT, f'{fid}.png'), optimize=True)
        print(fid, out.size)


if __name__ == '__main__':
    main()
