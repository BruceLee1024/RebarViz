'use client';

import { useMemo, useState, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import type { RebarMeshInfo, RebarRenderMode } from '@/lib/types';
import { S, REBAR_MATERIAL } from '@/lib/constants';
import { createBentAnchorCurve, continuousLineGeometry } from '@/lib/rebar-curve';

const MIN_HIT_RADIUS = 0.055;

export interface BentRebarEndProps {
  position: [number, number, number];
  straightLen: number;
  bendLen: number;
  diameter: number;
  direction: 'down' | 'up';
  horizontalAxis?: 'x' | 'z';
  color: string;
  hiColor?: string;
  info?: RebarMeshInfo;
  selected?: boolean;
  highlighted?: boolean;
  onSelect?: (info: RebarMeshInfo | null) => void;
  xDir?: number; // 1 = 向右伸入右柱, -1 = 向左伸入左柱
  renderMode?: RebarRenderMode;
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
  horizontalAxis = 'x',
  color,
  hiColor,
  info,
  selected = false,
  highlighted = false,
  onSelect,
  xDir = 1,
  renderMode = 'solid',
}: BentRebarEndProps) {
  const [hovered, setHovered] = useState(false);
  const r = (diameter * S) / 2;

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (onSelect && info) onSelect(selected ? null : info);
    },
    [selected, info, onSelect],
  );

  const activeColor = (selected || hovered || highlighted) && hiColor ? hiColor : color;

  const curve = useMemo(() => createBentAnchorCurve({
    straightLen, bendLen, diameter, direction, xDir, horizontalAxis,
  }), [straightLen, bendLen, diameter, direction, xDir, horizontalAxis]);

  const hitRadius = Math.max(r * 5, MIN_HIT_RADIUS);
  const showSolid = renderMode === 'solid' || (renderMode === 'hybrid' && (selected || hovered || highlighted));
  const showCenterline = renderMode === 'centerline' || !showSolid;
  const lineGeometry = useMemo(() => continuousLineGeometry(curve.getPoints(96)), [curve]);

  return (
    <group
      position={position}
      onClick={onSelect ? handleClick : undefined}
      onPointerOver={hiColor ? (e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      } : undefined}
      onPointerOut={hiColor ? () => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      } : undefined}
    >
      {showSolid && (
        <mesh>
          <tubeGeometry args={[curve, 96, r, 12, false]} />
          <meshStandardMaterial
            color={activeColor}
            roughness={REBAR_MATERIAL.roughness}
            metalness={REBAR_MATERIAL.metalness}
            emissive={(selected || highlighted) && hiColor ? hiColor : '#000000'}
            emissiveIntensity={selected ? 0.3 : highlighted ? 0.16 : 0}
          />
        </mesh>
      )}
      {showCenterline && (
        <lineSegments geometry={lineGeometry}>
          <lineBasicMaterial color={activeColor} transparent opacity={selected || highlighted ? 0.95 : 0.58} />
        </lineSegments>
      )}
      {onSelect && info && (
        <mesh>
          <tubeGeometry args={[curve, 32, hitRadius, 6, false]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
