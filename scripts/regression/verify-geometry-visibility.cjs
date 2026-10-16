const fs = require('node:fs');
const path = require('node:path');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output/playwright');
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const out=path.join(OUTPUT_ROOT,'geometry-visibility');
fs.mkdirSync(out,{recursive:true});

(async()=>{
  const {createServer}=await import('vite');
  const server=await createServer({server:{host:'127.0.0.1',port:5177,strictPort:true}});
  await server.listen();
  const browser=await chromium.launch({channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),headless:true});
  const errors=[],results={};
  try{
    const page=await browser.newPage({viewport:{width:1100,height:800},serviceWorkers:'block'});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/src/main.ts*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+`\nwindow.__visibility={
        state:()=>runtime,load:applyPersistedDocument,serialize:serializeCurrentDocument,recompute:recomputeAllConstraints,
        move:(id,target)=>{const engine=toEngineState(runtime);movePointAndRecompute(engine,id,target);applyEngineState(runtime,engine,{points:true,lines:true,circles:true});clearSelectionState();draw();},
        showHidden:value=>{showHidden=value;clearSelectionState();draw();},
        project:worldToCanvas,findPoint,findLineHits,
        pixelAt:(p)=>{const c=worldToCanvas(p.x,p.y),ctx=canvas.getContext('2d');const x=Math.round(c.x*dpr),y=Math.round(c.y*dpr);const pixels=ctx.getImageData(x-2,y-2,5,5).data;let blue=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+2]>150&&pixels[i+1]>70&&pixels[i]<80)blue++;return {blue,screen:c};}
      };`});
    });
    // Keep exact-coordinate construction fixtures independent of optional grid snapping.
    await page.addInitScript(() => localStorage.setItem('geometry.grid', JSON.stringify({ visible: false })));
    await page.goto('http://127.0.0.1:5177/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.__visibility);
    const tangents=JSON.parse(fs.readFileSync(path.join(OUTPUT_ROOT,'../../test/fixtures/classical/tangents.json'),'utf8'));
    await page.evaluate(document=>{const r=window.__visibility;r.load(document);r.state().points.pt5.style.hidden=true;r.move('pt3',{x:740,y:300});r.move('pt3',{x:410,y:350});},tangents);
    results.inside=await page.evaluate(()=>{
      const r=window.__visibility,rt=r.state();
      const line=rt.lines.ln2,T=rt.points[line.perpendicular.throughPoint],U=rt.points[line.perpendicular.helperPoint];
      const len=Math.hypot(U.x-T.x,U.y-T.y),dir={x:(U.x-T.x)/len,y:(U.y-T.y)/len},O=rt.points.pt1;
      let witness=null;
      for(const d of[120,-120,180,-180,240,-240]){
        const p={x:T.x+dir.x*d,y:T.y+dir.y*d},c=r.project(p.x,p.y);
        if(c.x>40&&c.x<1060&&c.y>75&&c.y<690&&Math.hypot(p.x-O.x,p.y-O.y)>150){witness=p;break;}
      }
      return {witness,circleValid:rt.circles.c1.geometryValid,contacts:['pt5','pt6'].map(id=>({id,valid:rt.points[id].geometryValid,hidden:!!rt.points[id].style.hidden})),tangents:['ln2','ln4'].map(id=>rt.lines[id].geometryValid)};
    });
    assert(results.inside.witness,'No in-canvas witness for stale tangent');
    assert.equal(results.inside.circleValid,true);
    assert(results.inside.contacts.every(p=>p.valid===false));
    assert.deepEqual(results.inside.tangents,[false,false]);
    results.renders=[];
    for(const showHidden of[false,true]){
      const render=await page.evaluate(({showHidden,witness})=>{
        const r=window.__visibility;r.showHidden(showHidden);
        const T=r.state().points.pt5;
        return {showHidden,staleTangent:r.pixelAt(witness),circle:r.pixelAt({x:330,y:230}),pointHit:r.findPoint(T),lineHits:r.findLineHits(witness)};
      },{showHidden,witness:results.inside.witness});
      assert.equal(render.staleTangent.blue,0,'Invalid tangent was rendered');
      assert(render.circle.blue>0,'Valid circle disappeared with its invalid contact points');
      assert.equal(render.pointHit,null);
      assert(!render.lineHits.some(hit=>['ln2','ln4'].includes(hit.lineId)));
      results.renders.push(render);
    }
    await page.screenshot({path:path.join(out,'inside-show-hidden.png')});
    const saved=await page.evaluate(()=>window.__visibility.serialize());
    assert(!JSON.stringify(saved).includes('geometryValid'),'Transient validity leaked into saved document');
    fs.writeFileSync(path.join(out,'inside-saved.json'),JSON.stringify(saved,null,2));
    results.reloaded=await page.evaluate(document=>{
      const r=window.__visibility;r.load(document);
      const imported={pointHidden:r.state().points.pt5.style.hidden,contactValid:r.state().points.pt5.geometryValid,tangentValid:r.state().lines.ln2.geometryValid};
      r.move('pt3',{x:740,y:450});
      return {imported,recovered:{pointHidden:r.state().points.pt5.style.hidden,contactValid:r.state().points.pt5.geometryValid,tangentValid:r.state().lines.ln2.geometryValid}};
    },saved);
    assert.deepEqual(results.reloaded.imported,{pointHidden:true,contactValid:false,tangentValid:false});
    assert.deepEqual(results.reloaded.recovered,{pointHidden:true,contactValid:true,tangentValid:true});

    results.parallel=await page.evaluate(()=>{
      const r=window.__visibility;
      r.load({model:{points:[{id:'pt1',x:100,y:300},{id:'pt2',x:500,y:300},{id:'pt3',x:300,y:200},{id:'pt4',x:300,y:500},{id:'pt5',x:300,y:300,construction_kind:'intersection',parent_refs:[{kind:'line',id:'ln1'},{kind:'line',id:'ln2'}]}],lines:[{id:'ln1',points:['pt1','pt5','pt2'],defining_points:['pt1','pt2']},{id:'ln2',points:['pt3','pt5','pt4'],defining_points:['pt3','pt4']}]}});
      r.state().points.pt4.x=600;r.state().points.pt4.y=200;r.recompute();r.showHidden(true);
      const rt=r.state();
      return {intersectionValid:rt.points.pt5.geometryValid,baselineValid:rt.lines.ln1.geometryValid,baselinePixel:r.pixelAt({x:200,y:300}),baselineHits:r.findLineHits({x:200,y:300})};
    });
    assert.equal(results.parallel.intersectionValid,false);
    assert.equal(results.parallel.baselineValid,true);
    assert(results.parallel.baselinePixel.blue>0,'Parent line disappeared at invalid subdivision');
    assert(results.parallel.baselineHits.some(hit=>hit.lineId==='ln1'));
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({results,errors},null,2));
  }finally{await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
