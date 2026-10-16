const fs = require('fs');
const path = require('path');
const OUTPUT_ROOT = path.resolve(__dirname, '../../output/playwright');
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
const { zipSync, strToU8 } = require('fflate');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(OUTPUT_ROOT, 'construction-definitions');
fs.mkdirSync(OUT, { recursive: true });
const results = { checks: [], scenarios: {}, pageErrors: [], dialogs: [] };
const clone = value => JSON.parse(JSON.stringify(value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const check = (name, condition, observed) => {
  const item = { name, passed: !!condition, observed };
  results.checks.push(item);
  if (!item.passed) throw new Error(`${name}: ${JSON.stringify(observed)}`);
};

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 5186, strictPort: true } });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
    const context = await browser.newContext({ viewport: { width: 1200, height: 850 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('pageerror', error => results.pageErrors.push(error.message));
    page.on('dialog', async dialog => { results.dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() + `\nwindow.__constructionAudit={
        state:()=>({runtime,mode,panOffset,zoomFactor,loadRevision:window.__constructionAuditLoadRevision??0,selectedPointId,selectedLineId,selectedCircleId,selectedAngleId,selectedPolygonId,selectedLabel,measurementLabels,showMeasurements}),
        serialize:serializeCurrentDocument,worldToCanvas,angleGeometry,findPoint,findLine,findCircle,findLabelAt,findHandle
      };
      let constructionAuditLoadRevision=0;
      const constructionAuditOriginalLoad=applyPersistedDocument;
      applyPersistedDocument=(...args)=>{const result=constructionAuditOriginalLoad(...args);constructionAuditLoadRevision++;window.__constructionAuditLoadRevision=constructionAuditLoadRevision;return result;};` });
    });
    // Keep exact-coordinate construction fixtures independent of optional grid snapping.
    await page.addInitScript(() => localStorage.setItem('geometry.grid', JSON.stringify({ visible: false })));
    await page.goto('http://127.0.0.1:5186/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__constructionAudit);
    if (await page.locator('#swDismissBtn').isVisible()) await page.locator('#swDismissBtn').click();

    const state = () => page.evaluate(() => window.__constructionAudit.state());
    const counts = s => Object.fromEntries(['points', 'lines', 'angles', 'polygons'].map(kind => [kind, Object.keys(s.runtime[kind] ?? {}).length]));
    const canvasClick = async position => {
      const point = await page.evaluate(p => window.__constructionAudit.worldToCanvas(p.x, p.y), position);
      await page.mouse.click(point.x, point.y);
    };
    const blankCanvasClick = async () => {
      const position = await page.evaluate(() => {
        const canvas = document.getElementById('canvas'), rect = canvas.getBoundingClientRect();
        for (let y = 45; y < rect.height - 35; y += 43) for (let x = rect.width - 45; x > 25; x -= 47) {
          const p = { x, y }, c = window.__constructionAudit.worldToCanvas(x, y), sx = rect.left + c.x, sy = rect.top + c.y;
          if (document.elementFromPoint(sx, sy)?.id !== 'canvas') continue;
          if (window.__constructionAudit.findPoint(p) || window.__constructionAudit.findLine(p) || window.__constructionAudit.findCircle(p, undefined, false)) continue;
          return { x: sx, y: sy };
        }
        return null;
      });
      if (!position) throw new Error('Could not find a blank canvas location to clear the current selection');
      await page.mouse.click(position.x, position.y);
    };
    const clickPoint = async id => {
      const s = await state();
      const p = s.runtime.points[id];
      if (!p) throw new Error(`Missing point ${id}`);
      await canvasClick(p);
    };
    const tool = async id => {
      if (id !== 'modeMove') {
        await page.locator('#modeMove').click();
        await blankCanvasClick();
      }
      await page.locator(`#${id}`).click();
    };
    const addPoint = async (id, x, y) => {
      const before = await state();
      await tool('modeAdd');
      await canvasClick({ x, y });
      const s = await state();
      const added = Object.values(s.runtime.points).filter(point => !before.runtime.points[point.id]);
      const p = added.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (!p || Math.hypot(p.x - x, p.y - y) > 20) throw new Error(`Point tool did not create ${id} near (${x},${y}); mode=${s.mode}; added=${JSON.stringify(added)}`);
      return p.id;
    };
    const addSegment = async (a, b) => {
      await tool('modeSegment');
      await clickPoint(a);
      await clickPoint(b);
      const s = await state();
      const line = Object.values(s.runtime.lines).find(item => item.points?.includes(a) && item.points?.includes(b));
      if (!line) throw new Error(`Segment tool did not create ${a}-${b}`);
      return line.id;
    };
    const lineStyle = line => {
      const item = line && stateCache.runtime.lines[line];
      return item?.segmentStyles?.[0] ?? item?.style ?? null;
    };
    let stateCache;
    const lineCanvasPosition = async (id, segmentIndex = null) => page.evaluate(({ id, segmentIndex }) => {
      const { runtime, panOffset, zoomFactor } = window.__constructionAudit.state();
      const line = runtime.lines[id];
      if (!line) return null;
      const canvas = document.getElementById('canvas');
      const rect = canvas.getBoundingClientRect();
      const indices = segmentIndex === null ? Array.from({ length: line.points.length - 1 }, (_, i) => i + 1) : [segmentIndex + 1];
      for (const i of indices) {
        const a = runtime.points[line.points[i - 1]], b = runtime.points[line.points[i]];
        if (!a || !b) continue;
        const wx = (a.x + b.x) / 2, wy = (a.y + b.y) / 2;
        const x = rect.left + wx * zoomFactor + panOffset.x, y = rect.top + wy * zoomFactor + panOffset.y;
        if (document.elementFromPoint(x, y)?.id === 'canvas') return { x, y };
      }
      return null;
    }, { id, segmentIndex });
    const setDashedStyle = async (lineId, segmentIndex = null) => {
      const p = await lineCanvasPosition(lineId, segmentIndex);
      if (!p) throw new Error(`Cannot hit line ${lineId} to set dashed style`);
      await page.mouse.click(p.x, p.y);
      await page.locator('#styleMenu').click();
      await page.locator('.type-btn[data-type="dashed"]:visible').first().click();
      await page.locator('#styleMenu').click().catch(() => {});
      const s = await state();
      const line = s.runtime.lines[lineId];
      return clone(segmentIndex === null ? (line?.segmentStyles?.[0] ?? line?.style ?? null) : (line?.segmentStyles?.[segmentIndex] ?? line?.style ?? null));
    };
    const snapshot = async () => { stateCache = await state(); return stateCache; };
    const dragPoint = async (id, dx, dy) => {
      await page.locator('#modeMove').click();
      await blankCanvasClick();
      const before = await state(), p = before.runtime.points[id];
      const start = await page.evaluate(p => window.__constructionAudit.worldToCanvas(p.x, p.y), p);
      const target = await page.evaluate(({screen,world}) => { const e=document.elementFromPoint(screen.x,screen.y),a=window.__constructionAudit;return {tag:e?.tagName,id:e?.id,pointHit:a.findPoint(world),labelHit:a.findLabelAt(world),handleHit:a.findHandle(world)}; },{screen:start,world:p});
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      const pressed=await state();
      results.scenarios['drag-target-'+id]={start,target,mode:pressed.mode,selectedPointId:pressed.selectedPointId,selectedLineId:pressed.selectedLineId,point:p,showMeasurements:pressed.showMeasurements,measurements:pressed.measurementLabels?.filter(l=>Math.hypot(l.pos.x-p.x,l.pos.y-p.y)<25)};
      await page.mouse.move(start.x + dx, start.y + dy, { steps: 20 }); await page.mouse.up();
      return await state();
    };

    // Angle creation must not materialize helper segments. The first case uses
    // an existing dashed altitude-like leg; the second has three isolated points.
    const A = await addPoint('A', 260, 260);
    const D = await addPoint('D', 430, 420);
    const B = await addPoint('B', 620, 260);
    const existingDashedLeg = await addSegment(A, D);
    await addSegment(D, B);
    await setDashedStyle(existingDashedLeg);
    await tool('modeAdd');
    await canvasClick({ x: 344, y: 340 });
    let splitState = await snapshot();
    const H = Object.values(splitState.runtime.points).find(p => Math.hypot(p.x - 344, p.y - 340) < 5);
    if (!H) throw new Error('Point tool did not create H on segment AD at (344,340)');
    const splitLine = splitState.runtime.lines[existingDashedLeg];
    if (!splitLine?.points?.includes(H.id) || splitLine.points.indexOf(D) - splitLine.points.indexOf(A) === 1) throw new Error(`H did not split segment AD: ${JSON.stringify({ points: splitLine?.points, A, H: H.id, D })}`);
    const splitIndexAH = Math.min(splitLine.points.indexOf(A), splitLine.points.indexOf(H.id));
    const splitIndexHD = Math.min(splitLine.points.indexOf(H.id), splitLine.points.indexOf(D));
    await setDashedStyle(existingDashedLeg, splitIndexAH);
    await setDashedStyle(existingDashedLeg, splitIndexHD);
    splitState = await snapshot();
    const dashedBefore = [splitState.runtime.lines[existingDashedLeg]?.segmentStyles?.[splitIndexAH], splitState.runtime.lines[existingDashedLeg]?.segmentStyles?.[splitIndexHD]];
    const angleBefore = await snapshot();
    await tool('modeAngle');
    for (const id of [A, D, B]) await clickPoint(id);
    const angleAfter = await snapshot();
    const angleLineIds = Object.keys(angleAfter.runtime.lines).filter(id => !angleBefore.runtime.lines[id]);
    const dashedAfter = [angleAfter.runtime.lines[existingDashedLeg]?.segmentStyles?.[splitIndexAH], angleAfter.runtime.lines[existingDashedLeg]?.segmentStyles?.[splitIndexHD]];
    results.scenarios.angleExistingLegs = {
      points: [A, D, B], splitPoint: { id: H.id, x: H.x, y: H.y, linePoints: splitLine.points }, addedAngles: Object.keys(angleAfter.runtime.angles).filter(id => !angleBefore.runtime.angles[id]),
      addedLines: angleLineIds, dashedBefore, dashedAfter
    };
    check('Angle A-D-B adds no line and preserves both dashed A-H-D parts', angleLineIds.length === 0 && JSON.stringify(dashedBefore) === JSON.stringify(dashedAfter) && Object.keys(angleAfter.runtime.angles).length === Object.keys(angleBefore.runtime.angles).length + 1, results.scenarios.angleExistingLegs);

    const E = await addPoint('E', 760, 220), F = await addPoint('F', 900, 420), G = await addPoint('G', 1060, 240);
    const freeAngleBefore = await snapshot();
    await tool('modeAngle');
    for (const id of [E, F, G]) await clickPoint(id);
    const freeAngleAfter = await snapshot();
    const freeAngleLines = Object.keys(freeAngleAfter.runtime.lines).filter(id => !freeAngleBefore.runtime.lines[id]);
    results.scenarios.angleIsolatedPoints = { points: [E, F, G], addedAngles: Object.keys(freeAngleAfter.runtime.angles).filter(id => !freeAngleBefore.runtime.angles[id]), addedLines: freeAngleLines };
    check('Angle from three isolated points creates no lines', freeAngleLines.length === 0 && Object.keys(freeAngleAfter.runtime.angles).length === Object.keys(freeAngleBefore.runtime.angles).length + 1, results.scenarios.angleIsolatedPoints);

    const pointAngleId = Object.keys(freeAngleAfter.runtime.angles).find(id => !freeAngleBefore.runtime.angles[id]);
    const pointAngle = freeAngleAfter.runtime.angles[pointAngleId];
    const angleGeom = await page.evaluate(id => {
      const angle = window.__constructionAudit.state().runtime.angles[id];
      return window.__constructionAudit.angleGeometry(angle);
    }, pointAngleId);
    if (!angleGeom) throw new Error('Could not resolve the arc geometry for the three-point angle');
    const arcMiddle = angleGeom.start + angleGeom.span / 2;
    const bisectorClick = { x: angleGeom.v.x + angleGeom.radius * Math.cos(arcMiddle), y: angleGeom.v.y + angleGeom.radius * Math.sin(arcMiddle) };
    const angleAt = (vertex, a, b) => {
      const u = { x: a.x - vertex.x, y: a.y - vertex.y }, v = { x: b.x - vertex.x, y: b.y - vertex.y };
      const denom = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
      return denom ? Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / denom))) : Infinity;
    };
    const expectedPointBisectorEndpoint = (s, endpoint) => {
      const vertex = s.runtime.points[endpoint.bisectMeta.vertex];
      const refs = endpoint.bisectMeta.arms.map(arm => s.runtime.points[arm.pointId]);
      if (!vertex || refs.some(ref => !ref)) return null;
      const unit = refs.map(ref => { const dx = ref.x - vertex.x, dy = ref.y - vertex.y, length = Math.hypot(dx, dy); return { x: dx / length, y: dy / length }; });
      const dx = unit[0].x + unit[1].x, dy = unit[0].y + unit[1].y, length = Math.hypot(dx, dy);
      if (length < 1e-8) return null;
      const scale = (endpoint.bisectMeta.exterior ? -1 : 1) * (endpoint.bisectMeta.epsilon ?? 48) / length;
      return { x: vertex.x + dx * scale, y: vertex.y + dy * scale };
    };
    const bisectorBefore = await snapshot();
    await tool('modeBisector'); await canvasClick(bisectorClick);
    const pointBisectorAfter = await snapshot();
    const bisectorLineIds = Object.keys(pointBisectorAfter.runtime.lines).filter(id => !bisectorBefore.runtime.lines[id]);
    const bisectorPointIds = Object.keys(pointBisectorAfter.runtime.points).filter(id => !bisectorBefore.runtime.points[id]);
    const bisectorEndpoint = bisectorPointIds.map(id => pointBisectorAfter.runtime.points[id]).find(point => point.bisectMeta);
    const pointArms = bisectorEndpoint?.bisectMeta?.arms;
    const bisectorLine = bisectorLineIds.length === 1 ? pointBisectorAfter.runtime.lines[bisectorLineIds[0]] : null;
    const pointBisectorAngles = bisectorEndpoint && [E, G].map(id => angleAt(pointBisectorAfter.runtime.points[F], pointBisectorAfter.runtime.points[id], bisectorEndpoint));
    const expectedEndpointBeforeMove = bisectorEndpoint && expectedPointBisectorEndpoint(pointBisectorAfter, bisectorEndpoint);
    results.scenarios.pointAngleBisector = {
      sourceAngle: pointAngleId, pointArms, legacyKeys: { seg1: bisectorEndpoint?.bisectMeta?.seg1, seg2: bisectorEndpoint?.bisectMeta?.seg2 },
      addedLineIds: bisectorLineIds, addedPoints: bisectorPointIds, line: bisectorLine && clone(bisectorLine),
      endpoint: bisectorEndpoint && { id: bisectorEndpoint.id, x: bisectorEndpoint.x, y: bisectorEndpoint.y },
      equalArmAngles: pointBisectorAngles, expectedEndpoint: expectedEndpointBeforeMove
    };
    check('Angle arc from three isolated points creates a point-arm bisector with one ray and no side lines', bisectorLineIds.length === 1 && bisectorPointIds.length === 1 && pointArms?.length === 2 && pointArms[0]?.kind === 'point' && pointArms[1]?.kind === 'point' && pointArms.some(arm => arm.pointId === E) && pointArms.some(arm => arm.pointId === G) && !bisectorEndpoint?.bisectMeta?.seg1 && !bisectorEndpoint?.bisectMeta?.seg2 && bisectorLine?.points?.includes(F) && pointBisectorAngles?.every(Number.isFinite) && Math.abs(pointBisectorAngles[0] - pointBisectorAngles[1]) < 1e-5, results.scenarios.pointAngleBisector);
    const bisectorSourceBefore = pointBisectorAfter.runtime.points[E];
    const movedAngleState = await dragPoint(E, -32, -22);
    const actualAngleDelta = { x: movedAngleState.runtime.points[E].x - bisectorSourceBefore.x, y: movedAngleState.runtime.points[E].y - bisectorSourceBefore.y };
    const movedBisectorEndpoint = movedAngleState.runtime.points[bisectorEndpoint.id];
    const movedPointBisectorAngles = [E, G].map(id => angleAt(movedAngleState.runtime.points[F], movedAngleState.runtime.points[id], movedBisectorEndpoint));
    const expectedEndpointAfterMove = expectedPointBisectorEndpoint(movedAngleState, movedBisectorEndpoint);
    results.scenarios.pointAngleBisectorMove = { actualDelta: actualAngleDelta, endpointBefore: { x: bisectorEndpoint.x, y: bisectorEndpoint.y }, endpointAfter: { x: movedBisectorEndpoint.x, y: movedBisectorEndpoint.y }, endpointDelta: dist(bisectorEndpoint, movedBisectorEndpoint), expectedEndpointAfterMove, equalArmAngles: movedPointBisectorAngles };
    check('Moving a point arm recomputes the bisector endpoint and retains equal angles', Math.hypot(actualAngleDelta.x, actualAngleDelta.y) > 10 && dist(bisectorEndpoint, movedBisectorEndpoint) > 0.05 && !!expectedEndpointAfterMove && dist(movedBisectorEndpoint, expectedEndpointAfterMove) < 1e-4 && Math.abs(movedPointBisectorAngles[0] - movedPointBisectorAngles[1]) < 1e-5, results.scenarios.pointAngleBisectorMove);

    // Build two full parallel constructions through V, then define the angle by
    // clicking each line beyond its tiny hidden helper segment. This exercises
    // direction-aware line arms and their persisted representation.
    const V = await addPoint('V', 760, 450);
    const base1A = await addPoint('base1A', 620, 690), base1B = await addPoint('base1B', 700, 690);
    const base2A = await addPoint('base2A', 620, 620), base2B = await addPoint('base2B', 680, 680);
    const base1 = await addSegment(base1A, base1B), base2 = await addSegment(base2A, base2B);
    const createParallelThroughV = async baseLine => {
      const before = await snapshot();
      await tool('modeParallel'); await clickPoint(V);
      const c = await lineCanvasPosition(baseLine);
      if (!c) throw new Error(`Cannot select parallel base line ${baseLine}`);
      await page.mouse.click(c.x, c.y);
      const after = await snapshot();
      const createdId = Object.keys(after.runtime.lines).find(id => !before.runtime.lines[id]);
      if (!createdId) throw new Error(`Parallel tool did not create a line through V from ${baseLine}`);
      return createdId;
    };
    const parallel1 = await createParallelThroughV(base1);
    const parallel2 = await createParallelThroughV(base2);
    const rayState = await snapshot();
    const rayPoint = (lineId, sourceA, sourceB, sign) => {
      const a = rayState.runtime.points[sourceA], b = rayState.runtime.points[sourceB], v = rayState.runtime.points[V];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      return { x: v.x + sign * dx / length * 100, y: v.y + sign * dy / length * 100 };
    };
    const rayClick1 = rayPoint(parallel1, base1A, base1B, 1);
    const rayClick2 = rayPoint(parallel2, base2A, base2B, -1);
    const rayAngleBefore = await snapshot();
    await tool('modeAngle'); await canvasClick(rayClick1); await canvasClick(rayClick2);
    const rayAngleAfter = await snapshot();
    const rayAngleId = Object.keys(rayAngleAfter.runtime.angles).find(id => !rayAngleBefore.runtime.angles[id]);
    const rayAngle = rayAngleId && rayAngleAfter.runtime.angles[rayAngleId];
    const raySerialized = await page.evaluate(() => window.__constructionAudit.serialize());
    const persistedRayAngle = raySerialized.model?.angles?.find(angle => angle.id === rayAngleId);
    const lineArmSignature = angle => [angle?.arm1, angle?.arm2].map(arm => arm && ({ kind: arm.kind, lineId: arm.lineId, direction: arm.direction }));
    results.scenarios.fullLineAngle = {
      lines: [parallel1, parallel2], clicksBeyondHelperSegments: [rayClick1, rayClick2],
      vertex: rayAngle && rayAngleAfter.runtime.points[rayAngle.vertex],
      runtimeArms: lineArmSignature(rayAngle), persistedArms: lineArmSignature(persistedRayAngle)
    };
    check('Angle from full parallel lines stores typed arms and clicked directions', !!rayAngle && rayAngle.arm1?.kind === 'line' && rayAngle.arm2?.kind === 'line' && [1, -1].includes(rayAngle.arm1.direction) && [1, -1].includes(rayAngle.arm2.direction) && rayAngle.arm1.direction !== rayAngle.arm2.direction && rayAngle.arm1.lineId === parallel1 && rayAngle.arm2.lineId === parallel2, results.scenarios.fullLineAngle);
    check('Serialize preserves both full-line arm directions', JSON.stringify(lineArmSignature(rayAngle)) === JSON.stringify(lineArmSignature(persistedRayAngle)), results.scenarios.fullLineAngle);

    // Perpendicular bisector from two free points: capture the actual geometry,
    // then drag one source and measure its real displacement before checking invariants.
    const P = await addPoint('P', 280, 600), Q = await addPoint('Q', 560, 600);
    const sourceBefore = await snapshot();
    await tool('modePerpBisector');
    await clickPoint(P); await clickPoint(Q);
    const bisectorAfter = await snapshot();
    const addedLineIds = Object.keys(bisectorAfter.runtime.lines).filter(id => !sourceBefore.runtime.lines[id]);
    const addedPoints = Object.values(bisectorAfter.runtime.points).filter(p => !sourceBefore.runtime.points[p.id]);
    const bisectorLines = addedLineIds.map(id => bisectorAfter.runtime.lines[id]);
    const visibleBisectors = bisectorLines.filter(line => !line.hidden&&((line.leftRay&&!line.leftRay.hidden)||(line.rightRay&&!line.rightRay.hidden)||(line.points.length>1&&!line.segmentStyles?.every(style=>style?.hidden))));
    const midpoint = addedPoints.find(p => p.construction_kind === 'midpoint' || p.midpointMeta);
    const sourceVector = { x: bisectorAfter.runtime.points[Q].x - bisectorAfter.runtime.points[P].x, y: bisectorAfter.runtime.points[Q].y - bisectorAfter.runtime.points[P].y };
    const perpLine = visibleBisectors.find(line => line.perpendicular || line.construction_kind === 'perpendicular') ?? visibleBisectors[0];
    const refs = perpLine?.defining_points?.map(id => bisectorAfter.runtime.points[id]).filter(Boolean) ?? [];
    const direction = refs.length > 1 ? { x: refs[1].x - refs[0].x, y: refs[1].y - refs[0].y } : null;
    const dot = direction ? sourceVector.x * direction.x + sourceVector.y * direction.y : Infinity;
    const angleError = direction ? Math.abs(dot) / (Math.hypot(sourceVector.x, sourceVector.y) * Math.hypot(direction.x, direction.y)) : Infinity;
    results.scenarios.perpendicularBisectorInitial = {
      addedLineIds, addedLines: clone(bisectorLines), visibleLineCount: visibleBisectors.length,
      addedPoints: clone(addedPoints), midpoint: midpoint && { id: midpoint.id, x: midpoint.x, y: midpoint.y },
      expectedMidpoint: { x: (bisectorAfter.runtime.points[P].x + bisectorAfter.runtime.points[Q].x) / 2, y: (bisectorAfter.runtime.points[P].y + bisectorAfter.runtime.points[Q].y) / 2 },
      angleError, countsBefore: counts(sourceBefore), countsAfter: counts(bisectorAfter)
    };
    check('Two-point perpendicular bisector has one visible line and no hidden base line', addedLineIds.length === 1 && visibleBisectors.length === 1, results.scenarios.perpendicularBisectorInitial);
    const centerOfRefs=refs.length===2?{x:(refs[0].x+refs[1].x)/2,y:(refs[0].y+refs[1].y)/2}:null;
    check('Perpendicular bisector has no midpoint object and passes through the geometric midpoint', !midpoint && addedPoints.every(p=>p.style?.hidden&&p.auxiliaryFor===perpLine.id) && centerOfRefs && dist(centerOfRefs,results.scenarios.perpendicularBisectorInitial.expectedMidpoint)<1e-4 && angleError<1e-5,results.scenarios.perpendicularBisectorInitial);

    const moved = await dragPoint(P, 36, -42);
    const actualDelta = { x: moved.runtime.points[P].x - bisectorAfter.runtime.points[P].x, y: moved.runtime.points[P].y - bisectorAfter.runtime.points[P].y };
    const movedEnds=perpLine.defining_points.map(id=>moved.runtime.points[id]);
    const movedMid={x:(movedEnds[0].x+movedEnds[1].x)/2,y:(movedEnds[0].y+movedEnds[1].y)/2};
    const expectedMovedMid = { x: (moved.runtime.points[P].x + moved.runtime.points[Q].x) / 2, y: (moved.runtime.points[P].y + moved.runtime.points[Q].y) / 2 };
    results.scenarios.perpendicularBisectorMove = { actualDelta, midpoint: movedMid && { x: movedMid.x, y: movedMid.y }, expectedMidpoint: expectedMovedMid, movedLine: perpLine && clone(moved.runtime.lines[perpLine.id]) };
    check('Dragging a source point moves it and recomputes the bisector midpoint', Math.hypot(actualDelta.x, actualDelta.y) > 10 && !!movedMid && dist(movedMid, expectedMovedMid) < 1e-4, results.scenarios.perpendicularBisectorMove);

    await page.locator('#undo').click();
    const undone = await snapshot();
    await page.locator('#redo').click();
    const redone = await snapshot();
    const undoDelta = dist(undone.runtime.points[P], bisectorAfter.runtime.points[P]);
    const redoDelta = dist(redone.runtime.points[P], moved.runtime.points[P]);
    results.scenarios.undoRedo = { undoDelta, redoDelta, countsAfterUndo: counts(undone), countsAfterRedo: counts(redone) };
    check('Undo and Redo restore the point and dependent construction', undoDelta < 1e-4 && redoDelta < 1e-4 && !!redone.runtime.lines[perpLine.id], results.scenarios.undoRedo);

    // Fresh UI tangent construction from an exterior point to a circle.
    const tangentCenter = await addPoint('tangentCenter', 360, 650);
    const tangentRadiusPoint = await addPoint('tangentRadius', 420, 650);
    const tangentP = await addPoint('tangentP', 520, 650);
    const beforeCircle = await snapshot();
    await tool('modeCircle'); await clickPoint(tangentCenter); await clickPoint(tangentRadiusPoint);
    const afterCircle = await snapshot();
    const originalCircleId = Object.keys(afterCircle.runtime.circles).find(id => !beforeCircle.runtime.circles[id]);
    if (!originalCircleId) throw new Error('Circle tool did not create the tangent source circle');
    const originalCircle = afterCircle.runtime.circles[originalCircleId];
    const centerBeforeTangent = afterCircle.runtime.points[originalCircle.center];
    const radiusBeforeTangent = dist(centerBeforeTangent, afterCircle.runtime.points[originalCircle.radius_point]);
    const tangentBefore = await snapshot();
    await tool('modeTangent'); await clickPoint(tangentP);
    await canvasClick({ x: centerBeforeTangent.x, y: centerBeforeTangent.y - radiusBeforeTangent });
    const tangentAfter = await snapshot();
    const tangentLineIds = Object.keys(tangentAfter.runtime.lines).filter(id => !tangentBefore.runtime.lines[id]);
    const tangentNewCircleIds = Object.keys(tangentAfter.runtime.circles).filter(id => !tangentBefore.runtime.circles[id]);
    const tangentLines = tangentLineIds.map(id => tangentAfter.runtime.lines[id]);
    const tangentRecords = tangentLines.map(line => {
      const referencePoints = line.perpendicular?.referencePoints ?? [];
      const [centerId, contactId] = referencePoints;
      const center = tangentAfter.runtime.points[centerId], contact = tangentAfter.runtime.points[contactId];
      const helper = tangentAfter.runtime.points[line.perpendicular?.helperPoint];
      const p = tangentAfter.runtime.points[tangentP];
      if (!center || !contact || !helper || !p) return { lineId: line.id, referencePoints, error: 'missing point reference' };
      const radiusVector = { x: contact.x - center.x, y: contact.y - center.y };
      const tangentVector = { x: helper.x - contact.x, y: helper.y - contact.y };
      const pVector = { x: p.x - contact.x, y: p.y - contact.y };
      const normalError = Math.abs(radiusVector.x * tangentVector.x + radiusVector.y * tangentVector.y) / (Math.hypot(radiusVector.x, radiusVector.y) * Math.hypot(tangentVector.x, tangentVector.y));
      const pLineError = Math.abs(tangentVector.x * pVector.y - tangentVector.y * pVector.x) / Math.hypot(tangentVector.x, tangentVector.y);
      const radialError = Math.abs(dist(center, contact) - radiusBeforeTangent);
      const parentCircleIds = (contact.parent_refs ?? []).filter(ref => ref.kind === 'circle').map(ref => ref.id);
      return { lineId: line.id, referencePoints, centerId, contactId, helperId: helper.id, normalError, pLineError, radialError, parentCircleIds, contactValid: contact.geometryValid !== false, lineValid: line.geometryValid !== false, hidden: !!line.hidden || !!line.style?.hidden };
    });
    const tangentAuxCircleId = tangentNewCircleIds.find(id => id !== originalCircleId);
    results.scenarios.tangentConstructionInitial = {
      point: tangentP, circleId: originalCircleId, addedLineIds: tangentLineIds, addedCircleIds: tangentNewCircleIds,
      circles: tangentNewCircleIds.map(id => ({ id, hidden: !!tangentAfter.runtime.circles[id]?.hidden || !!tangentAfter.runtime.circles[id]?.style?.hidden })),
      tangents: tangentRecords
    };
    check('Exterior point tangent construction creates exactly two visible tangents and no radius lines', tangentLineIds.length === 2 && tangentRecords.length === 2 && tangentRecords.every(record => !record.error && !record.hidden && record.referencePoints[0] === originalCircle.center && record.referencePoints[1] === record.contactId && record.normalError < 1e-5 && record.pLineError < 1e-3 && record.radialError < 1e-4), results.scenarios.tangentConstructionInitial);
    check('Tangent contacts depend on the original and auxiliary circles', !!tangentAuxCircleId && tangentAfter.runtime.circles[tangentAuxCircleId]?.hidden === true && tangentRecords.every(record => record.parentCircleIds.includes(originalCircleId) && record.parentCircleIds.includes(tangentAuxCircleId)), results.scenarios.tangentConstructionInitial);

    const originalTangentP = tangentAfter.runtime.points[tangentP];
    const insideTarget = { x: centerBeforeTangent.x + radiusBeforeTangent * 0.45, y: centerBeforeTangent.y + radiusBeforeTangent * 0.15 };
    const insideTangentState = await dragPoint(tangentP, insideTarget.x - originalTangentP.x, insideTarget.y - originalTangentP.y);
    const actualInsideDelta = { x: insideTangentState.runtime.points[tangentP].x - originalTangentP.x, y: insideTangentState.runtime.points[tangentP].y - originalTangentP.y };
    const insideDistance = dist(insideTangentState.runtime.points[originalCircle.center], insideTangentState.runtime.points[tangentP]);
    const restoredTangentState = await dragPoint(tangentP, originalTangentP.x - insideTangentState.runtime.points[tangentP].x, originalTangentP.y - insideTangentState.runtime.points[tangentP].y);
    const actualReturnDelta = { x: restoredTangentState.runtime.points[tangentP].x - insideTangentState.runtime.points[tangentP].x, y: restoredTangentState.runtime.points[tangentP].y - insideTangentState.runtime.points[tangentP].y };
    const restoredTangents = tangentLineIds.map(lineId => {
      const line = restoredTangentState.runtime.lines[lineId], refs = line?.perpendicular?.referencePoints ?? [];
      const center = restoredTangentState.runtime.points[refs[0]], contact = restoredTangentState.runtime.points[refs[1]];
      const helper = restoredTangentState.runtime.points[line?.perpendicular?.helperPoint], p = restoredTangentState.runtime.points[tangentP];
      if (!center || !contact || !helper || !p) return { lineId, valid: false };
      const u = { x: helper.x - contact.x, y: helper.y - contact.y }, v = { x: p.x - contact.x, y: p.y - contact.y }, radial = { x: contact.x - center.x, y: contact.y - center.y };
      return { lineId, valid: line.geometryValid !== false && contact.geometryValid !== false, refs, contactId: refs[1], radialError: Math.abs(dist(center, contact) - radiusBeforeTangent), pLineError: Math.abs(u.x * v.y - u.y * v.x) / Math.hypot(u.x, u.y), normalError: Math.abs(radial.x * u.x + radial.y * u.y) / (Math.hypot(radial.x, radial.y) * Math.hypot(u.x, u.y)) };
    });
    results.scenarios.tangentConstructionMove = {
      actualInsideDelta, insideDistance, radius: radiusBeforeTangent,
      actualReturnDelta, restoredP: restoredTangentState.runtime.points[tangentP],
      restoredLineIds: tangentLineIds.filter(id => !!restoredTangentState.runtime.lines[id]), contactsBefore: tangentRecords.map(record => record.contactId),
      contactsAfter: restoredTangents.map(record => record.contactId), tangents: restoredTangents
    };
    check('Moving P inside and back restores the same tangent contacts and tangent lines', Math.hypot(actualInsideDelta.x, actualInsideDelta.y) > 20 && insideDistance < radiusBeforeTangent && Math.hypot(actualReturnDelta.x, actualReturnDelta.y) > 20 && tangentLineIds.length === 2 && tangentLineIds.every(id => !!restoredTangentState.runtime.lines[id]) && JSON.stringify(tangentRecords.map(record => record.contactId)) === JSON.stringify(restoredTangents.map(record => record.contactId)) && restoredTangents.every(record => record.valid && record.radialError < 1e-4 && record.pLineError < 1e-3 && record.normalError < 1e-5), results.scenarios.tangentConstructionMove);

    // Round-trip through the app's Local file panel using a readonly mock folder.
    const document = await page.evaluate(() => window.__constructionAudit.serialize());
    const beforeImport = await snapshot();
    const fileName = 'construction-definitions-roundtrip.ctr';
    const archiveBytes = zipSync({ 'construction-definitions-roundtrip.json': strToU8(JSON.stringify(document, null, 2)) });
    await page.evaluate(({ name, bytes }) => {
      const file = new File([new Uint8Array(bytes)], name, { type: 'application/zip' });
      const fileHandle = { kind: 'file', name, getFile: async () => file };
      const folder = { kind: 'directory', name: 'construction-definitions', queryPermission: async () => 'granted', requestPermission: async () => 'granted', async *values() { yield fileHandle; }, async *entries() { yield [name, fileHandle]; } };
      window.showDirectoryPicker = async () => folder;
    }, { name: fileName, bytes: Array.from(archiveBytes) });
    const revisionBeforeImport = (await state()).loadRevision;
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.locator('#modeMove').click();
    await blankCanvasClick();
    const beforeOpenLocal = await state();
    if (beforeOpenLocal.mode !== 'move' || beforeOpenLocal.selectedPointId || beforeOpenLocal.selectedLineId || beforeOpenLocal.selectedCircleId || beforeOpenLocal.selectedAngleId || beforeOpenLocal.selectedPolygonId || beforeOpenLocal.selectedLabel) {
      throw new Error(`Could not clear selection through the canvas before Local import: ${JSON.stringify({ mode: beforeOpenLocal.mode, selectedPointId: beforeOpenLocal.selectedPointId, selectedLineId: beforeOpenLocal.selectedLineId, selectedCircleId: beforeOpenLocal.selectedCircleId, selectedAngleId: beforeOpenLocal.selectedAngleId, selectedPolygonId: beforeOpenLocal.selectedPolygonId, selectedLabel: beforeOpenLocal.selectedLabel })}`);
    }
    await page.locator('#cloudFilesBtn').click();
    await page.locator('#localFileList [data-change-folder]').click();
    await page.locator('#localFileList .cloud-file-item').filter({ hasText: 'construction-definitions-roundtrip' }).click();
    await page.waitForFunction(revision => window.__constructionAudit.state().loadRevision > revision, revisionBeforeImport);
    const reloaded = await snapshot();
    const reloadedRayAngle = rayAngleId && reloaded.runtime.angles[rayAngleId];
    const roundTrip = {
      initialCounts: counts(beforeImport), loadedCounts: counts(reloaded),
      midpoint: midpoint && reloaded.runtime.points[midpoint.id] && { x: reloaded.runtime.points[midpoint.id].x, y: reloaded.runtime.points[midpoint.id].y },
      angleCount: Object.keys(reloaded.runtime.angles).length,
      fullLineAngleArmsBefore: lineArmSignature(rayAngle), fullLineAngleArmsAfter: lineArmSignature(reloadedRayAngle),
      lineIds: Object.keys(reloaded.runtime.lines)
    };
    results.scenarios.localFileRoundTrip = roundTrip;
    check('Local file reload preserves angle definitions, line-arm directions, and perpendicular-bisector objects', roundTrip.angleCount === Object.keys(beforeImport.runtime.angles).length && roundTrip.lineIds.length === Object.keys(beforeImport.runtime.lines).length && !!reloaded.runtime.lines[perpLine.id] && (!midpoint || !!reloaded.runtime.points[midpoint.id]) && JSON.stringify(roundTrip.fullLineAngleArmsBefore) === JSON.stringify(roundTrip.fullLineAngleArmsAfter), roundTrip);
    await page.locator('#cloudCloseBtn').click().catch(() => {});

    if (results.pageErrors.length || results.dialogs.length) throw new Error(`Browser errors/dialogs: ${JSON.stringify({ pageErrors: results.pageErrors, dialogs: results.dialogs })}`);
    fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ checks: results.checks.length, passed: results.checks.filter(c=>c.passed).length, failed: results.checks.filter(c=>!c.passed), output: path.join(OUT, 'results.json') }, null, 2));
  } finally {
    await browser?.close();
    await server.close();
  }
})().catch(error => {
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ ...results, error: error.message }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
