'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, Trash2, ExternalLink, Loader2, Sparkles, Shield } from 'lucide-react';
import { AI_PROVIDERS } from '@/lib/ai-providers';
import { getApiKeys, setApiKey, clearApiKey, maskKey } from '@/lib/api-keys';
import type { ApiKeyStore } from '@/lib/api-keys';

const PROVIDER_META: Record<string, { color: string; bg: string; url: string; desc: string }> = {
  deepseek: {
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    url: 'https://platform.deepseek.com/api_keys',
    desc: '高性价比推理模型，支持深度思考',
  },
  qwen: {
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    url: 'https://dashscope.console.aliyun.com/apiKey',
    desc: '阿里云通义千问，多模型可选',
  },
  kimi: {
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    url: 'https://platform.moonshot.cn/console/api-keys',
    desc: '月之暗面 Kimi，长上下文支持',
  },
};

export function SettingsPageClient() {
  const [keys, setKeys] = useState<ApiKeyStore>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, 'ok' | 'fail' | null>>({});

  useEffect(() => {
    setKeys(getApiKeys());
  }, []);

  const handleSave = (providerId: string) => {
    if (inputValue.trim()) {
      setApiKey(providerId, inputValue.trim());
      setKeys(prev => ({ ...prev, [providerId]: inputValue.trim() }));
    }
    setEditing(null);
    setInputValue('');
  };

  const handleDelete = (providerId: string) => {
    clearApiKey(providerId);
    setKeys(prev => {
      const next = { ...prev };
      delete next[providerId as keyof ApiKeyStore];
      return next;
    });
    setTestResult(prev => ({ ...prev, [providerId]: null }));
  };

  const handleTest = async (providerId: string) => {
    const key = keys[providerId as keyof ApiKeyStore];
    if (!key) return;

    setTesting(providerId);
    setTestResult(prev => ({ ...prev, [providerId]: null }));

    try {
      const provider = AI_PROVIDERS.find(p => p.id === providerId);
      if (!provider) throw new Error('Unknown provider');

      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: provider.defaultModel,
          messages: [{ role: 'user', content: '你好，请用一句话回复' }],
          stream: true,
          max_tokens: 50,
        }),
      });

      if (res.ok) {
        const reader = res.body?.getReader();
        if (reader) {
          await reader.read();
          reader.cancel();
        }
        setTestResult(prev => ({ ...prev, [providerId]: 'ok' }));
      } else {
        setTestResult(prev => ({ ...prev, [providerId]: 'fail' }));
      }
    } catch {
      setTestResult(prev => ({ ...prev, [providerId]: 'fail' }));
    } finally {
      setTesting(null);
    }
  };

  const configuredCount = Object.values(keys).filter(Boolean).length;

  return (
    <main className="px-4 py-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-primary flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-accent" />
          AI 助手设置
        </h1>
        <p className="text-sm text-muted mt-1">
          配置 API Key 后即可使用 AI 平法助手功能，至少配置一个即可
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-700 space-y-1">
            <p className="font-medium">安全说明</p>
            <p>API Key 仅保存在你的浏览器本地存储中，不会上传到任何服务器。调用时直接发送到对应的 AI 服务商接口。</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {AI_PROVIDERS.map(provider => {
          const meta = PROVIDER_META[provider.id];
          const key = keys[provider.id as keyof ApiKeyStore];
          const isEditing = editing === provider.id;
          const isShow = showKey[provider.id];
          const result = testResult[provider.id];
          const isTesting = testing === provider.id;

          return (
            <div key={provider.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className={`px-5 py-4 ${meta.bg} border-b border-gray-100`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-semibold ${meta.color}`}>{provider.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{meta.desc}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {key && !isEditing && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        <Check className="w-3 h-3" /> 已配置
                      </span>
                    )}
                    <a
                      href={meta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-accent hover:underline"
                    >
                      获取 Key <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted mb-1 block">API Key</label>
                      <input
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        placeholder={`输入 ${provider.name} API Key`}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-colors font-mono"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(provider.id); if (e.key === 'Escape') { setEditing(null); setInputValue(''); } }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSave(provider.id)}
                        disabled={!inputValue.trim()}
                        className="px-4 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => { setEditing(null); setInputValue(''); }}
                        className="px-4 py-1.5 bg-gray-100 text-muted text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : key ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                        {isShow ? key : maskKey(key)}
                      </code>
                      <button
                        onClick={() => setShowKey(prev => ({ ...prev, [provider.id]: !isShow }))}
                        className="p-2 rounded-lg text-muted hover:bg-gray-100 transition-colors cursor-pointer"
                        title={isShow ? '隐藏' : '显示'}
                      >
                        {isShow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditing(provider.id); setInputValue(key); }}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                      >
                        修改
                      </button>
                      <button
                        onClick={() => handleTest(provider.id)}
                        disabled={isTesting}
                        className="px-3 py-1.5 bg-accent/10 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        测试连接
                      </button>
                      <button
                        onClick={() => handleDelete(provider.id)}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {result === 'ok' && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <Check className="w-3 h-3" /> 连接成功
                        </span>
                      )}
                      {result === 'fail' && (
                        <span className="text-xs text-red-500">连接失败，请检查 Key</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditing(provider.id); setInputValue(''); }}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
                  >
                    + 添加 API Key
                  </button>
                )}

                {/* Models info */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-[11px] text-muted">
                    可用模型: {provider.models.join('、')}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {configuredCount > 0 && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm text-green-700">
            已配置 {configuredCount} 个 AI 服务商，点击页面右下角 ✨ 按钮即可开始使用 AI 平法助手。
          </p>
        </div>
      )}
    </main>
  );
}
