/**
 * AI Vision Prompt — 专门用于图纸/图片识别的 system prompt
 * 指导 AI 从施工图或手绘草图中提取平法标注，并通过 Agent 工具自动建模
 */

import type { ComponentType } from './types';

// ─── Component labels ───

const COMPONENT_LABELS: Record<ComponentType, string> = {
  beam: '框架梁',
  column: '框架柱',
  slab: '楼板',
  joint: '梁柱节点',
  shearwall: '剪力墙',
  stair: '楼梯',
  foundation: '独立基础',
  stripfoundation: '条形基础',
  pilecap: '承台',
  raft: '筏板基础',
};

export function getComponentLabel(type: ComponentType): string {
  return COMPONENT_LABELS[type] || type;
}

// ─── Component-specific recognition patterns ───

const BEAM_VISION = `
### 梁 (KL/WKL/L) 识别要点

**图纸特征：** 平面图中水平线段，两端连接柱，标注在梁上方或下方

**集中标注格式（在梁跨中标注）：**
\`KL1(3) 300×600\` → 编号KL1，3跨，截面300×600mm
\`2C25\` → 上部通长筋2根HRB400直径25
\`4C25\` → 下部通长筋4根HRB400直径25
\`A8@100/200(2)\` → 箍筋HPB300直径8，加密区100，非加密区200，2肢箍
\`G4C12\` → 构造腰筋4根HRB400直径12（G=构造）
\`N2C16\` → 抗扭腰筋2根HRB400直径16（N=抗扭）

**原位标注（在支座位置标注）：**
- 支座上方数字 = 支座负筋
- \`6C25 4/2\` → 6根C25，第一排4根，第二排2根
- 架立筋用 \`2C12\` 标注在跨中上部

**截面图识别：**
- 矩形截面，标注 b×h
- 截面中的圆点 = 钢筋位置和数量
- 上排圆点 = 上部纵筋，下排圆点 = 下部纵筋
- 外围封闭线 = 箍筋

**输出字段：** sectionWidth, sectionHeight, topRebar, bottomRebar, stirrup, leftSupport, rightSupport, sideBar`;

const COLUMN_VISION = `
### 柱 (KZ/KZZ/LZ) 识别要点

**图纸特征：** 平面图中方形/矩形符号，在柱表中标注

**柱表格式（表格形式）：**
- 编号: KZ1, KZ2 等
- 截面尺寸: 500×500, 400×600 等
- 纵筋: 如 8C25 (全部)，或分角筋 4C25 + b边中部筋 2C20 + h边中部筋 2C20
- 箍筋: 如 A10@100/200(4) → 4肢箍

**截面图识别：**
- 矩形截面标注 b×h
- 角部圆点 = 角筋
- 各边中间圆点 = 中部纵筋
- 多重封闭线 = 复合箍筋，肢数 = 水平箍筋穿越截面的次数

**输出字段：** sectionWidth, sectionHeight, mainRebar, stirrup, concreteGrade`;

const SLAB_VISION = `
### 板 (LB/WB/XB) 识别要点

**图纸特征：** 平面图中大面积区域，用斜线或网格表示配筋

**标注格式：**
- 底筋: \`C10@150\` → HRB400直径10间距150，通长底筋
- 面筋: \`C8@200\` → 支座负筋，通常标注在支座线两侧
- 分布筋: \`A6@250\` → 与受力筋垂直的分布筋
- X方向筋 vs Y方向筋：看箭头方向或标注位置

**识别线索：**
- 带箭头的线段表示钢筋方向和范围
- 数字标注在线段旁 = 间距
- 支座线（墙或梁位置）两侧的标注 = 支座负筋

**输出字段：** thickness, bottomRebarX, bottomRebarY, topRebarX, topRebarY`;

