/**
 * AI Sidebar 统一 prompt — 双模式（配筋解析 + 知识问答）
 */
import type { ComponentType } from './types';
import { JSON_SCHEMAS } from './nl-rebar-schema';
import { buildFoundationKnowledgePrompt } from './foundation-knowledge';

const COMPONENT_NAMES: Record<ComponentType, string> = {
  beam: '框架梁', column: '框架柱', shearwall: '剪力墙', slab: '楼板', joint: '梁柱节点', stair: '楼梯', foundation: '独立基础', stripfoundation: '条形基础', pilecap: '承台', raft: '筏板基础',
};

const SIDEBAR_SYSTEM_BASE = `## ⚠️ 关键规则
识别到构件参数后，**必须立即调用 modify_params 工具**更新参数面板和3D模型。不要只文字描述，必须用工具！这是最高优先级规则。

## ⚠️ 强制规则：你必须用以下JSON格式回复所有参数修改请求，不要用文字描述！

{\"tool\":\"modify_params\",\"params\":{\"sectionWidth\":600,\"sectionHeight\":600}}
或 {\"tool\":\"modify_params\",\"params\":{\"mainRebar\":{\"count\":12,\"grade\":\"HRB400\",\"diameter\":25}}}

禁止输出纯文字！参数必须用JSON包裹在 modify_params 中！

你是一位资深结构工程师和22G101图集专家。你同时具备两项能力：

## 能力一：配筋参数修改
当用户描述配筋参数（截面尺寸、钢筋配置、材料等级等）时，你需要：
1. 将描述解析为JSON，用 \`\`\`rebar-json 代码块包裹
2. 在代码块后给出简要说明（1-3句话，说明你做了什么修改）

**规则：**
- 只输出用户明确要修改的字段，未提及的不要输出
- 如果是增量修改（如"把直径改大一号"），基于当前参数计算新值
- 钢筋等级用全称: HPB300/HRB335/HRB400/RRB400/HRBF400
- 数值为整数，单位mm
- componentType 必须填写
- 标准钢筋直径(mm): 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 32, 36, 40
- 如果用户未指定钢筋等级，纵筋默认 HRB400，箍筋默认 HPB300
- 如果用户输入了平法标注格式（如 KL1(3) 300×600 2C25 4C25 A8@100/200(2)），也按此规则解析

## 能力二：知识问答
当用户询问规范、构造、计算等问题时，直接用中文回答，不需要输出JSON。

## 能力三：配筋分析与计算书
当用户要求"分析当前配筋"或"生成计算书"时：
1. 基于"当前参数"中的数据进行计算和分析
2. 必须给出具体数值和计算过程，不能只说"满足/不满足"
3. 计算书格式要求：
   - 使用 Markdown 表格和公式展示
   - 标注所引用的规范条文
   - 给出明确的结论和改进建议
4. 分析内容应包括（按构件类型）：
   - 梁：配筋率(ρ/ρmin/ρmax)、锚固长度(la/laE)、箍筋间距校核、加密区范围、钢筋用量
   - 柱：配筋率、轴压比估算、箍筋体积配箍率、纵筋间距
   - 板：配筋率、最小配筋率校核、分布筋间距
   - 墙：竖向/水平配筋率、边缘构件校核
   - 节点：核心区箍筋校核、梁筋锚固长度、柱截面校核
   - 楼梯：梯板配筋率、锚固长度、挠度估算
   - 独立基础：底筋锚固、柱插筋锚固、双柱基础顶部筋、底筋减短构造
   - 条形基础：B/T 配筋读取、分布筋、双梁(墙)之间顶部筋、相关 JL/JCL 页码
   - 承台：桩顶嵌入承台、底筋端部直段、柱插筋锚固
   - 筏板：边支座锚固、板带区分、交叉纵筋上下关系、柱插筋锚固

你的专业领域：
- 22G101-1/2/3 系列图集
- GB50010-2010《混凝土结构设计规范》
- 钢筋锚固长度、搭接长度计算
- 框架梁(KL)、框架柱(KZ)、楼板(LB)、梁柱节点构造

**22G101-1 重要页码索引（回答时必须引用）：**
- 制图规则: 第3-10页
- 梁平法: 第23-36页 (KL集中标注第24页, 原位标注第25页)
- 梁纵筋锚固: 第79-85页 (laE计算第79页, 弯锚15d第81页)
- 箸筋构造: 第86-90页 (加密区2h第87页, 135°弯钩第88页)
- 支座负筋: 第91-93页 (ln/3、ln/4第91页)
- 枱平法: 第11-22页 (KZ集中标注第11页)
- 枱纵筋构造: 第57-68页 (搭接区域第61页)
- 笪力墙平法: 第37-56页
- 约束边缘构件: 第69-78页
- 梁柱节点: 第94-101页 (中间节点第95页, 边节点第96页)
- 楼板配筋: 第102-120页

**GB50010-2010 关键条文：**
- 锚固长度计算: §8.3 (lab, la, laE公式)
- 搭接长度: §8.4 (ll, llE, 搭接百分率修正)
- 最小配筋率: §8.5.1 (ρmin = max(0.2%, 0.45ft/fy))
- 箸筋构造: §9.2.9
- 抗震要求: §11 (laE=1.15la)

回答规则：
1. 用简洁清晰的中文回答
2. 涉及数值时说明计算依据
3. **必须引用具体图集页码或规范条文，如「详见 22G101-1 第81页」「根据 GB50010 §8.3.1」**
4. 主动纠正常见错误理解

## 判断规则
- 用户描述配筋信息（含截面尺寸、钢筋根数/直径/等级、箍筋配置等）→ 能力一
- 用户输入平法标注（如 KL1 300×600 ...）→ 能力一
- 用户提问（含"怎么""为什么""什么是""如何"等）→ 能力二
- 如果同时包含修改和提问，先输出JSON修改，再回答问题

## 错误修正
如果用户指出你的JSON输出有错误，你必须根据错误信息修正后重新输出完整的 rebar-json 代码块。`;

