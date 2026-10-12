/**
 * Build context strings from component params for AI assistant
 */
import type { BeamParams, ColumnParams, SlabParams, JointParams, ShearWallParams, StairParams, FoundationParams, StripFoundationParams, PileCapParams, RaftFoundationParams } from './types';
import { parseRebar, parseStirrup, parseSlabRebar, gradeLabel, resolveColumnBars } from './rebar';
import { calcLaE, calcLaTable, calcLabTable, FT, FY, getPileEmbedDepth, determinePileCapRebarEnd, determineJLEndAnchor, determineLPBEdgeAnchor, determineBPBEdgeAnchor, checkJLLDirectAnchor } from './anchor';
import type { ConcreteGrade, SeismicGrade } from './anchor';
import { rebarArea, ANCHOR_LARGE_DIA_THRESHOLD } from './construction-rules';

export function buildBeamContext(p: BeamParams): string {
  const topR = parseRebar(p.top);
  const botR = parseRebar(p.bottom);
  const stir = parseStirrup(p.stirrup);
  const cover = p.cover || 25;
  const h0 = p.h - cover - botR.diameter / 2;
  const segArea = (segs: {count:number;diameter:number}[]) => segs.reduce((s, seg) => s + seg.count * rebarArea(seg.diameter), 0);
  const AsTop = topR.segments ? segArea(topR.segments) : topR.count * rebarArea(topR.diameter);
  const AsBot = botR.segments ? segArea(botR.segments) : botR.count * rebarArea(botR.diameter);
  const bh0 = p.b * h0;
  const rhoTop = (AsTop / bh0 * 100).toFixed(3);
  const rhoBot = (AsBot / bh0 * 100).toFixed(3);
  const ft = FT[p.concreteGrade] || 1.43;
  const fyBot = FY[botR.grade] || 360;
  const rhoMin = Math.max(0.2, 0.45 * ft / fyBot * 100).toFixed(3);
  const laETop = calcLaE(topR.grade, topR.diameter, p.concreteGrade as ConcreteGrade, (p.seismicGrade || '三级') as SeismicGrade);
  const laEBot = calcLaE(botR.grade, botR.diameter, p.concreteGrade as ConcreteGrade, (p.seismicGrade || '三级') as SeismicGrade);
  const canStraightAnchor = laETop <= (p.hc || 500) - cover;
  const topDesc = topR.segments
    ? topR.segments.map((seg, i) => `${i === 0 ? '外排' : `第${i+1}排`}${seg.count}根${seg.grade}${seg.diameter}`).join('+')
    : `${topR.count}根 ${gradeLabel(topR.grade)} Φ${topR.diameter}`;
  const botDesc = botR.segments
    ? botR.segments.map((seg, i) => `${i === 0 ? '外排' : `第${i+1}排`}${seg.count}根${seg.grade}${seg.diameter}`).join('+')
    : `${botR.count}根 ${gradeLabel(botR.grade)} Φ${botR.diameter}`;
  return `构件类型: 框架梁 ${p.id}
截面: ${p.b}×${p.h}mm，有效高度 h₀=${h0.toFixed(0)}mm
上部通长筋: ${p.top} (${topDesc}，As=${AsTop.toFixed(0)}mm²)${topR.segments ? ' [混合直径]' : ''}
下部通长筋: ${p.bottom} (${botDesc}，As=${AsBot.toFixed(0)}mm²)${botR.segments ? ' [混合直径]' : ''}
配筋率: 上部ρ=${rhoTop}%，下部ρ=${rhoBot}%，最小配筋率ρmin=${rhoMin}%
箍筋: ${p.stirrup} (${gradeLabel(stir.grade)} Φ${stir.diameter} 加密${stir.spacingDense}/非加密${stir.spacingNormal} ${stir.legs}肢箍)
锚固长度: 上部laE=${laETop}mm，下部laE=${laEBot}mm，${canStraightAnchor ? '可直锚(laE≤hc-c)' : '需弯锚(laE>hc-c)'}
左支座负筋: ${p.leftSupport || '无'}
右支座负筋: ${p.rightSupport || '无'}
腰筋/抗扭筋: ${p.sideBar || '无'}${p.sideBar ? `，拉筋: ${p.tieBar || '自动(b≤350→A6)'}` : ''}
混凝土等级: ${p.concreteGrade}(ft=${ft}MPa)，抗震等级: ${p.seismicGrade}
保护层: ${cover}mm，梁净跨: ${p.spanLength}mm，支座柱宽 hc: ${p.hc}mm，支座柱截面深度: ${p.supportDepth || 600}mm${p.haunchType && p.haunchType !== 'none' ? `\n加腋: ${p.haunchType === 'horizontal' ? '水平' : '竖向'}加腋，c₁=${p.haunchLength}mm，${p.haunchType === 'horizontal' ? '单侧宽度' : '高度'}=${p.haunchHeight}mm，${p.haunchSide === 'both' ? '两端' : p.haunchSide === 'left' ? '左端' : '右端'}` : ''}`;
}

