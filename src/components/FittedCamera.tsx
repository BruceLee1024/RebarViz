'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Point = [number, number, number];

/** Refit when the available workbench area or model dimensions change. */
export function FittedCamera({ targetPosition, initialPosition, center, bounds, smooth = false }: {
  targetPosition: Point | null; initialPosition: Point; center: Point; bounds: Point; smooth?: boolean;
}) {
  const { camera, size } = useThree();
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const [px, py, pz] = targetPosition ?? initialPosition;
  const [cx, cy, cz] = center;
  const [width, height, depth] = bounds;
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !size.height) return;
    const target = new THREE.Vector3(cx, cy, cz);
    const direction = new THREE.Vector3(px - cx, py - cy, pz - cz).normalize();
    const worldUp = Math.abs(direction.y) > .999 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(worldUp, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * size.width / size.height;
    let distance = 1;
    for (const x of [-width / 2, width / 2]) {
      for (const y of [-height / 2, height / 2]) {
        for (const z of [-depth / 2, depth / 2]) {
          const corner = new THREE.Vector3(x, y, z);
          distance = Math.max(distance, Math.abs(corner.dot(right)) / tanH + corner.dot(direction), Math.abs(corner.dot(up)) / tanV + corner.dot(direction));
        }
      }
    }
    const position = target.clone().addScaledVector(direction, distance * 1.22);
    if (smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) goal.current = { position, target };
    else { goal.current = null; camera.position.copy(position); camera.lookAt(target); }
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, px, py, pz, cx, cy, cz, width, height, depth, smooth]);
  useFrame((_, delta) => {
    const next = goal.current;
    if (!next) return;
    camera.position.lerp(next.position, 1 - Math.exp(-10 * Math.min(delta, .05)));
    camera.lookAt(next.target);
    if (camera.position.distanceToSquared(next.position) < .00001) { camera.position.copy(next.position); goal.current = null; }
  });
  return null;
}
