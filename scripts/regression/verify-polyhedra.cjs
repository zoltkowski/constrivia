const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');

const OUTPUT = path.resolve(__dirname, '../../output/playwright/polyhedra');
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
  const server = await createServer({ server: { host: '127.0.0.1', port: 5192, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const page = await browser.newPage({ viewport: { width: 1180, height: 850 }, serviceWorkers: 'block', hasTouch: true });
    page.on('pageerror', error => results.errors.push(error.message));
    page.on('dialog', async dialog => { results.errors.push(dialog.message()); await dialog.dismiss(); });
    await page.addInitScript(() => {
      window.__polyFiles = [];
      window.showDirectoryPicker = async () => ({
        name: 'Polyhedra regression', kind: 'directory', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        async *values() { for (const file of window.__polyFiles) yield { kind: 'file', name: file.name, getFile: async () => new File([new Uint8Array(file.bytes)], file.name, { type: 'application/zip' }) }; }
      });
    });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      const suffix = `
        import { spatialFaces as __polyFaces, hitSpatialFace as __polyFaceHit, spatialPosition as __polyPosition, spatialHandles as __polyHandles } from './core/spatialGeometry';
        let __polyRevision=0;const __polyLoad=applyPersistedDocument;applyPersistedDocument=(...a)=>{const r=__polyLoad(...a);__polyRevision++;return r;};
        window.__poly={state:()=>({runtime,mode,selectedSolidId,selectedPolygonId,selectedPointId,selectedLineId,selectedAngleId,panOffset,zoomFactor,revision:__polyRevision,planeInput:{...spatialPlaneInput},pendingPlanePoints:[...spatialPlaneInput.points]}),serialize:serializeCurrentDocument,redraw:draw,faces:id=>__polyFaces(runtime,id),position:id=>__polyPosition(runtime,id),handles:(id,offset)=>__polyHandles(runtime,id,offset),wholeSelected:()=>!!wholeSpatialSolid(),faceHit:p=>__polyFaceHit(runtime,p,showHidden),worldToCanvas,pointHit:p=>findPoint(p),edgeHit:p=>spatialEdgeAt(p),labelPosition:(kind,id)=>kind==='point'?getPointLabelPos(id):kind==='line'?getLineLabelPos(id):null};
      `;
      await route.fulfill({ response, body: `${await response.text()}\n${suffix}` });
    });
    await page.goto('http://127.0.0.1:5192/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__poly);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();

    const state = () => page.evaluate(() => window.__poly.state());
    const rect = () => page.locator('#canvas').evaluate(c => { const r=c.getBoundingClientRect(); return { left:r.left,top:r.top,width:r.width,height:r.height }; });
    const screen = async p => page.evaluate(p => { const r=document.getElementById('canvas').getBoundingClientRect(),q=window.__poly.worldToCanvas(p.x,p.y);return{x:r.left+q.x,y:r.top+q.y}; }, p);
    const freeRotateHandle = async id => {
      let h=await page.evaluate(id=>{const s=window.__poly.state();return window.__poly.handles(id,26/s.zoomFactor).find(h=>h.kind==='rotate');},id);
      for(let i=0;i<6&&h;i++){const q=await screen(h),r=await rect();if(q.x>r.left+24&&q.x<r.left+r.width-24&&q.y>r.top+24&&q.y<r.top+r.height-24)return h;await page.mouse.move(r.left+r.width/2,r.top+r.height/2);await page.mouse.wheel(0,360);await page.waitForTimeout(80);h=await page.evaluate(id=>{const s=window.__poly.state();return window.__poly.handles(id,26/s.zoomFactor).find(h=>h.kind==='rotate');},id);}
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
      const blank=await page.evaluate(()=>{const c=document.getElementById('canvas'),r=c.getBoundingClientRect(),s=window.__poly.state();for(let y=r.top+70;y<r.bottom-70;y+=20)for(let x=r.left+50;x<r.right-50;x+=20){if(document.elementFromPoint(x,y)?.id!=='canvas')continue;const p={x:(x-r.left-s.panOffset.x)/s.zoomFactor,y:(y-r.top-s.panOffset.y)/s.zoomFactor};if(!window.__poly.pointHit(p)&&!window.__poly.edgeHit(p)&&!window.__poly.faceHit(p))return{x,y};}return null;});
      if(!blank)throw new Error('Could not find a blank canvas point to open the file pane');await page.mouse.click(blank.x,blank.y);
    };
    const facePoint = async (solidId, faceIndex) => page.evaluate(({solidId,faceIndex})=>{
      const s=window.__poly.state(),f=window.__poly.faces(solidId)[faceIndex];if(!f)return null;
      const ps=f.points,center={x:ps.reduce((a,q)=>a+q.x,0)/ps.length,y:ps.reduce((a,q)=>a+q.y,0)/ps.length};
      const minX=Math.min(...ps.map(q=>q.x)),maxX=Math.max(...ps.map(q=>q.x)),minY=Math.min(...ps.map(q=>q.y)),maxY=Math.max(...ps.map(q=>q.y));
      for(let iy=1;iy<12;iy++)for(let ix=1;ix<12;ix++){const p={x:minX+(maxX-minX)*ix/12,y:minY+(maxY-minY)*iy/12},hit=window.__poly.faceHit(p);if(hit?.polygonId===f.polygonId&&!window.__poly.pointHit(p)&&!window.__poly.edgeHit(p))return p;}
      return window.__poly.faceHit(center)?.polygonId===f.polygonId?center:null;
    },{solidId,faceIndex});
    const createRegular = async (kind, sides, x, y) => {
      await page.locator(`#mode${kind==='prism'?'Prism':'Pyramid'}`).click();
      if (await page.locator('#ngonModal').isVisible()) {
        const preset=page.locator(`.ngon-preset-btn[data-n="${sides}"]`);
        if(await preset.count()) await preset.click();
        else { await page.locator('#ngonInput').fill(String(sides)); await page.locator('#ngonConfirmBtn').click(); }
      }
      await clickCanvas(x,y);
      const s=await state();
      const solid=Object.values(s.runtime.solids??{}).find(v=>v.polyhedron?.kind===kind&&v.polyhedron.basePoints.length===sides&&!v.__none);
      if(!solid)throw new Error(`UI did not create ${kind} with ${sides} sides`);
      return solid.id;
    };
    const roundTrip = async name => {
      const document=await page.evaluate(()=>window.__poly.serialize()), file=archive(name,document);
      fs.writeFileSync(path.join(OUTPUT,`${name}.ctr`),Buffer.from(file.bytes));
      await page.evaluate(file=>window.__polyFiles.push(file),file);
      const before=(await state()).revision;
      if(!(await page.locator('#cloudPanel').isVisible())){if(!(await page.locator('#cloudFilesBtn').isVisible()))await clearSelectionAtBlankCanvas();await page.locator('#cloudFilesBtn').click();}
      await page.locator('#localFileList [data-change-folder]').click();
      await page.locator(`#localFileList [aria-label="Wczytaj ${name}"]`).click();
      await page.waitForFunction(v=>window.__poly.state().revision>v,before);
      await page.locator('#cloudCloseBtn').click();
      return document;
    };

    const canvas=await rect(), cx=canvas.width/2, cy=canvas.height/2;
    const prism3=await createRegular('prism',3,cx-230,cy-10);
    let s=await state(), solid=s.runtime.solids[prism3], poly=solid.polyhedron;
    check('Three-sided prism has six vertices, nine edges, and five faces',solid.vertices.length===6&&solid.edges.length===9&&poly.faceVertices.length===5,{vertices:solid.vertices.length,edges:solid.edges.length,faces:poly.faceVertices.length});
    check('Prism stores a regular base and its right-angle definition',poly.basePoints.length===3&&Math.abs(Math.hypot(poly.normal.x,poly.normal.y,poly.normal.z)-1)<1e-6&&poly.rightLocked===true,{basePoints:poly.basePoints,normal:poly.normal,height:poly.height,rightLocked:poly.rightLocked});
    await page.locator('#undo').click();
    check('Undo removes the prism and its construction geometry',!((await state()).runtime.solids??{})[prism3],Object.keys((await state()).runtime.solids??{}));
    await page.locator('#redo').click();s=await state();
    check('Redo restores stable prism vertices, edges, and faces',!!s.runtime.solids[prism3]&&s.runtime.solids[prism3].vertices.length===6&&s.runtime.solids[prism3].polyhedron.faceVertices.length===5,{solid:s.runtime.solids[prism3]?.id});

    const pyramid5=await createRegular('pyramid',5,cx+210,cy-10);
    s=await state();solid=s.runtime.solids[pyramid5];poly=solid.polyhedron;
    check('Five-sided pyramid has six vertices, ten edges, and six faces',solid.vertices.length===6&&solid.edges.length===10&&poly.faceVertices.length===6,{vertices:solid.vertices.length,edges:solid.edges.length,faces:poly.faceVertices.length});
    const prism5=await createRegular('prism',5,cx,150);
    s=await state();solid=s.runtime.solids[prism5];
    check('Five-sided prism has ten vertices, fifteen edges, and seven faces',solid.vertices.length===10&&solid.edges.length===15&&solid.polyhedron.faceVertices.length===7,{vertices:solid.vertices.length,edges:solid.edges.length,faces:solid.polyhedron.faceVertices.length});
    const prism4=await createRegular('prism',4,cx+380,cy+210);
    s=await state();solid=s.runtime.solids[prism4];
    check('The shared 4-side preset creates a square prism from the solid tool',solid.polyhedron.basePoints.length===4&&solid.vertices.length===8&&solid.polyhedron.faceVertices.length===6,{basePoints:solid.polyhedron.basePoints.length,vertices:solid.vertices.length,faces:solid.polyhedron.faceVertices.length});
    await openStyleMenu();
    check('Whole-solid selection exposes styling and both independent lock controls',await page.locator('#polygonLockToggleBtn').isVisible()&&await page.locator('#solidTiltLockBtn').isVisible()&&await page.locator('#styleColorRow').isVisible(),{selectedSolidId:(await state()).selectedSolidId,colorVisible:await page.locator('#styleColorRow').isVisible()});
    const wholeColorBefore=(await state()).runtime.polygons[(await state()).runtime.solids[prism4].faces[0]].fill;
    const wholeSwatch=page.locator('.color-btn:not(.custom-color-btn)').nth(2);
    if(await wholeSwatch.isVisible())await wholeSwatch.click();
    s=await state();
    const wholeSolid=s.runtime.solids[prism4],wholeFaceFills=wholeSolid.faces.map(id=>s.runtime.polygons[id]?.fill),wholeEdgeColors=wholeSolid.edges.map(id=>s.runtime.lines[id]?.style?.color);
    check('Whole-solid color updates every face and edge through the style controls',wholeFaceFills.every(c=>c&&c!==wholeColorBefore)&&new Set(wholeFaceFills).size===1&&wholeEdgeColors.every(c=>c===wholeFaceFills[0]),{before:wholeColorBefore,faceFills:wholeFaceFills,edgeColors:wholeEdgeColors});
    if(await page.locator('#fillToggleBtn').isVisible())await page.locator('#fillToggleBtn').click();
    s=await state();
    check('Whole-solid fill control applies fill to each face',s.runtime.solids[prism4].faces.every(id=>(s.runtime.polygons[id]?.fillOpacity??0)>0),{fillOpacity:s.runtime.solids[prism4].faces.map(id=>s.runtime.polygons[id]?.fillOpacity)});
    if(await styleMenuOpen()) await page.locator('#styleMenu').click();

    const deformPyramid=await createRegular('pyramid',3,cx+360,cy-250);
    const deformBaseForLock=(await state()).runtime.solids[deformPyramid].polyhedron.basePoints[0];
    await page.locator('#modeMove').click(); await clickPoint(deformBaseForLock); await openStyleMenu();
    check('A selected pyramid vertex does not expose whole-solid locks',!(await page.locator('#polygonLockToggleBtn').isVisible())&&!(await page.locator('#solidTiltLockBtn').isVisible()),{selectedSolidId:(await state()).selectedSolidId,selectedPointId:(await state()).selectedPointId});
    const deformWholeHandle=await freeRotateHandle(deformPyramid); if(!deformWholeHandle)throw new Error('No actual whole-solid rotation handle was exposed'); await clickWorld(deformWholeHandle);
    check('The rotation handle selects the whole pyramid for lock controls',(await page.evaluate(()=>window.__poly.wholeSelected())),{selectedSolidId:(await state()).selectedSolidId,selectedPointId:(await state()).selectedPointId});
    await openStyleMenu();
    await page.locator('#polygonLockToggleBtn').click();s=await state();
    check('Shape lock unlocks independently on a new pyramid',s.runtime.solids[deformPyramid].shapeLocked===false,{shapeLocked:s.runtime.solids[deformPyramid].shapeLocked});
    if(await styleMenuOpen())await page.locator('#styleMenu').click();
    const deformFaces=await page.evaluate(id=>window.__poly.faces(id).filter(f=>f.visible&&f.faceIndex>0).map(f=>f.faceIndex),deformPyramid);
    let deformFace,sidePoint=null;for(const index of deformFaces){const candidate=await facePoint(deformPyramid,index);if(candidate){deformFace=index;sidePoint=candidate;break;}}
    if(!sidePoint)throw new Error(`No visible lateral face point on unlocked pyramid: ${JSON.stringify(await page.evaluate(id=>({faces:window.__poly.faces(id),solid:window.__poly.state().runtime.solids[id]}),deformPyramid))}`);
    const sideBefore=await page.evaluate(id=>window.__poly.state().runtime.solids[id].vertices.map(pid=>window.__poly.state().runtime.points[pid]),deformPyramid);
    await clickWorld(sidePoint);await dragWorld(sidePoint,{x:sidePoint.x+65,y:sidePoint.y+42});s=await state();
    const sideAfter=s.runtime.solids[deformPyramid].vertices.map(pid=>s.runtime.points[pid]);
    check('Unlocked lateral face drag deforms the pyramid side',sideAfter.some((p,i)=>Math.hypot(p.x-sideBefore[i].x,p.y-sideBefore[i].y)>1),{before:sideBefore.map(p=>({x:p.x,y:p.y})),after:sideAfter.map(p=>({x:p.x,y:p.y}))});
    const deformBaseVertex=s.runtime.solids[deformPyramid].polyhedron.basePoints[0],baseBefore=s.runtime.points[deformBaseVertex];
    await clickPoint(deformBaseVertex);await dragWorld(baseBefore,{x:baseBefore.x-18,y:baseBefore.y+12});s=await state();
    const baseAfter=s.runtime.points[deformBaseVertex];
    check('Unlocked base vertex drag deforms the base',Math.hypot(baseAfter.x-baseBefore.x,baseAfter.y-baseBefore.y)>3,{before:{x:baseBefore.x,y:baseBefore.y},after:{x:baseAfter.x,y:baseAfter.y}});

    // Exercise the real handle drag and the existing polygon lock button.
    await page.locator('#modeMove').click();
    const pyramidGroup=(await state()).runtime.solids[pyramid5].groupId;
    let fp;
    const beforeOrientation=JSON.stringify((await state()).runtime.spatialGroups[pyramidGroup].orientation);
    await page.locator('#modeMove').click();await clickPoint((await state()).runtime.solids[pyramid5].polyhedron.basePoints[0]);
    let handle=await screen(await freeRotateHandle(pyramid5));await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+34,handle.y+22,{steps:8});await page.mouse.up();
    s=await state();
    check('Dragging the visible rotate handle changes the spatial orientation',JSON.stringify(s.runtime.spatialGroups[pyramidGroup].orientation)!==beforeOrientation,{before:beforeOrientation,after:s.runtime.spatialGroups[pyramidGroup].orientation});
    await page.locator('#modeMove').click();
    const lockFace=await page.evaluate(id=>window.__poly.faces(id).findIndex(f=>f.visible&&f.faceIndex>=2),pyramid5);
    fp=await facePoint(pyramid5,lockFace);if(!fp)throw new Error(`No selectable visible pyramid face for lock control (${lockFace})`);await clickWorld(fp);
    await openStyleMenu();
    const lockUi=await page.locator('#polygonLockToggleBtn').evaluate(el=>({display:getComputedStyle(el).display,parent:getComputedStyle(el.parentElement).display,rect:(()=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height}})()}));
    s=await state();
    check('Selecting one face keeps whole-solid lock controls hidden',s.selectedPolygonId!==null&&!(await page.locator('#polygonLockToggleBtn').isVisible())&&!(await page.locator('#solidTiltLockBtn').isVisible()),{selectedSolidId:s.selectedSolidId,selectedPolygonId:s.selectedPolygonId,lockUi});
    if(await styleMenuOpen())await page.locator('#styleMenu').click();
    const wholeHandleForLocks=await freeRotateHandle(pyramid5);await clickWorld(wholeHandleForLocks);s=await state();await openStyleMenu();
    const wholeAndLockVisibility={whole:await page.evaluate(()=>window.__poly.wholeSelected()),shape:await page.locator('#polygonLockToggleBtn').isVisible(),tilt:await page.locator('#solidTiltLockBtn').isVisible(),menuOpen:await styleMenuOpen()};
    check('Selecting the whole solid exposes base-shape and tilt controls',wholeAndLockVisibility.whole&&wholeAndLockVisibility.shape&&wholeAndLockVisibility.tilt,{...wholeAndLockVisibility,selectedSolidId:s.selectedSolidId,selectedPolygonId:s.selectedPolygonId});
    await page.locator('#solidTiltLockBtn').click();s=await state();
    check('Tilt control unlocks pyramid tilt through the UI',s.runtime.solids[pyramid5].polyhedron.rightLocked===false,{rightLocked:s.runtime.solids[pyramid5].polyhedron.rightLocked});
    if(await styleMenuOpen())await page.locator('#styleMenu').click();

    // Parallel section: choose the visible top face and a midpoint on a lateral edge.
    await page.locator('#modeMove').click();
    fp=await facePoint(prism3,1);await clickWorld(fp);await clickWorld(fp);
    await page.locator('#modeParallel').click();
    const midEdge=await page.evaluate(id=>{const s=window.__poly.state(),solid=s.runtime.solids[id],n=solid.polyhedron.basePoints.length,line=solid.edges.map(e=>s.runtime.lines[e]).find(l=>l.defining_points.some(v=>solid.polyhedron.basePoints.includes(v))&&l.defining_points.some(v=>solid.vertices.indexOf(v)>=n));if(!line)return null;const [a,b]=line.defining_points.map(pid=>s.runtime.points[pid]);return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,lineId:line.id};},prism3);
    if(!midEdge)throw new Error('No prism lateral edge was available for the parallel section');
    await clickWorld(midEdge);
    s=await state();
    const parallelSection=Object.values(s.runtime.polygons).find(p=>p.spatialSection?.plane.kind==='parallel');
    const parallelRatios=parallelSection&&await page.evaluate(({id,polygonId})=>{const s=window.__poly.state(),solid=s.runtime.solids[id],base=window.__poly.position(solid.polyhedron.basePoints[0]),n=solid.polyhedron.normal,h=solid.polyhedron.height;return s.runtime.polygons[polygonId].points.map(pid=>{const p=window.__poly.position(pid);return((p.x-base.x)*n.x+(p.y-base.y)*n.y+(p.z-base.z)*n.z)/h;});},{id:prism3,polygonId:parallelSection.id});
    check('Parallel tool creates a triangular section halfway through a prism',!!parallelSection&&parallelSection.points.length===3&&Object.values(parallelSection.spatialSection.edgePoints).length===3&&parallelRatios.every(t=>Math.abs(t-.5)<.08),{section:parallelSection?.spatialSection,ratios:parallelRatios,points:parallelSection?.points});

    // Unlock and drag the pyramid apex until its projection leaves the base footprint.
    const heightSource=(await state()).runtime.solids[pyramid5].vertices.at(-1);
    await page.locator('#modeMove').click();await clickPoint(heightSource);
    let apex=(await state()).runtime.points[heightSource];
    await dragWorld(apex,{x:apex.x+150,y:apex.y+50});
    s=await state();
    check('Dragging the unlocked pyramid apex tilts its height axis',Math.hypot(s.runtime.solids[pyramid5].polyhedron.offset.x,s.runtime.solids[pyramid5].polyhedron.offset.y,s.runtime.solids[pyramid5].polyhedron.offset.z)>20,{offset:s.runtime.solids[pyramid5].polyhedron.offset,height:s.runtime.solids[pyramid5].polyhedron.height});
    // Rotate via its visible handle until the base face can be selected.
    let baseVisible=false;
    for(let turn=0;turn<6&&!baseVisible;turn++){
      const visible=await page.evaluate(id=>window.__poly.faces(id).find(f=>f.faceIndex===0)?.visible,pyramid5);
      baseVisible=!!visible;if(baseVisible)break;
      s=await state();await clickPoint(s.runtime.solids[pyramid5].vertices[0]);const h=await freeRotateHandle(pyramid5);
      await dragWorld(h,{x:h.x+72,y:h.y+58});
    }
    if(!baseVisible)throw new Error('Could not rotate the pyramid base face into view');
    const basePolygonId=(await state()).runtime.solids[pyramid5].faces[0];
    await page.locator('#modePerpendicular').click();
    fp=await facePoint(pyramid5,0);if(!fp)throw new Error('Visible pyramid base has no selectable interior');await clickWorld(fp);await clickPoint(heightSource);
    s=await state();
    const heightLine=Object.values(s.runtime.lines).find(l=>l.defining_parents?.includes(heightSource)&&l.leftRay?.hidden&&l.rightRay?.hidden);
    const heightFoot=Object.values(s.runtime.points).find(p=>p.spatial?.binding.kind==='planeFoot'&&p.spatial.binding.source===heightSource);
    const footOutsideFace=heightFoot&&await page.evaluate(({footId,polyId})=>{const state=window.__poly.state(),foot=window.__poly.position(footId),poly=state.runtime.polygons[polyId],ps=poly.points.map(id=>window.__poly.position(id));if(!foot||ps.length<3)return false;const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;for(let i=1;i<ps.length-1;i++){const a=ps[0],b=ps[i],c=ps[i+1],v0=sub(b,a),v1=sub(c,a),v2=sub(foot,a),d00=dot(v0,v0),d01=dot(v0,v1),d11=dot(v1,v1),d20=dot(v2,v0),d21=dot(v2,v1),den=d00*d11-d01*d01,u=(d11*d20-d01*d21)/den,v=(d00*d21-d01*d20)/den;if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)return false;}return true;},{footId:heightFoot.id,polyId:basePolygonId});
    check('Perpendicular point-plus-face creates a height whose foot lies outside the base footprint',!!heightLine&&!!heightFoot&&footOutsideFace,{heightLine:heightLine?.id,foot:heightFoot?.id,footOutsideFace,source:heightSource,offset:s.runtime.solids[pyramid5].polyhedron.offset});

    // Re-lock through the real style control. Locking preserves the current tilt;
    // an apex drag changes height without changing that preserved direction.
    await page.locator('#modeMove').click();await clickPoint(heightSource);s=await state();
    check('Selecting the pyramid apex keeps the solid selected',s.selectedSolidId===pyramid5&&s.selectedPointId===heightSource,{selectedSolidId:s.selectedSolidId,selectedPointId:s.selectedPointId});
    await openStyleMenu();
    check('Selecting the apex keeps whole-solid tilt locking hidden',!(await page.locator('#polygonLockToggleBtn').isVisible())&&!(await page.locator('#solidTiltLockBtn').isVisible()),{selectedSolidId:(await state()).selectedSolidId,selectedPointId:(await state()).selectedPointId});
    if(await styleMenuOpen())await page.locator('#styleMenu').click();
    await page.locator('#modeMove').click();const wholeHandle=await freeRotateHandle(pyramid5);await clickWorld(wholeHandle);await openStyleMenu();
    check('Selecting the whole pyramid exposes its tilt lock',(await page.evaluate(()=>window.__poly.wholeSelected()))&&await page.locator('#solidTiltLockBtn').isVisible(),{selectedSolidId:(await state()).selectedSolidId});
    const offsetBeforeRelock={...(await state()).runtime.solids[pyramid5].polyhedron.offset};
    const apexBeforeRelock=await page.evaluate(id=>window.__poly.position(id),heightSource);
    await page.locator('#solidTiltLockBtn').click();s=await state();
    const offsetAfterRelock=s.runtime.solids[pyramid5].polyhedron.offset,apexAfterRelock=await page.evaluate(id=>window.__poly.position(id),heightSource);
    check('Re-locking a tilted pyramid preserves its axis and apex position',s.runtime.solids[pyramid5].polyhedron.rightLocked&&Math.hypot(offsetAfterRelock.x-offsetBeforeRelock.x,offsetAfterRelock.y-offsetBeforeRelock.y,offsetAfterRelock.z-offsetBeforeRelock.z)<1e-8&&Math.hypot(apexAfterRelock.x-apexBeforeRelock.x,apexAfterRelock.y-apexBeforeRelock.y,apexAfterRelock.z-apexBeforeRelock.z)<1e-8,{rightLocked:s.runtime.solids[pyramid5].polyhedron.rightLocked,before:offsetBeforeRelock,after:offsetAfterRelock,apexBefore:apexBeforeRelock,apexAfter:apexAfterRelock});
    await page.locator('#modeMove').click();await clickPoint(heightSource);s=await state();
    const lockedHeightBefore=s.runtime.solids[pyramid5].polyhedron.height, lockedApex=s.runtime.points[heightSource];
    await dragWorld(lockedApex,{x:lockedApex.x,y:lockedApex.y-26});s=await state();
    check('Dragging the locked apex resizes height while preserving the locked axis',Math.abs(s.runtime.solids[pyramid5].polyhedron.height-lockedHeightBefore)>5&&Math.hypot(s.runtime.solids[pyramid5].polyhedron.offset.x-offsetBeforeRelock.x,s.runtime.solids[pyramid5].polyhedron.offset.y-offsetBeforeRelock.y,s.runtime.solids[pyramid5].polyhedron.offset.z-offsetBeforeRelock.z)<1e-8,{before:lockedHeightBefore,after:s.runtime.solids[pyramid5].polyhedron.height,offsetBefore:offsetBeforeRelock,offset:s.runtime.solids[pyramid5].polyhedron.offset});

    // Three points on a prism create a section whose vertices are real, dependent edge points.
    await page.locator('#modeSection').click();
    s=await state();const tri=s.runtime.solids[prism3].polyhedron.basePoints;
    await clickPoint(tri[0]);await clickPoint(s.runtime.solids[prism3].vertices[tri.length]);await clickPoint(s.runtime.solids[prism3].vertices[tri.length+1]);
    s=await state();
    const threePointSection=Object.values(s.runtime.polygons).find(p=>p.spatialSection?.plane.kind==='points');
    check('Three-point section creates a polygon with live edge intersections',!!threePointSection&&threePointSection.points.length>=3&&Object.values(threePointSection.spatialSection.edgePoints).every(id=>s.runtime.points[id]?.spatial?.binding.kind==='sectionEdge'),{section:threePointSection?.spatialSection,points:threePointSection?.points});

    // Move the parallel section's defining edge point with a real canvas gesture.
    const sectionDriver=parallelSection.spatialSection.plane.pointId;
    const driverBefore=await page.evaluate(id=>window.__poly.state().runtime.points[id],sectionDriver);
    await page.locator('#modeMove').click();await dragWorld(driverBefore,{x:driverBefore.x+22,y:driverBefore.y-8});s=await state();
    const driverAfter=await page.evaluate(id=>window.__poly.state().runtime.points[id],sectionDriver);
    const movedSection=s.runtime.polygons[parallelSection.id];
    check('Dragging the live parallel-section control point moves the section on its source edge',Math.abs(driverAfter.spatial.binding.t-driverBefore.spatial.binding.t)>.05&&!!movedSection&&movedSection.points.length===3&&movedSection.points.every(id=>s.runtime.points[id]?.geometryValid!==false),{driverBefore:{x:driverBefore.x,y:driverBefore.y,t:driverBefore.spatial.binding.t},driverAfter:{x:driverAfter.x,y:driverAfter.y,t:driverAfter.spatial.binding.t},driverBinding:s.runtime.points[sectionDriver]?.spatial?.binding,section:movedSection?.points,validities:movedSection?.points.map(id=>s.runtime.points[id]?.geometryValid)});
    // Color the section independently of the copied red base; this makes the saved
    // classroom construction easy to read and gives persistence a second style to verify.
    await page.locator('#modeMove').click();
    const sectionPoly=await page.evaluate(id=>window.__poly.state().runtime.polygons[id],parallelSection.id);
    const sectionFillBefore=sectionPoly?.fill;
    if(sectionPoly){const q=await page.evaluate(id=>{const p=window.__poly.state().runtime.polygons[id];const ps=p.points.map(pid=>window.__poly.state().runtime.points[pid]);return{x:ps.reduce((v,a)=>v+a.x,0)/ps.length,y:ps.reduce((v,a)=>v+a.y,0)/ps.length};},parallelSection.id);await clickWorld(q);}
    await openStyleMenu();
    const sectionSwatch=page.locator('.color-btn:not(.custom-color-btn)').nth(3);if(await sectionSwatch.isVisible())await sectionSwatch.click();
    s=await state();
    check('Section receives its own UI-selected color',typeof s.runtime.polygons[parallelSection.id]?.fill==='string'&&s.runtime.polygons[parallelSection.id].fill!==sectionFillBefore,{before:sectionFillBefore,after:s.runtime.polygons[parallelSection.id]?.fill});

    // Build and style a regular 2D polygon through the UI, then use it as a copied base.
    await page.locator('#modeAdd').click();
    await clickCanvas(170,cy+175);await page.locator('#modeAdd').click();await clickCanvas(255,cy+175);
    await page.locator('#modeNgon').click();
    const addPoints=(await state()).runtime.points;
    const sourcePoints=Object.values(addPoints).filter(p=>!p.spatial&&Math.abs(p.y-(cy+175))<8&&p.x>=165&&p.x<=260).sort((a,b)=>a.x-b.x).slice(-2).map(p=>p.id);
    if(sourcePoints.length!==2)throw new Error(`Could not create 2D base points: ${JSON.stringify(sourcePoints)}`);
    await clickPoint(sourcePoints[0]);await clickPoint(sourcePoints[1]);
    await page.locator('#ngonInput').fill('5');await page.locator('#ngonConfirmBtn').click();
    s=await state();
    const sourcePolygon=Object.values(s.runtime.polygons).find(p=>!p.spatialGroupId&&!p.solidFace&&!p.spatialSection&&p.points.length===5);
    if(!sourcePolygon)throw new Error('The five-sided 2D polygon was not created through the n-gon dialog');
    const polygonEdge=s.runtime.lines[Object.values(s.runtime.lines).find(l=>sourcePolygon.points.includes(l.defining_points[0])&&sourcePolygon.points.includes(l.defining_points[1]))?.id];
    if(!polygonEdge)throw new Error('No polygon edge was available for UI selection');
    const [ea,eb]=polygonEdge.defining_points.map(id=>s.runtime.points[id]);
    await page.locator('#modeMove').click();await clickWorld({x:(ea.x+eb.x)/2,y:(ea.y+eb.y)/2});
    s=await state();
    check('Clicking a 2D polygon edge selects its source polygon',s.selectedPolygonId===sourcePolygon.id,{selectedPolygonId:s.selectedPolygonId,polygonId:sourcePolygon.id,selectedLineId:s.selectedLineId});
    await openStyleMenu();
    const swatch=page.locator('.color-btn:not(.custom-color-btn)').nth(1);
    if(await swatch.isVisible())await swatch.click();
    if(await page.locator('#fillToggleBtn').isVisible())await page.locator('#fillToggleBtn').click();
    s=await state();
    check('Real style controls apply a visible color and fill to the 2D base',typeof s.runtime.polygons[sourcePolygon.id].fill==='string'&&(s.runtime.polygons[sourcePolygon.id].fillOpacity??0)>0,{fill:s.runtime.polygons[sourcePolygon.id].fill,fillOpacity:s.runtime.polygons[sourcePolygon.id].fillOpacity});
    const sourcePointIds=[...sourcePolygon.points],sourceFill=s.runtime.polygons[sourcePolygon.id].fill;
    const sourceEdgeLengths=sourcePointIds.map((id,i)=>{const a=s.runtime.points[id],b=s.runtime.points[sourcePointIds[(i+1)%sourcePointIds.length]];return Math.hypot(a.x-b.x,a.y-b.y);});
    await page.locator('#modePrism').click();
    s=await state();
    const copiedPrism=Object.values(s.runtime.solids).find(v=>v.polyhedron?.kind==='prism'&&v.polyhedron.basePoints.length===5&&v.id!==prism5);
    const styledSource=s.runtime.polygons[sourcePolygon.id];
    const copiedBasePositions=copiedPrism&&await page.evaluate(ids=>ids.map(id=>window.__poly.position(id)),copiedPrism.polyhedron.basePoints);
    const copiedEdgeLengths=copiedBasePositions?.map((a,i)=>{const b=copiedBasePositions[(i+1)%copiedBasePositions.length];return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);});
    check('Prism tool consumes the selected 2D source polygon and inherits its geometry and styling',!!copiedPrism&&styledSource?.hidden===true&&copiedPrism.polyhedron.basePoints.every(id=>!sourcePointIds.includes(id))&&copiedPrism.faces.every(id=>s.runtime.polygons[id]?.fill===sourceFill)&&sourceEdgeLengths.every((length,i)=>Math.abs(length-copiedEdgeLengths[i])<1e-4),{solid:copiedPrism?.id,sourceHidden:styledSource?.hidden,sourcePoints:sourcePointIds,basePoints:copiedPrism?.polyhedron.basePoints,sourceEdgeLengths,copiedEdgeLengths,fill:sourceFill,faceFills:copiedPrism?.faces.map(id=>s.runtime.polygons[id]?.fill)});
    const labeledVertex=copiedPrism.vertices.at(-1);
    await page.locator('#modeMove').click();await clickPoint(labeledVertex);await page.locator('#modeLabel').click();
    s=await state();
    check('Label tool labels a new pyramid/prism vertex through a real canvas click',!!s.runtime.points[labeledVertex]?.label?.text,{id:labeledVertex,label:s.runtime.points[labeledVertex]?.label?.text});

    // Reuse a selected 3D face as the base of another solid.
    await page.locator('#modeMove').click();
    const reuseFace=await facePoint(prism3,1);if(!reuseFace)throw new Error('Prism top face has no selectable interior for reuse');
    await clickWorld(reuseFace);s=await state();
    check('First click on a solid face selects the whole solid',s.selectedSolidId===prism3&&s.selectedPolygonId===null,{selectedSolidId:s.selectedSolidId,selectedPolygonId:s.selectedPolygonId});
    await clickWorld(reuseFace);s=await state();
    check('Second click on the same solid face selects that face',s.selectedSolidId===prism3&&!!s.selectedPolygonId,{selectedSolidId:s.selectedSolidId,selectedPolygonId:s.selectedPolygonId});
    const reusedFaceId=s.selectedPolygonId, reusedFacePoints=[...s.runtime.polygons[reusedFaceId].points];
    await page.locator('#modePyramid').click();s=await state();
    const reusedPyramid=Object.values(s.runtime.solids).find(v=>v.polyhedron?.kind==='pyramid'&&v.polyhedron.basePoints.length===3&&v.polyhedron.basePoints.every(id=>reusedFacePoints.includes(id)));
    check('Pyramid tool reuses a selected 3D face and preserves its shared base vertices',!!reusedPyramid&&reusedPyramid.groupId===s.runtime.solids[prism3].groupId,{sourceFace:reusedFaceId,sourcePoints:reusedFacePoints,solid:reusedPyramid?.id,basePoints:reusedPyramid?.polyhedron.basePoints,groupId:reusedPyramid?.groupId});

    // Give the saved example readable vertex names through the label tool.
    for(const vertexId of copiedPrism.vertices){await page.locator('#modeMove').click();await clickPoint(vertexId);await page.locator('#modeLabel').click();}
    s=await state();
    check('The classroom prism has visible labels on every vertex',copiedPrism.vertices.every(id=>!!s.runtime.points[id]?.label?.text),copiedPrism.vertices.map(id=>s.runtime.points[id]?.label?.text));

    // Hide a real subdivision interval, rather than merely checking dashed back edges.
    s=await state();
    const splitLine=s.runtime.lines[midEdge.lineId],splitA=s.runtime.points[splitLine.points[0]],splitB=s.runtime.points[splitLine.points[1]];
    await page.locator('#modeMove').click();const splitMid={x:(splitA.x+splitB.x)/2,y:(splitA.y+splitB.y)/2};
    await clickWorld(splitMid);s=await state();
    check('First edge click selects its whole solid',s.selectedSolidId===prism3&&s.selectedLineId===null,{selectedSolidId:s.selectedSolidId,selectedLineId:s.selectedLineId});
    await clickWorld(splitMid);s=await state();
    check('Second edge click selects its owning face',s.selectedSolidId===prism3&&s.selectedPolygonId!==null&&s.selectedLineId===null,{selectedSolidId:s.selectedSolidId,selectedPolygonId:s.selectedPolygonId,selectedLineId:s.selectedLineId});
    await clickWorld(splitMid);
    check('Clicking the divided source edge selects its exact first interval',(await state()).selectedLineId===splitLine.id,{selectedLineId:(await state()).selectedLineId,expected:splitLine.id});
    await page.locator('#hideButton').click();s=await state();
    check('Hide control hides a real edge fragment while preserving the other fragment',s.runtime.lines[splitLine.id].segmentStyles[0].hidden===true&&s.runtime.lines[splitLine.id].segmentStyles.slice(1).some(style=>!style.hidden),s.runtime.lines[splitLine.id].segmentStyles);
    const hiddenFragmentStyles=JSON.stringify(s.runtime.lines[splitLine.id].segmentStyles);
    await page.locator('#modeMove').click();const slide=s.runtime.points[sectionDriver];await dragWorld(slide,{x:slide.x+8,y:slide.y-5});s=await state();
    check('Moving the section preserves hidden fragment styles',JSON.stringify(s.runtime.lines[splitLine.id].segmentStyles)===hiddenFragmentStyles,s.runtime.lines[splitLine.id].segmentStyles);

    // Keep a polished, editable classroom example as a real app-produced .ctr and screenshot.
    await page.locator('#modeMove').click();
    const hiddenEdgeSnapshot=await page.evaluate(()=>Object.values(window.__poly.state().runtime.lines).filter(line=>line.spatialHiddenEdge).map(line=>line.id).sort());
    check('The construction contains hidden solid-edge fragments to exercise persistence',hiddenEdgeSnapshot.length>0,hiddenEdgeSnapshot);
    // A horizontal section below the apex should clip the displayed pyramid; deleting
    // the selected apex should turn that temporary clip into a persistent truncated solid.
    await page.locator('#modeParallel').click();
    fp=await facePoint(pyramid5,0);if(!fp)throw new Error('Pyramid base is not available for the truncation section');await clickWorld(fp);
    const cutEdgeMid=await page.evaluate(id=>{const s=window.__poly.state(),solid=s.runtime.solids[id],apex=solid.vertices[solid.polyhedron.basePoints.length];for(const base of solid.polyhedron.basePoints){const line=Object.values(s.runtime.lines).find(l=>l.defining_points.includes(apex)&&l.defining_points.includes(base));if(!line)continue;const[a,b]=line.defining_points.map(pid=>s.runtime.points[pid]),p={x:(a.x+b.x)/2,y:(a.y+b.y)/2},hit=window.__poly.edgeHit(p);if(hit?.lineId===line.id)return p;}return null;},pyramid5);
    if(!cutEdgeMid)throw new Error('No pyramid lateral edge was available for the truncation section');await clickWorld(cutEdgeMid);s=await state();
    const cutSection=Object.values(s.runtime.polygons).find(p=>p.spatialSection?.solidId===pyramid5&&p.spatialSection?.plane.kind==='parallel');
    check('Pyramid base and lateral edge create a parallel cutting section',!!cutSection&&cutSection.points.length>=3,{section:cutSection?.id,points:cutSection?.points});
    await page.locator('#modeMove').click();await clickPoint(heightSource);await page.locator('#hideButton').click();s=await state();
    const clippedWhileHidden=await page.evaluate(id=>window.__poly.faces(id).filter(f=>f.faceIndex>0).map(f=>({index:f.faceIndex,vertices:f.points.length})),pyramid5);
    check('Hiding the pyramid apex clips each lateral face at the available section',s.runtime.points[heightSource]?.style?.hidden===true&&s.runtime.solids[pyramid5].hiddenApexSectionId===cutSection.id&&clippedWhileHidden.length>0&&clippedWhileHidden.every(f=>f.vertices===4),{apexHidden:s.runtime.points[heightSource]?.style?.hidden,hiddenApexSectionId:s.runtime.solids[pyramid5].hiddenApexSectionId,clippedFaces:clippedWhileHidden});
    await page.locator('#deletePoint').click();s=await state();
    const clippedAfterDelete=await page.evaluate(id=>window.__poly.faces(id).filter(f=>f.faceIndex>0).map(f=>f.points.length),pyramid5);
    check('Deleting the apex truncates the pyramid at its section',s.runtime.solids[pyramid5].cutSectionId===cutSection.id&&s.runtime.points[heightSource]?.style?.hidden===true&&clippedAfterDelete.length>0&&clippedAfterDelete.every(n=>n===4),{cutSectionId:s.runtime.solids[pyramid5].cutSectionId,apexHidden:s.runtime.points[heightSource]?.style?.hidden,clippedFaces:clippedAfterDelete});
    const trimmedHeight=s.runtime.lines[heightLine.id];
    check('Truncating also trims the old apex height at the cutting plane',trimmedHeight.points.length===3&&trimmedHeight.segmentStyles.filter(style=>style.hidden).length===1,{points:trimmedHeight.points,styles:trimmedHeight.segmentStyles});
    await page.locator('#undo').click();s=await state();
    check('Undo restores the hidden-apex preview before truncation',!s.runtime.solids[pyramid5].cutSectionId&&s.runtime.points[heightSource]?.style?.hidden===true,{cutSectionId:s.runtime.solids[pyramid5].cutSectionId,apexHidden:s.runtime.points[heightSource]?.style?.hidden});
    await page.locator('#redo').click();s=await state();
    check('Redo restores the clipped pyramid cap',s.runtime.solids[pyramid5].cutSectionId===cutSection.id,{cutSectionId:s.runtime.solids[pyramid5].cutSectionId,expected:cutSection.id});

    // Finish the saved teaching example through the real label and style tools.
    // Use one name per shared point, so the reused pyramid and source prism stay legible.
    const labelCandidates=await page.evaluate(excluded=>{const s=window.__poly.state(),ids=[];for(const solid of Object.values(s.runtime.solids)){if(solid.vertices.every(id=>excluded.includes(id)))continue;const count=solid.polyhedron?.basePoints?.length??Math.floor(solid.vertices.length/2),candidates=[solid.vertices[0],solid.vertices[count],solid.vertices[1]];let chosen=0;for(const id of candidates){const p=id?s.runtime.points[id]:null;if(!id||excluded.includes(id)||p?.style?.hidden||p?.geometryValid===false)continue;ids.push(id);if(++chosen===2)break;}}return [...new Set(ids)];},copiedPrism.vertices);
    const classroomLabelTargets=await page.evaluate(ids=>{const c=document.getElementById('canvas'),r=c.getBoundingClientRect(),s=window.__poly.state();return ids.filter(id=>{const p=s.runtime.points[id];if(!p||p.style?.hidden||p.geometryValid===false||p.label?.text)return false;const q=window.__poly.worldToCanvas(p.x,p.y);return Number.isFinite(q.x)&&Number.isFinite(q.y)&&document.elementFromPoint(r.left+q.x,r.top+q.y)?.id==='canvas';});},labelCandidates);
    for(const vertexId of classroomLabelTargets){await page.locator('#modeMove').click();await clickPoint(vertexId);await page.locator('#modeLabel').click();}
    s=await state();
    check('Key vertices on the remaining solids have classroom labels',classroomLabelTargets.length>=6&&classroomLabelTargets.every(id=>!!s.runtime.points[id]?.label?.text),classroomLabelTargets.map(id=>({id,label:s.runtime.points[id]?.label?.text})));

    const colorWholeSolid=async(solidId,faceIndex,colorIndex)=>{
      await page.locator('#modeMove').click();
      if(await styleMenuOpen())await page.locator('#styleMenu').click();
      await clickPoint((await state()).runtime.solids[solidId].vertices[0]);
      const handle=await freeRotateHandle(solidId);if(!handle)throw new Error(`No whole-solid handle found to style ${solidId}`);await clickWorld(handle);
      const selected=await state();if(!(await page.evaluate(()=>window.__poly.wholeSelected())))throw new Error(`Whole solid ${solidId} was not selected for styling: ${JSON.stringify({mode:selected.mode,selectedSolidId:selected.selectedSolidId,selectedPolygonId:selected.selectedPolygonId,selectedPointId:selected.selectedPointId,point,hit:await page.evaluate(p=>window.__poly.faceHit(p),point)})}`);
      await openStyleMenu();
      const swatch=page.locator('.color-btn:not(.custom-color-btn)').nth(colorIndex);
      if(!(await swatch.isVisible()))throw new Error(`Palette swatch ${colorIndex} is not visible for ${solidId}`);
      await swatch.click();
      const current=await state(),solid=current.runtime.solids[solidId];
      return {color:current.runtime.polygons[solid.faces[0]]?.fill,faces:solid.faces.map(id=>current.runtime.polygons[id]?.fill),edges:solid.edges.map(id=>current.runtime.lines[id]?.style?.color)};
    };
    const redPrism=await colorWholeSolid(prism3,1,1);
    const orangePrism=await colorWholeSolid(prism5,1,3);
    check('Two additional whole solids use distinct colors across all their faces and edges',redPrism.color==='#ff4d4f'&&orangePrism.color==='#f59e0b'&&redPrism.faces.every(c=>c===redPrism.color)&&orangePrism.faces.every(c=>c===orangePrism.color)&&redPrism.edges.every(c=>c===redPrism.color)&&orangePrism.edges.every(c=>c===orangePrism.color),{redPrism,orangePrism});
    if(await styleMenuOpen())await page.locator('#styleMenu').click();
    await clearSelectionAtBlankCanvas();
    await page.evaluate(()=>window.__poly.redraw());
    await page.waitForTimeout(150);
    const finalDoc=await page.evaluate(()=>window.__poly.serialize());
    const finalFile=archive('polyhedra-sections-demo',finalDoc);
    fs.writeFileSync(path.join(OUTPUT,'polyhedra-sections-demo.ctr'),Buffer.from(finalFile.bytes));
    await page.screenshot({path:path.join(OUTPUT,'polyhedra-sections-demo.png')});
    await page.evaluate(file=>window.__polyFiles.push(file),finalFile);
    const beforeReload=(await state()).revision;
    if(!(await page.locator('#cloudPanel').isVisible())){if(!(await page.locator('#cloudFilesBtn').isVisible()))await clearSelectionAtBlankCanvas();await page.locator('#cloudFilesBtn').click();}
    await page.locator('#localFileList [data-change-folder]').click();
    await page.locator('[aria-label="Wczytaj polyhedra-sections-demo"]').click();
    await page.waitForFunction(v=>window.__poly.state().revision>v,beforeReload);await page.locator('#cloudCloseBtn').click();
    s=await state();
    const hiddenEdgesAfter=hiddenEdgeSnapshot.map(id=>({id,hidden:s.runtime.lines[id]?.spatialHiddenEdge}));
    check('Archive reload preserves the manually hidden subdivision interval and live section',s.runtime.lines[splitLine.id].segmentStyles[0]?.hidden===true&&s.runtime.lines[splitLine.id].segmentStyles.slice(1).some(style=>!style.hidden)&&s.runtime.polygons[parallelSection.id].geometryValid!==false,{styles:s.runtime.lines[splitLine.id].segmentStyles,sectionValid:s.runtime.polygons[parallelSection.id].geometryValid});
    const reloadedVisibleLabels=classroomLabelTargets.every(id=>!!s.runtime.points[id]?.label?.text);
    check('Archive reload preserves both polyhedra, sections, dependencies, hidden edge fragments, all labels and colors, locks, and the truncated cap',!!s.runtime.solids[prism3]?.polyhedron&&!!s.runtime.solids[pyramid5]?.polyhedron&&Object.values(s.runtime.polygons).some(p=>p.spatialSection?.plane.kind==='parallel')&&Object.values(s.runtime.polygons).some(p=>p.spatialSection?.plane.kind==='points')&&s.runtime.solids[pyramid5].polyhedron.rightLocked===true&&s.runtime.solids[pyramid5].cutSectionId===cutSection.id&&hiddenEdgesAfter.every(e=>e.hidden===true)&&reloadedVisibleLabels&&copiedPrism.vertices.every(id=>!!s.runtime.points[id]?.label?.text)&&s.runtime.polygons[parallelSection.id]?.fill==='#f59e0b'&&s.runtime.solids[prism3].faces.every(id=>s.runtime.polygons[id]?.fill==='#ff4d4f')&&s.runtime.solids[prism5].faces.every(id=>s.runtime.polygons[id]?.fill==='#f59e0b'),{solids:Object.keys(s.runtime.solids),sections:Object.values(s.runtime.polygons).filter(p=>p.spatialSection).map(p=>p.spatialSection),rightLocked:s.runtime.solids[pyramid5]?.polyhedron?.rightLocked,cutSectionId:s.runtime.solids[pyramid5]?.cutSectionId,hiddenEdgesAfter,allVisibleVerticesLabeled:reloadedVisibleLabels,prism3Faces:s.runtime.solids[prism3].faces.map(id=>s.runtime.polygons[id]?.fill),prism5Faces:s.runtime.solids[prism5].faces.map(id=>s.runtime.polygons[id]?.fill),sectionFill:s.runtime.polygons[parallelSection.id]?.fill});

    // Exercise real touch input at a narrow viewport.
    await page.setViewportSize({width:390,height:844});
    const modeBox=await page.locator('#modePrism').boundingBox();await page.touchscreen.tap(modeBox.x+modeBox.width/2,modeBox.y+modeBox.height/2);
    if(await page.locator('#ngonModal').isVisible()){await page.locator('#ngonInput').fill('3');await page.locator('#ngonConfirmBtn').click();}
    const mobile=await rect();await clickCanvas(mobile.width/2,mobile.height/2);
    s=await state();const mobilePrism=Object.values(s.runtime.solids).find(v=>v.polyhedron?.kind==='prism'&&v.polyhedron.basePoints.length===3&&v.id!==prism3);
    check('Mobile touch creates a prism through the same toolbar and canvas workflow',!!mobilePrism&&mobilePrism.vertices.length===6,{id:mobilePrism?.id,vertices:mobilePrism?.vertices.length});
    await page.screenshot({path:path.join(OUTPUT,'polyhedra-mobile.png')});
    check('No browser exceptions or error dialogs',results.errors.length===0,results.errors);
    console.log(JSON.stringify({checks:results.checks.length,passed:results.checks.filter(c=>c.passed).length,errors:results.errors}));
  } finally {
    fs.writeFileSync(path.join(OUTPUT,'results.json'),JSON.stringify(results,null,2));
    await browser?.close();await server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