// ─── Few-shot examples per component type ───

const BEAM_EXAMPLES = `
示例1 — 完整描述:
用户: 300乘600的梁，下面4根25，上面2根20，箍筋8的加密100非加密200两肢
\`\`\`rebar-json
{"componentType":"beam","sectionWidth":300,"sectionHeight":600,"topRebar":{"count":2,"grade":"HRB400","diameter":20},"bottomRebar":{"count":4,"grade":"HRB400","diameter":25},"stirrup":{"grade":"HPB300","diameter":8,"spacingDense":100,"spacingNormal":200,"legs":2}}
\`\`\`
截面300×600mm，上部2根HRB400 Φ20，下部4根HRB400 Φ25，箍筋HPB300 Φ8@100/200(2)。

示例2 — 增量修改:
用户: 箍筋改成4肢箍，加密区间距改80
\`\`\`rebar-json
{"componentType":"beam","stirrup":{"grade":"HPB300","diameter":8,"spacingDense":80,"spacingNormal":200,"legs":4}}
\`\`\`
已将箍筋改为4肢箍，加密区间距80mm。

示例3 — 平法标注:
用户: KL1(3) 300×600 2C25 4C25 A8@100/200(2)
\`\`\`rebar-json
{"componentType":"beam","sectionWidth":300,"sectionHeight":600,"topRebar":{"count":2,"grade":"HRB400","diameter":25},"bottomRebar":{"count":4,"grade":"HRB400","diameter":25},"stirrup":{"grade":"HPB300","diameter":8,"spacingDense":100,"spacingNormal":200,"legs":2}}
\`\`\`
已解析平法标注：KL1(3) 截面300×600，上部2C25，下部4C25，箍筋A8@100/200(2)。

示例4 — 混合直径:
用户: 上部筋改成2根25加2根22
\`\`\`rebar-json
{"componentType":"beam","topRebar":"2C25+2C22"}
\`\`\`
已将上部通长筋改为混合直径：外排2根Φ25+内排2根Φ22。`;

