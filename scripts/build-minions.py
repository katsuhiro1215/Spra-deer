"""ラムガの子分(ストーリーの敵。3D走りで攻撃してくる)を、シートから切り出す。
原本: rooms/Spra/assets/deer/darkdeer/ラムガと仲間たちのボスキャラシート.png(無加工のまま。ここでは読むだけ)
出力: public/assets/runner/minions/<名前>.png(高さ320px・透明)
使い方: python3 scripts/build-minions.py   (Pillow だけで動く。切り抜きの仕上げは build-critters.py と同じ)
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('critters', os.path.join(HERE, 'build-critters.py'))
critters = importlib.util.module_from_spec(spec)
spec.loader.exec_module(critters)
from PIL import Image  # noqa: E402

SRC = '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/assets/deer/darkdeer/ラムガと仲間たちのボスキャラシート.png'
OUT = os.path.join(HERE, '..', 'public', 'assets', 'runner', 'minions')

# シート(1536×1024)の中の枠。上の段は大きなラムガ2体、中の段と下の段に子分が5体ずつ
BOXES = {
    'bomber': (1230, 470, 1536, 760),  # 中の段の右: ゴーグルで爆弾を持つ子分
    'bat': (1228, 745, 1536, 1024),  # 下の段の右: こうもり
    'boar': (614, 745, 921, 1024),  # 下の段の真ん中: いのしし
    'ramuga': (180, 0, 760, 480),  # 上の左: ラムガ(のちに使う)
    # WORLD 8 の追いかけっこ(2026-11-22 Owner「ラムガの子分を出す」)で使う残りの子分
    'grunt': (0, 470, 290, 760),  # 中の段の左: マントの子分
    'shield': (290, 470, 590, 760),  # 中の段の2番目: 盾の兵士
    'spear': (590, 470, 895, 760),  # 中の段の3番目: やりの兵士
    'hammer': (895, 470, 1230, 760),  # 中の段の4番目: ハンマーの子分
    'sheep': (0, 745, 300, 1024),  # 下の段の左: 羊雲
    'golem': (295, 745, 614, 1024),  # 下の段の2番目: 岩
    'spike': (925, 745, 1228, 1024),  # 下の段の4番目: とげ玉
}


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.open(SRC).convert('RGBA')
    for name, box in BOXES.items():
        piece = critters.clean(sheet.crop(box))
        if piece is None:
            print(f'{name}: 絵が見つからない')
            continue
        piece.save(os.path.join(OUT, f'{name}.png'))
        print(f'{name}: {piece.size[0]}x{piece.size[1]}')


if __name__ == '__main__':
    main()
