'use client';

import type { BeamWorkspacePageProps } from '@/lib/beam-workspace';

import { FormworkCalc } from '@/components/FormworkCalc';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { BeamParams, HaunchType, RebarMeshInfo } from '@/lib/types';
import { BEAM_PRESETS } from '@/lib/rebar';
import { calcBeam, calcBeamRebarRatios, type BarShape } from '@/lib/calc';
import { validateRebar, validateStirrup, validateDimension } from '@/lib/validate';
import { BeamCrossSection } from '@/components/CrossSection';
import { BeamExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ConcreteCalc } from '@/components/ConcreteCalc';
import { calcBeamConcrete } from '@/lib/calc-concrete';
import { BarBendingSchedule } from '@/components/BarBendingSchedule';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import type { ConcreteGrade, SeismicGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { RebarRatioCard } from '@/components/RebarRatioCard';
import { buildBeamContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';
import { HelpCircle } from 'lucide-react';
import { WorkbenchLayout } from '@/components/WorkbenchLayout';
import type { ComponentType } from '@/lib/types';
import { Tutorial, resetTutorial } from '@/components/Tutorial';
import { checkCompliance } from '@/lib/compliance';
import { CompliancePanel, ComplianceBadge } from '@/components/CompliancePanel';
import { useHistory } from '@/lib/useHistory';
import { HistoryPanel } from '@/components/HistoryPanel';
import { ComparePanel } from '@/components/ComparePanel';

const DATA_TABS = [
  { key: 'section', label: '截面图' },
  { key: 'ratio', label: '配筋率' },
  { key: 'compliance', label: '构造检查' },
  { key: 'weight', label: '用量估算' },
  { key: 'concrete', label: '混凝土量' },
  { key: 'formwork', label: '模板量' },
  { key: 'bbs', label: '弯折详图' },
  { key: 'compare', label: '方案对比' },
] as const;

const BeamViewer = dynamic(() => import('@/components/BeamViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '简单梁', dot: 'bg-blue-400' },
  { key: 'standard', label: '标准梁', dot: 'bg-green-400' },
  { key: 'complex', label: '复杂梁', dot: 'bg-purple-400' },
  { key: 'mixedDia', label: '混合直径', dot: 'bg-amber-400' },
  { key: 'haunchH', label: '水平加腋', dot: 'bg-orange-400' },
  { key: 'haunchV', label: '竖向加腋', dot: 'bg-cyan-400' },
  { key: 'multiSpan', label: '多跨连续梁', dot: 'bg-rose-400' },
] as const;

const DEFAULT = { ...BEAM_PRESETS.standard };

function applySpanCountPatch(current: BeamParams, patch: Partial<BeamParams>): BeamParams {
  const merged = { ...current, ...patch };
  const oldCount = current.spanCount || 1;
  const newCount = merged.spanCount || 1;
  if (newCount === oldCount && patch.spanCount === undefined) return merged;

  const oldWidths = current.spanWidths && current.spanWidths.length === oldCount ? current.spanWidths : Array(oldCount).fill(current.b);
  const oldHeights = current.spanHeights && current.spanHeights.length === oldCount ? current.spanHeights : Array(oldCount).fill(current.h);
  const oldLengths = current.spanLengths && current.spanLengths.length === oldCount ? current.spanLengths : Array(oldCount).fill(current.spanLength || 4000);
  const newWidths = patch.spanWidths && patch.spanWidths.length === newCount
    ? patch.spanWidths
    : Array.from({ length: newCount }, (_, i) => oldWidths[i] ?? merged.b);
  const newHeights = patch.spanHeights && patch.spanHeights.length === newCount
    ? patch.spanHeights
    : Array.from({ length: newCount }, (_, i) => oldHeights[i] ?? merged.h);
  const newLengths = patch.spanLengths && patch.spanLengths.length === newCount
    ? patch.spanLengths
    : Array.from({ length: newCount }, (_, i) => oldLengths[i] ?? (merged.spanLength || 4000));
  const allWidthsSame = newWidths.every(w => w === merged.b);
  const allHeightsSame = newHeights.every(h => h === merged.h);
  const allLengthsSame = newLengths.every(l => l === (merged.spanLength || 4000));
  const idBase = merged.id || current.id;
  const newId = /\(\d+\)/.test(idBase) ? idBase.replace(/\(\d+\)/, `(${newCount})`) : `${idBase}(${newCount})`;

  return {
    ...merged,
    id: patch.id ?? newId,
    spanCount: newCount,
    spanWidths: allWidthsSame ? undefined : newWidths,
    spanHeights: allHeightsSame ? undefined : newHeights,
    spanLengths: allLengthsSame ? undefined : newLengths,
  };
}

export function BeamPageClient({ initialParams, workspaceDefaults, onParamsChange, workspaceTitle }: BeamWorkspacePageProps<BeamParams> = {}) {
  const defaults: BeamParams = workspaceDefaults ?? DEFAULT;
  const coupling = defaults.beamKind === 'coupling';
  const searchParams = useSearchParams();
  const router = useRouter();
  const [params, setParams] = useState<BeamParams>(() => {
    if (initialParams) return initialParams;
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<BeamParams>>(p ?? undefined);
    if (shared && shared.b && shared.h) {
      return { ...defaults, ...shared, beamKind: coupling ? 'coupling' : 'frame' };
    }
    return defaults;
  });
  useEffect(() => { onParamsChange?.(params); }, [params, onParamsChange]);
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const [showCut, setShowCut] = useState(false);

  const update = (patch: Partial<BeamParams>) => setParams(p => ({ ...p, ...patch }));

  // 更新跨数时，同步调整 spanWidths / spanHeights / spanLengths 数组长度，并同步梁编号括号内跨数
  const updateSpanCount = (n: number) => {
    setParams(p => applySpanCountPatch(p, { spanCount: n }));
  };

  const updateSpanWidth = (i: number, val: number) => {
    setParams(p => {
      const n = p.spanCount || 1;
      const arr = p.spanWidths && p.spanWidths.length === n ? [...p.spanWidths] : Array(n).fill(p.b);
      arr[i] = val;
      return { ...p, spanWidths: arr };
    });
  };

  const updateSpanHeight = (i: number, val: number) => {
    setParams(p => {
      const n = p.spanCount || 1;
      const arr = p.spanHeights && p.spanHeights.length === n ? [...p.spanHeights] : Array(n).fill(p.h);
      arr[i] = val;
      return { ...p, spanHeights: arr };
    });
  };

  const updateSpanLength = (i: number, val: number) => {
    setParams(p => {
      const n = p.spanCount || 1;
      const arr = p.spanLengths && p.spanLengths.length === n ? [...p.spanLengths] : Array(n).fill(p.spanLength || 4000);
      arr[i] = val;
      return { ...p, spanLengths: arr };
    });
  };

  const resetSpanArrays = () => {
    setParams(p => ({ ...p, spanWidths: undefined, spanHeights: undefined, spanLengths: undefined }));
  };
  const calcResult = useMemo(() => calcBeam(params), [params]);
  const concreteResult = useMemo(() => calcBeamConcrete(params), [params]);
  const ratioResult = useMemo(() => calcBeamRebarRatios(params), [params]);
  const complianceResults = useMemo(() => checkCompliance('beam', params), [params]);
  const aiContext = useMemo(() => buildBeamContext(params), [params]);

  // Validation
  const errors = useMemo(() => ({
    b: validateDimension(params.b, 'b', 100, 1000),
    h: validateDimension(params.h, 'h', 200, 1500),
    top: validateRebar(params.top, 'top'),
    bottom: validateRebar(params.bottom, 'bottom'),
    stirrup: validateStirrup(params.stirrup, 'stirrup'),
    leftSupport: params.leftSupport ? validateRebar(params.leftSupport, 'leftSupport') : null,
    rightSupport: params.rightSupport ? validateRebar(params.rightSupport, 'rightSupport') : null,
    leftSupport2: params.leftSupport2 ? validateRebar(params.leftSupport2, 'leftSupport2') : null,
    rightSupport2: params.rightSupport2 ? validateRebar(params.rightSupport2, 'rightSupport2') : null,
  }), [params]);

  // ─── Compliance by field (for inline red/amber borders) ───
  const complianceByField = useMemo(() => {
    const map: Record<string, { status: 'pass' | 'warn' | 'fail'; message: string }> = {};
    for (const r of complianceResults) {
      if (r.status === 'pass') continue;
      if (!map[r.field] || (r.status === 'fail' && map[r.field].status === 'warn')) {
        map[r.field] = { status: r.status, message: r.message };
      }
    }
    return map;
  }, [complianceResults]);

  // ─── Bidirectional highlight: form ↔ 3D ───
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [selectedRebarType, setSelectedRebarType] = useState<string | null>(null);
  const [selectedRebarInfo, setSelectedRebarInfo] = useState<RebarMeshInfo | null>(null);

  const handleAIApply = (p: Partial<BeamParams>) => {
    setParams(current => applySpanCountPatch(current, { ...p, beamKind: coupling ? 'coupling' : 'frame' }));
  };

  const handlePreset = (key: keyof typeof BEAM_PRESETS) => {
    setParams({ ...BEAM_PRESETS[key], ...(coupling ? { beamKind: 'coupling' as const, id: BEAM_PRESETS[key].id.replace(/^KL\d+/, 'LL1'), hc: defaults.hc, supportDepth: defaults.supportDepth } : {}) });
  };
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const selectDataTab = (tab: typeof DATA_TABS[number]['key']) => {
    setDataTab(tab);
    setAnalysisOpen(true);
  };
  const aiMessage = searchParams.get('ai') || undefined;
  const [showAI, setShowAI] = useState(!!aiMessage);
  const [showTutorial, setShowTutorial] = useState(false);

  // 历史记录
  const {
    history,
    favorites,
    addToHistory,
    addToFavorites,
    removeFromFavorites,
    removeFromHistory,
    clearHistory,
    isFavorite,
  } = useHistory<BeamParams>('beam');

  // 参数变化时自动保存历史（节流）
  useEffect(() => {
    const timer = setTimeout(() => {
      addToHistory(params, params.id);
    }, 2000);
    return () => clearTimeout(timer);
  }, [params, addToHistory]);

  // 对比方案
  const [compareParams, setCompareParams] = useState<BeamParams | null>(null);
  const [compareLabel, setCompareLabel] = useState<string>('历史方案');

  const handleSelectHistory = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) {
      setParams({ ...item.params as BeamParams, beamKind: coupling ? 'coupling' : 'frame' });
    }
  };

  const handleSelectForCompare = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) {
      setCompareParams(item.params as BeamParams);
      setCompareLabel(item.name);
      selectDataTab('compare');
    }
  };

  return (
    <>
      {!coupling && <Tutorial componentType="beam" forceShow={showTutorial} onComplete={() => setShowTutorial(false)} />}
      <WorkbenchLayout
        title={workspaceTitle ?? "梁配筋工作台"}
        summary={<>{params.id}<span>·</span>{params.b} × {params.h} mm<span>·</span>{params.spanCount || 1} 跨</>}
        actions={<>
          {!coupling && <button onClick={() => { resetTutorial(); setShowTutorial(true); }} className="rv-icon-button" aria-label="查看教程" title="查看教程"><HelpCircle size={17} /></button>}
          <ShareButton params={params} className="rv-button rv-share-button" />
        </>}
        inspector={<>
          <div className="rv-inspector-tools"><span>统一梁配置</span><ResetButton onClick={() => setParams(defaults)} /></div>
          <div className="rv-parameter-form">
            <div className="mb-4"><label className="block text-xs">载入配筋示例<select className="w-full mt-1 border" value="" onChange={e => { if (e.target.value) handlePreset(e.target.value as keyof typeof BEAM_PRESETS); }}><option value="">选择示例（可选）</option>{presetList.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}</select></label></div>

            <div className="rv-dimension-fields">
              <Field label="梁编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="截面宽 b (mm)" value={params.b} onChange={v => update({ b: v })} error={errors.b?.message} min={100} max={1000} />
              <NumField label="截面高 h (mm)" value={params.h} onChange={v => update({ h: v })} error={errors.h?.message} min={200} max={1500} />
            </div>

            <Section title="梁构造" defaultOpen>
              <NumField label="跨数" value={params.spanCount || 1} onChange={updateSpanCount} min={1} max={6} />
              <NumField label="梁净跨 (mm)" value={params.spanLength} onChange={v => update({ spanLength: v })} min={1000} max={15000} />

              <SelectField label="加腋类型" value={params.haunchType} onChange={v => update({ haunchType: v as HaunchType, haunchLength: params.haunchLength || 800, haunchHeight: params.haunchHeight || 200 })}
                options={[
                  { value: 'none', label: '无加腋' },
                  { value: 'horizontal', label: '水平加腋（两侧加宽）' },
                  { value: 'vertical', label: '竖向加腋（梁底加高）' },
                ]} />
              {params.haunchType !== 'none' && (
                <>
                  <NumField label="加腋长度 c₁ (mm)" value={params.haunchLength} onChange={v => update({ haunchLength: v })} min={200} max={2000} />
                  <NumField label={params.haunchType === 'horizontal' ? '单侧加腋宽度 (mm)' : '加腋高度 (mm)'} value={params.haunchHeight} onChange={v => update({ haunchHeight: v })} min={100} max={800} />
                  <SelectField label="加腋位置" value={params.haunchSide} onChange={v => update({ haunchSide: v as 'both' | 'left' | 'right' })}
                    options={[
                      { value: 'both', label: '两端加腋' },
                      { value: 'left', label: '仅左端' },
                      { value: 'right', label: '仅右端' },
                    ]} />
                </>
              )}

              <p className="text-[11px] text-muted">单跨、多跨与加腋可自由组合；不同直径直接在配筋栏用 + 连接。</p>
            </Section>

            <Section title="集中标注" defaultOpen>
              <Field label="上部通长筋" value={params.top} onChange={v => update({ top: v })} placeholder="如: 2C25" error={errors.top?.message}
                highlightKey="top" onHover={setHoveredField} highlighted={selectedRebarType === 'top'}
                complianceStatus={complianceByField.top?.status} complianceMessage={complianceByField.top?.message} />
              <Field label="下部通长筋" value={params.bottom} onChange={v => update({ bottom: v })} placeholder="如: 4C25" error={errors.bottom?.message}
                highlightKey="bottom" onHover={setHoveredField} highlighted={selectedRebarType === 'bottom'}
                complianceStatus={complianceByField.bottom?.status} complianceMessage={complianceByField.bottom?.message} />
              <Field label="箍筋" value={params.stirrup} onChange={v => update({ stirrup: v })} placeholder="如: A8@100/200(2)" error={errors.stirrup?.message}
                highlightKey="stirrup" onHover={setHoveredField} highlighted={selectedRebarType === 'stirrup'}
                complianceStatus={complianceByField.stirrup?.status} complianceMessage={complianceByField.stirrup?.message} />
            </Section>

            <Section title="材料与构造">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as SeismicGrade })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
              <NumField label={coupling ? "墙内支承长度 (mm)" : "支座柱宽 hc (mm)"} value={params.hc} onChange={v => update({ hc: v })} min={200} max={1200} />
              <NumField label={coupling ? "墙厚 (mm)" : "支座柱截面深度 (mm)"} value={params.supportDepth || 600} onChange={v => update({ supportDepth: v })} min={200} max={1500} />
            </Section>

            {(params.spanCount || 1) > 1 && (
              <Section title="分跨参数">
                <p className="text-[11px] text-muted -mt-1">各跨截面尺寸和净跨长度（留空则使用上方统一值）</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-muted">
                        <th className="text-left py-1 pr-2 font-medium">跨号</th>
                        <th className="text-left py-1 pr-2 font-medium">截面宽 b</th>
                        <th className="text-left py-1 pr-2 font-medium">截面高 h</th>
                        <th className="text-left py-1 font-medium">净跨 ln</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: params.spanCount || 1 }, (_, i) => {
                        const spanWidths = params.spanWidths && params.spanWidths.length === (params.spanCount || 1) ? params.spanWidths : null;
                        const spanHeights = params.spanHeights && params.spanHeights.length === (params.spanCount || 1) ? params.spanHeights : null;
                        const spanLengths = params.spanLengths && params.spanLengths.length === (params.spanCount || 1) ? params.spanLengths : null;
                        const bVal = spanWidths ? spanWidths[i] : params.b;
                        const hVal = spanHeights ? spanHeights[i] : params.h;
                        const lVal = spanLengths ? spanLengths[i] : (params.spanLength || 4000);
                        return (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="py-1 pr-2 text-muted font-medium">第{i + 1}跨</td>
                            <td className="py-1 pr-2">
                              <input
                                type="number"
                                value={bVal}
                                min={100}
                                max={1000}
                                onChange={e => updateSpanWidth(i, Number(e.target.value))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="number"
                                value={hVal}
                                min={200}
                                max={2000}
                                onChange={e => updateSpanHeight(i, Number(e.target.value))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
                              />
                            </td>
                            <td className="py-1">
                              <input
                                type="number"
                                value={lVal}
                                min={1000}
                                max={15000}
                                onChange={e => updateSpanLength(i, Number(e.target.value))}
                                className="w-full border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(params.spanWidths || params.spanHeights || params.spanLengths) && (
                  <button
                    onClick={resetSpanArrays}
                    className="mt-1 text-[11px] text-blue-500 hover:text-blue-700 cursor-pointer"
                  >
                    重置为统一值
                  </button>
                )}
              </Section>
            )}

            <Section title="原位标注（支座负筋）">
              <p className="text-[11px] text-muted -mt-1">留空表示无支座负筋，第二排伸入跨内 ln/4</p>
              <Field label="左支座负筋" value={params.leftSupport || ''} onChange={v => update({ leftSupport: v })} placeholder="如: 2C25" error={errors.leftSupport?.message}
                highlightKey="leftSupport" onHover={setHoveredField} highlighted={selectedRebarType === 'leftSupport'}
                complianceStatus={complianceByField.leftSupport?.status} complianceMessage={complianceByField.leftSupport?.message} />
              {params.leftSupport && (
                <Field label="左支座(二排)" value={params.leftSupport2 || ''} onChange={v => update({ leftSupport2: v || undefined })} placeholder="如: 2C25（留空=无二排）" error={errors.leftSupport2?.message}
                  highlightKey="leftSupport2" onHover={setHoveredField} highlighted={selectedRebarType === 'leftSupport2'} />
              )}
              {(params.spanCount || 1) > 1 && (
                <Field label="中间支座负筋" value={params.innerSupport || ''} onChange={v => update({ innerSupport: v || undefined })} placeholder="如: 4C25（贯通中间柱，两侧各 ln/3）"
                  highlightKey="innerSupport" onHover={setHoveredField} highlighted={selectedRebarType === 'innerSupport'} />
              )}
              <Field label="右支座负筋" value={params.rightSupport || ''} onChange={v => update({ rightSupport: v })} placeholder="如: 4C25" error={errors.rightSupport?.message}
                highlightKey="rightSupport" onHover={setHoveredField} highlighted={selectedRebarType === 'rightSupport'}
                complianceStatus={complianceByField.rightSupport?.status} complianceMessage={complianceByField.rightSupport?.message} />
              {params.rightSupport && (
                <Field label="右支座(二排)" value={params.rightSupport2 || ''} onChange={v => update({ rightSupport2: v || undefined })} placeholder="如: 2C25（留空=无二排）" error={errors.rightSupport2?.message}
                  highlightKey="rightSupport2" onHover={setHoveredField} highlighted={selectedRebarType === 'rightSupport2'} />
              )}
            </Section>

            <Section title="架立筋">
              <p className="text-[11px] text-muted -mt-1">留空时按规范自动确定（有支座负筋时: 净跨≤4m用2Φ10，&gt;4m用2Φ12）</p>
              <Field label="架立筋" value={params.erectionBar || ''} onChange={v => update({ erectionBar: v || undefined })} placeholder="如: 2C12（留空=自动）"
                highlightKey="erection" onHover={setHoveredField} highlighted={selectedRebarType === 'erection'} />
            </Section>

            <Section title="腰筋/抗扭筋">
              <p className="text-[11px] text-muted -mt-1">G前缀=构造腰筋，N前缀=抗扭筋，留空表示无</p>
              <Field label="腰筋/抗扭筋" value={params.sideBar || ''} onChange={v => update({ sideBar: v || undefined })} placeholder="如: G4C12 或 N2C16"
                highlightKey="sideBar" onHover={setHoveredField} highlighted={selectedRebarType === 'sideBar'} />
              {params.sideBar && (
                <Field label="拉筋" value={params.tieBar || ''} onChange={v => update({ tieBar: v || undefined })} placeholder="如: A6（留空自动确定）" />
              )}
            </Section>

          </div>

          <Section title="图例说明">
          <Legend items={[
            { color: '#C0392B', label: '纵向受力钢筋（通长筋）' },
            { color: '#8E44AD', label: '支座负筋（原位标注）' },
            { color: '#F39C12', label: '架立筋' },
            { color: '#22d3ee', label: '箍筋' },
            ...(params.sideBar ? [
              { color: '#2980B9', label: '腰筋/抗扭筋' },
              { color: '#1ABC9C', label: '拉筋' },
            ] : []),
            { color: '#7F8C8D', label: `支座柱截面（hc×${params.supportDepth || 600}）`, opacity: 0.3 },
            { color: '#BDC3C7', label: '混凝土截面（半透明）', opacity: 0.6 },
            ...(params.haunchType !== 'none' ? [
              { color: '#A0AEC0', label: '加腋混凝土', opacity: 0.4 },
              { color: '#E67E22', label: '加腋附加筋' },
            ] : []),
          ]} />
          </Section>

          {/* 历史记录与收藏 */}
          <Section title="历史记录与收藏">
            <HistoryPanel
              history={history}
              favorites={favorites}
              isFavorite={isFavorite(params)}
              onSelect={handleSelectHistory}
              onAddFavorite={() => addToFavorites(params, params.id)}
              onRemoveFavorite={removeFromFavorites}
              onRemoveHistory={removeFromHistory}
              onClearHistory={clearHistory}
            />
          </Section>
        </>}
        viewer={<BeamViewer params={params} cutPosition={cutPosition} showCut={showCut}
            onCutPositionChange={setCutPosition} onShowCutChange={setShowCut}
            highlightedType={hoveredField}
            selectedInfo={selectedRebarInfo}
            onSelectedInfoChange={setSelectedRebarInfo}
            onSelectedChange={setSelectedRebarType} />}
        analysisOpen={analysisOpen}
        onAnalysisOpenChange={setAnalysisOpen}
        analysisTabs={DATA_TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={dataTab === t.key} aria-controls="beam-analysis" onClick={() => selectDataTab(t.key)} className={`rv-analysis-tab ${dataTab === t.key ? 'is-active' : ''}`}>
            {t.label}{t.key === 'compliance' && <ComplianceBadge results={complianceResults} />}
          </button>
        ))}
        analysis={<>
              {dataTab === 'section' && (
                <BeamCrossSection params={params} cutPosition={showCut ? cutPosition : undefined} />
              )}
              {dataTab === 'ratio' && <RebarRatioCard ratios={ratioResult} />}
              {dataTab === 'compliance' && <CompliancePanel results={complianceResults} />}
              {dataTab === 'weight' && <>{coupling && <p className="rv-quantity-notes">按通用梁中心线估算；连梁墙内锚固、交叉斜筋及其附加箍筋尚未专项计入。</p>}<WeightCalc result={calcResult} beamId={params.id} /></>}
              {dataTab === 'concrete' && <ConcreteCalc result={concreteResult} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="beam" params={params} /></div>
              {dataTab === 'bbs' && (
                <BarBendingSchedule
                  params={params}
                  selectedSetId={selectedRebarInfo?.setId ?? (selectedRebarType ? `beam.${selectedRebarType}` : null)}
                  onSelectShape={(shape: BarShape) => {
                    if (!shape.setId) return;
                    const type = shape.setId === 'beam.stirrup'
                      ? 'stirrup'
                      : shape.setId === 'beam.tieBar'
                        ? 'tieBar'
                        : shape.setId.replace('beam.', '').split('.')[0] as RebarMeshInfo['type'];
                    setSelectedRebarInfo({
                      type,
                      label: shape.name,
                      detail: `${shape.spec} · BBS下料长度 ${Math.round(shape.totalLen)}mm`,
                      setId: shape.setId,
                      groupLabel: shape.name,
                      groupCount: shape.count > 0 ? shape.count : undefined,
                      relatedSetIds: shape.relatedSetIds,
                    });
                  }}
                />
              )}
              {dataTab === 'compare' && (
                <div className="space-y-4">
                  {compareParams ? (
                    <ComparePanel
                      paramsA={compareParams}
                      paramsB={params}
                      labelA={compareLabel}
                      labelB="当前方案"
                    />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-500 mb-3">从历史记录或收藏中选择一个方案进行对比</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {[...favorites, ...history].slice(0, 6).map(item => (
                          <button
                            key={item.id}
                            onClick={() => handleSelectForCompare(item.id, favorites.some(f => f.id === item.id))}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg cursor-pointer transition-colors"
                          >
                            {item.name}
                          </button>
                        ))}
                      </div>
                      {history.length === 0 && favorites.length === 0 && (
                        <p className="text-xs text-gray-400 mt-2">暂无历史记录，修改参数后会自动保存</p>
                      )}
                    </div>
                  )}
                  {compareParams && (
                    <button
                      onClick={() => setCompareParams(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      清除对比方案
                    </button>
                  )}
                </div>
              )}
        </>}
        onAssistantToggle={() => setShowAI(v => !v)}
        assistant={showAI ? (
            <AISidebar
              componentType="beam"
              currentParams={params}
              onApplyParams={(p) => handleAIApply(p as Partial<BeamParams>)}
              context={aiContext}
              notationSlot={<BeamExplain params={params} />}
              initialMessage={aiMessage}
              onSwitchTab={(tab) => selectDataTab(tab as typeof dataTab)}
              onHighlightElement={() => {}}
              onNavigateComponent={(type: ComponentType, message?: string) => {
                const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
                router.push(`/${type}${encoded}`);
              }}
              onApplyPreset={(preset) => {
                if (preset in BEAM_PRESETS) handlePreset(preset as keyof typeof BEAM_PRESETS);
              }}
              onGetCurrentState={() => aiContext}
              onRunComplianceCheck={() => {
                const results = complianceResults;
                const pass = results.filter(r => r.status === 'pass').length;
                const fail = results.filter(r => r.status === 'fail').length;
                const warn = results.filter(r => r.status === 'warn').length;
                return {
                  results,
                  summary: `校验完成: ${pass}项通过, ${fail}项不通过, ${warn}项警告\n${results.filter(r => r.status !== 'pass').map(r => `- [${r.status === 'fail' ? '❌' : '⚠️'}] ${r.message} (${r.rule})`).join('\n')}`,
                };
              }}
              onRunCalculation={(type) => {
                const tabMap: Record<string, typeof dataTab> = { ratio: 'ratio', weight: 'weight', concrete: 'concrete', anchor: 'compliance' };
                const tab = tabMap[type];
                if (tab) selectDataTab(tab);
                return { summary: `已切换到${type === 'ratio' ? '配筋率' : type === 'weight' ? '用量估算' : type === 'concrete' ? '混凝土量' : '规范校验'}面板` };
              }}
              onSaveFavorite={(name, note) => addToFavorites(params, name, note)}
              onResetParams={() => setParams(defaults)}
              onCompareWithPreset={(preset) => {
                if (!(preset in BEAM_PRESETS)) return `未知预设: ${preset}`;
                const pp = BEAM_PRESETS[preset as keyof typeof BEAM_PRESETS] as unknown as Record<string, unknown>;
                const diffs: string[] = [];
                if (params.b !== pp.b) diffs.push(`截面宽度: ${params.b} → ${pp.b}`);
                if (params.h !== pp.h) diffs.push(`截面高度: ${params.h} → ${pp.h}`);
                if (params.top !== pp.top) diffs.push(`上部通长筋: ${params.top} → ${pp.top}`);
                if (params.bottom !== pp.bottom) diffs.push(`下部通长筋: ${params.bottom} → ${pp.bottom}`);
                if (params.stirrup !== pp.stirrup) diffs.push(`箍筋: ${params.stirrup} → ${pp.stirrup}`);
                if (params.leftSupport !== (pp.leftSupport || '')) diffs.push(`左支座负筋: ${params.leftSupport || '无'} → ${pp.leftSupport || '无'}`);
                if (params.rightSupport !== (pp.rightSupport || '')) diffs.push(`右支座负筋: ${params.rightSupport || '无'} → ${pp.rightSupport || '无'}`);
                if (params.sideBar !== (pp.sideBar || '')) diffs.push(`腰筋: ${params.sideBar || '无'} → ${pp.sideBar || '无'}`);
                return diffs.length > 0
                  ? `当前方案 vs 预设「${preset}」的差异:\n${diffs.map(d => `- ${d}`).join('\n')}`
                  : `当前方案与预设「${preset}」完全一致`;
              }}
            />
        ) : undefined}
      />
    </>
  );
}
