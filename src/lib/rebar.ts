import type { RebarInfo, RebarSegment, StirrupInfo } from './types';

export const GRADE_MAP: Record<string, string> = {
  A: 'HPB300 (一级)',
  B: 'HRB335 (二级)',
  C: 'HRB400 (三级)',
  D: 'RRB400 (四级)',
  E: 'HRBF400',
};

/** 解析单段钢筋标注 (如 "2C25") */
function parseSingleSegment(s: string): RebarSegment | null {
  const m = s.trim().match(/(\d+)([A-Za-z])(\d+)/);
  if (!m) return null;
  return { count: parseInt(m[1]), grade: m[2].toUpperCase(), diameter: parseInt(m[3]) };
}

export function parseRebar(str: string): RebarInfo {
  // 支持 22G101 平法格式:
  // 基本: "2C25" → 2根C25
  // 带排数: "6C25(2)" → 6根C25分2排
  // 每排分配: "5C25(3/2)" → 5根C25第一排3根第二排2根
  // 混合直径: "2C25+2C22" → 外排2根Φ25 + 内排2根Φ22

  // ── 混合直径检测: 含 "+" 分隔符 ──
  if (str.includes('+')) {
    const parts = str.split('+');
    const segments: RebarSegment[] = [];
    for (const part of parts) {
      const seg = parseSingleSegment(part);
      if (seg) segments.push(seg);
    }
    if (segments.length >= 2) {
      const totalCount = segments.reduce((s, seg) => s + seg.count, 0);
      const maxDiaSeg = segments.reduce((a, b) => a.diameter >= b.diameter ? a : b);
      const perRow = segments.map(seg => seg.count);
      return {
        count: totalCount,
        grade: maxDiaSeg.grade,
        diameter: maxDiaSeg.diameter,
        rows: segments.length,
        perRow,
        segments,
      };
    }
  }

  const m = str.match(/(\d+)([A-Za-z])(\d+)/);
  if (!m) return { count: 2, grade: 'C', diameter: 20 };
  const count = parseInt(m[1]);
  const grade = m[2].toUpperCase();
  const diameter = parseInt(m[3]);

  // 解析括号: (排数) 或 (第一排/第二排)
  const afterBase = str.slice(str.indexOf(m[3]) + m[3].length);
  const rowMatch = afterBase.match(/\((\d+)(?:\/(\d+))?\)/);
  if (rowMatch) {
    if (rowMatch[2]) {
      // 格式: (2/4) — 22G101: 第一个数=内排(靠中性轴)，第二个数=外排(靠截面边缘)
      // perRow[0] 始终为外排(最靠近截面边缘)
      const r1 = parseInt(rowMatch[1]);
      const r2 = parseInt(rowMatch[2]);
      return { count: r1 + r2, grade, diameter, rows: 2, perRow: [r2, r1] };
    } else {
      // 格式: (2) — 排数，自动分配
      const rows = parseInt(rowMatch[1]);
      if (rows >= 2) {
        const perRow: number[] = [];
        let remaining = count;
        for (let r = 0; r < rows; r++) {
          const n = Math.ceil(remaining / (rows - r));
          perRow.push(n);
          remaining -= n;
        }
        return { count, grade, diameter, rows, perRow };
      }
    }
  }
  return { count, grade, diameter };
}

/**
 * 解析底部钢筋: 22G101 中 (a/b) 标注 a=内排 b=外排,
 * parseRebar 已将 perRow[0] 设为外排(靠截面边缘),
 * 对底部钢筋同样适用，无需额外反转。
 */
export function parseRebarBottom(str: string): RebarInfo {
  return parseRebar(str);
}

// 板筋格式: "C10@150" => { grade:'C', diameter:10, spacing:150 }
export function parseSlabRebar(str: string): { grade: string; diameter: number; spacing: number } {
  const m = str.match(/([A-Za-z])(\d+)@(\d+)/);
  if (!m) return { grade: 'C', diameter: 10, spacing: 150 };
  return { grade: m[1].toUpperCase(), diameter: parseInt(m[2]), spacing: parseInt(m[3]) };
}

