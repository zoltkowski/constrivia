import type { FreeLabel, InkStroke as PersistedInkStroke } from './types';
import { getVertexOnLegPure } from './core/engine';
import { getLineByRef, getPointByRef, getAngleOtherPointsForLine } from './core/refactorHelpers';

// Debug panel DOM and event handling extracted from main.ts
type Deps = {
  getModel: () => any;
  // optional runtime getter for migration; when provided we convert via adapter
  getRuntime?: () => any;
  friendlyLabelForId: (id: string) => string;
  isParallelLine: (l: any) => boolean;
  isPerpendicularLine: (l: any) => boolean;
  isCircleThroughPoints: (c: any) => boolean;
  circleRadius: (c: any) => number;
  lineExtent: (idx: number) => { center: { x: number; y: number } } | null;
  polygonCentroid: (idx: number) => { x: number; y: number } | null;
  clamp: (v: number, a: number, b: number) => number;
  DEBUG_PANEL_MARGIN: { x: number; y: number };
  DEBUG_PANEL_TOP_MIN: number;
  draw: () => void;
  getShowHidden: () => boolean;
};

let debugPanel: HTMLElement | null = null;
let debugPanelHeader: HTMLElement | null = null;
let debugCloseBtn: HTMLButtonElement | null = null;
let debugContent: HTMLElement | null = null;
let debugPanelPos: { x: number; y: number } | null = null;
type DebugDragState = { pointerId: number; start: { x: number; y: number }; panelStart: { x: number; y: number } };
let debugDragState: DebugDragState | null = null;

let deps: Deps | null = null;

function applyDebugPanelPosition() {
  if (!debugPanel || !debugPanelPos) return;
  debugPanel.style.left = `${debugPanelPos.x}px`;
  debugPanel.style.top = `${debugPanelPos.y}px`;
}

export function ensureDebugPanelPosition() {
  if (!debugPanel || debugPanel.style.display === 'none') return;
  if (!deps) return;
  const rect = debugPanel.getBoundingClientRect();
  const width = rect.width || debugPanel.offsetWidth || 320;
  const height = rect.height || debugPanel.offsetHeight || 240;
  const maxX = Math.max(deps.DEBUG_PANEL_MARGIN.x, window.innerWidth - width - deps.DEBUG_PANEL_MARGIN.x);
  const maxY = Math.max(deps.DEBUG_PANEL_TOP_MIN, window.innerHeight - height - deps.DEBUG_PANEL_MARGIN.y);
  if (!debugPanelPos) {
    debugPanelPos = {
      x: deps.clamp(window.innerWidth - width - deps.DEBUG_PANEL_MARGIN.x, deps.DEBUG_PANEL_MARGIN.x, maxX),
      y: deps.clamp(80, deps.DEBUG_PANEL_TOP_MIN, maxY)
    };
  } else {
    debugPanelPos = {
      x: deps.clamp(debugPanelPos.x, deps.DEBUG_PANEL_MARGIN.x, maxX),
      y: deps.clamp(debugPanelPos.y, deps.DEBUG_PANEL_TOP_MIN, maxY)
    };
  }
  applyDebugPanelPosition();
}

export function endDebugPanelDrag(pointerId?: number) {
  if (!debugDragState) return;
  if (pointerId !== undefined && debugDragState.pointerId !== pointerId) return;
  try {
    debugPanelHeader?.releasePointerCapture(debugDragState.pointerId);
  } catch (err) {
    // ignore
  }
  debugPanel?.classList.remove('debug-panel--dragging');
  debugDragState = null;
}

