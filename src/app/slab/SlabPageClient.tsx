'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { SlabParams } from '@/lib/types';
import { SLAB_PRESETS } from '@/lib/rebar';
import { calcSlab } from '@/lib/calc';
import { decodeShareParams } from '@/lib/useShareUrl';
import { validateSlabRebar, validateDimension } from '@/lib/validate';
import { SlabCrossSection } from '@/components/CrossSection';
import { SlabExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES } from '@/lib/anchor';
import { AIChat } from '@/components/AIChat';
import { buildSlabContext } from '@/lib/ai-context';

const SlabViewer = dynamic(() => import('@/components/SlabViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '薄板 120mm', color: 'bg-blue-50 text-blue-700' },
  { key: 'standard', label: '标准板 150mm', color: 'bg-green-50 text-green-700' },
  { key: 'thick', label: '厚板 200mm', color: 'bg-purple-50 text-purple-700' },
] as const;

const DEFAULT = { ...SLAB_PRESETS.standard };

export function SlabPageClient() {
  const [params, setParams] = useState<SlabParams>(DEFAULT);

  useEffect(() => {
    const shared = decodeShareParams<SlabParams>(window.location.search);
    if (shared && shared.thickness) setParams(shared);
  }, []);

  const update = (patch: Partial<SlabParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcSlab(params), [params]);
  const aiContext = useMemo(() => buildSlabContext(params), [params]);

  const errors = useMemo(() => ({
    thickness: validateDimension(params.thickness, 'thickness', 60, 400),
    bottomX: validateSlabRebar(params.bottomX, 'bottomX'),
    bottomY: validateSlabRebar(params.bottomY, 'bottomY'),
    topX: params.topX ? validateSlabRebar(params.topX, 'topX') : null,
    topY: params.topY ? validateSlabRebar(params.topY, 'topY') : null,
    distribution: validateSlabRebar(params.distribution, 'distribution'),
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
                  <button key={key} onClick={() => setParams({ ...SLAB_PRESETS[key] })}
                    className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors hover:opacity-80 ${color}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Field label="板编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="板厚 (mm)" value={params.thickness} onChange={v => update({ thickness: v })} error={errors.thickness?.message} min={60} max={400} />

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-2">材料与构造</p>
                <div className="space-y-3">
                  <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as any })}
                    options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
                  <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={10} max={30} />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-2">底筋</p>
                <div className="space-y-3">
                  <Field label="X向底筋" value={params.bottomX} onChange={v => update({ bottomX: v })} placeholder="如: C12@150" error={errors.bottomX?.message} />
                  <Field label="Y向底筋" value={params.bottomY} onChange={v => update({ bottomY: v })} placeholder="如: C10@200" error={errors.bottomY?.message} />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-1">面筋</p>
                <p className="text-[11px] text-muted mb-2">留空表示无面筋</p>
                <div className="space-y-3">
                  <Field label="X向面筋" value={params.topX} onChange={v => update({ topX: v })} placeholder="如: C10@200" error={errors.topX?.message} />
                  <Field label="Y向面筋" value={params.topY} onChange={v => update({ topY: v })} placeholder="如: C10@200" error={errors.topY?.message} />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <Field label="分布筋" value={params.distribution} onChange={v => update({ distribution: v })} placeholder="如: A6@250" error={errors.distribution?.message} />
              </div>
            </div>
          </div>

          <Legend items={[
            { color: '#C0392B', label: 'X向底筋' },
            { color: '#E67E22', label: 'Y向底筋' },
            { color: '#8E44AD', label: 'X向面筋' },
            { color: '#7D3C98', label: 'Y向面筋' },
            { color: '#BDC3C7', label: '混凝土板（半透明）', opacity: 0.6 },
          ]} />
        </div>

        {/* 中栏：3D模型 + 截面 + 用量 */}
        <div className="lg:col-span-7 space-y-4 min-w-0">
          <SlabViewer params={params} />
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-primary mb-3">截面配筋示意</h2>
            <div className="flex justify-center">
              <SlabCrossSection params={params} />
            </div>
          </div>
          <WeightCalc result={calcResult} />
        </div>

        {/* 右栏：标注解读 */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-primary mb-3">标注解读</h2>
            <SlabExplain params={params} />
          </div>
        </div>
      </div>
      <AIChat context={aiContext} />
    </main>
  );
}