export function buildColumnContext(p: ColumnParams): string {
  const stir = parseStirrup(p.stirrup);
  const cover = p.cover || 25;
  const innerW = p.b - 2 * cover;
  const innerH = p.h - 2 * cover;
  const resolved = resolveColumnBars(p.main, p.cornerMain, p.bMiddleMain, p.hMiddleMain, innerW, innerH);
  const AsMain = resolved.bars.reduce((sum, bar) => sum + rebarArea(bar.diameter), 0);
  const Ag = p.b * p.h;
  const rho = (AsMain / Ag * 100).toFixed(3);
  const ft = FT[p.concreteGrade] || 1.43;

  let barDesc: string;
  if (resolved.isDetailed) {
    const parts = [`角筋: ${p.cornerMain} (4根 ${gradeLabel(resolved.corner.grade)} Φ${resolved.corner.diameter})`];
    if (resolved.bMiddle) parts.push(`b边中部筋: ${p.bMiddleMain} (每侧${resolved.bMiddle.count}根 ${gradeLabel(resolved.bMiddle.grade)} Φ${resolved.bMiddle.diameter})`);
    if (resolved.hMiddle) parts.push(`h边中部筋: ${p.hMiddleMain} (每侧${resolved.hMiddle.count}根 ${gradeLabel(resolved.hMiddle.grade)} Φ${resolved.hMiddle.diameter})`);
    barDesc = parts.join('\n') + `\n总计: ${resolved.totalCount}根，22G101-1分项标注`;
  } else {
    barDesc = `全部纵筋: ${p.main} (${resolved.totalCount}根 ${gradeLabel(resolved.corner.grade)} Φ${resolved.corner.diameter})`;
  }

  return `构件类型: 框架柱 ${p.id}
截面: ${p.b}×${p.h}mm，截面面积Ag=${Ag}mm²
${barDesc}
总As=${AsMain.toFixed(0)}mm²，全截面配筋率: ρ=${rho}%
箍筋: ${p.stirrup} (${gradeLabel(stir.grade)} Φ${stir.diameter} 加密${stir.spacingDense}/非加密${stir.spacingNormal} ${stir.legs}肢箍)
混凝土等级: ${p.concreteGrade}(ft=${ft}MPa)，抗震等级: ${p.seismicGrade}
保护层: ${cover}mm，柱净高: ${p.height}mm${p.hasVariableSection ? `\n变截面: 上段 ${p.upperB}×${p.upperH}mm，自 ${p.variableStart}mm 高度起变化` : ''}`;
}

