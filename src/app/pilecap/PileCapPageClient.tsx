'use client';

import { FormworkCalc } from '@/components/FormworkCalc';

import { WorkbenchLayout, WorkbenchTabs } from '@/components/WorkbenchLayout';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { PileCapParams, ComponentType } from '@/lib/types';
import { PILECAP_PRESETS } from '@/lib/rebar';
import { calcPileCap } from '@/lib/calc';
import { PileCapCrossSection } from '@/components/CrossSection';
import { PileCapExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ConcreteCalc } from '@/components/ConcreteCalc';
import { calcPileCapConcrete } from '@/lib/calc-concrete';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES } from '@/lib/anchor';
import type { ConcreteGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { buildPileCapContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';
import { PileCapAnchorPanel } from '@/components/PileCapAnchorPanel';
import { SEISMIC_GRADES } from '@/lib/anchor';
import type { SeismicGrade } from '@/lib/anchor';
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

const PileCapViewer = dynamic(() => import('@/components/PileCapViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'twoPile', label: '两桩承台', dot: 'bg-blue-400' },
  { key: 'fourPile', label: '四桩承台', dot: 'bg-green-400' },
  { key: 'sixPile', label: '六桩承台', dot: 'bg-orange-400' },
] as const;

const DEFAULT: PileCapParams = { ...PILECAP_PRESETS.fourPile };

export function PileCapPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [params, setParams] = useState<PileCapParams>(() => {
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<PileCapParams>>(p ?? undefined);
    if (shared && shared.bx && shared.by) {
      return { ...DEFAULT, ...shared };
    }
    return DEFAULT;
  });
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const aiMessage = searchParams.get('ai') || undefined;
  const [showAI, setShowAI] = useState(!!aiMessage);

  const update = (patch: Partial<PileCapParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcPileCap(params), [params]);
  const concreteResult = useMemo(() => calcPileCapConcrete(params), [params]);
  const complianceResults = useMemo(() => checkCompliance('pilecap', params), [params]);
  const aiContext = useMemo(() => buildPileCapContext(params), [params]);

  const {
    history,
    favorites,
    addToHistory,
    addToFavorites,
    removeFromFavorites,
    removeFromHistory,
    clearHistory,
    isFavorite,
  } = useHistory<PileCapParams>('pilecap');

  useEffect(() => {
    const timer = setTimeout(() => addToHistory(params, params.id), 2000);
    return () => clearTimeout(timer);
  }, [params, addToHistory]);

  const [compareParams, setCompareParams] = useState<PileCapParams | null>(null);
  const [compareLabel, setCompareLabel] = useState('历史方案');

  const applyPreset = (key: keyof typeof PILECAP_PRESETS) => {
    setParams({ ...PILECAP_PRESETS[key] });
  };

  const handleSelectHistory = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) setParams(item.params as PileCapParams);
  };

  const handleSelectForCompare = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) {
      setCompareParams(item.params as PileCapParams);
      setCompareLabel(item.name);
      setDataTab('compare');
    }
  };

  const compareMetrics = useMemo(() => {
    if (!compareParams) return [];
    return [
      metricFromNumber('承台 X 向宽', compareParams.bx, params.bx, 'mm'),
      metricFromNumber('承台 Y 向宽', compareParams.by, params.by, 'mm'),
      metricFromNumber('承台高度', compareParams.h, params.h, 'mm'),
      metricFromNumber('桩径', compareParams.pileDiameter, params.pileDiameter, 'mm'),
      metricFromNumber('桩数', compareParams.pileCount, params.pileCount),
      metricFromNumber('X向桩距', compareParams.pileSpacingX, params.pileSpacingX, 'mm'),
      metricFromNumber('Y向桩距', compareParams.pileSpacingY, params.pileSpacingY, 'mm'),
      metricFromText('X向底筋', compareParams.bottomBarX, params.bottomBarX),
      metricFromText('Y向底筋', compareParams.bottomBarY, params.bottomBarY),
      metricFromText('柱插筋', compareParams.colMain, params.colMain),
      metricFromNumber('钢筋总用量', Number(calcPileCap(compareParams).items.reduce((sum, item) => sum + item.weightKg, 0).toFixed(1)), Number(calcResult.items.reduce((sum, item) => sum + item.weightKg, 0).toFixed(1)), 'kg'),
      metricFromNumber('混凝土总量', Number(calcPileCapConcrete(compareParams).totalVolume.toFixed(3)), Number(concreteResult.totalVolume.toFixed(3)), 'm³'),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [compareParams, params, calcResult.items, concreteResult.totalVolume]);

  return (
    <WorkbenchLayout
      title="承台配筋工作台"
      summary={<>{params.id}<span>·</span>{params.bx} × {params.by} mm<span>·</span>高 {params.h} mm</>}
      actions={<ShareButton params={params} className="rv-button rv-share-button" />}
      inspector={
        <>
          <div className="rv-inspector-tools"><span>快速示例</span><ResetButton onClick={() => setParams(DEFAULT)} /></div>
          <div className="rv-parameter-form">
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
              <Field label="承台编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="承台 X 向宽 bx (mm)" value={params.bx} onChange={v => update({ bx: v })} min={600} max={6000} />
              <NumField label="承台 Y 向宽 by (mm)" value={params.by} onChange={v => update({ by: v })} min={600} max={6000} />
              <NumField label="承台高度 h (mm)" value={params.h} onChange={v => update({ h: v })} min={500} max={3000} />
            </div>
            <Section title="桩参数">
              <NumField label="桩径 (mm)" value={params.pileDiameter} onChange={v => update({ pileDiameter: v })} min={300} max={2000} />
              <NumField label="桩数" value={params.pileCount} onChange={v => update({ pileCount: v })} min={1} max={16} />
              <NumField label="X向桩距 (mm)" value={params.pileSpacingX} onChange={v => update({ pileSpacingX: v })} min={0} max={4000} />
              <NumField label="Y向桩距 (mm)" value={params.pileSpacingY} onChange={v => update({ pileSpacingY: v })} min={0} max={4000} />
              <NumField label="桩长 (mm)" value={params.pileLength} onChange={v => update({ pileLength: v })} min={3000} max={50000} />
              <SelectField label="排布方式" value={params.pileLayout} onChange={v => update({ pileLayout: v as 'grid' | 'circular' })}
                options={[{ value: 'grid', label: '矩形排布' }, { value: 'circular', label: '环形排布' }]} />
            </Section>
            <Section title="底部配筋">
              <Field label="X向底筋" value={params.bottomBarX} onChange={v => update({ bottomBarX: v })} placeholder="如: C14@150" />
              <Field label="Y向底筋" value={params.bottomBarY} onChange={v => update({ bottomBarY: v })} placeholder="如: C14@150" />
            </Section>
            <Section title="柱参数">
              <NumField label="柱截面 X (mm)" value={params.colBx} onChange={v => update({ colBx: v })} min={200} max={1200} />
              <NumField label="柱截面 Y (mm)" value={params.colBy} onChange={v => update({ colBy: v })} min={200} max={1200} />
              <Field label="柱插筋" value={params.colMain} onChange={v => update({ colMain: v })} placeholder="如: 8C20" />
            </Section>
            <Section title="材料">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade || '三级'} onChange={v => update({ seismicGrade: v as SeismicGrade })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={40} max={80} />
            </Section></div><Section title="图例说明"><Legend items={[
              { color: '#C0392B', label: 'X向底部钢筋' },
              { color: '#2980B9', label: 'Y向底部钢筋' },
              { color: '#8E44AD', label: '柱插筋' },
              { color: '#7F8C8D', label: '桩基' },
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
      viewer={<PileCapViewer params={params} />}
      analysisTabs={<WorkbenchTabs tabs={DATA_TABS} active={dataTab} onChange={setDataTab} badges={{ compliance: <ComplianceBadge results={complianceResults} /> }} />}
      analysis={<>{dataTab === 'section' && (
        <>

          <div className="flex justify-center">
            <PileCapCrossSection params={params} />
          </div>
        </>
      )}
        {dataTab === 'guide' && <PileCapExplain params={params} />}
        {dataTab === 'compliance' && <CompliancePanel results={complianceResults} />}
        {dataTab === 'weight' && <WeightCalc result={calcResult} />}
        {dataTab === 'concrete' && <ConcreteCalc result={concreteResult} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="pilecap" params={params} /></div>
        {dataTab === 'anchor' && <PileCapAnchorPanel params={params} />}
        {dataTab === 'compare' && (
          <div className="space-y-4">
            {compareParams ? (
              <MetricComparePanel
                metrics={compareMetrics}
                summary={{
                  title: '钢筋用量变化',
                  valueA: calcPileCap(compareParams).items.reduce((sum, item) => sum + item.weightKg, 0),
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
        componentType="pilecap"
        currentParams={params}
        onApplyParams={(p) => update(p as Partial<PileCapParams>)}
        context={aiContext}
        notationSlot={<PileCapExplain params={params} />}
        initialMessage={aiMessage}
        onSwitchTab={(tab) => setDataTab(tab as typeof dataTab)}
        onNavigateComponent={(type: ComponentType, message?: string) => {
          const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
          router.push(`/${type}${encoded}`);
        }}
        onApplyPreset={(preset) => {
          if (preset in PILECAP_PRESETS) applyPreset(preset as keyof typeof PILECAP_PRESETS);
        }}
        onGetCurrentState={() => aiContext}
        onRunComplianceCheck={() => ({
          results: complianceResults,
          summary: `校验完成: ${complianceResults.filter(r => r.status === 'pass').length}项通过, ${complianceResults.filter(r => r.status === 'fail').length}项不通过, ${complianceResults.filter(r => r.status === 'warn').length}项警告`,
        })}
        onSaveFavorite={(name, note) => addToFavorites(params, name, note)}
        onResetParams={() => setParams({ ...PILECAP_PRESETS.fourPile })}
      /> : undefined}
      onAssistantToggle={() => setShowAI(value => !value)}
    />
  );
}
