import type { AngleStyle, PointStyle, PointFillMode, StrokeStyle } from '../core/runtimeTypes';
import { mapAngleStyle, mapPointStyle, mapStrokeStyle } from '../styleMapper';
import { makeApplySelectionStyle } from '../canvas/renderer';

type ThemeLike = {
  defaultStroke: string;
  pointSize: number;
  lineWidth: number;
  angleStrokeWidth: number;
  midpointColor: string;
};

export type StyleHelpers = {
  currentPointStyle: () => PointStyle;
  midpointPointStyle: () => PointStyle;
  bisectPointStyle: () => PointStyle;
  symmetricPointStyle: () => PointStyle;
  currentStrokeStyle: () => StrokeStyle;
  currentAngleStyle: () => AngleStyle;
  applySelectionStyle: ReturnType<typeof makeApplySelectionStyle>;
};

export function createStyleHelpers(params: {
  getTheme: () => ThemeLike;
  getDefaultPointFillMode: () => PointFillMode;
  renderWidth: (w: number) => number;
}): StyleHelpers {
  const { getTheme, getDefaultPointFillMode, renderWidth } = params;
  const theme = getTheme();
  const applySelectionStyle = makeApplySelectionStyle(theme, renderWidth);

  const currentPointStyle = (): PointStyle => {
    const nextTheme = getTheme();
    const hollow = getDefaultPointFillMode() === 'hollow';
    return mapPointStyle({
      style: { color: nextTheme.defaultStroke, size: nextTheme.pointSize, hollow }
    });
  };

  const midpointPointStyle = (): PointStyle => {
    const nextTheme = getTheme();
    const hollow = getDefaultPointFillMode() === 'hollow';
    return { color: nextTheme.midpointColor, size: nextTheme.pointSize, hollow };
  };

  const bisectPointStyle = (): PointStyle => {
    const nextTheme = getTheme();
    const hollow = getDefaultPointFillMode() === 'hollow';
    return { color: nextTheme.midpointColor, size: nextTheme.pointSize, hollow };
  };

  const symmetricPointStyle = (): PointStyle => {
    const nextTheme = getTheme();
    const hollow = getDefaultPointFillMode() === 'hollow';
    return { color: nextTheme.defaultStroke, size: nextTheme.pointSize, hollow };
  };

  const currentStrokeStyle = (): StrokeStyle => {
    const nextTheme = getTheme();
    return mapStrokeStyle(
      {
        color: nextTheme.defaultStroke,
        width: nextTheme.lineWidth,
        type: 'solid',
        tick: 0
      },
      undefined,
      'line'
    );
  };

  const currentAngleStyle = (): AngleStyle => {
    const nextTheme = getTheme();
    return mapAngleStyle(
      {
        style: {
          color: nextTheme.defaultStroke,
          width: nextTheme.angleStrokeWidth,
          type: 'solid',
          fill: undefined,
          arcCount: 1,
          right: false,
          arcRadiusOffset: 0
        }
      },
      { color: nextTheme.defaultStroke, width: nextTheme.angleStrokeWidth, type: 'solid' }
    );
  };

  return {
    currentPointStyle,
    midpointPointStyle,
    bisectPointStyle,
    symmetricPointStyle,
    currentStrokeStyle,
    currentAngleStyle,
    applySelectionStyle
  };
}
