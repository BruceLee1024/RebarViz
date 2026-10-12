import { checkConstructionModel } from './construction-audit';
/**
 * 规范合规性校验 — 基于 GB50010-2010 和 22G101 图集
 * 在 AI 生成配筋参数后，自动检查是否满足规范要求
 */
import type { BeamParams, ColumnParams, SlabParams, ShearWallParams, StairParams, FoundationParams, StripFoundationParams, PileCapParams, RaftFoundationParams, JointParams, ComponentType } from './types';
import { parseRebar, parseRebarBottom, parseStirrup, parseSlabRebar, resolveColumnBars } from './rebar';
import { calcEffectiveDepth } from './layout';
import { FT, FY, calcLaE } from './anchor';
import {
  rebarArea,
  beamRhoMin, BEAM_RHO_MAX, BEAM_MIN_THROUGH_BAR_COUNT,
  COLUMN_RHO_MIN, COLUMN_RHO_MAX, COLUMN_MIN_MAIN_BAR_COUNT,
  columnMinMainDiameter,
  maxStirrupSpacingDense, minStirrupDiameter,
  SIDE_BAR_REQUIRED_HW,
  SLAB_MIN_THICKNESS, slabMaxBarSpacing,
  WALL_RHO_MIN, WALL_DIST_MAX_SPACING, WALL_DIST_MIN_DIAMETER, WALL_BOUNDARY_MIN_BAR_COUNT,
  STAIR_COMFORT, STAIR_STEP_HEIGHT, STAIR_STEP_WIDTH, STAIR_MIN_FLIGHT_WIDTH,
  stairSlabThicknessRange, STAIR_MIN_BAR_DIAMETER, STAIR_BAR_SPACING,
  SLAB_DIST_MIN_DIAMETER, SLAB_DIST_MAX_SPACING, slabSpanThicknessLimit,
  determineColFoundAnchor,
  COL_FOUND_STIRRUP_MIN_COUNT, COL_FOUND_STIRRUP_ZONE_SPACING_MAX,
  COL_FOUND_CORNER_ONLY_H_AXIAL,
} from './construction-rules';

export type ComplianceStatus = 'pass' | 'warn' | 'fail';

export interface ComplianceResult {
  field: string;     // 相关字段
  rule: string;      // 规范条文
  status: ComplianceStatus;
  message: string;   // 说明
  suggestion?: string; // 修正建议
}

// ─── 通用辅助 (构造规则已集中到 construction-rules.ts) ───

// ─── 梁合规性校验 ───

export function checkBeamCompliance(p: BeamParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const top = parseRebar(p.top);
  const bot = parseRebarBottom(p.bottom);
  const stir = parseStirrup(p.stirrup);
  const cover = p.cover || 25;

  const ft = FT[p.concreteGrade] || 1.43;
  const fyTop = FY[top.grade] || 360;
  const fyBot = FY[bot.grade] || 360;

  // 1. 配筋率校验 GB50010 §8.5.1 (多排钢筋取合力点)
  const { h0: h0Top } = calcEffectiveDepth(p.h, cover, stir.diameter, top.diameter, top.count, top.rows, top.perRow, top.segments);
  const { h0: h0Bot } = calcEffectiveDepth(p.h, cover, stir.diameter, bot.diameter, bot.count, bot.rows, bot.perRow, bot.segments);
  const segArea = (segs: {count:number;diameter:number}[]) => segs.reduce((s, seg) => s + seg.count * rebarArea(seg.diameter), 0);
  const AsTop = top.segments ? segArea(top.segments) : top.count * rebarArea(top.diameter);
  const AsBot = bot.segments ? segArea(bot.segments) : bot.count * rebarArea(bot.diameter);
  const rhoTop = AsTop / (p.b * h0Top);
  const rhoBot = AsBot / (p.b * h0Bot);
  const rhoMinTop = beamRhoMin(ft, fyTop);
  const rhoMinBot = beamRhoMin(ft, fyBot);
  const rhoMax = BEAM_RHO_MAX;

  if (rhoTop < rhoMinTop) {
    const minAs = Math.ceil(rhoMinTop * p.b * h0Top);
    results.push({
      field: 'top', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `上部筋配筋率 ${(rhoTop * 100).toFixed(2)}% < 最小配筋率 ${(rhoMinTop * 100).toFixed(2)}%`,
      suggestion: `建议增大上部筋面积，最小需 ${minAs}mm²`,
    });
  }
  if (rhoBot < rhoMinBot) {
    const minAs = Math.ceil(rhoMinBot * p.b * h0Bot);
    results.push({
      field: 'bottom', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `下部筋配筋率 ${(rhoBot * 100).toFixed(2)}% < 最小配筋率 ${(rhoMinBot * 100).toFixed(2)}%`,
      suggestion: `建议增大下部筋面积，最小需 ${minAs}mm²`,
    });
  }
  if (rhoTop > rhoMax) {
    results.push({
      field: 'top', rule: 'GB50010 §8.5.1',
      status: 'warn',
      message: `上部筋配筋率 ${(rhoTop * 100).toFixed(2)}% > 2.5%，超筋`,
      suggestion: '建议增大截面尺寸或降低钢筋面积',
    });
  }
  if (rhoBot > rhoMax) {
    results.push({
      field: 'bottom', rule: 'GB50010 §8.5.1',
      status: 'warn',
      message: `下部筋配筋率 ${(rhoBot * 100).toFixed(2)}% > 2.5%，超筋`,
      suggestion: '建议增大截面尺寸或降低钢筋面积',
    });
  }

  // 2. 箍筋加密区间距校验
  const maxDense = maxStirrupSpacingDense(p.seismicGrade, Math.min(top.diameter, bot.diameter));
  if (stir.spacingDense > maxDense) {
    results.push({
      field: 'stirrup', rule: 'GB50011 §6.3.3',
      status: 'fail',
      message: `箍筋加密区间距 ${stir.spacingDense}mm > 允许最大 ${maxDense}mm（${p.seismicGrade}）`,
      suggestion: `建议将加密区间距改为 ≤${maxDense}mm`,
    });
  }

  // 3. 箍筋最小直径
  const minStirDia = minStirrupDiameter(p.seismicGrade);
  if (stir.diameter < minStirDia) {
    results.push({
      field: 'stirrup', rule: 'GB50011 §6.3.3',
      status: 'fail',
      message: `箍筋直径 ${stir.diameter}mm < 最小要求 ${minStirDia}mm（${p.seismicGrade}）`,
      suggestion: `建议箍筋直径改为 ≥${minStirDia}mm`,
    });
  }

  // 4. 纵筋最少根数（截面宽>200mm 时上部至少2根）
  if (top.count < BEAM_MIN_THROUGH_BAR_COUNT) {
    results.push({
      field: 'top', rule: '22G101 构造要求',
      status: 'fail',
      message: `上部通长筋不应少于${BEAM_MIN_THROUGH_BAR_COUNT}根`,
      suggestion: `建议配置至少${BEAM_MIN_THROUGH_BAR_COUNT}根上部通长筋`,
    });
  }
  if (bot.count < BEAM_MIN_THROUGH_BAR_COUNT) {
    results.push({
      field: 'bottom', rule: '22G101 构造要求',
      status: 'fail',
      message: `下部通长筋不应少于${BEAM_MIN_THROUGH_BAR_COUNT}根`,
      suggestion: `建议配置至少${BEAM_MIN_THROUGH_BAR_COUNT}根下部通长筋`,
    });
  }

  // 5. 梁高 hw > 450 时需配腰筋 GB50010 §9.2.13
  const hw = p.h - 2 * cover;
  if (hw > SIDE_BAR_REQUIRED_HW && !p.sideBar) {
    results.push({
      field: 'sideBar', rule: 'GB50010 §9.2.13',
      status: 'warn',
      message: `腹板高度 ${hw}mm > 450mm，宜配置构造腰筋`,
      suggestion: '建议添加构造腰筋，如 G4C12',
    });
  }

  // 合规则返回一个 pass
  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50010', status: 'pass', message: '梁配筋满足规范要求' });
  }

  return results;
}

