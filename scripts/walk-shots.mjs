// 6方向の歩行を実際のキー入力で再生し、プレイヤー周辺を test-results/walk-*.png に保存する（目視確認用）。
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

await mkdir('test-results', { recursive: true });
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5178/');
await page.waitForFunction(() => window.__DEER__?.mode === 'title');
await page.locator('[data-action="select"]').click();
await page.locator('[data-level="1-1"]').click();
await page.waitForFunction(() => window.__DEER__?.mode === 'playing');
const state = () => page.evaluate(() => window.__DEER__);
const wrap = await page.locator('#game-wrap').boundingBox();
// 画面の中央付近に出るので、プレイヤーが映る範囲だけを切り出す。
const clip = { x: wrap.x + wrap.width * .2, y: wrap.y + wrap.height * .3, width: wrap.width * .6, height: wrap.height * .4 };
const plans = [
  ['up', ['ArrowUp']], ['down', ['ArrowDown']], ['dr', ['ArrowRight', 'ArrowDown']],
  ['dl', ['ArrowLeft', 'ArrowDown']], ['ur', ['ArrowRight', 'ArrowUp']], ['ul', ['ArrowLeft', 'ArrowUp']],
];
for (const [name, keys] of plans) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(260);
  const s = await state();
  await page.screenshot({ path: `test-results/walk-${name}.png`, clip });
  for (const k of keys) await page.keyboard.up(k);
  console.log(name, '→ facing', s.player.facing, 'stride', Math.round(s.player.stride), 'outcome', s.outcome);
  if (s.outcome !== 'playing') break;
  await page.waitForTimeout(120);
}
await browser.close();
