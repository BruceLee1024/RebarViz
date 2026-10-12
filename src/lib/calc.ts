import { wallDistributedReinforcement } from './wall-reinforcement';
import { wallOpening, overhangs, stripDistributedPositions, stripTransverseStations } from './quantity-geometry';
import { stairReinforcement } from './stair-reinforcement';
import { raftBeamArrangement, raftColumnStripPositions } from './raft-reinforcement';
import { bentHorizontalCurve, foundationBeamReinforcement } from './foundation-reinforcement';
import { calcLaTable } from './anchor';
import { slabBarPositions, slabReinforcement } from './slab-reinforcement';
import { columnSectionBars, columnHoopLayout, foundationInsertSpec } from './reinforcement-layout';
import { beamLongitudinalLayout, BEAM_BAR_NAMES } from './beam-longitudinal';
import { wallTiePositions } from './quantity-geometry';
import { parseRebar, parseRebarBottom, parseStirrup, parseSlabRebar, parseSideBar, parseTieBar, autoTieBar } from './rebar';
import { calcSupportRebarLength, calcLlE, calcBeamSideBarAnchor, calcLaE, FT, FY } from './anchor';
import { calcEffectiveDepth, resolveBarRowCounts } from './layout';
import type { BeamParams, ColumnParams, SlabParams, ShearWallParams, StairParams, FoundationParams, StripFoundationParams, PileCapParams, RaftFoundationParams } from './types';
import { rebarWeightPerM, beamDenseZoneLength, rebarArea, WASTE_RATE, bendAdjustment, determineColFoundAnchor, determinePileCapRebarEnd } from './construction-rules';
import { beamStirrupBarPositions, createCompositeStirrupSpec, createTieBarShapeSpec, resolveTieSideOffsetMm } from './rebar-shapes';

/** 钢筋理论重量 kg/m — 代理到 construction-rules */
function w(diameter: number): number {
  return rebarWeightPerM(diameter);
}

/** 生成锚固长度推导公式步骤 */
function anchorSteps(grade: string, dia: number, concreteGrade: string, seismicGrade: string): FormulaStep[] {
  const fy = FY[grade] || 360;
  const ft = FT[concreteGrade] || 1.43;
  const alpha = grade === 'A' ? 0.16 : 0.14;
  const lab = Math.ceil(alpha * (fy / ft) * dia);
  // GB50010 §8.3.1: 带肋钢筋 d>25mm ×1.1
  const isLargeDia = grade !== 'A' && dia > 25;
  const largeDiaFactor = isLargeDia ? 1.1 : 1.0;
  const la = Math.max(Math.ceil(lab * largeDiaFactor), 200, 10 * dia);
  const zetaAE = seismicGrade === '非抗震' ? 1.0 : 1.15;
  const laE = Math.max(Math.ceil(zetaAE * la), 200, 10 * dia);
  const steps: FormulaStep[] = [
    {
      label: '基本锚固长度 lab',
      formula: 'lab = α × (fy / ft) × d',
      substitution: `= ${alpha} × (${fy} / ${ft}) × ${dia}`,
      result: `= ${lab} mm`,
    },
    {
      label: '锚固长度 la',
      formula: isLargeDia ? 'la = ζa × lab × 1.1 (d>25修正) ≥ max(200, 10d)' : 'la = ζa × lab ≥ max(200, 10d)',
      substitution: isLargeDia
        ? `= 1.0 × ${lab} × 1.1，≥ max(200, ${10 * dia})`
        : `= 1.0 × ${lab}，≥ max(200, ${10 * dia})`,
      result: `= ${la} mm`,
    },
  ];
  if (seismicGrade !== '非抗震') {
    steps.push({
      label: '抗震锚固长度 laE',
      formula: 'laE = ζaE × la',
      substitution: `= ${zetaAE} × ${la}`,
      result: `= ${laE} mm`,
    });
  }
  return steps;
}

/** 生成梁端锚固判定公式步骤 */
function beamEndAnchorSteps(grade: string, dia: number, concreteGrade: string, seismicGrade: string, hc: number, cover: number): FormulaStep[] {
  const base = anchorSteps(grade, dia, concreteGrade, seismicGrade);
  const fy = FY[grade] || 360;
  const ft = FT[concreteGrade] || 1.43;
  const alpha = grade === 'A' ? 0.16 : 0.14;
  const lab = Math.ceil(alpha * (fy / ft) * dia);
  // GB50010 §8.3.1: 带肋钢筋 d>25mm ×1.1
  const largeDiaFactor = (grade !== 'A' && dia > 25) ? 1.1 : 1.0;
  const la = Math.max(Math.ceil(lab * largeDiaFactor), 200, 10 * dia);
  const zetaAE = seismicGrade === '非抗震' ? 1.0 : 1.15;
  const laE = Math.max(Math.ceil(zetaAE * la), 200, 10 * dia);
  const available = hc - cover;
  const canStraight = laE <= available;
  if (canStraight) {
    const straightLen = Math.max(laE, Math.ceil(0.5 * hc + 5 * dia));
    base.push({
      label: '直锚判定',
      formula: 'laE ≤ hc - c → 可直锚',
      substitution: `${laE} ≤ ${hc} - ${cover} = ${available}`,
      result: `直锚长度 = max(laE, 0.5hc+5d) = ${straightLen} mm`,
    });
  } else {
    const bentStr = Math.max(Math.ceil(0.4 * laE), hc - cover);
    const bentBend = 15 * dia;
    base.push({
      label: '弯锚判定',
      formula: 'laE > hc - c → 需弯锚',
      substitution: `${laE} > ${available}`,
      result: `直段 max(0.4laE, hc-c) = ${bentStr} mm，弯折15d = ${bentBend} mm`,
    });
  }
  return base;
}

/** 生成重量计算步骤 */
function weightSteps(name: string, count: number, lengthM: number, dia: number): FormulaStep {
  const unitW = w(dia);
  const total = count * lengthM * unitW;
  return {
    label: `${name}重量`,
    formula: 'W = n × L × w',
    substitution: `= ${count} × ${lengthM.toFixed(3)}m × ${unitW.toFixed(3)}kg/m`,
    result: `= ${total.toFixed(2)} kg`,
  };
}

/**
 * 弯锚下料长度 (mm)
 * = 直段 + 弯折段 − 90°弯折调整值 (0.785d)
 * 弯折时外量尺寸 > 中心线弧长，扣减差值以得到准确下料长度
 */
function bentAnchorCutLen(straightPart: number, bendPart: number, diameter: number): number {
  return straightPart + bendPart - bendAdjustment(diameter, 90);
}

function countBeamTiePositions(spanLengthMm: number, spacingMm: number): number {
  if (spanLengthMm <= 0 || spacingMm <= 0) return 0;
  let count = 0;
  for (let x = -spanLengthMm / 2 + spacingMm * 1.5; x < spanLengthMm / 2 - spacingMm * 0.5; x += spacingMm) {
    count += 1;
  }
  return count;
}

/** 构建 CalcResult，自动附加损耗信息 */
function buildResult(items: CalcItem[], total: number, componentType: string): CalcResult {
  const rate = WASTE_RATE[componentType] ?? 0.03;
  const totalWithWaste = total * (1 + rate);
  return {
    items,
    total: `${total.toFixed(2)} kg`,
    totalWithWaste: `${totalWithWaste.toFixed(2)} kg`,
    wasteRate: rate,
  };
}

export interface FormulaStep {
  label: string;        // 步骤名称, e.g. "基本锚固长度"
  formula: string;      // 公式, e.g. "lab = α × (fy/ft) × d"
  substitution: string; // 代入数值, e.g. "= 0.14 × (360/1.43) × 25"
  result: string;       // 结果, e.g. "= 882 mm"
}

export interface CalcItem {
  name: string;
  spec: string;
  length: string;      // 显示用描述
  weight: string;      // 显示用
  color: string;
  // 数值字段，用于汇总/导出
  grade: string;       // 钢种 A/B/C/D/E
  diameter: number;    // 直径 mm
  count: number;       // 根数
  lengthM: number;     // 单根长度 m
  weightKg: number;    // 该项总重 kg
  formulaSteps?: FormulaStep[]; // 计算推导过程
}

export interface CalcResult {
  items: CalcItem[];
  total: string;
  /** 含损耗总重 (kg) — 净重 × (1 + 损耗率) */
  totalWithWaste?: string;
  /** 损耗率 (小数，如 0.03 = 3%) */
  wasteRate?: number;
}

