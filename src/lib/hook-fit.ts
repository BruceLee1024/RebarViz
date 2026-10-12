import * as THREE from 'three';
import type { BeamParams } from './types';
import { parseRebar, parseRebarBottom, parseStirrup, parseSideBar, parseTieBar, autoTieBar } from './rebar';
import { beamSpans } from './quantity-geometry';
import { beamStirrupBarPositions, createCompositeStirrupCurves, createTieBarCurves, resolveTieSideOffsetMm } from './rebar-shapes';

export interface HookFitIssue {
  code: 'tie-tail-collision' | 'stirrup-bend-diameter' | 'stirrup-cover';
  field: string;
  message: string;
}

/** Shortest distance between finite segments in real 3D, including their ends. */
function segmentDistance(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) {
  const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c);
  const aa = u.dot(u), bb = u.dot(v), cc = v.dot(v), dd = u.dot(w), ee = v.dot(w);
  const pointDistance = (p: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) => {
    const delta = end.clone().sub(start);
    const t = delta.lengthSq() ? THREE.MathUtils.clamp(p.clone().sub(start).dot(delta) / delta.lengthSq(), 0, 1) : 0;
    return p.distanceTo(start.clone().addScaledVector(delta, t));
  };
  let distance = Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b));
  const determinant = aa * cc - bb * bb;
  if (determinant > 1e-15) {
    const s = (bb * ee - cc * dd) / determinant, t = (aa * ee - bb * dd) / determinant;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) distance = Math.min(distance, w.addScaledVector(u, s).addScaledVector(v, -t).length());
  }
  return distance;
}

/** Validate the displayed assembly; never shorten a required tail to make it fit. */
export function beamHookFit(p: BeamParams): HookFitIssue[] {
  const issues: HookFitIssue[] = [], stir = parseStirrup(p.stirrup), cover = p.cover || 25;
  const longitudinal = Math.max(parseRebar(p.top).diameter, parseRebarBottom(p.bottom).diameter,
    ...[p.leftSupport, p.rightSupport].filter((s): s is string => Boolean(s)).map(s => parseRebar(s).diameter));
  // GB50204 §5.3.1: inner bend diameter, not centreline radius.
  const minimumInnerDiameter = Math.max((stir.grade === 'A' ? 2.5 : 4) * stir.diameter, longitudinal);
  const widths = [...new Set(beamSpans(p).map(s => s.b))];
  const side = p.sideBar ? parseSideBar(p.sideBar) : null;
  for (const b of widths) {
    const width = b - 2 * cover - stir.diameter, height = p.h - 2 * cover - stir.diameter;
    const curves = createCompositeStirrupCurves({ width: width / 1000, height: height / 1000, diameter: stir.diameter,
      legs: stir.legs, plane: 'yz', barPositions: beamStirrupBarPositions(width, stir.diameter, p.top, p.bottom).map(z => z / 1000) });
    const narrowest = Math.min(...curves.hoops.map(q => 2 * q.spec.bendRadiusMm - stir.diameter));
    if (narrowest < minimumInnerDiameter - .01) issues.push({ code: 'stirrup-bend-diameter', field: 'stirrup',
      message: `梁宽${b}mm：独立箍的最小弯弧内径仅${narrowest.toFixed(1)}mm，小于要求${minimumInnerDiameter.toFixed(1)}mm；当前几何受箍宽限制压小了弯弧，不能作为可施工构造。请增加截面或调整复合箍组合。` });
    const points = curves.hoops.flatMap(q => [...q.fullCurve.getPoints(240), ...q.hookCurves.map(h => h.getPoint(1))]);
    const excess = Math.max(...points.map(q => Math.max(Math.abs(q.z) * 1000 + stir.diameter / 2 - (b / 2 - cover),
      Math.abs(q.y) * 1000 + stir.diameter / 2 - (p.h / 2 - cover))));
    if (excess > .1) issues.push({ code: 'stirrup-cover', field: 'b',
      message: `梁宽${b}mm：完整${curves.spec.hookLenMm}mm箍筋平直段的钢筋表面越过保护层包络约${excess.toFixed(1)}mm。当前截面无法容纳这一封口方向；请增大截面或按实际详图调整封口位置，不应缩短规定直段。` });
    if (side) {
      const tie = p.tieBar ? parseTieBar(p.tieBar) : autoTieBar(b, stir.grade, stir.diameter);
      if (!tie) continue;
      const offset = resolveTieSideOffsetMm({ sectionWidthMm: b, coverMm: cover, stirrupDiameterMm: stir.diameter, sideBarDiameterMm: side.diameter });
      const shape = createTieBarCurves({ sideOffset: offset / 1000, tieDiameter: tie.diameter, sideBarDiameter: side.diameter });
      const tails = shape.hookCurves.map(h => {
        const start = h.path.curves.slice(0, -1).reduce((sum, q) => sum + q.getLength(), 0) / h.path.getLength();
        return [h.getPoint(start), h.getPoint(1)] as const;
      });
      const distance = segmentDistance(...tails[0], ...tails[1]) * 1000;
      if (distance < tie.diameter - .01) issues.push({ code: 'tie-tail-collision', field: 'tieBar',
        message: `梁宽${b}mm：拉筋两端${shape.spec.hookLenMm}mm平直段相碰，三维中心线最小距离${distance.toFixed(1)}mm，小于钢筋直径${tie.diameter}mm。当前同平面双135°形状无法容纳完整弯钩；请增大截面或按详图选择拉筋构造。` });
    }
  }
  return issues;
}
