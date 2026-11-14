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

// 3-1: 掃除（触れると掃ける）。スタートの見た目だけ
await open('3-1');
await page.screenshot({ path: 'test-results/s345-3-1-start.png' });
await back();

// 4-1: 横断。ボタンなし
await open('4-1');
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.player.y < 3150 || window.__DEER__.outcome !== 'playing');
await page.keyboard.up('ArrowUp');
await page.screenshot({ path: 'test-results/s345-4-1.png' });
console.log('4-1 jump button hidden:', await page.evaluate(() => getComputedStyle(document.getElementById('jump')).visibility));
await page.keyboard.press('Escape'); await page.locator('[data-action="select"]').click();

// 5-1: 迷子の子鹿を見つける
await open('5-1');
await page.screenshot({ path: 'test-results/s345-5-1-start.png' });
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.player.y < 3000);
await page.keyboard.up('ArrowUp');
await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.follower?.state === 'follow' || window.__DEER__.outcome !== 'playing');
await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
await page.waitForTimeout(200);
await page.screenshot({ path: 'test-results/s345-5-1-found.png' });
console.log('5-1 follower:', await page.evaluate(() => window.__DEER__.follower?.state), 'outcome', await page.evaluate(() => window.__DEER__.outcome));
await browser.close();
