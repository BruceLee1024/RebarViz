'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { ShearWallParams, RebarMeshInfo } from '@/lib/types';
import { parseSlabRebar, parseRebar, parseStirrup, gradeLabel } from '@/lib/rebar';
import { S } from '@/lib/constants';

function CameraController({ targetPosition }: { targetPosition: [number, number, number] | null }) {
  const { camera } = useThree();
  useEffect(() => {
    if (targetPosition) { camera.position.set(...targetPosition); camera.updateProjectionMatrix(); }
  }, [targetPosition, camera]);
  return null;
}

function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    vertBar: 'bg-red-50 border-red-200 text-red-800',
    horizBar: 'bg-blue-50 border-blue-200 text-blue-800',
    boundaryMain: 'bg-purple-50 border-purple-200 text-purple-800',
    boundaryStirrup: 'bg-green-50 border-green-200 text-green-800',
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

  // Boundary element length: max(bw, 400mm)
  const BL = Math.max(params.bw, 400) * S;

  const vertInfo: RebarMeshInfo = { type: 'vertBar', label: '竖向分布筋', detail: `${params.vertBar} · ${gradeLabel(vert.grade)} Φ${vert.diameter}@${vert.spacing}，双排布置` };
  const horizInfo: RebarMeshInfo = { type: 'horizBar', label: '水平分布筋', detail: `${params.horizBar} · ${gradeLabel(horiz.grade)} Φ${horiz.diameter}@${horiz.spacing}，双排布置` };
  const boundaryMainInfo: RebarMeshInfo = { type: 'boundaryMain', label: '边缘构件纵筋', detail: `${params.boundaryMain} · ${boundaryR.count}根 ${gradeLabel(boundaryR.grade)} Φ${boundaryR.diameter}，两端各一组` };
  const boundaryStirInfo: RebarMeshInfo = { type: 'boundaryStirrup', label: '边缘构件箍筋', detail: `${params.boundaryStirrup} · ${gradeLabel(boundaryStir.grade)} Φ${boundaryStir.diameter}@${boundaryStir.spacingDense}` };

  // Vertical distributed bars positions (two rows, front and back face)
  const vertBars = useMemo(() => {
    const positions: { x: number; z: number }[] = [];
    const wallInnerL = LW - 2 * BL; // middle zone only
    const startX = -LW / 2 + BL;
    const count = Math.max(Math.floor(wallInnerL / (vert.spacing * S)), 1);
    const spacing = wallInnerL / Math.max(count, 1);
    for (let i = 0; i <= count; i++) {
      const x = startX + i * spacing;
      positions.push({ x, z: BW / 2 - COVER });
      positions.push({ x, z: -(BW / 2 - COVER) });
    }
    return positions;
  }, [LW, BL, BW, COVER, vert.spacing]);

  // Horizontal distributed bars positions
  const horizBars = useMemo(() => {
    const ys: number[] = [];
    const spacing = horiz.spacing * S;
    for (let y = spacing; y < HW - 0.05; y += spacing) ys.push(y);
    return ys;
  }, [horiz.spacing, HW]);

  // Boundary element rebar positions (both ends)
  const boundaryBars = useMemo(() => {
    const positions: { x: number; z: number; side: 'left' | 'right' }[] = [];
    const perSide = Math.max(Math.round(boundaryR.count / 2), 2);
    const innerBL = BL - 2 * COVER;
    const innerBW = BW - 2 * COVER;
    // Left boundary
    for (let i = 0; i < perSide; i++) {
      const x = -LW / 2 + COVER + (innerBL * i) / Math.max(perSide - 1, 1);
      positions.push({ x, z: BW / 2 - COVER, side: 'left' });
      positions.push({ x, z: -(BW / 2 - COVER), side: 'left' });
    }
    // Right boundary
    for (let i = 0; i < perSide; i++) {
      const x = LW / 2 - COVER - (innerBL * i) / Math.max(perSide - 1, 1);
      positions.push({ x, z: BW / 2 - COVER, side: 'right' });
      positions.push({ x, z: -(BW / 2 - COVER), side: 'right' });
    }
    return positions;
  }, [boundaryR.count, BL, BW, LW, COVER]);

  // Boundary stirrup curve
  const boundaryStirCurve = useMemo(() => {
    const w2 = (BL - COVER) / 2;
    const h2 = (BW - COVER) / 2;
    const r = 0.01;
    const shape = new THREE.Shape();
    shape.moveTo(-w2 + r, -h2);
    shape.lineTo(w2 - r, -h2);
    shape.quadraticCurveTo(w2, -h2, w2, -h2 + r);
    shape.lineTo(w2, h2 - r);
    shape.quadraticCurveTo(w2, h2, w2 - r, h2);
    shape.lineTo(-w2 + r, h2);
    shape.quadraticCurveTo(-w2, h2, -w2, h2 - r);
    shape.lineTo(-w2, -h2 + r);
    shape.quadraticCurveTo(-w2, -h2, -w2 + r, -h2);
    const pts = shape.getPoints(32);
    return new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.y)), true);
  }, [BL, BW, COVER]);

  const [hoveredType, setHoveredType] = useState<string | null>(null);

  const isSelected = (type: string) => selected?.type === type;
  const isHovered = (type: string) => hoveredType === type;

  const barColor = (type: string, base: string, hi: string) =>
    isSelected(type) ? hi : isHovered(type) ? hi : base;

  const handleClick = (e: THREE.Event, info: RebarMeshInfo) => {
    (e as any).stopPropagation?.();
    onSelect(isSelected(info.type) ? null : info);
  };

  const boundaryStirYs = useMemo(() => {
    const ys: number[] = [];
    const s = boundaryStir.spacingDense * S;
    for (let y = s; y < HW - 0.05; y += s) ys.push(y);
    return ys;
  }, [boundaryStir.spacingDense, HW]);

  return (
    <>
      {/* Background click to deselect */}
      <mesh position={[0, HW / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[LW + 1, HW + 1, BW + 1]} />
        <meshBasicMaterial />
      </mesh>

      {/* Wall body */}
      <mesh position={[0, HW / 2, 0]}>
        <boxGeometry args={[LW, HW, BW]} />
        <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
      </mesh>
      <lineSegments position={[0, HW / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(LW, HW, BW)]} />
        <lineBasicMaterial color="#94A3B8" />
      </lineSegments>

      {/* Boundary element highlight boxes */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * (LW / 2 - BL / 2), HW / 2, 0]}>
          <boxGeometry args={[BL, HW, BW]} />
          <meshPhysicalMaterial color="#8E44AD" transparent opacity={0.04} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}

      {/* Vertical distributed bars */}
      {vertBars.map((p, i) => (
        <mesh key={`v${i}`} position={[p.x, HW / 2, p.z]}
          onClick={(e) => handleClick(e, vertInfo)}
          onPointerOver={(e) => { (e as any).stopPropagation?.(); setHoveredType('vertBar'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[vert.diameter * S / 2, vert.diameter * S / 2, HW, 8]} />
          <meshStandardMaterial color={barColor('vertBar', '#C0392B', '#E74C3C')} roughness={0.4} metalness={0.6}
            emissive={isSelected('vertBar') ? '#E74C3C' : '#000'} emissiveIntensity={isSelected('vertBar') ? 0.3 : 0} />
        </mesh>
      ))}

      {/* Horizontal distributed bars */}
      {horizBars.map((y, i) => (
        <mesh key={`h${i}`} position={[0, y, 0]}
          onClick={(e) => handleClick(e, horizInfo)}
          onPointerOver={(e) => { (e as any).stopPropagation?.(); setHoveredType('horizBar'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <boxGeometry args={[LW, horiz.diameter * S, horiz.diameter * S]} />
          <meshStandardMaterial color={barColor('horizBar', '#2980B9', '#3498DB')} roughness={0.4} metalness={0.6}
            emissive={isSelected('horizBar') ? '#3498DB' : '#000'} emissiveIntensity={isSelected('horizBar') ? 0.3 : 0} />
        </mesh>
      ))}

      {/* Boundary element main bars */}
      {boundaryBars.map((p, i) => (
        <mesh key={`b${i}`} position={[p.x, HW / 2, p.z]}
          onClick={(e) => handleClick(e, boundaryMainInfo)}
          onPointerOver={(e) => { (e as any).stopPropagation?.(); setHoveredType('boundaryMain'); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
          <cylinderGeometry args={[boundaryR.diameter * S / 2, boundaryR.diameter * S / 2, HW, 10]} />
          <meshStandardMaterial color={barColor('boundaryMain', '#8E44AD', '#9B59B6')} roughness={0.4} metalness={0.6}
            emissive={isSelected('boundaryMain') ? '#9B59B6' : '#000'} emissiveIntensity={isSelected('boundaryMain') ? 0.3 : 0} />
        </mesh>
      ))}

      {/* Boundary element stirrups (both ends) */}
      {[-1, 1].map(side =>
        boundaryStirYs.map((y, i) => (
          <mesh key={`bs${side}${i}`} position={[side * (LW / 2 - BL / 2), y, 0]}
            onClick={(e) => handleClick(e, boundaryStirInfo)}
            onPointerOver={(e) => { (e as any).stopPropagation?.(); setHoveredType('boundaryStirrup'); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { setHoveredType(null); document.body.style.cursor = 'auto'; }}>
            <tubeGeometry args={[boundaryStirCurve, 32, boundaryStir.diameter * S / 2, 6, true]} />
            <meshStandardMaterial color={barColor('boundaryStirrup', '#27AE60', '#2ECC71')} roughness={0.4} metalness={0.6}
              emissive={isSelected('boundaryStirrup') ? '#2ECC71' : '#000'} emissiveIntensity={isSelected('boundaryStirrup') ? 0.3 : 0} />
          </mesh>
        ))
      )}

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
  const HW = params.hw * S;
  const LW = params.lw * S;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
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

      <div className="relative w-full h-[500px] lg:h-[600px] bg-surface rounded-xl border border-gray-200 overflow-hidden">
        {selected && <InfoTooltip info={selected} />}

        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          {[
            { name: '正面', pos: [0, HW / 2, LW * 1.5] as [number, number, number] },
            { name: '侧面', pos: [LW * 1.5, HW / 2, 0] as [number, number, number] },
            { name: '俯视', pos: [0, LW * 1.5, 0.1] as [number, number, number] },
            { name: '透视', pos: [LW, HW * 0.6, LW] as [number, number, number] },
          ].map(a => (
            <button key={a.name} onClick={() => setCameraTarget(a.pos)}
              className="px-2 py-1 rounded-md text-[11px] font-medium cursor-pointer bg-white/80 backdrop-blur-sm border border-gray-200/60 text-muted hover:bg-white hover:text-primary transition-colors">
              {a.name}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-1 px-2 py-1 rounded-md bg-white/80 backdrop-blur-sm border border-gray-200/60">
            <span className="text-[11px] text-muted">透明</span>
            <input type="range" min={0} max={0.4} step={0.02} value={concreteOpacity}
              onChange={e => setConcreteOpacity(parseFloat(e.target.value))} className="w-12 accent-accent" />
          </div>
        </div>

        <Canvas camera={{ position: [LW, HW * 0.6, LW], fov: 45 }} scene={{ background: new THREE.Color('#f8fafc') }}>
          <CameraController targetPosition={cameraTarget} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <ShearWallScene params={params} selected={selected} onSelect={setSelected} cutPosition={cutPosition} concreteOpacity={concreteOpacity} />
          <Grid args={[20, 20]} position={[0, -0.01, 0]} cellColor="#E2E8F0" sectionColor="#E2E8F0" fadeDistance={20} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, HW / 2, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击钢筋查看详情
        </div>
      </div>
    </div>
  );
}
