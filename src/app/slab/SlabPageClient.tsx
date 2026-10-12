'use client';

import { CompliancePanel } from '@/components/CompliancePanel';
import { checkCompliance } from '@/lib/compliance';

import { FormworkCalc } from '@/components/FormworkCalc';

import { WorkbenchLayout, WorkbenchTabs } from '@/components/WorkbenchLayout';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { SlabParams, SlabSupportType, ComponentType } from '@/lib/types';
import { SLAB_PRESETS } from '@/lib/rebar';
import { calcSlab } from '@/lib/calc';
import { validateSlabRebar, validateDimension } from '@/lib/validate';
import { SlabCrossSection } from '@/components/CrossSection';
import { SlabExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ConcreteCalc } from '@/components/ConcreteCalc';
import { calcSlabConcrete } from '@/lib/calc-concrete';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES } from '@/lib/anchor';
import type { ConcreteGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { buildSlabContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';

const DATA_TABS = [
  { key: 'section', label: '截面图' },
  { key: 'weight', label: '用量估算' },
  { key: 'concrete', label: '混凝土量' },
  { key: 'formwork', label: '模板量' },
  { key: 'compliance', label: '构造检查' },
] as const;

const SlabViewer = dynamic(() => import('@/components/SlabViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '薄板 120mm', dot: 'bg-blue-400' },
  { key: 'standard', label: '标准板 150mm', dot: 'bg-green-400' },
  { key: 'thick', label: '厚板 200mm', dot: 'bg-purple-400' },
] as const;

const DEFAULT = { ...SLAB_PRESETS.standard };

export function SlabPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [params, setParams] = useState<SlabParams>(() => {
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<SlabParams>>(p ?? undefined);
    if (shared && shared.thickness) {
      return { ...DEFAULT, ...shared };
    }
    return DEFAULT;
  });
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const aiMessage = searchParams.get('ai') || undefined;
  const [showAI, setShowAI] = useState(!!aiMessage);

  const update = (patch: Partial<SlabParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcSlab(params), [params]);
  const concreteResult = useMemo(() => calcSlabConcrete(params), [params]);
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
    <WorkbenchLayout
      title="板配筋工作台"
      summary={<>{params.id}<span>·</span>{params.spanX} × {params.spanY} mm<span>·</span>板厚 {params.thickness} mm</>}
      actions={<ShareButton params={params} className="rv-button rv-share-button" />}
      inspector={
        <>
          <div className="rv-inspector-tools"><span>快速示例</span><ResetButton onClick={() => setParams(DEFAULT)} /></div>
          <div className="rv-parameter-form">
            <div className="mb-4">

              <div className="flex flex-wrap gap-1.5">
                {presetList.map(({ key, label, dot }) => (
                  <button key={key} onClick={() => setParams({ ...SLAB_PRESETS[key] })}
                    className="rv-preset-button">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Field label="板编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="板厚 (mm)" value={params.thickness} onChange={v => update({ thickness: v })} error={errors.thickness?.message} min={60} max={400} />
              <NumField label="X向板跨 (mm)" value={params.spanX} onChange={v => update({ spanX: v })} min={1000} max={12000} />
              <NumField label="Y向板跨 (mm)" value={params.spanY} onChange={v => update({ spanY: v })} min={1000} max={12000} />
              <SelectField label="支座类型" value={params.supportType} onChange={v => update({ supportType: v as SlabSupportType })}
                options={[{ value: 'simple', label: '简支' }, { value: 'continuous', label: '连续' }, { value: 'cantilever', label: '悬挑' }]} />
              <NumField label="支座梁宽 (mm)" value={params.supportBeamWidth} onChange={v => update({ supportBeamWidth: v })} min={150} max={600} />
            </div>
            <Section title="材料与构造">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={10} max={30} />
            </Section>
            <Section title="底筋" defaultOpen>
              <Field label="X向底筋" value={params.bottomX} onChange={v => update({ bottomX: v })} placeholder="如: C12@150" error={errors.bottomX?.message} />
              <Field label="Y向底筋" value={params.bottomY} onChange={v => update({ bottomY: v })} placeholder="如: C10@200" error={errors.bottomY?.message} />
            </Section>
            <Section title="面筋">
              <p className="text-[11px] text-muted -mt-1">留空表示无面筋</p>
              <Field label="X向面筋" value={params.topX} onChange={v => update({ topX: v })} placeholder="如: C10@200" error={errors.topX?.message} />
              <Field label="Y向面筋" value={params.topY} onChange={v => update({ topY: v })} placeholder="如: C10@200" error={errors.topY?.message} />
            </Section>
            <Section title="支座负筋 (22G101)">
              <p className="text-[11px] text-muted -mt-1">连续板支座处，伸入跨中 ln/4</p>
              <Field label="X向支座负筋" value={params.supportNegX ?? ''} onChange={v => update({ supportNegX: v || undefined })} placeholder="如: C12@150" />
              <Field label="Y向支座负筋" value={params.supportNegY ?? ''} onChange={v => update({ supportNegY: v || undefined })} placeholder="如: C10@200" />
            </Section>
            <Section title="分布筋">
              <Field label="分布筋" value={params.distribution} onChange={v => update({ distribution: v })} placeholder="如: A6@250" error={errors.distribution?.message} />
            </Section></div><Section title="图例说明"><Legend items={[
              { color: '#C0392B', label: 'X向底筋' },
              { color: '#E67E22', label: 'Y向底筋' },
              { color: '#8E44AD', label: 'X向面筋' },
              { color: '#7D3C98', label: 'Y向面筋' },
              { color: '#BDC3C7', label: '混凝土板（半透明）', opacity: 0.6 },
            ]} /></Section>
        </>}
      viewer={<SlabViewer params={params} />}
      analysisTabs={<WorkbenchTabs tabs={DATA_TABS} active={dataTab} onChange={setDataTab} />}
      analysis={<>{dataTab === 'section' && (
        <>

          <div className="flex justify-center">
            <SlabCrossSection params={params} />
          </div>
        </>
      )}
        {dataTab === 'weight' && <WeightCalc result={calcResult} />}
        {dataTab === 'compliance' && <CompliancePanel results={checkCompliance('slab', params)} />}
        {dataTab === 'concrete' && <ConcreteCalc result={concreteResult} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="slab" params={params} /></div></>}
      assistant={showAI ? <AISidebar
        componentType="slab"
        currentParams={params}
        onApplyParams={(p) => update(p as Partial<SlabParams>)}
        context={aiContext}
        notationSlot={<SlabExplain params={params} />}
        initialMessage={aiMessage}
        onSwitchTab={(tab) => setDataTab(tab as typeof dataTab)}
        onNavigateComponent={(type: ComponentType, message?: string) => {
          const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
          router.push(`/${type}${encoded}`);
        }}
        onApplyPreset={(preset) => {
          if (preset in SLAB_PRESETS) setParams({ ...SLAB_PRESETS[preset as keyof typeof SLAB_PRESETS] });
        }}
        onGetCurrentState={() => aiContext}
        onResetParams={() => setParams({ ...SLAB_PRESETS.standard })}
      /> : undefined}
      onAssistantToggle={() => setShowAI(value => !value)}
    />
  );
}
