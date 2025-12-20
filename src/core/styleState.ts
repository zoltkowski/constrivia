import type { PointStyle, StrokeStyle, AngleStyle, Label } from '../types';
import type { ObjectId } from './runtimeTypes';

export interface PointVisualState {
  style: PointStyle;
  // label przyczepiona do punktu (nie free-label)
  label?: Label;
  hidden?: boolean;
}

export interface SegmentVisualOverride {
  style?: StrokeStyle;
  hidden?: boolean;
}

export interface LineVisualState {
  baseStyle: StrokeStyle;
  // nadpisania dla konkretnych segmentów (segIndex -> override)
  segmentOverrides: Record<number, SegmentVisualOverride>;
  leftRayStyle?: StrokeStyle;
  rightRayStyle?: StrokeStyle;
  hidden?: boolean;
  // label przyczepiona do linii
  label?: Label;
}

export interface CircleVisualState {
  stroke: StrokeStyle;
  fillColor?: string;
  fillOpacity?: number;
  label?: Label;
  hidden?: boolean;
}

export interface AngleVisualState {
  style: AngleStyle;
  label?: Label;
  hidden?: boolean;
}

export interface PolygonVisualState {
  stroke?: StrokeStyle;
  fillColor?: string;
  fillOpacity?: number;
  hidden?: boolean;
}

export interface StyleState {
  points: Record<ObjectId, PointVisualState>;
  lines: Record<ObjectId, LineVisualState>;
  circles: Record<ObjectId, CircleVisualState>;
  angles: Record<ObjectId, AngleVisualState>;
  polygons: Record<ObjectId, PolygonVisualState>;
}

export function makeEmptyStyleState(): StyleState {
  return {
    points: {},
    lines: {},
    circles: {},
    angles: {},
    polygons: {}
  };
}