export function calcBeam(p: BeamParams): CalcResult {
  const top = parseRebar(p.top);
  const bot = parseRebarBottom(p.bottom);
  const stir = parseStirrup(p.stirrup);
  const leftR = p.leftSupport ? parseRebar(p.leftSupport) : null;
  const rightR = p.rightSupport ? parseRebar(p.rightSupport) : null;
  const cover = p.cover || 25;
  const spanCount = p.spanCount || 1;
  const hc = p.hc || 500;

  // 各跨宽度/跨长数组 (未定义则全用全局值)
  const spanLengthsArr: number[] = (p.spanLengths && p.spanLengths.length === spanCount)
    ? p.spanLengths
    : Array(spanCount).fill(p.spanLength || 4000);
  const spanWidthsArr: number[] = (p.spanWidths && p.spanWidths.length === spanCount)
    ? p.spanWidths
    : Array(spanCount).fill(p.b);

  const totalNet = spanLengthsArr.reduce((s, l) => s + l, 0) + (spanCount - 1) * hc; // 多跨总净长

  const items: CalcItem[] = [];
  let total = 0;

  function push(name: string, spec: string, length: string, grade: string, diameter: number, count: number, lengthM: number, color: string, formulaSteps?: FormulaStep[]) {
    const weightKg = count * lengthM * w(diameter);
    const steps = formulaSteps ? [...formulaSteps, weightSteps(name, count, lengthM, diameter)] : [weightSteps(name, count, lengthM, diameter)];
    items.push({ name, spec, length, weight: `${weightKg.toFixed(2)} kg`, color, grade, diameter, count, lengthM, weightKg, formulaSteps: steps });
    total += weightKg;
  }

  // Use exactly the bend planes and centreline arc lengths rendered in 3D.
  for (const row of beamLongitudinalLayout(p).rows) {
    const a = row.anchor;
    const name = BEAM_BAR_NAMES[row.role] + (row.row ? `(第${row.row+1}排)` : '');
    const lengthM = row.lengthMm/1000;
    const anchorDesc = a.canStraight ? `直锚 ${a.straightLen}mm` : `弯锚水平段 ${a.bentStraightPart}mm，竖段 ${a.bentBendPart}mm`;
    push(name, `${row.count}${row.grade}${row.diameter}`, `${lengthM.toFixed(3)}m × ${row.count} (${anchorDesc})`,
      row.grade,row.diameter,row.count,lengthM,row.role==='top'||row.role==='bottom'?'#C0392B':'#8E44AD',[
        {label:'端部锚固布置',formula:'按各排错开的弯折平面计量',substitution:anchorDesc,result:`${row.endCount} 个端部`},
        {label:'单根中心线长度',formula:'L = 主体长度 + 端部数量 × (水平段 + 竖段 − 圆弧转角差)',
          substitution:`主体 ${row.bodyLengthMm}mm；${anchorDesc}`,result:`${row.lengthMm.toFixed(1)} mm`},
      ]);
  }

  // 中间支座负筋 (内跨支座，贯通中间柱，仅多跨时有效)
  const innerR = spanCount > 1 ? (p.innerSupport ? parseRebar(p.innerSupport) : (rightR ?? leftR)) : null;
  if (innerR) {
    // 每根内支座负筋长度 = 左跨 ln/3 + hc + 右跨 ln/3
    let totalInnerLen = 0;
    for (let i = 0; i < spanCount - 1; i++) {
      const lenLeft = calcSupportRebarLength(spanLengthsArr[i]);
      const lenRight = calcSupportRebarLength(spanLengthsArr[i + 1]);
      totalInnerLen += (lenLeft + hc + lenRight) * innerR.count;
    }
    const innerColCount = spanCount - 1;
    const totalInnerBars = innerR.count * innerColCount;
    const avgInnerLen = totalInnerLen / totalInnerBars / 1000; // m
    const innerFormula: FormulaStep[] = [
      { label: '内支座负筋长度', formula: 'L = ln左/3 + hc + ln右/3', substitution: `第1内柱: ${calcSupportRebarLength(spanLengthsArr[0])}+${hc}+${calcSupportRebarLength(spanLengthsArr[1])}`, result: `≈ ${(avgInnerLen).toFixed(2)} m (平均)` },
      { label: '总根数', formula: '根数 × 内柱数', substitution: `= ${innerR.count} × ${innerColCount}`, result: `= ${totalInnerBars} 根` },
    ];
    push('中间支座负筋', p.innerSupport || p.rightSupport || p.leftSupport || '', `平均${avgInnerLen.toFixed(2)}m × ${totalInnerBars} (${innerR.count}根×${innerColCount}内柱，ln/3+hc+ln/3${p.innerSupport ? '' : '，按端支座筋兜底'})`,
      innerR.grade, innerR.diameter, totalInnerBars, avgInnerLen, '#8E44AD', innerFormula);
  }

  // 架立筋 (有支座负筋时, 或用户手动指定)
  const hasErectionBar = p.erectionBar ? true : !!(leftR || rightR || innerR);
  if (hasErectionBar) {
    const erUser = p.erectionBar ? parseRebar(p.erectionBar) : null;
    const avgSpanLen = Math.round(spanLengthsArr.reduce((s, l) => s + l, 0) / spanCount);
    const erDia = erUser ? erUser.diameter : ((avgSpanLen <= 4000) ? 10 : 12);
    const erGrade = erUser ? erUser.grade : 'C'; // HRB400
    const erCount = erUser ? erUser.count : 2;
    const lap = 150;
    let erTotalLen = 0;
    for (let i = 0; i < spanCount; i++) {
      const sl = spanLengthsArr[i];
      const leftSupportLenI = ((i === 0 && leftR) || (i > 0 && innerR)) ? calcSupportRebarLength(sl) : 0;
      const rightSupportLenI = ((i === spanCount - 1 && rightR) || (i < spanCount - 1 && innerR)) ? calcSupportRebarLength(sl) : 0;
      let erLenI: number;
      if (leftSupportLenI > 0 && rightSupportLenI > 0) {
        erLenI = sl - leftSupportLenI - rightSupportLenI + 2 * lap;
      } else if (leftSupportLenI > 0) {
        erLenI = sl - leftSupportLenI + lap;
      } else if (rightSupportLenI > 0) {
        erLenI = sl - rightSupportLenI + lap;
      } else {
        erLenI = sl;
      }
      erTotalLen += Math.max(erLenI, 0) * erCount;
    }
    const erTotal = erCount * spanCount;
    const avgErLen = erTotalLen > 0 && erTotal > 0 ? erTotalLen / erTotal / 1000 : 0; // mm → m
    if (avgErLen > 0.05) {
      const erSpec = p.erectionBar || `${erCount}Φ${erDia}`;
      const erFormula: FormulaStep[] = [
        { label: '架立筋平均长度', formula: 'L(m) = 总长(mm) / 总根数 / 1000', substitution: `= ${erTotalLen.toFixed(0)} / ${erTotal} / 1000`, result: `= ${avgErLen.toFixed(3)} m/根` },
      ];
      push('架立筋', erSpec, `平均${avgErLen.toFixed(2)}m × ${erTotal}${spanCount > 1 ? ` (${erCount}根×${spanCount}跨)` : ''} (搭接${lap}mm)`,
        erGrade, erDia, erTotal, avgErLen, '#F39C12', erFormula);
    }
  }

  // 箍筋 (加密区按22G101: max(2h, 500mm) from column face)
  const denseZoneLen = beamDenseZoneLength(p.h);
  const haunchType = p.haunchType || 'none';
  const haunchLenMm = p.haunchLength || 0;
  const haunchHeightMm = p.haunchHeight || 0;
  const haunchSides = haunchType !== 'none' && haunchLenMm > 0 && haunchHeightMm > 0
    ? (p.haunchSide === 'left' || p.haunchSide === 'right' ? 1 : 2)
    : 0;
  const hasLeftHaunchCalc = haunchSides > 0 && (p.haunchSide === 'both' || p.haunchSide === 'left');
  const hasRightHaunchCalc = haunchSides > 0 && (p.haunchSide === 'both' || p.haunchSide === 'right');
  const haunchH0Mm = p.h - cover - bot.diameter / 2;
  const haunchHbCoeff = p.seismicGrade === '一级' ? 2.0 : 1.5;
  const haunchDenseZoneMm = haunchSides > 0
    ? Math.max(haunchHbCoeff * p.h, 500, haunchLenMm + 0.5 * haunchH0Mm)
    : 0;
  const haunchBaseSkipMm = haunchType === 'vertical' ? haunchDenseZoneMm : haunchLenMm;
  const countBaseStirrupsForSpan = (spanLenMm: number) => {
    const leftSkip = hasLeftHaunchCalc ? haunchBaseSkipMm : 0;
    const rightSkip = hasRightHaunchCalc ? haunchBaseSkipMm : 0;
    const leftDenseCount = Math.max(Math.ceil((denseZoneLen - leftSkip) / stir.spacingDense), 0);
    const rightDenseCount = Math.max(Math.ceil((denseZoneLen - rightSkip) / stir.spacingDense), 0);
    const normalLen = Math.max(spanLenMm - Math.max(denseZoneLen, leftSkip) - Math.max(denseZoneLen, rightSkip), 0);
    const normalCount = Math.ceil(normalLen / stir.spacingNormal);
    return { denseCount: leftDenseCount + rightDenseCount, normalCount };
  };
  let stirCount = 0;
  let stirWt = 0;
  const stirCenterB0 = Math.max(spanWidthsArr[0] - 2 * cover - stir.diameter, 0);
  const stirCenterH = Math.max(p.h - 2 * cover - stir.diameter, 0);
  const stirSpec0 = createCompositeStirrupSpec({
    widthMm: stirCenterB0,
    barPositionsMm: beamStirrupBarPositions(stirCenterB0, stir.diameter, p.top, p.bottom),
    heightMm: stirCenterH,
    diameterMm: stir.diameter, legs: stir.legs,
  });
  const stirSingleL0 = stirSpec0.lengthMm / stirSpec0.pieceCount / 1000;
  const stirPerSpanInfo: string[] = [];
  for (let i = 0; i < spanCount; i++) {
    const bi = spanWidthsArr[i];
    const sli = spanLengthsArr[i];
    const stirSpecI = createCompositeStirrupSpec({
      widthMm: Math.max(bi - 2 * cover - stir.diameter, 0),
      barPositionsMm: beamStirrupBarPositions(Math.max(bi - 2 * cover - stir.diameter, 0), stir.diameter, p.top, p.bottom),
      heightMm: stirCenterH,
      diameterMm: stir.diameter, legs: stir.legs,
    });
    const stirSingleLi = stirSpecI.lengthMm / stirSpecI.pieceCount / 1000;
    const { denseCount: denseCountI, normalCount: normalCountI } = countBaseStirrupsForSpan(sli);
    const spanCountI = denseCountI + normalCountI;
    stirCount += spanCountI * stirSpecI.pieceCount;
    stirWt += spanCountI * stirSpecI.pieceCount * stirSingleLi * w(stir.diameter);
    stirPerSpanInfo.push(`第${i + 1}跨b=${bi}:${spanCountI}道 × ${stirSpecI.pieceCount}箍/道`);
  }
  const stirSingleL = spanCount === 1 ? stirSingleL0 : stirWt / (stirCount * w(stir.diameter));
  const { denseCount: denseCountPerSpan0, normalCount: normalCountPerSpan0 } = countBaseStirrupsForSpan(spanLengthsArr[0]);
  const stirFormula: FormulaStep[] = [
    { label: '箍筋中心线尺寸(第1跨)', formula: 'b_c = b - 2c - d, h_c = h - 2c - d', substitution: `= ${spanWidthsArr[0]} - 2×${cover} - ${stir.diameter}, ${p.h} - 2×${cover} - ${stir.diameter}`, result: `= ${stirCenterB0}×${stirCenterH} mm` },
    { label: '弯后平直段（每端）', formula: 'hook = max(10d, 75)', substitution: `= max(10×${stir.diameter}, 75)`, result: `= ${Math.round(stirSpec0.hookLenMm)} mm` },
    { label: '每道复合箍总长度', formula: 'L道 = Σ各独立箍下料长度', substitution: stirSpec0.hoops.map(h => `${h.lengthMm}`).join(' + '), result: `= ${stirSpec0.lengthMm} mm（${stirSpec0.pieceCount}个独立箍/道）` },
    { label: '加密区长度', formula: 'l_dense = max(2h, 500)', substitution: `= max(2×${p.h}, 500)`, result: `= ${denseZoneLen} mm` },
    { label: '加密区道数/跨(第1跨)', formula: haunchSides > 0 ? 'n_dense = 梁端加密区扣除加腋专用箍筋区后计数' : 'n_dense = ⌈2×l_dense / s_dense⌉', substitution: haunchSides > 0 ? `加腋区由专用箍筋另计，基础箍筋剩余加密根数` : `= ⌈2×${denseZoneLen} / ${stir.spacingDense}⌉`, result: `= ${denseCountPerSpan0}` },
    { label: '非加密区道数/跨(第1跨)', formula: haunchSides > 0 ? 'n_normal = 扣除max(l_dense, l_haunch)后的中段/s_normal' : 'n_normal = ⌈(ln - 2×l_dense) / s_normal⌉', substitution: haunchSides > 0 ? `ln=${spanLengthsArr[0]}，加腋替代区=${Math.round(haunchBaseSkipMm)}mm` : `= ⌈(${spanLengthsArr[0]} - 2×${denseZoneLen}) / ${stir.spacingNormal}⌉`, result: `= ${normalCountPerSpan0}` },
    { label: '独立箍总根数', formula: '根数 = 道数 × 每道独立箍数', substitution: stirPerSpanInfo.join('，'), result: `= ${stirCount} 根` },
    weightSteps('箍筋', stirCount, stirSingleL, stir.diameter),
  ];
  items.push({
    name: '箍筋', spec: p.stirrup,
    length: `平均${stirSingleL.toFixed(3)}m × ${stirCount}根`,
    weight: `${stirWt.toFixed(2)} kg`, color: '#27AE60',
    grade: stir.grade, diameter: stir.diameter, count: stirCount, lengthM: stirSingleL, weightKg: stirWt,
    formulaSteps: stirFormula,
  });
  total += stirWt;

  // 加腋附加筋与加腋区箍筋 (22G101-1 2-36，按当前3D表达口径计入)
  if (haunchSides > 0) {
    const haunchSideTotal = haunchSides * spanCount;
    if (haunchType === 'vertical') {
      const haunchLaE = calcLaE(bot.grade, bot.diameter, p.concreteGrade, p.seismicGrade);
      const anchorInCol = Math.min(haunchLaE, hc - cover);
      const slopeBaseLen = Math.sqrt(haunchLenMm * haunchLenMm + haunchHeightMm * haunchHeightMm);
      const maxPerRow = Math.floor(stirCenterB0 / (bot.diameter * 2.5)) + 1;
      const firstRowCount = bot.count > maxPerRow ? Math.ceil(bot.count / 2) : bot.count;
      let haunchBarCount = 0;
      let haunchBarWtLen = 0;
      let firstSlopeLen = slopeBaseLen;
      for (let i = 0; i < spanCount; i++) {
        const maxRatio = (spanLengthsArr[i] / 2) / haunchLenMm * 0.85;
        const finalRatio = Math.min(Math.max(haunchLaE / slopeBaseLen, 1), maxRatio);
        const slopeLen = slopeBaseLen * finalRatio;
        if (i === 0) firstSlopeLen = slopeLen;
        const countI = firstRowCount * haunchSides;
        haunchBarCount += countI;
        haunchBarWtLen += countI * (anchorInCol + slopeLen) / 1000;
      }
      if (haunchBarCount > 0) {
        const avgHaunchBarLen = haunchBarWtLen / haunchBarCount;
        const haunchBarFormula: FormulaStep[] = [
          { label: '附加筋根数', formula: 'n = 底筋第一排根数 × 加腋侧数 × 跨数', substitution: `= ${firstRowCount} × ${haunchSides} × ${spanCount}`, result: `= ${haunchBarCount} 根` },
          { label: '柱内锚固', formula: 'anc = min(laE, hc-c)', substitution: `= min(${haunchLaE}, ${hc}-${cover})`, result: `= ${anchorInCol} mm` },
          { label: '斜面段(第1跨)', formula: 'L_slope = sqrt(c1²+h²) × 延伸系数', substitution: `= sqrt(${haunchLenMm}²+${haunchHeightMm}²) × ${(firstSlopeLen / slopeBaseLen).toFixed(2)}`, result: `= ${Math.round(firstSlopeLen)} mm` },
        ];
        push('加腋附加筋', `${firstRowCount}${bot.grade}${bot.diameter}`,
          `平均${avgHaunchBarLen.toFixed(3)}m × ${haunchBarCount} (竖向加腋，含柱内锚固)`,
          bot.grade, bot.diameter, haunchBarCount, avgHaunchBarLen, '#E67E22', haunchBarFormula);
      }

      const h0mm = p.h - cover - bot.diameter / 2;
      const hbCoeff = p.seismicGrade === '一级' ? 2.0 : 1.5;
      const denseZone1mm = Math.max(hbCoeff * p.h, 500, haunchLenMm + 0.5 * h0mm);
      let haunchStirCount = 0;
      let haunchStirWtLen = 0;
      let firstHaunchStirLen = 0;
      for (let i = 0; i < spanCount; i++) {
        const stirZoneLen = Math.min(denseZone1mm, spanLengthsArr[i] / 2 - 50);
        const countPerSide = Math.max(Math.ceil(stirZoneLen / stir.spacingDense), 1);
        for (let side = 0; side < haunchSides; side++) {
          for (let j = 0; j < countPerSide; j++) {
            const t = (j + 0.5) / countPerSide;
            const distFromCol = stirZoneLen * t;
            const localDepth = distFromCol <= haunchLenMm ? haunchHeightMm * (1 - distFromCol / haunchLenMm) : 0;
            const spec = createCompositeStirrupSpec({
              widthMm: Math.max(spanWidthsArr[i] - 2 * cover - stir.diameter, 0),
              barPositionsMm: beamStirrupBarPositions(Math.max(spanWidthsArr[i] - 2 * cover - stir.diameter, 0), stir.diameter, p.top, p.bottom),
              heightMm: Math.max(p.h + localDepth - 2 * cover - stir.diameter, 0),
              diameterMm: stir.diameter, legs: stir.legs,
            });
            if (firstHaunchStirLen === 0) firstHaunchStirLen = spec.lengthMm;
            haunchStirCount += spec.pieceCount;
            haunchStirWtLen += spec.lengthMm / 1000;
          }
        }
      }
      if (haunchStirCount > 0) {
        const avgHaunchStirLen = haunchStirWtLen / haunchStirCount;
        const haunchStirFormula: FormulaStep[] = [
          { label: '加腋加密区长度', formula: 'l_h = max(αhb, 500, c1+0.5h0)', substitution: `= max(${hbCoeff}×${p.h}, 500, ${haunchLenMm}+0.5×${Math.round(h0mm)})`, result: `= ${Math.round(denseZone1mm)} mm` },
          { label: '箍筋根数', formula: 'n = Σceil(min(l_h, ln_i/2-50)/s_dense) × 加腋侧数 × 每道独立箍数', substitution: `s=${stir.spacingDense}，侧数/跨=${haunchSides}`, result: `= ${haunchStirCount} 根` },
          { label: '首道总长度', formula: '按加腋处变高度中心线箍筋', substitution: `中心线随局部加腋高度变化`, result: `首道约 ${firstHaunchStirLen} mm` },
        ];
        push('加腋区箍筋', p.stirrup,
          `平均${avgHaunchStirLen.toFixed(3)}m × ${haunchStirCount} (竖向加腋区)`,
          stir.grade, stir.diameter, haunchStirCount, avgHaunchStirLen, '#27AE60', haunchStirFormula);
      }
    }

    if (haunchType === 'horizontal') {
      const slopeLen = Math.sqrt(haunchLenMm * haunchLenMm + haunchHeightMm * haunchHeightMm);
      const bottomLaE = calcLaE(bot.grade, bot.diameter, p.concreteGrade, p.seismicGrade);
      const bottomAnchorInCol = Math.min(bottomLaE, hc - cover);
      const topLaE = calcLaE(top.grade, top.diameter, p.concreteGrade, p.seismicGrade);
      const topAnchorInCol = Math.min(topLaE, hc - cover);
      const barsPerSide = 2;
      const verticalCount = haunchSideTotal * barsPerSide;
      const bottomHaunchLen = (bottomAnchorInCol + slopeLen) / 1000;
      const topHaunchLen = (topAnchorInCol + slopeLen) / 1000;
      push('水平加腋下部附加筋', `${barsPerSide}${bot.grade}${bot.diameter}`,
        `${bottomHaunchLen.toFixed(3)}m × ${verticalCount} (两侧斜面+柱内锚固)`,
        bot.grade, bot.diameter, verticalCount, bottomHaunchLen, '#E67E22', [
          { label: '单根长度', formula: 'L = 柱内锚固 + sqrt(c1²+b_h²)', substitution: `= ${bottomAnchorInCol} + sqrt(${haunchLenMm}²+${haunchHeightMm}²)`, result: `= ${(bottomHaunchLen * 1000).toFixed(0)} mm` },
        ]);
      push('水平加腋上部附加筋', `${barsPerSide}${top.grade}${top.diameter}`,
        `${topHaunchLen.toFixed(3)}m × ${verticalCount} (两侧斜面+柱内锚固)`,
        top.grade, top.diameter, verticalCount, topHaunchLen, '#E67E22', [
          { label: '单根长度', formula: 'L = 柱内锚固 + sqrt(c1²+b_h²)', substitution: `= ${topAnchorInCol} + sqrt(${haunchLenMm}²+${haunchHeightMm}²)`, result: `= ${(topHaunchLen * 1000).toFixed(0)} mm` },
        ]);

      let verticalStirCount = 0;
      let verticalStirWtLen = 0;
      for (let i = 0; i < spanCount; i++) {
        const countPerSide = Math.max(Math.ceil(haunchLenMm / stir.spacingDense), 1);
        for (let side = 0; side < haunchSides; side++) {
          for (let j = 0; j < countPerSide; j++) {
            const t = (j + 0.5) / countPerSide;
            const localWidthAdd = haunchHeightMm * (1 - t);
            const spec = createCompositeStirrupSpec({
              widthMm: Math.max(spanWidthsArr[i] + 2 * localWidthAdd - 2 * cover - stir.diameter, 0),
              barPositionsMm: beamStirrupBarPositions(Math.max(spanWidthsArr[i] + 2 * localWidthAdd - 2 * cover - stir.diameter, 0), stir.diameter, p.top, p.bottom),
              heightMm: stirCenterH,
              diameterMm: stir.diameter, legs: stir.legs,
            });
            verticalStirCount += spec.pieceCount;
            verticalStirWtLen += spec.lengthMm / 1000;
          }
        }
      }
      if (verticalStirCount > 0) {
        const avgVerticalStirLen = verticalStirWtLen / verticalStirCount;
        push('水平加腋区箍筋', p.stirrup,
          `平均${avgVerticalStirLen.toFixed(3)}m × ${verticalStirCount} (水平加腋区)`,
          stir.grade, stir.diameter, verticalStirCount, avgVerticalStirLen, '#27AE60', [
            { label: '箍筋根数', formula: 'n = ceil(c1/s_dense) × 加腋侧数 × 跨数 × 每道独立箍数', substitution: `= ceil(${haunchLenMm}/${stir.spacingDense}) × ${haunchSides} × ${spanCount}`, result: `= ${verticalStirCount} 根` },
          ]);
      }
    }
  }

  // 腰筋/抗扭筋
  const sideInfo = p.sideBar ? parseSideBar(p.sideBar) : null;
  if (sideInfo) {
    const sideAnchor = calcBeamSideBarAnchor(sideInfo.prefix, sideInfo.grade, sideInfo.diameter, p.concreteGrade, p.seismicGrade, hc, cover);
    const sideAnchorLen = sideAnchor.canStraight ? sideAnchor.straightLen : bentAnchorCutLen(sideAnchor.bentStraightPart, sideAnchor.bentBendPart, sideInfo.diameter);
    const sideLM = (totalNet + 2 * sideAnchorLen) / 1000;
    const sideFormula: FormulaStep[] = sideInfo.prefix === 'G'
      ? [
          { label: '构造腰筋锚固', formula: 'la = max(15d, 150)', substitution: `= max(15×${sideInfo.diameter}, 150)`, result: `= ${sideAnchorLen} mm` },
          { label: '单根长度', formula: 'L = 净跨总长 + 2×锚固', substitution: `= ${totalNet} + 2×${sideAnchorLen}`, result: `= ${(totalNet + 2 * sideAnchorLen)} mm = ${sideLM.toFixed(2)} m` },
        ]
      : [
          ...beamEndAnchorSteps(sideInfo.grade, sideInfo.diameter, p.concreteGrade, p.seismicGrade, hc, cover),
          { label: '单根长度', formula: 'L = 净跨总长 + 2×锚固', substitution: `= ${totalNet} + 2×${sideAnchorLen}`, result: `= ${(totalNet + 2 * sideAnchorLen)} mm = ${sideLM.toFixed(2)} m` },
        ];
    push('腰筋', p.sideBar!, `${sideLM.toFixed(2)}m × ${sideInfo.count} (含锚固)`,
      sideInfo.grade, sideInfo.diameter, sideInfo.count, sideLM, '#2980B9', sideFormula);
  }

  // 拉筋 (有腰筋时)
  if (sideInfo) {
    const tieInfo = p.tieBar ? parseTieBar(p.tieBar) : autoTieBar(p.b, stir.grade, stir.diameter);
    if (tieInfo) {
      const perSide = Math.ceil(sideInfo.count / 2);
      // 多跨时按各跨宽度分别计算拉筋长度和数量
      let tieTotalCount = 0;
      let tieTotalWtLen = 0;
      let tieSpec0: ReturnType<typeof createTieBarShapeSpec> | null = null;
      for (let i = 0; i < spanCount; i++) {
        const bi = spanWidthsArr[i];
        const sli = spanLengthsArr[i];
        const tieSpecI = createTieBarShapeSpec({
          sideOffsetMm: resolveTieSideOffsetMm({
            sectionWidthMm: bi,
            coverMm: cover,
            stirrupDiameterMm: stir.diameter,
            sideBarDiameterMm: sideInfo.diameter,
          }),
          tieDiameterMm: tieInfo.diameter,
          sideBarDiameterMm: sideInfo.diameter,
        });
        if (i === 0) tieSpec0 = tieSpecI;
        const tieSingleLI = tieSpecI.lengthMm / 1000;
        const tieRowsI = countBeamTiePositions(sli, stir.spacingNormal);
        const tieTotalI = tieRowsI * perSide;
        tieTotalCount += tieTotalI;
        tieTotalWtLen += tieTotalI * tieSingleLI;
      }
      const tieAvgL = tieTotalCount > 0 ? tieTotalWtLen / tieTotalCount : 0;
      if (tieTotalCount > 0) {
        const firstTieSpec = tieSpec0 ?? createTieBarShapeSpec({
          sideOffsetMm: resolveTieSideOffsetMm({
            sectionWidthMm: spanWidthsArr[0],
            coverMm: cover,
            stirrupDiameterMm: stir.diameter,
            sideBarDiameterMm: sideInfo.diameter,
          }),
          tieDiameterMm: tieInfo.diameter,
          sideBarDiameterMm: sideInfo.diameter,
        });
        const firstTieRows = countBeamTiePositions(spanLengthsArr[0], stir.spacingNormal);
        const tieFormula: FormulaStep[] = [
          { label: '拉筋主体(第1跨)', formula: 'body = 2×弯弧圆心距梁中线', substitution: `sideOffset = (${spanWidthsArr[0]} - 2×${cover} - ${stir.diameter})/2 - ${stir.diameter}/2 - ${sideInfo.diameter}/2`, result: `= ${Math.round(firstTieSpec.bodyLenMm)} mm` },
          { label: '弯后平直段（每端）', formula: 'hook = max(10d, 75mm)', substitution: `max(10×${tieInfo.diameter}, 75)`, result: `= ${Math.round(firstTieSpec.hookLenMm)} mm` },
          { label: '单根下料长度', formula: 'L = body + 2×(R×3π/4 + l直)', substitution: `= ${Math.round(firstTieSpec.bodyLenMm)} + 2×(${firstTieSpec.bendRadiusMm.toFixed(1)}×3π/4 + ${Math.round(firstTieSpec.hookLenMm)})`, result: `= ${firstTieSpec.lengthMm} mm = ${(firstTieSpec.lengthMm / 1000).toFixed(3)} m` },
          { label: '拉筋道数(第1跨)', formula: 'n_x = 按3D布置: 从1.5s到ln-0.5s，每s一道', substitution: `ln=${spanLengthsArr[0]}，s=${stir.spacingNormal}`, result: `= ${firstTieRows} 道` },
          { label: '拉筋总数', formula: 'n = Σ(道数×层数)', substitution: `层数=ceil(${sideInfo.count}/2)=${perSide}，各跨合计`, result: `= ${tieTotalCount} 根` },
        ];
        push('拉筋', p.tieBar || `${tieInfo.grade}${tieInfo.diameter}`,
          `平均${tieAvgL.toFixed(3)}m × ${tieTotalCount} (${perSide}层)`,
          tieInfo.grade, tieInfo.diameter, tieTotalCount, tieAvgL, '#1ABC9C', tieFormula);
      }
    }
  }

  return buildResult(items, total, 'beam');
}

