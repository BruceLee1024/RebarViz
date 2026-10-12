const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebar-hook-fit-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
after(() => fs.rmSync(dir, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'src/lib/hook-fit.ts', '--outDir', dir, '--module', 'commonjs', '--target', 'es2022', '--esModuleInterop', '--skipLibCheck'], { cwd: root });
const shapes = require(path.join(dir, 'rebar-shapes.js'));
const { beamHookFit } = require(path.join(dir, 'hook-fit.js'));
const narrow = (b, stirrup = 'A8@100/200(2)') => ({ ...presets.BEAM_PRESETS.standard, b, stirrup, cover: 25, sideBar: 'G4C12', tieBar: 'A6' });
const presets = require(path.join(dir, 'rebar.js'));

// Exact closest distance between two finite 3D straight segments. Surface
// clearance subtracts the sum of bar radii; projected intersections alone do
// not count as a collision when the geometry occupies separate normal layers.
function segmentDistance(a, b, c, d) {
  const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c);
  const A = u.dot(u), B = u.dot(v), C = v.dot(v), D = u.dot(w), E = v.dot(w);
  const pointDistance = (p, q, r) => {
    const delta = r.clone().sub(q), t = Math.max(0, Math.min(1, p.clone().sub(q).dot(delta) / delta.lengthSq()));
    return p.distanceTo(q.clone().addScaledVector(delta, t));
  };
  let minimum = Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b));
  const determinant = A * C - B * B;
  if (determinant > 1e-15) {
    const s = (B * E - C * D) / determinant, t = (A * E - B * D) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) minimum = Math.min(minimum, w.clone().addScaledVector(u, s).addScaledVector(v, -t).length());
  }
  return minimum;
}
function tailEnds(hook) {
  const parts = hook.path.curves;
  const beforeTail = parts.slice(0, -1).reduce((sum, q) => sum + q.getLength(), 0);
  return [hook.getPoint(beforeTail / hook.path.getLength()), hook.getPoint(1)];
}

test('150 mm beam reports its proven crosstie self-intersection rather than accepting the assembly', () => {
  // b150,c25,A8 outer stirrup and C12 waist bars => 36 mm side-bar centres.
  // A6 has r18, bend-centre offset27 and full 75 mm tails. Coplanar tails
  // intersect at (normal=0, Y=-52.4558, Z=0) mm, although both hook lengths
  // independently meet the length rule. This is a true 3D collision.
  const sideOffsetMm = shapes.resolveTieSideOffsetMm({ sectionWidthMm: 150, coverMm: 25, stirrupDiameterMm: 8, sideBarDiameterMm: 12 });
  assert.equal(sideOffsetMm, 36);
  const tie = shapes.createTieBarCurves({ sideOffset: sideOffsetMm / 1000, tieDiameter: 6, sideBarDiameter: 12 });
  const [a, b] = tie.hookCurves.map(tailEnds);
  const distanceMm = segmentDistance(...a, ...b) * 1000;
  assert.ok(distanceMm < .001, 'fixture must retain its proven true 3D crossing');
  assert.ok(beamHookFit(narrow(150)).some(q => q.code === 'tie-tail-collision'));
});

test('180 mm beam rejects touching crosstie tails even without centreline crossing', () => {
  // Same reinforcement in b180 gives side offset51. The free end centres are
  // 3.3898269447 mm apart, less than the 6 mm required simply to avoid overlap.
  const sideOffsetMm = shapes.resolveTieSideOffsetMm({ sectionWidthMm: 180, coverMm: 25, stirrupDiameterMm: 8, sideBarDiameterMm: 12 });
  assert.equal(sideOffsetMm, 51);
  const tie = shapes.createTieBarCurves({ sideOffset: sideOffsetMm / 1000, tieDiameter: 6, sideBarDiameter: 12 });
  const [a, b] = tie.hookCurves.map(tailEnds);
  const distanceMm = segmentDistance(...a, ...b) * 1000;
  assert.ok(Math.abs(distanceMm - 3.3898269447) < .0001, 'fixture must retain its proven surface penetration');
  assert.ok(beamHookFit(narrow(180)).some(q => q.code === 'tie-tail-collision'));
});

