// ステージ2の見た目を test-results/stage2-*.png に保存する（目視確認用）。
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

await mkdir('test-results', { recursive: true });
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const ids = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9', '1-10', '2-1', '2-2'];
const all = { levels: Object.fromEntries(ids.map(id => [id, { best: 20, attempts: 1, clears: 1 }])) };
await context.addInitScript(data => { if (!localStorage.getItem('spra-deer:progress:v1')) localStorage.setItem('spra-deer:progress:v1', JSON.stringify(data)); }, all);
const page = await context.newPage();
page.setDefaultTimeout(120000);
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180/');
await page.waitForFunction(() => window.__DEER__?.mode === 'title');
await page.locator('[data-action="select"]').click();
await page.locator('[data-level="2-1"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: 'test-results/stage2-select.png' });

// 2-2: 届け先の指定と、動かない鹿
await page.locator('[data-level="2-3"]').click();
await page.waitForFunction(() => window.__DEER__?.mode === 'playing' && window.__DEER__.level.id === '2-3');
await page.waitForTimeout(600);
await page.screenshot({ path: 'test-results/stage2-start.png' });
// 鹿が走り出すまで進み、せんべいを置く
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.thieves.some(t => t.state === 'chase'));
await page.keyboard.up('ArrowUp');
await page.keyboard.press('Space');
await page.keyboard.down('ArrowLeft');
await page.waitForFunction(() => window.__DEER__.thieves.some(t => t.state === 'eat'));
await page.keyboard.up('ArrowLeft');
await page.screenshot({ path: 'test-results/stage2-bait.png' });
console.log('thieves:', JSON.stringify(await page.evaluate(() => window.__DEER__.thieves.map(t => [t.id, t.state]))), 'baits left', await page.evaluate(() => window.__DEER__.baitsLeft));
await browser.close();
