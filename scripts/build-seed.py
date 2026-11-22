"""Spra の種(WORLD 8 の追いかけっこで、ラムガの子分へ投げる)を、基準の設定画から切り出す。
原本: rooms/Spra/assets/spru/spru.png(無加工のまま。ここでは読むだけ。下の段の左の「種」)
原本は透明ではなく、灰色の市松模様が絵に入っているので、色の濃さ(彩度)で背景を消す。
出力: public/assets/cart/seed.png(高さ128px・透明)
使い方: python3 scripts/build-seed.py
"""
import os
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/assets/spru/spru.png'
OUT = os.path.join(HERE, '..', 'public', 'assets', 'cart')
BOX = (250, 830, 400, 1015)


def main():
    os.makedirs(OUT, exist_ok=True)
    im = Image.open(SRC).convert('RGB').crop(BOX)
    hsv = im.convert('HSV')
    sat = hsv.split()[1]
    # 市松模様は ほぼ灰色(彩度が低い)。種と芽は緑(彩度が高い)
    a = sat.point(lambda v: 0 if v < 60 else 255 if v > 95 else int((v - 60) * 255 / 35))
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    piece = im.convert('RGBA')
    piece.putalpha(a)
    bb = a.point(lambda v: 255 if v > 128 else 0).getbbox()
    piece = piece.crop(bb)
    h = 128
    piece = piece.resize((round(piece.width * h / piece.height), h), Image.LANCZOS)
    piece.save(os.path.join(OUT, 'seed.png'), optimize=True)
    print('seed:', piece.size)


if __name__ == '__main__':
    main()
