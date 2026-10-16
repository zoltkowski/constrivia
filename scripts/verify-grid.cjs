const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
// Use a project installation, an explicit override, or the desktop's bundled runtime.
let playwrightModule = process.env.PLAYWRIGHT_MODULE;
if (!playwrightModule) {
  try { playwrightModule = require.resolve('playwright'); }
  catch { playwrightModule = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
}
const { chromium } = require(playwrightModule);
const output = path.resolve('output/playwright/grid');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5193, strictPort: true } });
  await server.listen();
  let browser;
  const errors = [], checks = [];
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, serviceWorkers: 'block' });
    const prepare = async page => {
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/src/main.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + `\nwindow.__gridTest = {
          state: () => ({ runtime, gridSettings, zoomFactor, panOffset, mode }),
          load: applyPersistedDocument, worldToCanvas, serialize: serializeCurrentDocument,
          reset: () => { setMode('move'); clearSelectionState(); panOffset = {x:0,y:0}; zoomFactor = 1; draw(); },
          importConfig: importButtonConfiguration, setTheme
        };` });
      });
      await page.goto('http://127.0.0.1:5193/', { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__gridTest);
      if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    };
    await prepare(page);
    const state = () => page.evaluate(() => window.__gridTest.state());
    const clear = async (model = {}) => page.evaluate(model => {
      window.__gridTest.load({ model }); window.__gridTest.reset();
    }, model);
    const screen = async p => page.evaluate(p => {
      const r = document.getElementById('canvas').getBoundingClientRect();
      const c = window.__gridTest.worldToCanvas(p.x, p.y);
      return { x: r.left + c.x, y: r.top + c.y };
    }, p);
    const click = async p => { const c = await screen(p); await page.mouse.click(c.x, c.y); };
    const points = async () => Object.values((await state()).runtime.points);
    const lattice = p => Math.abs(p.x / 24 - Math.round(p.x / 24)) < 1e-7 && Math.abs(p.y / 24 - Math.round(p.y / 24)) < 1e-7;
    const menu = async () => { if (!await page.locator('#showGridBtn').isVisible()) await page.locator('#zoomMenu').click(); };
    const toggle = async () => { await menu(); await page.locator('#showGridBtn').click(); await page.locator('#zoomMenu').click(); };
    const drag = async (from, to) => {
      const a = await screen(from), b = await screen(to);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
    };
    check('First launch has empty paper and an inactive grid toggle', !(await state()).gridSettings.visible && await page.locator('#showGridBtn').getAttribute('aria-pressed') === 'false');
    await page.reload({ waitUntil: 'networkidle' });
    check('Empty paper remains the default after reload', !(await state()).gridSettings.visible);
    await toggle(); await page.reload({ waitUntil: 'networkidle' });
    check('Explicitly enabled paper stays enabled after reload', (await state()).gridSettings.visible && await page.locator('#showGridBtn').getAttribute('aria-pressed') === 'true');
    await page.locator('#modeAdd').click(); await click({ x: 201, y: 249 });
    check('Point snaps to the nearest grid intersection', (await points())[0].x === 192 && (await points())[0].y === 240);
    await clear(); await page.locator('#modeSegment').click();
    await click({ x: 201, y: 249 }); await click({ x: 391, y: 321 });
    check('Both segment endpoints stay on grid, including arbitrary slopes', (await points()).every(lattice) && (await points())[1].y === 312);
    await clear(); await page.locator('#modePolygon').click();
    for (const p of [{ x: 201, y: 249 }, { x: 391, y: 249 }, { x: 391, y: 441 }, { x: 201, y: 441 }, { x: 192, y: 240 }]) await click(p);
    check('Polygon vertices snap and closure reuses the first point', (await points()).length === 4 && (await points()).every(lattice) && Object.keys((await state()).runtime.polygons).length === 1);
    await page.screenshot({ path: path.join(output, 'grid-dark.png') });
    await page.evaluate(() => window.__gridTest.setTheme('light'));
    await page.screenshot({ path: path.join(output, 'grid-light.png') });
    await clear(); await page.locator('#modeCircle').click(); await click({ x: 201, y: 249 }); await click({ x: 391, y: 321 });
    check('Circle inputs snap without rounding its computed radius', (await points()).every(lattice) && Object.keys((await state()).runtime.circles).length === 1);
    const zoomIn = async () => {
      await clear();
      const c = await screen({ x: 300, y: 350 });
      await page.mouse.move(c.x, c.y); await page.mouse.wheel(0, -1500);
      await page.waitForFunction(() => window.__gridTest.state().zoomFactor === 4);
    };
    await zoomIn(); await page.locator('#modeCircleThree').click();
    await click({ x: 310, y: 360 }); await click({ x: 320, y: 360 });
    check('Repeated taps in an enlarged cell do not duplicate circle inputs', (await points()).length === 1);
    await zoomIn(); await page.locator('#modeCircleThree').click();
    await click({ x: 290, y: 367 }); await click({ x: 314, y: 366 }); await click({ x: 337, y: 367 });
    check('Three-point circle rejects inputs made collinear by snapping without leaving an orphan', (await points()).length === 2 && Object.keys((await state()).runtime.circles).length === 0);
    await zoomIn(); await page.locator('#modeCompass').click();
    await click({ x: 310, y: 360 }); await click({ x: 320, y: 360 });
    check('Compass rejects coincident snapped source points', (await points()).length === 1);
    const fixture = { points: [{ id: 'a', x: 205, y: 253 }, { id: 'b', x: 409, y: 307 }], lines: [{ id: 'l', points: ['a', 'b'], defining_points: ['a', 'b'] }] };
    await clear(fixture); await page.locator('#modeSegment').click(); await click({ x: 207, y: 254 }); await click({ x: 590, y: 400 });
    check('Existing off-grid point takes priority over snapping', (await state()).runtime.points.a.x === 205 && Object.values((await state()).runtime.lines).some(l => l.defining_points.includes('a') && l.id !== 'l'));
    await clear(fixture); await page.locator('#modeAdd').click(); await click({ x: 307, y: 280 });
    const onLine = (await points()).find(p => !['a', 'b'].includes(p.id));
    check('Point on a line retains its geometric constraint', onLine?.construction_kind === 'on_object' && Math.abs((onLine.x - 205) * 54 - (onLine.y - 253) * 204) < 1e-5);
    for (const horizontal of [true, false]) {
      const label = horizontal ? 'Horizontal' : 'Vertical';
      const axisFixture = { points: horizontal
        ? [{ id: 'a', x: 205, y: 253 }, { id: 'b', x: 601, y: 253 }]
        : [{ id: 'a', x: 205, y: 220 }, { id: 'b', x: 205, y: 620 }],
        lines: [{ id: 'axis', points: ['a', 'b'], defining_points: ['a', 'b'] }] };
      const placement = horizontal ? { x: 337, y: 256 } : { x: 208, y: 337 };
      const movement = horizontal ? { x: 455, y: 381 } : { x: 381, y: 455 };
      const at = (p, coordinate) => !!p && (horizontal ? p.x === coordinate && p.y === 253 : p.x === 205 && p.y === coordinate);
      const added = async () => (await points()).find(p => !['a', 'b'].includes(p.id));
      await clear(axisFixture); await page.locator('#modeAdd').click(); await click(placement);
      check(`${label} line point snaps on creation without moving its line`, at(await added(), 336));
      await drag(await added(), movement);
      check(`${label} line point snaps during dragging and retains its line parent`, at(await added(), 456) && (await added()).construction_kind === 'on_object' && (await added()).parent_refs.some(p => p.kind === 'line' && p.id === 'axis'));
      await page.locator('#undo').click();
      check(`${label} snapped point drag supports Undo`, at(await added(), 336));
      await page.locator('#redo').click();
      check(`${label} snapped point drag supports Redo`, at(await added(), 456));
      await toggle(); await clear(axisFixture); await page.locator('#modeAdd').click(); await click(placement);
      check(`${label} line placement is continuous with hidden paper`, at(await added(), 337));
      await drag(await added(), movement);
      check(`${label} line dragging is continuous with hidden paper`, at(await added(), 455));
      await toggle();
    }
    await clear(fixture); await page.locator('#modeMidpoint').click(); await click({ x: 205, y: 253 }); await click({ x: 409, y: 307 });
    const midpoint = (await points()).find(p => p.construction_kind === 'midpoint');
    check('Computed midpoint is not rounded to the grid', midpoint?.x === 307 && midpoint.y === 280);
    await clear({ points: [{ id: 'a', x: 205, y: 253 }] });
    await drag({ x: 205, y: 253 }, { x: 343, y: 371 });
    check('Dragging a free point snaps to the grid', lattice((await state()).runtime.points.a));
    await toggle(); check('Menu disables the grid and reports its state', !(await state()).gridSettings.visible && await page.locator('#showGridBtn').getAttribute('aria-pressed') === 'false');
    await clear(); await page.locator('#modeAdd').click(); await click({ x: 205, y: 253 });
    check('Hidden grid does not snap new points', (await points())[0].x === 205 && (await points())[0].y === 253);
    await drag({ x: 205, y: 253 }, { x: 343, y: 371 });
    check('Hidden grid does not snap dragging', (await points())[0].x === 343 && (await points())[0].y === 371);
    await toggle(); await clear();
    const center = await screen({ x: 500, y: 350 }); await page.mouse.move(center.x, center.y); await page.mouse.wheel(0, -250);
    await page.waitForFunction(() => window.__gridTest.state().zoomFactor > 1);
    const before = await state();
    await drag({ x: 300, y: 250 }, { x: 330, y: 270 });
    check('Panning moves the world-anchored paper', (await state()).panOffset.x !== before.panOffset.x);
    await page.locator('#modeAdd').click(); await click({ x: 215, y: 287 });
    check('Zoom and pan preserve snapping to the same world intersections', lattice((await points())[0]));
    const gap = await page.evaluate(() => { const a = window.__gridTest.worldToCanvas(0, 0), b = window.__gridTest.worldToCanvas(24, 0); return b.x - a.x; });
    check('Zoom changes cell size on screen', Math.abs(gap - (await state()).zoomFactor * 24) < 1e-7 && gap > 24);
    await menu(); await page.locator('#settingsBtn').click(); await page.locator('#tabBtnAppearance').click();
    check('Appearance has one combined preview and its background checkbox follows the menu', await page.locator('#previewCanvas').count() === 1 && await page.locator('#gridPreview').count() === 0 && await page.locator('#gridVisible').isChecked());
    const previewImage = () => page.locator('#previewCanvas').evaluate(el => el.toDataURL());
    const withBackground = await previewImage();
    await page.locator('#gridVisible').uncheck();
    const withoutBackground = await previewImage();
    check('Preview checkbox hides paper in the example and synchronizes actual visibility', withBackground !== withoutBackground && !(await state()).gridSettings.visible && await page.locator('#showGridBtn').getAttribute('aria-pressed') === 'false');
    await page.locator('#gridVisible').check();
    check('Re-enabling preview paper restores the same combined drawing', await previewImage() === withBackground && (await state()).gridSettings.visible);
    const input = async (id, value) => page.locator(id).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await input('#gridColor', '#5577cc'); await input('#gridOpacity', '48'); await input('#gridWidth', '1.5'); await page.locator('#gridDotsOnly').check();
    check('All appearance controls update immediately', (await state()).gridSettings.color === '#5577cc' && (await state()).gridSettings.opacity === .48 && (await state()).gridSettings.width === 1.5 && (await state()).gridSettings.dotsOnly);
    check('Paper appearance edits redraw the combined example', await previewImage() !== withBackground);
    await page.locator('#previewCanvas').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'grid-settings.png') });
    await page.locator('#settingsCloseBtn').click();
    await page.screenshot({ path: path.join(output, 'grid-dots.png') });
    await toggle(); await page.reload({ waitUntil: 'networkidle' });
    check('Visibility and appearance survive reload', !(await state()).gridSettings.visible && (await state()).gridSettings.dotsOnly && (await state()).gridSettings.color === '#5577cc' && (await state()).gridSettings.width === 1.5);
    await page.evaluate(() => window.__gridTest.importConfig(JSON.stringify({ grid: { visible: true, color: '#778899', opacity: .35, width: 1, dotsOnly: false } })));
    check('Configuration import restores the paper preferences', (await state()).gridSettings.visible && (await state()).gridSettings.color === '#778899' && !(await state()).gridSettings.dotsOnly);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await prepare(mobile);
    await mobile.locator('#zoomMenu').click();
    await mobile.locator('#showGridBtn').click();
    await mobile.locator('#zoomMenu').click();
    await mobile.locator('#modeAdd').click();
    await mobile.touchscreen.tap(201, 350);
    const mp = await mobile.evaluate(() => Object.values(window.__gridTest.state().runtime.points)[0]);
    check('Touch at DPR 2 snaps to the same world lattice', !!mp && lattice(mp));
    await mobile.locator('#zoomMenu').click();
    const rect = await mobile.locator('#showGridBtn').boundingBox();
    check('Grid toggle is reachable in the mobile hamburger menu', rect && rect.x >= 0 && rect.x + rect.width <= 390);
    await mobile.locator('#settingsBtn').click(); await mobile.locator('#tabBtnAppearance').click();
    await mobile.locator('#gridDotsOnly').scrollIntoViewIfNeeded(); await mobile.locator('#gridDotsOnly').check();
    await mobile.locator('#gridVisible').scrollIntoViewIfNeeded();
    await mobile.locator('#gridVisible').uncheck();
    check('Mobile combined preview checkbox changes actual paper visibility', !await mobile.evaluate(() => window.__gridTest.state().gridSettings.visible));
    check('Mobile appearance controls fit without horizontal overflow', await mobile.locator('#settingsModal .modal-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await mobile.screenshot({ path: path.join(output, 'grid-mobile.png') });
    check('No browser errors', errors.length === 0);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`Grid: ${checks.length} checks passed`);
  } finally {
    await browser?.close(); await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
