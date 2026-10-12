'use client';

import { BentBarSet } from './three/BentBarSet';
import { stripDistributedPositions, stripTransverseStations } from '@/lib/quantity-geometry';
import { FittedCamera } from './FittedCamera';

import { ViewerControls } from './ViewerControls';

import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';

import * as THREE from 'three';
import type { StripFoundationParams, RebarMeshInfo, RebarInfo } from '@/lib/types';
import { parseSlabRebar, parseRebar, parseStirrup, gradeLabel } from '@/lib/rebar';
import { InstancedRebarGroup, buildXBarMatrices, buildZBarMatrices } from '@/components/InstancedRebar';
import { useFullscreen } from '@/lib/useFullscreen';
import { S } from '@/lib/constants';
import { resolveBarRowCounts } from '@/lib/layout';
import { StirrupRing } from '@/components/three';

const BEAM_ROW_GAP = 25 * S;

function rowOffsets(rebar: RebarInfo, innerWidthM: number): number[][] {
  const rowCounts = resolveBarRowCounts(rebar, innerWidthM);
  return rowCounts.map(count => {
    if (count <= 1) return [0];
    return Array.from({ length: count }, (_, i) => -innerWidthM / 2 + (innerWidthM * i) / (count - 1));
  });
}

function StripFoundationScene({
  params,
  selected,
  onSelect,
  concreteOpacity,
  visibleGroups,
}: {
  params: StripFoundationParams;
  selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void;
  concreteOpacity: number;
  visibleGroups: Set<string>;
}) {
  const cover = (params.cover || 40) * S;
  const lengthM = params.length * S;
  const widthM = params.width * S;
  const baseHM = params.h * S;
  const supportWidthM = params.supportWidth * S;
  const supportHM = params.supportHeight * S;

  const bottom = parseSlabRebar(params.bottomBar);
  const dist = parseSlabRebar(params.distBar);
  const top = params.topBar ? parseSlabRebar(params.topBar) : null;
  const topDist = params.topDistBar ? parseSlabRebar(params.topDistBar) : null;
  const jlBottom = params.jlBottom ? parseRebar(params.jlBottom) : null;
  const jlTop = params.jlTop ? parseRebar(params.jlTop) : null;
  const jlStirrup = params.jlStirrup ? parseStirrup(params.jlStirrup) : null;
  const jclBottom = params.jclBottom ? parseRebar(params.jclBottom) : null;
  const jclTop = params.jclTop ? parseRebar(params.jclTop) : null;
  const jclStirrup = params.jclStirrup ? parseStirrup(params.jclStirrup) : null;
  const localBottom = params.localBottomBar ? parseSlabRebar(params.localBottomBar) : null;
  const localTop = params.localTopBar ? parseSlabRebar(params.localTopBar) : null;

  const supportCenters = useMemo(() => (
    params.supportCount === 2 && params.supportSpacing
      ? [-params.supportSpacing * S / 2, params.supportSpacing * S / 2]
      : [0]
  ), [params.supportCount, params.supportSpacing]);
  const clearGapM = params.supportCount === 2 && params.supportSpacing
    ? Math.max((params.supportSpacing - params.supportWidth) * S, 0)
    : 0;
  const gapZoneCenterY = baseHM + Math.max(supportHM * 0.18, 0.06);
  const gapZoneHeight = Math.max(supportHM * 0.18, 0.06);
  const hasLocalOverride = !!params.hasLocalOverride && (params.localOverrideLength || 0) > 0;
  const localStartX = -lengthM / 2 + (params.localOverrideStart || 0) * S;
  const localEndX = Math.min(localStartX + (params.localOverrideLength || 0) * S, lengthM / 2);
  const localCenterX = (localStartX + localEndX) / 2;
  const localLenM = Math.max(localEndX - localStartX, 0);
  const jclCentersX = useMemo(() => {
    if (!params.hasJcl) return [];
    const count = params.jclCount || 1;
    const spacingM = (params.jclSpacing || 0) * S;
    if (count <= 1 || spacingM <= 0) return [0];
    const half = ((count - 1) * spacingM) / 2;
    return Array.from({ length: count }, (_, i) => -half + i * spacingM);
  }, [params.hasJcl, params.jclCount, params.jclSpacing]);
  const jclBM = (params.jclB || 0) * S;
  const jclHM = (params.jclH || 0) * S;
  const jlLeftOverhangM = params.jlEndType === 'bothSides' ? (params.jlOverhang || 0) * S : params.jlEndType === 'oneSide' && params.jlOverhangSide === 'left' ? (params.jlOverhang || 0) * S : 0;
  const jlRightOverhangM = params.jlEndType === 'bothSides' ? (params.jlOverhang || 0) * S : params.jlEndType === 'oneSide' && params.jlOverhangSide === 'right' ? (params.jlOverhang || 0) * S : 0;
  const jlBeamLengthM = lengthM + jlLeftOverhangM + jlRightOverhangM;
  const jlBeamCenterX = (jlRightOverhangM - jlLeftOverhangM) / 2;
  const jlBarStartX = jlBeamCenterX - jlBeamLengthM / 2 + cover;
  const jlBarEndX = jlBeamCenterX + jlBeamLengthM / 2 - cover;
  const jclNegOverhangM = params.jclEndType === 'bothSides' ? (params.jclOverhang || 0) * S : params.jclEndType === 'oneSide' && params.jclOverhangSide === 'left' ? (params.jclOverhang || 0) * S : 0;
  const jclPosOverhangM = params.jclEndType === 'bothSides' ? (params.jclOverhang || 0) * S : params.jclEndType === 'oneSide' && params.jclOverhangSide === 'right' ? (params.jclOverhang || 0) * S : 0;
  const jclBeamLengthM = widthM + jclNegOverhangM + jclPosOverhangM;
  const jclBeamCenterZ = (jclPosOverhangM - jclNegOverhangM) / 2;
  const jclBarStartZ = jclBeamCenterZ - jclBeamLengthM / 2 + cover;
  const jclBarEndZ = jclBeamCenterZ + jclBeamLengthM / 2 - cover;

  const xStart = -lengthM / 2 + cover;
  const xEnd = lengthM / 2 - cover;
  const zStart = -widthM / 2 + cover;
  const zEnd = widthM / 2 - cover;

  const bottomStations=useMemo(()=>stripTransverseStations(params,'bottom'),[params]);
  const topStations=useMemo(()=>stripTransverseStations(params,'top'),[params]);
  const bottomMatrices = useMemo(() => buildZBarMatrices(bottomStations.base.map(x=>x*S),cover+bottom.diameter*S/2,zStart,zEnd),[bottomStations,cover,bottom.diameter,zStart,zEnd]);

  const distMatrices = useMemo(() => buildXBarMatrices(stripDistributedPositions(params).map(z=>z*S),cover+bottom.diameter*S+dist.diameter*S/2,xStart,xEnd),[params,cover,bottom.diameter,dist.diameter,xStart,xEnd]);

  const topMatrices = useMemo(() => !top||clearGapM<=0?[]:buildZBarMatrices(topStations.base.map(x=>x*S),baseHM-cover-top.diameter*S/2,-clearGapM/2,clearGapM/2),[top,clearGapM,topStations,baseHM,cover]);

  const topDistMatrices = useMemo(() => {
    if (!topDist || clearGapM <= 0) return [];
    const count = Math.max(Math.floor(clearGapM / (topDist.spacing * S)) + 1, 1);
    const positions = Array.from({ length: count }, (_, i) => -clearGapM / 2 + (count > 1 ? clearGapM * i / (count - 1) : clearGapM / 2));
    return buildXBarMatrices(positions, baseHM - cover - (top?.diameter || 0) * S - topDist.diameter * S / 2, xStart, xEnd);
  }, [topDist, clearGapM, baseHM, cover, top, xStart, xEnd]);

  const jlBottomRowOffsets = useMemo(() => {
    if (!jlBottom) return [];
    const usable = Math.max(supportWidthM - 2 * cover - (2 * (jlStirrup?.diameter || 0) + Math.max(jlBottom?.diameter || 0, jlTop?.diameter || 0)) * S, 0);
    return rowOffsets(jlBottom, usable);
  }, [jlBottom, jlStirrup?.diameter, jlTop?.diameter, supportWidthM, cover]);

  const jlTopRowOffsets = useMemo(() => {
    if (!jlTop) return [];
    const usable = Math.max(supportWidthM - 2 * cover - (2 * (jlStirrup?.diameter || 0) + Math.max(jlBottom?.diameter || 0, jlTop?.diameter || 0)) * S, 0);
    return rowOffsets(jlTop, usable);
  }, [jlTop, jlBottom?.diameter, jlStirrup?.diameter, supportWidthM, cover]);

  const jlTopMatrices = useMemo(() => {
    if (!jlTop || params.supportType !== 'beam') return [];
    return jlTopRowOffsets.flatMap((row, rowIdx) => {
      const yLevel = baseHM + supportHM - cover - (jlStirrup?.diameter || 0) * S - jlTop.diameter * S / 2 - rowIdx * (jlTop.diameter * S + BEAM_ROW_GAP);
      const zPositions = supportCenters.flatMap(center => row.map(offset => center + offset));
      return buildXBarMatrices(zPositions, yLevel, jlBarStartX, jlBarEndX);
    });
  }, [jlTop, jlStirrup?.diameter, params.supportType, jlTopRowOffsets, baseHM, supportHM, cover, supportCenters, jlBarStartX, jlBarEndX]);

  const jlStirrupPositions = useMemo(() => {
    if (!jlStirrup || params.supportType !== 'beam') return [];
    const spacingM = Math.min(jlStirrup.spacingDense, jlStirrup.spacingNormal) * S;
    const count = Math.max(Math.floor((jlBarEndX - jlBarStartX) / spacingM) + 1, 2);
    return Array.from({ length: count }, (_, i) => jlBarStartX + i * spacingM).filter(x => x <= jlBarEndX + 1e-6);
  }, [jlStirrup, params.supportType, jlBarStartX, jlBarEndX]);

  const jclBottomRowOffsets = useMemo(() => {
    if (!jclBottom || !params.jclB) return [];
    const usable = Math.max(params.jclB * S - 2 * cover - (2 * (jclStirrup?.diameter || 0) + Math.max(jclBottom?.diameter || 0, jclTop?.diameter || 0)) * S, 0);
    return rowOffsets(jclBottom, usable);
  }, [jclBottom, jclTop?.diameter, jclStirrup?.diameter, params.jclB, cover]);

  const jclTopRowOffsets = useMemo(() => {
    if (!jclTop || !params.jclB) return [];
    const usable = Math.max(params.jclB * S - 2 * cover - (2 * (jclStirrup?.diameter || 0) + Math.max(jclBottom?.diameter || 0, jclTop?.diameter || 0)) * S, 0);
    return rowOffsets(jclTop, usable);
  }, [jclTop, jclBottom?.diameter, jclStirrup?.diameter, params.jclB, cover]);

  const jclTopMatrices = useMemo(() => {
    if (!params.hasJcl || !jclTop || !params.jclH) return [];
    return jclTopRowOffsets.flatMap((row, rowIdx) => {
      const yLevel = baseHM + jclHM - cover - (jclStirrup?.diameter || 0) * S - jclTop.diameter * S / 2 - (jlTop ? (jlTop.diameter + jclTop.diameter) * S / 2 + .002 : 0) - rowIdx * (jclTop.diameter * S + BEAM_ROW_GAP);
      const xPositions = jclCentersX.flatMap(center => row.map(offset => center + offset));
      return buildZBarMatrices(xPositions, yLevel, jclBarStartZ, jclBarEndZ);
    });
  }, [params.hasJcl, params.jclH, jclTop, jclStirrup?.diameter, jlTop, jclHM, jclCentersX, jclTopRowOffsets, baseHM, cover, jclBarStartZ, jclBarEndZ]);

  const jclStirrupPositions = useMemo(() => {
    if (!params.hasJcl || !jclStirrup) return [];
    const spacingM = Math.min(jclStirrup.spacingDense, jclStirrup.spacingNormal) * S;
    const count = Math.max(Math.floor((jclBarEndZ - jclBarStartZ) / spacingM) + 1, 2);
    return Array.from({ length: count }, (_, i) => jclBarStartZ + i * spacingM).filter(z => z <= jclBarEndZ + 1e-6);
  }, [params.hasJcl, jclStirrup, jclBarStartZ, jclBarEndZ]);

  const localBottomMatrices=useMemo(()=>!localBottom?[]:buildZBarMatrices(bottomStations.local.map(x=>x*S),cover+localBottom.diameter*S/2,zStart,zEnd),[localBottom,bottomStations,cover,zStart,zEnd]);
  const localTopMatrices=useMemo(()=>!localTop?[]:buildZBarMatrices(topStations.local.map(x=>x*S),baseHM-cover-localTop.diameter*S/2,clearGapM>0?-clearGapM/2:zStart,clearGapM>0?clearGapM/2:zEnd),[localTop,topStations,baseHM,cover,clearGapM,zStart,zEnd]);

  const bottomInfo: RebarMeshInfo = { type: 'stripBottom', label: '底部横向受力筋', detail: `${params.bottomBar} · ${gradeLabel(bottom.grade)} Φ${bottom.diameter}@${bottom.spacing}` };
  const distInfo: RebarMeshInfo = { type: 'stripDist', label: '底部分布筋', detail: `${params.distBar} · ${gradeLabel(dist.grade)} Φ${dist.diameter}@${dist.spacing}` };
  const topInfo: RebarMeshInfo | null = top ? { type: 'stripTop', label: '顶部横向受力筋', detail: `${params.topBar} · ${gradeLabel(top.grade)} Φ${top.diameter}@${top.spacing}` } : null;
  const topDistInfo: RebarMeshInfo | null = topDist ? { type: 'stripTopDist', label: '顶部分布筋', detail: `${params.topDistBar} · ${gradeLabel(topDist.grade)} Φ${topDist.diameter}@${topDist.spacing}` } : null;
  const jlBottomInfo: RebarMeshInfo | null = jlBottom ? { type: 'stripJlBottom', label: 'JL底部纵筋', detail: `${params.jlBottom} · ${gradeLabel(jlBottom.grade)} Φ${jlBottom.diameter}` } : null;
  const jlTopInfo: RebarMeshInfo | null = jlTop ? { type: 'stripJlTop', label: 'JL顶部纵筋', detail: `${params.jlTop} · ${gradeLabel(jlTop.grade)} Φ${jlTop.diameter}` } : null;
  const jlStirrupInfo: RebarMeshInfo | null = jlStirrup ? { type: 'stripJlStirrup', label: 'JL箍筋', detail: `${params.jlStirrup} · ${gradeLabel(jlStirrup.grade)} Φ${jlStirrup.diameter}` } : null;
  const jclBottomInfo: RebarMeshInfo | null = jclBottom ? { type: 'stripJclBottom', label: 'JCL底部纵筋', detail: `${params.jclBottom} · ${gradeLabel(jclBottom.grade)} Φ${jclBottom.diameter}` } : null;
  const jclTopInfo: RebarMeshInfo | null = jclTop ? { type: 'stripJclTop', label: 'JCL顶部纵筋', detail: `${params.jclTop} · ${gradeLabel(jclTop.grade)} Φ${jclTop.diameter}` } : null;
  const jclStirrupInfo: RebarMeshInfo | null = jclStirrup ? { type: 'stripJclStirrup', label: 'JCL箍筋', detail: `${params.jclStirrup} · ${gradeLabel(jclStirrup.grade)} Φ${jclStirrup.diameter}` } : null;
  const overrideInfo: RebarMeshInfo | null = hasLocalOverride ? { type: 'stripOverride', label: '原位修正段', detail: `${params.localOverrideNote || '原位修正'} · 起点${params.localOverrideStart || 0}mm · 长度${params.localOverrideLength || 0}mm · 底筋${params.localBottomBar || '—'} · 顶筋${params.localTopBar || '—'}` } : null;

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 5]} intensity={1.2} castShadow />
      <Grid args={[16, 16]} cellSize={0.5} cellThickness={0.6} sectionSize={2} sectionThickness={1.1} fadeDistance={18} fadeStrength={1} />

      <mesh position={[0, baseHM / 2, 0]}>
        <boxGeometry args={[lengthM, baseHM, widthM]} />
        <meshStandardMaterial color="#D5DBE3" transparent opacity={concreteOpacity} />
      </mesh>
      <lineSegments position={[0, baseHM / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(lengthM, baseHM, widthM)]} />
        <lineBasicMaterial color="#94A3B8" opacity={0.6} transparent />
      </lineSegments>

      {supportCenters.map((z, idx) => (
        <group key={idx} position={[jlBeamCenterX, baseHM + supportHM / 2, z]}>
          <mesh>
            <boxGeometry args={[jlBeamLengthM, supportHM, supportWidthM]} />
            <meshStandardMaterial color={params.supportType === 'beam' ? '#AAB4C3' : '#B8C2D9'} transparent opacity={Math.min(concreteOpacity + 0.12, 0.65)} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(jlBeamLengthM, supportHM, supportWidthM)]} />
            <lineBasicMaterial color="#64748B" opacity={0.75} transparent />
          </lineSegments>
        </group>
      ))}

      {params.supportCount === 2 && clearGapM > 0 && visibleGroups.has('top') && (
        <group position={[0, gapZoneCenterY, 0]}>
          <mesh>
            <boxGeometry args={[lengthM * 0.98, gapZoneHeight, clearGapM]} />
            <meshStandardMaterial color="#F59E0B" transparent opacity={0.1} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(lengthM * 0.98, gapZoneHeight, clearGapM)]} />
            <lineBasicMaterial color="#D97706" transparent opacity={0.45} />
          </lineSegments>
        </group>
      )}

      {params.hasJcl && params.jclB && params.jclH && jclCentersX.map((x, idx) => (
        <group key={`jcl-${idx}`} position={[x, baseHM + jclHM / 2, jclBeamCenterZ]}>
          <mesh>
            <boxGeometry args={[jclBM, jclHM, jclBeamLengthM]} />
            <meshStandardMaterial color="#9FB6C8" transparent opacity={Math.min(concreteOpacity + 0.12, 0.6)} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(jclBM, jclHM, jclBeamLengthM)]} />
            <lineBasicMaterial color="#607D8B" opacity={0.75} transparent />
          </lineSegments>
        </group>
      ))}

      {overrideInfo && visibleGroups.has('override') && localLenM > 0 && (
        <group position={[localCenterX, baseHM - 0.01, 0]} onClick={() => onSelect(selected?.type === 'stripOverride' ? null : overrideInfo)}>
          <mesh>
            <boxGeometry args={[localLenM, Math.max(baseHM * 0.22, 0.04), widthM * 0.96]} />
            <meshStandardMaterial color="#EC4899" transparent opacity={selected?.type === 'stripOverride' ? 0.22 : 0.14} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(localLenM, Math.max(baseHM * 0.22, 0.04), widthM * 0.96)]} />
            <lineBasicMaterial color="#BE185D" opacity={0.65} transparent />
          </lineSegments>
        </group>
      )}

      <InstancedRebarGroup
        matrices={bottomMatrices}
        radius={bottom.diameter * S / 2}
        length={Math.max(zEnd - zStart, 0)}
        color="#C0392B"
        hiColor="#E74C3C"
        info={bottomInfo}
        selected={selected?.type === 'stripBottom'}
        onSelect={onSelect}
        visible={visibleGroups.has('bottom')}
      />

      <InstancedRebarGroup
        matrices={distMatrices}
        radius={dist.diameter * S / 2}
        length={Math.max(xEnd - xStart, 0)}
        color="#2980B9"
        hiColor="#3498DB"
        info={distInfo}
        selected={selected?.type === 'stripDist'}
        onSelect={onSelect}
        visible={visibleGroups.has('dist')}
      />

      {topInfo && (
        <InstancedRebarGroup
          matrices={topMatrices}
          radius={top!.diameter * S / 2}
          length={clearGapM}
          color="#E67E22"
          hiColor="#F39C12"
          info={topInfo}
          selected={selected?.type === 'stripTop'}
          onSelect={onSelect}
          visible={visibleGroups.has('top')}
        />
      )}

      {topDistInfo && (
        <InstancedRebarGroup
          matrices={topDistMatrices}
          radius={topDist!.diameter * S / 2}
          length={Math.max(xEnd - xStart, 0)}
          color="#27AE60"
          hiColor="#2ECC71"
          info={topDistInfo}
          selected={selected?.type === 'stripTopDist'}
          onSelect={onSelect}
          visible={visibleGroups.has('topDist')}
        />
      )}

      {jlBottomInfo && jlBottomRowOffsets.map((row,rowIdx)=>{
        const y=baseHM+cover+(jlStirrup?.diameter||0)*S+jlBottom!.diameter*S/2+rowIdx*(jlBottom!.diameter*S+BEAM_ROW_GAP);
        const bend=Math.max(jlBottom!.diameter*12*S,.12);
        return <BentBarSet key={`jl-bottom-row-${rowIdx}`} positions={supportCenters.flatMap(center=>row.map(offset=>center+offset))} axis="x" start={jlBarStartX} end={jlBarEndX} y={y} diameter={jlBottom!.diameter}
          bend={rowIdx===0&&(params.jlEndType==='bothSides'||params.jlEndType==='oneSide'&&params.jlOverhangSide==='left')?bend:0}
          rightBend={rowIdx===0&&(params.jlEndType==='bothSides'||params.jlEndType==='oneSide'&&params.jlOverhangSide!=='left')?bend:0}
          color="#8B4513" hiColor="#A65B2A" info={jlBottomInfo} selected={selected?.type==='stripJlBottom'} onSelect={onSelect} visible={visibleGroups.has('jlBottom')} />;
      })}

      {jlTopInfo && (
        <InstancedRebarGroup
          matrices={jlTopMatrices}
          radius={jlTop!.diameter * S / 2}
          length={Math.max(jlBarEndX - jlBarStartX, 0)}
          color="#C97B36"
          hiColor="#E09A45"
          info={jlTopInfo}
          selected={selected?.type === 'stripJlTop'}
          onSelect={onSelect}
          visible={visibleGroups.has('jlTop')}
        />
      )}

      {jlStirrupInfo && visibleGroups.has('jlStirrup') && supportCenters.map((center, beamIdx) => (
        <group key={`jl-stirrup-group-${beamIdx}`} position={[0, baseHM, center]}>
          {jlStirrupPositions.map((x, i) => (
            <StirrupRing
              key={`jl-stirrup-${beamIdx}-${i}`}
              x={x}
              width={Math.max(supportWidthM - 2 * cover - jlStirrup!.diameter * S, supportWidthM * 0.2)}
              height={Math.max(supportHM - 2 * cover - jlStirrup!.diameter * S, supportHM * 0.2)}
              diameter={jlStirrup!.diameter}
              color="#2E8B57"
              hiColor="#34A06A"
              info={jlStirrupInfo}
              selected={selected?.type === 'stripJlStirrup'}
              onSelect={onSelect}
              cover={cover}
              legs={jlStirrup!.legs}
            />
          ))}
        </group>
      ))}

      {jclBottomInfo && jclBottomRowOffsets.map((row,rowIdx)=>{
        const y=baseHM+cover+(jclStirrup?.diameter||0)*S+jclBottom!.diameter*S/2+(jlBottom?(jlBottom.diameter+jclBottom!.diameter)*S/2+.002:0)+rowIdx*(jclBottom!.diameter*S+BEAM_ROW_GAP);
        const bend=Math.max(jclBottom!.diameter*12*S,.12);
        return <BentBarSet key={`jcl-bottom-row-${rowIdx}`} positions={jclCentersX.flatMap(center=>row.map(offset=>center+offset))} axis="z" start={jclBarStartZ} end={jclBarEndZ} y={y} diameter={jclBottom!.diameter}
          bend={rowIdx===0&&(params.jclEndType==='bothSides'||params.jclEndType==='oneSide'&&params.jclOverhangSide==='left')?bend:0}
          rightBend={rowIdx===0&&(params.jclEndType==='bothSides'||params.jclEndType==='oneSide'&&params.jclOverhangSide!=='left')?bend:0}
          color="#6B3F2A" hiColor="#8A5A40" info={jclBottomInfo} selected={selected?.type==='stripJclBottom'} onSelect={onSelect} visible={visibleGroups.has('jclBottom')} />;
      })}

      {jclTopInfo && (
        <InstancedRebarGroup
          matrices={jclTopMatrices}
          radius={jclTop!.diameter * S / 2}
          length={Math.max(jclBarEndZ - jclBarStartZ, 0)}
          color="#B66A2B"
          hiColor="#D58537"
          info={jclTopInfo}
          selected={selected?.type === 'stripJclTop'}
          onSelect={onSelect}
          visible={visibleGroups.has('jclTop')}
        />
      )}

      {jclStirrupInfo && visibleGroups.has('jclStirrup') && params.jclB && params.jclH && jclCentersX.map((centerX, beamIdx) => (
        <group key={`jcl-stirrup-group-${beamIdx}`} position={[centerX, baseHM, jclBeamCenterZ]} rotation={[0, Math.PI / 2, 0]}>
          {jclStirrupPositions.map((x, i) => (
            <StirrupRing
              key={`jcl-stirrup-${beamIdx}-${i}`}
              x={x}
              width={Math.max(params.jclB! * S - 2 * cover - jclStirrup!.diameter * S, params.jclB! * S * 0.2)}
              height={Math.max(params.jclH! * S - 2 * cover - jclStirrup!.diameter * S, params.jclH! * S * 0.2)}
              diameter={jclStirrup!.diameter}
              color="#3B8F6A"
              hiColor="#48A87A"
              info={jclStirrupInfo}
              selected={selected?.type === 'stripJclStirrup'}
              onSelect={onSelect}
              cover={cover}
              legs={jclStirrup!.legs}
            />
          ))}
        </group>
      ))}

      {overrideInfo && localBottom && (
        <InstancedRebarGroup
          matrices={localBottomMatrices}
          radius={localBottom.diameter * S / 2}
          length={Math.max(zEnd - zStart, 0)}
          color="#EC4899"
          hiColor="#F472B6"
          info={overrideInfo}
          selected={selected?.type === 'stripOverride'}
          onSelect={onSelect}
          visible={visibleGroups.has('override')}
        />
      )}

      {overrideInfo && localTop && (
        <InstancedRebarGroup
          matrices={localTopMatrices}
          radius={localTop.diameter * S / 2}
          length={clearGapM > 0 ? clearGapM : Math.max(zEnd - zStart, 0)}
          color="#D946EF"
          hiColor="#F0ABFC"
          info={overrideInfo}
          selected={selected?.type === 'stripOverride'}
          onSelect={onSelect}
          visible={visibleGroups.has('override')}
        />
      )}
    </>
  );
}

