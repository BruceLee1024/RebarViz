export const STAGE_DURATION_MS = 3200;

export interface ConstructionStage {
  id: string;
  label: string;
  description: string;
  groups: string[];
}

export interface PlaybackState {
  open: boolean;
  step: number;
  playing: boolean;
  speed: number;
  elapsed: number;
  startedAt: number;
  revision: number;
}

export type PlaybackAction = { type: 'enter' | 'exit' | 'pause' | 'toggle' | 'advance' | 'restart' }
  | { type: 'seek'; step: number } | { type: 'speed'; speed: number };

export const initialPlayback = (): PlaybackState => ({ open: false, step: 0, playing: false, speed: 1, elapsed: 0, startedAt: 0, revision: 0 });
export const playbackElapsed = (s: PlaybackState, now: number) => Math.min(STAGE_DURATION_MS, s.elapsed + (s.playing ? Math.max(0, now - s.startedAt) * s.speed : 0));

export function playbackTransition(s: PlaybackState, action: PlaybackAction, now: number, count: number): PlaybackState {
  const next = { ...s, elapsed: playbackElapsed(s, now), startedAt: now, revision: s.revision + 1 };
  switch (action.type) {
    case 'enter': case 'restart': return { ...next, open: true, step: 0, elapsed: 0, playing: true };
    case 'exit': return { ...next, open: false, playing: false, elapsed: 0 };
    case 'pause': return { ...next, playing: false };
    case 'toggle':
      if (!s.open || (s.step >= count - 1 && next.elapsed >= STAGE_DURATION_MS)) return { ...next, open: true, step: 0, elapsed: 0, playing: true };
      return { ...next, playing: !s.playing };
    case 'seek': return { ...next, step: Math.max(0, Math.min(count - 1, action.step)), elapsed: 0, playing: false };
    case 'speed': return { ...next, speed: Math.max(.5, Math.min(2, action.speed)) };
    case 'advance': return s.step >= count - 1
      ? { ...next, playing: false, elapsed: STAGE_DURATION_MS }
      : { ...next, step: s.step + 1, elapsed: 0 };
  }
}

function stages(definitions: [string, string, string][]): ConstructionStage[] {
  const groups: string[] = [];
  return definitions.map(([id, label, description]) => {
    if (id !== 'reference') groups.push(id);
    return { id, label, description, groups: [...groups] };
  });
}

/** A teaching sequence of the model's actual steel groups, not a site method statement. */
export function beamConstructionSteps(p: {
  sideBar?: string; leftSupport?: string; rightSupport?: string; innerSupport?: string; erectionBar?: string;
  haunchType?: string; haunchLength?: number; haunchHeight?: number;
}): ConstructionStage[] {
  const definitions: [string, string, string][] = [
    ['reference', '定位轮廓', '用轮廓定位梁与支座，先看清构件范围。'],
    ['bottom', '下部纵筋', '查看下部各排钢筋及端部锚固，弯折保持实际尺寸。'],
    ['stirrup', '箍筋', '查看独立闭合箍、弯钩错开及加密区分布。'],
    ['top', '上部纵筋', '查看上部贯通钢筋与两端锚固位置。'],
  ];
  if (p.leftSupport || p.rightSupport || p.innerSupport || p.erectionBar) definitions.push(['support', '支座与架立筋', '查看支座附加钢筋及配置的架立筋，核对各排位置。']);
  if (p.sideBar) definitions.push(
    ['sideBar', '腰筋 / 抗扭筋', '查看两侧腰筋分层布置与锚固。'],
    ['tieBar', '拉筋', '查看拉筋与腰筋的关系，保留独立端头与弯钩。'],
  );
  if (p.haunchType && p.haunchType !== 'none' && (p.haunchLength ?? 0) > 0 && (p.haunchHeight ?? 0) > 0) definitions.push(['haunch', '加腋附加筋', '查看加腋范围内的附加钢筋与斜段构造。']);
  definitions.push(['concrete', '完整构件', '显示混凝土轮廓与完整钢筋骨架，可调整透明度复核。']);
  return stages(definitions);
}

export function stairConstructionSteps(): ConstructionStage[] {
  return stages([
    ['reference', '定位轮廓', '定位梯段、平台与支座，查看坡向和连接位置。'],
    ['bottom', '下部纵筋', '查看下部钢筋沿梯段的走向与支座锚固。'],
    ['dist', '分布筋', '查看分布筋与纵筋的交叉层次及间距。'],
    ['top', '上部支座筋', '查看上下支座区域的上部钢筋，区分支座段与跨中。'],
    ['concrete', '完整构件', '显示混凝土外形与完整钢筋骨架，复核梯段和平台衔接。'],
  ]);
}
