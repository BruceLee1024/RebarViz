import * as THREE from 'three';

/** Lift a path of exact lines and circular arcs into 3D without spline overshoot. */
export class PlanarRebarCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    readonly path: THREE.Path,
    private readonly project: (u: number, v: number, t: number) => THREE.Vector3,
  ) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const point = this.path.getPoint(THREE.MathUtils.clamp(t, 0, 1));
    return target.copy(this.project(point.x, point.y, t));
  }

  // Path.getPoint already selects segments by their length.
  getPointAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.getPoint(u, target);
  }

  getTangentAt(u: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.getTangent(u, target);
  }
}

export class ReversedRebarCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly source: THREE.Curve<THREE.Vector3>) { super(); }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.source.getPointAt(1 - t, target);
  }
}

/** TubeGeometry leaves both ends hollow; a steel bar has flat, separate end faces. */
export function cappedRebarGeometry(
  curve: THREE.Curve<THREE.Vector3>, segments: number, radius: number, radialSegments = 12,
): THREE.BufferGeometry {
  const tube = new THREE.TubeGeometry(curve, segments, radius, radialSegments, false);
  const positions = [...tube.getAttribute('position').array];
  const normals = [...tube.getAttribute('normal').array];
  const uvs = [...tube.getAttribute('uv').array];
  const indices = [...tube.getIndex()!.array];
  for (const end of [0, 1]) {
    const center = curve.getPointAt(end);
    const normal = curve.getTangentAt(end).multiplyScalar(end === 0 ? -1 : 1);
    const base = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    normals.push(normal.x, normal.y, normal.z);
    uvs.push(.5, .5);
    const row = end === 0 ? 0 : segments * (radialSegments + 1);
    for (let i = 0; i <= radialSegments; i++) {
      const sourceIndex = (row + i) * 3;
      positions.push(...tube.getAttribute('position').array.slice(sourceIndex, sourceIndex + 3));
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(.5 + .5 * Math.cos(i * 2 * Math.PI / radialSegments),
        .5 + .5 * Math.sin(i * 2 * Math.PI / radialSegments));
    }
    for (let i = 0; i < radialSegments; i++) {
      const a = new THREE.Vector3().fromArray(positions, (base + i + 1) * 3).sub(center);
      const b = new THREE.Vector3().fromArray(positions, (base + i + 2) * 3).sub(center);
      const forward = a.cross(b).dot(normal) >= 0;
      indices.push(base, base + i + (forward ? 1 : 2), base + i + (forward ? 2 : 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  tube.dispose();
  return geometry;
}

/** LineSegments needs a pair per edge; a bare list silently drops alternate edges. */
export function continuousLineGeometry(points: THREE.Vector3[]): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints(
    points.slice(1).flatMap((point, i) => [points[i], point]),
  );
}

export interface BentAnchorCurveParams {
  straightLen: number;
  bendLen: number;
  diameter: number;
  direction: 'up' | 'down';
  horizontalAxis?: 'x' | 'z';
  xDir?: number;
}

/** straightLen and bendLen are the two overall dimensions from the virtual corner. */
export function createBentAnchorCurve({
  straightLen, bendLen, diameter, direction, horizontalAxis = 'x', xDir = 1,
}: BentAnchorCurveParams): PlanarRebarCurve {
  const horizontal = Math.max(straightLen, 0);
  const vertical = Math.max(bendLen, 0);
  const radius = Math.min(
    Math.max(4 * diameter * 0.001, 0.006),
    horizontal > 0 ? horizontal : Infinity,
    vertical,
  );
  const path = new THREE.Path();
  // A zero horizontal extension borrows its bend from the end of the incoming bar.
  const tangentU = horizontal - radius;
  path.moveTo(Math.min(tangentU, 0), 0);
  if (tangentU > 0) path.lineTo(tangentU, 0);
  if (radius > 0) path.absarc(tangentU, radius, radius, -Math.PI / 2, 0, false);
  if (vertical > radius) path.lineTo(horizontal, vertical);
  if (path.curves.length === 0) path.lineTo(horizontal, vertical);
  const sign = direction === 'down' ? -1 : 1;
  const axisSign = xDir < 0 ? -1 : 1;
  return new PlanarRebarCurve(path, (u, v) => horizontalAxis === 'x'
    ? new THREE.Vector3(axisSign * u, sign * v, 0)
    : new THREE.Vector3(0, sign * v, axisSign * u));
}

/** Orient a Y-axis cylinder from its two 3D endpoints, including lateral slopes. */
export function rebarSegmentTransform(start: THREE.Vector3, end: THREE.Vector3) {
  const delta = end.clone().sub(start);
  const length = delta.length();
  const quaternion = new THREE.Quaternion();
  if (length > 0) quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.divideScalar(length));
  return { position: start.clone().add(end).multiplyScalar(.5), length, quaternion };
}

class CircularRebarBend extends THREE.Curve<THREE.Vector3> {
  constructor(private center: THREE.Vector3, private radial: THREE.Vector3, private tangent: THREE.Vector3, private angle: number) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * this.angle;
    return target.copy(this.center).addScaledVector(this.radial, Math.cos(a)).addScaledVector(this.tangent, Math.sin(a));
  }
}

/** Circular fillets replace sharp polyline corners; adjacent bends never overlap. */
export function roundedRebarPath(points: THREE.Vector3[], radius: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const clean = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 1e-8);
  if (clean.length < 2) { path.add(new THREE.LineCurve3(clean[0] || new THREE.Vector3(), clean[0] || new THREE.Vector3())); return path; }
  let cursor = clean[0];
  for (let i = 1; i < clean.length - 1; i++) {
    const corner = clean[i], incoming = corner.clone().sub(clean[i - 1]), outgoing = clean[i + 1].clone().sub(corner);
    const lenIn = incoming.length(), lenOut = outgoing.length(); incoming.normalize(); outgoing.normalize();
    const cos = THREE.MathUtils.clamp(incoming.dot(outgoing), -1, 1), angle = Math.acos(cos);
    if (angle < 1e-5) continue;
    if (Math.PI - angle < 1e-5 || radius <= 0) { path.add(new THREE.LineCurve3(cursor, corner)); cursor = corner; continue; }
    const setback = Math.min(radius * Math.tan(angle / 2), lenIn * .45, lenOut * .45);
    const r = setback / Math.tan(angle / 2);
    const entry = corner.clone().addScaledVector(incoming, -setback), exit = corner.clone().addScaledVector(outgoing, setback);
    const normal = outgoing.clone().addScaledVector(incoming, -cos).normalize();
    const center = entry.clone().addScaledVector(normal, r);
    if (cursor.distanceTo(entry) > 1e-8) path.add(new THREE.LineCurve3(cursor, entry));
    path.add(new CircularRebarBend(center, entry.clone().sub(center), incoming.clone().multiplyScalar(r), angle));
    cursor = exit;
  }
  if (cursor.distanceTo(clean[clean.length - 1]) > 1e-8) path.add(new THREE.LineCurve3(cursor, clean[clean.length - 1]));
  return path;
}
