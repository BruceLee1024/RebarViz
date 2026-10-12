'use client';

import { Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ConstructionPlayback } from '@/lib/useConstructionPlayback';
import { playbackElapsed, STAGE_DURATION_MS } from '@/lib/construction-playback';

export function ConstructionTimeline({ playback }: { playback: ConstructionPlayback }) {
  const { state, stage, stages, send, clock, focus, setFocus } = playback;
  const stageList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    clock.current?.style.setProperty('--stage-progress', String(playbackElapsed(state, performance.now()) / STAGE_DURATION_MS));
  }, [clock, state]);
  useEffect(() => {
    const list = stageList.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (list && current) {
      const left = current.offsetLeft, right = left + current.offsetWidth;
      if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) list.scrollTo({ left: Math.max(0, left - (list.clientWidth - current.offsetWidth) / 2) });
    }
  }, [state.step, state.open]);
  if (!state.open) return null;
  const finished = !state.playing && state.step === stages.length - 1 && state.elapsed >= STAGE_DURATION_MS;
  return <section className="rv-construction" aria-label="施工动画时间轴" data-step={stage.id} data-playing={state.playing}>
    <div className="rv-construction-header">
      <div className="rv-construction-title"><span className={state.playing ? 'is-playing' : ''} />
        <b>构造分步演示</b><small>{state.step + 1} / {stages.length}</small>
      </div>
      <div className="rv-construction-controls">
        <button aria-label="上一步" onClick={() => send({ type: 'seek', step: state.step - 1 })} disabled={state.step === 0}><ChevronLeft size={14} /></button>
        <button className="rv-construction-play" aria-label={state.playing ? '暂停动画' : finished ? '重播动画' : '播放动画'}
          onClick={() => send({ type: 'toggle' })}>
          {state.playing ? <Pause size={13} /> : <Play size={13} />} {state.playing ? '暂停' : finished ? '重播' : '播放'}
        </button>
        <button aria-label="下一步" onClick={() => send({ type: 'seek', step: state.step + 1 })} disabled={state.step === stages.length - 1}><ChevronRight size={14} /></button>
        <button aria-label="从头播放" title="从头播放" onClick={() => send({ type: 'restart' })}><RotateCcw size={13} /></button>
        <select aria-label="动画速度" value={state.speed} onChange={event => send({ type: 'speed', speed: Number(event.target.value) })}>
          <option value={.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option>
        </select>
        <button aria-label="退出施工动画" title="恢复完整模型" onClick={() => send({ type: 'exit' })}><X size={14} /></button>
      </div>
    </div>
    <div className="rv-construction-stages" ref={stageList} role="group" aria-label="选择构造步骤">
      {stages.map((s, i) => <button key={s.id} aria-label={`第${i + 1}步：${s.label}`} aria-current={i === state.step ? 'step' : undefined}
        className={`${i === state.step ? 'is-current' : ''} ${i < state.step ? 'is-complete' : ''}`}
        onClick={() => send({ type: 'seek', step: i })}>
        <span>{i < state.step ? <Check size={10} /> : String(i + 1).padStart(2, '0')}</span>{s.label}
      </button>)}
    </div>
    <div className="rv-construction-progress" ref={clock} aria-hidden="true"><span /></div>
    <div className="rv-construction-caption">
      <p><b>{stage.label}</b><span>{stage.description}</span></p>
      <button aria-pressed={focus} onClick={() => setFocus(v => !v)} title="淡化已显示钢筋，突出当前组">突出当前</button>
    </div>
  </section>;
}