// ─── 柱合规性校验 ───

export function checkColumnCompliance(p: ColumnParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const stir = parseStirrup(p.stirrup);

  // Resolve bars using 22G101-1 detailed or legacy notation
  const coverMm = p.cover || 25;
  const innerW = p.b - 2 * coverMm;
  const innerH = p.h - 2 * coverMm;
  const resolved = resolveColumnBars(p.main, p.cornerMain, p.bMiddleMain, p.hMiddleMain, innerW, innerH);

  // 1. 柱纵筋配筋率 GB50010 §8.5.1: ρmin 取决于抗震等级
  const Ag = p.b * p.h;
  const AsMain = resolved.bars.reduce((sum, bar) => sum + rebarArea(bar.diameter), 0);
  const rho = AsMain / Ag;
  const rhoMin = COLUMN_RHO_MIN[p.seismicGrade] || 0.006;
  const rhoMax = COLUMN_RHO_MAX;

  if (rho < rhoMin) {
    const minAs = Math.ceil(rhoMin * Ag);
    results.push({
      field: 'main', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `柱纵筋配筋率 ${(rho * 100).toFixed(2)}% < 最小 ${(rhoMin * 100).toFixed(1)}%（${p.seismicGrade}）`,
      suggestion: `建议增大纵筋面积，最小需 ${minAs}mm²`,
    });
  }
  if (rho > rhoMax) {
    results.push({
      field: 'main', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `柱纵筋配筋率 ${(rho * 100).toFixed(2)}% > 5%，不满足规范上限`,
      suggestion: '建议增大柱截面尺寸或减少纵筋',
    });
  }

  // 2. 纵筋最小直径 GB50010 §8.5.1
  const minMainDia = columnMinMainDiameter(p.seismicGrade);
  const minBarDia = Math.min(...resolved.bars.map(b => b.diameter));
  if (minBarDia < minMainDia) {
    results.push({
      field: 'main', rule: 'GB50010 §8.5.1',
      status: 'warn',
      message: `柱纵筋最小直径 ${minBarDia}mm < 建议最小 ${minMainDia}mm（${p.seismicGrade}）`,
      suggestion: `建议纵筋直径 ≥${minMainDia}mm`,
    });
  }

  // 3. 纵筋最少根数: 矩形截面每侧≥2根
  if (resolved.totalCount < COLUMN_MIN_MAIN_BAR_COUNT) {
    results.push({
      field: 'main', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `柱纵筋 ${resolved.totalCount} 根 < 最少${COLUMN_MIN_MAIN_BAR_COUNT}根（矩形截面每侧至少2根）`,
      suggestion: `建议至少配置${COLUMN_MIN_MAIN_BAR_COUNT}根纵筋`,
    });
  }

  // 4. 箍筋要求
  const minStirDia = minStirrupDiameter(p.seismicGrade);
  if (stir.diameter < minStirDia) {
    results.push({
      field: 'stirrup', rule: 'GB50011 §6.3.7',
      status: 'fail',
      message: `箍筋直径 ${stir.diameter}mm < 最小要求 ${minStirDia}mm（${p.seismicGrade}）`,
      suggestion: `建议箍筋直径改为 ≥${minStirDia}mm`,
    });
  }

  // 5. 22G101-1 分项标注额外校验
  if (resolved.isDetailed) {
    // 角筋必须为4根
    if (resolved.corner.count !== 4) {
      results.push({
        field: 'cornerMain', rule: '22G101-1',
        status: 'warn',
        message: `角筋数量 ${resolved.corner.count} ≠ 4根，矩形截面角筋应为4根`,
        suggestion: '建议角筋标注为 4CXX',
      });
    }
    // 中部筋直径不应大于角筋
    if (resolved.bMiddle && resolved.bMiddle.diameter > resolved.corner.diameter) {
      results.push({
        field: 'bMiddleMain', rule: '22G101-1',
        status: 'warn',
        message: `b边中部筋直径 Φ${resolved.bMiddle.diameter} > 角筋 Φ${resolved.corner.diameter}`,
        suggestion: '中部筋直径一般不大于角筋直径',
      });
    }
    if (resolved.hMiddle && resolved.hMiddle.diameter > resolved.corner.diameter) {
      results.push({
        field: 'hMiddleMain', rule: '22G101-1',
        status: 'warn',
        message: `h边中部筋直径 Φ${resolved.hMiddle.diameter} > 角筋 Φ${resolved.corner.diameter}`,
        suggestion: '中部筋直径一般不大于角筋直径',
      });
    }
  }

  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50010', status: 'pass', message: '柱配筋满足规范要求' });
  }

  return results;
}

// ─── 板合规性校验 ───

