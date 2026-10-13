const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/yellow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5175, strictPort: true } });
  await server.listen();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__libraryInspection=()=>({bundle:currentCtrBundle,document:serializeCurrentDocument()});' });
    });
    await page.goto('http://127.0.0.1:5175/', { waitUntil: 'networkidle' });
    for (const name of ['srodek-ciezkosci-trojkata', 'ortocentrum-trojkata', 'okrag-opisany-na-trojkacie']) {
      if (!(await page.locator('#cloudFilesBtn').isVisible())) await page.locator('#zoomMenu').click();
      await page.locator('#cloudFilesBtn').click();
      await page.locator('[data-tab="library"]').click();
      await page.locator('#libraryFileList').getByRole('button', { name: `Wczytaj ${name}`, exact: true }).click();
      await page.waitForFunction(() => window.__libraryInspection()?.bundle?.index === 0);
      if (await page.locator('#cloudCloseBtn').isVisible()) await page.locator('#cloudCloseBtn').click();
      const stages = [];
      for (;;) {
        const state = await page.evaluate(() => window.__libraryInspection());
        stages.push({ index: state.bundle.index, name: state.bundle.entries[state.bundle.index].name, points: state.document.model.points.length });
        assert(state.document.model.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
        if (state.bundle.index === state.bundle.entries.length - 1) break;
        await page.locator('#bundleNextBtn').click();
        await page.waitForFunction(index => window.__libraryInspection().bundle.index === index, state.bundle.index + 1);
      }
      await page.locator('#bundlePrevBtn').click();
      assert.equal((await page.evaluate(() => window.__libraryInspection().bundle.index)), stages.length - 2);
      results.push({ name, stages, previousButtonWorks: true });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(__dirname, 'classical', 'library-results.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
