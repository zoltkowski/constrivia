import centroidDocument from '../fixtures/classical/centroid.json';
import circumcircleDocument from '../fixtures/classical/circumcircle.json';
import incircleDocument from '../fixtures/classical/incircle.json';
import orthocenterDocument from '../fixtures/classical/orthocenter.json';
import tangentsDocument from '../fixtures/classical/tangents.json';
import { toEngineState } from '../../src/core/engineAdapter';
import { makeEmptyRuntime } from '../../src/core/runtimeTypes';
import type { ConstructionRuntime } from '../../src/core/runtimeTypes';
import type { EngineState } from '../../src/core/engineModel';
import type { PersistedDocument, PersistedModel } from '../../src/persisted/persistedTypes';

export type ClassicalFixtureName = 'centroid' | 'orthocenter' | 'circumcircle' | 'incircle' | 'tangents';

const documents: Record<ClassicalFixtureName, PersistedDocument> = {
  centroid: centroidDocument,
  orthocenter: orthocenterDocument,
  circumcircle: circumcircleDocument,
  incircle: incircleDocument,
  tangents: tangentsDocument
} as unknown as Record<ClassicalFixtureName, PersistedDocument>;

export function loadClassicalFixture(name: ClassicalFixtureName): { runtime: ConstructionRuntime; engine: EngineState } {
  return loadPersistedFixture(documents[name]);
}

export function loadPersistedFixture(document: PersistedDocument): { runtime: ConstructionRuntime; engine: EngineState } {
  const model = JSON.parse(JSON.stringify(document.model)) as PersistedModel;
  const runtime = makeEmptyRuntime();
  runtime.points = Object.fromEntries((model.points ?? []).map(point => [point.id, { ...point, style: point.style ?? {} }])) as ConstructionRuntime['points'];
  runtime.lines = Object.fromEntries((model.lines ?? []).map(line => [line.id, {
    ...line, style: line.style ?? {},
    defining_points: line.defining_points?.length === 2 ? line.defining_points :
      line.parallel ? [line.parallel.throughPoint, line.parallel.helperPoint] :
      line.perpendicular ? [line.perpendicular.throughPoint, line.perpendicular.helperPoint] :
      [line.points[0], line.points[line.points.length - 1]]
  }])) as ConstructionRuntime['lines'];
  runtime.circles = Object.fromEntries((model.circles ?? []).map(circle => [circle.id, { ...circle, style: circle.style ?? {} }])) as ConstructionRuntime['circles'];
  runtime.angles = Object.fromEntries((model.angles ?? []).map(angle => [angle.id, { ...angle, style: angle.style ?? {} }])) as ConstructionRuntime['angles'];
  runtime.polygons = Object.fromEntries((model.polygons ?? []).map(polygon => [polygon.id, polygon])) as ConstructionRuntime['polygons'];
  return { runtime, engine: toEngineState(runtime) };
}
