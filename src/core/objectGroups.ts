import { collectConstructionCopyInputs, type ConstructionCopyRoot } from './constructionCopyInputs';
import type { ConstructionRuntime, ObjectGroup } from './runtimeTypes';

export const groupCollections = ['points', 'lines', 'circles', 'angles', 'polygons', 'inkStrokes', 'labels'] as const;
export type GroupCollection = typeof groupCollections[number];
export type GroupSelection = Record<GroupCollection, Set<string>>;
const geometry = { points: 'point', lines: 'line', circles: 'circle', angles: 'angle', polygons: 'polygon' } as const;

export function groupForObject(runtime: ConstructionRuntime, kind: GroupCollection, id: string) {
  return Object.values(runtime.objectGroups ?? {}).find(group => group.members[kind]?.includes(id));
}

export function selectedObjectGroups(runtime: ConstructionRuntime, selection: GroupSelection) {
  return Object.values(runtime.objectGroups ?? {}).filter(group => groupCollections.some(key => group.members[key]?.some(id => selection[key].has(id))));
}

export function setObjectGroupSelection(group: ObjectGroup, selection: GroupSelection, selected: boolean) {
  for (const key of groupCollections) for (const id of group.members[key] ?? []) {
    if (selected) selection[key].add(id); else selection[key].delete(id);
  }
}

export function expandObjectGroupSelection(runtime: ConstructionRuntime, selection: GroupSelection) {
  for (const group of selectedObjectGroups(runtime, selection)) setObjectGroupSelection(group, selection, true);
}

/** Flat, disjoint groups also own their construction inputs, so dragging a member
 * cannot deform the rest of the group through an unselected control point. */
export function createObjectGroup(runtime: ConstructionRuntime, selection: GroupSelection) {
  const members = Object.fromEntries(groupCollections.map(key => [key, new Set(selection[key])])) as GroupSelection;
  let previous = '';
  while (true) {
    expandObjectGroupSelection(runtime, members);
    const roots: ConstructionCopyRoot[] = [];
    for (const [key, kind] of Object.entries(geometry)) for (const id of members[key as keyof typeof geometry]) roots.push({ kind, id });
    const inputs = collectConstructionCopyInputs(runtime, roots);
    for (const key of Object.keys(geometry) as (keyof typeof geometry)[]) inputs[key].forEach(id => members[key].add(id));
    const signature = groupCollections.map(key => members[key].size).join(',');
    if (signature === previous) break;
    previous = signature;
  }
  const count = groupCollections.reduce((sum, key) => sum + members[key].size, 0);
  if (count < 2) return null;
  const merged = selectedObjectGroups(runtime, members);
  runtime.objectGroups ??= {};
  let n = 1;
  while (runtime.objectGroups[`group${n}`]) n++;
  const group: ObjectGroup = { id: `group${n}`, members: {}, locked: merged.some(group => group.locked) };
  for (const key of groupCollections) group.members[key] = [...members[key]];
  for (const old of merged) delete runtime.objectGroups[old.id];
  runtime.objectGroups[group.id] = group;
  setObjectGroupSelection(group, selection, true);
  return group;
}

/** Validate saved metadata and discard deleted members and overlapping groups. */
export function restoreObjectGroups(runtime: ConstructionRuntime, value: unknown) {
  const groups: Record<string, ObjectGroup> = {};
  const used = new Set<string>();
  if (value && typeof value === 'object' && !Array.isArray(value)) for (const [id, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || raw.id !== id || !raw.members || typeof raw.members !== 'object') continue;
    const group: ObjectGroup = { id, members: {}, locked: raw.locked === true };
    for (const key of groupCollections) group.members[key] = Array.isArray(raw.members[key])
      ? [...new Set<string>(raw.members[key].filter((member: unknown) => typeof member === 'string' && Object.prototype.hasOwnProperty.call(runtime[key], member) && !used.has(`${key}:${member}`)))] : [];
    if (groupCollections.reduce((sum, key) => sum + group.members[key]!.length, 0) < 2) continue;
    groups[id] = group;
    for (const key of groupCollections) for (const member of group.members[key]!) used.add(`${key}:${member}`);
  }
  runtime.objectGroups = groups;
}

export function applyObjectGroupStyle(runtime: ConstructionRuntime, selection: GroupSelection, attribute: 'color' | 'width' | 'type', value: string | number) {
  for (const id of selection.points) {
    const point = runtime.points[id];
    if (point && attribute !== 'type') point.style = { ...point.style, [attribute === 'width' ? 'size' : attribute]: value };
  }
  const patch = { [attribute]: value };
  for (const id of selection.lines) {
    const line = runtime.lines[id]; if (!line) continue;
    line.style = { ...line.style, ...patch };
    line.segmentStyles = line.points.slice(1).map((_, i) => ({ ...line.segmentStyles?.[i] ?? line.style, ...patch }));
    if (line.leftRay) Object.assign(line.leftRay, patch);
    if (line.rightRay) Object.assign(line.rightRay, patch);
  }
  for (const id of selection.circles) {
    const circle = runtime.circles[id]; if (!circle) continue;
    Object.assign(circle.style, patch);
    Object.values(circle.arcStyles ?? {}).forEach(style => Object.assign(style, patch));
    if (attribute === 'color' && circle.fillOpacity !== undefined) circle.fill = String(value);
  }
  for (const id of selection.angles) if (runtime.angles[id]) Object.assign(runtime.angles[id].style, patch);
  if (attribute === 'color') {
    for (const id of selection.polygons) {
      const polygon = runtime.polygons[id];
      if (polygon && polygon.fillOpacity !== undefined) polygon.fill = String(value);
    }
    for (const id of selection.labels) if (runtime.labels[id]) runtime.labels[id].color = String(value);
  }
  for (const id of selection.inkStrokes) {
    const stroke = runtime.inkStrokes[id];
    if (stroke && attribute !== 'type') Object.assign(stroke, { [attribute === 'width' ? 'baseWidth' : attribute]: value });
  }
}
