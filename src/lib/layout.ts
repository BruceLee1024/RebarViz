/**
 * 钢筋布置算法
 * 从 BeamViewer 提取的通用布筋逻辑
 */

import { S } from './constants';
import { MIN_CLEAR_SPACING, rebarArea } from './construction-rules';

/**
 * GB50010: 同排钢筋净间距 ≥ max(d, 25mm)
 * @param zRange 可用宽度 (m)
 * @param dia 钢筋直径 (mm)
 * @returns 每排最大根数
 */
export function maxBarsPerRow(zRange: number, dia: number): number {
  const minClear = MIN_CLEAR_SPACING.horizontal(dia) * S;
  return Math.max(Math.floor(Math.max(zRange, 0) / (dia * S + minClear)) + 1, 1);
}

/**
 * 在 zRange 内均匀布置 count 根钢筋
 * @param zRange 可用宽度 (m)
 * @param count 根数
 * @returns Z 坐标数组 (m)，count=1 时居中返回 [0]
 */
export function distributeZ(zRange: number, count: number): number[] {
  if (count <= 1) return [0];
  const spacing = zRange / (count - 1);
  return Array.from({ length: count }, (_, i) => -zRange / 2 + i * spacing);
}

export interface RebarLayout {
  count: number;
  diameter: number;
  rows?: number;
  perRow?: number[];
  segments?: { count: number; grade: string; diameter: number }[];
}

export interface BarPosition {
  y: number;
  z: number;
  diameter?: number; // 混合直径时每根钢筋的实际直径 (mm)
}

/**
 * 布筋算法：根据 parseRebar 解析结果计算每根钢筋位置
 * 优先用 rows/perRow，否则自动检测是否需要多排
 * @param rebar 解析后的钢筋信息
 * @param zRange 可用宽度 (m)
 * @param yPositions 各排 Y 坐标 (m)
 * @returns 每根钢筋的 {y, z} 坐标数组
 */
export function resolveBarRowCounts(rebar: RebarLayout, zRange: number): number[] {
  if (rebar.perRow && rebar.perRow.length >= 2) return rebar.perRow;
  const rows = rebar.rows && rebar.rows >= 2 ? rebar.rows
    : Math.max(Math.ceil(rebar.count / maxBarsPerRow(zRange, rebar.diameter)), 1);
  let remaining = rebar.count;
  return Array.from({ length: rows }, (_, i) => {
    const count = Math.ceil(remaining / (rows - i));
    remaining -= count;
    return count;
  });
}

export function layoutBars(
  rebar: RebarLayout, zRange: number, yPositions: number[], rowDirection: -1 | 1 = -1,
): BarPosition[] {
  if (!yPositions.length) return [];
  const perRow = resolveBarRowCounts(rebar, zRange);
  const positions = [...yPositions];
  for (let row = positions.length; row < perRow.length; row++) {
    const previousD = rebar.segments?.[row - 1]?.diameter ?? rebar.diameter;
    const currentD = rebar.segments?.[row]?.diameter ?? rebar.diameter;
    const pitch = (previousD / 2 + Math.max(previousD, currentD, 25) + currentD / 2) * S;
    positions.push(positions[row - 1] + rowDirection * pitch);
  }
  const bars: BarPosition[] = [];
  for (let row = 0; row < perRow.length; row++) {
    const zArr = distributeZ(zRange, perRow[row]);
    const rowDia = rebar.segments && rebar.segments[row] ? rebar.segments[row].diameter : undefined;
    zArr.forEach(z => bars.push({ y: positions[row], z, diameter: rowDia }));
  }
  return bars;
}

/**
 * 计算多排钢筋合力点到截面近边缘的距离 as (mm)
 * 单排时 as = cover + stirDia + d/2
 * 多排时按各排面积加权: as = Σ(Asi × asi) / ΣAsi
 * @param h 截面高度 (mm)
 * @param cover 保护层厚度 (mm)
 * @param stirDia 箍筋直径 (mm)
 * @param rebarDia 纵筋直径 (mm)
 * @param count 纵筋总根数
 * @param rows 排数 (可选)
 * @param perRow 每排根数 (可选)
 * @returns { as_mm, h0 } 合力点距离和有效高度 (mm)
 */