export function parseStirrup(str: string): StirrupInfo {
  // Support optional type code prefix: "B-A10@100/200(4)" or legacy "A10@100/200(4)"
  const withType = str.match(/^([A-F])-([A-Za-z])(\d+)@(\d+)(?:\/(\d+))?\((\d+)\)$/);
  if (withType) {
    const typeCode = withType[1];
    const inferredLegs = getStirrupLegs(typeCode);
    return {
      grade: withType[2].toUpperCase(),
      diameter: parseInt(withType[3]),
      spacingDense: parseInt(withType[4]),
      spacingNormal: withType[5] ? parseInt(withType[5]) : parseInt(withType[4]),
      legs: parseInt(withType[6]) || inferredLegs,
      typeCode,
    };
  }

  // Legacy format without type code
  const m = str.match(/([A-Za-z])(\d+)@(\d+)(?:\/(\d+))?\((\d+)\)/);
  if (!m) return { grade: 'A', diameter: 8, spacingDense: 100, spacingNormal: 200, legs: 2 };
  const legs = parseInt(m[5]);
  return {
    grade: m[1].toUpperCase(),
    diameter: parseInt(m[2]),
    spacingDense: parseInt(m[3]),
    spacingNormal: m[4] ? parseInt(m[4]) : parseInt(m[3]),
    legs,
    typeCode: inferStirrupType(legs),
  };
}

export function gradeLabel(grade: string): string {
  return GRADE_MAP[grade] || grade;
}

// ═══════════════════════════════════════════════════════════════════
// 应用内箍筋组合编号；当前采用多个独立封闭箍套叠的表达
// ═══════════════════════════════════════════════════════════════════

export interface StirrupTypeInfo {
  code: string;           // 类型编号 (A, B, C, D, E, F, G, H)
  name: string;           // 名称
  legs: number;           // 肢数
  description: string;    // 描述
}

export const STIRRUP_TYPES: Record<string, StirrupTypeInfo> = {
  'A': { code: 'A', name: '基本箍', legs: 2, description: '单个矩形箍筋' },
  'B': { code: 'B', name: '复合封闭箍-2个独立箍', legs: 4, description: '外箍+1个独立内箍，沿构件长度错位' },
  'C': { code: 'C', name: '复合封闭箍-3个独立箍', legs: 6, description: '外箍+2个独立内箍，沿构件长度错位' },
  'D': { code: 'D', name: '复合封闭箍-4个独立箍', legs: 8, description: '外箍+3个独立内箍，沿构件长度错位' },
  'E': { code: 'E', name: '复合封闭箍-5个独立箍', legs: 10, description: '外箍+4个独立内箍，沿构件长度错位' },
  'F': { code: 'F', name: '复合封闭箍-6个独立箍', legs: 12, description: '外箍+5个独立内箍，沿构件长度错位' },
};

/** 根据肢数推断箍筋类型编号 */
export function inferStirrupType(legs: number): string {
  if (legs <= 2) return 'A';
  if (legs === 4) return 'B';
  if (legs === 6) return 'C';
  if (legs === 8) return 'D';
  if (legs === 10) return 'E';
  if (legs >= 12) return 'F';
  return 'A';
}

/** 根据类型编号获取肢数 */
export function getStirrupLegs(typeCode: string): number {
  return STIRRUP_TYPES[typeCode]?.legs ?? 2;
}

// ═══════════════════════════════════════════════════════════════════
// 22G101-1 柱纵筋分项解析
// ═══════════════════════════════════════════════════════════════════

export interface ColumnBarPos {
  x: number;    // position in scene units (relative to column center)
  z: number;
  diameter: number;
  grade: string;
  role: 'corner' | 'bMiddle' | 'hMiddle';
}

export interface ColumnBarsResolved {
  bars: ColumnBarPos[];
  corner: RebarInfo;
  bMiddle: RebarInfo | null;
  hMiddle: RebarInfo | null;
  totalCount: number;
  /** 是否使用了 22G101-1 分项标注 */
  isDetailed: boolean;
}

/**
 * 22G101-1 柱纵筋解析：
 * - 若提供 cornerMain, 使用分项标注（角筋 + b边中部筋 + h边中部筋）
 * - 否则退回到 legacy main 均匀分布
 *
 * @param innerW  柱截面内净宽 (b - 2*cover)，已经是场景单位
 * @param innerH  柱截面内净高 (h - 2*cover)，已经是场景单位
 */
