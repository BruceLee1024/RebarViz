/**
 * 钢筋构造要求 — 集中管理 GB50010-2010 / 22G101 / GB50011 规范常量与规则
 *
 * 所有构件共用的构造规则统一从此模块导出，方便后续扩展新构件类型。
 * 各规则均标注规范条文出处。
 */

import type { SeismicGrade } from './anchor';

// ═══════════════════════════════════════════════════════════════════
// 1. 钢筋几何 / 材料常量
// ═══════════════════════════════════════════════════════════════════

/** 标准钢筋直径序列 (mm) */
export const STANDARD_DIAMETERS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40] as const;

/** 钢筋理论重量 kg/m — GB/T 1499.2 */
export const REBAR_WEIGHT_PER_M: Record<number, number> = {
  6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888,
  14: 1.21, 16: 1.58, 18: 2.00, 20: 2.47,
  22: 2.98, 25: 3.85, 28: 4.83, 32: 6.31,
  36: 7.99, 40: 9.87,
};

/** 单根钢筋截面面积 mm² */
export function rebarArea(d: number): number {
  return Math.PI * d * d / 4;
}

/** 单根钢筋理论重量 kg/m（无查表时用 π/4·d²·7850/1e6） */
export function rebarWeightPerM(d: number): number {
  return REBAR_WEIGHT_PER_M[d] ?? (rebarArea(d) * 7850 / 1e6);
}

// ═══════════════════════════════════════════════════════════════════
// 2. 保护层厚度 (mm) — GB50010 §8.2.1
// ═══════════════════════════════════════════════════════════════════

/** 一类环境最小保护层 (mm)，按构件类型 */
export const COVER_MIN: Record<string, number> = {
  beam: 25,
  column: 25,
  slab: 15,
  stair: 15,
  foundation: 40,
  shearwall: 15,
  pilecap: 40,
  joint: 25,
};

/** 保护层推荐值 (mm)，按构件类型（一类环境） */
export const COVER_DEFAULT: Record<string, number> = {
  beam: 25,
  column: 25,
  slab: 15,
  stair: 15,
  foundation: 40,
  shearwall: 20,
  pilecap: 40,
  joint: 25,
};

// ═══════════════════════════════════════════════════════════════════
// 3. 钢筋净距 — GB50010 §9.2.1 / §8.3.1
// ═══════════════════════════════════════════════════════════════════

/** 梁/柱纵筋最小净距 (mm) — GB50010 §9.2.1 */
export const MIN_CLEAR_SPACING = {
  /** 水平净距: ≥ max(25, d, 1.25dg)，简化取 max(25, d) */
  horizontal: (d: number) => Math.max(25, d),
  /** 多排纵筋竖向净距: ≥ max(25, d) — GB50010 §9.2.1 */
  vertical: (d: number) => Math.max(25, d),
  /** 混合直径时取两排中较大值 */
  verticalMixed: (d1: number, d2: number) => Math.max(25, d1, d2),
};

// ═══════════════════════════════════════════════════════════════════
// 4. 配筋率限值
// ═══════════════════════════════════════════════════════════════════

/**
 * 梁/板纵筋最小配筋率 — GB50010 §8.5.1
 * ρmin = max(0.2%, 0.45·ft/fy)
 */
export function beamRhoMin(ft: number, fy: number): number {
  return Math.max(0.002, 0.45 * ft / fy);
}

/** 梁纵筋配筋率工程简化上限 — 通常取 2.5% */
export const BEAM_RHO_MAX = 0.025;

/**
 * 柱纵筋最小配筋率 — GB50010 §8.5.1 / GB50011 §6.3.7
 * 按抗震等级不同
 */
export const COLUMN_RHO_MIN: Record<string, number> = {
  '一级': 0.01,
  '二级': 0.008,
  '三级': 0.007,
  '四级': 0.006,
  '非抗震': 0.006,
};

/** 柱纵筋配筋率上限 — GB50010 §8.5.1: ≤ 5% */
export const COLUMN_RHO_MAX = 0.05;

/** 剪力墙分布筋最小配筋率 — GB50010 §11.7.12: 抗震时 ≥ 0.25% */
export const WALL_RHO_MIN = 0.0025;

// ═══════════════════════════════════════════════════════════════════
// 5. 箍筋构造要求
// ═══════════════════════════════════════════════════════════════════

/**
 * 箍筋加密区最大间距 (mm) — GB50011 §6.3.3
 * 取 min(nd, limit)，n 和 limit 随抗震等级变化
 */
export function maxStirrupSpacingDense(seismicGrade: SeismicGrade, d: number): number {
  switch (seismicGrade) {
    case '一级': return Math.min(6 * d, 100);
    case '二级': return Math.min(8 * d, 100);
    case '三级': return Math.min(8 * d, 150);
    case '四级': return Math.min(8 * d, 150);
    default: return 150;
  }
}

/** 箍筋最小直径 (mm) — GB50011 §6.3.3 */
export function minStirrupDiameter(seismicGrade: SeismicGrade): number {
  switch (seismicGrade) {
    case '一级': return 10;
    case '二级': return 8;
    case '三级': return 8;
    case '四级': return 6;
    default: return 6;
  }
}

/**
 * 梁箍筋加密区长度 (mm) — 22G101-1 / GB50011 §6.3.3
 * l_dense = max(2h, 500)
 */
export function beamDenseZoneLength(h: number): number {
  return Math.max(2 * h, 500);
}

/**
 * 柱箍筋加密区长度 (mm) — GB50011 §6.3.9
 * 柱端加密区: max(hc, hn/6, 500)
 * hc = 截面长边尺寸, hn = 柱净高
 */
export function columnDenseZoneLength(hc: number, hn: number): number {
  return Math.max(hc, Math.ceil(hn / 6), 500);
}

// ═══════════════════════════════════════════════════════════════════
// 6. 纵筋构造要求
// ═══════════════════════════════════════════════════════════════════