export function checkSlabCompliance(p: SlabParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const bx = parseSlabRebar(p.bottomX);
  const by = parseSlabRebar(p.bottomY);

  // 1. 最小板厚 GB50010 §9.1.2
  const minThickness = SLAB_MIN_THICKNESS;
  if (p.thickness < minThickness) {
    results.push({
      field: 'thickness', rule: 'GB50010 §9.1.2',
      status: 'fail',
      message: `板厚 ${p.thickness}mm < 最小 ${minThickness}mm`,
      suggestion: `建议板厚 ≥${minThickness}mm`,
    });
  }

  // 2. 板配筋率校验 (按 1000mm 宽度计算)
  const cover = p.cover || 15;
  const h0x = p.thickness - cover - bx.diameter / 2;
  const h0y = p.thickness - cover - bx.diameter - by.diameter / 2;
  const AsX = Math.ceil(1000 / bx.spacing) * rebarArea(bx.diameter);
  const AsY = Math.ceil(1000 / by.spacing) * rebarArea(by.diameter);
  const rhoX = AsX / (1000 * h0x);
  const rhoY = AsY / (1000 * h0y);

  const ft = FT[p.concreteGrade] || 1.43;
  const fy = FY[bx.grade] || 360;
  const rhoMin = Math.max(0.002, 0.45 * ft / fy);

  if (rhoX < rhoMin) {
    results.push({
      field: 'bottomX', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `X向底筋配筋率 ${(rhoX * 100).toFixed(2)}% < 最小 ${(rhoMin * 100).toFixed(2)}%`,
      suggestion: '建议减小间距或增大直径',
    });
  }
  if (rhoY < rhoMin) {
    results.push({
      field: 'bottomY', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `Y向底筋配筋率 ${(rhoY * 100).toFixed(2)}% < 最小 ${(rhoMin * 100).toFixed(2)}%`,
      suggestion: '建议减小间距或增大直径',
    });
  }

  // 3. 间距校验: ≤ 200mm (板厚≤150) 或 ≤ 1.5h (板厚>150)
  const maxSpacing = slabMaxBarSpacing(p.thickness);
  if (bx.spacing > maxSpacing) {
    results.push({
      field: 'bottomX', rule: 'GB50010 §9.1.3',
      status: 'warn',
      message: `X向底筋间距 ${bx.spacing}mm > 建议最大 ${maxSpacing}mm`,
      suggestion: `建议间距 ≤${maxSpacing}mm`,
    });
  }
  if (by.spacing > maxSpacing) {
    results.push({
      field: 'bottomY', rule: 'GB50010 §9.1.3',
      status: 'warn',
      message: `Y向底筋间距 ${by.spacing}mm > 建议最大 ${maxSpacing}mm`,
      suggestion: `建议间距 ≤${maxSpacing}mm`,
    });
  }

  // 4. 板跨厚比校验 — GB50010 §9.1.2
  const lMin = Math.min(p.spanX, p.spanY);
  const isTwoWay = p.spanX / p.spanY <= 2 && p.spanY / p.spanX <= 2;
  const spanThLimit = slabSpanThicknessLimit(p.supportType, isTwoWay);
  const spanThRatio = lMin / p.thickness;
  if (spanThRatio > spanThLimit) {
    results.push({
      field: 'thickness', rule: 'GB50010 §9.1.2',
      status: 'warn',
      message: `板跨厚比 ${spanThRatio.toFixed(1)} > 限值 ${spanThLimit} (lmin=${lMin}mm / h=${p.thickness}mm)`,
      suggestion: `建议增大板厚或减小板跨`,
    });
  }

  // 5. 分布筋校验 — GB50010 §9.1.6
  if (p.distribution) {
    const dist = parseSlabRebar(p.distribution);
    if (dist.diameter < SLAB_DIST_MIN_DIAMETER) {
      results.push({
        field: 'distribution', rule: 'GB50010 §9.1.6',
        status: 'fail',
        message: `分布筋 Φ${dist.diameter} < 最小 ${SLAB_DIST_MIN_DIAMETER}mm`,
        suggestion: `分布筋直径不应小于 ${SLAB_DIST_MIN_DIAMETER}mm`,
      });
    }
    if (dist.spacing > SLAB_DIST_MAX_SPACING) {
      results.push({
        field: 'distribution', rule: 'GB50010 §9.1.6',
        status: 'fail',
        message: `分布筋间距 ${dist.spacing}mm > ${SLAB_DIST_MAX_SPACING}mm`,
        suggestion: `分布筋间距不应大于 ${SLAB_DIST_MAX_SPACING}mm`,
      });
    }
  }

  // 6. 支座负筋校验 — 22G101
  if (p.supportType === 'continuous') {
    if (!p.supportNegX && !p.supportNegY) {
      results.push({
        field: 'supportNegX', rule: '22G101',
        status: 'warn',
        message: '连续板宜配置支座负筋',
        suggestion: '建议在连续支座处设置负筋，伸入跨中 ln/4',
      });
    }
  }

  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50010 / 22G101', status: 'pass', message: '板配筋满足规范要求' });
  }

  return results;
}

// ─── 剪力墙合规性校验 ───