function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const cls: Record<string, string> = {
    stripBottom: 'bg-red-50 border-red-200 text-red-800',
    stripDist: 'bg-blue-50 border-blue-200 text-blue-800',
    stripTop: 'bg-orange-50 border-orange-200 text-orange-800',
    stripTopDist: 'bg-green-50 border-green-200 text-green-800',
    stripJlBottom: 'bg-amber-50 border-amber-200 text-amber-800',
    stripJlTop: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    stripJlStirrup: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    stripJclBottom: 'bg-orange-50 border-orange-200 text-orange-800',
    stripJclTop: 'bg-lime-50 border-lime-200 text-lime-800',
    stripJclStirrup: 'bg-teal-50 border-teal-200 text-teal-800',
    stripOverride: 'bg-pink-50 border-pink-200 text-pink-800',
  };
  return (
    <div className={`absolute top-3 right-3 z-10 max-w-xs rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${cls[info.type] || 'bg-white border-gray-200 text-gray-800'}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="mt-1 text-xs opacity-80">{info.detail}</p>
    </div>
  );
}

export default function StripFoundationViewer({ params }: { params: StripFoundationParams }) {
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.18);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const [visibleGroups, setVisibleGroups] = useState<Set<string>>(new Set(['bottom', 'dist', 'top', 'topDist', 'jlBottom', 'jlTop', 'jlStirrup', 'jclBottom', 'jclTop', 'jclStirrup', 'override']));
  const { isFullscreen, toggle, containerRef, containerClass } = useFullscreen();

  const toggleGroup = (group: string) => {
    setVisibleGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const camDist = useMemo(() => {
    const maxDim = Math.max(params.length, params.width, params.supportHeight || 0) * S;
    return Math.max(maxDim * 0.65, 6);
  }, [params.length, params.width, params.supportHeight]);

  return (
    <div data-viewer className="rv-viewer">
      <div className="rv-viewer-toolbar flex flex-wrap items-center gap-2">
        {[
          ['bottom', '底横'],
          ['dist', '底分'],
          ['top', '顶横'],
          ['topDist', '顶分'],
          ...(params.supportType === 'beam' ? [['jlBottom', 'JL底'], ['jlTop', 'JL顶'], ['jlStirrup', 'JL箍']] : []),
          ...(params.hasJcl ? [['jclBottom', 'JCL底'], ['jclTop', 'JCL顶'], ['jclStirrup', 'JCL箍']] : []),
          ...(params.hasLocalOverride ? [['override', '原位修正']] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => toggleGroup(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${visibleGroups.has(key) ? 'bg-white border border-gray-200 text-primary shadow-sm' : 'bg-gray-100 text-muted hover:bg-gray-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={containerRef} className={`rv-viewer-canvas relative w-full bg-surface overflow-hidden ${containerClass}`}>
        {selected && <InfoTooltip info={selected} />}

        <ViewerControls views={[
            { name: '正面', pos: [0, camDist * 0.14, camDist] as [number, number, number] },
            { name: '侧面', pos: [camDist, camDist * 0.14, 0] as [number, number, number] },
            { name: '俯视', pos: [0, camDist * 1.15, 0.1] as [number, number, number] },
            { name: '透视', pos: [camDist * 0.58, camDist * 0.28, camDist * 0.72] as [number, number, number] },
          ]} onView={setCameraTarget} opacity={concreteOpacity} onOpacity={setConcreteOpacity}
          fullscreen={isFullscreen} onFullscreen={toggle} />

        <Canvas camera={{ position: [camDist * 0.58, camDist * 0.28, camDist * 0.72], fov: 40 }} onPointerMissed={() => setSelected(null)}>
          <color attach="background" args={['#071725']} />
          <FittedCamera targetPosition={cameraTarget} initialPosition={[camDist * 0.58, camDist * 0.28, camDist * 0.72]} center={[0, 0, 0]} bounds={[params.length * S, (params.h + params.supportHeight) * S * 2, params.width * S]} />
          <StripFoundationScene
            params={params}
            selected={selected}
            onSelect={setSelected}
            concreteOpacity={concreteOpacity}
            visibleGroups={visibleGroups}
          />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        </Canvas>
      </div>
    </div>
  );
}
