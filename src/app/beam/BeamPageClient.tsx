'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { BeamParams, HaunchType } from '@/lib/types';
import { BEAM_PRESETS } from '@/lib/rebar';
import { calcBeam, calcBeamRebarRatios } from '@/lib/calc';
import { decodeShareParams } from '@/lib/useShareUrl';
import { validateRebar, validateStirrup, validateDimension } from '@/lib/validate';
import { BeamCrossSection } from '@/components/CrossSection';
import { BeamExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { BarBendingSchedule } from '@/components/BarBendingSchedule';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import { AISidebar } from '@/components/AISidebar';
import { RebarRatioCard } from '@/components/RebarRatioCard';
import { buildBeamContext } from '@/lib/ai-context';
import { Sparkles } from 'lucide-react';

const DATA_TABS = [
  { key: 'section', label: '截面图' },
  { key: 'ratio', label: '配筋率' },
  { key: 'weight', label: '用量估算' },
  { key: 'bbs', label: '弯折详图' },
] as const;

const BeamViewer = dynamic(() => import('@/components/BeamViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '简单梁', dot: 'bg-blue-400' },
  { key: 'standard', label: '标准梁', dot: 'bg-green-400' },
  { key: 'complex', label: '复杂梁', dot: 'bg-purple-400' },
  { key: 'haunchH', label: '水平加腘', dot: 'bg-orange-400' },
  { key: 'haunchV', label: '竖向加腘', dot: 'bg-cyan-400' },
  { key: 'multiSpan', label: '多跨连续梁', dot: 'bg-rose-400' },
] as const;

const DEFAULT = { ...BEAM_PRESETS.standard };

export function BeamPageClient() {
  const [params, setParams] = useState<BeamParams>(DEFAULT);
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const [showCut, setShowCut] = useState(false);
  useEffect(() => {
    const shared = decodeShareParams<BeamParams>(window.location.search);
    if (shared && shared.b && shared.h) {
      setParams(shared);
    }
  }, []);

  const update = (patch: Partial<BeamParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcBeam(params), [params]);
  const ratioResult = useMemo(() => calcBeamRebarRatios(params), [params]);
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

  const handleAIApply = (p: Partial<BeamParams>) => {
    update(p);
  };

  const handlePreset = (key: keyof typeof BEAM_PRESETS) => {
    setParams({ ...BEAM_PRESETS[key] });
  };
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const [showAI, setShowAI] = useState(false);

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
                  <button key={key} onClick={() => handlePreset(key)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-white hover:shadow-sm active:scale-95">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Field label="梁编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="截面宽 b (mm)" value={params.b} onChange={v => update({ b: v })} error={errors.b?.message} min={100} max={1000} />
              <NumField label="截面高 h (mm)" value={params.h} onChange={v => update({ h: v })} error={errors.h?.message} min={200} max={1500} />
            </div>

            <Section title="集中标注" defaultOpen>
              <Field label="上部通长筋" value={params.top} onChange={v => update({ top: v })} placeholder="如: 2C25" error={errors.top?.message} />
              <Field label="下部通长筋" value={params.bottom} onChange={v => update({ bottom: v })} placeholder="如: 4C25" error={errors.bottom?.message} />
              <Field label="箍筋" value={params.stirrup} onChange={v => update({ stirrup: v })} placeholder="如: A8@100/200(2)" error={errors.stirrup?.message} />
            </Section>

            <Section title="材料与构造">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as any })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as any })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
              <NumField label="梁净跨 (mm)" value={params.spanLength} onChange={v => update({ spanLength: v })} min={1000} max={15000} />
              <NumField label="柱截面宽度 hc (mm)" value={params.hc} onChange={v => update({ hc: v })} min={200} max={1200} />
              <NumField label="跨数" value={params.spanCount || 1} onChange={v => update({ spanCount: v })} min={1} max={6} />
            </Section>

            <Section title="原位标注（支座负筋）">
              <p className="text-[11px] text-muted -mt-1">留空表示无支座负筋，第二排伸入跨内 ln/4</p>
              <Field label="左支座负筋" value={params.leftSupport || ''} onChange={v => update({ leftSupport: v })} placeholder="如: 2C25" error={errors.leftSupport?.message} />
              {params.leftSupport && (
                <Field label="左支座(二排)" value={params.leftSupport2 || ''} onChange={v => update({ leftSupport2: v || undefined })} placeholder="如: 2C25（留空=无二排）" error={errors.leftSupport2?.message} />
              )}
              <Field label="右支座负筋" value={params.rightSupport || ''} onChange={v => update({ rightSupport: v })} placeholder="如: 4C25" error={errors.rightSupport?.message} />
              {params.rightSupport && (
                <Field label="右支座(二排)" value={params.rightSupport2 || ''} onChange={v => update({ rightSupport2: v || undefined })} placeholder="如: 2C25（留空=无二排）" error={errors.rightSupport2?.message} />
              )}
            </Section>

            <Section title="腰筋/抗扭筋">
              <p className="text-[11px] text-muted -mt-1">G前缀=构造腰筋，N前缀=抗扭筋，留空表示无</p>
              <Field label="腰筋/抗扭筋" value={params.sideBar || ''} onChange={v => update({ sideBar: v || undefined })} placeholder="如: G4C12 或 N2C16" />
              {params.sideBar && (
                <Field label="拉筋" value={params.tieBar || ''} onChange={v => update({ tieBar: v || undefined })} placeholder="如: A6（留空自动确定）" />
              )}
            </Section>
            <Section title="加腋 (22G101 2-36)">
              <SelectField label="加腋类型" value={params.haunchType} onChange={v => update({ haunchType: v as HaunchType })}
                options={[
                  { value: 'none', label: '无加腋' },
                  { value: 'horizontal', label: '水平加腋' },
                  { value: 'vertical', label: '竖向加腋' },
                ]} />
              {params.haunchType !== 'none' && (
                <>
                  <NumField label="加腋长度 c₁ (mm)" value={params.haunchLength} onChange={v => update({ haunchLength: v })} min={200} max={2000} />
                  <NumField label={params.haunchType === 'horizontal' ? '加腋高度 (mm)' : '加腋宽度 (mm)'} value={params.haunchHeight} onChange={v => update({ haunchHeight: v })} min={100} max={800} />
                  <SelectField label="加腋位置" value={params.haunchSide} onChange={v => update({ haunchSide: v as 'both' | 'left' | 'right' })}
                    options={[
                      { value: 'both', label: '两端加腋' },
                      { value: 'left', label: '仅左端' },
                      { value: 'right', label: '仅右端' },
                    ]} />
                </>
              )}
            </Section>
          </div>

          <Legend items={[
            { color: '#C0392B', label: '纵向受力钢筋（通长筋）' },
            { color: '#8E44AD', label: '支座负筋（原位标注）' },
            { color: '#F39C12', label: '架立筋' },
            { color: '#27AE60', label: '箍筋' },
            ...(params.sideBar ? [
              { color: '#2980B9', label: '腰筋/抗扭筋' },
              { color: '#1ABC9C', label: '拉筋' },
            ] : []),
            { color: '#7F8C8D', label: '柱截面（hc）', opacity: 0.3 },
            { color: '#BDC3C7', label: '混凝土截面（半透明）', opacity: 0.6 },
            ...(params.haunchType !== 'none' ? [
              { color: '#A0AEC0', label: '加腋混凝土', opacity: 0.4 },
              { color: '#E67E22', label: '加腋附加筋' },
            ] : []),
          ]} />
        </div>

        {/* 中栏：3D模型 + 数据 tab */}
        <div className={`${showAI ? 'lg:col-span-6' : 'lg:col-span-9'} space-y-4 min-w-0 transition-all`}>
          <BeamViewer params={params} cutPosition={cutPosition} showCut={showCut}
            onCutPositionChange={setCutPosition} onShowCutChange={setShowCut} />

          {/* Data tabs */}
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
              {/* AI toggle */}
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
                    <BeamCrossSection params={params} cutPosition={showCut ? cutPosition : undefined} />
                  </div>
                </>
              )}
              {dataTab === 'ratio' && <RebarRatioCard ratios={ratioResult} />}
              {dataTab === 'weight' && <WeightCalc result={calcResult} beamId={params.id} />}
              {dataTab === 'bbs' && <BarBendingSchedule params={params} />}
            </div>
          </div>
        </div>

        {/* 右栏：AI 侧边栏（可收起） */}
        {showAI && (
          <div className="lg:col-span-3">
            <AISidebar
              componentType="beam"
              currentParams={params}
              onApplyParams={(p) => handleAIApply(p as Partial<BeamParams>)}
              context={aiContext}
              notationSlot={<BeamExplain params={params} />}
            />
          </div>
        )}
      </div>
    </main>
  );
}
