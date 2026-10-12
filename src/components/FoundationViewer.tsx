'use client';

import { foundationBeamReinforcement } from '@/lib/foundation-reinforcement';
import { CurvedRebar } from './three/CurvedRebar';
import { slabBarPositions } from '@/lib/slab-reinforcement';
import { orthogonalLayers } from '@/lib/reinforcement-layout';
import { FoundationInserts } from './three/FoundationInserts';
import { BentBarSet } from './three/BentBarSet';
import { FittedCamera } from './FittedCamera';

import { ViewerControls } from './ViewerControls';

import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

import { useFullscreen } from '@/lib/useFullscreen';
import * as THREE from 'three';
import type { FoundationParams, RebarMeshInfo } from '@/lib/types';
import { parseSlabRebar, parseRebar, parseStirrup, gradeLabel } from '@/lib/rebar';
import { calcLaE, calcLaTable } from '@/lib/anchor';
import { determineColFoundAnchor } from '@/lib/construction-rules';
import { InstancedRebarGroup, buildZBarMatrices, buildXBarMatrices } from '@/components/InstancedRebar';
import { StirrupRing } from '@/components/three';
import {
  S,
  COLOR_FOUND_BOTTOM_X, COLOR_FOUND_BOTTOM_X_HI,
  COLOR_FOUND_BOTTOM_Y, COLOR_FOUND_BOTTOM_Y_HI,
  COLOR_FOUND_COL, COLOR_FOUND_COL_HI,
  COLOR_FOUND_TOP_X, COLOR_FOUND_TOP_X_HI,
  COLOR_FOUND_TOP_Y, COLOR_FOUND_TOP_Y_HI,
  COLOR_FOUND_BEAM_STIRRUP, COLOR_FOUND_BEAM_STIRRUP_HI,
  COLOR_FOUND_BEAM_BOTTOM, COLOR_FOUND_BEAM_BOTTOM_HI,
  COLOR_FOUND_BEAM_TOP, COLOR_FOUND_BEAM_TOP_HI,
  FOUNDATION_CONSTRUCTION_STEPS,
  FOUNDATION_DUAL_COL_STEPS,
} from '@/lib/constants';

/* ─── Foundation 3D Scene (InstancedMesh optimized) ─── */
function TaperedConcrete({ params: p, opacity }: { params: FoundationParams; opacity: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const points = [-1, 1].flatMap(level => {
      const bx = (level < 0 ? p.bx : p.colBx) * S / 2;
      const by = (level < 0 ? p.by : p.colBy) * S / 2;
      const y = level < 0 ? 0 : p.h * S;
      return [-bx,y,-by, bx,y,-by, bx,y,by, -bx,y,by];
    });
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    g.setIndex([0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1, 1,5,6, 1,6,2, 2,6,7, 2,7,3, 3,7,4, 3,4,0]);
    g.computeVertexNormals(); return g;
  }, [p.bx,p.by,p.colBx,p.colBy,p.h]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group><mesh geometry={geometry}><meshPhysicalMaterial color="#BDC3C7" transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} roughness={.8} /></mesh><lineSegments><edgesGeometry args={[geometry]} /><lineBasicMaterial color="#94A3B8" /></lineSegments></group>;
}

