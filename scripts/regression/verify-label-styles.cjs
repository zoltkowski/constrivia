const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const out = path.resolve(__dirname, '../../output/playwright/label-styles');
fs.mkdirSync(out, { recursive: true });
const results = { checks: [], errors: [] };
function check(name, passed, data) {
  results.checks.push({ name, passed: !!passed, data });
  if (!passed) throw Error(name + ': ' + JSON.stringify(data));
}
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5217, strictPort: true } });
  await server.listen();
  let browser, page;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    page = await browser.newPage({ viewport: { width: 1100, height: 850 }, hasTouch: true, serviceWorkers: 'block' });
    page.on('pageerror', error => results.errors.push(error.message));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `
        window.__labels = {
          load: applyPersistedDocument, save: serializeCurrentDocument,
          select: value => { selectLabel(value); openStyleMenu(); },
          state: () => ({ runtime, historyIndex }),
          hit: findLabelAt, dimensions: label => getLabelScreenDimensions(ctx, label, labelFontSizePx),
          copy: () => {
            const buffer = createConstructionClipboard(runtime, {labels: ['f']});
            return pasteConstructionClipboard(runtime, buffer, 30);
          }
        };` });
    });
    await page.goto('http://127.0.0.1:5217/', { waitUntil: 'networkidle' });
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    const label = () => ({ text: 'AB + C_1 = √{A/B}\nD', color: '#000000', fontSize: 0, offset: { x: 15, y: -25 } });
    await page.evaluate(document => window.__labels.load(document), { version: 3, model: {
      points: [
        { id: 'p', x: 440, y: 400, label: label() },
        { id: 'q', x: 640, y: 400 }, { id: 'r', x: 440, y: 220 },
      ],
      lines: [{ id: 'l', points: ['p', 'q'], label: label() }],
      angles: [{ id: 'a', vertex: 'p', point1: 'q', point2: 'r', label: label() }],
      labels: [{ id: 'f', ...label(), pos: { x: 460, y: 540 } }],
    } });
    const input = page.locator('#labelText');
    const selectText = async (start, end) => {
      await input.focus();
      await input.evaluate((el, range) => { el.setSelectionRange(...range); el.dispatchEvent(new Event('select')); }, [start, end]);
    };
    const state = () => page.evaluate(() => window.__labels.state());
    const read = async (kind, id) => {
      const s = await state();
      return kind === 'free' ? s.runtime.labels[id] : s.runtime[{ point: 'points', line: 'lines', angle: 'angles' }[kind]][id].label;
    };
    for (const [kind, id] of [['point', 'p'], ['line', 'l'], ['angle', 'a'], ['free', 'f']]) {
      await page.evaluate(value => window.__labels.select(value), { kind, id });
      await selectText(0, 2);
      await page.locator('#labelInlineBold').click();
      await page.locator('#labelInlineItalic').click();
      await page.locator('#labelInlineColor').fill('#e02020');
      await page.locator('#labelInlineSize').fill('32');
      await page.locator('#labelInlineSize').press('Tab');
      const styled = await read(kind, id);
      check(kind + ': combines all four styles on the selected fragment',
        JSON.stringify(styled.textStyles) === JSON.stringify([{ start: 0, end: 2, bold: true, italic: true, color: '#e02020', fontSize: 32 }]), styled);
      check(kind + ': keeps the original math source editable', styled.text === label().text);
      const dimensions = await page.evaluate(label => window.__labels.dimensions(label), styled);
      check(kind + ': bounds account for larger text', dimensions.lineHeights[0] >= 38.4, dimensions);
    }
    const styledFree = await read('free', 'f');
    await page.locator('#undo').click();
    check('Undo restores the previous fragment size', (await read('free', 'f')).textStyles[0].fontSize === undefined);
    await page.locator('#redo').click();
    check('Redo restores the fragment formatting', JSON.stringify((await read('free', 'f')).textStyles) === JSON.stringify(styledFree.textStyles));
    await page.evaluate(() => window.__labels.select({ kind: 'free', id: 'f' }));
    await selectText(0, 2);
    await input.press('Control+b');
    check('Ctrl+B removes only bold', (await read('free', 'f')).textStyles[0].bold === undefined && (await read('free', 'f')).textStyles[0].italic);
    await input.press('Control+b');
    await selectText(0, 1);
    await page.locator('#labelInlineClear').click();
    check('Clear formatting affects only the selected character', JSON.stringify((await read('free', 'f')).textStyles) === JSON.stringify([{ start: 1, end: 2, bold: true, italic: true, color: '#e02020', fontSize: 32 }]));
    await selectText(1, 2);
    await input.press('ArrowRight');
    await input.press('x');
    const edited = await read('free', 'f');
    check('Typing extends the preceding style without changing math', edited.text.startsWith('ABx + C_1') && edited.textStyles[0].end === 3, edited);
    await selectText(0, 0);
    check('A caret alone disables fragment formatting', await page.locator('#labelInlineBold').isDisabled());
    const snapshot = await page.evaluate(() => JSON.parse(JSON.stringify(window.__labels.save())));
    await page.evaluate(doc => window.__labels.load(doc), snapshot);
    const roundtrip = await read('free', 'f');
    check('Native serialization and reload preserve styles', JSON.stringify(roundtrip.textStyles) === JSON.stringify(edited.textStyles));
    await page.evaluate(() => window.__labels.copy());
    const copied = Object.values((await state()).runtime.labels).find(l => l.id !== 'f');
    check('Copy preserves fragment styles', JSON.stringify(copied?.textStyles) === JSON.stringify(roundtrip.textStyles), copied);
    // Verify that the extra width is selectable on canvas, using a simple large free label.
    await page.evaluate(() => window.__labels.load({ version: 3, model: { labels: [{ id: 'large', text: 'MMMM', pos: { x: 100, y: 500 }, textStyles: [{ start: 0, end: 4, fontSize: 48, bold: true }] }] } }));
    const hit = await page.evaluate(() => window.__labels.hit({ x: 230, y: 500 }));
    check('Hit testing includes the styled width', hit?.id === 'large', hit);
    await page.screenshot({ path: path.join(out, 'styled-canvas.png') });
    await page.evaluate(doc => window.__labels.load(doc), snapshot);
    await page.evaluate(() => window.__labels.select({ kind: 'free', id: 'f' }));
    await page.setViewportSize({ width: 390, height: 844 });
    await selectText(1, 3);
    await page.locator('#labelInlineItalic').tap();
    check('Touch formatting preserves the selected fragment', !(await read('free', 'f')).textStyles[0].italic);
    await page.evaluate(() => window.__labels.select({ kind: 'free', id: 'f' }));
    const languageSelect = page.locator('#languageSelectProminent');
    const changeLanguage = async language => {
      await page.locator('#zoomMenu').click();
      await page.locator('#settingsBtn').click();
      await languageSelect.selectOption(language);
      await page.locator('#settingsCloseBtn').click();
    };
    await page.locator('#zoomMenu').click();
    await page.locator('#settingsBtn').click();
    await languageSelect.selectOption('en');
    check('Language selector has an English accessible name', await languageSelect.getAttribute('aria-label') === 'Language');
    await page.locator('#settingsCloseBtn').click();
    await page.locator('#labelAlignToggle').click();
    let alignmentLabel = await page.locator('#labelAlignToggle').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Label alignment keeps English title and accessible name after interaction', /^Label alignment: (left|center)$/.test(alignmentLabel.title) && alignmentLabel.aria === alignmentLabel.title, alignmentLabel);
    const measurementsLabel = await page.locator('#showMeasurementsBtn').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Measurement visibility control keeps its English label', /^(Show|Hide) measurements$/.test(measurementsLabel.title) && measurementsLabel.aria === measurementsLabel.title, measurementsLabel);
    await changeLanguage('pl');
    await page.locator('#labelAlignToggle').click();
    alignmentLabel = await page.locator('#labelAlignToggle').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Label alignment switches back to Polish after interaction', /^Wyrównanie etykiety: do (lewej|środka)$/.test(alignmentLabel.title) && alignmentLabel.aria === alignmentLabel.title, alignmentLabel);
    await changeLanguage('en');
    await page.locator('#labelAlignToggle').click();
    alignmentLabel = await page.locator('#labelAlignToggle').evaluate(button => ({ title: button.title, aria: button.getAttribute('aria-label') }));
    check('Label alignment remains English after switching languages again', /^Label alignment: (left|center)$/.test(alignmentLabel.title) && alignmentLabel.aria === alignmentLabel.title, alignmentLabel);
    const bounds = await page.locator('#labelInlineRow').boundingBox();
    check('Formatting controls fit a 390px viewport', bounds.x >= 0 && bounds.x + bounds.width <= 391, bounds);
    await page.screenshot({ path: path.join(out, 'mobile-formatting.png') });
    for (const mobile of [false, true]) {
      await page.setViewportSize({ width: mobile ? 390 : 1100, height: 850 });
      for (const [id, symbol] of [['labelSubscriptBtn', '_{}'], ['labelSuperscriptBtn', '^{}']]) {
        const name = (mobile ? 'Touch' : 'Mouse') + ' ' + id;
        await page.evaluate(() => window.__labels.load({ version: 3, model: { labels: [
          { id: 'f', text: 'AB', pos: { x: 400, y: 400 }, textStyles: [{ start: 0, end: 2, bold: true }] }
        ] } }));
        await page.evaluate(() => window.__labels.select({ kind: 'free', id: 'f' }));
        if (!await page.locator('#labelGreekRow').isVisible()) await page.locator('#labelGreekToggle').click();
        check(name + ': displays the script symbol', await page.locator('#' + id).textContent() === (symbol[0] === '_' ? 'x₁' : 'x²'));
        const insert = async () => {
          if (mobile) await page.locator('#' + id).tap();
          else await page.locator('#' + id).click();
        };
        await selectText(1, 1);
        await insert();
        check(name + ': inserts the script template at the caret', (await read('free', 'f')).text === 'A' + symbol + 'B');
        const caret = await input.evaluate(el => [el.selectionStart, el.selectionEnd, document.activeElement === el]);
        check(name + ': focuses the cursor inside braces', JSON.stringify(caret) === JSON.stringify([3, 3, true]), caret);
        await input.press('7');
        check(name + ': subsequent typing stays inside braces', (await read('free', 'f')).text === 'A' + symbol.slice(0, 2) + '7}B');
        check(name + ': inherits inline formatting', (await read('free', 'f')).textStyles[0].end === 6);
        await page.locator('#undo').click();
        check(name + ': undo removes the typed index only', (await read('free', 'f')).text === 'A' + symbol + 'B');
        await page.locator('#redo').click();
        check(name + ': redo restores the index', (await read('free', 'f')).text === 'A' + symbol.slice(0, 2) + '7}B');
        await selectText(1, 5);
        await insert();
        check(name + ': replaces selected text and resets the inner caret', (await read('free', 'f')).text === 'A' + symbol + 'B' &&
          await input.evaluate(el => el.selectionStart === 3 && el.selectionEnd === 3));
      }
    }
    await page.screenshot({ path: path.join(out, 'mobile-script-palette.png') });
    check('No browser exceptions', results.errors.length === 0, results.errors);
  } catch (error) {
    results.errors.push(error.stack || String(error));
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'error.png') }).catch(() => {});
  } finally {
    await browser?.close();
    await server.close();
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify({ checks: results.checks.length, passed: results.checks.filter(c => c.passed).length, errors: results.errors }));
  if (results.errors.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