/** 梁上/下部通长筋最少根数 — 22G101 构造: ≥ 2 根 */
export const BEAM_MIN_THROUGH_BAR_COUNT = 2;

/** 柱纵筋最少根数 — 矩形截面每侧至少2根 → 总共 ≥ 4 根 */
export const COLUMN_MIN_MAIN_BAR_COUNT = 4;

/** 柱纵筋最小直径 (mm) — GB50010 §8.5.1 */
export function columnMinMainDiameter(seismicGrade: SeismicGrade): number {
  return (seismicGrade === '一级' || seismicGrade === '二级') ? 16 : 14;
}

/** 混合直径时大直径钢筋应放外排(靠截面边缘) — 22G101 构造要求 */
export const MIXED_DIA_OUTER_ROW_LARGER = true;

// ═══════════════════════════════════════════════════════════════════
// 7. 腰筋 / 抗扭筋构造
// ═══════════════════════════════════════════════════════════════════

/**
 * 构造腰筋设置条件 — GB50010 §9.2.13
 * 梁腹板高度 hw ≥ 450mm 时需设构造腰筋，间距 ≤ 200mm
 */
export const SIDE_BAR_REQUIRED_HW = 450;
export const SIDE_BAR_MAX_SPACING = 200;

/**
 * 拉筋规格自动确定 — 22G101
 * b ≤ 350mm → HPB300 Φ6 (A6)
 * b > 350mm → 同箍筋规格
 */
export const TIE_BAR_WIDTH_THRESHOLD = 350;

// ═══════════════════════════════════════════════════════════════════
// 8. 板构造要求
// ═══════════════════════════════════════════════════════════════════

/** 板最小厚度 (mm) — GB50010 §9.1.2 */
export const SLAB_MIN_THICKNESS = 60;

/** 板受力筋最大间距 (mm) — GB50010 §9.1.3 */
export function slabMaxBarSpacing(thickness: number): number {
  return thickness <= 150 ? 200 : Math.min(Math.round(1.5 * thickness), 250);
}

/** 板受力筋最小直径 (mm) */
export const SLAB_MIN_BAR_DIAMETER = 6;

/** 板分布筋最小直径 (mm) — GB50010 §9.1.6 */
export const SLAB_DIST_MIN_DIAMETER = 6;

/** 板分布筋最大间距 (mm) — GB50010 §9.1.6 */
export const SLAB_DIST_MAX_SPACING = 250;

/** 板分布筋搭接长度 (mm) — 22G101 */
export const SLAB_DIST_LAP_LENGTH = 150;

// ─── 22G101 板底筋锚入支座构造 ───

/**
 * 板底筋伸入支座锚固方式 — 22G101 页4-33
 * @param supportType 支座类型
 * @param d 钢筋直径
 * @param la 基本锚固长度
 * @returns { straight: 直段长度, bend: 弯折长度(0=无弯折), description: 说明 }
 */
export function slabBottomAnchorDetail(
  supportType: 'simple' | 'continuous' | 'cantilever',
  d: number,
  la: number,
): { straight: number; bend: number; description: string } {
  switch (supportType) {
    case 'simple':
      // 简支端: 伸入支座 ≥ 5d，弯折上去 ≥ 15d
      return {
        straight: Math.max(5 * d, Math.ceil(la / 2)),
        bend: 15 * d,
        description: `简支端: 伸入支座≥${Math.max(5 * d, Math.ceil(la / 2))}mm, 弯折≥${15 * d}mm (22G101)`,
      };
    case 'continuous':
      // 连续端: 伸入支座 ≥ la/2 或 ≥ 5d (取大值)
      return {
        straight: Math.max(5 * d, Math.ceil(la / 2)),
        bend: 0,
        description: `连续端: 伸入支座≥${Math.max(5 * d, Math.ceil(la / 2))}mm (22G101)`,
      };
    case 'cantilever':
      // 悬挑端: 底筋为构造筋，全部伸入
      return {
        straight: la,
        bend: 0,
        description: `悬挑端: 底筋伸入支座≥la=${la}mm (22G101)`,
      };
  }
}

// ─── 22G101 支座负筋构造 ───

/**
 * 支座负筋伸入跨中长度 — 22G101 页4-34
 *
 * 端支座 (end): 从柱(墙)边伸入板内 ≥ ln/4
 * 中间支座 (middle):
 *   第一排: 从支座中线向两侧各伸入 ≥ ln/3 (ln取较大跨净跨)
 *   第二排: 从支座中线向两侧各伸入 ≥ ln/4
 *
 * @param ln 净跨长度
 * @param supportPos 支座位置: 'end'=端支座, 'middle'=中间支座
 * @param row 排号 (仅中间支座区分)
 */
export function slabNegBarExtend(
  ln: number,
  supportPos: 'end' | 'middle' = 'end',
  row: 1 | 2 = 1,
): number {
  if (supportPos === 'end') return Math.ceil(ln / 4);
  // 中间支座: 第一排 ln/3, 第二排 ln/4
  return row === 1 ? Math.ceil(ln / 3) : Math.ceil(ln / 4);
}

/** 支座负筋端支座弯折长度 — 22G101: ≥ 12d */
export function slabNegBarBend(d: number): number {
  return 12 * d;
}

/**
 * 支座负筋在支座处的锚固方式 — 22G101
 *
 * 端支座: 弯折向下 ≥ 12d (不直通)
 * 中间支座: 直通过支座 (不弯折)，两侧各伸入跨中
 *
 * @returns { bendDown: 弯折长度(0=直通), description }
 */
export function slabNegBarAnchorAtSupport(
  supportPos: 'end' | 'middle',
  d: number,
): { bendDown: number; description: string } {
  if (supportPos === 'end') {
    const bend = 12 * d;
    return {
      bendDown: bend,
      description: `端支座: 弯折向下≥12d=${bend}mm (22G101)`,
    };
  }
  return {
    bendDown: 0,
    description: '中间支座: 直通过支座，两侧各伸入跨中 (22G101)',
  };
}