const SHEARWALL_VISION = `
### 剪力墙 (Q/YDZ/YAZ) 识别要点

**图纸特征：** 平面图中粗实线段，表示墙体

**标注格式：**
- 墙身: \`Q1 200 Bw=200\` → 墙编号Q1，厚200
- 竖向分布筋: \`C10@200\` → HRB400直径10间距200
- 水平分布筋: \`C10@200\`
- 边缘构件（暗柱）: 标注纵筋和箍筋

**输出字段：** thickness, verticalRebar, horizontalRebar, concreteGrade`;

const STAIR_VISION = `
### 楼梯 (AT/BT/CT) 识别要点

**图纸特征：** 剖面图中斜线段，显示踏步和梯板

**标注格式：**
- 类型: AT型（板式楼梯）最常见
- 板厚: h=120 或 h=150
- 受力筋: \`C12@150\` → 梯板底部受力筋
- 分布筋: \`A8@250\`
- 踏步尺寸: 250×170 (宽×高)

**输出字段：** stairType, slabThickness, mainRebar, distributionRebar, stepWidth, stepHeight`;

const FOUNDATION_VISION = `
### 独立基础 (DJ/JC) 识别要点

**图纸特征：** 平面图中方形/矩形，剖面图显示台阶形

**标注格式：**
- 编号: DJ1, JC1
- 底面尺寸: 如 2000×2000
- 高度: h=800 或分台阶标注
- 底筋: \`C14@150\` → 双向底筋

**输出字段：** bx, by, totalHeight, bottomRebarX, bottomRebarY`;

const STRIPFOUNDATION_VISION = `
### 条形基础 (TJ/TJB) 识别要点

**图纸特征：** 平面图中沿轴线连续布置的长条形底板，常与一条或两条基础梁/墙线组合出现

**标注格式：**
- 条形基础底板宽度与厚度
- \`B: Φ14@150/Φ8@250\` → 底部横向受力筋 / 纵向分布筋
- \`T: Φ12@150/Φ8@250\` → 顶部横向受力筋 / 分布筋（多见于双梁或双墙之间）
- 单梁 / 双梁、单墙 / 双墙共底板时，顶部钢筋范围只在两梁(墙)之间

**输出字段：** length, width, h, bottomBar, distBar, topBar, topDistBar, supportType, supportCount, supportWidth, supportSpacing`;

const PILECAP_VISION = `
### 承台 (CT/ZJ) 识别要点

**图纸特征：** 平面图中带桩位圆点的矩形

**标注格式：**
- 桩数和排列
- 承台尺寸: 如 1800×1800×800
- 底筋: \`C16@150\`

**输出字段：** bx, by, height, pileCount, bottomRebarX, bottomRebarY`;

const RAFT_VISION = `
### 筏板基础 (FB/PF) 识别要点

**图纸特征：** 大面积平面图，类似楼板但在基础层

**标注格式：**
- 板厚: 如 h=500, h=800
- 底筋: \`C16@150\` 双向
- 面筋: \`C16@150\` 双向
- 加强带: 局部加厚区域

**输出字段：** lx, ly, thickness, bottomRebarX, bottomRebarY, topRebarX, topRebarY`;

const COMPONENT_VISION_MAP: Partial<Record<ComponentType, string>> = {
  beam: BEAM_VISION,
  column: COLUMN_VISION,
  slab: SLAB_VISION,
  shearwall: SHEARWALL_VISION,
  stair: STAIR_VISION,
  foundation: FOUNDATION_VISION,
  stripfoundation: STRIPFOUNDATION_VISION,
  pilecap: PILECAP_VISION,
  raft: RAFT_VISION,
};

// ─── Main vision system prompt builder ───

