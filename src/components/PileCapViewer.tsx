'use client';

import { slabBarPositions } from '@/lib/slab-reinforcement';
import { orthogonalLayers } from '@/lib/reinforcement-layout';
import { FoundationInserts } from './three/FoundationInserts';
import { BentBarSet } from './three/BentBarSet';
import { pileCenters } from '@/lib/quantity-geometry';
import { FittedCamera } from './FittedCamera';

import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { ViewerControls } from './ViewerControls';
import { useFullscreen } from '@/lib/useFullscreen';
import * as THREE from 'three';
import type { PileCapParams, RebarMeshInfo } from '@/lib/types';
import { parseSlabRebar, parseRebar, gradeLabel } from '@/lib/rebar';
import { calcLaE, getPileEmbedDepth } from '@/lib/anchor';
import { determineColFoundAnchor, determinePileCapRebarEnd } from '@/lib/construction-rules';
import {
  S,
  COLOR_PC_BOTTOM_X, COLOR_PC_BOTTOM_X_HI,
  COLOR_PC_BOTTOM_Y, COLOR_PC_BOTTOM_Y_HI,
  COLOR_PC_COL, COLOR_PC_COL_HI,
  COLOR_PC_PILE, COLOR_PC_PILE_HI,
  PILECAP_CONSTRUCTION_STEPS,
} from '@/lib/constants';

/* ─── Clickable pile cylinder (kept as individual — has outline rings) ─── */
function PileCylinder({ position, height, diameter, color, hiColor, info, selected, onSelect }: {
  position: [number, number, number]; height: number; diameter: number;
  color: string; hiColor: string; info: RebarMeshInfo;
  selected: boolean; onSelect: (info: RebarMeshInfo | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeColor = selected ? hiColor : hovered ? hiColor : color;
  return (
    <group>
      <mesh position={position}
        onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : info); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}>
        <cylinderGeometry args={[diameter / 2, diameter / 2, height, 24]} />
        <meshStandardMaterial color={activeColor} roughness={0.7} metalness={0.2} transparent opacity={0.85} />
      </mesh>
      <lineSegments position={position}>
        <edgesGeometry args={[new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 24)]} />
        <lineBasicMaterial color="#5D6D7E" />
      </lineSegments>
    </group>
  );
}

/* ─── Compute pile positions ─── */
function computePilePositions(params: PileCapParams): { x: number; z: number }[] {
  return pileCenters(params).map(p=>({x:p.x*S,z:p.z*S}));
}

