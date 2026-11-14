"""動物・モンスターのステッカーシート(Mascot)を、ポーズごとの透明PNGに切り出す。
原本(rooms/Spra/Mascot)は無加工のまま、public/assets/runner/critters/<名前>_<番号>.png に出力する。
使い方: python3 scripts/build-critters.py [--montage 出力.png]   (Pillow だけで動く)
番号は、シート内の並び(左上→右下)。どの番号がどのポーズかは src/runner/critters.ts に書く。

シートは「縦×横の升目」にポーズが並んでいる。升目の線が絵を切らない分け方を、自動で選ぶ。
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter

MASCOT = os.environ.get('MASCOT_DIR', '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/Mascot')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'runner', 'critters')
HEIGHT = 320  # 出力するポーズの高さ(px)
STEP = 4  # 升目さがしの粗さ

# 名前 → Mascot 内のフォルダ
CRITTERS = {
    'kage': '306_Kage', 'owl': '218_owl', 'fox': '214_fox', 'pachi': '311_Pachi',
    'puni': '301_Puni', 'doro': '312_Doro', 'noko': '308_Noko', 'turtle': '229_', 'bubu': '307_Bubu',
    'snowy': '313_Snowy', 'frosty': '315_Frosty', 'gingi': '314_Gingi', 'rabbit': '216_rabit', 'candi': '318_Candi',
    'bear': '219_bear', 'tanuki': '215_tanuki', 'squirrel': '217_squirrel', 'koron': '302_Koron', 'goro': '309_Goro', 'toge': '304_Toge',
}
# 自動で升目を取り違えるシートは、ここで指定する(横の数, 縦の数)
GRID_OVERRIDE = {'pachi': (3, 2), 'noko': (3, 2), 'snowy': (3, 2), 'frosty': (3, 2), 'candi': (3, 2), 'rabbit': (2, 3)}
# (横の数, 縦の数) の候補
GRIDS = [(3, 2), (2, 3), (2, 2), (3, 3), (4, 2), (2, 4), (3, 1), (1, 3), (4, 1), (5, 1), (4, 3), (3, 4)]


def find_sheet(folder):
    d = os.path.join(MASCOT, folder)
    files = sorted(f for f in os.listdir(d) if f.lower().endswith('.png'))
    return os.path.join(d, files[0])


def grid_cost(bits, sw, sh, cols, rows):
    """升目の線の上にある、濃い画素の数(少ないほど、絵を切っていない)。"""
    cost = 0
    for k in range(1, cols):
        x = k * sw // cols
        for y in range(sh):
            for dx in (-1, 0, 1):
                if 0 <= x + dx < sw and bits[x + dx, y]:
                    cost += 1
    for k in range(1, rows):
        y = k * sh // rows
        for x in range(sw):
            for dy in (-1, 0, 1):
                if 0 <= y + dy < sh and bits[x, y + dy]:
                    cost += 1
    return cost


def pick_grid(im):
    w, h = im.size
    small = im.split()[3].resize((w // STEP, h // STEP), Image.BOX).point(lambda v: 255 if v > 110 else 0)
    sw, sh = small.size
    bits = small.load()
    best = None
    for cols, rows in GRIDS:
        cost = grid_cost(bits, sw, sh, cols, rows)
        # 同じくらい良いなら、ポーズの数が多い分け方を選ぶ
        score = cost - 0.02 * cols * rows * (sw + sh)
        if best is None or score < best[0]:
            best = (score, cols, rows)
    return best[1], best[2]


def drop_spill(piece):
    """絵の本体いがいで、升目の縁に接しているかたまり(隣のポーズの切れ端)を消す。"""
    w, h = piece.size
    a = piece.split()[3]
    small = a.resize((max(1, w // 4), max(1, h // 4)), Image.BOX).point(lambda v: 255 if v > 110 else 0)
    sw, sh = small.size
    px = small.load()
    seen = [[False] * sw for _ in range(sh)]
    comps = []
    for y in range(sh):
        for x in range(sw):
            if px[x, y] and not seen[y][x]:
                stack = [(x, y)]
                seen[y][x] = True
                cells = []
                while stack:
                    cx, cy = stack.pop()
                    cells.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < sw and 0 <= ny < sh and px[nx, ny] and not seen[ny][nx]:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
                comps.append(cells)
    if len(comps) <= 1:
        return piece
    main = max(comps, key=len)
    keep = Image.new('L', (sw, sh), 0)
    kp = keep.load()
    for cells in comps:
        xs = [c[0] for c in cells]
        ys = [c[1] for c in cells]
        touches = min(xs) <= 1 or min(ys) <= 1 or max(xs) >= sw - 2 or max(ys) >= sh - 2
        if cells is main or not touches:
            for cx, cy in cells:
                kp[cx, cy] = 255
    keep = keep.filter(ImageFilter.MaxFilter(5)).resize((w, h), Image.NEAREST)
    piece = piece.copy()
    piece.putalpha(Image.composite(a, Image.new('L', a.size, 0), keep))
    return piece


def clean(piece):
    """うすい縁・光のにじみを消し、絵の外枠でトリミングし、高さをそろえる。"""
    a = piece.split()[3].point(lambda v: 0 if v < 110 else 255 if v > 200 else v)
    a = a.filter(ImageFilter.MinFilter(3))  # 赤・黄色の縁を、1px内側へ
    piece.putalpha(a)
    piece = drop_spill(piece)
    bb = piece.split()[3].point(lambda v: 255 if v > 150 else 0).getbbox()
    if not bb:
        return None
    piece = piece.crop(bb)
    scale = HEIGHT / piece.height
    return piece.resize((max(1, round(piece.width * scale)), HEIGHT), Image.LANCZOS)


def split_poses(im, key=None):
    im = im.convert('RGBA')
    w, h = im.size
    cols, rows = GRID_OVERRIDE.get(key) or pick_grid(im)
    poses = []
    for r in range(rows):
        for c in range(cols):
            cell = im.crop((c * w // cols, r * h // rows, (c + 1) * w // cols, (r + 1) * h // rows))
            p = clean(cell)
            if p is not None and p.width > 40:
                poses.append(p)
    return poses, (cols, rows)


def main():
    montage = None
    if '--montage' in sys.argv:
        montage = sys.argv[sys.argv.index('--montage') + 1]
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    rows = []
    for key, folder in CRITTERS.items():
        poses, grid = split_poses(Image.open(find_sheet(folder)), key)
        for i, p in enumerate(poses):
            p.save(os.path.join(OUT, f'{key}_{i}.png'), optimize=True)
        print(f'{key}: {grid[0]}x{grid[1]} {len(poses)}ポーズ', [p.size for p in poses])
        rows.append((key, poses))
    if montage:
        th = 130
        wcol = 140
        img = Image.new('RGB', (80 + 7 * wcol, th * len(rows)), (120, 150, 120))
        d = ImageDraw.Draw(img)
        for r, (key, poses) in enumerate(rows):
            d.text((6, r * th + 6), key, fill=(255, 255, 255))
            for i, p in enumerate(poses[:7]):
                t = p.copy()
                t.thumbnail((wcol - 10, th - 18))
                img.paste(t, (80 + i * wcol + 4, r * th + 14), t)
                d.text((80 + i * wcol + 4, r * th + 2), str(i), fill=(255, 255, 0))
        img.save(montage)


if __name__ == '__main__':
    main()