export function calcEffectiveDepth(
  h: number,
  cover: number,
  stirDia: number,
  rebarDia: number,
  count: number,
  rows?: number,
  perRow?: number[],
  segments?: { count: number; diameter: number }[],
): { as_mm: number; h0: number } {
  const rowCount = rows || (perRow && perRow.length >= 2 ? perRow.length : 1);

  if (rowCount <= 1) {
    const as_mm = cover + stirDia + rebarDia / 2;
    return { as_mm, h0: h - as_mm };
  }

  // 计算每排根数
  let pr: number[];
  if (perRow && perRow.length >= 2) {
    pr = perRow;
  } else {
    pr = [];
    let rem = count;
    for (let i = 0; i < rowCount; i++) {
      const n = Math.ceil(rem / (rowCount - i));
      pr.push(n);
      rem -= n;
    }
  }

  // 各排直径 (混合直径时各排不同)
  const rowDia = (i: number) => segments && segments[i] ? segments[i].diameter : rebarDia;

  // 各排到近边缘距离 asi (mm)
  // 第一排: cover + stirDia + d0/2
  // 第 i 排: 前一排 + d(i-1)/2 + clearV + d(i)/2
  const d0 = rowDia(0);
  const rowDistances: number[] = [cover + stirDia + d0 / 2];
  for (let i = 1; i < pr.length; i++) {
    const dPrev = rowDia(i - 1);
    const dCur = rowDia(i);
    const clearV = MIN_CLEAR_SPACING.verticalMixed(dPrev, dCur);
    rowDistances.push(rowDistances[i - 1] + dPrev / 2 + clearV + dCur / 2);
  }

  // 加权平均: as = Σ(Asi × asi) / ΣAsi
  // Asi = ni × π × di² / 4
  let sumAA = 0, sumA = 0;
  for (let i = 0; i < pr.length; i++) {
    const Ai = pr[i] * rebarArea(rowDia(i));
    sumAA += Ai * rowDistances[i];
    sumA += Ai;
  }
  const as_mm = sumA > 0 ? sumAA / sumA : rowDistances[0];
  return { as_mm, h0: h - as_mm };
}

/**
 * 计算箍筋中心线尺寸
 * GB50010: 保护层 = 混凝土表面到最近钢筋（箍筋）外皮的距离
 * @param b 截面宽度 (mm)
 * @param h 截面高度 (mm)
 * @param cover 保护层厚度 (mm)
 * @param stirDia 箍筋直径 (mm)
 */
export function calcStirrupCenterDims(
  b: number,
  h: number,
  cover: number,
  stirDia: number,
): { width: number; height: number } {
  const coverM = cover * S;
  const stirDiaM = stirDia * S;
  return {
    width: b * S - 2 * coverM - stirDiaM,
    height: h * S - 2 * coverM - stirDiaM,
  };
}

/**
 * 计算多跨布局
 * @param spanCount 跨数
 * @param beamLen 单跨净跨长度 (m)
 * @param colWidth 柱宽 (m)
 */
export function calcMultiSpanLayout(
  spanCount: number,
  beamLen: number,
  colWidth: number,
): {
  totalNet: number;
  spans: { center: number; leftFace: number; rightFace: number }[];
  colPositions: number[];
} {
  const totalNet = spanCount * beamLen + (spanCount - 1) * colWidth;

  const spans: { center: number; leftFace: number; rightFace: number }[] = [];
  for (let i = 0; i < spanCount; i++) {
    const leftFace = -totalNet / 2 + i * (beamLen + colWidth);
    const rightFace = leftFace + beamLen;
    spans.push({ leftFace, rightFace, center: (leftFace + rightFace) / 2 });
  }

  const colPositions: number[] = [];
  colPositions.push(spans[0].leftFace - colWidth / 2); // 左端柱
  for (let i = 1; i < spanCount; i++) {
    colPositions.push(spans[i].leftFace - colWidth / 2); // 中间柱
  }
  colPositions.push(spans[spanCount - 1].rightFace + colWidth / 2); // 右端柱

  return { totalNet, spans, colPositions };
}

/**
 * 计算箍筋位置数组
 * @param beamLen 净跨长度 (m)
 * @param denseZone 加密区长度 (m)
 * @param spacingDense 加密区间距 (mm)
 * @param spacingNormal 非加密区间距 (mm)
 * @param skipLeft 左端跳过长度 (m)，用于加腋
 * @param skipRight 右端跳过长度 (m)，用于加腋
 */
export function calcStirrupPositions(
  beamLen: number,
  denseZone: number,
  spacingDense: number,
  spacingNormal: number,
  skipLeft = 0,
  skipRight = 0,
): { x: number; zone: 'dense' | 'normal' }[] {
  const positions: { x: number; zone: 'dense' | 'normal' }[] = [];
  const halfLen = beamLen / 2;
  const denseS = spacingDense * S;
  const normalS = spacingNormal * S;

  // 左端加密区
  const leftStart = -halfLen + skipLeft + 0.05;
  for (let x = leftStart; x < -halfLen + denseZone; x += denseS) {
    positions.push({ x, zone: 'dense' });
  }

  // 非加密区
  for (let x = -halfLen + denseZone; x < halfLen - denseZone; x += normalS) {
    positions.push({ x, zone: 'normal' });
  }

  // 右端加密区
  const rightEnd = halfLen - skipRight - 0.05;
  for (let x = halfLen - denseZone; x < rightEnd; x += denseS) {
    positions.push({ x, zone: 'dense' });
  }

  return positions;
}

/**
 * 锚固描述格式化
 */
export function formatAnchorDesc(
  anchor: {
    canStraight: boolean;
    straightLen: number;
    bentStraightPart: number;
    bentBendPart: number;
  },
  note = '',
): string {
  return anchor.canStraight
    ? `直锚 ${anchor.straightLen}mm${note ? ` ${note}` : ''}`
    : `弯锚 直段${anchor.bentStraightPart}mm+弯折15d=${anchor.bentBendPart}mm`;
}
