import type { Mat3 } from './spatialTypes';

/** A fresh upright axonometric view shared by solid creation and view reset. */
export function defaultSpatialOrientation(): Mat3 {
  return [Math.SQRT1_2, -Math.SQRT1_2, 0,
    Math.SQRT1_2/2, Math.SQRT1_2/2, -Math.sqrt(3)/2,
    Math.sqrt(3/8), Math.sqrt(3/8), .5];
}
