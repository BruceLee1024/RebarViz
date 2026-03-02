'use client';

import { useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import type { KeyBinding } from '@/lib/useKeyboard';
import { formatShortcut } from '@/lib/useKeyboard';

interface KeyboardHelpProps {
  bindings: KeyBinding[];
}

export function KeyboardHelp({ bindings }: KeyboardHelpProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (bindings.length === 0) return null;

  return (
    <>
      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
        title="快捷键 (?)"
      >
        <Keyboard className="w-4 h-4" />
      </button>

      {/* 弹窗 */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 min-w-[300px] max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Keyboard className="w-4 h-4 text-gray-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-800">键盘快捷键</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {bindings.map((binding, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
                  <span className="text-sm text-gray-600">{binding.description}</span>
                  <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-xs font-mono text-gray-700">
                    {formatShortcut(binding)}
                  </kbd>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400 text-center mt-4">
              在输入框外按下对应按键即可使用
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * 内联显示单个快捷键（用于工具栏按钮旁边）
 */
export function ShortcutHint({ binding }: { binding: KeyBinding }) {
  return (
    <span className="ml-1 px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] font-mono text-gray-400">
      {formatShortcut(binding)}
    </span>
  );
}
