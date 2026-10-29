const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { zipSync, strToU8 } = require('fflate');

const output = path.resolve(__dirname, '../../output/playwright/ui-ergonomics');
fs.mkdirSync(output, { recursive: true });
const ctrBytes = Array.from(zipSync({
  'document.json': strToU8(JSON.stringify({ model: { points: [{ id: 'p', x: 250, y: 300 }] } }))
}));

function check(condition, message, details) {
  if (!condition) throw Error(`${message}${details === undefined ? '' : `: ${JSON.stringify(details)}`}`);
}

async function keyboardDialog(page, openerSelector, modalSelector, closeSelector) {
  const opener = page.locator(openerSelector);
  await opener.focus();
  await opener.press('Enter');
  const modal = page.locator(modalSelector);
  await modal.waitFor({ state: 'visible' });
  check(await modal.evaluate(el => el.contains(document.activeElement)), `${modalSelector} did not receive initial focus`);

  const focusable = () => modal.locator('button:visible:not([disabled]), input:visible:not([disabled]), select:visible:not([disabled]), textarea:visible:not([disabled]), a[href]:visible, [tabindex]:visible:not([tabindex="-1"])');
  const first = focusable().first();
  const last = focusable().last();
  check(await focusable().count() > 1, `${modalSelector} needs multiple focus targets for a Tab trap check`);

  await last.focus();
  await page.keyboard.press('Tab');
  check(await first.evaluate(el => el === document.activeElement), `${modalSelector} Tab did not wrap from last to first`);
  await page.keyboard.press('Shift+Tab');
  check(await last.evaluate(el => el === document.activeElement), `${modalSelector} Shift+Tab did not wrap from first to last`);

  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  check(await opener.evaluate(el => el === document.activeElement), `${modalSelector} did not restore focus to its opener`);
}

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5273, strictPort: true } });
  await server.listen();
  let browser, page;
  try {
    browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
      headless: true
    });
    page = await browser.newPage({ viewport: { width: 1100, height: 850 }, hasTouch: true, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => {
      if (dialog.type() === 'confirm') await dialog.accept();
      else { errors.push(`${dialog.type()}: ${dialog.message()}`); await dialog.dismiss(); }
    });
    await page.addInitScript(bytes => {
      localStorage.setItem('geometry.lang', 'en');
      window.__loadedNames = [];
      window.__writtenFiles = {};
      const entries = new Map([
        ['Alpha.ctr', { modified: 3000, bytes }],
        ['Beta.ctr', { modified: 2000, bytes }],
        ['settings.config', { modified: 1000, bytes: Array.from(new TextEncoder().encode('{}')) }]
      ]);
      const handle = name => ({
        kind: 'file', name,
        getFile: async () => {
          const file = entries.get(name);
          if (!file) throw Error(`Missing fake file ${name}`);
          return new File([Uint8Array.from(file.bytes)], name, { lastModified: file.modified });
        },
        createWritable: async () => ({
          write: async value => { window.__writtenFiles[name] = Array.from(new Uint8Array(value)); },
          close: async () => {}
        })
      });
      window.__ergonomicsDirectory = {
        kind: 'directory', name: 'Ergonomics test folder',
        queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        getFileHandle: async name => handle(name),
        removeEntry: async name => { entries.delete(name); },
        values: async function* () { for (const name of entries.keys()) yield handle(name); }
      };
      window.showDirectoryPicker = async () => window.__ergonomicsDirectory;
      window.addEventListener('cloud-file-loaded', event => window.__loadedNames.push(event.detail.name));
    }, ctrBytes);
    await page.route('**/api/json/list', route => route.fulfill({ json: { result: [{ name: 'Cloud.ctr' }] } }));
    await page.route('**/api/json/Cloud.ctr', route => route.fulfill({ body: Buffer.from(ctrBytes) }));
    await page.route('**/content/index.json*', route => route.fulfill({ json: ['Library.ctr'] }));
    await page.route('**/content/Library.ctr', route => route.fulfill({ body: Buffer.from(ctrBytes) }));

    await page.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle' });
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('default-folder-changed', { detail: { handle: window.__ergonomicsDirectory } })));

    const openOptions = async () => { if (!await page.locator('#settingsBtn').isVisible()) await page.locator('#zoomMenu').click(); };
    const select = source => page.locator(`#${source}FileList .cloud-file-item__select`);
    const row = (source, name) => page.locator(`#${source}FileList .cloud-file-item`).filter({ has: page.locator('.cloud-file-item__name', { hasText: name }) });
    const names = async source => page.locator(`#${source}FileList .cloud-file-item__name`).allTextContents();
    const checkRows = async (source, expected) => {
      await page.waitForFunction(({ source, expected }) => JSON.stringify(Array.from(document.querySelectorAll(`#${source}FileList .cloud-file-item__name`), el => el.textContent)) === JSON.stringify(expected), { source, expected });
      const rows = page.locator(`#${source}FileList .cloud-file-item`);
      for (let i = 0; i < await rows.count(); i++) {
        const current = rows.nth(i);
        const selectButton = current.locator('button.cloud-file-item__select');
        const deleteButton = current.locator('button.cloud-file-item__btn--delete');
        check(await selectButton.count() === 1, `${source} row needs one select button`);
        check(await deleteButton.count() === (source === 'library' ? 0 : 1), `${source} row has an unexpected delete button`);
        check(await selectButton.evaluate(el => !el.contains(el.querySelector('button'))), `${source} select button must not contain nested buttons`);
        if (source !== 'library') check(await deleteButton.evaluate(el => !el.closest('.cloud-file-item__select')), `${source} delete button must be a sibling action`);
      }
    };
    const clickTab = async source => page.locator(`#cloudPanel [data-tab="${source}"]`).click();
    const expectActionName = async (source, filename, label) => {
      const button = row(source, filename).locator('.cloud-file-item__select');
      await page.waitForFunction(({ source, filename, label }) => {
        const item = Array.from(document.querySelectorAll(`#${source}FileList .cloud-file-item`))
          .find(el => el.querySelector('.cloud-file-item__name')?.textContent === filename);
        return item?.querySelector('.cloud-file-item__select')?.getAttribute('aria-label') === label;
      }, { source, filename, label });
      check(await button.getAttribute('aria-label') === label, `${source} action label`, await button.getAttribute('aria-label'));
    };
    const useLocalByKeyboard = async (filename, key) => {
      const button = row('local', filename).locator('.cloud-file-item__select');
      await button.focus();
      await button.press(key);
    };

    await page.locator('#cloudFilesBtn').click();
    check(await page.locator('#cloudTabLocalText').textContent() === 'Local', 'English local tab');
    check(await page.locator('#cloudTabLibraryText').textContent() === 'Library', 'English library tab');
    check(await page.locator('#cloudTabCloudText').textContent() === 'Cloud', 'English cloud tab');
    await checkRows('local', ['Alpha', 'Beta']);
    await expectActionName('local', 'Alpha', 'Open Alpha');
    const alphaRow = row('local', 'Alpha');
    const betaRow = row('local', 'Beta');
    await alphaRow.locator('.cloud-file-item__select').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__loadedNames.at(-1) === 'Alpha');
    await betaRow.locator('.cloud-file-item__select').focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__loadedNames.at(-1) === 'Beta');

    await page.locator('#cloudPanel [data-tab="cloud"]').click();
    await checkRows('cloud', ['Cloud']);
    await expectActionName('cloud', 'Cloud', 'Open Cloud');
    await page.locator('#cloudFileList .cloud-file-item__select').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__loadedNames.at(-1) === 'Cloud');
    await page.locator('#cloudPanel [data-tab="library"]').click();
    await checkRows('library', ['Library']);
    await expectActionName('library', 'Library', 'Open Library');
    await page.locator('#libraryFileList .cloud-file-item__select').focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__loadedNames.at(-1) === 'Library');

    await page.locator('#cloudPanel [data-tab="local"]').click();
    await page.locator('#cloudCloseBtn').click();
    await page.locator('#exportJsonBtn').click();
    check(await page.locator('#cloudFilenameLabel').textContent() === 'File name', 'English filename label');
    check(await page.locator('#cloudSaveBtn').textContent() === 'Save', 'English save button');
    await checkRows('local', ['Alpha', 'Beta']);
    await expectActionName('local', 'Alpha', 'Use Alpha as the file name');
    await useLocalByKeyboard('Alpha', 'Enter');
    check(await page.locator('#cloudFilenameInput').inputValue() === 'Alpha', 'Enter should use a row filename in save mode');
    await expectActionName('local', 'Beta', 'Use Beta as the file name');
    await useLocalByKeyboard('Beta', 'Space');
    check(await page.locator('#cloudFilenameInput').inputValue() === 'Beta', 'Space should use a row filename in save mode');
    await page.locator('#cloudCloseBtn').click();

    // A delete control is independently keyboard reachable and acts on its own row.
    await page.locator('#cloudFilesBtn').click();
    await checkRows('local', ['Alpha', 'Beta']);
    const betaDelete = row('local', 'Beta').locator('.cloud-file-item__btn--delete');
    check(await betaDelete.getAttribute('aria-label') === 'Delete file Beta.ctr', 'English delete action label', await betaDelete.getAttribute('aria-label'));
    await betaDelete.focus();
    await page.keyboard.press('Enter');
    await checkRows('local', ['Alpha']);
    await page.locator('#cloudCloseBtn').click();

    // Settings opened over the file panel must leave the nested panel keyboard-operable.
    await openOptions();
    await keyboardDialog(page, '#settingsBtn', '#settingsModal', '#settingsCloseBtn');
    await openOptions();
    const helpOpener = page.locator('#helpBtn');
    await helpOpener.focus();
    await helpOpener.press('Enter');
    const help = page.locator('#helpModal');
    await help.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#helpModal .help-content-inner')?.textContent?.trim().length > 0);
    check(await help.evaluate(el => el.contains(document.activeElement)), 'Help dialog did not receive initial focus');
    const helpFocusables = help.locator('button:visible:not([disabled]), a[href]:visible, [tabindex]:visible:not([tabindex="-1"])');
    check(await helpFocusables.count() > 1, 'Help dialog needs multiple Tab targets');
    await helpFocusables.last().focus();
    await page.keyboard.press('Tab');
    check(await helpFocusables.first().evaluate(el => el === document.activeElement), 'Help Tab did not wrap from last to first');
    await page.keyboard.press('Shift+Tab');
    check(await helpFocusables.last().evaluate(el => el === document.activeElement), 'Help Shift+Tab did not wrap from first to last');
    await page.keyboard.press('Escape');
    await help.waitFor({ state: 'detached' });
    check(await page.locator('#zoomMenu').evaluate(el => el === document.activeElement), 'Help did not restore focus to the menu button after its opener was hidden');

    // Switch language in Settings, then re-open the file chooser from Settings and close it by keyboard.
    await openOptions();
    await page.locator('#settingsBtn').click();
    await page.locator('#languageSelectProminent').selectOption('pl');
    await page.locator('#settingsCloseBtn').click();
    await page.locator('#cloudFilesBtn').click();
    await checkRows('local', ['Alpha']);
    await expectActionName('local', 'Alpha', 'Wczytaj Alpha');
    check(await row('local', 'Alpha').locator('.cloud-file-item__btn--delete').getAttribute('aria-label') === 'Usuń plik Alpha.ctr', 'Polish delete label');
    await page.locator('#cloudCloseBtn').click();

    await openOptions();
    await page.locator('#settingsBtn').click();
    await page.locator('#importConfigBtn').click();
    await page.locator('#cloudPanel').waitFor({ state: 'visible' });
    await checkRows('local', ['settings']);
    await expectActionName('local', 'settings', 'Wczytaj settings');
    const panelClose = page.locator('#cloudCloseBtn');
    await panelClose.focus();
    await page.keyboard.press('Enter');
    await page.locator('#cloudPanel').waitFor({ state: 'hidden' });
    check(await page.locator('#settingsModal').evaluate(el => el.contains(document.activeElement)), 'Closing nested file panel should return focus to Settings');
    await page.locator('#settingsCloseBtn').click();

    // Save mode stays usable in Polish as well, including the keyboard filename action.
    await page.locator('#exportJsonBtn').click();
    await checkRows('local', ['Alpha']);
    await expectActionName('local', 'Alpha', 'Użyj Alpha jako nazwy pliku');
    await useLocalByKeyboard('Alpha', 'Space');
    check(await page.locator('#cloudFilenameInput').inputValue() === 'Alpha', 'Polish Space action should use the row filename');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const panelBox = await page.locator('#cloudPanel').boundingBox();
    check(panelBox && panelBox.x >= 0 && panelBox.x + panelBox.width <= 390, 'File panel should fit the 390px viewport', panelBox);
    for (const selector of ['#cloudCloseBtn', '#localFileList .cloud-file-item__select', '#localFileList .cloud-file-item__btn--delete']) {
      const box = await page.locator(selector).first().boundingBox();
      check(box && box.x >= 0 && box.x + box.width <= 391, `${selector} should fit the mobile viewport`, box);
    }
    await page.screenshot({ path: path.join(output, 'mobile-file-panel-pl.png'), fullPage: true });
    await page.locator('#cloudCloseBtn').click();
    await openOptions();
    await page.locator('#settingsBtn').click();
    const settingsBox = await page.locator('#settingsModal .modal-content').boundingBox();
    check(settingsBox && settingsBox.x >= 0 && settingsBox.x + settingsBox.width <= 391, 'Settings dialog should fit 390px', settingsBox);
    await page.screenshot({ path: path.join(output, 'mobile-settings-pl.png'), fullPage: true });
    await page.keyboard.press('Escape');
    check(await page.locator('#settingsModal').evaluate(el => getComputedStyle(el).display === 'none'), 'Escape should close Polish Settings dialog');

    // Closing Help while its content is loading must not reopen it when the fetch completes.
    let releaseHelp;
    const helpGate = new Promise(resolve => { releaseHelp = resolve; });
    await page.route('**/help.html', async route => { await helpGate; await route.continue(); });
    await openOptions();
    await page.locator('#helpBtn').click();
    await page.locator('#helpModal').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await page.locator('#helpModal').waitFor({ state: 'detached' });
    const helpResponse = page.waitForResponse(response => response.url().endsWith('/help.html'));
    releaseHelp();
    await (await helpResponse).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(await page.locator('#helpModal').count() === 0, 'Delayed Help content reopened a dismissed dialog');

    check(errors.length === 0, 'Browser errors', errors);
    console.log('File panel PL/EN labels and keyboard actions, sibling row controls, Settings/Help focus management, nested Settings file panel, and 390px layout passed');
  } catch (error) {
    await page?.screenshot({ path: path.join(output, 'error.png'), fullPage: true }).catch(() => {});
    console.error(error.stack || error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
