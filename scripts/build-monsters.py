"""十二星座のモンスター(WORLD 8 の追いかけっこで、線路に出てくる敵)を、シートから1体ずつ切り出す。
原本: rooms/Spra/assets/deer/darkdeer/NN_○○座モンスターズ.png(1774×887・透明。2段×5体。無加工のまま、ここでは読むだけ)
出力: public/assets/cart/monsters/NN-C.webp(NN=星座の番号 01〜12、C=シートの中の番号 0〜9。左上から右へ、上の段が 0〜4)
使い方: python3 scripts/build-monsters.py   (Pillow だけで動く)

切り出し方: 濃い所(不透明)を つながりごとに分け、重心がある枠(5列×2段)の子に入れる。
武器が となりの枠に はみ出していても、体と つながっていれば いっしょに入る。
小さな はなれた点(背景を消したときの 赤い ちり)は 捨てる。光のふち(半透明)は 少し広げて 残す。
"""
import glob
import os
from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/assets/deer/darkdeer'
OUT = os.path.join(HERE, '..', 'public', 'assets', 'cart', 'monsters')
COLS, ROWS = 5, 2
HEIGHT = 256  # 出力の高さ(px)。線路の上で 2m ほどの大きさなので これで足りる
SOLID = 200  # この濃さより上を「体」と見なす(光のふちは 入れない)
MIN_AREA = 120  # これより小さい かたまり(半分の大きさで数えた px)は ちり


def label(mask: Image.Image):
    """白い所を、8方向の つながりごとに分ける。[(面積, 重心x, 重心y, 点の一覧)]"""
    w, h = mask.size
    px = mask.tobytes()
    seen = bytearray(w * h)
    parts = []
    for start in range(w * h):
        if not px[start] or seen[start]:
            continue
        seen[start] = 1
        q = deque([start])
        pts = []
        while q:
            i = q.popleft()
            pts.append(i)
            x, y = i % w, i // w
            for dy in (-1, 0, 1):
                yy = y + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if xx < 0 or xx >= w:
                        continue
                    j = yy * w + xx
                    if px[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        n = len(pts)
        cx = sum(i % w for i in pts) / n
        cy = sum(i // w for i in pts) / n
        parts.append((n, cx, cy, pts))
    return parts


def cut_sheet(path: str, num: str) -> list:
    sheet = Image.open(path).convert('RGBA')
    W, H = sheet.size
    alpha = sheet.getchannel('A')
    # 半分の大きさで数える(速さのため)
    small = alpha.point(lambda a: 255 if a > SOLID else 0).resize((W // 2, H // 2), Image.NEAREST)
    sw, sh = small.size
    cells = {c: [] for c in range(COLS * ROWS)}
    for n, cx, cy, pts in label(small):
        if n < MIN_AREA:
            continue
        col = min(COLS - 1, int(cx / (sw / COLS)))
        row = min(ROWS - 1, int(cy / (sh / ROWS)))
        cells[row * COLS + col].append(pts)
    out = []
    for c, groups in cells.items():
        keep_s = Image.new('L', (sw, sh), 0)
        buf = bytearray(sw * sh)
        for pts in groups:
            for i in pts:
                buf[i] = 255
        keep_s.frombytes(bytes(buf))
        # もとの大きさに戻し、光のふちのぶん 広げる
        keep = keep_s.resize((W, H), Image.NEAREST).filter(ImageFilter.MaxFilter(11))
        a = ImageChops.multiply(alpha, keep.point(lambda v: 255 if v else 0))
        a = a.point(lambda v: 0 if v < 24 else v)
        bbox = a.getbbox()
        if not bbox:
            raise SystemExit(f'{num}-{c}: 何も ない')
        x0, y0, x1, y1 = bbox
        pad = 6
        box = (max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))
        piece = sheet.crop(box)
        piece.putalpha(a.crop(box))
        if piece.height > HEIGHT:
            piece = piece.resize((round(piece.width * HEIGHT / piece.height), HEIGHT), Image.LANCZOS)
        name = f'{num}-{c}.webp'
        piece.save(os.path.join(OUT, name), 'WEBP', quality=86, method=6)
        out.append((name, piece))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(os.path.join(SRC, '[0-9][0-9]_*モンスターズ.png')))
    if len(files) != 12:
        raise SystemExit(f'シートが 12枚 ない: {len(files)}')
    allp = []
    for f in files:
        num = os.path.basename(f)[:2]
        allp.append(cut_sheet(f, num))
        print(num, 'ok')
    # 確かめ用の一覧(リポジトリには入れない)
    tile = 150
    board = Image.new('RGBA', (tile * 10, tile * 12), (60, 70, 60, 255))
    d = ImageDraw.Draw(board)
    for r, row in enumerate(allp):
        for c, (name, p) in enumerate(row):
            k = min((tile - 6) / p.width, (tile - 16) / p.height)
            im = p.resize((max(1, int(p.width * k)), max(1, int(p.height * k))))
            board.alpha_composite(im, (c * tile + 3, r * tile + 14))
            d.text((c * tile + 3, r * tile + 1), name, fill=(255, 255, 255, 255))
    board.convert('RGB').save('/tmp/pshots/monsters-board.png')
    print('board: /tmp/pshots/monsters-board.png')


if __name__ == '__main__':
    main()
