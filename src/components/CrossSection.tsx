'use client';

import { useRef, useEffect, useState, useMemo, type PointerEvent } from 'react';
import { Download, Minus, Plus, Maximize2, ChevronDown } from 'lucide-react';
import type { BeamParams, ColumnParams, SlabParams, StairParams, ShearWallParams, FoundationParams, StripFoundationParams, PileCapParams, RaftFoundationParams } from '@/lib/types';
import { beamSection, columnSection, stairSection, slabSection, wallSection, planScene, type SectionScene } from '@/lib/section-scene';
import { foundationPlan, stripFoundationPlan, pileCapPlan, raftPlan, type ReinforcementPlan } from '@/lib/section-plan';
import { wallOpening } from '@/lib/quantity-geometry';
import { renderSection, exportSectionImage, sectionColor } from '@/lib/section-render';

function SectionFigure({scene,filename,controls}:{scene:SectionScene;filename:string;controls?:React.ReactNode}) {
  const canvasRef=useRef<HTMLCanvasElement>(null),viewportRef=useRef<HTMLDivElement>(null),dragRef=useRef<{x:number;y:number;pan:[number,number]}|null>(null);
  const [size,setSize]=useState({width:400,height:190}),[zoom,setZoom]=useState(1),[pan,setPan]=useState<[number,number]>([0,0]);
  useEffect(()=>{const element=viewportRef.current;if(!element)return;const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width>0)setSize({width:Math.round(entry.contentRect.width),height:Math.round(entry.contentRect.height)});});observer.observe(element);return()=>observer.disconnect();},[]);
  useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(size.width*dpr);canvas.height=Math.round(size.height*dpr);const ctx=canvas.getContext('2d');if(!ctx)return;ctx.scale(dpr,dpr);renderSection(ctx,scene,size.width,size.height,zoom,pan);},[scene,size,zoom,pan]);
  function startDrag(e:PointerEvent<HTMLDivElement>){if(zoom<=1)return;dragRef.current={x:e.clientX,y:e.clientY,pan};e.currentTarget.setPointerCapture(e.pointerId);}
  function moveDrag(e:PointerEvent<HTMLDivElement>){const drag=dragRef.current;if(drag)setPan([drag.pan[0]+e.clientX-drag.x,drag.pan[1]+e.clientY-drag.y]);}
  return <figure className="rv-section-figure" aria-label={scene.title}>
    <div className="rv-section-toolbar">
      <div className="rv-section-location"><strong>{scene.title}</strong><span>{scene.subtitle}</span></div>
      <div className="rv-section-tools"><button aria-label="缩小截面图" disabled={zoom<=1} onClick={()=>{setZoom(Math.max(1,zoom-.5));setPan([0,0]);}}><Minus size={13}/></button><output aria-label="截面图缩放比例">{Math.round(zoom*100)}%</output><button aria-label="放大截面图" disabled={zoom>=4} onClick={()=>setZoom(Math.min(4,zoom+.5))}><Plus size={13}/></button><button aria-label="适应截面图" onClick={()=>{setZoom(1);setPan([0,0]);}}><Maximize2 size={13}/></button><button aria-label="下载截面图" title="下载包含标注的完整配筋图" onClick={()=>exportSectionImage(scene,filename)}><Download size={13}/></button></div>
    </div>
    {controls&&<div className="rv-section-controls">{controls}</div>}
    <div className="rv-section-figure-body">
      <div ref={viewportRef} className={`rv-section-viewport${zoom>1?' is-zoomed':''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>{dragRef.current=null;}} onPointerCancel={()=>{dragRef.current=null;}}>
        <canvas ref={canvasRef} role="img" aria-label={`${scene.title}，尺寸${scene.width}乘${scene.height}毫米；${scene.legend.map(q=>`${q.name}${q.spec}${q.count!=null?`，${q.count}${q.unit||'根'}`:''}`).join('；')}`} />
      </div>
      <figcaption className="rv-section-legend" tabIndex={0} aria-label="配筋清单"><div className="rv-section-legend-heading">配筋清单<span>{scene.legend.length} 组</span></div><dl>{scene.legend.map((item,i)=><div key={`${item.name}-${i}`}><dt><i style={{background:sectionColor(item.color)}}/>{item.name}</dt><dd><span>{item.spec}</span>{item.count!=null&&<b>{item.count} <small>{item.unit||'根'}</small></b>}</dd></div>)}</dl></figcaption>
    </div>
    <details className="rv-section-notes"><summary>图示说明<span>{scene.kind==='plan'?'完整配筋平面 · 未截断根数':'跟随剖切范围显示'}</span><ChevronDown size={12}/></summary><ul>{scene.notes.map((note,i)=><li key={i}>{note}</li>)}<li>图形保持等比例；密集钢筋可放大并拖动查看。导出图片包含完整图形、规格和数量。</li></ul></details>
  </figure>;
}
function ViewChoices<T extends string>({value,onChange,options,label}:{value:T;onChange:(value:T)=>void;options:readonly (readonly [T,string])[];label:string}) {
  return <div role="group" aria-label={label} className="rv-section-choice">{options.map(([key,text])=><button key={key} aria-pressed={value===key} onClick={()=>onChange(key)}>{text}</button>)}</div>;
}
export function BeamCrossSection({params,cutPosition}:{params:BeamParams;cutPosition?:number|null;compact?:boolean;dark?:boolean}) {
  const scene=useMemo(()=>beamSection(params,cutPosition),[params,cutPosition]);return <SectionFigure scene={scene} filename="beam-section.png"/>;
}
export function ColumnCrossSection({params,cutPosition}:{params:ColumnParams;cutPosition?:number|null}) {
  const scene=useMemo(()=>columnSection(params,cutPosition),[params,cutPosition]);return <SectionFigure scene={scene} filename="column-section.png"/>;
}
export function StairCrossSection({params}:{params:StairParams}) {
  const [zone,setZone]=useState<'middle'|'low'|'high'>('middle'),scene=useMemo(()=>stairSection(params,zone),[params,zone]);
  return <SectionFigure scene={scene} filename="stair-section.png" controls={<ViewChoices label="楼梯剖切区域" value={zone} onChange={setZone} options={[['middle','跨中'],['low','低端负筋区'],['high','高端负筋区']]}/>}/>;
}
export function SlabCrossSection({params}:{params:SlabParams}) {
  const [zone,setZone]=useState<'middle'|'support'>('middle'),[axis,setAxis]=useState<'x'|'z'>('x'),scene=useMemo(()=>slabSection(params,zone,axis),[params,zone,axis]);
  return <SectionFigure scene={scene} filename="slab-section.png" controls={<><ViewChoices label="板剖切方向" value={axis} onChange={setAxis} options={[['x','X向剖切'],['z','Y向剖切']]}/><ViewChoices label="板剖切区域" value={zone} onChange={setZone} options={[['middle','跨中'],['support','支座']]}/></>}/>;
}
export function ShearWallCrossSection({params,cutPosition}:{params:ShearWallParams;cutPosition?:number|null}) {
  const [zone,setZone]=useState<'middle'|'bottom'|'above'>('middle'),hole=wallOpening(params)[0],height=zone==='bottom'?Math.min(params.hw/10,200):zone==='above'&&hole?Math.min(params.hw-50,hole.y1+100):hole?(hole.y0+hole.y1)/2:params.hw/2;
  const scene=useMemo(()=>wallSection(params,cutPosition==null?height:cutPosition*1000),[params,height,cutPosition]);
  return <SectionFigure scene={scene} filename="shearwall-section.png" controls={cutPosition==null&&<ViewChoices label="墙剖切区域" value={zone} onChange={setZone} options={hole?[['bottom','墙脚'],['middle','洞口中部'],['above','洞口上方']]:[['bottom','墙脚'],['middle','墙身中部']]}/>}/>;
}
function PlanFigure({plan,title,filename}:{plan:ReinforcementPlan;title:string;filename:string}) {
  const [layer,setLayer]=useState<'bottom'|'top'|'all'>('bottom'),scene=useMemo(()=>planScene(plan,title,layer),[plan,title,layer]);
  return <SectionFigure scene={scene} filename={filename} controls={<ViewChoices label="配筋平面层位" value={layer} onChange={setLayer} options={[['bottom','底部配筋'],['top','顶部配筋'],['all','全部投影']]}/>}/>;
}
export function FoundationCrossSection({params}:{params:FoundationParams}) {const plan=useMemo(()=>foundationPlan(params),[params]);return <PlanFigure plan={plan} title="独立基础配筋平面" filename="foundation-section.png"/>;}
export function StripFoundationCrossSection({params}:{params:StripFoundationParams}) {const plan=useMemo(()=>stripFoundationPlan(params),[params]);return <PlanFigure plan={plan} title="条基配筋平面" filename="stripfoundation-section.png"/>;}
export function PileCapCrossSection({params}:{params:PileCapParams}) {const plan=useMemo(()=>pileCapPlan(params),[params]);return <PlanFigure plan={plan} title="承台配筋平面" filename="pilecap-section.png"/>;}
export function RaftCrossSection({params}:{params:RaftFoundationParams}) {const plan=useMemo(()=>raftPlan(params),[params]);return <PlanFigure plan={plan} title="筏板配筋平面" filename="raft-section.png"/>;}
