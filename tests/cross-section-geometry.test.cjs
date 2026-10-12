const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebar-section-plan-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
after(() => fs.rmSync(dir, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'src/lib/section-plan.ts', 'src/lib/section-scene.ts', '--outDir', dir, '--module', 'commonjs', '--target', 'es2022', '--esModuleInterop', '--skipLibCheck'], { cwd: root });
const section = require(path.join(dir, 'section-plan.js'));
const scenes = require(path.join(dir, 'section-scene.js'));
const presets = require(path.join(dir, 'rebar.js'));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const group = (plan, name) => plan.bars.filter(bar => bar.group === name);
const length = bar => Math.hypot(bar.end[0] - bar.start[0], bar.end[1] - bar.start[1]);

test('foundation plan uses radius-aware actual stations and separate shortened bars', () => {
  const p = { ...presets.FOUNDATION_PRESETS.simple, bx: 1580, by: 2500, shortenBottomBarX: true };
  const plan = section.foundationPlan(p), x = group(plan, 'bottomX'), y = group(plan, 'bottomY');
  // X station span = 1580-80-12 = 1488. Ten actual stations at 150 mm
  // occupy 1350 mm; the centered series runs -675..675.
  assert.equal(x.length, 10); assert.equal(x.filter(bar => bar.short).length, 5);
  assert.equal(y.length, 17);
  x.forEach((bar, i) => {
    assert.equal(bar.axis, 'z');
    near(bar.start[0], -675 + i * 150); near(bar.end[0], -675 + i * 150);
    near(length(bar), i % 2 ? 2167.2 : 2408);
    near(bar.start[1], -length(bar) / 2); near(bar.end[1], length(bar) / 2);
    assert.equal(bar.short, i % 2 === 1);
  });
  y.forEach((bar, i) => {
    assert.equal(bar.axis, 'x'); near(bar.start[1], -1200 + i * 150);
    near(bar.start[0], -744); near(bar.end[0], 744);
  });
});

test('dual-column foundation retains both column centres and top reinforcement', () => {
  const plan = section.foundationPlan({ ...presets.FOUNDATION_PRESETS.dualColumn });
  assert.deepEqual(plan.columns.map(q => [q.x, q.z]), [[-1200, 0], [1200, 0]]);
  assert.ok(plan.columns.every(q => q.width === 500 && q.depth === 500));
  assert.equal(group(plan, 'topX').length, 9); assert.equal(group(plan, 'topY').length, 10);
  assert.ok(group(plan, 'topX').every(q => q.axis === 'x' && q.layer === 'top' && length(q) === 2900));
  assert.ok(group(plan, 'topY').every(q => q.axis === 'z' && q.layer === 'top' && length(q) === 1200));
});

test('foundation beam plan keeps its actual 22 mm bottom-bar diameter', () => {
  const plan = section.foundationPlan({ ...presets.FOUNDATION_PRESETS.dualColumn });
  const bottom = group(plan, 'beamBottom'), top = group(plan, 'beamTop');
  assert.equal(bottom.length, 4); assert.equal(top.length, 4);
  assert.ok(bottom.every(bar => bar.diameter === 22));
  assert.ok(top.every(bar => bar.diameter === 20));
});

test('strip plan expresses local replacement without silently truncating the actual bar count', () => {
  const plan = section.stripFoundationPlan({ ...presets.STRIPFOUNDATION_PRESETS.doubleBeam });
  // The original 80 equally distributed stations have 12 inside the replaced
  // 1800 mm interval. 68 remain; 13 local bars include both interval ends.
  for (const [baseName, localName] of [['bottom', 'localBottom'], ['top', 'localTop']]) {
    const base = group(plan, baseName), local = group(plan, localName);
    assert.equal(base.length, 68); assert.equal(local.length, 13);
    assert.ok(base.every(bar => bar.start[0] < -2400 || bar.start[0] > -600));
    local.forEach((bar, i) => {
      assert.equal(bar.axis, 'z'); assert.equal(bar.override, true);
      near(bar.start[0], -2400 + i * 150); near(bar.end[0], bar.start[0]);
    });
  }
  assert.ok(group(plan, 'localBottom').every(bar => bar.spec === 'C18@150' && length(bar) === 2520));
  assert.ok(group(plan, 'localTop').every(bar => bar.spec === 'C16@150' && length(bar) === 950));
  assert.deepEqual(plan.supports.filter(q => q.name === 'JL').map(q => [q.x, q.z, q.width, q.depth]), [[0, -700, 13200, 450], [0, 700, 13200, 450]]);
});

