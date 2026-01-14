#!/usr/bin/env node
// Usage: node migrate-persisted-angles.mjs input.json [output.json]
import fs from 'fs';
import path from 'path';

function ensureId(prefix, idx, existing) {
  if (existing && typeof existing === 'string' && existing.length) return existing;
  return `${prefix}${idx}`;
}

function migrate(model) {
  model.points = model.points || [];
  model.lines = model.lines || [];
  model.circles = model.circles || [];
  model.angles = model.angles || [];
  model.polygons = model.polygons || [];

  // ensure ids for points/lines/circles/polygons
  model.points.forEach((p, i) => {
    if (!p) return;
    p.id = ensureId('pt', i, p.id);
  });
  model.lines.forEach((l, i) => {
    if (!l) return;
    l.id = ensureId('ln', i, l.id);
  });
  model.circles.forEach((c, i) => {
    if (!c) return;
    c.id = ensureId('c', i, c.id);
  });
  model.polygons.forEach((p, i) => {
    if (!p) return;
    p.id = ensureId('poly', i, p.id);
  });

  // Build point id map
  const pointIdByIndex = model.points.map((p) => p && p.id ? p.id : null);
  const lineIdByIndex = model.lines.map((l) => l && l.id ? l.id : null);

  model.angles = model.angles.map((ang, i) => {
    if (!ang) return ang;
    // If already migrated (has point1), skip
    if (ang.point1 || ang.point2 || ang.vertex && typeof ang.vertex === 'string') {
      return ang;
    }
    // Persisted shape expected: leg1: { line: number; otherPoint: number }, leg2: { ... }, vertex: number
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
      // noop - leave as-is
    }
    return out;
  });

  return model;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: migrate-persisted-angles.mjs input.json [output.json]');
    process.exit(2);
  }
  const inPath = path.resolve(process.cwd(), args[0]);
  const outPath = args[1] ? path.resolve(process.cwd(), args[1]) : inPath.replace(/\.json$/i, '.migrated.json');
  const raw = fs.readFileSync(inPath, 'utf8');
  const doc = JSON.parse(raw);
  if (doc.model) {
    doc.model = migrate(doc.model);
  } else {
    // assume the file is a model
    const m = migrate(doc);
    fs.writeFileSync(outPath, JSON.stringify(m, null, 2), 'utf8');
    console.log('Wrote', outPath);
    return;
  }
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf8');
  console.log('Wrote', outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