export function checkShearWallCompliance(p: ShearWallParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const vert = parseSlabRebar(p.vertBar);
  const horiz = parseSlabRebar(p.horizBar);
  const boundaryR = parseRebar(p.boundaryMain);

  // 1. 分布筋配筋率 GB50010 §11.7.12: 竖向/水平均 ≥ 0.25%
  const rhoVert = (2 * Math.ceil(p.lw / vert.spacing) * rebarArea(vert.diameter)) / (p.bw * p.lw);
  const rhoHoriz = (2 * Math.ceil(p.hw / horiz.spacing) * rebarArea(horiz.diameter)) / (p.bw * p.hw);
  const rhoMinWall = WALL_RHO_MIN;

  if (rhoVert < rhoMinWall) {
    results.push({
      field: 'vertBar', rule: 'GB50010 §11.7.12',
      status: 'fail',
      message: `竖向分布筋配筋率 ${(rhoVert * 100).toFixed(3)}% < 最小 0.25%`,
      suggestion: '建议减小间距或增大直径',
    });
  }
  if (rhoHoriz < rhoMinWall) {
    results.push({
      field: 'horizBar', rule: 'GB50010 §11.7.12',
      status: 'fail',
      message: `水平分布筋配筋率 ${(rhoHoriz * 100).toFixed(3)}% < 最小 0.25%`,
      suggestion: '建议减小间距或增大直径',
    });
  }

  // 2. 分布筋间距 ≤ 300mm
  if (vert.spacing > WALL_DIST_MAX_SPACING) {
    results.push({
      field: 'vertBar', rule: 'GB50010 §11.7.12',
      status: 'warn',
      message: `竖向分布筋间距 ${vert.spacing}mm > ${WALL_DIST_MAX_SPACING}mm`,
      suggestion: `建议间距 ≤${WALL_DIST_MAX_SPACING}mm`,
    });
  }
  if (horiz.spacing > WALL_DIST_MAX_SPACING) {
    results.push({
      field: 'horizBar', rule: 'GB50010 §11.7.12',
      status: 'warn',
      message: `水平分布筋间距 ${horiz.spacing}mm > ${WALL_DIST_MAX_SPACING}mm`,
      suggestion: `建议间距 ≤${WALL_DIST_MAX_SPACING}mm`,
    });
  }

  // 3. 分布筋最小直径
  if (vert.diameter < WALL_DIST_MIN_DIAMETER) {
    results.push({
      field: 'vertBar', rule: 'GB50010 §11.7.12',
      status: 'warn',
      message: `竖向分布筋直径 ${vert.diameter}mm < 建议最小 ${WALL_DIST_MIN_DIAMETER}mm`,
    });
  }

  // 4. 边缘构件纵筋最少根数
  if (boundaryR.count < WALL_BOUNDARY_MIN_BAR_COUNT) {
    results.push({
      field: 'boundaryMain', rule: 'GB50010 §11.7.14',
      status: 'fail',
      message: `边缘构件纵筋 ${boundaryR.count} 根 < 最少${WALL_BOUNDARY_MIN_BAR_COUNT}根`,
      suggestion: `建议至少配置${WALL_BOUNDARY_MIN_BAR_COUNT}根边缘纵筋`,
    });
  }

  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50010', status: 'pass', message: '剪力墙配筋满足规范要求' });
  }

  return results;
}

// ─── 楼梯合规性校验 (22G101-2 AT/BT型) ───