export function resolveColumnBars(
  main: string,
  cornerMain: string | undefined,
  bMiddleMain: string | undefined,
  hMiddleMain: string | undefined,
  innerW: number,
  innerH: number,
): ColumnBarsResolved {
  const isDetailed = !!cornerMain;

  if (isDetailed) {
    const cornerR = parseRebar(cornerMain!);
    const bMidR = bMiddleMain ? parseRebar(bMiddleMain) : null;
    const hMidR = hMiddleMain ? parseRebar(hMiddleMain) : null;

    const bars: ColumnBarPos[] = [];
    const hw = innerW / 2, hh = innerH / 2;

    // 4个角筋 (固定在四角)
    bars.push({ x: -hw, z: -hh, diameter: cornerR.diameter, grade: cornerR.grade, role: 'corner' });
    bars.push({ x:  hw, z: -hh, diameter: cornerR.diameter, grade: cornerR.grade, role: 'corner' });
    bars.push({ x:  hw, z:  hh, diameter: cornerR.diameter, grade: cornerR.grade, role: 'corner' });
    bars.push({ x: -hw, z:  hh, diameter: cornerR.diameter, grade: cornerR.grade, role: 'corner' });

    // b边中部筋 — 沿 b 方向 (x轴)，上下两侧各 count 根
    if (bMidR && bMidR.count > 0) {
      const n = bMidR.count;
      for (let i = 0; i < n; i++) {
        const x = -hw + (innerW * (i + 1)) / (n + 1);
        bars.push({ x, z: -hh, diameter: bMidR.diameter, grade: bMidR.grade, role: 'bMiddle' });
        bars.push({ x, z:  hh, diameter: bMidR.diameter, grade: bMidR.grade, role: 'bMiddle' });
      }
    }

    // h边中部筋 — 沿 h 方向 (z轴)，左右两侧各 count 根
    if (hMidR && hMidR.count > 0) {
      const n = hMidR.count;
      for (let i = 0; i < n; i++) {
        const z = -hh + (innerH * (i + 1)) / (n + 1);
        bars.push({ x: -hw, z, diameter: hMidR.diameter, grade: hMidR.grade, role: 'hMiddle' });
        bars.push({ x:  hw, z, diameter: hMidR.diameter, grade: hMidR.grade, role: 'hMiddle' });
      }
    }

    return { bars, corner: cornerR, bMiddle: bMidR, hMiddle: hMidR, totalCount: bars.length, isDetailed: true };
  }

  // Four corners plus distributed interior bars; do not subtract corners twice.
  const mainR = parseRebar(main);
  const hw = innerW / 2, hh = innerH / 2;
  const count = Math.max(0, mainR.count);
  const corners = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]];
  const bars: ColumnBarPos[] = corners.slice(0, count).map(([x,z]) => ({ x, z, diameter: mainR.diameter, grade: mainR.grade, role: 'corner' }));
  const remainder = Math.max(0, count - 4), counts = [0,0,0,0];
  // Opposite faces receive the next pair before moving to the other axis.
  const order = [0,2,1,3];
  for (let i=0;i<remainder;i++) counts[order[i%4]]++;
  for (let side=0;side<4;side++) {
    const [x0,z0]=corners[side], [x1,z1]=corners[(side+1)%4];
    for(let i=1;i<=counts[side];i++) {
      const t=i/(counts[side]+1);
      bars.push({ x:x0+(x1-x0)*t,z:z0+(z1-z0)*t,diameter:mainR.diameter,grade:mainR.grade,role:side%2===0?'bMiddle':'hMiddle' });
    }
  }
  return { bars, corner: mainR, bMiddle: null, hMiddle: null, totalCount: bars.length, isDetailed: false };
}

/**
 * 解析腰筋/抗扭筋标注
 * G4C12 → { prefix:'G', count:4, grade:'C', diameter:12 } (构造腰筋)
 * N2C16 → { prefix:'N', count:2, grade:'C', diameter:16 } (抗扭筋)
 */
export interface SideBarInfo {
  prefix: 'G' | 'N';
  count: number;
  grade: string;
  diameter: number;
}

export function parseSideBar(str: string): SideBarInfo | null {
  const m = str.match(/^([GN])(\d+)([A-Za-z])(\d+)$/);
  if (!m) return null;
  return {
    prefix: m[1] as 'G' | 'N',
    count: parseInt(m[2]),
    grade: m[3].toUpperCase(),
    diameter: parseInt(m[4]),
  };
}

/**
 * 解析拉筋标注
 * A6 → { grade:'A', diameter:6 }
 * C8 → { grade:'C', diameter:8 }
 */
export interface TieBarInfo {
  grade: string;
  diameter: number;
}

export function parseTieBar(str: string): TieBarInfo | null {
  const m = str.match(/^([A-Za-z])(\d+)$/);
  if (!m) return null;
  return { grade: m[1].toUpperCase(), diameter: parseInt(m[2]) };
}

/**
 * 22G101: 自动确定拉筋规格
 * b ≤ 350mm → A6 (HPB300 Φ6)
 * b > 350mm → 同箍筋规格
 */