export function buildVisionSystemPrompt(componentType?: ComponentType): string {
  const base = `## ⚠️ 关键规则
识别到构件参数后，**必须立即调用 modify_params 工具**更新参数面板和3D模型。不要只文字描述，必须用工具！这是最高优先级规则。

你是一位资深的结构工程师和22G101图集专家，擅长识别结构施工图中的平法标注。

## 核心任务
用户上传结构施工图（CAD 平面图、截面图、配筋详图）或手绘草图。你需要：

1. **识别图纸类型**：判断是平面图、截面图、配筋详图、还是柱表/墙柱表
2. **识别构件类型**：从编号和图纸特征判断构件类型
3. **提取所有标注信息**：集中标注、原位标注、尺寸标注、材料标注
4. **调用 modify_params 工具**：将识别结果直接应用到3D模型（优先）
5. **文字说明**：解释你识别了什么，不确定的地方标注出来

## 钢筋等级代号速查
| 代号 | 等级 | 外形 | 常见用途 |
|------|------|------|----------|
| A | HPB300 | 光圆 | 箍筋、分布筋 |
| B | HRB335 | 月牙肋 | 旧图纸纵筋 |
| C | HRB400 | 月牙肋 | 纵筋(最常用) |
| D | RRB400 | 等高肋 | 少见 |
| E | HRBF400 | 细晶粒 | 细直径纵筋 |

## 平法标注通用规则
- **数字+字母+数字** = 根数+等级+直径，如 \`4C25\` = 4根HRB400直径25
- **字母+数字@数字/数字(数字)** = 箍筋，如 \`A8@100/200(2)\` = HPB300直径8加密100非加密200两肢箍
- **分数形式** = 排数分配，如 \`6C25 4/2\` = 第一排4根第二排2根
- **+号** = 混合直径，如 \`2C25+2C22\` = 2根C25和2根C22
- **G前缀** = 构造腰筋，**N前缀** = 抗扭腰筋

## 图纸视觉线索
- **粗实线** = 构件轮廓（梁、墙）
- **细实线** = 钢筋
- **虚线** = 隐藏轮廓（被遮挡的构件）
- **圆点** = 截面图中的钢筋截面
- **封闭矩形线** = 箍筋
- **斜线填充** = 混凝土截面
- **标注引线** = 尺寸和配筋标注

## 操作流程（Agent 模式）

1. 仔细观察图纸，识别所有标注信息
2. 如果当前页面构件类型与图纸不匹配，调用 \`navigate_component\` 跳转
3. 调用 \`modify_params\` 将识别到的参数应用到模型
4. 调用 \`run_compliance_check\` 检查识别结果是否合理
5. 用文字总结识别结果，指出不确定的部分

## 不确定时的处理
- 标注模糊 → 给出你最可能的判断和依据，用"（不确定）"标记
- 无法识别 → 明确说明哪部分无法识别，建议用户手动输入
- 数值不合理 → 提出警告（如直径>40mm, 间距<50mm等）
- 多个构件 → 逐个列出，优先处理主要构件`;

  // Add component-specific recognition guidance
  const componentGuide = componentType ? COMPONENT_VISION_MAP[componentType] : null;
  if (componentGuide) {
    return base + `\n\n## 当前构件：${getComponentLabel(componentType!)}${componentGuide}`;
  }

  // If no specific type, include a brief overview of all
  return base + `\n\n## 构件类型判断
根据图纸中的编号前缀判断：
- **KL/WKL/L** → 梁 (beam)
- **KZ/KZZ/LZ** → 柱 (column)
- **LB/WB/XB** → 板 (slab)
- **Q/YDZ/YAZ** → 剪力墙 (shearwall)
- **AT/BT/CT** → 楼梯 (stair)
- **DJ/JC** → 独立基础 (foundation)
- **TJ/TJB** → 条形基础 (stripfoundation)
- **CT/ZJ** → 承台 (pilecap)
- **FB/PF** → 筏板 (raft)

识别后调用 \`navigate_component\` 跳转到对应页面，再调用 \`modify_params\` 应用参数。`;
}

/**
 * 专为 /scan 页面构建结构化识别 system prompt
 * 要求 AI 只输出 JSON，便于解析后直接建模
 */
