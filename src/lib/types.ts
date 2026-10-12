import type { ConcreteGrade, SeismicGrade } from './anchor';

/** 混合直径钢筋分段 (22G101: 2C25+2C22) */
export interface RebarSegment {
  count: number;
  grade: string;
  diameter: number;
}

export interface RebarInfo {
  count: number;
  grade: string;
  diameter: number;
  rows?: number; // 排数，如 6C25(2) 表示2排
  perRow?: number[]; // 每排根数，如 [4,2] 表示第一排4根第二排2根
  segments?: RebarSegment[]; // 混合直径分段，如 2C25+2C22 → [{count:2,grade:'C',diameter:25},{count:2,grade:'C',diameter:22}]
}

export interface StirrupInfo {
  grade: string;
  diameter: number;
  spacingDense: number;
  spacingNormal: number;
  legs: number;
  typeCode?: string;  // 22G101-1 箍筋类型编号 (A, B, C, D, E, F)
}

export type HaunchType = 'none' | 'horizontal' | 'vertical';

export interface BeamParams {
  beamKind?: 'frame' | 'coupling';
  id: string;
  b: number;
  h: number;
  top: string;
  bottom: string;
  stirrup: string;
  leftSupport?: string;
  rightSupport?: string;
  // 新增
  concreteGrade: ConcreteGrade;
  seismicGrade: SeismicGrade;
  cover: number;          // 保护层厚度 mm
  spanLength: number;     // 梁净跨 mm
  hc: number;             // 支座柱截面宽度 mm（沿梁方向）
  supportDepth?: number;  // 支座柱截面深度 mm（垂直梁方向）
  // 加腋
  haunchType: HaunchType;       // 加腋类型
  haunchLength: number;         // 加腋长度 c1 (mm)
  haunchHeight: number;         // 加腋高度 (mm)，水平加腋=单侧宽度增加量，竖向加腋=梁底高度增加量
  haunchSide: 'both' | 'left' | 'right'; // 加腋位置
  leftSupport2?: string;  // 第二排左支座负筋，如 2C25（伸入跨内 ln/4）
  rightSupport2?: string; // 第二排右支座负筋
  sideBar?: string; // 腰筋/抗扭筋，如 G4C12（构造腰筋）、N2C16（抗扭筋）
  tieBar?: string;  // 拉筋，如 A6（HPB300 Φ6），留空时按22G101自动确定
  erectionBar?: string; // 架立筋，如 2C12，留空时按规范自动确定
  spanCount?: number; // 跨数（多跨连续梁），默认1
  spanWidths?: number[];  // 各跨截面宽 mm，length = spanCount，未定义则全用 b
  spanHeights?: number[]; // 各跨截面高 mm，length = spanCount，未定义则全用 h
  spanLengths?: number[]; // 各跨净跨 mm，length = spanCount，未定义则全用 spanLength
  innerSupport?: string;  // 中间支座负筋（内跨支座，贯通中间柱），如 4C25
}

export interface ColumnParams {
  id: string;
  b: number;
  h: number;
  main: string;            // 全部纵筋 (legacy, e.g. "12C25")
  cornerMain?: string;     // 角筋 (22G101-1, e.g. "4C25")
  bMiddleMain?: string;    // b边中部筋 (e.g. "2C20")
  hMiddleMain?: string;    // h边中部筋 (e.g. "2C20")
  stirrup: string;
  stirrupType?: string;    // 箍筋类型编号 (22G101-1, e.g. "A", "B", "C")
  // 新增
  concreteGrade: ConcreteGrade;
  seismicGrade: SeismicGrade;
  cover: number;
  height: number;         // 柱净高 mm
  hasVariableSection?: boolean;
  upperB?: number;        // 变截面后上段宽度
  upperH?: number;        // 变截面后上段高度
  variableStart?: number; // 变截面起始高度（距柱底）
  topNodeType?: 'middle' | 'edge' | 'corner';
  roofBeamH?: number;
  roofBeamB?: number;
  hasRoofSlab?: boolean;
  roofSlabThickness?: number;
  baseSupportType?: 'foundation' | 'wall' | 'beam';
  baseSupportWidth?: number;
  baseSupportHeight?: number;
}

export type SlabSupportType = 'simple' | 'continuous' | 'cantilever';

