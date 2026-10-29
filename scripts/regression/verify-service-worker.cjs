const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

// Exercise the shipped worker in a real browser; cloud responses stay local.
const workerSource = fs.readFileSync(path.resolve(__dirname, '../../public/sw.js'));
const output = path.resolve(__dirname, '../../output/playwright/service-worker');
const results = [];
let drawing = 'initial drawing';
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/sw.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(workerSource);
  } else if (pathname === '/api/json/list') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(drawing === null ? [] : ['drawing.ctr']));
  } else if (pathname === '/api/json/drawing.ctr') {
    if (request.method === 'PUT') { drawing = 'saved drawing'; response.end('OK'); }
    else if (request.method === 'DELETE') { drawing = null; response.end('Deleted'); }
    else { response.statusCode = drawing === null ? 404 : 200; response.end(drawing ?? 'Not found'); }
  } else if (pathname === '/asset.txt') {
    response.setHeader('Content-Type', 'text/plain');
    response.end('offline asset');
  } else {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Worker regression</title><main>Offline shell</main>');
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      // Simulate cloud entries left by the previous worker version.
      for (const version of ['v6', 'v7']) {
        const cache = await caches.open(`constrivia-static-${version}`);
        await cache.put('/api/json/list', new Response('["obsolete.ctr"]'));
        await cache.put('/api/json/drawing.ctr', new Response('obsolete drawing'));
      }
    });
    const read = pathname => page.evaluate(async pathname => {
      const response = await fetch(pathname);
      return { status: response.status, text: await response.text() };
    }, pathname);
    assert.deepEqual(await read('/api/json/list'), { status: 200, text: '["drawing.ctr"]' });
    assert.equal((await read('/api/json/drawing.ctr')).text, 'initial drawing');
    results.push('Old cached API lists and files are ignored');
    await page.evaluate(() => fetch('/api/json/drawing.ctr', { method: 'PUT' }));
    assert.equal((await read('/api/json/drawing.ctr')).text, 'saved drawing');
    results.push('Reopening a saved cloud file reads the new bytes');
    await page.evaluate(() => fetch('/api/json/drawing.ctr', { method: 'DELETE' }));
    assert.deepEqual(await read('/api/json/list'), { status: 200, text: '[]' });
    assert.equal((await read('/api/json/drawing.ctr')).status, 404);
    results.push('Deleted cloud files disappear and return the real 404');
    assert.equal((await read('/asset.txt')).text, 'offline asset');
    await page.waitForFunction(async () => !!await (await caches.open('constrivia-static-v7')).match('/asset.txt'));
    // Populate the navigation cache under the active controller.
    await page.reload();
    await context.setOffline(true);
    assert.equal((await read('/asset.txt')).text, 'offline asset');
    await page.reload();
    assert.equal(await page.locator('main').textContent(), 'Offline shell');
    results.push('Static assets and the application shell remain available offline');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ passed: true, results }, null, 2));
    console.log(results.map(result => `PASS ${result}`).join('\n'));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
