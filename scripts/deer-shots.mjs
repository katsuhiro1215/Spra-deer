// 1-3 を開き、鹿が止まって予告している瞬間と、落とした直後を test-results/deer-*.png に保存する（目視確認用）。
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

await mkdir('test-results', { recursive: true });
const cached = `${homedir()}/.cache/ms-playwright/chromium-1248/chrome-linux-arm64/chrome`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(cached) ? cached : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const unlock = { levels: { '1-1': { best: 20, attempts: 1, clears: 1 }, '1-2': { best: 25, attempts: 1, clears: 1 } } };
await context.addInitScript(data => { if (!localStorage.getItem('spra-deer:progress:v1')) localStorage.setItem('spra-deer:progress:v1', JSON.stringify(data)); }, unlock);
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5180/');
await page.waitForFunction(() => window.__DEER__?.mode === 'title');
await page.locator('[data-action="select"]').click();
await page.locator('[data-level="1-3"]').click();
await page.waitForFunction(() => window.__DEER__?.mode === 'playing');
// 鹿の道（y=1880）が映る所まで、まっすぐ進む。
await page.keyboard.down('ArrowUp');
await page.waitForFunction(() => window.__DEER__.player.y < 2060 || window.__DEER__.outcome !== 'playing');
await page.keyboard.up('ArrowUp');
await page.waitForFunction(() => window.__DEER__.deers.some(d => d.state === 'warn'), null, { timeout: 15000 });
await page.screenshot({ path: 'test-results/deer-warning.png' });
await page.waitForFunction(() => window.__DEER__.deers.some(d => d.dropped > 0), null, { timeout: 5000 });
await page.waitForTimeout(150);
await page.screenshot({ path: 'test-results/deer-dropped.png' });
const s = await page.evaluate(() => window.__DEER__);
console.log('deers', s.deers.map(d => `${d.id}:${d.state}:${d.dropped}`).join(' '), 'poops', s.poops.length, 'outcome', s.outcome, 'errors', errors.length);
await browser.close();
