'use client';

import type { ConcreteGrade, SeismicGrade } from '@/lib/anchor';
import { useMemo, useState } from 'react';
import { CappedRebarTube } from './CappedRebarTube';
import { foundationInsertSpec, insertPerimeter } from '@/lib/reinforcement-layout';
import { parseRebar } from '@/lib/rebar';
import type { RebarMeshInfo } from '@/lib/types';

/** Every insert is one rounded bar. Feet point away from each column centre. */
export function FoundationInserts({ main, width, depth, height, cover, bottomDx, bottomDy,
  concrete, seismic, centers, baseY = 0, minFootSurfaceMm = 0, color, hiColor, info, selected, onSelect, visible }: {
  main: string; width: number; depth: number; height: number; cover: number; bottomDx: number; bottomDy: number;
  concrete: ConcreteGrade; seismic: SeismicGrade; centers: { x: number; z: number }[]; baseY?: number; minFootSurfaceMm?: number;
  color: string; hiColor: string; info: RebarMeshInfo; selected: boolean;
  onSelect: (info: RebarMeshInfo | null) => void; visible: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const r = parseRebar(main);
  const positions = useMemo(() => insertPerimeter(main, width, depth, cover), [main, width, depth, cover]);
  const spec = useMemo(() => foundationInsertSpec(height, cover, r.diameter, bottomDx, bottomDy, r.grade, concrete, seismic, minFootSurfaceMm),
    [height, cover, r.diameter, bottomDx, bottomDy, r.grade, concrete, seismic, minFootSurfaceMm]);
  if (!visible) return null;
  return <group onClick={e => { e.stopPropagation(); onSelect(selected ? null : info); }}
    onPointerOver={e => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
    onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}>
    {centers.flatMap((c, ci) => positions.map((p, i) => {
      // Pick the nearest column face, including each column in a grid independently.
      const alongX = Math.abs(p.x) / Math.max(width, 1) >= Math.abs(p.z) / Math.max(depth, 1);
      const rotation = alongX ? (p.x >= 0 ? 0 : Math.PI) : (p.z >= 0 ? -Math.PI / 2 : Math.PI / 2);
      return <group key={`${ci}-${i}`} position={[c.x + p.x * .001, baseY, c.z + p.z * .001]} rotation={[0, rotation, 0]}>
        <CappedRebarTube curve={spec.curve} radius={r.diameter * .0005} segments={160}>
          <meshStandardMaterial color={selected || hovered ? hiColor : color} roughness={.4} metalness={.6}
            emissive={selected ? hiColor : color} emissiveIntensity={selected ? .3 : .12} />
        </CappedRebarTube>
      </group>;
    }))}
  </group>;
}