export function autoTieBar(beamWidth: number, stirrupGrade: string, stirrupDia: number): TieBarInfo {
  if (beamWidth <= 350) return { grade: 'A', diameter: 6 };
  return { grade: stirrupGrade, diameter: stirrupDia };
}

export function tieBarToString(info: TieBarInfo): string {
  return `${info.grade}${info.diameter}`;
}

export const BEAM_PRESETS = {
  simple: {
    id: 'KL1(1)', b: 250, h: 500, top: '2C20', bottom: '3C22',
    stirrup: 'A8@150/150(2)', leftSupport: '', rightSupport: '',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, spanLength: 4000, hc: 500, supportDepth: 600,
    haunchType: 'none' as const, haunchLength: 0, haunchHeight: 0, haunchSide: 'both' as const,
  },
  standard: {
    id: 'KL1(1)', b: 300, h: 600, top: '2C25', bottom: '4C25',
    stirrup: 'A8@100/200(2)', leftSupport: '2C25', rightSupport: '4C25',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, spanLength: 4000, hc: 500, supportDepth: 600,
    haunchType: 'none' as const, haunchLength: 0, haunchHeight: 0, haunchSide: 'both' as const,
    sideBar: 'G4C12',
  },
  complex: {
    id: 'KL2(1)', b: 350, h: 700, top: '4C25(2)', bottom: '6C28(2)',
    stirrup: 'A10@100/200(4)', leftSupport: '4C25', rightSupport: '6C25(4/2)',
    leftSupport2: '2C25', rightSupport2: '2C25',
    concreteGrade: 'C35' as const, seismicGrade: '二级' as const, cover: 25, spanLength: 6000, hc: 600, supportDepth: 700,
    haunchType: 'none' as const, haunchLength: 0, haunchHeight: 0, haunchSide: 'both' as const,
    sideBar: 'N4C16',
  },
  haunchH: {
    id: 'KL3(1)', b: 300, h: 600, top: '2C25', bottom: '4C25',
    stirrup: 'A8@100/200(2)', leftSupport: '2C25', rightSupport: '4C25',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, spanLength: 6000, hc: 500, supportDepth: 600,
    haunchType: 'horizontal' as const, haunchLength: 800, haunchHeight: 300, haunchSide: 'both' as const,
  },
  haunchV: {
    id: 'KL4(1)', b: 300, h: 600, top: '2C25', bottom: '4C25',
    stirrup: 'A8@100/200(2)', leftSupport: '2C25', rightSupport: '4C25',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, spanLength: 4000, hc: 500, supportDepth: 600,
    haunchType: 'vertical' as const, haunchLength: 600, haunchHeight: 150, haunchSide: 'both' as const,
  },
  multiSpan: {
    id: 'KL5(3)', b: 300, h: 600, top: '2C25', bottom: '4C25',
    stirrup: 'A8@100/200(2)', leftSupport: '2C25', rightSupport: '4C25',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, spanLength: 4000, hc: 500, supportDepth: 600,
    haunchType: 'none' as const, haunchLength: 0, haunchHeight: 0, haunchSide: 'both' as const,
    sideBar: 'G4C12', spanCount: 3,
  },
  mixedDia: {
    id: 'KL6(1)', b: 350, h: 700, top: '2C25+2C22', bottom: '4C25+2C22',
    stirrup: 'A10@100/200(4)', leftSupport: '4C25', rightSupport: '4C25',
    concreteGrade: 'C35' as const, seismicGrade: '二级' as const, cover: 25, spanLength: 6000, hc: 600, supportDepth: 700,
    haunchType: 'none' as const, haunchLength: 0, haunchHeight: 0, haunchSide: 'both' as const,
    sideBar: 'G4C12',
  },
} as const;

export const COLUMN_PRESETS = {
  simple:   {
    id: 'KZ1', b: 400, h: 400, main: '8C20', stirrup: 'A8@100/200(2)',
    cornerMain: '4C20', bMiddleMain: '', hMiddleMain: '',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, height: 3000,
    hasVariableSection: false, upperB: 350, upperH: 350, variableStart: 2200,
    topNodeType: 'middle' as const, roofBeamH: 600, roofBeamB: 300, hasRoofSlab: true, roofSlabThickness: 120,
    baseSupportType: 'foundation' as const, baseSupportWidth: 900, baseSupportHeight: 250,
  },
  standard: {
    id: 'KZ2', b: 500, h: 500, main: '12C25', stirrup: 'A10@100/200(4)',
    cornerMain: '4C25', bMiddleMain: '2C22', hMiddleMain: '2C22',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25, height: 3000,
    hasVariableSection: false, upperB: 450, upperH: 450, variableStart: 2200,
    topNodeType: 'edge' as const, roofBeamH: 650, roofBeamB: 300, hasRoofSlab: true, roofSlabThickness: 120,
    baseSupportType: 'wall' as const, baseSupportWidth: 250, baseSupportHeight: 900,
  },
} as const;