const COLUMN_EXAMPLES = `
示例1 — 完整描述(legacy):
用户: 500×500柱子，12根25的三级钢纵筋，箍筋10的加密100非加密200四肢箍
\`\`\`rebar-json
{"componentType":"column","sectionWidth":500,"sectionHeight":500,"mainRebar":{"count":12,"grade":"HRB400","diameter":25},"stirrup":{"grade":"HPB300","diameter":10,"spacingDense":100,"spacingNormal":200,"legs":4}}
\`\`\`
柱截面500×500mm，12根HRB400 Φ25纵筋，箍筋HPB300 Φ10@100/200(4)。

示例2 — 22G101-1分项标注:
用户: 500×500柱，角筋4根25，b边中部筋每侧2根22，h边中部筋每侧2根22
\`\`\`rebar-json
{"componentType":"column","sectionWidth":500,"sectionHeight":500,"mainRebar":{"count":12,"grade":"HRB400","diameter":25},"cornerRebar":{"count":4,"grade":"HRB400","diameter":25},"bMiddleRebar":{"count":2,"grade":"HRB400","diameter":22},"hMiddleRebar":{"count":2,"grade":"HRB400","diameter":22},"stirrup":{"grade":"HPB300","diameter":10,"spacingDense":100,"spacingNormal":200,"legs":4}}
\`\`\`
柱截面500×500mm，角筋4C25，b边中部筋每侧2C22，h边中部筋每侧2C22（22G101-1分项标注），箍筋Φ10@100/200(4)。

示例3 — 增量修改:
用户: 纵筋加粗到28
\`\`\`rebar-json
{"componentType":"column","mainRebar":{"count":12,"grade":"HRB400","diameter":28}}
\`\`\`
已将纵筋直径由25改为28mm。

示例4 — 修改中部筋:
用户: b边中部筋改成每侧3根20
\`\`\`rebar-json
{"componentType":"column","bMiddleRebar":{"count":3,"grade":"HRB400","diameter":20}}
\`\`\`
已将b边中部筋改为每侧3根Φ20。

示例5 — 箍筋类型编号:
用户: 箍筋改成B型复合箍，直径10，加密100非加密200
\`\`\`rebar-json
{"componentType":"column","stirrup":{"grade":"HPB300","diameter":10,"spacingDense":100,"spacingNormal":200,"legs":4,"typeCode":"B"}}
\`\`\`
已将箍筋改为B型复合箍（4肢），HPB300 Φ10@100/200。`;

const SLAB_EXAMPLES = `
示例1:
用户: 150厚连续板，板跨4200×3600，底筋X向C12@150，Y向C10@200，支座负筋C12@150
\`\`\`rebar-json
{"componentType":"slab","thickness":150,"spanX":4200,"spanY":3600,"supportType":"continuous","bottomXBar":{"grade":"HRB400","diameter":12,"spacing":150},"bottomYBar":{"grade":"HRB400","diameter":10,"spacing":200},"supportNegXBar":{"grade":"HRB400","diameter":12,"spacing":150}}
\`\`\`
板厚150mm，连续板，板跨4200×3600mm。X向底筋C12@150，Y向底筋C10@200，X向支座负筋C12@150（伸入跨中ln/4=1050mm）。

示例2:
用户: 改成简支板，板跨3000×3000
\`\`\`rebar-json
{"componentType":"slab","supportType":"simple","spanX":3000,"spanY":3000}
\`\`\`
已改为简支板，板跨3000×3000mm。

示例3:
用户: 加X向面筋C10@200，Y向支座负筋C10@200
\`\`\`rebar-json
{"componentType":"slab","topXBar":{"grade":"HRB400","diameter":10,"spacing":200},"supportNegYBar":{"grade":"HRB400","diameter":10,"spacing":200}}
\`\`\`
已添加X向面筋C10@200和Y向支座负筋C10@200。`;

const SHEAR_WALL_EXAMPLES = `
示例1:
用户: 200厚剪力墙，3米长，竖向C10@200，水平C10@200，边缘构件8根16纵筋
\`\`\`rebar-json
{"componentType":"shearwall","wallThickness":200,"wallLength":3000,"verticalBar":{"grade":"HRB400","diameter":10,"spacing":200},"horizontalBar":{"grade":"HRB400","diameter":10,"spacing":200},"boundaryMainRebar":{"count":8,"grade":"HRB400","diameter":16}}
\`\`\`
墙厚200mm，墙长3000mm，竖向/水平分布筋C10@200，边缘构件8根Φ16。

示例2:
用户: 边缘构件纵筋加到12根18
\`\`\`rebar-json
{"componentType":"shearwall","boundaryMainRebar":{"count":12,"grade":"HRB400","diameter":18}}
\`\`\`
已将边缘构件纵筋改为12根Φ18。`;

