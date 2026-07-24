/**
 * AI Agent 工具定义 — OpenAI function calling 格式
 * 每个工具对应一个模型可调用的操作
 */
import type { ComponentType } from './types';

// ─── Tool parameter types ───

export interface ModifyParamsArgs {
  params: Record<string, unknown>;
}

export type RunComplianceCheckArgs = Record<string, never>;

export interface RunCalculationArgs {
  type: 'ratio' | 'weight' | 'anchor' | 'concrete';
}

export interface SwitchViewArgs {
  tab: 'section' | 'ratio' | 'compliance' | 'weight' | 'concrete' | 'bbs' | 'compare';
}

export interface HighlightElementArgs {
  element: string; // RebarMeshInfo['type']
}

export interface NavigateComponentArgs {
  type: ComponentType;
  message?: string; // 可选的 AI 消息，跳转后自动发送
}

export interface ApplyPresetArgs {
  preset: string;
}

export type GetCurrentStateArgs = Record<string, never>;

export interface SaveFavoriteArgs {
  name: string;
  note?: string;
}

export type ResetParamsArgs = Record<string, never>;

export interface CompareWithPresetArgs {
  preset: string;
}

export type AgentToolArgs =
  | { name: 'modify_params'; arguments: ModifyParamsArgs }
  | { name: 'run_compliance_check'; arguments: RunComplianceCheckArgs }
  | { name: 'run_calculation'; arguments: RunCalculationArgs }
  | { name: 'switch_view'; arguments: SwitchViewArgs }
  | { name: 'highlight_element'; arguments: HighlightElementArgs }
  | { name: 'navigate_component'; arguments: NavigateComponentArgs }
  | { name: 'apply_preset'; arguments: ApplyPresetArgs }
  | { name: 'get_current_state'; arguments: GetCurrentStateArgs }
  | { name: 'save_favorite'; arguments: SaveFavoriteArgs }
  | { name: 'reset_params'; arguments: ResetParamsArgs }
  | { name: 'compare_with_preset'; arguments: CompareWithPresetArgs };

// ─── Tool execution result ───

export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

// ─── Tool callbacks (provided by page components) ───

export interface AgentCallbacks {
  onModifyParams: (params: Record<string, unknown>) => ToolResult;
  onRunComplianceCheck: () => ToolResult;
  onRunCalculation: (type: RunCalculationArgs['type']) => ToolResult;
  onSwitchView: (tab: SwitchViewArgs['tab']) => ToolResult;
  onHighlightElement: (element: string) => ToolResult;
  onNavigateComponent: (type: ComponentType, message?: string) => ToolResult;
  onApplyPreset: (preset: string) => ToolResult;
  onGetCurrentState: () => ToolResult;
  onSaveFavorite: (name: string, note?: string) => ToolResult;
  onResetParams: () => ToolResult;
  onCompareWithPreset: (preset: string) => ToolResult;
}

// ─── Execute a tool call ───

export function executeToolCall(
  toolCall: AgentToolArgs,
  callbacks: AgentCallbacks,
): ToolResult {
  switch (toolCall.name) {
    case 'modify_params':
      // DeepSeek returns flat {sectionWidth:600} instead of nested {params:{sectionWidth:600}}
      return callbacks.onModifyParams(toolCall.arguments.params || toolCall.arguments);
    case 'run_compliance_check':
      return callbacks.onRunComplianceCheck();
    case 'run_calculation':
      return callbacks.onRunCalculation(toolCall.arguments.type);
    case 'switch_view':
      return callbacks.onSwitchView(toolCall.arguments.tab);
    case 'highlight_element':
      return callbacks.onHighlightElement(toolCall.arguments.element);
    case 'navigate_component':
      return callbacks.onNavigateComponent(toolCall.arguments.type, toolCall.arguments.message);
    case 'apply_preset':
      return callbacks.onApplyPreset(toolCall.arguments.preset);
    case 'get_current_state':
      return callbacks.onGetCurrentState();
    case 'save_favorite':
      return callbacks.onSaveFavorite(toolCall.arguments.name, toolCall.arguments.note);
    case 'reset_params':
      return callbacks.onResetParams();
    case 'compare_with_preset':
      return callbacks.onCompareWithPreset(toolCall.arguments.preset);
    default:
      return { success: false, message: `未知工具: ${(toolCall as { name: string }).name}` };
  }
}