// ─── 22G101 悬臂板钢筋构造 ───

/**
 * 悬臂板上部受力筋构造 — 22G101
 *
 * 1. 受力筋从悬臂根部伸至自由端，自由端弯折向下 ≥ 12d
 * 2. 受力筋从根部锚入相邻板跨 ≥ ln/4 (ln=相邻板净跨)
 * 3. 下部配分布筋 (构造钢筋)
 */
export function cantileverSlabTopBar(
  cantileverLen: number,
  adjacentSpan: number,
  d: number,
): { totalLen: number; cantileverPart: number; anchorPart: number; freeEndBend: number; description: string } {
  const freeEndBend = 12 * d;
  const anchorPart = Math.ceil(adjacentSpan / 4);
  const cantileverPart = cantileverLen;
  const totalLen = cantileverPart + anchorPart + freeEndBend;
  return {
    totalLen,
    cantileverPart,
    anchorPart,
    freeEndBend,
    description: `悬臂板受力筋: 悬挑段${cantileverPart}mm + 锚入相邻跨≥ln/4=${anchorPart}mm + 自由端弯折12d=${freeEndBend}mm (22G101)`,
  };
}

// ─── 板跨厚比限值 ───

/**
 * 板跨厚比限值 — GB50010 §9.1.2
 * 单向板: lmin/h ≤ 40 (简支), ≤ 45 (连续)
 * 双向板: lmin/h ≤ 45 (简支), ≤ 50 (连续)
 * 悬挑板: l/h ≤ 12
 */
export function slabSpanThicknessLimit(
  supportType: 'simple' | 'continuous' | 'cantilever',
  isTwoWay: boolean,
): number {
  if (supportType === 'cantilever') return 12;
  if (isTwoWay) return supportType === 'simple' ? 45 : 50;
  return supportType === 'simple' ? 40 : 45;
}

// ═══════════════════════════════════════════════════════════════════
// 9. 剪力墙构造要求
// ═══════════════════════════════════════════════════════════════════

/** 分布筋最大间距 (mm) — GB50010 §11.7.12 */
export const WALL_DIST_MAX_SPACING = 300;

/** 分布筋最小直径 (mm) — GB50010 §11.7.12 */
export const WALL_DIST_MIN_DIAMETER = 8;

/** 边缘构件纵筋最少根数 — GB50010 §11.7.14 */
export const WALL_BOUNDARY_MIN_BAR_COUNT = 4;

// ═══════════════════════════════════════════════════════════════════
// 10. 楼梯构造要求 — GB50352 / 22G101-2
// ═══════════════════════════════════════════════════════════════════

/** 踏步舒适度公式: 2h + b ≈ 600mm (550~650) — GB50352 §6.7.7 */
export const STAIR_COMFORT = { target: 600, min: 550, max: 650 };

/** 踏步高度限值 (mm) */
export const STAIR_STEP_HEIGHT = { warn: 175, max: 200 };

/** 踏步宽度限值 (mm) */
export const STAIR_STEP_WIDTH = { warn: 260, min: 220 };

/** 梯段最小宽度 (mm) — GB50352 §6.7.5 */
export const STAIR_MIN_FLIGHT_WIDTH = 1000;

/**
 * 梯板厚度建议范围 — 22G101-2
 * t = L/25 ~ L/30 (L: 梯板斜长)
 */
export function stairSlabThicknessRange(slabDiagonalLen: number): { min: number; max: number } {
  return {
    min: Math.round(slabDiagonalLen / 30),
    max: Math.round(slabDiagonalLen / 25),
  };
}

/** 楼梯受力筋最小直径 (mm) */
export const STAIR_MIN_BAR_DIAMETER = 8;

/** 楼梯受力筋间距限值 (mm) */
export const STAIR_BAR_SPACING = { min: 70, max: 200 };

// ═══════════════════════════════════════════════════════════════════
// 11. 支座负筋构造 — 22G101-1
// ═══════════════════════════════════════════════════════════════════

/**
 * 支座负筋伸入跨内长度比 — 22G101
 * 端支座: ln/4
 * 中间支座: 第一排 ln/3，第二排 ln/4
 */
export const SUPPORT_BAR_EXTEND_RATIO = {
  end: 1 / 4,
  middleRow1: 1 / 3,
  middleRow2: 1 / 4,
};

// ═══════════════════════════════════════════════════════════════════
// 12. 锚固 / 搭接通用规则 (计算逻辑仍在 anchor.ts)
// ═══════════════════════════════════════════════════════════════════

/** 钢筋外形系数 α — GB50010 §8.3.1 */
export const ANCHOR_ALPHA = { plain: 0.16, deformed: 0.14 };

/** 抗震锚固系数 ζaE — GB50010 §8.3.1 */
export const SEISMIC_ANCHOR_FACTOR = { seismic: 1.15, nonSeismic: 1.0 };

/** 搭接长度修正系数 ζl — GB50010 §8.4.3 */
export const LAP_FACTOR: Record<string, number> = { '25': 1.2, '50': 1.4, '100': 1.6 };

/**
 * 根据搭接百分率查取 ζl 修正系数 — GB50010 §8.4.3
 * ≤ 25% → 1.2，≤ 50% → 1.4，> 50% → 1.6
 */
export function lapFactor(lapPercent: number): number {
  if (lapPercent <= 25) return 1.2;
  if (lapPercent <= 50) return 1.4;
  return 1.6;
}

/** 弯锚弯折段 = 15d — 22G101-1 */
export const BENT_ANCHOR_FACTOR = 15;

/** 锚固长度下限: max(la, 200, 10d) — GB50010 §8.3.1 */
export function anchorMinLength(la: number, d: number): number {
  return Math.max(la, 200, 10 * d);
}