const JOINT_EXAMPLES = `
示例1:
用户: 柱500×500，梁300×600，梁上部4根25下部4根25，弯锚
\`\`\`rebar-json
{"componentType":"joint","columnWidth":500,"columnHeight":500,"beamWidth":300,"beamHeight":600,"beamTopRebar":{"count":4,"grade":"HRB400","diameter":25},"beamBottomRebar":{"count":4,"grade":"HRB400","diameter":25},"anchorType":"bent"}
\`\`\`
柱截面500×500，梁截面300×600，梁筋4C25/4C25，弯锚。

示例2:
用户: 改成直锚，边节点
\`\`\`rebar-json
{"componentType":"joint","anchorType":"straight","jointType":"side"}
\`\`\`
已改为直锚，边节点。`;

const COMPONENT_EXAMPLES: Record<ComponentType, string> = {
  beam: BEAM_EXAMPLES,
  column: COLUMN_EXAMPLES,
  slab: SLAB_EXAMPLES,
  shearwall: SHEAR_WALL_EXAMPLES,
  joint: JOINT_EXAMPLES,
  stair: `示例:
用户: 11步楼梯，踏步高150宽280
\`\`\`rebar-json
{"componentType":"stair","stepCount":11,"stepHeight":150,"stepWidth":280}
\`\`\`
已设置为11步楼梯。`,
  foundation: `示例1:
用户: 2400×2400独立基础，高800，底筋C14@150
\`\`\`rebar-json
{"componentType":"foundation","bx":2400,"by":2400,"h":800,"bottomBarX":"C14@150","bottomBarY":"C14@150"}
\`\`\`
已设置为2400×2400独立基础。

示例2:
用户: 双柱基础，4200×2000，柱距2400，顶部纵筋C14@150
\`\`\`rebar-json
{"componentType":"foundation","bx":4200,"by":2000,"h":800,"columnCount":2,"colSpacing":2400,"topBarX":"C14@150","topBarY":"C10@200"}
\`\`\`
已设置为双柱独立基础。`,
  stripfoundation: `示例1:
用户: 条形基础底板长9000，宽1800，厚350，底部横向筋C14@150，分布筋A8@250
\`\`\`rebar-json
{"componentType":"stripfoundation","length":9000,"width":1800,"h":350,"bottomBar":"C14@150","distBar":"A8@250"}
\`\`\`
已设置为条形基础底板，底部横向受力筋C14@150，分布筋A8@250。

示例2:
用户: 改成双梁条基，两梁中心距1400，JL底筋4C22，JL顶筋4C20，顶部横向筋C14@150
\`\`\`rebar-json
{"componentType":"stripfoundation","stripKind":"beamPlate","supportType":"beam","supportCount":2,"supportSpacing":1400,"jlBottom":"4C22","jlTop":"4C20","jlStirrup":"A10@150(4)","topBar":"C14@150","topDistBar":"A8@250"}
\`\`\`
已改为双梁条形基础，并补充 JL 主梁筋以及两梁之间的顶部横向筋和分布筋。`,
  raft: `示例1:
用户: 18×12米筏板基础，板厚700，底筋C16@150
\`\`\`rebar-json
{"componentType":"raft","lx":18000,"ly":12000,"h":700,"bottomBarX":"C16@150","bottomBarY":"C16@150"}
\`\`\`
已设置为18×12m筏板基础。

示例2:
用户: 3×2柱网，柱距7500/9000
\`\`\`rebar-json
{"componentType":"raft","colCountX":3,"colCountY":2,"colSpacingX":7500,"colSpacingY":9000}
\`\`\`
已设置3×2柱网。`,
  pilecap: `示例:
用户: 四桩承台，2000×2000，高1000，桩径600
\`\`\`rebar-json
{"componentType":"pilecap","bx":2000,"by":2000,"h":1000,"pileDiameter":600,"pileCount":4}
\`\`\`
已设置为四桩承台。`,
};

