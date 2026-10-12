import * as THREE from 'three';
import { S } from './constants';
import { PlanarRebarCurve, ReversedRebarCurve } from './rebar-curve';
import { layoutBars } from './layout';
import { parseRebar, parseRebarBottom } from './rebar';

export type StirrupPlane = 'yz' | 'xz';

export interface CreateStirrupCurvesParams {
  width: number;
  height: number;
  diameter: number;
  cornerRadius?: number;
  plane: StirrupPlane;
}

export interface StirrupCurves {
  outerCurve: PlanarRebarCurve;
  hookCurves: PlanarRebarCurve[];
  fullCurve: THREE.CurvePath<THREE.Vector3>;
  hookClearGapMm: number;
}

export interface CompositeStirrupHoop extends StirrupShapeSpec {
  centerOffsetMm: number;
  normalOffsetMm: number;
  mirror: boolean;
}

/** Outer hoop plus independent inner closed hoops. Widths are centreline dimensions. */
export function beamStirrupBarPositions(widthMm: number, diameterMm: number, top: string, bottom: string): number[] {
  return [parseRebar(top), parseRebarBottom(bottom)].flatMap(bar =>
    layoutBars(bar, (widthMm - diameterMm - bar.diameter) * S, [0]).map(p => p.z / S));
}

export function createCompositeStirrupSpec(params: CreateStirrupShapeSpecParams & { legs?: number; barPositionsMm?: number[] }) {
  const outer = createStirrupShapeSpec(params);
  const count = Math.max(1, Math.ceil((params.legs ?? 2) / 2));
  const innerPositions = resolveInnerLegPositions({ legs: count * 2, width: outer.widthMm, barPositions: params.barPositionsMm });
  const gap = Math.max(2, params.diameterMm * .25);
  // Each hoop already has two offset end layers. Keep the complete physical
  // envelopes separate, including their radii, rather than only their centrelines.
  const step = 2 * params.diameterMm + 2 * gap;
  const hoops: CompositeStirrupHoop[] = Array.from({ length: count }, (_, i) => {
    const left = i === 0 ? -outer.widthMm / 2 : innerPositions[2 * (i - 1)];
    const right = i === 0 ? outer.widthMm / 2 : innerPositions[2 * (i - 1) + 1];
    return { ...createStirrupShapeSpec({ ...params, widthMm: right - left }),
      centerOffsetMm: (left + right) / 2,
      normalOffsetMm: (i - (count - 1) / 2) * step,
      mirror: i % 2 === 1 };
  });
  return { ...outer, hoops, pieceCount: count,
    lengthMm: hoops.reduce((sum, hoop) => sum + hoop.lengthMm, 0),
    normalExtentMm: (count - 1) * step / 2 + params.diameterMm + gap / 2 };
}

export function createCompositeStirrupCurves(params: CreateStirrupCurvesParams & { legs?: number; barPositions?: number[] }) {
  const spec = createCompositeStirrupSpec({ widthMm: params.width / S, heightMm: params.height / S,
    diameterMm: params.diameter, legs: params.legs,
    barPositionsMm: params.barPositions?.map(p => p / S),
    cornerRadiusMm: params.cornerRadius === undefined ? undefined : params.cornerRadius / S });
  const hoops = spec.hoops.map(hoop => {
    const source = createStirrupCurves({ ...params, width: hoop.widthMm * S });
    const transform = (curve: PlanarRebarCurve) => new PlanarRebarCurve(curve.path, (_u, _v, t) => {
      const p = curve.getPoint(t);
      const sign = hoop.mirror ? -1 : 1;
      if (params.plane === 'yz') {
        p.z = sign * p.z + hoop.centerOffsetMm * S;
        p.y *= sign;
        p.x += hoop.normalOffsetMm * S;
      } else {
        p.x = sign * p.x + hoop.centerOffsetMm * S;
        p.z *= sign;
        p.y += hoop.normalOffsetMm * S;
      }
      return p;
    });
    const outerCurve = transform(source.outerCurve);
    const hookCurves = source.hookCurves.map(transform);
    const fullCurve = new THREE.CurvePath<THREE.Vector3>();
    fullCurve.add(new ReversedRebarCurve(hookCurves[0]));
    fullCurve.add(outerCurve);
    fullCurve.add(hookCurves[1]);
    return { ...source, outerCurve, hookCurves, fullCurve, spec: hoop };
  });
  return { spec, hoops };
}

export interface ResolveInnerLegPositionsParams {
  legs: number;
  width: number;
  barPositions?: number[];
}

