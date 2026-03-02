/**
 * 全局常量定义
 * 统一管理颜色、单位换算、施工步骤等
 */

// ═══════════════════════════════════════════════════════════════════
// 单位换算
// ═══════════════════════════════════════════════════════════════════

/** mm → m 单位换算 */
export const S = 0.001;

// ═══════════════════════════════════════════════════════════════════
// 钢筋颜色
// ═══════════════════════════════════════════════════════════════════

/** 普通钢筋 (纵筋) */
export const COLOR_REBAR = '#C0392B';
export const COLOR_REBAR_HI = '#E74C3C';

/** 箍筋 - 通用 */
export const COLOR_STIRRUP = '#27AE60';
export const COLOR_STIRRUP_HI = '#2ECC71';

/** 箍筋 - 加密区 */
export const COLOR_STIRRUP_DENSE = '#1E8449';
export const COLOR_STIRRUP_DENSE_HI = '#27AE60';

/** 箍筋 - 非加密区 */
export const COLOR_STIRRUP_NORMAL = '#7DCEA0';
export const COLOR_STIRRUP_NORMAL_HI = '#A9DFBF';

/** 支座负筋 */
export const COLOR_SUPPORT = '#8E44AD';
export const COLOR_SUPPORT_HI = '#9B59B6';

/** 架立筋 */
export const COLOR_ERECTION = '#F39C12';
export const COLOR_ERECTION_HI = '#F1C40F';

/** 加腋附加筋 */
export const COLOR_HAUNCH = '#E67E22';
export const COLOR_HAUNCH_HI = '#F39C12';

/** 腰筋/抗扭筋 */
export const COLOR_SIDEBAR = '#2980B9';
export const COLOR_SIDEBAR_HI = '#3498DB';

/** 拉筋 */
export const COLOR_TIEBAR = '#1ABC9C';
export const COLOR_TIEBAR_HI = '#16A085';

/** 混凝土 (柱) */
export const COLOR_COLUMN = '#7F8C8D';

/** 剪力墙分布筋 */
export const COLOR_VERT_BAR = '#3498DB';
export const COLOR_VERT_BAR_HI = '#5DADE2';
export const COLOR_HORIZ_BAR = '#9B59B6';
export const COLOR_HORIZ_BAR_HI = '#AF7AC5';

/** 约束边缘构件 */
export const COLOR_BOUNDARY = '#E74C3C';
export const COLOR_BOUNDARY_HI = '#F1948A';

// ═══════════════════════════════════════════════════════════════════
// 施工步骤定义
// ═══════════════════════════════════════════════════════════════════

export interface ConstructionStep {
  groups: Set<string>;
  label: string;
}

/** 梁施工步骤 */
export const BEAM_CONSTRUCTION_STEPS: ConstructionStep[] = [
  { groups: new Set(['concrete']), label: '模板+混凝土' },
  { groups: new Set(['concrete', 'stirrup']), label: '+箍筋' },
  { groups: new Set(['concrete', 'stirrup', 'bottom']), label: '+下部纵筋' },
  { groups: new Set(['concrete', 'stirrup', 'bottom', 'top']), label: '+上部纵筋' },
  { groups: new Set(['concrete', 'stirrup', 'bottom', 'top', 'support']), label: '+支座负筋/架立筋' },
  { groups: new Set(['concrete', 'stirrup', 'bottom', 'top', 'support', 'sideBar']), label: '+腰筋/拉筋' },
  { groups: new Set(['concrete', 'stirrup', 'bottom', 'top', 'support', 'sideBar', 'haunch']), label: '+加腋附加筋' },
];

/** 柱施工步骤 */
export const COLUMN_CONSTRUCTION_STEPS: ConstructionStep[] = [
  { groups: new Set(['concrete']), label: '模板+混凝土' },
  { groups: new Set(['concrete', 'main']), label: '+纵筋' },
  { groups: new Set(['concrete', 'main', 'stirrup']), label: '+箍筋' },
];

/** 剪力墙施工步骤 */
export const SHEARWALL_CONSTRUCTION_STEPS: ConstructionStep[] = [
  { groups: new Set(['concrete']), label: '模板+混凝土' },
  { groups: new Set(['concrete', 'vertBar']), label: '+竖向分布筋' },
  { groups: new Set(['concrete', 'vertBar', 'horizBar']), label: '+水平分布筋' },
  { groups: new Set(['concrete', 'vertBar', 'horizBar', 'boundary']), label: '+约束边缘构件' },
];

// ═══════════════════════════════════════════════════════════════════
// 渲染参数
// ═══════════════════════════════════════════════════════════════════

/** 钢筋材质默认参数 */
export const REBAR_MATERIAL = {
  roughness: 0.4,
  metalness: 0.6,
};

/** 混凝土材质默认参数 */
export const CONCRETE_MATERIAL = {
  color: '#BDC3C7',
  roughness: 0.8,
};

/** 箍筋圆弧采样点数 */
export const STIRRUP_CURVE_SAMPLES = 160;

/** 箍筋弯钩采样点数 */
export const HOOK_CURVE_SAMPLES = 40;

/** 钢筋圆柱体段数 */
export const REBAR_SEGMENTS = 12;
