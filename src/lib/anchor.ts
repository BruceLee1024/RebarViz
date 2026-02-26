/**
 * 22G101 锚固长度、搭接长度计算
 * 基于《混凝土结构设计规范》GB50010-2010 及 22G101 图集
 */

// 混凝土等级对应轴心抗拉强度设计值 ft (N/mm²)
const FT: Record<string, number> = {
  C20: 1.10, C25: 1.27, C30: 1.43, C35: 1.57,
  C40: 1.71, C45: 1.80, C50: 1.89, C55: 1.96,
  C60: 2.04,
};

// 钢筋等级对应抗拉强度设计值 fy (N/mm²)
const FY: Record<string, number> = {
  A: 270,  // HPB300
  B: 300,  // HRB335
  C: 360,  // HRB400
  D: 360,  // RRB400
  E: 360,  // HRBF400
};

export type ConcreteGrade = 'C20' | 'C25' | 'C30' | 'C35' | 'C40' | 'C45' | 'C50' | 'C55' | 'C60';
export type SeismicGrade = '一级' | '二级' | '三级' | '四级' | '非抗震';

export const CONCRETE_GRADES: ConcreteGrade[] = ['C20', 'C25', 'C30', 'C35', 'C40', 'C45', 'C50', 'C55', 'C60'];
export const SEISMIC_GRADES: SeismicGrade[] = ['一级', '二级', '三级', '四级', '非抗震'];

// 保护层厚度推荐值 (mm)，按构件类型和环境类别（一类环境）
export const COVER_DEFAULTS: Record<string, number> = {
  beam: 25,
  column: 25,
  slab: 15,
  joint: 25,
};

/**
 * 基本锚固长度 lab (mm)
 * lab = α × (fy / ft) × d
 * α: 钢筋外形系数，光圆 0.16，带肋 0.14
 */
export function calcLab(rebarGrade: string, diameter: number, concreteGrade: ConcreteGrade): number {
  const fy = FY[rebarGrade] || 360;
  const ft = FT[concreteGrade] || 1.43;
  const alpha = rebarGrade === 'A' ? 0.16 : 0.14; // 光圆 vs 带肋
  const lab = alpha * (fy / ft) * diameter;
  return Math.ceil(lab);
}

/**
 * 锚固长度 la (mm)
 * la = ζa × lab，且 ≥ max(200, 10d)
 * ζa: 锚固长度修正系数
 */
export function calcLa(rebarGrade: string, diameter: number, concreteGrade: ConcreteGrade): number {
  const lab = calcLab(rebarGrade, diameter, concreteGrade);
  const zetaA = 1.0; // 简化：普通钢筋，非环氧涂层
  const la = Math.ceil(zetaA * lab);
  return Math.max(la, 200, 10 * diameter);
}

/**
 * 抗震锚固长度 laE (mm)
 * laE = ζaE × la
 * ζaE: 抗震等级修正系数
 */
export function calcLaE(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade, seismicGrade: SeismicGrade
): number {
  const la = calcLa(rebarGrade, diameter, concreteGrade);
  const zetaAE = seismicGrade === '非抗震' ? 1.0 : 1.15; // 抗震时 ×1.15
  const laE = Math.ceil(zetaAE * la);
  return Math.max(laE, 200, 10 * diameter);
}

/**
 * 基本搭接长度 ll (mm)
 * ll = ζl × la
 * ζl: 搭接长度修正系数，按搭接百分率
 */
export function calcLl(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade, lapPercent: number = 50
): number {
  const la = calcLa(rebarGrade, diameter, concreteGrade);
  // 搭接百分率修正系数
  let zetaL = 1.2;
  if (lapPercent <= 25) zetaL = 1.2;
  else if (lapPercent <= 50) zetaL = 1.4;
  else zetaL = 1.6;
  const ll = Math.ceil(zetaL * la);
  return Math.max(ll, 300);
}

/**
 * 抗震搭接长度 llE (mm)
 */
export function calcLlE(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade, seismicGrade: SeismicGrade,
  lapPercent: number = 50
): number {
  const laE = calcLaE(rebarGrade, diameter, concreteGrade, seismicGrade);
  let zetaL = 1.2;
  if (lapPercent <= 25) zetaL = 1.2;
  else if (lapPercent <= 50) zetaL = 1.4;
  else zetaL = 1.6;
  const llE = Math.ceil(zetaL * laE);
  return Math.max(llE, 300);
}

/**
 * 弯锚弯折段长度 (mm)
 * 22G101: 弯折段 = 15d (梁筋弯锚入柱，22G101-1 标准)
 */
export function calcBendLength(diameter: number): number {
  return 15 * diameter;
}

