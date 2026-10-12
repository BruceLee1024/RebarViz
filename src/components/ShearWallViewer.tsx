'use client';

import { wallDistributedReinforcement } from '@/lib/wall-reinforcement';
import { FittedCamera } from './FittedCamera';

import { ViewerControls } from './ViewerControls';

import { useMemo, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

import { useFullscreen } from '@/lib/useFullscreen';
import * as THREE from 'three';
import type { ShearWallParams, RebarMeshInfo } from '@/lib/types';
import { parseSlabRebar, parseRebar, parseStirrup, gradeLabel } from '@/lib/rebar';
import { S } from '@/lib/constants';
import { wallOpening, wallTiePositions } from '@/lib/quantity-geometry';
import { createTieBarCurves, staggerTiePositions } from '@/lib/rebar-shapes';
import { HoopProfile } from './three/HoopProfile';
import { TieBarMesh } from './three/TieBar';



function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    vertBar: 'bg-red-50 border-red-200 text-red-800',
    horizBar: 'bg-blue-50 border-blue-200 text-blue-800',
    boundaryMain: 'bg-purple-50 border-purple-200 text-purple-800',
    boundaryStirrup: 'bg-green-50 border-green-200 text-green-800',
    wallTieBar: 'bg-teal-50 border-teal-200 text-teal-800',
    wallOpeningRebar: 'bg-pink-50 border-pink-200 text-pink-800',
  };
  const cls = colorMap[info.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`absolute top-3 right-3 px-4 py-3 rounded-xl border text-sm shadow-lg backdrop-blur-sm z-10 max-w-xs ${cls}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="text-xs mt-1 opacity-80">{info.detail}</p>
    </div>
  );
}

function ShearWallScene({ params, selected, onSelect, cutPosition, concreteOpacity }: {
  params: ShearWallParams;
  selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void;
  cutPosition: number | null;
  concreteOpacity: number;
}) {
  const LW = params.lw * S;
  const BW = params.bw * S;
  const HW = params.hw * S;
  const COVER = params.cover * S;
  const vert = parseSlabRebar(params.vertBar);
  const horiz = parseSlabRebar(params.horizBar);
  const boundaryR = parseRebar(params.boundaryMain);
  const boundaryStir = parseStirrup(params.boundaryStirrup);
  const tie = params.tieBar ? parseSlabRebar(params.tieBar) : null;
  const openingVert = params.openingVertBar ? parseSlabRebar(params.openingVertBar) : null;
  const openingHoriz = params.openingHorizBar ? parseSlabRebar(params.openingHorizBar) : null;

  // Boundary element length: max(bw, 400mm)
  const BL = (params.boundaryLength || Math.max(params.bw, 400)) * S;
  const bottomStrengthenLen = Math.max(params.hw / 6, 500) * S;
  const boundaryProjection = (params.boundaryProjection || 0) * S;
  const boundaryTypeLabel = params.boundaryType === 'ybz'
    ? '约束边缘构件 YBZ'
    : params.boundaryType === 'fbz'
      ? '扶壁柱 FBZ'
      : params.boundaryType === 'az'
        ? '非边缘暗柱 AZ'
        : '构造边缘构件 GBZ';
  const boundaryForm = params.boundaryForm || 'concealed';
  const boundaryTint = params.boundaryType === 'ybz'
    ? '#8E44AD'
    : params.boundaryType === 'fbz'
      ? '#7C3AED'
      : params.boundaryType === 'az'
        ? '#6D28D9'
        : '#A855F7';
  const boundaryDepth = boundaryForm === 'concealed'
    ? BW
    : boundaryForm === 'endColumn'
      ? BW + Math.max(boundaryProjection, BW * 0.35)
      : boundaryForm === 'cornerWall'
        ? BW + Math.max(boundaryProjection, BW * 0.5)
        : BW + Math.max(boundaryProjection, BW * 0.2);
  const boundaryLengthGeom = boundaryForm === 'wingWall'
    ? BL * 1.35
    : boundaryForm === 'cornerWall'
      ? BL * 1.18
      : BL;
  const boundaryInnerLength = Math.max(boundaryLengthGeom - 2 * COVER, boundaryLengthGeom * 0.35);
  const boundaryInnerDepth = Math.max(boundaryDepth - 2 * COVER, Math.min(BW * 0.6, boundaryDepth));

  const vertInfo: RebarMeshInfo = { type: 'vertBar', label: '竖向分布筋', detail: `${params.vertBar} · ${gradeLabel(vert.grade)} Φ${vert.diameter}@${vert.spacing}，双排布置` };
  const horizInfo: RebarMeshInfo = { type: 'horizBar', label: '水平分布筋', detail: `${params.horizBar} · ${gradeLabel(horiz.grade)} Φ${horiz.diameter}@${horiz.spacing}，双排布置` };
  const boundaryMainInfo: RebarMeshInfo = { type: 'boundaryMain', label: '边缘构件纵筋', detail: `${boundaryTypeLabel} · ${params.boundaryMain} · ${boundaryR.count}根 ${gradeLabel(boundaryR.grade)} Φ${boundaryR.diameter}` };
  const boundaryStirInfo: RebarMeshInfo = { type: 'boundaryStirrup', label: '边缘构件箍筋', detail: `${boundaryTypeLabel} · ${params.boundaryStirrup} · ${gradeLabel(boundaryStir.grade)} Φ${boundaryStir.diameter}@${boundaryStir.spacingDense}` };
  const tieInfo: RebarMeshInfo | null = tie ? { type: 'wallTieBar', label: '拉结筋', detail: `${params.tieBar} · ${gradeLabel(tie.grade)} Φ${tie.diameter}@${tie.spacing}，连接双排分布筋` } : null;
  const openingInfo: RebarMeshInfo | null = params.hasOpening ? { type: 'wallOpeningRebar', label: '洞口补强筋', detail: `${params.openingWidth}×${params.openingHeight}洞口 · 侧边${params.openingVertBar || '未设'} · 上下${params.openingHorizBar || '未设'}` } : null;
  const hole = wallOpening(params)[0];
  const openingBox = hole ? { w: hole.x1 - hole.x0, h: hole.y1 - hole.y0, bottom: hole.y0, cx: (hole.x0 + hole.x1) / 2 } : null;
  const horizontalOffset = BW / 2 - COVER - horiz.diameter * S / 2;
  const tieDiameter = tie?.diameter || 6, horizDiameter = horiz.diameter, boundaryDiameter = boundaryStir.diameter;
  const tieCurve = useMemo(() => createTieBarCurves({ sideOffset: horizontalOffset, tieDiameter, sideBarDiameter: horizDiameter }).fullCurve, [horizontalOffset, tieDiameter, horizDiameter]);
  const openingLeft = openingBox ? openingBox.cx * S - (openingBox.w * S) / 2 : 0;
  const openingRight = openingBox ? openingBox.cx * S + (openingBox.w * S) / 2 : 0;
  const openingBottomY = openingBox ? openingBox.bottom * S : 0;
  const openingTopY = openingBox ? openingBottomY + openingBox.h * S : 0;

  const distributed = wallDistributedReinforcement(params);
  // Vertical distributed bars positions (two rows, front and back face)
  const vertBars = distributed.vertBars;

  // Horizontal distributed bars positions
  const horizBars = distributed.horizBars;

  const tieBars = wallTiePositions(params).map(p => ({ x: p.x * S, y: p.y * S }));

  // Boundary element rebar positions (both ends)
  const boundaryBars = (() => {
    const positions: { x: number; z: number; side: 'left' | 'right' }[] = [];
    const perSide = Math.max(Math.round(boundaryR.count / 2), 2);
    // Left boundary
    for (let i = 0; i < perSide; i++) {
      const x = -(LW / 2 - BL / 2) - boundaryInnerLength / 2 + boundaryStir.diameter * S + boundaryR.diameter * S / 2 + ((boundaryInnerLength - (2 * boundaryStir.diameter + boundaryR.diameter) * S) * i) / Math.max(perSide - 1, 1);
      positions.push({ x, z: boundaryInnerDepth / 2 - (boundaryStir.diameter + boundaryR.diameter / 2) * S, side: 'left' });
      positions.push({ x, z: -(boundaryInnerDepth / 2 - (boundaryStir.diameter + boundaryR.diameter / 2) * S), side: 'left' });
    }
    // Right boundary
    for (let i = 0; i < perSide; i++) {
      const x = (LW / 2 - BL / 2) + boundaryInnerLength / 2 - boundaryStir.diameter * S - boundaryR.diameter * S / 2 - ((boundaryInnerLength - (2 * boundaryStir.diameter + boundaryR.diameter) * S) * i) / Math.max(perSide - 1, 1);
      positions.push({ x, z: boundaryInnerDepth / 2 - (boundaryStir.diameter + boundaryR.diameter / 2) * S, side: 'right' });
      positions.push({ x, z: -(boundaryInnerDepth / 2 - (boundaryStir.diameter + boundaryR.diameter / 2) * S), side: 'right' });
    }
    return positions;
  })();

  const boundaryOuterBars = (() => {
    if ((boundaryForm !== 'wingWall' && boundaryForm !== 'cornerWall') || boundaryProjection <= 0) return [] as { x: number; z: number }[];
    const positions: { x: number; z: number }[] = [];
    const perSide = Math.max(Math.round(boundaryR.count / 2), 2);
    for (let i = 0; i < perSide; i++) {
      const xL = -LW / 2 + COVER + (boundaryInnerLength * i) / Math.max(perSide - 1, 1);
      const xR = LW / 2 - COVER - (boundaryInnerLength * i) / Math.max(perSide - 1, 1);
      const z = BW / 2 + boundaryProjection - COVER;
      positions.push({ x: xL, z });
      positions.push({ x: xR, z });
    }
    return positions;
  })();

  const boundaryOuterStirCurve = (boundaryForm === 'wingWall' || boundaryForm === 'cornerWall') && boundaryProjection > 0;
  const outerHoopWidth = Math.max((boundaryForm === 'wingWall' ? BL : BL * .75) - 2 * COVER - boundaryStir.diameter * S, .04);
  const outerHoopDepth = Math.max(boundaryProjection - 2 * COVER - boundaryStir.diameter * S, .04);
  const boundaryOuterTieLen = Math.max(BW / 2 + boundaryProjection - COVER - boundaryInnerDepth / 2, 0);
  const boundaryOuterTiePoints = (() => {
    if (!boundaryOuterStirCurve || boundaryOuterTieLen <= 0.02) return [] as { x: number; z: number }[];
    const offsets = boundaryForm === 'cornerWall'
      ? [-boundaryLengthGeom * 0.18, boundaryLengthGeom * 0.14]
      : [-boundaryLengthGeom * 0.22, 0, boundaryLengthGeom * 0.22];
    const z = boundaryInnerDepth / 2 + boundaryOuterTieLen / 2;
    return [-1, 1].flatMap(side => offsets.map(offset => ({
      x: side * (LW / 2 - BL / 2) + offset,
      z,
    })));
  })();

  const outerTieCurve = useMemo(() => createTieBarCurves({ sideOffset: boundaryOuterTieLen / 2, tieDiameter: boundaryDiameter, sideBarDiameter: boundaryDiameter }).fullCurve, [boundaryOuterTieLen, boundaryDiameter]);
  const wallBlocks = openingBox ? [
    { x: (-LW / 2 + openingLeft) / 2, y: HW / 2, w: openingLeft + LW / 2, h: HW },
    { x: (LW / 2 + openingRight) / 2, y: HW / 2, w: LW / 2 - openingRight, h: HW },
    { x: openingBox.cx * S, y: openingBottomY / 2, w: openingBox.w * S, h: openingBottomY },
    { x: openingBox.cx * S, y: (HW + openingTopY) / 2, w: openingBox.w * S, h: HW - openingTopY },
  ].filter(b => b.w > 0 && b.h > 0) : [{ x: 0, y: HW / 2, w: LW, h: HW }];

  const [hoveredType, setHoveredType] = useState<string | null>(null);

  const isSelected = (type: string) => selected?.type === type;
  const isHovered = (type: string) => hoveredType === type;

  const barColor = (type: string, base: string, hi: string) =>
    isSelected(type) ? hi : isHovered(type) ? hi : base;

  const handleClick = (e: ThreeEvent<MouseEvent>, info: RebarMeshInfo) => {
    e.stopPropagation();
    onSelect(isSelected(info.type) ? null : info);
  };

  const boundaryStirYs = (() => {
    const ys: number[] = [];
    const s = boundaryStir.spacingDense * S;
    for (let y = s; y < HW - 0.05; y += s) ys.push(y);
    const horizontalYs = Array.from({ length: Math.floor(HW / (horiz.spacing * S)) }, (_, i) => (i + 1) * horiz.spacing * S);
    return staggerTiePositions(ys, horizontalYs, (boundaryStir.diameter + horiz.diameter) * S / 2 + .002, .03, HW - .03);
  })();

  return (
    <>
      {/* Background click to deselect */}
      <mesh position={[0, HW / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[LW + 1, HW + 1, BW + 1]} />
        <meshBasicMaterial />
      </mesh>

      {/* Real opening: no concrete or opaque mask inside the hole. */}
      {wallBlocks.map((b, i) => <mesh key={`wall-${i}`} position={[b.x, b.y, 0]}>
        <boxGeometry args={[b.w, b.h, BW]} />
        <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
      </mesh>)}
      <lineSegments position={[0, HW / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(LW, HW, BW)]} />
        <lineBasicMaterial color="#94A3B8" />
      </lineSegments>

      {/* Boundary element highlight boxes */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * (LW / 2 - BL / 2), HW / 2, 0]}>
          <boxGeometry args={[boundaryLengthGeom, HW, boundaryDepth]} />
          <meshPhysicalMaterial color={boundaryTint} transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}

      {boundaryForm === 'wingWall' && boundaryProjection > 0 && [-1, 1].map(side => (
        <group key={`fbz-rib-${side}`}>
          <mesh position={[side * (LW / 2 - BL / 2), HW / 2, BW / 2 + boundaryProjection / 2]}>
            <boxGeometry args={[BL, HW, boundaryProjection]} />
            <meshPhysicalMaterial color={boundaryTint} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineSegments position={[side * (LW / 2 - BL / 2), HW / 2, BW / 2 + boundaryProjection / 2]}>
            <edgesGeometry args={[new THREE.BoxGeometry(BL, HW, boundaryProjection)]} />
            <lineBasicMaterial color={boundaryTint} transparent opacity={0.45} />
          </lineSegments>
        </group>
      ))}

      {boundaryForm === 'cornerWall' && boundaryProjection > 0 && [-1, 1].map(side => (
        <group key={`corner-rib-${side}`}>
          <mesh position={[side * (LW / 2 - BL / 2), HW / 2, BW / 2 + boundaryProjection / 2]}>
            <boxGeometry args={[BL * 0.75, HW, boundaryProjection]} />
            <meshPhysicalMaterial color={boundaryTint} transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ))}

      {boundaryForm === 'concealed' && boundaryProjection > 0 && [-1, 1].map(side => (
        <group key={`az-core-${side}`}>
          <mesh position={[side * (LW / 2 - BL / 2), HW / 2, 0]}>
            <boxGeometry args={[BL * 0.82, HW, Math.min(BW, boundaryProjection)]} />
            <meshPhysicalMaterial color={boundaryTint} transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, bottomStrengthenLen / 2, 0]}>
        <boxGeometry args={[LW * 1.01, bottomStrengthenLen, BW * 1.01]} />
        <meshBasicMaterial color="#22C55E" transparent opacity={0.05} depthWrite={false} />
      </mesh>

      {[-1, 1].map(side => (
        <mesh key={`boundary-bottom-zone-${side}`} position={[side * (LW / 2 - BL / 2), bottomStrengthenLen / 2, 0]}>
          <boxGeometry args={[boundaryLengthGeom * 1.02, bottomStrengthenLen, boundaryDepth * 1.02]} />
          <meshBasicMaterial color={boundaryTint} transparent opacity={0.06} depthWrite={false} />
        </mesh>
      ))}

      {boundaryOuterStirCurve && [-1, 1].map(side => (
        <mesh key={`boundary-outer-bottom-zone-${side}`} position={[side * (LW / 2 - BL / 2), bottomStrengthenLen / 2, BW / 2 + boundaryProjection / 2]}>
          <boxGeometry args={[boundaryForm === 'wingWall' ? BL * 1.02 : BL * 0.78, bottomStrengthenLen, boundaryProjection * 1.04]} />
          <meshBasicMaterial color={boundaryTint} transparent opacity={0.08} depthWrite={false} />
        </mesh>
      ))}

      {openingBox && (
        <group>
          <lineSegments position={[openingBox.cx * S, openingBottomY + (openingBox.h * S) / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(openingBox.w * S, openingBox.h * S, BW * 1.02)]} />
            <lineBasicMaterial color="#EC4899" transparent opacity={0.7} />
          </lineSegments>
        </group>
      )}

      {/* Vertical distributed bars */}
      {vertBars.map((p, i) => (
        <mesh key={`v${i}`} position={[p.x, p.yCenter, p.z]}
          onClick={(e) => handleClick(e, vertInfo)}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredType('vertBar'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[vert.diameter * S / 2, vert.diameter * S / 2, p.height, 8]} />
          <meshStandardMaterial color={barColor('vertBar', '#C0392B', '#E74C3C')} roughness={0.4} metalness={0.6}
            emissive={isSelected('vertBar') ? '#E74C3C' : '#000'} emissiveIntensity={isSelected('vertBar') ? 0.3 : 0} />
        </mesh>
      ))}

      {/* Horizontal distributed bars */}
      {horizBars.map((bar, i) => (
        <mesh key={`h${i}`} position={[bar.xCenter, bar.y, bar.z]} rotation={[0, 0, Math.PI / 2]}
          onClick={(e) => handleClick(e, horizInfo)}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredType('horizBar'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[horiz.diameter * S / 2, horiz.diameter * S / 2, bar.length, 8]} />
          <meshStandardMaterial color={barColor('horizBar', '#2980B9', '#3498DB')} roughness={0.4} metalness={0.6}
            emissive={isSelected('horizBar') ? '#3498DB' : '#000'} emissiveIntensity={isSelected('horizBar') ? 0.3 : 0} />
        </mesh>
      ))}

      {/* Boundary element main bars */}
      {boundaryBars.map((p, i) => (
        <mesh key={`b${i}`} position={[p.x, HW / 2, p.z]}
          onClick={(e) => handleClick(e, boundaryMainInfo)}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredType('boundaryMain'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[boundaryR.diameter * S / 2, boundaryR.diameter * S / 2, HW, 10]} />
          <meshStandardMaterial color={barColor('boundaryMain', '#8E44AD', '#9B59B6')} roughness={0.4} metalness={0.6}
            emissive={isSelected('boundaryMain') ? '#9B59B6' : '#000'} emissiveIntensity={isSelected('boundaryMain') ? 0.3 : 0} />
        </mesh>
      ))}

      {boundaryOuterBars.map((p, i) => (
        <mesh key={`bo${i}`} position={[p.x, HW / 2, p.z]}
          onClick={(e) => handleClick(e, boundaryMainInfo)}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredType('boundaryMain'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[boundaryR.diameter * S / 2, boundaryR.diameter * S / 2, HW, 10]} />
          <meshStandardMaterial color={barColor('boundaryMain', '#8E44AD', '#9B59B6')} roughness={0.4} metalness={0.6}
            emissive={isSelected('boundaryMain') ? '#9B59B6' : '#000'} emissiveIntensity={isSelected('boundaryMain') ? 0.3 : 0} />
        </mesh>
      ))}

      {/* Independent hoops and crossties retain their own hook ends. */}
      {[-1, 1].flatMap(side => boundaryStirYs.map((y, i) => (
        <group key={`bs${side}${i}`} position={[side * (LW / 2 - BL / 2), y, 0]} onClick={e => handleClick(e, boundaryStirInfo)}>
          <HoopProfile width={boundaryInnerLength - boundaryStir.diameter * S} height={boundaryInnerDepth - boundaryStir.diameter * S} diameter={boundaryStir.diameter} legs={boundaryStir.legs} plane="xz" color={barColor('boundaryStirrup', '#27AE60', '#2ECC71')} />
        </group>
      )))}
      {boundaryOuterStirCurve && [-1, 1].flatMap(side => boundaryStirYs.map((y, i) => (
        <group key={`bos${side}${i}`} position={[side * (LW / 2 - BL / 2), y + boundaryStir.diameter * S + .003, BW / 2 + boundaryProjection / 2]} onClick={e => handleClick(e, boundaryStirInfo)}>
          <HoopProfile width={outerHoopWidth} height={outerHoopDepth} diameter={boundaryStir.diameter} plane="xz" color={barColor('boundaryStirrup', '#27AE60', '#2ECC71')} />
        </group>
      )))}
      {boundaryOuterTiePoints.flatMap((point, pi) => boundaryStirYs.map((y, yi) => (
        <TieBarMesh key={`bot${pi}${yi}`} position={[point.x, y, point.z]} curve={outerTieCurve} radius={boundaryStir.diameter * S / 2} info={boundaryStirInfo} selected={isSelected('boundaryStirrup')} onSelect={onSelect} />
      )))}
      {tieInfo && tieBars.map((p, i) => (
        <TieBarMesh key={`tie-${i}`} position={[p.x, p.y, 0]} curve={tieCurve} radius={tie!.diameter * S / 2} info={tieInfo} selected={isSelected('wallTieBar')} onSelect={onSelect} />
      ))}

      {/* Opening reinforcement */}
      {openingInfo && openingVert && [openingLeft, openingRight].flatMap((x, xi) => [
        BW / 2 - COVER - openingVert.diameter * S / 2 - horiz.diameter * S,
        -(BW / 2 - COVER - openingVert.diameter * S / 2 - horiz.diameter * S),
      ].map((z, zi) => (
        <mesh key={`ov-${xi}-${zi}`} position={[x, (openingBottomY + openingTopY) / 2, z]}
          onClick={(e) => handleClick(e, openingInfo)}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredType('wallOpeningRebar'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[openingVert.diameter * S / 2, openingVert.diameter * S / 2, Math.max(openingTopY - openingBottomY, 0.02), 8]} />
          <meshStandardMaterial color={barColor('wallOpeningRebar', '#EC4899', '#F472B6')} roughness={0.4} metalness={0.6}
            emissive={isSelected('wallOpeningRebar') ? '#F472B6' : '#000'} emissiveIntensity={isSelected('wallOpeningRebar') ? 0.3 : 0} />
        </mesh>
      )))}
      {openingInfo && openingHoriz && [openingBottomY, openingTopY].flatMap((y, yi) => [
        BW / 2 - COVER - openingHoriz.diameter * S / 2,
        -(BW / 2 - COVER - openingHoriz.diameter * S / 2),
      ].map((z, zi) => (
        <mesh key={`oh-${yi}-${zi}`} position={[openingBox!.cx * S, y, z]} rotation={[0, 0, Math.PI / 2]}
          onClick={(e) => handleClick(e, openingInfo)}
          onPointerOver={(e) => { e.stopPropagation(); setHoveredType('wallOpeningRebar'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[openingHoriz.diameter * S / 2, openingHoriz.diameter * S / 2, Math.max(openingBox!.w * S, .02), 8]} />
          <meshStandardMaterial color={barColor('wallOpeningRebar', '#EC4899', '#F472B6')} roughness={0.4} metalness={0.6}
            emissive={isSelected('wallOpeningRebar') ? '#F472B6' : '#000'} emissiveIntensity={isSelected('wallOpeningRebar') ? 0.3 : 0} />
        </mesh>
      )))}

      {/* Cut plane */}
      {cutPosition !== null && (
        <group position={[0, cutPosition, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <planeGeometry args={[LW * 1.3, BW * 1.3]} />
            <meshBasicMaterial color="#3B82F6" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineLoop geometry={new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-LW * 0.65, -BW * 0.65, 0),
            new THREE.Vector3(LW * 0.65, -BW * 0.65, 0),
            new THREE.Vector3(LW * 0.65, BW * 0.65, 0),
            new THREE.Vector3(-LW * 0.65, BW * 0.65, 0),
          ])}>
            <lineBasicMaterial color="#2563EB" linewidth={2} />
          </lineLoop>
        </group>
      )}
    </>
  );
}

export default function ShearWallViewer({ params, cutPosition, showCut, onCutPositionChange, onShowCutChange }: {
  params: ShearWallParams;
  cutPosition: number | null;
  showCut: boolean;
  onCutPositionChange: (v: number | null) => void;
  onShowCutChange: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.15);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const { isFullscreen: fsActive, toggle: fsToggle, containerRef: fsContainerRef, containerClass: fsClass } = useFullscreen();
  const HW = params.hw * S;
  const camDist = Math.max(Math.max(params.lw, params.hw) * S * 0.85, 4.5);

  return (
    <div data-viewer className="rv-viewer">
      <div className="rv-viewer-toolbar flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { onShowCutChange(!showCut); if (showCut) onCutPositionChange(null); else onCutPositionChange(HW / 2); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${showCut ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-muted hover:bg-gray-50'}`}>
          {showCut ? '关闭剖切' : '剖切视图'}
        </button>
        {selected && (
          <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-muted cursor-pointer hover:bg-gray-200 transition-colors">
            取消选中
          </button>
        )}
      </div>

      {showCut && (
        <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-2">
          <span className="text-xs text-muted whitespace-nowrap">剖切高度</span>
          <input type="range" min={0.1} max={HW - 0.1} step={0.05} value={cutPosition ?? HW / 2}
            onChange={e => onCutPositionChange(parseFloat(e.target.value))} className="flex-1 accent-accent" />
          <span className="text-xs text-muted w-16 text-right">{((cutPosition ?? HW / 2) * 1000).toFixed(0)}mm</span>
        </div>
      )}

      <div ref={fsContainerRef} className={`rv-viewer-canvas relative w-full bg-surface overflow-hidden ${fsClass}`}>
        {selected && <InfoTooltip info={selected} />}

        <ViewerControls views={[
            { name: '正面', pos: [0, HW / 2, camDist] as [number, number, number] },
            { name: '侧面', pos: [camDist, HW / 2, 0] as [number, number, number] },
            { name: '俯视', pos: [0, camDist + HW * 0.2, 0.1] as [number, number, number] },
            { name: '透视', pos: [camDist * 0.75, HW * 0.6, camDist * 0.75] as [number, number, number] },
          ]} onView={setCameraTarget} opacity={concreteOpacity} onOpacity={setConcreteOpacity}
          fullscreen={fsActive} onFullscreen={fsToggle} />

        <Canvas camera={{ position: [camDist * 0.75, HW * 0.6, camDist * 0.75], fov: 45 }} scene={{ background: new THREE.Color('#071725') }}>
          <FittedCamera targetPosition={cameraTarget} initialPosition={[camDist * 0.75, HW * 0.6, camDist * 0.75]} center={[0, HW / 2, 0]} bounds={[params.lw * S, HW + .5, Math.max(params.bw * S, .6)]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <ShearWallScene params={params} selected={selected} onSelect={setSelected} cutPosition={cutPosition} concreteOpacity={concreteOpacity} />
          <Grid args={[20, 20]} position={[0, -0.01, 0]} cellColor="#15384f" sectionColor="#215a72" fadeDistance={20} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, HW / 2, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="rv-viewer-hints absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击钢筋查看详情
        </div>
      </div>
    </div>
  );
}