export function checkStairCompliance(p: StairParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const botR = parseSlabRebar(p.bottomBar);
  const distR = parseSlabRebar(p.distBar);
  const cover = p.cover || 15;

  const isBT = p.stairType === 'BT';
  const totalRise = p.stepCount * p.stepHeight;
  const totalRun = p.stepCount * p.stepWidth;
  const slopeLen = Math.sqrt(totalRise * totalRise + totalRun * totalRun);
  const botFlatLen = isBT ? (p.botFlatLen ?? 700) : 0;
  const slabLen = isBT ? slopeLen + botFlatLen : slopeLen;

  // 1. 踏步舒适度: 2h + b ≈ 600mm (550~650)
  const comfortVal = 2 * p.stepHeight + p.stepWidth;
  if (comfortVal < STAIR_COMFORT.min || comfortVal > STAIR_COMFORT.max) {
    results.push({
      field: 'stepHeight/stepWidth',
      rule: 'GB50352 §6.7.7',
      status: comfortVal < 500 || comfortVal > 700 ? 'fail' : 'warn',
      message: `踏步舒适度 2h+b = ${comfortVal}mm，宜在 ${STAIR_COMFORT.min}~${STAIR_COMFORT.max}mm 范围`,
      suggestion: `调整踏步高 h=${p.stepHeight}mm 或踏步宽 b=${p.stepWidth}mm，使 2h+b ≈ ${STAIR_COMFORT.target}mm`,
    });
  }

  // 2. 踏步高度限值: 住宅 ≤175mm，公共 ≤150mm (取宽松标准)
  if (p.stepHeight > STAIR_STEP_HEIGHT.max) {
    results.push({
      field: 'stepHeight', rule: 'GB50352 §6.7.7',
      status: 'fail',
      message: `踏步高 ${p.stepHeight}mm > ${STAIR_STEP_HEIGHT.max}mm (绝对上限)`,
      suggestion: '住宅楼梯踏步高宜 ≤175mm，公建宜 ≤150mm',
    });
  } else if (p.stepHeight > STAIR_STEP_HEIGHT.warn) {
    results.push({
      field: 'stepHeight', rule: 'GB50352 §6.7.7',
      status: 'warn',
      message: `踏步高 ${p.stepHeight}mm > ${STAIR_STEP_HEIGHT.warn}mm (住宅推荐上限)`,
      suggestion: `建议踏步高 ≤${STAIR_STEP_HEIGHT.warn}mm`,
    });
  }

  // 3. 踏步宽度最小值: 住宅 ≥260mm
  if (p.stepWidth < STAIR_STEP_WIDTH.min) {
    results.push({
      field: 'stepWidth', rule: 'GB50352 §6.7.7',
      status: 'fail',
      message: `踏步宽 ${p.stepWidth}mm < ${STAIR_STEP_WIDTH.min}mm (绝对下限)`,
      suggestion: '住宅楼梯踏步宽宜 ≥260mm',
    });
  } else if (p.stepWidth < STAIR_STEP_WIDTH.warn) {
    results.push({
      field: 'stepWidth', rule: 'GB50352 §6.7.7',
      status: 'warn',
      message: `踏步宽 ${p.stepWidth}mm < ${STAIR_STEP_WIDTH.warn}mm (住宅推荐下限)`,
      suggestion: `建议踏步宽 ≥${STAIR_STEP_WIDTH.warn}mm`,
    });
  }

  // 4. 梯板厚度: 宜取 L/25 ~ L/30 (L为梯板斜长)
  const { min: tMin, max: tMax } = stairSlabThicknessRange(slabLen);
  if (p.slabThickness < tMin * 0.85) {
    results.push({
      field: 'slabThickness', rule: '22G101-2 构造',
      status: 'fail',
      message: `梯板厚 ${p.slabThickness}mm 偏小，斜长 ${Math.round(slabLen)}mm，建议 ${tMin}~${tMax}mm (L/30~L/25)`,
      suggestion: `建议梯板厚度 ≥ ${tMin}mm`,
    });
  } else if (p.slabThickness < tMin) {
    results.push({
      field: 'slabThickness', rule: '22G101-2 构造',
      status: 'warn',
      message: `梯板厚 ${p.slabThickness}mm 接近下限，建议 ${tMin}~${tMax}mm (L/30~L/25)`,
    });
  }

  // 5. 下部纵筋直径检查: AT型板式楼梯受力筋宜 ≥8mm
  if (botR.diameter < STAIR_MIN_BAR_DIAMETER) {
    results.push({
      field: 'bottomBar', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `下部纵筋 Φ${botR.diameter} < ${STAIR_MIN_BAR_DIAMETER}mm (板受力筋最小直径)`,
      suggestion: `建议纵筋直径 ≥${STAIR_MIN_BAR_DIAMETER}mm`,
    });
  }

  // 6. 下部纵筋间距
  if (botR.spacing > STAIR_BAR_SPACING.max) {
    results.push({
      field: 'bottomBar', rule: 'GB50010 §9.1.3',
      status: 'fail',
      message: `下部纵筋间距 ${botR.spacing}mm > ${STAIR_BAR_SPACING.max}mm`,
      suggestion: `板受力钢筋间距不应大于 ${STAIR_BAR_SPACING.max}mm`,
    });
  }
  if (botR.spacing < STAIR_BAR_SPACING.min) {
    results.push({
      field: 'bottomBar', rule: 'GB50010 §9.1.3',
      status: 'warn',
      message: `下部纵筋间距 ${botR.spacing}mm < ${STAIR_BAR_SPACING.min}mm，施工困难`,
      suggestion: `建议间距不小于 ${STAIR_BAR_SPACING.min}mm`,
    });
  }

  // 7. 分布筋要求
  if (distR.diameter < SLAB_DIST_MIN_DIAMETER) {
    results.push({
      field: 'distBar', rule: 'GB50010 §9.1.6',
      status: 'fail',
      message: `分布筋 Φ${distR.diameter} < ${SLAB_DIST_MIN_DIAMETER}mm (最小直径)`,
      suggestion: `分布筋直径不应小于 ${SLAB_DIST_MIN_DIAMETER}mm`,
    });
  }
  if (distR.spacing > SLAB_DIST_MAX_SPACING) {
    results.push({
      field: 'distBar', rule: 'GB50010 §9.1.6',
      status: 'fail',
      message: `分布筋间距 ${distR.spacing}mm > ${SLAB_DIST_MAX_SPACING}mm`,
      suggestion: `分布筋间距不应大于 ${SLAB_DIST_MAX_SPACING}mm`,
    });
  }

  // 8. 保护层厚度: 室内 15mm，室外 20mm
  if (cover < 15) {
    results.push({
      field: 'cover', rule: 'GB50010 §8.2.1',
      status: 'fail',
      message: `保护层 ${cover}mm < 15mm (板最小保护层)`,
      suggestion: '室内环境板最小保护层 15mm',
    });
  }

  // 9. 梯段宽度: 住宅 ≥1100mm (22G101-2 常用)
  if (p.flightWidth < STAIR_MIN_FLIGHT_WIDTH) {
    results.push({
      field: 'flightWidth', rule: 'GB50352 §6.7.5',
      status: 'warn',
      message: `梯段宽 ${p.flightWidth}mm < ${STAIR_MIN_FLIGHT_WIDTH}mm`,
      suggestion: '住宅楼梯梯段净宽宜 ≥1100mm',
    });
  }

  // 10. 上部纵筋伸入平台长度检查: 22G101-2 图示要求 ≥ ln/4
  const topExtend = Math.round(slabLen / 4);
  if (p.topPlatformLen < topExtend && p.botPlatformLen < topExtend) {
    results.push({
      field: 'topPlatformLen', rule: '22G101-2 页2-8',
      status: 'warn',
      message: `上部纵筋需伸入平台 ≥ ln/4 = ${topExtend}mm，请确保平台长度满足`,
      suggestion: `22G101-2: 上部纵筋从梯板端部伸入平台 ≥ ln/4`,
    });
  }

  // 11. BT型专属: 低端平板长校验
  if (isBT) {
    const minFlatLen = Math.max(p.beamB, Math.round(slabLen * 0.1));
    if (botFlatLen < minFlatLen) {
      results.push({
        field: 'botFlatLen', rule: '22G101-2 BT型构造',
        status: 'warn',
        message: `低端平板长 ${botFlatLen}mm 偏短，建议 ≥ ${minFlatLen}mm (梯梁宽与板跨1/10取大值)`,
        suggestion: `22G101-2 BT型: 低端平板长宜 ≥ max(b梁, ln/10) = ${minFlatLen}mm`,
      });
    }
    // BT型: 低端锚固验证 ≥5d 且 ≥b/2
    const bot5d = 5 * botR.diameter;
    const halfBeamB = p.beamB / 2;
    if (bot5d > p.beamB) {
      results.push({
        field: 'bottomBar', rule: '22G101-2 BT型 页2-10',
        status: 'warn',
        message: `下部纵筋5d = ${bot5d}mm > 梯梁宽 ${p.beamB}mm，低端锚固空间不足`,
        suggestion: `增大梯梁宽度或减小纵筋直径，确保锚固长度满足 max(b/2, 5d) = max(${halfBeamB}, ${bot5d})mm`,
      });
    }
  }

  if (results.length === 0) {
    results.push({ field: '-', rule: '22G101-2 & GB50010', status: 'pass', message: `${p.stairType}型楼梯配筋满足规范要求` });
  }

  return results;
}

// ─── 基础族合规性校验 (22G101-3) ───

export function checkFoundationCompliance(p: FoundationParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const cover = p.cover || 40;
  const barX = parseSlabRebar(p.bottomBarX);
  const barY = parseSlabRebar(p.bottomBarY);

  if (cover < 40) {
    results.push({
      field: 'cover', rule: 'GB50010 §8.2.1',
      status: 'warn',
      message: `保护层 ${cover}mm < 建议最小 40mm（有垫层独立基础）`,
      suggestion: '建议独立基础保护层按 40mm 或更大值取值',
    });
  }

  for (const [field, bar] of [['bottomBarX', barX], ['bottomBarY', barY]] as const) {
    if (bar.diameter < 10) {
      results.push({
        field, rule: '22G101-3 独立基础构造',
        status: 'fail',
        message: `${field === 'bottomBarX' ? 'X向' : 'Y向'}底筋直径 Φ${bar.diameter} < 建议最小 Φ10`,
        suggestion: '建议底筋直径不小于 Φ10',
      });
    }
    if (bar.spacing > 200) {
      results.push({
        field, rule: '22G101-3 独立基础构造',
        status: 'warn',
        message: `${field === 'bottomBarX' ? 'X向' : 'Y向'}底筋间距 ${bar.spacing}mm > 常用上限 200mm`,
        suggestion: '建议减小间距或增大钢筋直径',
      });
    }
  }

  const colR = parseRebar(p.colMain);
  const laE = calcLaE(colR.grade, colR.diameter, p.concreteGrade, p.seismicGrade || '三级');
  const anchor = determineColFoundAnchor(p.h, cover, colR.diameter, laE);
  results.push(anchor.canStraight
    ? { field: 'colMain', rule: '22G101-3 §2-10', status: 'pass', message: `柱插筋可直锚，laE=${laE}mm，可用深度=${p.h - cover}mm` }
    : { field: 'colMain', rule: '22G101-3 §2-10', status: 'warn', message: `柱插筋需弯锚，laE=${laE}mm > 可用深度=${p.h - cover}mm`, suggestion: `建议按底弯 ${anchor.bendLength}mm、直段 ≥${anchor.straightPortion}mm 处理` });

  if ((p.columnCount || 1) === 2 && (!p.topBarX || !p.topBarY)) {
    results.push({
      field: 'topBarX/topBarY', rule: '22G101-3 §2-12',
      status: 'warn',
      message: '双柱独立基础未完整设置顶部柱间钢筋',
      suggestion: '建议明确顶部纵向受力筋和分布筋',
    });
  }

  if ((p.columnCount || 1) === 2 && p.hasFoundationBeam && (!p.foundationBeamBottom || !p.foundationBeamTop || !p.foundationBeamStirrup)) {
    results.push({
      field: 'foundationBeam', rule: '22G101-3 §2-13',
      status: 'warn',
      message: '已启用基础梁，但梁底筋、顶筋或箍筋参数不完整',
      suggestion: '建议补全基础梁底筋、顶筋和箍筋',
    });
  }

  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50010/22G101-3', status: 'pass', message: '独立基础配筋满足当前校验规则' });
  }
  return results;
}

