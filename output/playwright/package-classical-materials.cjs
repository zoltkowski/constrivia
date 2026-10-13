const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { unzipSync, zipSync, strFromU8 } = require('fflate');

const root = path.resolve(__dirname, '../..');
const materials = path.join(root, 'materials', 'klasyczne-konstrukcje');
const library = path.join(root, 'public', 'content');
const approved = {
  'srodek-ciezkosci-trojkata.ctr': 'centroid-kroki.ctr',
  'ortocentrum-trojkata.ctr': 'orthocenter-kroki.ctr',
  'okrag-opisany-na-trojkacie.ctr': 'circumcircle-kroki.ctr'
};

let documents = 0;
const validateDocument = (document, name) => {
  assert(document.model, `${name}: missing model`);
  const model = document.model;
  const points = new Map((model.points || []).map(point => [String(point.id), point]));
  for (const point of points.values()) {
    assert(Number.isFinite(point.x) && Number.isFinite(point.y), `${name}: nonfinite point`);
  }
  const exists = id => assert(points.has(String(id)), `${name}: missing point ${id}`);
  for (const line of model.lines || []) {
    line.points.forEach(exists);
    (line.defining_points || []).forEach(exists);
  }
  for (const polygon of model.polygons || []) polygon.points.forEach(exists);
  for (const circle of model.circles || []) {
    assert(['center-radius', 'three-point'].includes(circle.circle_kind), `${name}: ambiguous circle kind`);
    exists(circle.center);
    if (circle.radius_point) exists(circle.radius_point);
    (circle.defining_points || []).forEach(exists);
  }
  documents++;
};

const filenames = fs.readdirSync(materials).sort();
for (const name of filenames) {
  if (name.endsWith('.json')) validateDocument(JSON.parse(fs.readFileSync(path.join(materials, name), 'utf8')), name);
  if (name.endsWith('.ctr')) {
    const entries = Object.entries(unzipSync(fs.readFileSync(path.join(materials, name))));
    assert(entries.length > 0);
    for (const [entry, bytes] of entries) validateDocument(JSON.parse(strFromU8(bytes)), `${name}/${entry}`);
  }
}

for (const [destination, source] of Object.entries(approved)) {
  const data = fs.readFileSync(path.join(materials, source));
  const target = path.join(library, destination);
  if (fs.existsSync(target)) assert(fs.readFileSync(target).equals(data), `Refusing to replace different existing file: ${target}`);
  else fs.writeFileSync(target, data, { flag: 'wx' });
}

const archive = {};
for (const name of filenames) archive[`klasyczne-konstrukcje/${name}`] = fs.readFileSync(path.join(materials, name));
const zipped = zipSync(archive);
assert.equal(Object.keys(unzipSync(zipped)).length, filenames.length);
fs.writeFileSync(path.join(root, 'materials', 'klasyczne-konstrukcje.zip'), zipped);
console.log(JSON.stringify({ validatedDocuments: documents, libraryFiles: Object.keys(approved), packageFiles: filenames.length }, null, 2));
