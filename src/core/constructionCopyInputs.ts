import type { ConstructionRuntime, ObjectId } from './runtimeTypes';
import { circleInputPointIds, compassSourceLines } from './circleGeometry';
import { polygonLines } from './polygonTools';

export type ConstructionCopyRoot =
  | { kind: 'point' | 'line' | 'circle' | 'angle' | 'polygon' | 'solid' | 'spatialGroup' | 'label' | 'ink'; id: ObjectId };

/** Collect inputs for selected objects, without adding reverse 2D dependents. */
export function collectConstructionCopyInputs(runtime: ConstructionRuntime, roots: ConstructionCopyRoot[]) {
  const points = new Set<ObjectId>(), lines = new Set<ObjectId>(), circles = new Set<ObjectId>();
  const angles = new Set<ObjectId>(), polygons = new Set<ObjectId>();
  const spatialGroups = new Set<ObjectId>(), solids = new Set<ObjectId>();
  const labels = new Set<ObjectId>(),inkStrokes = new Set<ObjectId>();
  const missing = new Set<ConstructionCopyRoot>();
  const missingReferences = new Set<ObjectId>();
  const expandedGroups = new Set<ObjectId>();
  const queue = roots.slice();
  const add = (kind: ConstructionCopyRoot['kind'], id?: ObjectId | null) => { if (id) queue.push({ kind, id }); };
  const point = (id?: ObjectId | null) => add('point', id);
  const line = (id?: ObjectId | null) => add('line', id);
  const circle = (id?: ObjectId | null) => add('circle', id);
  const angle = (id?: ObjectId | null) => add('angle', id);
  const polygon = (id?: ObjectId | null) => add('polygon', id);
  const solid = (id?: ObjectId | null) => add('solid', id);
  const group = (id?: ObjectId | null) => add('spatialGroup', id);
  const existingPoint = (id?: ObjectId | null) => { if (id && runtime.points[id]) point(id); };
  const existingLine = (id?: ObjectId | null) => { if (id && runtime.lines[id]) line(id); };
  const existingPolygon = (id?: ObjectId | null) => { if (id && runtime.polygons[id]) polygon(id); };
  const anyRef = (id?: ObjectId | null) => {
    if (!id) return;
    let found = false;
    if (runtime.points[id]) { point(id); found = true; }
    if (runtime.lines[id]) { line(id); found = true; }
    if (runtime.circles[id]) { circle(id); found = true; }
    if (runtime.angles[id]) { angle(id); found = true; }
    if (runtime.polygons[id]) { polygon(id); found = true; }
    if (runtime.solids?.[id]) { solid(id); found = true; }
    if (runtime.spatialGroups?.[id]) { group(id); found = true; }
    if (!found) missingReferences.add(id);
  };

  for (let i = 0; i < queue.length; i++) {
    const ref = queue[i];
    const exists = ref.kind === 'point' ? !!runtime.points[ref.id]
      : ref.kind === 'line' ? !!runtime.lines[ref.id]
      : ref.kind === 'circle' ? !!runtime.circles[ref.id]
      : ref.kind === 'angle' ? !!runtime.angles[ref.id]
      : ref.kind === 'polygon' ? !!runtime.polygons[ref.id]
      : ref.kind === 'solid' ? !!runtime.solids?.[ref.id]
      : ref.kind==='label'?!!runtime.labels[ref.id]:ref.kind==='ink'?!!runtime.inkStrokes[ref.id]:!!runtime.spatialGroups?.[ref.id];
    if (!exists) { missing.add(ref); continue; }
    const symmetryCollections={point:'points',line:'lines',circle:'circles',angle:'angles',polygon:'polygons',label:'labels',ink:'inkStrokes'} as const;
    const symmetryKey=symmetryCollections[ref.kind as keyof typeof symmetryCollections];
    const meta=symmetryKey?runtime[symmetryKey][ref.id]?.symmetry:undefined;
    if(meta){
      const sourceKinds={points:'point',lines:'line',circles:'circle',angles:'angle',polygons:'polygon',labels:'label',inkStrokes:'ink'} as const;
      const visited=symmetryKey==='labels'?labels:symmetryKey==='inkStrokes'?inkStrokes:symmetryKey==='points'?points:symmetryKey==='lines'?lines:symmetryKey==='circles'?circles:symmetryKey==='angles'?angles:polygons;
      if(!visited.has(ref.id)){add(sourceKinds[meta.source.collection],meta.source.id);add(meta.mirror.kind,meta.mirror.id);}
    }
    if(ref.kind==='label'){labels.add(ref.id);continue;}
    if(ref.kind==='ink'){inkStrokes.add(ref.id);continue;}
    if (ref.kind === 'spatialGroup') {
      if (expandedGroups.has(ref.id)) continue;
      expandedGroups.add(ref.id);
      spatialGroups.add(ref.id);
      for (const p of Object.values(runtime.points)) if (p.spatial?.groupId === ref.id) point(p.id);
      for (const l of Object.values(runtime.lines)) if (l.points.some(id => runtime.points[id]?.spatial?.groupId === ref.id)) line(l.id);
      for (const a of Object.values(runtime.angles)) if (a.spatial?.groupId === ref.id) angle(a.id);
      for (const poly of Object.values(runtime.polygons)) {
        if (poly.spatialGroupId === ref.id || poly.spatialSection && runtime.solids?.[poly.spatialSection.solidId]?.groupId === ref.id) polygon(poly.id);
      }
      for (const s of Object.values(runtime.solids ?? {})) if (s.groupId === ref.id) solid(s.id);
    } else if (ref.kind === 'solid') {
      const s = runtime.solids?.[ref.id];
      if (!s || solids.has(ref.id)) continue;
      solids.add(ref.id); spatialGroups.add(s.groupId);
      // A solid belongs to a complete spatial group, which is copied together.
      if (!expandedGroups.has(s.groupId)) group(s.groupId);
      s.vertices.forEach(point); s.edges.forEach(existingLine); s.faces?.forEach(existingPolygon); point(s.originPointId);
      s.polyhedron?.basePoints.forEach(point); s.polyhedron?.faceVertices.forEach(face => face.forEach(point));
      polygon(s.cutSectionId); polygon(s.hiddenApexSectionId);
      s.cutSectionIds?.forEach(polygon);
      polygon(s.consumedBase?.polygonId);
    } else if (ref.kind === 'point') {
      const p = runtime.points[ref.id];
      if (!p || points.has(ref.id)) continue;
      points.add(ref.id); queue.push(...(p.parent_refs ?? []));
      p.commonTangent?.circles.forEach(circle);
      p.defining_parents?.forEach(anyRef);
      if (p.boundaryIntersectionSet) {
        for (const parent of p.boundaryIntersectionSet.parents) parent.kind === 'line' ? line(parent.id) : polygon(parent.id);
        p.boundaryIntersectionSet.outputs.forEach(existingPoint);
      }
      p.boundaryIntersectionSlot?.topologyLines?.forEach(existingLine);
      if (p.midpointMeta) { p.midpointMeta.parents.forEach(point); line(p.midpointMeta.parentLineId); }
      if (p.symmetricMeta) { point(p.symmetricMeta.source); queue.push(p.symmetricMeta.mirror); }
      if (p.bisectMeta) {
        const meta = p.bisectMeta; point(meta.vertex);
        if (meta.arms) meta.arms.forEach(arm => arm.kind === 'point' ? point(arm.pointId) : line(arm.lineId));
        else [meta.seg1, meta.seg2].forEach(seg => { point(seg.a); point(seg.b); line(seg.lineId); });
      }
      line(p.parallel_helper_for); line(p.perpendicular_helper_for); line(p.auxiliaryFor);
      if (p.spatial) {
        const binding = p.spatial.binding; group(p.spatial.groupId);
        if (binding.kind === 'planeFoot') { point(binding.source); binding.planePoints.forEach(point); }
        else if (binding.kind === 'sectionEdge') { polygon(binding.sectionId); binding.endpoints.forEach(point); }
        else if (binding.kind === 'polygonIntersection') binding.polygons.forEach(polygon);
        else if (binding.kind === 'vertex') solid(binding.solidId);
        else if (binding.kind === 'edge') binding.endpoints.forEach(point);
        else if (binding.kind === 'direction') {
          point(binding.through); binding.reference.forEach(point);
          if (Array.isArray(binding.planeGuide)) binding.planeGuide.forEach(point);
          else if (binding.planeGuide) point(binding.planeGuide);
        }
      }
    } else if (ref.kind === 'line') {
      const l = runtime.lines[ref.id];
      if (!l || lines.has(ref.id)) continue;
      lines.add(ref.id); l.points.forEach(existingPoint); l.defining_points?.forEach(point);
      l.defining_parents?.forEach(anyRef);
      if (l.parallel) { point(l.parallel.throughPoint); point(l.parallel.helperPoint); line(l.parallel.referenceLine); }
      if (l.perpendicular) { point(l.perpendicular.throughPoint); point(l.perpendicular.helperPoint); line(l.perpendicular.referenceLine); l.perpendicular.referencePoints?.forEach(point); }
      if (l.bisector) { point(l.bisector.vertex); point(l.bisector.bisectPoint); }
      if (l.spatialParameters) Object.keys(l.spatialParameters).forEach(existingPoint);
    } else if (ref.kind === 'circle') {
      const c = runtime.circles[ref.id];
      if (!c || circles.has(ref.id)) continue;
      circles.add(ref.id); point(c.center); circleInputPointIds(c).forEach(point); c.points.forEach(point);
      if (c.compassSource) compassSourceLines(c.compassSource).forEach(source => line(source.lineId));
      c.defining_parents?.forEach(anyRef);
    } else if (ref.kind === 'angle') {
      const a = runtime.angles[ref.id];
      if (!a || angles.has(ref.id)) continue;
      angles.add(ref.id); point(a.vertex); point(a.point1); point(a.point2);
      line(a.arm1LineId); line(a.arm2LineId);
      for (const arm of [a.arm1, a.arm2]) if (arm) arm.kind === 'point' ? point(arm.pointId) : line(arm.lineId);
      a.defining_parents?.forEach(anyRef);
      if (a.spatial) { group(a.spatial.groupId); a.spatial.arms.flat().forEach(point); }
    } else if (ref.kind === 'polygon') {
      const poly = runtime.polygons[ref.id];
      if (!poly || polygons.has(ref.id)) continue;
      polygons.add(ref.id); poly.points.forEach(point); poly.defining_parents?.forEach(anyRef);
      polygonLines(runtime, poly.id).forEach(line);
      if (poly.lockRef) { poly.lockRef.base.forEach(point); poly.lockRef.coords.forEach(coord => point(coord.id)); }
      if (poly.spatialGroupId) group(poly.spatialGroupId);
      if (poly.solidBackFace && poly.spatialGroupId) group(poly.spatialGroupId);
      if (poly.solidFace) solid(poly.solidFace.solidId);
      if (poly.spatialSection) {
        const section = poly.spatialSection; solid(section.solidId);
        if(!section.fixedPlane){if (section.plane.kind === 'parallel') { polygon(section.plane.polygonId); point(section.plane.pointId); }
        else section.plane.points.forEach(point);}
        section.priorCuts?.forEach(polygon);section.sourcePoints?.forEach(existingPoint);
        Object.values(section.edgePoints).forEach(existingPoint); Object.values(section.edgeLines ?? {}).forEach(existingLine);
      }
    }
  }
  return { points, lines, circles, angles, polygons, spatialGroups, solids, labels, inkStrokes, missing, missingReferences };
}