/* ============ 配筋率计算 ============ */

export interface RebarRatioResult {
  As: number;       // 钢筋面积 mm²
  h0: number;       // 有效高度 mm
  rho: number;      // 配筋率 (小数, 如0.012 = 1.2%)
  rhoMin: number;   // 最小配筋率 GB50010 §8.5.1
  rhoMax: number;   // 工程常用上限
  status: 'ok' | 'low' | 'high'; // 校验状态
  formulaSteps?: FormulaStep[];
}

export interface BeamRatioResult {
  top: RebarRatioResult;
  bottom: RebarRatioResult;
}

/**
 * 梁纵向配筋率计算 (GB50010-2010 §8.5.1)
 * ρmin = max(0.2%, 0.45*ft/fy)
 * ρmax = 2.5% (工程简化上限)
 */
export function calcBeamRebarRatios(p: BeamParams): BeamRatioResult {
  const top = parseRebar(p.top);
  const bot = parseRebarBottom(p.bottom);
  const stir = parseStirrup(p.stirrup);
  const cover = p.cover || 25;
  const b = p.b;

  const ft = FT[p.concreteGrade] || 1.43;
  const fyTop = FY[top.grade] || 360;
  const fyBot = FY[bot.grade] || 360;

  // As = Σ(ni × π × di² / 4) — 混合直径时按各段分别计算
  const segArea = (segs: {count:number;diameter:number}[]) => segs.reduce((s, seg) => s + seg.count * rebarArea(seg.diameter), 0);
  const AsTop = top.segments ? segArea(top.segments) : top.count * rebarArea(top.diameter);
  const AsBot = bot.segments ? segArea(bot.segments) : bot.count * rebarArea(bot.diameter);

  // h0: 多排时按合力点加权计算，单排时 h0 = h - cover - stirDia - d/2
  const { h0: h0Top } = calcEffectiveDepth(p.h, cover, stir.diameter, top.diameter, top.count, top.rows, top.perRow, top.segments);
  const { h0: h0Bot } = calcEffectiveDepth(p.h, cover, stir.diameter, bot.diameter, bot.count, bot.rows, bot.perRow, bot.segments);
  const topIsMultiRow = (top.rows && top.rows >= 2) || (top.perRow && top.perRow.length >= 2);
  const botIsMultiRow = (bot.rows && bot.rows >= 2) || (bot.perRow && bot.perRow.length >= 2);

  // ρ = As / (b × h0)
  const rhoTop = AsTop / (b * h0Top);
  const rhoBot = AsBot / (b * h0Bot);

  // ρmin = max(0.2%, 0.45 × ft / fy)  GB50010 §8.5.1
  const rhoMinTop = Math.max(0.002, 0.45 * ft / fyTop);
  const rhoMinBot = Math.max(0.002, 0.45 * ft / fyBot);
  const rhoMax = 0.025; // 工程简化上限 2.5%

  function status(rho: number, rhoMin: number): 'ok' | 'low' | 'high' {
    if (rho < rhoMin) return 'low';
    if (rho > rhoMax) return 'high';
    return 'ok';
  }

  function ratioSteps(pos: string, n: number, d: number, fy: number, h0: number, As: number, rho: number, rhoMin: number, isMultiRow: boolean): FormulaStep[] {
    const h0Formula = isMultiRow ? 'h₀ = h - as (多排合力点加权)' : 'h₀ = h - c - d_stir - d/2';
    const h0Sub = isMultiRow
      ? `多排钢筋，合力点距边缘 as=${(p.h - h0).toFixed(0)}mm`
      : `= ${p.h} - ${cover} - ${stir.diameter} - ${d}/2`;
    return [
      { label: `${pos}钢筋面积`, formula: 'As = n × π × d² / 4', substitution: `= ${n} × π × ${d}² / 4`, result: `= ${As.toFixed(0)} mm²` },
      { label: '有效高度', formula: h0Formula, substitution: h0Sub, result: `= ${h0.toFixed(0)} mm` },
      { label: '配筋率', formula: 'ρ = As / (b × h₀)', substitution: `= ${As.toFixed(0)} / (${b} × ${h0.toFixed(0)})`, result: `= ${(rho * 100).toFixed(2)}%` },
      { label: '最小配筋率', formula: 'ρmin = max(0.2%, 0.45ft/fy)', substitution: `= max(0.2%, 0.45×${ft}/${fy})`, result: `= ${(rhoMin * 100).toFixed(2)}%` },
    ];
  }

  const topSteps = ratioSteps('上部', top.count, top.diameter, fyTop, h0Top, AsTop, rhoTop, rhoMinTop, !!topIsMultiRow);
  const botSteps = ratioSteps('下部', bot.count, bot.diameter, fyBot, h0Bot, AsBot, rhoBot, rhoMinBot, !!botIsMultiRow);

  return {
    top: { As: AsTop, h0: h0Top, rho: rhoTop, rhoMin: rhoMinTop, rhoMax, status: status(rhoTop, rhoMinTop), formulaSteps: topSteps },
    bottom: { As: AsBot, h0: h0Bot, rho: rhoBot, rhoMin: rhoMinBot, rhoMax, status: status(rhoBot, rhoMinBot), formulaSteps: botSteps },
  };
}

/* ============ 钢筋弯折详图数据 ============ */

export type BarShapeType = 'straight' | 'bentAnchor' | 'support' | 'stirrup' | 'tie';

export interface BarShape {
  name: string;
  spec: string;
  shapeType: BarShapeType;
  count: number;
  color: string;
  totalLen: number;  // mm
  setId?: string;
  relatedSetIds?: string[];
  bodyLen?: number;  // 主体水平段 mm
  anchorLen?: number; // 锚固长度 mm (每端)
  bendLen?: number;  // 弯折段长度 mm
  bendDir?: 'down' | 'up'; // 弯折方向: 上部筋向下, 下部筋向上
  width?: number;    // 箍筋宽 mm
  height?: number;   // 箍筋高 mm
  hookLen?: number;  // 弯钩长 mm
  bendRadius?: number; // 弯曲半径 mm
  hookAngleDeg?: number; // 弯钩角度
  spanLen?: number;  // 支座筋伸入跨内长度 mm
  supportRow?: number; // 支座负筋排数 1 or 2
}