/* ─── PileCap 3D Scene (InstancedMesh optimized) ─── */
function PileCapScene({ params, selected, onSelect, concreteOpacity, visibleGroups }: {
  params: PileCapParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void; concreteOpacity: number;
  visibleGroups: Set<string>;
}) {
  const cover = (params.cover || 50) * S;
  const coverMm = params.cover || 50;
  const barX = parseSlabRebar(params.bottomBarX);
  const barY = parseSlabRebar(params.bottomBarY);
  const colR = parseRebar(params.colMain);

  // 22G101-3 column anchor
  const seismicGrade = params.seismicGrade || '三级';
  const laE = calcLaE(colR.grade, colR.diameter, params.concreteGrade, seismicGrade);
  const anchor = determineColFoundAnchor(params.h, coverMm, colR.diameter, laE);
  const anchorLabel = anchor.canStraight ? '直锚' : '弯锚';

  const availLenX = params.by / 2 - coverMm;
  const availLenY = params.bx / 2 - coverMm;
  const rebarEndX = determinePileCapRebarEnd(barX.diameter, 'round', params.pileDiameter, availLenX);
  const rebarEndY = determinePileCapRebarEnd(barY.diameter, 'round', params.pileDiameter, availLenY);

  const barXInfo: RebarMeshInfo = { type: 'pcBottomX', label: 'X向底筋', detail: `${params.bottomBarX} · ${gradeLabel(barX.grade)} Φ${barX.diameter}@${barX.spacing}${rebarEndX.needBend ? ` · 端弯${rebarEndX.bendLen}mm` : ''}` };
  const barYInfo: RebarMeshInfo = { type: 'pcBottomY', label: 'Y向底筋', detail: `${params.bottomBarY} · ${gradeLabel(barY.grade)} Φ${barY.diameter}@${barY.spacing}${rebarEndY.needBend ? ` · 端弯${rebarEndY.bendLen}mm` : ''}` };
  const colInfo: RebarMeshInfo = { type: 'pcColMain', label: '柱插筋', detail: `${params.colMain} · ${colR.count}根 ${gradeLabel(colR.grade)} Φ${colR.diameter} · ${anchorLabel} 底弯${anchor.bendLength}mm` };
  const pileInfo: RebarMeshInfo = { type: 'pcPile', label: '桩基', detail: `Φ${params.pileDiameter}mm × ${params.pileLength}mm · ${params.pileCount}根 · 桩顶嵌入承台${getPileEmbedDepth(params.pileDiameter)}mm` };

  const barXSelected = selected?.type === 'pcBottomX';
  const barYSelected = selected?.type === 'pcBottomY';
  const colSelected = selected?.type === 'pcColMain';
  const pileSelected = selected?.type === 'pcPile';

  const bxM = params.bx * S;
  const byM = params.by * S;
  const hM = params.h * S;
  const pileLenVis = Math.min(params.pileLength * S, hM * 3);
  const pileDiaVis = params.pileDiameter * S;
  const pileEmbedDepthM = getPileEmbedDepth(params.pileDiameter) * S;
  const pileCenterY = pileEmbedDepthM - pileLenVis / 2;
  const columnStubH = Math.max(700, Math.max(params.colBx, params.colBy) * 1.4) * S;
  const bottomLayers = orthogonalLayers(params.h, coverMm, barX.diameter, barY.diameter, 'bottom');
  const barXLevel = bottomLayers.x * S;
  const barYLevel = bottomLayers.y * S;
  const zStart = -byM / 2 + cover + barX.diameter * S / 2;
  const zEnd = byM / 2 - cover - barX.diameter * S / 2;
  const xStart = -bxM / 2 + cover + barY.diameter * S / 2;
  const xEnd = bxM / 2 - cover - barY.diameter * S / 2;

  const pilePositions = useMemo(() => computePilePositions(params), [params]);

  // Bottom bar matrices
  const { positions: xBotPositions } = useMemo(() => {
    const positions = slabBarPositions(params.bx, coverMm, barX.diameter, barX.spacing);
    return { positions };
  }, [params.bx, coverMm, barX.diameter, barX.spacing]);

  const { positions: yBotPositions } = useMemo(() => {
    const positions = slabBarPositions(params.by, coverMm, barY.diameter, barY.spacing);
    return { positions };
  }, [params.by, coverMm, barY.diameter, barY.spacing]);

  const hookLenXM = rebarEndX.needBend ? rebarEndX.bendLen * S : 0;
  const hookLenYM = rebarEndY.needBend ? rebarEndY.bendLen * S : 0;

  return (
    <>
      <mesh position={[0, hM / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[bxM + 2, hM + pileLenVis + 2, byM + 2]} />
        <meshBasicMaterial />
      </mesh>

      {visibleGroups.has('pile') && pilePositions.map((p, i) => (
        <PileCylinder key={`pile${i}`}
          position={[p.x, pileCenterY, p.z]}
          height={pileLenVis} diameter={pileDiaVis}
          color={COLOR_PC_PILE} hiColor={COLOR_PC_PILE_HI}
          info={pileInfo} selected={pileSelected} onSelect={onSelect} />
      ))}

      {visibleGroups.has('concrete') && (
        <group>
          <mesh position={[0, hM / 2, 0]}>
            <boxGeometry args={[bxM, hM, byM]} />
            <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[0, hM / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(bxM, hM, byM)]} />
            <lineBasicMaterial color="#94A3B8" />
          </lineSegments>
        </group>
      )}

      {visibleGroups.has('concrete') && (
        <group>
          <mesh position={[0, hM + columnStubH / 2, 0]}>
            <boxGeometry args={[params.colBx * S, columnStubH, params.colBy * S]} />
            <meshPhysicalMaterial color="#7F8C8D" transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
          </mesh>
          <lineSegments position={[0, hM + columnStubH / 2, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(params.colBx * S, columnStubH, params.colBy * S)]} />
            <lineBasicMaterial color="#64748B" transparent opacity={0.65} />
          </lineSegments>
        </group>
      )}

      <BentBarSet positions={xBotPositions} axis="z" start={zStart} end={zEnd} y={barXLevel} diameter={barX.diameter} bend={hookLenXM}
        color={COLOR_PC_BOTTOM_X} hiColor={COLOR_PC_BOTTOM_X_HI} info={barXInfo} selected={barXSelected} onSelect={onSelect} visible={visibleGroups.has('bottomX')} />
      <BentBarSet positions={yBotPositions} axis="x" start={xStart} end={xEnd} y={barYLevel} diameter={barY.diameter} bend={hookLenYM}
        color={COLOR_PC_BOTTOM_Y} hiColor={COLOR_PC_BOTTOM_Y_HI} info={barYInfo} selected={barYSelected} onSelect={onSelect} visible={visibleGroups.has('bottomY')} />

      <FoundationInserts main={params.colMain} width={params.colBx} depth={params.colBy} height={params.h}
        cover={coverMm} bottomDx={barX.diameter} bottomDy={barY.diameter} concrete={params.concreteGrade}
        seismic={params.seismicGrade || '非抗震'} centers={[{ x: 0, z: 0 }]}
        color={COLOR_PC_COL} hiColor={COLOR_PC_COL_HI}
        info={colInfo} selected={colSelected} onSelect={onSelect} visible={visibleGroups.has('colMain')} />
    </>
  );
}