export const SLAB_PRESETS = {
  simple: {
    id: 'LB1', thickness: 120,
    spanX: 3000, spanY: 3000,
    supportType: 'simple' as const, supportBeamWidth: 250,
    bottomX: 'C10@150', bottomY: 'C10@200',
    topX: '', topY: '',
    distribution: 'A6@250',
    concreteGrade: 'C30' as const, cover: 15,
  },
  standard: {
    id: 'LB2', thickness: 150,
    spanX: 4200, spanY: 3600,
    supportType: 'continuous' as const, supportBeamWidth: 250,
    bottomX: 'C12@150', bottomY: 'C10@200',
    topX: 'C10@200', topY: 'C10@200',
    supportNegX: 'C12@150', supportNegY: 'C10@200',
    distribution: 'A6@250',
    concreteGrade: 'C30' as const, cover: 15,
  },
  thick: {
    id: 'LB3', thickness: 200,
    spanX: 6000, spanY: 4800,
    supportType: 'continuous' as const, supportBeamWidth: 300,
    bottomX: 'C14@150', bottomY: 'C12@150',
    topX: 'C12@200', topY: 'C10@200',
    supportNegX: 'C14@150', supportNegY: 'C12@200',
    distribution: 'A8@200',
    concreteGrade: 'C35' as const, cover: 20,
  },
} as const;

// 剪力墙分布筋格式: "C10@200" => { grade:'C', diameter:10, spacing:200 }
export function parseWallRebar(str: string): { grade: string; diameter: number; spacing: number } {
  return parseSlabRebar(str); // same format
}

export const SHEAR_WALL_PRESETS = {
  simple: {
    id: 'Q1', bw: 200, lw: 3000, hw: 3000,
    vertBar: 'C10@200', horizBar: 'C10@200',
    boundaryType: 'gbz' as const, boundaryForm: 'concealed' as const, boundaryLength: 400, boundaryProjection: 0,
    boundaryMain: '8C16', boundaryStirrup: 'A8@100',
    tieBar: 'A6@600',
    hasOpening: false, openingWidth: 1000, openingHeight: 1200, openingBottom: 900, openingOffsetX: 0,
    openingVertBar: 'C12@150', openingHorizBar: 'C12@150',
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 20,
  },
  standard: {
    id: 'Q2', bw: 250, lw: 4500, hw: 3000,
    vertBar: 'C12@200', horizBar: 'C10@200',
    boundaryType: 'ybz' as const, boundaryForm: 'endColumn' as const, boundaryLength: 500, boundaryProjection: 120,
    boundaryMain: '12C18', boundaryStirrup: 'A8@100',
    tieBar: 'A8@600',
    hasOpening: true, openingWidth: 1200, openingHeight: 1500, openingBottom: 900, openingOffsetX: 0,
    openingVertBar: 'C14@150', openingHorizBar: 'C14@150',
    concreteGrade: 'C35' as const, seismicGrade: '二级' as const, cover: 20,
  },
} as const;

export const JOINT_PRESETS = {
  middleBent: {
    colB: 500, colH: 500, colMain: '12C25', colStirrup: 'A10@100/200(4)',
    beamB: 300, beamH: 600, beamTop: '4C25', beamBottom: '4C25', beamStirrup: 'A8@100/200(2)',
    jointType: 'middle' as const, anchorType: 'bent' as const,
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25,
  },
  middleStraight: {
    colB: 600, colH: 600, colMain: '16C25', colStirrup: 'A10@100/200(4)',
    beamB: 300, beamH: 600, beamTop: '4C22', beamBottom: '4C22', beamStirrup: 'A8@100/200(2)',
    jointType: 'middle' as const, anchorType: 'straight' as const,
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25,
  },
  side: {
    colB: 500, colH: 500, colMain: '12C25', colStirrup: 'A10@100/200(4)',
    beamB: 250, beamH: 500, beamTop: '3C25', beamBottom: '3C22', beamStirrup: 'A8@100/200(2)',
    jointType: 'side' as const, anchorType: 'bent' as const,
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 25,
  },
} as const;

