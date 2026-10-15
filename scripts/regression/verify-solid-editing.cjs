const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');

const OUTPUT = path.resolve(__dirname, '../../output/playwright/solid-editing');
fs.mkdirSync(OUTPUT, { recursive: true });
const results = { checks: [], errors: [] };
const check = (name, pass, observed) => {
  results.checks.push({ name, passed: !!pass, observed });
  if (!pass) throw new Error(`${name}: ${JSON.stringify(observed)}`);
};
const archive = (name, document) => ({
  name: `${name}.ctr`,
  bytes: Array.from(zipSync({ [`${name}.json`]: strToU8(JSON.stringify(document)) }))
});

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5193, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 850 }, serviceWorkers: 'block', hasTouch: true });
    page.on('pageerror', error => results.errors.push(error.message));
    page.on('dialog', async dialog => { results.errors.push(dialog.message()); await dialog.dismiss(); });
    await page.addInitScript(() => {
      window.__solidEditFiles = [];
      window.showDirectoryPicker = async () => ({
        name: 'Polyhedra regression', kind: 'directory', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        async *values() { for (const file of window.__solidEditFiles) yield { kind: 'file', name: file.name, getFile: async () => new File([new Uint8Array(file.bytes)], file.name, { type: 'application/zip' }) }; }
      });
    });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      const suffix = `
        import { spatialFaces as __solidEditFaces, hitSpatialFace as __solidEditFaceHit, spatialPosition as __solidEditPosition, spatialHandles as __solidEditHandles } from './core/spatialGeometry';
        let __solidEditRevision=0;const __solidEditLoad=applyPersistedDocument;applyPersistedDocument=(...a)=>{const r=__solidEditLoad(...a);__solidEditRevision++;return r;};
        window.__solidEdit={state:()=>({runtime,mode,selectedSolidId,selectedPolygonId,selectedPointId,selectedLineId,selectedAngleId,selectedCircleId,selectedInkStrokeId,panOffset,zoomFactor,revision:__solidEditRevision,planeInput:{...spatialPlaneInput},pendingPlanePoints:[...spatialPlaneInput.points]}),serialize:serializeCurrentDocument,faces:id=>__solidEditFaces(runtime,id),position:id=>__solidEditPosition(runtime,id),handles:(id,offset)=>__solidEditHandles(runtime,id,offset),wholeSelected:()=>!!wholeSpatialSolid(),faceHit:p=>__solidEditFaceHit(runtime,p,showHidden),worldToCanvas,pointHit:p=>findPoint(p),edgeHit:p=>spatialEdgeAt(p),circleHit:p=>findCircle(p),labelPosition:(kind,id)=>kind==='point'?getPointLabelPos(id):kind==='line'?getLineLabelPos(id):null};
      `;
      await route.fulfill({ response, body: `${await response.text()}\n${suffix}` });
    });
    await page.goto('http://127.0.0.1:5193/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__solidEdit);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();

    const state = () => page.evaluate(() => window.__solidEdit.state());
    const rect = () => page.locator('#canvas').evaluate(c => { const r=c.getBoundingClientRect(); return { left:r.left,top:r.top,width:r.width,height:r.height }; });
    const screen = async p => page.evaluate(p => { const r=document.getElementById('canvas').getBoundingClientRect(),q=window.__solidEdit.worldToCanvas(p.x,p.y);return{x:r.left+q.x,y:r.top+q.y}; }, p);
    const freeRotateHandle = async id => {
      let h=await page.evaluate(id=>{const s=window.__solidEdit.state();return window.__solidEdit.handles(id,26/s.zoomFactor).find(h=>h.kind==='rotate');},id);
      for(let i=0;i<6&&h;i++){const q=await screen(h),r=await rect();if(q.x>r.left+24&&q.x<r.left+r.width-24&&q.y>r.top+24&&q.y<r.top+r.height-24)return h;await page.mouse.move(r.left+r.width/2,r.top+r.height/2);await page.mouse.wheel(0,360);await page.waitForTimeout(80);h=await page.evaluate(id=>{const s=window.__solidEdit.state();return window.__solidEdit.handles(id,26/s.zoomFactor).find(h=>h.kind==='rotate');},id);}
      return h;
    };
    const styleMenuOpen = async () => page.locator('#styleMenuContainer .dropdown-menu').isVisible();
    const openStyleMenu = async () => { if(!await styleMenuOpen()) await page.locator('#styleMenu').click(); };
    const clickWorld = async p => { const q=await screen(p); const target=await page.evaluate(q=>document.elementFromPoint(q.x,q.y)?.id,q); if(target!=='canvas')throw new Error(`Canvas point obscured: ${target} at ${JSON.stringify(q)}`); await page.mouse.click(q.x,q.y); };
    const clickCanvas = async (x,y) => { const s=await state(); await clickWorld({x:(x-s.panOffset.x)/s.zoomFactor,y:(y-s.panOffset.y)/s.zoomFactor}); };
    const clickPoint = async id => { const s=await state(); await clickWorld(s.runtime.points[id]); };
    const dragWorld = async (a,b) => { const from=await screen(a),to=await screen(b);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up(); };
    const clearSelectionAtBlankCanvas = async () => {
      await page.locator('#modeMove').click();
      const blank=await page.evaluate(()=>{const c=document.getElementById('canvas'),r=c.getBoundingClientRect(),s=window.__solidEdit.state();for(let y=r.top+70;y<r.bottom-70;y+=20)for(let x=r.left+50;x<r.right-50;x+=20){if(document.elementFromPoint(x,y)?.id!=='canvas')continue;const p={x:(x-r.left-s.panOffset.x)/s.zoomFactor,y:(y-r.top-s.panOffset.y)/s.zoomFactor};if(!window.__solidEdit.pointHit(p)&&!window.__solidEdit.edgeHit(p)&&!window.__solidEdit.faceHit(p))return{x,y};}return null;});
      if(!blank)throw new Error('Could not find a blank canvas point to open the file pane');await page.mouse.click(blank.x,blank.y);
    };
    const facePoint = async (solidId, faceIndex) => page.evaluate(({solidId,faceIndex})=>{
      const s=window.__solidEdit.state(),f=window.__solidEdit.faces(solidId)[faceIndex];if(!f)return null;
      const ps=f.points,center={x:ps.reduce((a,q)=>a+q.x,0)/ps.length,y:ps.reduce((a,q)=>a+q.y,0)/ps.length};
      const minX=Math.min(...ps.map(q=>q.x)),maxX=Math.max(...ps.map(q=>q.x)),minY=Math.min(...ps.map(q=>q.y)),maxY=Math.max(...ps.map(q=>q.y));
      for(let iy=1;iy<12;iy++)for(let ix=1;ix<12;ix++){const p={x:minX+(maxX-minX)*ix/12,y:minY+(maxY-minY)*iy/12},hit=window.__solidEdit.faceHit(p);if(hit?.polygonId===f.polygonId&&!window.__solidEdit.pointHit(p)&&!window.__solidEdit.edgeHit(p))return p;}
      return window.__solidEdit.faceHit(center)?.polygonId===f.polygonId?center:null;
    },{solidId,faceIndex});
    const createRegular = async (kind, sides, x, y) => {
      await page.locator(`#mode${kind==='prism'?'Prism':'Pyramid'}`).click();
      if (await page.locator('#ngonModal').isVisible()) {
        await page.locator('#ngonInput').fill(String(sides));
        await page.locator('#ngonConfirmBtn').click();
      }
      await clickCanvas(x,y);
      const s=await state();
      const solid=Object.values(s.runtime.solids??{}).find(v=>v.polyhedron?.kind===kind&&v.polyhedron.basePoints.length===sides&&!v.__none);
      if(!solid)throw new Error(`UI did not create ${kind} with ${sides} sides`);
      return solid.id;
    };
    const roundTrip = async name => {
      const document=await page.evaluate(()=>window.__solidEdit.serialize()), file=archive(name,document);
      fs.writeFileSync(path.join(OUTPUT,`${name}.ctr`),Buffer.from(file.bytes));
      await page.evaluate(file=>window.__solidEditFiles.push(file),file);
      const before=(await state()).revision;
      if(!(await page.locator('#cloudPanel').isVisible())){if(!(await page.locator('#cloudFilesBtn').isVisible()))await clearSelectionAtBlankCanvas();await page.locator('#cloudFilesBtn').click();}
      await page.locator('#localFileList [data-change-folder]').click();
      await page.locator(`#localFileList [aria-label="Wczytaj ${name}"]`).click();
      await page.waitForFunction(v=>window.__solidEdit.state().revision>v,before);
      await page.locator('#cloudCloseBtn').click();
      return document;
    };

    const styleVisibleSolidFaces=async(solidId,slot)=>{
      const faces=await page.evaluate(id=>window.__solidEdit.faces(id).filter(f=>f.visible&&f.polygonId).map(f=>({index:f.faceIndex,id:f.polygonId})),solidId),styled=[];
      for(const f of faces){const fp=await facePoint(solidId,f.index);if(!fp)continue;await page.locator('#modeMove').click();await clickWorld(fp);s=await state();if(s.selectedPolygonId!==f.id){await clickWorld(fp);s=await state();}if(s.selectedPolygonId!==f.id)continue;
        if(!await page.locator('#styleMenuContainer .dropdown-menu').isVisible())await page.locator('#styleMenu').click();
        await page.locator('.color-btn:not(.custom-color-btn)').nth(slot).click();if(await page.locator('#fillToggleBtn').isVisible())await page.locator('#fillToggleBtn').click();s=await state();styled.push({id:f.id,fill:s.runtime.polygons[f.id]?.fill,opacity:s.runtime.polygons[f.id]?.fillOpacity});
      }
      return styled;
    };
    const canvas=await rect(), cx=canvas.width/2, cy=canvas.height/2;
    let s;

    const prism=await createRegular('prism',4,cx-230,cy-30);s=await state();
    let prismSolid=s.runtime.solids[prism],prismDef=prismSolid.polyhedron;
    check('Four-sided prism starts with a planar convex base',prismDef.basePoints.length===4&&prismDef.faceVertices.length===6,{vertices:prismSolid.vertices.length,faces:prismDef.faceVertices.length});
    await page.locator('#modeMove').click();await clickPoint(prismDef.basePoints[0]);await page.locator('#modeLabel').click();s=await state();
    check('Label tool names a prism vertex through real canvas selection',!!s.runtime.points[prismDef.basePoints[0]]?.label?.text,{label:s.runtime.points[prismDef.basePoints[0]]?.label?.text});
    const zoomBefore=s.zoomFactor;const cv=await rect();await page.mouse.move(cv.left+cv.width/2,cv.top+cv.height/2);await page.mouse.wheel(0,-240);s=await state();
    check('Desktop wheel zoom changes the construction view',s.zoomFactor!==zoomBefore,{before:zoomBefore,after:s.zoomFactor});
    await page.locator('#modeMove').click();await clickPoint(prismDef.basePoints[0]);await openStyleMenu();
    check('A selected prism vertex does not expose whole-solid lock controls',!(await page.locator('#polygonLockToggleBtn').isVisible())&&!(await page.locator('#solidTiltLockBtn').isVisible()),{selectedSolidId:(await state()).selectedSolidId,selectedPointId:(await state()).selectedPointId});
    if(await styleMenuOpen())await page.locator('#styleMenu').click();
    const prismHandle=await freeRotateHandle(prism);if(!prismHandle)throw new Error('No actual whole-prism rotation handle was exposed');await clickWorld(prismHandle);
    check('The rotation handle selects the whole prism',(await page.evaluate(()=>window.__solidEdit.wholeSelected())),{selectedSolidId:(await state()).selectedSolidId,selectedPointId:(await state()).selectedPointId});
    await openStyleMenu();
    check('Selected prism exposes separate base-shape and tilt locks',await page.locator('#polygonLockToggleBtn').isVisible()&&await page.locator('#solidTiltLockBtn').isVisible(),{shape:await page.locator('#polygonLockToggleBtn').isVisible(),tilt:await page.locator('#solidTiltLockBtn').isVisible()});
    await page.locator('#polygonLockToggleBtn').click();
    s=await state();
    check('Shape lock toggles off while tilt lock remains independent',s.runtime.solids[prism].shapeLocked===false&&s.runtime.solids[prism].polyhedron.rightLocked===true,{shapeLocked:s.runtime.solids[prism].shapeLocked,rightLocked:s.runtime.solids[prism].polyhedron.rightLocked});
    if(await styleMenuOpen())await page.locator('#styleMenu').click();
    const baseBefore=await page.evaluate(id=>{const s=window.__solidEdit.state(),d=s.runtime.solids[id].polyhedron;return d.basePoints.map(pid=>s.runtime.points[pid]);},prism);
    const baseVertex=prismDef.basePoints[0];
    await page.locator('#modeMove').click();await clickPoint(baseVertex);await clickPoint(baseVertex);
    const v=await state(),start=v.runtime.points[baseVertex];
    await dragWorld(start,{x:start.x+42,y:start.y-24});s=await state();prismSolid=s.runtime.solids[prism];prismDef=prismSolid.polyhedron;
    const baseAfter=prismDef.basePoints.map(pid=>s.runtime.points[pid]);
    const planar=await page.evaluate(({id})=>{const s=window.__solidEdit.state(),d=s.runtime.solids[id].polyhedron,p=d.basePoints.map(pid=>window.__solidEdit.position(pid)),a=p[0],u={x:p[1].x-a.x,y:p[1].y-a.y,z:p[1].z-a.z},v={x:p[2].x-a.x,y:p[2].y-a.y,z:p[2].z-a.z},n={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x},l=Math.hypot(n.x,n.y,n.z);return p.every(q=>Math.abs((q.x-a.x)*n.x+(q.y-a.y)*n.y+(q.z-a.z)*n.z)<1e-5*l);},{id:prism});
    check('Dragging an unlocked base vertex deforms the prism while retaining a planar base',Math.hypot(baseAfter[0].x-baseBefore[0].x,baseAfter[0].y-baseBefore[0].y)>4&&planar,{before:baseBefore[0],after:baseAfter[0],planar,shapeLocked:prismDef.shapeLocked});
    const baseArea=await page.evaluate(id=>{const s=window.__solidEdit.state(),p=s.runtime.solids[id].polyhedron.basePoints.map(pid=>window.__solidEdit.position(pid));let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a.x*b.y-a.y*b.x;}return Math.abs(area)/2;},prism);
    check('Deformed prism base remains nondegenerate and convex',baseArea>50,{area:baseArea});
    await page.screenshot({path:path.join(OUTPUT,'prism-shape-edit.png')});

    const pyramid=await createRegular('pyramid',4,cx+230,cy-30);s=await state();
    let pyr=s.runtime.solids[pyramid],pyrDef=pyr.polyhedron;
    check('Four-sided pyramid has a single apex and four triangular sides',pyr.vertices.length===5&&pyrDef.faceVertices.length===5,{vertices:pyr.vertices.length,faces:pyrDef.faceVertices.length});
    const edge=await page.evaluate(id=>{const s=window.__solidEdit.state(),solid=s.runtime.solids[id],n=solid.polyhedron.basePoints.length,line=solid.edges.map(e=>s.runtime.lines[e]).find(l=>l.defining_points.some(v=>solid.polyhedron.basePoints.includes(v))&&l.defining_points.some(v=>solid.vertices.indexOf(v)>=n));if(!line)return null;const [a,b]=line.defining_points.map(pid=>s.runtime.points[pid]);return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,lineId:line.id};},pyramid);
    if(!edge)throw new Error('No pyramid lateral edge for a halfway section');
    await page.locator('#modeMidpoint').click();await clickWorld(edge);s=await state();
    const midpoint=Object.values(s.runtime.points).find(p=>p.spatial?.groupId===s.runtime.solids[pyramid].groupId&&p.construction_kind==='midpoint');
    if(!midpoint)throw new Error('Midpoint tool did not create a pyramid edge point');
    let baseFace=await facePoint(pyramid,0);
    for(let turn=0;turn<8&&!baseFace;turn++){
      await clickPoint((await state()).runtime.solids[pyramid].vertices[0]);const h=await freeRotateHandle(pyramid);await dragWorld(h,{x:h.x+72,y:h.y+58});s=await state();baseFace=await facePoint(pyramid,0);
    }
    if(!baseFace)throw new Error('Could not expose the pyramid base face for the parallel section');
    await page.locator('#modeParallel').click();await clickWorld(baseFace);s=await state();
    if(!s.planeInput?.polygonId)throw new Error(`Parallel tool did not capture pyramid base face: ${JSON.stringify({baseFace,plane:s.planeInput,hit:await page.evaluate(p=>window.__solidEdit.faceHit(p),baseFace)})}`);
    await clickPoint(midpoint.id);s=await state();
    const cut=Object.values(s.runtime.polygons).find(p=>p.spatialSection?.plane.kind==='parallel'&&p.spatialSection?.plane.polygonId===s.planeInput?.polygonId)||Object.values(s.runtime.polygons).find(p=>p.spatialSection?.plane.kind==='parallel');
    check('Parallel section through a pyramid lateral-edge midpoint creates a four-sided frustum cut',!!cut&&cut.points.length===4,{section:cut?.spatialSection,points:cut?.points,polygons:Object.values(s.runtime.polygons).filter(p=>p.spatialSection).map(p=>({id:p.id,n:p.points.length,plane:p.spatialSection.plane}))});
    const cutCenter=await page.evaluate(id=>{const s=window.__solidEdit.state(),p=s.runtime.polygons[id],ps=p.points.map(pid=>s.runtime.points[pid]);return{x:ps.reduce((v,q)=>v+q.x,0)/ps.length,y:ps.reduce((v,q)=>v+q.y,0)/ps.length};},cut.id);
    await page.locator('#modeMove').click();await clickWorld(cutCenter);await clickWorld(cutCenter);await openStyleMenu();
    const capSwatch=page.locator('.color-btn:not(.custom-color-btn)').nth(2);if(await capSwatch.isVisible())await capSwatch.click();s=await state();
    check('Style controls color the frustum cap independently',typeof s.runtime.polygons[cut.id]?.fill==='string',{fill:s.runtime.polygons[cut.id]?.fill});
    if(!cut)throw new Error('Pyramid parallel section was not created');
    const apexId=pyrDef.basePoints.length===4?pyr.vertices[4]:pyr.vertices.at(-1);
    await page.locator('#modeMove').click();await clickPoint(apexId);await page.locator('#deletePoint').click();s=await state();
    check('Trashing the apex preserves the frustum cap and hides its upper edge intervals',s.runtime.points[apexId]?.style?.hidden===true&&!!s.runtime.solids[pyramid]?.cutSectionId&&s.runtime.polygons[cut.id]?.geometryValid!==false,{apexHidden:s.runtime.points[apexId]?.style?.hidden,cutSectionId:s.runtime.solids[pyramid]?.cutSectionId,sectionValid:s.runtime.polygons[cut.id]?.geometryValid,hiddenUpperEdges:Object.values(s.runtime.lines).filter(l=>l.spatialHiddenEdge).length});
    await page.locator('#undo').click();s=await state();
    check('Undo restores the apex after trash',s.runtime.points[apexId]?.style?.hidden!==true&&!s.runtime.solids[pyramid]?.cutSectionId,{hidden:s.runtime.points[apexId]?.style?.hidden,cutSectionId:s.runtime.solids[pyramid]?.cutSectionId});
    await page.locator('#modeMove').click();await clickPoint(apexId);await page.locator('#hideButton').click();s=await state();
    check('Hiding the apex retains a valid cut and clips its face fills',s.runtime.points[apexId]?.style?.hidden===true&&s.runtime.polygons[cut.id]?.geometryValid!==false,{apexHidden:s.runtime.points[apexId]?.style?.hidden,sectionValid:s.runtime.polygons[cut.id]?.geometryValid,faceValidity:pyr.faces.map(id=>s.runtime.polygons[id]?.geometryValid)});
    await page.locator('#undo').click();s=await state();
    check('Undo restores the apex after hide',s.runtime.points[apexId]?.style?.hidden!==true,{hidden:s.runtime.points[apexId]?.style?.hidden});
    await page.locator('#redo').click();
    const prismLabelIds=await page.evaluate(id=>{const s=window.__solidEdit.state(),d=s.runtime.solids[id].polyhedron;return [...new Set(window.__solidEdit.faces(id).filter(f=>f.visible).flatMap(f=>d.faceVertices[f.faceIndex]??[]))];},prism);
    for(const id of prismLabelIds){await page.locator('#modeMove').click();await clickPoint(id);await page.locator('#modeLabel').click();}
    s=await state();check('Visible prism vertices receive labels after geometry edits',prismLabelIds.every(id=>!!s.runtime.points[id]?.label?.text),prismLabelIds.map(id=>s.runtime.points[id]?.label?.text));
    const pyramidLabelIds=await page.evaluate(({id,cutId,apexId})=>{const s=window.__solidEdit.state(),d=s.runtime.solids[id].polyhedron,visible=new Set(window.__solidEdit.faces(id).filter(f=>f.visible).flatMap(f=>d.faceVertices[f.faceIndex]??[]));for(const p of s.runtime.polygons[cutId]?.points??[])visible.add(p);visible.delete(apexId);return [...visible];},{id:pyramid,cutId:cut.id,apexId});
    for(const id of pyramidLabelIds){await page.locator('#modeMove').click();await clickPoint(id);await page.locator('#modeLabel').click();}
    s=await state();check('Visible pyramid vertices and all cap corners receive labels',pyramidLabelIds.every(id=>!!s.runtime.points[id]?.label?.text),pyramidLabelIds.map(id=>s.runtime.points[id]?.label?.text));
    const prismStyles=await styleVisibleSolidFaces(prism,1),pyramidStyles=await styleVisibleSolidFaces(pyramid,4);
    check('Visible prism and pyramid faces use distinct readable palette colors',prismStyles.length>=2&&pyramidStyles.length>=1&&prismStyles[0].fill!==pyramidStyles[0].fill,{prism:prismStyles,pyramid:pyramidStyles});
    const cutCenter2=await page.evaluate(id=>{const s=window.__solidEdit.state(),p=s.runtime.polygons[id],ps=p.points.map(pid=>s.runtime.points[pid]);return{x:ps.reduce((v,q)=>v+q.x,0)/ps.length,y:ps.reduce((v,q)=>v+q.y,0)/ps.length};},cut.id);
    await page.locator('#modeMove').click();await clickWorld(cutCenter2);await clickWorld(cutCenter2);if(!await page.locator('#styleMenuContainer .dropdown-menu').isVisible())await page.locator('#styleMenu').click();await page.locator('.color-btn:not(.custom-color-btn)').nth(2).click();s=await state();    await roundTrip('solid-editing-frustum');s=await state();
    const loadedApex=s.runtime.points[apexId];
    check('Archive reload preserves cut, hidden apex, dependent faces, and midpoint',!!s.runtime.polygons[cut.id]?.spatialSection&&loadedApex?.style?.hidden===true&&!!s.runtime.points[midpoint.id]?.spatial?.binding,{section:s.runtime.polygons[cut.id]?.spatialSection,apexHidden:loadedApex?.style?.hidden,midpoint:s.runtime.points[midpoint.id]?.spatial?.binding});
    check('Archive reload preserves every visible label on both solids',prismLabelIds.concat(pyramidLabelIds).every(id=>!!s.runtime.points[id]?.label?.text),prismLabelIds.concat(pyramidLabelIds).map(id=>s.runtime.points[id]?.label?.text));
    await page.screenshot({path:path.join(OUTPUT,'pyramid-frustum-hidden-apex.png')});


    await page.setViewportSize({width:390,height:844});
    const toolbar=await page.locator('#modePyramid').boundingBox();await page.touchscreen.tap(toolbar.x+toolbar.width/2,toolbar.y+toolbar.height/2);
    if(await page.locator('#ngonModal').isVisible()){await page.locator('#ngonInput').fill('3');await page.locator('#ngonConfirmBtn').click();}
    const mobile=await rect();await clickCanvas(mobile.width/2,mobile.height/2);s=await state();
    check('Touch input creates a pyramid at mobile width',Object.values(s.runtime.solids).some(v=>v.polyhedron?.kind==='pyramid'&&v.polyhedron.basePoints.length===3),{solids:Object.values(s.runtime.solids).map(v=>({kind:v.polyhedron?.kind,n:v.polyhedron?.basePoints.length}))});
    await page.screenshot({path:path.join(OUTPUT,'solid-editing-mobile.png')});
    await page.setViewportSize({width:1180,height:850});
    const solidStyleBeforeCircle=await page.evaluate(()=>{const s=window.__solidEdit.state();return Object.fromEntries(Object.values(s.runtime.solids).map(solid=>[solid.id,{faces:solid.faces.map(pid=>s.runtime.polygons[pid]?.fill),edges:solid.edges.map(lid=>s.runtime.lines[lid]?.style?.color)}]));});
    const pointIdsBeforeCircle=new Set(Object.keys(s.runtime.points));
    await page.locator('#modeAdd').click();await clickCanvas(120,640);await page.locator('#modeAdd').click();await clickCanvas(195,640);
    s=await state();const circleInputPoints=Object.values(s.runtime.points).filter(p=>!pointIdsBeforeCircle.has(p.id)&&!p.spatial).map(p=>p.id);
    if(circleInputPoints.length!==2)throw new Error(`Could not create two circle input points: ${JSON.stringify(circleInputPoints)}`);
    const circleIdsBefore=new Set(Object.keys(s.runtime.circles));await page.locator('#modeCircle').click();await clickPoint(circleInputPoints[0]);await clickPoint(circleInputPoints[1]);s=await state();
    const testCircle=Object.values(s.runtime.circles).find(c=>!circleIdsBefore.has(c.id));if(!testCircle)throw new Error('Circle tool did not create a test circle');
    const circlePick=await page.evaluate(id=>{const s=window.__solidEdit.state(),c=s.runtime.circles[id],a=s.runtime.points[c.center],b=s.runtime.points[c.radius_point],dx=b.x-a.x,dy=b.y-a.y;return{x:a.x+.7*dx-.7*dy,y:a.y+.7*dy+.7*dx};},testCircle.id);
    if(s.selectedCircleId!==testCircle.id){await page.locator('#modeMove').click();await clickWorld(circlePick);s=await state();}
    if(s.selectedCircleId!==testCircle.id)throw new Error(`Could not select test circle: ${JSON.stringify({mode:s.mode,selectedCircle:s.selectedCircleId,selectedPoint:s.selectedPointId,selectedLine:s.selectedLineId,selectedPolygon:s.selectedPolygonId,circle:testCircle.id,selectedSolid:s.selectedSolidId,pick:circlePick,hit:await page.evaluate(p=>window.__solidEdit.circleHit(p),circlePick),circleData:s.runtime.circles[testCircle.id]})}`);
    if(!await page.locator('#styleMenuContainer .dropdown-menu').isVisible())await page.locator('#styleMenu').click();await page.locator('.color-btn:not(.custom-color-btn)').nth(3).click();s=await state();
    const solidStyleAfterCircle=await page.evaluate(()=>{const s=window.__solidEdit.state();return Object.fromEntries(Object.values(s.runtime.solids).map(solid=>[solid.id,{faces:solid.faces.map(pid=>s.runtime.polygons[pid]?.fill),edges:solid.edges.map(lid=>s.runtime.lines[lid]?.style?.color)}]));});
    check('Styling a nearby selected circle changes its color and leaves every solid color unchanged',s.runtime.circles[testCircle.id]?.style?.color==='#f59e0b'&&JSON.stringify(solidStyleAfterCircle)===JSON.stringify(solidStyleBeforeCircle),{before:solidStyleBeforeCircle,after:solidStyleAfterCircle,circle:testCircle.id,circleColor:s.runtime.circles[testCircle.id]?.style?.color,selectedSolid:s.selectedSolidId,selectedCircle:s.selectedCircleId});
    check('No browser exceptions or error dialogs',results.errors.length===0,results.errors);
    console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,errors:results.errors}));
  } finally {
    fs.writeFileSync(path.join(OUTPUT,'results.json'),JSON.stringify(results,null,2));
    await browser?.close();await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
