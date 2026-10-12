'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { initialPlayback, playbackElapsed, playbackTransition, STAGE_DURATION_MS } from './construction-playback';
import type { ConstructionStage, PlaybackAction } from './construction-playback';

export function useConstructionPlayback(stages: ConstructionStage[]) {
  const planKey = stages.map(s => s.id).join('|');
  const [session, setSession] = useState(() => ({ key: planKey, state: initialPlayback() }));
  // Changed reinforcement configurations start with the full model again.
  if (session.key !== planKey) setSession({ key: planKey, state: initialPlayback() });
  const state = session.key === planKey ? session.state : initialPlayback();
  const clock = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState(true);
  const send = useCallback((action: PlaybackAction) => {
    const now = performance.now();
    setSession(s => ({ key: planKey, state: playbackTransition(s.key === planKey ? s.state : initialPlayback(), action, now, stages.length) }));
  }, [planKey, stages.length]);

  useEffect(() => {
    if (!state.open || !state.playing) return;
    const revision = state.revision;
    const timer = window.setTimeout(() => {
      setSession(s => s.key !== planKey || s.state.revision !== revision ? s : {
        ...s, state: playbackTransition(s.state, { type: 'advance' }, performance.now(), stages.length),
      });
    }, (STAGE_DURATION_MS - playbackElapsed(state, performance.now())) / state.speed);
    return () => window.clearTimeout(timer);
  }, [state, planKey, stages.length]);

  // Update just the progress element each frame; the model never rerenders per tick.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      clock.current?.style.setProperty('--stage-progress', String(playbackElapsed(state, performance.now()) / STAGE_DURATION_MS));
      if (state.playing) frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) send({ type: 'pause' }); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, [send]);

  const stage = stages[state.step] ?? stages[0];
  const visibleGroups = state.open ? new Set(stage.groups) : undefined;
  const activeGroup = state.open && focus && stage.id !== 'reference' && stage.id !== 'concrete' ? stage.id : null;
  return { state, stage, stages, send, clock, focus, setFocus, visibleGroups, activeGroup };
}

export type ConstructionPlayback = ReturnType<typeof useConstructionPlayback>;