export const STAIR_PRESETS = {
  standard: {
    id: 'AT-1', stairType: 'AT' as const,
    stepCount: 11, stepHeight: 150, stepWidth: 280,
    slabThickness: 120, flightWidth: 1200,
    topPlatformLen: 1500, botPlatformLen: 1500, platformThickness: 120,
    beamB: 250, beamH: 350,
    topBar: 'C8@200', bottomBar: 'C10@150', distBar: 'A6@250',
    concreteGrade: 'C30' as const, cover: 15,
  },
  wide: {
    id: 'AT-2', stairType: 'AT' as const,
    stepCount: 13, stepHeight: 160, stepWidth: 260,
    slabThickness: 140, flightWidth: 1500,
    topPlatformLen: 1800, botPlatformLen: 1800, platformThickness: 140,
    beamB: 250, beamH: 400,
    topBar: 'C10@200', bottomBar: 'C12@150', distBar: 'A8@250',
    concreteGrade: 'C30' as const, cover: 20,
  },
  compact: {
    id: 'AT-3', stairType: 'AT' as const,
    stepCount: 9, stepHeight: 167, stepWidth: 260,
    slabThickness: 100, flightWidth: 1100,
    topPlatformLen: 1200, botPlatformLen: 1200, platformThickness: 100,
    beamB: 200, beamH: 300,
    topBar: 'C8@250', bottomBar: 'C10@200', distBar: 'A6@300',
    concreteGrade: 'C25' as const, cover: 15,
  },
  bt_standard: {
    id: 'BT-1', stairType: 'BT' as const,
    stepCount: 11, stepHeight: 150, stepWidth: 280,
    slabThickness: 120, flightWidth: 1200,
    topPlatformLen: 1500, botPlatformLen: 1200, platformThickness: 120,
    beamB: 250, beamH: 350,
    botFlatLen: 700,
    topBar: 'C8@200', bottomBar: 'C10@150', distBar: 'A6@250',
    concreteGrade: 'C30' as const, cover: 15,
  },
  bt_wide: {
    id: 'BT-2', stairType: 'BT' as const,
    stepCount: 13, stepHeight: 160, stepWidth: 260,
    slabThickness: 140, flightWidth: 1500,
    topPlatformLen: 1800, botPlatformLen: 1500, platformThickness: 140,
    beamB: 250, beamH: 400,
    botFlatLen: 900,
    topBar: 'C10@200', bottomBar: 'C12@150', distBar: 'A8@250',
    concreteGrade: 'C30' as const, cover: 20,
  },
  bt_compact: {
    id: 'BT-3', stairType: 'BT' as const,
    stepCount: 9, stepHeight: 167, stepWidth: 260,
    slabThickness: 100, flightWidth: 1100,
    topPlatformLen: 1200, botPlatformLen: 1000, platformThickness: 100,
    beamB: 200, beamH: 300,
    botFlatLen: 600,
    topBar: 'C8@250', bottomBar: 'C10@200', distBar: 'A6@300',
    concreteGrade: 'C25' as const, cover: 15,
  },
} as const;

export const FOUNDATION_PRESETS = {
  simple: {
    id: 'DJ-1', shape: 'stepped' as const,
    bx: 1500, by: 1500, h: 500,
    stepCount: 1,
    stepDims: [{ bx: 1500, by: 1500, h: 500 }],
    bottomBarX: 'C12@150', bottomBarY: 'C12@150',
    shortenBottomBarX: false, shortenBottomBarY: false,
    colBx: 400, colBy: 400, colMain: '8C20',
    concreteGrade: 'C30' as const, cover: 40,
  },
  standard: {
    id: 'DJ-2', shape: 'stepped' as const,
    bx: 2400, by: 2400, h: 800,
    stepCount: 2,
    stepDims: [
      { bx: 2400, by: 2400, h: 400 },
      { bx: 1600, by: 1600, h: 400 },
    ],
    bottomBarX: 'C14@150', bottomBarY: 'C14@150',
    shortenBottomBarX: false, shortenBottomBarY: false,
    colBx: 500, colBy: 500, colMain: '12C25',
    concreteGrade: 'C35' as const, cover: 40,
  },
  tapered: {
    id: 'DJ-3', shape: 'tapered' as const,
    bx: 2000, by: 2000, h: 600,
    stepCount: 1,
    stepDims: [{ bx: 2000, by: 2000, h: 600 }],
    bottomBarX: 'C12@200', bottomBarY: 'C12@200',
    shortenBottomBarX: false, shortenBottomBarY: false,
    colBx: 400, colBy: 400, colMain: '8C22',
    concreteGrade: 'C30' as const, cover: 40,
  },
  dualColumn: {
    id: 'DJ-4', shape: 'stepped' as const,
    bx: 4200, by: 2000, h: 800,
    stepCount: 2,
    stepDims: [
      { bx: 4200, by: 2000, h: 400 },
      { bx: 3400, by: 1400, h: 400 },
    ],
    bottomBarX: 'C14@150', bottomBarY: 'C14@150',
    shortenBottomBarX: false, shortenBottomBarY: true,
    colBx: 500, colBy: 500, colMain: '12C25',
    columnCount: 2 as const, colSpacing: 2400,
    topBarX: 'C14@150', topBarXCount: 9, topBarY: 'C10@200',
    topBandWidth: 1200,
    hasFoundationBeam: true,
    foundationBeamB: 600,
    foundationBeamH: 700,
    foundationBeamStirrup: 'A10@150(4)',
    foundationBeamBottom: '4C22',
    foundationBeamTop: '4C20',
    foundationBeamEndType: 'bothSides' as const,
    foundationBeamOverhangSide: 'right' as const,
    foundationBeamOverhang: 300,
    concreteGrade: 'C35' as const, cover: 40,
  },
} as const;

