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
from spritetools import remove_specks, save_hero, split_strip, union_crop, visible_bbox

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/Mascot/01_Spru/walk'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'spru-walk')
MANIFEST = os.path.join(os.path.dirname(__file__), '..', 'src', 'game', 'spru-walk.json')  # コードから読むため src 側に置く
# 向き: (シート, 歩きの順, 立ちのコマ, 大きさをそろえる基準のコマ)
SHEETS = {
    # 正面（2026-11-09 再生成版）。全コマが歩きのポーズで、左足前が3コマ続く。手足の組が正しい3・4コマ目と中立の2コマ目だけで左右交互にしている（1コマ目は未使用）。立ちは2コマ目。
    'down': ('スプラウトキャラクターの歩行アニメーション_strip.png', [2, 1, 3, 1], 1, 1),
    # 後ろ姿。0コマ目が立ち、1=左足, 2=両足そろう, 3=右足。
    'up': ('歩く緑の芽っ子バックビュー4コマ.png', [1, 2, 3, 2], 0, 2),
}
DIAGONALS = {'dr': 'lower_right', 'dl': 'lower_left', 'ur': 'upper_right', 'ul': 'upper_left'}


def split_sheet(path):
    return [remove_specks(f) for f in split_strip(Image.open(path).convert('RGBA'))]


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
        frames = [remove_specks(Image.open(os.path.join(SRC, f'{base}_{n}.png')).convert('RGBA')) for n in ('passing', 'step_l', 'step_r')]
        if key == 'dr':
            reference = visible_bbox(frames[0])
        # 0=passing（立ち）, 1=step_l, 2=step_r。歩きは 左→立ち→右→立ち。
        save(key, union_crop(frames), [1, 0, 2, 0], 0, manifest)
    ref_height = reference[3] - reference[1]
    for key, (sheet, cycle, idle, ref) in SHEETS.items():
        frames = split_sheet(os.path.join(SRC, sheet))
        # 基準のコマの高さを、斜めの passing にそろえる。
        scale = ref_height / (visible_bbox(frames[ref])[3] - visible_bbox(frames[ref])[1])
        cropped = union_crop(frames)
        scaled = [f.resize((round(f.width * scale), round(f.height * scale)), Image.LANCZOS) for f in cropped]
        save(key, scaled, cycle, idle, manifest)
        if key == 'down':
            save_hero(cropped[idle], 'spru.png')  # トップ画面用（縮小前の原寸から）
        print(f'{key}: scale {scale:.3f}')
    manifest['referenceHeight'] = ref_height
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)
    print('written', os.path.abspath(OUT), os.path.abspath(MANIFEST))


if __name__ == '__main__':
    main()