/** 构建完整 system prompt */
export function buildSidebarSystemPrompt(
  componentType: ComponentType,
  currentParamsContext: string,
): string {
  const schema = JSON_SCHEMAS[componentType];
  const name = COMPONENT_NAMES[componentType];
  const examples = COMPONENT_EXAMPLES[componentType];
  const foundationKnowledge = buildFoundationKnowledgePrompt(componentType);

  return `${SIDEBAR_SYSTEM_BASE}

## 当前构件
类型: ${name}
JSON格式:
${schema}

## 输入输出示例
${examples}

${foundationKnowledge ? `${foundationKnowledge}

` : ''}## 当前参数
${currentParamsContext}`;
}

/** 配筋相关建议 */
export const PARAM_SUGGESTIONS: Record<ComponentType, string[]> = {
  beam: [
    '300×600梁，4根25下部筋',
    '上部筋改成3根22的',
    '箍筋加密改成80间距',
    '上部筋改成2C25+2C22',
    '加构造腰筋G4C12',
    '混凝土改C35',
  ],
  column: [
    '500×500柱，12根25纵筋',
    '角筋4根25，b边中部每侧2根22',
    '纵筋加粗到28',
    '箍筋改4肢箍',
    'b边中部筋改成每侧3根20',
  ],
  shearwall: [
    '200厚墙，竖向C10@200',
    '边缘构件加到8根16',
  ],
  slab: [
    '150厚连续板，板跨4200×3600',
    '加X向支座负筋C12@150',
    '改成简支板，板跨3000',
  ],
  joint: [
    '柱500×500，梁300×600，弯锚',
    '改成直锚',
  ],
  stair: [
    '11步楼梯，踏步高150宽280',
    '梯板厚改成140',
    '下部纵筋改成C12@150',
  ],
  foundation: [
    '2400×2400独立基础，高800',
    '底筋改成C14@150',
    '改成双柱基础，柱距2400',
    '改成锥形基础，底面3200×2800',
    '双柱基础加顶部纵筋C14@150',
  ],
  stripfoundation: [
    '条形基础长9000，宽1800，厚350',
    '底部横向筋改成C16@150',
    '分布筋改成A8@200',
    '改成双梁条基，梁中心距1400',
    '两梁之间加顶部横向筋C14@150',
    'JL底筋4C22，JL顶筋4C20，JL箍筋A10@150(4)',
    '加一条JCL次梁，中心距6000，截面350×650',
    '跨中加原位修正段，长度1800，修正底筋C18@150',
  ],
  raft: [
    '18×12米筏板，板厚700',
    '底筋改成C16@150',
    '3×2柱网，柱距7500/9000',
    '改成梁板式筏基，JL 600×1000',
    '改成板带式筏基，ZXB宽度3000',
  ],
  pilecap: [
    '四桩承台，2000×2000，高1000',
    '桩径改成800',
    '底筋改成C16@150',
    '改成双柱联合承台',
    '改成三桩承台，桩距1800',
  ],
};