/** 搭接长度下限 (mm) — GB50010 §8.4.3 */
export const LAP_MIN_LENGTH = 300;

// ─── 梁端支座锚固常数 — 22G101-1 ───

/** 直锚长度补充公式: max(laE, 0.5hc + 5d) — 22G101-1 */
export const BEAM_END_STRAIGHT = { hcFactor: 0.5, dFactor: 5 };

/** 弯锚直段最小比例: ≥ 0.4laE — 22G101-1 */
export const BEAM_END_BENT_STRAIGHT_RATIO = 0.4;

// ─── 板底筋锚固 — 22G101 ───

/** 板底筋伸入支座: ≥ 5d 且 ≥ la/2 — 22G101 */
export const SLAB_BOTTOM_ANCHOR = { dFactor: 5, laRatio: 0.5 };

/** 梁下部筋锚固最小值: ≥ 12d — 22G101-1 */
export const BOTTOM_BAR_MIN_ANCHOR_D_FACTOR = 12;

/** 中间节点下部筋搭接: ≥ 1.5h0 — 22G101-1 */
export const BOTTOM_BAR_LAP_H0_FACTOR = 1.5;

// ─── 柱纵筋连接区域 — 22G101-1 ───

/** 柱纵筋连接区域起点: max(500, hn/6) — 22G101-1 */
export const COLUMN_LAP_ZONE = { minStart: 500, heightRatio: 1 / 6, zoneLength: 500 };

// ═══════════════════════════════════════════════════════════════════
// 13. 基础构造要求
// ═══════════════════════════════════════════════════════════════════

/** 独立基础最小高度 (mm) — GB50007 */
export const FOUNDATION_MIN_HEIGHT = 300;

/** 独立基础受力筋最小直径 (mm) */
export const FOUNDATION_MIN_BAR_DIAMETER = 10;

/** 承台最小高度 (mm) */
export const PILECAP_MIN_HEIGHT = 500;

// ═══════════════════════════════════════════════════════════════════
// 14. 柱纵向钢筋在基础中构造 — 22G101-3
// ═══════════════════════════════════════════════════════════════════

/**
 * 柱插筋锚入基础的构造判定 — 22G101-3
 *
 * 四种情况：
 *  (a) 保护层 > 5d 且 基础高度满足直锚 → 直锚，底弯 max(6d, 150)
 *  (b) 保护层 ≤ 5d 且 基础高度满足直锚 → 直锚，外皮算起 ≤ 5d，底弯 max(6d, 150)
 *  (c) 保护层 > 5d 且 基础高度不满足直锚 → 弯锚，底弯 15d
 *  (d) 保护层 ≤ 5d 且 基础高度不满足直锚 → 弯锚，底弯 15d
 *
 * 直锚判定: h₁ - cover(底) ≥ laE  (h₁ = 基础底面至基础顶面高度)
 * 弯锚时直段: ≥ 0.6laE 且 ≥ 20d
 */

/** 直锚时底部弯折: max(6d, 150mm) — 22G101-3 (a)(b) */
export const COL_FOUND_STRAIGHT_BEND_D_FACTOR = 6;
export const COL_FOUND_STRAIGHT_BEND_MIN = 150;

/** 弯锚时底部弯折长度: 15d — 22G101-3 ① */
export const COL_FOUND_BENT_BEND_D_FACTOR = 15;

/** 弯锚时直段最小要求 — 22G101-3 ① */
export const COL_FOUND_BENT_STRAIGHT_RATIO = 0.6;   // ≥ 0.6 laE
export const COL_FOUND_BENT_STRAIGHT_D_FACTOR = 20;  // ≥ 20d

/** 保护层厚度判定阈值: 5d — 22G101-3 注 */
export const COL_FOUND_COVER_THRESHOLD_D_FACTOR = 5;

/** 锚固区箍筋要求 — 22G101-3 注2 */
export const COL_FOUND_STIRRUP_DIA_RATIO = 0.25;     // 箍筋直径 ≥ d/4 (d=纵筋最大直径)
export const COL_FOUND_STIRRUP_SPACING_D_FACTOR = 10; // 间距 ≤ 10d (d=纵筋最小直径)
export const COL_FOUND_STIRRUP_SPACING_MAX = 100;     // 间距 ≤ 100mm
export const COL_FOUND_STIRRUP_ZONE_SPACING_MAX = 500; // 非复合箍间距 ≤ 500mm
export const COL_FOUND_STIRRUP_MIN_COUNT = 2;        // 至少 2 道矩形封闭箍筋

/** 简化锚固条件 (仅角筋伸至底板) — 22G101-3 注4 */
export const COL_FOUND_CORNER_ONLY_H_AXIAL = 1200;   // 轴心/小偏心: h ≥ 1200mm
export const COL_FOUND_CORNER_ONLY_H_ECCENTRIC = 1400; // 大偏心: h ≥ 1400mm
export const COL_FOUND_CORNER_ONLY_MAX_SPACING = 1000; // 伸至网片上的柱纵筋间距 ≤ 1000mm

// ═══════════════════════════════════════════════════════════════════
// 15. l_ab / l_abE 查表系数 — 22G101-3 第2-2页
// ═══════════════════════════════════════════════════════════════════

/**
 * 受拉钢筋基本锚固长度系数表 lab = n×d — 22G101-3 第2-2页
 * 键: 'HPB300' | 'HRB400' | 'HRB500'
 * 值: 各混凝土等级对应系数 n
 */
export const LAB_TABLE: Record<string, Record<string, number>> = {
  HPB300: { C25: 34, C30: 30, C35: 28, C40: 25, C45: 24, C50: 23, C55: 22, C60: 21 },
  HRB400: { C25: 40, C30: 35, C35: 32, C40: 29, C45: 28, C50: 27, C55: 26, C60: 25 },
  HRB500: { C25: 48, C30: 43, C35: 39, C40: 35, C45: 34, C50: 32, C55: 31, C60: 30 },
};

