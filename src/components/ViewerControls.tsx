'use client';

import { Maximize2, Minimize2 } from 'lucide-react';

type CameraPosition = [number, number, number];

export function ViewerControls({ views, onView, opacity, onOpacity, fullscreen, onFullscreen }: {
  views: { name: string; pos: CameraPosition }[];
  onView: (position: CameraPosition) => void;
  opacity: number;
  onOpacity: (opacity: number) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  return <div className="rv-view-controls absolute top-3 left-3">
    <div className="rv-camera-presets" role="group" aria-label="模型视角">
      {views.map(view => <button key={view.name} className="rv-camera-button" onClick={() => onView(view.pos)}>{view.name}</button>)}
    </div>
    <label className="rv-opacity-control">透明
      <input aria-label="混凝土透明度" type="range" min={0} max={0.6} step={0.02} value={opacity}
        onChange={event => onOpacity(Number(event.target.value))} />
    </label>
    <button className="rv-camera-button rv-camera-fullscreen" onClick={onFullscreen}
      aria-label={fullscreen ? '退出全屏' : '全屏显示'} title={fullscreen ? '退出全屏 (Esc)' : '全屏显示'}>
      {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
    </button>
  </div>;
}