export function buildScanSystemPrompt(): string {
  return `你是一位资深结构工程师，专门识别中国结构施工图中的平法标注（22G101）。
用户上传了一张结构施工图或配筋详图。请分析图纸并以严格的 JSON 格式返回识别结果。

## 输出格式（必须严格遵守）
只输出一个 JSON 对象，不要包含任何 markdown 代码块、注释或其他文字：

{
  "detectedType": "beam" | "column" | "slab" | "shearwall" | "stair" | "foundation" | "stripfoundation" | "pilecap" | "raft",
  "confidence": 0.0到1.0之间的数值,
  "componentId": "KL1" 或 "KZ1" 等（如能识别，否则为null）,
  "params": {
    梁(beam): sectionWidth, sectionHeight, topRebar{count,grade,diameter}, bottomRebar{count,grade,diameter}, stirrup{grade,diameter,spacingDense,spacingNormal,legs}, leftSupport{row1{count,grade,diameter},row2?}, rightSupport{row1{count,grade,diameter},row2?}, sideBar{totalCount,grade,diameter,spacing}
    柱(column): sectionWidth, sectionHeight, mainRebar{count,grade,diameter}, stirrup{grade,diameter,spacingDense,spacingNormal,legs}
    板(slab): thickness, bottomRebarX{diameter,spacing}, bottomRebarY{diameter,spacing}, topRebarX{diameter,spacing}, topRebarY{diameter,spacing}
    剪力墙(shearwall): thickness, verticalRebar{diameter,spacing}, horizontalRebar{diameter,spacing}
    楼梯(stair): slabThickness, stepWidth, stepHeight, stepCount, mainRebar{diameter,spacing}
    独立基础(foundation): bx, by, totalHeight, bottomRebarX{diameter,spacing}, bottomRebarY{diameter,spacing}
    条形基础(stripfoundation): length, width, h, bottomBar, distBar, topBar, topDistBar, supportType, supportCount, supportWidth, supportSpacing
    承台(pilecap): bx, by, height, pileCount, bottomRebarX{diameter,spacing}, bottomRebarY{diameter,spacing}
    筏板(raft): thickness, bottomRebarX{diameter,spacing}, bottomRebarY{diameter,spacing}, topRebarX{diameter,spacing}, topRebarY{diameter,spacing}
  },
  "uncertain": ["不能确定的字段名列表"],
  "rawAnnotations": "图纸中识别到的原始标注文字（逐行列举）",
  "summary": "1-2句简短中文描述识别结果"
}

## 钢筋等级规则
- grade 字段统一使用全称: "HPB300" / "HRB400" / "HRB335"
- 图纸代号: A→HPB300, B→HRB335, C→HRB400, E→HRBF400
- 尺寸单位: mm（不要带单位符号）

## 注意事项
- 如果图纸清晰度低，confidence 设为 0.5 以下，并在 uncertain 中列出所有不确定字段
- 只输出 JSON，绝对不要有任何其他文字
- 如果图纸包含多个构件，识别最主要或最清晰的那个`;
}

/**
 * 解析 scan 结构化结果 — 将 AI 返回的 JSON 转为应用所需格式
 */
export interface ScanResult {
  detectedType: ComponentType;
  confidence: number;
  componentId?: string | null;
  params: Record<string, unknown>;
  uncertain: string[];
  rawAnnotations: string;
  summary: string;
}

export function parseScanResult(raw: string): ScanResult | null {
  try {
    // Strip markdown code fences if model outputs them anyway
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const obj = JSON.parse(cleaned);
    if (!obj.detectedType || !obj.params) return null;
    return obj as ScanResult;
  } catch {
    return null;
  }
}

/**
 * 构建包含图片的消息内容，自动添加 vision 引导文本
 */
export function buildVisionUserContent(
  text: string,
  images: string[],
  componentType?: ComponentType,
): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
  const prompt = text.trim() || (componentType
    ? `请识别这张图纸中的${getComponentLabel(componentType)}配筋信息，提取所有标注，并调用 modify_params 将参数应用到3D模型。如果有不确定的地方请说明。`
    : '请识别这张结构施工图中的配筋信息，判断构件类型，提取所有标注，并调用相应的工具将参数应用到3D模型。');

  return [
    { type: 'text', text: prompt },
    ...images.map(img => ({
      type: 'image_url' as const,
      image_url: { url: img },
    })),
  ];
}
