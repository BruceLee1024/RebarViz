'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

type Point = [number, number, number];

/** Refit when the available workbench area or model dimensions change. */
export function FittedCamera({ targetPosition, initialPosition, center, bounds }: {
  targetPosition: Point | null; initialPosition: Point; center: Point; bounds: Point;
}) {
  const { camera, size } = useThree();
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
    camera.position.copy(target).addScaledVector(direction, distance * 1.22);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, px, py, pz, cx, cy, cz, width, height, depth]);
  return null;
}
