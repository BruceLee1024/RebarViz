const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebar-quantity-repro-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
after(() => fs.rmSync(dir, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'src/lib/calc.ts', '--outDir', dir, '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck'], { cwd: root });
const calc = require(path.join(dir, 'calc.js'));
const presets = require(path.join(dir, 'rebar.js'));
const shapes = require(path.join(dir, 'rebar-shapes.js'));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const item = (result, name) => {
  const found = result.items.find(row => row.name === name);
  assert.ok(found, `Missing ${name}`);
  return found;
};

test('AT upper reinforcement counts the two independent end pieces', () => {
  // The standard AT model has six positions across its width and an independent
  // low/high support bar at each. Its bending schedule also reports 12 pieces.
  const result = calc.calcStair({ ...presets.STAIR_PRESETS.standard });
  assert.equal(result.items.filter(row => row.name.includes('上部纵筋')).reduce((sum, row) => sum + row.count, 0), 12);
});

test('stair longitudinal counts allow the bar radius inside both edge covers', () => {
  const p = { ...presets.STAIR_PRESETS.bt_standard, flightWidth: 1230 };
  // 1230 - 2*15 - 10 = 1190 mm centreline span; 150 mm spacing => eight bars.
  assert.equal(item(calc.calcStair(p), '下部纵筋').count, 8);
});

test('BT distribution counts match the independent flat and visible slope stations', () => {
  // Flat stations: -450 and -200 mm (two); slope stations 250..3000 mm
  // (twelve). Both lower and upper layers are drawn: (2+12)*2 = 28.
  assert.equal(item(calc.calcStair({ ...presets.STAIR_PRESETS.bt_standard }), '分布筋').count, 28);
});

test('wall opening reinforcement contributes its explicit two-face side and edge bars', () => {
  const result = calc.calcShearWall({ ...presets.SHEAR_WALL_PRESETS.standard });
  const opening = result.items.filter(row => row.name.includes('洞口'));
  // Four vertical 1500 mm bars and four horizontal 1200 mm bars, as drawn.
  assert.equal(opening.reduce((sum, row) => sum + row.count, 0), 8);
  near(opening.reduce((sum, row) => sum + row.count * row.lengthM, 0), 10.8);
});

test('opening reinforcement keeps the slab-style diameter when converting length to weight', () => {
  const opening = calc.calcShearWall({ ...presets.SHEAR_WALL_PRESETS.standard }).items.filter(row => row.name.includes('洞口'));
  assert.equal(opening.length, 2);
  // The supplied designation C14@150 is 14 mm HRB400 steel, not the C20
  // fallback of the unrelated count-based parser. Unit mass at 14 mm: 1.21 kg/m.
  assert.ok(opening.every(row => row.grade === 'C' && row.diameter === 14));
  near(opening.reduce((sum, row) => sum + row.weightKg, 0), 13.068);
});

test('strip JL straight top bars include both beam overhangs', () => {
  const p = { ...presets.STRIPFOUNDATION_PRESETS.doubleBeam };
  // 12000 mm base + 2*600 mm overhang - 2*40 mm cover = 13120 mm.
  near(item(calc.calcStripFoundation(p), 'JL顶部纵筋').lengthM, 13.12);
});

test('strip four-leg JL stirrups count and measure each independent closed hoop', () => {
  const p = { ...presets.STRIPFOUNDATION_PRESETS.doubleBeam, jlEndType: 'none' };
  const row = item(calc.calcStripFoundation(p), 'JL箍筋');
  const spec = shapes.createCompositeStirrupSpec({ widthMm: 360, heightMm: 710, diameterMm: 10, legs: 4 });
  // 80 stations per beam, two beams, two complete independent hoops per station.
  assert.equal(row.count, 320);
  near(row.count * row.lengthM, 160 * spec.lengthMm / 1000);
});

test('strip JCL stirrup length includes its continuous bends and both hooks', () => {
  const p = { ...presets.STRIPFOUNDATION_PRESETS.doubleBeam };
  const row = item(calc.calcStripFoundation(p), 'JCL箍筋');
  const spec = shapes.createCompositeStirrupSpec({ widthMm: 262, heightMm: 562, diameterMm: 8, legs: 2 });
  assert.equal(row.count, 13);
  near(row.lengthM, spec.lengthMm / 1000);
});

test('wall opening cuts distributed bars into their actual fixed-length pieces', () => {
  const p = {
    ...presets.SHEAR_WALL_PRESETS.simple,
    lw: 4000, hw: 3000, boundaryLength: 500,
    vertBar: 'C10@250', horizBar: 'C10@250',
    hasOpening: true, openingWidth: 1000, openingHeight: 1000,
    openingBottom: 500, openingOffsetX: 250,
  };
  const result = calc.calcShearWall(p);
  const grouped = prefix => result.items.filter(row => row.name.startsWith(prefix))
    .map(row => [row.lengthM, row.count]).sort((a, b) => a[0] - b[0]);
  // Wall middle zone spans -1500..1500 at 250 mm: 13 stations. Five
  // stations cross the offset window, splitting each face into 0.5/1.5 m.
  assert.deepEqual(grouped('竖向分布筋'), [[0.5, 10], [1.5, 10], [3, 16]]);
  // Eleven horizontal levels (250..2750), five within 500..1500 inclusive.
  // At each face these split into left 1.75 m and right 1.25 m.
  assert.deepEqual(grouped('水平分布筋'), [[1.25, 10], [1.75, 10], [4, 12]]);
  near(result.items.filter(row => row.name.startsWith('竖向分布筋')).reduce((sum, row) => sum + row.count * row.lengthM, 0), 68);
  near(result.items.filter(row => row.name.startsWith('水平分布筋')).reduce((sum, row) => sum + row.count * row.lengthM, 0), 78);
});