export interface CreateTieBarHookPointsParams {
  sideOffset: number;
  tieDiameter: number;
  sideBarDiameter: number;
  hookAngle?: number;
  arcSegments?: number;
}

export interface CalculateStirrupLengthParams {
  width: number;
  height: number;
  diameter: number;
  cornerRadius?: number;
}

export interface CreateStirrupShapeSpecParams {
  widthMm: number;
  heightMm: number;
  diameterMm: number;
  cornerRadiusMm?: number;
}

export interface StirrupShapeSpec {
  widthMm: number;
  heightMm: number;
  diameterMm: number;
  cornerRadiusMm: number;
  bendRadiusMm: number;
  hookLenMm: number;
  hookAngleDeg: 135;
  bodyLenMm: number;
  lengthMm: number;
}

export interface CreateTieBarShapeSpecParams {
  sideOffsetMm: number;
  tieDiameterMm: number;
  sideBarDiameterMm: number;
  hookAngleDeg?: number;
  arcSegments?: number;
}

export interface TieBarShapeSpec {
  sideOffsetMm: number;
  tieDiameterMm: number;
  sideBarDiameterMm: number;
  bendRadiusMm: number;
  bendCenterOffsetMm: number;
  hookLenMm: number;
  hookAngleDeg: number;
  bodyLenMm: number;
  lengthMm: number;
}

export interface ResolveTieSideOffsetMmParams {
  sectionWidthMm: number;
  coverMm: number;
  stirrupDiameterMm: number;
  sideBarDiameterMm: number;
}

export function createStirrupCurves({
  width,
  height,
  diameter,
  cornerRadius,
  plane,
}: CreateStirrupCurvesParams): StirrupCurves {
  const spec = createStirrupShapeSpec({
    widthMm: width / S, heightMm: height / S, diameterMm: diameter,
    cornerRadiusMm: cornerRadius === undefined ? undefined : cornerRadius / S,
  });
  const w2 = spec.widthMm * S / 2;
  const h2 = spec.heightMm * S / 2;
  const r = spec.bendRadiusMm * S;
  const hookLen = spec.hookLenMm * S;
  // The overlapped corner is two adjacent layers, rather than two bars occupying
  // the same centreline. Transition smoothly along the body between these layers.
  // Rendering clearance, not a required construction spacing: keep the two
  // physical surfaces distinguishable, including when looking at the lap closely.
  const hookClearGapMm = Math.max(2, diameter * 0.25);
  const layer = (diameter + hookClearGapMm) * S / 2;
  const project = (u: number, v: number, normal: number) => plane === 'yz'
    ? new THREE.Vector3(normal, v, u)
    : new THREE.Vector3(u, normal, v);

  // Open body: three rounded corners; the fourth corner belongs to the two hooks.
  const body = new THREE.Path();
  body.moveTo(-w2 + r, h2);
  body.lineTo(w2 - r, h2);
  body.absarc(w2 - r, h2 - r, r, Math.PI / 2, 0, true);
  body.lineTo(w2, -h2 + r);
  body.absarc(w2 - r, -h2 + r, r, 0, -Math.PI / 2, true);
  body.lineTo(-w2 + r, -h2);
  body.absarc(-w2 + r, -h2 + r, r, -Math.PI / 2, -Math.PI, true);
  body.lineTo(-w2, h2 - r);
  const outerCurve = new PlanarRebarCurve(body, (u, v, t) =>
    project(u, v, -layer + 2 * layer * t * t * (3 - 2 * t)));

  const cu = -w2 + r;
  const cv = h2 - r;
  const topHook = new THREE.Path();
  topHook.moveTo(cu, h2);
  topHook.absarc(cu, cv, r, Math.PI / 2, Math.PI * 5 / 4, false);
  const topEnd = topHook.getPoint(1);
  topHook.lineTo(topEnd.x + hookLen * Math.SQRT1_2, topEnd.y - hookLen * Math.SQRT1_2);

  const sideHook = new THREE.Path();
  sideHook.moveTo(-w2, cv);
  sideHook.absarc(cu, cv, r, Math.PI, Math.PI / 4, true);
  const sideEnd = sideHook.getPoint(1);
  sideHook.lineTo(sideEnd.x + hookLen * Math.SQRT1_2, sideEnd.y - hookLen * Math.SQRT1_2);
  const hookCurves = [
    new PlanarRebarCurve(topHook, (u, v) => project(u, v, -layer)),
    new PlanarRebarCurve(sideHook, (u, v) => project(u, v, layer)),
  ];
  // One bar, followed from free tip A, around the body, to free tip B. The free
  // tips remain open and are never connected by a closing edge or welded mesh.
  const fullCurve = new THREE.CurvePath<THREE.Vector3>();
  fullCurve.add(new ReversedRebarCurve(hookCurves[0]));
  fullCurve.add(outerCurve);
  fullCurve.add(hookCurves[1]);
  return { outerCurve, hookCurves, fullCurve, hookClearGapMm };
}

