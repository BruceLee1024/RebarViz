'use client';

import { CompliancePanel } from '@/components/CompliancePanel';
import { checkCompliance } from '@/lib/compliance';

import { FormworkCalc } from '@/components/FormworkCalc';

import { WorkbenchLayout, WorkbenchTabs } from '@/components/WorkbenchLayout';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ColumnParams, ComponentType, RebarMeshInfo } from '@/lib/types';
import { COLUMN_PRESETS, parseRebar, parseStirrup, inferStirrupType, STIRRUP_TYPES } from '@/lib/rebar';
import { calcColumn, calcColumnBarShapes, type BarShape } from '@/lib/calc';
import { validateRebar, validateStirrup, validateDimension } from '@/lib/validate';
import { ColumnCrossSection } from '@/components/CrossSection';
import { ColumnExplain } from '@/components/NotationExplain';
import { WeightCalc } from '@/components/WeightCalc';
import { ConcreteCalc } from '@/components/ConcreteCalc';
import { BarBendingSchedule } from '@/components/BarBendingSchedule';
import { calcColumnConcrete } from '@/lib/calc-concrete';
import { ShareButton } from '@/components/ShareButton';
import { Field, NumField, Legend, ResetButton, SelectField, Section } from '@/components/FormControls';
import { ViewerSkeleton } from '@/components/ViewerSkeleton';
import { CONCRETE_GRADES, SEISMIC_GRADES } from '@/lib/anchor';
import type { ConcreteGrade, SeismicGrade } from '@/lib/anchor';
import { LazyAISidebar as AISidebar } from '@/components/LazyAISidebar';
import { buildColumnContext } from '@/lib/ai-context';
import { decodeSharedParam } from '@/lib/share-params';