export function buildSlabContext(p: SlabParams): string {
  const cover = p.cover || 15;
  const h0 = p.thickness - cover - 5;
  const botX = parseSlabRebar(p.bottomX);
  const botY = parseSlabRebar(p.bottomY);
  const AsPerMBotX = (rebarArea(botX.diameter) * 1000 / botX.spacing).toFixed(0);
  const AsPerMBotY = (rebarArea(botY.diameter) * 1000 / botY.spacing).toFixed(0);
  const rhoBotX = (rebarArea(botX.diameter) * 1000 / botX.spacing / (1000 * h0) * 100).toFixed(3);
  const rhoBotY = (rebarArea(botY.diameter) * 1000 / botY.spacing / (1000 * h0) * 100).toFixed(3);
  const ft = FT[p.concreteGrade] || 1.43;
  const fy = FY[botX.grade] || 360;
  const rhoMin = Math.max(0.2, 0.45 * ft / fy * 100).toFixed(3);
  const supportLabel = p.supportType === 'simple' ? '简支' : p.supportType === 'continuous' ? '连续' : '悬挑';
  const negSupportPos = p.supportType === 'continuous' ? 'middle' : 'end';
  const negExtendRatio = negSupportPos === 'end' ? 'ln/4' : 'ln/3(第一排)';
  const negExtendX = negSupportPos === 'end' ? Math.ceil(p.spanX / 4) : Math.ceil(p.spanX / 3);
  const negExtendY = negSupportPos === 'end' ? Math.ceil(p.spanY / 4) : Math.ceil(p.spanY / 3);
  const negXDesc = p.supportNegX ? `X向支座负筋: ${p.supportNegX}，伸入跨中 ${negExtendRatio}=${negExtendX}mm` : 'X向支座负筋: 无';
  const negYDesc = p.supportNegY ? `Y向支座负筋: ${p.supportNegY}，伸入跨中 ${negExtendRatio}=${negExtendY}mm` : 'Y向支座负筋: 无';
  const negAnchorDesc = negSupportPos === 'end' ? '端支座弯折向下≥12d' : '中间支座直通过支座';
  return `构件类型: 楼板 ${p.id}
板厚: ${p.thickness}mm，有效高度 h₀≈${h0}mm
板跨: X向${p.spanX}mm × Y向${p.spanY}mm，支座类型: ${supportLabel}，支座梁宽: ${p.supportBeamWidth}mm
X向底筋: ${p.bottomX} (As=${AsPerMBotX}mm²/m，ρ=${rhoBotX}%)
Y向底筋: ${p.bottomY} (As=${AsPerMBotY}mm²/m，ρ=${rhoBotY}%)
最小配筋率: ρmin=${rhoMin}%
X向面筋: ${p.topX || '无'}，Y向面筋: ${p.topY || '无'}
${negXDesc}
${negYDesc}
负筋锚固: ${negAnchorDesc} (22G101)
${p.supportType === 'cantilever' ? '悬臂板: 受力筋伸至自由端弯折≥12d，锚入相邻跨≥ln/4\n' : ''}分布筋: ${p.distribution}
混凝土等级: ${p.concreteGrade}(ft=${ft}MPa)，保护层: ${cover}mm`;
}

export function buildJointContext(p: JointParams): string {
  const jointTypeLabel = { middle: '中间节点', side: '边节点', corner: '角节点' };
  const beamTopR = parseRebar(p.beamTop);
  const beamBotR = parseRebar(p.beamBottom);
  const cover = p.cover || 25;
  const laETop = calcLaE(beamTopR.grade, beamTopR.diameter, p.concreteGrade as ConcreteGrade, (p.seismicGrade || '三级') as SeismicGrade);
  const laEBot = calcLaE(beamBotR.grade, beamBotR.diameter, p.concreteGrade as ConcreteGrade, (p.seismicGrade || '三级') as SeismicGrade);
  const hc = p.colH || 500;
  const canStraight = laETop <= hc - cover;
  return `构件类型: 梁柱节点 (${jointTypeLabel[p.jointType]})
柱截面: ${p.colB}×${p.colH}mm，柱纵筋: ${p.colMain}
梁截面: ${p.beamB}×${p.beamH}mm
梁上部筋: ${p.beamTop} (${beamTopR.count}根Φ${beamTopR.diameter}，laE=${laETop}mm)
梁下部筋: ${p.beamBottom} (${beamBotR.count}根Φ${beamBotR.diameter}，laE=${laEBot}mm)
锚固方式: ${p.anchorType === 'bent' ? '弯锚' : '直锚'}，${canStraight ? '柱截面满足直锚条件(laE≤hc-c)' : '柱截面不满足直锚条件(laE>hc-c)'}
混凝土等级: ${p.concreteGrade}，抗震等级: ${p.seismicGrade}
保护层: ${cover}mm`;
}

