'use client';

import { useState, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { continuousLineGeometry } from '@/lib/rebar-curve';
import type { RebarMeshInfo, RebarRenderMode } from '@/lib/types';
import { CappedRebarTube } from './CappedRebarTube';
import { COLOR_TIEBAR, COLOR_TIEBAR_HI, REBAR_MATERIAL } from '@/lib/constants';

const MIN_HIT_RADIUS = 0.045;

export interface TieBarMeshProps {
  position: [number, number, number];
  curve: THREE.Curve<THREE.Vector3>;
  radius: number;
  info: RebarMeshInfo;
  selected: boolean;
  highlighted?: boolean;
  onSelect: (info: RebarMeshInfo | null) => void;
  renderMode?: RebarRenderMode;
}

/**
 * 可点击的拉筋管状网格
 */
export function TieBarMesh({
  position,
  curve,
  radius,
  info,
  selected,
  highlighted = false,
  onSelect,
  renderMode = 'solid',
}: TieBarMeshProps) {
  const [hovered, setHovered] = useState(false);
  const active = selected || hovered || highlighted;

  const activeColor = active ? COLOR_TIEBAR_HI : COLOR_TIEBAR;
  const emissiveIntensity = selected ? 0.3 : highlighted ? 0.16 : 0;
  const hitRadius = Math.max(radius * 5, MIN_HIT_RADIUS);
  const showSolid = renderMode === 'solid' || (renderMode === 'hybrid' && active);
  const lineGeometry = useMemo(() => continuousLineGeometry(curve.getPoints(160)), [curve]);
  useEffect(() => () => lineGeometry.dispose(), [lineGeometry]);

  return (
    <group
      position={position}
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
      {curve && (
        <>
          {showSolid && (
            <CappedRebarTube curve={curve} radius={radius} segments={160}>
              <meshStandardMaterial color={activeColor} roughness={REBAR_MATERIAL.roughness}
                metalness={REBAR_MATERIAL.metalness}
                emissive={selected || highlighted ? COLOR_TIEBAR_HI : '#000000'}
                emissiveIntensity={emissiveIntensity} />
            </CappedRebarTube>
          )}
          {!showSolid && (
            <lineSegments geometry={lineGeometry}>
              <lineBasicMaterial color={activeColor} transparent opacity={active ? .95 : .58} />
            </lineSegments>
          )}
          <mesh>
            <tubeGeometry args={[curve, 64, hitRadius, 6, false]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