export interface SlabParams {
  id: string;
  thickness: number;
  spanX: number;              // X向板跨 (mm), 默认 3000
  spanY: number;              // Y向板跨 (mm), 默认 3000
  supportType: SlabSupportType; // 支座类型
  supportBeamWidth: number;   // 支座梁宽 (mm), 默认 250
  bottomX: string;
  bottomY: string;
  topX: string;
  topY: string;
  supportNegX?: string;       // X向支座负筋 (22G101, 如 "C12@150")
  supportNegY?: string;       // Y向支座负筋
  distribution: string;
  // 新增
  concreteGrade: ConcreteGrade;
  cover: number;
}

export interface JointParams {
  colB: number;
  colH: number;
  colMain: string;
  colStirrup: string;
  beamB: number;
  beamH: number;
  beamTop: string;
  beamBottom: string;
  beamStirrup: string;
  jointType: 'middle' | 'side' | 'corner';
  anchorType: 'straight' | 'bent';
  // 新增
  concreteGrade: ConcreteGrade;
  seismicGrade: SeismicGrade;
  cover: number;
}

export interface ShearWallParams {
  id: string;
  bw: number;       // 墙厚 mm (200-400)
  lw: number;       // 墙长 mm (1000-6000)
  hw: number;       // 墙净高 mm
  vertBar: string;  // 竖向分布筋 e.g. C10@200
  horizBar: string; // 水平分布筋 e.g. C10@200
  boundaryType?: 'ybz' | 'gbz' | 'fbz' | 'az'; // 边缘构件类型
  boundaryForm?: 'concealed' | 'endColumn' | 'wingWall' | 'cornerWall'; // 边缘构件外形
  boundaryLength?: number; // 边缘构件长度 mm
  boundaryProjection?: number; // 边缘构件凸出深度 mm（扶壁柱等）
  boundaryMain: string;   // 约束边缘构件纵筋 e.g. 8C16
  boundaryStirrup: string; // 约束边缘构件箍筋 e.g. A8@100
  tieBar?: string; // 拉结筋 e.g. A8@600
  hasOpening?: boolean;
  openingWidth?: number; // 洞口宽 mm
  openingHeight?: number; // 洞口高 mm
  openingBottom?: number; // 洞口底距墙底 mm
  openingOffsetX?: number; // 洞口中心相对墙中心偏移 mm
  openingVertBar?: string; // 洞口侧边补强筋 e.g. C12@150
  openingHorizBar?: string; // 洞口上下补强筋 e.g. C12@150
  concreteGrade: import('./anchor').ConcreteGrade;
  seismicGrade: import('./anchor').SeismicGrade;
  cover: number;
}

// ═══════════════════════════════════════════════════════════════════
// 楼梯参数 (22G101-2)
// ═══════════════════════════════════════════════════════════════════

/** 楼梯类型 — 预留扩展 */
export type StairType = 'AT' | 'BT' | 'CT' | 'DT' | 'ET';

/** AT 型板式楼梯参数 */
export interface StairParams {
  id: string;
  stairType: StairType;        // 楼梯类型
  // 几何
  stepCount: number;           // 踏步数 n
  stepHeight: number;          // 踏步高 h (mm)
  stepWidth: number;           // 踏步宽 b (mm)
  slabThickness: number;       // 梯板厚度 (mm)
  flightWidth: number;         // 梯段宽度 (mm)，垂直于行走方向
  // 平台
  topPlatformLen: number;      // 上平台板长 (mm)
  botPlatformLen: number;      // 下平台板长 (mm)
  platformThickness: number;   // 平台板厚 (mm)
  // 梯梁（梯板端支座梁）
  beamB: number;               // 梯梁宽 (mm)
  beamH: number;               // 梯梁高 (mm)
  // BT型专属
  botFlatLen?: number;         // BT型 低端平板长 (mm)，AT型忽略
  // 配筋
  topBar: string;              // 上部纵筋 e.g. C10@150
  bottomBar: string;           // 下部纵筋 e.g. C12@150
  distBar: string;             // 板板分布筋 e.g. A6@250
  // 材料
  concreteGrade: import('./anchor').ConcreteGrade;
  cover: number;               // 保护层 (mm)
}

// ═══════════════════════════════════════════════════════════════════
// 基础参数 (22G101-3)
// ═══════════════════════════════════════════════════════════════════

/** 独立基础形状 */
export type FoundationShape = 'stepped' | 'tapered';
export type FoundationBeamEndType = 'none' | 'oneSide' | 'bothSides';
export type FoundationBeamOverhangSide = 'left' | 'right';

