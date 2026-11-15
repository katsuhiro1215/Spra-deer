// 3D走りの各面の「重さ」を測る: 1フレームの描画命令の数(draw calls)・三角形の数・頂点の数・メモリ上の形とテクスチャの数。
// 使い方: node scripts/perf-runner.mjs [http://localhost:5180]  (npm run dev を起動しておく)
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const base = process.argv[2] ?? 'http://localhost:5180';
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const rows = [];
for (let n = 1; n <= 10; n++) {
  const id = `3-${n}`;
  await page.goto(`${base}/run/?level=${id}`);
  await page.waitForFunction(() => !!window.__kasuga, null, { timeout: 60000 });
  await page.click('[data-ks="go"]');
  // コースの何か所かで測る(いちばん重い所を残す)
  const r = await page.evaluate(async () => {
    const k = window.__kasuga;
    const ren = k.view.renderer ?? k.view.r;
    let worst = { calls: 0, triangles: 0 };
    let frames = 0;
    let t0 = performance.now();
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9, 0.98]) {
      k.run.s = k.course.length * f;
      k.run.invuln = 99;
      await new Promise((res) => setTimeout(res, 400));
      const info = ren.info.render;
      if (info.calls > worst.calls) worst = { calls: info.calls, triangles: info.triangles, at: f };
    }
    const fpsStart = performance.now();
    await new Promise((res) => {
      const loop = () => { frames++; if (performance.now() - fpsStart < 2000) requestAnimationFrame(loop); else res(); };
      requestAnimationFrame(loop);
    });
    return { ...worst, geometries: ren.info.memory.geometries, textures: ren.info.memory.textures, fps: Math.round(frames / 2) };
  });
  rows.push({ id, ...r });
  console.log(id, JSON.stringify(r));
}
await browser.close();
