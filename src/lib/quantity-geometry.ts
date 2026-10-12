import { staggerTiePositions } from './rebar-shapes';
import { parseSlabRebar } from './rebar';
import type { BeamParams, FoundationParams, PileCapParams, RaftFoundationParams, ShearWallParams, StairParams, StripFoundationParams } from './types';

/** Dimensions and coordinates are in mm; outputs are m³ and m². */
export interface SolidBox { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
export const centeredBox = (w: number, h: number, d: number, x = 0, y = h / 2, z = 0): SolidBox => ({ x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2, z0: z - d / 2, z1: z + d / 2 });
const inside = (b: SolidBox, x: number, y: number, z: number) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1 && z > b.z0 && z < b.z1;

/** Exact coordinate compression for unions of orthogonal solids, excluding shared faces. */
export function measureSolid(boxes: SolidBox[], holes: SolidBox[] = []) {
  const all = [...boxes, ...holes].filter(b => Object.values(b).every(Number.isFinite) && b.x1 > b.x0 && b.y1 > b.y0 && b.z1 > b.z0);
  const coordinates = (lo: keyof SolidBox, hi: keyof SolidBox) => [...new Set(all.flatMap(b => [b[lo], b[hi]]))].sort((a, b) => a - b);
  const xs = coordinates('x0', 'x1'), ys = coordinates('y0', 'y1'), zs = coordinates('z0', 'z1');
  const nx = Math.max(0, xs.length - 1), ny = Math.max(0, ys.length - 1), nz = Math.max(0, zs.length - 1);
  const cells = new Uint8Array(nx * ny * nz);
  const index = (i: number, j: number, k: number) => (i * ny + j) * nz + k;
  const occupied = (i: number, j: number, k: number) => i >= 0 && i < nx && j >= 0 && j < ny && k >= 0 && k < nz && !!cells[index(i, j, k)];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2, z = (zs[k] + zs[k + 1]) / 2;
    cells[index(i, j, k)] = Number(boxes.some(b => inside(b, x, y, z)) && !holes.some(b => inside(b, x, y, z)));
  }
  let volume = 0, sides = 0, bottom = 0, top = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    if (!occupied(i, j, k)) continue;
    const dx = xs[i + 1] - xs[i], dy = ys[j + 1] - ys[j], dz = zs[k + 1] - zs[k];
    volume += dx * dy * dz;
    if (!occupied(i - 1, j, k)) sides += dy * dz;
    if (!occupied(i + 1, j, k)) sides += dy * dz;
    if (!occupied(i, j, k - 1)) sides += dx * dy;
    if (!occupied(i, j, k + 1)) sides += dx * dy;
    if (!occupied(i, j - 1, k)) bottom += dx * dz;
    if (!occupied(i, j + 1, k)) top += dx * dz;
  }
  return { volume: volume / 1e9, sides: sides / 1e6, bottom: bottom / 1e6, top: top / 1e6 };
}

export function beamSpans(p: BeamParams) {
  const n = Math.max(1, Math.min(6, Math.round(p.spanCount || 1)));
  return Array.from({ length: n }, (_, i) => ({ b: p.spanWidths?.length === n ? p.spanWidths[i] : p.b, h: p.spanHeights?.length === n ? p.spanHeights[i] : p.h, l: p.spanLengths?.length === n ? p.spanLengths[i] : p.spanLength }));
}

/** Net slab extents of the current AT/BT model, excluding support beam projections. */
export function stairMeasuredGeometry(p:StairParams) {
  const run=p.stepCount*p.stepWidth,rise=p.stepCount*p.stepHeight,slope=Math.hypot(run,rise);
  const bt=p.stairType==='BT',beamWidth=bt?p.beamB:p.stepWidth;
  const netRun=Math.max(0,run-beamWidth*(bt?1:2));
  return {run,rise,slope,beamWidth,netRun,netSlope:run>0?netRun*slope/run:0,flat:bt?p.botFlatLen??700:0,stepTriangles:Math.max(0,p.stepCount-(bt?1:2))};
}