export function calcBarShapes(p: BeamParams): BarShape[] {
  const shapes: BarShape[] = [];
  const stir = parseStirrup(p.stirrup);
  const cover = p.cover || 25;
  const hc = p.hc || 500;
  const spanCount = p.spanCount || 1;
  const spanLengthsArr: number[] = (p.spanLengths && p.spanLengths.length === spanCount)
    ? p.spanLengths
    : Array(spanCount).fill(p.spanLength || 4000);

  for (const row of beamLongitudinalLayout(p).rows) {
    const a = row.anchor, through = row.role==='top'||row.role==='bottom';
    shapes.push({name:BEAM_BAR_NAMES[row.role]+(row.row?`(第${row.row+1}排)` : ''),
      spec:`${row.count}${row.grade}${row.diameter}`, count:row.count,
      color:through?'#C0392B':'#8E44AD', setId:`beam.${row.role}.row${row.row}`,
      shapeType:through?(a.canStraight?'straight':'bentAnchor'):'support',
      totalLen:row.lengthMm, bodyLen:row.bodyLengthMm,
      anchorLen:a.canStraight?a.straightLen:a.bentStraightPart,
      bendLen:a.canStraight?undefined:a.bentBendPart,
      bendDir:row.role==='bottom'?'up':'down',
      ...(!through?{spanLen:row.bodyLengthMm,supportRow:(row.role.endsWith('2')?2:1) as 1|2}:{})});
  }

  const innerR = spanCount > 1 ? (p.innerSupport ? parseRebar(p.innerSupport) : ((p.rightSupport ? parseRebar(p.rightSupport) : null) ?? (p.leftSupport ? parseRebar(p.leftSupport) : null))) : null;
  if (innerR) {
    let totalInnerLen = 0;
    for (let i = 0; i < spanCount - 1; i++) {
      totalInnerLen += calcSupportRebarLength(spanLengthsArr[i]) + hc + calcSupportRebarLength(spanLengthsArr[i + 1]);
    }
    const avgInnerLen = Math.round(totalInnerLen / (spanCount - 1));
    shapes.push({
      name: '中间支座负筋',
      spec: p.innerSupport || p.rightSupport || p.leftSupport || '',
      shapeType: 'straight',
      count: innerR.count * (spanCount - 1),
      color: '#8E44AD',
      totalLen: avgInnerLen,
      setId: 'beam.innerSupport',
      bodyLen: avgInnerLen,
    });
  }

  // 箍筋
  const stirSpec = createCompositeStirrupSpec({
    widthMm: p.b - 2 * cover - stir.diameter,
    barPositionsMm: beamStirrupBarPositions(p.b - 2 * cover - stir.diameter, stir.diameter, p.top, p.bottom),
    heightMm: p.h - 2 * cover - stir.diameter,
    diameterMm: stir.diameter, legs: stir.legs,
  });
  stirSpec.hoops.forEach((hoop, index) => shapes.push({
    name: stirSpec.pieceCount === 1 ? '箍筋' : `${index === 0 ? '外箍' : `内箍${index}`}（每道1个）`,
    spec: p.stirrup, shapeType: 'stirrup', count: 0, color: '#27AE60',
    totalLen: hoop.lengthMm, setId: 'beam.stirrup', width: hoop.widthMm, height: hoop.heightMm,
    hookLen: hoop.hookLenMm, bendRadius: hoop.bendRadiusMm, hookAngleDeg: hoop.hookAngleDeg,
  }));

  // 拉筋
  const sideInfo = p.sideBar ? parseSideBar(p.sideBar) : null;
  if (sideInfo) {
    const tieInfo = p.tieBar ? parseTieBar(p.tieBar) : autoTieBar(p.b, stir.grade, stir.diameter);
    if (tieInfo) {
      const tieSpec = createTieBarShapeSpec({
        sideOffsetMm: resolveTieSideOffsetMm({
          sectionWidthMm: p.b,
          coverMm: cover,
          stirrupDiameterMm: stir.diameter,
          sideBarDiameterMm: sideInfo.diameter,
        }),
        tieDiameterMm: tieInfo.diameter,
        sideBarDiameterMm: sideInfo.diameter,
      });
      shapes.push({ name: '拉筋', spec: p.tieBar || `A${tieInfo.diameter}`,
        shapeType: 'tie', count: 0, color: '#1ABC9C', setId: 'beam.tieBar', relatedSetIds: ['beam.sideBar'],
        totalLen: tieSpec.lengthMm, bodyLen: tieSpec.bodyLenMm, hookLen: tieSpec.hookLenMm,
        bendRadius: tieSpec.bendRadiusMm, hookAngleDeg: tieSpec.hookAngleDeg });
    }
  }

  return shapes;
}

export function calcColumnBarShapes(p: ColumnParams): BarShape[] {
  const shapes: BarShape[] = [];
  const colHeight = p.height || 3000;
  const resolved = columnSectionBars(p);

  const addMainShape = (name: string, spec: string, count: number, grade: string, diameter: number, color: string, setId: string) => {
    const lapLen = calcLlE(grade, diameter, p.concreteGrade, p.seismicGrade);
    shapes.push({
      name,
      spec,
      shapeType: 'straight',
      count,
      color,
      totalLen: colHeight + lapLen,
      bodyLen: colHeight,
      anchorLen: lapLen,
      setId,
      relatedSetIds: ['column.stirrup'],
    });
  };

  if (resolved.isDetailed) {
    addMainShape('角筋', p.cornerMain || p.main, resolved.corner.count, resolved.corner.grade, resolved.corner.diameter, '#C0392B', 'column.corner');
    if (resolved.bMiddle) {
      addMainShape('b边中部筋', p.bMiddleMain || '', resolved.bMiddle.count * 2, resolved.bMiddle.grade, resolved.bMiddle.diameter, '#E67E22', 'column.bMiddle');
    }
    if (resolved.hMiddle) {
      addMainShape('h边中部筋', p.hMiddleMain || '', resolved.hMiddle.count * 2, resolved.hMiddle.grade, resolved.hMiddle.diameter, '#8E44AD', 'column.hMiddle');
    }
  } else {
    addMainShape('纵向钢筋', p.main, resolved.totalCount, resolved.corner.grade, resolved.corner.diameter, '#C0392B', 'column.main');
  }

  const hoops=columnHoopLayout(p);
  for(const [upper,spec] of [[false,hoops.lower],[true,hoops.upper]] as const){
    const stations=hoops.positions.filter(q=>q.upper===upper).length;
    if(!stations)continue;
    spec.hoops.forEach((hoop,index)=>shapes.push({
      name:(p.hasVariableSection?(upper?'上段':'下段'):'')+(index?'内箍'+index:'外箍'),spec:p.stirrup,shapeType:'stirrup',count:stations,color:'#27AE60',
      totalLen:hoop.lengthMm,setId:'column.stirrup',width:hoop.widthMm,height:hoop.heightMm,hookLen:hoop.hookLenMm,bendRadius:hoop.bendRadiusMm,hookAngleDeg:hoop.hookAngleDeg,
      relatedSetIds:['column.corner','column.bMiddle','column.hMiddle','column.main'],
    }));
  }

  return shapes;
}

export function calcColumn(p: ColumnParams): CalcResult {
  const stir = parseStirrup(p.stirrup);
  const colHeight = p.height || 3000;
  const cover = p.cover || 25;
  const items: CalcItem[] = [];
  let total = 0;

  // 22G101-1 分项标注解析
  const resolved = columnSectionBars(p);
  const hoopLayout=columnHoopLayout(p);

  // 箍筋加密区长度 GB50011 §6.3.3: max(Hn/6, hc, 500)，上下两端各取
  const hcVal = Math.max(p.b, p.h);
  const denseZoneLen = hoopLayout.denseLength;

  if (resolved.isDetailed) {
    // ── 角筋 (4根) ──
    const cLlE = calcLlE(resolved.corner.grade, resolved.corner.diameter, p.concreteGrade, p.seismicGrade);
    const cL = (colHeight + cLlE) / 1000;
    const cCount = resolved.corner.count;
    const cW = cCount * cL * w(resolved.corner.diameter);
    const cFormula: FormulaStep[] = [
      ...anchorSteps(resolved.corner.grade, resolved.corner.diameter, p.concreteGrade, p.seismicGrade),
      { label: '抗震搭接长度 llE', formula: 'llE = ζl × laE', substitution: `= 1.4 × laE`, result: `= ${cLlE} mm` },
      { label: '单根长度', formula: 'L = H + llE', substitution: `= ${colHeight} + ${cLlE}`, result: `= ${colHeight + cLlE} mm = ${cL.toFixed(2)} m` },
      weightSteps('角筋', cCount, cL, resolved.corner.diameter),
    ];
    items.push({ name: '角筋', spec: p.cornerMain!, length: `${cL.toFixed(2)}m × ${cCount} (含搭接${cLlE}mm)`, weight: `${cW.toFixed(2)} kg`, color: '#C0392B', grade: resolved.corner.grade, diameter: resolved.corner.diameter, count: cCount, lengthM: cL, weightKg: cW, formulaSteps: cFormula });
    total += cW;

    // ── b边中部筋 (每侧 n 根，共 2n 根) ──
    if (resolved.bMiddle) {
      const bLlE = calcLlE(resolved.bMiddle.grade, resolved.bMiddle.diameter, p.concreteGrade, p.seismicGrade);
      const bL = (colHeight + bLlE) / 1000;
      const bCount = resolved.bMiddle.count * 2;
      const bW = bCount * bL * w(resolved.bMiddle.diameter);
      const bFormula: FormulaStep[] = [
        ...anchorSteps(resolved.bMiddle.grade, resolved.bMiddle.diameter, p.concreteGrade, p.seismicGrade),
        { label: '抗震搭接长度 llE', formula: 'llE = ζl × laE', substitution: `= 1.4 × laE`, result: `= ${bLlE} mm` },
        { label: '单根长度', formula: 'L = H + llE', substitution: `= ${colHeight} + ${bLlE}`, result: `= ${colHeight + bLlE} mm = ${bL.toFixed(2)} m` },
        { label: '根数', formula: 'n = 每侧根数 × 2', substitution: `= ${resolved.bMiddle.count} × 2`, result: `= ${bCount} 根` },
        weightSteps('b边中部筋', bCount, bL, resolved.bMiddle.diameter),
      ];
      items.push({ name: 'b边中部筋', spec: p.bMiddleMain!, length: `${bL.toFixed(2)}m × ${bCount} (每侧${resolved.bMiddle.count}根，含搭接${bLlE}mm)`, weight: `${bW.toFixed(2)} kg`, color: '#E67E22', grade: resolved.bMiddle.grade, diameter: resolved.bMiddle.diameter, count: bCount, lengthM: bL, weightKg: bW, formulaSteps: bFormula });
      total += bW;
    }

    // ── h边中部筋 (每侧 n 根，共 2n 根) ──
    if (resolved.hMiddle) {
      const hLlE = calcLlE(resolved.hMiddle.grade, resolved.hMiddle.diameter, p.concreteGrade, p.seismicGrade);
      const hL = (colHeight + hLlE) / 1000;
      const hCount = resolved.hMiddle.count * 2;
      const hW = hCount * hL * w(resolved.hMiddle.diameter);
      const hFormula: FormulaStep[] = [
        ...anchorSteps(resolved.hMiddle.grade, resolved.hMiddle.diameter, p.concreteGrade, p.seismicGrade),
        { label: '抗震搭接长度 llE', formula: 'llE = ζl × laE', substitution: `= 1.4 × laE`, result: `= ${hLlE} mm` },
        { label: '单根长度', formula: 'L = H + llE', substitution: `= ${colHeight} + ${hLlE}`, result: `= ${colHeight + hLlE} mm = ${hL.toFixed(2)} m` },
        { label: '根数', formula: 'n = 每侧根数 × 2', substitution: `= ${resolved.hMiddle.count} × 2`, result: `= ${hCount} 根` },
        weightSteps('h边中部筋', hCount, hL, resolved.hMiddle.diameter),
      ];
      items.push({ name: 'h边中部筋', spec: p.hMiddleMain!, length: `${hL.toFixed(2)}m × ${hCount} (每侧${resolved.hMiddle.count}根，含搭接${hLlE}mm)`, weight: `${hW.toFixed(2)} kg`, color: '#8E44AD', grade: resolved.hMiddle.grade, diameter: resolved.hMiddle.diameter, count: hCount, lengthM: hL, weightKg: hW, formulaSteps: hFormula });
      total += hW;
    }
  } else {
    // Legacy: 用 main 统一计算
    const main = parseRebar(p.main);
    const llE = calcLlE(main.grade, main.diameter, p.concreteGrade, p.seismicGrade);
    const mainL = (colHeight + llE) / 1000;
    const mainW = main.count * mainL * w(main.diameter);
    const mainFormula: FormulaStep[] = [
      ...anchorSteps(main.grade, main.diameter, p.concreteGrade, p.seismicGrade),
      { label: '抗震搭接长度 llE', formula: 'llE = ζl × laE', substitution: `= 1.4 × laE`, result: `= ${llE} mm` },
      { label: '单根长度', formula: 'L = H + llE', substitution: `= ${colHeight} + ${llE}`, result: `= ${colHeight + llE} mm = ${mainL.toFixed(2)} m` },
      weightSteps('纵向钢筋', main.count, mainL, main.diameter),
    ];
    items.push({ name: '纵向钢筋', spec: p.main, length: `${mainL.toFixed(2)}m × ${main.count} (含搭接${llE}mm)`, weight: `${mainW.toFixed(2)} kg`, color: '#C0392B', grade: main.grade, diameter: main.diameter, count: main.count, lengthM: mainL, weightKg: mainW, formulaSteps: mainFormula });
    total += mainW;
  }

  // ── 箍筋 (中心线形状语义与3D/BBS一致) ──
  const stirCenterB = Math.max(p.b - 2 * cover - stir.diameter, 0);
  const stirCenterHCol = Math.max(p.h - 2 * cover - stir.diameter, 0);
  const colStirSpec = createCompositeStirrupSpec({
    widthMm: stirCenterB,
    heightMm: stirCenterHCol,
    diameterMm: stir.diameter, legs: stir.legs,
    barPositionsMm: resolved.bars.map(bar => bar.x),
  });
  const denseCount=hoopLayout.positions.filter(q=>q.zone==='dense').length;
  const normalCount=hoopLayout.positions.length-denseCount;
  const stirCount=hoopLayout.positions.reduce((sum,q)=>sum+(q.upper?hoopLayout.upper:hoopLayout.lower).pieceCount,0);
  const totalLengthMm=hoopLayout.positions.reduce((sum,q)=>sum+(q.upper?hoopLayout.upper:hoopLayout.lower).lengthMm,0);
  const stirSingleL=stirCount?totalLengthMm/stirCount/1000:0;
  const stirW=totalLengthMm/1000*w(stir.diameter);
  const colStirFormula: FormulaStep[] = [
    { label: '箍筋中心线尺寸', formula: 'b_c = b - 2c - d, h_c = h - 2c - d', substitution: `= ${p.b} - 2×${cover} - ${stir.diameter}, ${p.h} - 2×${cover} - ${stir.diameter}`, result: `= ${stirCenterB}×${stirCenterHCol} mm` },
    { label: '弯后平直段（每端）', formula: 'hook = max(10d, 75)', substitution: `= max(10×${stir.diameter}, 75)`, result: `= ${Math.round(colStirSpec.hookLenMm)} mm` },
    { label: '每道复合箍总长度', formula: 'L道 = Σ各独立箍下料长度', substitution: colStirSpec.hoops.map(h => `${h.lengthMm}`).join(' + '), result: `= ${colStirSpec.lengthMm} mm（${colStirSpec.pieceCount}个独立箍/道）` },
    { label: '加密区长度', formula: 'l_d = min(max(Hn/6, hc, 500), H/2)', substitution: `= min(max(⌈${colHeight}/6⌉, ${hcVal}, 500), ${colHeight}/2)`, result: `= ${denseZoneLen} mm` },
    { label: '加密区道数(上下两端)', formula: 'n_d = 上下加密区的独立实布站位数（交叠区只计一次）', substitution: `端部50mm起布，加密区长${denseZoneLen}mm，间距${stir.spacingDense}mm`, result: `= ${denseCount}` },
    { label: '非加密区道数', formula: 'n_n = 两端加密区之间的实际站位数', substitution: `区间 ${denseZoneLen} ~ ${colHeight-denseZoneLen}mm，间距${stir.spacingNormal}mm`, result: `= ${normalCount}` },
    { label: '独立箍总根数与展开长', formula: '按各站位截面累加独立箍，变截面使用上段尺寸', substitution: `${hoopLayout.positions.length}道；总长 ${totalLengthMm.toFixed(1)}mm ÷ 1000`, result: `${stirCount} 根，平均 ${stirSingleL.toFixed(3)} m/根` },
    weightSteps('箍筋', stirCount, stirSingleL, stir.diameter),
  ];
  items.push({
    name: '箍筋', spec: p.stirrup,
    length: `平均${stirSingleL.toFixed(3)}m × ${stirCount}根`,
    weight: `${stirW.toFixed(2)} kg`, color: '#27AE60',
    grade: stir.grade, diameter: stir.diameter, count: stirCount, lengthM: stirSingleL, weightKg: stirW,
    formulaSteps: colStirFormula,
  });
  total += stirW;

  return buildResult(items, total, 'column');
}

