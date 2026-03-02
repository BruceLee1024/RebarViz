'use client';

import { useEffect, useCallback } from 'react';

export interface KeyBinding {
  key: string;           // 键名（小写）
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;   // 描述，用于帮助面板
}

/**
 * 格式化快捷键显示
 */
export function formatShortcut(binding: KeyBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('⌘');
  if (binding.alt) parts.push('⌥');
  if (binding.shift) parts.push('⇧');
  
  // 特殊键名映射
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    'arrowup': '↑',
    'arrowdown': '↓',
    'arrowleft': '←',
    'arrowright': '→',
    'escape': 'Esc',
    'enter': '↵',
  };
  
  parts.push(keyMap[binding.key.toLowerCase()] || binding.key.toUpperCase());
  return parts.join('');
}

/**
 * 快捷键 Hook
 */
export function useKeyboard(bindings: KeyBinding[], enabled = true) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 如果焦点在输入框，忽略快捷键
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    for (const binding of bindings) {
      const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase();
      const ctrlMatch = !!binding.ctrl === (e.metaKey || e.ctrlKey);
      const shiftMatch = !!binding.shift === e.shiftKey;
      const altMatch = !!binding.alt === e.altKey;
      
      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        binding.action();
        return;
      }
    }
  }, [bindings]);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  return { formatShortcut };
}

/**
 * BeamViewer 默认快捷键配置
 */
export function createViewerBindings(actions: {
  resetView?: () => void;
  toggleDimensions?: () => void;
  takeScreenshot?: () => void;
  toggleAnimation?: () => void;
  setViewPreset?: (preset: 'front' | 'side' | 'top' | 'iso') => void;
}): KeyBinding[] {
  const bindings: KeyBinding[] = [];
  
  if (actions.resetView) {
    bindings.push({ key: 'r', action: actions.resetView, description: '重置视图' });
  }
  if (actions.toggleDimensions) {
    bindings.push({ key: 'd', action: actions.toggleDimensions, description: '切换标注' });
  }
  if (actions.takeScreenshot) {
    bindings.push({ key: 's', action: actions.takeScreenshot, description: '截图' });
  }
  if (actions.toggleAnimation) {
    bindings.push({ key: ' ', action: actions.toggleAnimation, description: '播放/暂停动画' });
  }
  if (actions.setViewPreset) {
    bindings.push(
      { key: '1', action: () => actions.setViewPreset!('front'), description: '正面视图' },
      { key: '2', action: () => actions.setViewPreset!('side'), description: '侧面视图' },
      { key: '3', action: () => actions.setViewPreset!('top'), description: '顶部视图' },
      { key: '4', action: () => actions.setViewPreset!('iso'), description: '等轴测视图' },
    );
  }
  
  return bindings;
}
