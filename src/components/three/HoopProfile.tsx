'use client';

import { useMemo } from 'react';
import { createCompositeStirrupCurves } from '@/lib/rebar-shapes';
import { CappedRebarTube } from './CappedRebarTube';

/** Independent bent hoops; each has two offset 135° hook ends. */
export function HoopProfile({ width, height, diameter, color, plane, legs = 2 }: {
  width: number; height: number; diameter: number; color: string; plane: 'xz' | 'yz'; legs?: number;
}) {
  const { hoops } = useMemo(() => createCompositeStirrupCurves({ width, height, diameter, plane, legs }), [width, height, diameter, plane, legs]);
  return <>{hoops.map((hoop, i) => <CappedRebarTube key={i} curve={hoop.fullCurve} radius={diameter / 2000} segments={160}>
    <meshStandardMaterial color={color} roughness={.45} metalness={.35} />
  </CappedRebarTube>)}</>;
}