export function calcSlab(p: SlabParams): CalcResult {
  const layout=slabReinforcement(p);
  const items: CalcItem[]=layout.groups.map(group=>{
    const lengthM=group.lengthMm/1000,weightKg=group.count*lengthM*w(group.diameter);
    return {name:group.name,spec:group.spec,length:`${lengthM.toFixed(3)}m × ${group.count}`,weight:`${weightKg.toFixed(2)} kg`,
      color:group.color,grade:group.grade,diameter:group.diameter,count:group.count,lengthM,weightKg,
      formulaSteps:[
        {label:'根数',formula:'每排实布根数 × 独立钢筋段数',substitution:`${group.positions.length} × ${group.curves.length}`,result:`${group.count} 根`},
        {label:'单根长度',formula:'直线段 + 圆弧段（模型中心线展开）',substitution:`层位 ${group.level.toFixed(1)}mm；方向 ${group.axis==='x'?'X':'Y'}`,result:`${group.lengthMm.toFixed(1)} mm`},
        weightSteps(group.name,group.count,lengthM,group.diameter),
      ]};
  });
  return buildResult(items,items.reduce((sum,item)=>sum+item.weightKg,0),'slab');
}

export function calcShearWall(p: ShearWallParams): CalcResult {
  const vert = parseSlabRebar(p.vertBar);
  const horiz = parseSlabRebar(p.horizBar);
  const boundaryR = parseRebar(p.boundaryMain);
  const boundaryStir = parseStirrup(p.boundaryStirrup);
  const cover = p.cover || 20;
  const items: CalcItem[] = [];
  let total = 0;

  const distributed=wallDistributedReinforcement(p);
  const addWall=(name:string,spec:string,bar:{grade:string;diameter:number},count:number,lengthM:number,color:string,description:string)=>{
    const weightKg=count*lengthM*w(bar.diameter);
    items.push({name,spec,grade:bar.grade,diameter:bar.diameter,count,lengthM,weightKg,color,length:`${lengthM.toFixed(3)}m × ${count}根（${description}）`,weight:`${weightKg.toFixed(2)} kg`,formulaSteps:[
      {label:'模型分段计量',formula:'按实际站位与洞口截段逐根统计；毫米换算为米',substitution:description,result:`${count} 根 × ${lengthM.toFixed(3)} m`},weightSteps(name,count,lengthM,bar.diameter),
    ]});total+=weightKg;
  };
  const addSegments=(name:string,spec:string,bar:{grade:string;diameter:number},lengths:number[],color:string)=>{
    const groups=new Map<number,number>();
    for(const length of lengths){const key=Math.round(length*1e6)/1e6;groups.set(key,(groups.get(key)||0)+1);}
    let i=0;for(const [length,count] of groups)addWall(name+(groups.size>1?`（分段${++i}）`:''),spec,bar,count,length,color,'按模型墙身净段，不含尚未建模的端部锚固');
  };
  addSegments('竖向分布筋',p.vertBar,vert,distributed.vertBars.map(q=>q.height),'#C0392B');
  addSegments('水平分布筋',p.horizBar,horiz,distributed.horizBars.map(q=>q.length),'#2980B9');
  const hole=wallOpening(p)[0];
  if(hole){
    if(p.openingVertBar)addWall('洞口侧边补强筋',p.openingVertBar,parseSlabRebar(p.openingVertBar),4,(hole.y1-hole.y0)/1000,'#EC4899','两侧边、两墙面各1根，未含洞边锚固');
    if(p.openingHorizBar)addWall('洞口上下补强筋',p.openingHorizBar,parseSlabRebar(p.openingHorizBar),4,(hole.x1-hole.x0)/1000,'#EC4899','上下边、两墙面各1根，未含洞边锚固');
  }

  const boundaryLen = p.boundaryLength || Math.max(p.bw, 400);
  const llE = calcLlE(boundaryR.grade, boundaryR.diameter, p.concreteGrade, p.seismicGrade);
  const boundaryL = (p.hw + llE) / 1000;
  const bCount2 = boundaryR.count * 2;
  const boundaryW = bCount2 * boundaryL * w(boundaryR.diameter);
  const boundaryFormula: FormulaStep[] = [
    ...anchorSteps(boundaryR.grade, boundaryR.diameter, p.concreteGrade, p.seismicGrade),
    { label: '抗震搭接长度 llE', formula: 'llE = ζl × laE', substitution: `= 1.4 × laE`, result: `= ${llE} mm` },
    { label: '单根长度', formula: 'L = hw + llE', substitution: `= ${p.hw} + ${llE}`, result: `= ${p.hw + llE} mm = ${boundaryL.toFixed(2)} m` },
    weightSteps('边缘纵筋', bCount2, boundaryL, boundaryR.diameter),
  ];
  items.push({ name: '边缘构件纵筋', spec: p.boundaryMain, length: `${boundaryL.toFixed(2)}m × ${bCount2}根 (两端)`, weight: `${boundaryW.toFixed(2)} kg`, color: '#8E44AD',
    grade: boundaryR.grade, diameter: boundaryR.diameter, count: bCount2, lengthM: boundaryL, weightKg: boundaryW, formulaSteps: boundaryFormula });
  total += boundaryW;

  const bStir = boundaryStir;
  const boundaryForm = p.boundaryForm || 'concealed';
  const depth = boundaryForm === 'concealed' ? p.bw : p.bw + Math.max(p.boundaryProjection || 0, p.bw * (boundaryForm === 'endColumn' ? .35 : boundaryForm === 'cornerWall' ? .5 : .2));
  const length = boundaryLen * (boundaryForm === 'wingWall' ? 1.35 : boundaryForm === 'cornerWall' ? 1.18 : 1);
  const bShape = createCompositeStirrupSpec({ widthMm: Math.max(length - 2 * cover, length * .35) - bStir.diameter, heightMm: Math.max(depth - 2 * cover, Math.min(p.bw * .6, depth)) - bStir.diameter, diameterMm: bStir.diameter, legs: bStir.legs });
  const bPerim = bShape.lengthMm / bShape.pieceCount / 1000;
  const bStirRows = Math.max(0, Math.ceil((p.hw - 50) / bStir.spacingDense) - 1) * 2;
  const bStirCount = bStirRows * bShape.pieceCount;
  const bStirW = bStirCount * bPerim * w(bStir.diameter);
  const bStirFormula: FormulaStep[] = [
    { label: '每道复合箍', formula: '独立外箍 + 独立内箍', substitution: `${bStir.legs} 肢，含各自圆弧与 135° 弯钩`, result: `${bShape.pieceCount} 个 / 道` },
    { label: '两端箍筋数量', formula: '实际标高道数 × 每道个数 × 两端', substitution: `间距 ${bStir.spacingDense} mm`, result: `${bStirCount} 个` },
    weightSteps('边缘箍筋', bStirCount, bPerim, bStir.diameter),
  ];
  items.push({ name: '边缘构件箍筋', spec: p.boundaryStirrup, length: `${bStirCount}个 × 平均${bPerim.toFixed(3)}m (两端)`, weight: `${bStirW.toFixed(2)} kg`, color: '#27AE60', grade: bStir.grade, diameter: bStir.diameter, count: bStirCount, lengthM: bPerim, weightKg: bStirW, formulaSteps: bStirFormula });
  total += bStirW;

  // Same hook shape and placements as the 3D wall model.
  if((boundaryForm==='wingWall'||boundaryForm==='cornerWall')&&(p.boundaryProjection||0)>0){
    const projection=p.boundaryProjection!,outerWidth=Math.max((boundaryForm==='wingWall'?boundaryLen:boundaryLen*.75)-2*cover-bStir.diameter,40),outerDepth=Math.max(projection-2*cover-bStir.diameter,40);
    const outerSpec=createCompositeStirrupSpec({widthMm:outerWidth,heightMm:outerDepth,diameterMm:bStir.diameter,legs:2});
    addWall('边缘凸出段纵筋',p.boundaryMain,boundaryR,Math.max(Math.round(boundaryR.count/2),2)*2,boundaryL,'#8E44AD','两端凸出段独立纵筋，含与主边缘筋相同搭接');
    addWall('边缘凸出段箍筋',p.boundaryStirrup,bStir,bStirRows,outerSpec.lengthMm/1000,'#27AE60','两端各一个独立封闭箍');
    const outerTieLen=Math.max(p.bw/2+projection-cover-Math.max(depth-2*cover,Math.min(p.bw*.6,depth))/2,0);
    const tieSpec=createTieBarShapeSpec({sideOffsetMm:outerTieLen/2,tieDiameterMm:bStir.diameter,sideBarDiameterMm:bStir.diameter});
    if(outerTieLen>20)addWall('边缘凸出段拉筋',p.boundaryStirrup,bStir,bStirRows*(boundaryForm==='cornerWall'?2:3),tieSpec.lengthMm/1000,'#27AE60','按两端实际拉筋位置统计，含135°弯钩');
  }

  if (p.tieBar) {
    const tie = parseSlabRebar(p.tieBar);
    const shape = createTieBarShapeSpec({ sideOffsetMm: p.bw / 2 - cover - horiz.diameter / 2, tieDiameterMm: tie.diameter, sideBarDiameterMm: horiz.diameter });
    const tieSingleLen = shape.lengthMm / 1000;
    const tieTotalCount = wallTiePositions(p).length;
    const tieWt = tieTotalCount * tieSingleLen * w(tie.diameter);
    const tieFormula: FormulaStep[] = [
      { label: '弯钩平直段', formula: 'max(10d, 75)', substitution: `max(10×${tie.diameter}, 75)`, result: `${shape.hookLenMm} mm` },
      { label: '单根展开长度', formula: '直段 + 两端圆弧 + 两端平直段', substitution: '与三维拉筋中心线共用几何', result: `${(tieSingleLen * 1000).toFixed(1)} mm` },
      { label: '布置根数', formula: '墙身网格定位，避让洞口，勾住水平筋', substitution: `间距 ${tie.spacing} mm`, result: `${tieTotalCount} 根` },
      weightSteps('拉结筋', tieTotalCount, tieSingleLen, tie.diameter),
    ];
    items.push({ name: '拉结筋', spec: p.tieBar, length: `${tieSingleLen.toFixed(3)}m × ${tieTotalCount}根`, weight: `${tieWt.toFixed(2)} kg`, color: '#1ABC9C', grade: tie.grade, diameter: tie.diameter, count: tieTotalCount, lengthM: tieSingleLen, weightKg: tieWt, formulaSteps: tieFormula });
    total += tieWt;
  }

  return buildResult(items, total, 'shearwall');
}

// ═══════════════════════════════════════════════════════════════════
// 楼梯用量计算 (22G101-2 AT型)
// ═══════════════════════════════════════════════════════════════════

export function calcStair(p: StairParams): CalcResult {
  const layout=stairReinforcement(p),items:CalcItem[]=[];
  const add=(name:string,spec:string,bar:typeof layout.botR,count:number,lengthM:number,description:string,color:string)=>{
    const weightKg=count*lengthM*w(bar.diameter);
    items.push({name,spec,grade:bar.grade,diameter:bar.diameter,count,lengthM,weightKg,color,
      length:`${lengthM.toFixed(3)}m × ${count}根 (${description})`,weight:`${weightKg.toFixed(2)} kg`,formulaSteps:[
        {label:'模型中心线长度',formula:'L(m) = 连续路径直段与圆弧的展开长度',substitution:description,result:`${(lengthM*1000).toFixed(1)} mm ÷ 1000 = ${lengthM.toFixed(3)} m`},
        {label:'实布根数',formula:name==='分布筋'?'N = 平板及斜板实际站位数 × 2层':'N = 宽度内满足保护层与半径的站位数',substitution:`保护层 ${p.cover}mm；直径 ${bar.diameter}mm；间距 ${bar.spacing}mm`,result:`${count} 根`},
        weightSteps(name,count,lengthM,bar.diameter),
      ]});
  };
  add('下部纵筋',p.bottomBar,layout.botR,layout.botBarZs.length,layout.bottomCurve.getLength(),'含模型两端锚入及转角','#C0392B');
  layout.topCurves.forEach((curve,i)=>add(`上部纵筋（${i?'高':'低'}端）`,p.topBar,layout.topR,layout.topBarZs.length,curve.getLength(),'两端各为独立负筋，含端弯圆弧','#8E44AD'));
  add('分布筋',p.distBar,layout.distR,layout.distBarPositions.length*2,layout.distLengthM,'上下各一层','#27AE60');
  return buildResult(items,items.reduce((sum,item)=>sum+item.weightKg,0),'stair');
}

export interface StairRatioResult {
  bottom: RebarRatioResult;
  top: RebarRatioResult;
}

export function calcStairRebarRatios(p: StairParams): StairRatioResult {
  const botR = parseSlabRebar(p.bottomBar);
  const topR = parseSlabRebar(p.topBar);
  const cover = p.cover || 15;
  const b = p.flightWidth; // 梯段宽度作为截面宽度

  const ft = FT[p.concreteGrade] || 1.43;
  const fyBot = FY[botR.grade] || 360;
  const fyTop = FY[topR.grade] || 360;

  // 板类构件: As = (b - 2c) / s + 1 根 × πd²/4
  const botCount = stairReinforcement(p).botBarZs.length;
  const topCount = stairReinforcement(p).topBarZs.length;
  const AsBot = botCount * rebarArea(botR.diameter);
  const AsTop = topCount * rebarArea(topR.diameter);

  // h0 = slabThickness - cover - d/2
  const h0Bot = p.slabThickness - cover - botR.diameter / 2;
  const h0Top = p.slabThickness - cover - topR.diameter / 2;

  // ρ = As / (b × h0)  — 按1000mm宽度换算
  const rhoBot = AsBot / (b * h0Bot);
  const rhoTop = AsTop / (b * h0Top);

  // ρmin = max(0.2%, 0.45×ft/fy)
  const rhoMinBot = Math.max(0.002, 0.45 * ft / fyBot);
  const rhoMinTop = Math.max(0.002, 0.45 * ft / fyTop);
  const rhoMax = 0.025;

  function status(rho: number, rhoMin: number): 'ok' | 'low' | 'high' {
    if (rho < rhoMin) return 'low';
    if (rho > rhoMax) return 'high';
    return 'ok';
  }

  function ratioSteps(pos: string, count: number, d: number, fy: number, h0: number, As: number, rho: number, rhoMin: number, spacing: number): FormulaStep[] {
    return [
      { label: `${pos}钢筋根数`, formula: 'n = ⌊(b-2c-d)/s⌋+1', substitution: `= ⌊(${b}-2×${cover}-${d})/${spacing}⌋+1`, result: `= ${count}` },
      { label: `${pos}钢筋面积`, formula: 'As = n × π × d² / 4', substitution: `= ${count} × π × ${d}² / 4`, result: `= ${As.toFixed(0)} mm²` },
      { label: '有效高度', formula: 'h₀ = t - c - d/2', substitution: `= ${p.slabThickness} - ${cover} - ${d}/2`, result: `= ${h0.toFixed(0)} mm` },
      { label: '配筋率', formula: 'ρ = As / (b × h₀)', substitution: `= ${As.toFixed(0)} / (${b} × ${h0.toFixed(0)})`, result: `= ${(rho * 100).toFixed(3)}%` },
      { label: '最小配筋率', formula: 'ρmin = max(0.2%, 0.45ft/fy)', substitution: `= max(0.2%, 0.45×${ft}/${fy})`, result: `= ${(rhoMin * 100).toFixed(3)}%` },
    ];
  }

  return {
    bottom: { As: AsBot, h0: h0Bot, rho: rhoBot, rhoMin: rhoMinBot, rhoMax, status: status(rhoBot, rhoMinBot), formulaSteps: ratioSteps('下部', botCount, botR.diameter, fyBot, h0Bot, AsBot, rhoBot, rhoMinBot, botR.spacing) },
    top: { As: AsTop, h0: h0Top, rho: rhoTop, rhoMin: rhoMinTop, rhoMax, status: status(rhoTop, rhoMinTop), formulaSteps: ratioSteps('上部', topCount, topR.diameter, fyTop, h0Top, AsTop, rhoTop, rhoMinTop, topR.spacing) },
  };
}