function FoundationScene({ params, selected, onSelect, concreteOpacity, visibleGroups }: {
  params: FoundationParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void; concreteOpacity: number;
  visibleGroups: Set<string>;
}) {
  const cover = (params.cover || 40) * S;
  const coverMm = params.cover || 40;
  const barX = parseSlabRebar(params.bottomBarX);
  const barY = parseSlabRebar(params.bottomBarY);
  const colR = parseRebar(params.colMain);

  const isDual = (params.columnCount || 1) === 2;
  const topBarX = isDual && params.topBarX ? parseSlabRebar(params.topBarX) : null;
  const topBarY = isDual && params.topBarY ? parseSlabRebar(params.topBarY) : null;
  const hasFoundationBeam = isDual && !!params.hasFoundationBeam;
  const foundBeamStirrup = hasFoundationBeam ? parseStirrup(params.foundationBeamStirrup || 'A10@150(4)') : null;
  const foundBeamBottom = hasFoundationBeam ? parseRebar(params.foundationBeamBottom || '4C22') : null;
  const foundBeamTop = hasFoundationBeam ? parseRebar(params.foundationBeamTop || '4C20') : null;
  const beamEndType = params.foundationBeamEndType || 'none';
  const beamOverhangMm = params.foundationBeamOverhang || 300;
  const beamOverhangSide = params.foundationBeamOverhangSide || 'right';
  const topBandWidthMm = Math.min(params.topBandWidth || Math.max(params.colBy * 2, 1200), params.by - 2 * coverMm);
  const useShortX = !!params.shortenBottomBarX && params.by >= 2500;
  const useShortY = !!params.shortenBottomBarY && params.bx >= 2500;
  const laX = calcLaTable(barX.grade, barX.diameter, params.concreteGrade);
  const laY = calcLaTable(barY.grade, barY.diameter, params.concreteGrade);
  const needHookX = (params.by - params.colBy) / 2 < laX;
  const needHookY = (params.bx - params.colBx) / 2 < laY;

  // 22G101-3 column anchor
  const seismicGrade = params.seismicGrade || '三级';
  const laE = calcLaE(colR.grade, colR.diameter, params.concreteGrade, seismicGrade);
  const anchor = determineColFoundAnchor(params.h, coverMm, colR.diameter, laE);
  const anchorLabel = anchor.canStraight ? '直锚' : '弯锚';

  const barXInfo: RebarMeshInfo = { type: 'foundBottomX', label: 'X向底筋', detail: `${params.bottomBarX} · ${gradeLabel(barX.grade)} Φ${barX.diameter}@${barX.spacing}${useShortX ? ' · 隔一减短10%' : ''}` };
  const barYInfo: RebarMeshInfo = { type: 'foundBottomY', label: 'Y向底筋', detail: `${params.bottomBarY} · ${gradeLabel(barY.grade)} Φ${barY.diameter}@${barY.spacing}${useShortY ? ' · 隔一减短10%' : ''}` };
  const colInfo: RebarMeshInfo = { type: 'foundColMain', label: '柱插筋', detail: `${params.colMain} · ${colR.count}根 ${gradeLabel(colR.grade)} Φ${colR.diameter}${isDual ? ' ×2柱' : ''} · ${anchorLabel} 底弯${anchor.bendLength}mm` };
  const topXInfo: RebarMeshInfo | null = topBarX ? { type: 'foundTopX', label: '顶部纵向筋', detail: `${params.topBarX}${params.topBarXCount ? ` · ${params.topBarXCount}根` : ''} · ${gradeLabel(topBarX.grade)} Φ${topBarX.diameter}@${topBarX.spacing}` } : null;
  const topYInfo: RebarMeshInfo | null = topBarY ? { type: 'foundTopY', label: '顶部分布筋', detail: `${params.topBarY} · ${gradeLabel(topBarY.grade)} Φ${topBarY.diameter}@${topBarY.spacing} · 带宽${topBandWidthMm}mm` } : null;
  const beamTypeLabel = beamEndType === 'bothSides' ? 'JL(1B)' : beamEndType === 'oneSide' ? 'JL(1A)' : 'JL(1)';
  const beamStirrupInfo: RebarMeshInfo | null = foundBeamStirrup ? { type: 'foundBeamStirrup', label: '基础梁箍筋', detail: `${params.foundationBeamStirrup} · ${gradeLabel(foundBeamStirrup.grade)} Φ${foundBeamStirrup.diameter}` } : null;
  const beamBottomInfo: RebarMeshInfo | null = foundBeamBottom ? { type: 'foundBeamBottom', label: '基础梁底筋', detail: `${beamTypeLabel} · ${params.foundationBeamBottom} · ${gradeLabel(foundBeamBottom.grade)} Φ${foundBeamBottom.diameter}` } : null;
  const beamTopInfo: RebarMeshInfo | null = foundBeamTop ? { type: 'foundBeamTop', label: '基础梁顶筋', detail: `${beamTypeLabel} · ${params.foundationBeamTop} · ${gradeLabel(foundBeamTop.grade)} Φ${foundBeamTop.diameter}` } : null;

  const barXSelected = selected?.type === 'foundBottomX';
  const barYSelected = selected?.type === 'foundBottomY';
  const colSelected = selected?.type === 'foundColMain';
  const topXSelected = selected?.type === 'foundTopX';
  const topYSelected = selected?.type === 'foundTopY';
  const beamStirrupSelected = selected?.type === 'foundBeamStirrup';
  const beamBottomSelected = selected?.type === 'foundBeamBottom';
  const beamTopSelected = selected?.type === 'foundBeamTop';

  const concreteBlocks = useMemo(() => {
    if (params.shape === 'stepped') {
      const blocks: { bx: number; by: number; h: number; yOffset: number }[] = [];
      let yAcc = 0;
      for (const s of params.stepDims) {
        blocks.push({ bx: s.bx * S, by: s.by * S, h: s.h * S, yOffset: yAcc + s.h * S / 2 });
        yAcc += s.h * S;
      }
      return blocks;
    }
    return [];
  }, [params.shape, params.stepDims]);

  const totalH = params.h * S;
  const bxM = params.bx * S;
  const byM = params.by * S;
  const bottomLayers = orthogonalLayers(params.h, coverMm, barX.diameter, barY.diameter, 'bottom');
  const barXLevel = bottomLayers.x * S;
  const barYLevel = bottomLayers.y * S;
  const zStart = -byM / 2 + cover + barX.diameter * S / 2;
  const zEnd = byM / 2 - cover - barX.diameter * S / 2;
  const xStart = -bxM / 2 + cover + barY.diameter * S / 2;
  const xEnd = bxM / 2 - cover - barY.diameter * S / 2;
  const barLenZ = Math.abs(zEnd - zStart);
  const barLenX = Math.abs(xEnd - xStart);
  const shortBarLenZ = barLenZ * 0.9;
  const shortBarLenX = barLenX * 0.9;
  const shortZStart = -shortBarLenZ / 2;
  const shortZEnd = shortBarLenZ / 2;
  const shortXStart = -shortBarLenX / 2;
  const shortXEnd = shortBarLenX / 2;
  const topBandStartZ = -(topBandWidthMm * S) / 2;
  const topBandEndZ = (topBandWidthMm * S) / 2;
  const topForceStartX = isDual && params.colSpacing
    ? -(params.colSpacing * S + params.colBx * S) / 2
    : xStart;
  const topForceEndX = isDual && params.colSpacing
    ? (params.colSpacing * S + params.colBx * S) / 2
    : xEnd;
  const topForceLenX = Math.abs(topForceEndX - topForceStartX);
  const foundationBeamBM = (params.foundationBeamB || 600) * S;
  const foundationBeamHM = (params.foundationBeamH || 700) * S;
  const foundationBeamCenterY = totalH + foundationBeamHM / 2;
  const foundationBeamBaseLength = isDual && params.colSpacing
    ? params.colSpacing * S + params.colBx * S
    : Math.max((params.stepDims[params.stepDims.length - 1]?.bx || params.bx) * S, foundationBeamBM);
  const leftOverhangM = beamEndType === 'bothSides'
    ? beamOverhangMm * S
    : beamEndType === 'oneSide' && beamOverhangSide === 'left'
      ? beamOverhangMm * S
      : 0;
  const rightOverhangM = beamEndType === 'bothSides'
    ? beamOverhangMm * S
    : beamEndType === 'oneSide' && beamOverhangSide === 'right'
      ? beamOverhangMm * S
      : 0;
  const foundationBeamLength = foundationBeamBaseLength + leftOverhangM + rightOverhangM;
  const foundationBeamCenterX = (rightOverhangM - leftOverhangM) / 2;
  const foundationBeamStirrupDia = (foundBeamStirrup?.diameter || 10) * S;
  const foundationBeamStirrupWidth = Math.max(foundationBeamBM - 2 * cover - foundationBeamStirrupDia, foundationBeamBM * 0.2);
  const foundationBeamStirrupHeight = Math.max(foundationBeamHM - 2 * cover - foundationBeamStirrupDia, foundationBeamHM * 0.2);
  const columnStubH = Math.max(600, Math.max(params.colBx, params.colBy) * 1.2) * S;
  // Bottom bar matrices
  const { fullPositions: xBotFullPositions, shortPositions: xBotShortPositions } = useMemo(() => {
    const positions = slabBarPositions(params.bx, coverMm, barX.diameter, barX.spacing);
    const fullPositions = useShortX ? positions.filter((_, i) => i % 2 === 0) : positions;
    const shortPositions = useShortX ? positions.filter((_, i) => i % 2 === 1) : [];
    return {
      fullPositions,
      shortPositions,
    };
  }, [params.bx, coverMm, barX.diameter, barX.spacing, useShortX]);

  const { fullPositions: yBotFullPositions, shortPositions: yBotShortPositions } = useMemo(() => {
    const positions = slabBarPositions(params.by, coverMm, barY.diameter, barY.spacing);
    const fullPositions = useShortY ? positions.filter((_, i) => i % 2 === 0) : positions;
    const shortPositions = useShortY ? positions.filter((_, i) => i % 2 === 1) : [];
    return {
      fullPositions,
      shortPositions,
    };
  }, [params.by, coverMm, barY.diameter, barY.spacing, useShortY]);

  // Column centers
  const colCenters = useMemo(() => {
    if (!isDual || !params.colSpacing) return [{ cx: 0, cz: 0 }];
    const halfS = (params.colSpacing * S) / 2;
    return [{ cx: -halfS, cz: 0 }, { cx: halfS, cz: 0 }];
  }, [isDual, params.colSpacing]);

  // Top bar matrices (dual-column)
  const topXMatrices = useMemo(() => {
    if (!isDual || !topBarX || !params.colSpacing) return [];
    const positions = params.topBarXCount && params.topBarXCount > 0
      ? params.topBarXCount === 1 ? [0] : Array.from({ length: params.topBarXCount }, (_, i) => topBandStartZ + (topBandEndZ - topBandStartZ) * i / (params.topBarXCount! - 1))
      : Array.from({ length: Math.floor(topBandWidthMm / topBarX.spacing) + 1 }, (_, i) => topBandStartZ + i * topBarX.spacing * S);
    return buildXBarMatrices(positions, totalH - cover - topBarX.diameter * S / 2, topForceStartX, topForceEndX);
  }, [isDual, topBarX, params.colSpacing, params.topBarXCount, topBandWidthMm, topBandStartZ, topBandEndZ, totalH, cover, topForceStartX, topForceEndX]);

  const topYMatrices = useMemo(() => {
    if (!isDual || !topBarY || !params.colSpacing) return [];
    const regionW = (params.colSpacing - params.colBx);
    const count = Math.floor(regionW / topBarY.spacing) + 1;
    const startX = -(regionW * S) / 2;
    const positions = Array.from({ length: count }, (_, i) => startX + i * topBarY.spacing * S);
    const yLevel = totalH - cover - (topBarX?.diameter || 0) * S - topBarY.diameter * S / 2;
    return buildZBarMatrices(positions, yLevel, topBandStartZ, topBandEndZ);
  }, [isDual, topBarY, params.colSpacing, params.colBx, topBarX, totalH, cover, topBandStartZ, topBandEndZ]);

  const hookLenXM = needHookX ? 12 * barX.diameter * S : 0;
  const hookLenYM = needHookY ? 12 * barY.diameter * S : 0;

  const beamLayout = useMemo(() => foundationBeamReinforcement(params), [params]);
  const beamStirrupPositions = beamLayout.stirrupPositions;
  return (
    <>
      <mesh position={[0, totalH / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[bxM + 2, totalH + 2, byM + 2]} />
        <meshBasicMaterial />
      </mesh>

      {visibleGroups.has('concrete') && params.shape === 'tapered' && <TaperedConcrete params={params} opacity={concreteOpacity} />}
      {visibleGroups.has('concrete') && concreteBlocks.map((block, i) => (
        <group key={`cb${i}`}>
          <mesh position={[0, block.yOffset, 0]}>
            <boxGeometry args={[block.bx, block.h, block.by]} />
            <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[0, block.yOffset, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(block.bx, block.h, block.by)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
        </group>
      ))}

      {visibleGroups.has('concrete') && colCenters.map((c, ci) => (
        <group key={`col-outline-${ci}`}>
          <mesh position={[c.cx, totalH + columnStubH / 2, c.cz]}>
            <boxGeometry args={[params.colBx * S, columnStubH, params.colBy * S]} />
            <meshPhysicalMaterial color="#7F8C8D" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[c.cx, totalH + columnStubH / 2, c.cz]}>
            <edgesGeometry args={[new THREE.BoxGeometry(params.colBx * S, columnStubH, params.colBy * S)]} />
            <lineBasicMaterial color="#64748B" transparent opacity={0.65} />
          </lineSegments>
        </group>
      ))}

      {visibleGroups.has('concrete') && hasFoundationBeam && (
        <group>
          <mesh position={[foundationBeamCenterX, foundationBeamCenterY, 0]}>
            <boxGeometry args={[foundationBeamLength, foundationBeamHM, foundationBeamBM]} />
            <meshPhysicalMaterial color="#9EB6C8" transparent opacity={Math.min(concreteOpacity + 0.12, 0.55)} side={THREE.DoubleSide} depthWrite={false} roughness={0.75} />
          </mesh>
          <lineSegments position={[foundationBeamCenterX, foundationBeamCenterY, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(foundationBeamLength, foundationBeamHM, foundationBeamBM)]} />
            <lineBasicMaterial color="#607D8B" />
          </lineSegments>
        </group>
      )}

      <BentBarSet positions={xBotFullPositions} axis="z" start={zStart} end={zEnd} y={barXLevel} diameter={barX.diameter} bend={hookLenXM}
        color={COLOR_FOUND_BOTTOM_X} hiColor={COLOR_FOUND_BOTTOM_X_HI} info={barXInfo} selected={barXSelected} onSelect={onSelect} visible={visibleGroups.has('bottomX')} />
      <BentBarSet positions={xBotShortPositions} axis="z" start={shortZStart} end={shortZEnd} y={barXLevel} diameter={barX.diameter} bend={hookLenXM}
        color={COLOR_FOUND_BOTTOM_X} hiColor={COLOR_FOUND_BOTTOM_X_HI} info={barXInfo} selected={barXSelected} onSelect={onSelect} visible={visibleGroups.has('bottomX')} />
      <BentBarSet positions={yBotFullPositions} axis="x" start={xStart} end={xEnd} y={barYLevel} diameter={barY.diameter} bend={hookLenYM}
        color={COLOR_FOUND_BOTTOM_Y} hiColor={COLOR_FOUND_BOTTOM_Y_HI} info={barYInfo} selected={barYSelected} onSelect={onSelect} visible={visibleGroups.has('bottomY')} />
      <BentBarSet positions={yBotShortPositions} axis="x" start={shortXStart} end={shortXEnd} y={barYLevel} diameter={barY.diameter} bend={hookLenYM}
        color={COLOR_FOUND_BOTTOM_Y} hiColor={COLOR_FOUND_BOTTOM_Y_HI} info={barYInfo} selected={barYSelected} onSelect={onSelect} visible={visibleGroups.has('bottomY')} />

      {beamStirrupInfo && visibleGroups.has('beamStirrup') && (
        <group position={[0, totalH, 0]}>
          {beamStirrupPositions.map((x, i) => (
            <StirrupRing
              key={`found-beam-stirrup-${i}`}
              x={x}
              width={foundationBeamStirrupWidth}
              height={foundationBeamStirrupHeight}
              diameter={foundBeamStirrup!.diameter}
              color={COLOR_FOUND_BEAM_STIRRUP}
              hiColor={COLOR_FOUND_BEAM_STIRRUP_HI}
              info={beamStirrupInfo}
              selected={beamStirrupSelected}
              onSelect={onSelect}
              cover={cover + foundationBeamStirrupDia / 2}
              legs={foundBeamStirrup!.legs}
              barZPositions={beamLayout.bars.map(bar => bar.z)}
            />
          ))}
        </group>
      )}

      {beamLayout.bars.map((bar, i) => {
        const info = bar.role === 'top' ? beamTopInfo : beamBottomInfo;
        if (!info || !visibleGroups.has(bar.role === 'top' ? 'beamTop' : 'beamBottom')) return null;
        return <CurvedRebar key={`foundation-beam-${i}`} curve={bar.curve} position={[0, 0, bar.z]} diameter={bar.diameter}
          color={bar.role === 'top' ? COLOR_FOUND_BEAM_TOP : COLOR_FOUND_BEAM_BOTTOM}
          hiColor={bar.role === 'top' ? COLOR_FOUND_BEAM_TOP_HI : COLOR_FOUND_BEAM_BOTTOM_HI}
          info={{ ...info, detail: `${info.detail} · 第${bar.row+1}排 · L=${bar.lengthMm.toFixed(1)}mm` }}
          selected={bar.role === 'top' ? beamTopSelected : beamBottomSelected} onSelect={onSelect} />;
      })}

      <FoundationInserts main={params.colMain} width={params.colBx} depth={params.colBy} height={params.h}
        cover={coverMm} bottomDx={barX.diameter} bottomDy={barY.diameter} concrete={params.concreteGrade}
        seismic={params.seismicGrade || '非抗震'} centers={colCenters.map(c => ({ x: c.cx, z: c.cz }))}
        color={COLOR_FOUND_COL} hiColor={COLOR_FOUND_COL_HI}
        info={colInfo} selected={colSelected} onSelect={onSelect} visible={visibleGroups.has('colMain')} />

      {topXInfo && (
        <InstancedRebarGroup matrices={topXMatrices} radius={topBarX!.diameter * S / 2} length={topForceLenX}
          color={COLOR_FOUND_TOP_X} hiColor={COLOR_FOUND_TOP_X_HI}
          info={topXInfo} selected={topXSelected} onSelect={onSelect} visible={visibleGroups.has('topX')} />
      )}

      {topYInfo && (
        <InstancedRebarGroup matrices={topYMatrices} radius={topBarY!.diameter * S / 2} length={topBandWidthMm * S}
          color={COLOR_FOUND_TOP_Y} hiColor={COLOR_FOUND_TOP_Y_HI}
          info={topYInfo} selected={topYSelected} onSelect={onSelect} visible={visibleGroups.has('topY')} />
      )}
    </>
  );
}

function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    foundBottomX: 'bg-red-50 border-red-200 text-red-800',
    foundBottomY: 'bg-blue-50 border-blue-200 text-blue-800',
    foundColMain: 'bg-purple-50 border-purple-200 text-purple-800',
    foundTopX: 'bg-orange-50 border-orange-200 text-orange-800',
    foundTopY: 'bg-green-50 border-green-200 text-green-800',
    foundBeamStirrup: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    foundBeamBottom: 'bg-amber-50 border-amber-200 text-amber-900',
    foundBeamTop: 'bg-orange-50 border-orange-200 text-orange-800',
  };
  const cls = colorMap[info.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`absolute top-3 right-3 px-4 py-3 rounded-xl border text-sm shadow-lg backdrop-blur-sm z-10 max-w-xs ${cls}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="text-xs mt-1 opacity-80">{info.detail}</p>
    </div>
  );
}

export default function FoundationViewer({ params }: {
  params: FoundationParams;
}) {
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.15);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const { isFullscreen: fsActive, toggle: fsToggle, containerRef: fsContainerRef, containerClass: fsClass } = useFullscreen();
  const isDual = (params.columnCount || 1) === 2;
  const viewerMode = isDual ? 'dual' : 'single';
  const steps = isDual ? FOUNDATION_DUAL_COL_STEPS : FOUNDATION_CONSTRUCTION_STEPS;
  const [stepState, setStepState] = useState<{ mode: 'single' | 'dual'; index: number }>(() => ({
    mode: viewerMode,
    index: steps.length - 1,
  }));
  const stepIndex = stepState.mode === viewerMode ? stepState.index : steps.length - 1;

  const totalH = params.h * S;
  const visibleGroups = steps[Math.min(stepIndex, steps.length - 1)].groups;

  return (
    <div data-viewer className="rv-viewer">
      <div className="rv-viewer-toolbar flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
          {steps.map((s, i) => (
            <button key={i} onClick={() => setStepState({ mode: viewerMode, index: i })}
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all ${stepIndex === i ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-primary'}`}>
              {s.label}
            </button>
          ))}
        </div>
        {selected && (
          <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-muted cursor-pointer hover:bg-gray-200 transition-colors">
            取消选中
          </button>
        )}
      </div>

      <div ref={fsContainerRef} className={`rv-viewer-canvas relative w-full bg-surface overflow-hidden ${fsClass}`}>
        {selected && <InfoTooltip info={selected} />}

        <ViewerControls views={[
            { name: '正面', pos: [0, 1, 5] as [number, number, number] },
            { name: '侧面', pos: [5, 1, 0] as [number, number, number] },
            { name: '俯视', pos: [0, 5, 0.1] as [number, number, number] },
            { name: '透视', pos: [3, 2, 4] as [number, number, number] },
          ]} onView={setCameraTarget} opacity={concreteOpacity} onOpacity={setConcreteOpacity}
          fullscreen={fsActive} onFullscreen={fsToggle} />

        <Canvas camera={{ position: [3, 2, 4], fov: 45 }} scene={{ background: new THREE.Color('#071725') }}
          style={{ height: '100%' }}>
          <FittedCamera targetPosition={cameraTarget} initialPosition={[3, 2, 4]} center={[0, totalH / 2, 0]} bounds={[params.bx * S, totalH + 2, params.by * S]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <FoundationScene params={params} selected={selected} onSelect={setSelected}
            concreteOpacity={concreteOpacity} visibleGroups={visibleGroups} />
          <Grid args={[10, 10]} position={[0, -0.01, 0]} cellColor="#15384f" sectionColor="#215a72" fadeDistance={15} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, totalH / 2, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="rv-viewer-hints absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击钢筋查看详情
        </div>
      </div>
    </div>
  );
}
