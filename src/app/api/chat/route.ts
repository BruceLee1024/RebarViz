import { NextRequest } from 'next/server';
import { AI_PROVIDERS, SYSTEM_PROMPT } from '@/lib/ai-providers';
import type { ChatMessage } from '@/lib/ai-providers';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { messages, providerId, model, context, apiKey: clientKey } = await req.json() as {
      messages: ChatMessage[];
      providerId: string;
      model?: string;
      context?: string;
      apiKey?: string; // client-provided key from localStorage
    };

    const provider = AI_PROVIDERS.find(p => p.id === providerId);
    if (!provider) {
      return Response.json({ error: '未知的 AI 提供商' }, { status: 400 });
    }

    // Client key takes priority, then fall back to env var
    const apiKey = clientKey || process.env[provider.envKey];
    if (!apiKey) {
      return Response.json(
        { error: `未配置 ${provider.name} API Key，请在设置页面中添加` },
        { status: 400 }
      );
    }

    const selectedModel = model || provider.defaultModel;

    let systemContent = SYSTEM_PROMPT;
    if (context) {
      systemContent += `\n\n当前用户正在查看的构件参数：\n${context}`;
    }

    const body = {
      model: selectedModel,
      messages: [
        { role: 'system', content: systemContent },
        ...messages,
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 2048,
    };

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`${provider.name} API error:`, errText);
      return Response.json(
        { error: `${provider.name} 接口错误: ${response.status}` },
        { status: response.status }
      );
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Chat API error:', err);
    return Response.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
