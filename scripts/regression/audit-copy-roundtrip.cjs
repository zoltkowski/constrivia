const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { unzipSync, strFromU8 } = require('fflate');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const output = path.resolve(__dirname, '../../output/playwright/copy-audit-roundtrip');
fs.mkdirSync(output, { recursive: true });
const base = path.resolve(__dirname, '../../output/playwright');
const paths = process.argv.slice(2).filter(p => !p.startsWith('--'));
const defaults = [
  'copy-audit-dependencies/midpoint-follows-original.ctr',
  'copy-audit-dependencies/parallel-follows-original.ctr',
  'copy-audit-2d/intersection-point-copy.ctr',
  'copy-audit-2d/angle-copy.ctr',
  'copy-audit-3d/copy-audit-3d.ctr',
  'copy-audit-ui/copy-audit.ctr',
  'copy-audit-extras/copy-audit-extras.ctr'
];
// Generate native fixtures on a clean checkout instead of depending on checked-in output.
if (!paths.length) {
  const generators = new Set(defaults.filter(name => !fs.existsSync(path.join(base, name))).map(name => {
    const folder = name.split('/')[0];
    return folder === 'copy-audit-dependencies' ? 'audit-copy-dependencies.cjs'
      : folder === 'copy-audit-2d' ? 'audit-copy-2d.cjs'
      : folder === 'copy-audit-3d' ? 'audit-copy-3d.cjs'
      : folder === 'copy-audit-extras' ? 'audit-copy-extras.cjs' : 'audit-copy-ui.cjs';
  }));
  for (const script of generators) execFileSync(process.execPath, [path.join(__dirname, script)], { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit' });
}
const files = (paths.length ? paths.map(p => path.resolve(p)) : defaults.map(p => path.join(base, p))).map(filename => {
  if (!fs.existsSync(filename)) throw new Error(`Run the copy audits first: missing fixture ${filename}`);
  const bytes = fs.readFileSync(filename), entries = unzipSync(bytes);
  const json = Object.entries(entries).find(([name]) => name.endsWith('.json'));
  if (!json) throw new Error(`No JSON document in ${filename}`);
  return { name: path.basename(filename), bytes: Array.from(bytes), document: JSON.parse(strFromU8(json[1])) };
});
const result = { checks: [], errors: [] };
const dependencyKeys = ['parent_refs', 'defining_parents', 'defining_points', 'midpointMeta', 'symmetricMeta', 'bisectMeta', 'parallel', 'perpendicular', 'bisector', 'arm1', 'arm2', 'vertex', 'point1', 'point2', 'center', 'radius_point', 'spatial', 'spatialGroupId', 'spatialSection', 'solidFace'];
const signature = record => Object.fromEntries(dependencyKeys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
const check = (name, passed, observed) => result.checks.push({ name, passed, observed });

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5199, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, serviceWorkers: 'block' });
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('dialog', async dialog => { result.errors.push(dialog.message()); await dialog.dismiss(); });
    await page.addInitScript(files => {
      window.showDirectoryPicker = async () => ({
        name: 'Copy audit archives', kind: 'directory', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        async *values() {
          for (const file of files) yield { kind: 'file', name: file.name, getFile: async () => new File([new Uint8Array(file.bytes)], file.name, { type: 'application/zip' }) };
        }
      });
    }, files.map(({ name, bytes }) => ({ name, bytes })));
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      const suffix = `let auditLoadRevision=0;const originalAuditLoad=applyPersistedDocument;applyPersistedDocument=(...args)=>{const value=originalAuditLoad(...args);auditLoadRevision++;return value;};window.__archiveAudit={revision:()=>auditLoadRevision,serialize:serializeCurrentDocument};`;
      await route.fulfill({ response, body: `${await response.text()}\n${suffix}` });
    });
    await page.goto('http://127.0.0.1:5199/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__archiveAudit);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
    for (const file of files) {
      const revision = await page.evaluate(() => window.__archiveAudit.revision());
      await page.locator('#cloudFilesBtn').click();
      await page.locator('#localFileList [data-change-folder]').click();
      await page.locator(`[aria-label="Wczytaj ${file.name.replace(/\.ctr$/, '')}"]`).click();
      await page.waitForFunction(previous => window.__archiveAudit.revision() > previous, revision);
      await page.locator('#cloudCloseBtn').click();
      const actual = (await page.evaluate(() => window.__archiveAudit.serialize())).model;
      const expected = file.document.model;
      const differences = [];
      for (const kind of ['points', 'lines', 'circles', 'angles', 'polygons', 'inkStrokes', 'labels']) {
        const wanted = expected[kind] || [], got = actual[kind] || [];
        if (wanted.map(item => item.id).sort().join() !== got.map(item => item.id).sort().join()) differences.push(`${kind}: IDs differ`);
        for (const source of wanted) {
          const restored = got.find(item => item.id === source.id);
          if (!restored) continue;
          if (JSON.stringify(signature(source)) !== JSON.stringify(signature(restored))) differences.push(`${kind}/${source.id}: dependency metadata differs`);
          if (kind === 'points' && Math.hypot(source.x - restored.x, source.y - restored.y) > 1e-6) differences.push(`${kind}/${source.id}: coordinates differ`);
          for (const key of ['style', 'segmentStyles', 'segmentKeys', 'leftRay', 'rightRay', 'fill', 'fillOpacity', 'label', 'arcStyles', 'hidden', 'points', 'pos', 'text', 'color', 'baseWidth']) {
            // Loading makes the default left label alignment explicit; it does not change presentation.
            const expectedValue=key==='label'&&source[key]?{...source[key],textAlign:source[key].textAlign??'left'}:source[key];
            const actualValue=key==='label'&&restored[key]?{...restored[key],textAlign:restored[key].textAlign??'left'}:restored[key];
            if (source[key] !== undefined && !isDeepStrictEqual(expectedValue,actualValue)) differences.push({object:`${kind}/${source.id}`,field:key,expected:source[key],actual:restored[key]});
          }
        }
      }
      for (const kind of ['solids', 'spatialGroups']) if (JSON.stringify(expected[kind] || {}) !== JSON.stringify(actual[kind] || {})) differences.push(`${kind}: definitions differ`);
      check(`${file.name}: native UI import preserves IDs, dependencies, positions and presentation`, differences.length === 0, { differences });
    }
  } catch (error) { result.errors.push(error.stack || String(error)); }
  finally {
    await browser?.close(); await server.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(result, null, 2));
  }
  const failed = result.checks.filter(check => !check.passed);
  console.log(JSON.stringify({ checks: result.checks.length, failed, errors: result.errors }));
  if (result.errors.length || (process.argv.includes('--verify') && failed.length)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
