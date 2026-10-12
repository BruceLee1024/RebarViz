import { raftBeamArrangement } from './raft-reinforcement';
import { slabReinforcement } from './slab-reinforcement';
import { columnSectionBars, foundationInsertSpec, insertPerimeter, orthogonalLayers } from './reinforcement-layout';
import { foundationBeamReinforcement } from './foundation-reinforcement';
import { parseRebar, parseSlabRebar } from './rebar';
import { beamLongitudinalLayout } from './beam-longitudinal';
import type { ComponentType } from './types';
import type { ComponentParamsMap } from './calc-formwork';
import type { ComplianceResult } from './compliance';
import { beamSpans } from './quantity-geometry';
import { beamHookFit } from './hook-fit';

/** Checks for model coverage and contradictory input, separate from design-code rules. */
export function checkConstructionModel<T extends ComponentType>(type: T, params: ComponentParamsMap[T]): ComplianceResult[] {
  const issues: ComplianceResult[] = [];
  const warn = (field: string, message: string) => issues.push({ field, rule: '模型一致性', status: 'warn', message });
  if (type === 'beam') {
    const p = params as ComponentParamsMap['beam'], spans = beamSpans(p);
    for (const issue of beamHookFit(p)) issues.push({ field: issue.field, rule: '弯钩空间', status: 'fail', message: issue.message });
    for (const message of beamLongitudinalLayout(p).issues) warn('hc',message);
    if (spans.some(s => s.h !== p.h)) warn('spanHeights', '各跨梁高不同：混凝土和模板按各跨尺寸计量；当前钢筋模型、钢筋量仍以统一梁高为基础，变高跨锚固需专项复核。');
    if (p.haunchType !== 'none' && spans.some(s => p.haunchLength * (p.haunchSide === 'both' ? 2 : 1) > s.l)) warn('haunchLength', '加腋长度超过净跨，左右加腋会重叠；请缩短加腋后计量。');
  }
  if (type === 'column') {
    const p = params as ComponentParamsMap['column'];
    const bars = columnSectionBars(p).bars;
    if (bars.some((a,i) => bars.slice(i+1).some(b => Math.hypot(a.x-b.x,a.z-b.z) < (a.diameter+b.diameter)/2+.1))) warn('main','柱纵筋间距不足，存在钢筋实体重叠；请调整截面、根数或直径。');
    if ((p.topNodeType || 'middle') !== 'middle') warn('topNodeType','柱顶已按先竖向、后向梁内弯折表示；柱顶锚固、搭接及对应钢筋量需按屋面节点详图复核。');
    if (p.hasVariableSection) warn('hasVariableSection', '变截面柱的体积与侧模按上下段分计；斜过渡段、柱筋弯折与梁板交接处需按节点详图复核。');
  }
  if (type === 'slab') {
    const p = params as ComponentParamsMap['slab'];
    for (const message of slabReinforcement(p).issues) warn('supportType', message);
  }
  if (type === 'shearwall') {
    const p = params as ComponentParamsMap['shearwall'];
    warn('vertBar', '墙身分布筋按模型净段计量，洞口截段逐段计根数；未建模的端部与洞边锚固、施工搭接需按详图补充。');
    if (p.hasOpening) warn('hasOpening', '洞口补强已按两墙面、两侧边或上下边各1根计入；洞边锚固和实际补强根数需按详图补充。');
    if (p.boundaryForm && p.boundaryForm !== 'concealed') warn('boundaryForm', '凸出边缘构件已计入混凝土与模板并集；翼墙、转角附加钢筋及拉筋数量需按实际边缘构件详图复核。');
  }
  if (type === 'stair') {
    const p = params as ComponentParamsMap['stair'], top=parseSlabRebar(p.topBar), bottom=parseSlabRebar(p.bottomBar), dist=parseSlabRebar(p.distBar);
    if (p.slabThickness < 2*p.cover+top.diameter+bottom.diameter+2*dist.diameter+2) warn('slabThickness','楼梯上下钢筋及分布筋层净距不足，存在穿插风险。');
  }
  if (type === 'stair') warn('stairType', '楼梯按梯段、平台和梯梁分项估算；支座连接处的重叠、首末踏步及施工分缝需结合实际详图核对。');
  if (type === 'foundation') {
    const p = params as ComponentParamsMap['foundation'];
    for (const message of foundationBeamReinforcement(p).issues) warn('foundationBeamH', message);
    if (p.shape === 'stepped' && Math.abs(p.stepDims.reduce((n,s) => n+s.h,0)-p.h)>1) warn('h', '各阶高度之和与基础总高不一致：请统一尺寸，避免柱插筋锚固与混凝土实体错位。');
    if (p.shape === 'tapered' && p.columnCount === 2) warn('shape', '锥形基础顶面暂按柱截面尺寸表示，双柱坡顶尺寸需另行确定。');
  }
  if (type === 'raft') {
    const p = params as ComponentParamsMap['raft'];
    if ((p.colCountX-1)*p.colSpacingX+p.colBx>p.lx || (p.colCountY-1)*p.colSpacingY+p.colBy>p.ly) warn('colSpacingX', '柱网外缘超出筏板范围，请复核筏板尺寸、柱数和间距。');
  }
  if (type === 'foundation' || type === 'pilecap' || type === 'raft') {
    const p = params as ComponentParamsMap['foundation'] | ComponentParamsMap['pilecap'] | ComponentParamsMap['raft'];
    const cover = p.cover || (type === 'pilecap' ? 50 : 40), col = parseRebar(p.colMain);
    const dx = parseSlabRebar(p.bottomBarX).diameter, dy = parseSlabRebar(p.bottomBarY).diameter;
    const height = type === 'raft' && 'raftType' in p && p.raftType === 'beamSlab' ? Math.max(p.h,p.beamH||900) : p.h;
    const spec = foundationInsertSpec(height,cover,col.diameter,dx,dy,col.grade,p.concreteGrade,p.seismicGrade||'非抗震', 'raftType' in p && p.raftType==='beamSlab' ? raftBeamArrangement(p).minFootSurfaceMm : 0);
    const required = spec.anchor.canStraight ? spec.anchor.laE : spec.anchor.straightPortion;
    if (spec.verticalDepthMm < required) warn('h',`柱插筋避让底部网片后，竖向锚固空间${spec.verticalDepthMm.toFixed(1)}mm，小于当前规则${required}mm；请复核基础高度及插筋构造。`);
    const perimeter = insertPerimeter(p.colMain,p.colBx,p.colBy,cover);
    if(perimeter.some((a,i)=>perimeter.slice(i+1).some(b=>Math.hypot(a.x-b.x,a.z-b.z)<col.diameter+.1))) warn('colMain','柱插筋根数或直径超出当前柱截面的布置空间，存在重叠。');
    if (type !== 'raft' && 'bx' in p && 'by' in p && ((p.bx-p.colBx)/2 < spec.anchor.bendLength+cover || (p.by-p.colBy)/2 < spec.anchor.bendLength+cover)) warn('colMain','柱插筋弯脚的外侧空间不足，需结合基础边缘和柱位调整方向或尺寸。');
    const bottom = orthogonalLayers(p.h,cover,dx,dy,'bottom');
    if(Math.max(bottom.x+dx/2,bottom.y+dy/2)>p.h-cover) warn('h','基础底筋网片超出可用厚度，保护层或截面尺寸不足。');
    if(type==='raft' && 'raftType' in p && p.raftType==='beamSlab' && !raftBeamArrangement(p).clear) warn('beamB','筏基梁宽不足以避让柱插筋，请复核梁柱交接处的钢筋布置。');
    if(type==='raft' && 'raftType' in p && p.raftType==='beamSlab') warn('beamPosition','筏基双向梁筋已分层避让；梁端锚固及梁柱节点箍筋仍为示意范围，需按实际节点详图复核。');
  }
  if(type==='stripfoundation') {
    const p=params as ComponentParamsMap['stripfoundation'];
    if(p.hasJcl) warn('jclBottom','JL与JCL交叉处已分层；多排端部弯锚及梁交接节点箍筋需按详图核对。');
  }
  if(type==='joint') {
    const p=params as ComponentParamsMap['joint'];
    if(p.jointType==='corner') warn('jointType','角节点当前仅展示一个方向的梁筋，另一方向梁筋及三维交叉锚固尚需按节点详图建模。');
    if(p.anchorType==='bent') warn('anchorType','上下弯锚已采用独立深度；各排与柱纵筋的净距、锚固水平段仍需结合节点详图复核。');
  }
  return issues;
}
