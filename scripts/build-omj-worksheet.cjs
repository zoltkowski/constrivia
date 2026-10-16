// Rebuild the library worksheet from the reviewed task transcription.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');
const tasks = JSON.parse(fs.readFileSync(path.resolve('materials/omj-geometria-zadania.json'), 'utf8'));

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5196, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('geometry.grid', JSON.stringify({ visible: true })));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + '\nwindow.__worksheet = {load:applyPersistedDocument};' });
    });
    await page.goto('http://127.0.0.1:5196/', { waitUntil: 'networkidle' });
    const entries = {};
    const output = path.resolve('output/omj/worksheet');
    fs.mkdirSync(output, { recursive: true });
    const seen = new Set();
    tasks.sort((a, b) => a.year - b.year || a.number - b.number);
    for (const [index, task] of tasks.entries()) {
      const key = `${task.year}-${task.number}`;
      assert.ok(!seen.has(key), `Duplicate task: ${key}`);
      seen.add(key);
      const layout = await page.evaluate(async text => {
        const { measureFormattedText, getLabelScreenDimensions } = await import('/src/canvas/renderer.ts');
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = '16px sans-serif';
        const lines = [];
        let line = '';
        // Keep short mathematical relations together when wrapping prose.
        const words = text.match(/[A-Z]{1,4}\s*(?:=|>|<|≥|≠)\s*(?:[A-Z]{1,4}|\d+°?)[.,;:]?|n\s*≥\s*\d+[.,;:]?|\S+/gu) || [];
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (line && measureFormattedText(ctx, next) > 700) {
            lines.push(line);
            line = word;
          } else line = next;
        }
        if (line) lines.push(line);
        const wrapped = lines.join('\n');
        const dimensions = getLabelScreenDimensions(ctx, { text: wrapped, fontSize: 16 }, () => 16);
        return { text: wrapped, height: dimensions.height };
      }, task.text);
      const description = `zadanie ${task.number} OMJ etap II ${task.year}r.`;
      const doc = {
        version: 1, title: `OMJ ${task.year} - zadanie ${task.number}`,
        source: { description, file: task.file, page: 1 },
        model: { points: [], labels: [
          { id: 'lab1', text: description, pos: { x: 65, y: 0 }, fontSize: 12, color: '#0284c7', textAlign: 'left' },
          { id: 'lab2', text: layout.text, pos: { x: 65, y: 26 + layout.height / 2 }, fontSize: 16, color: '#718096', textAlign: 'left' }
        ] }
      };
      const name = `${String(index + 1).padStart(2, '0')}-OMJ-${task.year}-zadanie-${task.number}.json`;
      entries[name] = strToU8(JSON.stringify(doc, null, 2));
      await page.evaluate(doc => window.__worksheet.load(doc), doc);
      await page.screenshot({ path: path.join(output, `${key}.png`) });
    }
    assert.deepEqual(errors, []);
    // Keep the existing library URL stable as the collection grows.
    const target = path.resolve('public/content/omj-geometria-etap-II-2005-2024.ctr');
    fs.writeFileSync(target, zipSync(entries, { level: 9 }));
    console.log(`Built ${tasks.length} pages: ${target}`);
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
