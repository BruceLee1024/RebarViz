import * as THREE from 'three';
import type { SlabParams, RebarMeshInfo } from './types';
import { parseSlabRebar } from './rebar';
import { calcLa } from './anchor';
import { slabBottomAnchorDetail, slabNegBarExtend } from './construction-rules';
import { orthogonalLayers } from './reinforcement-layout';
import { roundedRebarPath } from './rebar-curve';

export interface SlabRebarGroup {
  type: RebarMeshInfo['type']; name: string; spec: string; grade: string; diameter: number;
  color: string; axis: 'x' | 'z'; level: number; positions: number[];
  curves: THREE.Curve<THREE.Vector3>[]; lengthMm: number; count: number;
}
export function slabBarPositions(span: number, cover: number, d: number, spacing: number) {
  if (!(spacing > 0) || span < 2 * cover + d) return [];
  const usable = span - 2 * cover - d;
  const n = Math.floor(usable / spacing) + 1, occupied = (n - 1) * spacing;
  return Array.from({ length: n }, (_, i) => (-occupied / 2 + i * spacing) * .001);
}

/** Shared displayed centreline, layer arrangement and quantity; no invented welded corners. */
export function slabReinforcement(p: SlabParams) {
  const cover = p.cover || 15, groups: SlabRebarGroup[] = [], issues: string[] = [];
  const bx = parseSlabRebar(p.bottomX), by = parseSlabRebar(p.bottomY);
  const tx = p.topX ? parseSlabRebar(p.topX) : null, ty = p.topY ? parseSlabRebar(p.topY) : null;
  const nx = p.supportNegX ? parseSlabRebar(p.supportNegX) : null, ny = p.supportNegY ? parseSlabRebar(p.supportNegY) : null;
  const bottom = orthogonalLayers(p.thickness, cover, bx.diameter, by.diameter, 'bottom');
  const top = orthogonalLayers(p.thickness, cover, tx?.diameter || 0, ty?.diameter || 0, 'top', 'yBelowX');
  let innerTop = Math.min(tx ? top.x - tx.diameter / 2 : Infinity, ty ? top.y - ty.diameter / 2 : Infinity);
  if (!Number.isFinite(innerTop)) innerTop = p.thickness - cover;
  const negXLevel = innerTop - (nx?.diameter || 0) / 2 - (tx || ty ? 2 : 0);
  const negYLevel = negXLevel - (nx?.diameter || 0) / 2 - (ny?.diameter || 0) / 2 - (nx ? 2 : 0);
  function add(type: SlabRebarGroup['type'], name: string, spec: string, axis: 'x' | 'z', level: number,
    color: string, paths: number[][][]) {
    const r = parseSlabRebar(spec), across = axis === 'x' ? p.spanY : p.spanX;
    const positions = slabBarPositions(across, cover, r.diameter, r.spacing);
    const curves = paths.map(path => roundedRebarPath(path.map(([a,y]) => new THREE.Vector3(a * .001, y * .001, 0)), r.diameter * .004));
    const lengthMm = curves.reduce((sum,c) => sum+c.getLength()*1000,0) / curves.length;
    groups.push({ type, name, spec, grade: r.grade, diameter: r.diameter, color, axis, level,
      positions, curves, lengthMm, count: positions.length * curves.length });
    if (!positions.length) issues.push(`${name}没有可用布置宽度，请复核截面与保护层。`);
  }
  for (const [axis,spec,r,level,type,name,color] of [
    ['x',p.bottomX,bx,bottom.x,'bottomX','X向底筋','#C0392B'],
    ['z',p.bottomY,by,bottom.y,'bottomY','Y向底筋','#E67E22'],
  ] as const) {
    const span = axis === 'x' ? p.spanX : p.spanY;
    const anchor = slabBottomAnchorDetail(p.supportType, r.diameter, calcLa(r.grade,r.diameter,p.concreteGrade));
    const bend = Math.min(anchor.bend, Math.max(0,p.thickness-cover-r.diameter/2-level));
    if (bend + .1 < anchor.bend) issues.push(`${name}端弯可用高度${bend.toFixed(1)}mm，小于当前锚固规则${anchor.bend}mm；请按支座详图确定端部构造。`);
    if (anchor.straight + cover + r.diameter/2 > p.supportBeamWidth) issues.push(`${name}锚固直段超出支座宽度，需复核支座或锚固形式。`);
    const left = -span/2-anchor.straight, right = span/2+anchor.straight;
    add(type,name,spec,axis,level,color,[bend > 0 ? [[left,level+bend],[left,level],[right,level],[right,level+bend]] : [[left,level],[right,level]]]);
  }
  for (const [axis,spec,r,level,type,name,color] of [
    ['x',p.topX,tx,top.x,'topX','X向面筋','#8E44AD'], ['z',p.topY,ty,top.y,'topY','Y向面筋','#7D3C98'],
  ] as const) if (r) {
    const span = axis==='x'?p.spanX:p.spanY;
    const la = calcLa(r.grade,r.diameter,p.concreteGrade), anchor = p.supportType==='cantilever'?0:p.supportType==='continuous'?la:Math.ceil(la/2);
    if (anchor + cover + r.diameter/2 > p.supportBeamWidth) issues.push(`${name}直锚长度超出输入支座宽度，需按实际节点处理。`);
    add(type,name,spec!,axis,level,color,[[[-span/2-anchor,level],[span/2+anchor,level]]]);
  }
  for (const [axis,spec,r,level,type,name,color] of [
    ['x',p.supportNegX,nx,negXLevel,'supportNegX','X向支座负筋','#2980B9'],
    ['z',p.supportNegY,ny,negYLevel,'supportNegY','Y向支座负筋','#16A085'],
  ] as const) if(r) {
    const span=axis==='x'?p.spanX:p.spanY, middle=p.supportType==='continuous';
    const extend=slabNegBarExtend(span,middle?'middle':'end'), halfBeam=p.supportBeamWidth/2;
    const paths=[-1,1].map(side => {
      const center=side*(span/2+halfBeam);
      if(middle) return [[center-extend-halfBeam,level],[center+extend+halfBeam,level]];
      return [[side*(span/2-extend),level],[center,level],[center,level-12*r.diameter]];
    });
    add(type,name,spec!,axis,level,color,paths);
  }
  // Explicit distribution input creates two independent crossing sets below the main mesh.
  if(p.distribution) {
    const d=parseSlabRebar(p.distribution).diameter;
    const occupied=Math.min(...groups.filter(g=>g.type.startsWith('top')||g.type.startsWith('supportNeg')).map(g=>g.level-g.diameter/2),p.thickness-cover);
    const yX=occupied-d/2-2, yY=yX-d-2;
    add('distribution','X向分布筋',p.distribution,'x',yX,'#27AE60',[[[-p.spanX/2+cover,yX],[p.spanX/2-cover,yX]]]);
    add('distribution','Y向分布筋',p.distribution,'z',yY,'#229954',[[[-p.spanY/2+cover,yY],[p.spanY/2-cover,yY]]]);
  }
  const bottomTop=Math.max(bottom.x+bx.diameter/2,bottom.y+by.diameter/2);
  const upperBottom=Math.min(...groups.filter(g=>!g.type.startsWith('bottom')).map(g=>g.level-g.diameter/2),p.thickness-cover);
  if(upperBottom < bottomTop+2) issues.push('板厚不足以容纳当前面筋、负筋及分布筋层，存在穿插风险；请调整配筋或厚度。');
  if(p.supportType==='cantilever') issues.push('悬挑板尚未指定悬挑方向与固定边，当前为对称示意；单侧锚固及对应钢筋量需按详图复核。');
  return { groups, issues, bottom, top, negXLevel, negYLevel };
}
