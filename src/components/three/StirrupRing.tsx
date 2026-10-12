'use client';

import { useEffect, useMemo, useState } from 'react';
import { continuousLineGeometry } from '@/lib/rebar-curve';
import type { RebarMeshInfo, RebarRenderMode } from '@/lib/types';
import { S, REBAR_MATERIAL } from '@/lib/constants';
import { CappedRebarTube } from './CappedRebarTube';
import { createCompositeStirrupCurves } from '@/lib/rebar-shapes';

const MIN_HIT_RADIUS = 0.045;

export interface StirrupRingProps {
  x: number;
  width: number;
  height: number;
  diameter: number;
  color: string;
  hiColor: string;
  info: RebarMeshInfo;
  selected: boolean;
  onSelect: (info: RebarMeshInfo | null) => void;
  cover: number; // 混凝土边缘到钢筋外表面的距离，非中心线距离
  legs?: number;
  cornerRadius?: number;
  barZPositions?: number[];
  renderMode?: RebarRenderMode;
}

/**
 * 箍筋环组件（含 135° 弯钩）
 * 22G101: 抗震箍筋弯钩 135°, 直段≥10d≥75mm
 */
export function StirrupRing({
  x,
  width,
  height,
  diameter,
  color,
  hiColor,
  info,
  selected,
  onSelect,
  cover,
  legs = 2,
  cornerRadius,
  barZPositions,
  renderMode = 'solid',
}: StirrupRingProps) {
  const [hovered, setHovered] = useState(false);

  const { hoops } = useMemo(() => {
    return createCompositeStirrupCurves({
      width,
      height,
      diameter,
      cornerRadius,
      legs,
      barPositions: barZPositions,
      plane: 'yz',
    });
  }, [width, height, diameter, cornerRadius, legs, barZPositions]);

  const activeColor = selected ? hiColor : hovered ? hiColor : color;
  const r = (diameter * S) / 2;
  const hitR = Math.max(r * 5, MIN_HIT_RADIUS);
  const showSolid = renderMode === 'solid' || (renderMode === 'hybrid' && (selected || hovered));
  const showCenterline = renderMode === 'centerline' || !showSolid;
  const lineGeometries = useMemo(() => hoops.map(hoop => continuousLineGeometry(hoop.fullCurve.getPoints(320))), [hoops]);
  useEffect(() => () => lineGeometries.forEach(geometry => geometry.dispose()), [lineGeometries]);

  return (
    <group
      position={[x, height / 2 + cover + r, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? null : info);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {hoops.map(({ fullCurve }, i) => <group key={i}>
        {showSolid && <CappedRebarTube curve={fullCurve} radius={r}>
          <meshStandardMaterial color={activeColor} roughness={REBAR_MATERIAL.roughness}
            metalness={REBAR_MATERIAL.metalness} emissive={selected ? hiColor : '#000000'}
            emissiveIntensity={selected ? .3 : 0} />
        </CappedRebarTube>}
        {showCenterline && <lineSegments geometry={lineGeometries[i]}>
          <lineBasicMaterial color={activeColor} transparent opacity={selected ? .95 : .62} />
        </lineSegments>}
        <mesh>
          <tubeGeometry args={[fullCurve, 160, hitR, 6, false]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>)}
    </group>
  );
}
