#!/usr/bin/env python3
"""Spruの6方向歩行画像を、ゲーム用に public/assets/spru-walk/ へ書き出す。

入力（原本は変更しない。Mascot 側の walk フォルダ）:
  - 斜め4方向: lower_right_passing.png など（12枚、地面の位置が揃った 640x800 の画像）
  - 真正面 / 真後ろ: 4コマ横並びのシート（透明背景、2172x724）
処理:
  1. シートを4等分し、4コマ共通の枠で切り出す（コマごとにトリムすると足元がずれるため）。
  2. 真正面・真後ろの大きさを、斜め画像の「passing」の高さにそろえる。
  3. 方向ごとに4コマ共通の枠で切り、下端を地面（足元）にそろえる。
使い方: python3 scripts/build-spru-walk.py [Mascot/01_Spru/walk のパス]
依存: Pillow
"""
import json, os, sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/Mascot/01_Spru/walk'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'spru-walk')
MANIFEST = os.path.join(os.path.dirname(__file__), '..', 'src', 'game', 'spru-walk.json')  # コードから読むため src 側に置く
SHEETS = {'down': '植物スプライトのランニングポーズ集.png', 'up': '歩く緑の芽っ子バックビュー4コマ.png'}
DIAGONALS = {'dr': 'lower_right', 'dl': 'lower_left', 'ur': 'upper_right', 'ul': 'upper_left'}
ALPHA_MIN = 24  # これ以下の薄い縁は、大きさの測定に使わない
PAD = 2


def visible_bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > ALPHA_MIN else 0).getbbox()


def union_crop(frames):
    """各コマの不透明部分の和集合の枠で切り出す。下端は足元なので余白を足さない。"""
    boxes = [visible_bbox(f) for f in frames]
    left, top = min(b[0] for b in boxes) - PAD, min(b[1] for b in boxes) - PAD
    right, bottom = max(b[2] for b in boxes) + PAD, max(b[3] for b in boxes)
    return [f.crop((max(0, left), max(0, top), min(f.width, right), min(f.height, bottom))) for f in frames]


def split_sheet(path):
    im = Image.open(path).convert('RGBA')
    cell = im.width // 4
    return [im.crop((i * cell, 0, (i + 1) * cell, im.height)) for i in range(4)]


def save(direction, frames, cycle, idle, manifest):
    os.makedirs(OUT, exist_ok=True)
    entries = []
    for i, f in enumerate(frames):
        name = f'{direction}_{i}.png'
        f.save(os.path.join(OUT, name), optimize=True)
        entries.append({'file': name, 'w': f.width, 'h': f.height})
    manifest[direction] = {'frames': entries, 'cycle': cycle, 'idle': idle}


def main():
    manifest = {}
    reference = None
    for key, base in DIAGONALS.items():
        frames = [Image.open(os.path.join(SRC, f'{base}_{n}.png')).convert('RGBA') for n in ('passing', 'step_l', 'step_r')]
        if key == 'dr':
            reference = visible_bbox(frames[0])
        # 0=passing（立ち）, 1=step_l, 2=step_r。歩きは 左→立ち→右→立ち。
        save(key, union_crop(frames), [1, 0, 2, 0], 0, manifest)
    ref_height = reference[3] - reference[1]
    for key, sheet in SHEETS.items():
        frames = split_sheet(os.path.join(SRC, sheet))
        # 0=立ち, 1〜3=歩き。passing 相当のコマ（2）の高さを斜めの passing にそろえる。
        scale = ref_height / (visible_bbox(frames[2])[3] - visible_bbox(frames[2])[1])
        cropped = union_crop(frames)
        scaled = [f.resize((round(f.width * scale), round(f.height * scale)), Image.LANCZOS) for f in cropped]
        save(key, scaled, [1, 2, 3, 2], 0, manifest)
        print(f'{key}: scale {scale:.3f}')
    manifest['referenceHeight'] = ref_height
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    print('written', os.path.abspath(OUT), os.path.abspath(MANIFEST))


if __name__ == '__main__':
    main()
