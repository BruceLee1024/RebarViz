'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { BeamParams } from '@/lib/types';
import { BEAM_PRESETS } from '@/lib/rebar';
import { calcBeam } from '@/lib/calc';
import { decodeShareParams } from '@/lib/useShareUrl';
import { validateRebar, validateStirrup, validateDimension } from '@/lib/validate';
import { BeamCrossSection } from '@/components/CrossSection';
import { BeamExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import { AIChat } from '@/components/AIChat';
import { buildBeamContext } from '@/lib/ai-context';

const BeamViewer = dynamic(() => import('@/components/BeamViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '简单梁', color: 'bg-blue-50 text-blue-700' },
  { key: 'standard', label: '标准梁', color: 'bg-green-50 text-green-700' },
  { key: 'complex', label: '复杂梁', color: 'bg-purple-50 text-purple-700' },
] as const;

const DEFAULT = { ...BEAM_PRESETS.standard };

export function BeamPageClient() {
  const [params, setParams] = useState<BeamParams>(DEFAULT);
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const [showCut, setShowCut] = useState(false);

  useEffect(() => {
    const shared = decodeShareParams<BeamParams>(window.location.search);
    if (shared && shared.b && shared.h) setParams(shared);
  }, []);

  const update = (patch: Partial<BeamParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcBeam(params), [params]);
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
                  <button key={key} onClick={() => setParams({ ...BEAM_PRESETS[key] })}
                    className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors hover:opacity-80 ${color}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Field label="梁编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="截面宽 b (mm)" value={params.b} onChange={v => update({ b: v })} error={errors.b?.message} min={100} max={1000} />
              <NumField label="截面高 h (mm)" value={params.h} onChange={v => update({ h: v })} error={errors.h?.message} min={200} max={1500} />

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-2">集中标注</p>
                <div className="space-y-3">
                  <Field label="上部通长筋" value={params.top} onChange={v => update({ top: v })} placeholder="如: 2C25" error={errors.top?.message} />
                  <Field label="下部通长筋" value={params.bottom} onChange={v => update({ bottom: v })} placeholder="如: 4C25" error={errors.bottom?.message} />
                  <Field label="箍筋" value={params.stirrup} onChange={v => update({ stirrup: v })} placeholder="如: A8@100/200(2)" error={errors.stirrup?.message} />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-2">材料与构造</p>
                <div className="space-y-3">
                  <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as any })}
                    options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
                  <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as any })}
                    options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
                  <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
                  <NumField label="梁净跨 (mm)" value={params.spanLength} onChange={v => update({ spanLength: v })} min={1000} max={15000} />
                  <NumField label="柱截面宽度 hc (mm)" value={params.hc} onChange={v => update({ hc: v })} min={200} max={1200} />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-1">原位标注（支座负筋）</p>
                <p className="text-[11px] text-muted mb-2">留空表示无支座负筋</p>
                <div className="space-y-3">
                  <Field label="左支座负筋" value={params.leftSupport || ''} onChange={v => update({ leftSupport: v })} placeholder="如: 2C25" error={errors.leftSupport?.message} />
                  <Field label="右支座负筋" value={params.rightSupport || ''} onChange={v => update({ rightSupport: v })} placeholder="如: 4C25" error={errors.rightSupport?.message} />
                </div>
              </div>
            </div>
          </div>

          <Legend items={[
            { color: '#C0392B', label: '纵向受力钢筋（通长筋）' },
            { color: '#8E44AD', label: '支座负筋（原位标注）' },
            { color: '#F39C12', label: '架立筋' },
            { color: '#27AE60', label: '箍筋' },
            { color: '#7F8C8D', label: '柱截面（hc）', opacity: 0.3 },
            { color: '#BDC3C7', label: '混凝土截面（半透明）', opacity: 0.6 },
          ]} />
        </div>

        {/* 中栏：3D模型 + 截面 + 用量 */}
        <div className="lg:col-span-7 space-y-4 min-w-0">
          <BeamViewer params={params} cutPosition={cutPosition} showCut={showCut}
            onCutPositionChange={setCutPosition} onShowCutChange={setShowCut} />
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-primary mb-3">
              截面配筋示意
              {showCut && <span className="text-xs font-normal text-muted ml-2">· 跟随剖切位置</span>}
            </h2>
            <div className="flex justify-center">
              <BeamCrossSection params={params} cutPosition={showCut ? cutPosition : undefined} />
            </div>
          </div>
          <WeightCalc result={calcResult} />
        </div>

        {/* 右栏：标注解读 */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-primary mb-3">标注解读</h2>
            <BeamExplain params={params} />
          </div>
        </div>
      </div>
      <AIChat context={aiContext} />
    </main>
  );
}