// ─── OpenAI function calling tool definitions ───

export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'modify_params',
      description: '修改当前构件的配筋参数。传入需要修改的参数字段和值，系统会更新参数并刷新3D模型。支持的字段取决于当前构件类型（梁、柱、板等）。',
      parameters: {
        type: 'object',
        properties: {
          params: {
            type: 'object',
            description: '要修改的参数键值对。梁: sectionWidth/sectionHeight/topRebar/bottomRebar/stirrup等; 柱: sectionWidth/sectionHeight/mainRebar/stirrup等。使用与 rebar-json 相同的 schema 格式。',
          },
        },
        required: ['params'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_compliance_check',
      description: '对当前构件参数执行规范校验（GB50010、22G101），检查配筋率、锚固长度、箍筋间距等是否满足规范要求。返回所有校验项的通过/失败结果。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_calculation',
      description: '执行指定类型的计算分析。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['ratio', 'weight', 'anchor', 'concrete'],
            description: 'ratio=配筋率计算, weight=钢筋用量估算, anchor=锚固长度计算, concrete=混凝土用量',
          },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'switch_view',
      description: '切换右侧数据面板的显示内容。',
      parameters: {
        type: 'object',
        properties: {
          tab: {
            type: 'string',
            enum: ['section', 'ratio', 'compliance', 'weight', 'concrete', 'bbs', 'compare'],
            description: 'section=截面图, ratio=配筋率, compliance=规范校验, weight=用量估算, concrete=混凝土量, bbs=弯折详图, compare=方案对比',
          },
        },
        required: ['tab'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'highlight_element',
      description: '在3D模型中高亮指定类型的钢筋，帮助用户定位关注的部位。',
      parameters: {
        type: 'object',
        properties: {
          element: {
            type: 'string',
            description: '要高亮的钢筋类型。梁: top/bottom/stirrup/leftSupport/rightSupport/sideBar/tieBar/erection; 柱: main/corner/bMiddle/hMiddle/stirrup; 板: bottomX/bottomY/topX/topY/supportNegX/supportNegY/distribution',
          },
        },
        required: ['element'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'navigate_component',
      description: '跳转到其他构件类型的页面。当用户的描述涉及不同构件时使用。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['beam', 'column', 'slab', 'joint', 'shearwall', 'stair', 'foundation', 'stripfoundation', 'pilecap', 'raft'],
            description: '目标构件类型',
          },
          message: {
            type: 'string',
            description: '跳转后自动发送给AI的消息（可选，用于在新页面继续建模）',
          },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'apply_preset',
      description: '应用一个预设的构件方案。',
      parameters: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            description: '预设名称。梁: simple/standard/complex/mixedDia/haunchH/haunchV/multiSpan',
          },
        },
        required: ['preset'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_current_state',
      description: '获取当前构件的完整参数状态和计算结果，用于分析或做出决策。在需要了解当前模型状态时调用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_favorite',
      description: '将当前构件参数保存为收藏方案，便于后续调用或对比。当用户对方案满意或说"保存一下"、"收藏这个方案"时调用。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '方案名称，如"优化后的标准梁"、"甲方要求方案"',
          },
          note: {
            type: 'string',
            description: '可选备注，记录方案特点或修改原因',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reset_params',
      description: '将当前构件参数重置为默认值。当用户说"重置"、"恢复默认"、"重新开始"时调用。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'compare_with_preset',
      description: '将当前参数与指定预设方案进行对比，返回差异摘要。当用户说"跟标准方案比一下"、"和简单梁有什么区别"时调用。',
      parameters: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            description: '要对比的预设名称。梁: simple/standard/complex; 柱: simple/standard; 板: simple/standard/thick 等',
          },
        },
        required: ['preset'],
      },
    },
  },
];
