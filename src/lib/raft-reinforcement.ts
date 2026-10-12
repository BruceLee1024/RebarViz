import type { RaftFoundationParams } from './types';
import { parseRebar, parseStirrup, parseSlabRebar } from './rebar';
import { clearCrossingOffsets, insertPerimeter, orthogonalLayers } from './reinforcement-layout';
import { createCompositeStirrupSpec } from './rebar-shapes';

/** Union of column bands sampled on the actual grid; overlapping bands do not duplicate bars. */
export function raftColumnStripPositions(p:RaftFoundationParams,axis:'x'|'y') {
  const spec=axis==='x'?p.colStripBarX:p.colStripBarY;
  if(p.raftType!=='flatPlate'||!spec||!p.colStripWidth)return [];
  const bar=parseSlabRebar(spec),c=p.cover||40,extent=axis==='x'?p.ly:p.lx;
  const count=axis==='x'?p.colCountY:p.colCountX,spacing=axis==='x'?p.colSpacingY:p.colSpacingX;
  const centers=Array.from({length:count},(_,i)=>(i-(count-1)/2)*spacing);
  return Array.from({length:Math.max(0,Math.floor((extent-2*c)/bar.spacing)+1)},(_,i)=>-extent/2+c+i*bar.spacing)
    .filter(position=>centers.some(center=>Math.abs(position-center)<=p.colStripWidth!/2));
}

/** Shared JL placement and full hoop count. Coordinates and lengths are in mm. */
export function raftBeamArrangement(p:RaftFoundationParams) {
  const c=p.cover||40,b=p.beamB||600,h=p.beamH||900;
  const bottom=parseRebar(p.beamBottom||'4C25'),top=parseRebar(p.beamTop||'6C25'),stir=parseStirrup(p.beamStirrup||'A10@150(4)'),col=parseRebar(p.colMain);
  const half=Math.max(0,b-2*c-2*stir.diameter-Math.max(bottom.diameter,top.diameter))/2;
  const perimeter=insertPerimeter(p.colMain,p.colBx,p.colBy,c);
  const targets=(count:number)=>count===1?[0]:Array.from({length:count},(_,i)=>-half+2*half*i/(count-1));
  const row=(count:number,d:number,axis:'x'|'z')=>clearCrossingOffsets(targets(count),perimeter.map(q=>q[axis]),d,col.diameter,half);
  const xBottom=row(bottom.count,bottom.diameter,'z'),xTop=row(top.count,top.diameter,'z');
  const yBottom=row(bottom.count,bottom.diameter,'x'),yTop=row(top.count,top.diameter,'x');
  const spacing=Math.min(stir.spacingDense,stir.spacingNormal);
  const stations=(length:number)=>{
    const start=-length/2+c+stir.diameter/2,end=length/2-c-stir.diameter/2;
    return Array.from({length:Math.max(0,Math.floor((end-start)/spacing)+1)},(_,i)=>start+i*spacing);
  };
  const spec=(positions:number[])=>createCompositeStirrupSpec({widthMm:b-2*c-stir.diameter,heightMm:h-2*c-stir.diameter,
    diameterMm:stir.diameter,legs:stir.legs,barPositionsMm:positions});
  const low=(p.beamPosition||'low')==='low'?0:p.beamPosition==='high'?p.h-h:(p.h-h)/2;
  const bx=parseSlabRebar(p.bottomBarX),by=parseSlabRebar(p.bottomBarY);
  const tx=p.topBarX?parseSlabRebar(p.topBarX).diameter:0,ty=p.topBarY?parseSlabRebar(p.topBarY).diameter:0;
  const lpbBottom=orthogonalLayers(p.h,c,bx.diameter,by.diameter,'bottom',p.bottomCrossOrder||'xBelowY');
  const lpbTop=orthogonalLayers(p.h,c,tx,ty,'top',p.topCrossOrder||'xBelowY');
  const bottomSurface=Math.max(lpbBottom.x+bx.diameter/2,lpbBottom.y+by.diameter/2);
  const topSurface=Math.min(tx?lpbTop.x-tx/2:Infinity,ty?lpbTop.y-ty/2:Infinity);
  let bottomXLevel=low+c+stir.diameter+bottom.diameter/2;
  if(bottomXLevel+bottom.diameter/2>=c && bottomXLevel-bottom.diameter/2<=bottomSurface) bottomXLevel=bottomSurface+bottom.diameter/2+2;
  const bottomYLevel=bottomXLevel+bottom.diameter+2;
  let topXLevel=low+h-c-stir.diameter-top.diameter/2;
  if(topXLevel+top.diameter/2>=topSurface && topXLevel-top.diameter/2<=p.h-c) topXLevel=topSurface-top.diameter/2-2;
  const topYLevel=topXLevel-top.diameter-2;
  return { bottom,top,stir,bottomXLevel,bottomYLevel,topXLevel,topYLevel,xBottom:xBottom.offsets,xTop:xTop.offsets,yBottom:yBottom.offsets,yTop:yTop.offsets,
    xStations:stations(p.lx),yStations:stations(p.ly),xSpec:spec([...xBottom.offsets,...xTop.offsets]),ySpec:spec([...yBottom.offsets,...yTop.offsets]),
    minFootSurfaceMm:Math.max(bottomSurface,bottomYLevel+bottom.diameter/2)-Math.min(0,low),
    clear:xBottom.clear&&xTop.clear&&yBottom.clear&&yTop.clear };
}
