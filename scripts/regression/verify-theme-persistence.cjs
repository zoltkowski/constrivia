const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const output = path.resolve(__dirname, '../../output/playwright/theme-persistence');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'profile-'));
const result = { checks: [], errors: [] };

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5230, strictPort: true } });
  await server.listen();
  let context;
  const launch = async () => {
    context = await chromium.launchPersistentContext(profile, {
      channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
      headless: true,
      viewport: { width: 1100, height: 850 },
      serviceWorkers: 'block'
    });
    const page = context.pages()[0];
    page.on('pageerror', error => result.errors.push(error.message));
    await page.goto('http://127.0.0.1:5230/', { waitUntil: 'networkidle' });
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    return page;
  };
  const verify = async (page, theme, name) => {
    const state = await page.evaluate(() => ({
      body: document.body.className,
      root: document.documentElement.className,
      stored: localStorage.getItem('geometry.theme'),
      pressed: document.getElementById('themeDark').getAttribute('aria-pressed'),
      active: document.getElementById('themeDark').classList.contains('active')
    }));
    assert.ok(state.body.split(' ').includes(`theme-${theme}`), `${name}: body ${JSON.stringify(state)}`);
    assert.ok(state.root.split(' ').includes(`theme-${theme}`), `${name}: root`);
    assert.equal(state.stored, theme, `${name}: storage`);
    assert.equal(state.pressed, String(theme === 'dark'), `${name}: pressed`);
    assert.equal(state.active, theme === 'dark', `${name}: active`);
    result.checks.push(name);
  };
  const toggle = async page => {
    if (!await page.locator('#themeDark').isVisible()) await page.locator('#zoomMenu').click();
    await page.locator('#themeDark').click();
  };
  try {
    let page = await launch();
    await verify(page, 'dark', 'First launch uses dark mode');
    await page.evaluate(() => localStorage.setItem('geometry.theme', 'light'));
    await page.reload({ waitUntil: 'networkidle' });
    await verify(page, 'light', 'Startup restores a previously saved light theme');
    await toggle(page);
    await verify(page, 'dark', 'Toggle immediately synchronizes dark mode and its button');
    await toggle(page);
    await verify(page, 'light', 'Toggle immediately synchronizes light mode and its button');
    await page.reload({ waitUntil: 'networkidle' });
    await verify(page, 'light', 'Light mode survives reload');
    await context.close();
    page = await launch();
    await verify(page, 'light', 'Light mode survives closing and reopening the browser');
    await toggle(page);
    await verify(page, 'dark', 'Restored light mode toggles back to dark');
    await context.close();
    page = await launch();
    await verify(page, 'dark', 'Dark mode survives closing and reopening the browser');
    await page.evaluate(() => localStorage.setItem('geometry.theme', 'invalid'));
    await page.reload({ waitUntil: 'networkidle' });
    await verify(page, 'dark', 'Invalid stored theme safely falls back to dark');
    assert.deepEqual(result.errors, [], 'No browser exceptions');
  } catch (error) {
    result.errors.push(error.stack || String(error));
    process.exitCode = 1;
  } finally {
    await context?.close();
    await server.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
