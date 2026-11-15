// 3D走りの1つの面で、三角形の多いものを並べる(重さの原因さがし)。
// 使い方: node scripts/perf-breakdown.mjs 3-10 [http://localhost:5180]  (npm run dev を起動しておく)
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const id = process.argv[2] ?? '3-10';
const base = process.argv[3] ?? 'http://localhost:5180';
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${base}/run/?level=${id}`);
await page.waitForFunction(() => !!window.__kasuga, null, { timeout: 60000 });
const out = await page.evaluate(() => {
  const scene = window.__kasuga.view.scene;
  const rows = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    let name = o.name || o.geometry.type;
    let p = o.parent;
    while (p && !p.name && p.parent) p = p.parent;
    if (p?.name) name = `${p.name}/${name}`;
    rows.push({ name, tris: tris * n, per: tris, n, shadow: o.castShadow });
  });
  const by = new Map();
  for (const r of rows) {
    const k = `${r.name} per=${r.per}${r.shadow ? ' 影' : ''}`;
    const e = by.get(k) ?? { k, tris: 0, count: 0 };
    e.tris += r.tris;
    e.count += r.n;
    by.set(k, e);
  }
  const all = [...by.values()].sort((a, b) => b.tris - a.tris);
  const total = rows.reduce((a, r) => a + r.tris, 0);
  const shadow = rows.filter((r) => r.shadow).reduce((a, r) => a + r.tris, 0);
  return { total, shadow, top: all.slice(0, 15) };
});
console.log(`${id}: 全部 ${out.total} 三角形(影を落とすもの ${out.shadow})`);
for (const r of out.top) console.log(String(r.tris).padStart(8), String(r.count).padStart(6), r.k);
await browser.close();
