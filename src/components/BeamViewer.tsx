'use client';

import { ConstructionTimeline } from './ConstructionTimeline';
import { ConstructionGroup } from './three/ConstructionGroup';
import { useConstructionPlayback } from '@/lib/useConstructionPlayback';
import { beamConstructionSteps } from '@/lib/construction-playback';

import { beamLongitudinalLayout, BEAM_BAR_NAMES } from '@/lib/beam-longitudinal';
import type { BeamBarRole } from '@/lib/beam-longitudinal';
import { ViewerControls } from './ViewerControls';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Grid, Environment, Lightformer } from '@react-three/drei';
import { Camera } from 'lucide-react';
import { useFullscreen } from '@/lib/useFullscreen';
import * as THREE from 'three';
import type { BeamParams, RebarMeshInfo, RebarRenderMode } from '@/lib/types';
import { parseRebar, parseRebarBottom, parseStirrup, parseSideBar, parseTieBar, autoTieBar, tieBarToString, gradeLabel } from '@/lib/rebar';
import { calcSupportRebarLength, calcBeamEndAnchor, calcBeamSideBarAnchor, calcLaE } from '@/lib/anchor';
import { beamDenseZoneLength } from '@/lib/construction-rules';
import { RebarDetailPanel } from './RebarDetailPanel';
import { StirrupHookDetail } from './StirrupHookDetail';
import {
  S,
  COLOR_SUPPORT, COLOR_SUPPORT_HI,
  COLOR_ERECTION, COLOR_ERECTION_HI,
  COLOR_HAUNCH, COLOR_HAUNCH_HI,
  COLOR_SIDEBAR, COLOR_SIDEBAR_HI,
} from '@/lib/constants';

// Beam workspace palette; geometry and engineering color groups remain independent.
const COLOR_REBAR = '#ef5a55', COLOR_REBAR_HI = '#ff9790';
const COLOR_STIRRUP = '#22bdd5', COLOR_STIRRUP_HI = '#72edfa';
const COLOR_STIRRUP_DENSE = '#1599b6', COLOR_STIRRUP_DENSE_HI = '#55dfef';
const COLOR_STIRRUP_NORMAL = '#46cbd9', COLOR_STIRRUP_NORMAL_HI = '#9af3fb';
import { layoutBars, formatAnchorDesc } from '@/lib/layout';
import {
  RebarBar,
  SlopedRebarBar,
  StirrupRing,
  BentRebarEnd,
  TieBarMesh,
  DimLine,
  VDimLine,
  DenseZoneMark,
  ColumnStub,
  SectionCutPlane,
} from './three';
import { useKeyboard, createViewerBindings } from '@/lib/useKeyboard';
import { KeyboardHelp } from './KeyboardHelp';
import { beamStirrupBarPositions, createCompositeStirrupSpec, createTieBarCurves, staggerTiePositions, createTieBarShapeSpec, resolveTieSideOffsetMm } from '@/lib/rebar-shapes';
import { formatDistributionRange, isRelatedRebarSet, rebarGroupDataFromInfo } from '@/lib/rebar-semantics';

/* Haunch (加腋) concrete geometry */
function HaunchShape({ beamLen, beamH, beamB, haunchLen, haunchH, haunchType, side, opacity }: {
  beamLen: number; beamH: number; beamB: number;
  haunchLen: number; haunchH: number; haunchType: 'horizontal' | 'vertical';
  side: 'left' | 'right'; opacity: number;
}) {
  // Use BufferGeometry for precise wedge shape
  const { meshGeo, edgeGeo } = useMemo(() => {
    const halfB = beamB / 2;
    // Direction: left haunch extends from -beamLen/2 rightward, right from +beamLen/2 leftward
    const xStart = side === 'left' ? -beamLen / 2 : beamLen / 2;
    const xEnd = side === 'left' ? -beamLen / 2 + haunchLen : beamLen / 2 - haunchLen;

    if (haunchType === 'vertical') {
      // 竖向加腋: 梁底部向下的三角形楔体
      // 柱面处厚度 = haunchH, 跨中端厚度 = 0
      // 8 vertices forming a wedge (triangular prism along Z)
      const vertices = new Float32Array([
        // Bottom face (triangle): at column face full depth, at span end zero depth
        xStart, 0, -halfB,           // 0: column face, beam bottom, front
        xStart, 0, halfB,            // 1: column face, beam bottom, back
        xStart, -haunchH, -halfB,    // 2: column face, haunch bottom, front
        xStart, -haunchH, halfB,     // 3: column face, haunch bottom, back
        xEnd, 0, -halfB,             // 4: span end, beam bottom, front
        xEnd, 0, halfB,              // 5: span end, beam bottom, back
      ]);
      // 6 triangles (12 indices for 4 faces)
      const indices = [
        // Column face (rectangle: 0,1,3,2)
        0, 1, 3,  0, 3, 2,
        // Front face (triangle: 0, 2, 4)
        0, 2, 4,
        // Back face (triangle: 1, 5, 3)
        1, 5, 3,
        // Bottom face (triangle: 2, 3, 4 and 3, 5, 4)
        2, 3, 4,  3, 5, 4,
        // Top face (rectangle: 0, 4, 5, 1)
        0, 4, 5,  0, 5, 1,
      ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return { meshGeo: geo, edgeGeo: new THREE.EdgesGeometry(geo) };
    } else {
      // 水平加腋: 梁顶部两侧向外扩展的楔体
      // 柱面处宽度增加 haunchH (每侧), 跨中端增加 0
      const vertices = new Float32Array([
        // Front side wedge (+Z side)
        xStart, beamH, halfB,              // 0: column face, beam top, outer edge
        xStart, 0, halfB,                  // 1: column face, beam bottom, outer edge
        xStart, beamH, halfB + haunchH,    // 2: column face, beam top, haunch outer
        xStart, 0, halfB + haunchH,        // 3: column face, beam bottom, haunch outer
        xEnd, beamH, halfB,                // 4: span end, beam top, outer edge
        xEnd, 0, halfB,                    // 5: span end, beam bottom, outer edge
      ]);
      const indices = [
        // Column face (rect: 0,1,3,2)
        0, 1, 3,  0, 3, 2,
        // Outer face (tri: 2,3,4 and 3,5,4)
        2, 3, 4,  3, 5, 4,
        // Top face (tri: 0,2,4)
        0, 2, 4,
        // Bottom face (tri: 1,5,3)
        1, 5, 3,
        // Inner face (rect: 0,4,5,1)
        0, 4, 5,  0, 5, 1,
      ];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      // Back side wedge (-Z side) - mirror
      const verticesBack = new Float32Array([
        xStart, beamH, -halfB,              // 0
        xStart, 0, -halfB,                  // 1
        xStart, beamH, -halfB - haunchH,    // 2
        xStart, 0, -halfB - haunchH,        // 3
        xEnd, beamH, -halfB,                // 4
        xEnd, 0, -halfB,                    // 5
      ]);
      const geoBack = new THREE.BufferGeometry();
      geoBack.setAttribute('position', new THREE.BufferAttribute(verticesBack, 3));
      geoBack.setIndex(indices);
      geoBack.computeVertexNormals();

      // Merge both sides
      const merged = new THREE.BufferGeometry();
      const allVerts = new Float32Array(12 * 3);
      allVerts.set(vertices, 0);
      allVerts.set(verticesBack, 18);
      const allIndices = [...indices, ...indices.map(i => i + 6)];
      merged.setAttribute('position', new THREE.BufferAttribute(allVerts, 3));
      merged.setIndex(allIndices);
      merged.computeVertexNormals();

      return { meshGeo: merged, edgeGeo: new THREE.EdgesGeometry(merged) };
    }
  }, [beamLen, beamH, beamB, haunchLen, haunchH, haunchType, side]);

  return (
    <group>
      <mesh geometry={meshGeo}>
        <meshPhysicalMaterial color="#A0AEC0" transparent opacity={opacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
      </mesh>
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial color="#718096" transparent opacity={0.6} />
      </lineSegments>
    </group>
  );
}

/* Camera controller */
function CameraController({ targetPosition, length, height, depth, centerY }: {
  targetPosition: [number, number, number] | null; length: number; height: number; depth: number; centerY: number;
}) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera) || !size.height) return;
    const target = new THREE.Vector3(0, centerY, 0);
    const direction = new THREE.Vector3(...(targetPosition ?? [1.7, 1.1, 4])).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * size.width / size.height;
    let distance = 1;
    // Fit projected support/beam bounds, including depth, to the actual canvas aspect ratio.
    for (const x of [-length / 2, length / 2]) {
      for (const y of [-height * .85, height * .85]) {
        for (const z of [-depth / 2, depth / 2]) {
          const corner = new THREE.Vector3(x, y, z);
          const forward = corner.dot(direction);
          distance = Math.max(distance, Math.abs(corner.dot(right)) / tanH + forward, Math.abs(corner.dot(up)) / tanV + forward);
        }
      }
    }
    camera.position.copy(target).addScaledVector(direction, distance * 1.08);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }, [targetPosition, camera, size.width, size.height, length, height, depth, centerY]);
  return null;
}

function formatSideBarAnchorDesc(prefix: 'G' | 'N', anchor: ReturnType<typeof calcBeamSideBarAnchor>): string {
  if (prefix === 'G') {
    return `构造直锚 15d=${anchor.straightLen}mm`;
  }
  return formatAnchorDesc(anchor);
}

