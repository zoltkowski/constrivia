import type { FreeLabel, InkStroke as PersistedInkStroke } from '../types';

export type ObjectId = string;

export interface PointRuntime {
  id: ObjectId;
  x: number;
  y: number;

  // zależności konstrukcyjne – prosta, runtime'owa wersja
  constructionKind: string;
  parents: ObjectId[];

  // opcjonalne metadane dla konkretnych narzędzi
  midpointMeta?: {
    parents: [ObjectId, ObjectId];
    parentLineId?: ObjectId | null;
  };
  bisectMeta?: {
    vertex: ObjectId;
    seg1: { lineId: ObjectId; a: ObjectId; b: ObjectId };
    seg2: { lineId: ObjectId; a: ObjectId; b: ObjectId };
    epsilon?: number;
  };
  symmetricMeta?: {
    source: ObjectId;
    mirror: { kind: 'point' | 'line'; id: ObjectId };
  };
}

export interface LineRuntime {
  id: ObjectId;
  // dwa punkty definiujące kierunek/prostą
  definingPoints: [ObjectId, ObjectId];
  // wszystkie punkty "przyklejone" do tej prostej, posortowane wzdłuż niej
  pointIds: ObjectId[];
}

export interface CircleRuntime {
  id: ObjectId;
  center: ObjectId;
  radiusPoint: ObjectId;
  // wszystkie punkty leżące na okręgu (do snapowania / ograniczeń)
  pointIds: ObjectId[];
  // three-point variant
  definingPoints3?: [ObjectId, ObjectId, ObjectId];
}

export interface AngleRuntime {
  id: ObjectId;
  // geometria kąta = trójka punktów
  vertex: ObjectId;
  point1: ObjectId;
  point2: ObjectId;
  // opcjonalne powiązania z liniami (soft)
  arm1LineId?: ObjectId;
  arm2LineId?: ObjectId;
}

export interface PolygonRuntime {
  id: ObjectId;
  // geometria = lista wierzchołków w kolejności
  vertices: ObjectId[];
  // opcjonalne powiązania krawędzi z liniami
  edgeLines?: (ObjectId | undefined)[];
}

export interface LabelRuntime extends FreeLabel {
  id: string;
}

export interface InkStrokeRuntime extends PersistedInkStroke {}

export interface ConstructionRuntime {
  points: Record<ObjectId, PointRuntime>;
  lines: Record<ObjectId, LineRuntime>;
  circles: Record<ObjectId, CircleRuntime>;
  angles: Record<ObjectId, AngleRuntime>;
  polygons: Record<ObjectId, PolygonRuntime>;
  labels: Record<string, LabelRuntime>;
  inkStrokes: Record<string, InkStrokeRuntime>;

  idCounters: {
    point: number;
    line: number;
    circle: number;
    angle: number;
    polygon: number;
  };
}

export function makeEmptyRuntime(): ConstructionRuntime {
  return {
    points: {},
    lines: {},
    circles: {},
    angles: {},
    polygons: {},
    labels: {},
    inkStrokes: {},
    idCounters: { point: 0, line: 0, circle: 0, angle: 0, polygon: 0 }
  };
}
