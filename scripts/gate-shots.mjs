// スタートゲート・10面の選択画面・壁の前後関係を test-results/gate-*.png に保存する（目視確認用）。
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

await mkdir('test-results', { recursive: true });
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const all = { levels: Object.fromEntries(['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '1-9'].map(id => [id, { best: 20, attempts: 1, clears: 1 }])) };
await context.addInitScript(data => { if (!localStorage.getItem('spra-deer:progress:v1')) localStorage.setItem('spra-deer:progress:v1', JSON.stringify(data)); }, all);
const page = await context.newPage();
page.setDefaultTimeout(120000);
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180/');
await page.waitForFunction(() => window.__DEER__?.mode === 'title');
await page.locator('[data-action="select"]').click();
await page.screenshot({ path: 'test-results/gate-select.png', fullPage: true });

await page.locator('[data-level="1-3"]').click();
await page.waitForFunction(() => window.__DEER__?.mode === 'playing');
await page.waitForTimeout(800);
await page.screenshot({ path: 'test-results/gate-start.png' });
// 壁が出るところまで進み、壁の手前で止まる
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.walls.some(w => w.state !== 'idle'));
await page.waitForTimeout(150);
await page.keyboard.up('ArrowUp');
await page.screenshot({ path: 'test-results/gate-wall.png' });
console.log('walls:', JSON.stringify(await page.evaluate(() => window.__DEER__.walls.map(w => [w.id, w.state, Math.round(w.progress * 100)]))));
await browser.close();
