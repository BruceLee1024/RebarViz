'use client';

import { useMemo } from 'react';
import { bentHorizontalCurve } from '@/lib/foundation-reinforcement';
import type { RebarMeshInfo } from '@/lib/types';
import { CurvedRebar } from './CurvedRebar';

export function BentBarSet({ positions, axis, start, end, y, diameter, bend = 0, rightBend = bend, color, hiColor, info, selected, onSelect, visible }: {
  positions:number[]; axis:'x'|'z'; start:number; end:number; y:number; diameter:number; bend?:number; rightBend?:number;
  color:string;hiColor:string;info:RebarMeshInfo;selected:boolean;onSelect:(info:RebarMeshInfo|null)=>void;visible:boolean;
}) {
  const curve=useMemo(()=>bentHorizontalCurve(start,end,y,diameter,bend,rightBend),[start,end,y,diameter,bend,rightBend]);
  if(!visible)return null;
  return positions.map((p,i)=><CurvedRebar key={i} curve={curve} diameter={diameter} color={color} hiColor={hiColor}
    info={info} selected={selected} onSelect={onSelect} position={axis==='x'?[0,0,p]:[p,0,0]} rotation={axis==='x'?[0,0,0]:[0,-Math.PI/2,0]}/>);
}
