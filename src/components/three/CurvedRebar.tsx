'use client';

import { useMemo, useEffect, useState } from 'react';
import type * as THREE from 'three';
import type { RebarMeshInfo, RebarRenderMode } from '@/lib/types';
import { continuousLineGeometry } from '@/lib/rebar-curve';
import { CappedRebarTube } from './CappedRebarTube';

export function CurvedRebar({ curve, diameter, color, hiColor, info, selected, onSelect, position, rotation, renderMode = 'solid' }: {
  curve: THREE.Curve<THREE.Vector3>; diameter: number; color: string; hiColor?: string;
  info: RebarMeshInfo; selected: boolean; onSelect: (info: RebarMeshInfo | null) => void;
  position?: [number,number,number]; rotation?: [number,number,number]; renderMode?: RebarRenderMode;
}) {
  const [hovered,setHovered]=useState(false), active=selected||hovered;
  const solid=renderMode==='solid'||(renderMode==='hybrid'&&active);
  const geometry=useMemo(()=>continuousLineGeometry(curve.getPoints(160)),[curve]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <group position={position} rotation={rotation}
    onClick={e=>{e.stopPropagation();onSelect(selected?null:info);}}
    onPointerOver={e=>{e.stopPropagation();setHovered(true);document.body.style.cursor='pointer';}}
    onPointerOut={()=>{setHovered(false);document.body.style.cursor='auto';}}>
    {solid?<CappedRebarTube curve={curve} radius={diameter*.0005} segments={160}>
      <meshStandardMaterial color={active?(hiColor||color):color} roughness={.4} metalness={.6}
        emissive={selected?(hiColor||color):color} emissiveIntensity={selected?.3:.12}/>
    </CappedRebarTube>:<lineSegments geometry={geometry}><lineBasicMaterial color={color} transparent opacity={active?.95:.65}/></lineSegments>}
    <mesh><tubeGeometry args={[curve,64,Math.max(diameter*.0025,.025),6,false]}/><meshBasicMaterial transparent opacity={0} depthWrite={false}/></mesh>
  </group>;
}