/** 阶形基础每阶尺寸 */
export interface FoundationStepDim {
  bx: number;  // 该阶 X 向宽 (mm)
  by: number;  // 该阶 Y 向宽 (mm)
  h: number;   // 该阶高度 (mm)
}

/** 独立基础参数 */
export interface FoundationParams {
  id: string;
  shape: FoundationShape;        // 阶形 / 锥形
  // 底面尺寸
  bx: number;                    // 基础底面 X 向宽 (mm)
  by: number;                    // 基础底面 Y 向宽 (mm)
  h: number;                     // 基础总高 (mm)
  // 阶形基础
  stepCount: number;             // 台阶数 (1~3)
  stepDims: FoundationStepDim[]; // 各阶尺寸（从底到顶）
  // 底部配筋
  bottomBarX: string;            // X 向底筋 e.g. C12@150
  bottomBarY: string;            // Y 向底筋 e.g. C12@150
  shortenBottomBarX?: boolean;   // 大尺寸基础隔一布一减短 10%（X向底筋）
  shortenBottomBarY?: boolean;   // 大尺寸基础隔一布一减短 10%（Y向底筋）
  // 柱
  colBx: number;                 // 柱截面 X 向 (mm)
  colBy: number;                 // 柱截面 Y 向 (mm)
  colMain: string;               // 柱插筋 e.g. 8C20
  // 双柱基础 (22G101-3 p2-12)
  columnCount?: 1 | 2;           // 柱数 (默认1)
  colSpacing?: number;           // 双柱中心距 (mm), 仅 columnCount=2 时有效
  topBarX?: string;              // 顶部柱间纵向受力钢筋 e.g. C14@150
  topBarXCount?: number;         // 顶部纵向受力筋总根数（非满布时）
  topBarY?: string;              // 顶部柱间分布钢筋 e.g. C10@200
  topBandWidth?: number;         // 双柱基础顶部钢筋带宽（沿 Y 向）
  hasFoundationBeam?: boolean;   // 双柱基础是否设置基础梁
  foundationBeamB?: number;      // 基础梁宽度
  foundationBeamH?: number;      // 基础梁高度
  foundationBeamStirrup?: string; // 基础梁箍筋
  foundationBeamBottom?: string; // 基础梁底部纵筋
  foundationBeamTop?: string;    // 基础梁顶部纵筋
  foundationBeamEndType?: FoundationBeamEndType;      // 基础梁端部外伸类型
  foundationBeamOverhangSide?: FoundationBeamOverhangSide; // 单端外伸方向
  foundationBeamOverhang?: number;                    // 外伸长度
  // 材料
  concreteGrade: import('./anchor').ConcreteGrade;
  seismicGrade?: import('./anchor').SeismicGrade;
  cover: number;                 // 保护层 (mm)
}

// ═══════════════════════════════════════════════════════════════════
// 承台参数 (22G101-3)
// ═══════════════════════════════════════════════════════════════════

/** 桩排布方式 */
export type PileLayout = 'grid' | 'circular';

/** 承台参数 */
export interface PileCapParams {
  id: string;
  // 承台尺寸
  bx: number;                    // 承台 X 向宽 (mm)
  by: number;                    // 承台 Y 向宽 (mm)
  h: number;                     // 承台高度 (mm)
  // 底部配筋
  bottomBarX: string;            // X 向底筋 e.g. C14@150
  bottomBarY: string;            // Y 向底筋 e.g. C14@150
  // 柱
  colBx: number;                 // 柱截面 X 向 (mm)
  colBy: number;                 // 柱截面 Y 向 (mm)
  colMain: string;               // 柱插筋 e.g. 8C20
  // 桩参数
  pileLayout: PileLayout;        // 桩排布方式
  pileDiameter: number;          // 桩径 (mm)
  pileCount: number;             // 桩数
  pileSpacingX: number;          // X 向桩距 (mm, 中心到中心)
  pileSpacingY: number;          // Y 向桩距 (mm, 中心到中心)
  pileLength: number;            // 桩长 (mm, 用于显示)
  // 材料
  concreteGrade: import('./anchor').ConcreteGrade;
  seismicGrade?: import('./anchor').SeismicGrade;
  cover: number;                 // 保护层 (mm)
}

// ═══════════════════════════════════════════════════════════════════
// 条形基础参数 (22G101-3)
// ═══════════════════════════════════════════════════════════════════

