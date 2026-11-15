"""3D走りゲーム(ステージ3)の名所・アイテムの絵を、ゲーム用に切り抜いて縮小する。

使い方: python3 scripts/build-landmarks.py
- 原本: rooms/Spra/assets/deer/ (無加工のまま。ここでは読むだけ)
- 出力: public/assets/runner/landmarks/<名前>.webp と、縦横比の一覧 src/runner/landmarks.ts
- 空が描かれた絵(sky=True)は、上の端から、色が少しずつ変わる所をたどって、空を透明にする
"""
import os
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser('~/SmartSprouts/rooms/Spra/assets/deer')
if not os.path.isdir(SRC):
    SRC = '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/assets/deer'
OUT = os.path.join(ROOT, 'public/assets/runner/landmarks')
TS = os.path.join(ROOT, 'src/runner/landmarks.ts')

# 名前: (原本のファイル名, 最大の辺[px], 空を消すか, 雪の色にするか)
ITEMS = {
    'todaiji-hall': ('伝統的な東大寺風大仏殿正面.png', 1024, False, False),
    'nandaimon': ('精巧な南大門風寺院ゲート-1.png', 1024, False, False),
    'kofukuji-pagoda': ('金色の五重塔、透明背景レンダー.png', 1024, False, False),
    'yakushiji-pagoda': ('鮮やかな三重塔の精巧な3Dイラスト.png', 1024, False, False),
    'toshodaiji-hall': ('唐招提寺金堂の正面建築.png', 1024, False, False),
    'horyuji': ('法隆寺風の五重塔と金堂.png', 1024, False, False),
    'omiwa-snow': ('雪灯りの冬神社鳥居.png', 1024, False, False),
    'zaodo': ('紅葉に彩られた壮麗な寺院門前.png', 1024, False, False),
    'koriyama-castle': ('春の郡山城と桜 दृश्य.png', 1024, True, False),
    'suzakumon': ('朱雀門の壮麗な正面図-2.png', 1024, False, False),
    'potion': ('魔法のハート回復ポーション-1.png', 256, False, False),
    'sakura-tree': ('満開の桜と舞い散る花びら.png', 512, False, False),
    'maple-tree': ('鮮やかな秋の紅葉メープルツリー.png', 512, False, False),
    'ikoma': ('生駒山の放送塔と雲海.png', 1600, True, False),
    'osaka-skyline': ('夕焼けに映える大阪の街並み.png', 1600, True, False),
    'fake-senbei': ('鹿印のくしゃくしゃ包み紙.png', 256, False, False),
    'kasuga': ('春日大社風朱塗り楼門と灯籠回廊.png', 1400, False, False),
    'osaka-bay': ('夕焼け港の観覧車と大橋.png', 2048, False, False),
    'train': ('温もりの二両編成電車.png', 1400, False, False),
}


def remove_sky(im: Image.Image, tol: int = 22) -> Image.Image:
    """上の端から、となりとの色の差が小さい所をたどって、空を透明にする。"""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0))
        seen[x] = 1
    while q:
        x, y = q.popleft()
        r, g, b, _ = px[x, y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                r2, g2, b2, a2 = px[nx, ny]
                if abs(r - r2) + abs(g - g2) + abs(b - b2) < tol:
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))
    out = im.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            if seen[y * w + x]:
                r, g, b, _ = op[x, y]
                op[x, y] = (r, g, b, 0)
    # ふちを1画素ぼかす(空と接する所を半透明に)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if not seen[y * w + x]:
                n = seen[y * w + x - 1] + seen[y * w + x + 1] + seen[(y - 1) * w + x] + seen[(y + 1) * w + x]
                if n:
                    r, g, b, a = op[x, y]
                    op[x, y] = (r, g, b, int(a * (1 - 0.18 * n)))
    return out


def drop_specks(im: Image.Image, frac: float = 0.004) -> Image.Image:
    """空を消したあとに残った、雲のふち・花びらなどの小さなかけらを消す(全体の frac より小さいまとまり)。"""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    small = []
    limit = int(w * h * frac)
    for sy in range(h):
        for sx in range(w):
            i = sy * w + sx
            if seen[i] or px[sx, sy][3] <= 16:
                continue
            comp = [(sx, sy)]
            seen[i] = 1
            k = 0
            while k < len(comp):
                x, y = comp[k]
                k += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] > 16:
                        seen[ny * w + nx] = 1
                        comp.append((nx, ny))
            if len(comp) < limit:
                small.extend(comp)
    for x, y in small:
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
    return im


def snowify(im: Image.Image) -> Image.Image:
    """緑の森・山に雪がつもった色にする(赤い鳥居・しめ縄はそのまま)。"""
    out = im.copy()
    op = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = op[x, y]
            if a and g > r + 8 and g >= b:
                light = (r + g + b) / 765
                k = 0.45 + 0.4 * light  # 明るい葉ほど白く
                op[x, y] = (int(r + (236 - r) * k), int(g + (243 - g) * k), int(b + (250 - b) * k), a)
    return out


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    sizes = {}
    for name, (fn, maxside, sky, snow) in ITEMS.items():
        im = Image.open(os.path.join(SRC, fn)).convert('RGBA')
        im.thumbnail((maxside, maxside), Image.LANCZOS)
        if sky:
            im = drop_specks(remove_sky(im))
        if snow:
            im = snowify(im)
        bbox = im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
        im.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=88, method=6)
        sizes[name] = im.size
        print(f'{name}: {im.size[0]}x{im.size[1]}  {os.path.getsize(os.path.join(OUT, name + ".webp")) // 1024}KB')
    lines = [
        '// scripts/build-landmarks.py が作る。名所・アイテムの絵(public/assets/runner/landmarks/<名前>.webp)の縦横比。',
        '// 手で書きかえない(絵を差しかえたら、スクリプトを流し直す)。',
        'export const LANDMARK_ASPECT: Record<string, number> = {',
    ]
    for name, (w, h) in sizes.items():
        lines.append(f"  '{name}': {w / h:.4f},")
    lines.append('};')
    with open(TS, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
