import type { PersistedModel } from '../persisted/persistedTypes';

function ensureId(prefix: string, idx: number, existing?: string | undefined): string {
  if (existing && typeof existing === 'string' && existing.length) return existing;
  return `${prefix}${idx}`;
}

export function migratePersistedAngles(model: PersistedModel): PersistedModel {
  const points = model.points || [] as any[];
  const lines = model.lines || [] as any[];
  const circles = model.circles || [] as any[];
  const angles = model.angles || [] as any[];
  const polygons = model.polygons || [] as any[];

  points.forEach((p: any, i: number) => {
    if (!p) return;
    p.id = ensureId('pt', i, p.id);
  });
  lines.forEach((l: any, i: number) => {
    if (!l) return;
    l.id = ensureId('ln', i, l.id);
  });
  circles.forEach((c: any, i: number) => {
    if (!c) return;
    c.id = ensureId('c', i, c.id);
  });
  polygons.forEach((p: any, i: number) => {
    if (!p) return;
    p.id = ensureId('poly', i, p.id);
  });

  const pointIdByIndex = points.map((p: any) => (p && p.id) ? p.id : null);
  const lineIdByIndex = lines.map((l: any) => (l && l.id) ? l.id : null);

  model.angles = (angles as any[]).map((ang: any) => {
    if (!ang) return ang;
    if (ang.point1 || ang.point2 || (ang.vertex && typeof ang.vertex === 'string')) return ang;
    const out = { ...ang };
    try {
      const vIdx = typeof ang.vertex === 'number' ? ang.vertex : null;
      const p1Idx = ang.leg1 && typeof ang.leg1.otherPoint === 'number' ? ang.leg1.otherPoint : null;
      const p2Idx = ang.leg2 && typeof ang.leg2.otherPoint === 'number' ? ang.leg2.otherPoint : null;
      const vId = vIdx !== null && pointIdByIndex[vIdx] ? pointIdByIndex[vIdx] : null;
      const p1Id = p1Idx !== null && pointIdByIndex[p1Idx] ? pointIdByIndex[p1Idx] : null;
      const p2Id = p2Idx !== null && pointIdByIndex[p2Idx] ? pointIdByIndex[p2Idx] : null;
      if (p1Id) out.point1 = p1Id;
      if (vId) out.vertex = vId;
      if (p2Id) out.point2 = p2Id;
    } catch (e) {
      // noop
    }
    return out;
  }) as any;

  return model;
}