export const STRIPFOUNDATION_PRESETS = {
  singleBeam: {
    id: 'TJ-1',
    stripKind: 'beamPlate' as const,
    length: 9000,
    width: 1800,
    h: 350,
    bottomBar: 'C14@150',
    distBar: 'A8@250',
    supportType: 'beam' as const,
    supportCount: 1 as const,
    supportWidth: 400,
    supportHeight: 700,
    jlBottom: '4C20',
    jlTop: '4C18',
    jlStirrup: 'A8@200(2)',
    jlStirrupAlt: 'A8@200(2)',
    jlEndType: 'none' as const,
    jlOverhangSide: 'right' as const,
    jlOverhang: 400,
    concreteGrade: 'C30' as const,
    cover: 40,
  },
  doubleBeam: {
    id: 'TJ-2',
    stripKind: 'beamPlate' as const,
    length: 12000,
    width: 2600,
    h: 400,
    bottomBar: 'C16@150',
    distBar: 'A8@250',
    topBar: 'C14@150',
    topDistBar: 'A8@250',
    supportType: 'beam' as const,
    supportCount: 2 as const,
    supportWidth: 450,
    supportHeight: 800,
    supportSpacing: 1400,
    jlBottom: '10C22(4/6)',
    jlTop: '4C20',
    jlStirrup: 'A10@150(4)',
    jlStirrupAlt: 'A8@200(2)',
    jlEndType: 'bothSides' as const,
    jlOverhangSide: 'right' as const,
    jlOverhang: 600,
    hasJcl: true,
    jclCount: 1,
    jclSpacing: 6000,
    jclB: 350,
    jclH: 650,
    jclBottom: '6C18(2/4)',
    jclTop: '4C16',
    jclStirrup: 'A8@200(2)',
    jclStirrupAlt: 'A8@250(2)',
    jclEndType: 'none' as const,
    jclOverhangSide: 'right' as const,
    jclOverhang: 300,
    hasLocalOverride: true,
    localOverrideStart: 3600,
    localOverrideLength: 1800,
    localBottomBar: 'C18@150',
    localTopBar: 'C16@150',
    localOverrideNote: '跨中原位修正段',
    concreteGrade: 'C35' as const,
    cover: 40,
  },
  doubleWall: {
    id: 'TJ-3',
    stripKind: 'slab' as const,
    length: 10000,
    width: 2200,
    h: 350,
    bottomBar: 'C14@150',
    distBar: 'A8@250',
    topBar: 'C12@150',
    topDistBar: 'A8@250',
    supportType: 'wall' as const,
    supportCount: 2 as const,
    supportWidth: 250,
    supportHeight: 500,
    supportSpacing: 1200,
    hasLocalOverride: true,
    localOverrideStart: 2800,
    localOverrideLength: 1600,
    localBottomBar: 'C16@150',
    localTopBar: 'C14@150',
    localOverrideNote: '双墙间底板原位修正',
    concreteGrade: 'C30' as const,
    cover: 40,
  },
} as const;