test('pile-cap circular layout uses the four actual cardinal centres', () => {
  const plan = section.pileCapPlan({ ...presets.PILECAP_PRESETS.fourPile, pileLayout: 'circular' });
  const expected = [[0, -600], [600, 0], [0, 600], [-600, 0]];
  assert.equal(plan.piles.length, 4);
  plan.piles.forEach((pile, i) => {
    near(pile.x, expected[i][0]); near(pile.z, expected[i][1]);
    assert.equal(pile.diameter, 600);
  });
  assert.equal(group(plan, 'bottomX').length, 13); assert.equal(group(plan, 'bottomY').length, 13);
});

test('three-pile plan preserves the model Z sign instead of mirroring the triangle', () => {
  const plan = section.pileCapPlan({ ...presets.PILECAP_PRESETS.fourPile, pileCount: 3, pileLayout: 'grid', pileSpacingY: 900 });
  assert.deepEqual(plan.piles.map(p => [p.x, p.z]), [[-600, -300], [600, -300], [0, 600]]);
});

test('raft plan retains the complete lower and upper meshes with explicit axis and layer', () => {
  const plan = section.raftPlan({ ...presets.RAFT_PRESETS.standard });
  for (const [name, count, axis, layer, first, last] of [
    ['bottomX', 120, 'z', 'bottom', -8960, 8890],
    ['bottomY', 80, 'x', 'bottom', -5960, 5890],
    ['topX', 90, 'z', 'top', -8960, 8840],
    ['topY', 60, 'x', 'top', -5960, 5840],
  ]) {
    const rows = group(plan, name);
    assert.equal(rows.length, count);
    assert.ok(rows.every(bar => bar.axis === axis && bar.layer === layer));
    const coordinate = axis === 'z' ? 0 : 1;
    near(rows[0].start[coordinate], first); near(rows.at(-1).start[coordinate], last);
    near(length(rows[0]), axis === 'z' ? 11920 : 17920);
  }
});

test('raft plan shows all six column footprints at their actual X/Z coordinates', () => {
  const plan = section.raftPlan({ ...presets.RAFT_PRESETS.standard });
  assert.deepEqual(plan.columns.map(q => [q.x, q.z]), [[-7500, -4500], [-7500, 4500], [0, -4500], [0, 4500], [7500, -4500], [7500, 4500]]);
  assert.ok(plan.columns.every(q => q.width === 500 && q.depth === 500));
});

test('AT and BT stair slices show only the end negative bars crossing the chosen plane', () => {
  for (const p of [presets.STAIR_PRESETS.standard, presets.STAIR_PRESETS.bt_standard]) {
    // Width 1200, cover15 and diameter10/8 give eight lower positions and
    // six top positions. Two end sets are independent; neither reaches X=1540.
    const middle = scenes.stairSection(p, 'middle');
    assert.equal(middle.dots.length, 8);
    assert.ok(!middle.legend.some(q => q.name.includes('负筋')));
    for (const end of ['low', 'high']) {
      const slice = scenes.stairSection(p, end);
      assert.equal(slice.dots.length, 14);
      assert.equal(slice.legend.find(q => q.name.includes('负筋')).count, 6);
      assert.equal(slice.width, 1200); assert.equal(slice.height, 120);
      assert.ok(slice.dots.every(q => q.point[1] > 0 && q.point[1] < 120));
    }
  }
});

test('variable column dimensions change precisely at the specified slice height', () => {
  const p = { ...presets.COLUMN_PRESETS.standard, h: 600, height: 3600, hasVariableSection: true, variableStart: 2200, upperB: 400, upperH: 450 };
  const lower = scenes.columnSection(p, 2.199), upper = scenes.columnSection(p, 2.2);
  assert.deepEqual([lower.width, lower.height], [500, 600]);
  assert.deepEqual([upper.width, upper.height], [400, 450]);
  // Four corners + two b-edge bars on each face + two h-edge bars on each
  // face = twelve independently represented longitudinal bars in either segment.
  assert.equal(lower.dots.length, 12); assert.equal(upper.dots.length, 12);
  assert.ok(upper.dots.every(q => Math.abs(q.point[0]) + q.diameter / 2 < 200 && q.point[1] - q.diameter / 2 > 0 && q.point[1] + q.diameter / 2 < 450));
  const range = s => Math.max(...s.dots.map(q => q.point[0])) - Math.min(...s.dots.map(q => q.point[0]));
  near(range(lower) - range(upper), 100);
});

