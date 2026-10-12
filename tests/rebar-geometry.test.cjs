const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const THREE = require('three');

const root = path.resolve(__dirname, '..');
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), 'rebar-geometry-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(compiled, 'node_modules'), 'dir');
after(() => fs.rmSync(compiled, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  'src/lib/beam-longitudinal.ts', 'src/lib/calc.ts', 'src/lib/layout.ts', 'src/lib/rebar-shapes.ts', 'src/lib/rebar-curve.ts', 'src/lib/constants.ts',
  '--outDir', compiled, '--module', 'commonjs', '--target', 'es2020',
  '--esModuleInterop', '--skipLibCheck',
], { cwd: root });
const { createCompositeStirrupCurves, createCompositeStirrupSpec, resolveInnerLegPositions, createStirrupCurves, createStirrupShapeSpec, createTieBarCurves, staggerTiePositions } = require(path.join(compiled, 'rebar-shapes.js'));
const { createBentAnchorCurve, continuousLineGeometry, cappedRebarGeometry, rebarSegmentTransform } = require(path.join(compiled, 'rebar-curve.js'));
const near = (actual, expected, tolerance = 1e-6) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`,
);
const finiteTube = curve => {
  const geometry = new THREE.TubeGeometry(curve, 240, .004, 12, false);
  assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
  geometry.dispose();
};

test('135° stirrup hooks connect to an open body, turn inward, and stay within the section', () => {
  for (const plane of ['yz', 'xz']) {
    const { outerCurve, hookCurves } = createStirrupCurves({ width: .242, height: .542, diameter: 8, plane });
    assert.ok(outerCurve.getPoint(0).distanceTo(outerCurve.getPoint(1)) > .01,
      'a welded rectangle plus extra hooks is not an open bent bar');
    near(outerCurve.getPoint(0).distanceTo(hookCurves[0].getPoint(0)), 0);
    near(outerCurve.getPoint(1).distanceTo(hookCurves[1].getPoint(0)), 0);
    near(outerCurve.getTangent(0).dot(hookCurves[0].getTangent(0)), -1, .002);
    near(outerCurve.getTangent(1).dot(hookCurves[1].getTangent(0)), 1, .002);
    for (const hook of hookCurves) {
      near(hook.getTangent(0).dot(hook.getTangent(1)), Math.cos(3 * Math.PI / 4), .002);
      const tangent = hook.getTangent(1);
      assert.ok((plane === 'yz' ? tangent.z : tangent.x) > 0, 'tail must point into the section');
      assert.ok((plane === 'yz' ? tangent.y : tangent.z) < 0);
      for (const p of hook.getPoints(1000)) {
        assert.ok(Math.abs(plane === 'yz' ? p.z : p.x) <= .121 + 1e-8);
        assert.ok(Math.abs(plane === 'yz' ? p.y : p.z) <= .271 + 1e-8);
      }
      finiteTube(hook);
    }
    // The two overlapped bends occupy adjacent layers instead of fusing together.
    const normal = p => plane === 'yz' ? p.x : p.y;
    near(Math.abs(normal(hookCurves[0].getPoint(.5)) - normal(hookCurves[1].getPoint(.5))), .010);
    finiteTube(outerCurve);
  }
});

test('90° anchor bend preserves overall dimensions and tangent directions in both axes', () => {
  for (const axis of ['x', 'z']) for (const direction of ['up', 'down']) for (const xDir of [-1, 1]) {
    const curve = createBentAnchorCurve({ straightLen: .475, bendLen: .375, diameter: 25,
      direction, horizontalAxis: axis, xDir });
    const end = curve.getPoint(1);
    near(end[axis], xDir * .475);
    near(end.y, (direction === 'down' ? -1 : 1) * .375);
    near(curve.getPoint(0).length(), 0);
    near(curve.getTangent(0)[axis], xDir, .001);
    near(curve.getTangent(1).y, direction === 'down' ? -1 : 1, .001);
    for (const p of curve.getPoints(1000)) {
      assert.ok(p[axis] * xDir >= -1e-8 && p[axis] * xDir <= .475 + 1e-8);
      assert.ok(Math.abs(p.y) <= .375 + 1e-8);
    }
    // Flat straight + exact quarter circle + flat vertical, without spline bulges.
    near(curve.path.getLength(), .475 + .375 - .2 + .1 * Math.PI / 2, .00001);
    finiteTube(curve);
  }
});

test('zero and short extensions do not create an outward protrusion or invalid tube', () => {
  for (const straightLen of [0, .005, .02]) {
    const curve = createBentAnchorCurve({ straightLen, bendLen: .192, diameter: 16, direction: 'up' });
    near(curve.getPoint(1).x, straightLen);
    near(curve.getPoint(1).y, .192);
    assert.ok(Math.max(...curve.getPoints(500).map(p => p.x)) <= straightLen + 1e-8);
    finiteTube(curve);
  }
});

test('stirrup developed length counts three body corners and both 135° hooks once', () => {
  for (const diameterMm of [6, 8, 10, 12]) {
    const spec = createStirrupShapeSpec({ widthMm: 242, heightMm: 542, diameterMm });
    const { outerCurve, hookCurves } = createStirrupCurves({ width: .242, height: .542,
      diameter: diameterMm, plane: 'yz' });
    const measured = (outerCurve.getLength() + hookCurves.reduce((l, curve) => l + curve.getLength(), 0)) * 1000;
    near(measured, spec.lengthMm, 1);
    near(spec.bodyLenMm, 2 * (242 + 542) - 8 * spec.bendRadiusMm + 1.5 * Math.PI * spec.bendRadiusMm);
  }
});

test('centerline representation includes every edge without alternate gaps', () => {
  const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(1, 1, 0), new THREE.Vector3(1, 1, 1)];
  const geometry = continuousLineGeometry(points);
  assert.equal(geometry.getAttribute('position').count, 6);
  assert.deepEqual([...geometry.getAttribute('position').array], [0, 0, 0, 1, 0, 0,
    1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1]);
  geometry.dispose();
});


test('physical hook surfaces have clearance throughout the overlapping bends in both planes', () => {
  for (const plane of ['yz', 'xz']) for (const diameter of [6, 8, 12, 16]) {
    const { hookCurves, fullCurve, hookClearGapMm } = createStirrupCurves({
      width: .35, height: .6, diameter, plane,
    });
    const a = hookCurves[0].getPoints(400);
    const b = hookCurves[1].getPoints(400);
    let closest = Infinity;
    for (const p of a) for (const q of b) closest = Math.min(closest, p.distanceTo(q));
    assert.ok(closest * 1000 - diameter >= hookClearGapMm - .02,
      `surface penetration: Φ${diameter}, distance ${closest * 1000}mm`);
    near(fullCurve.getPoint(0).distanceTo(hookCurves[0].getPoint(1)), 0);
    near(fullCurve.getPoint(1).distanceTo(hookCurves[1].getPoint(1)), 0);
    assert.ok(fullCurve.getPoint(0).distanceTo(fullCurve.getPoint(1)) > diameter * .001);
    const geometry = cappedRebarGeometry(fullCurve, 320, diameter * .001 / 2);
    assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
    // Exactly two cap centers and two cap rims; no edge closes free tip A to B.
    assert.equal(geometry.getAttribute('position').count, 321 * 13 + 2 * 14);
    geometry.dispose();
  }
});


test('crosstie hooks wrap longitudinal bars without penetrating, with true 135° arcs and full tails', () => {
  for (const diameter of [6, 8, 10, 12]) for (const sideDiameter of [12, 16, 20, 25]) {
    const sideOffset = .18;
    const { bodyCurve, hookCurves, fullCurve, spec } = createTieBarCurves({
      sideOffset, tieDiameter: diameter, sideBarDiameter: sideDiameter });
    near(bodyCurve.getPoint(0).distanceTo(hookCurves[0].getPoint(0)), 0);
    near(bodyCurve.getPoint(1).distanceTo(hookCurves[1].getPoint(0)), 0);
    assert.ok(bodyCurve.getPoint(.5).y > 0, 'body passes above the waist bars');
    near(bodyCurve.getTangent(0).dot(hookCurves[0].getTangent(0)), -1, .002);
    near(bodyCurve.getTangent(1).dot(hookCurves[1].getTangent(0)), 1, .002);
    hookCurves.forEach((hook, i) => {
      near(hook.getTangent(0).dot(hook.getTangent(1)), Math.cos(3 * Math.PI / 4), .002);
      const arc = hook.path.curves[0];
      assert.equal(arc.type, 'EllipseCurve');
      near(hook.path.curves[1].getLength() * 1000, Math.max(10 * diameter, 75));
      const side = i === 0 ? -1 : 1;
      let nearest = Infinity;
      for (const p of hook.getPoints(1200)) {
        const distance = Math.hypot(p.z - side * sideOffset, p.y);
        nearest = Math.min(nearest, distance);
        assert.ok(distance >= (diameter + sideDiameter) * .001 / 2 - 1e-8,
          'hook tube penetrates the longitudinal bar');
      }
      near(nearest, (diameter + sideDiameter) * .001 / 2, .00001);
      assert.ok(hook.getTangent(1).z * side < 0, 'free tail points inward');
      assert.ok(hook.getTangent(1).y < 0, 'free tail folds downward');
      assert.ok(hook.getPoint(1).y < 0, 'free end is below the waist bar');
      finiteTube(hook);
    });
    near(fullCurve.getLength() * 1000, spec.lengthMm, .7);
    assert.ok(fullCurve.getPoint(0).distanceTo(fullCurve.getPoint(1)) > .05);
    const geometry = cappedRebarGeometry(fullCurve, 160, diameter * .001 / 2);
    assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
    geometry.dispose();
  }
});

test('tie series clears the entire stirrup layer without changing count or pitch', () => {
  const originals = [-.7, -.5, -.3, -.1, .1, .3, .5, .7];
  const hoops = Array.from({ length: 19 }, (_, i) => -.9 + i * .1);
  const adjusted = staggerTiePositions(originals, hoops, .014, -1, 1);
  assert.equal(adjusted.length, originals.length);
  adjusted.forEach((x, i) => {
    assert.ok(hoops.every(h => Math.abs(h - x) >= .014 - 1e-9));
    if (i) near(x - adjusted[i - 1], .2);
  });
  assert.deepEqual(staggerTiePositions([], hoops, .014, -1, 1), []);
});

test('sloped rebar cylinder ends coincide with 3D endpoints, including lateral haunches', () => {
  for (const start of [[0, 0, 0], [-.4, .1, .2]]) for (const end of [[1, .7, .5], [-.8, .1, -.5], [0, 0, 0]]) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const { position, length, quaternion } = rebarSegmentTransform(a, b);
    const worldStart = new THREE.Vector3(0, -length / 2, 0).applyQuaternion(quaternion).add(position);
    const worldEnd = new THREE.Vector3(0, length / 2, 0).applyQuaternion(quaternion).add(position);
    near(worldStart.distanceTo(a), 0);
    near(worldEnd.distanceTo(b), 0);
  }
});


test('dense reinforcement preserves every bar across automatic and explicit rows', () => {
  const { layoutBars, maxBarsPerRow } = require(path.join(compiled, 'layout.js'));
  near(maxBarsPerRow(.209, 25), 5);
  for (const direction of [-1, 1]) {
    const bars = layoutBars({ count: 16, diameter: 25 }, .209, [.3], direction);
    assert.equal(bars.length, 16);
    const ys = [...new Set(bars.map(b => b.y))];
    assert.equal(ys.length, 4);
    for (let i = 1; i < ys.length; i++) near((ys[i] - ys[i - 1]) * direction, .05);
    for (const y of ys) {
      const z = bars.filter(b => b.y === y).map(b => b.z).sort((a, b) => a - b);
      for (let i = 1; i < z.length; i++) assert.ok(z[i] - z[i - 1] >= .05);
    }
  }
  assert.equal(layoutBars({ count: 6, diameter: 25, perRow: [4, 2] }, .209, [.3]).length, 6);
});


test('4/6-leg composite stirrups contain independent complete hoops, with clearance in both planes', () => {
  for (const plane of ['yz', 'xz']) for (const legs of [2, 4, 6]) for (const diameter of [8, 10, 12]) {
    const result = createCompositeStirrupCurves({ width: .342, height: .642, diameter, legs, plane });
    assert.equal(result.hoops.length, legs / 2);
    assert.equal(resolveInnerLegPositions({ legs, width: .342, barPositions: [-.15, .15] }).length, legs - 2);
    const axis = plane === 'yz' ? 'x' : 'y';
    const bounds = result.hoops.map(({ fullCurve, spec, outerCurve, hookCurves }) => {
      const sampled = fullCurve.getPoints(4000);
      near(sampled.slice(1).reduce((sum, point, i) => sum + point.distanceTo(sampled[i]), 0) * 1000, spec.lengthMm, 1);
      assert.ok(fullCurve.getPoint(0).distanceTo(fullCurve.getPoint(1)) > diameter * .001);
      near(outerCurve.getPoint(0).distanceTo(hookCurves[0].getPoint(0)), 0);
      near(outerCurve.getPoint(1).distanceTo(hookCurves[1].getPoint(0)), 0);
      finiteTube(fullCurve);
      const coordinates = fullCurve.getPoints(400).map(p => p[axis]);
      return [Math.min(...coordinates) - diameter * .0005, Math.max(...coordinates) + diameter * .0005];
    });
    bounds.slice(1).forEach((b, i) => assert.ok(b[0] - bounds[i][1] >= Math.max(2, diameter * .25) * .001 - 1e-8));
    near(result.spec.lengthMm, result.hoops.reduce((total, hoop) => total + hoop.spec.lengthMm, 0));
    assert.ok(bounds.every(b => b.every(x => Math.abs(x) <= result.spec.normalExtentMm * .001 + 1e-9)));
  }
});

test('beam and column quantities count all independent hoops and agree with bending schedules', () => {
  const { calcBeam, calcColumn, calcBarShapes, calcColumnBarShapes } = require(path.join(compiled, 'calc.js'));
  const { BEAM_PRESETS, COLUMN_PRESETS } = require(path.join(compiled, 'rebar.js'));
  for (const [preset, calculate, schedule] of [[BEAM_PRESETS.standard, calcBeam, calcBarShapes], [Object.values(COLUMN_PRESETS)[0], calcColumn, calcColumnBarShapes]]) {
    const base = { ...preset, stirrup: 'A8@100/200(2)' };
    const stations = calculate(base).items.find(item => item.name === '箍筋').count;
    for (const legs of [2, 4, 6]) {
      const params = { ...base, stirrup: `A8@100/200(${legs})` };
      const shapes = schedule(params).filter(shape => shape.shapeType === 'stirrup');
      const item = calculate(params).items.find(item => item.name === '箍筋');
      assert.equal(shapes.length, legs / 2);
      assert.equal(item.count, stations * legs / 2);
      near(item.lengthM, shapes.reduce((sum, shape) => sum + shape.totalLen, 0) / shapes.length / 1000);
      near(item.weightKg, item.count * item.lengthM * (8 * 8 / 162), .01);
    }
  }
});


test('roundoff in longitudinal rows cannot invent zero-width gaps for composite legs', () => {
  const base = resolveInnerLegPositions({ legs: 6, width: 242, barPositions: [-104.5, -34.833333, 34.833333, 104.5] });
  const noisy = resolveInnerLegPositions({ legs: 6, width: 242, barPositions: [-104.5, -34.833333, 34.833333, 104.5, 104.50000000001] });
  assert.deepEqual(noisy, base);
});

test('legacy column notation preserves exact bar count and four corners', () => {
  const { resolveColumnBars } = require(path.join(compiled,'rebar.js'));
  for (const n of [4,6,8,10,12,16,20]) {
    const result=resolveColumnBars(`${n}C20`,undefined,undefined,undefined,400,500);
    assert.equal(result.totalCount,n);
    assert.equal(new Set(result.bars.map(b=>`${b.x},${b.z}`)).size,n);
    assert.equal(result.bars.filter(b=>b.role==='corner').length,4);
  }
});

test('continuous stair and joint bends use tangent circular fillets and keep endpoints',()=>{
 const {roundedRebarPath}=require(path.join(compiled,'rebar-curve.js'));
 const points=[new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0),new THREE.Vector3(1,1,0)];
 const curve=roundedRebarPath(points,.1);
 near(curve.getLength(),1.8+Math.PI*.1/2,1e-5);
 near(curve.getPoint(0).distanceTo(points[0]),0);near(curve.getPoint(1).distanceTo(points[2]),0);
 for(let i=1;i<curve.curves.length;i++) {
  near(curve.curves[i-1].getPoint(1).distanceTo(curve.curves[i].getPoint(0)),0);
  assert.ok(curve.curves[i-1].getTangent(1).dot(curve.curves[i].getTangent(0))>.999);
 }
 finiteTube(curve);
});

const {beamLongitudinalLayout}=require(path.join(compiled,'beam-longitudinal.js'));
const {BEAM_PRESETS}=require(path.join(compiled,'rebar.js'));
function anchorClouds(p,side,legacy=false){
 return beamLongitudinalLayout(p).rows.filter(r=>['top','bottom',side+'Support',side+'Support2'].includes(r.role)).flatMap(r=>r.zs.map(z=>({
  role:r.role,d:r.diameter*.001,
  points:createBentAnchorCurve({straightLen:(legacy?p.hc-p.cover:r.anchor.bentStraightPart)*.001,bendLen:r.anchor.bentBendPart*.001,diameter:r.diameter,direction:r.role==='bottom'?'up':'down',xDir:side==='left'?-1:1}).getPoints(400).map(q=>q.add(new THREE.Vector3(0,r.y,z)))
 })));
}
function minSurfaceGap(bars){
 let gap=Infinity;
 for(let i=0;i<bars.length;i++)for(let j=i+1;j<bars.length;j++){
  const a=bars[i],b=bars[j];
  if(Math.abs(a.points[0].z-b.points[0].z)>(a.d+b.d)/2+.01)continue;
  for(const x of a.points)for(const y of b.points)gap=Math.min(gap,x.distanceTo(y)-(a.d+b.d)/2);
 }
 return gap;
}
test('default beam end bends have positive surface clearance on both ends; old shared plane collides',()=>{
 const p={...BEAM_PRESETS.standard};
 for(const side of ['left','right']){
  assert.ok(minSurfaceGap(anchorClouds(p,side,true))<-.02,'legacy geometry must reproduce the overlap');
  const gap=minSurfaceGap(anchorClouds(p,side)); assert.ok(gap>0,`independent bend planes must clear actual bar surfaces: ${side} ${gap}`);
 }
});
test('multi-row support bars start below all through rows and each bend has its own plane',()=>{
 const p={...BEAM_PRESETS.standard,top:'6C25(3/3)',leftSupport:'2C25',rightSupport:'4C25',leftSupport2:'2C20',rightSupport2:'2C20'};
 const rows=beamLongitudinalLayout(p).rows, top=rows.filter(r=>r.role==='top');
 const topBottom=Math.min(...top.map(r=>r.y-r.diameter/2000));
 for(const r of rows.filter(r=>r.role.includes('Support')))assert.ok(r.y+r.diameter/2000<topBottom-.0249);
 const bent=rows.filter(r=>!r.anchor.canStraight&&['top','bottom','rightSupport','rightSupport2'].includes(r.role));
 assert.equal(new Set(bent.map(r=>r.anchor.bentStraightPart)).size,bent.length);
});
test('quantity and bending schedule match the rendered centreline length per row',()=>{
 const calc=require(path.join(compiled,'calc.js'));
 for(const p of [BEAM_PRESETS.standard,BEAM_PRESETS.mixedDia]){
  const layout=beamLongitudinalLayout(p),items=calc.calcBeam(p).items,shapes=calc.calcBarShapes(p);
  layout.rows.forEach((r,i)=>{
   const a=r.anchor,curve=createBentAnchorCurve({straightLen:a.bentStraightPart*.001,bendLen:a.bentBendPart*.001,diameter:r.diameter,direction:r.role==='bottom'?'up':'down'});
   const physical=r.bodyLengthMm+r.endCount*(a.canStraight?a.straightLen:curve.getLength()*1000);
   near(items[i].lengthM*1000,physical,.1);near(shapes[i].totalLen,physical,.1);
   assert.equal(items[i].count,r.count);assert.equal(shapes[i].count,r.count);
  });
 }
});
test('insufficient support depth is reported instead of extending through the cover',()=>{
 const p={...BEAM_PRESETS.standard,hc:250};
 const layout=beamLongitudinalLayout(p);
 assert.ok(layout.issues.some(x=>x.includes('水平锚固段')));
 for(const r of layout.rows) if(!r.anchor.canStraight)assert.ok(r.anchor.bentStraightPart+r.diameter/2<=p.hc-p.cover);
});
test('preset end collisions are either cleared or explicitly reported for review',()=>{
 for(const [name,p] of Object.entries(BEAM_PRESETS))for(const side of ['left','right']) {
  const gap=minSurfaceGap(anchorClouds(p,side));
  if(name==='complex')assert.ok(beamLongitudinalLayout(p).issues.some(x=>x.includes('实体相交')),name);
  else assert.ok(gap>0,`${name} ${side} surface gap ${gap}`);
 }
});

const placements = require(path.join(compiled, 'reinforcement-layout.js'));
const slabGeometry = require(path.join(compiled, 'slab-reinforcement.js'));
const foundationGeometry = require(path.join(compiled, 'foundation-reinforcement.js'));

test('orthogonal layers respect cover and actual mixed diameters on both faces and both orders', () => {
  for (const dx of [8,12,25]) for (const dy of [10,16,32]) for (const face of ['bottom','top']) for (const order of ['xBelowY','yBelowX']) {
    const q=placements.orthogonalLayers(500,40,dx,dy,face,order);
    near(Math.abs(q.x-q.y),(dx+dy)/2);
    assert.ok(q.x-dx/2>=40 && q.x+dx/2<=460);
    assert.ok(q.y-dy/2>=40 && q.y+dy/2<=460);
    assert.equal(q.x<q.y,order==='xBelowY');
  }
});

test('column perimeter bars stay inside rounded hoop corners without intersecting the body', () => {
  const {COLUMN_PRESETS,parseStirrup}=require(path.join(compiled,'rebar.js'));
  for (const p of Object.values(COLUMN_PRESETS)) {
    const stir=parseStirrup(p.stirrup),bars=placements.columnSectionBars(p).bars;
    const hoop=createStirrupCurves({width:(p.b-2*p.cover-stir.diameter)/1000,height:(p.h-2*p.cover-stir.diameter)/1000,diameter:stir.diameter,plane:'xz'}).outerCurve;
    const samples=hoop.getPoints(4000);
    for (const bar of bars) {
      const distance=Math.min(...samples.map(q=>Math.hypot(q.x*1000-bar.x,q.z*1000-bar.z)));
      assert.ok(distance>=(bar.diameter+stir.diameter)/2-.05,`${p.id}: corner penetration ${distance}mm`);
    }
  }
});

test('foundation inserts preserve every requested bar and form one smooth foot clear of the mesh', () => {
  for(const count of [4,8,12,16,20]) {
    const points=placements.insertPerimeter(`${count}C25`,500,600,40);
    assert.equal(points.length,count);
    assert.equal(new Set(points.map(p=>`${p.x},${p.z}`)).size,count);
  }
  const spec=placements.foundationInsertSpec(800,40,25,16,20,'C','C30','三级');
  assert.ok(spec.footYmm-25/2>=40+16+20+2-.01);
  near(spec.curve.getTangent(0).x,-1,.001);
  near(spec.curve.getTangent(1).y,1,.001);
  near(spec.curve.getPoint(0).x*1000,spec.anchor.bendLength);
  finiteTube(spec.curve);
  const sampled=spec.curve.getPoints(4000);
  near(sampled.slice(1).reduce((sum,q,i)=>sum+q.distanceTo(sampled[i]),0)*1000,spec.lengthMm,.1);
});

test('foundation, pilecap and raft insert quantities use the complete continuous model length', () => {
  const presets=require(path.join(compiled,'rebar.js')),calc=require(path.join(compiled,'calc.js'));
  for(const [name,p,fn] of [['foundation',presets.FOUNDATION_PRESETS.standard,calc.calcFoundation],['pilecap',presets.PILECAP_PRESETS.fourPile,calc.calcPileCap],['raft',presets.RAFT_PRESETS.standard,calc.calcRaft]]) {
    const r=presets.parseRebar(p.colMain),dx=presets.parseSlabRebar(p.bottomBarX),dy=presets.parseSlabRebar(p.bottomBarY);
    const h=p.raftType==='beamSlab'?Math.max(p.h,p.beamH||900):p.h;
    const expected=placements.foundationInsertSpec(h,p.cover,r.diameter,dx.diameter,dy.diameter,r.grade,p.concreteGrade,p.seismicGrade||'非抗震');
    near(fn(p).items.find(item=>item.name==='柱插筋').lengthM*1000,expected.lengthMm,.0001);
  }
});

test('slab quantities and layer arrangement share every continuous bar instead of welded hook pieces', () => {
  const {SLAB_PRESETS}=require(path.join(compiled,'rebar.js')),calc=require(path.join(compiled,'calc.js'));
  for(const p of Object.values(SLAB_PRESETS)) {
    const geometry=slabGeometry.slabReinforcement(p),items=calc.calcSlab(p).items;
    for(const group of geometry.groups) {
      const item=items.find(q=>q.name===group.name);
      assert.equal(item.count,group.positions.length*group.curves.length);
      near(item.lengthM*1000,group.lengthMm,.0001);
      group.curves.forEach(finiteTube);
    }
    const parallel=geometry.groups.filter(g=>g.axis==='x');
    for(let i=0;i<parallel.length;i++) for(let j=i+1;j<parallel.length;j++) assert.ok(Math.abs(parallel[i].level-parallel[j].level)>=(parallel[i].diameter+parallel[j].diameter)/2-.01);
  }
  const thin=slabGeometry.slabReinforcement({...SLAB_PRESETS.standard,thickness:60,distribution:'A8@200'});
  assert.ok(thin.issues.some(message=>message.includes('板厚不足')));
});

test('wall ties miss vertical distributed bars while retaining the horizontal bars they wrap', () => {
  const {SHEAR_WALL_PRESETS,parseSlabRebar}=require(path.join(compiled,'rebar.js'));
  const {wallTiePositions}=require(path.join(compiled,'quantity-geometry.js'));
  const p={...SHEAR_WALL_PRESETS.standard,tieBar:'A6@400'},vert=parseSlabRebar(p.vertBar),tie=parseSlabRebar(p.tieBar),horiz=parseSlabRebar(p.horizBar);
  const bl=p.boundaryLength||Math.max(p.bw,400),inner=p.lw-2*bl,n=Math.max(Math.floor(inner/vert.spacing),1);
  const xs=Array.from({length:n+1},(_,i)=>-p.lw/2+bl+inner*i/n);
  for(const q of wallTiePositions(p)) {
    assert.ok(xs.every(x=>Math.abs(q.x-x)>=(vert.diameter+tie.diameter)/2+2-.01));
    near(q.y/horiz.spacing,Math.round(q.y/horiz.spacing));
  }
});

test('foundation beam longitudinal bars are independent inward bends and their quantities include every hoop', () => {
  const presets=require(path.join(compiled,'rebar.js')),calc=require(path.join(compiled,'calc.js'));
  const p={...presets.FOUNDATION_PRESETS.standard,columnCount:2,colSpacing:2000,hasFoundationBeam:true,foundationBeamB:600,foundationBeamH:700,foundationBeamTop:'4C20',foundationBeamBottom:'4C22',foundationBeamStirrup:'A10@150(4)'};
  const result=foundationGeometry.foundationBeamReinforcement(p),quantity=calc.calcFoundation(p);
  assert.equal(result.bars.length,8);
  const top=result.bars.find(b=>b.role==='top'),bottom=result.bars.find(b=>b.role==='bottom');
  assert.ok(top.curve.getPoint(0).y < top.curve.getPoint(.5).y);
  assert.ok(bottom.curve.getPoint(0).y > bottom.curve.getPoint(.5).y);
  const tp=top.curve.getPoints(500),bp=bottom.curve.getPoints(500);
  let closest=Infinity;
  for(const a of tp)for(const b of bp)closest=Math.min(closest,a.distanceTo(b));
  assert.ok(closest*1000 >= (top.diameter+bottom.diameter)/2,`end bend penetration ${closest*1000}mm`);
  for(const role of ['top','bottom']) {
    const bars=result.bars.filter(b=>b.role===role),name=`基础梁${role==='top'?'顶':'底'}筋`;
    const item=quantity.items.find(i=>i.name===name);
    assert.equal(item.count,bars.length);near(item.lengthM*1000,bars[0].lengthMm,.0001);
  }
  const hoops=quantity.items.filter(i=>/^基础梁[外内]箍/.test(i.name));
  assert.equal(hoops.length,result.stirrupSpec.pieceCount);
  assert.ok(hoops.every(i=>i.count===result.stirrupPositions.length));
});

test('stair slab retains its specified normal thickness as the flight gets steeper', () => {
  for(const riseRun of [.3,.6,1]) {
    const angle=Math.atan(riseRun),offset=placements.normalThicknessOffset(.15,angle);
    const topA=new THREE.Vector3(0,0,0),topB=new THREE.Vector3(3,3*riseRun,0);
    const bottomMid=new THREE.Vector3(1.5,1.5*riseRun-offset,0);
    const normal=new THREE.Vector3(-riseRun,1,0).normalize();
    near(Math.abs(bottomMid.clone().sub(topA).dot(normal)),.15);
    assert.ok(Math.abs(topB.clone().sub(topA).dot(normal))<1e-9);
  }
});

test('foundation and raft beam rows miss column inserts without deleting any beam bars', () => {
  const presets=require(path.join(compiled,'rebar.js')),raft=require(path.join(compiled,'raft-reinforcement.js'));
  const p={...presets.FOUNDATION_PRESETS.standard,columnCount:2,colSpacing:2000,hasFoundationBeam:true,foundationBeamB:600,foundationBeamH:700,foundationBeamTop:'4C20',foundationBeamBottom:'4C22',foundationBeamStirrup:'A10@150(4)'};
  const cols=placements.insertPerimeter(p.colMain,p.colBx,p.colBy,p.cover),d=presets.parseRebar(p.colMain).diameter;
  const layout=foundationGeometry.foundationBeamReinforcement(p);
  assert.equal(layout.bars.length,8);
  for(const bar of layout.bars) assert.ok(cols.every(c=>Math.abs(bar.z*1000-c.z)>=(bar.diameter+d)/2+2-.01));
  const rp=presets.RAFT_PRESETS.beamSlab,q=raft.raftBeamArrangement(rp),rc=placements.insertPerimeter(rp.colMain,rp.colBx,rp.colBy,rp.cover),rd=presets.parseRebar(rp.colMain).diameter;
  assert.ok(q.clear);
  for(const [row,axis,diameter] of [[q.xBottom,'z',q.bottom.diameter],[q.xTop,'z',q.top.diameter],[q.yBottom,'x',q.bottom.diameter],[q.yTop,'x',q.top.diameter]]) {
    for(const x of row) assert.ok(rc.every(c=>Math.abs(x-c[axis])>=(diameter+rd)/2+2-.01));
  }
  assert.equal(q.xBottom.length,q.bottom.count);assert.equal(q.xTop.length,q.top.count);
  assert.equal(q.yBottom.length,q.bottom.count);assert.equal(q.yTop.length,q.top.count);
});

test('raft beam layers and insert feet clear LPB mesh and each other in the default beam slab model', () => {
  const presets=require(path.join(compiled,'rebar.js')),raft=require(path.join(compiled,'raft-reinforcement.js'));
  const p=presets.RAFT_PRESETS.beamSlab,q=raft.raftBeamArrangement(p);
  const bx=presets.parseSlabRebar(p.bottomBarX),by=presets.parseSlabRebar(p.bottomBarY),layers=placements.orthogonalLayers(p.h,p.cover,bx.diameter,by.diameter,'bottom',p.bottomCrossOrder);
  const meshTop=Math.max(layers.x+bx.diameter/2,layers.y+by.diameter/2);
  assert.ok(q.bottomXLevel-q.bottom.diameter/2>=meshTop+2);
  assert.ok(q.bottomYLevel-q.bottomXLevel>=q.bottom.diameter+2);
  assert.ok(q.topXLevel-q.topYLevel>=q.top.diameter+2);
  const r=presets.parseRebar(p.colMain),spec=placements.foundationInsertSpec(p.beamH,p.cover,r.diameter,bx.diameter,by.diameter,r.grade,p.concreteGrade,p.seismicGrade,q.minFootSurfaceMm);
  assert.ok(spec.footYmm-r.diameter/2>=q.bottomYLevel+q.bottom.diameter/2+2);
  const calc=require(path.join(compiled,'calc.js'));
  near(calc.calcRaft(p).items.find(i=>i.name==='柱插筋').lengthM*1000,spec.lengthMm,.0001);
});

test('raft composite hoop quantities count the same full protected station series as the model', () => {
  const {RAFT_PRESETS}=require(path.join(compiled,'rebar.js')),raft=require(path.join(compiled,'raft-reinforcement.js')),calc=require(path.join(compiled,'calc.js'));
  const p=RAFT_PRESETS.beamSlab,q=raft.raftBeamArrangement(p),items=calc.calcRaft(p).items;
  assert.ok(q.xStations.length>80,'the old cap omitted far-end hoops');
  for(const [direction,spec,positions,beams] of [['X',q.xSpec,q.xStations,p.colCountY],['Y',q.ySpec,q.yStations,p.colCountX]]) {
    for(const [i,hoop] of spec.hoops.entries()) {
      const item=items.find(q=>q.name===`JL${i?'内箍'+i:'外箍'}（${direction}向）`);
      assert.equal(item.count,positions.length*beams);near(item.lengthM*1000,hoop.lengthMm,.0001);
    }
    const half=(direction==='X'?p.lx:p.ly)/2;
    assert.ok(positions.every(x=>Math.abs(x)+q.stir.diameter/2<=half-p.cover+.001));
  }
});