export const PILECAP_PRESETS = {
  twoPile: {
    id: 'CT-1',
    bx: 1800, by: 800, h: 800,
    bottomBarX: 'C14@150', bottomBarY: 'C14@150',
    colBx: 400, colBy: 400, colMain: '8C20',
    pileLayout: 'grid' as const,
    pileDiameter: 600, pileCount: 2,
    pileSpacingX: 1200, pileSpacingY: 0,
    pileLength: 8000,
    concreteGrade: 'C30' as const, cover: 50,
  },
  fourPile: {
    id: 'CT-2',
    bx: 2000, by: 2000, h: 1000,
    bottomBarX: 'C16@150', bottomBarY: 'C16@150',
    colBx: 500, colBy: 500, colMain: '12C25',
    pileLayout: 'grid' as const,
    pileDiameter: 600, pileCount: 4,
    pileSpacingX: 1200, pileSpacingY: 1200,
    pileLength: 12000,
    concreteGrade: 'C35' as const, cover: 50,
  },
  sixPile: {
    id: 'CT-3',
    bx: 3000, by: 2000, h: 1200,
    bottomBarX: 'C18@150', bottomBarY: 'C18@150',
    colBx: 600, colBy: 600, colMain: '16C25',
    pileLayout: 'grid' as const,
    pileDiameter: 800, pileCount: 6,
    pileSpacingX: 1200, pileSpacingY: 1200,
    pileLength: 15000,
    concreteGrade: 'C35' as const, cover: 50,
  },
} as const;

export const RAFT_PRESETS = {
  small: {
    id: 'FB-1',
    raftType: 'flat' as const,
    lx: 9000, ly: 9000, h: 500,
    bottomBarX: 'C14@150', bottomBarY: 'C14@150',
    topBarX: 'C12@200', topBarY: 'C12@200',
    bottomCrossOrder: 'xBelowY' as const, topCrossOrder: 'xBelowY' as const,
    colBx: 400, colBy: 400, colMain: '8C20',
    colCountX: 2, colCountY: 2, colSpacingX: 6000, colSpacingY: 6000,
    concreteGrade: 'C30' as const, seismicGrade: '三级' as const, cover: 40,
  },
  standard: {
    id: 'FB-2',
    raftType: 'flat' as const,
    lx: 18000, ly: 12000, h: 700,
    bottomBarX: 'C16@150', bottomBarY: 'C16@150',
    topBarX: 'C14@200', topBarY: 'C14@200',
    bottomCrossOrder: 'xBelowY' as const, topCrossOrder: 'xBelowY' as const,
    colBx: 500, colBy: 500, colMain: '12C25',
    colCountX: 3, colCountY: 2, colSpacingX: 7500, colSpacingY: 9000,
    concreteGrade: 'C35' as const, seismicGrade: '三级' as const, cover: 40,
  },
  large: {
    id: 'FB-3',
    raftType: 'flat' as const,
    lx: 30000, ly: 18000, h: 1000,
    bottomBarX: 'C20@150', bottomBarY: 'C20@150',
    topBarX: 'C16@150', topBarY: 'C16@150',
    bottomCrossOrder: 'xBelowY' as const, topCrossOrder: 'xBelowY' as const,
    colBx: 600, colBy: 600, colMain: '16C25',
    colCountX: 4, colCountY: 3, colSpacingX: 8000, colSpacingY: 7500,
    concreteGrade: 'C35' as const, seismicGrade: '二级' as const, cover: 50,
  },
  beamSlab: {
    id: 'JL-FB-1',
    raftType: 'beamSlab' as const,
    lx: 18000, ly: 12000, h: 400,
    bottomBarX: 'C14@200', bottomBarY: 'C14@200',
    topBarX: 'C12@200', topBarY: 'C12@200',
    bottomCrossOrder: 'xBelowY' as const, topCrossOrder: 'xBelowY' as const,
    colBx: 500, colBy: 500, colMain: '12C25',
    colCountX: 3, colCountY: 2, colSpacingX: 7500, colSpacingY: 9000,
    beamB: 600, beamH: 900,
    beamPosition: 'low' as const,
    beamBottom: '4C25', beamTop: '6C25', beamStirrup: 'A10@150(4)',
    concreteGrade: 'C35' as const, seismicGrade: '三级' as const, cover: 40,
  },
  flatPlate: {
    id: 'BPB-FB-1',
    raftType: 'flatPlate' as const,
    lx: 18000, ly: 12000, h: 700,
    bottomBarX: 'C14@200', bottomBarY: 'C14@200',
    topBarX: 'C12@200', topBarY: 'C12@200',
    bottomCrossOrder: 'xBelowY' as const, topCrossOrder: 'xBelowY' as const,
    colBx: 500, colBy: 500, colMain: '12C25',
    colCountX: 3, colCountY: 2, colSpacingX: 7500, colSpacingY: 9000,
    colStripWidth: 3750,
    colStripBarX: 'C16@200', colStripBarY: 'C16@200',
    concreteGrade: 'C35' as const, seismicGrade: '三级' as const, cover: 40,
  },
} as const;
