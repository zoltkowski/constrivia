const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../../output/playwright/animation');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const {createServer}=await import('vite'); const server=await createServer({server:{host:'127.0.0.1',port:5258,strictPort:true}}); await server.listen(); let browser;
 try {
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`\nwindow.__traceTest={load:doc=>applyPersistedDocument(doc),select:id=>{selectedPointId=id;updateSelectionButtons();updateStyleMenuValues();draw();},move:(id,x,y)=>{const engine=toEngineState(runtime);movePointAndRecompute(engine,id,{x,y});applyEngineState(runtime,engine,{points:true,lines:true,circles:true});draw();},samples:id=>pointTraces.get(id)?.samples};`});});
  await page.goto('http://127.0.0.1:5258/',{waitUntil:'networkidle'}); await page.waitForFunction(()=>window.__traceTest);
  await page.evaluate(()=>{window.__traceTest.load({model:{points:[{id:'a',x:100,y:100},{id:'b',x:200,y:100},{id:'m',x:150,y:100,construction_kind:'midpoint',midpointMeta:{parents:['a','b']}}],lines:[],circles:[]}});window.__traceTest.select('m');});
  await page.locator('#styleMenu').click();await page.locator('#pointTraceEnabled').check();
  await page.screenshot({path:path.join(output,'trace-style.png')});
  await page.evaluate(()=>window.__traceTest.move('a',140,100));
  const samples=await page.evaluate(()=>window.__traceTest.samples('m'));
  if(samples.length<2 || Math.abs(samples.at(-1).x-170)>0.01) throw Error('Dependent point trace did not follow movement');
  await page.locator('#pointTraceClear').click();
  if((await page.evaluate(()=>window.__traceTest.samples('m'))).length!==1) throw Error('Clear did not reset the trace');
  await page.locator('#pointTraceEnabled').uncheck();
  await page.evaluate(()=>window.__traceTest.move('a',160,100));
  if((await page.evaluate(()=>window.__traceTest.samples('m'))).filter(Boolean).length!==1) throw Error('Disabled trace continued recording');
  console.log('Point trace: dependent motion, clearing and disabling passed');
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