export function buildShearWallContext(p: ShearWallParams): string {
  const vert = parseSlabRebar(p.vertBar);
  const horiz = parseSlabRebar(p.horizBar);
  const boundaryR = parseRebar(p.boundaryMain);
  const tie = p.tieBar ? parseSlabRebar(p.tieBar) : null;
  const openingVert = p.openingVertBar ? parseSlabRebar(p.openingVertBar) : null;
  const openingHoriz = p.openingHorizBar ? parseSlabRebar(p.openingHorizBar) : null;
  // 竖向配筋率 (双排)
  const AsVert = 2 * rebarArea(vert.diameter) * 1000 / vert.spacing;
  const rhoVert = (AsVert / (p.bw * 1000) * 100).toFixed(3);
  const AsHoriz = 2 * rebarArea(horiz.diameter) * 1000 / horiz.spacing;
  const rhoHoriz = (AsHoriz / (p.bw * 1000) * 100).toFixed(3);
  const AsBoundary = boundaryR.count * rebarArea(boundaryR.diameter);
  const boundaryTypeLabel = p.boundaryType === 'ybz'
    ? '约束边缘构件 YBZ'
    : p.boundaryType === 'fbz'
      ? '扶壁柱 FBZ'
      : p.boundaryType === 'az'
        ? '非边缘暗柱 AZ'
        : '构造边缘构件 GBZ';
  const boundaryFormLabel = p.boundaryForm === 'endColumn'
    ? '端柱'
    : p.boundaryForm === 'wingWall'
      ? '翼墙'
      : p.boundaryForm === 'cornerWall'
        ? '转角墙'
        : '暗柱';
  const openingInfo = p.hasOpening
    ? `\n洞口: ${p.openingWidth}×${p.openingHeight}mm，洞底标高=${p.openingBottom}mm，中心偏移X=${p.openingOffsetX || 0}mm
洞口侧边补强: ${p.openingVertBar || '未设置'}${openingVert ? ` (${gradeLabel(openingVert.grade)} Φ${openingVert.diameter}@${openingVert.spacing})` : ''}
洞口上下补强: ${p.openingHorizBar || '未设置'}${openingHoriz ? ` (${gradeLabel(openingHoriz.grade)} Φ${openingHoriz.diameter}@${openingHoriz.spacing})` : ''}`
    : '\n洞口: 无';
  return `构件类型: 剪力墙 ${p.id}
墙厚 bw: ${p.bw}mm，墙长 lw: ${p.lw}mm，墙净高 hw: ${p.hw}mm
竖向分布筋: ${p.vertBar} (${gradeLabel(vert.grade)} Φ${vert.diameter}@${vert.spacing}，双排，ρv=${rhoVert}%)
水平分布筋: ${p.horizBar} (${gradeLabel(horiz.grade)} Φ${horiz.diameter}@${horiz.spacing}，双排，ρh=${rhoHoriz}%)
边缘构件类型: ${boundaryTypeLabel}，外形=${boundaryFormLabel}，长度=${p.boundaryLength || Math.max(p.bw, 400)}mm${p.boundaryProjection ? `，凸出深度=${p.boundaryProjection}mm` : ''}
边缘构件纵筋: ${p.boundaryMain} (${boundaryR.count}根 ${gradeLabel(boundaryR.grade)} Φ${boundaryR.diameter}，总As=${AsBoundary.toFixed(0)}mm²，两端各一组)
边缘构件箍筋: ${p.boundaryStirrup}
拉结筋: ${p.tieBar || '未设置'}${tie ? ` (${gradeLabel(tie.grade)} Φ${tie.diameter}@${tie.spacing})` : ''}${openingInfo}
混凝土等级: ${p.concreteGrade}，抗震等级: ${p.seismicGrade}
保护层: ${p.cover}mm`;
}

export function buildStairContext(p: StairParams): string {
  const botR = parseSlabRebar(p.bottomBar);
  const topR = parseSlabRebar(p.topBar);
  const distR = parseSlabRebar(p.distBar);
  const totalRise = p.stepCount * p.stepHeight;
  const totalRun = p.stepCount * p.stepWidth;
  const angle = (Math.atan2(totalRise, totalRun) * 180 / Math.PI).toFixed(1);
  const slabLen = Math.round(Math.sqrt(totalRise * totalRise + totalRun * totalRun));
  const cover = p.cover || 15;
  const h0 = p.slabThickness - cover - botR.diameter / 2;
  const AsPerM = rebarArea(botR.diameter) * 1000 / botR.spacing;
  const rhoBot = (AsPerM / (1000 * h0) * 100).toFixed(3);
  const ft = FT[p.concreteGrade] || 1.43;
  const fy = FY[botR.grade] || 360;
  const rhoMin = Math.max(0.2, 0.45 * ft / fy * 100).toFixed(3);
  return `构件类型: AT型板式楼梯 ${p.id}
踏步: ${p.stepCount}步，踏步高 ${p.stepHeight}mm，踏步宽 ${p.stepWidth}mm
梯板厚: ${p.slabThickness}mm，有效高度 h₀≈${h0.toFixed(0)}mm，梯段宽: ${p.flightWidth}mm
总升高: ${totalRise}mm，总水平长: ${totalRun}mm，倾角: ${angle}°，斜长: ${slabLen}mm
上平台板长: ${p.topPlatformLen}mm，下平台板长: ${p.botPlatformLen}mm，平台板厚: ${p.platformThickness}mm
梯梁（梯板端支座梁）: ${p.beamB}×${p.beamH}mm（低端/高端）
下部纵筋: ${p.bottomBar} (${gradeLabel(botR.grade)} Φ${botR.diameter}@${botR.spacing}，As=${AsPerM.toFixed(0)}mm²/m，ρ=${rhoBot}%)
上部纵筋: ${p.topBar} (${gradeLabel(topR.grade)} Φ${topR.diameter}@${topR.spacing})
分布筋: ${p.distBar} (${gradeLabel(distR.grade)} Φ${distR.diameter}@${distR.spacing})
最小配筋率: ρmin=${rhoMin}%
混凝土等级: ${p.concreteGrade}(ft=${ft}MPa)，保护层: ${cover}mm`;
}

