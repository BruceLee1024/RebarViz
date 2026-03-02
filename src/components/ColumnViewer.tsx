'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { ColumnParams, RebarMeshInfo } from '@/lib/types';
import { parseRebar, parseStirrup, gradeLabel } from '@/lib/rebar';
import { S } from '@/lib/constants';

function CameraController({ targetPosition }: { targetPosition: [number, number, number] | null }) {
  const { camera } = useThree();
  useEffect(() => {
    if (targetPosition) { camera.position.set(...targetPosition); camera.updateProjectionMatrix(); }
  }, [targetPosition, camera]);
  return null;
}

function ClickableBar({ position, height, diameter, color, hiColor, info, selected, onSelect }: {
  position: [number, number, number]; height: number; diameter: number;
  color: string; hiColor: string; info: RebarMeshInfo;
  selected: boolean; onSelect: (info: RebarMeshInfo | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const activeColor = selected ? hiColor : hovered ? hiColor : color;
  const scale = selected ? 1.3 : hovered ? 1.15 : 1;
  return (
    <mesh position={position}
      onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : info); }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      scale={[scale, 1, scale]}>
      <cylinderGeometry args={[diameter * S / 2, diameter * S / 2, height, 12]} />
      <meshStandardMaterial color={activeColor} roughness={0.4} metalness={0.6} emissive={selected ? hiColor : '#000000'} emissiveIntensity={selected ? 0.3 : 0} />
    </mesh>
  );
}

function ColumnScene({ params, selected, onSelect, cutPosition, concreteOpacity }: {
  params: ColumnParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void; cutPosition: number | null; concreteOpacity: number;
}) {
  const bm = params.b * S;
  const hm = params.h * S;
  const COVER = (params.cover || 25) * S;
  const COL_H = (params.height || 3000) * S;
  const mainR = parseRebar(params.main);
  const stir = parseStirrup(params.stirrup);
  const innerW = bm - 2 * COVER;
  const innerH = hm - 2 * COVER;

  const rebarPositions = useMemo(() => {
    const perSide = Math.max(Math.round(mainR.count / 4), 2);
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < perSide; i++) pts.push({ x: -innerW / 2 + (innerW * i) / (perSide - 1), z: innerH / 2 });
    for (let i = 1; i < perSide; i++) pts.push({ x: innerW / 2, z: innerH / 2 - (innerH * i) / (perSide - 1) });
    for (let i = 1; i < perSide; i++) pts.push({ x: innerW / 2 - (innerW * i) / (perSide - 1), z: -innerH / 2 });
    for (let i = 1; i < perSide - 1; i++) pts.push({ x: -innerW / 2, z: -innerH / 2 + (innerH * i) / (perSide - 1) });
    return pts.slice(0, mainR.count);
  }, [mainR.count, innerW, innerH]);

  const stirrups = useMemo(() => {
    const positions: number[] = [];
    const denseZone = 0.5;
    const denseS = stir.spacingDense * S;
    const normalS = stir.spacingNormal * S;
    for (let y = 0.05; y < denseZone; y += denseS) positions.push(y);
    for (let y = denseZone; y < COL_H - denseZone; y += normalS) positions.push(y);
    for (let y = COL_H - denseZone; y < COL_H - 0.05; y += denseS) positions.push(y);
    return positions;
  }, [stir.spacingDense, stir.spacingNormal, COL_H]);

  const stirrupCurve = useMemo(() => {
    const w = innerW + stir.diameter * S;
    const h = innerH + stir.diameter * S;
    const w2 = w / 2, h2 = h / 2, r = 0.015;
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
    const pts = shape.getPoints(40);
    return new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, 0, p.y)), true);
  }, [innerW, innerH, stir.diameter]);

  const [stirHovered, setStirHovered] = useState(false);
  const stirSelected = selected?.type === 'stirrup';
  const mainSelected = selected?.type === 'main';

  const stirInfo: RebarMeshInfo = { type: 'stirrup', label: '箍筋', detail: `${params.stirrup} · ${gradeLabel(stir.grade)} Φ${stir.diameter} 加密${stir.spacingDense}/非加密${stir.spacingNormal} ${stir.legs}肢箍` };
  const mainInfo: RebarMeshInfo = { type: 'main', label: '纵向钢筋', detail: `${params.main} · ${mainR.count}根 ${gradeLabel(mainR.grade)} Φ${mainR.diameter}，沿截面周边均匀布置` };

  return (
    <>
      <mesh position={[0, COL_H / 2, 0]} onClick={() => onSelect(null)} visible={false}>
        <boxGeometry args={[bm + 1, COL_H + 1, hm + 1]} />
        <meshBasicMaterial />
      </mesh>

      <mesh position={[0, COL_H / 2, 0]}>
        <boxGeometry args={[bm, COL_H, hm]} />
        <meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false} roughness={0.8} />
      </mesh>
      <lineSegments position={[0, COL_H / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(bm, COL_H, hm)]} />
        <lineBasicMaterial color="#94A3B8" />
      </lineSegments>

      {rebarPositions.map((p, i) => (
        <ClickableBar key={`r${i}`} position={[p.x, COL_H / 2, p.z]} height={COL_H} diameter={mainR.diameter}
          color="#C0392B" hiColor="#E74C3C" info={mainInfo} selected={mainSelected} onSelect={onSelect} />
      ))}

      {stirrups.map((y, i) => (
        <mesh key={`s${i}`} position={[0, y, 0]}
          onClick={(e) => { e.stopPropagation(); onSelect(stirSelected ? null : stirInfo); }}
          onPointerOver={(e) => { e.stopPropagation(); setStirHovered(true); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setStirHovered(false); document.body.style.cursor = 'auto'; }}>
          <tubeGeometry args={[stirrupCurve, 48, stir.diameter * S / 2, 8, true]} />
          <meshStandardMaterial
            color={stirSelected ? '#2ECC71' : stirHovered ? '#2ECC71' : '#27AE60'}
            roughness={0.4} metalness={0.6}
            emissive={stirSelected ? '#2ECC71' : '#000000'} emissiveIntensity={stirSelected ? 0.3 : 0} />
        </mesh>
      ))}

      {cutPosition !== null && (
        <group position={[0, cutPosition, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <planeGeometry args={[bm * 1.5, hm * 1.5]} />
            <meshBasicMaterial color="#3B82F6" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineLoop geometry={new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-bm * 0.75, -hm * 0.75, 0),
            new THREE.Vector3( bm * 0.75, -hm * 0.75, 0),
            new THREE.Vector3( bm * 0.75,  hm * 0.75, 0),
            new THREE.Vector3(-bm * 0.75,  hm * 0.75, 0),
          ])}>
            <lineBasicMaterial color="#2563EB" linewidth={2} />
          </lineLoop>
        </group>
      )}
    </>
  );
}

