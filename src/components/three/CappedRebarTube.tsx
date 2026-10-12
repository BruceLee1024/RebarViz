'use client';

import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Curve, Vector3 } from 'three';
import { cappedRebarGeometry } from '@/lib/rebar-curve';

export function CappedRebarTube({ curve, radius, segments = 280, children }: {
  curve: Curve<Vector3>;
  radius: number;
  segments?: number;
  children: ReactNode;
}) {
  const geometry = useMemo(() => cappedRebarGeometry(curve, segments, radius), [curve, segments, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}>{children}</mesh>;
}