export function checkStripFoundationCompliance(p: StripFoundationParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const cover = p.cover || 40;
  const bottom = parseSlabRebar(p.bottomBar);
  const dist = parseSlabRebar(p.distBar);

  if (cover < 40) {
    results.push({
      field: 'cover', rule: 'GB50010 §8.2.1',
      status: 'warn',
      message: `条基保护层 ${cover}mm < 建议最小 40mm`,
      suggestion: '建议条形基础保护层按基础构件要求校核',
    });
  }
  if (bottom.diameter < 10) {
    results.push({
      field: 'bottomBar', rule: '22G101-3 条形基础构造',
      status: 'fail',
      message: `底部横向受力筋直径 Φ${bottom.diameter} < 建议最小 Φ10`,
      suggestion: '建议底部横向受力筋直径不小于 Φ10',
    });
  }
  if (bottom.spacing > 200) {
    results.push({
      field: 'bottomBar', rule: '22G101-3 条形基础构造',
      status: 'warn',
      message: `底部横向受力筋间距 ${bottom.spacing}mm > 常用上限 200mm`,
      suggestion: '建议减小间距或增大直径',
    });
  }
  if (dist.spacing > 250) {
    results.push({
      field: 'distBar', rule: '22G101-3 条形基础构造',
      status: 'warn',
      message: `底部分布筋间距 ${dist.spacing}mm > 常用上限 250mm`,
      suggestion: '建议分布筋间距 ≤250mm',
    });
  }
  if (p.supportCount === 2 && (!p.topBar || !p.topDistBar)) {
    results.push({
      field: 'topBar/topDistBar', rule: '22G101-3 第1-19~1-20页',
      status: 'warn',
      message: '双梁/双墙条基未完整设置两支承之间的顶部钢筋',
      suggestion: '建议明确 T 筋和顶部分布筋',
    });
  }
  if (p.supportCount === 2 && !p.supportSpacing) {
    results.push({
      field: 'supportSpacing', rule: '22G101-3 第1部分',
      status: 'fail',
      message: '双梁/双墙条基缺少支承中心距',
      suggestion: '建议补充两支承中心距，便于读取顶部钢筋范围',
    });
  }
  if (p.supportType === 'beam' && (!p.jlBottom || !p.jlTop || !p.jlStirrup)) {
    results.push({
      field: 'jl', rule: '22G101-3 第2-23~2-28页',
      status: 'warn',
      message: '当前条基为梁支承，但 JL 主梁细部筋信息不完整',
      suggestion: '建议补充 JL 底筋、顶筋和箍筋，便于识图和对比',
    });
  }
  if (p.hasJcl && (!p.jclBottom || !p.jclTop || !p.jclStirrup || !p.jclB || !p.jclH)) {
    results.push({
      field: 'jcl', rule: '22G101-3 第2-29~2-31页',
      status: 'warn',
      message: '已启用 JCL 次梁，但截面或配筋信息不完整',
      suggestion: '建议补充 JCL 宽高、纵筋和箍筋参数',
    });
  }
  if (p.hasLocalOverride) {
    if (!p.localOverrideLength || !p.localOverrideStart && p.localOverrideStart !== 0) {
      results.push({
        field: 'localOverride', rule: '22G101-3 第1-20页',
        status: 'warn',
        message: '已启用原位修正，但起点或长度未完整填写',
        suggestion: '建议明确原位修正段起点和长度',
      });
    } else if ((p.localOverrideStart || 0) + (p.localOverrideLength || 0) > p.length) {
      results.push({
        field: 'localOverride', rule: '22G101-3 第1-20页',
        status: 'fail',
        message: '原位修正段超出条形基础总长度',
        suggestion: '建议调整原位修正起点或长度，使其落在条基范围内',
      });
    }
  }
  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50010/22G101-3', status: 'pass', message: '条形基础配筋满足当前校验规则' });
  }
  return results;
}

