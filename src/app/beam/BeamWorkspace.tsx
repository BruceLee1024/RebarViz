'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { BEAM_PRESETS } from '@/lib/rebar';
import { decodeSharedParam } from '@/lib/share-params';
import type { BeamParams, FoundationParams, RaftFoundationParams, StripFoundationParams } from '@/lib/types';
import { BEAM_FAMILIES, COUPLING_DEFAULT, FOUNDATION_BEAM_DEFAULT, RAFT_BEAM_DEFAULT, SECONDARY_BEAM_DEFAULT, STRIP_BEAM_DEFAULT, beamWorkspaceHref, resolveBeamWorkspace, type BeamFamily, type FoundationContext, type BeamWorkspaceParams } from '@/lib/beam-workspace';

const BeamPageClient = dynamic(() => import('./BeamPageClient').then(m => m.BeamPageClient));
const FoundationPageClient = dynamic(() => import('../foundation/FoundationPageClient').then(m => m.FoundationPageClient));
const StripFoundationPageClient = dynamic(() => import('../stripfoundation/StripFoundationPageClient').then(m => m.StripFoundationPageClient));
const RaftPageClient = dynamic(() => import('../raft/RaftPageClient').then(m => m.RaftPageClient));

export function BeamWorkspace() {
  const search = useSearchParams(), router = useRouter();
  const shared = decodeSharedParam<Partial<BeamParams>>(search.get('p') ?? undefined);
  const { family, system, key: familyKey } = resolveBeamWorkspace(search.get('kind') ?? (shared?.beamKind === 'coupling' ? 'coupling' : null), search.get('system'));
  const key = `${familyKey}:${search.get('p') ?? ''}`;
  const [drafts, setDrafts] = useState<Record<string, BeamWorkspaceParams>>({});
  const remember = useCallback((params: BeamWorkspaceParams) => {
    setDrafts(current => current[key] === params ? current : { ...current, [key]: params, [`${familyKey}:`]: params });
  }, [key, familyKey]);
  const navigate = (nextFamily: BeamFamily, nextSystem: FoundationContext = system) => router.push(beamWorkspaceHref(nextFamily, nextSystem), { scroll: false });
  const title = `梁配筋工作台 · ${BEAM_FAMILIES.find(k => k.value === family)!.label}`;
  const common = { onParamsChange: remember, workspaceTitle: title };
  return <div className="rv-beam-workspace">
    <div className="rv-beam-family-bar" aria-label="梁类统一配置">
      <label>梁类型<select aria-label="梁类型" value={family} onChange={e => navigate(e.target.value as BeamFamily)}>{BEAM_FAMILIES.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
      {family === 'foundation' && <label>所属基础<select aria-label="所属基础" value={system} onChange={e => navigate(family, e.target.value as FoundationContext)}><option value="strip">条形基础</option><option value="isolated">独立基础（双柱）</option><option value="raft">梁板式筏基</option></select></label>}
      <p>{family === 'frame' ? '跨数、截面、配筋和加腋在同一处组合配置。' : family === 'coupling' ? '普通连梁配筋示意；斜向钢筋、墙内锚固专项构造待复核。' : '保留基础与梁的连接上下文；下方工程量包含当前基础组合，非单根梁数量。'}</p>
    </div>
    <div className="rv-beam-family-content">
      {(family === 'frame' || family === 'coupling') && <BeamPageClient key={key} {...common} initialParams={drafts[key] as BeamParams | undefined} workspaceDefaults={family === 'coupling' ? COUPLING_DEFAULT : BEAM_PRESETS.standard} />}
      {(family === 'secondary' || family === 'foundation' && system === 'strip') && <StripFoundationPageClient key={key} {...common} initialParams={drafts[key] as StripFoundationParams | undefined} workspaceDefaults={family === 'secondary' ? SECONDARY_BEAM_DEFAULT : STRIP_BEAM_DEFAULT} />}
      {family === 'foundation' && system === 'isolated' && <FoundationPageClient key={key} {...common} initialParams={drafts[key] as FoundationParams | undefined} workspaceDefaults={FOUNDATION_BEAM_DEFAULT} />}
      {family === 'foundation' && system === 'raft' && <RaftPageClient key={key} {...common} initialParams={drafts[key] as RaftFoundationParams | undefined} workspaceDefaults={RAFT_BEAM_DEFAULT} />}
    </div>
  </div>;
}