export function buildFoundationContext(p: FoundationParams): string {
  const barX = parseSlabRebar(p.bottomBarX);
  const barY = parseSlabRebar(p.bottomBarY);
  const colR = parseRebar(p.colMain);
  const cover = p.cover || 40;
  const AsX = rebarArea(barX.diameter) * 1000 / barX.spacing;
  const AsY = rebarArea(barY.diameter) * 1000 / barY.spacing;
  const h0x = p.h - cover - barX.diameter / 2;
  const h0y = p.h - cover - barX.diameter - barY.diameter / 2;
  const rhoX = (AsX / (1000 * h0x) * 100).toFixed(3);
  const rhoY = (AsY / (1000 * h0y) * 100).toFixed(3);
  const AsBoundary = colR.count * rebarArea(colR.diameter);
  const stepDesc = p.shape === 'stepped'
    ? p.stepDims.map((s, i) => `第${i+1}阶: ${s.bx}×${s.by}×${s.h}mm`).join('，')
    : `锥形: 底${p.bx}×${p.by} → 顶${p.colBx}×${p.colBy}mm`;
  const isDual = (p.columnCount || 1) === 2;
  const shortenInfo = [
    p.shortenBottomBarX ? 'X向底筋隔一减短10%' : null,
    p.shortenBottomBarY ? 'Y向底筋隔一减短10%' : null,
  ].filter(Boolean).join('，');
  const beamInfo = p.hasFoundationBeam
    ? `\n基础梁 JL: ${p.foundationBeamB || '未设置'}×${p.foundationBeamH || '未设置'}mm
基础梁箍筋: ${p.foundationBeamStirrup || '未设置'}
基础梁底筋: ${p.foundationBeamBottom || '未设置'}
基础梁顶筋: ${p.foundationBeamTop || '未设置'}
基础梁端部: ${p.foundationBeamEndType === 'bothSides' ? '双端外伸' : p.foundationBeamEndType === 'oneSide' ? `单端外伸(${p.foundationBeamOverhangSide === 'left' ? '左' : '右'})` : '无外伸'}${p.foundationBeamOverhang ? `，外伸${p.foundationBeamOverhang}mm` : ''}`
    : '';
  const dualInfo = isDual ? `\n柱数: 双柱，柱中心距: ${p.colSpacing}mm
顶部纵向筋: ${p.topBarX || '未设置'}${p.topBarXCount ? `，总根数: ${p.topBarXCount}根` : ''} (柱间受力钢筋)
顶部分布筋: ${p.topBarY || '未设置'} (柱间分布钢筋)
顶部钢筋带宽: ${p.topBandWidth || '未设置'}mm${beamInfo}` : '';

  return `构件类型: ${isDual ? '双柱' : ''}独立基础 ${p.id}
形状: ${p.shape === 'stepped' ? '阶形' : '锥形'}，${stepDesc}
底面尺寸: ${p.bx}×${p.by}mm，基础总高: ${p.h}mm
X向底筋: ${p.bottomBarX} (${gradeLabel(barX.grade)} Φ${barX.diameter}@${barX.spacing}，As=${AsX.toFixed(0)}mm²/m，ρ=${rhoX}%)
Y向底筋: ${p.bottomBarY} (${gradeLabel(barY.grade)} Φ${barY.diameter}@${barY.spacing}，As=${AsY.toFixed(0)}mm²/m，ρ=${rhoY}%)
底筋减短: ${shortenInfo || '未采用'}
柱截面: ${p.colBx}×${p.colBy}mm${isDual ? ' ×2' : ''}
柱插筋: ${p.colMain} (${colR.count}根 ${gradeLabel(colR.grade)} Φ${colR.diameter}，总As=${AsBoundary.toFixed(0)}mm²${isDual ? '，×2柱' : ''})${dualInfo}
混凝土等级: ${p.concreteGrade}，保护层: ${cover}mm`;
}