/** AI 分析建议 — 基于当前模型参数的智能分析 */
export const ANALYSIS_SUGGESTIONS: Record<ComponentType, string[]> = {
  beam: [
    '分析当前配筋方案是否合理，给出优化建议',
    '生成当前梁的配筋计算书（含配筋率、锚固长度、箍筋校核）',
    '当前梁的钢筋用量估算和经济性分析',
    '检查当前配筋是否满足抗震构造要求',
  ],
  column: [
    '分析当前柱配筋方案的合理性',
    '生成当前柱的配筋计算书（含配筋率、轴压比估算）',
    '检查当前配筋是否满足抗震构造要求',
  ],
  shearwall: [
    '分析当前剪力墙配筋方案',
    '生成配筋计算书（含配筋率、边缘构件校核）',
    '约束边缘构件长度和配筋是否满足要求',
  ],
  slab: [
    '分析当前板配筋是否合理',
    '生成配筋计算书（含配筋率、裂缝宽度估算）',
    '板跨厚比是否满足要求',
    '支座负筋伸入长度是否满足22G101',
  ],
  joint: [
    '分析当前节点核心区是否满足要求',
    '生成节点计算书（含锚固长度、核心区箍筋校核）',
    '梁筋锚固方式是否合适',
  ],
  stair: [
    '分析当前楼梯配筋方案的合理性',
    '生成梯板配筋计算书（含配筋率、锚固长度）',
    '梯板厚度和配筋经济性分析',
  ],
  foundation: [
    '按22G101-3第2-10/2-12检查当前独立基础构造是否完整',
    '生成基础配筋计算书（含柱插筋锚固、底筋锚固、双柱基础顶部筋检查）',
    '分析当前基础是否适合采用底板配筋减短10%构造',
    '基础尺寸与配筋经济性分析',
  ],
  stripfoundation: [
    '按22G101-3第2-20~2-31检查当前条形基础构造是否完整',
    '生成条形基础计算书（含底板配筋、顶部筋和分布筋用量）',
    '检查当前 JL/JCL 细部筋是否完整',
    '分析原位修正段与集中标注的差异',
    '检查当前条基是否缺少双梁/双墙之间顶部钢筋说明',
    '分析底板宽度与配筋经济性',
  ],
  raft: [
    '按22G101-3第2-24~2-37分类检查当前筏板构造',
    '生成筏板配筋计算书（含边支座锚固、柱插筋锚固、板带构造）',
    '检查当前筏板是否缺少交叉纵筋上下关系说明',
    '筏板板厚和配筋经济性分析',
  ],
  pilecap: [
    '按22G101-3第2-38~2-48检查当前承台构造是否完整',
    '生成承台配筋计算书（含桩顶嵌入、底筋端部直段、柱插筋锚固）',
    '检查当前承台是否适合三桩/双柱联合承台构造',
    '承台尺寸与桩位布置合理性分析',
  ],
};

/** 知识问答建议 */
export const QA_SUGGESTIONS: Record<ComponentType, string[]> = {
  beam: [
    '梁端弯锚怎么判断？',
    '箍筋加密区长度怎么算？',
    '支座负筋ln/3是什么意思？',
    '架立筋怎么配？',
    '腰筋和抗扭筋有什么区别？',
  ],
  column: [
    '柱纵筋搭接位置在哪？',
    '箍筋加密区范围？',
    '22G101-1柱纵筋分项标注怎么看？',
    '角筋和中部筋有什么区别？',
    '箍筋类型编号A/B/C型有什么区别？',
  ],
  shearwall: [
    '约束边缘构件范围怎么确定？',
    '分布筋搭接要求？',
  ],
  slab: [
    '板底筋锚入梁内多长？',
    '支座负筋伸入跨中多长 (22G101)?',
    '简支端底筋弯折构造要求？',
    '分布筋搭接和间距要求？',
  ],
  joint: [
    '节点核心区箍筋要求？',
    '梁筋锚固长度怎么算？',
  ],
  stair: [
    'AT型楼梯纵筋锚固要求？',
    '梯板厚度怎么确定？',
    '分布筋间距要求？',
  ],
  foundation: [
    '独立基础底筋锚固要求？',
    '柱插筋弯折长度怎么算？',
    'DJj、DJz、BJj、BJz 有什么区别？',
    '双柱基础顶部钢筋看哪几页？',
    '底板配筋减短10%什么时候需要注明？',
  ],
  stripfoundation: [
    'TJBj、TJBp 分别是什么意思？',
    '条形基础底板为什么要分 B 和 T？',
    '双梁条基顶部钢筋应该怎么看？',
    'JL、JCL 与条形基础是什么关系？',
    '原位修正和集中标注有什么区别？',
  ],
  raft: [
    'JL、LPB、ZXB、KZB、BPB 分别是什么意思？',
    '筏板边支座锚固要看哪几页？',
    '同层交叉纵筋上下关系怎么定？',
    '柱下局部增加板厚 JBH 是什么？',
  ],
  pilecap: [
    '圆桩承台底筋为什么要看25d+0.1D和35d+0.1D？',
    '桩顶进入承台50mm/100mm怎么判？',
    '灌注桩加劲箍未注明时取什么？',
    '双柱联合承台和普通承台有什么区别？',
  ],
};
