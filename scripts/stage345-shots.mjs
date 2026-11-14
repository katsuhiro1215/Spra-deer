// ステージ3・4・5の見た目を test-results/s345-*.png に保存する（目視確認用）。
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

await mkdir('test-results', { recursive: true });
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
page.setDefaultTimeout(120000);
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180/');
await page.waitForFunction(() => window.__DEER__?.mode === 'title');

const open = async id => {
  const toSelect = page.locator('.title-screen [data-action="select"]');
  if (await toSelect.count()) await toSelect.click();
  await page.locator(`[data-level="${id}"]`).click();
  await page.waitForFunction(i => window.__DEER__?.mode === 'playing' && window.__DEER__.level.id === i, id);
  await page.waitForTimeout(500);
};
const back = async () => { await page.keyboard.press('Escape'); await page.locator('[data-action="select"]').click(); };

await page.locator('[data-action="select"]').click();
await page.screenshot({ path: 'test-results/s345-select.png', fullPage: true });
await page.locator('[data-action="title"]').click();

// ステージ3は3D走り(/run/)、ステージ5は保留。ここでは、ステージ4(掃除・仮)のスタートの見た目だけ撮る
await open('4-1');
await page.screenshot({ path: 'test-results/s345-4-1-start.png' });
await browser.close();
