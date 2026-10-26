const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../../output/playwright/bound-measurements');fs.mkdirSync(out,{recursive:true});
const results={checks:[],errors:[]};
const check=(name,passed,data)=>{results.checks.push({name,passed:!!passed,data});if(!passed)throw Error(name+': '+JSON.stringify(data));};
(async()=>{
 const {createServer}=await import('vite');const server=await createServer({server:{host:'127.0.0.1',port:5220,strictPort:true}});await server.listen();let browser,page;
 try{
  browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true,serviceWorkers:'block'});
  page.on('pageerror',error=>results.errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('geometry.grid',JSON.stringify({visible:false}));localStorage.setItem('geometry.lang','pl');localStorage.setItem('measurementPrecisionLength','1');localStorage.setItem('measurementPrecisionAngle','1');});
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
   window.__measurements={load:applyPersistedDocument,save:serializeCurrentDocument,worldToCanvas,angle:getAngleValue,
    state:()=>({runtime,measurementLabels,measurementScale,showMeasurements,historyIndex,selectedLabel}),
    selectSources:()=>{setMode('multiselect');clearSelectionState();clearMultiSelection();Object.keys(runtime.lines).forEach(id=>multiSelectedLines.add(id));Object.keys(runtime.angles).forEach(id=>multiSelectedAngles.add(id));updateSelectionButtons();draw();}
   };`});});
  await page.goto('http://127.0.0.1:5220/',{waitUntil:'networkidle'});if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  const state=()=>page.evaluate(()=>window.__measurements.state());
  const load=doc=>page.evaluate(doc=>window.__measurements.load(doc),doc);
  const screen=p=>page.evaluate(p=>{const q=window.__measurements.worldToCanvas(p.x,p.y),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.x+q.x,y:r.y+q.y};},p);
  const click=async(p,touch=false)=>{const q=await screen(p);if(await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.id,q)!=='canvas')throw Error('Obscured target '+JSON.stringify({p,q}));if(touch)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);};
  const toggle=async()=>{if(!await page.locator('#showMeasurementsBtn').isVisible())await page.locator('#zoomMenu').click();await page.locator('#showMeasurementsBtn').click();if(await page.locator('#optionsMenuContainer').evaluate(el=>el.classList.contains('open')))await page.locator('#zoomMenu').click();};
  const pin=async(targetId,touch=false)=>{const label=(await state()).measurementLabels.find(l=>l.targetId===targetId);check('Measurement target is available: '+targetId,!!label);await click(label.pos,touch);await page.waitForFunction(id=>window.__measurements.state().measurementLabels.some(l=>l.id===id&&l.pinned),label.id);};
  const fixture={model:{points:[{id:'A',x:200,y:440},{id:'B',x:500,y:440},{id:'C',x:200,y:200}],lines:[{id:'base',points:['A','B']},{id:'side',points:['A','C']}],angles:[{id:'angle',vertex:'A',point1:'B',point2:'C'}]}};
  await load(fixture);await toggle();
  await click((await state()).measurementLabels.find(l=>l.targetId==='base-seg0').pos);
  await page.locator('#measurementValueInput').fill('6');await page.locator('#measurementValueInput').press('Enter');
  check('Calibration sets a fixed pixel-to-unit scale',(await state()).measurementScale===50);
  await pin('base-seg0');await pin('angle');await toggle();
  let s=await state(),labels=Object.values(s.runtime.labels),length=labels.find(l=>l.measurement?.kind==='segment'),angle=labels.find(l=>l.measurement?.kind==='angle');
  check('Pinned measurements retain source bindings after closing the preview',labels.length===2&&length?.measurement.lineId==='base'&&angle?.measurement.angleId==='angle',labels);
  check('Initial values use the chosen scale and degrees',length.text==='6.0'&&angle.text==='90.0°',labels);
  const drag=async(from,to)=>{const a=await screen(from),b=await screen(to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();};
  const oldLengthPos={...length.pos};
  await drag(s.runtime.points.B,{x:540,y:440});
  s=await state();length=s.runtime.labels[length.id];
  check('Pinned length updates after changing its own calibration side',length.text==='6.8',length);
  check('Length annotation follows the measured side',Math.abs(length.pos.x-oldLengthPos.x-20)<1e-4&&Math.abs(length.pos.y-oldLengthPos.y)<1e-4,{before:oldLengthPos,after:length.pos});
  await page.locator('#undo').click();check('Undo restores the previous measurement',(await state()).runtime.labels[length.id].text==='6.0');
  await page.locator('#redo').click();check('Redo restores the changed measurement',(await state()).runtime.labels[length.id].text==='6.8');
  s=await state();await drag(s.runtime.points.C,{x:260,y:260});
  s=await state();angle=s.runtime.labels[angle.id];const actualAngle=await page.evaluate(()=>window.__measurements.angle('angle'));
  check('Pinned angle updates from its defining arms',angle.text===actualAngle.toFixed(1)+'°'&&angle.text!=='90.0°',angle);
  length=s.runtime.labels[length.id];const placed={x:length.pos.x+10,y:length.pos.y-25};await drag(length.pos,placed);
  s=await state();length=s.runtime.labels[length.id];
  check('A bound label can still be repositioned',Math.hypot(length.pos.x-placed.x,length.pos.y-placed.y)<1e-4,length);
  check('Computed text remains protected while formatting is available',await page.locator('#labelText').evaluate(el=>el.readOnly));
  const saved=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__measurements.save())));
  await load(saved);s=await state();
  check('Native reload keeps the fixed scale and live values',s.measurementScale===50&&s.runtime.labels[length.id].text==='6.8'&&s.runtime.labels[angle.id].text===angle.text,s);
  await toggle();await pin('base-seg0');await toggle();
  check('Repeating pinning does not duplicate a bound annotation',Object.keys((await state()).runtime.labels).length===2);
  await page.evaluate(()=>window.__measurements.selectSources());await page.locator('#multiCloneBtn').click();await page.locator('#multiCloneBtn').click();
  s=await state();const copies=Object.values(s.runtime.labels).filter(l=>![length.id,angle.id].includes(l.id));
  const copyLength=copies.find(l=>l.measurement?.kind==='segment'),copyAngle=copies.find(l=>l.measurement?.kind==='angle');
  check('Copying source objects includes bound labels automatically',copies.length===2&&copyLength?.measurement.lineId!=='base'&&copyAngle?.measurement.angleId!=='angle',copies);
  const copiedText=copyLength.text;
  await page.locator('#modeMove').click();s=await state();await drag(s.runtime.points.B,{x:530,y:440});s=await state();
  check('Copied measurements depend on copied sources only',s.runtime.labels[length.id].text==='6.6'&&s.runtime.labels[copyLength.id].text===copiedText,{original:s.runtime.labels[length.id],copy:s.runtime.labels[copyLength.id]});
  await page.screenshot({path:path.join(out,'desktop.png')});
  // A native reload at mobile size exercises pinning and bound labels with touch.
  await page.setViewportSize({width:390,height:844});await load(fixture);await toggle();
  await click((await state()).measurementLabels.find(l=>l.targetId==='base-seg0').pos,true);
  await page.locator('#measurementValueInput').fill('6');await page.locator('#measurementValueInput').press('Enter');
  await pin('base-seg0',true);await pin('angle',true);await toggle();
  s=await state();check('Touch pins both source-bound measurement kinds',Object.values(s.runtime.labels).filter(l=>l.measurement).length===2);
  await page.screenshot({path:path.join(out,'mobile.png')});
  check('No browser exceptions',results.errors.length===0,results.errors);
 }catch(error){results.errors.push(error.stack||String(error));process.exitCode=1;await page?.screenshot({path:path.join(out,'error.png')}).catch(()=>{});}
 finally{await browser?.close();await server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,errors:results.errors}));if(results.errors.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
