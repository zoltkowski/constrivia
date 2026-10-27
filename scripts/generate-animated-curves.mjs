import { writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';

// Reproducible, editable constructions; no sampled curves are embedded.
const colors = { ink: '#db2777', driver: '#0284c7', secondary: '#059669', guide: '#64748b' };
const pi = Math.PI;

class Drawing {
  constructor(number, title, lines) {
    const heading = `${String(number).padStart(2, '0')}  ${title}`;
    this.model = { points: [], lines: [], circles: [], labels: [{
      id: 'opis', pos: { x: -205, y: -180 }, viewportAnchor: 'top-left', textAlign: 'left', fontSize: 2, color: '#718096',
      text: [heading, ...lines].join('\n'), textStyles: [{ start: 0, end: heading.length, bold: true, color: colors.ink }]
    }] };
    this.motions = [];
  }
  point(id, x, y, options = {}) {
    const { hidden = false, color = colors.driver, size = 3, label, trace = false, ...construction } = options;
    const p = { id, x, y, style: { color, size, ...(hidden ? { hidden: true } : {}) }, ...construction };
    if (label) p.label = { text: label, color, offset: { x: 11, y: -12 }, fontSize: -2 };
    if (trace) p.traceEnabled = true;
    this.model.points.push(p); return p;
  }
  free(id, x, y) { return this.point(id, x, y, { hidden: true }); }
  line(id, a, b, options = {}) {
    const { hidden = false, color = colors.guide, dashed = false, ...definition } = options;
    const style = { color, width: 1.5, type: dashed ? 'dashed' : 'solid' };
    const l = { id, points: [a, b], defining_points: [a, b], style,
      leftRay: { ...style, hidden: true }, rightRay: { ...style, hidden: true }, ...definition };
    if (hidden) l.hidden = true;
    this.model.lines.push(l); return l;
  }
  segment(id, a, b, moving) {
    const l = this.line(id, a, b);
    if (moving) l.points.splice(1, 0, moving);
    return l;
  }
  circle(id, center, radiusPoint, attached, options = {}) {
    const { color = colors.guide, dashed = false, ...definition } = options;
    const c = { id, center, radius_point: radiusPoint, circle_kind: 'center-radius', points: attached,
      style: { color, width: 1.6, type: dashed ? 'dashed' : 'solid' }, ...definition };
    this.model.circles.push(c); return c;
  }
  onLine(id, x, y, lineId, options = {}) {
    return this.point(id, x, y, { ...options, construction_kind: 'on_object', parent_refs: [{ kind: 'line', id: lineId }] });
  }
  onCircle(id, x, y, circleId, options = {}) {
    return this.point(id, x, y, { ...options, construction_kind: 'on_object', parent_refs: [{ kind: 'circle', id: circleId }] });
  }
  move(id, speed, direction = 1) { this.motions.push({ pointId: id, speed, direction }); }
  projectionLines(horizontalPoint, verticalPoint, output, x, y, axis) {
    const h = this.model.points.find(p => p.id === horizontalPoint);
    const v = this.model.points.find(p => p.id === verticalPoint);
    this.free('h-helper', h.x + 40, h.y); this.free('v-helper', v.x, v.y + 40);
    this.line('horizontal', horizontalPoint, 'h-helper', { hidden: true, construction_kind: 'parallel',
      parallel: { throughPoint: horizontalPoint, referenceLine: axis, helperPoint: 'h-helper', helperDistance: 40 } });
    this.line('vertical', verticalPoint, 'v-helper', { hidden: true, construction_kind: 'perpendicular',
      perpendicular: { throughPoint: verticalPoint, referenceLine: axis, helperPoint: 'v-helper', helperDistance: 40, helperOrientation: 1, helperMode: 'normal' } });
    this.point(output, x, y, { color: colors.ink, size: 4, label: 'P', trace: true, construction_kind: 'intersection',
      parent_refs: [{ kind: 'line', id: 'horizontal' }, { kind: 'line', id: 'vertical' }] });
  }
  result() { return { model: this.model, measurementScale: 1, animation: { enabled: true, loop: false, motions: this.motions } }; }
}

function sine() {
  const d = new Drawing(1, 'SINUSOIDA', ['A krąży, B biegnie w prawo.', 'P łączy wysokość A i pozycję B.', 'Jedno okrążenie daje okres.']);
  const r = 43, ox = -150, cy = 65, start = -75, end = start + 2 * pi * r;
  d.free('o', ox, cy); d.free('radius', ox + r, cy); d.circle('circle', 'o', 'radius', ['a'], { color: colors.driver });
  d.onCircle('a', ox + r, cy, 'circle', { label: 'A' });
  d.free('start', start, 135); d.free('end', end, 135); d.segment('track', 'start', 'end', 'b');
  d.onLine('b', start, 135, 'track', { color: colors.secondary, label: 'B' });
  d.free('axis-start', start, cy); d.free('axis-end', end, cy); d.line('axis', 'axis-start', 'axis-end', { dashed: true });
  d.projectionLines('a', 'b', 'p', start, cy, 'track'); d.move('a', r); d.move('b', r);
  return d.result();
}

function projected(number, title, lines, ax, by, ratioX, ratioY, phaseY) {
  const d = new Drawing(number, title, lines), cx = 0, cy = 70, omega = pi / 6;
  d.free('o', cx, cy); d.free('rx', cx + ax, cy); d.free('ry', cx + by, cy);
  d.circle('x-circle', 'o', 'rx', ['x-driver'], { color: colors.driver });
  d.circle('y-circle', 'o', 'ry', ['y-driver'], { color: colors.secondary, dashed: true });
  d.onCircle('x-driver', cx + ax, cy, 'x-circle', { label: 'A' });
  d.onCircle('y-driver', cx + by * Math.cos(phaseY), cy + by * Math.sin(phaseY), 'y-circle', { color: colors.secondary, label: 'B' });
  d.free('axis-a', -115, cy); d.free('axis-b', 115, cy); d.line('axis', 'axis-a', 'axis-b', { hidden: true });
  d.projectionLines('y-driver', 'x-driver', 'p', cx + ax, cy + by * Math.sin(phaseY), 'axis');
  d.move('x-driver', ax * ratioX * omega); d.move('y-driver', by * ratioY * omega);
  return d.result();
}

function lissajousSegments(number, ratioX, ratioY, phaseY) {
  const page = projected(number, `LISSAJOUS ${ratioX}:${ratioY}`, [
    'A i B drgają harmonicznie', 'na prostopadłych odcinkach.', `Częstotliwości: ${ratioX}:${ratioY}.`
  ], 105, 65, ratioX, ratioY, phaseY);
  const model = page.model;
  // The circle projections provide harmonic motion along the two segments.
  for (const id of ['x-driver', 'y-driver']) delete model.points.find(p => p.id === id).label;
  const addPoint = (id, x, y) => model.points.push({ id, x, y, style: { color: colors.guide, size: 3, hidden: true } });
  addPoint('x-left', -105, 70); addPoint('x-right', 105, 70);
  addPoint('y-top', 0, 5); addPoint('y-bottom', 0, 135);
  const addSegment = (id, a, b) => {
    const style = { color: colors.guide, width: 1.5, type: 'solid' };
    model.lines.push({ id, points: [a, b], defining_points: [a, b], style,
      leftRay: { ...style, hidden: true }, rightRay: { ...style, hidden: true } });
  };
  addSegment('x-track', 'x-left', 'x-right'); addSegment('y-track', 'y-top', 'y-bottom');
  const addProjection = (id, x, y, track, guide, label, color) => model.points.push({
    id, x, y, style: { color, size: 3 }, label: { text: label, color, offset: { x: 11, y: -12 }, fontSize: -2 },
    construction_kind: 'intersection', parent_refs: [{ kind: 'line', id: track }, { kind: 'line', id: guide }]
  });
  addProjection('a', 105, 70, 'x-track', 'vertical', 'A', colors.driver);
  addProjection('b', 0, 70 + 65 * Math.sin(phaseY), 'y-track', 'horizontal', 'B', colors.secondary);
  return page;
}

function rolling(number, title, lines, ratio) {
  const d = new Drawing(number, title, lines), r = 55, cy = 65, left = -pi * r, right = pi * r, speed = 48;
  d.free('left', left, cy); d.free('right', right, cy); d.segment('track', 'left', 'right', 'center');
  d.onLine('center', left, cy, 'track', { color: colors.secondary, label: 'O' });
  d.free('length-a', -35, -10); d.free('length-b', -35 + r, -10);
  d.circle('wheel', 'center', undefined, ['wheel-point'], { color: colors.driver, circle_kind: 'compass', defining_points: ['center', 'length-a', 'length-b'] });
  d.onCircle('wheel-point', left, cy + r, 'wheel', { color: ratio === 1 ? colors.ink : colors.driver, label: ratio === 1 ? 'P' : 'A', trace: ratio === 1 });
  if (ratio === .5) d.point('p', left, cy + r / 2, { color: colors.ink, size: 4, label: 'P', trace: true,
    construction_kind: 'midpoint', midpointMeta: { parents: ['center', 'wheel-point'] } });
  if (ratio === 2) d.point('p', left, cy + 2 * r, { color: colors.ink, size: 4, label: 'P', trace: true,
    construction_kind: 'symmetric', symmetricMeta: { source: 'center', mirror: { kind: 'point', id: 'wheel-point' } } });
  d.free('ground-a', left - r, cy + r); d.free('ground-b', right + r, cy + r); d.line('ground', 'ground-a', 'ground-b');
  d.move('center', speed); d.move('wheel-point', speed, -1);
  return d.result();
}

function gear(number, title, lines, fixedRadius, wheelRadius, inside) {
  const d = new Drawing(number, title, lines), cy = 70, orbit = fixedRadius + (inside ? -wheelRadius : wheelRadius), speed = orbit * pi / 6;
  const extent = inside ? fixedRadius : fixedRadius + 2 * wheelRadius;
  d.free('bounds-left', -extent, cy - extent); d.free('bounds-right', extent, cy + extent);
  d.free('origin', 0, cy); d.free('fixed-radius', fixedRadius, cy); d.free('orbit-radius', orbit, cy);
  d.circle('fixed', 'origin', 'fixed-radius', [], { color: colors.guide });
  d.circle('orbit', 'origin', 'orbit-radius', ['center'], { color: colors.guide, dashed: true });
  d.onCircle('center', orbit, cy, 'orbit', { color: colors.secondary, label: 'O' });
  d.free('length-a', -25, -20); d.free('length-b', -25 + wheelRadius, -20);
  d.circle('wheel', 'center', undefined, ['p'], { color: colors.driver, circle_kind: 'compass', defining_points: ['center', 'length-a', 'length-b'] });
  d.onCircle('p', orbit + (inside ? wheelRadius : -wheelRadius), cy, 'wheel', { color: colors.ink, size: 4, label: 'P', trace: true });
  d.move('center', speed); d.move('p', speed, inside ? -1 : 1);
  return d.result();
}

function spiral() {
  const d = new Drawing(12, 'SPIRALA LOGARYTMICZNA', ['Promień maleje jednostajnie.', 'P biegnie po coraz mniejszym', 'okręgu z tą samą prędkością.']);
  const cy = 70;
  d.free('bounds-left', -120, cy - 120); d.free('bounds-right', 120, cy + 120);
  d.free('o', 0, cy); d.free('small', 15, cy); d.free('large', 120, cy);
  d.segment('track', 'small', 'large', 'radius');
  d.onLine('radius', 120, cy, 'track', { color: colors.secondary, label: 'R' });
  d.circle('circle', 'o', 'radius', ['p'], { color: colors.driver });
  d.onCircle('p', 120, cy, 'circle', { color: colors.ink, size: 4, label: 'P', trace: true });
  d.move('radius', 7, -1); d.move('p', 60, 1);
  return d.result();
}

function parabola() {
  const d = new Drawing(13, 'PARABOLA', ['P jest równo odległy od F', 'i od prostej przechodzącej', 'przez poruszający się punkt Q.']);
  const fy = -10, directrix = 150, x = -150;
  d.point('focus', 0, fy, { color: colors.secondary, label: 'F' });
  d.free('left', x, directrix); d.free('right', -x, directrix);
  d.segment('track', 'left', 'right', 'q');
  d.onLine('q', x, directrix, 'track', { label: 'Q' });
  d.free('vertical-helper', x, directrix + 40);
  d.line('vertical', 'q', 'vertical-helper', { hidden: true, construction_kind: 'perpendicular',
    perpendicular: { throughPoint: 'q', referenceLine: 'track', helperPoint: 'vertical-helper', helperDistance: 40, helperOrientation: 1, helperMode: 'normal' } });
  const length = Math.hypot(x, directrix - fy), nx = -(directrix - fy) / length, ny = x / length;
  d.free('bis-a', x / 2 - nx * 80, (fy + directrix) / 2 - ny * 80);
  d.free('bis-b', x / 2 + nx * 80, (fy + directrix) / 2 + ny * 80);
  const bisector = d.line('bisector', 'bis-a', 'bis-b', { hidden: true, construction_kind: 'perpendicular',
    defining_parents: ['focus', 'q'], perpendicular: { directBisector: true, throughPoint: 'bis-a', helperPoint: 'bis-b', referencePoints: ['focus', 'q'], helperDistance: 80 } });
  bisector.points = [];
  for (const id of ['bis-a', 'bis-b']) Object.assign(d.model.points.find(p => p.id === id), { auxiliaryFor: 'bisector', perpendicular_helper_for: 'bisector' });
  d.point('p', x, (directrix * directrix - fy * fy - x * x) / (2 * (directrix - fy)), { color: colors.ink, size: 4, label: 'P', trace: true,
    construction_kind: 'intersection', parent_refs: [{ kind: 'line', id: 'vertical' }, { kind: 'line', id: 'bisector' }] });
  d.move('q', 30);
  return d.result();
}

const pages = [
  sine(),
  projected(2, 'ELIPSA', ['A i B krążą równym rytmem.', 'P łączy ich rzuty poziomy', 'i pionowy.'], 105, 60, 1, 1, 0),
  rolling(3, 'CYKLOIDA', ['Koło toczy się bez poślizgu.', 'P leży na jego obwodzie.', 'Na podłożu powstają ostrza.'], 1),
  rolling(4, 'TROCHOIDA SKRÓCONA', ['To samo toczące się koło.', 'P leży w połowie promienia.', 'Łuki nie dotykają podłoża.'], .5),
  rolling(5, 'TROCHOIDA WYDŁUŻONA', ['P jest dwa razy dalej od O', 'niż obwód toczącego się koła.', 'Ślad tworzy pętle.'], 2),
  gear(6, 'KARDIOIDA', ['Koło toczy się na zewnątrz', 'koła o tym samym promieniu.', 'P rysuje sercowaty kształt.'], 55, 55, false),
  gear(7, 'NEFROIDA', ['Mniejsze koło toczy się', 'na zewnątrz większego.', 'P tworzy dwa ostrza.'], 70, 35, false),
  gear(8, 'DELTOIDA', ['Koło toczy się wewnątrz', 'okręgu trzy razy większego.', 'P tworzy trzy ostrza.'], 120, 40, true),
  gear(9, 'ASTROIDA', ['Koło toczy się wewnątrz', 'okręgu cztery razy większego.', 'P tworzy cztery ostrza.'], 120, 30, true),
  projected(10, 'ÓSEMKA GERONA', ['Rzuty A i B tworzą punkt P.', 'B okrąża dwa razy szybciej.', 'Ślad przecina sam siebie.'], 105, 65, 1, 2, 0),
  projected(11, 'FIGURA LISSAJOUS', ['Rzuty łączą dwa obroty:', 'A wykonuje 2, a B 3 obroty.', 'P rysuje zamkniętą figurę.'], 105, 65, 2, 3, pi / 2),
  spiral(),
  parabola(),
  lissajousSegments(14, 1, 2, 0),
  lissajousSegments(15, 3, 2, pi / 2)
];
const document = { ...pages[0], pages, activePage: 0 };
const bytes = zipSync({ 'krzywe-w-ruchu.json': strToU8(JSON.stringify(document, null, 2)) });
await writeFile('public/content/krzywe-w-ruchu.ctr', bytes);
console.log(`Wrote ${pages.length} animated pages to public/content/krzywe-w-ruchu.ctr`);
