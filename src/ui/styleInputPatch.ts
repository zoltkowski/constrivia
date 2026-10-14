import type { PointStyle, StrokeStyle } from '../core/runtimeTypes';

export type StyleInputAttribute = 'color' | 'width' | 'type';

export function strokeInputPatch(attribute: StyleInputAttribute, values: Pick<StrokeStyle, 'color' | 'width' | 'type'>): Partial<StrokeStyle> {
  return { [attribute]: values[attribute] };
}

export function pointInputPatch(attribute: StyleInputAttribute, values: Pick<StrokeStyle, 'color' | 'width'>): Partial<PointStyle> {
  if (attribute === 'color') return { color: values.color };
  if (attribute === 'width') return { size: values.width };
  return {};
}
