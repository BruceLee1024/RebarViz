'use client';

import { useMemo } from 'react';
import { slabReinforcement } from '@/lib/slab-reinforcement';
import { CurvedRebar } from './three/CurvedRebar';
import { FittedCamera } from './FittedCamera';

import { ViewerControls } from './ViewerControls';

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';

import { useFullscreen } from '@/lib/useFullscreen';
import * as THREE from 'three';
import type { SlabParams, RebarMeshInfo } from '@/lib/types';
import { S } from '@/lib/constants';



/** Support beam wireframe at slab edge */
function SupportBeam({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={size} />
        <meshPhysicalMaterial color="#94A3B8" transparent opacity={0.06} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
        <lineBasicMaterial color="#64748B" linewidth={1} />
      </lineSegments>
    </group>
  );
}

function SlabScene({ params, selected, onSelect, concreteOpacity }: {
  params: SlabParams; selected: RebarMeshInfo | null;
  onSelect: (info: RebarMeshInfo | null) => void; concreteOpacity: number;
}) {
  const width=params.spanX*S,depth=params.spanY*S,th=params.thickness*S,beamW=params.supportBeamWidth*S;
  const beamH=Math.max(th*2,.4);
  const layout=useMemo(()=>slabReinforcement(params),[params]);
  return <>
    <mesh position={[0,th/2,0]}><boxGeometry args={[width,th,depth]}/><meshPhysicalMaterial color="#BDC3C7" transparent opacity={concreteOpacity} side={THREE.DoubleSide} depthWrite={false}/></mesh>
    {[-1,1].map(side=><group key={side}>
      <SupportBeam position={[side*(width/2+beamW/2),th-beamH/2,0]} size={[beamW,beamH,depth+2*beamW]}/>
      <SupportBeam position={[0,th-beamH/2,side*(depth/2+beamW/2)]} size={[width,beamH,beamW]}/>
    </group>)}
    {layout.groups.flatMap(group=>group.positions.flatMap((across,i)=>group.curves.map((curve,j)=><CurvedRebar
      key={`${group.name}-${i}-${j}`} curve={curve} diameter={group.diameter} color={group.color}
      position={group.axis==='x'?[0,0,across]:[across,0,0]} rotation={group.axis==='x'?[0,0,0]:[0,-Math.PI/2,0]}
      info={{type:group.type,label:group.name,detail:`${group.spec} · ${group.count}根 · 单根中心线 ${group.lengthMm.toFixed(1)}mm · 标高 ${group.level.toFixed(1)}mm`}}
      selected={selected?.type===group.type} onSelect={onSelect}/>)))}
  </>;
}

function InfoTooltip({ info }: { info: RebarMeshInfo }) {
  const colorMap: Record<string, string> = {
    bottomX: 'bg-red-50 border-red-200 text-red-800',
    bottomY: 'bg-orange-50 border-orange-200 text-orange-800',
    topX: 'bg-purple-50 border-purple-200 text-purple-800',
    topY: 'bg-purple-50 border-purple-200 text-purple-800',
    distribution: 'bg-green-50 border-green-200 text-green-800',
    supportNegX: 'bg-sky-50 border-sky-200 text-sky-800',
    supportNegY: 'bg-teal-50 border-teal-200 text-teal-800',
  };
  const cls = colorMap[info.type] || 'bg-gray-50 border-gray-200 text-gray-800';
  return (
    <div className={`absolute top-3 right-3 px-4 py-3 rounded-xl border text-sm shadow-lg backdrop-blur-sm z-10 max-w-xs ${cls}`}>
      <p className="font-semibold">{info.label}</p>
      <p className="text-xs mt-1 opacity-80">{info.detail}</p>
    </div>
  );
}

export default function SlabViewer({ params }: { params: SlabParams }) {
  const [selected, setSelected] = useState<RebarMeshInfo | null>(null);
  const [concreteOpacity, setConcreteOpacity] = useState(0.12);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const { isFullscreen: fsActive, toggle: fsToggle, containerRef: fsContainerRef, containerClass: fsClass } = useFullscreen();
  const th = params.thickness * S;
  const sw = params.spanX * S;
  const sd = params.spanY * S;
  const camDist = Math.max(sw, sd, 3) * 1.2;

  return (
    <div data-viewer className="rv-viewer">
      <div className="rv-viewer-toolbar flex items-center gap-2 flex-wrap">
        {selected && (
          <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-muted cursor-pointer hover:bg-gray-200 transition-colors">
            取消选中
          </button>
        )}
      </div>

      <div ref={fsContainerRef} className={`rv-viewer-canvas relative w-full bg-surface overflow-hidden ${fsClass}`}>
        {selected && <InfoTooltip info={selected} />}

        <ViewerControls views={[
            { name: '正面', pos: [0, 0.2, camDist] as [number, number, number] },
            { name: '侧面', pos: [camDist, 0.2, 0] as [number, number, number] },
            { name: '俯视', pos: [0, camDist * 1.2, 0.1] as [number, number, number] },
            { name: '透视', pos: [camDist * 0.7, camDist * 0.5, camDist * 0.7] as [number, number, number] },
          ]} onView={setCameraTarget} opacity={concreteOpacity} onOpacity={setConcreteOpacity}
          fullscreen={fsActive} onFullscreen={fsToggle} />

        <Canvas camera={{ position: [camDist * 0.7, camDist * 0.5, camDist * 0.7], fov: 45 }} scene={{ background: new THREE.Color('#071725') }}>
          <FittedCamera targetPosition={cameraTarget} initialPosition={[camDist * 0.7, camDist * 0.5, camDist * 0.7]} center={[0, th / 2, 0]} bounds={[sw, Math.max(th, .3), sd]} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
          <SlabScene params={params} selected={selected} onSelect={setSelected} concreteOpacity={concreteOpacity} />
          <Grid args={[Math.ceil(camDist * 2), Math.ceil(camDist * 2)]} position={[0, -0.01, 0]} cellColor="#15384f" sectionColor="#215a72" fadeDistance={camDist * 3} />
          <axesHelper args={[1]} />
          <OrbitControls target={[0, th / 2, 0]} enableDamping dampingFactor={0.1} />
        </Canvas>
        <div className="rv-viewer-hints absolute bottom-3 left-1/2 -translate-x-1/2 bg-primary/70 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-sm pointer-events-none">
          左键旋转 · 右键平移 · 滚轮缩放 · 点击钢筋查看详情
        </div>
      </div>
    </div>
  );
}
