import type { ObjectId } from './runtimeTypes';

export type LineHit =
  | { lineId: ObjectId; part: 'segment'; seg: number }
  | { lineId: ObjectId; part: 'rayLeft' }
  | { lineId: ObjectId; part: 'rayRight' };

export type CircleHit = { circleId: ObjectId };
