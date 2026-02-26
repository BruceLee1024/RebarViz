'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { useShareUrl } from '@/lib/useShareUrl';

export function ShareButton({ params }: { params: object }) {
  const { copyShareUrl } = useShareUrl(params);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyShareUrl();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all bg-gray-100 border border-gray-200 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
      {copied ? '已复制链接' : '分享配筋方案'}
    </button>
  );
}