/**
 * 抗震设计受拉钢筋基本锚固长度系数表 labE = n×d — 22G101-3 第2-2页
 * 注: 四级抗震 labE = lab
 */
export const LAB_E_TABLE: Record<string, Record<string, Record<string, number>>> = {
  HPB300: {
    '一二级': { C25: 39, C30: 35, C35: 32, C40: 29, C45: 28, C50: 26, C55: 25, C60: 24 },
    '三级':   { C25: 36, C30: 32, C35: 29, C40: 26, C45: 25, C50: 24, C55: 23, C60: 22 },
  },
  HRB400: {
    '一二级': { C25: 46, C30: 40, C35: 37, C40: 33, C45: 32, C50: 31, C55: 30, C60: 29 },
    '三级':   { C25: 42, C30: 37, C35: 34, C40: 31, C45: 29, C50: 28, C55: 27, C60: 26 },
  },
  HRB500: {
    '一二级': { C25: 55, C30: 49, C35: 45, C40: 40, C45: 39, C50: 37, C55: 36, C60: 34 },
    '三级':   { C25: 50, C30: 45, C35: 41, C40: 37, C45: 35, C50: 34, C55: 32, C60: 30 },
  },
};

/** 钢筋等级代号映射到查表键 */
export const REBAR_GRADE_TO_TABLE_KEY: Record<string, string> = {
  A: 'HPB300',
  B: 'HRB400',
  C: 'HRB400',
  D: 'HRB400',
  E: 'HRB400',
  F: 'HRB500',
  G: 'HRB500',
};

/** 查表获取 lab 系数 (倍数 n，lab = n × d) — 22G101-3 第2-2页 */
export function getLabFactor(rebarGrade: string, concreteGrade: string): number {
  const key = REBAR_GRADE_TO_TABLE_KEY[rebarGrade] ?? 'HRB400';
  const gradeKey = concreteGrade.startsWith('C') ? concreteGrade : `C${concreteGrade}`;
  const normalized = parseInt(gradeKey.substring(1)) >= 60 ? 'C60' : gradeKey;
  return LAB_TABLE[key]?.[normalized] ?? LAB_TABLE['HRB400']?.['C30'] ?? 35;
}

/** 查表获取 labE 系数 (倍数 n，labE = n × d) — 22G101-3 第2-2页 */
export function getLabEFactor(rebarGrade: string, concreteGrade: string, seismicGrade: string): number {
  if (seismicGrade === '四级' || seismicGrade === '非抗震') {
    return getLabFactor(rebarGrade, concreteGrade);
  }
  const key = REBAR_GRADE_TO_TABLE_KEY[rebarGrade] ?? 'HRB400';
  const seismicKey = (seismicGrade === '一级' || seismicGrade === '二级') ? '一二级' : '三级';
  const gradeKey = concreteGrade.startsWith('C') ? concreteGrade : `C${concreteGrade}`;
  const normalized = parseInt(gradeKey.substring(1)) >= 60 ? 'C60' : gradeKey;
  return LAB_E_TABLE[key]?.[seismicKey]?.[normalized] ?? LAB_E_TABLE['HRB400']?.['一二级']?.['C30'] ?? 40;
}

// ═══════════════════════════════════════════════════════════════════
// 16. 大直径钢筋修正系数 — GB50010 §8.3.1 / 22G101-3 第2-3页
// ═══════════════════════════════════════════════════════════════════

/**
 * d > 25mm 时锚固长度修正系数 ζa — GB50010 §8.3.1
 * 带肋钢筋 d > 25mm: ζa = 1.1
 * 光圆钢筋 (HPB300): 无此修正
 */
export const ANCHOR_LARGE_DIA_FACTOR = 1.1;
export const ANCHOR_LARGE_DIA_THRESHOLD = 25;

/** 是否需要 d>25 修正 */
export function needsLargeDiaCorrection(rebarGrade: string, d: number): boolean {
  return rebarGrade !== 'A' && d > ANCHOR_LARGE_DIA_THRESHOLD;
}

// ═══════════════════════════════════════════════════════════════════
// 17. 基础梁 JL 端部与外伸部位钢筋构造 — 22G101-3 第2-25页
// ═══════════════════════════════════════════════════════════════════

/**
 * JL端部外伸直锚判定常量:
 * - 外伸长度(从柱内边) ≥ lab → 直锚
 * - 外伸长度 < lab → 弯锚: 水平段 ≥ 0.6lab，弯折 15d
 * — 22G101-3 第2-25页 注
 */
export const JL_END_BENT_STRAIGHT_RATIO = 0.6;  // 弯锚时水平段 ≥ 0.6 × lab
export const JL_END_BENT_BEND_D_FACTOR = 15;    // 弯折段 = 15d

export interface JLEndAnchorResult {
  canStraight: boolean;
  straightPart: number;
  bendPart: number;
  totalLen: number;
  description: string;
}

/**
 * 基础梁JL端部/外伸锚固构造判定 — 22G101-3 第2-25页
 * @param extLen  从柱内边算起的外伸长度 (mm)
 * @param lab     基本锚固长度 (mm)
 * @param d       钢筋直径 (mm)
 */
export function determineJLEndAnchor(extLen: number, lab: number, d: number): JLEndAnchorResult {
  const canStraight = extLen >= lab;
  if (canStraight) {
    return {
      canStraight: true,
      straightPart: extLen,
      bendPart: 0,
      totalLen: extLen,
      description: `JL外伸直锚: 外伸长度${extLen}mm ≥ lab${lab}mm (22G101-3 §2-25)`,
    };
  }
  const straightPart = Math.ceil(JL_END_BENT_STRAIGHT_RATIO * lab);
  const bendPart = JL_END_BENT_BEND_D_FACTOR * d;
  return {
    canStraight: false,
    straightPart,
    bendPart,
    totalLen: straightPart + bendPart,
    description: `JL外伸弯锚: 水平段≥0.6lab=${straightPart}mm，弯折15d=${bendPart}mm (22G101-3 §2-25)`,
  };
}