// ═══════════════════════════════════════════════════════════════════
// 楼梯弯折详图数据 (22G101-2 AT型)
// ═══════════════════════════════════════════════════════════════════

export function calcStairBarShapes(p: StairParams): BarShape[] {
  const layout=stairReinforcement(p);
  const shapes:BarShape[]=[{name:'下部纵筋',spec:p.bottomBar,shapeType:'straight',count:layout.botBarZs.length,color:'#C0392B',totalLen:layout.bottomCurve.getLength()*1000,bodyLen:layout.bottomCurve.getLength()*1000}];
  layout.topCurves.forEach((curve,i)=>{
    const points=i?layout.topBarPaths.high:layout.topBarPaths.low;
    const a=i?points[points.length-2]:points[0],b=i?points[points.length-1]:points[1];
    const hook=a.distanceTo(b)*1000,totalLen=curve.getLength()*1000;
    shapes.push({name:`上部纵筋（${i?'高':'低'}端）`,spec:p.topBar,shapeType:'support',count:layout.topBarZs.length,color:'#8E44AD',totalLen,bodyLen:totalLen-hook,hookLen:hook,bendDir:'down'});
  });
  shapes.push({name:'分布筋',spec:p.distBar,shapeType:'straight',count:layout.distBarPositions.length*2,color:'#27AE60',totalLen:layout.distLengthM*1000,bodyLen:layout.distLengthM*1000});
  return shapes;
}

export function calcStripFoundation(p: StripFoundationParams): CalcResult {
  const items: CalcItem[] = [];
  let total = 0;
  const cover = p.cover || 40;
  const jlEnds=overhangs(p.jlEndType,p.jlOverhangSide,p.jlOverhang);
  const jclEnds=overhangs(p.jclEndType,p.jclOverhangSide,p.jclOverhang);
  const jlLength=p.length+jlEnds[0]+jlEnds[1],jclLength=p.width+jclEnds[0]+jclEnds[1];
  const jclCount=p.hasJcl?(p.jclSpacing && p.jclSpacing>0 ? p.jclCount||1 : 1):0;

  function push(
    name: string,
    spec: string,
    length: string,
    grade: string,
    diameter: number,
    count: number,
    lengthM: number,
    color: string,
    formulaSteps?: FormulaStep[],
  ) {
    const weightKg = count * lengthM * w(diameter);
    const steps = formulaSteps ? [...formulaSteps, weightSteps(name, count, lengthM, diameter)] : [weightSteps(name, count, lengthM, diameter)];
    items.push({ name, spec, length, weight: `${weightKg.toFixed(2)} kg`, color, grade, diameter, count, lengthM, weightKg, formulaSteps: steps });
    total += weightKg;
  }

  const beamBottomAverage=(bar:ReturnType<typeof parseRebar>,topSpec:string|undefined,stirSpec:string|undefined,width:number,length:number,endType:string|undefined,side:string|undefined)=>{
    const stirD=stirSpec?parseStirrup(stirSpec).diameter:0,topD=topSpec?parseRebar(topSpec).diameter:0;
    const usable=Math.max(width-2*cover-2*stirD-Math.max(bar.diameter,topD),0)/1000;
    const firstCount=resolveBarRowCounts(bar,usable)[0]||0,bend=Math.max(12*bar.diameter,120)/1000;
    const left=endType==='bothSides'||endType==='oneSide'&&side==='left'?bend:0;
    const right=endType==='bothSides'||endType==='oneSide'&&side!=='left'?bend:0;
    const body=Math.max(length-2*cover,0)/1000;
    const full=bentHorizontalCurve(-body/2,body/2,0,bar.diameter,left,right).getLength();
    return bar.count?(full*firstCount+body*(bar.count-firstCount))/bar.count:0;
  };
  const bottomStations=stripTransverseStations(p,'bottom'),topStations=stripTransverseStations(p,'top');
  const bottom = parseSlabRebar(p.bottomBar);
  const dist = parseSlabRebar(p.distBar);

  const bottomLen = Math.max((p.width - 2 * cover) / 1000, 0);
  const bottomCount = bottomStations.base.length;
  push(
    '底部横向受力筋',
    p.bottomBar,
    `${bottomLen.toFixed(2)}m × ${bottomCount}`,
    bottom.grade,
    bottom.diameter,
    bottomCount,
    bottomLen,
    '#C0392B',
    [
      { label: '单根长度', formula: 'L = b - 2c', substitution: `= ${p.width} - 2×${cover}`, result: `= ${Math.max(p.width - 2 * cover, 0)} mm` },
      { label: '范围外原配筋根数', formula: '原始站位数 − 原位替换范围内撤掉的站位数', substitution: '仅对应受力筋被替换，分布筋保留', result: `= ${bottomCount}` },
    ],
  );

  const distLen = Math.max((p.length - 2 * cover) / 1000, 0);
  const distCount = stripDistributedPositions(p).length;
  push(
    '底部分布筋',
    p.distBar,
    `${distLen.toFixed(2)}m × ${distCount}`,
    dist.grade,
    dist.diameter,
    distCount,
    distLen,
    '#2980B9',
    [
      { label: '单根长度', formula: 'L = l - 2c', substitution: `= ${p.length} - 2×${cover}`, result: `= ${Math.max(p.length - 2 * cover, 0)} mm` },
      { label: '根数', formula: '按底板实际站位统计，扣除基础梁支承带内未绘制的分布筋', substitution: `宽度 ${p.width}mm，间距 ${dist.spacing}mm`, result: `= ${distCount}` },
    ],
  );

  const clearGap = p.supportCount === 2 && p.supportSpacing
    ? Math.max(p.supportSpacing - p.supportWidth, 0)
    : 0;

  if (p.supportCount === 2 && p.topBar && clearGap > 0) {
    const top = parseSlabRebar(p.topBar);
    const topLen = Math.max(clearGap / 1000, 0);
    const topCount = topStations.base.length;
    push(
      '顶部横向受力筋',
      p.topBar,
      `${topLen.toFixed(2)}m × ${topCount}`,
      top.grade,
      top.diameter,
      topCount,
      topLen,
      '#E67E22',
      [
        { label: '净跨长度（两梁/两墙内边间）', formula: 'L = s - bw', substitution: `= ${p.supportSpacing} - ${p.supportWidth}`, result: `= ${clearGap} mm` },
        { label: '范围外原配筋根数', formula: '原始站位数 − 原位替换范围内撤掉的站位数', substitution: '仅对应顶筋被替换', result: `= ${topCount}` },
      ],
    );
  }

  if (p.supportCount === 2 && p.topDistBar && clearGap > 0) {
    const topDist = parseSlabRebar(p.topDistBar);
    const topDistLen = Math.max((p.length - 2 * cover) / 1000, 0);
    const topDistCount = Math.max(Math.floor(clearGap / topDist.spacing) + 1, 1);
    push(
      '顶部分布筋',
      p.topDistBar,
      `${topDistLen.toFixed(2)}m × ${topDistCount}`,
      topDist.grade,
      topDist.diameter,
      topDistCount,
      topDistLen,
      '#27AE60',
      [
        { label: '单根长度', formula: 'L = l - 2c', substitution: `= ${p.length} - 2×${cover}`, result: `= ${Math.max(p.length - 2 * cover, 0)} mm` },
        { label: '根数（梁/墙间区域）', formula: 'n = 净跨 / s + 1', substitution: `= ${clearGap} / ${topDist.spacing} + 1`, result: `= ${topDistCount}` },
      ],
    );
  }

  if (p.supportType === 'beam' && p.jlBottom) {
    const jlBottom = parseRebar(p.jlBottom);
    const jlBottomLen = beamBottomAverage(jlBottom,p.jlTop,p.jlStirrup,p.supportWidth,jlLength,p.jlEndType,p.jlOverhangSide);
    push(
      'JL底部纵筋',
      p.jlBottom,
      `平均${jlBottomLen.toFixed(3)}m × ${jlBottom.count * p.supportCount}`,
      jlBottom.grade,
      jlBottom.diameter,
      jlBottom.count * p.supportCount,
      jlBottomLen,
      '#8B4513',
      [
        { label: '平均单根中心线长度', formula: '首排计完整端弯圆弧，其余排计通长直段；按根数加权', substitution: '含基础梁实际外伸段', result: `= ${(jlBottomLen*1000).toFixed(1)} mm` },
        { label: '总根数', formula: 'n = 每道梁纵筋根数 × 梁道数', substitution: `= ${jlBottom.count} × ${p.supportCount}`, result: `= ${jlBottom.count * p.supportCount}` },
      ],
    );
  }

  if (p.supportType === 'beam' && p.jlTop) {
    const jlTop = parseRebar(p.jlTop);
    const jlTopLen = Math.max((jlLength - 2 * cover) / 1000, 0);
    push(
      'JL顶部纵筋',
      p.jlTop,
      `${jlTopLen.toFixed(2)}m × ${jlTop.count * p.supportCount}`,
      jlTop.grade,
      jlTop.diameter,
      jlTop.count * p.supportCount,
      jlTopLen,
      '#C97B36',
      [
        { label: '单根长度', formula: 'L = 基础梁含外伸总长 - 2c', substitution: `= ${jlLength} - 2×${cover}`, result: `= ${Math.max(jlLength - 2 * cover, 0)} mm` },
        { label: '总根数', formula: 'n = 每道梁纵筋根数 × 梁道数', substitution: `= ${jlTop.count} × ${p.supportCount}`, result: `= ${jlTop.count * p.supportCount}` },
      ],
    );
  }

  const addHoops=(name:string,spec:string,width:number,height:number,length:number,beams:number)=>{
    const stir=parseStirrup(spec),spacing=Math.min(stir.spacingDense,stir.spacingNormal);
    const stations=Math.max(Math.floor((length-2*cover)/spacing)+1,1);
    const shape=createCompositeStirrupSpec({widthMm:Math.max(width-2*cover-stir.diameter,width*.2),heightMm:Math.max(height-2*cover-stir.diameter,height*.2),diameterMm:stir.diameter,legs:stir.legs});
    const count=stations*beams*shape.pieceCount,avg=shape.lengthMm/shape.pieceCount/1000;
    push(name,spec,`平均${avg.toFixed(3)}m × ${count}个独立箍`,stir.grade,stir.diameter,count,avg,'#2E8B57',[
      {label:'每道总展开长',formula:'Σ每个独立箍的直段、圆弧与135°弯钩',substitution:shape.hoops.map(q=>`${q.lengthMm}mm`).join(' + '),result:`${shape.lengthMm} mm/道`},
      {label:'独立箍总个数',formula:'每梁实布站位 × 梁道数 × 每道独立箍数',substitution:`${stations} × ${beams} × ${shape.pieceCount}`,result:`${count} 个`},
    ]);
  };
  if(p.supportType==='beam'&&p.jlStirrup)addHoops('JL箍筋',p.jlStirrup,p.supportWidth,p.supportHeight,jlLength,p.supportCount);

  if (p.hasJcl && jclCount > 0) {
    if (p.jclBottom) {
      const jclBottom = parseRebar(p.jclBottom);
      const jclLen = beamBottomAverage(jclBottom,p.jclTop,p.jclStirrup,p.jclB||0,jclLength,p.jclEndType,p.jclOverhangSide);
      push(
        'JCL底部纵筋',
        p.jclBottom,
        `平均${jclLen.toFixed(3)}m × ${jclBottom.count * jclCount}`,
        jclBottom.grade,
        jclBottom.diameter,
        jclBottom.count * jclCount,
        jclLen,
        '#6B3F2A',
        [
          { label: '平均单根中心线长度', formula: '首排计完整端弯圆弧，其余排计通长直段；按根数加权', substitution: '含基础梁实际外伸段', result: `= ${(jclLen*1000).toFixed(1)} mm` },
          { label: '总根数', formula: 'n = 每道次梁纵筋根数 × 次梁道数', substitution: `= ${jclBottom.count} × ${jclCount}`, result: `= ${jclBottom.count * jclCount}` },
        ],
      );
    }
    if (p.jclTop) {
      const jclTop = parseRebar(p.jclTop);
      const jclLen = Math.max((jclLength - 2 * cover) / 1000, 0);
      push(
        'JCL顶部纵筋',
        p.jclTop,
        `${jclLen.toFixed(2)}m × ${jclTop.count * jclCount}`,
        jclTop.grade,
        jclTop.diameter,
        jclTop.count * jclCount,
        jclLen,
        '#B66A2B',
        [
          { label: '单根长度', formula: 'L = 次梁含外伸总长 - 2c', substitution: `= ${jclLength} - 2×${cover}`, result: `= ${Math.max(jclLength - 2 * cover, 0)} mm` },
          { label: '总根数', formula: 'n = 每道次梁纵筋根数 × 次梁道数', substitution: `= ${jclTop.count} × ${jclCount}`, result: `= ${jclTop.count * jclCount}` },
        ],
      );
    }
    if(p.jclStirrup&&p.jclB&&p.jclH)addHoops('JCL箍筋',p.jclStirrup,p.jclB,p.jclH,jclLength,jclCount);
  }

  for(const [name,spec,stations,lengthM,color] of [
    ['原位修正底筋',p.localBottomBar,bottomStations,bottomLen,'#EC4899'],
    ['原位修正顶筋',p.localTopBar,topStations,clearGap>0?clearGap/1000:bottomLen,'#D946EF'],
  ] as const){
    if(!spec||!stations.local.length)continue;
    const bar=parseSlabRebar(spec);
    push(name,spec,`${lengthM.toFixed(3)}m × ${stations.local.length}根（替换对应范围原配筋）`,bar.grade,bar.diameter,stations.local.length,lengthM,color,[
      {label:'原位替换范围',formula:'裁剪到实际保护层范围内；撤掉原站位后按原位间距重布',substitution:`${stations.rangeStart.toFixed(1)} ~ ${stations.rangeEnd.toFixed(1)}mm`,result:`${stations.local.length} 根，不与原配筋重复累计`},
    ]);
  }

  return buildResult(items, total, 'stripfoundation');
}

// ═══════════════════════════════════════════════════════════════════
// 独立基础 (DJ) — 钢筋用量计算
// ═══════════════════════════════════════════════════════════════════

