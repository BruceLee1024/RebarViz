'use client';

import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { MessageSquare, X, Send, Trash2, ChevronDown, Loader2, AlertCircle, Sparkles, Settings } from 'lucide-react';
import { AI_PROVIDERS, SYSTEM_PROMPT } from '@/lib/ai-providers';
import type { ChatMessage } from '@/lib/ai-providers';
import { getApiKey, getApiKeys } from '@/lib/api-keys';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIChatProps {
  /** Current page context string to send with messages */
  context?: string;
}

const QUICK_QUESTIONS = [
  '什么是平法标注？集中标注和原位标注有什么区别？',
  '梁端支座直锚和弯锚怎么判断？',
  '箍筋加密区长度怎么确定？',
  '支座负筋 ln/3 和 ln/4 是什么意思？',
  'laE 和 la 有什么区别？',
];

/** Markdown renderer for assistant messages */
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        h1: ({ children }) => <h3 className="text-sm font-bold text-gray-900 mt-3 mb-1">{children}</h3>,
        h2: ({ children }) => <h3 className="text-sm font-bold text-gray-900 mt-3 mb-1">{children}</h3>,
        h3: ({ children }) => <h4 className="text-[13px] font-semibold text-gray-900 mt-2 mb-1">{children}</h4>,
        ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 ml-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 ml-1">{children}</ol>,
        li: ({ children }) => <li className="text-[13px] leading-relaxed">{children}</li>,
        code: ({ className, children }) => {
          const isBlock = className?.includes('language-');
          if (isBlock) {
            return (
              <pre className="bg-gray-800 text-gray-100 rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs leading-relaxed">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-gray-200/60 text-red-600 px-1 py-0.5 rounded text-[12px] font-mono">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-accent/40 pl-3 my-2 text-gray-600 italic">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
        th: ({ children }) => <th className="border border-gray-200 px-2 py-1 text-left font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-gray-200 px-2 py-1">{children}</td>,
        hr: () => <hr className="my-2 border-gray-200" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

export function AIChat({ context }: AIChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('deepseek');
  const [model, setModel] = useState('');
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const provider = AI_PROVIDERS.find(p => p.id === providerId) || AI_PROVIDERS[0];
  const [hasAnyKey, setHasAnyKey] = useState(false);

  useEffect(() => {
    setModel(provider.defaultModel);
  }, [provider]);

  // Check if any API key is configured
  useEffect(() => {
    const keys = getApiKeys();
    const configured = Object.entries(keys).filter(([, v]) => !!v);
    setHasAnyKey(configured.length > 0);
    // Auto-select first configured provider
    if (configured.length > 0 && !getApiKey(providerId)) {
      setProviderId(configured[0][0]);
    }
  }, [open, providerId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setError(null);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const apiKey = getApiKey(providerId);
      if (!apiKey) throw new Error(`未配置 ${provider.name} API Key，请在设置中添加`);

      const systemContent = context
        ? `${SYSTEM_PROMPT}\n\n当前用户正在查看的构件参数：\n${context}`
        : SYSTEM_PROMPT;

      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemContent },
            ...newMessages,
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`${provider.name} 接口错误: ${res.status}${errText ? ' - ' + errText.slice(0, 100) : ''}`);
      }

      // Parse SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let assistantContent = '';
      const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
      setMessages([...newMessages, assistantMsg]);

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
              assistantContent += delta;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      if (!assistantContent) {
        throw new Error('AI 未返回有效回复');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : '请求失败');
      // Remove the empty assistant message on error
      setMessages(prev => prev.filter(m => m.content !== ''));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading, providerId, model, context]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    if (loading && abortRef.current) abortRef.current.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
  };

  return (
    <>
      {/* Floating toggle button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-accent text-white rounded-full shadow-lg hover:shadow-xl hover:bg-blue-600 transition-all cursor-pointer flex items-center justify-center group"
          aria-label="打开 AI 助手"
        >
          <Sparkles className="w-6 h-6 group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-primary to-primary-light text-white shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span className="font-semibold text-sm">AI 平法助手</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer" title="清空对话">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors cursor-pointer" title="关闭">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Provider selector */}
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                className="flex items-center gap-2 text-xs text-muted hover:text-primary transition-colors cursor-pointer"
              >
                <span className="font-medium">{provider.name}</span>
                <span className="text-[11px] bg-gray-100 px-1.5 py-0.5 rounded">{model}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showProviderMenu && (
                <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 min-w-[240px]">
                  {AI_PROVIDERS.map(p => (
                    <div key={p.id}>
                      <div className="px-3 py-1.5 text-[11px] font-medium text-muted bg-gray-50 flex items-center justify-between">
                        {p.name}
                        {getApiKey(p.id) ? (
                          <span className="text-green-500 text-[10px]">已配置</span>
                        ) : (
                          <span className="text-gray-400 text-[10px]">未配置</span>
                        )}
                      </div>
                      {p.models.map(m => (
                        <button
                          key={m}
                          onClick={() => { setProviderId(p.id); setModel(m); setShowProviderMenu(false); }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/5 cursor-pointer transition-colors ${
                            providerId === p.id && model === m ? 'text-accent font-medium' : 'text-gray-700'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !loading && (
              <div className="space-y-4 pt-4">
                {!hasAnyKey ? (
                  <div className="text-center space-y-3 pt-6">
                    <Settings className="w-10 h-10 text-gray-300 mx-auto" />
                    <div>
                      <p className="text-sm text-gray-600 font-medium">尚未配置 API Key</p>
                      <p className="text-xs text-muted mt-1">请先在设置中添加至少一个 AI 服务商的 API Key</p>
                    </div>
                    <Link
                      href="/settings"
                      onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      前往设置
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="text-center">
                      <Sparkles className="w-8 h-8 text-accent/40 mx-auto mb-2" />
                      <p className="text-sm text-muted">你好，我是 AI 平法助手</p>
                      <p className="text-xs text-muted mt-1">可以问我任何关于 22G101 图集和钢筋构造的问题</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted font-medium">快速提问：</p>
                      {QUICK_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(q)}
                          className="w-full text-left px-3 py-2 text-xs text-gray-700 bg-gray-50 hover:bg-accent/5 hover:text-accent rounded-lg transition-colors cursor-pointer leading-relaxed"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-br-md text-sm leading-relaxed whitespace-pre-wrap bg-accent text-white">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-bl-md text-[13px] leading-relaxed bg-gray-50 text-gray-800 border border-gray-100">
                    {msg.content ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      loading && i === messages.length - 1 && (
                        <span className="flex items-center gap-1.5 text-muted">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          思考中...
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-lg text-xs text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-100 bg-white shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入问题，如：弯锚的弯折段长度怎么算？"
                rows={1}
                className="flex-1 resize-none px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-colors max-h-24 overflow-y-auto"
                style={{ minHeight: '40px' }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="p-2.5 bg-accent text-white rounded-xl hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                aria-label="发送"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {context && (
              <p className="text-[10px] text-muted mt-1.5 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                已关联当前页面参数，AI 会结合你的配置回答
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