export function resolveInnerLegPositions({
  legs,
  width,
  barPositions,
}: ResolveInnerLegPositionsParams): number[] {
  if (legs <= 2) return [];
  const innerLegs = legs - 2;

  if (barPositions && barPositions.length >= 2) {
    // Equivalent endpoints from different rows can differ by floating-point
    // noise; they are one bar line, not an extra gap available for an inner leg.
    const sorted = [...new Set(barPositions.map(p => Math.round(p * 1e6) / 1e6))].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      gaps.push((sorted[i] + sorted[i + 1]) / 2);
    }

    if (gaps.length >= innerLegs) {
      const step = gaps.length / innerLegs;
      return Array.from({ length: innerLegs }, (_, i) =>
        gaps[Math.min(Math.round(step * i + step / 2 - 0.5), gaps.length - 1)],
      );
    }
  }

  const spacing = width / (legs - 1);
  return Array.from({ length: innerLegs }, (_, i) => -width / 2 + (i + 1) * spacing);
}

export interface TieBarCurves {
  bodyCurve: PlanarRebarCurve;
  hookCurves: PlanarRebarCurve[];
  fullCurve: THREE.CurvePath<THREE.Vector3>;
  spec: TieBarShapeSpec;
}

/** A single open crosstie, with circular bends wrapping two longitudinal bars. */
export function createTieBarCurves({
  sideOffset, tieDiameter, sideBarDiameter, hookAngle = 3 * Math.PI / 4,
}: CreateTieBarHookPointsParams): TieBarCurves {
  const spec = createTieBarShapeSpec({ sideOffsetMm: sideOffset / S,
    tieDiameterMm: tieDiameter, sideBarDiameterMm: sideBarDiameter,
    hookAngleDeg: hookAngle * 180 / Math.PI });
  const c = spec.bendCenterOffsetMm * S;
  const r = spec.bendRadiusMm * S;
  const hookLen = spec.hookLenMm * S;
  const project = (u: number, v: number) => new THREE.Vector3(0, -v, u);
  const body = new THREE.Path();
  body.moveTo(-c, -r);
  body.lineTo(c, -r);
  const bodyCurve = new PlanarRebarCurve(body, project);
  const hookCurves = [-1, 1].map(side => {
    const path = new THREE.Path();
    path.moveTo(side * c, -r);
    const endAngle = -Math.PI / 2 + side * hookAngle;
    path.absarc(side * c, 0, r, -Math.PI / 2, endAngle, side < 0);
    const end = path.getPoint(1);
    path.lineTo(end.x - side * Math.sin(endAngle) * hookLen,
      end.y + side * Math.cos(endAngle) * hookLen);
    return new PlanarRebarCurve(path, project);
  });
  const fullCurve = new THREE.CurvePath<THREE.Vector3>();
  fullCurve.add(new ReversedRebarCurve(hookCurves[0]));
  fullCurve.add(bodyCurve);
  fullCurve.add(hookCurves[1]);
  return { bodyCurve, hookCurves, fullCurve, spec };
}

export function createTieBarHookPoints(params: CreateTieBarHookPointsParams): THREE.Vector3[] {
  return createTieBarCurves(params).fullCurve.getPoints(params.arcSegments ?? 160);
}

/** Preserve tie pitch/count; move the entire series off the stirrup layers. */
export function staggerTiePositions(
  positions: number[], stirrupPositions: number[], clearance: number, min: number, max: number,
): number[] {
  if (!positions.length) return positions;
  const canPlace = (offset: number) => positions.every(x => x + offset >= min && x + offset <= max
    && stirrupPositions.every(s => Math.abs(x + offset - s) >= clearance - 1e-9));
  if (canPlace(0)) return positions;
  const maxShift = Math.max(max - positions[positions.length - 1], positions[0] - min);
  for (let distance = .001; distance <= maxShift + 1e-9; distance += .001) {
    for (const sign of [1, -1]) if (canPlace(sign * distance)) {
      return positions.map(x => x + sign * distance);
    }
  }
  // An impossible arrangement is retained for diagnosis, never silently removed.
  return positions;
}