function renderDebugPanelInternal() {
  if (!deps) return;
  const model = deps.getModel();
  const rt = deps.getRuntime ? deps.getRuntime() : null;
  if (!debugPanel || !debugContent) return;
  // read debug visible state from element attribute
  const visible = debugPanel.getAttribute('data-visible') === 'true';
  if (!visible) {
    debugPanel.style.display = 'none';
    debugPanel.setAttribute('aria-hidden', 'true');
    endDebugPanelDrag();
    return;
  }

  debugPanel.style.display = 'flex';
  debugPanel.setAttribute('aria-hidden', 'false');
  const sections: string[] = [];
  const fmtList = (items: string[] = []) => (items.length ? items.join(', ') : '');
  const setPart = (ids?: string[], joiner = ', ') => (ids && ids.length ? ids.map(deps!.friendlyLabelForId).join(joiner) : '');
  const fmtPoint = (p: any) => {
    const hidden = (p.style?.hidden ?? p.hidden) ? ' <span style="color:#ef4444;">Ø</span>' : '';
    const coords = ` <span style="color:#9ca3af;">(${p.x?.toFixed?.(1) ?? p.x}, ${p.y?.toFixed?.(1) ?? p.y})</span>`;
    const constructionKind = p.construction_kind ?? p.constructionKind;
    const parentRefs = p.parent_refs ?? [];
    const runtimeParents = p.parents ?? [];
    const parentLabels = (parentRefs.length ? parentRefs.map((pr: any) => deps!.friendlyLabelForId(pr.id)) : runtimeParents.map((id: string) => deps!.friendlyLabelForId(id))) as string[];
    const midpoint = p.midpoint ?? p.midpointMeta;
    const bisect = p.bisect ?? p.bisectMeta;
    const symmetric = p.symmetric ?? p.symmetricMeta;
    const bracketInfo = (() => {
      if (constructionKind === 'midpoint' && (midpoint?.parents ?? []).length === 2) {
        const a = deps!.friendlyLabelForId((midpoint!.parents)[0]);
        const b = deps!.friendlyLabelForId((midpoint!.parents)[1]);
        return ` [${a}, ${deps!.friendlyLabelForId(p.id)}, ${b}]`;
      }
      if (constructionKind === 'bisect' && bisect) {
        const a = deps!.friendlyLabelForId(bisect.seg1.a);
        const b = deps!.friendlyLabelForId(bisect.seg2.b);
        return ` [${a}, ${deps!.friendlyLabelForId(p.id)}, ${b}]`;
      }
      if (constructionKind === 'symmetric' && symmetric) {
        const src = deps!.friendlyLabelForId(symmetric.source);
        const mirrorLabel = deps!.friendlyLabelForId(symmetric.mirror?.id ?? symmetric.mirror);
        return ` [${src}, ${mirrorLabel}, ${deps!.friendlyLabelForId(p.id)}]`;
      }
      if (parentLabels.length) return ` {${parentLabels.join(', ')}}`;
      return '';
    })();
    return `${deps!.friendlyLabelForId(p.id)}${bracketInfo}${coords}${hidden}`;
  };


  const ptRows = rt
    ? Object.values(rt.points).map((p: any) => fmtPoint(p))
    : model.points.map((p: any) => fmtPoint(p));
  if (ptRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Punkty (${ptRows.length})</div><div>${ptRows
      .map((r: string) => `<div style=\"margin-bottom:3px;line-height:1.4;\">${r}</div>`)
      .join('')}</div></div>`);
  }

  const lineRows = rt
    ? Object.values(rt.lines).map((l: any) => {
        const def = (l.definingPoints || []).map((pid: string) => deps!.friendlyLabelForId(pid));
        const pts = (l.pointIds || []).map((pid: string) => deps!.friendlyLabelForId(pid));
        const hidden = (l as any)?.hidden ? ' <span style="color:#ef4444;">Ø</span>' : '';
        const defPart = def.length ? `{${def.join(', ')}}` : '';
        // show square brackets only when there are additional points beyond the defining ones
        const extraPts = pts.filter((p: string) => !def.includes(p));
        const ptsPart = extraPts.length > 0 ? ` [${pts.join(', ')}]` : '';
        return `<div style="margin-bottom:3px;line-height:1.4;">${deps!.friendlyLabelForId(l.id)} ${defPart}${ptsPart}${hidden}</div>`;
      })
    : model.lines.map((l: any) => {
        const isParallel = deps!.isParallelLine(l);
        const isPerpendicular = deps!.isPerpendicularLine(l);
        const anchorId = isParallel ? l.parallel!.throughPoint : isPerpendicular ? l.perpendicular!.throughPoint : null;
        const referenceId = isParallel ? l.parallel!.referenceLine : isPerpendicular ? l.perpendicular!.referenceLine : null;
        const relationSymbol = isParallel ? '∥' : isPerpendicular ? '⊥' : '';
        const defPoints = l.defining_points
          .map((pi: number) => {
            const p = model.points[pi];
            if (!p) return null;
            return deps!.friendlyLabelForId(p.id);
          })
          .filter((v: any): v is string => !!v);
        const allPointLabels = l.points
          .map((pi: number) => {
            const p = model.points[pi];
            return p ? deps!.friendlyLabelForId(p.id) : null;
          })
          .filter((v: any): v is string => !!v);
        const defPart = defPoints.length ? `{${defPoints.join(', ')}}` : '';
        // show square brackets only when there are additional points beyond the defining ones
        const extraLabels = allPointLabels.filter((lbl: string) => !defPoints.includes(lbl));
        const pointsPart = extraLabels.length > 0 ? ` [${allPointLabels.join(', ')}]` : '';
        const relationTail = relationSymbol && referenceId ? ` ${relationSymbol} ${deps!.friendlyLabelForId(referenceId)}` : '';
        const hiddenInfo = l.hidden ? ' <span style="color:#ef4444;">Ø</span>' : '';
        return `<div style="margin-bottom:3px;line-height:1.4;">${deps!.friendlyLabelForId(l.id)} ${defPart}${pointsPart}${relationTail}${hiddenInfo}</div>`;
      });
  if (lineRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Linie (${lineRows.length})</div>${lineRows.join('')}</div>`);
  }

  const circleRows = model.circles.map((c: any) => {
    const center = model.points[c.center];
    const centerLabel = center ? deps!.friendlyLabelForId(center.id) : `p${c.center}`;
    const parents = setPart(c.defining_parents);
    const children = '';
    const meta = parents || children ? ` <span style=\\"color:#9ca3af;\\">${[parents && `⊂ ${parents}`, children && `↘ ${children}`].filter(Boolean).join(' • ')}</span>` : '';
    const main = deps!.isCircleThroughPoints(c)
      ? `[${c.defining_points.map((pi: number) => deps!.friendlyLabelForId(model.points[pi]?.id ?? `p${pi}`)).join(', ')}] {${centerLabel}}`
      : (() => {
          const radiusLabel = deps!.friendlyLabelForId(model.points[c.radius_point]?.id ?? `p${c.radius_point}`);
          const radiusValue = deps!.circleRadius(c).toFixed(1);
          return `[${centerLabel}, ${radiusLabel}] <span style=\\"color:#9ca3af;\\">r=${radiusValue}</span>`;
        })();
    const hiddenInfo = c.hidden ? ' <span style=\\"color:#ef4444;\\">Ø</span>' : '';
    return `<div style=\\"margin-bottom:3px;line-height:1.4;\\">${deps!.friendlyLabelForId(c.id)} ${main}${meta}${hiddenInfo}</div>`;
  });
  if (circleRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Okręgi (${circleRows.length})</div>${circleRows.join('')}</div>`);
  }

  const polyRows = rt
    ? Object.values(rt.polygons).map((p: any) => {
        const verts = (p.vertices || []).map((pid: string) => deps!.friendlyLabelForId(pid)).join(', ');
        const hidden = (p as any)?.hidden ? ' <span style="color:#ef4444;">Ø</span>' : '';
        return `<div style=\"margin-bottom:3px;line-height:1.4;\">${deps!.friendlyLabelForId(p.id)} [${verts}]${hidden}</div>`;
      })
    : model.polygons.map((p: any) => {
        const pointLabels: string[] = [];
        p.lines.forEach((li: number) => {
          const line = model.lines[li];
          if (!line) return;
          line.defining_points.forEach((pi: number) => {
            const pt = model.points[pi];
            const lbl = pt ? deps!.friendlyLabelForId(pt.id) : null;
            if (lbl && !pointLabels.includes(lbl)) pointLabels.push(lbl);
          });
        });
        const parents = setPart(p.defining_parents);
        const children = '';
        const meta = parents || children ? ` <span style=\"color:#9ca3af;\">${[parents && `⊂ ${parents}`, children && `↘ ${children}`].filter(Boolean).join(' • ')}</span>` : '';
        const hidden = p.hidden ? ' <span style=\"color:#ef4444;\">Ø</span>' : '';
        return `<div style=\"margin-bottom:3px;line-height:1.4;\">${deps!.friendlyLabelForId(p.id)} [${pointLabels.join(', ')}]${meta}${hidden}</div>`;
      });
  if (polyRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Wielokąty (${polyRows.length})</div>${polyRows.join('')}</div>`);
  }

  const angleRows = model.angles.map((a: any) => {
    const l1 = getLineByRef(a.leg1?.line ?? a.arm1LineId, model);
    const l2 = getLineByRef(a.leg2?.line ?? a.arm2LineId, model);
    const parents = setPart(a.defining_parents);
    const children = '';
    const meta = parents || children ? ` <span style="color:#9ca3af;">${[parents && `⊂ ${parents}`, children && `↘ ${children}`].filter(Boolean).join(' • ')}</span>` : '';
    // Resolve canonical point refs when possible, preferring `point1`/`point2`, then legacy `leg*.otherPoint`, then derive from `arm*LineId`.
    let p1Idx: number | undefined = undefined;
    let p2Idx: number | undefined = undefined;
    if (typeof a.point1 === 'number') p1Idx = a.point1;
    else if (a.leg1 && typeof a.leg1.otherPoint === 'number') p1Idx = a.leg1.otherPoint;
    else {
      const l1Idx = l1 ? model.indexById?.line?.[l1.id] : (typeof a.arm1LineId === 'string' ? model.indexById?.line?.[a.arm1LineId] : (a.leg1 && typeof a.leg1.line === 'number' ? a.leg1.line : undefined));
      if (typeof l1Idx === 'number') {
        const res = getAngleOtherPointsForLine(a, l1Idx, model);
        if (res.leg1Other !== null) p1Idx = res.leg1Other as number;
      }
    }
    if (typeof a.point2 === 'number') p2Idx = a.point2;
    else if (a.leg2 && typeof a.leg2.otherPoint === 'number') p2Idx = a.leg2.otherPoint;
    else {
      const l2Idx = l2 ? model.indexById?.line?.[l2.id] : (typeof a.arm2LineId === 'string' ? model.indexById?.line?.[a.arm2LineId] : (a.leg2 && typeof a.leg2.line === 'number' ? a.leg2.line : undefined));
      if (typeof l2Idx === 'number') {
        const res = getAngleOtherPointsForLine(a, l2Idx, model);
        if (res.leg2Other !== null) p2Idx = res.leg2Other as number;
      }
    }
    if (l1 && l2 && typeof p1Idx === 'number' && typeof p2Idx === 'number') {
      const vIdx = a.vertex;
      const p1Label = deps!.friendlyLabelForId(model.points[p1Idx]?.id ?? `p${p1Idx}`);
      const vertexLabel = deps!.friendlyLabelForId(model.points[vIdx]?.id ?? `p${vIdx}`);
      const p2Label = deps!.friendlyLabelForId(model.points[p2Idx]?.id ?? `p${p2Idx}`);
      const hiddenInfo = a.hidden ? ' <span style="color:#ef4444;">Ø</span>' : '';
      return `<div style="margin-bottom:3px;line-height:1.4;">${deps!.friendlyLabelForId(a.id)} [${p1Label}, ${vertexLabel}, ${p2Label}]${meta}${hiddenInfo}</div>`;
    }
    const vertexLabel = deps!.friendlyLabelForId(model.points[a.vertex]?.id ?? `p${a.vertex}`);
    const leg1Label = l1 ? deps!.friendlyLabelForId(l1.id) : (a.arm1LineId ? deps!.friendlyLabelForId(a.arm1LineId) : (a.leg1 ? `l${a.leg1.line}` : '?'));
    const leg2Label = l2 ? deps!.friendlyLabelForId(l2.id) : (a.arm2LineId ? deps!.friendlyLabelForId(a.arm2LineId) : (a.leg2 ? `l${a.leg2.line}` : '?'));
    const hiddenInfo = a.hidden ? ' <span style="color:#ef4444;">Ø</span>' : '';
    return `<div style="margin-bottom:3px;line-height:1.4;">${deps!.friendlyLabelForId(a.id)} [${vertexLabel}, ${leg1Label}, ${leg2Label}]${meta}${hiddenInfo}</div>`;
  });
  if (angleRows.length) {
    sections.push(`<div style="margin-bottom:12px;"><div style="font-weight:600;margin-bottom:4px;">Kąty (${angleRows.length})</div>${angleRows.join('')}</div>`);
  }

  debugContent.innerHTML = sections.length ? sections.join('') : '<div style=\"color:#9ca3af;\">Brak obiektów do wyświetlenia.</div>';
  requestAnimationFrame(() => ensureDebugPanelPosition());
}

export function initDebugPanel(d: Deps) {
  deps = d;
  debugPanel = document.getElementById('debugPanel');
  debugPanelHeader = document.getElementById('debugPanelHandle');
  debugCloseBtn = document.getElementById('debugCloseBtn') as HTMLButtonElement | null;
  debugContent = document.getElementById('debugContent');
  const debugToggleBtn = document.getElementById('debugToggle') as HTMLButtonElement | null;

  if (debugToggleBtn) {
    debugToggleBtn.addEventListener('click', () => {
      const visible = debugPanel?.getAttribute('data-visible') === 'true';
      debugPanel?.setAttribute('data-visible', visible ? 'false' : 'true');
      renderDebugPanelInternal();
      deps!.draw();
    });
  }
  debugCloseBtn?.addEventListener('click', () => {
    debugPanel?.setAttribute('data-visible', 'false');
    renderDebugPanelInternal();
  });

  const handleDebugPointerDown = (ev: PointerEvent) => {
    if (!debugPanel || !debugPanelHeader) return;
    const target = ev.target as HTMLElement | null;
    if (target && target.closest('#debugCloseBtn')) return;
    try {
      debugPanelHeader.setPointerCapture(ev.pointerId);
    } catch {}
    const rect = debugPanel.getBoundingClientRect();
    if (!debugPanelPos) debugPanelPos = { x: rect.left, y: rect.top };
    debugDragState = { pointerId: ev.pointerId, start: { x: ev.clientX, y: ev.clientY }, panelStart: { x: debugPanelPos.x, y: debugPanelPos.y } };
    debugPanel.classList.add('debug-panel--dragging');
    ev.preventDefault();
  };

  debugPanelHeader?.addEventListener('pointerdown', handleDebugPointerDown);
  debugPanelHeader?.addEventListener('pointermove', (ev: PointerEvent) => {
    if (!debugDragState || debugDragState.pointerId !== ev.pointerId || !debugPanel) return;
    const dx = ev.clientX - debugDragState.start.x;
    const dy = ev.clientY - debugDragState.start.y;
    const rect = debugPanel.getBoundingClientRect();
    const width = rect.width || debugPanel.offsetWidth || 320;
    const height = rect.height || debugPanel.offsetHeight || 240;
    const maxX = Math.max(deps!.DEBUG_PANEL_MARGIN.x, window.innerWidth - width - deps!.DEBUG_PANEL_MARGIN.x);
    const maxY = Math.max(deps!.DEBUG_PANEL_TOP_MIN, window.innerHeight - height - deps!.DEBUG_PANEL_MARGIN.y);
    debugPanelPos = {
      x: deps!.clamp(debugDragState.panelStart.x + dx, deps!.DEBUG_PANEL_MARGIN.x, maxX),
      y: deps!.clamp(debugDragState.panelStart.y + dy, deps!.DEBUG_PANEL_TOP_MIN, maxY)
    };
    applyDebugPanelPosition();
  });
  const releaseDebugPointer = (ev: PointerEvent) => {
    if (!debugDragState || debugDragState.pointerId !== ev.pointerId) return;
    endDebugPanelDrag(ev.pointerId);
  };
  debugPanelHeader?.addEventListener('pointerup', releaseDebugPointer);
  debugPanelHeader?.addEventListener('pointercancel', releaseDebugPointer);

  window.addEventListener('resize', () => {
    if (debugPanel?.getAttribute('data-visible') === 'true') ensureDebugPanelPosition();
  });

  // Initial render
  if (debugPanel && debugPanel.getAttribute('data-visible') === 'true') renderDebugPanelInternal();
}

// `setPart` helper is defined inline above; no global duplicate needed.

export function renderDebugPanel() {
  renderDebugPanelInternal();
}
