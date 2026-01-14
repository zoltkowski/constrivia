import type { CopiedStyle, Label, ObjectId, StrokeStyle } from '../core/runtimeTypes';

export type StyleSelectionState = {
  selectedPointId: ObjectId | null;
  selectedLineId: ObjectId | null;
  selectedCircleId: ObjectId | null;
  selectedAngleId: ObjectId | null;
  selectedPolygonId: ObjectId | null;
  selectedLabel: { kind: 'point' | 'line' | 'angle' | 'free'; id: string } | null;
  selectedInkStrokeId: ObjectId | null;
  selectedSegments: Set<string>;
  selectedArcSegments: Set<string>;
  multiSelectedLabels: Set<ObjectId>;
};

export type StyleSelectionDeps = {
  getSelection: () => StyleSelectionState;
  getPointById: (id: ObjectId) => { id: ObjectId; style: { color?: string; size?: number }; label?: Label } | null;
  getLineById: (id: ObjectId) => {
    id: ObjectId;
    style: StrokeStyle;
    segmentStyles?: StrokeStyle[];
    leftRay?: StrokeStyle;
    rightRay?: StrokeStyle;
    label?: Label;
  } | null;
  getPolygonById: (id: ObjectId) => { id: ObjectId; fill?: string; fillOpacity?: number } | null;
  polygonLines: (id: ObjectId) => ObjectId[];
  polygonEdgeSegmentKeys: (id: ObjectId) => Set<string>;
  getCircleById: (id: ObjectId) => {
    id: ObjectId;
    style: StrokeStyle;
    arcStyles?: StrokeStyle[] | Record<string, StrokeStyle>;
    label?: Label;
  } | null;
  getAngleById: (id: ObjectId) => { id: ObjectId; style: any; label?: Label } | null;
  getLabelById: (id: ObjectId) => (Label & { id: ObjectId }) | null;
  getInkStrokeById: (id: ObjectId) => { id: ObjectId; color: string; baseWidth: number } | null;
  parseSegmentKey: (key: string) => { lineId: string; part: 'segment' | 'rayLeft' | 'rayRight'; seg?: number } | null;
  parseArcKey: (key: string) => { circleId: string; arcIdx: number; start?: string; end?: string } | null;
  arcKey: (circleId: string, startPointId: string, endPointId: string) => string;
  circleArcs: (circleId: ObjectId) => Array<{ key: string }>;
  ensureSegmentStylesForLine: (lineId: ObjectId) => void;
  ensureArcStyles: (circleId: ObjectId, count: number) => void;
  normalizeLabelFontSize: (value?: number) => number;
  draw: () => void;
  pushHistory: () => void;
};

