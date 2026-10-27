const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../../output/playwright/animated-curves');fs.mkdirSync(output,{recursive:true});
const expected=['SINUSOIDA','ELIPSA','CYKLOIDA','TROCHOIDA SKRÓCONA','TROCHOIDA WYDŁUŻONA','KARDIOIDA','NEFROIDA','DELTOIDA','ASTROIDA','ÓSEMKA GERONA','FIGURA LISSAJOUS','SPIRALA LOGARYTMICZNA','PARABOLA'];
(async()=>{
 const {createServer}=await import('vite'),server=await createServer({server:{host:'127.0.0.1',port:5266,strictPort:true}});await server.listen();let browser;
 try{
  browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const page=await browser.newPage({viewport:{width:1200,height:900},hasTouch:true,serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.route('**/api/json/list',r=>r.fulfill({json:{result:[]}}));
  await page.route('**/src/main.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
   window.__curves={
    state:()=>({index:currentCtrBundle?.index,pages:currentCtrBundle?.entries.length,points:runtime.points,labels:runtime.labels,
      motions:[...animationMotions],traces:[...pointTraces],enabled:animationEnabled,playing:animationPlaying,ended:animationEnded}),
    save:serializeCurrentDocument,refit:()=>{centerConstruction();draw();},
    preview:(count,dt)=>{const records=[];if(!animationBegin())return {ok:false,records};
      for(let i=0;i<count;i++){const ok=animationAdvance(dt);const p=runtime.points.p??runtime.points['wheel-point'],c=runtime.points.center;
        records.push({x:p?.x,y:p?.y,cx:c?.x,cy:c?.y,valid:p?.geometryValid});if(!ok){animationEnded=true;break;}}
      updateAnimationUI();return {ok:true,records};},
    viewport:()=>{const v=availableCanvasViewport(canvas),lab=runtime.labels.opis,p=worldToCanvas(lab.pos.x,lab.pos.y),dim=getLabelScreenDimensions(ctx,lab,labelFontSizePx);
      const trace=[...pointTraces.values()].find(t=>t.enabled),samples=trace?.samples.filter(Boolean).map(p=>worldToCanvas(p.x,p.y))??[];
      const player=document.getElementById('animationPlayer'),r=player.getBoundingClientRect(),cr=canvas.getBoundingClientRect();
      return{v,label:{x:p.x,y:p.y-dim.height/2,right:p.x+dim.width,bottom:p.y+dim.height/2},player:{layout:player.dataset.layout,hidden:player.hidden,left:r.left-cr.left,right:r.right-cr.left,top:r.top-cr.top,bottom:r.bottom-cr.top},samples,zoom:zoomFactor};}
   };`});});
  await page.goto('http://127.0.0.1:5266/',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__curves);
  if(await page.locator('#swDismissBtn').isVisible())await page.locator('#swDismissBtn').click();
  await page.locator('#cloudFilesBtn').click();await page.locator('#cloudPanel [data-tab="library"]').click();
  await page.getByRole('button',{name:'Wczytaj krzywe-w-ruchu',exact:true}).click();await page.waitForFunction(()=>window.__curves.state().pages===13);
  if(await page.locator('#cloudCloseBtn').isVisible())await page.locator('#cloudCloseBtn').click();
  const state=()=>page.evaluate(()=>window.__curves.state());
  await page.locator('#animationStep').click();
  assert.ok((await state()).traces.some(([,t])=>t.enabled&&t.samples.length>1),'Step did not draw the saved trace');
  await page.locator('#animationStop').click();
  assert.ok((await state()).traces.every(([,t])=>t.samples.length<=1),'Stop did not clear the trace');
  for(let i=0;i<expected.length;i++){
   let s=await state();assert.equal(s.index,i);assert.ok(s.labels.opis.text.includes(expected[i]),'Missing description '+expected[i]);
   assert.ok(s.enabled&&s.motions.length>=1&&s.traces.some(([,t])=>t.enabled),'Page lacks animation or trace '+expected[i]);
   assert.ok(!await page.locator('#animationPlay').isDisabled()&&!await page.locator('#animationStep').isDisabled(),'Player disabled on '+expected[i]);
   const initial=await page.evaluate(()=>window.__curves.save());assert.ok(initial.model.points.some(p=>p.traceEnabled===true));assert.ok(!JSON.stringify(initial).includes('samples'));
   const result=await page.evaluate(({n})=>window.__curves.preview(n,.1),{n:i===11?150:120});assert.ok(result.ok,'Could not start '+expected[i]);
   const records=result.records;assert.ok(records.length>=50&&records.every(p=>p.valid!==false&&Number.isFinite(p.x)&&Number.isFinite(p.y)),'Invalid trace '+expected[i]);
   const xs=records.map(p=>p.x),ys=records.map(p=>p.y);
   assert.ok(Math.max(...xs)-Math.min(...xs)>25&&Math.max(...ys)-Math.min(...ys)>25,'Degenerate curve '+expected[i]);
   for(let k=0;k<records.length;k++){
    const p=records[k],t=(k+1)*.1,omega=Math.PI/6;
    if(i===0)assert.ok(Math.abs(p.y-(65-43*Math.sin((p.x+75)/43)))<.15,'Not a sinusoid');
    if(i===1)assert.ok(Math.abs((p.x/105)**2+((p.y-70)/60)**2-1)<.01,'Not an ellipse');
    if(i>=2&&i<=4){const radius=55,ratio=[1,.5,2][i-2],distance=p.cx+Math.PI*radius,phase=distance/radius;
      assert.ok(Math.hypot(p.x-(p.cx-ratio*radius*Math.sin(phase)),p.y-(65+ratio*radius*Math.cos(phase)))<.2,'Rolling curve is not synchronized: '+expected[i]);}
    if(i>=5&&i<=8){const radii=[[55,55,false],[70,35,false],[120,40,true],[120,30,true]][i-5],R=radii[0],r=radii[1],inside=radii[2],orbit=R+(inside?-r:r),phase=omega*t;
      const x=orbit*Math.cos(phase)+(inside?1:-1)*r*Math.cos(orbit/r*phase),y=70-orbit*Math.sin(phase)+r*Math.sin(orbit/r*phase);
      assert.ok(Math.hypot(p.x-x,p.y-y)<.3,'Rolling-circle geometry is not synchronized: '+expected[i]);}
    if(i===9){const u=(p.x/105)**2;assert.ok(Math.abs(((p.y-70)/65)**2-4*u*(1-u))<.015,'Not a Gerono figure eight');}
    if(i===10)assert.ok(Math.hypot(p.x-105*Math.cos(2*omega*t),p.y-(70+65*Math.cos(3*omega*t)))<.3,'Not a 2:3 Lissajous figure');
    if(i===12)assert.ok(Math.abs(p.y-(70-p.x*p.x/320))<.15,'Not a parabola');
   }
   const saved=await page.evaluate(()=>window.__curves.save());assert.ok(saved.model.points.some(p=>p.traceEnabled)&&!JSON.stringify(saved).includes('samples'),'Trace settings/samples were saved incorrectly');
   for(const [name,width,height] of [['desktop',1200,900],['tablet',820,1180],['phone',390,844]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>window.__curves.refit());await page.waitForTimeout(80);
    const view=await page.evaluate(()=>window.__curves.viewport());const l=view.label;
    assert.ok(l.x>=0&&l.right<=width&&l.y>=view.v.top&&l.bottom<=view.v.bottom,'Description clipped on '+name+' page '+(i+1)+': '+JSON.stringify(view.label));
    assert.ok(Math.abs(l.x-(view.v.left+16))<1 && l.y<=view.v.top+90,'Description is not in the upper left on '+name+' page '+(i+1));
    const b=view.player;
    assert.ok(b.hidden||b.layout!=='floating'||l.right<=b.left||l.x>=b.right||l.bottom<=b.top||l.y>=b.bottom,'Description overlaps player on '+name+' page '+(i+1)+': '+JSON.stringify({label:l,player:b,viewport:view.v}));
    assert.ok(view.samples.length>=50,'Trace missing on '+name+' page '+(i+1));
    assert.ok(view.samples.every(p=>p.x>=view.v.left-2&&p.x<=view.v.right+2&&p.y>=view.v.top-2&&p.y<=view.v.bottom+2),'Trace outside viewport on '+name+' page '+(i+1));
    assert.ok(view.samples.every(p=>p.x<l.x-2||p.x>l.right+2||p.y<l.y-2||p.y>l.bottom+2),'Trace overlaps the description on '+name+' page '+(i+1));
    await page.screenshot({path:path.join(output,`${String(i+1).padStart(2,'0')}-${name}.png`)});
   }
   await page.setViewportSize({width:1200,height:900});
   if(i<expected.length-1){await page.locator('#bundleNextBtn').click();await page.waitForFunction(index=>window.__curves.state().index===index,i+1);}
   console.log(`${i+1}/${expected.length} ${expected[i]}: ${records.length} frames, formulas and three viewports passed`);
  }
  assert.deepEqual(errors,[]);await page.close();
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
