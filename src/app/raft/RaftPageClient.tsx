'use client';

import type { BeamWorkspacePageProps } from '@/lib/beam-workspace';

import { BeamEntryLink } from '@/components/BeamEntryLink';

import { FormworkCalc } from '@/components/FormworkCalc';

import { WorkbenchLayout, WorkbenchTabs } from '@/components/WorkbenchLayout';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { RaftFoundationParams, ComponentType, RebarCrossOrder } from '@/lib/types';
import { RAFT_PRESETS } from '@/lib/rebar';
import { calcRaft } from '@/lib/calc';
import { RaftCrossSection } from '@/components/CrossSection';
import { RaftExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ConcreteCalc } from '@/components/ConcreteCalc';
import { calcRaftConcrete } from '@/lib/calc-concrete';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import type { ConcreteGrade, SeismicGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { buildRaftContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';
import { RaftAnchorPanel } from '@/components/RaftAnchorPanel';
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

const RaftViewer = dynamic(() => import('@/components/RaftViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'small', label: '小型平板式', dot: 'bg-blue-400' },
  { key: 'standard', label: '标准平板式', dot: 'bg-green-400' },
  { key: 'large', label: '大型平板式', dot: 'bg-orange-400' },
  { key: 'beamSlab', label: '梁板式示例', dot: 'bg-blue-600' },
  { key: 'flatPlate', label: '板带式示例', dot: 'bg-amber-500' },
] as const;

const DEFAULT: RaftFoundationParams = {
  ...RAFT_PRESETS.standard,
};

export function RaftPageClient({ initialParams, workspaceDefaults, onParamsChange, workspaceTitle }: BeamWorkspacePageProps<RaftFoundationParams> = {}) {
  const defaults = workspaceDefaults ?? DEFAULT;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [params, setParams] = useState<RaftFoundationParams>(() => {
    if (initialParams) return initialParams;
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<RaftFoundationParams>>(p ?? undefined);
    if (shared && shared.lx && shared.ly) {
      return { ...defaults, ...shared };
    }
    return defaults;
  });
  useEffect(() => { onParamsChange?.(params); }, [params, onParamsChange]);
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const aiMessage = searchParams.get('ai') || undefined;
  const [showAI, setShowAI] = useState(!!aiMessage);

  const update = (patch: Partial<RaftFoundationParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcRaft(params), [params]);
  const concreteResult = useMemo(() => calcRaftConcrete(params), [params]);
  const complianceResults = useMemo(() => checkCompliance('raft', params), [params]);
  const aiContext = useMemo(() => buildRaftContext(params), [params]);

  const {
    history,
    favorites,
    addToHistory,
    addToFavorites,
    removeFromFavorites,
    removeFromHistory,
    clearHistory,
    isFavorite,
  } = useHistory<RaftFoundationParams>('raft');

  useEffect(() => {
    const timer = setTimeout(() => addToHistory(params, params.id), 2000);
    return () => clearTimeout(timer);
  }, [params, addToHistory]);

  const [compareParams, setCompareParams] = useState<RaftFoundationParams | null>(null);
  const [compareLabel, setCompareLabel] = useState('历史方案');

  const applyPreset = (key: keyof typeof RAFT_PRESETS) => {
    const preset = RAFT_PRESETS[key];
    setParams({ ...preset });
  };

  const handleSelectHistory = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) setParams(item.params as RaftFoundationParams);
  };

  const handleSelectForCompare = (id: string, fromFavorites: boolean) => {
    const list = fromFavorites ? favorites : history;
    const item = list.find(i => i.id === id);
    if (item) {
      setCompareParams(item.params as RaftFoundationParams);
      setCompareLabel(item.name);
      setDataTab('compare');
    }
  };

  const compareMetrics = useMemo(() => {
    if (!compareParams) return [];
    return [
      metricFromText('筏基类型', compareParams.raftType, params.raftType),
      metricFromNumber('X向长度', compareParams.lx, params.lx, 'mm'),
      metricFromNumber('Y向宽度', compareParams.ly, params.ly, 'mm'),
      metricFromNumber('板厚', compareParams.h, params.h, 'mm'),
      metricFromText('X向底筋', compareParams.bottomBarX, params.bottomBarX),
      metricFromText('Y向底筋', compareParams.bottomBarY, params.bottomBarY),
      metricFromText('X向面筋', compareParams.topBarX, params.topBarX),
      metricFromText('Y向面筋', compareParams.topBarY, params.topBarY),
      metricFromNumber('X向柱数', compareParams.colCountX, params.colCountX),
      metricFromNumber('Y向柱数', compareParams.colCountY, params.colCountY),
      metricFromNumber('X向柱距', compareParams.colSpacingX, params.colSpacingX, 'mm'),
      metricFromNumber('Y向柱距', compareParams.colSpacingY, params.colSpacingY, 'mm'),
      metricFromNumber('钢筋总用量', Number(calcRaft(compareParams).items.reduce((sum, item) => sum + item.weightKg, 0).toFixed(1)), Number(calcResult.items.reduce((sum, item) => sum + item.weightKg, 0).toFixed(1)), 'kg'),
      metricFromNumber('混凝土总量', Number(calcRaftConcrete(compareParams).totalVolume.toFixed(3)), Number(concreteResult.totalVolume.toFixed(3)), 'm³'),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [compareParams, params, calcResult.items, concreteResult.totalVolume]);

  const beamEditor0 = params.raftType === 'beamSlab' && (
              <Section title="基础主梁 JL 参数 (22G101-3 §4)" defaultOpen={!!workspaceTitle}>
                <NumField label="梁宽 bw (mm)" value={params.beamB ?? 600} onChange={v => update({ beamB: v })} min={300} max={1500} />
                <NumField label="梁高 hw (mm)" value={params.beamH ?? 900} onChange={v => update({ beamH: v })} min={400} max={2500} />
                <div>
                  <label className="text-xs text-muted mb-1.5 block">梁板位置关系</label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { val: 'low', label: '低板位' },
                      { val: 'mid', label: '中板位' },
                      { val: 'high', label: '高板位' },
                    ] as const).map(({ val, label }) => (
                      <button key={val} onClick={() => update({ beamPosition: val })}
                        className={`py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${(params.beamPosition ?? 'low') === val
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                          }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted mt-1">
                    {(params.beamPosition ?? 'low') === 'low' && '梁底与板底齐平，梁向上凸出'}
                    {params.beamPosition === 'high' && '梁顶与板顶齐平，梁向下凸出'}
                    {params.beamPosition === 'mid' && '板在梁高度中部'}
                  </p>
                </div>
                <Field label="底部贯通纵筋 (B)" value={params.beamBottom ?? '4C25'} onChange={v => update({ beamBottom: v })} placeholder="如: 4C25" />
                <Field label="顶部贯通纵筋 (T)" value={params.beamTop ?? '6C25'} onChange={v => update({ beamTop: v })} placeholder="如: 6C25" />
                <Field label="箍筋" value={params.beamStirrup ?? 'A10@150(4)'} onChange={v => update({ beamStirrup: v })} placeholder="如: A10@150(4)" />
              </Section>
            );

  return (
    <WorkbenchLayout
      title={workspaceTitle ?? "筏板配筋工作台"}
      summary={<>{params.id}<span>·</span>筏板基础</>}
      actions={<>{!workspaceTitle && params.raftType === 'beamSlab' && <BeamEntryLink params={params} system="raft" />}<ShareButton params={params} className="rv-button rv-share-button" /></>}
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
              <Field label="筏板编号" value={params.id} onChange={v => update({ id: v })} />

              {/* 筏基类型选择器 */}
              <div>
                <label className="text-xs text-muted mb-1.5 block">筏基类型 (22G101-3)</label>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { val: 'flat', label: '平板式' },
                    { val: 'beamSlab', label: '梁板式' },
                    { val: 'flatPlate', label: '板带式' },
                  ] as const).map(({ val, label }) => (
                    <button key={val} onClick={() => update({ raftType: val })}
                      className={`py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${params.raftType === val
                        ? 'bg-accent text-white border-accent shadow-sm'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}>
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted mt-1">
                  {params.raftType === 'flat' && '均匀平板，无基础棁'}
                  {params.raftType === 'beamSlab' && 'JL基础主棁 + LPB平板'}
                  {params.raftType === 'flatPlate' && 'ZXB柱下板带 + KZB跨中板带'}
                </p>
              </div>

              <NumField label="X 向长度 lx (mm)" value={params.lx} onChange={v => update({ lx: v })} min={3000} max={60000} />
              <NumField label="Y 向宽度 ly (mm)" value={params.ly} onChange={v => update({ ly: v })} min={3000} max={40000} />
              <NumField label="板厚 h (mm) (LPB平板厂)" value={params.h} onChange={v => update({ h: v })} min={300} max={2000} />
            </div>
            <Section title="底部配筋">
              <Field label="X向底筋" value={params.bottomBarX} onChange={v => update({ bottomBarX: v })} placeholder="如: C16@150" />
              <Field label="Y向底筋" value={params.bottomBarY} onChange={v => update({ bottomBarY: v })} placeholder="如: C16@150" />
              <SelectField
                label="底筋交叉上下关系"
                value={params.bottomCrossOrder ?? 'xBelowY'}
                onChange={v => update({ bottomCrossOrder: v as RebarCrossOrder })}
                options={[
                  { value: 'xBelowY', label: 'X向在下，Y向在上' },
                  { value: 'yBelowX', label: 'Y向在下，X向在上' },
                ]}
              />
            </Section>
            <Section title="顶部配筋">
              <Field label="X向面筋" value={params.topBarX} onChange={v => update({ topBarX: v })} placeholder="如: C12@200" />
              <Field label="Y向面筋" value={params.topBarY} onChange={v => update({ topBarY: v })} placeholder="如: C12@200" />
              <SelectField
                label="面筋交叉上下关系"
                value={params.topCrossOrder ?? 'xBelowY'}
                onChange={v => update({ topCrossOrder: v as RebarCrossOrder })}
                options={[
                  { value: 'xBelowY', label: 'X向在下，Y向在上' },
                  { value: 'yBelowX', label: 'Y向在下，X向在上' },
                ]}
              />
            </Section>
            <Section title="柱网参数">
              <NumField label="柱截面 X (mm)" value={params.colBx} onChange={v => update({ colBx: v })} min={200} max={1000} />
              <NumField label="柱截面 Y (mm)" value={params.colBy} onChange={v => update({ colBy: v })} min={200} max={1000} />
              <Field label="柱插筋" value={params.colMain} onChange={v => update({ colMain: v })} placeholder="如: 8C20" />
              <NumField label="X 向柱数" value={params.colCountX} onChange={v => update({ colCountX: v })} min={1} max={10} />
              <NumField label="Y 向柱数" value={params.colCountY} onChange={v => update({ colCountY: v })} min={1} max={10} />
              <NumField label="X 向柱距 (mm)" value={params.colSpacingX} onChange={v => update({ colSpacingX: v })} min={3000} max={12000} />
              <NumField label="Y 向柱距 (mm)" value={params.colSpacingY} onChange={v => update({ colSpacingY: v })} min={3000} max={12000} />
            </Section>
            {!workspaceTitle && beamEditor0}
            {params.raftType === 'flatPlate' && (
              <Section title="柱下板带 ZXB 参数 (22G101-3 §5)">
                <NumField label="ZXB 板带宽度 (mm)" value={params.colStripWidth ?? Math.round(Math.min(params.colSpacingX, params.colSpacingY) / 2)}
                  onChange={v => update({ colStripWidth: v })} min={500} max={8000} />
                <Field label="ZXB X向附加底筋" value={params.colStripBarX ?? 'C16@200'} onChange={v => update({ colStripBarX: v })} placeholder="如: C16@200" />
                <Field label="ZXB Y向附加底筋" value={params.colStripBarY ?? 'C16@200'} onChange={v => update({ colStripBarY: v })} placeholder="如: C16@200" />
                <p className="text-[10px] text-muted">KZB跨中板带配筋使用上方底部配筋区域指定即可</p>
              </Section>
            )}
            <Section title="材料">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as SeismicGrade })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={35} max={70} />
            </Section></div><Section title="图例说明"><Legend items={[
              { color: '#C0392B', label: 'X向底部钢筋' },
              { color: '#2980B9', label: 'Y向底部钢筋' },
              { color: '#E67E22', label: 'X向面筋' },
              { color: '#27AE60', label: 'Y向面筋' },
              { color: '#8E44AD', label: '柱插筋' },
              ...(params.raftType === 'beamSlab' ? [
                { color: '#C0392B', label: 'JL底部纵筋' },
                { color: '#E67E22', label: 'JL顶部纵筋' },
                { color: '#27AE60', label: 'JL箍筋' },
                { color: '#9EB6C8', label: 'JL基础梁混凝土', opacity: 0.55 },
              ] : []),
              ...(params.raftType === 'flatPlate' ? [
                { color: '#D35400', label: 'ZXB柱下板带附加筋' },
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
      viewer={<RaftViewer params={params} />}
      analysisTabs={<WorkbenchTabs tabs={DATA_TABS} active={dataTab} onChange={setDataTab} badges={{ compliance: <ComplianceBadge results={complianceResults} /> }} />}
      analysis={<>{dataTab === 'section' && (
        <>

          <div className="flex justify-center">
            <RaftCrossSection params={params} />
          </div>
        </>
      )}
        {dataTab === 'guide' && <RaftExplain params={params} />}
        {dataTab === 'compliance' && <CompliancePanel results={complianceResults} />}
        {dataTab === 'weight' && <WeightCalc result={calcResult} />}
        {dataTab === 'concrete' && <ConcreteCalc result={concreteResult} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="raft" params={params} /></div>
        {dataTab === 'anchor' && <RaftAnchorPanel params={params} />}
        {dataTab === 'compare' && (
          <div className="space-y-4">
            {compareParams ? (
              <MetricComparePanel
                metrics={compareMetrics}
                summary={{
                  title: '钢筋用量变化',
                  valueA: calcRaft(compareParams).items.reduce((sum, item) => sum + item.weightKg, 0),
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
        componentType="raft"
        currentParams={params}
        onApplyParams={(p) => update(p as Partial<RaftFoundationParams>)}
        context={aiContext}
        notationSlot={<RaftExplain params={params} />}
        initialMessage={aiMessage}
        onSwitchTab={(tab) => setDataTab(tab as typeof dataTab)}
        onNavigateComponent={(type: ComponentType, message?: string) => {
          const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
          router.push(`/${type}${encoded}`);
        }}
        onApplyPreset={(preset) => {
          if (preset in RAFT_PRESETS) applyPreset(preset as keyof typeof RAFT_PRESETS);
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
