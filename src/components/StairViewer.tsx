'use client';

import { ConstructionTimeline } from './ConstructionTimeline';
import { ConstructionGroup } from './three/ConstructionGroup';
import { useConstructionPlayback } from '@/lib/useConstructionPlayback';
import { stairConstructionSteps } from '@/lib/construction-playback';

import { stairReinforcement } from '@/lib/stair-reinforcement';

import { FittedCamera } from './FittedCamera';

import { ViewerControls } from './ViewerControls';

import { useMemo, useState, useCallback } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Html, Line } from '@react-three/drei';
import { Camera } from 'lucide-react';
import { useFullscreen } from '@/lib/useFullscreen';
import * as THREE from 'three';
import type { StairParams, RebarMeshInfo } from '@/lib/types';
import { parseSlabRebar, gradeLabel } from '@/lib/rebar';
import { S, REBAR_MATERIAL, COLOR_STAIR_TOP, COLOR_STAIR_TOP_HI, COLOR_STAIR_BOTTOM, COLOR_STAIR_BOTTOM_HI, COLOR_STAIR_DIST, COLOR_STAIR_DIST_HI } from '@/lib/constants';
import { roundedRebarPath } from '@/lib/rebar-curve';
import { CappedRebarTube } from './three/CappedRebarTube';
import { SectionCutPlane } from './three';
import { useKeyboard, createViewerBindings } from '@/lib/useKeyboard';
import { KeyboardHelp } from './KeyboardHelp';

// ═══════════════════════════════════════════════════════════════════
// 辅助组件
// ═══════════════════════════════════════════════════════════════════



