#!/usr/bin/env python3
"""鹿の歩行画像（雄鹿・雌鹿・子鹿 × 右向き・左向き、各4コマ）を、ゲーム用に書き出す。

入力（原本は変更しない）: rooms/Spra/assets/deer/ の「雄鹿右下.png」など。2172x724、4コマ横並び、透明背景。
処理: 4等分 → 背景除去の残りの色点を消す → 4コマ共通の枠で切り出す（足元がずれない）。
出力: public/assets/deer-walk/{種類}_{向き}_{コマ}.png と src/game/deer-walk.json
使い方: python3 scripts/build-deer-walk.py [assets/deer のパス]
"""
import json, os, sys
from PIL import Image
from spritetools import remove_specks, split_strip, union_crop, visible_bbox

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/assets/deer'
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'deer-walk')
MANIFEST = os.path.join(HERE, '..', 'src', 'game', 'deer-walk.json')
KINDS = {'stag': '雄鹿', 'doe': '雌鹿', 'fawn': '子鹿'}
SIDES = {'r': '右下', 'l': '左下'}  # r=右向き, l=左向き


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for kind, jp in KINDS.items():
        manifest[kind] = {}
        for side, side_jp in SIDES.items():
            strip = Image.open(os.path.join(SRC, f'{jp}{side_jp}.png')).convert('RGBA')
            frames = [remove_specks(f) for f in split_strip(strip)]
            # 大きさの基準: 1コマ目の本体の高さ（種類ごとの表示の高さは、ゲーム側で決める）。
            ref = visible_bbox(frames[0])
            cropped = union_crop(frames)
            entries = []
            for i, f in enumerate(cropped):
                name = f'{kind}_{side}_{i}.png'
                f.save(os.path.join(OUT, name), optimize=True)
                entries.append({'file': name, 'w': f.width, 'h': f.height})
            manifest[kind][side] = {'frames': entries, 'refHeight': ref[3] - ref[1]}
            print(kind, side, entries[0]['w'], 'x', entries[0]['h'])
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