// ─── JL/JCL 基础梁纵筋连接区域 — 22G101-3 第2-23页 ───

/**
 * 基础梁顶部纵筋连接区 (跨中 ln/3 ~ 2ln/3) — 22G101-3 第2-23页
 * @param ln 梁净跨 (mm)
 */
export function jlTopBarConnectionZone(ln: number): { start: number; end: number } {
  return { start: Math.ceil(ln / 3), end: Math.floor((2 * ln) / 3) };
}

/**
 * 基础梁底部纵筋连接区 (支座两侧 ln/4 范围内) — 22G101-3 第2-23页
 * @param ln 梁净跨 (mm)
 */
export function jlBottomBarConnectionZone(ln: number): { zoneFromEachEnd: number } {
  return { zoneFromEachEnd: Math.ceil(ln / 4) };
}

/** 基础梁连接区内接头面积百分率上限 — 22G101-3 第2-23页 */
export const JL_MAX_LAP_PERCENT = 50;

// ═══════════════════════════════════════════════════════════════════
// 18. 筏形基础平板端部钢筋构造 — 22G101-3 第2-33/2-37页
// ═══════════════════════════════════════════════════════════════════

/** 弯锚公共常量 (适用于 LPB 和 BPB/ZXB/KZB) */
export const RAFT_SLAB_EDGE_BENT_STRAIGHT_RATIO = 0.6; // 水平段 ≥ 0.6 × lab
export const RAFT_SLAB_EDGE_BENT_D_FACTOR = 15;        // 弯折段 = 15d

export interface RaftSlabEdgeAnchorResult {
  hasExt: boolean;
  canStraight: boolean;
  straightPart: number;
  bendPart: number;
  totalLen: number;
  description: string;
}

/**
 * 梁板式筏基平板 LPB 端部锚固构造 — 22G101-3 第2-33页
 * @param extLen 从基础梁内边算起的外伸长度 (mm)；无外伸传 0
 * @param lab    基本锚固长度 (mm)
 * @param d      钢筋直径 (mm)
 */
export function determineLPBEdgeAnchor(extLen: number, lab: number, d: number): RaftSlabEdgeAnchorResult {
  const bendPart = RAFT_SLAB_EDGE_BENT_D_FACTOR * d;
  if (extLen === 0) {
    return {
      hasExt: false, canStraight: false,
      straightPart: 0, bendPart,
      totalLen: bendPart,
      description: `LPB无外伸端部: 下部钢筋伸至梁边后弯折15d=${bendPart}mm (22G101-3 §2-33)`,
    };
  }
  const canStraight = extLen >= lab;
  const straightPart = canStraight ? extLen : Math.ceil(RAFT_SLAB_EDGE_BENT_STRAIGHT_RATIO * lab);
  return {
    hasExt: true, canStraight,
    straightPart,
    bendPart: canStraight ? 0 : bendPart,
    totalLen: canStraight ? extLen : straightPart + bendPart,
    description: canStraight
      ? `LPB外伸直锚: ${extLen}mm ≥ lab${lab}mm`
      : `LPB外伸弯锚: 水平段≥0.6lab=${straightPart}mm，弯折15d=${bendPart}mm (22G101-3 §2-33)`,
  };
}

/**
 * 平板式筏基平板 BPB/ZXB/KZB 端部锚固构造 — 22G101-3 第2-37页
 * 规则与 LPB 相同，适用于平板式筏形基础
 */