export function createStyleSelectionHandlers(deps: StyleSelectionDeps) {
  const copyStyleFromSelection = (): CopiedStyle | null => {
    const {
      selectedPointId,
      selectedLineId,
      selectedCircleId,
      selectedAngleId,
      selectedPolygonId,
      selectedLabel,
      selectedInkStrokeId,
      selectedSegments,
      selectedArcSegments
    } = deps.getSelection();

    if (selectedPointId !== null) {
      const pt = deps.getPointById(selectedPointId);
      if (!pt) return null;
      return {
        sourceType: 'point',
        color: pt.style.color,
        size: pt.style.size
      };
    }
    if (selectedPolygonId !== null && selectedSegments.size === 0) {
      const poly = deps.getPolygonById(selectedPolygonId);
      if (!poly) return null;
      const edgeKeys = deps.polygonEdgeSegmentKeys(selectedPolygonId);
      let edgeStyle: StrokeStyle | undefined;
      if (edgeKeys.size > 0) {
        const firstKey = Array.from(edgeKeys)[0];
        const parsed = deps.parseSegmentKey(firstKey);
        if (parsed) {
          const line = deps.getLineById(parsed.lineId);
          if (line) {
            if (parsed.part === 'segment' && parsed.seg !== undefined) {
              edgeStyle = line.segmentStyles?.[parsed.seg] ?? line.style;
            } else if (parsed.part === 'rayLeft') {
              edgeStyle = line.leftRay ?? line.style;
            } else if (parsed.part === 'rayRight') {
              edgeStyle = line.rightRay ?? line.style;
            }
          }
        }
      }
      if (!edgeStyle) {
        const lineIds = deps.polygonLines(selectedPolygonId);
        const line = lineIds.length ? deps.getLineById(lineIds[0]) : null;
        edgeStyle = line?.style;
      }
      return {
        sourceType: 'polygon',
        color: edgeStyle?.color,
        width: edgeStyle?.width,
        type: edgeStyle?.type,
        tick: edgeStyle?.tick,
        fill: poly.fill,
        fillOpacity: poly.fillOpacity !== undefined ? poly.fillOpacity : null
      };
    }
    if (selectedLineId !== null) {
      const lineId = selectedLineId;
      const line = deps.getLineById(lineId);
      if (!line) return null;
      if (selectedSegments.size > 0) {
        const firstKey = Array.from(selectedSegments)[0];
        const parsed = deps.parseSegmentKey(firstKey);
        if (parsed && parsed.lineId === lineId) {
          let style: StrokeStyle | undefined;
          if (parsed.part === 'segment' && parsed.seg !== undefined) {
            style = line.segmentStyles?.[parsed.seg] ?? line.style;
          } else if (parsed.part === 'rayLeft') {
            style = line.leftRay ?? line.style;
          } else if (parsed.part === 'rayRight') {
            style = line.rightRay ?? line.style;
          }
          if (style) {
            return {
              sourceType: 'line',
              color: style.color,
              width: style.width,
              type: style.type,
              tick: style.tick
            };
          }
        }
      }
      return {
        sourceType: 'line',
        color: line.style.color,
        width: line.style.width,
        type: line.style.type,
        tick: line.style.tick
      };
    }
    if (selectedCircleId !== null) {
      const circleId = selectedCircleId;
      const circle = deps.getCircleById(circleId);
      if (!circle) return null;
      if (selectedArcSegments.size > 0) {
        const firstKey = Array.from(selectedArcSegments)[0];
        const parsed = deps.parseArcKey(firstKey);
        if (parsed && parsed.circleId === circleId && parsed.start !== undefined && parsed.end !== undefined) {
          const key = deps.arcKey(circleId, parsed.start, parsed.end);
          const style = (circle.arcStyles as any)?.[key] ?? circle.style;
          return {
            sourceType: 'circle',
            color: style.color,
            width: style.width,
            type: style.type,
            tick: style.tick
          };
        }
      }
      return {
        sourceType: 'circle',
        color: circle.style.color,
        width: circle.style.width,
        type: circle.style.type,
        tick: circle.style.tick
      };
    }
    if (selectedAngleId !== null) {
      const angle = deps.getAngleById(selectedAngleId);
      if (!angle) return null;
      return {
        sourceType: 'angle',
        color: angle.style.color,
        width: angle.style.width,
        type: angle.style.type,
        arcCount: angle.style.arcCount,
        right: angle.style.right,
        fill: angle.style.fill,
        arcRadiusOffset: angle.style.arcRadiusOffset
      };
    }
    if (selectedLabel !== null) {
      const sel = selectedLabel;
      let lbl: Label | undefined | null = null;
      if (sel.kind === 'free') lbl = deps.getLabelById(sel.id);
      else if (sel.kind === 'point') lbl = deps.getPointById(sel.id)?.label ?? null;
      else if (sel.kind === 'line') lbl = deps.getLineById(sel.id)?.label ?? null;
      else if (sel.kind === 'angle') lbl = deps.getAngleById(sel.id)?.label ?? null;
      if (lbl) {
        return { sourceType: 'label' as const, color: lbl.color, fontSize: deps.normalizeLabelFontSize(lbl.fontSize) };
      }
    }
    if (selectedInkStrokeId !== null) {
      const stroke = deps.getInkStrokeById(selectedInkStrokeId);
      if (!stroke) return null;
      return {
        sourceType: 'ink',
        color: stroke.color,
        baseWidth: stroke.baseWidth
      };
    }
    return null;
  };

  const applyStyleToSelection = (style: CopiedStyle) => {
    const {
      selectedPointId,
      selectedLineId,
      selectedCircleId,
      selectedAngleId,
      selectedPolygonId,
      selectedLabel,
      selectedInkStrokeId,
      selectedSegments,
      selectedArcSegments,
      multiSelectedLabels
    } = deps.getSelection();

    let changed = false;
    if (selectedPointId !== null && style.color !== undefined && style.size !== undefined) {
      const pt = deps.getPointById(selectedPointId);
      if (pt) {
        pt.style.color = style.color;
        pt.style.size = style.size;
        changed = true;
      }
    }
    if (selectedLineId !== null && style.color !== undefined && style.width !== undefined && style.type !== undefined) {
      const line = deps.getLineById(selectedLineId);
      if (line) {
        if (selectedSegments.size > 0) {
          deps.ensureSegmentStylesForLine(selectedLineId);
          selectedSegments.forEach((key) => {
            const parsed = deps.parseSegmentKey(key);
            if (!parsed || parsed.lineId !== selectedLineId) return;
            if (parsed.part === 'segment' && parsed.seg !== undefined) {
              if (!line.segmentStyles) line.segmentStyles = [];
              const base = line.segmentStyles[parsed.seg] ?? line.style;
              line.segmentStyles[parsed.seg] = { ...base, color: style.color!, width: style.width!, type: style.type! };
              if (style.tick !== undefined) line.segmentStyles[parsed.seg].tick = style.tick;
            } else if (parsed.part === 'rayLeft') {
              const base = line.leftRay ?? line.style;
              line.leftRay = { ...base, color: style.color!, width: style.width!, type: style.type! };
              if (style.tick !== undefined) line.leftRay.tick = style.tick;
            } else if (parsed.part === 'rayRight') {
              const base = line.rightRay ?? line.style;
              line.rightRay = { ...base, color: style.color!, width: style.width!, type: style.type! };
              if (style.tick !== undefined) line.rightRay.tick = style.tick;
            }
          });
          changed = true;
        } else {
          line.style.color = style.color;
          line.style.width = style.width;
          line.style.type = style.type;
          if (style.tick !== undefined) line.style.tick = style.tick;

          if (line.segmentStyles && line.segmentStyles.length > 0) {
            line.segmentStyles = line.segmentStyles.map((seg: any) => ({
              ...seg,
              color: style.color!,
              width: style.width!,
              type: style.type!,
              tick: style.tick !== undefined ? style.tick : seg.tick
            }));
          }

          if (line.leftRay) {
            line.leftRay = { ...line.leftRay, color: style.color, width: style.width, type: style.type };
            if (style.tick !== undefined) line.leftRay.tick = style.tick;
          }
          if (line.rightRay) {
            line.rightRay = { ...line.rightRay, color: style.color, width: style.width, type: style.type };
            if (style.tick !== undefined) line.rightRay.tick = style.tick;
          }

          changed = true;
        }
      }
    }
    if (selectedCircleId !== null && style.color !== undefined && style.width !== undefined && style.type !== undefined) {
      const circle = deps.getCircleById(selectedCircleId);
      if (circle) {
        if (selectedArcSegments.size > 0) {
          const arcs = deps.circleArcs(selectedCircleId);
          deps.ensureArcStyles(selectedCircleId, arcs.length);
          selectedArcSegments.forEach((key) => {
            const parsed = deps.parseArcKey(key);
            if (!parsed || parsed.circleId !== selectedCircleId || parsed.start === undefined || parsed.end === undefined) return;
            if (!circle.arcStyles) circle.arcStyles = {} as any;
            const mapKey = deps.arcKey(selectedCircleId, parsed.start, parsed.end);
            const base = (circle.arcStyles as any)[mapKey] ?? circle.style;
            (circle.arcStyles as any)[mapKey] = { ...base, color: style.color!, width: style.width!, type: style.type! };
            if (style.tick !== undefined) (circle.arcStyles as any)[mapKey].tick = style.tick;
          });
          changed = true;
        } else {
          circle.style.color = style.color;
          circle.style.width = style.width;
          circle.style.type = style.type;
          if (style.tick !== undefined) circle.style.tick = style.tick;

          if (circle.arcStyles && !(Array.isArray(circle.arcStyles))) {
            const newMap: Record<string, StrokeStyle> = {};
            const arcs = deps.circleArcs(selectedCircleId);
            arcs.forEach((arc) => {
              const k = arc.key;
              const prev = (circle.arcStyles as any)?.[k] ?? circle.style;
              newMap[k] = {
                ...prev,
                color: style.color!,
                width: style.width!,
                type: style.type!,
                tick: style.tick !== undefined ? style.tick : prev.tick
              };
            });
            circle.arcStyles = newMap as any;
          }

          changed = true;
        }
      }
    }
    if (selectedAngleId !== null && style.color !== undefined && style.width !== undefined && style.type !== undefined) {
      const angle = deps.getAngleById(selectedAngleId);
      if (angle) {
        angle.style.color = style.color;
        angle.style.width = style.width;
        angle.style.type = style.type;
        if (style.arcCount !== undefined) angle.style.arcCount = style.arcCount;
        if (style.right !== undefined) angle.style.right = style.right;
        if (style.fill !== undefined) angle.style.fill = style.fill;
        if (style.arcRadiusOffset !== undefined) angle.style.arcRadiusOffset = style.arcRadiusOffset;
        changed = true;
      }
    }
    if (selectedPolygonId !== null) {
      const poly = deps.getPolygonById(selectedPolygonId);
      if (poly) {
        if (style.fillOpacity === null) {
          delete poly.fill;
          delete poly.fillOpacity;
        } else {
          if (style.fill !== undefined) poly.fill = style.fill;
          if (style.fillOpacity !== undefined) poly.fillOpacity = style.fillOpacity;
        }
        if (style.color !== undefined && style.width !== undefined && style.type !== undefined) {
          const edgeKeys = deps.polygonEdgeSegmentKeys(selectedPolygonId);
          if (edgeKeys.size > 0) {
            edgeKeys.forEach((key) => {
              const parsed = deps.parseSegmentKey(key);
              if (!parsed || parsed.part !== 'segment' || parsed.seg === undefined) return;
              const line = deps.getLineById(parsed.lineId);
              if (!line) return;
              deps.ensureSegmentStylesForLine(parsed.lineId);
              if (!line.segmentStyles) line.segmentStyles = [];
              const base = line.segmentStyles[parsed.seg] ?? line.style;
              line.segmentStyles[parsed.seg] = { ...base, color: style.color!, width: style.width!, type: style.type! };
              if (style.tick !== undefined) line.segmentStyles[parsed.seg].tick = style.tick;
              changed = true;
            });
          } else {
            const polygonLineIds = deps.polygonLines(selectedPolygonId);
            polygonLineIds.forEach((lineId) => {
              const line = deps.getLineById(lineId);
              if (!line) return;
              line.style.color = style.color!;
              line.style.width = style.width!;
              line.style.type = style.type!;
              if (style.tick !== undefined) line.style.tick = style.tick;
              if (line.segmentStyles && line.segmentStyles.length > 0) {
                line.segmentStyles = line.segmentStyles.map((seg: any) => ({
                  ...seg,
                  color: style.color!,
                  width: style.width!,
                  type: style.type!,
                  tick: style.tick !== undefined ? style.tick : seg.tick
                }));
              }
              changed = true;
            });
          }
        }
        changed = true;
      }
    }
    if (selectedLabel !== null || multiSelectedLabels.size > 0) {
      if (selectedLabel) {
        const sel = selectedLabel;
        if (sel.kind === 'free') {
          const lab = deps.getLabelById(sel.id);
          if (lab) {
            if (style.color !== undefined) lab.color = style.color;
            if (style.fontSize !== undefined) lab.fontSize = style.fontSize;
            changed = true;
          }
        } else if (sel.kind === 'point') {
          const p = deps.getPointById(sel.id);
          if (p && p.label) {
            if (style.color !== undefined) p.label.color = style.color;
            if (style.fontSize !== undefined) p.label.fontSize = style.fontSize;
            changed = true;
          }
        } else if (sel.kind === 'line') {
          const l = deps.getLineById(sel.id);
          if (l && l.label) {
            if (style.color !== undefined) l.label.color = style.color;
            if (style.fontSize !== undefined) l.label.fontSize = style.fontSize;
            changed = true;
          }
        } else if (sel.kind === 'angle') {
          const a = deps.getAngleById(sel.id);
          if (a && a.label) {
            if (style.color !== undefined) a.label.color = style.color;
            if (style.fontSize !== undefined) a.label.fontSize = style.fontSize;
            changed = true;
          }
        }
      }
      if (multiSelectedLabels.size > 0) {
        multiSelectedLabels.forEach((id) => {
          const lab = deps.getLabelById(id);
          if (lab) {
            if (style.color !== undefined) lab.color = style.color;
            if (style.fontSize !== undefined) lab.fontSize = style.fontSize;
            changed = true;
          }
        });
      }
    }
    if (selectedInkStrokeId !== null && style.color !== undefined && style.baseWidth !== undefined) {
      const stroke = deps.getInkStrokeById(selectedInkStrokeId);
      if (stroke) {
        stroke.color = style.color;
        stroke.baseWidth = style.baseWidth;
        changed = true;
      }
    }
    if (changed) {
      deps.draw();
      deps.pushHistory();
    }
  };

  return { copyStyleFromSelection, applyStyleToSelection };
}