export type StripFoundationKind = 'beamPlate' | 'slab';
export type StripSupportType = 'beam' | 'wall';

export interface StripFoundationParams {
  id: string;
  stripKind: StripFoundationKind;   // 梁板式 / 板式条基
  length: number;                   // 条形基础沿轴线长度 (mm)
  width: number;                    // 底板总宽度 (mm)
  h: number;                        // 底板厚度 (mm)
  bottomBar: string;                // 横向受力钢筋（底部） e.g. C14@150
  distBar: string;                  // 纵向分布钢筋（底部） e.g. A8@250
  topBar?: string;                  // 顶部横向受力钢筋（双梁/双墙之间）
  topDistBar?: string;              // 顶部分布钢筋
  supportType: StripSupportType;    // 上部支承类型：梁 / 墙
  supportCount: 1 | 2;              // 单梁(墙) / 双梁(墙)
  supportWidth: number;             // 梁宽或墙厚 (mm)
  supportHeight: number;            // 梁高或墙高（仅用于 3D/算量示意）(mm)
  supportSpacing?: number;          // 双梁(墙)中心距 (mm)
  // JL 主梁细部筋
  jlBottom?: string;                // JL底部贯通纵筋
  jlTop?: string;                   // JL顶部贯通纵筋
  jlStirrup?: string;               // JL箍筋
  jlStirrupAlt?: string;            // JL第二种箍筋（跨中/非外伸部位）
  jlEndType?: FoundationBeamEndType;      // JL端部外伸类型
  jlOverhangSide?: FoundationBeamOverhangSide; // JL单端外伸方向
  jlOverhang?: number;              // JL外伸长度 (mm)
  // JCL 次梁（可选）
  hasJcl?: boolean;                 // 是否设置基础次梁
  jclCount?: number;                // 次梁道数
  jclSpacing?: number;              // 次梁中心距（沿条基长度方向）
  jclB?: number;                    // 次梁宽度 (mm)
  jclH?: number;                    // 次梁高度 (mm)
  jclBottom?: string;               // 次梁底部纵筋
  jclTop?: string;                  // 次梁顶部纵筋
  jclStirrup?: string;              // 次梁箍筋
  jclStirrupAlt?: string;           // 次梁第二种箍筋（跨中/非外伸部位）
  jclEndType?: FoundationBeamEndType;      // JCL端部外伸类型
  jclOverhangSide?: FoundationBeamOverhangSide; // JCL单端外伸方向
  jclOverhang?: number;             // JCL外伸长度 (mm)
  // 原位修正（示意）
  hasLocalOverride?: boolean;       // 是否设置原位修正段
  localOverrideStart?: number;      // 原位修正段起点（距左端 mm）
  localOverrideLength?: number;     // 原位修正段长度 (mm)
  localBottomBar?: string;          // 原位修正底部横向筋
  localTopBar?: string;             // 原位修正顶部横向筋
  localOverrideNote?: string;       // 文字说明
  concreteGrade: import('./anchor').ConcreteGrade;
  cover: number;                    // 保护层 (mm)
}

// ═══════════════════════════════════════════════════════════════════
// 筏板基础参数
// ═══════════════════════════════════════════════════════════════════

/**
 * 筏形基础类型 (22G101-3)
 * flat     — 平板式（仅配筋均匀分布，原有逻辑）
 * beamSlab — 梁板式（JL 基础主梁 + LPB 平板）
 * flatPlate— 平板式筏基板带（ZXB 柱下板带 + KZB 跨中板带，配筋密度有别）
 */
export type RaftType = 'flat' | 'beamSlab' | 'flatPlate';

/**
 * 梁板式筏基 — 基础梁位置 (22G101-3 §4.1.3)
 * high — 高板位：梁顶与板顶齐平，梁向下突出
 * low  — 低板位：梁底与板底齐平，梁向上突出
 * mid  — 中板位：板在梁的中部
 */
export type RaftBeamPosition = 'high' | 'low' | 'mid';
export type RebarCrossOrder = 'xBelowY' | 'yBelowX';