/** Pile centres in mm, shared by the model and the reinforcement plan. */
export function pileCenters(p:PileCapParams) {
  const {pileCount:n,pileSpacingX:sx,pileSpacingY:sy}=p;
  if(p.pileLayout==='circular'&&n>=3)return Array.from({length:n},(_,i)=>({x:Math.cos(2*Math.PI*i/n-Math.PI/2)*Math.max(sx,sy||sx)/2,z:Math.sin(2*Math.PI*i/n-Math.PI/2)*Math.max(sx,sy||sx)/2}));
  if(n===1)return [{x:0,z:0}];
  if(n===2)return [{x:-sx/2,z:0},{x:sx/2,z:0}];
  if(n===3)return [{x:-sx/2,z:-sy/3},{x:sx/2,z:-sy/3},{x:0,z:2*sy/3}];
  const cols=sy>0?Math.ceil(Math.sqrt(n*sx/Math.max(sy,1))):n,rows=Math.ceil(n/cols);
  return Array.from({length:n},(_,i)=>({x:-(cols-1)*sx/2+(i%cols)*sx,z:-(rows-1)*(sy||sx)/2+Math.floor(i/cols)*(sy||sx)}));
}

export function raftSolids(p: RaftFoundationParams): SolidBox[] {
  const boxes = [centeredBox(p.lx, p.h, p.ly)];
  if (p.raftType !== 'beamSlab') return boxes;
  const b = p.beamB ?? 600, h = p.beamH ?? 900;
  const low = p.beamPosition === 'high' ? p.h - h : p.beamPosition === 'mid' ? (p.h - h) / 2 : 0;
  for (let i = 0; i < p.colCountY; i++) boxes.push(centeredBox(p.lx, h, b, 0, low + h / 2, (i - (p.colCountY - 1) / 2) * p.colSpacingY));
  for (let i = 0; i < p.colCountX; i++) boxes.push(centeredBox(b, h, p.ly, (i - (p.colCountX - 1) / 2) * p.colSpacingX, low + h / 2));
  return boxes;
}

export function overhangs(type?: string, side?: string, length = 0): [number, number] {
  return [type === 'bothSides' || type === 'oneSide' && side === 'left' ? length : 0, type === 'bothSides' || type === 'oneSide' && side !== 'left' ? length : 0];
}

export function stripSolids(p: StripFoundationParams): SolidBox[] {
  const boxes = [centeredBox(p.length, p.h, p.width)];
  const centers = p.supportCount === 2 && p.supportSpacing ? [-p.supportSpacing / 2, p.supportSpacing / 2] : [0];
  const [left, right] = overhangs(p.jlEndType, p.jlOverhangSide, p.jlOverhang);
  for (const z of centers) boxes.push(centeredBox(p.length + left + right, p.supportHeight, p.supportWidth, (right - left) / 2, p.h + p.supportHeight / 2, z));
  if (p.hasJcl && p.jclB && p.jclH) {
    const count = p.jclSpacing && p.jclSpacing > 0 ? p.jclCount || 1 : 1;
    const [neg, pos] = overhangs(p.jclEndType, p.jclOverhangSide, p.jclOverhang);
    for (let i = 0; i < count; i++) boxes.push(centeredBox(p.jclB, p.jclH, p.width + neg + pos, (i - (count - 1) / 2) * (p.jclSpacing || 0), p.h + p.jclH / 2, (pos - neg) / 2));
  }
  return boxes;
}

/** Bottom distribution stations actually shown outside beam support strips, in mm. */
export function stripDistributedPositions(p:StripFoundationParams) {
  const cover=p.cover||40,bar=parseSlabRebar(p.distBar),usable=Math.max(p.width-2*cover,0);
  const count=Math.max(Math.floor(usable/bar.spacing)+1,1);
  const centers=p.supportCount===2&&p.supportSpacing?[-p.supportSpacing/2,p.supportSpacing/2]:[0];
  return Array.from({length:count},(_,i)=>-p.width/2+cover+(count>1?usable*i/(count-1):usable/2))
    .filter(z=>p.supportType!=='beam'||!centers.some(center=>Math.abs(z-center)<=p.supportWidth/2));
}

/** Local annotations replace the transverse bottom/top bars only inside the clipped range. */
export function stripTransverseStations(p:StripFoundationParams,role:'bottom'|'top') {
  const c=p.cover||40,start=-p.length/2+c,end=p.length/2-c;
  const baseSpec=role==='bottom'?p.bottomBar:p.topBar,localSpec=role==='bottom'?p.localBottomBar:p.localTopBar;
  const sample=(lo:number,hi:number,spec:string)=>{
    const bar=parseSlabRebar(spec),count=Math.max(Math.floor((hi-lo)/bar.spacing)+1,1);
    return Array.from({length:count},(_,i)=>count>1?lo+(hi-lo)*i/(count-1):(lo+hi)/2);
  };
  const rangeStart=Math.max(start,-p.length/2+(p.localOverrideStart||0));
  const rangeEnd=Math.min(end,-p.length/2+(p.localOverrideStart||0)+(p.localOverrideLength||0));
  const replaces=!!p.hasLocalOverride&&!!localSpec&&rangeEnd>rangeStart;
  const base=baseSpec?sample(start,end,baseSpec).filter(x=>!replaces||x<rangeStart-1e-8||x>rangeEnd+1e-8):[];
  const local=replaces?sample(rangeStart,rangeEnd,localSpec!):[];
  return {base,local,rangeStart,rangeEnd};
}

