'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { ColumnParams } from '@/lib/types';
import { COLUMN_PRESETS } from '@/lib/rebar';
import { calcColumn } from '@/lib/calc';
import { decodeShareParams } from '@/lib/useShareUrl';
import { validateRebar, validateStirrup, validateDimension } from '@/lib/validate';
import { ColumnCrossSection } from '@/components/CrossSection';
import { ColumnExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import { AISidebar } from '@/components/AISidebar';
import { buildColumnContext } from '@/lib/ai-context';
import { Sparkles } from 'lucide-react';

const DATA_TABS = [
  { key: 'section', label: '截面图' },
  { key: 'weight', label: '用量估算' },
] as const;

const ColumnViewer = dynamic(() => import('@/components/ColumnViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '简单柱', dot: 'bg-blue-400' },
  { key: 'standard', label: '标准柱', dot: 'bg-green-400' },
] as const;

const DEFAULT = { ...COLUMN_PRESETS.standard };

export function ColumnPageClient() {
  const [params, setParams] = useState<ColumnParams>(DEFAULT);
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const [showCut, setShowCut] = useState(false);
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    const shared = decodeShareParams<ColumnParams>(window.location.search);
    if (shared && shared.b && shared.h) setParams(shared);
  }, []);

  const update = (patch: Partial<ColumnParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcColumn(params), [params]);
  const aiContext = useMemo(() => buildColumnContext(params), [params]);

  const errors = useMemo(() => ({
    b: validateDimension(params.b, 'b', 200, 1200),
    h: validateDimension(params.h, 'h', 200, 1200),
    main: validateRebar(params.main, 'main'),
    stirrup: validateStirrup(params.stirrup, 'stirrup'),
  }), [params]);

  return (
    <main className="px-4 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 左栏：参数输入 */}
        <div className="lg:col-span-3 space-y-4 lg:sticky lg:top-[60px] lg:max-h-[calc(100vh-76px)] lg:overflow-y-auto lg:scrollbar-thin">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-primary">参数输入</h2>
              <div className="flex items-center gap-2">
                <ResetButton onClick={() => setParams(DEFAULT)} />
                <ShareButton params={params} />
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-muted mb-2 block">快速示例</label>
              <div className="flex flex-wrap gap-1.5">
                {presetList.map(({ key, label, dot }) => (
                  <button key={key} onClick={() => setParams({ ...COLUMN_PRESETS[key] })}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-white hover:shadow-sm active:scale-95">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Field label="柱编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="截面宽 b (mm)" value={params.b} onChange={v => update({ b: v })} error={errors.b?.message} min={200} max={1200} />
              <NumField label="截面高 h (mm)" value={params.h} onChange={v => update({ h: v })} error={errors.h?.message} min={200} max={1200} />
              <Field label="全部纵筋" value={params.main} onChange={v => update({ main: v })} placeholder="如: 12C25" error={errors.main?.message} />
              <Field label="箍筋" value={params.stirrup} onChange={v => update({ stirrup: v })} placeholder="如: A10@100/200(4)" error={errors.stirrup?.message} />
            </div>

            <Section title="材料与构造">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as any })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as any })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
              <NumField label="柱净高 (mm)" value={params.height} onChange={v => update({ height: v })} min={1000} max={10000} />
            </Section>
          </div>

          <Legend items={[
            { color: '#C0392B', label: '纵向受力钢筋' },
            { color: '#27AE60', label: '箍筋' },
            { color: '#BDC3C7', label: '混凝土截面（半透明）', opacity: 0.6 },
          ]} />
        </div>

        {/* 中栏：3D模型 + 数据 tab */}
        <div className={`${showAI ? 'lg:col-span-6' : 'lg:col-span-9'} space-y-4 min-w-0 transition-all`}>
          <ColumnViewer params={params} cutPosition={cutPosition} showCut={showCut}
            onCutPositionChange={setCutPosition} onShowCutChange={setShowCut} />
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100">
              <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5">
                {DATA_TABS.map(t => (
                  <button key={t.key} onClick={() => setDataTab(t.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${dataTab === t.key ? 'bg-white text-accent shadow-sm' : 'text-muted hover:text-primary'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowAI(a => !a)}
                className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${showAI ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white shadow-md shadow-blue-500/20' : 'bg-gradient-to-r from-blue-50 to-violet-50 text-violet-600 hover:from-blue-100 hover:to-violet-100'}`}>
                <Sparkles className="w-3.5 h-3.5" />
                AI 助手
              </button>
            </div>
            <div className="p-5">
              {dataTab === 'section' && (
                <>
                  <h2 className="text-sm font-semibold text-primary mb-3">
                    截面配筋示意
                    {showCut && <span className="text-xs font-normal text-muted ml-2">· 跟随剖切位置</span>}
                  </h2>
                  <div className="flex justify-center">
                    <ColumnCrossSection params={params} cutPosition={showCut ? cutPosition : undefined} />
                  </div>
                </>
              )}
              {dataTab === 'weight' && <WeightCalc result={calcResult} />}
            </div>
          </div>
        </div>

        {/* 右栏：AI 侧边栏（可收起） */}
        {showAI && (
          <div className="lg:col-span-3">
            <AISidebar
              componentType="column"
              currentParams={params}
              onApplyParams={(p) => update(p as Partial<ColumnParams>)}
              context={aiContext}
              notationSlot={<ColumnExplain params={params} />}
            />
          </div>
        )}
      </div>
    </main>
  );
}