export function determineBPBEdgeAnchor(extLen: number, lab: number, d: number): RaftSlabEdgeAnchorResult {
  const bendPart = RAFT_SLAB_EDGE_BENT_D_FACTOR * d;
  if (extLen === 0) {
    return {
      hasExt: false, canStraight: false,
      straightPart: 0, bendPart,
      totalLen: bendPart,
      description: `BPB/ZXB/KZB无外伸端部: 弯折15d=${bendPart}mm (22G101-3 §2-37)`,
    };
  }
  const canStraight = extLen >= lab;
  const straightPart = canStraight ? extLen : Math.ceil(RAFT_SLAB_EDGE_BENT_STRAIGHT_RATIO * lab);
  return {
    hasExt: true, canStraight,
    straightPart,
    bendPart: canStraight ? 0 : bendPart,
    totalLen: canStraight ? extLen : straightPart + bendPart,
    description: canStraight
      ? `BPB外伸直锚: ${extLen}mm ≥ lab${lab}mm`
      : `BPB外伸弯锚: 水平段≥0.6lab=${straightPart}mm，弯折15d=${bendPart}mm (22G101-3 §2-37)`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 19. 桩基承台钢筋锚固构造 — 22G101-3 第2-39/2-40页
// ═══════════════════════════════════════════════════════════════════

/** 桩顶嵌入承台深度 — 22G101-3 第2-39页 */
export const PILE_EMBED_IN_CAP = {
  small: 50,     // 桩径或边长 < 800mm: 嵌入 50mm
  large: 100,    // 桩径或边长 ≥ 800mm: 嵌入 100mm
  threshold: 800,
};

/** 获取桩顶嵌入承台深度 (mm) */
export function getPileEmbedDepth(pileSize: number): number {
  return pileSize >= PILE_EMBED_IN_CAP.threshold ? PILE_EMBED_IN_CAP.large : PILE_EMBED_IN_CAP.small;
}

/**
 * 承台受力筋在桩处的最小/无弯折直段长度 — 22G101-3 第2-39页
 * 方桩: minStraight = 25d；noBend = 35d
 * 圆桩: minStraight = 25d + 0.1D；noBend = 35d + 0.1D  (D=圆桩直径)
 */
export const PILE_CAP_REBAR_MIN_STRAIGHT_D = 25;  // 最小直段倍数
export const PILE_CAP_REBAR_NO_BEND_D = 35;        // 不需弯折的直段倍数

export interface PileCapRebarEndResult {
  minStraight: number;
  noBendStraight: number;
  needBend: boolean;
  meetsMin: boolean;
  bendLen: number;
  description: string;
}

/**
 * 承台受力筋端部构造判定 — 22G101-3 第2-39页
 * @param d         受力钢筋直径 (mm)
 * @param pileType  'square' | 'round'
 * @param pileSize  桩边长(方桩)或桩径(圆桩) mm
 * @param availLen  承台内实际可用的直段长度 (mm)
 */
export function determinePileCapRebarEnd(
  d: number,
  pileType: 'square' | 'round',
  pileSize: number,
  availLen: number,
): PileCapRebarEndResult {
  const minStraight = pileType === 'round'
    ? Math.ceil(PILE_CAP_REBAR_MIN_STRAIGHT_D * d + 0.1 * pileSize)
    : PILE_CAP_REBAR_MIN_STRAIGHT_D * d;
  const noBendStraight = pileType === 'round'
    ? Math.ceil(PILE_CAP_REBAR_NO_BEND_D * d + 0.1 * pileSize)
    : PILE_CAP_REBAR_NO_BEND_D * d;
  const needBend = availLen < noBendStraight;
  const meetsMin = availLen >= minStraight;
  const bendLen = needBend ? 12 * d : 0;
  return {
    minStraight,
    noBendStraight,
    needBend,
    meetsMin,
    bendLen,
    description: needBend
      ? `承台筋端部弯折12d=${bendLen}mm，直段${availLen}mm，最小${minStraight}mm (22G101-3 §2-39)`
      : `承台筋端部不弯折，直段${availLen}mm ≥ ${noBendStraight}mm (22G101-3 §2-39)`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 20. 基础联系梁 JLL 钢筋构造 — 22G101-3 第2-49页
// ═══════════════════════════════════════════════════════════════════

/** JLL 第一道箍筋距柱边距离 (mm) — 22G101-3 第2-49页 注1 */
export const JLL_FIRST_STIRRUP_FROM_COLUMN = 50;

/**
 * JLL 纵筋直锚伸过柱中心线长度 — 22G101-3 第2-49页 注2
 * 直锚: 锚固长度 ≥ la(laE)，且伸过柱中心线 ≥ 5d
 */
export const JLL_DIRECT_ANCHOR_PAST_CENTER_D = 5;

/**
 * JLL 锚固区横向钢筋要求 — 22G101-3 第2-49页 注3
 * 直径 ≥ d/4（d=纵筋最大直径），间距 ≤ 5d（d=纵筋最小直径）且 ≤ 100mm
 */
export const JLL_ANCHOR_ZONE_STIRRUP_DIA_RATIO = 0.25;   // ≥ d/4
export const JLL_ANCHOR_ZONE_STIRRUP_SPACING_D = 5;       // ≤ 5d
export const JLL_ANCHOR_ZONE_STIRRUP_SPACING_MAX = 100;   // ≤ 100mm

/**
 * JLL 纵筋直锚验证 — 22G101-3 第2-49页
 * 直锚条件: la(laE) 且伸过柱中线 ≥ 5d
 * @param availDepth  可用锚固深度 (mm)，通常 = 柱截面宽 - 保护层
 * @param la          锚固长度 (mm)
 * @param d           梁纵筋直径 (mm)
 * @param hc          柱截面宽度 (mm)
 */
export function checkJLLDirectAnchor(
  availDepth: number, la: number, d: number, hc: number,
): { ok: boolean; minRequired: number; pastCenter: number } {
  const pastCenter = JLL_DIRECT_ANCHOR_PAST_CENTER_D * d;
  const minRequired = Math.max(la, Math.ceil(hc / 2) + pastCenter);
  return { ok: availDepth >= minRequired, minRequired, pastCenter };
}

// ═══════════════════════════════════════════════════════════════════
// 21. 灌注桩 GZH 钢筋构造 — 22G101-3 第2-46/2-47页
// ═══════════════════════════════════════════════════════════════════

/** 桩顶进入承台高度 h (mm) — 与 §19 PILE_EMBED_IN_CAP 同一规则，此处提供别名供桩侧引用 */
export const GZH_PILE_HEAD_EMBED = PILE_EMBED_IN_CAP;

/**
 * 螺旋箍筋搭接构造 — 22G101-3 第2-47页
 * 螺旋箍筋端部: 搭接 1.5 圈，端部弯钩 ≥ 75mm 或 10d（取大值）
 */
export const GZH_SPIRAL_STIRRUP_LAP_TURNS = 1.5;
export const GZH_SPIRAL_STIRRUP_HOOK_MIN_MM = 75;
export const GZH_SPIRAL_STIRRUP_HOOK_D_FACTOR = 10;

/** 灌注桩焊接加劲箍最小直径 (mm) — 22G101-3 第2-47页 注3 */
export const GZH_STIFFENER_HOOP_MIN_DIA = 12;

/** 灌注桩焊接加劲箍最低强度等级 */
export const GZH_STIFFENER_HOOP_MIN_GRADE = 'HRB400';

/**
 * 螺旋箍筋端部弯钩长度 (mm) — 22G101-3 第2-47页
 * ≥ max(75mm, 10d)
 */
export function gzhSpiralStirrupHookLen(d: number): number {
  return Math.max(GZH_SPIRAL_STIRRUP_HOOK_MIN_MM, GZH_SPIRAL_STIRRUP_HOOK_D_FACTOR * d);
}

/**
 * 判定柱插筋锚固类型
 * @param h       基础高度 (mm)
 * @param cover   基础底部保护层 (mm)
 * @param d       柱纵筋直径 (mm)
 * @param laE     抗震锚固长度 (mm)
 * @returns 锚固类型与关键尺寸
 */
export function determineColFoundAnchor(h: number, cover: number, d: number, laE: number) {
  const coverThreshold = COL_FOUND_COVER_THRESHOLD_D_FACTOR * d;
  const isCoverLarge = cover > coverThreshold;
  const availableDepth = h - cover; // 可用锚固深度
  const canStraight = availableDepth >= laE;

  let bendLength: number;
  let anchorType: 'straight' | 'bent';
  let scenario: 'a' | 'b' | 'c' | 'd';

  if (canStraight) {
    anchorType = 'straight';
    bendLength = Math.max(COL_FOUND_STRAIGHT_BEND_D_FACTOR * d, COL_FOUND_STRAIGHT_BEND_MIN);
    scenario = isCoverLarge ? 'a' : 'b';
  } else {
    anchorType = 'bent';
    bendLength = COL_FOUND_BENT_BEND_D_FACTOR * d;
    scenario = isCoverLarge ? 'c' : 'd';
  }

  // 弯锚时的直段长度
  const straightPortion = canStraight
    ? availableDepth
    : Math.max(COL_FOUND_BENT_STRAIGHT_RATIO * laE, COL_FOUND_BENT_STRAIGHT_D_FACTOR * d);

  // 锚固区箍筋
  const stirrupMinDia = Math.ceil(d * COL_FOUND_STIRRUP_DIA_RATIO);
  const stirrupMaxSpacing = Math.min(COL_FOUND_STIRRUP_SPACING_D_FACTOR * d, COL_FOUND_STIRRUP_SPACING_MAX);

  return {
    scenario,           // 'a' | 'b' | 'c' | 'd'
    anchorType,         // 'straight' | 'bent'
    isCoverLarge,       // cover > 5d
    canStraight,        // 基础高度是否满足直锚
    bendLength,         // 底部弯折长度 (mm)
    straightPortion,    // 直段长度 (mm)
    laE,                // 抗震锚固长度 (mm)
    stirrupMinDia,      // 锚固区箍筋最小直径 (mm)
    stirrupMaxSpacing,  // 锚固区箍筋最大间距 (mm)
  };
}

// ═══════════════════════════════════════════════════════════════════
// 22. 箍筋下料长度精确计算 — 22G101 / GB50010
// ═══════════════════════════════════════════════════════════════════

/** 抗震箍筋弯后平直段长度（每端）: max(10d, 75mm) — GB50666 §5.3.6 / 22G101 */
export const STIRRUP_HOOK_FACTOR = 10;
export const STIRRUP_HOOK_MIN = 75;

/** 箍筋弯钩直段长度 (mm) */
export function stirrupHookLen(d: number): number {
  return Math.max(STIRRUP_HOOK_FACTOR * d, STIRRUP_HOOK_MIN);
}

/** 90°弯折量差调整值 — 每个直角弯折内侧弧长与直段之差，简化取 1.75d */
export const STIRRUP_BEND_ADJUST_PER_CORNER = 1.75;

/**
 * 矩形箍筋单根下料长度 (mm) — 精确公式
 * L = 2(b₀ + h₀) + 2×hookLen + 4×1.75d (弯折增加量)
 *
 * @param innerB  箍筋内净宽 = b - 2c (mm)
 * @param innerH  箍筋内净高 = h - 2c (mm)
 * @param d       箍筋直径 (mm)
 * @param legs    肢数 (2/4/...) — 多肢箍按外圈+内箍分别计算
 * @returns 单根(含内箍)下料长度 mm
 */
export function stirrupCutLength(innerB: number, innerH: number, d: number, legs: number = 2): number {
  const hookLen = stirrupHookLen(d);
  const nCorners = 4;
  const perimeter = 2 * (innerB + innerH);
  const bendAdjust = nCorners * STIRRUP_BEND_ADJUST_PER_CORNER * d;
  const singleLoop = perimeter + 2 * hookLen + bendAdjust;
  if (legs > 2) {
    const innerLoops = Math.floor(legs / 2) - 1;
    const innerLoopLen = innerB + 2 * hookLen + 2 * STIRRUP_BEND_ADJUST_PER_CORNER * d;
    return singleLoop + innerLoops * innerLoopLen;
  }
  return singleLoop;
}

// ═══════════════════════════════════════════════════════════════════
// 23. 钢筋损耗系数 — 行业通用
// ═══════════════════════════════════════════════════════════════════

/**
 * 钢筋损耗率 (%) — 按构件类型推荐值
 * 来源: 建筑工程工程量清单计价规范 / 行业经验值
 */
export const WASTE_RATE: Record<string, number> = {
  beam: 0.03,
  column: 0.03,
  slab: 0.02,
  shearwall: 0.025,
  stair: 0.03,
  foundation: 0.025,
  stripfoundation: 0.025,
  pilecap: 0.025,
  raft: 0.025,
};

/** 获取损耗系数 (1 + rate) */
export function wasteFactor(componentType: string): number {
  return 1 + (WASTE_RATE[componentType] ?? 0.03);
}

// ═══════════════════════════════════════════════════════════════════
// 24. 弯折调整值（弯起/弯锚量差）— 22G101
// ═══════════════════════════════════════════════════════════════════

/**
 * 钢筋弯折调整值 (mm) — 每个弯折点的长度修正
 * 30°: 0.268d, 45°: 0.414d, 60°: 0.575d, 90°: 0.785d, 135°: 1.571d
 */
export const BEND_ADJUST: Record<number, number> = {
  30:  0.268,
  45:  0.414,
  60:  0.575,
  90:  0.785,
  135: 1.571,
};

/** 获取弯折增加量 (mm)，angle为弯折角度 */
export function bendAdjustment(d: number, angle: number = 90): number {
  const factor = BEND_ADJUST[angle] ?? 0.785;
  return factor * d;
}
