'use client';

import type { BeamWorkspacePageProps } from '@/lib/beam-workspace';

import { BeamEntryLink } from '@/components/BeamEntryLink';

import { FormworkCalc } from '@/components/FormworkCalc';

import { WorkbenchLayout, WorkbenchTabs } from '@/components/WorkbenchLayout';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { FoundationParams, FoundationStepDim, ComponentType, FoundationBeamEndType, FoundationBeamOverhangSide } from '@/lib/types';
import { FOUNDATION_PRESETS } from '@/lib/rebar';
import { calcFoundation } from '@/lib/calc';
import { FoundationCrossSection } from '@/components/CrossSection';
import { FoundationExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ConcreteCalc } from '@/components/ConcreteCalc';
import { calcFoundationConcrete } from '@/lib/calc-concrete';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import type { ConcreteGrade, SeismicGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { buildFoundationContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';
import { FoundationAnchorPanel } from '@/components/FoundationAnchorPanel';
import { CompliancePanel, ComplianceBadge } from '@/components/CompliancePanel';
import { checkCompliance } from '@/lib/compliance';
import { useHistory } from '@/lib/useHistory';
import { HistoryPanel } from '@/components/HistoryPanel';
import { MetricComparePanel } from '@/components/MetricComparePanel';
import { metricFromNumber, metricFromText } from '@/lib/compare-utils';

const DATA_TABS = [
  { key: 'section', label: '截面图' },
  { key: 'guide', label: '识图说明' },
  { key: 'compliance', label: '构造检查' },
  { key: 'weight', label: '用量估算' },
  { key: 'concrete', label: '混凝土量' },
  { key: 'formwork', label: '模板量' },
  { key: 'anchor', label: '锚固构造' },
  { key: 'compare', label: '方案对比' },
] as const;

const FoundationViewer = dynamic(() => import('@/components/FoundationViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '单阶基础', dot: 'bg-blue-400' },
  { key: 'standard', label: '双阶基础', dot: 'bg-green-400' },
  { key: 'tapered', label: '锥形基础', dot: 'bg-orange-400' },
  { key: 'dualColumn', label: '双柱基础', dot: 'bg-sky-400' },
] as const;

function toMutableStepDims(dims: readonly { readonly bx: number; readonly by: number; readonly h: number }[]): FoundationStepDim[] {
  return dims.map(d => ({ bx: d.bx, by: d.by, h: d.h }));
}

const DEFAULT: FoundationParams = {
  ...FOUNDATION_PRESETS.standard,
  stepDims: toMutableStepDims(FOUNDATION_PRESETS.standard.stepDims),
};

export function FoundationPageClient({ initialParams, workspaceDefaults, onParamsChange, workspaceTitle }: BeamWorkspacePageProps<FoundationParams> = {}) {
  const defaults = workspaceDefaults ?? DEFAULT;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [params, setParams] = useState<FoundationParams>(() => {
    if (initialParams) return initialParams;
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<FoundationParams>>(p ?? undefined);
    if (shared && shared.bx && shared.by) {
      return { ...defaults, ...shared };
    }
    return defaults;
  });
  useEffect(() => { onParamsChange?.(params); }, [params, onParamsChange]);
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const aiMessage = searchParams.get('ai') || undefined;
  const [showAI, setShowAI] = useState(!!aiMessage);

  const update = (patch: Partial<FoundationParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcFoundation(params), [params]);
  const concreteResult = useMemo(() => calcFoundationConcrete(params), [params]);
  const complianceResults = useMemo(() => checkCompliance('foundation', params), [params]);
  const aiContext = useMemo(() => buildFoundationContext(params), [params]);

  const {
    history,
    favorites,
    addToHistory,
    addToFavorites,
    removeFromFavorites,
    removeFromHistory,
    clearHistory,
    isFavorite,
  } = useHistory<FoundationParams>('foundation');

  useEffect(() => {
    const timer = setTimeout(() => {
      addToHistory(params, params.id);
    }, 2000);
    return () => clearTimeout(timer);
  }, [params, addToHistory]);

  const [compareParams, setCompareParams] = useState<FoundationParams | null>(null);
  const [compareLabel, setCompareLabel] = useState('历史方案');

  const applyPreset = (key: keyof typeof FOUNDATION_PRESETS) => {
    const preset = FOUNDATION_PRESETS[key];
    setParams({
      ...preset,
      stepDims: toMutableStepDims(preset.stepDims),
    });
  };

  const updateStepDim = (index: number, patch: Partial<FoundationStepDim>) => {
    const newDims = [...params.stepDims];
    newDims[index] = { ...newDims[index], ...patch };
    setParams(p => ({ ...p, stepDims: newDims }));
  };

  const handleSelectHistory = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) setParams(item.params as FoundationParams);
  };

  const handleSelectForCompare = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) {
      setCompareParams(item.params as FoundationParams);
      setCompareLabel(item.name);
      setDataTab('compare');
    }
  };

  const compareMetrics = useMemo(() => {
    if (!compareParams) return [];
    const metrics = [
      metricFromText('基础形状', compareParams.shape === 'stepped' ? '阶形' : '锥形', params.shape === 'stepped' ? '阶形' : '锥形'),
      metricFromNumber('底面 X 向宽', compareParams.bx, params.bx, 'mm'),
      metricFromNumber('底面 Y 向宽', compareParams.by, params.by, 'mm'),
      metricFromNumber('基础总高', compareParams.h, params.h, 'mm'),
      metricFromText('X向底筋', compareParams.bottomBarX, params.bottomBarX),
      metricFromText('Y向底筋', compareParams.bottomBarY, params.bottomBarY),
      metricFromText('柱插筋', compareParams.colMain, params.colMain),
      metricFromNumber('柱数', compareParams.columnCount || 1, params.columnCount || 1),
      metricFromNumber('双柱中心距', compareParams.colSpacing || 0, params.colSpacing || 0, 'mm'),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    const weightA = calcFoundation(compareParams).items.reduce((sum, item) => sum + item.weightKg, 0);
    const weightB = calcResult.items.reduce((sum, item) => sum + item.weightKg, 0);
    const concreteA = calcFoundationConcrete(compareParams).totalVolume;
    const concreteB = concreteResult.totalVolume;
    const totals = [
      metricFromNumber('钢筋总用量', Number(weightA.toFixed(1)), Number(weightB.toFixed(1)), 'kg'),
      metricFromNumber('混凝土总量', Number(concreteA.toFixed(3)), Number(concreteB.toFixed(3)), 'm³'),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));

    return [...metrics, ...totals];
  }, [compareParams, params, calcResult.items, concreteResult.totalVolume]);

  const beamEditor0 = (params.columnCount || 1) === 2 && (
              <Section title="基础梁 JL" defaultOpen={!!workspaceTitle}>
                <SelectField
                  label="是否设置基础梁"
                  value={params.hasFoundationBeam ? 'yes' : 'no'}
                  onChange={v => update({ hasFoundationBeam: v === 'yes' })}
                  options={[
                    { value: 'yes', label: '是' },
                    { value: 'no', label: '否' },
                  ]}
                />
                {params.hasFoundationBeam && (
                  <>
                    <NumField label="梁宽 b (mm)" value={params.foundationBeamB || 600} onChange={v => update({ foundationBeamB: v })} min={300} max={2000} />
                    <NumField label="梁高 h (mm)" value={params.foundationBeamH || 700} onChange={v => update({ foundationBeamH: v })} min={300} max={2000} />
                    <Field label="箍筋" value={params.foundationBeamStirrup || 'A10@150(4)'} onChange={v => update({ foundationBeamStirrup: v })} placeholder="如: A10@150(4)" />
                    <Field label="底部纵筋" value={params.foundationBeamBottom || '4C22'} onChange={v => update({ foundationBeamBottom: v })} placeholder="如: 4C22" />
                    <Field label="顶部纵筋" value={params.foundationBeamTop || '4C20'} onChange={v => update({ foundationBeamTop: v })} placeholder="如: 4C20" />
                    <SelectField
                      label="端部外伸类型"
                      value={params.foundationBeamEndType || 'none'}
                      onChange={v => update({ foundationBeamEndType: v as FoundationBeamEndType })}
                      options={[
                        { value: 'none', label: 'JL(1) 无外伸' },
                        { value: 'oneSide', label: 'JL(1A) 单端外伸' },
                        { value: 'bothSides', label: 'JL(1B) 双端外伸' },
                      ]}
                    />
                    {(params.foundationBeamEndType || 'none') === 'oneSide' && (
                      <SelectField
                        label="单端外伸方向"
                        value={params.foundationBeamOverhangSide || 'right'}
                        onChange={v => update({ foundationBeamOverhangSide: v as FoundationBeamOverhangSide })}
                        options={[
                          { value: 'right', label: '右端外伸' },
                          { value: 'left', label: '左端外伸' },
                        ]}
                      />
                    )}
                    {(params.foundationBeamEndType || 'none') !== 'none' && (
                      <NumField label="外伸长度 (mm)" value={params.foundationBeamOverhang || 300} onChange={v => update({ foundationBeamOverhang: v })} min={100} max={3000} />
                    )}
                  </>
                )}
              </Section>
            );

  return (
    <WorkbenchLayout
      title={workspaceTitle ?? "基础配筋工作台"}
      summary={<>{params.id}<span>·</span>{params.bx} × {params.by} mm<span>·</span>高 {params.h} mm</>}
      actions={<>{!workspaceTitle && params.columnCount === 2 && params.hasFoundationBeam && <BeamEntryLink params={params} system="isolated" />}<ShareButton params={params} className="rv-button rv-share-button" /></>}
      inspector={
        <>
          <div className="rv-inspector-tools"><span>快速示例</span><ResetButton onClick={() => setParams(defaults)} /></div>
          <div className="rv-parameter-form">{workspaceTitle && beamEditor0}
            <div className="mb-4">

              <div className="flex flex-wrap gap-1.5">
                {presetList.map(({ key, label, dot }) => (
                  <button key={key} onClick={() => applyPreset(key)}
                    className="rv-preset-button">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Field label="基础编号" value={params.id} onChange={v => update({ id: v })} />
              <SelectField label="基础形状" value={params.shape} onChange={v => update({ shape: v as 'stepped' | 'tapered' })}
                options={[{ value: 'stepped', label: '阶形' }, { value: 'tapered', label: '锥形' }]} />
              <SelectField label="柱数" value={String(params.columnCount || 1)} onChange={v => update({ columnCount: Number(v) as 1 | 2 })}
                options={[{ value: '1', label: '单柱' }, { value: '2', label: '双柱 (22G101-3 p2-12)' }]} />
              <NumField label="底面 X 向宽 bx (mm)" value={params.bx} onChange={v => update({ bx: v })} min={800} max={8000} />
              <NumField label="底面 Y 向宽 by (mm)" value={params.by} onChange={v => update({ by: v })} min={800} max={4000} />
              <NumField label="基础总高 h (mm)" value={params.h} onChange={v => update({ h: v })} min={300} max={2000} />
            </div>
            {params.shape === 'stepped' && (
              <Section title="各阶尺寸">
                {params.stepDims.map((s, i) => (
                  <div key={i} className="space-y-2 p-2 bg-gray-50 rounded-lg">
                    <p className="text-xs font-medium text-gray-500">第 {i + 1} 阶</p>
                    <NumField label={`bx (mm)`} value={s.bx} onChange={v => updateStepDim(i, { bx: v })} min={400} max={4000} />
                    <NumField label={`by (mm)`} value={s.by} onChange={v => updateStepDim(i, { by: v })} min={400} max={4000} />
                    <NumField label={`h (mm)`} value={s.h} onChange={v => updateStepDim(i, { h: v })} min={200} max={1000} />
                  </div>
                ))}
              </Section>
            )}
            <Section title="底部配筋">
              <Field label="X向底筋" value={params.bottomBarX} onChange={v => update({ bottomBarX: v })} placeholder="如: C12@150" />
              <Field label="Y向底筋" value={params.bottomBarY} onChange={v => update({ bottomBarY: v })} placeholder="如: C12@150" />
              {params.by >= 2500 && (
                <SelectField
                  label="X向底筋隔一减短 10%"
                  value={params.shortenBottomBarX ? 'yes' : 'no'}
                  onChange={v => update({ shortenBottomBarX: v === 'yes' })}
                  options={[
                    { value: 'no', label: '否' },
                    { value: 'yes', label: '是（3D 显示减短筋）' },
                  ]}
                />
              )}
              {params.bx >= 2500 && (
                <SelectField
                  label="Y向底筋隔一减短 10%"
                  value={params.shortenBottomBarY ? 'yes' : 'no'}
                  onChange={v => update({ shortenBottomBarY: v === 'yes' })}
                  options={[
                    { value: 'no', label: '否' },
                    { value: 'yes', label: '是（3D 显示减短筋）' },
                  ]}
                />
              )}
            </Section>
            <Section title="柱参数">
              <NumField label="柱截面 X (mm)" value={params.colBx} onChange={v => update({ colBx: v })} min={200} max={800} />
              <NumField label="柱截面 Y (mm)" value={params.colBy} onChange={v => update({ colBy: v })} min={200} max={800} />
              <Field label="柱插筋" value={params.colMain} onChange={v => update({ colMain: v })} placeholder="如: 8C20" />
              {(params.columnCount || 1) === 2 && (
                <NumField label="双柱中心距 (mm)" value={params.colSpacing || 2000} onChange={v => update({ colSpacing: v })} min={800} max={6000} />
              )}
            </Section>
            {(params.columnCount || 1) === 2 && (
              <Section title="顶部柱间配筋">
                <Field label="纵向受力筋" value={params.topBarX || 'C14@150'} onChange={v => update({ topBarX: v })} placeholder="如: C14@150" />
                <NumField label="纵向受力筋总根数" value={params.topBarXCount || 9} onChange={v => update({ topBarXCount: v })} min={2} max={40} />
                <Field label="分布筋" value={params.topBarY || 'C10@200'} onChange={v => update({ topBarY: v })} placeholder="如: C10@200" />
                <NumField label="顶部钢筋带宽 (mm)" value={params.topBandWidth || 1200} onChange={v => update({ topBandWidth: v })} min={400} max={params.by} />
              </Section>
            )}
            {!workspaceTitle && beamEditor0}
            <Section title="材料">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade || '三级'} onChange={v => update({ seismicGrade: v as SeismicGrade })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={35} max={70} />
            </Section></div><Section title="图例说明"><Legend items={[
              { color: '#C0392B', label: 'X向底部钢筋' },
              { color: '#2980B9', label: 'Y向底部钢筋' },
              { color: '#8E44AD', label: '柱插筋' },
              ...((params.columnCount || 1) === 2 ? [
                { color: '#E67E22', label: '顶部纵向受力筋' },
                { color: '#27AE60', label: '顶部柱间分布筋' },
                ...(params.hasFoundationBeam ? [
                  { color: '#2E8B57', label: '基础梁箍筋' },
                  { color: '#8B4513', label: '基础梁底筋' },
                  { color: '#C97B36', label: '基础梁顶筋' },
                  { color: '#9EB6C8', label: '基础梁混凝土', opacity: 0.55 },
                ] : []),
              ] : []),
              { color: '#BDC3C7', label: '混凝土（半透明）', opacity: 0.6 },
            ]} /></Section>
          <Section title="历史记录与收藏"><HistoryPanel
            history={history}
            favorites={favorites}
            isFavorite={isFavorite(params)}
            onSelect={handleSelectHistory}
            onAddFavorite={() => addToFavorites(params, params.id)}
            onRemoveFavorite={removeFromFavorites}
            onRemoveHistory={removeFromHistory}
            onClearHistory={clearHistory}
          /></Section>
        </>}
      viewer={<FoundationViewer params={params} />}
      analysisTabs={<WorkbenchTabs tabs={DATA_TABS} active={dataTab} onChange={setDataTab} badges={{ compliance: <ComplianceBadge results={complianceResults} /> }} />}
      analysis={<>{dataTab === 'section' && (
        <>

          <div className="flex justify-center">
            <FoundationCrossSection params={params} />
          </div>
        </>
      )}
        {dataTab === 'guide' && <FoundationExplain params={params} />}
        {dataTab === 'compliance' && <CompliancePanel results={complianceResults} />}
        {dataTab === 'weight' && <WeightCalc result={calcResult} />}
        {dataTab === 'concrete' && <ConcreteCalc result={concreteResult} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="foundation" params={params} /></div>
        {dataTab === 'anchor' && <FoundationAnchorPanel params={params} />}
        {dataTab === 'compare' && (
          <div className="space-y-4">
            {compareParams ? (
              <MetricComparePanel
                metrics={compareMetrics}
                summary={{
                  title: '钢筋用量变化',
                  valueA: calcFoundation(compareParams).items.reduce((sum, item) => sum + item.weightKg, 0),
                  valueB: calcResult.items.reduce((sum, item) => sum + item.weightKg, 0),
                  unit: 'kg',
                  labelA: compareLabel,
                  labelB: '当前方案',
                }}
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
        )}</>}
      assistant={showAI ? <AISidebar
        componentType="foundation"
        currentParams={params}
        onApplyParams={(p) => update(p as Partial<FoundationParams>)}
        context={aiContext}
        notationSlot={<FoundationExplain params={params} />}
        initialMessage={aiMessage}
        onSwitchTab={(tab) => setDataTab(tab as typeof dataTab)}
        onNavigateComponent={(type: ComponentType, message?: string) => {
          const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
          router.push(`/${type}${encoded}`);
        }}
        onApplyPreset={(preset) => {
          if (preset in FOUNDATION_PRESETS) applyPreset(preset as keyof typeof FOUNDATION_PRESETS);
        }}
        onGetCurrentState={() => aiContext}
        onRunComplianceCheck={() => ({
          results: complianceResults,
          summary: `校验完成: ${complianceResults.filter(r => r.status === 'pass').length}项通过, ${complianceResults.filter(r => r.status === 'fail').length}项不通过, ${complianceResults.filter(r => r.status === 'warn').length}项警告`,
        })}
        onSaveFavorite={(name, note) => addToFavorites(params, name, note)}
        onResetParams={() => setParams(defaults)}
      /> : undefined}
      onAssistantToggle={() => setShowAI(value => !value)}
    />
  );
}