function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    main: 'bg-red-50 border-red-200 text-red-800',
    stirrup: 'bg-green-50 border-green-200 text-green-800',
  };
  const cls = colorMap[info.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`absolute top-3 right-3 px-4 py-3 rounded-xl border text-sm shadow-lg backdrop-blur-sm z-10 max-w-xs ${cls}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="text-xs mt-1 opacity-80">{info.detail}</p>
    </div>
  );
}

export default function ColumnViewer({ params, cutPosition, showCut, onCutPositionChange, onShowCutChange }: {
  params: ColumnParams;
  cutPosition: number | null;
  showCut: boolean;
  onCutPositionChange: (v: number | null) => void;
  onShowCutChange: (v: boolean) => void;
}) {
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.15);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const COL_H = (params.height || 3000) * S;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { onShowCutChange(!showCut); if (showCut) onCutPositionChange(null); else onCutPositionChange(COL_H / 2); }}
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
          <input type="range" min={0.1} max={COL_H - 0.1} step={0.05} value={cutPosition ?? COL_H / 2}
            onChange={e => onCutPositionChange(parseFloat(e.target.value))} className="flex-1 accent-accent" />
          <span className="text-xs text-muted w-16 text-right">{((cutPosition ?? COL_H / 2) * 1000).toFixed(0)}mm</span>
        </div>
      )}

      <div className="relative w-full h-[500px] lg:h-[600px] bg-surface rounded-xl border border-gray-200 overflow-hidden">
        {selected && <InfoTooltip info={selected} />}

        <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
          {[
            { name: '正面', pos: [0, COL_H / 2, 4] as [number, number, number] },
            { name: '侧面', pos: [4, COL_H / 2, 0] as [number, number, number] },
            { name: '俯视', pos: [0, 5, 0.1] as [number, number, number] },
            { name: '透视', pos: [2, 2, 3] as [number, number, number] },
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

        <Canvas camera={{ position: [2, 2, 3], fov: 45 }} scene={{ background: new THREE.Color('#f8fafc') }}>
          <CameraController targetPosition={cameraTarget} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <ColumnScene params={params} selected={selected} onSelect={setSelected} cutPosition={cutPosition} concreteOpacity={concreteOpacity} />
          <Grid args={[10, 10]} position={[0, -0.01, 0]} cellColor="#E2E8F0" sectionColor="#E2E8F0" fadeDistance={15} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, COL_H / 2, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击钢筋查看详情
        </div>
      </div>
    </div>
  );
}
