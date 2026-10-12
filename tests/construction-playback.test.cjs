const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rebar-playback-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), 'src/lib/construction-playback.ts', '--outDir', dir, '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck'], { cwd: root });
const { initialPlayback, playbackTransition: move, playbackElapsed, STAGE_DURATION_MS, beamConstructionSteps, stairConstructionSteps } = require(path.join(dir, 'construction-playback.js'));

test('pause and speed changes preserve the elapsed stage time', () => {
  let s = move(initialPlayback(), { type: 'enter' }, 100, 4);
  s = move(s, { type: 'pause' }, 1100, 4);
  assert.equal(s.playing, false);
  assert.equal(playbackElapsed(s, 9000), 1000);
  s = move(s, { type: 'toggle' }, 9000, 4);
  s = move(s, { type: 'speed', speed: 2 }, 9500, 4);
  assert.equal(playbackElapsed(s, 10000), 2500);
});

test('seeking pauses immediately and resets the full viewing time of the chosen stage', () => {
  let s = move(initialPlayback(), { type: 'enter' }, 0, 5);
  s = move(s, { type: 'seek', step: 3 }, 1200, 5);
  assert.equal(s.step, 3);
  assert.equal(s.playing, false);
  assert.equal(s.elapsed, 0);
  assert.equal(move(s, { type: 'seek', step: 99 }, 1300, 5).step, 4);
});

test('the final stage is held for its duration, then replay starts from the first stage', () => {
  let s = move(initialPlayback(), { type: 'enter' }, 0, 2);
  s = move(s, { type: 'advance' }, STAGE_DURATION_MS, 2);
  assert.equal(s.step, 1);
  assert.equal(s.playing, true);
  s = move(s, { type: 'advance' }, STAGE_DURATION_MS * 2, 2);
  assert.equal(s.playing, false);
  assert.equal(s.elapsed, STAGE_DURATION_MS);
  s = move(s, { type: 'toggle' }, 10000, 2);
  assert.equal(s.step, 0);
  assert.equal(s.playing, true);
  assert.equal(move(s, { type: 'exit' }, 11000, 2).open, false);
});

test('beam steps skip absent steel groups and reserve concrete for the last stage', () => {
  const minimal = { sideBar: '', leftSupport: '', rightSupport: '', innerSupport: '', erectionBar: '', haunchType: 'none', haunchLength: 0, haunchHeight: 0 };
  const steps = beamConstructionSteps(minimal);
  assert.deepEqual(steps.map(s => s.id), ['reference', 'bottom', 'stirrup', 'top', 'concrete']);
  assert.ok(steps.slice(0, -1).every(s => !s.groups.includes('concrete')));
  assert.ok(steps.at(-1).groups.includes('concrete'));
  const full = beamConstructionSteps({ ...minimal, sideBar: 'G4C12', leftSupport: '2C25', haunchType: 'vertical', haunchLength: 600, haunchHeight: 200 });
  assert.ok(full.some(s => s.id === 'support'));
  assert.ok(full.some(s => s.id === 'tieBar'));
  assert.ok(full.some(s => s.id === 'haunch'));
});

test('stair reinforcement accumulates and remains visible in the final concrete step', () => {
  const steps = stairConstructionSteps();
  assert.deepEqual(steps.map(s => s.id), ['reference', 'bottom', 'dist', 'top', 'concrete']);
  assert.deepEqual(new Set(steps.at(-1).groups), new Set(['bottom', 'dist', 'top', 'concrete']));
});
