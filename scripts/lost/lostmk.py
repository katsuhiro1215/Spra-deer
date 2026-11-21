"""WORLD 7 の 7-2〜7-10 の迷路を作り、src/lost/levels.ts の 7-2 以降を 書きかえる。使い方: python3 scripts/lost/lostmk.py(設定は lostcfg.json。同じ設定なら 同じ迷路)"""
import sys, json, re, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lostgen import gen

CFG = json.load(open(os.path.join(HERE, 'lostcfg.json')))
P = os.path.join(HERE, '..', '..', 'src', 'lost', 'levels.ts')
src = open(P).read()

out = []
for c in CFG:
    m, stags, far = gen(**c['gen'])
    meta = c['meta']
    lines = [f"/** {meta['id']} {meta['title']}: {meta['doc']} */", f"const LEVEL_{meta['id'].replace('-', '_')}: LostLevel = {{"]
    lines.append(f"  id: '{meta['id']}', title: '{meta['title']}', summary: '{meta['summary']}',")
    lines.append(f"  intro: '{meta['intro']}',")
    lines.append(f"  lesson: '{meta['lesson']}',")
    extra = ''.join(f", {k}: {json.dumps(v, ensure_ascii=False).replace(chr(34), chr(39))}" for k, v in meta.get('extra', {}).items())
    lines.append(f"  oil: {meta['oil']}, par: {meta['par']}{extra},")
    lines.append('  map: [')
    for r in m: lines.append(f"    '{r}',")
    lines.append('  ],')
    if stags:
        lines.append('  stags: [' + ', '.join('{ path: [' + ', '.join(f'[{x}, {y}]' for x, y in s) + '] }' for s in stags) + '],')
    if meta.get('notes'):
        lines.append('  notes: { ' + ', '.join(f"{k}: '{v}'" for k, v in meta['notes'].items()) + ' },')
    lines.append('};')
    out.append('\n'.join(lines))
    print(meta['id'], 'far', far, file=sys.stderr)

ids = [c['meta']['id'] for c in CFG]
start = src.index('// ---- 7-2 以降(作る道具で作った迷路') if '// ---- 7-2 以降(作る道具で作った迷路' in src else src.index('export const LOST_LEVELS')
end = src.index('export const LOST_LEVELS')
head = src[:start]
body = '// ---- 7-2 以降(作る道具で作った迷路。設計書 35-2。地図を 手で 直しても よい) ----\n\n' + '\n\n'.join(out) + '\n\n'
tail = src[end:]
tail = re.sub(r"export const LOST_LEVELS: LostLevel\[\] = \[[^\]]*\];", 'export const LOST_LEVELS: LostLevel[] = [LEVEL_7_1, ' + ', '.join('LEVEL_' + i.replace('-', '_') for i in ids) + '];', tail)
tail = re.sub(r"export const LOST_PLANNED[^\n]*\n", "export const LOST_PLANNED: { id: string; title: string }[] = Array.from({ length: %d }, (_, i) => ({ id: `7-${i + %d}`, title: '(準備中)' }));\n" % (9 - len(ids), 2 + len(ids)), tail)
open(P, 'w').write(head + body + tail)
print('ok', file=sys.stderr)