test('column slice density agrees with the actual disjoint hoop station zones', () => {
  const p = { ...presets.COLUMN_PRESETS.standard, h: 600, height: 3600 };
  // max(ceil(3600/6),500,600,500)=600. Actual bottom dense stations end
  // before H=600; the H=600 station starts normal spacing. Top dense starts3000.
  const label = y => scenes.columnSection(p, y / 1000).legend.find(q => q.name.includes('箍筋'));
  assert.ok(label(599).name.startsWith('加密区'));
  assert.ok(label(600).name.startsWith('非加密区'));
  assert.ok(label(1800).name.startsWith('非加密区'));
  assert.ok(label(3000).name.startsWith('加密区'));
  assert.ok(label(600).spec.endsWith('@200'));
  assert.ok(label(3000).spec.endsWith('@100'));
});

test('slab central observation bands contain neither direction of support negative reinforcement', () => {
  // In the 4200x3600 continuous slab the negative bars are confined to its
  // edge thirds. Neither X=0 nor Y=0 intersects those bars inside the central
  // transverse +/-300 mm observation strip.
  for (const axis of ['x', 'z']) {
    const s = scenes.slabSection({ ...presets.SLAB_PRESETS.standard }, 'middle', axis);
    assert.ok(!s.legend.some(q => q.name.includes('支座负筋')), `${axis}: ${s.legend.map(q => q.name).join(', ')}`);
  }
});

test('slab X support slice contains its four radius-aware negative-bar stations', () => {
  const s = scenes.slabSection({ ...presets.SLAB_PRESETS.standard }, 'support', 'x');
  const legend = s.legend.find(q => q.name === 'X向支座负筋');
  assert.ok(legend);
  // Across Y: (3600-30-12)/150 =>24 positions centered -1725..1725;
  // within +/-300 the four actual positions are -225,-75,75,225.
  assert.equal(legend.count, 4);
  assert.ok(!s.legend.some(q => q.name.includes('Y向支座负筋')));
  assert.deepEqual(s.dots.filter(q => q.color === legend.color).map(q => q.point[0]), [-225, -75, 75, 225]);
});

test('slab Y support slice rotates the local negative-bar path into world Y before clipping', () => {
  const s = scenes.slabSection({ ...presets.SLAB_PRESETS.standard }, 'support', 'z');
  const legend = s.legend.find(q => q.name === 'Y向支座负筋');
  assert.ok(legend);
  // Across X: (4200-30-10)/200 =>21 positions centered -2000..2000;
  // within +/-300 the three actual stations are -200,0,200.
  assert.equal(legend.count, 3);
  assert.ok(!s.legend.some(q => q.name.includes('X向支座负筋')));
  assert.deepEqual(s.dots.filter(q => q.color === legend.color).map(q => q.point[0]), [-200, 0, 200]);
});

test('wall opening slice omits only the vertical bars removed by the opening', () => {
  const p = {
    ...presets.SHEAR_WALL_PRESETS.simple, lw: 4000, hw: 3000, boundaryLength: 500,
    vertBar: 'C10@250', horizBar: 'C10@250', hasOpening: true,
    openingWidth: 1000, openingHeight: 1000, openingBottom: 500, openingOffsetX: 250,
  };
  // Thirteen stations on each face (-1500..1500 every250). The window
  // removes five stations (-250..750) from each face at H=1000:26-10=16.
  const below = scenes.wallSection(p, 250), inside = scenes.wallSection(p, 1000), above = scenes.wallSection(p, 2000);
  const count = s => s.legend.find(q => q.name === '穿过剖面的竖筋').count;
  assert.equal(count(below), 26); assert.equal(count(inside), 16); assert.equal(count(above), 26);
  const red = inside.legend.find(q => q.name === '穿过剖面的竖筋').color;
  assert.ok(inside.dots.filter(q => q.color === red).every(q => q.point[0] < -250 || q.point[0] > 750));
  assert.equal(inside.legend.find(q => q.name === '边缘纵筋 · 两端').count, 16);
});
