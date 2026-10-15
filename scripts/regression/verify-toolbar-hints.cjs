const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const output = path.resolve(__dirname, '../../output/playwright/toolbar-hints');
fs.mkdirSync(output, { recursive: true });
const result = { checks: [], errors: [] };
function check(name, passed, data) {
  result.checks.push({ name, passed: !!passed, data });
  if (!passed) throw new Error(name + ': ' + JSON.stringify(data));
}
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5208, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const page = await browser.newPage({ viewport: { width: 1250, height: 900 }, serviceWorkers: 'block' });
    page.on('pageerror', e => result.errors.push(e.message));
    // Start with two real toolbar configurations; interactions below use the UI.
    await page.addInitScript(() => {
      if (!localStorage.getItem('toolbarHintsFixture')) {
        localStorage.setItem('geometryButtonConfig', JSON.stringify({
          multiButtons: { modeCircle: ['modeCircle', 'modeCircleThree'] },
          secondRow: { modeAngle: ['modeBisector', 'modePerpBisector'] },
          secondRowTrigger: 'tap'
        }));
        localStorage.setItem('geometry.showHints', 'true');
        localStorage.setItem('geometry.lang', 'pl');
        localStorage.setItem('toolbarHintsFixture', 'true');
      }
    });
    const ready = async () => {
      await page.goto('http://127.0.0.1:5208/', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.getElementById('modeAngle')?.classList.contains('has-second-row'));
      if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    };
    const hints = () => page.evaluate(async () => (await import('/src/i18n/index.ts')).HINTS);
    const expectHint = async (name, expected) => {
      await page.waitForFunction(text => {
        const bar = document.getElementById('hintBar');
        return bar?.textContent === text && getComputedStyle(bar).display !== 'none';
      }, expected);
      check(name, true);
    };
    const secondary = id => page.locator('#toolbarSecondRow [data-tool-id="' + id + '"]');
    await ready();
    let text = await hints();
    await page.locator('#modeAngle').hover();
    await expectHint('Main toolbar hint', text.tools.angle);
    await page.locator('#modeAngle').click();
    await secondary('modeBisector').hover();
    await expectHint('Cloned second-row button shows its own hint', text.tools.bisector);
    await secondary('modePerpBisector').hover();
    await expectHint('Another second-row tool has a distinct hint', text.tools.perpBisector);
    await page.mouse.move(500, 150);
    check('Leaving the expanded row clears its hint', await page.locator('#hintBar').isHidden());
    await secondary('modeBisector').focus();
    await expectHint('Keyboard focus shows a second-row hint', text.tools.bisector);
    await secondary('modeBisector').click();
    await expectHint('Second-row click preserves the current hint', text.tools.bisector);
    check('Click activates the cloned tool', await secondary('modeBisector').evaluate(el => el.classList.contains('active')));
    await page.locator('#modeAngle').click();
    await page.locator('#toolbarSecondRow').waitFor({ state: 'hidden' });
    await page.locator('#modeAngle').click();
    await secondary('modePerpBisector').hover();
    await expectHint('Recreated row still shows hints', text.tools.perpBisector);
    await page.locator('#modeCircle').hover();
    await expectHint('Replaced multi-tool button shows a hint', text.tools.circle);
    await page.locator('#modeCircle').click();
    await page.locator('#modeCircle').click();
    await expectHint('Cycling a multi-tool updates the hint after its click handler', text.tools.circle3);
    await page.mouse.move(500, 150);
    await page.locator('#modeCircle').hover();
    await expectHint('Hover uses the current multi-tool icon', text.tools.circle3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#modeAngle').click();
    await secondary('modeBisector').hover();
    await expectHint('Expanded row hints work at 390px', text.tools.bisector);
    const bounds = await page.locator('#hintBar').boundingBox();
    check('Hint fits the mobile viewport', bounds.x >= 0 && bounds.x + bounds.width <= 391, bounds);
    await page.waitForFunction(() => document.getElementById('hintBar').getBoundingClientRect().bottom < document.querySelector('.toolbar-bottom').getBoundingClientRect().top);
    check('Mobile hint stays above all expanded toolbar rows', true);
    await page.screenshot({ path: path.join(output, 'mobile-expanded-row.png') });
    await page.evaluate(() => localStorage.setItem('geometry.lang', 'en'));
    await ready();
    text = await hints();
    await page.locator('#modeAngle').click();
    await secondary('modeBisector').hover();
    await expectHint('Expanded row uses the selected language', text.tools.bisector);
    await page.evaluate(() => localStorage.setItem('geometry.showHints', 'false'));
    await ready();
    await page.locator('#modeAngle').click();
    await secondary('modeBisector').hover();
    check('Disabled hints stay disabled for cloned buttons', await page.locator('#hintBar').isHidden());
    check('No browser exceptions', result.errors.length === 0, result.errors);
  } catch (error) {
    result.errors.push(error.stack || String(error));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await server.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({ checks: result.checks.length, passed: result.checks.filter(c => c.passed).length, errors: result.errors }));
  if (result.errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
