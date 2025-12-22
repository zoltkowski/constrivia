import type { PointRuntime as Point, LineRuntime as Line, CircleRuntime as Circle } from './core/runtimeTypes';
import { arrayToMap, mapToArray, ObjectId } from './maps';

export type ModelData = {
  points: Point[];
  lines: Line[];
  circles: Circle[];
};

export class Model {
  points: Map<ObjectId, Point>;
  lines: Map<ObjectId, Line>;
  circles: Map<ObjectId, Circle>;

  constructor() {
    this.points = new Map();
    this.lines = new Map();
    this.circles = new Map();
  }

  static fromArray(data: Partial<ModelData>): Model {
    const m = new Model();
    m.points = arrayToMap(data.points || [], (p) => p.id);
    m.lines = arrayToMap(data.lines || [], (l) => l.id);
    m.circles = arrayToMap(data.circles || [], (c) => c.id);
    return m;
  }

  toArray(): ModelData {
    return {
      points: mapToArray(this.points),
      lines: mapToArray(this.lines),
      circles: mapToArray(this.circles)
    } as ModelData;
  }

  getPointsArray(): Point[] {
    return mapToArray(this.points);
  }

  getLinesArray(): Line[] {
    return mapToArray(this.lines);
  }

  getCirclesArray(): Circle[] {
    return mapToArray(this.circles);
  }

  setFromArrays(data: Partial<ModelData>) {
    this.points = arrayToMap(data.points || [], (p) => p.id);
    this.lines = arrayToMap(data.lines || [], (l) => l.id);
    this.circles = arrayToMap(data.circles || [], (c) => c.id);
  }
}
