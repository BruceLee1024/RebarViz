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
import { Field, NumField, Legend, ResetButton, SelectField } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import { AIChat } from '@/components/AIChat';
import { buildColumnContext } from '@/lib/ai-context';

const ColumnViewer = dynamic(() => import('@/components/ColumnViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '简单柱', color: 'bg-blue-50 text-blue-700' },
  { key: 'standard', label: '标准柱', color: 'bg-green-50 text-green-700' },
] as const;

const DEFAULT = { ...COLUMN_PRESETS.standard };

export function ColumnPageClient() {
  const [params, setParams] = useState<ColumnParams>(DEFAULT);
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const [showCut, setShowCut] = useState(false);

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
        <div className="lg:col-span-2 space-y-4">
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
              <div className="flex flex-wrap gap-2">
                {presetList.map(({ key, label, color }) => (
                  <button key={key} onClick={() => setParams({ ...COLUMN_PRESETS[key] })}
                    className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors hover:opacity-80 ${color}`}>
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

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-2">材料与构造</p>
                <div className="space-y-3">
                  <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as any })}
                    options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
                  <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as any })}
                    options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
                  <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
                  <NumField label="柱净高 (mm)" value={params.height} onChange={v => update({ height: v })} min={1000} max={10000} />
                </div>
              </div>
            </div>
          </div>

          <Legend items={[
            { color: '#C0392B', label: '纵向受力钢筋' },
            { color: '#27AE60', label: '箍筋' },
            { color: '#BDC3C7', label: '混凝土截面（半透明）', opacity: 0.6 },
          ]} />
        </div>

        {/* 中栏：3D模型 + 截面 + 用量 */}
        <div className="lg:col-span-7 space-y-4 min-w-0">
          <ColumnViewer params={params} cutPosition={cutPosition} showCut={showCut}
            onCutPositionChange={setCutPosition} onShowCutChange={setShowCut} />
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-primary mb-3">
              截面配筋示意
              {showCut && <span className="text-xs font-normal text-muted ml-2">· 跟随剖切位置</span>}
            </h2>
            <div className="flex justify-center">
              <ColumnCrossSection params={params} cutPosition={showCut ? cutPosition : undefined} />
            </div>
          </div>
          <WeightCalc result={calcResult} />
        </div>

        {/* 右栏：标注解读 */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-primary mb-3">标注解读</h2>
            <ColumnExplain params={params} />
          </div>
        </div>
      </div>
      <AIChat context={aiContext} />
    </main>
  );
}
