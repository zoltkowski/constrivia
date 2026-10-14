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
        import { spatialFaces as __polyFaces, hitSpatialFace as __polyFaceHit, spatialPosition as __polyPosition } from './core/spatialGeometry';
        let __polyRevision=0;const __polyLoad=applyPersistedDocument;applyPersistedDocument=(...a)=>{const r=__polyLoad(...a);__polyRevision++;return r;};
        window.__poly={state:()=>({runtime,mode,selectedSolidId,selectedPolygonId,selectedPointId,selectedLineId,selectedAngleId,panOffset,zoomFactor,revision:__polyRevision,planeInput:{...spatialPlaneInput},pendingPlanePoints:[...spatialPlaneInput.points]}),serialize:serializeCurrentDocument,faces:id=>__polyFaces(runtime,id),position:id=>__polyPosition(runtime,id),faceHit:p=>__polyFaceHit(runtime,p,showHidden),worldToCanvas,pointHit:p=>findPoint(p),edgeHit:p=>spatialEdgeAt(p),labelPosition:(kind,id)=>kind==='point'?getPointLabelPos(id):kind==='line'?getLineLabelPos(id):null};
      `;
      await route.fulfill({ response, body: `${await response.text()}\n${suffix}` });
    });
    await page.goto('http://127.0.0.1:5192/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__poly);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();

    const state = () => page.evaluate(() => window.__poly.state());
    const rect = () => page.locator('#canvas').evaluate(c => { const r=c.getBoundingClientRect(); return { left:r.left,top:r.top,width:r.width,height:r.height }; });
    const screen = async p => page.evaluate(p => { const r=document.getElementById('canvas').getBoundingClientRect(),q=window.__poly.worldToCanvas(p.x,p.y);return{x:r.left+q.x,y:r.top+q.y}; }, p);
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
    await page.locator('#styleMenu').click();
    check('Whole-solid selection exposes the lock without unrelated style controls',await page.locator('#polygonLockToggleBtn').isVisible()&&!(await page.locator('#styleColorRow').isVisible()),{selectedSolidId:(await state()).selectedSolidId});
    await page.locator('#styleMenu').click();

    // Exercise the real handle drag and the existing polygon lock button.
    await page.locator('#modeMove').click();await clickPoint((await state()).runtime.solids[pyramid5].polyhedron.basePoints[0]);
    const rotate=await page.evaluate(id=>window.__poly.state().runtime.solids[id].vertices.map(pid=>window.__poly.state().runtime.points[pid]).filter(Boolean),pyramid5);
    const pyramidGroup=(await state()).runtime.solids[pyramid5].groupId;
    const face=await page.evaluate(id=>window.__poly.faces(id).findIndex(f=>f.visible&&f.faceIndex>=2),pyramid5);
    let fp;
    const beforeOrientation=JSON.stringify((await state()).runtime.spatialGroups[pyramidGroup].orientation);
    const bbox=rotate.reduce((a,p)=>({minX:Math.min(a.minX,p.x),maxX:Math.max(a.maxX,p.x),minY:Math.min(a.minY,p.y),maxY:Math.max(a.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
    await page.locator('#modeMove').click();await page.mouse.move((await screen({x:(bbox.minX+bbox.maxX)/2,y:bbox.minY-26})).x,(await screen({x:(bbox.minX+bbox.maxX)/2,y:bbox.minY-26})).y);
    let handle=await screen({x:(bbox.minX+bbox.maxX)/2,y:bbox.minY-26});await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+34,handle.y+22,{steps:8});await page.mouse.up();
    s=await state();
    check('Dragging the visible rotate handle changes the spatial orientation',JSON.stringify(s.runtime.spatialGroups[pyramidGroup].orientation)!==beforeOrientation,{before:beforeOrientation,after:s.runtime.spatialGroups[pyramidGroup].orientation});
    await page.locator('#modeMove').click();
    const lockFace=await page.evaluate(id=>window.__poly.faces(id).findIndex(f=>f.visible&&f.faceIndex>=2),pyramid5);
    fp=await facePoint(pyramid5,lockFace);if(!fp)throw new Error(`No selectable visible pyramid face for lock control (${lockFace})`);await clickWorld(fp);
    if(await page.locator('#styleMenu').isVisible())await page.locator('#styleMenu').click();
    const lockUi=await page.locator('#polygonLockToggleBtn').evaluate(el=>({display:getComputedStyle(el).display,parent:getComputedStyle(el.parentElement).display,rect:(()=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height}})()}));
    s=await state();
    check('Selecting a polyhedron exposes its right-lock control',await page.locator('#polygonLockToggleBtn').isVisible(),{selectedSolidId:s.selectedSolidId,selectedPolygonId:s.selectedPolygonId,lockUi});
    await page.locator('#polygonLockToggleBtn').click();s=await state();
    check('Lock control toggles pyramid right-angle constraint through the UI',s.runtime.solids[pyramid5].polyhedron.rightLocked===false,{rightLocked:s.runtime.solids[pyramid5].polyhedron.rightLocked});

    // Parallel section: choose the visible top face and a midpoint on a lateral edge.
    await page.locator('#modeMove').click();
    fp=await facePoint(prism3,1);await clickWorld(fp);
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
      s=await state();const pts=s.runtime.solids[pyramid5].vertices.map(id=>s.runtime.points[id]),xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),h={x:(Math.min(...xs)+Math.max(...xs))/2,y:Math.min(...ys)-26};
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

    // Re-lock through the real style control. Locking a tilted solid must straighten it;
    // then an apex drag changes height along the base normal without reintroducing tilt.
    await page.locator('#modeMove').click();await clickPoint(heightSource);s=await state();
    check('Selecting the pyramid apex keeps the body lock control available',s.selectedSolidId===pyramid5,{selectedSolidId:s.selectedSolidId,selectedPointId:s.selectedPointId});
    await page.locator('#styleMenu').click();
    check('Opening the style menu exposes the apex-selected body lock control',await page.locator('#polygonLockToggleBtn').isVisible(),{selectedSolidId:(await state()).selectedSolidId});
    await page.locator('#polygonLockToggleBtn').click();s=await state();
    check('Re-locking a tilted pyramid straightens its axis',s.runtime.solids[pyramid5].polyhedron.rightLocked&&Math.hypot(s.runtime.solids[pyramid5].polyhedron.offset.x,s.runtime.solids[pyramid5].polyhedron.offset.y,s.runtime.solids[pyramid5].polyhedron.offset.z)<1e-8,{rightLocked:s.runtime.solids[pyramid5].polyhedron.rightLocked,offset:s.runtime.solids[pyramid5].polyhedron.offset});
    await page.locator('#modeMove').click();await clickPoint(heightSource);s=await state();
    const lockedHeightBefore=s.runtime.solids[pyramid5].polyhedron.height, lockedApex=s.runtime.points[heightSource];
    await dragWorld(lockedApex,{x:lockedApex.x,y:lockedApex.y-26});s=await state();
    check('Dragging the locked apex resizes height while preserving a perpendicular axis',Math.abs(s.runtime.solids[pyramid5].polyhedron.height-lockedHeightBefore)>5&&Math.hypot(s.runtime.solids[pyramid5].polyhedron.offset.x,s.runtime.solids[pyramid5].polyhedron.offset.y,s.runtime.solids[pyramid5].polyhedron.offset.z)<1e-8,{before:lockedHeightBefore,after:s.runtime.solids[pyramid5].polyhedron.height,offset:s.runtime.solids[pyramid5].polyhedron.offset});

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
    if(await page.locator('#styleMenu').isVisible())await page.locator('#styleMenu').click();
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
    if(await page.locator('#styleMenu').isVisible())await page.locator('#styleMenu').click();
    const swatch=page.locator('.color-btn:not(.custom-color-btn)').nth(1);
    if(await swatch.isVisible())await swatch.click();
    if(await page.locator('#fillToggleBtn').isVisible())await page.locator('#fillToggleBtn').click();
    s=await state();
    check('Real style controls apply a visible color and fill to the 2D base',typeof s.runtime.polygons[sourcePolygon.id].fill==='string'&&(s.runtime.polygons[sourcePolygon.id].fillOpacity??0)>0,{fill:s.runtime.polygons[sourcePolygon.id].fill,fillOpacity:s.runtime.polygons[sourcePolygon.id].fillOpacity});
    await page.locator('#modePrism').click();
    s=await state();
    const copiedPrism=Object.values(s.runtime.solids).find(v=>v.polyhedron?.kind==='prism'&&v.polyhedron.basePoints.length===5&&v.id!==prism5);
    const styledSource=s.runtime.polygons[sourcePolygon.id];
    const copiedBasePositions=copiedPrism&&await page.evaluate(ids=>ids.map(id=>window.__poly.position(id)),copiedPrism.polyhedron.basePoints);
    const sourceEdgeLengths=styledSource?.points.map((id,i)=>{const a=s.runtime.points[id],b=s.runtime.points[styledSource.points[(i+1)%styledSource.points.length]];return Math.hypot(a.x-b.x,a.y-b.y);});
    const copiedEdgeLengths=copiedBasePositions?.map((a,i)=>{const b=copiedBasePositions[(i+1)%copiedBasePositions.length];return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);});
    check('Prism tool copies a selected 2D polygon as an independent spatial base with inherited styling',!!copiedPrism&&copiedPrism.polyhedron.basePoints.every(id=>!styledSource.points.includes(id))&&copiedPrism.faces.every(id=>s.runtime.polygons[id]?.fill===styledSource.fill)&&sourceEdgeLengths.every((length,i)=>Math.abs(length-copiedEdgeLengths[i])<1e-4),{solid:copiedPrism?.id,sourcePoints:styledSource.points,basePoints:copiedPrism?.polyhedron.basePoints,sourceEdgeLengths,copiedEdgeLengths,fill:styledSource.fill,faceFills:copiedPrism?.faces.map(id=>s.runtime.polygons[id]?.fill)});
    const labeledVertex=copiedPrism.vertices.at(-1);
    await page.locator('#modeMove').click();await clickPoint(labeledVertex);await page.locator('#modeLabel').click();
    s=await state();
    check('Label tool labels a new pyramid/prism vertex through a real canvas click',!!s.runtime.points[labeledVertex]?.label?.text,{id:labeledVertex,label:s.runtime.points[labeledVertex]?.label?.text});

    // Reuse a selected 3D face as the base of another solid.
    await page.locator('#modeMove').click();
    const reuseFace=await facePoint(prism3,1);if(!reuseFace)throw new Error('Prism top face has no selectable interior for reuse');
    await clickWorld(reuseFace);s=await state();
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
    await page.locator('#modeMove').click();await clickWorld({x:(splitA.x+splitB.x)/2,y:(splitA.y+splitB.y)/2});
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
    check('Archive reload preserves the manually hidden subdivision interval and live section',JSON.stringify(s.runtime.lines[splitLine.id].segmentStyles)===hiddenFragmentStyles&&s.runtime.polygons[parallelSection.id].geometryValid!==false,{styles:s.runtime.lines[splitLine.id].segmentStyles,sectionValid:s.runtime.polygons[parallelSection.id].geometryValid});
    check('Archive reload preserves both polyhedra, sections, dependencies, hidden edge fragments, labels, styles, and lock state',!!s.runtime.solids[prism3]?.polyhedron&&!!s.runtime.solids[pyramid5]?.polyhedron&&Object.values(s.runtime.polygons).some(p=>p.spatialSection?.plane.kind==='parallel')&&Object.values(s.runtime.polygons).some(p=>p.spatialSection?.plane.kind==='points')&&s.runtime.solids[pyramid5].polyhedron.rightLocked===true&&hiddenEdgesAfter.every(e=>e.hidden===true)&&copiedPrism.vertices.every(id=>!!s.runtime.points[id]?.label?.text)&&s.runtime.polygons[parallelSection.id]?.fill==='#f59e0b',{solids:Object.keys(s.runtime.solids),sections:Object.values(s.runtime.polygons).filter(p=>p.spatialSection).map(p=>p.spatialSection),rightLocked:s.runtime.solids[pyramid5]?.polyhedron?.rightLocked,hiddenEdgesAfter,labels:copiedPrism.vertices.map(id=>s.runtime.points[id]?.label?.text),sectionFill:s.runtime.polygons[parallelSection.id]?.fill});

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