function BeamScene({ params, selected, onSelect, cutPosition, concreteOpacity, showDimensions, visibleGroups, activeGroup, renderMode }: {
  params: BeamParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void; cutPosition: number | null; concreteOpacity: number;
  showDimensions: boolean; visibleGroups?: Set<string>; activeGroup: string | null; renderMode: RebarRenderMode;
}) {
  const bm = params.b * S;
  const hm = params.h * S;
  const COVER = (params.cover || 25) * S;
  const HC = (params.hc || 500) * S; // 柱截面宽度
  const SUPPORT_DEPTH = (params.supportDepth || Math.max(params.b, 600)) * S;

  // ============ 多跨布局 (支持各跨独立宽度/跨长) ============
  const spanCount = params.spanCount || 1;
  const spanLengthsMm: number[] = (params.spanLengths && params.spanLengths.length === spanCount)
    ? params.spanLengths
    : Array(spanCount).fill(params.spanLength || 4000);
  const spanWidthsMm: number[] = (params.spanWidths && params.spanWidths.length === spanCount)
    ? params.spanWidths
    : Array(spanCount).fill(params.b);
  const TOTAL_NET = spanLengthsMm.reduce((s, l) => s + l * S, 0) + (spanCount - 1) * HC;
  const spanLayouts = useMemo(() => {
    const arr: { center: number; leftFace: number; rightFace: number; lenS: number; bS: number }[] = [];
    let cursor = -TOTAL_NET / 2;
    for (let i = 0; i < spanCount; i++) {
      const lenS = spanLengthsMm[i] * S;
      const leftFace = cursor;
      const rightFace = leftFace + lenS;
      arr.push({ leftFace, rightFace, center: (leftFace + rightFace) / 2, lenS, bS: spanWidthsMm[i] * S });
      cursor = rightFace + HC;
    }
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spanCount, TOTAL_NET, HC, JSON.stringify(spanLengthsMm), JSON.stringify(spanWidthsMm)]);
  // 柱位置 (n+1 根)
  const colPositions = useMemo(() => {
    const cols: number[] = [];
    cols.push(spanLayouts[0].leftFace - HC / 2); // 左端柱
    for (let i = 1; i < spanCount; i++) cols.push(spanLayouts[i].leftFace - HC / 2); // 中间柱
    cols.push(spanLayouts[spanCount - 1].rightFace + HC / 2); // 右端柱
    return cols;
  }, [spanLayouts, HC, spanCount]);

  const topR = parseRebar(params.top);
  const botR = parseRebarBottom(params.bottom);
  const stir = parseStirrup(params.stirrup);
  const leftR = params.leftSupport ? parseRebar(params.leftSupport) : null;
  const rightR = params.rightSupport ? parseRebar(params.rightSupport) : null;
  const explicitInnerR = (spanCount > 1 && params.innerSupport) ? parseRebar(params.innerSupport) : null;
  const innerR = spanCount > 1 ? (explicitInnerR ?? rightR ?? leftR) : null;
  const innerSupportSpec = params.innerSupport || params.rightSupport || params.leftSupport || '';
  const STIR_D = stir.diameter * S; // 箍筋直径

  // 箍筋中心线尺寸（保护层外皮→箍筋中心）
  // GB50010: 保护层 = 混凝土表面到最近钢筋（箍筋）外皮的距离
  const stirCenterW = bm - 2 * COVER - STIR_D;   // 箍筋中心线宽度
  const stirCenterH = hm - 2 * COVER - STIR_D;   // 箍筋中心线高度
  // 兼容原有变量名（加腋区等处使用）
  const innerW = stirCenterW;
  const innerH = stirCenterH;

  // Haunch parameters
  const haunchType = params.haunchType || 'none';
  const haunchLen = (params.haunchLength || 0) * S;
  const haunchH = (params.haunchHeight || 0) * S;
  const haunchSide = params.haunchSide || 'both';
  const hasLeftHaunch = haunchType !== 'none' && haunchLen > 0 && haunchH > 0 && (haunchSide === 'both' || haunchSide === 'left');
  const hasRightHaunch = haunchType !== 'none' && haunchLen > 0 && haunchH > 0 && (haunchSide === 'both' || haunchSide === 'right');

  const longitudinal = useMemo(() => beamLongitudinalLayout(params), [params]);
  const rowsFor = (role: BeamBarRole) => longitudinal.rows.filter(r => r.role === role);
  const barsFor = (role: BeamBarRole) => rowsFor(role).flatMap(r => r.zs.map(z => ({y:r.y,z,diameter:r.diameter})));
  const topAnchor = rowsFor('top')[0].anchor;
  const botAnchor = rowsFor('bottom')[0].anchor;

  // 22G101 dense zone: max(2h, 500mm) from column face
  const denseZoneMm = beamDenseZoneLength(params.h);
  const denseZone = denseZoneMm * S;
  // stirrups useMemo 专用原始值（避免依赖整个 params）
  const botDiaBase = botR.diameter;
  const seismicGrade = params.seismicGrade;
  const beamH = params.h;

  // Per-span stirrup positions (relative to each span's center)
  const stirrupsPerSpan = useMemo(() => {
    const denseS = stir.spacingDense * S;
    const normalS = stir.spacingNormal * S;
    const h0 = hm - COVER - (botDiaBase * S / 2);
    const hbCoeff = seismicGrade === '一级' ? 2.0 : 1.5;

    return spanLayouts.map((span) => {
      const positions: { x: number; zone: 'dense' | 'normal' }[] = [];
      const halfLen = span.lenS / 2;
      const haunchDense1 = haunchType !== 'none'
        ? Math.max(hbCoeff * beamH * S, 0.5, (haunchLen + 0.5 * h0))
        : 0;
      const haunchStirZone = haunchType === 'vertical' ? haunchDense1 : haunchLen;
      const leftSkip = hasLeftHaunch ? haunchStirZone : 0;
      const rightSkip = hasRightHaunch ? haunchStirZone : 0;

      const leftStart = -halfLen + leftSkip + 0.05;
      for (let x = leftStart; x < -halfLen + denseZone; x += denseS) positions.push({ x, zone: 'dense' });
      const normalStart = -halfLen + Math.max(denseZone, leftSkip);
      const normalEnd = halfLen - Math.max(denseZone, rightSkip);
      for (let x = normalStart; x < normalEnd; x += normalS) positions.push({ x, zone: 'normal' });
      const rightEnd = halfLen - rightSkip - 0.05;
      for (let x = halfLen - denseZone; x < rightEnd; x += denseS) positions.push({ x, zone: 'dense' });
      return positions;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stir.spacingDense, stir.spacingNormal, denseZone, haunchType, hasLeftHaunch, hasRightHaunch, haunchLen, hm, COVER, botDiaBase, seismicGrade, beamH, JSON.stringify(spanLayouts)]);


  const topBarY1 = rowsFor('top')[0].y;
  const botBarY1 = rowsFor('bottom')[0].y;
  const supportDia = (leftR?.diameter || rightR?.diameter || innerR?.diameter || topR.diameter) * S;
  const supportBarY1 = rowsFor('leftSupport')[0]?.y ?? rowsFor('rightSupport')[0]?.y ?? topBarY1 - topR.diameter*S/2 - supportDia/2 - .025;
  const leftBars = barsFor('leftSupport'), rightBars = barsFor('rightSupport');
  const leftAnchor = rowsFor('leftSupport')[0]?.anchor;
  const rightAnchor = rowsFor('rightSupport')[0]?.anchor;

  const isSelected = (type: string, setId?: string) => {
    if (setId && selected?.setId) {
      return selected.setId === setId || (selected.setId === 'beam.stirrup' && setId.startsWith('beam.stirrup.'));
    }
    return selected?.type === type;
  };
  const sideBarSetId = 'beam.sideBar';
  const tieBarSetId = 'beam.tieBar';
  const sideBarSelected = isSelected('sideBar', sideBarSetId);
  const tieBarSelected = isSelected('tieBar', tieBarSetId);
  const isRelated = (setId?: string) => isRelatedRebarSet(setId, selected);
  const gv = (g: string) => !visibleGroups || visibleGroups.has(g);

  // parseSideBar 缓存（避免多处重复解析）
  const sideInfo = useMemo(() => params.sideBar ? parseSideBar(params.sideBar) : null, [params.sideBar]);

  // 拉筋曲线缓存（参数不随跨变化，提到循环外）
  // 22G101: 拉筋两端135°弯钩勾住腰筋
  const memoTieCurve = useMemo((): THREE.Curve<THREE.Vector3> | null => {
    if (!sideInfo) return null;
    const sideBarZ = resolveTieSideOffsetMm({
      sectionWidthMm: params.b,
      coverMm: params.cover || 25,
      stirrupDiameterMm: stir.diameter,
      sideBarDiameterMm: sideInfo.diameter,
    }) * S;
    const tieInfo = params.tieBar ? parseTieBar(params.tieBar) : autoTieBar(params.b, stir.grade, stir.diameter);
    if (!tieInfo) return null;
    return createTieBarCurves({
      sideOffset: sideBarZ,
      tieDiameter: tieInfo.diameter,
      sideBarDiameter: sideInfo.diameter,
    }).fullCurve;
  }, [sideInfo, params.tieBar, params.b, params.cover, stir.grade, stir.diameter]);

  return (
    <>
      <mesh position={[0, hm / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[TOTAL_NET + HC * 2 + 1, hm + 1, bm + 1]} />
        <meshBasicMaterial />
      </mesh>

      {/* Column stubs (all n+1) */}
      {colPositions.map((cx, ci) => {
        const isEnd = ci === 0 || ci === colPositions.length - 1;
        const isLeft = ci === 0;
        const depthV = isEnd && haunchType === 'horizontal'
          ? (isLeft ? (hasLeftHaunch ? SUPPORT_DEPTH + 2 * haunchH : SUPPORT_DEPTH) : (hasRightHaunch ? SUPPORT_DEPTH + 2 * haunchH : SUPPORT_DEPTH))
          : SUPPORT_DEPTH;
        const haunchD = isEnd && haunchType === 'vertical'
          ? (isLeft ? (hasLeftHaunch ? haunchH : 0) : (hasRightHaunch ? haunchH : 0))
          : 0;
        return <ColumnStub key={`col-${ci}`} x={cx} width={HC} beamH={hm} depth={depthV} haunchDepth={haunchD} />;
      })}

      {/* Beam concrete body — per-span to support variable widths */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('concrete')} dim={!!activeGroup && activeGroup !== ('concrete')} reference>
      {spanLayouts.map((span, si) => (
        <group key={`beam-body-${si}`}>
          <mesh position={[span.center, hm / 2, 0]}>
            <boxGeometry args={[span.lenS, hm, span.bS]} />
            <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[span.center, hm / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(span.lenS, hm, span.bS)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
        </group>
      ))}

      {/* Haunch geometry (per-span) */}
      {spanLayouts.map((span, si) => (
        <group key={`haunch-geo-${si}`} position={[span.center, 0, 0]}>
          {hasLeftHaunch && (
            <HaunchShape beamLen={span.lenS} beamH={hm} beamB={span.bS}
              haunchLen={haunchLen} haunchH={haunchH} haunchType={haunchType as 'horizontal' | 'vertical'}
              side="left" opacity={concreteOpacity * 1.5} />
          )}
          {hasRightHaunch && (
            <HaunchShape beamLen={span.lenS} beamH={hm} beamB={span.bS}
              haunchLen={haunchLen} haunchH={haunchH} haunchType={haunchType as 'horizontal' | 'vertical'}
              side="right" opacity={concreteOpacity * 1.5} />
          )}
        </group>
      ))}
      </ConstructionGroup>

      {/* Every longitudinal row uses its own physical bend plane at both ends. */}
      {longitudinal.rows.map(row => {
        const through = row.role === 'top' || row.role === 'bottom';
        const right = row.role.startsWith('right');
        const signs = through ? [-1,1] : [right ? 1 : -1];
        const bodyLength = row.bodyLengthMm*S;
        const bodyX = through ? 0 : (right ? 1 : -1)*(TOTAL_NET/2-bodyLength/2);
        const color = through ? COLOR_REBAR : COLOR_SUPPORT;
        const hiColor = through ? COLOR_REBAR_HI : COLOR_SUPPORT_HI;
        const a = row.anchor;
        const info = {type:row.role, label:`${BEAM_BAR_NAMES[row.role]} · 第${row.row+1}排`,
          detail:`${row.count}根 ${gradeLabel(row.grade)} Φ${row.diameter}，${formatAnchorDesc(a)}`,
          setId:`beam.${row.role}.row${row.row}`};
        return <ConstructionGroup key={`${row.role}-${row.row}`} enabled={!!visibleGroups} visible={gv(through?row.role:'support')} dim={!!activeGroup && activeGroup !== (through?row.role:'support')}>
          {row.zs.map((z,i) => <group key={i}>
            <RebarBar position={[bodyX,row.y,z]} length={bodyLength} diameter={row.diameter}
              color={color} hiColor={hiColor} info={info} selected={isSelected(row.role, info.setId)} onSelect={onSelect} renderMode={renderMode} />
            {signs.map(sign => a.canStraight
              ? <RebarBar key={sign} position={[sign*(TOTAL_NET/2+a.straightLen*S/2),row.y,z]}
                  length={a.straightLen*S} diameter={row.diameter} color={color} hiColor={hiColor}
                  info={info} selected={isSelected(row.role, info.setId)} onSelect={onSelect} renderMode={renderMode} />
              : <BentRebarEnd key={sign} position={[sign*TOTAL_NET/2,row.y,z]}
                  straightLen={a.bentStraightPart*S} bendLen={a.bentBendPart*S}
                  diameter={row.diameter} direction={row.role==='bottom'?'up':'down'} xDir={sign}
                  color={color} hiColor={hiColor} info={info} selected={isSelected(row.role, info.setId)} onSelect={onSelect} renderMode={renderMode} />)}
          </group>)}
        </ConstructionGroup>;
      })}

      {/* ====== Per-span elements (support bars, erection bars) ====== */}
      {spanLayouts.map((span, si) => {
        // Per-span support lengths
        const spanLenMmI = spanLengthsMm[si];
        const supportLenI = calcSupportRebarLength(spanLenMmI) * S;
        const isFirstSpan = si === 0;
        const isLastSpan = si === spanCount - 1;
        const hasLeftEndSupport = isFirstSpan && !!leftR;
        const hasRightEndSupport = isLastSpan && !!rightR;
        const hasInnerLeftSupport = si > 0 && !!innerR;
        const hasInnerRightSupport = si < spanCount - 1 && !!innerR;
        return (
        <ConstructionGroup key={`span-se-${si}`} position={[span.center, 0, 0]} enabled={!!visibleGroups} visible={gv('support')} dim={!!activeGroup && activeGroup !== ('support')}>
          {/* Erection bars (架立筋) */}
          {(leftR || rightR || innerR || params.erectionBar) && (() => {
            const erUser = params.erectionBar ? parseRebar(params.erectionBar) : null;
            const LAP_LEN = 150 * S;
            const leftSupportLen = (hasLeftEndSupport || hasInnerLeftSupport) ? supportLenI : 0;
            const rightSupportLen = (hasRightEndSupport || hasInnerRightSupport) ? supportLenI : 0;
            let erectionLen: number;
            let erectionX: number;
            if (leftSupportLen > 0 && rightSupportLen > 0) {
              erectionLen = span.lenS - leftSupportLen - rightSupportLen + 2 * LAP_LEN;
              erectionX = 0;
            } else if (leftSupportLen > 0) {
              erectionLen = span.lenS - leftSupportLen + LAP_LEN;
              erectionX = (-span.lenS / 2 + leftSupportLen - LAP_LEN + span.lenS / 2) / 2;
            } else if (rightSupportLen > 0) {
              erectionLen = span.lenS - rightSupportLen + LAP_LEN;
              erectionX = (-span.lenS / 2 + span.lenS / 2 - rightSupportLen + LAP_LEN) / 2;
            } else {
              erectionLen = span.lenS;
              erectionX = 0;
            }
            if (erectionLen <= 0.05) return null;
            const spanMm = spanLengthsMm[0];
            const minDia = spanMm <= 4000 ? 10 : 12;
            const erectionDia = erUser ? erUser.diameter : Math.max(minDia, 8);
            const erectionCount = erUser ? erUser.count : 2;
            const refBars = leftBars.length > 0 ? leftBars : rightBars;
            let finalErZs: number[];
            const erZRange = stirCenterW - STIR_D - erectionDia * S;
            if (erectionCount <= 2) {
              if (refBars.length >= 2) {
                const sorted = [...refBars].sort((a, b) => a.z - b.z);
                finalErZs = [
                  sorted[0].z + (supportDia / 2 + erectionDia * S / 2),
                  sorted[sorted.length - 1].z - (supportDia / 2 + erectionDia * S / 2),
                ];
              } else if (refBars.length === 1) {
                finalErZs = [
                  refBars[0].z + (supportDia / 2 + erectionDia * S / 2),
                  refBars[0].z - (supportDia / 2 + erectionDia * S / 2),
                ];
              } else {
                finalErZs = [-erZRange / 2, erZRange / 2];
              }
            } else {
              // erectionCount > 2: distribute evenly across stirrup width
              finalErZs = [];
              for (let ei = 0; ei < erectionCount; ei++) {
                finalErZs.push(-erZRange / 2 + (erZRange / Math.max(erectionCount - 1, 1)) * ei);
              }
            }
            const lapLenMm = 150;
            const LAP_LEN_VIS = lapLenMm * S;
            const lapHeight = Math.max(supportDia * 4, 0.018);
            const lapZones: React.ReactNode[] = [];
            if (leftSupportLen > 0) {
              const lapCenterX = -span.lenS / 2 + leftSupportLen - LAP_LEN_VIS / 2;
              lapZones.push(
                <mesh key="lap-zone-l" position={[lapCenterX, supportBarY1, 0]}>
                  <boxGeometry args={[LAP_LEN_VIS, lapHeight, bm * 0.92]} />
                  <meshBasicMaterial color="#D97706" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
              );
              lapZones.push(
                <lineSegments key="lap-edge-l" position={[lapCenterX, supportBarY1, 0]}>
                  <edgesGeometry args={[new THREE.BoxGeometry(LAP_LEN_VIS, lapHeight, bm * 0.92)]} />
                  <lineBasicMaterial color="#D97706" transparent opacity={0.35} />
                </lineSegments>
              );
            }
            if (rightSupportLen > 0) {
              const lapCenterX = span.lenS / 2 - rightSupportLen + LAP_LEN_VIS / 2;
              lapZones.push(
                <mesh key="lap-zone-r" position={[lapCenterX, supportBarY1, 0]}>
                  <boxGeometry args={[LAP_LEN_VIS, lapHeight, bm * 0.92]} />
                  <meshBasicMaterial color="#D97706" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
              );
              lapZones.push(
                <lineSegments key="lap-edge-r" position={[lapCenterX, supportBarY1, 0]}>
                  <edgesGeometry args={[new THREE.BoxGeometry(LAP_LEN_VIS, lapHeight, bm * 0.92)]} />
                  <lineBasicMaterial color="#D97706" transparent opacity={0.35} />
                </lineSegments>
              );
            }
            return [
              ...finalErZs.map((erZ, idx) => (
                <RebarBar key={`erection-${idx}`} position={[erectionX, supportBarY1, erZ]} length={erectionLen} diameter={erectionDia}
                  color={COLOR_ERECTION} hiColor={COLOR_ERECTION_HI}
                  info={{ type: 'erection', label: '架立筋', detail: `${params.erectionBar || `${erectionCount}Φ${erectionDia}`}，第${si + 1}跨，与相邻支座负筋搭接${lapLenMm}mm(≥150mm)` }}
                  selected={isSelected('erection')} onSelect={onSelect} renderMode={renderMode} />
              )),
              ...lapZones,
            ];
          })()}
        </ConstructionGroup>
        );
      })}

      {/* Inner support bars (中间支座负筋) — one bar per intermediate column, spans ln/3 left + hc + ln/3 right */}
      {innerR && spanCount > 1 && (() => {
        const innerBarZRange = stirCenterW - STIR_D - innerR.diameter * S;
        const innerBarsZ = layoutBars(innerR, innerBarZRange, [supportBarY1]);
        const nodes: React.ReactNode[] = [];
        for (let ci = 0; ci < spanCount - 1; ci++) {
          const leftSpanLen = spanLengthsMm[ci];
          const rightSpanLen = spanLengthsMm[ci + 1];
          const leftLen = calcSupportRebarLength(leftSpanLen) * S;
          const rightLen = calcSupportRebarLength(rightSpanLen) * S;
          const barTotalLen = leftLen + HC + rightLen;
          const barCenterX = (spanLayouts[ci].rightFace - leftLen + spanLayouts[ci + 1].leftFace + rightLen) / 2;
          const leftLenMm = calcSupportRebarLength(leftSpanLen);
          const rightLenMm = calcSupportRebarLength(rightSpanLen);
          innerBarsZ.forEach((bar, bi) => {
            nodes.push(
              <RebarBar key={`inner-${ci}-${bi}`}
                position={[barCenterX, bar.y, bar.z]}
                length={barTotalLen}
                diameter={innerR.diameter}
                color={COLOR_SUPPORT} hiColor={COLOR_SUPPORT_HI}
                info={{ type: 'innerSupport', label: `中间支座负筋(第${ci + 1}内柱)`, detail: `${innerSupportSpec} · ${innerR.count}根 ${gradeLabel(innerR.grade)} Φ${innerR.diameter}，左跨 ln/3=${leftLenMm}mm，右跨 ln/3=${rightLenMm}mm，贯通柱 hc=${params.hc || 500}mm${params.innerSupport ? '' : '（未填中间支座，按端支座筋兜底表达）'}` }}
                selected={isSelected('innerSupport')} onSelect={onSelect} renderMode={renderMode} />
            );
          });
        }
        return <ConstructionGroup enabled={!!visibleGroups} visible={gv('support')} dim={!!activeGroup && activeGroup !== ('support')}>{nodes}</ConstructionGroup>;
      })()}

      {/* Side bars (腰筋/抗扭筋) - G前缀构造腰筋, N前缀抗扭筋 */}
      <ConstructionGroup enabled={!!visibleGroups} visible={gv('sideBar')} dim={!!activeGroup && activeGroup !== ('sideBar')}>
      {sideInfo && (() => {
        const perSide = Math.ceil(sideInfo.count / 2); // 每侧根数 (总数/2，两侧对称)
        const sideDia = sideInfo.diameter;
        // Y 坐标: 在上部筋和下部筋之间均匀分布
        const yTop = topBarY1 - topR.diameter * S / 2 - Math.max(sideDia * S, 25 * S);
        const yBot = botBarY1 + botR.diameter * S / 2 + Math.max(sideDia * S, 25 * S);
        // 22G101: 腰筋均匀分布在梁腹中部，不贴近上下主筋
        // 将上下主筋之间分成 (perSide+1) 等份，腰筋在内部等分点
        const yPositions: number[] = [];
        for (let i = 0; i < perSide; i++) {
          yPositions.push(yBot + (yTop - yBot) * (i + 1) / (perSide + 1));
        }
        // Z 坐标: 紧贴箍筋内侧，梁两侧面
        const sideZ = resolveTieSideOffsetMm({
          sectionWidthMm: params.b,
          coverMm: params.cover || 25,
          stirrupDiameterMm: stir.diameter,
          sideBarDiameterMm: sideDia,
        }) * S;
        const prefixLabel = sideInfo.prefix === 'G' ? '构造腰筋' : '抗扭筋';
        // 22G101: 腰筋锚固 — G构造腰筋锚固15d, N抗扭筋同纵筋(laE)
        const sideAnchor = calcBeamSideBarAnchor(sideInfo.prefix, sideInfo.grade, sideDia, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);
        const sideAnchorDesc = formatSideBarAnchorDesc(sideInfo.prefix, sideAnchor);
        const bars: React.ReactNode[] = [];
        const zSides = [sideZ, -sideZ];
        const sideGroupCount = yPositions.length * zSides.length;
        const sideGroupRange = formatDistributionRange(0, Math.round(TOTAL_NET / S));
        yPositions.forEach((y, yi) => {
          zSides.forEach((z, zi) => {
            const sideKey = zi === 0 ? 'f' : 'b';
            const instanceIndex = yi * zSides.length + zi + 1;
            const sideBarInfo: RebarMeshInfo = {
              type: 'sideBar',
              label: prefixLabel,
              detail: `${params.sideBar} · ${sideInfo.count}根(每侧${perSide}根) ${gradeLabel(sideInfo.grade)} Φ${sideDia}，端锚: ${sideAnchorDesc}`,
              setId: sideBarSetId,
              instanceIndex,
              groupLabel: prefixLabel,
              groupCount: sideGroupCount,
              distributionRange: sideGroupRange,
              relatedSetIds: [tieBarSetId],
            };
            // 梁内主体
            bars.push(
              <RebarBar key={`side-${sideKey}-${yi}`} position={[0, y, z]} length={TOTAL_NET} diameter={sideDia}
                color={COLOR_SIDEBAR} hiColor={COLOR_SIDEBAR_HI}
                info={sideBarInfo}
                selected={isSelected('sideBar', sideBarSetId)} highlighted={tieBarSelected || isRelated(sideBarSetId)} onSelect={onSelect} renderMode={renderMode}
                />
            );
            // 左端锚固
            if (sideAnchor.canStraight) {
              bars.push(
                <RebarBar key={`side-${sideKey}-${yi}-la`}
                  position={[-TOTAL_NET / 2 - sideAnchor.straightLen * S / 2, y, z]}
                  length={sideAnchor.straightLen * S} diameter={sideDia}
                  color={COLOR_SIDEBAR} hiColor={COLOR_SIDEBAR_HI}
                  info={{ ...sideBarInfo, label: `${prefixLabel}直锚`, detail: sideAnchorDesc }}
                  selected={isSelected('sideBar', sideBarSetId)} highlighted={tieBarSelected || isRelated(sideBarSetId)} onSelect={onSelect} renderMode={renderMode}
                  />
              );
            } else {
              bars.push(
                <BentRebarEnd key={`side-${sideKey}-${yi}-la`}
                  position={[-TOTAL_NET / 2, y, z]}
                  straightLen={sideAnchor.bentStraightPart * S}
                  bendLen={sideAnchor.bentBendPart * S}
                  diameter={sideDia} direction="down" color={COLOR_SIDEBAR}
                  hiColor={COLOR_SIDEBAR_HI}
                  info={{ ...sideBarInfo, label: `${prefixLabel}弯锚`, detail: sideAnchorDesc }}
                  selected={isSelected('sideBar', sideBarSetId)} highlighted={tieBarSelected || isRelated(sideBarSetId)} onSelect={onSelect}
                  renderMode={renderMode}
                  xDir={-1} />
              );
            }
            // 右端锚固
            if (sideAnchor.canStraight) {
              bars.push(
                <RebarBar key={`side-${sideKey}-${yi}-ra`}
                  position={[TOTAL_NET / 2 + sideAnchor.straightLen * S / 2, y, z]}
                  length={sideAnchor.straightLen * S} diameter={sideDia}
                  color={COLOR_SIDEBAR} hiColor={COLOR_SIDEBAR_HI}
                  info={{ ...sideBarInfo, label: `${prefixLabel}直锚`, detail: sideAnchorDesc }}
                  selected={isSelected('sideBar', sideBarSetId)} highlighted={tieBarSelected || isRelated(sideBarSetId)} onSelect={onSelect} renderMode={renderMode}
                  />
              );
            } else {
              bars.push(
                <BentRebarEnd key={`side-${sideKey}-${yi}-ra`}
                  position={[TOTAL_NET / 2, y, z]}
                  straightLen={sideAnchor.bentStraightPart * S}
                  bendLen={sideAnchor.bentBendPart * S}
                  diameter={sideDia} direction="down" color={COLOR_SIDEBAR}
                  hiColor={COLOR_SIDEBAR_HI}
                  info={{ ...sideBarInfo, label: `${prefixLabel}弯锚`, detail: sideAnchorDesc }}
                  selected={isSelected('sideBar', sideBarSetId)} highlighted={tieBarSelected || isRelated(sideBarSetId)} onSelect={onSelect}
                  renderMode={renderMode}
                  xDir={1} />
              );
            }
          });
        });
        return bars;
      })()}

      </ConstructionGroup>

      {/* ====== Per-span elements (tie bars, stirrups) ====== */}
      {spanLayouts.map((span, si) => (
        <group key={`span-ts-${si}`} position={[span.center, 0, 0]}>
          {/* Tie bars (拉筋) */}
          <ConstructionGroup enabled={!!visibleGroups} visible={gv('tieBar')} dim={!!activeGroup && activeGroup !== ('tieBar')}>
          {sideInfo && memoTieCurve && (() => {
            const perSide = Math.ceil(sideInfo.count / 2);
            const sideDia = sideInfo.diameter;
            const yTop = topBarY1 - topR.diameter * S / 2 - Math.max(sideDia * S, 25 * S);
            const yBot = botBarY1 + botR.diameter * S / 2 + Math.max(sideDia * S, 25 * S);
            const tieYPositions: number[] = [];
            for (let i = 0; i < perSide; i++) {
              tieYPositions.push(yBot + (yTop - yBot) * (i + 1) / (perSide + 1));
            }
            const tieInfo = params.tieBar ? parseTieBar(params.tieBar) : autoTieBar(params.b, stir.grade, stir.diameter);
            if (!tieInfo) return null;
            const tieDia = tieInfo.diameter;
            const tieLabel = params.tieBar || tieBarToString(tieInfo);
            const tieDiaS = tieDia * S;
            const tieDetail = `${tieLabel} · ${gradeLabel(tieInfo.grade)} Φ${tieDia}，间距${stir.spacingNormal}mm(同箍筋非加密区)，两端135°弯钩`;
            const tieSpacing = stir.spacingNormal * S;
            const tieBars: React.ReactNode[] = [];
            const originalTieXs: number[] = [];
            for (let sx = -span.lenS / 2 + tieSpacing * 1.5; sx < span.lenS / 2 - tieSpacing * 0.5; sx += tieSpacing) {
              originalTieXs.push(sx);
            }
            // Account for the outer hoop's layer drift plus both physical radii.
            const hoopExtent = createCompositeStirrupSpec({ widthMm: params.b - 2 * COVER / S - stir.diameter,
              barPositionsMm: beamStirrupBarPositions(params.b - 2 * COVER / S - stir.diameter, stir.diameter, params.top, params.bottom),
              heightMm: params.h - 2 * COVER / S - stir.diameter, diameterMm: stir.diameter, legs: stir.legs }).normalExtentMm * S;
            const tieXs = staggerTiePositions(originalTieXs, (stirrupsPerSpan[si] || []).map(s => s.x),
              hoopExtent + tieDiaS / 2 + .002, -span.lenS / 2, span.lenS / 2);
            const tieGroupCount = tieXs.length * tieYPositions.length;
            const tieRange = tieXs.length > 0
              ? formatDistributionRange(
                  Math.round((span.center + tieXs[0] + TOTAL_NET / 2) / S),
                  Math.round((span.center + tieXs[tieXs.length - 1] + TOTAL_NET / 2) / S),
                  stir.spacingNormal,
                )
              : formatDistributionRange(0, Math.round(span.lenS / S), stir.spacingNormal);
            tieXs.forEach((sx, xi) => {
              tieYPositions.forEach((y, yi) => {
                const instanceIndex = xi * tieYPositions.length + yi + 1;
                tieBars.push(
                  <TieBarMesh key={`tie-${si}-${yi}-${sx.toFixed(4)}`}
                    position={[sx, y, 0]} curve={memoTieCurve} radius={tieDiaS / 2}
                    info={{
                      type: 'tieBar',
                      label: '拉筋',
                      detail: tieDetail,
                      setId: tieBarSetId,
                      instanceIndex,
                      groupLabel: '梁拉筋',
                      groupCount: tieGroupCount,
                      distributionRange: tieRange,
                      relatedSetIds: [sideBarSetId],
                    }}
                    selected={isSelected('tieBar', tieBarSetId)} highlighted={sideBarSelected || isRelated(tieBarSetId)} onSelect={onSelect} renderMode={renderMode} />
                );
              });
            });
            return tieBars;
          })()}

          </ConstructionGroup>
          {/* Stirrups */}
          <ConstructionGroup enabled={!!visibleGroups} visible={gv('stirrup')} dim={!!activeGroup && activeGroup !== ('stirrup')}>
          {(stirrupsPerSpan[si] || []).map((s, i) => {
            const zoneColor = s.zone === 'dense' ? COLOR_STIRRUP_DENSE : COLOR_STIRRUP_NORMAL;
            const zoneHiColor = s.zone === 'dense' ? COLOR_STIRRUP_DENSE_HI : COLOR_STIRRUP_NORMAL_HI;
            const zoneLabel = s.zone === 'dense' ? '箍筋(加密区)' : '箍筋(非加密区)';
            const zoneKey = s.zone === 'normal' ? 'normal' : (s.x < 0 ? 'dense-left' : 'dense-right');
            const setId = `beam.stirrup.span-${si}.${zoneKey}`;
            const groupStirrups = (stirrupsPerSpan[si] || []).filter((item) => {
              const itemZoneKey = item.zone === 'normal' ? 'normal' : (item.x < 0 ? 'dense-left' : 'dense-right');
              return itemZoneKey === zoneKey;
            });
            const instanceIndex = groupStirrups.findIndex((item) => item.x === s.x && item.zone === s.zone) + 1;
            const groupStart = groupStirrups[0]?.x ?? s.x;
            const groupEnd = groupStirrups[groupStirrups.length - 1]?.x ?? s.x;
            const spacingMm = s.zone === 'dense' ? stir.spacingDense : stir.spacingNormal;
            return (
              <StirrupRing key={`s${si}-${i}`} x={s.x} width={span.bS - 2 * COVER - STIR_D} height={stirCenterH} diameter={stir.diameter}
                color={zoneColor} hiColor={zoneHiColor} cover={COVER} legs={stir.legs}
                barZPositions={beamStirrupBarPositions((span.bS - 2 * COVER - STIR_D) / S, stir.diameter, params.top, params.bottom).map(z => z * S)}
                info={{
                  type: 'stirrup',
                  label: zoneLabel,
                  detail: `${params.stirrup} · ${gradeLabel(stir.grade)} Φ${stir.diameter} 加密区${denseZoneMm}mm(=max(2h,500))/${stir.spacingDense} 非加密区/${stir.spacingNormal} ${stir.legs}肢箍`,
                  setId,
                  instanceIndex,
                  groupLabel: `第${si + 1}跨${zoneKey === 'normal' ? '非加密区箍筋' : zoneKey === 'dense-left' ? '左加密区箍筋' : '右加密区箍筋'}`,
                  groupCount: groupStirrups.length,
                  distributionRange: formatDistributionRange(
                    Math.round((span.center + groupStart + TOTAL_NET / 2) / S),
                    Math.round((span.center + groupEnd + TOTAL_NET / 2) / S),
                    spacingMm,
                  ),
                }}
                selected={isSelected('stirrup', setId)} onSelect={onSelect} renderMode={renderMode} />
            );
          })}
          </ConstructionGroup>
        </group>
      ))}

      {/* Haunch additional bars (附加筋) and haunch zone stirrups — per-span */}
      {spanLayouts.map((span, si) => (
        <ConstructionGroup key={`span-haunch-${si}`} position={[span.center, 0, 0]} enabled={!!visibleGroups} visible={gv('haunch')} dim={!!activeGroup && activeGroup !== ('haunch')}>
      {haunchType === 'vertical' && (() => {
        // 22G101-1 2-36: 竖向加腋构造
        // 附加筋: 柱内水平锚固(≥laE) → 沿加腋斜面延伸穿入梁内(≥laE)
        const haunchBars: React.ReactNode[] = [];
        const sides: ('left' | 'right')[] = [];
        if (hasLeftHaunch) sides.push('left');
        if (hasRightHaunch) sides.push('right');

        const haunchLaE = calcLaE(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade);
        const anchorInCol = Math.min(haunchLaE * S, HC - COVER);

        // 斜面几何: 柱面(y=0, 梁底) → c₁处(y=haunchH, 从加腋底算)
        // 加腋底面斜率 = haunchH / haunchLen
        const slopeLen = Math.sqrt(haunchLen * haunchLen + haunchH * haunchH);
        // 斜面需延伸≥laE（从柱面算起的斜面长度）
        const extRatio = Math.max((haunchLaE * S) / slopeLen, 1.0);
        // 不超过梁跨中
        const maxRatio = (span.lenS / 2) / haunchLen * 0.85;
        const finalRatio = Math.min(extRatio, maxRatio);

        // 附加筋根数 = 梁底纵筋第一排根数（22G101: 同梁纵筋第一排）
        const maxPerRow = Math.floor(innerW / (botR.diameter * S * 2.5)) + 1;
        const firstRowCount = botR.count > maxPerRow ? Math.ceil(botR.count / 2) : botR.count;
        const barCount = firstRowCount;
        const barSpacing = innerW / Math.max(barCount - 1, 1);

        // 箍筋加密区1范围 (22G101-1 2-36)
        // 一级: ≥2.0hb 且 ≥500 且 ≥ c₁+0.5h₀
        // 二~四级: ≥1.5hb 且 ≥500 且 ≥ c₁+0.5h₀
        const h0 = hm - COVER - botR.diameter * S / 2; // 有效高度
        const h0mm = h0 / S;
        const hbCoeff = params.seismicGrade === '一级' ? 2.0 : 1.5;
        const denseZone1mm = Math.max(hbCoeff * params.h, 500, (params.haunchLength || 0) + 0.5 * h0mm);
        const denseZone1 = denseZone1mm * S;

        sides.forEach(sd => {
          const sign = sd === 'left' ? -1 : 1;
          const xColFace = sign * span.lenS / 2;
          const xColInner = xColFace + sign * anchorInCol;

          // 斜面延伸终点
          const xSlopeEnd = xColFace - sign * haunchLen * finalRatio;
          const ySlopeEnd = Math.min(-haunchH + haunchH * finalRatio + COVER, hm - COVER);

          for (let i = 0; i < barCount; i++) {
            const z = -innerW / 2 + i * barSpacing;

            // 柱内水平锚固段 (y = -haunchH + COVER)
            haunchBars.push(
              <RebarBar key={`hba-${sd}-${i}`}
                position={[(xColInner + xColFace) / 2, -haunchH + COVER, z]}
                length={anchorInCol} diameter={botR.diameter}
                color={COLOR_HAUNCH} hiColor={COLOR_HAUNCH_HI}
                renderOrder={2}
                info={{ type: 'bottom', label: '附加筋(柱内锚固)', detail: `伸入柱内${Math.round(anchorInCol / S)}mm(≥laE=${haunchLaE}mm)，Φ${botR.diameter}` }}
                selected={isSelected('bottom')} onSelect={onSelect} renderMode={renderMode} />
            );
            // 斜面段: 从柱面沿斜面穿过梁底纵筋延伸入梁内
            haunchBars.push(
              <SlopedRebarBar key={`hbs-${sd}-${i}`}
                start={[xColFace, -haunchH + COVER, z]}
                end={[xSlopeEnd, ySlopeEnd, z]}
                diameter={botR.diameter}
                color={COLOR_HAUNCH} hiColor={COLOR_HAUNCH_HI}
                info={{ type: 'bottom', label: '附加筋(斜面)', detail: `沿加腋斜面延伸入梁内，斜面长≥laE=${haunchLaE}mm，Φ${botR.diameter}` }}
                selected={isSelected('bottom')} onSelect={onSelect} renderMode={renderMode} />
            );
          }

          // 加腋区箍筋: 加密区1范围内，间距同梁端加密区
          // 箍筋从柱面到 min(denseZone1, span.lenS/2) 范围
          const stirZoneLen = Math.min(denseZone1, span.lenS / 2 - 0.05);
          const haunchStirCount = Math.max(Math.ceil(stirZoneLen / (stir.spacingDense * S)), 1);
          for (let j = 0; j < haunchStirCount; j++) {
            const t = (j + 0.5) / haunchStirCount;
            const sxActual = xColFace - sign * stirZoneLen * t;
            // 当前位置的加腋深度 (在加腋范围内才有)
            const distFromCol = Math.abs(sxActual - xColFace);
            const inHaunchZone = distFromCol <= haunchLen;
            const localDepth = inHaunchZone ? haunchH * (1 - distFromCol / haunchLen) : 0;
            // 箍筋高度: 梁高 + 当前加腋深度
            const totalH = (hm - COVER) - (-localDepth + COVER);
            haunchBars.push(
              <StirrupRing key={`hs-${sd}-${j}`}
                x={sxActual}
                width={span.bS - 2 * COVER - STIR_D}
                height={totalH - STIR_D}
                diameter={stir.diameter}
                color={COLOR_STIRRUP} hiColor={COLOR_STIRRUP_HI}
                cover={-localDepth + COVER} legs={stir.legs}
                barZPositions={beamStirrupBarPositions((span.bS - 2 * COVER - STIR_D) / S, stir.diameter, params.top, params.bottom).map(z => z * S)}
                info={{ type: 'stirrup', label: '加腋区箍筋', detail: `加密区1=${Math.round(denseZone1mm)}mm，间距${stir.spacingDense}mm${inHaunchZone ? '，高度含加腋' : ''}` }}
                selected={isSelected('stirrup')} onSelect={onSelect} renderMode={renderMode} />
            );
          }
        });
        return haunchBars;
      })()}

      {haunchType === 'horizontal' && (() => {
        const haunchBars: React.ReactNode[] = [];
        const sides: ('left' | 'right')[] = [];
        if (hasLeftHaunch) sides.push('left');
        if (hasRightHaunch) sides.push('right');
        // 使用实际 laE 计算锚固长度
        const haunchLaE = calcLaE(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade);
        const anchorInCol = Math.min(haunchLaE * S, HC - COVER);
        const halfB = bm / 2;

        sides.forEach(sd => {
          const sign = sd === 'left' ? -1 : 1;
          const xColFace = sign * span.lenS / 2;
          // 柱内锚固终点 (sign 方向，远离梁)
          const xColInner = xColFace + sign * anchorInCol;
          // 加腋终点 (-sign 方向，朝梁跨中)
          const xHaunchEnd = xColFace - sign * haunchLen;

          [1, -1].forEach((zSign, zi) => {
            // 附加筋柱内锚固 + 斜面段 (上下各一根)
            // 下部
            haunchBars.push(
              <RebarBar key={`vba-${sd}-${zi}`}
                position={[(xColInner + xColFace) / 2, COVER, zSign * (halfB + haunchH - COVER)]}
                length={anchorInCol} diameter={botR.diameter}
                color={COLOR_HAUNCH} hiColor={COLOR_HAUNCH_HI}
                renderOrder={2}
                info={{ type: 'bottom', label: '附加筋(柱内)', detail: `水平加腋，伸入柱内${Math.round(anchorInCol / S)}mm(≥laE)` }}
                selected={isSelected('bottom')} onSelect={onSelect} renderMode={renderMode} />
            );
            haunchBars.push(
              <SlopedRebarBar key={`vbs-${sd}-${zi}`}
                start={[xColFace, COVER, zSign * (halfB + haunchH - COVER)]}
                end={[xHaunchEnd, COVER, zSign * (halfB - COVER)]}
                diameter={botR.diameter}
                color={COLOR_HAUNCH} hiColor={COLOR_HAUNCH_HI}
                info={{ type: 'bottom', label: '下部附加筋(斜面)', detail: '水平加腋，沿斜面' }}
                selected={isSelected('bottom')} onSelect={onSelect} renderMode={renderMode} />
            );
            // 上部
            haunchBars.push(
              <RebarBar key={`vta-${sd}-${zi}`}
                position={[(xColInner + xColFace) / 2, hm - COVER, zSign * (halfB + haunchH - COVER)]}
                length={anchorInCol} diameter={topR.diameter}
                color={COLOR_HAUNCH} hiColor={COLOR_HAUNCH_HI}
                renderOrder={2}
                info={{ type: 'top', label: '附加筋(柱内)', detail: `水平加腋，伸入柱内${Math.round(anchorInCol / S)}mm(≥laE)` }}
                selected={isSelected('top')} onSelect={onSelect} renderMode={renderMode} />
            );
            haunchBars.push(
              <SlopedRebarBar key={`vts-${sd}-${zi}`}
                start={[xColFace, hm - COVER, zSign * (halfB + haunchH - COVER)]}
                end={[xHaunchEnd, hm - COVER, zSign * (halfB - COVER)]}
                diameter={topR.diameter}
                color={COLOR_HAUNCH} hiColor={COLOR_HAUNCH_HI}
                info={{ type: 'top', label: '上部附加筋(斜面)', detail: '水平加腋，沿斜面' }}
                selected={isSelected('top')} onSelect={onSelect} renderMode={renderMode} />
            );
          });

          // 水平加腋区箍筋
          const haunchStirCount = Math.ceil((params.haunchLength || 0) / stir.spacingDense);
          for (let j = 0; j < haunchStirCount; j++) {
            const t = (j + 0.5) / haunchStirCount;
            const sx = xColFace + (xHaunchEnd - xColFace) * t;
            const localW = haunchH * (1 - t);
            haunchBars.push(
              <StirrupRing key={`vhs-${sd}-${j}`}
                x={sx} width={span.bS - 2 * COVER - STIR_D + 2 * localW}
                height={innerH} diameter={stir.diameter}
                barZPositions={beamStirrupBarPositions((span.bS - 2 * COVER - STIR_D + 2 * localW) / S, stir.diameter, params.top, params.bottom).map(z => z * S)}
                color={COLOR_STIRRUP} hiColor={COLOR_STIRRUP_HI} cover={COVER} legs={stir.legs}
                info={{ type: 'stirrup', label: '加腋区箍筋', detail: `加密区2，间距${stir.spacingDense}mm` }}
                selected={isSelected('stirrup')} onSelect={onSelect} renderMode={renderMode} />
            );
          }
        });
        return haunchBars;
      })()}
        </ConstructionGroup>
      ))}

      {/* 尺寸标注 */}
      {showDimensions && (
        <>
          {/* Per-span dimension annotations */}
          {spanLayouts.map((span, si) => {
            const dimSupportLenI = calcSupportRebarLength(spanLengthsMm[si]) * S;
            const dimSupportLenMmI = calcSupportRebarLength(spanLengthsMm[si]);
            const hasLeftDimSupport = (si === 0 && !!leftR) || (si > 0 && !!innerR);
            const hasRightDimSupport = (si === spanCount - 1 && !!rightR) || (si < spanCount - 1 && !!innerR);
            return (
            <group key={`dim-span-${si}`} position={[span.center, 0, 0]}>
              <DenseZoneMark x={-span.lenS / 2 + denseZone} beamH={hm} />
              <DenseZoneMark x={span.lenS / 2 - denseZone} beamH={hm} />
              <DimLine
                start={-span.lenS / 2} end={-span.lenS / 2 + denseZone}
                offset={hm + hm * 0.38}
                label={`加密区 ${denseZoneMm}`}
                color="#D97706"
              />
              <DimLine
                start={span.lenS / 2 - denseZone} end={span.lenS / 2}
                offset={hm + hm * 0.38}
                label={`加密区 ${denseZoneMm}`}
                color="#D97706"
              />
              <DimLine
                start={-span.lenS / 2} end={span.lenS / 2}
                offset={-(hm * 0.25)}
                label={`ln=${spanLengthsMm[si]}mm${spanCount > 1 ? ` (跨${si + 1})` : ''}`}
                color="#2563EB"
              />
              {hasLeftDimSupport && (
                <DimLine
                  start={-span.lenS / 2} end={-span.lenS / 2 + dimSupportLenI}
                  offset={hm + hm * 0.2}
                  label={`${si === 0 && leftR ? '端支座' : '内支座'} ln/3=${dimSupportLenMmI}`}
                  color="#7C3AED"
                />
              )}
              {hasRightDimSupport && (
                <DimLine
                  start={span.lenS / 2 - dimSupportLenI} end={span.lenS / 2}
                  offset={hm + hm * 0.2}
                  label={`${si === spanCount - 1 && rightR ? '端支座' : '内支座'} ln/3=${dimSupportLenMmI}`}
                  color="#7C3AED"
                />
              )}
            </group>
            );
          })}

          {/* Global dimension annotations */}
          {/* 左柱宽 hc */}
          <DimLine
            start={-TOTAL_NET / 2 - HC} end={-TOTAL_NET / 2}
            offset={-(hm * 0.45)}
            label={`hc=${params.hc || 500}`}
            color="#64748B"
          />
          {/* 右柱宽 hc */}
          <DimLine
            start={TOTAL_NET / 2} end={TOTAL_NET / 2 + HC}
            offset={-(hm * 0.45)}
            label={`hc=${params.hc || 500}`}
            color="#64748B"
          />

          {/* 梁高 h */}
          <VDimLine
            x={TOTAL_NET / 2 + HC}
            bottom={0} top={hm}
            offset={hm * 0.3}
            label={`h=${params.h}`}
            color="#475569"
          />

          <Html position={[-TOTAL_NET / 2 + Math.min(TOTAL_NET * 0.22, 1.2), hm + hm * 0.62, -bm * 0.6]} center distanceFactor={8}>
            <div style={{
              color: '#0F766E',
              fontSize: 8,
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: 0,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              textShadow: '0 0 3px #fff, 0 0 6px rgba(255,255,255,0.85)',
            }}>
              箍筋中心线 {Math.round(stirCenterW / S)}×{Math.round(stirCenterH / S)} · 拉筋@{stir.spacingNormal}
            </div>
          </Html>

          {/* ====== 锚固长度标注 (z 偏移到前立面) ====== */}
          {(() => {
            const zFront = -bm * 0.8;
            const nodes: React.ReactNode[] = [];

            // --- 上部筋锚固 (右端) ---
            if (topAnchor.canStraight) {
              nodes.push(
                <DimLine key="dim-top-anc"
                  start={TOTAL_NET / 2} end={TOTAL_NET / 2 + topAnchor.straightLen * S}
                  offset={topBarY1} label={`上部筋直锚 laE=${topAnchor.straightLen}`}
                  color="#DC2626" z={zFront} />
              );
            } else {
              nodes.push(
                <DimLine key="dim-top-anc-b"
                  start={TOTAL_NET / 2} end={TOTAL_NET / 2 + topAnchor.bentStraightPart * S}
                  offset={topBarY1} label={`上部筋弯锚水平段=${topAnchor.bentStraightPart}`}
                  color="#DC2626" z={zFront} />
              );
              nodes.push(
                <VDimLine key="dim-top-anc-bend"
                  x={TOTAL_NET / 2 + topAnchor.bentStraightPart * S}
                  bottom={topBarY1 - topAnchor.bentBendPart * S} top={topBarY1}
                  offset={hm * 0.15} label={`15d=${topAnchor.bentBendPart}`}
                  color="#DC2626" z={zFront} />
              );
            }

            // --- 下部筋锚固 (右端) ---
            if (botAnchor.canStraight) {
              nodes.push(
                <DimLine key="dim-bot-anc"
                  start={TOTAL_NET / 2} end={TOTAL_NET / 2 + botAnchor.straightLen * S}
                  offset={botBarY1} label={`下部筋直锚 laE=${botAnchor.straightLen}`}
                  color="#DC2626" z={zFront} />
              );
            } else {
              nodes.push(
                <DimLine key="dim-bot-anc-b"
                  start={TOTAL_NET / 2} end={TOTAL_NET / 2 + botAnchor.bentStraightPart * S}
                  offset={botBarY1} label={`下部筋弯锚水平段=${botAnchor.bentStraightPart}`}
                  color="#DC2626" z={zFront} />
              );
              nodes.push(
                <VDimLine key="dim-bot-anc-bend"
                  x={TOTAL_NET / 2 + botAnchor.bentStraightPart * S}
                  bottom={botBarY1} top={botBarY1 + botAnchor.bentBendPart * S}
                  offset={hm * 0.15} label={`15d=${botAnchor.bentBendPart}`}
                  color="#DC2626" z={zFront} />
              );
            }

            // --- 支座负筋锚固 (左端, first span) ---
            if (leftR && leftAnchor) {
              const xL = spanLayouts[0].leftFace;
              if (leftAnchor.canStraight) {
                nodes.push(
                  <DimLine key="dim-ls-anc"
                    start={xL - leftAnchor.straightLen * S} end={xL}
                    offset={supportBarY1} label={`支座筋直锚 laE=${leftAnchor.straightLen}`}
                    color="#7C3AED" z={zFront} />
                );
              } else {
                nodes.push(
                  <DimLine key="dim-ls-anc-b"
                    start={xL - leftAnchor.bentStraightPart * S} end={xL}
                    offset={supportBarY1} label={`支座筋弯锚水平段=${leftAnchor.bentStraightPart}`}
                    color="#7C3AED" z={zFront} />
                );
                nodes.push(
                  <VDimLine key="dim-ls-anc-bend"
                    x={xL - leftAnchor.bentStraightPart * S}
                    bottom={supportBarY1 - leftAnchor.bentBendPart * S} top={supportBarY1}
                    offset={-(hm * 0.15)} label={`15d=${leftAnchor.bentBendPart}`}
                    color="#7C3AED" z={zFront} />
                );
              }
            }

            // --- 支座负筋锚固 (右端, last span) ---
            if (rightR && rightAnchor) {
              const xR = spanLayouts[spanCount - 1].rightFace;
              if (rightAnchor.canStraight) {
                nodes.push(
                  <DimLine key="dim-rs-anc"
                    start={xR} end={xR + rightAnchor.straightLen * S}
                    offset={supportBarY1} label={`支座筋直锚 laE=${rightAnchor.straightLen}`}
                    color="#7C3AED" z={zFront} />
                );
              } else {
                nodes.push(
                  <DimLine key="dim-rs-anc-b"
                    start={xR} end={xR + rightAnchor.bentStraightPart * S}
                    offset={supportBarY1} label={`支座筋弯锚水平段=${rightAnchor.bentStraightPart}`}
                    color="#7C3AED" z={zFront} />
                );
                nodes.push(
                  <VDimLine key="dim-rs-anc-bend"
                    x={xR + rightAnchor.bentStraightPart * S}
                    bottom={supportBarY1 - rightAnchor.bentBendPart * S} top={supportBarY1}
                    offset={hm * 0.15} label={`15d=${rightAnchor.bentBendPart}`}
                    color="#7C3AED" z={zFront} />
                );
              }
            }

            // --- 架立筋搭接长度 (first span) ---
            {
              const lapMm = 150;
              const lapLen = lapMm * S;
              const firstSpan = spanLayouts[0];
              const lastSpan = spanLayouts[spanLayouts.length - 1];
              const firstSupportLen = calcSupportRebarLength(spanLengthsMm[0]) * S;
              const lastSupportLen = calcSupportRebarLength(spanLengthsMm[spanLengthsMm.length - 1]) * S;
              if (leftR) {
                nodes.push(
                  <DimLine key="dim-lap-l"
                    start={firstSpan.leftFace + firstSupportLen - lapLen} end={firstSpan.leftFace + firstSupportLen}
                    offset={hm + hm * 0.42}
                    label={`搭接${lapMm}mm(≥150)`}
                    color="#D97706" z={zFront} />
                );
              }
              if (rightR) {
                nodes.push(
                  <DimLine key="dim-lap-r"
                    start={lastSpan.rightFace - lastSupportLen} end={lastSpan.rightFace - lastSupportLen + lapLen}
                    offset={hm + hm * 0.42}
                    label={`搭接${lapMm}mm(≥150)`}
                    color="#D97706" z={zFront} />
                );
              }
            }

            // --- 加腋尺寸标注 (single-span only) ---
            if (spanCount === 1 && haunchType === 'vertical') {
              const haunchLenMm = params.haunchLength || 0;
              const haunchHMm = params.haunchHeight || 0;
              const span0lenS = spanLayouts[0].lenS;
              if (hasLeftHaunch) {
                nodes.push(
                  <DimLine key="dim-haunch-l-len"
                    start={-span0lenS / 2} end={-span0lenS / 2 + haunchLen}
                    offset={-(hm * 0.15 + haunchH)}
                    label={`c₁=${haunchLenMm}`}
                    color="#E67E22" />
                );
                nodes.push(
                  <VDimLine key="dim-haunch-l-h"
                    x={-span0lenS / 2}
                    bottom={-haunchH} top={0}
                    offset={-(hm * 0.2)}
                    label={`${haunchHMm}`}
                    color="#E67E22" />
                );
              }
              if (hasRightHaunch) {
                nodes.push(
                  <DimLine key="dim-haunch-r-len"
                    start={span0lenS / 2 - haunchLen} end={span0lenS / 2}
                    offset={-(hm * 0.15 + haunchH)}
                    label={`c₁=${haunchLenMm}`}
                    color="#E67E22" />
                );
                nodes.push(
                  <VDimLine key="dim-haunch-r-h"
                    x={span0lenS / 2}
                    bottom={-haunchH} top={0}
                    offset={hm * 0.2}
                    label={`${haunchHMm}`}
                    color="#E67E22" />
                );
              }
            }
            if (spanCount === 1 && haunchType === 'horizontal') {
              const haunchLenMm = params.haunchLength || 0;
              const haunchHMm = params.haunchHeight || 0;
              const span0lenS = spanLayouts[0].lenS;
              if (hasLeftHaunch) {
                nodes.push(
                  <DimLine key="dim-haunch-l-len"
                    start={-span0lenS / 2} end={-span0lenS / 2 + haunchLen}
                    offset={-(hm * 0.25)}
                    label={`c₁=${haunchLenMm}`}
                    color="#E67E22" z={bm / 2 + haunchH + 0.02} />
                );
                nodes.push(
                  <DimLine key="dim-haunch-l-w"
                    start={bm / 2} end={bm / 2 + haunchH}
                    offset={-(hm * 0.15)}
                    label={`${haunchHMm}`}
                    color="#E67E22" z={0} />
                );
              }
              if (hasRightHaunch) {
                nodes.push(
                  <DimLine key="dim-haunch-r-len"
                    start={span0lenS / 2 - haunchLen} end={span0lenS / 2}
                    offset={-(hm * 0.25)}
                    label={`c₁=${haunchLenMm}`}
                    color="#E67E22" z={bm / 2 + haunchH + 0.02} />
                );
              }
            }

            // --- 保护层厚度 ---
            nodes.push(
              <VDimLine key="dim-cover"
                x={-TOTAL_NET / 2}
                bottom={hm - COVER} top={hm}
                offset={-(hm * 0.35)}
                label={`c=${params.cover || 25}`}
                color="#6B7280" z={zFront} />
            );

            return nodes;
          })()}
        </>
      )}

      {cutPosition !== null && <SectionCutPlane position={cutPosition} height={hm} width={bm} />}
    </>
  );
}

export default function BeamViewer({ params, cutPosition, showCut, onCutPositionChange, onShowCutChange, highlightedType, selectedInfo, onSelectedInfoChange, onSelectedChange }: {
  params: BeamParams;
  cutPosition: number | null;
  showCut: boolean;
  onCutPositionChange: (v: number | null) => void;
  onShowCutChange: (v: boolean) => void;
  highlightedType?: string | null;
  selectedInfo?: RebarMeshInfo | null;
  onSelectedInfoChange?: (info: RebarMeshInfo | null) => void;
  onSelectedChange?: (type: string | null) => void;
}) {
  const hm = params.h * S;
  const spanCount = params.spanCount || 1;
  const HC_EXT = (params.hc || 500) * S;
  const spanLensExt: number[] = (params.spanLengths && params.spanLengths.length === spanCount)
    ? params.spanLengths
    : Array(spanCount).fill(params.spanLength || 4000);
  const TOTAL_NET_EXT = spanLensExt.reduce((s, l) => s + l * S, 0) + (spanCount - 1) * HC_EXT;
  // 相机距离系数：根据总梁长自适应缩放
  const camScale = Math.max(TOTAL_NET_EXT / 4, 1); // 基准: 4m 梁
  const gridSize = Math.max(Math.ceil(TOTAL_NET_EXT * 2.5), 10);
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [renderMode, setRenderMode] = useState<RebarRenderMode>('solid');
  const currentSelected = selectedInfo !== undefined ? selectedInfo : selected;
  const setCurrentSelected = useCallback((info: RebarMeshInfo | null) => {
    if (selectedInfo !== undefined) {
      onSelectedInfoChange?.(info);
    } else {
      setSelected(info);
    }
  }, [selectedInfo, onSelectedInfoChange]);
  const [concreteOpacity, setConcreteOpacity] = useState(0.15);
  const [showDimensions, setShowDimensions] = useState(false);
  const [showHookDetail, setShowHookDetail] = useState(false);

  // Notify parent of selection changes for bidirectional highlight
  useEffect(() => {
    onSelectedChange?.(currentSelected?.type ?? null);
  }, [currentSelected, onSelectedChange]);

  // Merge external highlight with user selection for BeamScene
  const effectiveSelected = useMemo<RebarMeshInfo | null>(() => {
    if (currentSelected) return currentSelected;
    if (highlightedType) return { type: highlightedType as RebarMeshInfo['type'], label: '', detail: '' };
    return null;
  }, [currentSelected, highlightedType]);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const constructionStages = useMemo(() => beamConstructionSteps(params), [params]);
  const playback = useConstructionPlayback(constructionStages);
  const { state: animation, send: animationAction } = playback;
  const animating = animation.open;
  const { isFullscreen: fsActive, toggle: fsToggle, containerRef: fsContainerRef, containerClass: fsClass } = useFullscreen();

  // 截图函数
  const takeScreenshot = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-viewer="beam"] canvas');
    if (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `${params.id || 'beam'}_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    }
  }, [params.id]);

  // 快捷键支持
  const keyBindings = useMemo(() => createViewerBindings({
    resetView: () => setCameraTarget([3 * camScale, 2 * camScale, 4 * camScale]),
    toggleDimensions: () => setShowDimensions(d => !d),
    takeScreenshot,
    toggleAnimation: () => animationAction({ type: 'toggle' }),
    previousStep: animating ? () => animationAction({ type: 'seek', step: animation.step - 1 }) : undefined,
    nextStep: animating ? () => animationAction({ type: 'seek', step: animation.step + 1 }) : undefined,
    exitAnimation: animating ? () => animationAction({ type: 'exit' }) : undefined,
    setViewPreset: (preset) => {
      const presets: Record<string, [number, number, number]> = {
        front: [0, 0.3 * camScale, 5 * camScale],
        side: [5 * camScale, 0.3 * camScale, 0],
        top: [0, 5 * camScale, 0.1],
        iso: [3 * camScale, 2 * camScale, 4 * camScale],
      };
      setCameraTarget(presets[preset] || presets.iso);
    },
  }), [camScale, animating, animation.step, animationAction, takeScreenshot]);

  useKeyboard(keyBindings);



  // 根据选中钢筋类型计算附加数据
  const selectedAdditionalData = useMemo(() => {
    if (!currentSelected) return undefined;
    const selected = currentSelected;
    const groupData = rebarGroupDataFromInfo(selected);
    const rowIndex = Number(selected.setId?.match(/\.row(\d+)$/)?.[1] ?? 0);
    const selectedRow = beamLongitudinalLayout(params).rows.find(r => r.role === selected.type && r.row === rowIndex);
    if (selectedRow) return {
      ...groupData,
      length: selectedRow.lengthMm,
      weight: selectedRow.lengthMm/1000*selectedRow.diameter**2/162,
      anchorLength: selectedRow.anchor.canStraight ? selectedRow.anchor.straightLen : selectedRow.anchor.bentStraightPart,
    };

    const topR = parseRebar(params.top);
    const botR = parseRebar(params.bottom);
    const stir = parseStirrup(params.stirrup);
    const topAnchor = calcBeamEndAnchor(topR.grade, topR.diameter, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);
    const botAnchor = calcBeamEndAnchor(botR.grade, botR.diameter, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);

    // 钢筋线密度 kg/m (d²/162)
    const linearWeight = (d: number) => d * d / 162 / 1000;
    const sc = params.spanCount || 1;
    const spanLens: number[] = (params.spanLengths && params.spanLengths.length === sc)
      ? params.spanLengths
      : Array(sc).fill(params.spanLength || 4000);
    const totalNetMm = spanLens.reduce((s, l) => s + l, 0) + (sc - 1) * (params.hc || 500);

    switch (selected.type) {
      case 'top': {
        const anchorLen = topAnchor.canStraight ? topAnchor.straightLen : topAnchor.bentStraightPart + topAnchor.bentBendPart;
        const totalLen = totalNetMm + anchorLen * 2;
        return {
          ...groupData,
          length: totalLen,
          weight: totalLen * linearWeight(topR.diameter),
          anchorLength: topAnchor.canStraight ? topAnchor.straightLen : topAnchor.bentStraightPart,
        };
      }
      case 'bottom': {
        const anchorLen = botAnchor.canStraight ? botAnchor.straightLen : botAnchor.bentStraightPart + botAnchor.bentBendPart;
        const totalLen = totalNetMm + anchorLen * 2;
        return {
          ...groupData,
          length: totalLen,
          weight: totalLen * linearWeight(botR.diameter),
          anchorLength: botAnchor.canStraight ? botAnchor.straightLen : botAnchor.bentStraightPart,
        };
      }
      case 'stirrup': {
        const stirCenterWidthMm = params.b - 2 * (params.cover || 25) - stir.diameter;
        const stirCenterHeightMm = params.h - 2 * (params.cover || 25) - stir.diameter;
        const stirrupSpec = createCompositeStirrupSpec({
          widthMm: stirCenterWidthMm,
          barPositionsMm: beamStirrupBarPositions(stirCenterWidthMm, stir.diameter, params.top, params.bottom),
          heightMm: stirCenterHeightMm,
          diameterMm: stir.diameter, legs: stir.legs,
        });
        return {
          ...groupData,
          piecesPerStation: stirrupSpec.pieceCount,
          length: stirrupSpec.lengthMm,
          weight: stirrupSpec.lengthMm * linearWeight(stir.diameter),
          spacing: stir.spacingDense,
          ...(sc > 1 ? { hint: `×${sc}跨` } : {}),
        };
      }
      case 'leftSupport':
      case 'rightSupport': {
        const isRightSupport = selected.type === 'rightSupport';
        const supportSpec = isRightSupport ? params.rightSupport : params.leftSupport;
        if (!supportSpec) return undefined;
        const supportSpan = isRightSupport ? spanLens[sc - 1] : spanLens[0];
        const supportLenMm = calcSupportRebarLength(supportSpan);
        const r = parseRebar(supportSpec);
        const supportAnchor = calcBeamEndAnchor(r.grade, r.diameter, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);
        const anchorLen = supportAnchor.canStraight ? supportAnchor.straightLen : supportAnchor.bentStraightPart + supportAnchor.bentBendPart;
        const totalLen = supportLenMm + anchorLen;
        return {
          ...groupData,
          length: totalLen,
          weight: totalLen * linearWeight(r.diameter),
          anchorLength: supportAnchor.canStraight ? supportAnchor.straightLen : supportAnchor.bentStraightPart,
        };
      }
      case 'leftSupport2':
      case 'rightSupport2': {
        const isRightSupport2 = selected.type === 'rightSupport2';
        const supportSpec2 = isRightSupport2 ? params.rightSupport2 : params.leftSupport2;
        if (!supportSpec2) return undefined;
        const supportSpan2 = isRightSupport2 ? spanLens[sc - 1] : spanLens[0];
        const supportLenMm2 = calcSupportRebarLength(supportSpan2, 2);
        const r2 = parseRebar(supportSpec2);
        const supportAnchor2 = calcBeamEndAnchor(r2.grade, r2.diameter, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);
        const anchorLen2 = supportAnchor2.canStraight ? supportAnchor2.straightLen : supportAnchor2.bentStraightPart + supportAnchor2.bentBendPart;
        const totalLen2 = supportLenMm2 + anchorLen2;
        return {
          ...groupData,
          length: totalLen2,
          weight: totalLen2 * linearWeight(r2.diameter),
          anchorLength: supportAnchor2.canStraight ? supportAnchor2.straightLen : supportAnchor2.bentStraightPart,
        };
      }
      case 'innerSupport': {
        const innerSpec = params.innerSupport || params.rightSupport || params.leftSupport;
        if (!innerSpec || sc < 2) return undefined;
        const ir = parseRebar(innerSpec);
        let totalInnerLen = 0;
        for (let i = 0; i < sc - 1; i++) {
          totalInnerLen += calcSupportRebarLength(spanLens[i]) + (params.hc || 500) + calcSupportRebarLength(spanLens[i + 1]);
        }
        const innerBarLen = Math.round(totalInnerLen / (sc - 1));
        return {
          ...groupData,
          length: innerBarLen,
          weight: innerBarLen * linearWeight(ir.diameter),
          hint: `×${sc - 1}内柱${params.innerSupport ? '' : '，按端支座筋兜底'}`,
        };
      }
      case 'sideBar': {
        if (!params.sideBar) return undefined;
        const si = parseSideBar(params.sideBar);
        if (!si) return undefined;
        const sideAnchorCalc = calcBeamSideBarAnchor(si.prefix, si.grade, si.diameter, params.concreteGrade, params.seismicGrade, params.hc || 500, params.cover || 25);
        const sideAnchorLen = sideAnchorCalc.canStraight ? sideAnchorCalc.straightLen : sideAnchorCalc.bentStraightPart + sideAnchorCalc.bentBendPart;
        const sideTotalLen = totalNetMm + sideAnchorLen * 2;
        return {
          ...groupData,
          length: sideTotalLen,
          weight: sideTotalLen * linearWeight(si.diameter),
          anchorLength: sideAnchorCalc.canStraight ? sideAnchorCalc.straightLen : sideAnchorCalc.bentStraightPart,
        };
      }
      case 'tieBar': {
        const tieInfo = params.tieBar ? parseTieBar(params.tieBar) : autoTieBar(params.b, stir.grade, stir.diameter);
        if (!tieInfo) return undefined;
        const sideInfoForTie = params.sideBar ? parseSideBar(params.sideBar) : null;
        const sideBarDiameter = sideInfoForTie?.diameter ?? stir.diameter;
        const sideOffsetMm = resolveTieSideOffsetMm({
          sectionWidthMm: params.b,
          coverMm: params.cover || 25,
          stirrupDiameterMm: stir.diameter,
          sideBarDiameterMm: sideBarDiameter,
        });
        const tieSpec = createTieBarShapeSpec({
          sideOffsetMm,
          tieDiameterMm: tieInfo.diameter,
          sideBarDiameterMm: sideBarDiameter,
        });
        return {
          ...groupData,
          length: tieSpec.lengthMm,
          weight: tieSpec.lengthMm * linearWeight(tieInfo.diameter),
          spacing: stir.spacingNormal,
          ...(sc > 1 ? { hint: `×${sc}跨` } : {}),
        };
      }
      case 'erection': {
        const erUser = params.erectionBar ? parseRebar(params.erectionBar) : null;
        const avgSpanLen = Math.round(spanLens.reduce((sum, len) => sum + len, 0) / sc);
        const erDia = erUser ? erUser.diameter : (avgSpanLen <= 4000 ? 10 : 12);
        const hasInnerSupport = sc > 1 && !!(params.innerSupport || params.rightSupport || params.leftSupport);
        const lap = 150;
        let erTotalLen = 0;
        for (let i = 0; i < sc; i++) {
          const spanLen = spanLens[i];
          const leftSupportLen = ((i === 0 && params.leftSupport) || (i > 0 && hasInnerSupport)) ? calcSupportRebarLength(spanLen) : 0;
          const rightSupportLen = ((i === sc - 1 && params.rightSupport) || (i < sc - 1 && hasInnerSupport)) ? calcSupportRebarLength(spanLen) : 0;
          if (leftSupportLen > 0 && rightSupportLen > 0) {
            erTotalLen += Math.max(spanLen - leftSupportLen - rightSupportLen + 2 * lap, 0);
          } else if (leftSupportLen > 0) {
            erTotalLen += Math.max(spanLen - leftSupportLen + lap, 0);
          } else if (rightSupportLen > 0) {
            erTotalLen += Math.max(spanLen - rightSupportLen + lap, 0);
          } else {
            erTotalLen += spanLen;
          }
        }
        const erLen = Math.round(erTotalLen / sc);
        return {
          ...groupData,
          length: erLen,
          weight: erLen * linearWeight(erDia),
          ...(sc > 1 ? { hint: `×${sc}跨` } : {}),
        };
      }
      default:
        return undefined;
    }
  }, [currentSelected, params]);

  return (
    <div className="rv-beam-viewer" data-viewer="beam">
      <div className="rv-viewer-toolbar">
        <button onClick={() => setShowHookDetail(true)} className="rv-button" aria-haspopup="dialog">弯钩构造</button>
        <button
          onClick={() => { onShowCutChange(!showCut); if (showCut) onCutPositionChange(null); else onCutPositionChange(0); }}
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
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5">
          {([
            ['solid', '实体'],
            ['centerline', '中心线'],
            ['hybrid', '混合'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setRenderMode(mode)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${renderMode === mode ? 'bg-accent text-white' : 'text-muted hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <KeyboardHelp bindings={keyBindings} />
        {currentSelected && (
          <button onClick={() => setCurrentSelected(null)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-muted cursor-pointer hover:bg-gray-200 transition-colors">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            取消选中
          </button>
        )}
      </div>
      {showHookDetail && <StirrupHookDetail params={params} onClose={() => setShowHookDetail(false)} />}

      {!fsActive && <ConstructionTimeline playback={playback} />}

      {showCut && (
        <div className="flex items-center gap-3 bg-white rounded-lg border border-gray-200 px-4 py-2">
          <span className="text-xs text-muted whitespace-nowrap">剖切位置</span>
          <input type="range" min={-(TOTAL_NET_EXT / 2 * 0.95)} max={TOTAL_NET_EXT / 2 * 0.95} step={0.05} value={cutPosition ?? 0}
            onChange={e => onCutPositionChange(parseFloat(e.target.value))} className="flex-1 accent-accent" />
          <span className="text-xs text-muted w-20 text-right">{((cutPosition ?? 0) + TOTAL_NET_EXT / 2).toFixed(2)}m / {TOTAL_NET_EXT.toFixed(1)}m</span>
        </div>
      )}

      <div ref={fsContainerRef} className={`rv-viewer-canvas relative w-full overflow-hidden ${fsActive ? fsClass : ''}`}>
        {fsActive && <div className="rv-construction-fullscreen"><ConstructionTimeline playback={playback} /></div>}
        {currentSelected && <RebarDetailPanel info={currentSelected} onClose={() => setCurrentSelected(null)} additionalData={selectedAdditionalData} />}

        {/* Toolbar overlay */}
        <ViewerControls views={[
            { name: '正面', pos: [0, 0.3 * camScale, 5 * camScale] as [number, number, number] },
            { name: '侧面', pos: [5 * camScale, 0.3 * camScale, 0] as [number, number, number] },
            { name: '俯视', pos: [0, 5 * camScale, 0.1] as [number, number, number] },
            { name: '透视', pos: [3 * camScale, 2 * camScale, 4 * camScale] as [number, number, number] },
          ]} onView={setCameraTarget} opacity={concreteOpacity} onOpacity={setConcreteOpacity}
          fullscreen={fsActive} onFullscreen={fsToggle} />

        <Canvas camera={{ position: [3 * camScale, 2 * camScale, 4 * camScale], fov: 45 }} gl={{ preserveDrawingBuffer: true }} scene={{ background: new THREE.Color('#071725') }}>
          <CameraController targetPosition={cameraTarget} centerY={hm / 2} length={TOTAL_NET_EXT + 2 * HC_EXT} height={Math.max(hm, ...((params.spanHeights ?? []).map(h => h * S))) + (params.haunchType === 'vertical' ? (params.haunchHeight || 0) * S : 0)} depth={Math.max(params.b, params.supportDepth || 600, ...(params.spanWidths ?? [])) * S + (params.haunchType === 'horizontal' ? (params.haunchHeight || 0) * S * 2 : 0)} />
          <ambientLight intensity={1.1} />
          <directionalLight position={[5 * camScale, 8, 5 * camScale]} intensity={2} castShadow />
          <directionalLight position={[-3 * camScale, 3, -4 * camScale]} color="#8ddaf0" intensity={1.2} />
          <Environment resolution={128} frames={1}>
            <Lightformer form="rect" intensity={3} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[10, 10, 1]} />
            <Lightformer form="rect" intensity={2} color="#d6f4ff" position={[0, 2, 5]} rotation={[0, Math.PI, 0]} scale={[12, 4, 1]} />
          </Environment>
          <BeamScene params={params} selected={effectiveSelected} onSelect={setCurrentSelected} cutPosition={cutPosition} concreteOpacity={concreteOpacity} showDimensions={showDimensions} visibleGroups={playback.visibleGroups} activeGroup={playback.activeGroup} renderMode={renderMode} />
          <Grid args={[gridSize, gridSize]} position={[0, -0.01, 0]} cellColor="#15384f" sectionColor="#215a72" fadeDistance={gridSize * 1.5} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, hm / 2, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="rv-viewer-information"><div>截面<b>{params.b} × {params.h} mm</b></div><div>混凝土<b>{params.concreteGrade}</b></div></div>
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
