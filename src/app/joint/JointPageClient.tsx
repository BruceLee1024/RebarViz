'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { JointParams } from '@/lib/types';
import { JOINT_PRESETS } from '@/lib/rebar';
import { decodeShareParams } from '@/lib/useShareUrl';
import { validateRebar, validateStirrup, validateDimension } from '@/lib/validate';
import { JointExplain } from '@/components/NotationExplain';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import { AIChat } from '@/components/AIChat';
import { buildJointContext } from '@/lib/ai-context';

const JointViewer = dynamic(() => import('@/components/JointViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'middleBent', label: '中间节点·弯锚', color: 'bg-blue-50 text-blue-700' },
  { key: 'middleStraight', label: '中间节点·直锚', color: 'bg-green-50 text-green-700' },
  { key: 'side', label: '边节点·弯锚', color: 'bg-purple-50 text-purple-700' },
] as const;

const DEFAULT = { ...JOINT_PRESETS.middleBent };

export function JointPageClient() {
  const [params, setParams] = useState<JointParams>(DEFAULT);

  useEffect(() => {
    const shared = decodeShareParams<JointParams>(window.location.search);
    if (shared && shared.colB) setParams(shared);
  }, []);

  const update = (patch: Partial<JointParams>) => setParams(p => ({ ...p, ...patch }));
  const aiContext = useMemo(() => buildJointContext(params), [params]);

  const errors = useMemo(() => ({
    colB: validateDimension(params.colB, 'colB', 200, 1200),
    colH: validateDimension(params.colH, 'colH', 200, 1200),
    colMain: validateRebar(params.colMain, 'colMain'),
    colStirrup: validateStirrup(params.colStirrup, 'colStirrup'),
    beamB: validateDimension(params.beamB, 'beamB', 150, 800),
    beamH: validateDimension(params.beamH, 'beamH', 200, 1200),
    beamTop: validateRebar(params.beamTop, 'beamTop'),
    beamBottom: validateRebar(params.beamBottom, 'beamBottom'),
    beamStirrup: validateStirrup(params.beamStirrup, 'beamStirrup'),
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
                  <button key={key} onClick={() => setParams({ ...JOINT_PRESETS[key] })}
                    className={`px-2 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors hover:opacity-80 ${color}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted mb-1 block">节点类型</label>
                <div className="flex gap-2">
                  {(['middle', 'side'] as const).map(t => (
                    <button key={t} onClick={() => update({ jointType: t })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${params.jointType === t ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {t === 'middle' ? '中间节点' : '边节点'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">锚固方式</label>
                <div className="flex gap-2">
                  {(['bent', 'straight'] as const).map(t => (
                    <button key={t} onClick={() => update({ anchorType: t })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${params.anchorType === t ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {t === 'bent' ? '弯锚' : '直锚'}
                    </button>
                  ))}
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
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-2">柱参数</p>
                <div className="space-y-3">
                  <NumField label="柱宽 b (mm)" value={params.colB} onChange={v => update({ colB: v })} error={errors.colB?.message} min={200} max={1200} />
                  <NumField label="柱高 h (mm)" value={params.colH} onChange={v => update({ colH: v })} error={errors.colH?.message} min={200} max={1200} />
                  <Field label="柱纵筋" value={params.colMain} onChange={v => update({ colMain: v })} placeholder="如: 12C25" error={errors.colMain?.message} />
                  <Field label="柱箍筋" value={params.colStirrup} onChange={v => update({ colStirrup: v })} placeholder="如: A10@100/200(4)" error={errors.colStirrup?.message} />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-primary mb-2">梁参数</p>
                <div className="space-y-3">
                  <NumField label="梁宽 b (mm)" value={params.beamB} onChange={v => update({ beamB: v })} error={errors.beamB?.message} min={150} max={800} />
                  <NumField label="梁高 h (mm)" value={params.beamH} onChange={v => update({ beamH: v })} error={errors.beamH?.message} min={200} max={1200} />
                  <Field label="梁上部筋" value={params.beamTop} onChange={v => update({ beamTop: v })} placeholder="如: 4C25" error={errors.beamTop?.message} />
                  <Field label="梁下部筋" value={params.beamBottom} onChange={v => update({ beamBottom: v })} placeholder="如: 4C25" error={errors.beamBottom?.message} />
                  <Field label="梁箍筋" value={params.beamStirrup} onChange={v => update({ beamStirrup: v })} placeholder="如: A8@100/200(2)" error={errors.beamStirrup?.message} />
                </div>
              </div>
            </div>
          </div>

          <Legend items={[
            { color: '#C0392B', label: '柱纵筋 / 梁上部筋' },
            { color: '#2980B9', label: '梁下部筋' },
            { color: '#E67E22', label: '节点区箍筋（加密）' },
            { color: '#27AE60', label: '梁箍筋 / 柱箍筋' },
            { color: '#BDC3C7', label: '混凝土（半透明）', opacity: 0.6 },
          ]} />
        </div>

        {/* 中栏：3D模型 */}
        <div className="lg:col-span-7 min-w-0">
          <JointViewer params={params} />
        </div>

        {/* 右栏：构造解读 */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-primary mb-3">构造解读</h2>
            <JointExplain params={params} />
          </div>
        </div>
      </div>
      <AIChat context={aiContext} />
    </main>
  );
}