export function buildStripFoundationContext(p: StripFoundationParams): string {
  const bottom = parseSlabRebar(p.bottomBar);
  const dist = parseSlabRebar(p.distBar);
  const top = p.topBar ? parseSlabRebar(p.topBar) : null;
  const topDist = p.topDistBar ? parseSlabRebar(p.topDistBar) : null;
  const jlBottom = p.jlBottom ? parseRebar(p.jlBottom) : null;
  const jlTop = p.jlTop ? parseRebar(p.jlTop) : null;
  const jclBottom = p.jclBottom ? parseRebar(p.jclBottom) : null;
  const jclTop = p.jclTop ? parseRebar(p.jclTop) : null;
  const cover = p.cover || 40;
  const AsBottom = rebarArea(bottom.diameter) * 1000 / bottom.spacing;
  const AsDist = rebarArea(dist.diameter) * 1000 / dist.spacing;
  const h0 = p.h - cover - bottom.diameter / 2;
  const rhoBottom = (AsBottom / (1000 * h0) * 100).toFixed(3);
  const clearGap = p.supportCount === 2 && p.supportSpacing
    ? Math.max(p.supportSpacing - p.supportWidth, 0)
    : 0;
  const jlInfo = p.supportType === 'beam'
    ? `\nJL主梁底筋: ${p.jlBottom || '未设置'}${jlBottom ? ` (${jlBottom.count}根 ${gradeLabel(jlBottom.grade)} Φ${jlBottom.diameter})` : ''}
JL主梁顶筋: ${p.jlTop || '未设置'}${jlTop ? ` (${jlTop.count}根 ${gradeLabel(jlTop.grade)} Φ${jlTop.diameter})` : ''}
JL主梁箍筋: ${p.jlStirrup || '未设置'}
JL端部: ${p.jlEndType === 'bothSides' ? `双端外伸 ${p.jlOverhang || 0}mm` : p.jlEndType === 'oneSide' ? `${p.jlOverhangSide === 'left' ? '左端' : '右端'}外伸 ${p.jlOverhang || 0}mm` : '无外伸'}`
    : '';
  const jclInfo = p.hasJcl
    ? `\nJCL次梁: ${p.jclCount || 1}道，间距 ${p.jclSpacing || '未设置'}mm，截面 ${p.jclB || '未设置'}×${p.jclH || '未设置'}mm
JCL底筋: ${p.jclBottom || '未设置'}${jclBottom ? ` (${jclBottom.count}根 ${gradeLabel(jclBottom.grade)} Φ${jclBottom.diameter})` : ''}
JCL顶筋: ${p.jclTop || '未设置'}${jclTop ? ` (${jclTop.count}根 ${gradeLabel(jclTop.grade)} Φ${jclTop.diameter})` : ''}
JCL箍筋: ${p.jclStirrup || '未设置'}
JCL端部: ${p.jclEndType === 'bothSides' ? `双端外伸 ${p.jclOverhang || 0}mm` : p.jclEndType === 'oneSide' ? `${p.jclOverhangSide === 'left' ? '左端' : '右端'}外伸 ${p.jclOverhang || 0}mm` : '无外伸'}`
    : '';
  const overrideInfo = p.hasLocalOverride
    ? `\n原位修正: 起点 ${p.localOverrideStart || 0}mm，长度 ${p.localOverrideLength || 0}mm
修正底筋: ${p.localBottomBar || '未设置'}
修正顶筋: ${p.localTopBar || '未设置'}
说明: ${p.localOverrideNote || '无'}`
    : '';

  return `构件类型: 条形基础 ${p.id}
条基类型: ${p.stripKind === 'beamPlate' ? '梁板式条形基础' : '板式条形基础'}
底板尺寸: 长${p.length}mm × 宽${p.width}mm × 厚${p.h}mm
底部横向受力筋: ${p.bottomBar} (${gradeLabel(bottom.grade)} Φ${bottom.diameter}@${bottom.spacing}，As=${AsBottom.toFixed(0)}mm²/m，ρ=${rhoBottom}%)
底部分布筋: ${p.distBar} (${gradeLabel(dist.grade)} Φ${dist.diameter}@${dist.spacing}，As=${AsDist.toFixed(0)}mm²/m)
顶部横向受力筋: ${p.topBar || '未设置'}${top ? ` (${gradeLabel(top.grade)} Φ${top.diameter}@${top.spacing})` : ''}
顶部分布筋: ${p.topDistBar || '未设置'}${topDist ? ` (${gradeLabel(topDist.grade)} Φ${topDist.diameter}@${topDist.spacing})` : ''}
支承形式: ${p.supportCount === 2 ? '双' : '单'}${p.supportType === 'beam' ? '梁' : '墙'}，支承宽度 ${p.supportWidth}mm，支承高度 ${p.supportHeight}mm${p.supportSpacing ? `，中心距 ${p.supportSpacing}mm` : ''}
两梁(墙)内边净距: ${clearGap || '—'}mm
${jlInfo}${jclInfo}${overrideInfo}
混凝土等级: ${p.concreteGrade}，保护层: ${cover}mm`;
}