export function checkPileCapCompliance(p: PileCapParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const cover = p.cover || 50;
  const barX = parseSlabRebar(p.bottomBarX);
  const barY = parseSlabRebar(p.bottomBarY);

  if (cover < 50) {
    results.push({
      field: 'cover', rule: 'GB50010 §8.2.1',
      status: 'warn',
      message: `承台保护层 ${cover}mm < 建议最小 50mm`,
      suggestion: '建议承台保护层按基础构件要求校核',
    });
  }
  if (p.h < Math.max(500, p.pileDiameter)) {
    results.push({
      field: 'h', rule: '22G101-3 承台构造',
      status: 'warn',
      message: `承台高度 ${p.h}mm < max(500, 桩径${p.pileDiameter}mm)`,
      suggestion: '建议承台高度不小于桩径且不小于 500mm',
    });
  }
  for (const [field, bar] of [['bottomBarX', barX], ['bottomBarY', barY]] as const) {
    if (bar.diameter < 10) {
      results.push({
        field, rule: '22G101-3 承台构造',
        status: 'fail',
        message: `${field === 'bottomBarX' ? 'X向' : 'Y向'}底筋直径 Φ${bar.diameter} < 建议最小 Φ10`,
        suggestion: '建议承台底筋直径不小于 Φ10',
      });
    }
    if (bar.spacing > 200) {
      results.push({
        field, rule: '22G101-3 承台构造',
        status: 'warn',
        message: `${field === 'bottomBarX' ? 'X向' : 'Y向'}底筋间距 ${bar.spacing}mm > 常用上限 200mm`,
        suggestion: '建议减小间距或增大直径',
      });
    }
  }
  const colR = parseRebar(p.colMain);
  const laE = calcLaE(colR.grade, colR.diameter, p.concreteGrade, p.seismicGrade || '三级');
  const anchor = determineColFoundAnchor(p.h, cover, colR.diameter, laE);
  results.push(anchor.canStraight
    ? { field: 'colMain', rule: '22G101-3 §2-10', status: 'pass', message: `柱插筋可直锚，laE=${laE}mm，可用深度=${p.h - cover}mm` }
    : { field: 'colMain', rule: '22G101-3 §2-10', status: 'warn', message: `柱插筋需弯锚，laE=${laE}mm > 可用深度=${p.h - cover}mm`, suggestion: `建议按底弯 ${anchor.bendLength}mm 处理` });

  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50010/22G101-3', status: 'pass', message: '承台配筋满足当前校验规则' });
  }
  return results;
}

// ─── 筏板基础合规性校验 (GB50007 / GB50010 / 22G101-3) ───

export function checkRaftCompliance(p: RaftFoundationParams): ComplianceResult[] {
  const results: ComplianceResult[] = [];
  const botX = parseSlabRebar(p.bottomBarX);
  const botY = parseSlabRebar(p.bottomBarY);
  const cover = p.cover || 40;

  // 1. 最小板厚: 筏板厚度一般 ≥ 300mm (GB50007 §8.4.2)
  if (p.h < 300) {
    results.push({
      field: 'h', rule: 'GB50007 §8.4.2',
      status: 'fail',
      message: `筏板厚度 ${p.h}mm < 最小 300mm`,
      suggestion: '建议筏板厚度 ≥300mm',
    });
  }

  // 2. 底筋最小直径 ≥ 10mm (GB50010 §9.5.1)
  if (botX.diameter < 10) {
    results.push({
      field: 'bottomBarX', rule: 'GB50010 §9.5.1',
      status: 'fail',
      message: `X向底筋直径 Φ${botX.diameter} < 最小 Φ10`,
      suggestion: '建议底筋直径 ≥Φ10',
    });
  }
  if (botY.diameter < 10) {
    results.push({
      field: 'bottomBarY', rule: 'GB50010 §9.5.1',
      status: 'fail',
      message: `Y向底筋直径 Φ${botY.diameter} < 最小 Φ10`,
      suggestion: '建议底筋直径 ≥Φ10',
    });
  }

  // 3. 底筋间距 ≤ 200mm (GB50010 §9.5.1)
  if (botX.spacing > 200) {
    results.push({
      field: 'bottomBarX', rule: 'GB50010 §9.5.1',
      status: 'warn',
      message: `X向底筋间距 ${botX.spacing}mm > 建议最大 200mm`,
      suggestion: '建议底筋间距 ≤200mm',
    });
  }
  if (botY.spacing > 200) {
    results.push({
      field: 'bottomBarY', rule: 'GB50010 §9.5.1',
      status: 'warn',
      message: `Y向底筋间距 ${botY.spacing}mm > 建议最大 200mm`,
      suggestion: '建议底筋间距 ≤200mm',
    });
  }

  // 4. 底筋配筋率 ≥ 0.15% (GB50010 §8.5.1)
  const h0x = p.h - cover - botX.diameter / 2;
  const h0y = p.h - cover - botX.diameter - botY.diameter / 2;
  const AsX = Math.ceil(1000 / botX.spacing) * rebarArea(botX.diameter);
  const AsY = Math.ceil(1000 / botY.spacing) * rebarArea(botY.diameter);
  const rhoX = AsX / (1000 * h0x);
  const rhoY = AsY / (1000 * h0y);

  const ft = FT[p.concreteGrade] || 1.43;
  const fy = FY[botX.grade] || 360;
  const rhoMin = Math.max(0.0015, 0.45 * ft / fy);

  if (rhoX < rhoMin) {
    results.push({
      field: 'bottomBarX', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `X向底筋配筋率 ${(rhoX * 100).toFixed(3)}% < 最小 ${(rhoMin * 100).toFixed(3)}%`,
      suggestion: '建议减小间距或增大直径',
    });
  }
  if (rhoY < rhoMin) {
    results.push({
      field: 'bottomBarY', rule: 'GB50010 §8.5.1',
      status: 'fail',
      message: `Y向底筋配筋率 ${(rhoY * 100).toFixed(3)}% < 最小 ${(rhoMin * 100).toFixed(3)}%`,
      suggestion: '建议减小间距或增大直径',
    });
  }

  // 5. 保护层厚度: 有垫层 ≥ 40mm (GB50010 §8.2.1)
  if (cover < 40) {
    results.push({
      field: 'cover', rule: 'GB50010 §8.2.1',
      status: 'warn',
      message: `保护层厚度 ${cover}mm < 建议最小 40mm（有垫层）`,
      suggestion: '建议保护层 ≥40mm（有垫层）或 ≥70mm（无垫层）',
    });
  }

  // 6. 面筋校验 (如有)
  if (p.topBarX) {
    const topX = parseSlabRebar(p.topBarX);
    if (topX.diameter < 8) {
      results.push({
        field: 'topBarX', rule: 'GB50010 §9.5.1',
        status: 'warn',
        message: `X向面筋直径 Φ${topX.diameter} < 建议最小 Φ8`,
        suggestion: '建议面筋直径 ≥Φ8',
      });
    }
    if (topX.spacing > 200) {
      results.push({
        field: 'topBarX', rule: 'GB50010 §9.5.1',
        status: 'warn',
        message: `X向面筋间距 ${topX.spacing}mm > 建议最大 200mm`,
        suggestion: '建议面筋间距 ≤200mm',
      });
    }
  }

  // 7. 柱网合理性: 柱距不宜过大 (一般 ≤ 12m)
  if (p.colSpacingX > 12000) {
    results.push({
      field: 'colSpacingX', rule: 'GB50007 §8.4',
      status: 'warn',
      message: `X向柱距 ${p.colSpacingX}mm > 12000mm，跨度偏大`,
      suggestion: '建议柱距 ≤12000mm，或增大板厚',
    });
  }
  if (p.colSpacingY > 12000) {
    results.push({
      field: 'colSpacingY', rule: 'GB50007 §8.4',
      status: 'warn',
      message: `Y向柱距 ${p.colSpacingY}mm > 12000mm，跨度偏大`,
      suggestion: '建议柱距 ≤12000mm，或增大板厚',
    });
  }

  // 8. 板厚与跨度比校验: h ≥ max(colSpacingX, colSpacingY) / 12 (板式筏板)
  const maxSpan = Math.max(p.colSpacingX, p.colSpacingY);
  const hMin = Math.ceil(maxSpan / 12);
  if (p.h < hMin) {
    results.push({
      field: 'h', rule: 'GB50007 §8.4.2',
      status: 'warn',
      message: `板厚 ${p.h}mm < 最大跨度/12 = ${hMin}mm`,
      suggestion: `建议板厚 ≥${hMin}mm（板式筏板厚跨比 ≥1/12）`,
    });
  }

  // 9. 柱纵向钢筋在基础中构造 — 22G101-3
  const colR = parseRebar(p.colMain);
  const laE = calcLaE(colR.grade, colR.diameter, p.concreteGrade, p.seismicGrade);
  const anchor = determineColFoundAnchor(p.h, cover, colR.diameter, laE);

  // 9a. 锚固类型判定提示
  const scenarioLabels: Record<string, string> = {
    a: '(a) 保护层>5d, 高度满足直锚',
    b: '(b) 保护层≤5d, 高度满足直锚',
    c: '(c) 保护层>5d, 高度不满足直锚 → 弯锚',
    d: '(d) 保护层≤5d, 高度不满足直锚 → 弯锚',
  };
  if (!anchor.canStraight) {
    results.push({
      field: 'colMain', rule: '22G101-3',
      status: 'warn',
      message: `柱插筋需弯锚: ${scenarioLabels[anchor.scenario]}，laE=${laE}mm，可用深度=${p.h - cover}mm`,
      suggestion: `底弯 ${anchor.bendLength}mm (15d)，直段 ≥${anchor.straightPortion}mm (≥0.6laE 且 ≥20d)`,
    });
  } else {
    results.push({
      field: 'colMain', rule: '22G101-3',
      status: 'pass',
      message: `柱插筋直锚: ${scenarioLabels[anchor.scenario]}，laE=${laE}mm，底弯 ${anchor.bendLength}mm (max(6d,150))`,
    });
  }

  // 9b. 保护层 ≤ 5d 时需设横向锚固区钢筋
  if (!anchor.isCoverLarge) {
    results.push({
      field: 'cover', rule: '22G101-3 注3',
      status: 'warn',
      message: `保护层 ${cover}mm ≤ 5d=${5 * colR.diameter}mm，柱插筋外皮算起 ≤5d，需设锚固区横向钢筋`,
      suggestion: '锚固区应设置横向钢筋防止劈裂',
    });
  }

  // 9c. 锚固区箍筋要求
  results.push({
    field: 'colMain', rule: '22G101-3 注2',
    status: 'pass',
    message: `锚固区箍筋: ≥${COL_FOUND_STIRRUP_MIN_COUNT}道非复合箍，间距 ≤${COL_FOUND_STIRRUP_ZONE_SPACING_MAX}mm，箍筋 ≥Φ${anchor.stirrupMinDia}@${anchor.stirrupMaxSpacing}`,
  });

  // 9d. 简化锚固条件提示 (注4)
  if (p.h >= COL_FOUND_CORNER_ONLY_H_AXIAL) {
    results.push({
      field: 'colMain', rule: '22G101-3 注4',
      status: 'pass',
      message: `h=${p.h}mm ≥ 1200mm，轴心受压时可仅角筋伸至底板网片（柱纵筋间距 ≤1000mm），其余锚固在基础顶面下 laE`,
    });
  }

  if (results.length === 0) {
    results.push({ field: '-', rule: 'GB50007/GB50010/22G101-3', status: 'pass', message: '筏板基础配筋满足规范要求' });
  }

  return results;
}