export function resolveTieSideOffsetMm({
  sectionWidthMm,
  coverMm,
  stirrupDiameterMm,
  sideBarDiameterMm,
}: ResolveTieSideOffsetMmParams): number {
  const stirrupCenterWidth = sectionWidthMm - 2 * coverMm - stirrupDiameterMm;
  return Math.max(stirrupCenterWidth / 2 - stirrupDiameterMm / 2 - sideBarDiameterMm / 2, 0);
}

export function measurePolylineLength(points: THREE.Vector3[]): number {
  return points.slice(0, -1).reduce((sum, point, index) => {
    return sum + point.distanceTo(points[index + 1]);
  }, 0);
}

export function createTieBarShapeSpec({
  sideOffsetMm,
  tieDiameterMm,
  sideBarDiameterMm,
  hookAngleDeg = 135,
}: CreateTieBarShapeSpecParams): TieBarShapeSpec {
  const bendRadiusMm = Math.max(sideBarDiameterMm / 2 + tieDiameterMm, tieDiameterMm * 3);
  const hookLenMm = Math.max(10 * tieDiameterMm, 75);
  // Keep the inner bend tangent to the outside of the longitudinal bar. The
  // bend centre lies inward; putting it at the bar centre would breach cover.
  const eccentricityMm = Math.max(bendRadiusMm - sideBarDiameterMm / 2 - tieDiameterMm / 2, 0);
  const bendCenterOffsetMm = Math.max(sideOffsetMm - eccentricityMm, 0);
  const bodyLenMm = 2 * bendCenterOffsetMm;
  const hookBendArcMm = bendRadiusMm * (hookAngleDeg * Math.PI / 180);
  const lengthMm = Math.round(bodyLenMm + 2 * (hookBendArcMm + hookLenMm));

  return {
    sideOffsetMm,
    tieDiameterMm,
    sideBarDiameterMm,
    bendRadiusMm,
    bendCenterOffsetMm,
    hookLenMm,
    hookAngleDeg,
    bodyLenMm,
    lengthMm,
  };
}

export function calculateTieBarLengthMm(params: CreateTieBarHookPointsParams): number {
  return createTieBarShapeSpec({
    sideOffsetMm: params.sideOffset / S,
    tieDiameterMm: params.tieDiameter,
    sideBarDiameterMm: params.sideBarDiameter,
    hookAngleDeg: params.hookAngle ? params.hookAngle * 180 / Math.PI : 135,
    arcSegments: params.arcSegments,
  }).lengthMm;
}

export function createStirrupShapeSpec({
  widthMm,
  heightMm,
  diameterMm,
  cornerRadiusMm,
}: CreateStirrupShapeSpecParams): StirrupShapeSpec {
  const safeWidthMm = Math.max(widthMm, 0);
  const safeHeightMm = Math.max(heightMm, 0);
  const dS = diameterMm * S;
  const innerBendR = Math.max(2 * dS, 0.01);
  const defaultCornerRadiusMm = (innerBendR + dS / 2) / S;
  const resolvedCornerRadiusMm = cornerRadiusMm ?? defaultCornerRadiusMm;
  const rC = Math.min(
    Math.max(resolvedCornerRadiusMm, 0),
    (safeWidthMm / 2) * 0.999,
    (safeHeightMm / 2) * 0.999,
  );
  const bendRadiusMm = rC;
  const hookLenMm = Math.max(10 * diameterMm, 75);
  const bodyLenMm = Math.max(0, 2 * (safeWidthMm + safeHeightMm) - 8 * rC + 1.5 * Math.PI * rC);
  const hookBendArcMm = bendRadiusMm * (135 * Math.PI / 180);
  const lengthMm = Math.round(bodyLenMm + 2 * (hookBendArcMm + hookLenMm));

  return {
    widthMm: safeWidthMm,
    heightMm: safeHeightMm,
    diameterMm,
    cornerRadiusMm: rC,
    bendRadiusMm,
    hookLenMm,
    hookAngleDeg: 135,
    bodyLenMm,
    lengthMm,
  };
}

export function calculateStirrupLengthMm({
  width,
  height,
  diameter,
  cornerRadius,
}: CalculateStirrupLengthParams): number {
  return createStirrupShapeSpec({
    widthMm: width / S,
    heightMm: height / S,
    diameterMm: diameter,
    cornerRadiusMm: cornerRadius === undefined ? undefined : cornerRadius / S,
  }).lengthMm;
}