const DATA_TABS = [
  { key: 'section', label: '截面图' },
  { key: 'guide', label: '识图说明' },
  { key: 'weight', label: '用量估算' },
  { key: 'concrete', label: '混凝土量' },
  { key: 'formwork', label: '模板量' },
  { key: 'compliance', label: '构造检查' },
  { key: 'bbs', label: '弯折详图' },
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [params, setParams] = useState<ColumnParams>(() => {
    const p = searchParams.get('p');
    const shared = decodeSharedParam<Partial<ColumnParams>>(p ?? undefined);
    if (shared && shared.b && shared.h) {
      return { ...DEFAULT, ...shared };
    }
    return DEFAULT;
  });
  const [cutPosition, setCutPosition] = useState<number | null>(null);
  const [showCut, setShowCut] = useState(false);
  const [dataTab, setDataTab] = useState<typeof DATA_TABS[number]['key']>('section');
  const [selectedRebarInfo, setSelectedRebarInfo] = useState<RebarMeshInfo | null>(null);
  const aiMessage = searchParams.get('ai') || undefined;
  const [showAI, setShowAI] = useState(!!aiMessage);

  const update = (patch: Partial<ColumnParams>) => setParams(p => ({ ...p, ...patch }));

  const effectiveParams = useMemo(() => {
    if (!params.cornerMain) return params;
    const corner = parseRebar(params.cornerMain);
    if (!corner.count) return params;
    const bMid = params.bMiddleMain ? parseRebar(params.bMiddleMain) : null;
    const hMid = params.hMiddleMain ? parseRebar(params.hMiddleMain) : null;
    const total = corner.count + (bMid ? bMid.count * 2 : 0) + (hMid ? hMid.count * 2 : 0);
    const maxDia = Math.max(corner.diameter, bMid?.diameter ?? 0, hMid?.diameter ?? 0);
    const grade = corner.grade;
    const synced = `${total}${grade}${maxDia}`;
    return synced === params.main ? params : { ...params, main: synced };
  }, [params]);

  const calcResult = useMemo(() => calcColumn(effectiveParams), [effectiveParams]);
  const barShapes = useMemo(() => calcColumnBarShapes(effectiveParams), [effectiveParams]);
  const concreteResult = useMemo(() => calcColumnConcrete(effectiveParams), [effectiveParams]);
  const aiContext = useMemo(() => buildColumnContext(effectiveParams), [effectiveParams]);

  const errors = useMemo(() => ({
    b: validateDimension(effectiveParams.b, 'b', 200, 1200),
    h: validateDimension(effectiveParams.h, 'h', 200, 1200),
    main: validateRebar(effectiveParams.main, 'main'),
    cornerMain: params.cornerMain ? validateRebar(params.cornerMain, 'cornerMain') : null,
    bMiddleMain: params.bMiddleMain ? validateRebar(params.bMiddleMain, 'bMiddleMain') : null,
    hMiddleMain: params.hMiddleMain ? validateRebar(params.hMiddleMain, 'hMiddleMain') : null,
    stirrup: validateStirrup(params.stirrup, 'stirrup'),
  }), [effectiveParams, params.cornerMain, params.bMiddleMain, params.hMiddleMain, params.stirrup]);

  return (
    <WorkbenchLayout
      title="柱配筋工作台"
      summary={<>{params.id}<span>·</span>{params.b} × {params.h} mm<span>·</span>净高 {params.height} mm</>}
      actions={<ShareButton params={effectiveParams} className="rv-button rv-share-button" />}
      inspector={
        <>
          <div className="rv-inspector-tools"><span>快速示例</span><ResetButton onClick={() => setParams(DEFAULT)} /></div>
          <div className="rv-parameter-form">
            <div className="mb-4">

              <div className="flex flex-wrap gap-1.5">
                {presetList.map(({ key, label, dot }) => (
                  <button key={key} onClick={() => setParams({ ...COLUMN_PRESETS[key] })}
                    className="rv-preset-button">
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
              <Field label="全部纵筋" value={effectiveParams.main} onChange={v => update({ main: v })} placeholder="如: 12C25" error={errors.main?.message} />

              <div className="pt-1 border-t border-gray-100">
                <p className="text-[11px] text-muted mb-1.5">22G101-1 分项标注（可选）</p>
                <div className="space-y-2">
                  <Field label="角筋" value={params.cornerMain ?? ''} onChange={v => update({ cornerMain: v })} placeholder="如: 4C25" error={errors.cornerMain?.message} />
                  <Field label="b边中部筋" value={params.bMiddleMain ?? ''} onChange={v => update({ bMiddleMain: v })} placeholder="如: 2C22（每侧根数）" error={errors.bMiddleMain?.message} />
                  <Field label="h边中部筋" value={params.hMiddleMain ?? ''} onChange={v => update({ hMiddleMain: v })} placeholder="如: 2C22（每侧根数）" error={errors.hMiddleMain?.message} />
                </div>
              </div>

              <Field label="箍筋" value={params.stirrup} onChange={v => update({ stirrup: v })} placeholder="如: A10@100/200(4)" error={errors.stirrup?.message} />
              <SelectField
                label="箍筋组合"
                value={inferStirrupType(parseStirrup(params.stirrup).legs)}
                onChange={v => {
                  const current = parseStirrup(params.stirrup);
                  update({ stirrupType: v, stirrup: `${current.grade}${current.diameter}@${current.spacingDense}/${current.spacingNormal}(${STIRRUP_TYPES[v].legs})` });
                }}
                options={Object.values(STIRRUP_TYPES).map(t => ({
                  value: t.code,
                  label: `${t.legs}肢 · ${t.name}`
                }))}
              />
            </div>
            <Section title="材料与构造">
              <SelectField label="混凝土等级" value={params.concreteGrade} onChange={v => update({ concreteGrade: v as ConcreteGrade })}
                options={CONCRETE_GRADES.map(g => ({ value: g, label: g }))} />
              <SelectField label="抗震等级" value={params.seismicGrade} onChange={v => update({ seismicGrade: v as SeismicGrade })}
                options={SEISMIC_GRADES.map(g => ({ value: g, label: g }))} />
              <NumField label="保护层 (mm)" value={params.cover} onChange={v => update({ cover: v })} min={15} max={50} />
              <NumField label="柱净高 (mm)" value={params.height} onChange={v => update({ height: v })} min={1000} max={10000} />
              <SelectField
                label="柱顶节点类型"
                value={params.topNodeType || 'middle'}
                onChange={v => update({ topNodeType: v as ColumnParams['topNodeType'] })}
                options={[
                  { value: 'middle', label: '中柱节点' },
                  { value: 'edge', label: '边柱节点' },
                  { value: 'corner', label: '角柱节点' },
                ]}
              />
              <NumField label="柱顶梁宽 (mm)" value={params.roofBeamB || 300} onChange={v => update({ roofBeamB: v })} min={200} max={1000} />
              <NumField label="柱顶梁高 (mm)" value={params.roofBeamH || 600} onChange={v => update({ roofBeamH: v })} min={300} max={1200} />
              <SelectField
                label="是否有屋面板"
                value={params.hasRoofSlab ? 'yes' : 'no'}
                onChange={v => update({ hasRoofSlab: v === 'yes' })}
                options={[
                  { value: 'yes', label: '是' },
                  { value: 'no', label: '否' },
                ]}
              />
              {params.hasRoofSlab && (
                <NumField label="屋面板厚 (mm)" value={params.roofSlabThickness || 120} onChange={v => update({ roofSlabThickness: v })} min={80} max={300} />
              )}
              <SelectField
                label="柱根支承"
                value={params.baseSupportType || 'foundation'}
                onChange={v => update({ baseSupportType: v as ColumnParams['baseSupportType'] })}
                options={[
                  { value: 'foundation', label: '基础顶面起柱' },
                  { value: 'wall', label: '剪力墙上起柱' },
                  { value: 'beam', label: '梁上起柱' },
                ]}
              />
              {(params.baseSupportType === 'wall' || params.baseSupportType === 'beam') && (
                <>
                  <NumField label="支承宽度 (mm)" value={params.baseSupportWidth || params.b} onChange={v => update({ baseSupportWidth: v })} min={150} max={1200} />
                  <NumField label="支承高度 (mm)" value={params.baseSupportHeight || 800} onChange={v => update({ baseSupportHeight: v })} min={200} max={2000} />
                </>
              )}
              <SelectField
                label="是否变截面"
                value={params.hasVariableSection ? 'yes' : 'no'}
                onChange={v => update({ hasVariableSection: v === 'yes' })}
                options={[
                  { value: 'no', label: '否' },
                  { value: 'yes', label: '是' },
                ]}
              />
              {params.hasVariableSection && (
                <>
                  <NumField label="上段宽 b1 (mm)" value={params.upperB || Math.max(params.b - 50, 200)} onChange={v => update({ upperB: v })} min={150} max={params.b} />
                  <NumField label="上段高 h1 (mm)" value={params.upperH || Math.max(params.h - 50, 200)} onChange={v => update({ upperH: v })} min={150} max={params.h} />
                  <NumField label="变截面起始高度 (mm)" value={params.variableStart || Math.round(params.height * 0.7)} onChange={v => update({ variableStart: v })} min={200} max={params.height - 200} />
                </>
              )}
            </Section></div><Section title="图例说明"><Legend items={[
              { color: '#C0392B', label: '角筋' },
              { color: '#E67E22', label: 'b边中部筋' },
              { color: '#8E44AD', label: 'h边中部筋' },
              { color: '#27AE60', label: '箍筋' },
              { color: '#BDC3C7', label: '混凝土截面（半透明）', opacity: 0.6 },
            ]} /></Section>
        </>}
      viewer={<ColumnViewer params={effectiveParams} cutPosition={cutPosition} showCut={showCut}
        onCutPositionChange={setCutPosition} onShowCutChange={setShowCut}
        selectedInfo={selectedRebarInfo}
        onSelectedInfoChange={setSelectedRebarInfo} />}
      analysisTabs={<WorkbenchTabs tabs={DATA_TABS} active={dataTab} onChange={setDataTab} />}
      analysis={<>{dataTab === 'section' && (
        <>

          <div className="flex justify-center">
            <ColumnCrossSection params={effectiveParams} cutPosition={showCut ? cutPosition : undefined} />
          </div>
        </>
      )}
        {dataTab === 'guide' && <ColumnExplain params={effectiveParams} />}
        {dataTab === 'weight' && <WeightCalc result={calcResult} />}
        {dataTab === 'compliance' && <CompliancePanel results={checkCompliance('column', effectiveParams)} />}
        {dataTab === 'concrete' && <ConcreteCalc result={concreteResult} />}
        <div hidden={dataTab !== 'formwork'}><FormworkCalc componentType="column" params={effectiveParams} /></div>
        {dataTab === 'bbs' && (
          <BarBendingSchedule
            shapes={barShapes}
            title="柱钢筋弯折详图 (BBS)"
            selectedSetId={selectedRebarInfo?.setId}
            onSelectShape={(shape: BarShape) => {
              if (!shape.setId) return;
              const type = shape.setId === 'column.stirrup'
                ? 'stirrup'
                : shape.setId.replace('column.', '') as RebarMeshInfo['type'];
              setSelectedRebarInfo({
                type,
                label: shape.name,
                detail: `${shape.spec} · BBS下料长度 ${Math.round(shape.totalLen)}mm`,
                setId: shape.setId,
                groupLabel: shape.name,
                groupCount: shape.count > 0 ? shape.count : undefined,
                relatedSetIds: shape.relatedSetIds,
              });
            }}
          />
        )}</>}
      assistant={showAI ? <AISidebar
        componentType="column"
        currentParams={effectiveParams}
        onApplyParams={(p) => update(p as Partial<ColumnParams>)}
        context={aiContext}
        notationSlot={<ColumnExplain params={effectiveParams} />}
        initialMessage={aiMessage}
        onSwitchTab={(tab) => setDataTab(tab as typeof dataTab)}
        onNavigateComponent={(type: ComponentType, message?: string) => {
          const encoded = message ? `?ai=${encodeURIComponent(message)}` : '';
          router.push(`/${type}${encoded}`);
        }}
        onApplyPreset={(preset) => {
          if (preset in COLUMN_PRESETS) setParams({ ...COLUMN_PRESETS[preset as keyof typeof COLUMN_PRESETS] });
        }}
        onGetCurrentState={() => aiContext}
        onResetParams={() => setParams({ ...COLUMN_PRESETS.standard })}
      /> : undefined}
      onAssistantToggle={() => setShowAI(value => !value)}
    />
  );
}