test('projecting wall boundary wings and corners count their extra independent bars', () => {
  for (const [boundaryForm, tieCount] of [['wingWall', 174], ['cornerWall', 116]]) {
    const p = { ...presets.SHEAR_WALL_PRESETS.standard, boundaryForm, boundaryProjection: 200, hasOpening: false };
    const result = calc.calcShearWall(p);
    // At 100 mm spacing: 29 levels (100..2900), two ends. The wing has
    // three connecting tie positions per end, the corner has two.
    assert.equal(item(result, '边缘凸出段纵筋').count, 12);
    assert.equal(item(result, '边缘凸出段箍筋').count, 58);
    assert.equal(item(result, '边缘凸出段拉筋').count, tieCount);
    const widthMm = boundaryForm === 'wingWall' ? 452 : 327;
    const hoop = shapes.createCompositeStirrupSpec({ widthMm, heightMm: 152, diameterMm: 8, legs: 2 });
    near(item(result, '边缘凸出段箍筋').lengthM, hoop.lengthMm / 1000);
    // Core boundary depth is 450 mm, inner depth 410. Connector span:
    // bw/2 + projection - cover - innerDepth/2 = 125+200-20-205 = 100 mm.
    const tie = shapes.createTieBarShapeSpec({ sideOffsetMm: 50, tieDiameterMm: 8, sideBarDiameterMm: 8 });
    near(item(result, '边缘凸出段拉筋').lengthM, tie.lengthMm / 1000);
  }
});

// Analytic polyline + circular fillet length, independent of THREE and the
// production stair helper. Fillets borrow no more than 45% of adjoining legs.
function filletedLength(points, radius) {
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let length = points.slice(1).reduce((sum, q, i) => sum + distance(points[i], q), 0);
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], q = points[i], next = points[i + 1];
    const li = distance(prev, q), lo = distance(q, next);
    const dot = ((q[0] - prev[0]) * (next[0] - q[0]) + (q[1] - prev[1]) * (next[1] - q[1])) / (li * lo);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angle < 1e-5) continue;
    const setback = Math.min(radius * Math.tan(angle / 2), li * 0.45, lo * 0.45);
    length += setback / Math.tan(angle / 2) * angle - 2 * setback;
  }
  return length;
}

test('stair bending schedule and quantities agree while BT end lengths stay distinct', () => {
  for (const p of [presets.STAIR_PRESETS.standard, presets.STAIR_PRESETS.bt_standard, presets.STAIR_PRESETS.bt_wide]) {
    const result = calc.calcStair({ ...p }), schedule = calc.calcStairBarShapes({ ...p });
    assert.equal(schedule.reduce((sum, row) => sum + row.count, 0), result.items.reduce((sum, row) => sum + row.count, 0));
    near(schedule.reduce((sum, row) => sum + row.count * row.totalLen / 1000, 0), result.items.reduce((sum, row) => sum + row.count * row.lengthM, 0));
    for (const row of result.items) {
      const shape = schedule.find(shape => shape.name === row.name);
      assert.ok(shape, row.name);
      assert.equal(shape.count, row.count);
      near(shape.totalLen / 1000, row.lengthM);
    }
  }
  const p = { ...presets.STAIR_PRESETS.bt_standard };
  const result = calc.calcStair(p);
  const low = item(result, '上部纵筋（低端）'), high = item(result, '上部纵筋（高端）');
  // Fixed BT-1 geometry in metres: run 3.08, rise 1.65, flat .7,
  // beam .25, cover .015, top diameter .008, normal top offset .019.
  const slope = 1.65 / 3.08, cos = 3.08 / Math.hypot(3.08, 1.65);
  const slopeLength = Math.hypot(3.08, 1.65), cv = .019 / cos;
  const lowEndX = ((.7 + slopeLength) / 4 - .7) * cos;
  const lowPoints = [[-.935, -.139], [-.935, -.019], [-.7, -.019], [0, -.019], [lowEndX, slope * lowEndX - cv]];
  const highAncX = 3.065, highAncY = slope * highAncX - cv;
  const highStartX = 3.08 - .25 - slopeLength / 4 * cos;
  const highPoints = [[highStartX, slope * highStartX - cv], [highAncX, highAncY], [highAncX, highAncY - .12]];
  assert.equal(low.count, 6); assert.equal(high.count, 6);
  assert.ok(Math.abs(low.lengthM - high.lengthM) > .05, 'BT end pieces must not be averaged');
  assert.ok(Math.abs(low.lengthM - filletedLength(lowPoints, .032)) < .00001);
  assert.ok(Math.abs(high.lengthM - filletedLength(highPoints, .032)) < .00001);
});
