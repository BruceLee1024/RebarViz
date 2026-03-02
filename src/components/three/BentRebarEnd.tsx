'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { S, REBAR_MATERIAL } from '@/lib/constants';

export interface BentRebarEndProps {
  position: [number, number, number];
  straightLen: number;
  bendLen: number;
  diameter: number;
  direction: 'down' | 'up';
  color: string;
  xDir?: number; // 1 = 向右伸入右柱, -1 = 向左伸入左柱
}

/**
 * 弯锚钢筋端部
 * 用于梁端锚固无法直锚时的 90° 弯折
 */
export function BentRebarEnd({
  position,
  straightLen,
  bendLen,
  diameter,
  direction,
  color,
  xDir = 1,
}: BentRebarEndProps) {
  const r = (diameter * S) / 2;

  const curve = useMemo(() => {
    const bendRadius = Math.min(4 * diameter * S, straightLen * 0.3);
    const linePart = Math.max(straightLen - bendRadius, 0);
    const pts: THREE.Vector3[] = [];

    // 水平直段（从梁端面伸入柱内）
    for (let t = 0; t <= 1; t += 0.1) {
      pts.push(new THREE.Vector3(xDir * t * linePart, 0, 0));
    }

    // 90° 弯折弧
    const sign = direction === 'down' ? -1 : 1;
    for (let a = 0; a <= Math.PI / 2; a += Math.PI / 20) {
      pts.push(
        new THREE.Vector3(
          xDir * (linePart + bendRadius * Math.sin(a)),
          sign * bendRadius * (1 - Math.cos(a)),
          0,
        ),
      );
    }

    // 竖直弯折段
    const bendEnd = new THREE.Vector3(xDir * (linePart + bendRadius), sign * bendRadius, 0);
    for (let t = 0.1; t <= 1; t += 0.1) {
      pts.push(new THREE.Vector3(bendEnd.x, bendEnd.y + sign * t * bendLen, 0));
    }

    return new THREE.CatmullRomCurve3(pts, false);
  }, [straightLen, bendLen, diameter, direction, xDir]);

  return (
    <mesh position={position}>
      <tubeGeometry args={[curve, 32, r, 8, false]} />
      <meshStandardMaterial
        color={color}
        roughness={REBAR_MATERIAL.roughness}
        metalness={REBAR_MATERIAL.metalness}
      />
    </mesh>
  );
}
