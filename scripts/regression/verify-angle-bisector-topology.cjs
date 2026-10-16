const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { zipSync, strToU8 } = require('fflate');
const out = path.resolve(__dirname, '../../output/playwright/angle-bisector-topology');
fs.mkdirSync(out, { recursive: true });
const result = { checks: [], errors: [] };
const check = (name, passed, data) => {
  result.checks.push({ name, passed: !!passed, data });
  if (!passed) throw Error(name + ': ' + JSON.stringify(data));
};
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5215, strictPort: true } });
  await server.listen();
  let browser, page;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    for (const input of ['points', 'segments', 'angle']) {
      page = await browser.newPage({ viewport: { width: 1100, height: 850 }, serviceWorkers: 'block' });
      page.on('pageerror', e => result.errors.push(e.message));
      await page.route('**/src/main.ts*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + `\nwindow.__bis={state:()=>({runtime,selectedPointId,selectedLineId,selectedSegments:[...selectedSegments]}),worldToCanvas,hits:findLineHits,angleGeometry,serialize:serializeCurrentDocument};` });
      });
      await page.goto('http://127.0.0.1:5215/', { waitUntil: 'networkidle' });
      if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();
      const state = () => page.evaluate(() => window.__bis.state());
      const screen = p => page.evaluate(p => {
        const q = window.__bis.worldToCanvas(p.x, p.y), r = document.getElementById('canvas').getBoundingClientRect();
        return { x: r.x + q.x, y: r.y + q.y };
      }, p);
      const click = async p => {
        const q = await screen(p);
        if (await page.evaluate(q => document.elementFromPoint(q.x, q.y)?.id, q) !== 'canvas') throw Error('Obscured canvas input');
        await page.mouse.click(q.x, q.y);
      };
      const add = async p => {
        const before = await state(); await page.locator('#modeAdd').click(); await click(p);
        return Object.keys((await state()).runtime.points).find(id => !before.runtime.points[id]);
      };
      const V = await add({ x: 300, y: 500 }), A = await add({ x: 600, y: 500 }), B = await add({ x: 300, y: 200 });
      if (input === 'segments') {
        for (const p of [{ x: 600, y: 500 }, { x: 300, y: 200 }]) {
          await page.locator('#modeSegment').click(); await click({ x: 300, y: 500 }); await click(p);
        }
      } else if (input === 'angle') {
        await page.locator('#modeAngle').click();
        for (const p of [{ x: 600, y: 500 }, { x: 300, y: 500 }, { x: 300, y: 200 }]) await click(p);
      }
      await page.locator('#modeBisector').click();
      if (input === 'points') {
        for (const p of [{ x: 600, y: 500 }, { x: 300, y: 500 }, { x: 300, y: 200 }]) await click(p);
      } else if (input === 'segments') {
        await click({ x: 450, y: 500 }); await click({ x: 300, y: 350 });
      } else {
        const p = await page.evaluate(() => {
          const a = Object.values(window.__bis.state().runtime.angles)[0], g = window.__bis.angleGeometry(a);
          const mid = g.start + g.span / 2;
          return { x: g.v.x + Math.cos(mid) * g.radius, y: g.v.y + Math.sin(mid) * g.radius };
        });
        await click(p);
      }
      let s = await state(), line = Object.values(s.runtime.lines).find(l => l.bisector), id = line?.id;
      check(input + ': ray has only the actual vertex and no finite segment', !!id && line.points.join() === V && line.segmentStyles.length === 0, line);
      const initialDocument = await page.evaluate(() => window.__bis.serialize());
      const position = (runtime, distance) => {
        const v = runtime.points[V], h = runtime.points[runtime.lines[id].bisector.bisectPoint];
        const length = Math.hypot(h.x-v.x, h.y-v.y);
        return { x: v.x + (h.x-v.x)*distance/length, y: v.y + (h.y-v.y)*distance/length };
      };
      const hits = p => page.evaluate(p => window.__bis.hits(p), p);
      for (const distance of [2, 4, 7, 16, 60]) {
        check(input + ': no helper segment at distance ' + distance, (await hits(position(s.runtime, distance))).some(h => h.lineId === id && h.part === 'rayRight'));
      }
      const P = await add(position(s.runtime, 150)), Q = await add(position(s.runtime, 250));
      s = await state(); line = s.runtime.lines[id];
      check(input + ': actual points create exactly two real intervals', line.points.join() === [V,P,Q].join() && line.segmentStyles.length === 2, line);
      const selectPart = async (p, expected) => {
        await page.locator('#modeMove').click(); await click({ x: 80, y: 200 });
        await click(p); await click(p);
        check(input + ': selected intended line part ' + expected, (await state()).selectedSegments.length === 1 && (await state()).selectedSegments[0].includes(expected === 'segment' ? ':s:' : expected), await state());
      };
      await selectPart(position(s.runtime, 190), 'segment');
      if (!await page.locator('#styleColor').isVisible()) await page.locator('#styleMenu').click();
      await page.locator('#styleColor').evaluate(el => { el.value = '#ff5500'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      check(input + ': styles the interval between user points', (await state()).runtime.lines[id].segmentStyles[1].color === '#ff5500');
      await page.locator('#styleMenu').click();
      await selectPart(position(s.runtime, 320), 'rayRight'); await page.locator('#hideButton').click();
      check(input + ': hiding the outward ray retains the two finite intervals', (await state()).runtime.lines[id].rightRay.hidden && (await state()).runtime.lines[id].segmentStyles.every(style => !style.hidden));
      await page.locator('#undo').click(); check(input + ': undo restores outward ray', !(await state()).runtime.lines[id].rightRay.hidden);
      await page.locator('#redo').click(); check(input + ': redo hides outward ray', (await state()).runtime.lines[id].rightRay.hidden);
      await page.locator('#modeMove').click(); await click({ x: 80, y: 200 });
      const from = await screen((await state()).runtime.points[A]);
      await page.mouse.move(from.x,from.y); await page.mouse.down(); await page.mouse.move(from.x+50,from.y-50,{steps:18}); await page.mouse.up();
      s = await state(); line = s.runtime.lines[id];
      const v=s.runtime.points[V],h=s.runtime.points[line.bisector.bisectPoint],p=s.runtime.points[P];
      const error=Math.abs((p.x-v.x)*(h.y-v.y)-(p.y-v.y)*(h.x-v.x))/Math.hypot(h.x-v.x,h.y-v.y);
      check(input + ': source drag moves the construction and keeps points constrained and styles stable', Math.hypot(s.runtime.points[A].x-600,s.runtime.points[A].y-500)>40 && line.geometryValid!==false && error<1e-5 && line.segmentStyles[1].color==='#ff5500' && line.rightRay.hidden,{error,line});
      for (const point of [P,Q]) {
        await page.locator('#modeMove').click(); await click((await state()).runtime.points[point]); await page.locator('#deletePoint').click();
      }
      line=(await state()).runtime.lines[id];
      check(input + ': deleting subdivisions preserves vertex and ray definition', line?.points.join()===V && line.segmentStyles.length===0,line);
      const document = initialDocument;
      const bytes=zipSync({'angle-bisector.json':strToU8(JSON.stringify(document))}),name='angle-bisector.ctr';
      fs.writeFileSync(path.join(out,input+'.ctr'),bytes);
      await page.locator('#modeMove').click(); await click({x:80,y:200});
      await page.evaluate(({name,bytes})=>{const file=new File([new Uint8Array(bytes)],name,{type:'application/zip'}),handle={kind:'file',name,getFile:async()=>file};window.showDirectoryPicker=async()=>({kind:'directory',name:'angle-bisector',queryPermission:async()=>'granted',requestPermission:async()=>'granted',async *values(){yield handle;},async *entries(){yield[name,handle];}});},{name,bytes:Array.from(bytes)});
      await page.locator('#cloudFilesBtn').click(); await page.locator('#localFileList [data-change-folder]').click(); await page.locator('#localFileList .cloud-file-item').filter({hasText:'angle-bisector'}).click(); await page.locator('#cloudCloseBtn').click();
      line=(await state()).runtime.lines[id];
      check(input + ': file reload preserves real subdivisions and excludes the helper', !!line && line.points.join()===V && (line.segmentStyles??[]).length===0 && line.defining_points.includes(line.bisector.bisectPoint),line);
      check(input + ': reloaded ray starts at the vertex without a helper gap', (await hits(position((await state()).runtime,2))).some(hit=>hit.lineId===id&&hit.part==='rayRight'));
      await page.screenshot({path:path.join(out,input+'.png')}); await page.close(); page=null;
    }
    check('No browser exceptions',result.errors.length===0,result.errors);
  } catch(e) {
    result.errors.push(e.stack||String(e)); process.exitCode=1;
    await page?.screenshot({path:path.join(out,'error.png')}).catch(()=>{});
  } finally {
    await browser?.close(); await server.close(); fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
  }
  console.log(JSON.stringify({checks:result.checks.length,passed:result.checks.filter(c=>c.passed).length,errors:result.errors}));
  if(result.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
