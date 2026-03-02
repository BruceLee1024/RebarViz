/**
 * 钢筋布置算法
 * 从 BeamViewer 提取的通用布筋逻辑
 */

import { S } from './constants';

/**
 * GB50010: 同排钢筋净间距 ≥ max(d, 25mm)
 * @param zRange 可用宽度 (m)
 * @param dia 钢筋直径 (mm)
 * @returns 每排最大根数
 */
export function maxBarsPerRow(zRange: number, dia: number): number {
  const minClear = Math.max(dia * S, 25 * S);
  return Math.max(Math.floor((zRange + minClear) / (dia * S + minClear)), 1);
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
}

export interface BarPosition {
  y: number;
  z: number;
}

/**
 * 布筋算法：根据 parseRebar 解析结果计算每根钢筋位置
 * 优先用 rows/perRow，否则自动检测是否需要多排
 * @param rebar 解析后的钢筋信息
 * @param zRange 可用宽度 (m)
 * @param yPositions 各排 Y 坐标 (m)
 * @returns 每根钢筋的 {y, z} 坐标数组
 */
export function layoutBars(
  rebar: RebarLayout,
  zRange: number,
  yPositions: number[],
): BarPosition[] {
  let perRow: number[];

  if (rebar.perRow && rebar.perRow.length >= 2) {
    // 显式指定了每排根数
    perRow = rebar.perRow;
  } else if (rebar.rows && rebar.rows >= 2) {
    // 指定了排数，自动分配
    const r = rebar.rows;
    perRow = [];
    let rem = rebar.count;
    for (let i = 0; i < r; i++) {
      const n = Math.ceil(rem / (r - i));
      perRow.push(n);
      rem -= n;
    }
  } else {
    // 自动检测是否需要多排
    const mpr = maxBarsPerRow(zRange, rebar.diameter);
    const rows = rebar.count > mpr ? 2 : 1;
    perRow = rows === 2
      ? [Math.ceil(rebar.count / 2), Math.floor(rebar.count / 2)]
      : [rebar.count];
  }

  const bars: BarPosition[] = [];
  for (let row = 0; row < perRow.length; row++) {
    if (row >= yPositions.length) break;
    const zArr = distributeZ(zRange, perRow[row]);
    zArr.forEach(z => bars.push({ y: yPositions[row], z }));
  }
  return bars;
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