function StairBar({ position, rotation, length, diameter, color, hiColor, info, selected, onSelect }: {
  position: [number, number, number]; rotation?: [number, number, number];
  length: number; diameter: number; color: string; hiColor: string;
  info: RebarMeshInfo; selected: boolean; onSelect: (info: RebarMeshInfo | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeColor = selected ? hiColor : hovered ? hiColor : color;
  const scale = 1; // Highlight by colour, preserving contact clearance.
  return (
    <mesh position={position} rotation={rotation || [0, 0, Math.PI / 2]}
      onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : info); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      scale={[scale, 1, scale]}>
      <cylinderGeometry args={[diameter * S / 2, diameter * S / 2, length, 8]} />
      <meshStandardMaterial color={activeColor} {...REBAR_MATERIAL}
        emissive={activeColor} emissiveIntensity={selected ? 0.3 : 0.12} />
    </mesh>
  );
}

/** 连续钢筋中心线，以圆弧处理弯折并封闭端面。 */
function TubeBar({ path, diameter, color, hiColor, info, selected, onSelect }: {
  path: THREE.Vector3[]; diameter: number; color: string; hiColor: string;
  info: RebarMeshInfo; selected: boolean; onSelect: (info: RebarMeshInfo | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeColor = selected ? hiColor : hovered ? hiColor : color;
  const r = diameter * S / 2;
  const curve = useMemo(() => roundedRebarPath(path, diameter * S * 4), [path, diameter]);
  const handler = {
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(selected ? null : info); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { setHovered(false); document.body.style.cursor = 'auto'; },
  };
  return (
    <group {...handler}>
      <CappedRebarTube curve={curve} radius={r} segments={160}>
        <meshStandardMaterial color={activeColor} {...REBAR_MATERIAL} emissive={activeColor} emissiveIntensity={selected ? .3 : .12} />
      </CappedRebarTube>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AT 型楼梯 3D 场景
// ═══════════════════════════════════════════════════════════════════

function ATStairScene({ params, selected, onSelect, concreteOpacity, visibleGroups, activeGroup, showDimensions, cutPosition }: {
  params: StairParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void;
  concreteOpacity: number; visibleGroups: Set<string> | null; activeGroup: string | null;
  showDimensions: boolean; cutPosition: number | null;
}) {
  const steel = useMemo(() => stairReinforcement(params), [params]);
  const {
    stepCount: n, stepHeight: hMM, stepWidth: bMM,
    slabThickness: tMM, flightWidth: wMM,
    topPlatformLen: topPlatMM, botPlatformLen: botPlatMM,
    platformThickness: platTMM,
    beamH: beamHMM,
    cover: coverMM,
  } = params;

  // mm → m
  const h = hMM * S;         // 踏步高
  const b = bMM * S;         // 踏步宽
  const t = tMM * S;         // 梯板厚
  const w = wMM * S;         // 梯段宽
  const topPlat = topPlatMM * S;
  const botPlat = botPlatMM * S;
  const platT = platTMM * S;
  const beamH = beamHMM * S;
  const cover = coverMM * S;

  // 解析配筋
  const topR = parseSlabRebar(params.topBar);
  const botR = parseSlabRebar(params.bottomBar);
  const distR = parseSlabRebar(params.distBar);

  // 梯段总高和总长 (水平投影)
  const totalRise = n * h;
  const totalRun = n * b;

  // 梯段倾斜角度
  const angle = Math.atan2(totalRise, totalRun);
  // 沿斜面的梯板长度
  // 板厚在竖直方向的投影
  const tCosA = t / Math.cos(angle); // Vertical offset gives the specified thickness normal to the slope.

  // 坐标系: X 方向=行走方向 (水平), Y=竖直, Z=梯段宽度方向
  // 原点: 低端梯梁顶面中心（梯板低端支座）

  const gv = (g: string) => !visibleGroups || visibleGroups.has(g);
  const isSelected = (type: string) => selected?.type === type;

  // ============ RebarMeshInfo ============
  const botInfo: RebarMeshInfo = {
    type: 'stairBottom', label: '下部纵筋',
    detail: `${params.bottomBar} · ${gradeLabel(botR.grade)} Φ${botR.diameter}@${botR.spacing}`,
  };
  const topInfo: RebarMeshInfo = {
    type: 'stairTop', label: '上部纵筋',
    detail: `${params.topBar} · ${gradeLabel(topR.grade)} Φ${topR.diameter}@${topR.spacing}`,
  };
  const distInfo: RebarMeshInfo = {
    type: 'stairDist', label: '分布筋',
    detail: `${params.distBar} · ${gradeLabel(distR.grade)} Φ${distR.diameter}@${distR.spacing}`,
  };

  // ============ 踏步几何 (混凝土) ============
  // 每个踏步是直角三角形截面(板顶斜面 与 水平踏面 之间的区域)
  // 三角形顶点: (i*b, (i+1)*h), (i*b, i*h), ((i+1)*b, (i+1)*h)
  // 图集 AT 型: 第0级(低端梯梁顶面) 和 第n-1级(高端梯梁顶面) 不单独渲染
  const stepsGeo = useMemo(() => {
    const geos: THREE.ExtrudeGeometry[] = [];
    for (let i = 1; i < n - 1; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(i * b, (i + 1) * h);      // 踏面左上角
      shape.lineTo(i * b, i * h);              // 板顶面(低点)
      shape.lineTo((i + 1) * b, (i + 1) * h); // 板顶面(高点)=踏面右边
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
      geo.translate(0, 0, -w / 2);
      geos.push(geo);
    }
    return geos;
  }, [n, b, h, w]);


  // ============ 纵筋 Z 坐标分布 ============
  const botBarZs = steel.botBarZs;

  const topBarZs = steel.topBarZs;

  // ============ 分布筋沿斜面分布 ============
  const distBarPositions = steel.distBarPositions;

  // ============ 锚固参数 (22G101-2 页2-8) ============

  // ── 梯梁几何 ──
  // AT型: 梯梁渲染范围  低端 [0, b], 高端 [totalRun-b, totalRun]
  //        梯梁顶面标高  低端 Y=h,   高端 Y=totalRise
  //        梯梁底面标高  低端 Y=h-beamH, 高端 Y=totalRise-beamH
  const botBeamRenderCenterX = b / 2;
  const topBeamRenderCenterX = totalRun - b / 2;

  // ============ 坐标系说明 ============
  // 板顶面: (0,0) → (totalRun, totalRise)  slope = totalRise / totalRun
  // 板底面: (0,-tCosA) → (totalRun, totalRise-tCosA)  同斜率, 竖直下移 tCosA
  // 在任意 X 处:
  //   板顶面Y = slope * X
  //   板底面Y = slope * X - tCosA
  //   下部筋Y = slope * X - tCosA + cvBot   (cvBot = 竖直方向的保护层+半径)
  //   上部筋Y = slope * X - cvTop            (cvTop = 竖直方向的保护层+半径)
  const slope = totalRise / totalRun;

  // ============ 纵筋路径 (严格按 22G101-2 图集 页2-8) ============
  //
  //  两种纵筋都沿板面延长线(同斜率)伸入梯梁，无水平段!
  //
  //  【下部纵筋】沿板底面延长线伸入两端梯梁，无弯钩
  //              锚固条件: ① 过支座中线  ② 伸入梁≥5d (两者取大值)
  //
  //  【上部纵筋】(支座负筋，两端各一段)
  //              从梯板 ln/4 处沿板顶面延长线伸入梯梁至梁边(≥0.35lab)
  //              末端 15d 向下弯钩
  //

  // ─── 下部纵筋 ───
  // 沿 botY(x) = slope*x - tCosA + cvBot 延长线直接伸入梯梁，无弯钩
  // 锚固条件: 过支座中线 / 伸入梁≥5d，两者取大值(即更深入梁的那个)
  const botBarPath = steel.botBarPath;

  // ─── 上部纵筋 ───
  // 两端各一段独立负筋: 沿 topY(x) = slope*x - cvTop 延长线伸入梯梁, 弯钩向下
  const topBarPaths = steel.topBarPaths;

  // ============ 梯板底面几何 (斜面板) ============
  // 板顶面与踏步底面对齐 (0,0)→(totalRun,totalRise)
  // 板底面下移 tCosA
  const slabGeo = useMemo(() => {
    // 梯板只在两个梯梁之间: X 从 b 到 totalRun-b
    const x0 = b;
    const x1 = totalRun - b;
    const y0 = slope * x0;            // 板顶面 at x0
    const y1 = slope * x1;            // 板顶面 at x1
    const shape = new THREE.Shape();
    shape.moveTo(x0, y0 - tCosA);     // 低端板底
    shape.lineTo(x1, y1 - tCosA);     // 高端板底
    shape.lineTo(x1, y1);             // 高端板顶
    shape.lineTo(x0, y0);             // 低端板顶
    shape.closePath();
    const extrudeSettings = { depth: w, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -w / 2);
    return geo;
  }, [totalRun, b, slope, tCosA, w]);

  return (
    <>
      {/* 不可见点击区域 */}
      <mesh position={[totalRun / 2, totalRise / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[totalRun + botPlat + topPlat + 1, totalRise + 1, w + 1]} />
        <meshBasicMaterial />
      </mesh>

      {/* ═══════════ 混凝土 ═══════════ */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('concrete')} dim={!!activeGroup && activeGroup !== 'concrete'} reference>{(
        <group>
          {/* 梯板底面 (斜面板) */}
          <mesh geometry={slabGeo}>
            <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>

          {/* 踏步 — 三角形截面(板顶斜面与水平踏面之间) */}
          {stepsGeo.map((geo, i) => (
            <mesh key={`step-${i}`} geometry={geo}>
              <meshPhysicalMaterial color="#C8CED4" transparent opacity={concreteOpacity * 1.2} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
            </mesh>
          ))}
          {stepsGeo.map((geo, i) => (
            <lineSegments key={`step-edge-${i}`}>
              <edgesGeometry args={[geo]} />
              <lineBasicMaterial color="#94A3B8" />
            </lineSegments>
          ))}

          {/* 下平台板 — 紧贴低端梯梁左侧，顶面与梯梁顶面齐平 */}
          <mesh position={[-botPlat / 2, h - platT / 2, 0]}>
            <boxGeometry args={[botPlat, platT, w]} />
            <meshPhysicalMaterial color="#B0B8C1" transparent opacity={concreteOpacity * 1.1} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[-botPlat / 2, h - platT / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(botPlat, platT, w)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>

          {/* 上平台板 — 紧贴高端梯梁右侧，顶面与梯梁顶面齐平 */}
          <mesh position={[totalRun + topPlat / 2, totalRise - platT / 2, 0]}>
            <boxGeometry args={[topPlat, platT, w]} />
            <meshPhysicalMaterial color="#B0B8C1" transparent opacity={concreteOpacity * 1.1} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[totalRun + topPlat / 2, totalRise - platT / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(topPlat, platT, w)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>

          {/* 低端梯梁（顶面 = 第一个踏步踏面, y=h，X宽 = b） */}
          <mesh position={[botBeamRenderCenterX, h - beamH / 2, 0]}>
            <boxGeometry args={[b, beamH, w + 0.4]} />
            <meshPhysicalMaterial color="#A0A8B1" transparent opacity={concreteOpacity * 1.3} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[botBeamRenderCenterX, h - beamH / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(b, beamH, w + 0.4)]} />
            <lineBasicMaterial color="#7F8C9A" />
          </lineSegments>

          {/* 高端梯梁（顶面 = 最后一个踏步踏面，X宽 = b） */}
          <mesh position={[topBeamRenderCenterX, totalRise - beamH / 2, 0]}>
            <boxGeometry args={[b, beamH, w + 0.4]} />
            <meshPhysicalMaterial color="#A0A8B1" transparent opacity={concreteOpacity * 1.3} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[topBeamRenderCenterX, totalRise - beamH / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(b, beamH, w + 0.4)]} />
            <lineBasicMaterial color="#7F8C9A" />
          </lineSegments>
        </group>
      )}</ConstructionGroup>

      {/* ═══════════ 下部纵筋 ═══════════ */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('bottom')} dim={!!activeGroup && activeGroup !== 'bottom'}>{botBarZs.map((z, i) => {
        const pts = botBarPath.map(p => new THREE.Vector3(p.x, p.y, z));
        return (
          <TubeBar key={`bot-${i}`} path={pts} diameter={botR.diameter}
            color={COLOR_STAIR_BOTTOM} hiColor={COLOR_STAIR_BOTTOM_HI}
            info={botInfo} selected={isSelected('stairBottom')} onSelect={onSelect} />
        );
      })}</ConstructionGroup>

      {/* ═══════════ 上部纵筋 ═══════════ */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('top')} dim={!!activeGroup && activeGroup !== 'top'}>{topBarZs.map((z, i) => {
        const ptsLow = topBarPaths.low.map(p => new THREE.Vector3(p.x, p.y, z));
        const ptsHigh = topBarPaths.high.map(p => new THREE.Vector3(p.x, p.y, z));
        return (
          <group key={`top-${i}`}>
            <TubeBar path={ptsLow} diameter={topR.diameter}
              color={COLOR_STAIR_TOP} hiColor={COLOR_STAIR_TOP_HI}
              info={topInfo} selected={isSelected('stairTop')} onSelect={onSelect} />
            <TubeBar path={ptsHigh} diameter={topR.diameter}
              color={COLOR_STAIR_TOP} hiColor={COLOR_STAIR_TOP_HI}
              info={topInfo} selected={isSelected('stairTop')} onSelect={onSelect} />
          </group>
        );
      })}</ConstructionGroup>

      {/* ═══════════ 分布筋 (垂直于纵筋方向, Z轴) ═══════════ */}
      {/* 下部分布筋: 在底筋外侧 (板底面 + cover + 底筋直径 + 分布筋半径, 竖直方向) */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('dist')} dim={!!activeGroup && activeGroup !== 'dist'}>{distBarPositions.map((pos, i) => {
        const cvDist = (cover + botR.diameter * S + distR.diameter * S / 2) / Math.cos(angle);
        const barY = slope * pos.x - tCosA + cvDist;
        return (
          <StairBar key={`dist-bot-${i}`}
            position={[pos.x, barY, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            length={w - 2 * cover}
            diameter={distR.diameter}
            color={COLOR_STAIR_DIST} hiColor={COLOR_STAIR_DIST_HI}
            info={distInfo} selected={isSelected('stairDist')} onSelect={onSelect} />
        );
      })}</ConstructionGroup>
      {/* 上部分布筋: 在顶筋外侧 (板顶面 - cover - 顶筋直径 - 分布筋半径, 竖直方向) */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('dist')} dim={!!activeGroup && activeGroup !== 'dist'}>{distBarPositions.map((pos, i) => {
        const cvDist = (cover + topR.diameter * S + distR.diameter * S / 2) / Math.cos(angle);
        const barY = slope * pos.x - cvDist;
        return (
          <StairBar key={`dist-top-${i}`}
            position={[pos.x, barY, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            length={w - 2 * cover}
            diameter={distR.diameter}
            color={COLOR_STAIR_DIST} hiColor={COLOR_STAIR_DIST_HI}
            info={distInfo} selected={isSelected('stairDist')} onSelect={onSelect} />
        );
      })}</ConstructionGroup>

      {/* ═══════════ 尺寸标注 ═══════════ */}
      {showDimensions && (
        <StairDimensions
          totalRun={totalRun} totalRise={totalRise}
          b={b} h={h} t={t} w={w} n={n}
          stepHeight={hMM} stepWidth={bMM}
          slabThickness={tMM} flightWidth={wMM}
        />
      )}

      {/* ═══════════ 剖切面 ═══════════ */}
      {cutPosition !== null && (
        <SectionCutPlane position={cutPosition} height={totalRise + platT} width={w} />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 尺寸标注组件
// ═══════════════════════════════════════════════════════════════════

function DimLabel3D({ position, label, color = '#2563EB' }: { position: [number, number, number]; label: string; color?: string }) {
  return (
    <Html position={position} center distanceFactor={8}>
      <div style={{
        color, fontSize: 8, fontWeight: 700, whiteSpace: 'nowrap',
        pointerEvents: 'none',
        textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 6px rgba(255,255,255,0.8)',
        lineHeight: 1, letterSpacing: '-0.01em',
      }}>
        {label}
      </div>
    </Html>
  );
}

function StairDimensions({
  totalRun, totalRise, b, h, t, w, n,
  stepHeight, stepWidth, slabThickness, flightWidth,
}: {
  totalRun: number; totalRise: number;
  b: number; h: number; t: number; w: number; n: number;
  stepHeight: number; stepWidth: number;
  slabThickness: number; flightWidth: number;
}) {
  const zFront = w / 2 + 0.08;
  const tickLen = 0.03;
  const dimColor = '#2563EB';
  const dimColor2 = '#D97706';

  return (
    <group>
      {/* 总水平长 (下方) */}
      <Line points={[[0, -0.12, zFront], [totalRun, -0.12, zFront]]} color={dimColor} lineWidth={1.5} />
      <Line points={[[0, -0.12 - tickLen, zFront], [0, -0.12 + tickLen, zFront]]} color={dimColor} lineWidth={1} />
      <Line points={[[totalRun, -0.12 - tickLen, zFront], [totalRun, -0.12 + tickLen, zFront]]} color={dimColor} lineWidth={1} />
      <DimLabel3D position={[totalRun / 2, -0.12, zFront]} label={`${n}×${stepWidth}=${n * stepWidth}mm`} color={dimColor} />

      {/* 总升高 (右侧) */}
      <Line points={[[totalRun + 0.12, 0, zFront], [totalRun + 0.12, totalRise, zFront]]} color={dimColor} lineWidth={1.5} />
      <Line points={[[totalRun + 0.12 - tickLen, 0, zFront], [totalRun + 0.12 + tickLen, 0, zFront]]} color={dimColor} lineWidth={1} />
      <Line points={[[totalRun + 0.12 - tickLen, totalRise, zFront], [totalRun + 0.12 + tickLen, totalRise, zFront]]} color={dimColor} lineWidth={1} />
      <DimLabel3D position={[totalRun + 0.12, totalRise / 2, zFront]} label={`${n}×${stepHeight}=${n * stepHeight}mm`} color={dimColor} />

      {/* 第一个踏步尺寸标注 (踏步宽) */}
      <Line points={[[0, -0.06, zFront], [b, -0.06, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[0, -0.06 - tickLen * 0.7, zFront], [0, -0.06 + tickLen * 0.7, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[b, -0.06 - tickLen * 0.7, zFront], [b, -0.06 + tickLen * 0.7, zFront]]} color={dimColor2} lineWidth={1} />
      <DimLabel3D position={[b / 2, -0.06, zFront]} label={`b=${stepWidth}`} color={dimColor2} />

      {/* 第一个踏步高度标注 */}
      <Line points={[[-0.08, 0, zFront], [-0.08, h, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[-0.08 - tickLen * 0.7, 0, zFront], [-0.08 + tickLen * 0.7, 0, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[-0.08 - tickLen * 0.7, h, zFront], [-0.08 + tickLen * 0.7, h, zFront]]} color={dimColor2} lineWidth={1} />
      <DimLabel3D position={[-0.08, h / 2, zFront]} label={`h=${stepHeight}`} color={dimColor2} />

      {/* 梯段宽度 (Z方向) */}
      <Line points={[[-0.05, -0.05, -w / 2], [-0.05, -0.05, w / 2]]} color="#059669" lineWidth={1.5} />
      <Line points={[[-0.05 - tickLen, -0.05, -w / 2], [-0.05 + tickLen, -0.05, -w / 2]]} color="#059669" lineWidth={1} />
      <Line points={[[-0.05 - tickLen, -0.05, w / 2], [-0.05 + tickLen, -0.05, w / 2]]} color="#059669" lineWidth={1} />
      <DimLabel3D position={[-0.05, -0.05, 0]} label={`梯段宽=${flightWidth}mm`} color="#059669" />

      {/* 梯板厚度标注 (在斜段中部法向方向) */}
      {(() => {
        const midX = totalRun * 0.4;
        const midY = totalRise * 0.4;
        const cosA = Math.cos(Math.atan2(totalRise, totalRun));
        const sinA = Math.sin(Math.atan2(totalRise, totalRun));
        const nx = -sinA;
        const ny = cosA;
        return (
          <group>
            <Line points={[[midX, midY, zFront], [midX + nx * t, midY + ny * t, zFront]]} color="#DC2626" lineWidth={1} />
            <DimLabel3D position={[midX + nx * t * 0.5 + nx * 0.04, midY + ny * t * 0.5 + ny * 0.04, zFront]} label={`t=${slabThickness}`} color="#DC2626" />
          </group>
        );
      })()}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BT 型楼梯 尺寸标注
// ═══════════════════════════════════════════════════════════════════

function BTStairDimensions({
  totalRun, totalRise, b, h, t, w, n, botFlat,
  stepHeight, stepWidth, slabThickness, flightWidth, botFlatLenMM,
}: {
  totalRun: number; totalRise: number;
  b: number; h: number; t: number; w: number; n: number;
  botFlat: number;
  stepHeight: number; stepWidth: number;
  slabThickness: number; flightWidth: number; botFlatLenMM: number;
}) {
  const zFront = w / 2 + 0.08;
  const tickLen = 0.03;
  const dimColor = '#2563EB';
  const dimColor2 = '#D97706';
  return (
    <group>
      <Line points={[[-botFlat, -0.12, zFront], [0, -0.12, zFront]]} color="#0891B2" lineWidth={1.5} />
      <Line points={[[-botFlat, -0.12 - tickLen, zFront], [-botFlat, -0.12 + tickLen, zFront]]} color="#0891B2" lineWidth={1} />
      <Line points={[[0, -0.12 - tickLen, zFront], [0, -0.12 + tickLen, zFront]]} color="#0891B2" lineWidth={1} />
      <DimLabel3D position={[-botFlat / 2, -0.12, zFront]} label={`平板=${botFlatLenMM}mm`} color="#0891B2" />
      <Line points={[[0, -0.2, zFront], [totalRun, -0.2, zFront]]} color={dimColor} lineWidth={1.5} />
      <Line points={[[0, -0.2 - tickLen, zFront], [0, -0.2 + tickLen, zFront]]} color={dimColor} lineWidth={1} />
      <Line points={[[totalRun, -0.2 - tickLen, zFront], [totalRun, -0.2 + tickLen, zFront]]} color={dimColor} lineWidth={1} />
      <DimLabel3D position={[totalRun / 2, -0.2, zFront]} label={`${n}×${stepWidth}=${n * stepWidth}mm`} color={dimColor} />
      <Line points={[[totalRun + 0.12, 0, zFront], [totalRun + 0.12, totalRise, zFront]]} color={dimColor} lineWidth={1.5} />
      <Line points={[[totalRun + 0.12 - tickLen, 0, zFront], [totalRun + 0.12 + tickLen, 0, zFront]]} color={dimColor} lineWidth={1} />
      <Line points={[[totalRun + 0.12 - tickLen, totalRise, zFront], [totalRun + 0.12 + tickLen, totalRise, zFront]]} color={dimColor} lineWidth={1} />
      <DimLabel3D position={[totalRun + 0.12, totalRise / 2, zFront]} label={`${n}×${stepHeight}=${n * stepHeight}mm`} color={dimColor} />
      <Line points={[[0, -0.06, zFront], [b, -0.06, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[0, -0.06 - tickLen * 0.7, zFront], [0, -0.06 + tickLen * 0.7, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[b, -0.06 - tickLen * 0.7, zFront], [b, -0.06 + tickLen * 0.7, zFront]]} color={dimColor2} lineWidth={1} />
      <DimLabel3D position={[b / 2, -0.06, zFront]} label={`b=${stepWidth}`} color={dimColor2} />
      <Line points={[[-0.08, 0, zFront], [-0.08, h, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[-0.08 - tickLen * 0.7, 0, zFront], [-0.08 + tickLen * 0.7, 0, zFront]]} color={dimColor2} lineWidth={1} />
      <Line points={[[-0.08 - tickLen * 0.7, h, zFront], [-0.08 + tickLen * 0.7, h, zFront]]} color={dimColor2} lineWidth={1} />
      <DimLabel3D position={[-0.08, h / 2, zFront]} label={`h=${stepHeight}`} color={dimColor2} />
      <Line points={[[-botFlat, -0.05, -w / 2], [-botFlat, -0.05, w / 2]]} color="#059669" lineWidth={1.5} />
      <Line points={[[-botFlat - tickLen, -0.05, -w / 2], [-botFlat + tickLen, -0.05, -w / 2]]} color="#059669" lineWidth={1} />
      <Line points={[[-botFlat - tickLen, -0.05, w / 2], [-botFlat + tickLen, -0.05, w / 2]]} color="#059669" lineWidth={1} />
      <DimLabel3D position={[-botFlat, -0.05, 0]} label={`梯段宽=${flightWidth}mm`} color="#059669" />
      {(() => {
        const midX = totalRun * 0.4;
        const midY = totalRise * 0.4;
        const cosA = Math.cos(Math.atan2(totalRise, totalRun));
        const sinA = Math.sin(Math.atan2(totalRise, totalRun));
        const nx = -sinA; const ny = cosA;
        return (
          <group>
            <Line points={[[midX, midY, zFront], [midX + nx * t, midY + ny * t, zFront]]} color="#DC2626" lineWidth={1} />
            <DimLabel3D position={[midX + nx * t * 0.5 + nx * 0.04, midY + ny * t * 0.5 + ny * 0.04, zFront]} label={`t=${slabThickness}`} color="#DC2626" />
          </group>
        );
      })()}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════
// BT 型楼梯 3D 场景
// ═══════════════════════════════════════════════════════════════════

function BTStairScene({ params, selected, onSelect, concreteOpacity, visibleGroups, activeGroup, showDimensions, cutPosition }: {
  params: StairParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void;
  concreteOpacity: number; visibleGroups: Set<string> | null; activeGroup: string | null;
  showDimensions: boolean; cutPosition: number | null;
}) {
  const steel = useMemo(() => stairReinforcement(params), [params]);
  const {
    stepCount: n, stepHeight: hMM, stepWidth: bMM,
    slabThickness: tMM, flightWidth: wMM,
    topPlatformLen: topPlatMM, botPlatformLen: botPlatMM,
    platformThickness: platTMM,
    beamB: beamBMM, beamH: beamHMM,
    cover: coverMM,
    botFlatLen: botFlatLenMM = 700,
  } = params;

  const h = hMM * S;
  const b = bMM * S;
  const t = tMM * S;
  const w = wMM * S;
  const topPlat = topPlatMM * S;
  const botPlat = botPlatMM * S;
  const platT = platTMM * S;
  const beamB = beamBMM * S;
  const beamH = beamHMM * S;
  const cover = coverMM * S;
  const botFlat = botFlatLenMM * S;

  const topR = parseSlabRebar(params.topBar);
  const botR = parseSlabRebar(params.bottomBar);
  const distR = parseSlabRebar(params.distBar);

  const totalRise = n * h;
  const totalRun = n * b;
  const angle = Math.atan2(totalRise, totalRun);
  const tCosA = t / Math.cos(angle); // Vertical offset gives the specified thickness normal to the slope.
  const slope = totalRise / totalRun;

  // Coordinate system:
  // X=0 at flat-plate / slope junction
  // Flat plate: X from -botFlat to 0, Y top=0, bottom=-t
  // Slope section: X from 0 to totalRun, Y from 0 to totalRise
  // Low beam: X from -botFlat-beamB to -botFlat, top Y=0
  // High beam: X from totalRun to totalRun+beamB, top Y=totalRise

  const gv = (g: string) => !visibleGroups || visibleGroups.has(g);
  const isSelected = (type: string) => selected?.type === type;

  const botInfo: RebarMeshInfo = { type: 'stairBottom', label: '下部纵筋', detail: `${params.bottomBar} · ${gradeLabel(botR.grade)} Φ${botR.diameter}@${botR.spacing}` };
  const topInfo: RebarMeshInfo = { type: 'stairTop', label: '上部纵筋', detail: `${params.topBar} · ${gradeLabel(topR.grade)} Φ${topR.diameter}@${topR.spacing}` };
  const distInfo: RebarMeshInfo = { type: 'stairDist', label: '分布筋', detail: `${params.distBar} · ${gradeLabel(distR.grade)} Φ${distR.diameter}@${distR.spacing}` };

  // Steps (all n-1 visible; last covered by high beam)
  const stepsGeo = useMemo(() => {
    const geos: THREE.ExtrudeGeometry[] = [];
    for (let i = 0; i < n - 1; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(i * b, (i + 1) * h);
      shape.lineTo(i * b, i * h);
      shape.lineTo((i + 1) * b, (i + 1) * h);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
      geo.translate(0, 0, -w / 2);
      geos.push(geo);
    }
    return geos;
  }, [n, b, h, w]);

  const botBarZs = steel.botBarZs;

  const topBarZs = steel.topBarZs;

  const distBarPositions = steel.distBarPositions;


  // Bottom bar: horizontal in low beam → flat (horizontal) → kink at X=0 → slope → anchor in high beam (AT-style)
  const botBarPath = steel.botBarPath;

  // Top bars (two separate pieces)
  const topBarPaths = steel.topBarPaths;

  // Flat plate slab geometry
  const flatSlabGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-botFlat, -t);
    shape.lineTo(0, -t);
    shape.lineTo(0, 0);
    shape.lineTo(-botFlat, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    return geo;
  }, [botFlat, t, w]);

  // Slope slab geometry — ends at inner face of high beam (matching AT convention)
  const slopeSlabGeo = useMemo(() => {
    const ex = totalRun - beamB;
    const shape = new THREE.Shape();
    shape.moveTo(0, -tCosA);
    shape.lineTo(ex, slope * ex - tCosA);
    shape.lineTo(ex, slope * ex);
    shape.lineTo(0, 0);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    return geo;
  }, [totalRun, beamB, slope, tCosA, w]);

  const sceneCenter = [(-botFlat - beamB + totalRun) / 2, totalRise / 2, 0] as [number, number, number];

  return (
    <>
      <mesh position={sceneCenter} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[totalRun + botFlat + beamB + botPlat + topPlat + 1, totalRise + beamH + 1, w + 1]} />
        <meshBasicMaterial />
      </mesh>

      {/* ═══ 混凝土 ═══ */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('concrete')} dim={!!activeGroup && activeGroup !== 'concrete'} reference>{(
        <group>
          <mesh geometry={flatSlabGeo}>
            <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[flatSlabGeo]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
          <mesh geometry={slopeSlabGeo}>
            <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments>
            <edgesGeometry args={[slopeSlabGeo]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
          {stepsGeo.map((geo, i) => (
            <mesh key={`step-${i}`} geometry={geo}>
              <meshPhysicalMaterial color="#C8CED4" transparent opacity={concreteOpacity * 1.2} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
            </mesh>
          ))}
          {stepsGeo.map((geo, i) => (
            <lineSegments key={`step-edge-${i}`}>
              <edgesGeometry args={[geo]} />
              <lineBasicMaterial color="#94A3B8" />
            </lineSegments>
          ))}
          {/* Low beam */}
          <mesh position={[-botFlat - beamB / 2, -beamH / 2, 0]}>
            <boxGeometry args={[beamB, beamH, w + 0.4]} />
            <meshPhysicalMaterial color="#A0A8B1" transparent opacity={concreteOpacity * 1.3} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[-botFlat - beamB / 2, -beamH / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(beamB, beamH, w + 0.4)]} />
            <lineBasicMaterial color="#7F8C9A" />
          </lineSegments>
          {/* High beam — outer face at X=totalRun, inner face at X=totalRun-beamB (same as AT) */}
          <mesh position={[totalRun - beamB / 2, totalRise - beamH / 2, 0]}>
            <boxGeometry args={[beamB, beamH, w + 0.4]} />
            <meshPhysicalMaterial color="#A0A8B1" transparent opacity={concreteOpacity * 1.3} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[totalRun - beamB / 2, totalRise - beamH / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(beamB, beamH, w + 0.4)]} />
            <lineBasicMaterial color="#7F8C9A" />
          </lineSegments>
          {/* Low landing */}
          <mesh position={[-botFlat - beamB - botPlat / 2, -platT / 2, 0]}>
            <boxGeometry args={[botPlat, platT, w]} />
            <meshPhysicalMaterial color="#B0B8C1" transparent opacity={concreteOpacity * 1.1} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[-botFlat - beamB - botPlat / 2, -platT / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(botPlat, platT, w)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
          {/* High landing — starts at X=totalRun (outer face of high beam) */}
          <mesh position={[totalRun + topPlat / 2, totalRise - platT / 2, 0]}>
            <boxGeometry args={[topPlat, platT, w]} />
            <meshPhysicalMaterial color="#B0B8C1" transparent opacity={concreteOpacity * 1.1} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[totalRun + topPlat / 2, totalRise - platT / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(topPlat, platT, w)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
        </group>
      )}</ConstructionGroup>

      {/* ═══ 下部纵筋 ═══ */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('bottom')} dim={!!activeGroup && activeGroup !== 'bottom'}>{botBarZs.map((z, i) => {
        const pts = botBarPath.map(p => new THREE.Vector3(p.x, p.y, z));
        return (
          <TubeBar key={`bot-${i}`} path={pts} diameter={botR.diameter}
            color={COLOR_STAIR_BOTTOM} hiColor={COLOR_STAIR_BOTTOM_HI}
            info={botInfo} selected={isSelected('stairBottom')} onSelect={onSelect} />
        );
      })}</ConstructionGroup>

      {/* ═══ 上部纵筋 ═══ */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('top')} dim={!!activeGroup && activeGroup !== 'top'}>{topBarZs.map((z, i) => {
        const ptsLow = topBarPaths.low.map(p => new THREE.Vector3(p.x, p.y, z));
        const ptsHigh = topBarPaths.high.map(p => new THREE.Vector3(p.x, p.y, z));
        return (
          <group key={`top-${i}`}>
            <TubeBar path={ptsLow} diameter={topR.diameter}
              color={COLOR_STAIR_TOP} hiColor={COLOR_STAIR_TOP_HI}
              info={topInfo} selected={isSelected('stairTop')} onSelect={onSelect} />
            <TubeBar path={ptsHigh} diameter={topR.diameter}
              color={COLOR_STAIR_TOP} hiColor={COLOR_STAIR_TOP_HI}
              info={topInfo} selected={isSelected('stairTop')} onSelect={onSelect} />
          </group>
        );
      })}</ConstructionGroup>

      {/* ═══ 分布筋 ═══ */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('dist')} dim={!!activeGroup && activeGroup !== 'dist'}>{distBarPositions.map((pos, i) => {
        const cvDistBot = pos.isFlat
          ? cover + botR.diameter * S + distR.diameter * S / 2
          : (cover + botR.diameter * S + distR.diameter * S / 2) / Math.cos(angle);
        const barBotY = pos.isFlat ? -t + cvDistBot : slope * pos.x - tCosA + cvDistBot;
        const cvDistTop = pos.isFlat
          ? cover + topR.diameter * S + distR.diameter * S / 2
          : (cover + topR.diameter * S + distR.diameter * S / 2) / Math.cos(angle);
        const barTopY = pos.isFlat ? -cvDistTop : slope * pos.x - cvDistTop;
        return (
          <group key={`dist-${i}`}>
            <StairBar position={[pos.x, barBotY, 0]} rotation={[Math.PI / 2, 0, 0]}
              length={w - 2 * cover} diameter={distR.diameter}
              color={COLOR_STAIR_DIST} hiColor={COLOR_STAIR_DIST_HI}
              info={distInfo} selected={isSelected('stairDist')} onSelect={onSelect} />
            <StairBar position={[pos.x, barTopY, 0]} rotation={[Math.PI / 2, 0, 0]}
              length={w - 2 * cover} diameter={distR.diameter}
              color={COLOR_STAIR_DIST} hiColor={COLOR_STAIR_DIST_HI}
              info={distInfo} selected={isSelected('stairDist')} onSelect={onSelect} />
          </group>
        );
      })}</ConstructionGroup>

      {/* ═══ 尺寸标注 ═══ */}
      {showDimensions && (
        <BTStairDimensions
          totalRun={totalRun} totalRise={totalRise}
          b={b} h={h} t={t} w={w} n={n} botFlat={botFlat}
          stepHeight={hMM} stepWidth={bMM}
          slabThickness={tMM} flightWidth={wMM}
          botFlatLenMM={botFlatLenMM}
        />
      )}

      {/* ═══ 剖切面 ═══ */}
      {cutPosition !== null && (
        <SectionCutPlane position={cutPosition - botFlat} height={totalRise + platT} width={w} />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 信息提示
// ═══════════════════════════════════════════════════════════════════

function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    stairBottom: 'bg-red-50 border-red-200 text-red-800',
    stairTop: 'bg-purple-50 border-purple-200 text-purple-800',
    stairDist: 'bg-green-50 border-green-200 text-green-800',
    stairPlatform: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  const cls = colorMap[info.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`absolute top-3 right-3 px-4 py-3 rounded-xl border text-sm shadow-lg backdrop-blur-sm z-10 max-w-xs ${cls}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="text-xs mt-1 opacity-80">{info.detail}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// 导出：StairViewer 主组件
// ═══════════════════════════════════════════════════════════════════

export default function StairViewer({ params }: { params: StairParams }) {
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.15);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const [showDimensions, setShowDimensions] = useState(false);
  const [showCut, setShowCut] = useState(false);
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const constructionStages = useMemo(() => stairConstructionSteps(), []);
  const playback = useConstructionPlayback(constructionStages);
  const { state: animation, send: animationAction } = playback;
  const animating = animation.open;
  const { isFullscreen, toggle: toggleFullscreen, containerRef: viewerContainerRef, containerClass: fsClass } = useFullscreen();


  // 相机目标中心
  const totalRise = params.stepCount * params.stepHeight * S;
  const totalRun = params.stepCount * params.stepWidth * S;
  const botFlat = params.stairType === 'BT' ? (params.botFlatLen ?? 700) * S : 0;
  const beamBForCam = params.stairType === 'BT' ? params.beamB * S : 0;
  const centerX = params.stairType === 'BT'
    ? (-botFlat - beamBForCam + totalRun) / 2
    : totalRun / 2;
  const centerY = totalRise / 2;

  // 剖切范围
  const cutMax = totalRun * 0.95;

  // 截图函数
  const takeScreenshot = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-viewer="stair"] canvas');
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `stair-${params.id || 'view'}.png`;
      a.click();
    }
  }, [params.id]);

  // 快捷键
  const keyBindings = useMemo(() => createViewerBindings({
    resetView: () => setCameraTarget([centerX + 3, centerY + 2, 3]),
    toggleDimensions: () => setShowDimensions(d => !d),
    takeScreenshot,
    toggleAnimation: () => animationAction({ type: 'toggle' }),
    previousStep: animating ? () => animationAction({ type: 'seek', step: animation.step - 1 }) : undefined,
    nextStep: animating ? () => animationAction({ type: 'seek', step: animation.step + 1 }) : undefined,
    exitAnimation: animating ? () => animationAction({ type: 'exit' }) : undefined,
    setViewPreset: (preset) => {
      const presets: Record<string, [number, number, number]> = {
        front: [centerX, centerY, 4],
        side: [centerX + 4, centerY, 0],
        top: [centerX, centerY + 5, 0.1],
        iso: [centerX + 3, centerY + 2, 3],
      };
      setCameraTarget(presets[preset] || presets.iso);
    },
  }), [centerX, centerY, animating, animation.step, animationAction, takeScreenshot]);

  useKeyboard(keyBindings);


  return (
    <div className="rv-viewer" data-viewer="stair">
      {/* ═══ 工具栏 ═══ */}
      <div className="rv-viewer-toolbar flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => { setShowCut(!showCut); if (showCut) setCutPosition(null); else setCutPosition(0); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${showCut ? 'bg-accent text-white shadow-sm shadow-accent/20' : 'bg-white border border-gray-200 text-muted hover:bg-gray-50 hover:border-gray-300'}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21L3 9m18 12l-4-12M12 3v18" /></svg>
          {showCut ? '关闭剖切' : '剖切视图'}
        </button>
        <button
          onClick={() => setShowDimensions(!showDimensions)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${showDimensions ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20' : 'bg-white border border-gray-200 text-muted hover:bg-gray-50 hover:border-gray-300'}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" /></svg>
          {showDimensions ? '隐藏标注' : '尺寸标注'}
        </button>
        <button
          onClick={() => animationAction({ type: animating ? 'exit' : 'enter' })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${animating ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : 'bg-white border border-gray-200 text-muted hover:bg-gray-50 hover:border-gray-300'}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {animating ? '退出动画' : '施工动画'}
        </button>
        <button
          onClick={takeScreenshot}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-white border border-gray-200 text-muted hover:bg-gray-50 hover:border-gray-300"
          title="截图 (S)">
          <Camera className="w-3.5 h-3.5" />
          截图
        </button>
        <KeyboardHelp bindings={keyBindings} />
        {selected && (
          <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-muted cursor-pointer hover:bg-gray-200 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            取消选中
          </button>
        )}
      </div>

      {/* ═══ 施工动画时间轴 ═══ */}
      {!isFullscreen && <ConstructionTimeline playback={playback} />}

      {/* ═══ 剖切位置滑块 ═══ */}
      {showCut && (
        <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-2">
          <span className="text-xs text-muted whitespace-nowrap">剖切位置</span>
          <input type="range" min={-cutMax / 2} max={cutMax} step={0.01} value={cutPosition ?? 0}
            onChange={e => setCutPosition(parseFloat(e.target.value))} className="flex-1 accent-accent" />
          <span className="text-xs text-muted w-16 text-right">{((cutPosition ?? 0) * 1000).toFixed(0)}mm</span>
        </div>
      )}

      {/* ═══ 3D 画布 ═══ */}
      <div ref={viewerContainerRef} className={`rv-viewer-canvas relative w-full bg-surface overflow-hidden ${fsClass}`}>
        {isFullscreen && <div className="rv-construction-fullscreen"><ConstructionTimeline playback={playback} /></div>}
        {selected && <InfoTooltip info={selected} />}

        <ViewerControls views={[
            { name: '正面', pos: [centerX, centerY, 4] as [number, number, number] },
            { name: '侧面', pos: [centerX + 4, centerY, 0] as [number, number, number] },
            { name: '俯视', pos: [centerX, centerY + 5, 0.1] as [number, number, number] },
            { name: '透视', pos: [centerX + 3, centerY + 2, 3] as [number, number, number] },
          ]} onView={setCameraTarget} opacity={concreteOpacity} onOpacity={setConcreteOpacity}
          fullscreen={isFullscreen} onFullscreen={toggleFullscreen} />

        <Canvas camera={{ position: [centerX + 3, centerY + 2, 3], fov: 45 }} scene={{ background: new THREE.Color('#071725') }}>
          <FittedCamera targetPosition={cameraTarget} initialPosition={[centerX + 3, centerY + 2, 3]} center={[centerX, centerY, 0]} smooth bounds={animating && playback.focus
            ? [totalRun + botFlat + params.beamB * S, totalRise + .4, params.flightWidth * S]
            : [totalRun + botFlat + (params.topPlatformLen + params.botPlatformLen + params.beamB * 2) * S, totalRise + .8, params.flightWidth * S]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
          <directionalLight position={[-3, 3, -4]} color="#8ddaf0" intensity={0.8} />
          {params.stairType === 'BT'
            ? <BTStairScene params={params} selected={selected} onSelect={setSelected}
                concreteOpacity={concreteOpacity} visibleGroups={playback.visibleGroups ?? null} activeGroup={playback.activeGroup}
                showDimensions={showDimensions} cutPosition={cutPosition} />
            : <ATStairScene params={params} selected={selected} onSelect={setSelected}
                concreteOpacity={concreteOpacity} visibleGroups={playback.visibleGroups ?? null} activeGroup={playback.activeGroup}
                showDimensions={showDimensions} cutPosition={cutPosition} />}
          <Grid args={[20, 20]} position={[0, -0.01, 0]} cellColor="#15384f" sectionColor="#215a72" fadeDistance={15} />
          <axesHelper args={[0.5]} />
          <OrbitControls target={[centerX, centerY, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="rv-viewer-hints absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/50 text-white/80 text-[11px] px-4 py-1.5 rounded-full backdrop-blur-md pointer-events-none">
          <span>左键旋转</span>
          <span className="w-px h-3 bg-white/20" />
          <span>右键平移</span>
          <span className="w-px h-3 bg-white/20" />
          <span>滚轮缩放</span>
          <span className="w-px h-3 bg-white/20" />
          <span>点击钢筋查看详情</span>
        </div>
      </div>
    </div>
  );
}
