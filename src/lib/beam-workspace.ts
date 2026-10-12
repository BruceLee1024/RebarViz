import type { BeamParams, FoundationParams, RaftFoundationParams, StripFoundationParams } from './types';
import { BEAM_PRESETS, FOUNDATION_PRESETS, RAFT_PRESETS, STRIPFOUNDATION_PRESETS } from './rebar';

export const BEAM_FAMILIES = [
  { value: 'frame', label: '框架梁 KL' },
  { value: 'coupling', label: '连梁 LL' },
  { value: 'foundation', label: '基础主梁 JL' },
  { value: 'secondary', label: '基础次梁 JCL' },
] as const;
export type BeamFamily = typeof BEAM_FAMILIES[number]['value'];
export type FoundationContext = 'strip' | 'isolated' | 'raft';
export type BeamWorkspaceParams = BeamParams | FoundationParams | StripFoundationParams | RaftFoundationParams;
export interface BeamWorkspacePageProps<T> {
  initialParams?: T;
  workspaceDefaults?: T;
  onParamsChange?: (params: T) => void;
  workspaceTitle?: string;
}
export function resolveBeamWorkspace(kind: string | null, context: string | null) {
  const family: BeamFamily = BEAM_FAMILIES.some(k => k.value === kind) ? kind as BeamFamily : 'frame';
  const system: FoundationContext = family === 'foundation' && (context === 'isolated' || context === 'raft') ? context : 'strip';
  return { family, system, key: `${family}:${system}` };
}
export function beamWorkspaceHref(family: BeamFamily, system: FoundationContext = 'strip') {
  const query = new URLSearchParams({ kind: family });
  if (family === 'foundation') query.set('system', system);
  return `/beam?${query}`;
}
export const COUPLING_DEFAULT: BeamParams = {
  ...BEAM_PRESETS.standard, beamKind: 'coupling', id: 'LL1(1)', b: 250, h: 600, spanLength: 1800,
  top: '4C20', bottom: '4C20', stirrup: 'A8@100/100(2)', leftSupport: '', rightSupport: '',
  hc: 1000, supportDepth: 250, spanCount: 1,
};
export const FOUNDATION_BEAM_DEFAULT: FoundationParams = {
  ...FOUNDATION_PRESETS.dualColumn, columnCount: 2, hasFoundationBeam: true,
  stepDims: FOUNDATION_PRESETS.dualColumn.stepDims.map(s => ({ ...s })),
};
export const STRIP_BEAM_DEFAULT: StripFoundationParams = { ...STRIPFOUNDATION_PRESETS.singleBeam };
export const SECONDARY_BEAM_DEFAULT: StripFoundationParams = { ...STRIPFOUNDATION_PRESETS.doubleBeam, hasJcl: true };
export const RAFT_BEAM_DEFAULT: RaftFoundationParams = { ...RAFT_PRESETS.beamSlab };
