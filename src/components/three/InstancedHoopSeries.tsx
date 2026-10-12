'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { createCompositeStirrupCurves } from '@/lib/rebar-shapes';
import { cappedRebarGeometry } from '@/lib/rebar-curve';
import type { RebarMeshInfo } from '@/lib/types';

/** Full hoop series with one shared geometry and draw call per independent hoop. */
export function InstancedHoopSeries({ positions, width, height, diameter, legs, color, hiColor, info, selected, onSelect, barPositions }: {
  barPositions?:number[]; positions:number[];width:number;height:number;diameter:number;legs:number;color:string;hiColor:string;
  info:RebarMeshInfo;selected:boolean;onSelect:(info:RebarMeshInfo|null)=>void;
}) {
  const refs=useRef<(THREE.InstancedMesh|null)[]>([]);
  const [hovered,setHovered]=useState(false);
  const hoops=useMemo(()=>createCompositeStirrupCurves({width,height,diameter,legs,plane:'yz',barPositions}).hoops,[width,height,diameter,legs,barPositions]);
  const geometries=useMemo(()=>hoops.map(hoop=>cappedRebarGeometry(hoop.fullCurve,160,diameter*.0005)),[hoops,diameter]);
  const hitGeometries=useMemo(()=>hoops.map(hoop=>cappedRebarGeometry(hoop.fullCurve,64,Math.max(.045,diameter*.0025))),[hoops,diameter]);
  useEffect(()=>()=>[...geometries,...hitGeometries].forEach(g=>g.dispose()),[geometries,hitGeometries]);
  useEffect(()=>{
    const matrix=new THREE.Matrix4();
    for(const mesh of refs.current) if(mesh) {
      positions.forEach((x,i)=>mesh.setMatrixAt(i,matrix.makeTranslation(x,0,0)));
      mesh.instanceMatrix.needsUpdate=true;
      mesh.computeBoundingSphere();
    }
  },[positions,geometries,hitGeometries]);
  if(!positions.length)return null;
  return <group onClick={e=>{e.stopPropagation();onSelect(selected?null:{...info,groupCount:positions.length,instanceIndex:(e.instanceId??0)+1});}}
    onPointerOver={e=>{e.stopPropagation();setHovered(true);document.body.style.cursor='pointer';}}
    onPointerOut={()=>{setHovered(false);document.body.style.cursor='auto';}}>
    {geometries.map((geometry,i)=><instancedMesh key={i} ref={node=>{refs.current[i]=node;}} args={[geometry,undefined,positions.length]} raycast={()=>{}}>
      <meshStandardMaterial color={selected||hovered?hiColor:color} roughness={.4} metalness={.6}
        emissive={selected?hiColor:color} emissiveIntensity={selected?.3:.06}/>
    </instancedMesh>)}
    {hitGeometries.map((geometry,i)=><instancedMesh key={`hit-${i}`} ref={node=>{refs.current[geometries.length+i]=node;}} args={[geometry,undefined,positions.length]}>
      <meshBasicMaterial transparent opacity={0} depthWrite={false}/>
    </instancedMesh>)}
  </group>;
}