/* ─── Main Viewer ─── */
export default function PileCapViewer({ params }: { params: PileCapParams }) {
  const [selectionState, setSelectionState] = useState(() => ({
    params,
    selected: null as RebarMeshInfo | null,
  }));
  const [concreteOpacity, setConcreteOpacity] = useState(0.25);
  const { containerRef: fsRef, isFullscreen: fsActive, toggle: fsToggle } = useFullscreen();

  const [stepIdx, setStepIdx] = useState(PILECAP_CONSTRUCTION_STEPS.length - 1);
  const visibleGroups = PILECAP_CONSTRUCTION_STEPS[stepIdx]?.groups ?? new Set<string>();
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);

  const totalH = params.h * S;
  const modelBottom = getPileEmbedDepth(params.pileDiameter) * S - Math.min(params.pileLength * S, totalH * 3);
  const modelTop = totalH + Math.max(700, Math.max(params.colBx, params.colBy) * 1.4) * S;
  const modelCenterY = (modelBottom + modelTop) / 2;
  const viewDistance = Math.max(params.bx, params.by, params.h) * S * 1.8;
  const selected = selectionState.params === params ? selectionState.selected : null;
  const setSelected = (next: RebarMeshInfo | null) => setSelectionState({ params, selected: next });

  return (
    <div data-viewer ref={fsRef} className={`rv-viewer ${fsActive ? 'rv-viewer-fullscreen fixed inset-0 z-50' : ''}`}>
      {/* Top controls */}
      <div className="rv-viewer-toolbar rv-pilecap-toolbar">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-primary">3D 承台模型</span>
          {selected && (
            <span className="text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              {selected.label}: {selected.detail}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">施工步骤</span>
          <div className="flex items-center gap-1">
            {PILECAP_CONSTRUCTION_STEPS.map((step, i) => (
              <button key={i} onClick={() => setStepIdx(i)}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-all ${i === stepIdx ? 'bg-accent text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'}`}>
                {step.label}
              </button>
            ))}
          </div>

        </div>
      </div>
      {/* Canvas */}
      <div className="rv-viewer-canvas relative">
        <ViewerControls views={[
          { name: '正面', pos: [0, totalH / 2, viewDistance] },
          { name: '侧面', pos: [viewDistance, totalH / 2, 0] },
          { name: '俯视', pos: [0, viewDistance, 0.01] },
          { name: '透视', pos: [viewDistance, viewDistance, viewDistance] },
        ]} onView={setCameraTarget} opacity={concreteOpacity} onOpacity={setConcreteOpacity}
          fullscreen={fsActive} onFullscreen={fsToggle} />
        <Canvas camera={{ position: [3, 3, 3], fov: 40 }} gl={{ antialias: true, alpha: true }}
          style={{ height: '100%' }}>
          <color attach="background" args={['#071725']} />
          <FittedCamera targetPosition={cameraTarget} initialPosition={[3, 3, 3]} center={[0, modelCenterY, 0]} bounds={[params.bx * S, modelTop - modelBottom, params.by * S]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <PileCapScene params={params} selected={selected} onSelect={setSelected}
            concreteOpacity={concreteOpacity} visibleGroups={visibleGroups} />
          <Grid args={[10, 10]} position={[0, -0.01, 0]} cellColor="#15384f" sectionColor="#215a72" fadeDistance={15} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, modelCenterY, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="rv-viewer-hints absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击构件查看详情
        </div>
      </div>
    </div>
  );
}
