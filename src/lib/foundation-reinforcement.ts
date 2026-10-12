import * as THREE from 'three';
import type { FoundationParams } from './types';
import { parseRebar, parseStirrup } from './rebar';
import { calcLaTable } from './anchor';
import { determineJLEndAnchor } from './construction-rules';
import { clearCrossingOffsets, insertPerimeter } from './reinforcement-layout';
import { layoutBars } from './layout';
import { roundedRebarPath } from './rebar-curve';
import { createCompositeStirrupSpec } from './rebar-shapes';

export function bentHorizontalCurve(start: number, end: number, y: number, diameter: number, leftBend = 0, rightBend = leftBend) {
  const points: THREE.Vector3[] = [];
  if (leftBend) points.push(new THREE.Vector3(start, y + leftBend, 0));
  points.push(new THREE.Vector3(start, y, 0), new THREE.Vector3(end, y, 0));
  if (rightBend) points.push(new THREE.Vector3(end, y + rightBend, 0));
  return roundedRebarPath(points, diameter * .004);
}

/** JL assembly: all end bends are inside the concrete and separate rows have separate planes. */
export function foundationBeamReinforcement(p: FoundationParams) {
  const issues: string[] = [];
  const empty = { bars: [] as { role: 'top' | 'bottom'; row: number; z: number; diameter: number; grade: string; curve: THREE.Curve<THREE.Vector3>; lengthMm: number }[],
    stirrupPositions: [] as number[], stirrupSpec: null as ReturnType<typeof createCompositeStirrupSpec> | null, issues };
  if ((p.columnCount || 1) !== 2 || !p.hasFoundationBeam) return empty;
  const b=p.foundationBeamB||600,h=p.foundationBeamH||700,c=p.cover||40;
  const stir=parseStirrup(p.foundationBeamStirrup||'A10@150(4)'),top=parseRebar(p.foundationBeamTop||'4C20'),bottom=parseRebar(p.foundationBeamBottom||'4C22');
  const base=p.colSpacing ? p.colSpacing+p.colBx : Math.max(p.stepDims.at(-1)?.bx || p.bx,b);
  const overhang=p.foundationBeamOverhang||300, kind=p.foundationBeamEndType||'none';
  const left=kind==='bothSides'||(kind==='oneSide'&&p.foundationBeamOverhangSide==='left')?overhang:0;
  const right=kind==='bothSides'||(kind==='oneSide'&&(p.foundationBeamOverhangSide||'right')==='right')?overhang:0;
  const start=(-base/2-left)*.001,end=(base/2+right)*.001;
  let depth=0;
  for(const [role,r] of [['top',top],['bottom',bottom]] as const) {
    const width=Math.max(0,b-2*c-2*stir.diameter-r.diameter)*.001;
    const y=(role==='top'?p.h+h-c-stir.diameter-r.diameter/2:p.h+c+stir.diameter+r.diameter/2)*.001;
    const placed=layoutBars(r,width,[y],role==='top'?-1:1);
    const ys=[...new Set(placed.map(q=>q.y))];
    for(const [row,level] of ys.entries()) {
      const diameter=r.segments?.[row]?.diameter||r.diameter;
      const lab=calcLaTable(r.grade,diameter,p.concreteGrade);
      const a=determineJLEndAnchor(left,lab,diameter),z=determineJLEndAnchor(right,lab,diameter);
      const inset=(c+diameter/2+depth)*.001;
      const curve=bentHorizontalCurve(start+inset,end-inset,level,diameter,
        (role==='top'?-1:1)*a.bendPart*.001,(role==='top'?-1:1)*z.bendPart*.001);
      depth+=diameter+5;
      if(Math.max(a.straightPart,z.straightPart)>base/2+Math.max(left,right)-c-depth) issues.push('基础梁端部锚固水平空间不足，需结合柱边节点复核。');
      const members=placed.filter(q=>q.y===level), column=parseRebar(p.colMain);
      const clear=clearCrossingOffsets(members.map(q=>q.z*1000),insertPerimeter(p.colMain,p.colBx,p.colBy,c).map(q=>q.z),diameter,column.diameter,width*500);
      if(!clear.clear)issues.push('基础梁纵筋无法在当前梁宽内避让柱插筋，请复核节点钢筋布置。');
      for(const z of clear.offsets) empty.bars.push({role,row,z:z*.001,diameter,grade:r.grade,curve,lengthMm:curve.getLength()*1000});
      const pts=curve.getPoints(200);
      if(pts.some(q=>q.y-diameter*.0005 < p.h*.001+c*.001-1e-8 || q.y+diameter*.0005 > (p.h+h-c)*.001+1e-8)) issues.push('基础梁端弯或多排筋超出梁内保护层范围，请调整梁高、配筋或锚固形式。');
    }
  }
  const spacing=Math.min(stir.spacingDense,stir.spacingNormal)*.001;
  const first=start+(c+stir.diameter/2)*.001,last=end-(c+stir.diameter/2)*.001;
  empty.stirrupPositions=Array.from({length:Math.max(0,Math.floor((last-first)/spacing)+1)},(_,i)=>first+i*spacing);
  empty.stirrupSpec=createCompositeStirrupSpec({widthMm:b-2*c-stir.diameter,heightMm:h-2*c-stir.diameter,diameterMm:stir.diameter,legs:stir.legs,
    barPositionsMm:empty.bars.map(q=>q.z*1000)});
  return empty;
}
