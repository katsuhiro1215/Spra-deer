"""スプライト切り出しの共通部品（Pillowのみ）。"""
from PIL import Image, ImageChops, ImageFilter

ALPHA_MIN = 24  # これ以下の薄い画素は、大きさの測定に使わない


def visible_bbox(im):
    return im.getchannel('A').point(lambda v: 255 if v > ALPHA_MIN else 0).getbbox()


def remove_specks(im, min_area=600, grow=3):
    """本体から離れた小さな島（背景除去の残りの色点）を消す。
    不透明な画素のつながりを数え、min_area 未満のかたまりを透明にする。
    本体の縁のやわらかい半透明部分を残すため、残すかたまりは grow px だけ広げて判定する。"""
    w, h = im.size
    alpha = im.getchannel('A')
    mask = bytearray(1 if v > ALPHA_MIN else 0 for v in alpha.getdata())
    seen = bytearray(w * h)
    keep = bytearray(w * h)
    for start in range(w * h):
        if not mask[start] or seen[start]:
            continue
        stack, comp = [start], []
        seen[start] = 1
        while stack:
            p = stack.pop()
            comp.append(p)
            x = p % w
            for q in (p - 1 if x > 0 else -1, p + 1 if x < w - 1 else -1, p - w, p + w):
                if 0 <= q < w * h and mask[q] and not seen[q]:
                    seen[q] = 1
                    stack.append(q)
        if len(comp) >= min_area:
            for p in comp:
                keep[p] = 255
    keep_img = Image.frombytes('L', (w, h), bytes(keep)).filter(ImageFilter.MaxFilter(grow * 2 + 1))
    out = im.copy()
    out.putalpha(ImageChops.darker(alpha, keep_img))
    return out


def union_crop(frames, pad=2):
    """各コマの不透明部分の和集合の枠で切り出す。下端は足元なので余白を足さない。"""
    boxes = [visible_bbox(f) for f in frames]
    left, top = min(b[0] for b in boxes) - pad, min(b[1] for b in boxes) - pad
    right, bottom = max(b[2] for b in boxes) + pad, max(b[3] for b in boxes)
    return [f.crop((max(0, left), max(0, top), min(f.width, right), min(f.height, bottom))) for f in frames]


def split_strip(im, count=4):
    cell = im.width // count
    return [im.crop((i * cell, 0, (i + 1) * cell, im.height)) for i in range(count)]
