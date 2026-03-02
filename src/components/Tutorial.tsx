'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, Lightbulb, MousePointer, RotateCcw, Scissors, Sparkles, Check } from 'lucide-react';

export interface TutorialStep {
  title: string;
  content: string;
  target?: string;  // CSS selector for highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: string;  // 期望用户执行的操作
  icon?: React.ReactNode;
}

const BEAM_TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: '欢迎使用 RebarViz！',
    content: '这是一个 3D 钢筋可视化工具，帮助你理解 22G101 平法标注。让我们花 1 分钟快速了解一下吧！',
    position: 'center',
    icon: <Lightbulb className="w-6 h-6" />,
  },
  {
    title: '输入参数',
    content: '左侧面板可以输入梁的截面尺寸、配筋规格等参数。试试点击「快速示例」按钮加载预设配置。',
    target: '.space-y-4 > .bg-white',
    position: 'right',
    icon: <MousePointer className="w-5 h-5" />,
  },
  {
    title: '3D 模型交互',
    content: '中间是 3D 配筋模型。可以：\n• 左键拖动旋转\n• 右键拖动平移\n• 滚轮缩放\n• 点击钢筋查看详情',
    target: 'canvas',
    position: 'left',
    icon: <RotateCcw className="w-5 h-5" />,
  },
  {
    title: '施工动画',
    content: '点击「施工动画」按钮，可以看到钢筋的绑扎顺序，了解实际施工流程。',
    target: 'button:has-text("施工动画")',
    position: 'bottom',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    title: '剖切视图',
    content: '点击「剖切视图」，拖动滑块可以查看梁的任意截面配筋详情。',
    target: 'button:has-text("剖切")',
    position: 'bottom',
    icon: <Scissors className="w-5 h-5" />,
  },
  {
    title: '数据 Tab 页',
    content: '下方的标签页提供：\n• 截面图：2D 截面配筋示意\n• 配筋率：自动计算并校验规范\n• 用量估算：钢筋重量计算\n• 弯折详图：下料详图',
    target: '.bg-white.rounded-xl.border',
    position: 'top',
  },
  {
    title: 'AI 助手',
    content: '点击右上角的「AI 助手」按钮，可以用自然语言描述配筋，或提问 22G101 相关问题。',
    target: 'button:has-text("AI")',
    position: 'left',
    icon: <Sparkles className="w-5 h-5" />,
  },
  {
    title: '开始探索吧！',
    content: '现在你已经了解了基本操作。试着修改参数，观察 3D 模型的变化。\n\n祝学习愉快！🎉',
    position: 'center',
    icon: <Check className="w-6 h-6" />,
  },
];

const STORAGE_KEY = 'rebarviz_tutorial_completed';

interface TutorialProps {
  componentType?: 'beam' | 'column' | 'slab' | 'joint' | 'shearwall';
  onComplete?: () => void;
  forceShow?: boolean;
}

export function Tutorial({ componentType = 'beam', onComplete, forceShow }: TutorialProps) {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  
  const steps = componentType === 'beam' ? BEAM_TUTORIAL_STEPS : BEAM_TUTORIAL_STEPS;
  const currentStep = steps[step];
  
  useEffect(() => {
    // 检查是否已完成教程
    if (forceShow) {
      setShow(true);
      return;
    }
    
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      // 首次访问，延迟显示教程
      const timer = setTimeout(() => setShow(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);
  
  const handleComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setShow(false);
    onComplete?.();
  }, [onComplete]);
  
  const handleNext = useCallback(() => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      handleComplete();
    }
  }, [step, steps.length, handleComplete]);
  
  const handlePrev = useCallback(() => {
    if (step > 0) {
      setStep(s => s - 1);
    }
  }, [step]);
  
  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);
  
  if (!show) return null;
  
  const isCenter = currentStep.position === 'center';
  
  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity"
        onClick={handleSkip}
      />
      
      {/* Tutorial card */}
      <div 
        className={`fixed z-[101] ${
          isCenter 
            ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' 
            : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-[90vw] overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 px-6 py-4 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentStep.icon && (
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    {currentStep.icon}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{currentStep.title}</h3>
                  <p className="text-white/70 text-sm">{step + 1} / {steps.length}</p>
                </div>
              </div>
              <button 
                onClick={handleSkip}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="h-1 bg-gray-100">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-300"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
          
          {/* Content */}
          <div className="px-6 py-5">
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">
              {currentStep.content}
            </p>
          </div>
          
          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              跳过教程
            </button>
            
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一步
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg cursor-pointer transition-all shadow-md shadow-blue-500/20"
              >
                {step < steps.length - 1 ? (
                  <>
                    下一步
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    完成
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * 重置教程状态的工具函数
 */
export function resetTutorial() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 检查教程是否已完成
 */
export function isTutorialCompleted(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}