export function calcFoundation(p: FoundationParams): CalcResult {
  const items: CalcItem[] = [];
  let total = 0;
  const cover = p.cover || 40;

  function push(name: string, spec: string, length: string, grade: string, diameter: number, count: number, lengthM: number, color: string, formulaSteps?: FormulaStep[]) {
    const weightKg = count * lengthM * w(diameter);
    const steps = formulaSteps ? [...formulaSteps, weightSteps(name, count, lengthM, diameter)] : [weightSteps(name, count, lengthM, diameter)];
    items.push({ name, spec, length, weight: `${weightKg.toFixed(2)} kg`, color, grade, diameter, count, lengthM, weightKg, formulaSteps: steps });
    total += weightKg;
  }

  // X 向底筋: 沿 Y 向铺设，长度 = by - 2*cover
  const barX = parseSlabRebar(p.bottomBarX);
  const barXBend = (p.by-p.colBy)/2 < calcLaTable(barX.grade,barX.diameter,p.concreteGrade) ? 12*barX.diameter : 0;
  const barXBody = Math.max(0,p.by-2*cover-barX.diameter);
  const barXCurve = bentHorizontalCurve(-barXBody*.0005,barXBody*.0005,0,barX.diameter,barXBend*.001);
  const barXLen = barXCurve.getLength();
  const barXCount = slabBarPositions(p.bx, cover, barX.diameter, barX.spacing).length;
  const barXFormula: FormulaStep[] = [
    { label: '单根长度', formula: 'L = 水平中心线 + 两端圆弧及弯脚', substitution: `水平段=${barXBody}mm，端弯=${barXBend}mm`, result: `= ${(barXLen*1000).toFixed(1)} mm` },
    { label: '根数', formula: 'n = ⌊(bx - 2c - d) / s⌋ + 1', substitution: `= ⌊(${p.bx} - 2×${cover} - ${barX.diameter}) / ${barX.spacing}⌋ + 1`, result: `= ${barXCount}` },
  ];
  const barXShortCount = p.shortenBottomBarX && p.by >= 2500 ? Math.floor(barXCount/2) : 0;
  barXFormula[1] = { label:'全长筋根数',formula:'n全长 = n实布 - n减短',substitution:`${barXCount} - ${barXShortCount}`,result:`${barXCount-barXShortCount} 根` };
  push('X向底筋', p.bottomBarX, `${barXLen.toFixed(3)}m × ${barXCount-barXShortCount}`,
    barX.grade,barX.diameter,barXCount-barXShortCount,barXLen,'#C0392B',barXFormula);
  if(barXShortCount) {
    const shortLen=bentHorizontalCurve(-barXBody*.00045,barXBody*.00045,0,barX.diameter,barXBend*.001).getLength();
    push('X向底筋（减短）',p.bottomBarX,`${shortLen.toFixed(3)}m × ${barXShortCount}`,barX.grade,barX.diameter,barXShortCount,shortLen,'#C0392B');
  }

  // Y 向底筋: 沿 X 向铺设，长度 = bx - 2*cover
  const barY = parseSlabRebar(p.bottomBarY);
  const barYBend = (p.bx-p.colBx)/2 < calcLaTable(barY.grade,barY.diameter,p.concreteGrade) ? 12*barY.diameter : 0;
  const barYBody = Math.max(0,p.bx-2*cover-barY.diameter);
  const barYCurve = bentHorizontalCurve(-barYBody*.0005,barYBody*.0005,0,barY.diameter,barYBend*.001);
  const barYLen = barYCurve.getLength();
  const barYCount = slabBarPositions(p.by, cover, barY.diameter, barY.spacing).length;
  const barYFormula: FormulaStep[] = [
    { label: '单根长度', formula: 'L = 水平中心线 + 两端圆弧及弯脚', substitution: `水平段=${barYBody}mm，端弯=${barYBend}mm`, result: `= ${(barYLen*1000).toFixed(1)} mm` },
    { label: '根数', formula: 'n = ⌊(by - 2c - d) / s⌋ + 1', substitution: `= ⌊(${p.by} - 2×${cover} - ${barY.diameter}) / ${barY.spacing}⌋ + 1`, result: `= ${barYCount}` },
  ];
  const barYShortCount = p.shortenBottomBarY && p.bx >= 2500 ? Math.floor(barYCount/2) : 0;
  barYFormula[1] = { label:'全长筋根数',formula:'n全长 = n实布 - n减短',substitution:`${barYCount} - ${barYShortCount}`,result:`${barYCount-barYShortCount} 根` };
  push('Y向底筋', p.bottomBarY, `${barYLen.toFixed(3)}m × ${barYCount-barYShortCount}`,
    barY.grade,barY.diameter,barYCount-barYShortCount,barYLen,'#2980B9',barYFormula);
  if(barYShortCount) {
    const shortLen=bentHorizontalCurve(-barYBody*.00045,barYBody*.00045,0,barY.diameter,barYBend*.001).getLength();
    push('Y向底筋（减短）',p.bottomBarY,`${shortLen.toFixed(3)}m × ${barYShortCount}`,barY.grade,barY.diameter,barYShortCount,shortLen,'#2980B9');
  }

  // 柱插筋: 按 22G101-3 判定直锚/弯锚
  if (p.colMain) {
    const colR = parseRebar(p.colMain);
    const colCount = (p.columnCount || 1);
    const fSeismic = p.seismicGrade || '非抗震';
    const fLaE = calcLaE(colR.grade, colR.diameter, p.concreteGrade, fSeismic);
    const fAnchor = determineColFoundAnchor(p.h, cover, colR.diameter, fLaE);
    const fLlE = calcLlE(colR.grade, colR.diameter, p.concreteGrade, fSeismic);
    const fAnchorInFound = fAnchor.canStraight
      ? p.h - cover
      : fAnchor.straightPortion + fAnchor.bendLength;
    const insertSpec = foundationInsertSpec(p.h, cover, colR.diameter, barX.diameter, barY.diameter, colR.grade, p.concreteGrade, fSeismic);
    const insertLen = insertSpec.lengthMm / 1000;
    const colFormula: FormulaStep[] = [
      { label: '锚固判定', formula: fAnchor.canStraight ? '可用深度 ≥ laE → 直锚' : '可用深度 < laE → 弯锚',
        substitution: `可用=${p.h - cover}mm, laE=${fLaE}mm`, result: `→ ${fAnchor.anchorType === 'straight' ? '直锚' : '弯锚'} (场景${fAnchor.scenario})` },
      { label: '基础内锚固段', formula: fAnchor.canStraight ? 'L = h - c' : 'L = 直段 + 弯折',
        substitution: fAnchor.canStraight ? `= ${p.h} - ${cover}` : `= ${fAnchor.straightPortion} + ${fAnchor.bendLength}`,
        result: `= ${fAnchorInFound} mm` },
      { label: '搭接 llE', formula: 'llE = 1.4 × laE', substitution: `= 1.4 × ${fLaE}`, result: `= ${fLlE} mm` },
    ];
    if (colCount === 2) {
      colFormula.push({ label: '柱数', formula: 'n柱 = 2', substitution: '', result: `每柱${colR.count}根，共${colR.count * 2}根` });
    }
    colFormula.splice(1, colFormula.length - 1,
      { label: '模型底弯标高', formula: 'y = c + dX + dY + d柱/2 + 2', substitution: `= ${insertSpec.footYmm.toFixed(1)}`, result: 'mm（避让底部网片）' },
      { label: '竖向段与搭接', formula: 'Lv = H + llE - y', substitution: `= ${insertSpec.topYmm} - ${insertSpec.footYmm}`, result: `${(insertSpec.topYmm - insertSpec.footYmm).toFixed(1)} mm` },
      { label: '连续弯脚', formula: 'L = Lv + 弯脚 - (2 - π/2)R', substitution: `R=${insertSpec.radiusMm} mm，弯脚=${insertSpec.anchor.bendLength} mm`, result: `${insertSpec.lengthMm.toFixed(1)} mm（中心线展开）` },
    );
    push('柱插筋', p.colMain, `${insertLen.toFixed(2)}m × ${colR.count * colCount} (${fAnchor.anchorType === 'straight' ? '直锚' : '弯锚'})`,
      colR.grade, colR.diameter, colR.count * colCount, insertLen, '#8E44AD', colFormula);
  }

  // 双柱基础: 顶部柱间纵向受力钢筋 (22G101-3 p2-12)
  if ((p.columnCount || 1) === 2 && p.topBarX && p.colSpacing) {
    const topX = parseSlabRebar(p.topBarX);
    // 纵向受力钢筋: 沿 X 向铺设，长度 = 柱间距 + 2 * (柱外缘到基础边缘距离)
    const bandWidth = Math.min(p.topBandWidth || Math.max(p.colBy * 2,1200),p.by-2*cover);
    const topXLen = (p.colSpacing + p.colBx) / 1000;
    const topXCount = p.topBarXCount && p.topBarXCount > 0 ? p.topBarXCount : Math.floor(bandWidth / topX.spacing) + 1;
    const topXFormula: FormulaStep[] = [
      { label: '单根长度', formula: 'L = 柱间距 + 柱宽', substitution: `${p.colSpacing} + ${p.colBx}`, result: `= ${(topXLen*1000).toFixed(1)} mm` },
      { label: '根数', formula: '显式根数 / 柱间带按间距布置', substitution: `带宽=${bandWidth}mm，间距=${topX.spacing}mm`, result: `= ${topXCount}` },
    ];
    push('顶部纵向筋', p.topBarX, `${topXLen.toFixed(2)}m × ${topXCount}`,
      topX.grade, topX.diameter, topXCount, topXLen, '#E67E22', topXFormula);
  }

  // 双柱基础: 顶部柱间分布钢筋
  if ((p.columnCount || 1) === 2 && p.topBarY && p.colSpacing) {
    const topY = parseSlabRebar(p.topBarY);
    // 分布钢筋: 沿 Y 向铺设，长度 = by - 2*cover, 范围 = 柱间区域
    const topYLen = Math.min(p.topBandWidth || Math.max(p.colBy * 2,1200),p.by-2*cover) / 1000;
    const topYCount = Math.floor((p.colSpacing - p.colBx) / topY.spacing) + 1;
    const topYFormula: FormulaStep[] = [
      { label: '单根长度', formula: 'L = 柱间带实际宽度', substitution: `柱间带宽 ${topYLen*1000}mm`, result: `= ${(topYLen*1000).toFixed(1)} mm` },
      { label: '根数(柱间区域)', formula: 'n = (s - colBx) / s间距 + 1', substitution: `= (${p.colSpacing} - ${p.colBx}) / ${topY.spacing} + 1`, result: `= ${topYCount}` },
    ];
    push('顶部分布筋', p.topBarY, `${topYLen.toFixed(2)}m × ${topYCount}`,
      topY.grade, topY.diameter, topYCount, topYLen, '#27AE60', topYFormula);
  }

  const beamLayout=foundationBeamReinforcement(p);
  const beamGroups=new Map<string,typeof beamLayout.bars>();
  for(const bar of beamLayout.bars) {
    const key=`${bar.role}-${bar.row}-${bar.diameter}`;
    beamGroups.set(key,[...(beamGroups.get(key)||[]),bar]);
  }
  for(const bars of beamGroups.values()) {
    const bar=bars[0],name=`基础梁${bar.role==='top'?'顶':'底'}筋${bar.row?`（第${bar.row+1}排）`:''}`;
    push(name,bar.role==='top'?(p.foundationBeamTop||'4C20'):(p.foundationBeamBottom||'4C22'),`${(bar.lengthMm/1000).toFixed(3)}m × ${bars.length}`,
      bar.grade,bar.diameter,bars.length,bar.lengthMm/1000,bar.role==='top'?'#8E44AD':'#C0392B',
      [{label:'连续钢筋中心线',formula:'L = 直段 + 弯脚 + 圆弧调整',substitution:'与三维同排钢筋路径一致',result:`${bar.lengthMm.toFixed(1)} mm`}]);
  }
  if(beamLayout.stirrupSpec) {
    const stir=parseStirrup(p.foundationBeamStirrup||'A10@150(4)');
    for(const [i,hoop] of beamLayout.stirrupSpec.hoops.entries()) push(`基础梁${i?'内箍'+i:'外箍'}`,p.foundationBeamStirrup||'A10@150(4)',
      `${(hoop.lengthMm/1000).toFixed(3)}m × ${beamLayout.stirrupPositions.length}`,stir.grade,stir.diameter,
      beamLayout.stirrupPositions.length,hoop.lengthMm/1000,'#27AE60');
  }
  return buildResult(items, total, 'foundation');
}

// ═══════════════════════════════════════════════════════════════════
// 承台 (CT) — 钢筋用量计算
// ═══════════════════════════════════════════════════════════════════