// ─── 统一入口 ───

export function checkCompliance(
  componentType: ComponentType,
  params: BeamParams | ColumnParams | SlabParams | ShearWallParams | StairParams | FoundationParams | StripFoundationParams | PileCapParams | RaftFoundationParams | JointParams,
): ComplianceResult[] {
  const checks = ((): ComplianceResult[] => { switch (componentType) {
    case 'beam': return (params as BeamParams).beamKind === 'coupling'
      ? [{ field: '-', rule: '连梁检查范围', status: 'warn', message: '当前为普通连梁配筋示意，未套用框架梁通过结论；墙内锚固、跨高比、斜向钢筋与连梁抗剪需专项复核。' }]
      : checkBeamCompliance(params as BeamParams);
    case 'column': return checkColumnCompliance(params as ColumnParams);
    case 'slab': return checkSlabCompliance(params as SlabParams);
    case 'shearwall': return checkShearWallCompliance(params as ShearWallParams);
    case 'stair': return checkStairCompliance(params as StairParams);
    case 'foundation': return checkFoundationCompliance(params as FoundationParams);
    case 'stripfoundation': return checkStripFoundationCompliance(params as StripFoundationParams);
    case 'pilecap': return checkPileCapCompliance(params as PileCapParams);
    case 'raft': return checkRaftCompliance(params as RaftFoundationParams);
    case 'joint': return checkJointConstruction(params as JointParams);
    default: return [{ field: '-', rule: '-', status: 'warn', message: '该构件尚未接入构造检查' }];
  }
  })();
  return [...checks, ...checkConstructionModel(componentType, params)];
}

/** Basic geometric constraints only; joint force and anchorage checks require a full connection model. */
export function checkJointConstruction(p: JointParams): ComplianceResult[] {
  const results: ComplianceResult[] = [{ field: '-', rule: '检查范围', status: 'warn', message: '节点仅检查截面容纳条件；锚固、节点核心区抗剪与梁柱钢筋碰撞需结合完整节点复核。' }];
  if (p.beamB > p.colB) results.push({ field: 'beamB', rule: '几何容纳', status: 'warn', message: '梁宽大于柱宽，请复核梁筋在节点中的实际锚固路径。' });
  const c = p.cover || 25;
  if (2 * c >= Math.min(p.colB, p.colH, p.beamB, p.beamH)) results.push({ field: 'cover', rule: '几何容纳', status: 'fail', message: '保护层占满截面，无法容纳钢筋。' });
  return results;
}
