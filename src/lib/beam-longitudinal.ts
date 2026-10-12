import type { BeamParams } from './types';
import { parseRebar, parseRebarBottom, parseStirrup } from './rebar';
import { calcBeamEndAnchor, calcSupportRebarLength } from './anchor';
import { resolveBarRowCounts, distributeZ } from './layout';

export type BeamBarRole = 'top' | 'bottom' | 'leftSupport' | 'rightSupport' | 'leftSupport2' | 'rightSupport2';
export interface BeamBarRow {
  role: BeamBarRole;
  row: number;
  count: number;
  diameter: number;
  grade: string;
  y: number; // metres, measured from beam soffit
  zs: number[];
  anchor: ReturnType<typeof calcBeamEndAnchor>;
  bodyLengthMm: number;
  endCount: number;
  lengthMm: number;
}
// Rendering clearance only, not a code-compliance spacing rule.
export const ANCHOR_MODEL_GAP_MM = 5;
export const BEAM_BAR_NAMES: Record<BeamBarRole, string> = {
  top: '上部通长筋', bottom: '下部通长筋', leftSupport: '左端支座负筋',
  rightSupport: '右端支座负筋', leftSupport2: '左端支座负筋(二排)', rightSupport2: '右端支座负筋(二排)',
};

type Point2 = [number, number];
function pointSegmentDistance(p: Point2, a: Point2, b: Point2) {
  const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
  const t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function segmentDistance(a: Point2,b: Point2,c: Point2,d: Point2) {
  const ux=b[0]-a[0],uy=b[1]-a[1],vx=d[0]-c[0],vy=d[1]-c[1];
  const determinant=ux*vy-uy*vx;
  if(Math.abs(determinant)>1e-9) {
    const wx=c[0]-a[0],wy=c[1]-a[1];
    const t=(wx*vy-wy*vx)/determinant,u=(wx*uy-wy*ux)/determinant;
    if(t>=0&&t<=1&&u>=0&&u<=1)return 0;
  }
  return Math.min(pointSegmentDistance(a,c,d),pointSegmentDistance(b,c,d),pointSegmentDistance(c,a,b),pointSegmentDistance(d,a,b));
}
function anchorPolyline(row: BeamBarRow): Point2[] {
  const a=row.anchor,y=row.y*1000,sign=row.role==='bottom'?1:-1;
  const points: Point2[]=[[-row.bodyLengthMm,y],[0,y]];
  if(a.canStraight)return [...points,[a.straightLen,y]];
  const radius=Math.min(4*row.diameter,a.bentStraightPart,a.bentBendPart);
  const tangent=a.bentStraightPart-radius;
  points.push([tangent,y]);
  for(let i=1;i<=32;i++) {
    const angle=i*Math.PI/64;
    points.push([tangent+radius*Math.sin(angle),y+sign*radius*(1-Math.cos(angle))]);
  }
  points.push([a.bentStraightPart,y+sign*a.bentBendPart]);
  return points;
}

/** Shared physical rows and bend planes for 3D, sections, schedules and quantities. */
export function beamLongitudinalLayout(p: BeamParams) {
  const cover = p.cover || 25, hc = p.hc || 500, stir = parseStirrup(p.stirrup).diameter;
  const spanCount = p.spanCount || 1;
  const spans = p.spanLengths?.length === spanCount ? p.spanLengths : Array<number>(spanCount).fill(p.spanLength || 4000);
  const totalNet = spans.reduce((a,b) => a+b,0) + (spanCount-1)*hc;
  const rows: BeamBarRow[] = [], issues: string[] = [];
  function add(role: BeamBarRole, upperBoundary?: number) {
    const spec = p[role];
    if (!spec) return [];
    const parsed = role === 'bottom' ? parseRebarBottom(spec) : parseRebar(spec);
    const range = (p.b - 2*cover - 2*stir - parsed.diameter)/1000;
    const counts = resolveBarRowCounts(parsed, range);
    let boundary = upperBoundary ?? (role === 'bottom' ? cover+stir : p.h-cover-stir);
    const result = counts.map((count,row) => {
      const segment = parsed.segments?.[row];
      const diameter = segment?.diameter ?? parsed.diameter, grade = segment?.grade ?? parsed.grade;
      const y = boundary + (role === 'bottom' ? diameter/2 : -diameter/2);
      const nextD = parsed.segments?.[row+1]?.diameter ?? parsed.diameter;
      boundary = y + (role === 'bottom' ? 1 : -1)*(diameter/2+Math.max(diameter,nextD,25));
      const anchor = calcBeamEndAnchor(grade,diameter,p.concreteGrade,p.seismicGrade,hc,cover);
      const through = role === 'top' || role === 'bottom';
      const bodyLengthMm = through ? totalNet : calcSupportRebarLength(role.startsWith('left') ? spans[0] : spans[spanCount-1],role.endsWith('2') ? 2 : 1);
      const item: BeamBarRow = {role,row,count,diameter,grade,y:y/1000,
        zs:distributeZ(Math.max(0,p.b-2*cover-2*stir-diameter)/1000,count),anchor,bodyLengthMm,endCount:through?2:1,lengthMm:0};
      rows.push(item);return item;
    });
    return result;
  }
  const top = add('top');
  const below = (list: BeamBarRow[]) => Math.min(...list.map(r => r.y*1000-r.diameter/2-Math.max(r.diameter,25)));
  const firstBoundary = top.length ? below(top) : p.h-cover-stir;
  const left = add('leftSupport',firstBoundary), right = add('rightSupport',firstBoundary);
  const left2 = add('leftSupport2',left.length?below(left):firstBoundary);
  const right2 = add('rightSupport2',right.length?below(right):firstBoundary);
  const bottom = add('bottom');
  // Top/downward hooks nest outside the lower rows. Left/right support rows can
  // share a depth because they occupy opposite ends of the beam.
  const layers: BeamBarRow[][] = top.map(r=>[r]);
  const supportLeft=[...left,...left2], supportRight=[...right,...right2];
  for(let i=0;i<Math.max(supportLeft.length,supportRight.length);i++) {
    layers.push([supportLeft[i],supportRight[i]].filter((r): r is BeamBarRow=>!!r));
  }
  // Lower bottom rows go outside upper rows, mirroring the downward top bends.
  layers.push(...bottom.map(r=>[r]));
  let outerEdge=hc-cover;
  for(const layer of layers) {
    const bent=layer.filter(r=>!r.anchor.canStraight);
    if(!bent.length) continue;
    const maxD=Math.max(...bent.map(r=>r.diameter));
    const depth=Math.max(maxD/2,outerEdge-maxD/2);
    for(const r of bent) {
      r.anchor={...r.anchor,bentStraightPart:depth};
      if(depth<Math.ceil(.4*r.anchor.laE)) issues.push(`${BEAM_BAR_NAMES[r.role]}第${r.row+1}排：错层后水平锚固段 ${depth.toFixed(1)}mm 小于当前锚固规则所需 ${Math.ceil(.4*r.anchor.laE)}mm，请增大支座或另行设计锚固。`);
    }
    outerEdge=depth-maxD/2-ANCHOR_MODEL_GAP_MM;
  }
  for(const r of rows) {
    const a=r.anchor, radius=Math.min(4*r.diameter,a.bentStraightPart,a.bentBendPart);
    const endLength=a.canStraight?a.straightLen:a.bentStraightPart+a.bentBendPart-(2-Math.PI/2)*radius;
    r.lengthMm=r.bodyLengthMm+r.endCount*endLength;
    const tip=r.y*1000+(r.role==='bottom'?1:-1)*a.bentBendPart;
    if(!a.canStraight && (tip-r.diameter/2<cover || tip+r.diameter/2>p.h-cover)) issues.push(`${BEAM_BAR_NAMES[r.role]}弯锚竖段超出当前梁高范围，需复核节点容纳空间。`);
  }
  // A dense input can still make an upward tail meet a higher horizontal row.
  // Report that conflict explicitly instead of implying that depth offsets solve it.
  const paths=new Map(rows.map(r=>[r,anchorPolyline(r)]));
  for(const side of ['left','right']) {
    const active=rows.filter(r=>r.role==='top'||r.role==='bottom'||r.role.startsWith(side));
    for(let i=0;i<active.length;i++) for(let j=i+1;j<active.length;j++) {
      const a=active[i],b=active[j],required=(a.diameter+b.diameter)/2;
      const dz=Math.min(...a.zs.flatMap(za=>b.zs.map(zb=>Math.abs(za-zb)*1000)));
      if(dz>=required)continue;
      const pa=paths.get(a)!,pb=paths.get(b)!;
      let distance=Infinity;
      for(let x=1;x<pa.length;x++)for(let y=1;y<pb.length;y++)distance=Math.min(distance,segmentDistance(pa[x-1],pa[x],pb[y-1],pb[y]));
      if(Math.hypot(distance,dz)<required-.2) issues.push(`${side==='left'?'左':'右'}端 ${BEAM_BAR_NAMES[a.role]}第${a.row+1}排与${BEAM_BAR_NAMES[b.role]}第${b.row+1}排仍存在实体相交，当前密集排布需调整截面或锚固构造。`);
    }
  }
  return {rows,issues:[...new Set(issues)]};
}
