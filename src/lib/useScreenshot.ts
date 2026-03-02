'use client';

import { useCallback, useRef } from 'react';

/**
 * 截取 Canvas 为图片并下载
 */
export function useScreenshot() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const captureScreenshot = useCallback((filename = 'rebar-viz') => {
    // 获取 three.js canvas
    const canvas = canvasRef.current || document.querySelector('canvas');
    if (!canvas) {
      console.warn('No canvas found');
      return;
    }

    // 将 canvas 内容转为 dataURL
    const dataUrl = canvas.toDataURL('image/png');
    
    // 创建下载链接
    const link = document.createElement('a');
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  }, []);

  const setCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  return { captureScreenshot, setCanvasRef };
}

/**
 * 截取指定 DOM 容器内的 canvas 为图片
 */
export function captureElement(element: HTMLElement, filename = 'screenshot'): void {
  const canvas = element.querySelector('canvas');
  if (canvas) {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
  } else {
    console.warn('No canvas found in element');
  }
}
