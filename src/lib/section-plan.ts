import type { FoundationParams, PileCapParams, RaftFoundationParams, StripFoundationParams } from './types';
import { parseSlabRebar, parseRebar } from './rebar';
import { slabBarPositions } from './slab-reinforcement';
import { pileCenters, stripDistributedPositions, stripTransverseStations, stripSolids } from './quantity-geometry';
import { raftColumnStripPositions, raftBeamArrangement } from './raft-reinforcement';
import { foundationBeamReinforcement } from './foundation-reinforcement';

export interface PlanBar { group:string;name:string;spec:string;axis:'x'|'z';start:[number,number];end:[number,number];diameter:number;color:string;layer:'bottom'|'top';short?:boolean;override?:boolean }
export interface PlanRect { x:number;z:number;width:number;depth:number;name:string }
export interface ReinforcementPlan { width:number;depth:number;bars:PlanBar[];columns:PlanRect[];supports:PlanRect[];piles:{x:number;z:number;diameter:number}[];notes:string[] }
const base=(width:number,depth:number):ReinforcementPlan=>({width,depth,bars:[],columns:[],supports:[],piles:[],notes:['平面图中线表示完整钢筋投影；多层、多排在平面中可能重叠，根数按各独立钢筋统计。']});
function add(p:ReinforcementPlan,group:string,name:string,spec:string,axis:'x'|'z',positions:number[],start:number,end:number,color:string,layer:'bottom'|'top'='bottom',short=false,override=false){
  const diameter=spec.includes('@')?parseSlabRebar(spec).diameter:parseRebar(spec).diameter;
  positions.forEach(position=>p.bars.push({group,name,spec,axis,start:axis==='x'?[start,position]:[position,start],end:axis==='x'?[end,position]:[position,end],diameter,color,layer,short,override}));
}
function bottomMesh(p:ReinforcementPlan,xSpec:string,ySpec:string,c:number,shortX=false,shortY=false){
  const x=parseSlabRebar(xSpec),y=parseSlabRebar(ySpec);
  const xs=slabBarPositions(p.width,c,x.diameter,x.spacing).map(q=>q*1000),ys=slabBarPositions(p.depth,c,y.diameter,y.spacing).map(q=>q*1000);
  const lx=p.depth-2*c-x.diameter,ly=p.width-2*c-y.diameter;
  xs.forEach((q,i)=>add(p,'bottomX',shortX&&i%2?'X向底筋 · 减短':'X向底筋',xSpec,'z',[q],-lx/2*(shortX&&i%2?.9:1),lx/2*(shortX&&i%2?.9:1),'#f87171','bottom',shortX&&i%2===1));
  ys.forEach((q,i)=>add(p,'bottomY',shortY&&i%2?'Y向底筋 · 减短':'Y向底筋',ySpec,'x',[q],-ly/2*(shortY&&i%2?.9:1),ly/2*(shortY&&i%2?.9:1),'#6ab7f6','bottom',shortY&&i%2===1));
}
export function foundationPlan(p:FoundationParams):ReinforcementPlan {
  const plan=base(p.bx,p.by),c=p.cover||40;
  bottomMesh(plan,p.bottomBarX,p.bottomBarY,c,!!p.shortenBottomBarX&&p.by>=2500,!!p.shortenBottomBarY&&p.bx>=2500);
  const centers=p.columnCount===2&&p.colSpacing?[-p.colSpacing/2,p.colSpacing/2]:[0];
  plan.columns=centers.map(x=>({x,z:0,width:p.colBx,depth:p.colBy,name:'柱'}));
  if(centers.length===2&&p.colSpacing){
    const band=Math.min(p.topBandWidth||Math.max(p.colBy*2,1200),p.by-2*c);
    if(p.topBarX){const r=parseSlabRebar(p.topBarX),n=p.topBarXCount&&p.topBarXCount>0?p.topBarXCount:Math.floor(band/r.spacing)+1;
      add(plan,'topX','顶部纵向筋',p.topBarX,'x',Array.from({length:n},(_,i)=>n>1?-band/2+band*i/(n-1):0),-(p.colSpacing+p.colBx)/2,(p.colSpacing+p.colBx)/2,'#fbbf77','top');}
    if(p.topBarY){const r=parseSlabRebar(p.topBarY),gap=p.colSpacing-p.colBx,n=Math.max(0,Math.floor(gap/r.spacing)+1);
      add(plan,'topY','顶部分布筋',p.topBarY,'z',Array.from({length:n},(_,i)=>-gap/2+i*r.spacing),-band/2,band/2,'#61dbaa','top');}
  }
  const beam=foundationBeamReinforcement(p);
  beam.bars.forEach(q=>add(plan,q.role==='top'?'beamTop':'beamBottom',`基础梁${q.role==='top'?'顶':'底'}筋`,`1${q.grade}${q.diameter}`,'x',[q.z*1000],q.curve.getPoint(0).x*1000,q.curve.getPoint(1).x*1000,q.role==='top'?'#fbbf77':'#c4b5fd',q.role==='top'?'top':'bottom'));
  plan.notes.push('X向底筋按X向站位排布、沿Y向铺设；Y向底筋沿X向铺设。端弯在平面中投影为端部。');
  return plan;
}
export function pileCapPlan(p:PileCapParams):ReinforcementPlan {
  const plan=base(p.bx,p.by);bottomMesh(plan,p.bottomBarX,p.bottomBarY,p.cover||50);
  plan.columns=[{x:0,z:0,width:p.colBx,depth:p.colBy,name:'柱'}];
  plan.piles=pileCenters(p).map(q=>({...q,diameter:p.pileDiameter}));
  plan.notes.push('桩位按当前矩形、三角形或圆形布置显示；底筋按真实方向和完整根数投影。');
  return plan;
}
export function stripFoundationPlan(p:StripFoundationParams):ReinforcementPlan {
  const plan=base(p.length,p.width),c=p.cover||40,gap=p.supportCount===2&&p.supportSpacing?Math.max(p.supportSpacing-p.supportWidth,0):0;
  const bottom=stripTransverseStations(p,'bottom'),top=stripTransverseStations(p,'top');
  add(plan,'bottom','底部横向受力筋',p.bottomBar,'z',bottom.base,-p.width/2+c,p.width/2-c,'#f87171');
  add(plan,'dist','底部分布筋',p.distBar,'x',stripDistributedPositions(p),-p.length/2+c,p.length/2-c,'#6ab7f6');
  if(p.topBar&&gap>0)add(plan,'top','顶部横向受力筋',p.topBar,'z',top.base,-gap/2,gap/2,'#fbbf77','top');
  if(p.topDistBar&&gap>0){const r=parseSlabRebar(p.topDistBar),n=Math.floor(gap/r.spacing)+1;
    add(plan,'topDist','顶部分布筋',p.topDistBar,'x',Array.from({length:n},(_,i)=>n>1?-gap/2+gap*i/(n-1):0),-p.length/2+c,p.length/2-c,'#61dbaa','top');}
  if(p.localBottomBar)add(plan,'localBottom','原位修正底筋',p.localBottomBar,'z',bottom.local,-p.width/2+c,p.width/2-c,'#f472b6','bottom',false,true);
  if(p.localTopBar)add(plan,'localTop','原位修正顶筋',p.localTopBar,'z',top.local,gap>0?-gap/2:-p.width/2+c,gap>0?gap/2:p.width/2-c,'#c4b5fd','top',false,true);
  plan.supports=stripSolids(p).slice(1).map((q,i)=>({x:(q.x0+q.x1)/2,z:(q.z0+q.z1)/2,width:q.x1-q.x0,depth:q.z1-q.z0,name:i<p.supportCount?(p.supportType==='beam'?'JL':'墙'):'JCL'}));
  plan.notes.push('原位修正段替换对应范围内原底筋、顶筋；分布筋保留。基础梁支承与外伸范围以虚线显示。');
  return plan;
}
export function raftPlan(p:RaftFoundationParams):ReinforcementPlan {
  const plan=base(p.lx,p.ly),c=p.cover||40;
  const addGrid=(spec:string|undefined,group:string,name:string,axis:'x'|'z',extent:number,length:number,color:string,layer:'bottom'|'top')=>{
    if(!spec)return;const r=parseSlabRebar(spec),positions=Array.from({length:Math.max(0,Math.floor((extent-2*c)/r.spacing)+1)},(_,i)=>-extent/2+c+i*r.spacing);
    add(plan,group,name,spec,axis,positions,-length/2+c,length/2-c,color,layer);
  };
  addGrid(p.bottomBarX,'bottomX','X向底筋','z',p.lx,p.ly,'#f87171','bottom');addGrid(p.bottomBarY,'bottomY','Y向底筋','x',p.ly,p.lx,'#6ab7f6','bottom');
  addGrid(p.topBarX,'topX','X向面筋','z',p.lx,p.ly,'#fbbf77','top');addGrid(p.topBarY,'topY','Y向面筋','x',p.ly,p.lx,'#61dbaa','top');
  const xs=Array.from({length:p.colCountX},(_,i)=>(i-(p.colCountX-1)/2)*p.colSpacingX),zs=Array.from({length:p.colCountY},(_,i)=>(i-(p.colCountY-1)/2)*p.colSpacingY);
  plan.columns=xs.flatMap(x=>zs.map(z=>({x,z,width:p.colBx,depth:p.colBy,name:'柱'})));
  if(p.raftType==='flatPlate'){
    if(p.colStripBarX)add(plan,'stripX','柱下板带X附加筋',p.colStripBarX,'x',raftColumnStripPositions(p,'x'),-p.lx/2+c,p.lx/2-c,'#fbbf77');
    if(p.colStripBarY)add(plan,'stripY','柱下板带Y附加筋',p.colStripBarY,'z',raftColumnStripPositions(p,'y'),-p.ly/2+c,p.ly/2-c,'#c4b5fd');
  }
  if(p.raftType==='beamSlab'){
    const a=raftBeamArrangement(p),b=p.beamB||600;
    plan.supports=[...zs.map(z=>({x:0,z,width:p.lx,depth:b,name:'X向JL'})),...xs.map(x=>({x,z:0,width:b,depth:p.ly,name:'Y向JL'}))];
    for(const [role,offsets,spec,color,layer] of [['beamBottom',a.xBottom,p.beamBottom||'4C25','#c4b5fd','bottom'],['beamTop',a.xTop,p.beamTop||'6C25','#fbbf77','top']] as const)add(plan,role,'X向基础梁纵筋',spec,'x',zs.flatMap(z=>offsets.map(dz=>z+dz)),-p.lx/2,p.lx/2,color,layer);
    for(const [role,offsets,spec,color,layer] of [['beamBottomY',a.yBottom,p.beamBottom||'4C25','#c4b5fd','bottom'],['beamTopY',a.yTop,p.beamTop||'6C25','#fbbf77','top']] as const)add(plan,role,'Y向基础梁纵筋',spec,'z',xs.flatMap(x=>offsets.map(dx=>x+dx)),-p.ly/2,p.ly/2,color,layer);
  }
  plan.notes.push('全数显示底筋、面筋与附加板带，重叠板带的公共站位只计一次。');return plan;
}