/**
 * 梁端支座锚固判断与计算 (22G101-1)
 * 直锚条件: laE ≤ hc - 保护层 (即柱宽足够容纳直锚)
 * 直锚长度: max(laE, 0.5*hc + 5d)
 * 弯锚: 直段 ≥ max(0.4*laE, 0.5*hc+5d 不适用时)，弯折15d
 *        伸至柱外侧纵筋内侧
 */
export interface BeamEndAnchor {
  canStraight: boolean;     // 是否满足直锚条件
  straightLen: number;      // 直锚长度 mm
  bentStraightPart: number; // 弯锚直段长度 mm (≥0.4laE)
  bentBendPart: number;     // 弯锚弯折段 15d mm
  laE: number;              // 抗震锚固长度
  hc: number;               // 柱截面宽度
}

export function calcBeamEndAnchor(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade, seismicGrade: SeismicGrade,
  hc: number, cover: number
): BeamEndAnchor {
  const laE = calcLaE(rebarGrade, diameter, concreteGrade, seismicGrade);
  const availableDepth = hc - cover; // 柱内可用锚固深度
  const canStraight = laE <= availableDepth;
  const straightLen = Math.max(laE, Math.ceil(0.5 * hc + 5 * diameter));
  const bentStraightPart = Math.max(Math.ceil(0.4 * laE), Math.ceil(0.5 * hc + 5 * diameter));
  const bentBendPart = 15 * diameter;

  return { canStraight, straightLen, bentStraightPart, bentBendPart, laE, hc };
}

/**
 * 梁支座负筋伸入跨内长度 (mm)
 * 22G101: 第一排 ln/3，第二排 ln/4
 * ln: 梁净跨
 */
export function calcSupportRebarLength(beamNetSpan: number, row: 1 | 2 = 1): number {
  return row === 1 ? Math.ceil(beamNetSpan / 3) : Math.ceil(beamNetSpan / 4);
}

/**
 * 梁下部筋伸入支座锚固 (22G101-1)
 * 端支座: 同上部筋锚固规则 (直锚 laE 或弯锚 0.4laE+15d)
 * 中间支座: 贯穿或在节点外搭接，搭接长度 ≥ llE 且 ≥ 1.5h0
 */
export function calcBottomBarAnchor(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade, seismicGrade: SeismicGrade
): number {
  const laE = calcLaE(rebarGrade, diameter, concreteGrade, seismicGrade);
  return Math.max(laE, 12 * diameter);
}

/**
 * 梁下部筋中间节点搭接长度 (22G101-1)
 * 中间层中间节点: 梁下部筋在节点外搭接
 * 搭接长度 ≥ llE 且 ≥ 1.5h0 (h0 = h - cover - d/2)
 */
export function calcBottomBarLapAtMiddleJoint(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade, seismicGrade: SeismicGrade,
  beamH: number, cover: number
): number {
  const llE = calcLlE(rebarGrade, diameter, concreteGrade, seismicGrade);
  const h0 = beamH - cover - diameter / 2;
  return Math.max(llE, Math.ceil(1.5 * h0));
}

/**
 * 板底筋伸入支座长度 (mm)
 * 22G101: ≥ 5d 且 ≥ la/2 (简支端)
 */
export function calcSlabBottomAnchor(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade
): number {
  const la = calcLa(rebarGrade, diameter, concreteGrade);
  return Math.max(5 * diameter, Math.ceil(la / 2));
}

/**
 * 柱纵筋搭接区域 (mm)
 * 22G101: 柱纵筋连接区域在柱净高下部 1/6 以上、根部 500mm 以上
 */
export function calcColumnLapZone(columnNetHeight: number): { start: number; end: number } {
  const start = Math.max(500, Math.ceil(columnNetHeight / 6));
  const end = start + 500; // 搭接区域长度约 500mm
  return { start, end };
}

/**
 * 综合计算结果
 */
export interface AnchorCalcResult {
  lab: number;    // 基本锚固长度
  la: number;     // 锚固长度
  laE: number;    // 抗震锚固长度
  ll: number;     // 搭接长度
  llE: number;    // 抗震搭接长度
  bendLen: number; // 弯折段长度
}

export function calcAnchorAll(
  rebarGrade: string, diameter: number,
  concreteGrade: ConcreteGrade, seismicGrade: SeismicGrade
): AnchorCalcResult {
  return {
    lab: calcLab(rebarGrade, diameter, concreteGrade),
    la: calcLa(rebarGrade, diameter, concreteGrade),
    laE: calcLaE(rebarGrade, diameter, concreteGrade, seismicGrade),
    ll: calcLl(rebarGrade, diameter, concreteGrade),
    llE: calcLlE(rebarGrade, diameter, concreteGrade, seismicGrade),
    bendLen: calcBendLength(diameter),
  };
}
