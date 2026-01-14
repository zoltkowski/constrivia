import { getAngleOtherPointsForLine } from './core/angleTools';

// Debug panel DOM and event handling extracted from main.ts
type Deps = {
  getRuntime: () => any;
  friendlyLabelForId: (id: string) => string;
  isParallelLine: (l: any) => boolean;
  isPerpendicularLine: (l: any) => boolean;
  isCircleThroughPoints: (c: any) => boolean;
  circleRadius: (c: any) => number;
  lineExtent: (lineId: string) => { center: { x: number; y: number } } | null;
  polygonCentroid: (polyId: string) => { x: number; y: number } | null;
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

// Used by UI/state updates.
function applyDebugPanelPosition() {
  if (!debugPanel || !debugPanelPos) return;
  debugPanel.style.left = `${debugPanelPos.x}px`;
  debugPanel.style.top = `${debugPanelPos.y}px`;
}

// Used by main UI flow.
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

// Used by gesture handling.
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

// Used by rendering flow.
function renderDebugPanelInternal() {
  if (!deps) return;
  const rt = deps.getRuntime();
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
  const pointById = (id?: string | null) => {
    if (!id) return null;
    const key = String(id);
    return rt?.points?.[key] ?? null;
  };
  const lineById = (id?: string | null) => {
    if (!id) return null;
    const key = String(id);
    return rt?.lines?.[key] ?? null;
  };
  const fmtPoint = (p: any) => {
    const hidden = (p.style?.hidden ?? p.hidden) ? ' <span style="color:#ef4444;">\u{1F6C7}</span>' : '';
    const coords = ` <span style="color:#9ca3af;">(${p.x?.toFixed?.(1) ?? p.x}, ${p.y?.toFixed?.(1) ?? p.y})</span>`;
    const constructionKind = p.construction_kind ?? p.constructionKind;
    const parentRefs = p.parent_refs ?? [];
    const runtimeParents = p.parents ?? [];
    const parentLabels = (parentRefs.length ? parentRefs.map((pr: any) => deps!.friendlyLabelForId(pr.id)) : runtimeParents.map((id: string) => deps!.friendlyLabelForId(id))) as string[];
    const midpoint = p.midpointMeta;
    const bisect = p.bisectMeta;
    const symmetric = p.symmetricMeta;
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
      if (parentLabels.length === 1) return ` \u2208 ${parentLabels[0]}`;
      if (parentLabels.length > 1) return ` \u2208 ${parentLabels.join(' \u2229 ')}`;
      return '';
    })();
    return `${deps!.friendlyLabelForId(p.id)}${bracketInfo}${coords}${hidden}`;
  };


  const pointList = Object.values(rt?.points ?? {});
  const ptRows = pointList.map((p: any) => fmtPoint(p));
  if (ptRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Punkty (${ptRows.length})</div><div>${ptRows
      .map((r: string) => `<div style=\"margin-bottom:3px;line-height:1.4;\">${r}</div>`)
      .join('')}</div></div>`);
  }

  const lineRows = Object.values(rt?.lines ?? {}).map((l: any) => {
    const def = (l.defining_points || []).map((pid: string) => deps!.friendlyLabelForId(pid));
    const pts = (l.points || []).map((pid: string) => deps!.friendlyLabelForId(pid));
    const hidden = (l as any)?.hidden ? ' <span style="color:#ef4444;">\u{1F6C7}</span>' : '';
    const defPart = def.length ? `{${def.join(', ')}}` : '';
    // show square brackets only when there are additional points beyond the defining ones
    const extraPts = pts.filter((p: string) => !def.includes(p));
    const ptsPart = extraPts.length > 0 ? ` [${pts.join(', ')}]` : '';
    return `<div style="margin-bottom:3px;line-height:1.4;">${deps!.friendlyLabelForId(l.id)} ${defPart}${ptsPart}${hidden}</div>`;
  });

  if (lineRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Linie (${lineRows.length})</div>${lineRows.join('')}</div>`);
  }

  const circleRows = Object.values(rt?.circles ?? {}).map((c: any) => {
    const center = pointById(c.center);
    const centerLabel = center ? deps!.friendlyLabelForId(center.id) : deps!.friendlyLabelForId(c.center);
    const parents = setPart(c.defining_parents);
    const children = '';
    const meta = parents || children ? ` <span style=\"color:#9ca3af;\">${[parents && `? ${parents}`, children && `? ${children}`].filter(Boolean).join(' \u0007 ')}</span>` : '';
    const main = deps!.isCircleThroughPoints(c)
      ? `[${(c.defining_points ?? []).map((pid: string) => deps!.friendlyLabelForId(pid)).join(', ')}] {${centerLabel}}`
      : (() => {
          const radiusLabel = c.radius_point ? deps!.friendlyLabelForId(c.radius_point) : '?';
          const radiusValue = deps!.circleRadius(c).toFixed(1);
          return `[${centerLabel}, ${radiusLabel}] <span style=\"color:#9ca3af;\">r=${radiusValue}</span>`;
        })();
    const hiddenInfo = c.hidden ? ' <span style=\"color:#ef4444;\">\u{1F6C7}</span>' : '';
    return `<div style=\"margin-bottom:3px;line-height:1.4;\">${deps!.friendlyLabelForId(c.id)} ${main}${meta}${hiddenInfo}</div>`;
  });

  if (circleRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Okręgi (${circleRows.length})</div>${circleRows.join('')}</div>`);
  }

  const polyRows = Object.values(rt?.polygons ?? {}).map((p: any) => {
    const verts = (p.points || []).map((pid: string) => deps!.friendlyLabelForId(pid)).join(', ');
    const hidden = (p as any)?.hidden ? ' <span style=\"color:#ef4444;\">\u{1F6C7}</span>' : '';
    const locked = p.locked ? ' <span style=\"color:#f59e0b;\">\u{1F512}</span>' : '';
    return `<div style=\"margin-bottom:3px;line-height:1.4;\">${deps!.friendlyLabelForId(p.id)} [${verts}]${hidden}${locked}</div>`;
  });

  if (polyRows.length) {
    sections.push(`<div style=\"margin-bottom:12px;\"><div style=\"font-weight:600;margin-bottom:4px;\">Wielokąty (${polyRows.length})</div>${polyRows.join('')}</div>`);
  }

  const angleRows = Object.values(rt?.angles ?? {}).map((a: any) => {
    const parents = setPart(a.defining_parents);
    const children = '';
    const meta = parents || children ? ` <span style=\"color:#9ca3af;\">${[parents && `? ${parents}`, children && `? ${children}`].filter(Boolean).join(' \u0007 ')}</span>` : '';
    const vertexId = typeof a.vertex === 'string' ? a.vertex : null;
    let p1Id = typeof a.point1 === 'string' ? a.point1 : null;
    let p2Id = typeof a.point2 === 'string' ? a.point2 : null;
    if (!p1Id && typeof a.arm1LineId === 'string') {
      const res = getAngleOtherPointsForLine(a, a.arm1LineId, rt);
      p1Id = res.leg1Other ?? null;
    }
    if (!p2Id && typeof a.arm2LineId === 'string') {
      const res = getAngleOtherPointsForLine(a, a.arm2LineId, rt);
      p2Id = res.leg2Other ?? null;
    }
    const p1Label = p1Id ? deps!.friendlyLabelForId(p1Id) : '?';
    const p2Label = p2Id ? deps!.friendlyLabelForId(p2Id) : '?';
    const vLabel = vertexId ? deps!.friendlyLabelForId(vertexId) : '?';
    const hidden = a.hidden ? ' <span style=\"color:#ef4444;\">\u{1F6C7}</span>' : '';
    const legs = `[${p1Label}, ${vLabel}, ${p2Label}]`;
    return `<div style=\"margin-bottom:3px;line-height:1.4;\">${deps!.friendlyLabelForId(a.id)} ${legs}${meta}${hidden}</div>`;
  });

  if (angleRows.length) {
    sections.push(`<div style="margin-bottom:12px;"><div style="font-weight:600;margin-bottom:4px;">Kąty (${angleRows.length})</div>${angleRows.join('')}</div>`);
  }

  debugContent.innerHTML = sections.length ? sections.join('') : '<div style=\"color:#9ca3af;\">Brak obiektów do wyświetlenia.</div>';
  requestAnimationFrame(() => ensureDebugPanelPosition());
}

// Used by UI initialization.
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

// Used by rendering flow.
export function renderDebugPanel() {
  renderDebugPanelInternal();
}
