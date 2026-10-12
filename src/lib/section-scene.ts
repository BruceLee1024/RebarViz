import type { BeamParams, ColumnParams, SlabParams, StairParams, ShearWallParams } from './types';
import { parseRebar, parseRebarBottom, parseStirrup, parseSlabRebar, parseSideBar, parseTieBar, autoTieBar } from './rebar';
import { beamLongitudinalLayout, BEAM_BAR_NAMES } from './beam-longitudinal';
import { columnSectionBars, columnHoopLayout } from './reinforcement-layout';
import { beamStirrupBarPositions, createCompositeStirrupCurves, createCompositeStirrupSpec, createTieBarCurves, resolveTieSideOffsetMm } from './rebar-shapes';
import { slabReinforcement } from './slab-reinforcement';
import { stairReinforcement } from './stair-reinforcement';
import { wallDistributedReinforcement } from './wall-reinforcement';
import { wallSolids, wallOpening, wallTiePositions } from './quantity-geometry';
import type { ReinforcementPlan } from './section-plan';
export type SectionPoint=[number,number];
export interface SectionPath {points:SectionPoint[];color:string;diameter?:number;fill?:string;dash?:boolean;label?:string}
export interface SectionDot {point:SectionPoint;diameter:number;color:string}
export interface SectionLegend {name:string;spec:string;color:string;count?:number;unit?:string}
export interface SectionScene {title:string;subtitle:string;kind:'section'|'plan';width:number;height:number;paths:SectionPath[];dots:SectionDot[];legend:SectionLegend[];notes:string[];yDown?:boolean;cover?:number}
const RED='#f87171',BLUE='#6ab7f6',PURPLE='#c4b5fd',TEAL='#52d4c8',GREEN='#61dbaa';
const scene=(title:string,width:number,height:number,subtitle=''):SectionScene=>({title,subtitle,kind:'section',width,height,paths:[],dots:[],legend:[],notes:['尺寸单位 mm；圆点表示穿过截面的钢筋，线表示截面内或邻近层位的钢筋投影。']});
const rectangle=(x:number,y:number,w:number,h:number,color='#7fabc2',fill='#112c40',dash=false):SectionPath=>({points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]],color,fill,dash});
function hoops(s:SectionScene,width:number,height:number,d:number,legs:number,cx:number,cy:number,barPositions?:number[]) {
  const h=createCompositeStirrupCurves({width:width*.001,height:height*.001,diameter:d,legs,plane:'xz',barPositions:barPositions?.map(x=>x*.001)});
  h.hoops.forEach(q=>s.paths.push({points:q.fullCurve.getPoints(120).map(p=>[cx+p.x*1000,cy+(s.yDown?1:-1)*p.z*1000]),color:GREEN,diameter:d}));return h;
}
export function beamSection(p:BeamParams,cut?:number|null):SectionScene {
  const s=scene('梁横截面',p.b,p.h,cut==null?'跨中典型面':`剖切 X = ${(cut*1000).toFixed(0)} mm`),c=p.cover||25;
  s.cover=c;s.paths.push(rectangle(-p.b/2,0,p.b,p.h));
  const stir=parseStirrup(p.stirrup),layout=beamLongitudinalLayout(p),n=p.spanCount||1,spans=p.spanLengths?.length===n?p.spanLengths:Array(n).fill(p.spanLength||4000);
  const total=spans.reduce((a,b)=>a+b,0)+(n-1)*(p.hc||500),x=cut==null?total/2:cut*1000+total/2;
  const used=layout.rows.filter(row=>row.role==='top'||row.role==='bottom'||(row.role.startsWith('left')?x<=row.bodyLengthMm:total-x<=row.bodyLengthMm));
  const stations=beamStirrupBarPositions(p.b-2*c-stir.diameter,stir.diameter,p.top,p.bottom);
  const spec=createCompositeStirrupSpec({widthMm:p.b-2*c-stir.diameter,heightMm:p.h-2*c-stir.diameter,diameterMm:stir.diameter,legs:stir.legs,barPositionsMm:stations});
  hoops(s,spec.widthMm,spec.heightMm,stir.diameter,stir.legs,0,p.h/2,stations);
  used.forEach(row=>{const color=row.role.includes('Support')?PURPLE:RED;row.zs.forEach(z=>s.dots.push({point:[z*1000,row.y*1000],diameter:row.diameter,color}));
    s.legend.push({name:BEAM_BAR_NAMES[row.role]+(row.row?` · 第${row.row+1}排`:''),spec:`${row.count}${row.grade}${row.diameter}`,color,count:row.count,unit:'根'});});
  s.legend.push({name:'复合封闭箍',spec:p.stirrup,color:GREEN,count:spec.pieceCount,unit:'个/道'});
  const side=p.sideBar?parseSideBar(p.sideBar):null;
  if(side){const top=used.find(q=>q.role==='top'),bottom=used.find(q=>q.role==='bottom'),t=parseRebar(p.top),b=parseRebarBottom(p.bottom),offset=resolveTieSideOffsetMm({sectionWidthMm:p.b,coverMm:c,stirrupDiameterMm:stir.diameter,sideBarDiameterMm:side.diameter});
    const low=(bottom?.y||0)*1000+b.diameter/2+Math.max(side.diameter,25),high=(top?.y||p.h/1000)*1000-t.diameter/2-Math.max(side.diameter,25),per=Math.ceil(side.count/2);
    const tie=p.tieBar?parseTieBar(p.tieBar):autoTieBar(p.b,stir.grade,stir.diameter);
    for(let i=0;i<per;i++){const y=low+(high-low)*(i+1)/(per+1);for(const z of [-offset,offset])s.dots.push({point:[z,y],diameter:side.diameter,color:BLUE});
      if(tie){const curve=createTieBarCurves({sideOffset:offset*.001,tieDiameter:tie.diameter,sideBarDiameter:side.diameter}).fullCurve;s.paths.push({points:curve.getPoints(100).map(q=>[q.z*1000,y+q.y*1000]),color:TEAL,diameter:tie.diameter});}}
    s.legend.push({name:side.prefix==='G'?'腰筋':'抗扭筋',spec:p.sideBar!,color:BLUE,count:per*2,unit:'根'});
    if(tie)s.legend.push({name:'拉筋',spec:p.tieBar||`A${tie.diameter}（自动）`,color:TEAL,count:per,unit:'根/站位'});
  }
  if(n>1)s.notes.push('端支座负筋按实际端部伸入范围显示；中间柱节点需结合三维模型和支座详图查看。');
  return s;
}
export function columnSection(p:ColumnParams,cut?:number|null):SectionScene {
  const layout=columnHoopLayout(p),y=cut==null?(p.height||3000)/2:cut*1000,upper=!!p.hasVariableSection&&y>=layout.variableStart,b=upper?p.upperB||p.b:p.b,h=upper?p.upperH||p.h:p.h;
  const s=scene('柱水平截面',b,h,`H = ${y.toFixed(0)} mm${p.hasVariableSection?upper?' · 上段':' · 下段':''}`),c=p.cover||25,stir=parseStirrup(p.stirrup),bars=columnSectionBars(p,b,h);
  s.cover=c;s.paths.push(rectangle(-b/2,0,b,h));hoops(s,b-2*c-stir.diameter,h-2*c-stir.diameter,stir.diameter,stir.legs,0,h/2,bars.bars.map(q=>q.x));
  const colors={corner:RED,bMiddle:'#fbbf77',hMiddle:PURPLE};
  bars.bars.forEach(q=>s.dots.push({point:[q.x,h/2-q.z],diameter:q.diameter,color:bars.isDetailed?colors[q.role]:RED}));
  if(bars.isDetailed){s.legend.push({name:'角筋',spec:p.cornerMain||p.main,color:RED,count:bars.corner.count,unit:'根'});if(bars.bMiddle)s.legend.push({name:'b边中部筋',spec:p.bMiddleMain||'',color:'#fbbf77',count:bars.bMiddle.count*2,unit:'根'});if(bars.hMiddle)s.legend.push({name:'h边中部筋',spec:p.hMiddleMain||'',color:PURPLE,count:bars.hMiddle.count*2,unit:'根'});}
  else s.legend.push({name:'纵筋',spec:p.main,color:RED,count:bars.totalCount,unit:'根'});
  const dense=y<layout.denseLength||y>=(p.height||3000)-layout.denseLength;
  s.legend.push({name:dense?'加密区箍筋':'非加密区箍筋',spec:`${p.stirrup} · @${dense?stir.spacingDense:stir.spacingNormal}`,color:GREEN,count:(upper?layout.upper:layout.lower).pieceCount,unit:'个/道'});return s;
}
export function stairSection(p:StairParams,zone:'middle'|'low'|'high'='middle'):SectionScene {
  const a=stairReinforcement(p),run=p.stepCount*p.stepWidth,flat=p.stairType==='BT'?p.botFlatLen??700:0;
  const x=zone==='low'?(p.stairType==='BT'?-flat/2:p.stepWidth*1.1):zone==='high'?run-p.stepWidth*1.1:run/2;
  const angle=Math.atan2(p.stepCount*p.stepHeight,run),normal=p.slabThickness,c=p.cover||15;
  const inPath=(path:{x:number}[])=>x>=Math.min(...path.map(q=>q.x*1000))-1e-8&&x<=Math.max(...path.map(q=>q.x*1000))+1e-8;
  const tops=[a.topBarPaths.low,a.topBarPaths.high].filter(inPath).length;
  const s=scene('梯板法向横截面',p.flightWidth,normal,`${zone==='middle'?'跨中':zone==='low'?'低端负筋区':'高端负筋区'} · X = ${x.toFixed(0)} mm`);
  s.cover=c;s.paths.push(rectangle(-p.flightWidth/2,0,p.flightWidth,normal));
  a.botBarZs.forEach(z=>s.dots.push({point:[z*1000,c+a.botR.diameter/2],diameter:a.botR.diameter,color:RED}));
  if(tops)a.topBarZs.forEach(z=>s.dots.push({point:[z*1000,normal-c-a.topR.diameter/2],diameter:a.topR.diameter,color:PURPLE}));
  for(const y of [c+a.botR.diameter+a.distR.diameter/2,normal-c-a.topR.diameter-a.distR.diameter/2])s.paths.push({points:[[-p.flightWidth/2+c,y],[p.flightWidth/2-c,y]],color:GREEN,diameter:a.distR.diameter});
  s.legend.push({name:'下部纵筋',spec:p.bottomBar,color:RED,count:a.botBarZs.length,unit:'根'});
  if(tops)s.legend.push({name:'本剖面上部负筋',spec:p.topBar,color:PURPLE,count:a.topBarZs.length*tops,unit:'根'});
  s.legend.push({name:'分布筋 · 沿截面方向',spec:p.distBar,color:GREEN});
  s.notes.push(tops?'本图显示支座负筋区域；两端负筋为独立钢筋。':'跨中剖面不显示两端负筋；上层分布筋沿模型布置投影。');
  s.notes.push(`梯板厚度按斜面法向 ${normal} mm；倾角 ${(angle*180/Math.PI).toFixed(1)}°。`);
  return s;
}
export function slabSection(p:SlabParams,zone:'middle'|'support'='middle',axis:'x'|'z'='x'):SectionScene {
  const s=scene('板配筋剖面 · 600mm示意带',600,p.thickness,`${axis==='x'?'X':'Y'}向剖切 · ${zone==='middle'?'跨中':'支座附近'}`),a=slabReinforcement(p),cut=zone==='middle'?0:-(axis==='x'?p.spanX:p.spanY)/2+1;
  s.cover=p.cover||15;s.paths.push(rectangle(-300,0,600,p.thickness));
  a.groups.forEach(g=>{
    const color=g.color;
    const curves=g.curves.filter(curve=>{const values=curve.getPoints(48).map(q=>q.x*1000);return cut>=Math.min(...values)-1e-6&&cut<=Math.max(...values)+1e-6;});
    if(g.axis===axis){if(!curves.length)return;const pos=g.positions.map(q=>q*1000).filter(q=>q>=-300&&q<=300);pos.forEach(q=>s.dots.push({point:[q,g.level],diameter:g.diameter,color}));s.legend.push({name:g.name,spec:g.spec,color,count:pos.length,unit:'根/示意带'});}
    else {const ranges=g.curves.map(curve=>curve.getPoints(48).map(q=>q.x*1000));if(!ranges.some(v=>Math.min(...v)<300&&Math.max(...v)>-300))return;s.paths.push({points:[[-300,g.level],[300,g.level]],color,diameter:g.diameter});s.legend.push({name:g.name+' · 截面内投影',spec:g.spec,color});}
  });s.notes.push('600mm为观察带宽，不代表整板根数；负筋仅在对应支座剖面显示。');return s;
}
export function planScene(p:ReinforcementPlan,title:string,layer:'bottom'|'top'|'all'='bottom'):SectionScene {
  const s=scene(title,p.width,p.depth,layer==='all'?'各层完整投影':layer==='bottom'?'底部配筋平面':'顶部配筋平面');s.kind='plan';s.yDown=true;s.notes=p.notes;
  s.paths.push(rectangle(-p.width/2,-p.depth/2,p.width,p.depth));
  p.supports.forEach(q=>s.paths.push(rectangle(q.x-q.width/2,q.z-q.depth/2,q.width,q.depth,'#7da3b8','#0b2638',true)));
  p.piles.forEach(q=>{s.paths.push({points:Array.from({length:65},(_,i)=>[q.x+q.diameter/2*Math.cos(i*Math.PI/32),q.z+q.diameter/2*Math.sin(i*Math.PI/32)]),color:'#7898ab',fill:'#0b2131',dash:true});});
  const groups=new Map<string,SectionLegend>();
  p.bars.filter(q=>layer==='all'||q.layer===layer).forEach(q=>{s.paths.push({points:[q.start,q.end],color:q.color,diameter:q.diameter,dash:q.short});const key=q.group+(q.short?'.short':'');const g=groups.get(key);if(g)g.count=(g.count||0)+1;else groups.set(key,{name:q.name,spec:q.spec,color:q.color,count:1,unit:'根'});});
  p.columns.forEach(q=>s.paths.push({...rectangle(q.x-q.width/2,q.z-q.depth/2,q.width,q.depth,'#b2c5d2','rgba(12,33,49,.45)',true),label:q.name}));
  s.legend=[...groups.values()];if(p.columns.length)s.legend.push({name:'定位柱',spec:`${p.columns[0].width} × ${p.columns[0].depth} mm`,color:'#b2c5d2',count:p.columns.length,unit:'根'});if(p.piles.length)s.legend.push({name:'桩位',spec:`Φ${p.piles[0].diameter}`,color:'#8aa8bc',count:p.piles.length,unit:'根'});
  if(!s.legend.length)s.notes=[...s.notes,'当前未配置这一层钢筋。'];return s;
}
export function wallSection(p:ShearWallParams,yMm=p.hw/2):SectionScene {
  const s=scene('墙水平剖面',p.lw,p.bw,`H = ${yMm.toFixed(0)} mm`),c=p.cover||20,hole=wallOpening(p)[0],cutHole=hole&&yMm>=hole.y0&&yMm<=hole.y1;
  s.kind='section';s.yDown=true;s.cover=c;
  wallSolids(p).forEach(q=>s.paths.push(rectangle(q.x0,q.z0,q.x1-q.x0,q.z1-q.z0)));
  if(cutHole)s.paths.push(rectangle(hole.x0,-p.bw/2,hole.x1-hole.x0,p.bw,'#f472b6','#071a29'));
  const a=wallDistributedReinforcement(p),v=parseSlabRebar(p.vertBar),h=parseSlabRebar(p.horizBar),b=parseRebar(p.boundaryMain),stir=parseStirrup(p.boundaryStirrup);
  const bars=a.vertBars.filter(q=>yMm/1000>=q.yCenter-q.height/2&&yMm/1000<=q.yCenter+q.height/2);
  bars.forEach(q=>s.dots.push({point:[q.x*1000,q.z*1000],diameter:v.diameter,color:RED}));
  const bl=p.boundaryLength||Math.max(p.bw,400),form=p.boundaryForm||'concealed',projection=p.boundaryProjection||0,depth=form==='concealed'?p.bw:p.bw+Math.max(projection,p.bw*(form==='endColumn'?.35:form==='cornerWall'?.5:.2)),length=bl*(form==='wingWall'?1.35:form==='cornerWall'?1.18:1),iw=Math.max(length-2*c,length*.35),ih=Math.max(depth-2*c,Math.min(p.bw*.6,depth)),per=Math.max(Math.round(b.count/2),2);
  for(const side of [-1,1]){const center=side*(p.lw/2-bl/2);hoops(s,iw-stir.diameter,ih-stir.diameter,stir.diameter,stir.legs,center,0);
    for(let i=0;i<per;i++)for(const z of [-1,1])s.dots.push({point:[center-iw/2+stir.diameter+b.diameter/2+(iw-2*stir.diameter-b.diameter)*i/Math.max(per-1,1),z*(ih/2-stir.diameter-b.diameter/2)],diameter:b.diameter,color:PURPLE});}
  if((form==='wingWall'||form==='cornerWall')&&projection>0){
    for(const side of [-1,1]){
      const center=side*(p.lw/2-bl/2),z=p.bw/2+projection-c;
      for(let i=0;i<per;i++)s.dots.push({point:[side*(-p.lw/2+c+iw*i/Math.max(per-1,1)),z],diameter:b.diameter,color:PURPLE});
      hoops(s,Math.max((form==='wingWall'?bl:bl*.75)-2*c-stir.diameter,40),Math.max(projection-2*c-stir.diameter,40),stir.diameter,2,center,p.bw/2+projection/2);
      const len=Math.max(p.bw/2+projection-c-ih/2,0),offsets=form==='cornerWall'?[-length*.18,length*.14]:[-length*.22,0,length*.22];
      if(len>20){const curve=createTieBarCurves({sideOffset:len*.0005,tieDiameter:stir.diameter,sideBarDiameter:stir.diameter}).fullCurve;
        offsets.forEach(offset=>s.paths.push({points:curve.getPoints(100).map(q=>[center+offset+q.x*1000,ih/2+len/2+q.z*1000]),color:GREEN,diameter:stir.diameter}));}
    }
    s.legend.push({name:'凸出边缘纵筋 · 两端',spec:p.boundaryMain,color:PURPLE,count:per*2,unit:'根'});
  }
  // Project the closest horizontal-bar row; clipped segments retain the opening.
  const ys=[...new Set(a.horizBars.map(q=>q.y))],nearest=ys.reduce((best,y)=>Math.abs(y*1000-yMm)<Math.abs(best*1000-yMm)?y:best,ys[0]||0);
  a.horizBars.filter(q=>q.y===nearest).forEach(q=>s.paths.push({points:[[(q.xCenter-q.length/2)*1000,q.z*1000],[(q.xCenter+q.length/2)*1000,q.z*1000]],color:BLUE,diameter:h.diameter}));
  if(p.tieBar){const tie=parseSlabRebar(p.tieBar),points=wallTiePositions(p),row=points.reduce((best,q)=>Math.abs(q.y-yMm)<Math.abs(best-yMm)?q.y:best,points[0]?.y||0),curve=createTieBarCurves({sideOffset:(p.bw/2-c-h.diameter/2)*.001,tieDiameter:tie.diameter,sideBarDiameter:h.diameter}).fullCurve;
    points.filter(q=>q.y===row).forEach(q=>s.paths.push({points:curve.getPoints(100).map(v=>[q.x+v.x*1000,v.z*1000]),color:TEAL,diameter:tie.diameter}));s.legend.push({name:'邻近拉筋层位',spec:p.tieBar,color:TEAL,count:points.filter(q=>q.y===row).length,unit:'根'});}
  s.legend.unshift({name:'穿过剖面的竖筋',spec:p.vertBar,color:RED,count:bars.length,unit:'根'},{name:'水平筋 · 邻近层位投影',spec:p.horizBar,color:BLUE},{name:'边缘纵筋 · 两端',spec:p.boundaryMain,color:PURPLE,count:per*4,unit:'根'},{name:'边缘复合箍',spec:p.boundaryStirrup,color:GREEN});
  if(cutHole)s.notes.push('本剖面穿过洞口：洞内不画墙身纵筋，洞口轮廓以粉色表示。');s.notes.push('水平筋、拉筋及箍筋采用邻近层位投影；凸出边缘钢筋按当前三维构造投影。');return s;
}
