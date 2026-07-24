/**
 * AI Agent 执行引擎 — 支持多步工具调用的 Agent 循环
 *
 * 流程: 用户消息 → AI (with tools) → tool_calls → 执行 → 反馈 → 继续循环
 */
import type { AIProvider, ChatMessage } from './ai-providers';
import { AGENT_TOOLS, executeToolCall, type AgentCallbacks, type AgentToolArgs, type ToolResult } from './ai-agent-tools';
import type { ComponentType } from './types';
import { buildSidebarSystemPrompt } from './ai-sidebar-prompt';
import { buildVisionSystemPrompt } from './ai-vision-prompt';
import { extractJSON, parseAIResponse } from './nl-rebar-parser';
import { mapSchemaToParams } from './nl-rebar-mapper';
import { aiFetch } from './ai-fetch';
import { compressConversation } from './ai-conversation-memory';

/** Agent 执行过程中的步骤，用于 UI 展示 */
export interface AgentStep {
  type: 'tool_call' | 'tool_result' | 'thinking';
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  result?: ToolResult;
  message?: string;
  timestamp: number;
}

/** Agent 回合消息（扩展 ChatMessage） */
export interface AgentMessage extends ChatMessage {
  /** Agent 执行步骤（仅 assistant 消息有） */
  agentSteps?: AgentStep[];
  /** 是否包含 rebar-json 且已应用 */
  paramsApplied?: boolean;
}

/** Agent 引擎配置 */
interface AgentConfig {
  maxToolRounds: number;       // 最大工具调用轮次
  provider: AIProvider;        // full provider object for aiFetch
  model: string;
  apiKey: string;
  componentType: ComponentType;
  context: string;             // 当前参数上下文
  hasImages?: boolean;         // 是否包含图片 → 注入 vision prompt
}

/** Agent 状态回调 */
interface AgentStateCallbacks {
  onStreamUpdate: (content: string) => void;
  onStepAdded: (step: AgentStep) => void;
  onParamsApplied: (fields: string[]) => void;
}