export function calcPileCap(p: PileCapParams): CalcResult {
  const items: CalcItem[] = [];
  let total = 0;
  const cover = p.cover || 50;

  function pushItem(name: string, spec: string, length: string, grade: string, diameter: number, count: number, lengthM: number, color: string, formulaSteps?: FormulaStep[]) {
    const weightKg = count * lengthM * w(diameter);
    const steps = formulaSteps ? [...formulaSteps, weightSteps(name, count, lengthM, diameter)] : [weightSteps(name, count, lengthM, diameter)];
    items.push({ name, spec, length, weight: `${weightKg.toFixed(2)} kg`, color, grade, diameter, count, lengthM, weightKg, formulaSteps: steps });
    total += weightKg;
  }

  // X 向底筋: 沿 Y 向铺设，长度 = by - 2*cover
  const barX = parseSlabRebar(p.bottomBarX);
  const barXBend = determinePileCapRebarEnd(barX.diameter, 'round', p.pileDiameter, p.by/2-cover).bendLen * (determinePileCapRebarEnd(barX.diameter, 'round', p.pileDiameter, p.by/2-cover).needBend ? 1 : 0);
  const barXBody = Math.max(0,p.by-2*cover-barX.diameter);
  const barXCurve = bentHorizontalCurve(-barXBody*.0005,barXBody*.0005,0,barX.diameter,barXBend*.001);
  const barXLen = barXCurve.getLength();
  const barXCount = slabBarPositions(p.bx, cover, barX.diameter, barX.spacing).length;
  const barXFormula: FormulaStep[] = [
    { label: '单根长度', formula: 'L = 水平中心线 + 两端圆弧及弯脚', substitution: `水平段=${barXBody}mm，端弯=${barXBend}mm`, result: `= ${(barXLen*1000).toFixed(1)} mm` },
    { label: '根数', formula: 'n = ⌊(bx - 2c - d) / s⌋ + 1', substitution: `= ⌊(${p.bx} - 2×${cover} - ${barX.diameter}) / ${barX.spacing}⌋ + 1`, result: `= ${barXCount}` },
  ];
  pushItem('X向底筋', p.bottomBarX, `${barXLen.toFixed(2)}m × ${barXCount}`,
    barX.grade, barX.diameter, barXCount, barXLen, '#C0392B', barXFormula);

  // Y 向底筋: 沿 X 向铺设，长度 = bx - 2*cover
  const barY = parseSlabRebar(p.bottomBarY);
  const barYBend = determinePileCapRebarEnd(barY.diameter, 'round', p.pileDiameter, p.bx/2-cover).bendLen * (determinePileCapRebarEnd(barY.diameter, 'round', p.pileDiameter, p.bx/2-cover).needBend ? 1 : 0);
  const barYBody = Math.max(0,p.bx-2*cover-barY.diameter);
  const barYCurve = bentHorizontalCurve(-barYBody*.0005,barYBody*.0005,0,barY.diameter,barYBend*.001);
  const barYLen = barYCurve.getLength();
  const barYCount = slabBarPositions(p.by, cover, barY.diameter, barY.spacing).length;
  const barYFormula: FormulaStep[] = [
    { label: '单根长度', formula: 'L = 水平中心线 + 两端圆弧及弯脚', substitution: `水平段=${barYBody}mm，端弯=${barYBend}mm`, result: `= ${(barYLen*1000).toFixed(1)} mm` },
    { label: '根数', formula: 'n = ⌊(by - 2c - d) / s⌋ + 1', substitution: `= ⌊(${p.by} - 2×${cover} - ${barY.diameter}) / ${barY.spacing}⌋ + 1`, result: `= ${barYCount}` },
  ];
  pushItem('Y向底筋', p.bottomBarY, `${barYLen.toFixed(2)}m × ${barYCount}`,
    barY.grade, barY.diameter, barYCount, barYLen, '#2980B9', barYFormula);

  // 柱插筋: 按 22G101-3 判定直锚/弯锚 — determineColFoundAnchor
  if (p.colMain) {
    const colR = parseRebar(p.colMain);
    const seismic = p.seismicGrade || '非抗震';
    const laE = calcLaE(colR.grade, colR.diameter, p.concreteGrade, seismic);
    const anchorInfo = determineColFoundAnchor(p.h, cover, colR.diameter, laE);
    // 总长 = 承台内锚固段 + 承台上方柱身搭接(llE)
    const llE = calcLlE(colR.grade, colR.diameter, p.concreteGrade, seismic);
    const anchorInCap = anchorInfo.canStraight
      ? p.h - cover                      // 直锚: 从顶面到底保护层
      : anchorInfo.straightPortion + anchorInfo.bendLength; // 弯锚: 直段+弯折
    const insertSpec = foundationInsertSpec(p.h, cover, colR.diameter, barX.diameter, barY.diameter, colR.grade, p.concreteGrade, seismic);
    const insertLen = insertSpec.lengthMm / 1000;
    const colFormula: FormulaStep[] = [
      ...anchorSteps(colR.grade, colR.diameter, p.concreteGrade, seismic),
      { label: '锚固判定', formula: anchorInfo.canStraight ? '可用深度 ≥ laE → 直锚' : '可用深度 < laE → 弯锚',
        substitution: `可用=${p.h - cover}mm, laE=${laE}mm`, result: `→ ${anchorInfo.anchorType === 'straight' ? '直锚' : '弯锚'} (场景${anchorInfo.scenario})` },
      { label: '承台内锚固段', formula: anchorInfo.canStraight ? 'L_cap = h - c' : 'L_cap = 直段 + 弯折',
        substitution: anchorInfo.canStraight ? `= ${p.h} - ${cover}` : `= ${anchorInfo.straightPortion} + ${anchorInfo.bendLength}`,
        result: `= ${anchorInCap} mm` },
      { label: '搭接长度 llE', formula: 'llE = ζl × laE', substitution: `= 1.4 × ${laE}`, result: `= ${llE} mm` },
      { label: '插筋总长', formula: 'L = L_cap + llE', substitution: `= ${anchorInCap} + ${llE}`, result: `= ${anchorInCap + llE} mm = ${insertLen.toFixed(2)} m` },
    ];
    colFormula.splice(1, colFormula.length - 1,
      { label: '模型底弯标高', formula: 'y = c + dX + dY + d柱/2 + 2', substitution: `= ${insertSpec.footYmm.toFixed(1)}`, result: 'mm（避让底部网片）' },
      { label: '竖向段与搭接', formula: 'Lv = H + llE - y', substitution: `= ${insertSpec.topYmm} - ${insertSpec.footYmm}`, result: `${(insertSpec.topYmm - insertSpec.footYmm).toFixed(1)} mm` },
      { label: '连续弯脚', formula: 'L = Lv + 弯脚 - (2 - π/2)R', substitution: `R=${insertSpec.radiusMm} mm，弯脚=${insertSpec.anchor.bendLength} mm`, result: `${insertSpec.lengthMm.toFixed(1)} mm（中心线展开）` },
    );
    pushItem('柱插筋', p.colMain, `${insertLen.toFixed(2)}m × ${colR.count} (${anchorInfo.anchorType === 'straight' ? '直锚' : '弯锚'})`,
      colR.grade, colR.diameter, colR.count, insertLen, '#8E44AD', colFormula);
  }

  return buildResult(items, total, 'pilecap');
}

// ═══════════════════════════════════════════════════════════════════
// 筏板基础 (FB) — 钢筋用量计算
// ═══════════════════════════════════════════════════════════════════

export function calcRaft(p: RaftFoundationParams): CalcResult {
  const items: CalcItem[] = [];
  let total = 0;
  const cover = p.cover || 40;

  function push(name: string, spec: string, length: string, grade: string, diameter: number, count: number, lengthM: number, color: string, formulaSteps?: FormulaStep[]) {
    const weightKg = count * lengthM * w(diameter);
    const steps = formulaSteps ? [...formulaSteps, weightSteps(name, count, lengthM, diameter)] : [weightSteps(name, count, lengthM, diameter)];
    items.push({ name, spec, length, weight: `${weightKg.toFixed(2)} kg`, color, grade, diameter, count, lengthM, weightKg, formulaSteps: steps });
    total += weightKg;
  }

  // X 向底筋: 沿 Y 向铺设，长度 = ly - 2*cover
  const botX = parseSlabRebar(p.bottomBarX);
  const botXLen = (p.ly - 2 * cover) / 1000;
  const botXCount = Math.floor((p.lx - 2 * cover) / botX.spacing) + 1;
  const botXFormula: FormulaStep[] = [
    { label: '单根长度', formula: 'L = ly - 2c', substitution: `= ${p.ly} - 2×${cover}`, result: `= ${p.ly - 2 * cover} mm` },
    { label: '根数', formula: 'n = (lx - 2c) / s + 1', substitution: `= (${p.lx} - 2×${cover}) / ${botX.spacing} + 1`, result: `= ${botXCount}` },
  ];
  push('X向底筋', p.bottomBarX, `${botXLen.toFixed(2)}m × ${botXCount}`,
    botX.grade, botX.diameter, botXCount, botXLen, '#C0392B', botXFormula);

  // Y 向底筋: 沿 X 向铺设，长度 = lx - 2*cover
  const botY = parseSlabRebar(p.bottomBarY);
  const botYLen = (p.lx - 2 * cover) / 1000;
  const botYCount = Math.floor((p.ly - 2 * cover) / botY.spacing) + 1;
  const botYFormula: FormulaStep[] = [
    { label: '单根长度', formula: 'L = lx - 2c', substitution: `= ${p.lx} - 2×${cover}`, result: `= ${p.lx - 2 * cover} mm` },
    { label: '根数', formula: 'n = (ly - 2c) / s + 1', substitution: `= (${p.ly} - 2×${cover}) / ${botY.spacing} + 1`, result: `= ${botYCount}` },
  ];
  push('Y向底筋', p.bottomBarY, `${botYLen.toFixed(2)}m × ${botYCount}`,
    botY.grade, botY.diameter, botYCount, botYLen, '#2980B9', botYFormula);

  // X 向面筋
  if (p.topBarX) {
    const topX = parseSlabRebar(p.topBarX);
    const topXLen = (p.ly - 2 * cover) / 1000;
    const topXCount = Math.floor((p.lx - 2 * cover) / topX.spacing) + 1;
    push('X向面筋', p.topBarX, `${topXLen.toFixed(2)}m × ${topXCount}`,
      topX.grade, topX.diameter, topXCount, topXLen, '#E67E22');
  }

  // Y 向面筋
  if (p.topBarY) {
    const topY = parseSlabRebar(p.topBarY);
    const topYLen = (p.lx - 2 * cover) / 1000;
    const topYCount = Math.floor((p.ly - 2 * cover) / topY.spacing) + 1;
    push('Y向面筋', p.topBarY, `${topYLen.toFixed(2)}m × ${topYCount}`,
      topY.grade, topY.diameter, topYCount, topYLen, '#27AE60');
  }

  // 柱插筋: 按 22G101-3 判定直锚/弯锚 (beamSlab 用 max(h, beamH))
  if (p.colMain) {
    const colR = parseRebar(p.colMain);
    const colTotal = p.colCountX * p.colCountY;
    const foundH = p.raftType === 'beamSlab' ? Math.max(p.h, p.beamH ?? 900) : p.h;
    const seismic = p.seismicGrade || '非抗震';
    const raftLaE = calcLaE(colR.grade, colR.diameter, p.concreteGrade, seismic);
    const raftAnchor = determineColFoundAnchor(foundH, cover, colR.diameter, raftLaE);
    const raftLlE = calcLlE(colR.grade, colR.diameter, p.concreteGrade, seismic);
    const raftAnchorInFound = raftAnchor.canStraight
      ? foundH - cover
      : raftAnchor.straightPortion + raftAnchor.bendLength;
    const insertSpec = foundationInsertSpec(foundH, cover, colR.diameter, botX.diameter, botY.diameter, colR.grade, p.concreteGrade, seismic, p.raftType==='beamSlab'?raftBeamArrangement(p).minFootSurfaceMm:0);
    const insertLen = insertSpec.lengthMm / 1000;
    const colFormula: FormulaStep[] = [
      { label: '锚固判定', formula: raftAnchor.canStraight ? '可用深度 ≥ laE → 直锚' : '可用深度 < laE → 弯锚',
        substitution: `可用=${foundH - cover}mm, laE=${raftLaE}mm`, result: `→ ${raftAnchor.anchorType === 'straight' ? '直锚' : '弯锚'} (场景${raftAnchor.scenario})` },
      { label: '基础内锚固段', formula: raftAnchor.canStraight ? 'L = h - c' : 'L = 直段 + 弯折',
        substitution: raftAnchor.canStraight ? `= ${foundH} - ${cover}` : `= ${raftAnchor.straightPortion} + ${raftAnchor.bendLength}`,
        result: `= ${raftAnchorInFound} mm` },
      { label: '搭接 llE', formula: 'llE = 1.4 × laE', substitution: `= 1.4 × ${raftLaE}`, result: `= ${raftLlE} mm` },
      { label: '柱数', formula: 'n柱 = colCountX × colCountY', substitution: `= ${p.colCountX} × ${p.colCountY}`, result: `= ${colTotal}` },
    ];
    colFormula.splice(1, colFormula.length - 1,
      { label: '模型底弯标高', formula: 'y = c + dX + dY + d柱/2 + 2', substitution: `= ${insertSpec.footYmm.toFixed(1)}`, result: 'mm（避让底部网片）' },
      { label: '竖向段与搭接', formula: 'Lv = H + llE - y', substitution: `= ${insertSpec.topYmm} - ${insertSpec.footYmm}`, result: `${(insertSpec.topYmm - insertSpec.footYmm).toFixed(1)} mm` },
      { label: '连续弯脚', formula: 'L = Lv + 弯脚 - (2 - π/2)R', substitution: `R=${insertSpec.radiusMm} mm，弯脚=${insertSpec.anchor.bendLength} mm`, result: `${insertSpec.lengthMm.toFixed(1)} mm（中心线展开）` },
    );
    push('柱插筋', p.colMain, `${insertLen.toFixed(2)}m × ${colR.count * colTotal} (${raftAnchor.anchorType === 'straight' ? '直锚' : '弯锚'})`,
      colR.grade, colR.diameter, colR.count * colTotal, insertLen, '#8E44AD', colFormula);
  }

  // ── 梁板式筏基 JL 基础梁钢筋 ──
  if (p.raftType === 'beamSlab') {
    // X方向基础梁 (沿lx, 共colCountY道) + Y方向基础梁 (沿ly, 共colCountX道)
    const xBeamLen = p.lx / 1000;
    const yBeamLen = p.ly / 1000;
    const totalXBeams = p.colCountY;
    const totalYBeams = p.colCountX;

    if (p.beamBottom) {
      const bb = parseRebar(p.beamBottom);
      const botLen = xBeamLen;
      push('JL底部纵筋 (B)', p.beamBottom,
        `${botLen.toFixed(2)}m × ${bb.count * totalXBeams} (仅X向，Y向另列)`,
        bb.grade, bb.diameter,
        bb.count * totalXBeams,
        botLen, '#C0392B');
      // Y-direction bars
      push('JL底部纵筋 B (Y向)', p.beamBottom, `${yBeamLen.toFixed(2)}m × ${bb.count * totalYBeams}`,
        bb.grade, bb.diameter, bb.count * totalYBeams, yBeamLen, '#C0392B');
    }

    if (p.beamTop) {
      const bt = parseRebar(p.beamTop);
      push('JL顶部纵筋 T (X向)', p.beamTop, `${xBeamLen.toFixed(2)}m × ${bt.count * totalXBeams}`,
        bt.grade, bt.diameter, bt.count * totalXBeams, xBeamLen, '#E67E22');
      push('JL顶部纵筋 T (Y向)', p.beamTop, `${yBeamLen.toFixed(2)}m × ${bt.count * totalYBeams}`,
        bt.grade, bt.diameter, bt.count * totalYBeams, yBeamLen, '#E67E22');
    }

    const arrangement=raftBeamArrangement(p),stir=arrangement.stir;
    for(const [direction,spec,stations,beamCount] of [
      ['X',arrangement.xSpec,arrangement.xStations,p.colCountY],
      ['Y',arrangement.ySpec,arrangement.yStations,p.colCountX],
    ] as const) for(const [i,hoop] of spec.hoops.entries()) {
      const count=stations.length*beamCount;
      push(`JL${i?'内箍'+i:'外箍'}（${direction}向）`,p.beamStirrup||'A10@150(4)',`${(hoop.lengthMm/1000).toFixed(3)}m × ${count}`,
        stir.grade,stir.diameter,count,hoop.lengthMm/1000,'#27AE60',[
          {label:'独立箍单根展开',formula:'矩形开口箍 + 两端135°弯钩',substitution:`${hoop.widthMm.toFixed(1)} × ${hoop.heightMm.toFixed(1)}mm`,result:`${hoop.lengthMm.toFixed(1)} mm`},
          {label:'实布根数',formula:'每道梁的箍筋站位数 × 梁道数',substitution:`${stations.length} × ${beamCount}`,result:`${count} 个（全长按较小箍距布置）`},
        ]);
    }
  }

  // ── 平板式筏基 ZXB 柱下板带附加钢筋 ──
  if (p.raftType === 'flatPlate' && p.colStripWidth) {
    if (p.colStripBarX) {
      const csX = parseSlabRebar(p.colStripBarX);
      // ZXB X向附加筋: 分布在Y列线的±colStripWidth/2带内，沿X向通长
      const csXLen = (p.lx - 2 * cover) / 1000;
      const csXCount = raftColumnStripPositions(p,'x').length;
      push('ZXB X向附加底筋', p.colStripBarX, `${csXLen.toFixed(2)}m × ${csXCount}`,
        csX.grade, csX.diameter, csXCount, csXLen, '#D35400');
    }
    if (p.colStripBarY) {
      const csY = parseSlabRebar(p.colStripBarY);
      const csYLen = (p.ly - 2 * cover) / 1000;
      const csYCount = raftColumnStripPositions(p,'y').length;
      push('ZXB Y向附加底筋', p.colStripBarY, `${csYLen.toFixed(2)}m × ${csYCount}`,
        csY.grade, csY.diameter, csYCount, csYLen, '#D35400');
    }
  }

  return buildResult(items, total, 'raft');
}