test('narrow independent A10 inner hoop bend compression is explicitly rejected', () => {
  // b160,c25,A10(4) => outer centreline width100. The independent inner hoop
  // is 33.3333 mm wide. Current clamping makes centreline r16.65, giving
  // inner bend diameter 2*r-d=23.3 mm, below HPB300 2.5*d=25 mm.
  // Minimum verified against GB50204-2015 5.3.1(1):
  // https://gf.cabr-fire.com/m/article-12545.htm
  const result = shapes.createCompositeStirrupCurves({ width: .1, height: .44, diameter: 10, legs: 4, plane: 'yz' });
  assert.equal(result.hoops.length, 2);
  for (const [index, hoop] of result.hoops.entries()) {
    const innerDiameterMm = 2 * hoop.spec.bendRadiusMm - 10;
    if (index === 1) assert.ok(innerDiameterMm < 25, 'fixture must expose the undersized inner bend');
  }
  assert.ok(beamHookFit(narrow(160, 'A10@100/200(4)')).some(q => q.code === 'stirrup-bend-diameter'));
});

test('narrow four-leg stirrup cover overrun cannot be silently accepted', () => {
  // A 160 mm wide beam and 25 mm cover allow steel surfaces within +/-55 mm.
  // The independently closed inner hoop must obey the same concrete envelope
  // as the outer hoop. Its opposite normal layer cannot repair a Z overrun.
  const result = shapes.createCompositeStirrupCurves({ width: .1, height: .44, diameter: 10, legs: 4, plane: 'yz' });
  for (const [index, hoop] of result.hoops.entries()) {
    const maximumSurfaceZ = Math.max(...hoop.fullCurve.getPoints(500).map(q => Math.abs(q.z) * 1000 + 5));
    assert.ok(maximumSurfaceZ > 55, `fixture hoop ${index} must exceed the concrete cover envelope`);
  }
  assert.ok(beamHookFit(narrow(160, 'A10@100/200(4)')).some(q => q.code === 'stirrup-cover'));
});

test('all built-in beam preset hooks retain full tails, sufficient bend envelopes and independent normal layers', () => {
  for (const [name, p] of Object.entries(presets.BEAM_PRESETS)) {
    assert.deepEqual(beamHookFit(p), [], `${name}: existing valid preset should remain accepted`);
    const stir = presets.parseStirrup(p.stirrup), widthMm = p.b - 2 * p.cover - stir.diameter, heightMm = p.h - 2 * p.cover - stir.diameter;
    const longitudinalMax = Math.max(presets.parseRebar(p.top).diameter, presets.parseRebar(p.bottom).diameter);
    for (const plane of ['yz', 'xz']) {
      const result = shapes.createCompositeStirrupCurves({ width: widthMm / 1000, height: heightMm / 1000, diameter: stir.diameter, legs: stir.legs, plane,
        barPositions: shapes.beamStirrupBarPositions(widthMm, stir.diameter, p.top, p.bottom).map(q => q / 1000) });
      const normal = plane === 'yz' ? 'x' : 'y';
      const bounds = result.hoops.map(hoop => {
        const D = 2 * hoop.spec.bendRadiusMm - stir.diameter;
        assert.ok(D >= Math.max(2.5 * stir.diameter, longitudinalMax), `${name}: bend diameter ${D} mm`);
        for (const hook of hoop.hookCurves) {
          assert.ok(Math.abs(hook.path.curves.at(-1).getLength() * 1000 - Math.max(10 * stir.diameter, 75)) < 1e-6);
        }
        const points = hoop.fullCurve.getPoints(400);
        return [Math.min(...points.map(q => q[normal])) * 1000 - stir.diameter / 2, Math.max(...points.map(q => q[normal])) * 1000 + stir.diameter / 2];
      });
      for (let i = 1; i < bounds.length; i++) assert.ok(bounds[i][0] >= bounds[i - 1][1], `${name}: independent hoops overlap physically`);
    }
  }
});