export function buildPileCapContext(p: PileCapParams): string {
  const barX = parseSlabRebar(p.bottomBarX);
  const barY = parseSlabRebar(p.bottomBarY);
  const colR = parseRebar(p.colMain);
  const cover = p.cover || 50;
  const AsX = rebarArea(barX.diameter) * 1000 / barX.spacing;
  const AsY = rebarArea(barY.diameter) * 1000 / barY.spacing;
  const h0x = p.h - cover - barX.diameter / 2;
  const rhoX = (AsX / (1000 * h0x) * 100).toFixed(3);
  const AsBoundary = colR.count * rebarArea(colR.diameter);

  const embedDepth = getPileEmbedDepth(p.pileDiameter);
  const availLen = p.h - cover - barX.diameter;
  const pileType: 'round' | 'square' = p.pileDiameter > 0 ? 'round' : 'square';
  const rebarEnd = determinePileCapRebarEnd(barX.diameter, pileType, p.pileDiameter, availLen);

  return `构件类型: 承台 ${p.id}
承台尺寸: ${p.bx}×${p.by}×${p.h}mm
桩基: Φ${p.pileDiameter}mm × ${p.pileCount}根，${p.pileLayout === 'grid' ? '矩形排布' : '环形排布'}
X向桩距: ${p.pileSpacingX}mm，Y向桩距: ${p.pileSpacingY}mm，桩长: ${p.pileLength}mm
X向底筋: ${p.bottomBarX} (${gradeLabel(barX.grade)} Φ${barX.diameter}@${barX.spacing}，As=${AsX.toFixed(0)}mm²/m，ρ=${rhoX}%)
Y向底筋: ${p.bottomBarY} (${gradeLabel(barY.grade)} Φ${barY.diameter}@${barY.spacing}，As=${AsY.toFixed(0)}mm²/m)
柱截面: ${p.colBx}×${p.colBy}mm
柱插筋: ${p.colMain} (${colR.count}根 ${gradeLabel(colR.grade)} Φ${colR.diameter}，总As=${AsBoundary.toFixed(0)}mm²)
混凝土等级: ${p.concreteGrade}，保护层: ${cover}mm
桩顶嵌入承台: ${embedDepth}mm (桩径${p.pileDiameter}mm ${p.pileDiameter < 800 ? '<' : '≥'} 800mm — 22G101-3 §2-38)
承台底筋端部: ${rebarEnd.description}`;
}

