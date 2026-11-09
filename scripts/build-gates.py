"""スタート／ゴールのゲート画像を、ゲーム用の透過PNGにする。

元画像は rooms/Spra/assets/deer/ にある（ChatGPT生成。背景に光彩が焼き込まれている）。
 - スタート: 黒背景。明るさでキーを抜く。
 - ゴール:   白〜灰色背景。彩度の低い領域を、外周から広げて消す。
元画像は変更しない。出力は public/assets/gate/{start,goal}.png（幅720に縮小）。
"""
import glob, os
from collections import deque
from PIL import Image, ImageFilter

SRC = '/mnt/c/Users/katsu/SmartSprouts/rooms/Spra/assets/deer/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'gate') + '/'
os.makedirs(OUT, exist_ok=True)
start_f = [f for f in glob.glob(SRC + '*.png') if 'スタート' in f][0]
goal_f = [f for f in glob.glob(SRC + '*.png') if 'ゴール' in f][0]
LO, HI, CHROMA, WIDTH = 150, 215, 75, 720


def finish(im, name):
    bb = im.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
    l, t, r, b = bb
    im = im.crop((max(0, l - 6), max(0, t - 6), min(im.width, r + 6), min(im.height, b + 6)))
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    im.save(OUT + name, optimize=True)
    print(name, im.size)


# スタート
im = Image.open(start_f).convert('RGB'); px = im.load(); w, h = im.size
a = Image.new('L', (w, h)); ap = a.load()
for y in range(h):
    for x in range(w):
        v = max(px[x, y])
        ap[x, y] = int(255 * min(1, max(0, (v - LO) / (HI - LO))))
out = im.convert('RGBA'); out.putalpha(a.filter(ImageFilter.MedianFilter(3)))
finish(out, 'start.png')

# ゴール
im = Image.open(goal_f).convert('RGB'); px = im.load(); w, h = im.size
def lowsat(x, y):
    r, g, b = px[x, y]
    return max(r, g, b) - min(r, g, b) < CHROMA
bg = bytearray(w * h); dq = deque()
for x in range(w):
    for y in (0, h - 1):
        if lowsat(x, y): dq.append((x, y)); bg[y * w + x] = 1
for y in range(h):
    for x in (0, w - 1):
        if lowsat(x, y) and not bg[y * w + x]: dq.append((x, y)); bg[y * w + x] = 1
while dq:
    x, y = dq.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx] and lowsat(nx, ny):
            bg[ny * w + nx] = 1; dq.append((nx, ny))
m = Image.frombytes('L', (w, h), bytes(0 if v else 255 for v in bg)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert('RGBA'); out.putalpha(m)
finish(out, 'goal.png')