/** 从 AI 响应中解析 tool_calls */
interface ToolCallChunk {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Agent 消息格式 — 支持 multimodal content (string | content parts)
 * 也支持 tool_calls / tool results
 */
type AgentMsgPayload = {
  role: string;
  content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: ToolCallChunk[];
  tool_call_id?: string;
  name?: string;
};

/** 判断 API 错误是否因为不支持 tools/function calling */
const TOOLS_UNSUPPORTED_RE = /tool|function|unsupported|not.?support|invalid.*param|unrecognized/i;

/** 请求超时时间 (ms) — 非流式工具调用请求 */
const TOOL_REQUEST_TIMEOUT_MS = 90_000;

const DIRECT_FINAL_TOOLS = new Set(['modify_params', 'apply_preset', 'reset_params', 'switch_view', 'highlight_element', 'navigate_component', 'save_favorite']);

function buildToolResultSummary(results: Array<{ name: string; result: ToolResult }>): string {
  const successful = results.filter(r => r.result.success);
  const failed = results.filter(r => !r.result.success);
  if (failed.length > 0) {
    return failed.map(r => r.result.message || `${r.name} 执行失败`).join('\n');
  }
  return successful.map(r => r.result.message || `${r.name} 已完成`).join('\n') || '已完成。';
}

/** 后续轮次精简版 prompt 后缀（不含字段速查表和示例） */
const AGENT_SYSTEM_SUFFIX_LITE = `

## Agent 模式（续）

你正在处理工具返回结果。根据结果给出简洁中文总结，如有问题提出修改建议。
- 如果需要进一步操作，继续调用工具
- 不需要则直接输出最终回复
- grade: HPB300/HRB400/HRB500
- 不输出 rebar-json 代码块`;

/** Fallback prompt suffix when tools are unsupported — ask AI to output JSON */
const FALLBACK_JSON_INSTRUCTION = `

## ⚠️ 工具调用不可用
当前环境不支持 function calling。你必须将识别的配筋参数直接以 rebar-json 代码块格式输出：

\`\`\`rebar-json
{"componentType":"...", "sectionWidth":300, ...}
\`\`\`

**规则：**
- 只输出 rebar-json 代码块和简短说明（1-2句话）
- 不要模拟工具调用，直接输出 JSON 参数
- componentType 必须填写
- grade 用全称: HPB300/HRB400
- 数值用整数，单位mm`;

/**
 * 非流式请求（用于 tool_calls 循环中的请求）
 */
async function requestWithTools(
  config: AgentConfig,
  messages: AgentMsgPayload[],
  signal: AbortSignal,
  round: number = 1,
  fallbackMode: boolean = false,
): Promise<{
  content: string | null;
  toolCalls: ToolCallChunk[] | null;
  reasoningContent?: string;
}> {
  // Round 1: full prompt; Round 2+: condensed prompt to reduce context
  let systemContent: string;
  if (round <= 1) {
    systemContent = buildSidebarSystemPrompt(config.componentType, config.context) + AGENT_SYSTEM_SUFFIX;
    if (config.hasImages) {
      systemContent += '\n\n' + buildVisionSystemPrompt(config.componentType);
    }
    if (fallbackMode) {
      systemContent += FALLBACK_JSON_INSTRUCTION;
    }
  } else {
    systemContent = buildSidebarSystemPrompt(config.componentType, config.context) + AGENT_SYSTEM_SUFFIX_LITE;
  }

  // Compose a timeout signal (90s) merged with the user-provided abort signal
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), TOOL_REQUEST_TIMEOUT_MS);
  const combinedSignal = combineAbortSignals(signal, timeoutCtrl.signal);

  try {
    const { response: res } = await aiFetch({
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      systemPrompt: systemContent,
      messages: messages as Array<{ role: string; content?: unknown }>,
      tools: fallbackMode ? undefined : AGENT_TOOLS,
      tool_choice: fallbackMode ? undefined : 'auto',
      stream: false,
      temperature: 0.3,
      max_tokens: 4096,
      signal: combinedSignal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `AI 接口错误 (${res.status})`;
      try { const j = JSON.parse(errText); errMsg = j?.error?.message || j?.error || j?.message || errMsg; } catch { /* not JSON */ }
      const err = new Error(errMsg);
      (err as Error & { statusCode?: number; bodyText?: string }).statusCode = res.status;
      (err as Error & { bodyText?: string }).bodyText = errText;
      throw err;
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('AI 未返回有效回复');

    return {
      content: choice.message?.content || null,
      toolCalls: choice.message?.tool_calls || null,
      reasoningContent: choice.message?.reasoning_content || undefined,
    };
  } catch (err) {
    if (timeoutCtrl.signal.aborted && !signal.aborted) {
      throw new Error(`AI 响应超时（${TOOL_REQUEST_TIMEOUT_MS / 1000}秒），请重试或简化请求`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Combine two AbortSignals — aborts when either fires */
function combineAbortSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  if (s1.aborted) return s1;
  if (s2.aborted) return s2;
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  s1.addEventListener('abort', abort, { once: true });
  s2.addEventListener('abort', abort, { once: true });
  return ctrl.signal;
}

/**
 * 流式请求（用于最终文字回复）
 */
async function streamFinalResponse(
  config: AgentConfig,
  messages: AgentMsgPayload[],
  signal: AbortSignal,
  onUpdate: (content: string) => void,
  fallbackMode: boolean = false,
): Promise<string> {
  let systemContent = buildSidebarSystemPrompt(config.componentType, config.context);
  if (fallbackMode) {
    systemContent += FALLBACK_JSON_INSTRUCTION;
  }

  const { response: res } = await aiFetch({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
    systemPrompt: systemContent,
    messages: messages as Array<{ role: string; content?: unknown }>,
    stream: true,
    temperature: 0.3,
    max_tokens: 4096,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let errMsg = `AI 接口错误 (${res.status})`;
    try { const j = JSON.parse(errText); errMsg = j?.error?.message || j?.error || j?.message || errMsg; } catch { /* not JSON */ }
    throw new Error(errMsg);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let content = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          content += delta;
          onUpdate(content);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return content;
}

/**
 * 检测请求是否为"复杂请求" — 多目标/多步骤操作
 * 复杂请求触发 Agent 规划器，先规划再执行
 */
function detectComplexRequest(text: string): boolean {
  if (!text || text.length < 10) return false;
  // 关键词: 多步骤操作信号
  const COMPLEX_KEYWORDS = /优化|对比.*方案|分析.*修改|检查.*并.*改|先.*再.*然后|整体.*调整|最经济|最优|全面|逐项/;
  // 多动词: 含2个以上动作词
  const ACTION_WORDS = text.match(/改|设|调|检|算|比|换|加|减|优|查|看|分析|计算|校验|对比|修改|调整/g);
  const hasMultipleActions = (ACTION_WORDS?.length || 0) >= 3;
  // 长度+关键词
  return COMPLEX_KEYWORDS.test(text) || (hasMultipleActions && text.length > 20);
}

/**
 * 运行 Agent 主循环
 *
 * 支持两种模式：
 * 1. 如果 provider 支持 function calling → 使用 tools
 * 2. 如果不支持 → fallback 到传统 rebar-json 模式
 */
export async function runAgent(
  config: AgentConfig,
  conversationMessages: ChatMessage[],
  callbacks: AgentCallbacks,
  stateCallbacks: AgentStateCallbacks,
  signal: AbortSignal,
): Promise<{
  assistantContent: string;
  steps: AgentStep[];
  usedTools: boolean;
}> {
  const steps: AgentStep[] = [];

  // 压缩长对话历史（保留近期完整 + 早期摘要）
  const compressedMessages = compressConversation(conversationMessages);

  // 构建消息历史 — 保留 multimodal content（图片）以支持 vision 模型
  const messages: AgentMsgPayload[] = compressedMessages.map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    // multimodal content (text + images) → 保持原格式传给 API
    return {
      role: m.role,
      content: m.content.map(p => {
        if (p.type === 'image_url') return { type: 'image_url', image_url: { url: (p as { type: 'image_url'; image_url: { url: string } }).image_url.url } };
        return { type: 'text', text: (p as { type: 'text'; text: string }).text };
      }),
    };
  });

  let round = 0;

  // ─── Tool result cache (per runAgent invocation) ───
  const toolCache = new Map<string, ToolResult>();

  // ─── Agent Planner: for complex requests, let AI plan before acting ───
  let prefetchedResponse: { content: string | null; toolCalls: ToolCallChunk[] | null; reasoningContent?: string } | null = null;
  const lastUserMsg = compressedMessages[compressedMessages.length - 1];
  const lastUserText = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : (Array.isArray(lastUserMsg?.content)
      ? (lastUserMsg.content as Array<{ type: string; text?: string }>).filter(p => p.type === 'text').map(p => p.text || '').join('')
      : '');
  const isComplexRequest = detectComplexRequest(lastUserText);

  if (isComplexRequest && !config.hasImages) {
    stateCallbacks.onStepAdded({
      type: 'thinking',
      message: 'AI 正在规划执行方案...',
      timestamp: Date.now(),
    });

    try {
      const planResponse = await requestWithTools(
        { ...config, maxToolRounds: 1 },
        messages,
        signal,
        0, // round=0 triggers full prompt
      );

      // If AI returned a plan (content without tool calls), use it as a planning step
      if (planResponse.content && (!planResponse.toolCalls || planResponse.toolCalls.length === 0)) {
        const planStep: AgentStep = {
          type: 'thinking',
          message: `📋 执行计划：${planResponse.content.slice(0, 200)}`,
          timestamp: Date.now(),
        };
        steps.push(planStep);
        stateCallbacks.onStepAdded(planStep);
        // Inject the plan as context for subsequent tool calls
        messages.push({ role: 'assistant', content: planResponse.content });
        messages.push({ role: 'user', content: '好的，请按计划执行。' });
      } else if (planResponse.toolCalls && planResponse.toolCalls.length > 0) {
        // AI went straight to tool calls — store as prefetched response for the first loop iteration
        prefetchedResponse = planResponse;
      }
    } catch {
      // Planning failed — just continue with normal flow
    }
  }

  // ─── Agent 循环 ───
  while (round < config.maxToolRounds) {
    round++;

    // Emit thinking step only for round 1 (initial) or retry rounds (tools failed)
    if (round === 1) {
      stateCallbacks.onStepAdded({
        type: 'thinking',
        message: config.hasImages ? 'AI 正在识别图纸...' : 'AI 正在分析请求...',
        timestamp: Date.now(),
      });
    }

    let response: { content: string | null; toolCalls: ToolCallChunk[] | null; reasoningContent?: string };

    // Use prefetched response from planner if available (avoids duplicate API call)
    if (prefetchedResponse) {
      response = prefetchedResponse;
      prefetchedResponse = null;
    } else {
      try {
        response = await requestWithTools(config, messages, signal, round);
      } catch (err) {
        // 判断是否因为 provider 不支持 function calling → fallback 到流式 rebar-json 模式
        const isFirstRound = round === 1;
        const isToolsError = err instanceof Error && (
          TOOLS_UNSUPPORTED_RE.test(err.message) ||
          TOOLS_UNSUPPORTED_RE.test((err as Error & { bodyText?: string }).bodyText || '')
        );
        const statusCode = (err as Error & { statusCode?: number }).statusCode;
        const isClientError = statusCode === 400 || statusCode === 422;

        if (isFirstRound && isClientError && isToolsError) {
          // ─── 改进的 fallback 流程 ───
          // Step 1: 用 JSON 输出指令重新请求（非工具模式）
          const fallbackMessages: AgentMsgPayload[] = messages.map(m => {
            if (Array.isArray(m.content)) {
              return { ...m, content: m.content.map(p => p.type === 'text' ? p.text || '' : '[图片]').join('') };
            }
            return m;
          });

          // 追加 JSON 输出提示到用户消息
          if (fallbackMessages.length > 0) {
            const lastMsg = fallbackMessages[fallbackMessages.length - 1];
            if (typeof lastMsg.content === 'string') {
              lastMsg.content += '\n\n（请将识别到的参数以 rebar-json 代码块格式直接输出，不要模拟工具调用）';
            }
          }

          // Step 2: 先尝试非工具模式（不需要 tools，Qwen3-VL 等模型也能处理）
          let fallbackContent = '';
          try {
            const fbResponse = await requestWithTools(config, fallbackMessages, signal, 1, true);
            fallbackContent = fbResponse.content || '';
            stateCallbacks.onStreamUpdate(fallbackContent);
          } catch {
            // 非工具模式也失败了 → 尝试纯流式
          }

          // Step 3: 尝试提取参数
          const applied = tryApplyRebarJson(fallbackContent, config.componentType, callbacks, stateCallbacks);

          // Step 4: 如果没有提取到参数，再用流式请求一次（某些模型对非流式+vision 支持不好）
          if (!applied || !fallbackContent) {
            const streamedContent = await streamFinalResponse(config, fallbackMessages, signal, stateCallbacks.onStreamUpdate, true);
            tryApplyRebarJson(streamedContent, config.componentType, callbacks, stateCallbacks);
            return { assistantContent: streamedContent || fallbackContent, steps: [], usedTools: false };
          }

          return { assistantContent: fallbackContent, steps: [], usedTools: false };
        }
        throw err;
      }
    }

    // ─── 没有 tool_calls → 最终回复 ───
    if (!response.toolCalls || response.toolCalls.length === 0) {
      const finalContent = response.content || '';
      stateCallbacks.onStreamUpdate(finalContent);
      tryApplyRebarJson(finalContent, config.componentType, callbacks, stateCallbacks);
      return { assistantContent: finalContent, steps, usedTools: steps.length > 0 };
    }

    // ─── 有 tool_calls → 执行工具 ───
    const assistantMsg: AgentMsgPayload = {
      role: 'assistant',
      content: response.content || undefined,
      tool_calls: response.toolCalls,
    };
    // Kimi (and other thinking-enabled models) require reasoning_content to be
    // replayed in the assistant message during multi-turn tool-call conversations.
    if (response.reasoningContent) {
      (assistantMsg as Record<string, unknown>).reasoning_content = response.reasoningContent;
    }
    messages.push(assistantMsg);

    let allToolsSucceeded = true;
    const executedToolResults: Array<{ name: string; result: ToolResult }> = [];

    // ─── Parse all tool call arguments first ───
    const parsedCalls = response.toolCalls.map(tc => {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        const raw = tc.function.arguments || '{}';
        try {
          args = JSON.parse(raw + (raw.includes('{') && !raw.endsWith('}') ? '}' : ''));
        } catch {
          args = {};
          console.warn(`[Agent] Failed to parse tool args for ${tc.function.name}:`, raw);
        }
      }
      return { tc, args };
    });

    // ─── Dependency-aware parallel execution ───
    // Split into: mutating tools (modify_params, apply_preset, reset_params) run first,
    // then dependent tools (run_compliance_check, get_current_state, run_calculation) run in parallel after.
    const MUTATING_TOOLS = new Set(['modify_params', 'apply_preset', 'reset_params']);
    const DEPENDS_ON_STATE = new Set(['run_compliance_check', 'get_current_state', 'run_calculation']);

    const mutatingCalls = parsedCalls.filter(p => MUTATING_TOOLS.has(p.tc.function.name));
    const dependentCalls = parsedCalls.filter(p => DEPENDS_ON_STATE.has(p.tc.function.name));
    const independentCalls = parsedCalls.filter(p => !MUTATING_TOOLS.has(p.tc.function.name) && !DEPENDS_ON_STATE.has(p.tc.function.name));

    // Helper: execute a single parsed call, emit steps, and return result
    const executeSingle = (parsed: typeof parsedCalls[0]): { result: ToolResult; tc: ToolCallChunk; args: Record<string, unknown> } => {
      const { tc, args } = parsed;

      // Emit tool_call step
      const callStep: AgentStep = { type: 'tool_call', toolName: tc.function.name, toolArgs: args, timestamp: Date.now() };
      steps.push(callStep);
      stateCallbacks.onStepAdded(callStep);

      // Check cache (for read-only tools)
      const cacheKey = `${tc.function.name}:${JSON.stringify(args)}`;
      if (toolCache.has(cacheKey)) {
        const cached = toolCache.get(cacheKey)!;
        const resultStep: AgentStep = { type: 'tool_result', toolName: tc.function.name, result: cached, timestamp: Date.now() };
        steps.push(resultStep);
        stateCallbacks.onStepAdded(resultStep);
        executedToolResults.push({ name: tc.function.name, result: cached });
        return { result: cached, tc, args };
      }

      // Execute
      let result: ToolResult;
      try {
        const toolArgs: AgentToolArgs = { name: tc.function.name, arguments: args } as AgentToolArgs;
        result = executeToolCall(toolArgs, callbacks);
      } catch (execErr) {
        result = { success: false, message: `工具执行失败: ${execErr instanceof Error ? execErr.message : String(execErr)}` };
      }

      // Cache read-only results
      if (!MUTATING_TOOLS.has(tc.function.name)) {
        toolCache.set(cacheKey, result);
      } else {
        // Mutating tool invalidates state-dependent caches
        for (const key of Array.from(toolCache.keys())) {
          if (key.startsWith('get_current_state:') || key.startsWith('run_compliance_check:') || key.startsWith('run_calculation:')) {
            toolCache.delete(key);
          }
        }
      }

      // Emit tool_result step
      const resultStep: AgentStep = { type: 'tool_result', toolName: tc.function.name, result, timestamp: Date.now() };
      steps.push(resultStep);
      stateCallbacks.onStepAdded(resultStep);
      executedToolResults.push({ name: tc.function.name, result });

      return { result, tc, args };
    };

    // Phase 1: Execute mutating tools sequentially (order matters)
    // After modify_params succeeds, auto-run compliance and append to result
    let complianceAppendix: Map<string, string> | null = null;
    for (const parsed of mutatingCalls) {
      const { result, tc } = executeSingle(parsed);
      if (!result.success) {
        allToolsSucceeded = false;
      } else if (tc.function.name === 'modify_params') {
        // Auto-run compliance check after params modified
        try {
          const compResult = callbacks.onRunComplianceCheck();
          const failures = (compResult as { results?: Array<{ status: string; message: string; rule: string }> }).results
            ?.filter(r => r.status === 'fail' || r.status === 'warn') || [];
          if (failures.length > 0) {
            if (!complianceAppendix) complianceAppendix = new Map();
            const summary = failures.map(f => `[${f.status === 'fail' ? '❌' : '⚠️'}] ${f.message} (${f.rule})`).join('\n');
            complianceAppendix.set(tc.id, `\n⚠️ 合规校验发现问题:\n${summary}\n请考虑调整参数以满足规范要求。`);
          }
        } catch { /* compliance check optional — don't block agent */ }
      }
    }

    // Phase 2: Execute independent + dependent tools in parallel
    const parallelCalls = [...independentCalls, ...dependentCalls];
    const parallelResults = await Promise.allSettled(
      parallelCalls.map(parsed => Promise.resolve(executeSingle(parsed)))
    );
    for (const settled of parallelResults) {
      if (settled.status === 'fulfilled' && !settled.value.result.success) {
        allToolsSucceeded = false;
      }
      if (settled.status === 'rejected') {
        allToolsSucceeded = false;
      }
    }

    // ─── Push tool results into messages (maintain original order for API) ───
    for (const parsed of parsedCalls) {
      const cacheKey = `${parsed.tc.function.name}:${JSON.stringify(parsed.args)}`;
      const cachedResult = toolCache.get(cacheKey);
      const result = cachedResult || { success: false, message: '工具未执行' };

      let resultJson = JSON.stringify(result);
      // Append auto-compliance results for modify_params
      if (complianceAppendix?.has(parsed.tc.id)) {
        resultJson += complianceAppendix.get(parsed.tc.id);
      }
      if (resultJson.length > 3000) {
        resultJson = resultJson.slice(0, 3000) + '...[已截断]';
      }
      messages.push({
        role: 'tool',
        content: resultJson,
        tool_call_id: parsed.tc.id,
        name: parsed.tc.function.name,
      });
    }

    // Optimization: If the AI already produced substantial content alongside tool calls,
    // and all tools succeeded, skip the next round — the existing content IS the final response.
    // This avoids a slow redundant API call just to get a brief "done" confirmation.
    const hasSubstantialContent = (response.content || '').length > 100;
    if (allToolsSucceeded && hasSubstantialContent) {
      const finalContent = response.content!;
      stateCallbacks.onStreamUpdate(finalContent);
      tryApplyRebarJson(finalContent, config.componentType, callbacks, stateCallbacks);
      return { assistantContent: finalContent, steps, usedTools: true };
    }

    if (allToolsSucceeded && parsedCalls.every(p => DIRECT_FINAL_TOOLS.has(p.tc.function.name))) {
      const finalContent = buildToolResultSummary(executedToolResults);
      // Typewriter effect: emit content word by word for a streaming feel
      const words = finalContent.split('');
      let accumulated = '';
      for (const ch of words) {
        if (signal.aborted) break;
        accumulated += ch;
        stateCallbacks.onStreamUpdate(accumulated);
        await new Promise(r => setTimeout(r, 12));
      }
      return { assistantContent: finalContent, steps, usedTools: true };
    }

    // ─── Tools succeeded but content is short → stream final summary ───
    // Instead of another non-streaming round, break and stream for better UX.
    if (allToolsSucceeded) {
      break;
    }

    // Tools failed → allow loop to continue for AI to potentially retry/recover
  }

  // ─── 流式请求获取最终总结 ───
  const finalContent = await streamFinalResponse(config, messages, signal, stateCallbacks.onStreamUpdate);
  tryApplyRebarJson(finalContent, config.componentType, callbacks, stateCallbacks);
  return { assistantContent: finalContent, steps, usedTools: true };
}

/**
 * 尝试从 AI 回复中提取 rebar-json 并应用参数（兼容传统模式）
 *
 * 提取策略（按优先级）：
 * 1. rebar-json 代码块（最可靠）
 * 2. 任意 JSON 代码块
 * 3. 文本中嵌入的 JSON 对象
 */
function tryApplyRebarJson(
  content: string,
  componentType: ComponentType,
  callbacks: AgentCallbacks,
  stateCallbacks: AgentStateCallbacks,
): boolean {
  let jsonStr: string | null = null;

  // Strategy 1: rebar-json 代码块
  const REBAR_JSON_RE = /```rebar-json\s*\n([\s\S]*?)\n\s*```/;
  const match = content.match(REBAR_JSON_RE);
  if (match) {
    jsonStr = match[1].trim();
  } else {
    // Strategy 2: 尝试任意 JSON 代码块
    const JSON_BLOCK_RE = /```(?:json)?\s*\n(\{[\s\S]*?\})\n\s*```/;
    const jsonMatch = content.match(JSON_BLOCK_RE);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Strategy 3: 使用 extractJSON 从文本中提取 JSON
      try {
        const extracted = extractJSON(content);
        jsonStr = JSON.stringify(extracted);
      } catch {
        return false; // 无法提取任何 JSON
      }
    }
  }

  if (!jsonStr) return false;

  // Strategy 0: 识别 {"tool":"modify_params","params":{...}} 格式（Qwen3-VL等不支持function calling的模型）
  try {
    const obj = JSON.parse(jsonStr);
    if (obj.tool === 'modify_params' && obj.params && typeof obj.params === 'object') {
      callbacks.onModifyParams(obj.params as Record<string, unknown>);
      stateCallbacks.onParamsApplied(Object.keys(obj.params));
      return true;
    }
  } catch { /* not JSON, continue */ }

  const result = parseAIResponse(jsonStr, componentType);
  if (result.success) {
    const partial = mapSchemaToParams(result.schema, componentType);
    const fields = Object.keys(partial);
    if (fields.length > 0) {
      callbacks.onModifyParams(partial as Record<string, unknown>);
      stateCallbacks.onParamsApplied(fields);
      return true;
    }
  }
  return false;
}

/** Agent 模式增强的 system prompt 后缀 */
export const AGENT_SYSTEM_SUFFIX = `

## Agent 模式

你具备**工具调用**能力，可直接修改3D模型。**始终优先调用工具**，不要输出 rebar-json 代码块。

### 工具速查

| 工具 | 场景 |
|------|------|
| \`modify_params\` | 修改任意配筋参数 |
| \`run_compliance_check\` | 规范校验（修参数后自动调用） |
| \`get_current_state\` | 分析前获取当前参数 |
| \`run_calculation\` | 配筋率/用量/锚固计算 |
| \`switch_view\` | 切换面板视图 |
| \`highlight_element\` | 3D高亮钢筋 |
| \`navigate_component\` | 跳转构件页面 |
| \`apply_preset\` | 应用预设方案 |
| \`save_favorite\` | 保存当前方案 |
| \`reset_params\` | 重置为默认值 |
| \`compare_with_preset\` | 与预设对比 |

### modify_params 字段名（按构件）

**梁 beam:**
- 截面: \`sectionWidth\`, \`sectionHeight\`, \`spanLength\` (净跨mm), \`columnWidth\` (支座柱宽)
- 多跨: \`spanCount\` (跨数), \`spanWidths\` (各跨宽[]), \`spanHeights\` (各跨高[])
- 编号: \`id\` (如 "KL1(3)")
- 通长筋: \`topRebar\`, \`bottomRebar\` → \`{ count, grade, diameter }\` 或混合直径字符串如 "2C25+2C22"
- 支座负筋: \`leftSupportRebar\`, \`rightSupportRebar\` → \`{ count, grade, diameter }\`
- 支座第二排: \`leftSupport2Rebar\`, \`rightSupport2Rebar\` → \`{ count, grade, diameter }\`
- 架立筋: \`erectionBar\` → \`{ count, grade, diameter }\`
- 箍筋: \`stirrup\` → \`{ grade, diameter, spacingDense, spacingNormal, legs }\`
- 腰筋: \`sideBar\` → \`{ prefix: "G"|"N", count, grade, diameter }\`
- 拉筋: \`tieBar\` → \`{ grade, diameter }\`

**柱 column:**
- 截面: \`sectionWidth\`, \`sectionHeight\`, \`height\`
- 主筋(legacy): \`mainRebar\` → \`{ count, grade, diameter }\`
- 角筋: \`cornerRebar\` → \`{ count:4, grade, diameter }\`
- 中部筋: \`bMiddleRebar\`, \`hMiddleRebar\` → \`{ count(每侧), grade, diameter }\`
- 箍筋: \`stirrup\` → \`{ grade, diameter, spacingDense, spacingNormal, legs, typeCode? }\`

**板 slab:**
- \`thickness\`, \`spanX\`, \`spanY\`, \`supportType\`
- 底筋: \`bottomXBar\`, \`bottomYBar\` → \`{ diameter, spacing, grade }\`
- 面筋: \`topXBar\`, \`topYBar\` → \`{ diameter, spacing, grade }\`
- 支座负筋: \`supportNegXBar\`, \`supportNegYBar\` → \`{ diameter, spacing, grade }\`

**剪力墙 shearwall:**
- \`wallThickness\`, \`wallLength\`, \`wallHeight\`
- \`verticalBar\` → \`{ diameter, spacing, grade }\`
- \`horizontalBar\` → \`{ diameter, spacing, grade }\`
- \`boundaryMainRebar\` → \`{ count, grade, diameter }\`
- \`boundaryStirrup\` → \`{ grade, diameter, spacingDense, spacingNormal, legs }\`

**楼梯 stair:**
- \`flightWidth\`, \`stepCount\`, \`stepWidth\`, \`stepHeight\`, \`slabThickness\`
- \`bottomBar\`, \`topBar\`, \`distBar\` → "C10@150" 格式

**独立基础 foundation:**
- \`bx\`, \`by\`, \`h\`, \`shape\`
- \`bottomBarX\`, \`bottomBarY\` → "C12@150" 格式
- 双柱: \`columnCount\`, \`colSpacing\`, \`topBarX\`, \`topBarY\`

**条形基础 stripfoundation:**
- \`length\`, \`width\`, \`h\`, \`stripKind\`
- \`bottomBar\`, \`distBar\`, \`topBar\`, \`topDistBar\` → "C14@150" 格式
- \`supportType\`, \`supportCount\`, \`supportSpacing\`
- JL: \`jlBottom\`, \`jlTop\`, \`jlStirrup\`

**承台 pilecap:**
- \`bx\`, \`by\`, \`h\`, \`pileCount\`, \`pileDiameter\`
- \`bottomBarX\`, \`bottomBarY\` → "C14@150" 格式

**筏板 raft:**
- \`lx\`, \`ly\`, \`h\`
- \`bottomBarX\`, \`bottomBarY\`, \`topBarX\`, \`topBarY\` → "C16@150" 格式
- 柱网: \`colCountX\`, \`colCountY\`, \`colSpacingX\`, \`colSpacingY\`

### 关键规则

1. **修改参数后，若用户关心合规性，自动调用 \`run_compliance_check\`**
2. **分析当前状态时，先调用 \`get_current_state\`**
3. **不确定字段名时，只传确定的字段，跳过不确定的**
4. **纯问答无需工具，直接回答**
5. **grade 固定值**: HPB300（光圆）/ HRB400（带肋，最常用）/ HRB500

### 示例

"把底筋改6C25再检规范" → \`modify_params\`({bottomRebar:{count:6,grade:"HRB400",diameter:25}}) → \`run_compliance_check\`()

"分析当前配筋" → \`get_current_state\`() → \`run_compliance_check\`() → 文字分析

"高亮箍筋" → \`highlight_element\`({element:"stirrup"})

"标准梁" → \`apply_preset\`({preset:"standard"}) → \`run_compliance_check\`()

### 回复格式

- 工具调用完成后，**必须用简洁的中文总结**你做了什么、结果如何
- 如果规范校验发现问题，**主动提出修改建议**
- 计算结果引用具体公式和规范条文
- 不要在工具调用后输出 rebar-json 代码块（已通过工具修改）`;
