// 1-4（追いかける鹿）と 1-5（降ってくるうんこ）の見た目を test-results/devil-*.png に保存する（目視確認用）。
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

await mkdir('test-results', { recursive: true });
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const all = { levels: Object.fromEntries(['1-1', '1-2', '1-3', '1-4'].map(id => [id, { best: 20, attempts: 1, clears: 1 }])) };
await context.addInitScript(data => { if (!localStorage.getItem('spra-deer:progress:v1')) localStorage.setItem('spra-deer:progress:v1', JSON.stringify(data)); }, all);
const page = await context.newPage();
page.setDefaultTimeout(120000);
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180/');
await page.waitForFunction(() => window.__DEER__?.mode === 'title');
await page.locator('[data-action="select"]').click();
await page.screenshot({ path: 'test-results/devil-select.png' });

await page.locator('[data-level="1-4"]').click();
await page.waitForFunction(() => window.__DEER__?.mode === 'playing');
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.chasers.some(c => c.state === 'chase') && window.__DEER__.player.y < 3200);
await page.waitForTimeout(500);
await page.screenshot({ path: 'test-results/devil-chaser.png' });
await page.keyboard.up('ArrowUp');
await page.keyboard.press('Escape');
await page.locator('[data-action="select"]').click();

await page.locator('[data-level="1-5"]').click();
await page.waitForFunction(() => window.__DEER__?.mode === 'playing' && window.__DEER__.level.id === '1-5');
// 越えてから降るので、跳ぶ位置まで右へ寄って進む
await page.keyboard.down('ArrowRight');
await page.waitForFunction(() => window.__DEER__.player.x >= 470);
await page.keyboard.up('ArrowRight'); await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.player.y <= 3130);
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__DEER__.jumps === 1 && window.__DEER__.player.height === 0 && window.__DEER__.player.y < 3000);
await page.waitForFunction(() => window.__DEER__.rain.some(r => r.state === 'warn'));
await page.screenshot({ path: 'test-results/devil-rain.png' });
console.log('rain:', JSON.stringify((await page.evaluate(() => window.__DEER__.rain.map(r => r.state)))));
await browser.close();
