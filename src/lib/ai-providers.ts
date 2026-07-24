/**
 * AI Provider configuration for 22G101 rebar learning assistant
 * All three providers use OpenAI-compatible API format
 */

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  visionModel?: string; // model that supports image input
  envKey: string; // env variable name for API key
  temperature?: number;  // provider-level override; some models only accept specific values
  extraParams?: Record<string, unknown>;  // merged into every API request payload
  authHeader?: 'bearer' | 'api-key';  // auth header style; default 'bearer' (Authorization: Bearer)
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens';  // default 'max_tokens'
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-pro',
    models: ['deepseek-v4-pro', 'deepseek-reasoner'],
    envKey: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'qwen',
    name: '通义千问 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-vl-plus'],
    visionModel: 'qwen-vl-plus',
    envKey: 'QWEN_API_KEY',
  },
  {
    id: 'kimi',
    name: 'Kimi (月之暗面)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-k2.5',
    models: ['kimi-k2.5', 'kimi-k2-0711-preview', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    visionModel: 'kimi-k2.5',
    envKey: 'KIMI_API_KEY',
    temperature: 1,  // kimi-k2.5 only accepts temperature=1
    extraParams: { enable_thinking: false },  // thinking requires reasoning_content in tool-call history
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'],
    visionModel: 'gpt-4o',
    envKey: 'OPENAI_API_KEY',
  },
  {
    id: 'mimo',
    name: 'MiMo 按量付费',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.5-flash'],
    visionModel: 'mimo-v2.5-pro',
    envKey: 'MIMO_API_KEY',
    authHeader: 'api-key',
    maxTokensParam: 'max_completion_tokens',
  },
  {
    id: 'mimo-cn',
    name: 'MiMo Token Plan (中国)',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.5-flash'],
    visionModel: 'mimo-v2.5-pro',
    envKey: 'MIMO_TOKEN_KEY',
    authHeader: 'api-key',
    maxTokensParam: 'max_completion_tokens',
  },
  {
    id: 'mimo-sgp',
    name: 'MiMo Token Plan (新加坡)',
    baseUrl: 'https://token-plan-sgp.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.5-flash'],
    visionModel: 'mimo-v2.5-pro',
    envKey: 'MIMO_TOKEN_KEY',
    authHeader: 'api-key',
    maxTokensParam: 'max_completion_tokens',
  },
  {
    id: 'mimo-ams',
    name: 'MiMo Token Plan (欧洲)',
    baseUrl: 'https://token-plan-ams.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.5-flash'],
    visionModel: 'mimo-v2.5-pro',
    envKey: 'MIMO_TOKEN_KEY',
    authHeader: 'api-key',
    maxTokensParam: 'max_completion_tokens',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 (免费)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      'Qwen/Qwen3-8B',
      'Qwen/Qwen3-235B-A3B',
      'Qwen/Qwen3-VL-8B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-32B-Instruct',
    ],
    visionModel: 'Qwen/Qwen3-VL-8B-Instruct',
    envKey: 'SILICONFLOW_API_KEY',
  },
];

export const SYSTEM_PROMPT = `你是一位资深的结构工程师和22G101图集专家，专门帮助用户学习钢筋平法识图。

你的专业领域：
- 22G101-1（混凝土结构施工图平面整体表示方法制图规则和构造详图·现浇混凝土框架、剪力墙、梁、板）
- 22G101-2（现浇混凝土板式楼梯）
- 22G101-3（独立基础、条形基础、筏形基础、桩基承台）
- GB50010-2010《混凝土结构设计规范》
- 钢筋锚固长度、搭接长度计算
- 框架梁(KL)、框架柱(KZ)、楼板(LB)、梁柱节点构造

回答规则：
1. 用简洁清晰的中文回答，适合工程专业学生和初学者理解
2. 涉及具体数值时，说明计算依据和公式
3. 涉及构造要求时，引用具体图集页码或规范条文
4. 可以用简单的文字示意图辅助说明
5. 如果用户的问题涉及当前页面的参数（梁截面、钢筋配置等），结合这些参数给出针对性解答
6. 对于常见错误理解，主动纠正并解释原因
7. 回答要有条理，重点突出

常用知识点速查：
- 锚固长度 la = ζa × lab，lab = α × (fy/ft) × d
- 抗震锚固 laE = 1.15 × la（抗震时）
- 搭接长度 ll = ζl × la，搭接百分率≤25%时ζl=1.2，≤50%时ζl=1.4，>50%时ζl=1.6
- 梁端支座直锚条件：laE ≤ hc - 保护层
- 弯锚：直段≥0.4laE，弯折15d
- 箍筋加密区：max(2h, 500mm)
- 支座负筋：第一排 ln/3，第二排 ln/4`;

/** Content part for multimodal messages */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}
