#!/usr/bin/env python3
"""WORLD 3「奈良公園、大掃除！」の なかま(Lumi・Momo・Kuru・Piko・Ruru)の 歩く後ろ姿を、ゲーム用に書き出す。

入力(原本は変更しない。造形レビュー mascot-review を通したもの):
  rooms/Spra/Mascot/ の 各なかまの 4コマ歩きシート(2172x724、横に4コマ、透明背景)
  Lumi だけは 真後ろの絵が無いので、斜め左うしろの絵
処理: 透明な すき間で 4コマに区切る(ChatGPT の絵は コマの間隔が 均等でないことがある。4等分だと 歩くたびに 横へすべり、
      となりのコマに はみ出した葉の先が 欠ける) → 背景除去の残りの色点を消す → 体(下半分)の中心と 足元を そろえて 同じ大きさの枠に置く → 高さをそろえて縮める
出力: public/assets/sweep/friends/{lumi,momo,kuru,piko,ruru}_{0..3}.png
使い方: python3 scripts/build-friend-art.py [rooms/Spra のパス]
"""
import os, sys
from PIL import Image
from spritetools import ALPHA_MIN, remove_specks, split_strip, visible_bbox

SPRA = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'sweep', 'friends')
SHEETS = {
    'lumi': 'Mascot/02_Lumi/walk/ルミの歩行アニメーション連作.png',
    'momo': 'Mascot/03_Momo/walk/モモ風スプラウトの後ろ姿歩行アニメーション.png',
    'kuru': 'Mascot/04_Kuru/walk/背面歩行するナッツの妖精スプライト.png',
    'piko': 'Mascot/05_Piko/piko_back_walk_4frames_transparent.png',
    'ruru': 'Mascot/06_Ruru/walk/ルルの四コマ歩行アニメーション.png',
}
HEIGHT = 256


def split_by_gaps(sheet, count=4):
    """横の 透明な すき間で コマを区切る(細い点の列は 無視)。うまく count に分かれなければ 4等分"""
    alpha = sheet.getchannel('A').point(lambda v: 255 if v > ALPHA_MIN else 0)
    w, h = sheet.size
    cols = [alpha.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
    runs, x = [], 0
    while x < w:
        if cols[x]:
            x0 = x
            while x < w and cols[x]:
                x += 1
            runs.append([x0, x])
        x += 1
    runs = [r for r in runs if r[1] - r[0] >= 24]
    merged = []
    for r in runs:
        if merged and r[0] - merged[-1][1] < 10:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    if len(merged) != count:
        print('  すき間で分けられないので 4等分にした', len(merged))
        return split_strip(sheet, count)
    return [sheet.crop((max(0, a - 4), 0, min(w, b + 4), h)) for a, b in merged]


def body_center(im):
    """体(下半分)の 横の まん中(葉や かざりの 出っぱりに 左右されない)"""
    a = im.getchannel('A')
    lower = a.crop((0, im.height // 2, im.width, im.height))
    xs = [x for x in range(im.width) if lower.crop((x, 0, x + 1, lower.height)).getbbox()]
    return (xs[0] + xs[-1] + 1) / 2 if xs else im.width / 2


def align(frames, pad=2):
    """各コマを 自分の枠で切り、体の中心と 足元を そろえて、同じ大きさの枠に置く"""
    cut = [f.crop(visible_bbox(f)) for f in frames]
    cxs = [body_center(f) for f in cut]
    left = max(cx for cx in cxs) + pad
    right = max(f.width - cx for f, cx in zip(cut, cxs)) + pad
    height = max(f.height for f in cut) + pad
    out = []
    for f, cx in zip(cut, cxs):
        c = Image.new('RGBA', (round(left + right), height), (0, 0, 0, 0))
        c.alpha_composite(f, (round(left - cx), height - f.height))
        out.append(c)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for fid, rel in SHEETS.items():
        sheet = Image.open(os.path.join(SPRA, rel)).convert('RGBA')
        frames = [remove_specks(f, min_area=4000) for f in split_by_gaps(sheet, 4)]
        for i, f in enumerate(align(frames)):
            scale = HEIGHT / f.height
            out = f.resize((max(1, round(f.width * scale)), HEIGHT), Image.LANCZOS)
            out.save(os.path.join(OUT, f'{fid}_{i}.png'), optimize=True)
        print(fid, out.size)


if __name__ == '__main__':
    main()
