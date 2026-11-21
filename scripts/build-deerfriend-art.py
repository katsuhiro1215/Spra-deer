#!/usr/bin/env python3
"""仲間の鹿(Spra・Lumi・Piko・Momo・Ruru・Kuru)の絵を、ゲーム用に整える。(WORLD 3 の手伝いをする「なかま」とは別。あちらは build-friend-art.py)

元の絵(Owner が生成。mascot-review ずみ): rooms/Spra/assets/deer/deer/<名前>deer/
  - 立ち姿(1枚)                       → public/assets/deerfriends/<id>.webp         (高さ760・余白を切る)
  - 後ろ姿の走り(4コマが横に並んだ1枚)   → public/assets/deerfriends/<id>_run_{0..3}.webp
    3D走り(WORLD 4・8)用。既存の鹿 public/assets/kasuga/run_*.png と同じ 360x480 の枠・同じ大きさ・同じ足もとの位置にそろえる
元の絵は変えない。ほぼ透明な画素(光のにじみ)と、輪郭からはなれた小さなごみを消す。
使い方: python3 scripts/build-deerfriend-art.py
"""
import glob
import os
import sys
from PIL import Image, ImageChops, ImageFilter

SRC = '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/assets/deer/deer/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'deerfriends')

# id: (立ち姿, 走り)  * は glob(ファイル名に生成時のごみが付いているものがある)
FRIENDS = {
    'spra': ('spradeer/芽吹く森の子鹿マスコット.png', 'spradeer/緑の森の精霊・歩行アニメーション.png'),
    'lumi': ('lumideer/LumiDeerModel2.png', 'lumideer/歩く黄色い子鹿のアニメーション列.png'),
    'piko': ('pikodeer/花冠をつけた笑顔の子鹿ピコ.png', 'pikodeer/オレンジ鹿の歩行アニメーション4コマ.png'),
    'momo': ('momodeer/MomoDeerModel2.png', 'momodeer/ピンクの子鹿たちの歩行アニメーション.png'),
    'ruru': ('rurudeer/水滴飾り*.png', 'rurudeer/水の妖精鹿・歩行アニメーション4コマ.png'),
    'kuru': ('kurudeer/葉っぱ角のキュートな子鹿.png', 'kurudeer/後ろ姿の子鹿ウォーキングアニメーション.png'),
}

# 既存の走りの絵(public/assets/kasuga/run_*.png)の枠と、鹿の大きさ・位置
FRAME_W, FRAME_H = 360, 480
BODY_H, FOOT_Y, CENTER_X = 455, 462, 190


def find(pattern):
    hits = sorted(glob.glob(SRC + pattern))
    if not hits:
        sys.exit(f'見つかりません: {pattern}')
    return hits[0]


def clean(im):
    """光のにじみ(小さいアルファ)と、輪郭からはなれた小さなごみを消す"""
    im = im.convert('RGBA')
    al = im.getchannel('A')
    solid = al.point(lambda v: 255 if v >= 60 else 0)
    opened = solid.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    region = opened.filter(ImageFilter.MaxFilter(13))
    new = ImageChops.multiply(al.point(lambda v: 0 if v < 40 else v), region)
    im.putalpha(new)
    return im


def stand(pid, path):
    im = clean(Image.open(path))
    im = im.crop(im.getchannel('A').getbbox())
    h = 760
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    im.save(os.path.join(OUT, f'{pid}.webp'), quality=90, method=6)
    return im.size


def split_by_gaps(sheet, count=4):
    """横の透明なすき間で コマを区切る(コマの間隔が均等でないことがある)。分けられなければ 4等分"""
    al = sheet.getchannel('A').point(lambda v: 255 if v > 40 else 0)
    w, h = sheet.size
    cols = [al.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
    runs, start = [], None
    for x, on in enumerate(cols + [False]):
        if on and start is None:
            start = x
        if not on and start is not None:
            runs.append((start, x))
            start = None
    # 細い(はなれた)かたまりは、となりにつなぐ: 幅の大きい順に count 個を核にして、残りは近い核へ
    runs = [r for r in runs if r[1] - r[0] >= 8]
    if len(runs) < count:
        cell = w // count
        return [sheet.crop((i * cell, 0, (i + 1) * cell, h)) for i in range(count)]
    core = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:count])
    groups = [[c] for c in core]
    for r in runs:
        if r in core:
            continue
        mid = (r[0] + r[1]) / 2
        i = min(range(count), key=lambda k: abs((core[k][0] + core[k][1]) / 2 - mid))
        groups[i].append(r)
    parts = []
    for g in groups:
        x0, x1 = min(r[0] for r in g), max(r[1] for r in g)
        parts.append(sheet.crop((x0, 0, x1, h)))
    return parts


def run(pid, path):
    sheet = clean(Image.open(path))
    frames = []
    for part in split_by_gaps(sheet):
        bb = part.getchannel('A').getbbox()
        if not bb:
            sys.exit(f'{pid}: 走りのコマが空です')
        frames.append(part.crop(bb))
    # 全コマ共通の拡大率(コマごとに大きさが ぶれない)
    s = min(BODY_H / max(f.height for f in frames), (FRAME_W - 8) / max(f.width for f in frames))
    sizes = []
    for i, f in enumerate(frames):
        f = f.resize((max(1, round(f.width * s)), max(1, round(f.height * s))), Image.LANCZOS)
        # 体(下半分)の中心を そろえる(歩くたびに 横へ すべらない)
        lower = f.crop((0, f.height // 2, f.width, f.height)).getchannel('A').getbbox()
        body_cx = (lower[0] + lower[2]) / 2 if lower else f.width / 2
        frame = Image.new('RGBA', (FRAME_W, FRAME_H), (0, 0, 0, 0))
        x = round(CENTER_X - body_cx)
        frame.alpha_composite(f, (x, FOOT_Y - f.height)) if 0 <= x and x + f.width <= FRAME_W and FOOT_Y >= f.height else frame.paste(f, (x, FOOT_Y - f.height), f)
        frame.save(os.path.join(OUT, f'{pid}_run_{i}.webp'), quality=90, method=6)
        sizes.append(f.size)
    return sizes


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for pid, (st, rn) in FRIENDS.items():
        print(pid, 'stand', stand(pid, find(st)), 'run', run(pid, find(rn)))