export function buildRaftContext(p: RaftFoundationParams): string {
  const botX = parseSlabRebar(p.bottomBarX);
  const botY = parseSlabRebar(p.bottomBarY);
  const topX = p.topBarX ? parseSlabRebar(p.topBarX) : null;
  const topY = p.topBarY ? parseSlabRebar(p.topBarY) : null;
  const colR = parseRebar(p.colMain);
  const cover = p.cover || 40;
  const AsBotX = rebarArea(botX.diameter) * 1000 / botX.spacing;
  const AsBotY = rebarArea(botY.diameter) * 1000 / botY.spacing;
  const h0 = p.h - cover - botX.diameter / 2;
  const rhoBotX = (AsBotX / (1000 * h0) * 100).toFixed(3);
  const rhoBotY = (AsBotY / (1000 * h0) * 100).toFixed(3);
  const colTotal = p.colCountX * p.colCountY;
  const AsCol = colR.count * rebarArea(colR.diameter);
  const topInfo = topX && topY
    ? `\nX向面筋: ${p.topBarX} (${gradeLabel(topX.grade)} Φ${topX.diameter}@${topX.spacing})
Y向面筋: ${p.topBarY} (${gradeLabel(topY.grade)} Φ${topY.diameter}@${topY.spacing})`
    : '';
  const raftTypeLabel = p.raftType === 'beamSlab' ? '梁板式筏形基础 (JL+LPB)'
    : p.raftType === 'flatPlate' ? '平板式筏形基础-板带式 (ZXB/KZB)'
    : '平板式筏形基础 (BPB)';

  const beamInfo = p.raftType === 'beamSlab' && p.beamB && p.beamH
    ? `\nJL基础梁: ${p.beamB}×${p.beamH}mm，${p.beamPosition ?? 'low'}板位
JL底部纵筋: ${p.beamBottom ?? '未设置'}，顶部纵筋: ${p.beamTop ?? '未设置'}，箍筋: ${p.beamStirrup ?? '未设置'}`
    : '';

  const stripInfo = p.raftType === 'flatPlate' && p.colStripWidth
    ? `\nZXB柱下板带宽: ${p.colStripWidth}mm，X向附加筋: ${p.colStripBarX ?? '未设置'}，Y向附加筋: ${p.colStripBarY ?? '未设置'}`
    : '';
  const crossOrderInfo = `\n底筋交叉上下关系: ${p.bottomCrossOrder === 'yBelowX' ? 'Y向在下，X向在上' : 'X向在下，Y向在上'}
面筋交叉上下关系: ${p.topCrossOrder === 'yBelowX' ? 'Y向在下，X向在上' : 'X向在下，Y向在上'}`;

  const la = calcLaTable(botX.grade, botX.diameter, p.concreteGrade as ConcreteGrade);
  const largeDiaNote = botX.diameter > ANCHOR_LARGE_DIA_THRESHOLD
    ? ` (d=${botX.diameter}>${ANCHOR_LARGE_DIA_THRESHOLD}mm，已×1.1修正)` : '';

  let anchorNote = '';
  if (p.raftType === 'flat') {
    const bpbEdge = determineBPBEdgeAnchor(p.colSpacingX / 2, la, botX.diameter);
    anchorNote = `\n平板底筋边缘锚固 (BPB): ${bpbEdge.description}`;
  } else if (p.raftType === 'beamSlab' && p.beamH) {
    const jlEdge = determineJLEndAnchor(p.colSpacingX / 2, la, botX.diameter);
    anchorNote = `\nJL梁端锚固 (约以半跨估算): ${jlEdge.description}`;
    const lpbEdge = determineLPBEdgeAnchor(p.colSpacingX / 2, la, botX.diameter);
    anchorNote += `\nLPB板边缘锚固: ${lpbEdge.description}`;
  } else if (p.raftType === 'flatPlate') {
    const bpbEdge = determineBPBEdgeAnchor(p.colSpacingX / 2, la, botX.diameter);
    anchorNote = `\nZXB/KZB板边缘锚固: ${bpbEdge.description}`;
  }

  return `构件类型: ${raftTypeLabel} — ${p.id}
筏板尺寸: ${p.lx}×${p.ly}×${p.h}mm (${(p.lx / 1000).toFixed(1)}×${(p.ly / 1000).toFixed(1)}m)
X向底筋: ${p.bottomBarX} (${gradeLabel(botX.grade)} Φ${botX.diameter}@${botX.spacing}，As=${AsBotX.toFixed(0)}mm²/m，ρ=${rhoBotX}%)${largeDiaNote}
Y向底筋: ${p.bottomBarY} (${gradeLabel(botY.grade)} Φ${botY.diameter}@${botY.spacing}，As=${AsBotY.toFixed(0)}mm²/m，ρ=${rhoBotY}%)${topInfo}${beamInfo}${stripInfo}
${crossOrderInfo}
柱网: ${p.colCountX}×${p.colCountY} (共${colTotal}根柱)，柱距 ${p.colSpacingX}×${p.colSpacingY}mm
柱截面: ${p.colBx}×${p.colBy}mm
柱插筋: ${p.colMain} (每柱${colR.count}根 ${gradeLabel(colR.grade)} Φ${colR.diameter}，As=${AsCol.toFixed(0)}mm²)
底筋锚固长度 la (查表法): ${la}mm${largeDiaNote}${anchorNote}
混凝土等级: ${p.concreteGrade}，抗震等级: ${p.seismicGrade}，保护层: ${cover}mm`;
}
