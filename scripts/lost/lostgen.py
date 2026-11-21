"""WORLD 7 の迷路を作る(決まった乱数)。結果は TypeScript の面のデータとして 印刷する。"""
import random, sys, json
from collections import deque

def gen(W, H, seed, braid=0.5, rooms=3, ponds=2, lamps=4, unlit=0, fawns=2, mothers=1, coins=10, golds=2, candles=1, senbei=0, stags=0, stag_len=8):
    rng = random.Random(seed)
    g = [['#'] * W for _ in range(H)]
    cells = [(x, y) for y in range(1, H - 1, 2) for x in range(1, W - 1, 2)]
    # 迷路を掘る
    start = (1, 1)
    g[1][1] = '.'
    stack = [start]; seen = {start}
    while stack:
        x, y = stack[-1]
        nb = [(x + dx, y + dy, dx, dy) for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)) if 0 < x + dx < W - 1 and 0 < y + dy < H - 1 and (x + dx, y + dy) not in seen]
        if not nb: stack.pop(); continue
        nx, ny, dx, dy = rng.choice(nb)
        g[y + dy // 2][x + dx // 2] = '.'; g[ny][nx] = '.'
        seen.add((nx, ny)); stack.append((nx, ny))
    # いちばん下の行は 広場
    for x in range(1, W - 1): g[H - 2][x] = '.'
    def opens(x, y): return [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if g[y + dy][x + dx] == '.']
    # 行き止まりを 一部 つなぐ(輪ができる)
    for (x, y) in cells:
        if g[y][x] == '.' and len(opens(x, y)) == 1 and rng.random() < braid:
            cand = [(dx, dy) for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)) if 0 < x + dx < W - 1 and 0 < y + dy < H - 1 and g[y + dy // 2][x + dx // 2] == '#']
            if cand:
                dx, dy = rng.choice(cand); g[y + dy // 2][x + dx // 2] = '.'
    # 広場(3×3)
    for _ in range(rooms):
        x, y = rng.choice([c for c in cells if 3 <= c[1] <= H - 6 and 2 <= c[0] <= W - 3])
        for yy in range(y - 1, y + 2):
            for xx in range(x - 1, x + 2):
                if 0 < xx < W - 1 and 0 < yy < H - 1: g[yy][xx] = '.'
    # 道からの きょり
    S = (W // 2, H - 2)
    def bfs(src):
        d = {src: 0}; prev = {src: None}; q = deque([src])
        while q:
            p = q.popleft()
            for n in opens(*p):
                if n not in d: d[n] = d[p] + 1; prev[n] = p; q.append(n)
        return d, prev
    dist, _ = bfs(S)
    path_tiles = [p for p in dist]
    used = {S}
    put = {}
    def place(p, ch): put[p] = ch; used.add(p)
    place(S, 'S')
    # お母さん: スタートの 近くの 下の行
    side = rng.choice([-1, 1])
    M = (S[0] + side * 4, H - 2); place(M, 'M')
    far = max(dist.values())
    if mothers > 1:
        cands = [p for p in path_tiles if 0.35 * far <= dist[p] <= 0.55 * far and len(opens(*p)) >= 3 and p not in used]
        if not cands: cands = [p for p in path_tiles if 0.3 * far <= dist[p] <= 0.6 * far and p not in used]
        N = rng.choice(cands); place(N, 'N')
    # 子鹿: 遠い 行き止まり(はなれた所)
    dead = sorted([p for p in path_tiles if len(opens(*p)) == 1 and p not in used], key=lambda p: -dist[p])
    fs = []
    for p in dead:
        if len(fs) >= fawns: break
        if dist[p] < 0.45 * far: continue
        if all(abs(p[0] - q[0]) + abs(p[1] - q[1]) >= 9 for q in fs): fs.append(p)
    if len(fs) < fawns:
        for p in sorted(path_tiles, key=lambda p: -dist[p]):
            if len(fs) >= fawns: break
            if p not in used and all(abs(p[0] - q[0]) + abs(p[1] - q[1]) >= 8 for q in fs): fs.append(p)
    for i, p in enumerate(fs): place(p, 'F' if mothers == 1 or i % 2 == 0 else 'G')
    rest_dead = [p for p in dead if p not in used]
    # プレミアム: 遠い 行き止まり
    if rest_dead: place(rest_dead[0], 'p')
    rest_dead = [p for p in rest_dead if p not in used]
    for p in rest_dead[:golds]: place(p, 'g')
    # ろうそく: 半分くらいの きょり
    mids = [p for p in path_tiles if 0.4 * far <= dist[p] <= 0.7 * far and p not in used]
    rng.shuffle(mids)
    for p in mids[:candles]: place(p, 'o')
    # せんべい: 子鹿から お母さんへの 道の すぐ わき
    if senbei:
        side_tiles = []
        for i, f in enumerate(fs):
            _, prev = bfs(f)
            goal = M if (mothers == 1 or i % 2 == 0) else N
            route = []; p = goal
            while p: route.append(p); p = prev[p]
            rs = set(route)
            for p in route[2:-3]:
                for n in opens(*p):
                    if n not in rs and n not in used and g[n[1]][n[0]] == '.': side_tiles.append(n)
        rng.shuffle(side_tiles)
        k = 0
        for p in side_tiles:
            if k >= senbei: break
            if all(abs(p[0] - q[0]) + abs(p[1] - q[1]) >= 5 for q, ch in put.items() if ch == 's'): place(p, 's'); k += 1
    # コイン
    pt = [p for p in path_tiles if p not in used and dist[p] > 3]
    rng.shuffle(pt)
    k = 0
    for p in pt:
        if k >= coins: break
        if all(abs(p[0] - q[0]) + abs(p[1] - q[1]) >= 3 for q, ch in put.items() if ch == 'c'): place(p, 'c'); k += 1
    # 池: 木の 横ならび(3〜5マス)を 池に(道は 変わらない)
    for _ in range(ponds * 300):
        if ponds <= 0: break
        y = rng.randrange(2, H - 3); x = rng.randrange(2, W - 6); n = rng.randint(3, 5)
        if all(g[y][xx] == '#' for xx in range(x, x + n)) and all(g[yy][xx] != '~' for yy in (y - 1, y, y + 1) for xx in range(x - 1, x + n + 1)):
            for xx in range(x, x + n): g[y][xx] = '~'
            ponds -= 1
    # 石灯籠: 道に 2つ以上 面した 木を 灯籠に(はなして置く)
    def lamp_spots():
        out = []
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if g[y][x] == '#' and len(opens(x, y)) >= 2: out.append((x, y))
        rng.shuffle(out); return out
    lp = []
    for p in lamp_spots():
        if len(lp) >= lamps + unlit: break
        if all(abs(p[0] - q[0]) + abs(p[1] - q[1]) >= 6 for q in lp): lp.append(p)
    # 火の ついていない 灯籠は、遠い方
    lp.sort(key=lambda p: min([dist.get(n, 999) for n in opens(*p)] or [999]))
    for i, p in enumerate(lp): g[p[1]][p[0]] = 'L' if i < lamps else 'l'
    # はしの 下の角にも 灯籠
    for x in (1, W - 2):
        if g[H - 3][x] == '#' and (x, H - 2) not in used: g[H - 2][x] = 'L'
    # 見回りの 大きな鹿: 子鹿から お母さんへの 道の 中ほど
    stag_paths = []
    for si in range(stags):
        f = fs[si % len(fs)]
        _, prev = bfs(f)
        route = []; p = M
        while p: route.append(p); p = prev[p]
        a = int(len(route) * (0.3 + 0.35 * si / max(1, stags)))
        seg = route[a:a + stag_len]
        # まがり角だけ のこす
        wp = [seg[0]]
        for i in range(1, len(seg) - 1):
            if (seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]) != (seg[i + 1][0] - seg[i][0], seg[i + 1][1] - seg[i][1]): wp.append(seg[i])
        wp.append(seg[-1])
        stag_paths.append(wp)
    d2, _ = bfs(S)
    for p in put:
        assert p in d2, ('unreachable', p, put[p])
    for (x, y), ch in put.items(): g[y][x] = ch
    return [''.join(r) for r in g], stag_paths, far

if __name__ == '__main__':
    args = json.loads(sys.argv[1])
    m, st, far = gen(**args)
    print('\n'.join(m)); print('stags', st, 'far', far)
