'use client';

import { CompliancePanel } from '@/components/CompliancePanel';
import { checkCompliance } from '@/lib/compliance';
import { FormworkCalc } from '@/components/FormworkCalc';

import { WorkbenchLayout, WorkbenchTabs } from '@/components/WorkbenchLayout';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { JointParams, ComponentType } from '@/lib/types';
import { JOINT_PRESETS } from '@/lib/rebar';
import { validateRebar, validateStirrup, validateDimension } from '@/lib/validate';
import { JointExplain } from '@/components/NotationExplain';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import type { ConcreteGrade, SeismicGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { buildJointContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';

const JointViewer = dynamic(() => import('@/components/JointViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'middleBent', label: '中间节点·弯锚', dot: 'bg-blue-400' },
  { key: 'middleStraight', label: '中间节点·直锚', dot: 'bg-green-400' },
  { key: 'side', label: '边节点·弯锚', dot: 'bg-purple-400' },
] as const;

const DEFAULT = { ...JOINT_PRESETS.middleBent };

export function JointPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [params, setParams] = useState<JointParams>(() => {
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<JointParams>>(p ?? undefined);
    if (shared && shared.colB) {
      return { ...DEFAULT, ...shared };
    }
    return DEFAULT;
  });
  const aiMessage = searchParams.get('ai') || undefined;
  const [dataTab, setDataTab] = useState<'guide' | 'formwork' | 'compliance'>('guide');
  const [showAI, setShowAI] = useState(!!aiMessage);

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
    <WorkbenchLayout
      title="节点配筋工作台"
      summary={<>梁 {params.beamB} × {params.beamH} mm<span>·</span>柱 {params.colB} × {params.colH} mm</>}
      actions={<ShareButton params={params} className="rv-button rv-share-button" />}
      inspector={
        <>
          <div className="rv-inspector-tools"><span>快速示例</span><ResetButton onClick={() => setParams(DEFAULT)} /></div>
          <div className="rv-parameter-form">
            <div className="mb-4">

              <div className="flex flex-wrap gap-1.5">
                {presetList.map(({ key, label, dot }) => (
                  <button key={key} onClick={() => setParams({ ...JOINT_PRESETS[key] })}
                    className="rv-preset-button">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
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
            </div>
            <Section title="材料与构造">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as SeismicGrade })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
            </Section>
            <Section title="柱参数" defaultOpen>
              <NumField label="柱宽 b (mm)" value={params.colB} onChange={v => update({ colB: v })} error={errors.colB?.message} min={200} max={1200} />
              <NumField label="柱高 h (mm)" value={params.colH} onChange={v => update({ colH: v })} error={errors.colH?.message} min={200} max={1200} />
              <Field label="柱纵筋" value={params.colMain} onChange={v => update({ colMain: v })} placeholder="如: 12C25" error={errors.colMain?.message} />
              <Field label="柱箍筋" value={params.colStirrup} onChange={v => update({ colStirrup: v })} placeholder="如: A10@100/200(4)" error={errors.colStirrup?.message} />
            </Section>
            <Section title="梁参数" defaultOpen>
              <NumField label="梁宽 b (mm)" value={params.beamB} onChange={v => update({ beamB: v })} error={errors.beamB?.message} min={150} max={800} />
              <NumField label="梁高 h (mm)" value={params.beamH} onChange={v => update({ beamH: v })} error={errors.beamH?.message} min={200} max={1200} />
              <Field label="梁上部筋" value={params.beamTop} onChange={v => update({ beamTop: v })} placeholder="如: 4C25" error={errors.beamTop?.message} />
              <Field label="梁下部筋" value={params.beamBottom} onChange={v => update({ beamBottom: v })} placeholder="如: 4C25" error={errors.beamBottom?.message} />
              <Field label="梁箍筋" value={params.beamStirrup} onChange={v => update({ beamStirrup: v })} placeholder="如: A8@100/200(2)" error={errors.beamStirrup?.message} />
            </Section></div><Section title="图例说明"><Legend items={[
              { color: '#C0392B', label: '柱纵筋 / 梁上部筋' },
              { color: '#2980B9', label: '梁下部筋' },
              { color: '#E67E22', label: '节点区箍筋（加密）' },
              { color: '#27AE60', label: '梁箍筋 / 柱箍筋' },
              { color: '#BDC3C7', label: '混凝土（半透明）', opacity: 0.6 },
            ]} /></Section>
        </>}
      viewer={<JointViewer params={params} />}
      analysisTabs={<WorkbenchTabs tabs={[{ key: "guide", label: "识图说明" }, { key: "formwork", label: "模板量" }, { key: "compliance", label: "构造检查" }]} active={dataTab} onChange={setDataTab} />}
      analysis={<>
        {dataTab === 'guide' && <JointExplain params={params} />}
        {dataTab === 'compliance' && <CompliancePanel results={checkCompliance('joint', params)} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="joint" params={params} /></div>
      </>}
      assistant={showAI ? <AISidebar
        componentType="joint"
        currentParams={params}
        onApplyParams={(p) => update(p as Partial<JointParams>)}
        context={aiContext}
        notationSlot={<JointExplain params={params} />}
        initialMessage={aiMessage}
        onNavigateComponent={(type: ComponentType, message?: string) => {
          const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
          router.push(`/${type}${encoded}`);
        }}
        onApplyPreset={(preset) => {
          if (preset in JOINT_PRESETS) setParams({ ...JOINT_PRESETS[preset as keyof typeof JOINT_PRESETS] });
        }}
        onGetCurrentState={() => aiContext}
        onResetParams={() => setParams({ ...JOINT_PRESETS.middleBent })}
      /> : undefined}
      onAssistantToggle={() => setShowAI(value => !value)}
    />
  );
}