export function wallOpening(p: ShearWallParams): SolidBox[] {
  if (!p.hasOpening || !p.openingWidth || !p.openingHeight) return [];
  const w = Math.min(p.openingWidth, p.lw), h = Math.min(p.openingHeight, p.hw);
  const cx = Math.max(-p.lw / 2 + w / 2, Math.min(p.openingOffsetX || 0, p.lw / 2 - w / 2));
  const bottom = Math.max(0, Math.min(p.openingBottom || 0, p.hw - h));
  return [centeredBox(w, h, p.bw * 4 + (p.boundaryProjection || 0) * 4, cx, bottom + h / 2)];
}

export function wallSolids(p: ShearWallParams): SolidBox[] {
  const boxes = [centeredBox(p.lw, p.hw, p.bw)];
  const form = p.boundaryForm || 'concealed';
  if (form === 'concealed') return boxes;
  const bl = p.boundaryLength || Math.max(p.bw, 400), projection = p.boundaryProjection || 0;
  const depth = p.bw + Math.max(projection, p.bw * (form === 'endColumn' ? .35 : form === 'cornerWall' ? .5 : .2));
  const length = bl * (form === 'wingWall' ? 1.35 : form === 'cornerWall' ? 1.18 : 1);
  for (const sign of [-1, 1]) {
    const x = sign * (p.lw / 2 - bl / 2);
    boxes.push(centeredBox(length, p.hw, depth, x));
    if (projection > 0 && (form === 'wingWall' || form === 'cornerWall')) boxes.push(centeredBox(bl * (form === 'cornerWall' ? .75 : 1), p.hw, projection, x, p.hw / 2, p.bw / 2 + projection / 2));
  }
  return boxes;
}

export function foundationBeamLength(p: FoundationParams): number {
  const base = p.colSpacing ? p.colSpacing + p.colBx : Math.max(p.stepDims?.[p.stepDims.length - 1]?.bx || p.bx, p.foundationBeamB || 600);
  const [left, right] = overhangs(p.foundationBeamEndType, p.foundationBeamOverhangSide, p.foundationBeamOverhang ?? 300);
  return base + left + right;
}

/** Tie rows snap to the horizontal bars they wrap, and omit the opening plus hook clearance. */
export function wallTiePositions(p: ShearWallParams): { x: number; y: number }[] {
  if (!p.tieBar) return [];
  const tie = parseSlabRebar(p.tieBar), horizontal = parseSlabRebar(p.horizBar);
  if (tie.spacing <= 0 || horizontal.spacing <= 0) return [];
  const bl = p.boundaryLength || Math.max(p.bw, 400), hole = wallOpening(p)[0];
  const rows = new Set<number>(), positions: { x: number; y: number }[] = [];
  for (let y = tie.spacing; y <= p.hw - tie.spacing; y += tie.spacing) rows.add(Math.round(y / horizontal.spacing) * horizontal.spacing);
  const xs: number[] = [];
  for (let x = -p.lw / 2 + bl + tie.spacing; x <= p.lw / 2 - bl - tie.spacing + 1e-6; x += tie.spacing) xs.push(x);
  const vertical = parseSlabRebar(p.vertBar), inner = Math.max(0, p.lw - 2 * bl);
  const verticalCount = Math.max(Math.floor(inner / vertical.spacing), 1);
  const verticalXs = Array.from({ length: verticalCount + 1 }, (_, i) => -p.lw / 2 + bl + inner * i / verticalCount);
  const shifted = staggerTiePositions(xs, verticalXs, (tie.diameter + vertical.diameter) / 2 + 2, -p.lw/2+bl, p.lw/2-bl);
  for (const x of shifted) {
    for (const y of rows) if (!hole || x < hole.x0 - tie.diameter || x > hole.x1 + tie.diameter || y < hole.y0 - 120 || y > hole.y1 + 120) positions.push({ x, y });
  }
  return positions;
}
