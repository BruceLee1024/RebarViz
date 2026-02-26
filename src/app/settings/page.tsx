import type { Metadata } from 'next';
import { SettingsPageClient } from './SettingsPageClient';

export const metadata: Metadata = {
  title: '设置 - API 配置 | RebarViz',
  description: '配置 AI 助手 API Key，支持 DeepSeek、通义千问、Kimi。',
};

export default function SettingsPage() {
  return <SettingsPageClient />;
}
