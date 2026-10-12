import * as THREE from 'three';
import { parseRebar, parseStirrup, resolveColumnBars } from './rebar';
import { calcLaE, calcLlE, type ConcreteGrade, type SeismicGrade } from './anchor';
import { determineColFoundAnchor } from './construction-rules';
import { createStirrupShapeSpec, createCompositeStirrupSpec } from './rebar-shapes';
import { roundedRebarPath } from './rebar-curve';
import type { ColumnParams } from './types';

/** Centre elevations in mm. Cover is measured to the outer surface, not the axis. */
export function orthogonalLayers(thickness: number, cover: number, dx: number, dy: number,
  face: 'bottom' | 'top', order: 'xBelowY' | 'yBelowX' = 'xBelowY') {
  const outerX = face === 'bottom' ? order === 'xBelowY' : order !== 'xBelowY';
  const xDepth = cover + dx / 2 + (outerX ? 0 : dy);
  const yDepth = cover + dy / 2 + (outerX ? dx : 0);
  return face === 'bottom' ? { x: xDepth, y: yDepth } : { x: thickness - xDepth, y: thickness - yDepth };
}

/** All roles fit inside the outer hoop; mixed diameters use the same safe face envelope. */
export function columnSectionBars(p: ColumnParams, width = p.b, depth = p.h) {
  const stir = parseStirrup(p.stirrup);
  const maxD = Math.max(...[p.main, p.cornerMain, p.bMiddleMain, p.hMiddleMain].filter(Boolean).map(s => parseRebar(s!).diameter));
  const c = p.cover || 25;
  const radius = createStirrupShapeSpec({ widthMm: width - 2*c - stir.diameter, heightMm: depth - 2*c - stir.diameter, diameterMm: stir.diameter }).bendRadiusMm;
  const contact = (stir.diameter + maxD) / 2;
  const cornerInset = radius >= contact ? radius - (radius - contact) / Math.SQRT2 : Math.max(radius, contact);
  const inset = 2 * (c + stir.diameter / 2 + Math.max(contact, cornerInset) + .5);
  return resolveColumnBars(p.main, p.cornerMain, p.bMiddleMain, p.hMiddleMain, Math.max(0, width - inset), Math.max(0, depth - inset));
}

/** One set of physical hoop stations in mm, with disjoint end zones. */
export function columnHoopLayout(p: ColumnParams) {
  const height=p.height||3000,stir=parseStirrup(p.stirrup),cover=p.cover||25;
  const denseLength=Math.min(Math.max(Math.ceil(height/6),p.b,p.h,500),height/2);
  const variableStart=p.hasVariableSection?Math.max(0,Math.min(p.variableStart??height*.7,height)):height;
  const positions:{y:number;zone:'dense'|'normal';upper:boolean}[]=[];
  const add=(start:number,end:number,step:number,zone:'dense'|'normal')=>{
    if(step<=0)return;
    for(let i=0;start+i*step<end-1e-8;i++) {
      const y=start+i*step;
      if(y>=50 && y<height-50)positions.push({y,zone,upper:p.hasVariableSection===true&&y>=variableStart});
    }
  };
  add(50,denseLength,stir.spacingDense,'dense');
  add(denseLength,height-denseLength,stir.spacingNormal,'normal');
  add(height-denseLength,height-50,stir.spacingDense,'dense');
  const spec=(b:number,h:number)=>createCompositeStirrupSpec({widthMm:Math.max(b-2*cover-stir.diameter,0),heightMm:Math.max(h-2*cover-stir.diameter,0),diameterMm:stir.diameter,legs:stir.legs,barPositionsMm:columnSectionBars(p,b,h).bars.map(q=>q.x)});
  return {positions,denseLength,variableStart,lower:spec(p.b,p.h),upper:spec(p.upperB||p.b,p.upperH||p.h)};
}

/** Exact perimeter count, including 4/8/12 bars; no rounded per-side count or trimming. */
export function insertPerimeter(main: string, width: number, depth: number, cover: number) {
  const d = parseRebar(main).diameter;
  return resolveColumnBars(main, undefined, undefined, undefined,
    Math.max(0, width - 2 * cover - d), Math.max(0, depth - 2 * cover - d)).bars;
}

/** A schematic continuous L insert, with its foot clear of both bottom mesh directions. */
export function foundationInsertSpec(heightMm: number, coverMm: number, diameterMm: number,
  bottomDx: number, bottomDy: number, grade: string, concrete: ConcreteGrade, seismic: SeismicGrade, minFootSurfaceMm = 0) {
  const laE = calcLaE(grade, diameterMm, concrete, seismic);
  const anchor = determineColFoundAnchor(heightMm, coverMm, diameterMm, laE);
  const extensionMm = calcLlE(grade, diameterMm, concrete, seismic);
  const footYmm = Math.max(coverMm + bottomDx + bottomDy, minFootSurfaceMm) + diameterMm / 2 + 2;
  const topYmm = heightMm + extensionMm;
  const radiusMm = Math.min(4 * diameterMm, anchor.bendLength / 2, Math.max(0, topYmm - footYmm) / 2);
  const curve = roundedRebarPath([
    new THREE.Vector3(anchor.bendLength * .001, footYmm * .001, 0),
    new THREE.Vector3(0, footYmm * .001, 0),
    new THREE.Vector3(0, topYmm * .001, 0),
  ], radiusMm * .001);
  const lengthMm = curve.getLength() * 1000;
  return { anchor, extensionMm, footYmm, topYmm, radiusMm, lengthMm,
    verticalDepthMm: heightMm - footYmm, curve };
}

/** Vertical separation whose distance measured normal to the sloped face is thickness. */
export function normalThicknessOffset(thickness: number, angle: number) {
  return thickness / Math.cos(angle);
}

/** Shift a row away from crossing vertical bars while retaining every bar and its face envelope. */
export function clearCrossingOffsets(targets: number[], obstacles: number[], d: number, otherD: number, halfWidth: number) {
  const separation=(d+otherD)/2+2, pitch=d+25, placed:number[]=[];
  for(const target of targets) {
    const candidates=[target,-halfWidth,halfWidth,...obstacles.flatMap(x=>[x-separation,x+separation])];
    const valid=candidates.filter(x=>x>=-halfWidth-1e-8&&x<=halfWidth+1e-8&&
      (!placed.length||x-placed[placed.length-1]>=pitch-1e-8)&&obstacles.every(v=>Math.abs(x-v)>=separation-1e-8));
    valid.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target));
    if(!valid.length)return { offsets:targets, clear:false };
    placed.push(valid[0]);
  }
  return { offsets:placed, clear:true };
}