/** 筏板基础参数 */
export interface RaftFoundationParams {
  id: string;
  raftType: RaftType;            // 筏基类型（默认 'flat'）
  // 筏板尺寸
  lx: number;                    // X 向长度 (mm)
  ly: number;                    // Y 向宽度 (mm)
  h: number;                     // 板厚 (mm)
  // 底部配筋 (LPB 平板 / 均匀平板)
  bottomBarX: string;            // X 向底筋 e.g. C14@150
  bottomBarY: string;            // Y 向底筋 e.g. C14@150
  // 顶部配筋
  topBarX: string;               // X 向面筋 e.g. C12@200
  topBarY: string;               // Y 向面筋 e.g. C12@200
  bottomCrossOrder?: RebarCrossOrder; // 同层底筋交叉上下关系
  topCrossOrder?: RebarCrossOrder;    // 同层面筋交叉上下关系
  // 柱网 (矩形柱网)
  colBx: number;                 // 柱截面 X 向 (mm)
  colBy: number;                 // 柱截面 Y 向 (mm)
  colMain: string;               // 柱插筋 e.g. 8C20
  colCountX: number;             // X 向柱数
  colCountY: number;             // Y 向柱数
  colSpacingX: number;           // X 向柱距 (mm)
  colSpacingY: number;           // Y 向柱距 (mm)
  // ── 梁板式筏基 专属 (raftType === 'beamSlab') ──────────────────
  beamB?: number;                // 基础主梁宽 bw (mm), e.g. 600
  beamH?: number;                // 基础主梁高 hw (mm), e.g. 900
  beamPosition?: RaftBeamPosition; // 梁板位置关系
  beamBottom?: string;           // 基础梁底部贯通纵筋 e.g. 4C25
  beamTop?: string;              // 基础梁顶部贯通纵筋 e.g. 6C25
  beamStirrup?: string;          // 基础梁箍筋 e.g. A10@150(4)
  // ── 平板式筏基板带 专属 (raftType === 'flatPlate') ─────────────
  colStripWidth?: number;        // 柱下板带 ZXB 宽度 (mm, 通常取 colSpacing/2)
  colStripBarX?: string;         // ZXB X 向附加底筋 (叠加于 bottomBarX) e.g. C16@150
  colStripBarY?: string;         // ZXB Y 向附加底筋 e.g. C16@150
  // 材料
  concreteGrade: import('./anchor').ConcreteGrade;
  seismicGrade: import('./anchor').SeismicGrade;
  cover: number;                 // 保护层 (mm)
}

export type ComponentType = 'beam' | 'column' | 'slab' | 'joint' | 'shearwall' | 'stair' | 'foundation' | 'stripfoundation' | 'pilecap' | 'raft';
export type RebarRenderMode = 'solid' | 'centerline' | 'hybrid';

export interface RebarMeshInfo {
  type: 'top' | 'bottom' | 'stirrup' | 'leftSupport' | 'rightSupport' | 'leftSupport2' | 'rightSupport2' | 'main'
    | 'corner' | 'bMiddle' | 'hMiddle'
    | 'bottomX' | 'bottomY' | 'topX' | 'topY' | 'distribution' | 'supportNegX' | 'supportNegY'
    | 'colMain' | 'colStirrup' | 'beamTop' | 'beamBottom' | 'beamStirrup' | 'jointStirrup' | 'anchor'
    | 'vertBar' | 'horizBar' | 'boundaryMain' | 'boundaryStirrup'
    | 'wallTieBar' | 'wallOpeningRebar'
    | 'sideBar' | 'erection' | 'tieBar' | 'innerSupport'
    | 'stairTop' | 'stairBottom' | 'stairDist' | 'stairPlatform'
    | 'foundBottomX' | 'foundBottomY' | 'foundColMain' | 'foundTopX' | 'foundTopY'
    | 'foundBeamBottom' | 'foundBeamTop' | 'foundBeamStirrup'
    | 'stripBottom' | 'stripDist' | 'stripTop' | 'stripTopDist'
    | 'stripJlBottom' | 'stripJlTop' | 'stripJlStirrup'
    | 'stripJclBottom' | 'stripJclTop' | 'stripJclStirrup'
    | 'stripOverride'
    | 'pcBottomX' | 'pcBottomY' | 'pcColMain' | 'pcPile'
    | 'raftBottomX' | 'raftBottomY' | 'raftTopX' | 'raftTopY' | 'raftColMain'
    | 'raftBeamBottom' | 'raftBeamTop' | 'raftBeamStirrup' | 'raftColStrip';
  label: string;
  detail: string;
  setId?: string;
  instanceIndex?: number;
  groupLabel?: string;
  groupCount?: number;
  distributionRange?: string;
  relatedSetIds?: string[];
}
