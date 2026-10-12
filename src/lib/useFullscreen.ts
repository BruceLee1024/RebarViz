'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * 全屏 hook: 优先使用原生 Fullscreen API, 否则回退到 CSS fixed 模拟
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isFullscreen) {
      const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      } else {
        setIsFullscreen(false);
      }
    } else {
      const elem = el as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> };
      let nativeOk = false;
      if (elem.requestFullscreen) {
        elem.requestFullscreen().then(() => { nativeOk = true; }).catch(() => setIsFullscreen(true));
        nativeOk = true;
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
        nativeOk = true;
      }
      if (!nativeOk) setIsFullscreen(true);
    }
  }, [isFullscreen]);

  // Sync with native fullscreen events
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element };
    const handler = () => {
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  // Esc to exit CSS fallback fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen]);

  /** className for the 3D container div */
  const containerClass = isFullscreen
    ? 'rv-fullscreen-canvas fixed inset-0 z-50 rounded-none border-0'
    : 'rv-embedded-canvas';

  return { isFullscreen, toggle, containerRef, containerClass };
}
