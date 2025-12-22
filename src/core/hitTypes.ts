export type LineHit =
  | { line: number; part: 'segment'; seg: number }
  | { line: number; part: 'rayLeft' }
  | { line: number; part: 'rayRight' };

export type CircleHit = { circle: number };
