'use client';

import { CompliancePanel } from '@/components/CompliancePanel';
import { checkCompliance } from '@/lib/compliance';

import { FormworkCalc } from '@/components/FormworkCalc';

import { WorkbenchLayout, WorkbenchTabs } from '@/components/WorkbenchLayout';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ShearWallParams, ComponentType } from '@/lib/types';
import { SHEAR_WALL_PRESETS } from '@/lib/rebar';
import { calcShearWall } from '@/lib/calc';
import { validateDimension } from '@/lib/validate';
import { ShearWallCrossSection } from '@/components/CrossSection';
import { ShearWallExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ConcreteCalc } from '@/components/ConcreteCalc';
import { calcShearWallConcrete } from '@/lib/calc-concrete';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import type { ConcreteGrade, SeismicGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { buildShearWallContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';

const DATA_TABS = [
  { key: 'section', label: '截面图' },
  { key: 'guide', label: '识图说明' },
  { key: 'weight', label: '用量估算' },
  { key: 'concrete', label: '混凝土量' },
  { key: 'formwork', label: '模板量' },
  { key: 'compliance', label: '构造检查' },
] as const;

const ShearWallViewer = dynamic(() => import('@/components/ShearWallViewer'), {
  ssr: false,
  loading: () => <ViewerSkeleton />,
});

const presetList = [
  { key: 'simple', label: '简单墙', dot: 'bg-blue-400' },
  { key: 'standard', label: '标准墙', dot: 'bg-green-400' },
] as const;

const DEFAULT = { ...SHEAR_WALL_PRESETS.standard };

export function ShearWallPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [params, setParams] = useState<ShearWallParams>(() => {
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<ShearWallParams>>(p ?? undefined);
    if (shared && shared.bw && shared.lw) {
      return { ...DEFAULT, ...shared };
    }
    return DEFAULT;
  });
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const [showCut, setShowCut] = useState(false);
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const aiMessage = searchParams.get('ai') || undefined;
  const [showAI, setShowAI] = useState(!!aiMessage);

  const update = (patch: Partial<ShearWallParams>) => setParams(p => ({ ...p, ...patch }));
  const calcResult = useMemo(() => calcShearWall(params), [params]);
  const concreteResult = useMemo(() => calcShearWallConcrete(params), [params]);
  const aiContext = useMemo(() => buildShearWallContext(params), [params]);

  const errors = useMemo(() => ({
    bw: validateDimension(params.bw, 'bw', 150, 500),
    lw: validateDimension(params.lw, 'lw', 500, 8000),
    hw: validateDimension(params.hw, 'hw', 1000, 10000),
  }), [params]);

  return (
    <WorkbenchLayout
      title="墙配筋工作台"
      summary={<>{params.id}<span>·</span>剪力墙</>}
      actions={<ShareButton params={params} className="rv-button rv-share-button" />}
      inspector={
        <>
          <div className="rv-inspector-tools"><span>快速示例</span><ResetButton onClick={() => setParams(DEFAULT)} /></div>
          <div className="rv-parameter-form">
            <div className="mb-4">

              <div className="flex flex-wrap gap-1.5">
                {presetList.map(({ key, label, dot }) => (
                  <button key={key} onClick={() => setParams({ ...SHEAR_WALL_PRESETS[key] })}
                    className="rv-preset-button">
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Field label="墙编号" value={params.id} onChange={v => update({ id: v })} />
              <NumField label="墙厚 bw (mm)" value={params.bw} onChange={v => update({ bw: v })} error={errors.bw?.message} min={150} max={500} />
              <NumField label="墙长 lw (mm)" value={params.lw} onChange={v => update({ lw: v })} error={errors.lw?.message} min={500} max={8000} />
              <NumField label="墙净高 hw (mm)" value={params.hw} onChange={v => update({ hw: v })} error={errors.hw?.message} min={1000} max={10000} />
            </div>
            <Section title="分布筋" defaultOpen>
              <Field label="竖向分布筋" value={params.vertBar} onChange={v => update({ vertBar: v })} placeholder="如: C10@200" />
              <Field label="水平分布筋" value={params.horizBar} onChange={v => update({ horizBar: v })} placeholder="如: C10@200" />
            </Section>
            <Section title="约束边缘构件">
              <SelectField
                label="边缘构件类型"
                value={params.boundaryType || 'ybz'}
                onChange={v => update({ boundaryType: v as ShearWallParams['boundaryType'] })}
                options={[
                  { value: 'ybz', label: '约束边缘构件 YBZ' },
                  { value: 'gbz', label: '构造边缘构件 GBZ' },
                  { value: 'fbz', label: '扶壁柱 FBZ' },
                  { value: 'az', label: '非边缘暗柱 AZ' },
                ]}
              />
              <SelectField
                label="边缘构件外形"
                value={params.boundaryForm || 'concealed'}
                onChange={v => update({ boundaryForm: v as ShearWallParams['boundaryForm'] })}
                options={[
                  { value: 'concealed', label: '暗柱' },
                  { value: 'endColumn', label: '端柱' },
                  { value: 'wingWall', label: '翼墙' },
                  { value: 'cornerWall', label: '转角墙' },
                ]}
              />
              <NumField label="边缘构件长度 (mm)" value={params.boundaryLength || Math.max(params.bw, 400)} onChange={v => update({ boundaryLength: v })} min={300} max={1500} />
              {((params.boundaryType === 'fbz' || params.boundaryType === 'az') || (params.boundaryForm && params.boundaryForm !== 'concealed')) && (
                <NumField label="边缘构件凸出深度 (mm)" value={params.boundaryProjection || 150} onChange={v => update({ boundaryProjection: v })} min={0} max={600} />
              )}
              <Field label="纵筋" value={params.boundaryMain} onChange={v => update({ boundaryMain: v })} placeholder="如: 8C16" />
              <Field label="箍筋" value={params.boundaryStirrup} onChange={v => update({ boundaryStirrup: v })} placeholder="如: A8@100" />
            </Section>
            <Section title="拉结筋与洞口">
              <Field label="拉结筋" value={params.tieBar || ''} onChange={v => update({ tieBar: v || undefined })} placeholder="如: A8@600" />
              <SelectField
                label="是否设置洞口"
                value={params.hasOpening ? 'yes' : 'no'}
                onChange={v => update({ hasOpening: v === 'yes' })}
                options={[
                  { value: 'no', label: '否' },
                  { value: 'yes', label: '是' },
                ]}
              />
              {params.hasOpening && (
                <>
                  <NumField label="洞口宽度 (mm)" value={params.openingWidth || 1200} onChange={v => update({ openingWidth: v })} min={300} max={4000} />
                  <NumField label="洞口高度 (mm)" value={params.openingHeight || 1500} onChange={v => update({ openingHeight: v })} min={300} max={3000} />
                  <NumField label="洞底距墙底 (mm)" value={params.openingBottom || 900} onChange={v => update({ openingBottom: v })} min={0} max={params.hw} />
                  <NumField label="洞口中心偏移 X (mm)" value={params.openingOffsetX || 0} onChange={v => update({ openingOffsetX: v })} min={-Math.floor(params.lw / 3)} max={Math.floor(params.lw / 3)} />
                  <Field label="洞口侧边补强" value={params.openingVertBar || ''} onChange={v => update({ openingVertBar: v || undefined })} placeholder="如: C14@150" />
                  <Field label="洞口上下补强" value={params.openingHorizBar || ''} onChange={v => update({ openingHorizBar: v || undefined })} placeholder="如: C14@150" />
                </>
              )}
            </Section>
            <Section title="材料与构造">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as SeismicGrade })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
            </Section></div><Section title="图例说明"><Legend items={[
              { color: '#C0392B', label: '竖向分布筋' },
              { color: '#2980B9', label: '水平分布筋' },
              { color: '#8E44AD', label: '边缘构件纵筋' },
              { color: '#27AE60', label: '边缘构件箍筋' },
              { color: '#16A085', label: '拉结筋' },
              { color: '#EC4899', label: '洞口补强筋' },
              { color: '#BDC3C7', label: '混凝土墙体（半透明）', opacity: 0.6 },
            ]} /></Section>
        </>}
      viewer={<ShearWallViewer params={params} cutPosition={cutPosition} showCut={showCut}
        onCutPositionChange={setCutPosition} onShowCutChange={setShowCut} />}
      analysisTabs={<WorkbenchTabs tabs={DATA_TABS} active={dataTab} onChange={setDataTab} />}
      analysis={<>{dataTab === 'section' && (
        <>

          <div className="flex justify-center">
            <ShearWallCrossSection params={params} cutPosition={showCut ? cutPosition : undefined} />
          </div>
        </>
      )}
        {dataTab === 'guide' && <ShearWallExplain params={params} />}
        {dataTab === 'weight' && <WeightCalc result={calcResult} />}
        {dataTab === 'compliance' && <CompliancePanel results={checkCompliance('shearwall', params)} />}
        {dataTab === 'concrete' && <ConcreteCalc result={concreteResult} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="shearwall" params={params} /></div></>}
      assistant={showAI ? <AISidebar
        componentType="shearwall"
        currentParams={params}
        onApplyParams={(p) => update(p as Partial<ShearWallParams>)}
        context={aiContext}
        notationSlot={<ShearWallExplain params={params} />}
        initialMessage={aiMessage}
        onSwitchTab={(tab) => setDataTab(tab as typeof dataTab)}
        onNavigateComponent={(type: ComponentType, message?: string) => {
          const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
          router.push(`/${type}${encoded}`);
        }}
        onApplyPreset={(preset) => {
          if (preset in SHEAR_WALL_PRESETS) setParams({ ...SHEAR_WALL_PRESETS[preset as keyof typeof SHEAR_WALL_PRESETS] });
        }}
        onGetCurrentState={() => aiContext}
        onResetParams={() => setParams({ ...SHEAR_WALL_PRESETS.standard })}
      /> : undefined}
      onAssistantToggle={() => setShowAI(value => !value)}
    />
  );
}
